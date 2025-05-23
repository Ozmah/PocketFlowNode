import { ClaudeProvider } from '../../src/llm/claude-provider';
import { LlmOptions } from '../../src/llm/llm-provider';
import * as llmUtils from '../../src/utils/llm'; // To mock its functions
import Anthropic from '@anthropic-ai/sdk'; // Import to type mock and access Anthropic.APIError

// Mock '@anthropic-ai/sdk' module
const mockMessagesCreate = jest.fn();
const mockAnthropicInstance = {
  messages: {
    create: mockMessagesCreate,
  },
};

jest.mock('@anthropic-ai/sdk', () => {
  // This is the constructor mock
  const constructorMock = jest.fn().mockImplementation(() => mockAnthropicInstance);
  
  // Mocking specific error classes if needed for instanceof checks
  // @ts-ignore
  constructorMock.APIError = class APIError extends Error {
    status?: number;
    headers?: Record<string, string>;
    constructor(message: string, status?: number, headers?: Record<string, string>) {
      super(message);
      this.name = 'APIError'; // Important for error identification
      this.status = status;
      this.headers = headers;
    }
  };
  return constructorMock;
});


// Mock utility functions from src/utils/llm
jest.mock('../../src/utils/llm', () => ({
  loadCache: jest.fn(),
  saveCache: jest.fn(),
  logInteraction: jest.fn(),
  hashPrompt: jest.fn(),
}));

