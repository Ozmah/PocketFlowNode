import { ChatGptProvider } from '../../src/llm/chatgpt-provider';
import { LlmOptions } from '../../src/llm/llm-provider';
import * as llmUtils from '../../src/utils/llm'; // To mock its functions
import OpenAI from 'openai'; // Import to type mock

// Mock 'openai' module
const mockCreateChatCompletion = jest.fn();
const mockOpenAIInstance = {
  chat: {
    completions: {
      create: mockCreateChatCompletion,
    },
  },
};

jest.mock('openai', () => {
  // This is the constructor mock
  return jest.fn().mockImplementation(() => mockOpenAIInstance);
});

// Mock utility functions from src/utils/llm
jest.mock('../../src/utils/llm', () => ({
  loadCache: jest.fn(),
  saveCache: jest.fn(),
  logInteraction: jest.fn(),
  hashPrompt: jest.fn(),
}));

describe('ChatGptProvider', () => {
  const OLD_ENV = process.env;
  const MOCK_API_KEY = 'test-openai-api-key';
  const MOCK_PROMPT = 'Test prompt for ChatGPT';
  const MOCK_RESPONSE_TEXT = 'Test response from ChatGPT';
  const MOCK_PROMPT_HASH = 'chatgpthash456';

  beforeEach(() => {
    jest.resetModules(); // Reset modules to clear cache between tests
    process.env = { ...OLD_ENV }; // Make a copy
    
    // Clear all mock implementations and calls
    mockCreateChatCompletion.mockReset();
    (OpenAI as jest.Mock).mockClear(); // Clear the constructor mock
    
    (llmUtils.loadCache as jest.Mock).mockReset();
    (llmUtils.saveCache as jest.Mock).mockReset();
    (llmUtils.logInteraction as jest.Mock).mockReset();
    (llmUtils.hashPrompt as jest.Mock).mockReset();

    // Default mock implementations
    (llmUtils.hashPrompt as jest.Mock).mockReturnValue(MOCK_PROMPT_HASH);
    mockCreateChatCompletion.mockResolvedValue({
      choices: [{ message: { content: MOCK_RESPONSE_TEXT } }],
    });
  });

  afterAll(() => {
    process.env = OLD_ENV; // Restore old environment
  });

  describe('Constructor', () => {
    test('should throw an error if OPENAI_API_KEY is not set', () => {
      delete process.env.OPENAI_API_KEY;
      expect(() => new ChatGptProvider()).toThrow('OPENAI_API_KEY environment variable is not set.');
    });

    test('should not throw an error if OPENAI_API_KEY is set', () => {
      process.env.OPENAI_API_KEY = MOCK_API_KEY;
      expect(() => new ChatGptProvider()).not.toThrow();
      expect(OpenAI).toHaveBeenCalledWith({ apiKey: MOCK_API_KEY });
    });
  });

  describe('generate method', () => {
    beforeEach(() => {
      // Ensure API key is set for most generate tests
      process.env.OPENAI_API_KEY = MOCK_API_KEY;
    });

    test('successful API call with no cache hit (useCache=true, cache empty)', async () => {
      (llmUtils.loadCache as jest.Mock).mockResolvedValue({}); // Cache miss

      const provider = new ChatGptProvider();
      const options: LlmOptions = { useCache: true };
      const response = await provider.generate(MOCK_PROMPT, options);

      expect(llmUtils.hashPrompt).toHaveBeenCalledWith(MOCK_PROMPT);
      expect(llmUtils.loadCache).toHaveBeenCalledTimes(2); // Called once for check, once before save
      expect(OpenAI).toHaveBeenCalledTimes(1); // Constructor called once
      expect(mockCreateChatCompletion).toHaveBeenCalledWith({
        messages: [{ role: "user", content: MOCK_PROMPT }],
        model: 'gpt-3.5-turbo', // Default model
      });
      expect(llmUtils.saveCache).toHaveBeenCalledWith({ [MOCK_PROMPT_HASH]: MOCK_RESPONSE_TEXT });
      expect(llmUtils.logInteraction).toHaveBeenCalledWith(MOCK_PROMPT, MOCK_RESPONSE_TEXT);
      expect(response).toBe(MOCK_RESPONSE_TEXT);
    });
    
    test('successful API call when useCache is false', async () => {
      const provider = new ChatGptProvider();
      const options: LlmOptions = { useCache: false };
      await provider.generate(MOCK_PROMPT, options);

      expect(llmUtils.hashPrompt).toHaveBeenCalledWith(MOCK_PROMPT);
      expect(llmUtils.loadCache).not.toHaveBeenCalled();
      expect(mockCreateChatCompletion).toHaveBeenCalledTimes(1);
      expect(llmUtils.saveCache).not.toHaveBeenCalled();
      expect(llmUtils.logInteraction).toHaveBeenCalledWith(MOCK_PROMPT, MOCK_RESPONSE_TEXT);
    });

    test('cache hit scenario (useCache=true)', async () => {
      (llmUtils.loadCache as jest.Mock).mockResolvedValue({ [MOCK_PROMPT_HASH]: MOCK_RESPONSE_TEXT });

      const provider = new ChatGptProvider();
      const options: LlmOptions = { useCache: true };
      const response = await provider.generate(MOCK_PROMPT, options);

      expect(llmUtils.hashPrompt).toHaveBeenCalledWith(MOCK_PROMPT);
      expect(llmUtils.loadCache).toHaveBeenCalledTimes(1);
      expect(mockCreateChatCompletion).not.toHaveBeenCalled();
      expect(llmUtils.saveCache).not.toHaveBeenCalled();
      expect(llmUtils.logInteraction).toHaveBeenCalledWith(MOCK_PROMPT, `[CACHE HIT] ${MOCK_RESPONSE_TEXT}`);
      expect(response).toBe(MOCK_RESPONSE_TEXT);
    });

    test('should use options.modelName when provided', async () => {
      const customModelName = 'gpt-4-custom';
      (llmUtils.loadCache as jest.Mock).mockResolvedValue({}); // Cache miss

      const provider = new ChatGptProvider();
      const options: LlmOptions = { useCache: true, modelName: customModelName };
      await provider.generate(MOCK_PROMPT, options);

      expect(mockCreateChatCompletion).toHaveBeenCalledWith(expect.objectContaining({ model: customModelName }));
    });
    
    test('should use default modelName if options.modelName is not provided', async () => {
      (llmUtils.loadCache as jest.Mock).mockResolvedValue({}); // Cache miss
      process.env.OPENAI_MODEL = 'env-openai-model'; // Test environment variable for default

      const provider = new ChatGptProvider(); // Re-instantiate to pick up env var
      const options: LlmOptions = { useCache: true };
      await provider.generate(MOCK_PROMPT, options);
      
      expect(mockCreateChatCompletion).toHaveBeenCalledWith(expect.objectContaining({ model: 'env-openai-model' }));
      
      delete process.env.OPENAI_MODEL; // clean up
    });

    test('should use "gpt-3.5-turbo" if options.modelName and process.env.OPENAI_MODEL are not provided', async () => {
        (llmUtils.loadCache as jest.Mock).mockResolvedValue({}); // Cache miss
        delete process.env.OPENAI_MODEL; // Ensure env var is not set
  
        const provider = new ChatGptProvider(); // Re-instantiate
        const options: LlmOptions = { useCache: true };
        await provider.generate(MOCK_PROMPT, options);
        
        expect(mockCreateChatCompletion).toHaveBeenCalledWith(expect.objectContaining({ model: 'gpt-3.5-turbo' }));
    });
    
    test('API error handling', async () => {
      const errorMessage = 'OpenAI API Error';
      mockCreateChatCompletion.mockRejectedValue(new Error(errorMessage));
      (llmUtils.loadCache as jest.Mock).mockResolvedValue({}); // Cache miss

      const provider = new ChatGptProvider();
      const options: LlmOptions = { useCache: true };

      await expect(provider.generate(MOCK_PROMPT, options)).rejects.toThrow(expect.stringContaining('ChatGPT LLM API call failed'));
      
      expect(llmUtils.logInteraction).toHaveBeenCalledWith(MOCK_PROMPT, expect.any(Error));
      const loggedError = (llmUtils.logInteraction as jest.Mock).mock.calls[0][1] as Error;
      expect(loggedError.message).toContain('ChatGPT LLM API call failed');
      expect(loggedError.message).toContain(errorMessage);
    });

    test('API error handling with OpenAI specific error structure', async () => {
        const openAIErrorMessage = 'Invalid API key.';
        const apiError = { // Simulate OpenAI error structure
          response: { 
            data: { 
              error: { message: openAIErrorMessage } 
            } 
          }
        };
        mockCreateChatCompletion.mockRejectedValue(apiError);
        (llmUtils.loadCache as jest.Mock).mockResolvedValue({});
  
        const provider = new ChatGptProvider();
        await expect(provider.generate(MOCK_PROMPT, { useCache: true })).rejects.toThrow(expect.stringContaining(openAIErrorMessage));
        
        expect(llmUtils.logInteraction).toHaveBeenCalledWith(MOCK_PROMPT, expect.any(Error));
        const loggedError = (llmUtils.logInteraction as jest.Mock).mock.calls[0][1] as Error;
        expect(loggedError.message).toContain(openAIErrorMessage);
    });

    test('should throw error if API response is invalid (no choices)', async () => {
      mockCreateChatCompletion.mockResolvedValue({ choices: [] }); // Invalid: empty choices
      (llmUtils.loadCache as jest.Mock).mockResolvedValue({});

      const provider = new ChatGptProvider();
      await expect(provider.generate(MOCK_PROMPT, { useCache: true })).rejects.toThrow("Invalid response structure from OpenAI API.");
    });

    test('should throw error if API response is invalid (null content)', async () => {
      mockCreateChatCompletion.mockResolvedValue({ choices: [{ message: { content: null } }] });
      (llmUtils.loadCache as jest.Mock).mockResolvedValue({});
      
      const provider = new ChatGptProvider();
      await expect(provider.generate(MOCK_PROMPT, { useCache: true })).rejects.toThrow("Received null or undefined content from OpenAI API.");
    });
  });
});
