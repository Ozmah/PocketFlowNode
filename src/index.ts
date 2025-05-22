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
	llmProvider?: LlmProviderType;
	llmApiKey?: string;
	llmModel?: string;
	llmOptions?: LlmGenerationOptions; 
}

app.post("/generate-tutorial", async (req: Request, res: Response) => {
	const {
		repoUrl,
		projectName,
		githubToken,
		includePatterns,
		excludePatterns,
		maxFileSize,
		language,
		useCache,
		maxAbstractions,
		llmProvider: requestedLlmProvider,
		llmApiKey,
		llmModel,
		llmOptions
	  } = req.body as GenerateTutorialRequestBody;
	console.log(`${LOG_PREFIX} Processing new tutorial request for repo: ${repoUrl}`);

	// --- Input validation ---
	if (!repoUrl || typeof repoUrl !== "string") {
		return res.status(400).send("repoUrl is required and must be a string.");
	}
	try {
		new URL(repoUrl);
	} catch (error) {
		return res.status(400).send("repoUrl must be a valid URL.");
	}
	// ... (keep other validations as they are) ...
	if (
		projectName !== undefined &&
		(typeof projectName !== "string" || projectName.trim() === "")
	) {
		return res.status(400).send("projectName must be a non-empty string if provided.");
	}
	if (
		githubToken !== undefined &&
		(typeof githubToken !== "string" || githubToken.trim() === "")
	) {
		return res.status(400).send("githubToken must be a non-empty string if provided.");
	}
	if (
		includePatterns !== undefined &&
		(!Array.isArray(includePatterns) ||
			!includePatterns.every((p) => typeof p === "string"))
	) {
		return res.status(400).send("includePatterns must be an array of strings if provided.");
	}
	if (
		excludePatterns !== undefined &&
		(!Array.isArray(excludePatterns) ||
			!excludePatterns.every((p) => typeof p === "string"))
	) {
		return res.status(400).send("excludePatterns must be an array of strings if provided.");
	}
	if (
		maxFileSize !== undefined &&
		(typeof maxFileSize !== "number" ||
			maxFileSize <= 0 ||
			!Number.isInteger(maxFileSize))
	) {
		return res.status(400).send("maxFileSize must be a positive integer if provided.");
	}
	if (
		language !== undefined &&
		(typeof language !== "string" || language.trim() === "")
	) {
		return res.status(400).send("language must be a non-empty string if provided.");
	}
	if (useCache !== undefined && typeof useCache !== "boolean") {
		return res.status(400).send("useCache must be a boolean if provided.");
	}
	if (
		maxAbstractions !== undefined &&
		(typeof maxAbstractions !== "number" ||
			maxAbstractions <= 0 ||
			!Number.isInteger(maxAbstractions))
	) {
		return res.status(400).send("maxAbstractions must be a positive integer if provided.");
	}

	// LLM related field validations
	if (requestedLlmProvider !== undefined && !['gemini', 'claude', 'openai'].includes(requestedLlmProvider)) {
		return res.status(400).send("llmProvider must be one of 'gemini', 'claude', or 'openai' if provided.");
	}
	if (llmApiKey !== undefined && (typeof llmApiKey !== "string" || llmApiKey.trim() === "")) {
		return res.status(400).send("llmApiKey must be a non-empty string if provided.");
	}
	if (llmModel !== undefined && (typeof llmModel !== "string" || llmModel.trim() === "")) {
		return res.status(400).send("llmModel must be a non-empty string if provided.");
	}
	if (llmOptions !== undefined && typeof llmOptions !== "object") {
		return res.status(400).send("llmOptions must be an object if provided.");
	}
	// --- End of Input Validation ---

	const sharedData: SharedData = {
		repoUrl: repoUrl,
		projectName: projectName || new URL(repoUrl).pathname.split("/").pop() || "NewProject",
		githubToken: githubToken,
		includePatterns: includePatterns,
		excludePatterns: excludePatterns,
		maxFileSize: maxFileSize !== undefined ? maxFileSize : 1024 * 1024,
		language: language !== undefined ? language : "english",
		useCache: useCache !== undefined ? useCache : true, // This useCache is for the tutorial generation steps
		maxAbstractions: maxAbstractions !== undefined ? maxAbstractions : 15,
		// Note: llmProvider, llmApiKey, llmModel, llmOptions from request body are not directly part of SharedData here.
		// They are used to instantiate the LLM provider instance below.
		// The llmOptions from request might influence individual LLM calls if passed through.
	};

	console.log(`${LOG_PREFIX} Starting tutorial generation for project: ${sharedData.projectName}`);
	
	// Instantiate LLM Provider
	const defaultLlmProvider: LlmProviderType = 'gemini'; // For backward compatibility
	const providerType = requestedLlmProvider || defaultLlmProvider;

	const providerConfig: LlmProviderConfig = {
	  apiKey: llmApiKey, // The factory will use the environment variable if this is undefined
	  modelName: llmModel,
	};

	let llmProviderInstance;
	try {
	  llmProviderInstance = createLlmProvider(providerType, providerConfig);
	  console.log(`${LOG_PREFIX} Using LLM Provider: ${providerType} (Model: ${llmModel || 'default'}) for tutorial generation.`);
	} catch (error: any) {
	  console.error(`${LOG_PREFIX} Failed to instantiate LLM provider ${providerType}:`, error);
	  return res.status(500).json({
		message: `Failed to initialize LLM provider ${providerType}. Check server logs.`,
		error: error.message,
	  });
	}

	// Preparar las opciones LLM para las funciones del core
    const coreLlmGenerationOptions: LlmGenerationOptions = {
      ...(llmOptions || {}), // Opciones directas del request (ej: model, temperature)
      // useCache se obtiene de sharedData, que a su vez lo toma de requestBody.useCache o default true
      // Esto asegura que el useCache global del tutorial se respete si no hay un useCache específico en llmOptions
      useCache: sharedData.useCache,
    };

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
			// useCache ya está incorporado en coreLlmGenerationOptions
			maxAbstractions: sharedData.maxAbstractions,
			llmOptions: coreLlmGenerationOptions, // Pasar las opciones LLM combinadas
		};
		const identifiedAbstractions: Abstraction[] = await identifyAbstractions(
			sharedData.files!, // Asumiendo que files no será undefined aquí debido a chequeos previos
			sharedData.projectName!,
			llmProviderInstance, // Pasar la instancia del proveedor
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
			// useCache ya está incorporado en coreLlmGenerationOptions
			llmOptions: coreLlmGenerationOptions,
		};
		const analysisResult: ProjectAnalysis = await analyzeRelationships(
			sharedData.abstractions,
			sharedData.files,
			sharedData.projectName!,
			llmProviderInstance, // Pasar la instancia del proveedor
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
			// useCache ya está incorporado en coreLlmGenerationOptions
			llmOptions: coreLlmGenerationOptions,
		};
		sharedData.chapterOrder = await orderChapters(
			sharedData.abstractions,
			analysisResult, // analysisResult ya está disponible desde el paso anterior
			sharedData.projectName!,
			llmProviderInstance, // Pasar la instancia del proveedor
			orderOptions
		);
		console.log(`${LOG_PREFIX} Chapter order determined: ${sharedData.chapterOrder?.join(", ")}`);

		// 5. Write Chapters
		console.log(`${LOG_PREFIX} Step 5: Writing chapters for ${sharedData.projectName}`);
		const writeOptions: WriteChaptersOptions = {
			language: sharedData.language,
			// useCache ya está incorporado en coreLlmGenerationOptions
			llmOptions: coreLlmGenerationOptions,
		};
		const chaptersOutput: ChapterOutput[] = await writeChapters(
			sharedData.chapterOrder,
			sharedData.abstractions,
			sharedData.files,
			sharedData.projectName!,
			llmProviderInstance, // Pasar la instancia del proveedor
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
		console.error(`${LOG_PREFIX} Error during tutorial generation process for repo: ${repoUrl}`, error);
		res.status(500).json({
			message: "An internal server error occurred during tutorial generation.",
			// error: error.message, // Avoid sending detailed error messages to client in production
			// stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
		});
	}
});

