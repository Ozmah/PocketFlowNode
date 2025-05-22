import "dotenv/config";
import express, { Request, Response } from "express";
import { LlmProviderType, LlmGenerationOptions, LlmProviderConfig } from './llm/types';
import { createLlmProvider } from './llm/factory';

const app = express();
const port = process.env.PORT || 3000;

import JSZip from "jszip";
import { SharedData, TutorialFile, Abstraction, ProjectAnalysis, ChapterOutput } from "./types";

import { crawlGitHubFiles, CrawlGitHubFilesOptions } from "./utils/crawl_github_files";
import { identifyAbstractions, IdentifyAbstractionsOptions } from "./core/identify-abstractions";
import { analyzeRelationships, AnalyzeRelationshipsOptions } from "./core/analyze-relationships";
import { orderChapters, OrderChaptersOptions } from "./core/order-chapters";
import { writeChapters, WriteChaptersOptions } from "./core/write-chapters";
import { combineTutorial, CombineTutorialOptions } from "./core/combine-tutorial";

const LOG_PREFIX = "[TutorialGenerator]";

// Environment Variable Check at Startup

if (!process.env.GEMINI_API_KEY) {
	console.error(`${LOG_PREFIX} CRITICAL: GEMINI_API_KEY environment variable is not set. Application cannot start.`);
	process.exit(1);
}

app.use(express.json());

// Interface for the /llm/generate endpoint request body
interface LlmGenerateRequestBody {
  provider: LlmProviderType;
  prompt: string;
  apiKey?: string; // Optional: API key can be passed in request
  model?: string; // Optional: Model name
  options?: LlmGenerationOptions; // Optional: Other generation options
}

app.get("/ping", (req: Request, res: Response) => {
	res.send("pong");
});

interface GenerateTutorialRequestBody {
	repoUrl: string;
	projectName?: string;
	githubToken?: string;
	includePatterns?: string[];
	excludePatterns?: string[];
	maxFileSize?: number;
	language?: string;
	useCache?: boolean;
	maxAbstractions?: number;
}

