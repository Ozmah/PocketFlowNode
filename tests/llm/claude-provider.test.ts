// tests/llm/claude-provider.test.ts
import { ClaudeProvider } from '../../src/llm/claude-provider';
import { LlmGenerationOptions } from '../../src/llm/types';

// Mock global fetch
const mockFetch = jest.fn();
global.fetch = mockFetch as any;

describe('ClaudeProvider', () => {
  let originalApiKey: string | undefined;
  const testPrompt = "Test Claude prompt";
  const testResponseText = "Test Claude response";

  beforeEach(() => {
    jest.clearAllMocks();
    originalApiKey = process.env.CLAUDE_API_KEY;
    process.env.CLAUDE_API_KEY = 'test-claude-api-key';

    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ completion: testResponseText }), // Simplified Claude response
      text: async () => JSON.stringify({ completion: testResponseText })
    });
  });

  afterEach(() => {
    process.env.CLAUDE_API_KEY = originalApiKey;
  });

  test('constructor should throw error if API key is not provided', () => {
    delete process.env.CLAUDE_API_KEY;
    expect(() => new ClaudeProvider({ apiKey: '' })).toThrow('Claude API key is not provided');
  });

  test('generateContent should call Claude API and return response text', async () => {
    const provider = new ClaudeProvider({ apiKey: 'config-claude-key' });
    const options: LlmGenerationOptions = { model: 'claude-test-model', temperature: 0.6 };
    const response = await provider.generateContent(testPrompt, options);

    expect(response).toBe(testResponseText);
    expect(mockFetch).toHaveBeenCalledWith(
      'https://api.anthropic.com/v1/messages', // Or the correct endpoint used in provider
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'x-api-key': 'config-claude-key',
          'anthropic-version': expect.any(String)
        }),
        body: JSON.stringify(expect.objectContaining({
          prompt: expect.stringContaining(testPrompt),
          model: 'claude-test-model',
          temperature: 0.6
        })),
      })
    );
  });
  
  test('generateContent should use default model if not specified', async () => {
    const provider = new ClaudeProvider({ apiKey: 'test-key' });
    await provider.generateContent(testPrompt);
    expect(mockFetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        body: JSON.stringify(expect.objectContaining({
          model: 'claude-2', // Default model in provider
        })),
      })
    );
  });

  test('generateContent should handle API call failure (response not ok)', async () => {
    const provider = new ClaudeProvider({ apiKey: 'test-key' });
    const errorResponse = { status: 500, message: "Internal Server Error" };
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: errorResponse.status,
      text: async () => JSON.stringify(errorResponse), // Simulate error response body
      json: async () => errorResponse 
    });

    await expect(provider.generateContent(testPrompt))
      .rejects.toThrow(`Claude API request failed with status ${errorResponse.status}`);
  });
  
  test('generateContent should handle API call failure (network error)', async () => {
    const provider = new ClaudeProvider({ apiKey: 'test-key' });
    const networkError = new Error('Network failure');
    mockFetch.mockRejectedValueOnce(networkError);

    await expect(provider.generateContent(testPrompt))
      .rejects.toThrow(`Claude LLM API call failed (Model: claude-2): Network failure`);
  });

  test('generateContent should correctly parse different Claude response structures', async () => {
    const provider = new ClaudeProvider({ apiKey: 'test-key' });
    // Test structure { completion: "text" } - already default in beforeEach
    let response = await provider.generateContent(testPrompt);
    expect(response).toBe(testResponseText);

    // Test structure { content: [{ type: "text", text: "text" }] }
    const v2ResponseText = "Claude API v2 response";
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ content: [{ type: 'text', text: v2ResponseText }] }),
      text: async () => JSON.stringify({ content: [{ type: 'text', text: v2ResponseText }] })
    });
    response = await provider.generateContent(testPrompt);
    expect(response).toBe(v2ResponseText);
    
    // Test structure where completion is missing or not a string
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ some_other_field: "data" }),
      text: async () => JSON.stringify({ some_other_field: "data" })
    });
    await expect(provider.generateContent(testPrompt))
      .rejects.toThrow('Failed to extract completion text from Claude response.');
  });
});