describe('ClaudeProvider', () => {
  const OLD_ENV = process.env;
  const MOCK_API_KEY = 'test-anthropic-api-key';
  const MOCK_PROMPT = 'Test prompt for Claude';
  const MOCK_RESPONSE_TEXT = 'Test response from Claude';
  const MOCK_PROMPT_HASH = 'claudehash789';

  beforeEach(() => {
    jest.resetModules(); // Reset modules to clear cache between tests
    process.env = { ...OLD_ENV }; // Make a copy
    
    // Clear all mock implementations and calls
    mockMessagesCreate.mockReset();
    (Anthropic as jest.Mock).mockClear(); // Clear the constructor mock
    
    (llmUtils.loadCache as jest.Mock).mockReset();
    (llmUtils.saveCache as jest.Mock).mockReset();
    (llmUtils.logInteraction as jest.Mock).mockReset();
    (llmUtils.hashPrompt as jest.Mock).mockReset();

    // Default mock implementations
    (llmUtils.hashPrompt as jest.Mock).mockReturnValue(MOCK_PROMPT_HASH);
    mockMessagesCreate.mockResolvedValue({
      content: [{ type: 'text', text: MOCK_RESPONSE_TEXT }],
    });
  });

  afterAll(() => {
    process.env = OLD_ENV; // Restore old environment
  });

  describe('Constructor', () => {
    test('should throw an error if ANTHROPIC_API_KEY is not set', () => {
      delete process.env.ANTHROPIC_API_KEY;
      expect(() => new ClaudeProvider()).toThrow('ANTHROPIC_API_KEY environment variable is not set.');
    });

    test('should not throw an error if ANTHROPIC_API_KEY is set', () => {
      process.env.ANTHROPIC_API_KEY = MOCK_API_KEY;
      expect(() => new ClaudeProvider()).not.toThrow();
      expect(Anthropic).toHaveBeenCalledWith({ apiKey: MOCK_API_KEY });
    });
  });

  describe('generate method', () => {
    beforeEach(() => {
      // Ensure API key is set for most generate tests
      process.env.ANTHROPIC_API_KEY = MOCK_API_KEY;
    });

    test('successful API call with no cache hit (useCache=true, cache empty)', async () => {
      (llmUtils.loadCache as jest.Mock).mockResolvedValue({}); // Cache miss

      const provider = new ClaudeProvider();
      const options: LlmOptions = { useCache: true };
      const response = await provider.generate(MOCK_PROMPT, options);

      expect(llmUtils.hashPrompt).toHaveBeenCalledWith(MOCK_PROMPT);
      expect(llmUtils.loadCache).toHaveBeenCalledTimes(2); // Called once for check, once before save
      expect(Anthropic).toHaveBeenCalledTimes(1); // Constructor called once
      expect(mockMessagesCreate).toHaveBeenCalledWith({
        messages: [{ role: "user", content: MOCK_PROMPT }],
        model: 'claude-instant-1.2', // Default model
        max_tokens: 2048, // Default max_tokens
      });
      expect(llmUtils.saveCache).toHaveBeenCalledWith({ [MOCK_PROMPT_HASH]: MOCK_RESPONSE_TEXT });
      expect(llmUtils.logInteraction).toHaveBeenCalledWith(MOCK_PROMPT, MOCK_RESPONSE_TEXT);
      expect(response).toBe(MOCK_RESPONSE_TEXT);
    });
    
    test('successful API call when useCache is false', async () => {
      const provider = new ClaudeProvider();
      const options: LlmOptions = { useCache: false };
      await provider.generate(MOCK_PROMPT, options);

      expect(llmUtils.hashPrompt).toHaveBeenCalledWith(MOCK_PROMPT);
      expect(llmUtils.loadCache).not.toHaveBeenCalled();
      expect(mockMessagesCreate).toHaveBeenCalledTimes(1);
      expect(llmUtils.saveCache).not.toHaveBeenCalled();
      expect(llmUtils.logInteraction).toHaveBeenCalledWith(MOCK_PROMPT, MOCK_RESPONSE_TEXT);
    });

    test('cache hit scenario (useCache=true)', async () => {
      (llmUtils.loadCache as jest.Mock).mockResolvedValue({ [MOCK_PROMPT_HASH]: MOCK_RESPONSE_TEXT });

      const provider = new ClaudeProvider();
      const options: LlmOptions = { useCache: true };
      const response = await provider.generate(MOCK_PROMPT, options);

      expect(llmUtils.hashPrompt).toHaveBeenCalledWith(MOCK_PROMPT);
      expect(llmUtils.loadCache).toHaveBeenCalledTimes(1);
      expect(mockMessagesCreate).not.toHaveBeenCalled();
      expect(llmUtils.saveCache).not.toHaveBeenCalled();
      expect(llmUtils.logInteraction).toHaveBeenCalledWith(MOCK_PROMPT, `[CACHE HIT] ${MOCK_RESPONSE_TEXT}`);
      expect(response).toBe(MOCK_RESPONSE_TEXT);
    });

    test('should use options.modelName when provided', async () => {
      const customModelName = 'claude-custom-model';
      (llmUtils.loadCache as jest.Mock).mockResolvedValue({}); // Cache miss

      const provider = new ClaudeProvider();
      const options: LlmOptions = { useCache: true, modelName: customModelName };
      await provider.generate(MOCK_PROMPT, options);

      expect(mockMessagesCreate).toHaveBeenCalledWith(expect.objectContaining({ model: customModelName }));
    });
    
    test('should use default modelName if options.modelName is not provided', async () => {
      (llmUtils.loadCache as jest.Mock).mockResolvedValue({}); // Cache miss
      process.env.ANTHROPIC_MODEL = 'env-claude-model'; // Test environment variable for default

      const provider = new ClaudeProvider(); // Re-instantiate to pick up env var
      const options: LlmOptions = { useCache: true };
      await provider.generate(MOCK_PROMPT, options);
      
      expect(mockMessagesCreate).toHaveBeenCalledWith(expect.objectContaining({ model: 'env-claude-model' }));
      
      delete process.env.ANTHROPIC_MODEL; // clean up
    });

    test('should use "claude-instant-1.2" if options.modelName and process.env.ANTHROPIC_MODEL are not provided', async () => {
        (llmUtils.loadCache as jest.Mock).mockResolvedValue({}); // Cache miss
        delete process.env.ANTHROPIC_MODEL; // Ensure env var is not set
  
        const provider = new ClaudeProvider(); // Re-instantiate
        const options: LlmOptions = { useCache: true };
        await provider.generate(MOCK_PROMPT, options);
        
        expect(mockMessagesCreate).toHaveBeenCalledWith(expect.objectContaining({ model: 'claude-instant-1.2' }));
    });
    
    test('API error handling (Anthropic.APIError)', async () => {
      const errorMessage = 'Anthropic API Error';
      const status = 401;
      const headers = { 'anthropic-request-id': 'req_123' };
      // Use the mocked Anthropic.APIError class
      const apiError = new (Anthropic as any).APIError(errorMessage, status, headers);
      
      mockMessagesCreate.mockRejectedValue(apiError);
      (llmUtils.loadCache as jest.Mock).mockResolvedValue({}); // Cache miss

      const provider = new ClaudeProvider();
      const options: LlmOptions = { useCache: true };

      await expect(provider.generate(MOCK_PROMPT, options)).rejects.toThrow(
        expect.stringContaining(`Claude LLM API call failed (Model: claude-instant-1.2): ${status} APIError - ${errorMessage} (Request ID: req_123)`)
      );
      
      expect(llmUtils.logInteraction).toHaveBeenCalledWith(MOCK_PROMPT, expect.any(Error));
      const loggedError = (llmUtils.logInteraction as jest.Mock).mock.calls[0][1] as Error;
      expect(loggedError.message).toContain(errorMessage);
      expect(loggedError.message).toContain('Request ID: req_123');
    });

    test('API error handling (generic Error)', async () => {
        const genericErrorMessage = 'Network Error';
        mockMessagesCreate.mockRejectedValue(new Error(genericErrorMessage));
        (llmUtils.loadCache as jest.Mock).mockResolvedValue({});
  
        const provider = new ClaudeProvider();
        await expect(provider.generate(MOCK_PROMPT, { useCache: true })).rejects.toThrow(
            expect.stringContaining(`Claude LLM API call failed (Model: claude-instant-1.2): ${genericErrorMessage}`)
        );
        
        expect(llmUtils.logInteraction).toHaveBeenCalledWith(MOCK_PROMPT, expect.any(Error));
        const loggedError = (llmUtils.logInteraction as jest.Mock).mock.calls[0][1] as Error;
        expect(loggedError.message).toContain(genericErrorMessage);
    });

    test('should throw error if API response is invalid (no content)', async () => {
      mockMessagesCreate.mockResolvedValue({ content: [] }); // Invalid: empty content
      (llmUtils.loadCache as jest.Mock).mockResolvedValue({});

      const provider = new ClaudeProvider();
      await expect(provider.generate(MOCK_PROMPT, { useCache: true })).rejects.toThrow("Invalid or empty response structure from Anthropic API.");
    });

    test('should throw error if API response is invalid (wrong content type)', async () => {
      mockMessagesCreate.mockResolvedValue({ content: [{ type: 'image', source: {} }] });
      (llmUtils.loadCache as jest.Mock).mockResolvedValue({});
      
      const provider = new ClaudeProvider();
      await expect(provider.generate(MOCK_PROMPT, { useCache: true })).rejects.toThrow("Invalid or empty response structure from Anthropic API.");
    });
  });
});
