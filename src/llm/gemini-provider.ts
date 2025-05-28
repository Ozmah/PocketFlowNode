import { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } from "@google/generative-ai";
import { GoogleGenAI } from "@google/genai";
import { LlmOptions, LlmProvider } from "./llm-provider";
import { loadCache, saveCache, logInteraction, hashPrompt } from "../utils/llm"; // Assuming these will be exported from utils/llm.ts

// Ensure GEMINI_API_KEY is set in your environment.
if (!process.env.GEMINI_API_KEY) {
	console.warn("GEMINI_API_KEY environment variable is not set. LLM calls will fail.");
	// Potentially throw an error here if strict checking is required at module load time
	// throw new Error("GEMINI_API_KEY environment variable is not set.");
}

const DEFAULT_GEMINI_MODEL_NAME = "gemini-2.0-flash";

/**
 * @class GeminiProvider
 * @implements LlmProvider
 * @description Provides an interface to Google's Gemini LLM.
 */
export class GeminiProvider implements LlmProvider {
	private apiKey: string;
	private defaultModelName: string;

	/**
	 * @constructor
	 * @description Initializes the GeminiProvider, checking for the API key.
	 * @throws Error if GEMINI_API_KEY is not set in the environment.
	 */
	constructor() {
		this.apiKey = process.env.GEMINI_API_KEY!; // Non-null assertion because we check at the top
		if (!this.apiKey) {
			throw new Error("GEMINI_API_KEY environment variable is not set.");
		}
		this.defaultModelName = process.env.GEMINI_MODEL || DEFAULT_GEMINI_MODEL_NAME;

		console.log("🚀 ~ :35 ~ GeminiProvider ~ constructor ~ defaultModelName:", this.defaultModelName);
	}

	/**
	 * @method generate
	 * @description Generates text using the Gemini LLM based on the given prompt and options.
	 * Handles caching and logging.
	 * @param {string} prompt - The prompt to generate text from.
	 * @param {LlmOptions} [options] - The options for LLM generation.
	 * @returns {Promise<string>} A promise that resolves with the generated text.
	 * @throws Error if the API key is missing or the LLM API call fails.
	 */
	async generate(prompt: string, options?: LlmOptions): Promise<string> {
		const useCache = options?.useCache ?? true;
		const modelName = options?.modelName || this.defaultModelName;
		const promptHash = hashPrompt(prompt);

		console.log("🚀 ~ :53 ~ GeminiProvider ~ generate ~ promptHash:", promptHash);

		if (useCache) {
			const cache = await loadCache();
			if (cache[promptHash]) {
				console.log(`GeminiProvider: Cache HIT for prompt hash: ${promptHash.substring(0, 10)}...`);
				const cachedResponse = cache[promptHash];
				// Note: logInteraction is called outside the cache check in the original llm.ts
				// For consistency, we could call it here, or rely on the subsequent call.
				// Original logic implies logging happens whether cache hit or miss, after the fact.
				// Let's stick to logging the actual event (API call or cache hit).
				await logInteraction(prompt, `[CACHE HIT] ${cachedResponse}`);
				return cachedResponse;
			}
			console.log(`GeminiProvider: Cache MISS for prompt hash: ${promptHash.substring(0, 10)}...`);
		}

		try {
			// instantiation of the model
			const ai = new GoogleGenAI({ apiKey: this.apiKey });
			console.log(
				`GeminiProvider: Calling LLM (Model: ${modelName}) with prompt (hash: ${promptHash.substring(
					0,
					10
				)}...)...`
			);
			// Call and wait for generateContent
			const result = await ai.models.generateContent({
				model: modelName,
				contents: prompt,
			});

			// typed responses constants to use in cache, logInteraction and the return response.
			const response: string | Error =
				result.text !== undefined
					? result.text
					: new Error(`Gemini LLM API returned empty response (Model: ${modelName})`);
			const responseText: string = result.text !== undefined ? result.text : "";

			if (useCache) {
				const cache = await loadCache(); // Reload cache
				cache[promptHash] = responseText;
				await saveCache(cache);
			}

			console.log("🚀 ~ :96 ~ GeminiProvider ~ generate ~ responseText:", responseText);

			await logInteraction(prompt, response);
			return responseText;
		} catch (error: any) {
			let errorMessage = `Gemini LLM API call failed (Model: ${modelName})`;
			if (error.message) {
				errorMessage += `: ${error.message}`;
			}
			// Google AI SDK errors often have a more detailed 'details' property or are nested
			if (error.response && error.response.data) {
				errorMessage += ` - ${JSON.stringify(error.response.data)}`;
			} else if (error.details) {
				errorMessage += ` - Details: ${error.details}`;
			} else if (error.cause && error.cause.message) {
				// Sometimes errors are nested
				errorMessage += ` - Caused by: ${error.cause.message}`;
			}

			console.error(`GeminiProvider: ${errorMessage}`, error);
			await logInteraction(prompt, new Error(errorMessage + (error.stack ? `\n${error.stack}` : "")));
			throw new Error(errorMessage);
		}
	}
}
