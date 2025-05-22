// tests/llm/openai-provider.test.ts
import { OpenAIProvider } from '../../src/llm/openai-provider';
import { LlmGenerationOptions } from '../../src/llm/types';

// Mock global fetch
const mockFetch = jest.fn();
global.fetch = mockFetch as any;

describe('OpenAIProvider', () => {
  let originalApiKey: string | undefined;
  const testPrompt = "Test OpenAI prompt";
  const testResponseText = "Test OpenAI response";

  beforeEach(() => {
    jest.clearAllMocks();
    originalApiKey = process.env.OPENAI_API_KEY;
    process.env.OPENAI_API_KEY = 'test-openai-api-key';

    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{ message: { content: testResponseText } }] }),
      text: async () => JSON.stringify({ choices: [{ message: { content: testResponseText } }] })
    });
  });

  afterEach(() => {
    process.env.OPENAI_API_KEY = originalApiKey;
  });

  test('constructor should throw error if API key is not provided', () => {
    delete process.env.OPENAI_API_KEY;
    expect(() => new OpenAIProvider({ apiKey: '' })).toThrow('OpenAI API key is not provided');
  });

  test('generateContent should call OpenAI API and return response text', async () => {
    const provider = new OpenAIProvider({ apiKey: 'config-openai-key' });
    const options: LlmGenerationOptions = { model: 'gpt-4-test', temperature: 0.7, maxTokens: 150 };
    const response = await provider.generateContent(testPrompt, options);

    expect(response.trim()).toBe(testResponseText); // Provider trims the response
    expect(mockFetch).toHaveBeenCalledWith(
      'https://api.openai.com/v1/chat/completions',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'Authorization': 'Bearer config-openai-key',
        }),
        body: JSON.stringify(expect.objectContaining({
          messages: [{ role: 'user', content: testPrompt }],
          model: 'gpt-4-test',
          temperature: 0.7,
          max_tokens: 150
        })),
      })
    );
  });

  test('generateContent should use default model if not specified', async () => {
    const provider = new OpenAIProvider({ apiKey: 'test-key' });
    await provider.generateContent(testPrompt);
    expect(mockFetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        body: JSON.stringify(expect.objectContaining({
          model: 'gpt-3.5-turbo', // Default model in provider
        })),
      })
    );
  });
  
  test('generateContent should handle API call failure (response not ok)', async () => {
    const provider = new OpenAIProvider({ apiKey: 'test-key' });
    const errorResponseBody = { error: { message: "Invalid API key" } };
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 401,
      text: async () => JSON.stringify(errorResponseBody), // Detailed error from OpenAI
      json: async () => errorResponseBody
    });

    await expect(provider.generateContent(testPrompt))
      .rejects.toThrow('OpenAI API request failed with status 401: {"error":{"message":"Invalid API key"}}');
  });

  test('generateContent should handle API call failure (network error)', async () => {
    const provider = new OpenAIProvider({ apiKey: 'test-key' });
    const networkError = new Error('Network failure');
    mockFetch.mockRejectedValueOnce(networkError);

    await expect(provider.generateContent(testPrompt))
      .rejects.toThrow(`OpenAI LLM API call failed (Model: gpt-3.5-turbo): Network failure`);
  });
  
  test('generateContent should throw error for malformed API response', async () => {
    const provider = new OpenAIProvider({ apiKey: 'test-key' });
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ choices: [{ message: { content: null } }] }), // Null content
      text: async () => JSON.stringify({ choices: [{ message: { content: null } }] })
    });
    await expect(provider.generateContent(testPrompt))
      .rejects.toThrow('Failed to extract completion text from OpenAI response.');

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ choices: [{ text: "old_format_not_supported" }] }), // Wrong structure
      text: async () => JSON.stringify({ choices: [{ text: "old_format_not_supported" }] })
    });
    await expect(provider.generateContent(testPrompt))
      .rejects.toThrow('Failed to extract completion text from OpenAI response.');
  });
});
