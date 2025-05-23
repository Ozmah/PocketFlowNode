import { GeminiProvider } from '../../src/llm/gemini-provider';
import { LlmOptions } from '../../src/llm/llm-provider';
import * as llmUtils from '../../src/utils/llm'; // To mock its functions
import { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } from '@google/generative-ai';

// Mock @google/generative-ai
const mockGenerateContent = jest.fn();
const mockGetGenerativeModel = jest.fn(() => ({
  generateContent: mockGenerateContent,
}));

jest.mock('@google/generative-ai', () => ({
  GoogleGenerativeAI: jest.fn(() => ({
    getGenerativeModel: mockGetGenerativeModel,
  })),
  HarmCategory: { // Include actual enum values if they are used directly in provider
    HARM_CATEGORY_HARASSMENT: 'HARM_CATEGORY_HARASSMENT',
    HARM_CATEGORY_HATE_SPEECH: 'HARM_CATEGORY_HATE_SPEECH',
    HARM_CATEGORY_SEXUALLY_EXPLICIT: 'HARM_CATEGORY_SEXUALLY_EXPLICIT',
    HARM_CATEGORY_DANGEROUS_CONTENT: 'HARM_CATEGORY_DANGEROUS_CONTENT',
  },
  HarmBlockThreshold: {
    BLOCK_NONE: 'BLOCK_NONE',
  },
}));

// Mock utility functions from src/utils/llm
jest.mock('../../src/utils/llm', () => ({
  loadCache: jest.fn(),
  saveCache: jest.fn(),
  logInteraction: jest.fn(),
  hashPrompt: jest.fn(),
  // ensureCacheDirExists is not directly called by provider, so not explicitly mocked here
}));