app.post("/generate-tutorial", async (req: Request, res: Response) => {
	const requestBody = req.body as GenerateTutorialRequestBody;
	console.log(`${LOG_PREFIX} Processing new tutorial request for repo: ${requestBody.repoUrl}`);

	// --- Input validation ---
	if (!requestBody.repoUrl || typeof requestBody.repoUrl !== "string") {
		return res.status(400).send("repoUrl is required and must be a string.");
	}
	try {
		new URL(requestBody.repoUrl);
	} catch (error) {
		return res.status(400).send("repoUrl must be a valid URL.");
	}
	// ... (keep other validations as they are) ...
	if (
		requestBody.projectName !== undefined &&
		(typeof requestBody.projectName !== "string" || requestBody.projectName.trim() === "")
	) {
		return res.status(400).send("projectName must be a non-empty string if provided.");
	}
	if (
		requestBody.githubToken !== undefined &&
		(typeof requestBody.githubToken !== "string" || requestBody.githubToken.trim() === "")
	) {
		return res.status(400).send("githubToken must be a non-empty string if provided.");
	}
	if (
		requestBody.includePatterns !== undefined &&
		(!Array.isArray(requestBody.includePatterns) ||
			!requestBody.includePatterns.every((p) => typeof p === "string"))
	) {
		return res.status(400).send("includePatterns must be an array of strings if provided.");
	}
	if (
		requestBody.excludePatterns !== undefined &&
		(!Array.isArray(requestBody.excludePatterns) ||
			!requestBody.excludePatterns.every((p) => typeof p === "string"))
	) {
		return res.status(400).send("excludePatterns must be an array of strings if provided.");
	}
	if (
		requestBody.maxFileSize !== undefined &&
		(typeof requestBody.maxFileSize !== "number" ||
			requestBody.maxFileSize <= 0 ||
			!Number.isInteger(requestBody.maxFileSize))
	) {
		return res.status(400).send("maxFileSize must be a positive integer if provided.");
	}
	if (
		requestBody.language !== undefined &&
		(typeof requestBody.language !== "string" || requestBody.language.trim() === "")
	) {
		return res.status(400).send("language must be a non-empty string if provided.");
	}
	if (requestBody.useCache !== undefined && typeof requestBody.useCache !== "boolean") {
		return res.status(400).send("useCache must be a boolean if provided.");
	}
	if (
		requestBody.maxAbstractions !== undefined &&
		(typeof requestBody.maxAbstractions !== "number" ||
			requestBody.maxAbstractions <= 0 ||
			!Number.isInteger(requestBody.maxAbstractions))
	) {
		return res.status(400).send("maxAbstractions must be a positive integer if provided.");
	}
	// --- End of Input Validation ---

	const sharedData: SharedData = {
		repoUrl: requestBody.repoUrl,
		projectName: requestBody.projectName || new URL(requestBody.repoUrl).pathname.split("/").pop() || "NewProject",
		githubToken: requestBody.githubToken,
		includePatterns: requestBody.includePatterns,
		excludePatterns: requestBody.excludePatterns,
		maxFileSize: requestBody.maxFileSize !== undefined ? requestBody.maxFileSize : 1024 * 1024,
		language: requestBody.language !== undefined ? requestBody.language : "english",
		useCache: requestBody.useCache !== undefined ? requestBody.useCache : true,
		maxAbstractions: requestBody.maxAbstractions !== undefined ? requestBody.maxAbstractions : 15,
	};

	console.log(`${LOG_PREFIX} Starting tutorial generation for project: ${sharedData.projectName}`);

	try {
		// 1. Fetch Repository Files
		console.log(`${LOG_PREFIX} Step 1: Fetching repository files for ${sharedData.repoUrl}`);
		const crawlOptions: CrawlGitHubFilesOptions = {
			token: sharedData.githubToken,
			includePatterns: sharedData.includePatterns,
			excludePatterns: sharedData.excludePatterns,
			maxFileSize: sharedData.maxFileSize,
		};
		const crawlResult = await crawlGitHubFiles(sharedData.repoUrl, crawlOptions);
		sharedData.files = crawlResult.files;
		console.log(
			`${LOG_PREFIX} Fetched ${sharedData.files?.length || 0} files. Skipped ${
				crawlResult.stats.skippedCount
			} files.`
		);
		if (!sharedData.files || sharedData.files.length === 0) {
			console.warn(`${LOG_PREFIX} No files fetched for ${sharedData.repoUrl}.`);
			return res
				.status(400)
				.json({ message: "No files fetched. Check repository URL, patterns, or token permissions." });
		}

		// 2. Identify Abstractions
		console.log(`${LOG_PREFIX} Step 2: Identifying abstractions for ${sharedData.projectName}`);
		const identifyOptions: IdentifyAbstractionsOptions = {
			language: sharedData.language,
			useCache: sharedData.useCache,
			maxAbstractions: sharedData.maxAbstractions,
		};
		const identifiedAbstractions: Abstraction[] = await identifyAbstractions(
			sharedData.files,
			sharedData.projectName!,
			identifyOptions
		);
		sharedData.abstractions = identifiedAbstractions;
		console.log(`${LOG_PREFIX} Identified ${sharedData.abstractions?.length || 0} abstractions.`);
		if (!sharedData.abstractions || sharedData.abstractions.length === 0) {
			console.warn(`${LOG_PREFIX} No abstractions identified for ${sharedData.projectName}.`);
			return res
				.status(500)
				.json({ message: "No abstractions identified. LLM might need more context or files were unsuitable." });
		}

		// 3. Analyze Relationships
		console.log(`${LOG_PREFIX} Step 3: Analyzing relationships for ${sharedData.projectName}`);
		const analyzeOptions: AnalyzeRelationshipsOptions = {
			language: sharedData.language,
			useCache: sharedData.useCache,
		};
		const analysisResult: ProjectAnalysis = await analyzeRelationships(
			sharedData.abstractions,
			sharedData.files,
			sharedData.projectName!,
			analyzeOptions
		);
		sharedData.relationships = analysisResult.relationships;
		console.log(
			`${LOG_PREFIX} Analyzed relationships. Project summary: "${analysisResult.summary.substring(0, 100)}..."`
		);

		// 4. Order Chapters
		console.log(`${LOG_PREFIX} Step 4: Ordering chapters for ${sharedData.projectName}`);
		const orderOptions: OrderChaptersOptions = {
			language: sharedData.language,
			useCache: sharedData.useCache,
		};
		sharedData.chapterOrder = await orderChapters(
			sharedData.abstractions,
			analysisResult,
			sharedData.projectName!,
			orderOptions
		);
		console.log(`${LOG_PREFIX} Chapter order determined: ${sharedData.chapterOrder?.join(", ")}`);

		// 5. Write Chapters
		console.log(`${LOG_PREFIX} Step 5: Writing chapters for ${sharedData.projectName}`);
		const writeOptions: WriteChaptersOptions = {
			language: sharedData.language,
			useCache: sharedData.useCache,
		};
		const chaptersOutput: ChapterOutput[] = await writeChapters(
			sharedData.chapterOrder,
			sharedData.abstractions,
			sharedData.files,
			sharedData.projectName!,
			writeOptions
		);
		sharedData.chapters = chaptersOutput;
		console.log(`${LOG_PREFIX} Wrote ${chaptersOutput.length} chapters.`);

		// 6. Combine Tutorial
		console.log(`${LOG_PREFIX} Step 6: Combining tutorial files for ${sharedData.projectName}`);
		const combineOptions: CombineTutorialOptions = {
			repoUrl: sharedData.repoUrl,
		};
		const tutorialFiles: TutorialFile[] = combineTutorial(
			sharedData.projectName!,
			analysisResult,
			sharedData.abstractions,
			sharedData.chapterOrder,
			chaptersOutput,
			combineOptions
		);
		console.log(`${LOG_PREFIX} Combined into ${tutorialFiles.length} tutorial files.`);

		// 7. Create ZIP Archive
		console.log(`${LOG_PREFIX} Step 7: Creating ZIP archive for ${sharedData.projectName}`);
		const zip = new JSZip();
		tutorialFiles.forEach((file) => {
			zip.file(file.filename, file.content);
		});
		const zipBuffer = await zip.generateAsync({ type: "nodebuffer" });

		// 8. Send ZIP Response
		console.log(`${LOG_PREFIX} Step 8: Sending ZIP response for ${sharedData.projectName}`);
		res.setHeader("Content-Type", "application/zip");
		res.setHeader("Content-Disposition", `attachment; filename="${sharedData.projectName || "tutorial"}.zip"`);
		res.send(zipBuffer);
		console.log(`${LOG_PREFIX} Tutorial generation successful for ${requestBody.repoUrl}. Sending ZIP.`);
	} catch (error: any) {
		console.error(`${LOG_PREFIX} Error during tutorial generation process for repo: ${requestBody.repoUrl}`, error);
		res.status(500).json({
			message: "An internal server error occurred during tutorial generation.",
			// error: error.message, // Avoid sending detailed error messages to client in production
			// stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
		});
	}
});

