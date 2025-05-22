// src/llm/types.ts

/**
 * Defines the available LLM providers.
 */
export type LlmProviderType = "gemini" | "claude" | "openai";

/**
 * Common options for LLM providers.
 * Specific providers might extend this with their own unique options.
 */
export interface LlmCommonOptions {
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  topK?: number;
  // Add other common parameters as needed
}

/**
 * Options that can be passed to the `generateContent` method of an LLM provider.
 * This includes common options and a way to pass provider-specific settings.
 */
export interface LlmGenerationOptions extends LlmCommonOptions {
  useCache?: boolean; // From existing CallLlmOptions, still relevant
  model?: string; // Model can be specified per call for some providers
  [key: string]: any; // For provider-specific arbitrary options
}

/**
 * Configuration options for initializing an LLM provider instance.
 */
export interface LlmProviderConfig {
  apiKey?: string; // API key might be set during instantiation or per call for some SDKs
  modelName?: string; // Default model for the provider instance
  // Add other provider-level config if necessary
}

/**
 * Interface for an LLM provider.
 * All LLM provider classes (Gemini, Claude, OpenAI) will implement this interface.
 */
export interface LlmProvider {
  /**
   * A unique identifier for the provider type (e.g., "gemini", "claude").
   */
  readonly providerType: LlmProviderType;

  /**
   * Generates content based on the given prompt and options.
   * @param prompt The text prompt to send to the LLM.
   * @param options Optional parameters for the generation request, including model and provider-specific settings.
   * @returns A Promise that resolves to the LLM's response text.
   */
  generateContent(prompt: string, options?: LlmGenerationOptions): Promise<string>;
}

/**
 * Extends LlmProviderConfig for specific provider configurations
 * if they have mandatory fields beyond the common ones during instantiation.
 */

export interface GeminiProviderConfig extends LlmProviderConfig {
  // Gemini-specific config options, if any, during instantiation
  // For now, apiKey and modelName from LlmProviderConfig are sufficient
}

export interface ClaudeProviderConfig extends LlmProviderConfig {
  apiKey: string; // Claude typically requires API key at instantiation
  // Claude-specific config options
}

export interface OpenAIProviderConfig extends LlmProviderConfig {
  apiKey: string; // OpenAI typically requires API key at instantiation
  // OpenAI-specific config options
}
