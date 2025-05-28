import { LlmProvider } from "./llm-provider";
import { GeminiProvider } from "./gemini-provider";
import { ChatGptProvider } from "./chatgpt-provider";
import { ClaudeProvider } from "./claude-provider";

const DEFAULT_PROVIDER_NAME = "gemini";

/**
 * @function getLlmProvider
 * @description Factory function to get an instance of an LLM provider.
 * Defaults to GeminiProvider if no providerName is specified.
 * Provider matching is case-insensitive.
 *
 * @param {string} [providerName] - The name of the LLM provider to get.
 *   Supported values: 'gemini', 'chatgpt', 'claude'. Defaults to 'gemini'.
 * @returns {LlmProvider} An instance of the requested LLM provider.
 * @throws {Error} If the providerName is not recognized.
 */
export function getLlmProvider(providerName?: string): LlmProvider {
	const name = (providerName || DEFAULT_PROVIDER_NAME).toLowerCase();

	console.log("🚀 ~ :22 ~ getLlmProvider ~ name:", name);

	switch (name) {
		case "gemini":
			return new GeminiProvider();
		case "chatgpt":
			return new ChatGptProvider();
		case "claude":
			return new ClaudeProvider();
		default:
			throw new Error(
				`Unsupported LLM provider: ${providerName}. Supported providers are 'gemini', 'chatgpt', 'claude'.`
			);
	}
}
