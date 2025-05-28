import { GoogleGenAI } from "@google/genai";
import fs from "fs/promises";
import path from "path";
import crypto from "crypto";

// It's good practice to ensure environment variables are checked at the start.
// Ensure GEMINI_API_KEY is set in your environment.
if (!process.env.GEMINI_API_KEY) {
	console.warn("GEMINI_API_KEY environment variable is not set. LLM calls will fail.");
	// Depending on strictness, you might throw an error here:
	// throw new Error("GEMINI_API_KEY environment variable is not set.");
}

const DEFAULT_MODEL_NAME = "gemini-2.5-pro-preview-05-06"; // A common default model
const GEMINI_MODEL_NAME = process.env.GEMINI_MODEL || DEFAULT_MODEL_NAME;

const CACHE_DIR = path.join(process.cwd(), ".cache"); // Place cache in a .cache directory
const LLM_CACHE_FILE = path.join(CACHE_DIR, "llm_cache.json");
const LLM_LOG_FILE = path.join(CACHE_DIR, "llm_interactions.log"); // Log interactions

export interface CallLlmOptions {
	useCache?: boolean;
	// modelName?: string; // Could be added if we want per-call model selection
}

interface LlmCache {
	[promptHash: string]: string;
}

// Helper function to ensure cache directory exists
async function ensureCacheDirExists(): Promise<void> {
	try {
		await fs.mkdir(CACHE_DIR, { recursive: true });
	} catch (error: any) {
		if (error.code !== "EEXIST") {
			// Ignore if directory already exists
			console.warn(`Could not create cache directory ${CACHE_DIR}:`, error);
		}
	}
}

// Helper function to load cache
async function loadCache(): Promise<LlmCache> {
	await ensureCacheDirExists();
	try {
		const data = await fs.readFile(LLM_CACHE_FILE, "utf-8");
		return JSON.parse(data) as LlmCache;
	} catch (error: any) {
		if (error.code === "ENOENT") {
			return {}; // Cache file doesn't exist yet
		}
		console.warn("Error loading LLM cache:", error);
		return {}; // Return empty cache on other errors
	}
}

// Helper function to save cache
async function saveCache(cache: LlmCache): Promise<void> {
	await ensureCacheDirExists();
	try {
		await fs.writeFile(LLM_CACHE_FILE, JSON.stringify(cache, null, 2), "utf-8");
	} catch (error) {
		console.warn("Error saving LLM cache:", error);
	}
}

// Helper function to log interactions
async function logInteraction(prompt: string, response: string | Error): Promise<void> {
	await ensureCacheDirExists();
	const timestamp = new Date().toISOString();
	const logEntry = `[${timestamp}]\nPROMPT:\n${prompt}\nRESPONSE:\n${
		response instanceof Error ? response.stack : response
	}\n---\n`;
	try {
		await fs.appendFile(LLM_LOG_FILE, logEntry);
	} catch (error) {
		console.warn("Error writing to LLM log file:", error);
	}
}

// Helper to create a hash of the prompt for use as a cache key
function hashPrompt(prompt: string): string {
	return crypto.createHash("sha256").update(prompt).digest("hex");
}

/**
 * Calls the configured Large Language Model (Google Gemini) with the given prompt.
 * Handles caching and basic logging.
 *
 * Requires GEMINI_API_KEY environment variable to be set.
 * Optionally, GEMINI_MODEL can be set to specify a model (defaults to "gemini-pro").
 *
 * @param prompt The prompt string to send to the LLM.
 * @param options Configuration options for the LLM call.
 * @returns A Promise that resolves to the LLM's response text.
 * @throws Error if API key is missing, or if the LLM API call fails.
 */
export async function callLlm(prompt: string, options?: CallLlmOptions): Promise<string> {
	const useCache = options?.useCache ?? true;
	const apiKey = process.env.GEMINI_API_KEY;

	if (!apiKey) {
		const errorMsg = "GEMINI_API_KEY environment variable is not set.";
		console.error(errorMsg);
		await logInteraction(prompt, new Error(errorMsg));
		throw new Error(errorMsg);
	}

	const promptHash = hashPrompt(prompt);

	if (useCache) {
		const cache = await loadCache();
		if (cache[promptHash]) {
			console.log(`LLM Cache HIT for prompt hash: ${promptHash.substring(0, 10)}...`);
			const cachedResponse = cache[promptHash];
			await logInteraction(prompt, `[CACHE HIT] ${cachedResponse}`);
			return cachedResponse;
		}
		console.log(`LLM Cache MISS for prompt hash: ${promptHash.substring(0, 10)}...`);
	}

	try {
		//TODO: Need to add a more robust param system
		const ai = new GoogleGenAI({ apiKey: apiKey });

		console.log(
			`Calling LLM (Model: ${GEMINI_MODEL_NAME}) with prompt (hash: ${promptHash.substring(0, 10)}...)...`
		);

		// Call and wait for generateContent
		const result = await ai.models.generateContent({
			model: GEMINI_MODEL_NAME,
			contents: prompt,
		});

		// typed responses constants to use in cache, logInteraction and the return response.
		const response: string | Error =
			result.text !== undefined
				? result.text
				: new Error(`Gemini LLM API returned empty response (Model: ${GEMINI_MODEL_NAME})`);
		const responseText: string = result.text !== undefined ? result.text : "";

		if (useCache) {
			const cache = await loadCache(); // Reload cache in case it was updated by a concurrent process
			cache[promptHash] = responseText;
			await saveCache(cache);
		}

		await logInteraction(prompt, responseText);
		return responseText;
	} catch (error: any) {
		let errorMessage = `LLM API call failed (Model: ${GEMINI_MODEL_NAME})`;
		if (error.message) {
			errorMessage += `: ${error.message}`;
		}
		if (error.response && error.response.data) {
			// Axios-like error structure
			errorMessage += ` - ${JSON.stringify(error.response.data)}`;
		} else if (error.details) {
			// gRPC-like error structure (used by Google AI SDK)
			errorMessage += ` - Details: ${error.details}`;
		}

		console.error(errorMessage, error);
		await logInteraction(prompt, new Error(errorMessage + (error.stack ? `\n${error.stack}` : "")));
		// Consider re-throwing a more specific error or a generic one
		throw new Error(errorMessage);
	}
}

// Example usage (can be removed or kept for testing)
/*
async function testLlm() {
  // Ensure you have GEMINI_API_KEY set in your .env file or environment
  // require('dotenv').config(); // If you use dotenv for local development

  if (!process.env.GEMINI_API_KEY) {
    console.error("Please set the GEMINI_API_KEY environment variable.");
    return;
  }

  const testPrompt = "Explain the concept of a promise in JavaScript in simple terms.";
  
  try {
    console.log("First call (should hit API, then cache):");
    const response1 = await callLlm(testPrompt, { useCache: true });
    console.log("Response 1:", response1.substring(0, 100) + "...");

    console.log("\nSecond call (should hit cache):");
    const response2 = await callLlm(testPrompt, { useCache: true });
    console.log("Response 2:", response2.substring(0, 100) + "...");
    
    console.log("\nThird call (no cache):");
    const response3 = await callLlm(testPrompt, { useCache: false });
    console.log("Response 3:", response3.substring(0, 100) + "...");

  } catch (error) {
    console.error("LLM test failed:", error);
  }
}

// testLlm(); // Uncomment to run test
*/