app.post("/llm/generate", async (req: Request, res: Response) => {
  const {
	provider: requestedLlmProvider, // Renaming to avoid conflict if we use 'provider' later
	prompt,
	apiKey: llmApiKey, // Standardizing variable names for keys/models/options
	model: llmModel,
	options: llmOptions
  } = req.body as LlmGenerateRequestBody;
  const LOG_LLM_PREFIX = "[LLM Service]";

  // --- Input validation ---
  if (!requestedLlmProvider || typeof requestedLlmProvider !== "string") {
    return res.status(400).send("provider is required and must be a string (e.g., 'gemini', 'claude', 'openai').");
  }
  if (!prompt || typeof prompt !== "string") {
    return res.status(400).send("prompt is required and must be a string.");
  }
  if (llmApiKey !== undefined && typeof llmApiKey !== "string") {
    return res.status(400).send("apiKey must be a string if provided.");
  }
  if (llmModel !== undefined && typeof llmModel !== "string") {
    return res.status(400).send("model must be a string if provided.");
  }
  // Basic validation for options if provided
  if (llmOptions !== undefined && typeof llmOptions !== 'object') {
    return res.status(400).send("options must be an object if provided.");
  }

  console.log(`${LOG_LLM_PREFIX} Received request for provider: ${requestedLlmProvider}, model: ${llmModel || 'default'}`);

  try {
    // Prepare provider configuration
    const providerConfig: LlmProviderConfig = {
      apiKey: llmApiKey, // Pass it to the factory; factory will check env if this is undefined
      modelName: llmModel, // Pass model to factory for default, can be overridden in generateContent options
    };

    const llmProvider = createLlmProvider(requestedLlmProvider, providerConfig);

    // Prepare generation options
    // Note: The endpoint logic for /llm/generate already correctly prioritizes requestBody.model over options.model
    const generationOptions: LlmGenerationOptions = {
      ...llmOptions, // User-provided options (temperature, maxTokens etc.)
      model: llmModel || llmOptions?.model, // Explicit model in request body takes precedence
    };
    
    // Remove model from options if it's undefined to avoid sending `model: undefined` to providers
    if (generationOptions.model === undefined) {
        delete generationOptions.model;
    }

    console.log(`${LOG_LLM_PREFIX} Generating content using ${requestedLlmProvider}...`);
    const result = await llmProvider.generateContent(prompt, generationOptions);
    
    console.log(`${LOG_LLM_PREFIX} Successfully generated content from ${requestedLlmProvider}.`);
    res.status(200).json({ response: result });

  } catch (error: any) {
    console.error(`${LOG_LLM_PREFIX} Error during LLM generation for provider ${requestedLlmProvider}:`, error);
    res.status(500).json({
      message: `An error occurred with the ${requestedLlmProvider} LLM provider.`,
      error: error.message || "Unknown error",
      // stack: process.env.NODE_ENV === 'development' ? error.stack : undefined, // Optional: for debugging
    });
  }
});

app.listen(port, () => {
	console.log(`Server is listening on port ${port}`);
});

export default app;