app.post("/llm/generate", async (req: Request, res: Response) => {
  const requestBody = req.body as LlmGenerateRequestBody;
  const LOG_LLM_PREFIX = "[LLM Service]";

  // --- Input validation ---
  if (!requestBody.provider || typeof requestBody.provider !== "string") {
    return res.status(400).send("provider is required and must be a string (e.g., 'gemini', 'claude', 'openai').");
  }
  if (!requestBody.prompt || typeof requestBody.prompt !== "string") {
    return res.status(400).send("prompt is required and must be a string.");
  }
  if (requestBody.apiKey !== undefined && typeof requestBody.apiKey !== "string") {
    return res.status(400).send("apiKey must be a string if provided.");
  }
  if (requestBody.model !== undefined && typeof requestBody.model !== "string") {
    return res.status(400).send("model must be a string if provided.");
  }
  // Basic validation for options if provided
  if (requestBody.options !== undefined && typeof requestBody.options !== 'object') {
    return res.status(400).send("options must be an object if provided.");
  }

  console.log(`${LOG_LLM_PREFIX} Received request for provider: ${requestBody.provider}, model: ${requestBody.model || 'default'}`);

  try {
    // Prepare provider configuration
    const providerConfig: LlmProviderConfig = {
      apiKey: requestBody.apiKey, // Pass it to the factory; factory will check env if this is undefined
      modelName: requestBody.model, // Pass model to factory for default, can be overridden in generateContent options
    };

    const llmProvider = createLlmProvider(requestBody.provider, providerConfig);

    // Prepare generation options
    const generationOptions: LlmGenerationOptions = {
      ...requestBody.options, // User-provided options (temperature, maxTokens etc.)
      model: requestBody.model || requestBody.options?.model, // Explicit model in request body takes precedence
    };
    
    // Remove model from options if it's undefined to avoid sending `model: undefined` to providers
    if (generationOptions.model === undefined) {
        delete generationOptions.model;
    }

    console.log(`${LOG_LLM_PREFIX} Generating content using ${requestBody.provider}...`);
    const result = await llmProvider.generateContent(requestBody.prompt, generationOptions);
    
    console.log(`${LOG_LLM_PREFIX} Successfully generated content from ${requestBody.provider}.`);
    res.status(200).json({ response: result });

  } catch (error: any) {
    console.error(`${LOG_LLM_PREFIX} Error during LLM generation for provider ${requestBody.provider}:`, error);
    res.status(500).json({
      message: `An error occurred with the ${requestBody.provider} LLM provider.`,
      error: error.message || "Unknown error",
      // stack: process.env.NODE_ENV === 'development' ? error.stack : undefined, // Optional: for debugging
    });
  }
});

app.listen(port, () => {
	console.log(`Server is listening on port ${port}`);
});

export default app;