describe('GeminiProvider', () => {
  const OLD_ENV = process.env;
  const MOCK_API_KEY = 'test-gemini-api-key';
  const MOCK_PROMPT = 'Test prompt';
  const MOCK_RESPONSE_TEXT = 'Test response';
  const MOCK_PROMPT_HASH = 'testhash123';

  beforeEach(() => {
    jest.resetModules(); // Reset modules to clear cache between tests, especially for process.env
    process.env = { ...OLD_ENV }; // Make a copy
    
    // Clear all mock implementations and calls
    mockGenerateContent.mockReset();
    mockGetGenerativeModel.mockReset().mockReturnValue({ generateContent: mockGenerateContent });
    (GoogleGenerativeAI as jest.Mock).mockClear();
    
    (llmUtils.loadCache as jest.Mock).mockReset();
    (llmUtils.saveCache as jest.Mock).mockReset();
    (llmUtils.logInteraction as jest.Mock).mockReset();
    (llmUtils.hashPrompt as jest.Mock).mockReset();

    // Default mock implementations
    (llmUtils.hashPrompt as jest.Mock).mockReturnValue(MOCK_PROMPT_HASH);
    mockGenerateContent.mockResolvedValue({
      response: { text: () => MOCK_RESPONSE_TEXT },
    });
  });

  afterAll(() => {
    process.env = OLD_ENV; // Restore old environment
  });

  describe('Constructor', () => {
    test('should throw an error if GEMINI_API_KEY is not set', () => {
      delete process.env.GEMINI_API_KEY;
      expect(() => new GeminiProvider()).toThrow('GEMINI_API_KEY environment variable is not set.');
    });

    test('should not throw an error if GEMINI_API_KEY is set', () => {
      process.env.GEMINI_API_KEY = MOCK_API_KEY;
      expect(() => new GeminiProvider()).not.toThrow();
    });
  });

  describe('generate method', () => {
    beforeEach(() => {
      // Ensure API key is set for most generate tests
      process.env.GEMINI_API_KEY = MOCK_API_KEY;
    });

    test('successful API call with no cache hit (useCache=true, cache empty)', async () => {
      (llmUtils.loadCache as jest.Mock).mockResolvedValue({}); // Cache miss

      const provider = new GeminiProvider();
      const options: LlmOptions = { useCache: true };
      const response = await provider.generate(MOCK_PROMPT, options);

      expect(llmUtils.hashPrompt).toHaveBeenCalledWith(MOCK_PROMPT);
      expect(llmUtils.loadCache).toHaveBeenCalledTimes(2); // Called once for check, once before save
      expect(GoogleGenerativeAI).toHaveBeenCalledWith(MOCK_API_KEY);
      expect(mockGetGenerativeModel).toHaveBeenCalledWith(expect.objectContaining({ model: 'gemini-pro' })); // Default model
      expect(mockGenerateContent).toHaveBeenCalledWith(MOCK_PROMPT);
      expect(llmUtils.saveCache).toHaveBeenCalledWith({ [MOCK_PROMPT_HASH]: MOCK_RESPONSE_TEXT });
      expect(llmUtils.logInteraction).toHaveBeenCalledWith(MOCK_PROMPT, MOCK_RESPONSE_TEXT);
      expect(response).toBe(MOCK_RESPONSE_TEXT);
    });
    
    test('successful API call when useCache is false', async () => {
      const provider = new GeminiProvider();
      const options: LlmOptions = { useCache: false };
      await provider.generate(MOCK_PROMPT, options);

      expect(llmUtils.hashPrompt).toHaveBeenCalledWith(MOCK_PROMPT);
      expect(llmUtils.loadCache).not.toHaveBeenCalled(); // Should not be called if useCache is false
      expect(GoogleGenerativeAI).toHaveBeenCalledWith(MOCK_API_KEY);
      expect(mockGetGenerativeModel).toHaveBeenCalledWith(expect.objectContaining({ model: 'gemini-pro' }));
      expect(mockGenerateContent).toHaveBeenCalledWith(MOCK_PROMPT);
      expect(llmUtils.saveCache).not.toHaveBeenCalled(); // Should not save if useCache is false
      expect(llmUtils.logInteraction).toHaveBeenCalledWith(MOCK_PROMPT, MOCK_RESPONSE_TEXT);
    });

    test('cache hit scenario (useCache=true)', async () => {
      (llmUtils.loadCache as jest.Mock).mockResolvedValue({ [MOCK_PROMPT_HASH]: MOCK_RESPONSE_TEXT });

      const provider = new GeminiProvider();
      const options: LlmOptions = { useCache: true };
      const response = await provider.generate(MOCK_PROMPT, options);

      expect(llmUtils.hashPrompt).toHaveBeenCalledWith(MOCK_PROMPT);
      expect(llmUtils.loadCache).toHaveBeenCalledTimes(1);
      expect(GoogleGenerativeAI).not.toHaveBeenCalled();
      expect(mockGetGenerativeModel).not.toHaveBeenCalled();
      expect(mockGenerateContent).not.toHaveBeenCalled();
      expect(llmUtils.saveCache).not.toHaveBeenCalled();
      expect(llmUtils.logInteraction).toHaveBeenCalledWith(MOCK_PROMPT, `[CACHE HIT] ${MOCK_RESPONSE_TEXT}`);
      expect(response).toBe(MOCK_RESPONSE_TEXT);
    });

    test('should use options.modelName when provided', async () => {
      const customModelName = 'gemini-custom-model';
      (llmUtils.loadCache as jest.Mock).mockResolvedValue({}); // Cache miss

      const provider = new GeminiProvider();
      const options: LlmOptions = { useCache: true, modelName: customModelName };
      await provider.generate(MOCK_PROMPT, options);

      expect(mockGetGenerativeModel).toHaveBeenCalledWith(expect.objectContaining({ model: customModelName }));
    });
    
    test('should use default modelName if options.modelName is not provided', async () => {
      (llmUtils.loadCache as jest.Mock).mockResolvedValue({}); // Cache miss
       process.env.GEMINI_MODEL = 'env-gemini-model'; // Test environment variable for default

      const provider = new GeminiProvider(); // Re-instantiate to pick up env var
      const options: LlmOptions = { useCache: true };
      await provider.generate(MOCK_PROMPT, options);
      
      // Provider default is process.env.GEMINI_MODEL || "gemini-pro"
      expect(mockGetGenerativeModel).toHaveBeenCalledWith(expect.objectContaining({ model: 'env-gemini-model' }));
      
      delete process.env.GEMINI_MODEL; // clean up for next tests
    });
    
    test('should use "gemini-pro" if options.modelName and process.env.GEMINI_MODEL are not provided', async () => {
        (llmUtils.loadCache as jest.Mock).mockResolvedValue({}); // Cache miss
        delete process.env.GEMINI_MODEL; // Ensure env var is not set
  
        const provider = new GeminiProvider(); // Re-instantiate
        const options: LlmOptions = { useCache: true };
        await provider.generate(MOCK_PROMPT, options);
        
        expect(mockGetGenerativeModel).toHaveBeenCalledWith(expect.objectContaining({ model: 'gemini-pro' }));
      });

    test('API error handling', async () => {
      const errorMessage = 'Gemini API Error';
      mockGenerateContent.mockRejectedValue(new Error(errorMessage));
      (llmUtils.loadCache as jest.Mock).mockResolvedValue({}); // Cache miss

      const provider = new GeminiProvider();
      const options: LlmOptions = { useCache: true };

      await expect(provider.generate(MOCK_PROMPT, options)).rejects.toThrow(expect.stringContaining('Gemini LLM API call failed'));
      
      expect(llmUtils.logInteraction).toHaveBeenCalledWith(MOCK_PROMPT, expect.any(Error));
      const loggedError = (llmUtils.logInteraction as jest.Mock).mock.calls[0][1] as Error;
      expect(loggedError.message).toContain('Gemini LLM API call failed');
      expect(loggedError.message).toContain(errorMessage); // Original error should be part of the new error
    });

    test('API error handling with error details', async () => {
        const errorDetails = 'Specific error details from API';
        const apiError = new Error('Gemini API Error');
        // @ts-ignore // Simulate Google AI SDK error structure
        apiError.details = errorDetails; 
        mockGenerateContent.mockRejectedValue(apiError);
        (llmUtils.loadCache as jest.Mock).mockResolvedValue({});
  
        const provider = new GeminiProvider();
        await expect(provider.generate(MOCK_PROMPT, { useCache: true })).rejects.toThrow(expect.stringContaining(errorDetails));
        
        expect(llmUtils.logInteraction).toHaveBeenCalledWith(MOCK_PROMPT, expect.any(Error));
        const loggedError = (llmUtils.logInteraction as jest.Mock).mock.calls[0][1] as Error;
        expect(loggedError.message).toContain(errorDetails);
      });
  });
});
