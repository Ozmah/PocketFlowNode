import "dotenv/config";
import express, { Request, Response } from "express";
import { GoogleGenAI } from "@google/genai";

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
const configuredProviders: string[] = [];
const missingKeys: string[] = [];

if (process.env.GEMINI_API_KEY) {
	configuredProviders.push("Gemini");
} else {
	missingKeys.push("GEMINI_API_KEY (used by default 'gemini' provider)");
}

if (process.env.OPENAI_API_KEY) {
	configuredProviders.push("OpenAI/ChatGPT");
} else {
	missingKeys.push("OPENAI_API_KEY (used by 'chatgpt' provider)");
}

if (process.env.ANTHROPIC_API_KEY) {
	configuredProviders.push("Anthropic/Claude");
} else {
	missingKeys.push("ANTHROPIC_API_KEY (used by 'claude' provider)");
}

if (configuredProviders.length > 0) {
	console.info(`${LOG_PREFIX} Configured LLM providers based on API keys: ${configuredProviders.join(", ")}.`);
	if (missingKeys.length > 0) {
		console.warn(
			`${LOG_PREFIX} Optional LLM API keys not found: ${missingKeys.join(
				", "
			)}. Calls to these providers will fail.`
		);
	}
} else {
	console.error(
		`${LOG_PREFIX} CRITICAL: No LLM API keys found in environment variables (checked for GEMINI_API_KEY, OPENAI_API_KEY, ANTHROPIC_API_KEY). ` +
			"At least one LLM provider must be configured for the application to run."
	);
	process.exit(1);
}

app.use(express.json());

app.post("/ping", async (req: Request, res: Response) => {
	const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
	const response = await ai.models.generateContentStream({
		model: "gemini-2.0-flash",
		contents: "¿La hoja santa es tóxica?",
	});

	for await (const chunk of response) {
		console.log(chunk.text);
	}

	res.status(200).json({
		message: "Pong",
		// error: error.message, // Avoid sending detailed error messages to client in production
		// stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
	});
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
	/**
	 * @property {string} [llmProvider] - The name of the LLM provider to use (e.g., 'gemini', 'chatgpt', 'claude').
	 * Defaults to 'gemini' if not specified (this default is handled by the LLM factory).
	 */
	llmProvider?: string;
	/**
	 * @property {string} [llmModelName] - The specific model name for the selected LLM provider.
	 * If not provided, the default model for that provider will be used.
	 */
	llmModelName?: string;
	/**
	 * @property {Record<string, any>} [llmOptions] - Additional options for the LLM provider.
	 * These are provider-specific and are passed through.
	 */
	llmOptions?: Record<string, any>; // For future flexibility
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
	// LLM Provider and Model validations
	if (
		requestBody.llmProvider !== undefined &&
		(typeof requestBody.llmProvider !== "string" || requestBody.llmProvider.trim() === "")
	) {
		return res.status(400).send("llmProvider must be a non-empty string if provided.");
	}
	if (
		requestBody.llmModelName !== undefined &&
		(typeof requestBody.llmModelName !== "string" || requestBody.llmModelName.trim() === "")
	) {
		return res.status(400).send("llmModelName must be a non-empty string if provided.");
	}
	if (
		requestBody.llmOptions !== undefined &&
		(typeof requestBody.llmOptions !== "object" ||
			Array.isArray(requestBody.llmOptions) ||
			requestBody.llmOptions === null)
	) {
		return res.status(400).send("llmOptions must be an object if provided.");
	}
	// --- End of Input Validation ---

	console.log("🚀 ~ :197 ~ app.post ~ requestBody:", requestBody);
	console.log("🚀 ~ :198 ~ app.post ~ llmModelName:", requestBody.llmModelName);

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
		llmProvider: requestBody.llmProvider ?? requestBody.llmProvider,
		llmModelName: requestBody.llmModelName ?? requestBody.llmModelName,
		// Note: llmOptions are not directly part of SharedData type for now,
	};

	console.log("🚀 ~ :212 ~ app.post ~ sharedData:", sharedData);

	console.log(`${LOG_PREFIX} Starting tutorial generation for project: ${sharedData.projectName}`);
	if (sharedData.llmProvider) console.log(`${LOG_PREFIX} Using LLM Provider: ${sharedData.llmProvider}`);
	if (sharedData.llmModelName) console.log(`${LOG_PREFIX} Using LLM Model: ${sharedData.llmModelName}`);

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
			providerName: sharedData.llmProvider, // Pass from request
			llmModelName: sharedData.llmModelName, // Pass from request
			// ...providerSpecificOptions could be spread here if IdentifyAbstractionsOptions supports it
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
			providerName: llmProvider,
			llmModelName: llmModelName,
			// ...providerSpecificOptions
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
			providerName: llmProvider,
			llmModelName: llmModelName,
			// ...providerSpecificOptions
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
			providerName: llmProvider,
			llmModelName: llmModelName,
			// ...providerSpecificOptions spread into LlmOptions compatible field if WriteChaptersOptions has it
			// For now, llmModelName is the primary way to specify the model via options.
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

app.listen(port, () => {
	console.log(`Server is listening on port ${port}`);
});
