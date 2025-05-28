/**
 * @interface LlmOptions
 * @description Defines the options for LLM generation.
 * @property {boolean} [useCache] - Whether to use caching for the generation.
 * @property {string} [modelName] - The name of the LLM model to use.
 * @property {any} [key: string] - Allows for other arbitrary options.
 */
export interface LlmOptions {
	useCache?: boolean;
	modelName?: string;
	[key: string]: any;
}

/**
 * @interface LlmProvider
 * @description Defines the interface for an LLM provider.
 */
export interface LlmProvider {
	/**
	 * @method generate
	 * @description Generates text based on the given prompt and options.
	 * @param {string} prompt - The prompt to generate text from.
	 * @param {LlmOptions} [options] - The options for LLM generation.
	 * @returns {Promise<string>} A promise that resolves with the generated text.
	 */
	generate(prompt: string, options?: LlmOptions): Promise<string>;
}
