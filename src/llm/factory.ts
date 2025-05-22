// src/llm/factory.ts
import { LlmProvider, LlmProviderType, LlmProviderConfig, GeminiProviderConfig, ClaudeProviderConfig, OpenAIProviderConfig } from './types';
import { GeminiProvider } from './gemini-provider';
import { ClaudeProvider } from './claude-provider';
import { OpenAIProvider } from './openai-provider';

export function createLlmProvider(
  providerType: LlmProviderType,
  config: LlmProviderConfig = {} // Default to empty object if no specific config needed beyond env vars
): LlmProvider {
  switch (providerType) {
    case 'gemini':
      // Ensure config is compatible with GeminiProviderConfig
      return new GeminiProvider(config as GeminiProviderConfig);
    case 'claude':
      if (!config.apiKey && !process.env.CLAUDE_API_KEY) {
        throw new Error('Claude API key must be provided in config or CLAUDE_API_KEY env var for ClaudeProvider.');
      }
      return new ClaudeProvider(config as ClaudeProviderConfig);
    case 'openai':
      if (!config.apiKey && !process.env.OPENAI_API_KEY) {
        throw new Error('OpenAI API key must be provided in config or OPENAI_API_KEY env var for OpenAIProvider.');
      }
      return new OpenAIProvider(config as OpenAIProviderConfig);
    default:
      // This should ideally not happen if LlmProviderType is used correctly
      // but as a fallback:
      console.error(`Unsupported LLM provider type: ${providerType}`);
      throw new Error(`Unsupported LLM provider type: ${providerType}`);
  }
}

// Optional: A more generic function to call LLM without managing provider instance directly
// This would be similar to the old callLlm but using the factory.
// For now, we'll let the API endpoint manage the provider instance.

/*
import { LlmGenerationOptions } from './types';

export async function callLlm(
  providerType: LlmProviderType,
  prompt: string,
  config: LlmProviderConfig = {},
  options?: LlmGenerationOptions
): Promise<string> {
  const provider = createLlmProvider(providerType, config);
  return provider.generateContent(prompt, options);
}
*/
