import OpenAI from 'openai';
import { LlmOptions, LlmProvider } from "./llm-provider";
import { loadCache, saveCache, logInteraction, hashPrompt } from "../utils/llm";

// Ensure OPENAI_API_KEY is set in your environment.
if (!process.env.OPENAI_API_KEY) {
  console.warn(
    "OPENAI_API_KEY environment variable is not set. OpenAI LLM calls will fail."
  );
  // Potentially throw an error here if strict checking is required at module load time
  // throw new Error("OPENAI_API_KEY environment variable is not set.");
}

const DEFAULT_CHATGPT_MODEL_NAME = "gpt-3.5-turbo";

/**
 * @class ChatGptProvider
 * @implements LlmProvider
 * @description Provides an interface to OpenAI's ChatGPT LLM.
 */
export class ChatGptProvider implements LlmProvider {
  private openai: OpenAI;
  private defaultModelName: string;

  /**
   * @constructor
   * @description Initializes the ChatGptProvider, setting up the OpenAI client
   * and checking for the API key.
   * @throws Error if OPENAI_API_KEY is not set in the environment.
   */
  constructor() {
    if (!process.env.OPENAI_API_KEY) {
      // This check is vital for the provider to function.
      throw new Error("OPENAI_API_KEY environment variable is not set.");
    }
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
    this.defaultModelName = process.env.OPENAI_MODEL || DEFAULT_CHATGPT_MODEL_NAME;
  }

  /**
   * @method generate
   * @description Generates text using the ChatGPT LLM based on the given prompt and options.
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
        console.log(`ChatGptProvider: Cache HIT for prompt hash: ${promptHash.substring(0,10)}...`);
        const cachedResponse = cache[promptHash];
        await logInteraction(prompt, `[CACHE HIT] ${cachedResponse}`);
        return cachedResponse;
      }
      console.log(`ChatGptProvider: Cache MISS for prompt hash: ${promptHash.substring(0,10)}...`);
    }

    try {
      console.log(`ChatGptProvider: Calling LLM (Model: ${modelName}) with prompt (hash: ${promptHash.substring(0,10)}...)...`);
      
      const completion = await this.openai.chat.completions.create({
        messages: [{ role: "user", content: prompt }],
        model: modelName,
      });

      // Ensure there's a valid response and choices
      if (!completion.choices || completion.choices.length === 0 || !completion.choices[0].message) {
        throw new Error("Invalid response structure from OpenAI API.");
      }
      
      const responseText = completion.choices[0].message.content;

      if (responseText === null || responseText === undefined) {
        throw new Error("Received null or undefined content from OpenAI API.");
      }

      if (useCache) {
        const cache = await loadCache(); // Reload cache
        cache[promptHash] = responseText;
        await saveCache(cache);
      }

      await logInteraction(prompt, responseText);
      return responseText;

    } catch (error: any) {
      let errorMessage = `ChatGPT LLM API call failed (Model: ${modelName})`;
      if (error.response && error.response.data && error.response.data.error && error.response.data.error.message) {
        // Typical OpenAI error structure
        errorMessage += `: ${error.response.data.error.message}`;
      } else if (error.message) {
        errorMessage += `: ${error.message}`;
      }
      
      console.error(`ChatGptProvider: ${errorMessage}`, error);
      await logInteraction(prompt, new Error(errorMessage + (error.stack ? `\n${error.stack}` : '')));
      throw new Error(errorMessage);
    }
  }
}
