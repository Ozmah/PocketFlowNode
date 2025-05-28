import Anthropic from "@anthropic-ai/sdk";
import { LlmOptions, LlmProvider } from "./llm-provider";
import { loadCache, saveCache, logInteraction, hashPrompt } from "../utils/llm";

// Ensure ANTHROPIC_API_KEY is set in your environment.
if (!process.env.ANTHROPIC_API_KEY) {
	console.warn("ANTHROPIC_API_KEY environment variable is not set. Anthropic LLM calls will fail.");
	// Potentially throw an error here if strict checking is required at module load time
	// throw new Error("ANTHROPIC_API_KEY environment variable is not set.");
}

const DEFAULT_CLAUDE_MODEL_NAME = "claude-3-7-sonnet-20250219";

/**
 * @class ClaudeProvider
 * @implements LlmProvider
 * @description Provides an interface to Anthropic's Claude LLM.
 */
export class ClaudeProvider implements LlmProvider {
	private anthropic: Anthropic;
	private defaultModelName: string;

	/**
	 * @constructor
	 * @description Initializes the ClaudeProvider, setting up the Anthropic client
	 * and checking for the API key.
	 * @throws Error if ANTHROPIC_API_KEY is not set in the environment.
	 */
	constructor() {
		if (!process.env.ANTHROPIC_API_KEY) {
			// This check is vital for the provider to function.
			throw new Error("ANTHROPIC_API_KEY environment variable is not set.");
		}
		this.anthropic = new Anthropic({
			apiKey: process.env.ANTHROPIC_API_KEY,
		});
		this.defaultModelName = process.env.ANTHROPIC_MODEL || DEFAULT_CLAUDE_MODEL_NAME;
	}

	/**
	 * @method generate
	 * @description Generates text using the Claude LLM based on the given prompt and options.
	 * Handles caching, logging, and API interactions.
	 * @param {string} prompt - The prompt to generate text from.
	 * @param {LlmOptions} [options] - The options for LLM generation.
	 * @returns {Promise<string>} A promise that resolves with the generated text.
	 * @throws Error if the API key is missing or the LLM API call fails.
	 */
	async generate(prompt: string, options?: LlmOptions): Promise<string> {
		const useCache = options?.useCache ?? true;
		const modelName = options?.modelName || this.defaultModelName;
		const promptHash = hashPrompt(prompt);

		if (useCache) {
			const cache = await loadCache();
			if (cache[promptHash]) {
				console.log(`ClaudeProvider: Cache HIT for prompt hash: ${promptHash.substring(0, 10)}...`);
				const cachedResponse = cache[promptHash];
				await logInteraction(prompt, `[CACHE HIT] ${cachedResponse}`);
				return cachedResponse;
			}
			console.log(`ClaudeProvider: Cache MISS for prompt hash: ${promptHash.substring(0, 10)}...`);
		}

		try {
			console.log(
				`ClaudeProvider: Calling LLM (Model: ${modelName}) with prompt (hash: ${promptHash.substring(
					0,
					10
				)}...)...`
			);

			// Anthropic API expects the prompt within a messages array
			const message = await this.anthropic.messages.create({
				model: modelName,
				max_tokens: 2048, // Default max tokens, can be made configurable via LlmOptions
				messages: [{ role: "user", content: prompt }],
			});

			// Ensure there's a valid response and content
			if (!message.content || message.content.length === 0 || message.content[0].type !== "text") {
				throw new Error("Invalid or empty response structure from Anthropic API.");
			}

			const responseText = message.content[0].text;

			if (useCache) {
				const cache = await loadCache(); // Reload cache
				cache[promptHash] = responseText;
				await saveCache(cache);
			}

			await logInteraction(prompt, responseText);
			return responseText;
		} catch (error: any) {
			let errorMessage = `Claude LLM API call failed (Model: ${modelName})`;
			if (error instanceof Anthropic.APIError) {
				// Anthropic SDK errors have a specific structure
				errorMessage += `: ${error.status} ${error.name} - ${error.message}`;
				if (error.headers && error.headers["anthropic-request-id"]) {
					errorMessage += ` (Request ID: ${error.headers["anthropic-request-id"]})`;
				}
			} else if (error.message) {
				errorMessage += `: ${error.message}`;
			}

			console.error(`ClaudeProvider: ${errorMessage}`, error);
			await logInteraction(prompt, new Error(errorMessage + (error.stack ? `\n${error.stack}` : "")));
			throw new Error(errorMessage);
		}
	}
}
