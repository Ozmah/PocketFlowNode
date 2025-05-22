// src/llm/openai-provider.ts
import { LlmProvider, LlmGenerationOptions, OpenAIProviderConfig, LlmProviderType } from './types';

// Official OpenAI API endpoint for chat completions
const OPENAI_API_URL = 'https://api.openai.com/v1/chat/completions';

export class OpenAIProvider implements LlmProvider {
  readonly providerType: LlmProviderType = "openai";
  private config: OpenAIProviderConfig;
  private apiKey: string;

  constructor(config: OpenAIProviderConfig) {
    if (!config.apiKey && !process.env.OPENAI_API_KEY) {
      throw new Error("OpenAI API key is not provided in config or OPENAI_API_KEY environment variable.");
    }
    this.apiKey = config.apiKey || process.env.OPENAI_API_KEY!;
    this.config = config;
  }

  async generateContent(prompt: string, options?: LlmGenerationOptions): Promise<string> {
    const model = options?.model || this.config.modelName || 'gpt-3.5-turbo'; // Default model
    const maxTokens = options?.maxTokens; // OpenAI calls it max_tokens

    console.log(`Calling OpenAI LLM (Model: ${model}) with prompt...`);

    try {
      const response = await fetch(OPENAI_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: model,
          messages: [{ role: 'user', content: prompt }], // OpenAI uses a messages array
          max_tokens: maxTokens,
          temperature: options?.temperature,
          top_p: options?.topP,
          // stream: false, // Add other OpenAI specific parameters
          // stop: options?.stop, // Example of a parameter specific to OpenAI
        }),
      });

      if (!response.ok) {
        const errorBody = await response.text(); // Read body as text for detailed error
        throw new Error(`OpenAI API request failed with status ${response.status}: ${errorBody}`);
      }

      const responseData = await response.json();
      
      // Extract the message content from the response
      const completion = responseData.choices?.[0]?.message?.content;
      if (typeof completion !== 'string') {
        console.error("Unexpected OpenAI API response structure:", responseData);
        throw new Error('Failed to extract completion text from OpenAI response.');
      }

      console.log('OpenAI LLM call successful.');
      return completion.trim();

    } catch (error: any) {
      let errorMessage = `OpenAI LLM API call failed (Model: ${model})`;
      if (error.message) {
          errorMessage += `: ${error.message}`;
      }
      // Attempt to get more detailed error info if available (e.g. from Axios error structure)
      const errorDetails = error.response?.data?.error?.message || error.response?.data || '';
      if (errorDetails) {
          errorMessage += ` - Details: ${typeof errorDetails === 'string' ? errorDetails : JSON.stringify(errorDetails)}`;
      }
      console.error(errorMessage, error);
      throw new Error(errorMessage);
    }
  }
}
