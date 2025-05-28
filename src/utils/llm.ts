import fs from "fs/promises";
import path from "path";
import crypto from "crypto";
import { getLlmProvider } from "../llm/llm-factory";
import { LlmOptions } from "../llm/llm-provider";

const CACHE_DIR = path.join(process.cwd(), ".cache");
const LLM_CACHE_FILE = path.join(CACHE_DIR, "llm_cache.json");
const LLM_LOG_FILE = path.join(CACHE_DIR, "llm_interactions.log");

/**
 * @interface LlmCache
 * @description Defines the structure of the LLM cache.
 * @internal
 */
interface LlmCache {
	[promptHash: string]: string;
}

/**
 * @function ensureCacheDirExists
 * @description Ensures that the cache directory exists. Creates it if it doesn't.
 * @public
 * @async
 * @returns {Promise<void>}
 */
export async function ensureCacheDirExists(): Promise<void> {
	try {
		await fs.mkdir(CACHE_DIR, { recursive: true });
	} catch (error: any) {
		if (error.code !== "EEXIST") {
			console.warn(`Could not create cache directory ${CACHE_DIR}:`, error);
		}
	}
}

/**
 * @function loadCache
 * @description Loads the LLM cache from the file system.
 * @public
 * @async
 * @returns {Promise<LlmCache>} The loaded cache.
 */
export async function loadCache(): Promise<LlmCache> {
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

/**
 * @function saveCache
 * @description Saves the LLM cache to the file system.
 * @public
 * @async
 * @param {LlmCache} cache - The cache object to save.
 * @returns {Promise<void>}
 */
export async function saveCache(cache: LlmCache): Promise<void> {
	await ensureCacheDirExists();
	try {
		await fs.writeFile(LLM_CACHE_FILE, JSON.stringify(cache, null, 2), "utf-8");
	} catch (error) {
		console.warn("Error saving LLM cache:", error);
	}
}

/**
 * @function logInteraction
 * @description Logs an LLM interaction (prompt and response/error) to a log file.
 * @public
 * @async
 * @param {string} prompt - The prompt sent to the LLM.
 * @param {string | Error} response - The response from the LLM or an Error object.
 * @returns {Promise<void>}
 */
export async function logInteraction(prompt: string, response: string | Error): Promise<void> {
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

/**
 * @function hashPrompt
 * @description Creates a SHA256 hash of the prompt for use as a cache key.
 * @public
 * @param {string} prompt - The prompt to hash.
 * @returns {string} The hexadecimal string of the hash.
 */
export function hashPrompt(prompt: string): string {
	return crypto.createHash("sha256").update(prompt).digest("hex");
}

/**
 * @interface CallLlmArgs
 * @extends LlmOptions
 * @description Arguments for the callLlm function, extending LlmOptions to include provider selection.
 * @property {string} [providerName] - The name of the LLM provider to use (e.g., 'gemini', 'chatgpt', 'claude').
 * Inherits all properties from {@link LlmOptions}
 */
export interface CallLlmArgs extends LlmOptions {
	// Defaults to 'gemini' if not specified.
	providerName?: string;
}

/**
 * @function callLlm
 * @description Calls the specified Large Language Model (LLM) with the given prompt and options.
 * This function acts as a high-level interface to various LLM providers,
 * delegating the actual generation, caching, and logging to the selected provider.
 *
 * @param {string} prompt - The prompt string to send to the LLM.
 * @param {CallLlmArgs} [options] - Configuration options for the LLM call,
 * including provider name, caching preference, and model name.
 * @returns {Promise<string>} A Promise that resolves to the LLM's response text.
 * @throws {Error} If the specified provider is not supported, if the provider's API key is missing,
 * or if the LLM API call fails.
 */
export async function callLlm(prompt: string, options?: CallLlmArgs): Promise<string> {
	console.log("🚀 ~ :135 ~ callLlm ~ options:", options);

	try {
		// Get the appropriate provider using the factory
		// The factory defaults to 'gemini' if options.providerName is undefined
		const provider = getLlmProvider(options?.providerName);

		console.log("🚀 ~ :141 ~ provider:", provider);

		// Delegate the generation task to the provider.
		// The provider itself will handle caching and logging based on the options.
		return await provider.generate(prompt, options);
	} catch (error: any) {
		// Log the error at this top level as well, in case provider-level logging fails or for an overview.
		// However, primary logging responsibility is with the provider.
		console.error(`Error in callLlm: ${error.message}`, error.stack);
		// Re-throw the error so the caller can handle it.
		// The error should ideally be an instance of Error from the provider or factory.
		throw error;
	}
}
