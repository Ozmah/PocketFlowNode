// tests/llm/gemini-provider.test.ts
import crypto from 'crypto';
import { GeminiProvider } from '../../src/llm/gemini-provider';
import { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } from '@google/generative-ai';
import { LlmGenerationOptions } from '../../src/llm/types';

// Mock @google/generative-ai
jest.mock('@google/generative-ai');
// Mock fs/promises for now to avoid file system operations in these basic tests
jest.mock('fs/promises', () => ({
  readFile: jest.fn().mockResolvedValue(JSON.stringify({})), // Default to empty cache
  writeFile: jest.fn().mockResolvedValue(undefined),
  appendFile: jest.fn().mockResolvedValue(undefined),
  mkdir: jest.fn().mockResolvedValue(undefined),
}));


const mockGenerateContent = jest.fn();
const mockGetGenerativeModel = jest.fn(() => ({
  generateContent: mockGenerateContent,
}));

describe('GeminiProvider', () => {
  let originalApiKey: string | undefined;
  const testPrompt = "Test Gemini prompt";
  const testResponseText = "Test Gemini response";

  beforeEach(() => {
    jest.clearAllMocks();
    originalApiKey = process.env.GEMINI_API_KEY;
    process.env.GEMINI_API_KEY = 'test-gemini-api-key';

    (GoogleGenerativeAI as jest.Mock).mockImplementation(() => ({
      getGenerativeModel: mockGetGenerativeModel,
    }));
    mockGenerateContent.mockResolvedValue({
      response: {
        text: () => testResponseText,
      },
    });
  });

  afterEach(() => {
    process.env.GEMINI_API_KEY = originalApiKey;
  });

  test('constructor should throw error if API key is not provided', () => {
    delete process.env.GEMINI_API_KEY;
    expect(() => new GeminiProvider({})).toThrow('Gemini API key is not provided');
  });

  test('constructor should initialize GoogleGenerativeAI with API key from config', () => {
    new GeminiProvider({ apiKey: 'config-api-key' });
    expect(GoogleGenerativeAI).toHaveBeenCalledWith('config-api-key');
  });

  test('constructor should initialize GoogleGenerativeAI with API key from env if not in config', () => {
    new GeminiProvider({});
    expect(GoogleGenerativeAI).toHaveBeenCalledWith('test-gemini-api-key');
  });

  test('generateContent should call Gemini API and return response text', async () => {
    const provider = new GeminiProvider({});
    const options: LlmGenerationOptions = { model: 'gemini-pro-test' };
    const response = await provider.generateContent(testPrompt, options);

    expect(response).toBe(testResponseText);
    expect(mockGetGenerativeModel).toHaveBeenCalledWith(expect.objectContaining({
      model: 'gemini-pro-test',
    }));
    expect(mockGenerateContent).toHaveBeenCalledWith(testPrompt);
  });
  
  test('generateContent should use default model if not specified in options or config', async () => {
    const provider = new GeminiProvider({ apiKey: 'test-key' }); // No modelName in config
    await provider.generateContent(testPrompt); // No model in options

    expect(mockGetGenerativeModel).toHaveBeenCalledWith(expect.objectContaining({
      model: 'gemini-pro', // Default model
    }));
  });
  
  test('generateContent should use model from config if not in options', async () => {
    const provider = new GeminiProvider({ apiKey: 'test-key', modelName: 'config-model' });
    await provider.generateContent(testPrompt);

    expect(mockGetGenerativeModel).toHaveBeenCalledWith(expect.objectContaining({
      model: 'config-model',
    }));
  });

  test('generateContent should handle API call failure', async () => {
    const provider = new GeminiProvider({});
    const apiError = new Error('Gemini API Error');
    mockGenerateContent.mockRejectedValueOnce(apiError);

    await expect(provider.generateContent(testPrompt)).rejects.toThrow('Gemini LLM API call failed: Gemini API Error');
  });
  
  test('generateContent should pass generation options to the model', async () => {
    const provider = new GeminiProvider({});
    const options: LlmGenerationOptions = {
      temperature: 0.5,
      maxTokens: 100,
      topP: 0.8,
      topK: 40,
    };
    await provider.generateContent(testPrompt, options);

    expect(mockGetGenerativeModel).toHaveBeenCalledWith(expect.objectContaining({
        generationConfig: {
            temperature: 0.5,
            maxOutputTokens: 100,
            topP: 0.8,
            topK: 40,
        }
    }));
  });

  // Caching and logging tests will be added later for GeminiProvider.
  // For now, we are mocking fs and not testing cache hits/misses.

  describe('GeminiProvider Caching', () => {
    const cachePrompt = "Cache test prompt";
    const cacheResponseText = "Cache test response";
    // A simple way to ensure options are part of hash: include them in the string to be hashed
    const cacheOptions: LlmGenerationOptions = { model: "gemini-cache-model", temperature: 0.1 };
    const cachePromptWithOptionsHash = crypto.createHash('sha256').update(cachePrompt + JSON.stringify(cacheOptions)).digest('hex');
    
    let mockReadFile: jest.Mock;
    let mockWriteFile: jest.Mock;
    let mockAppendFile: jest.Mock; // For logging
    let mockMkdir: jest.Mock;

    beforeEach(() => {
      // Specific mocks for fs/promises for caching tests
      mockReadFile = jest.fn();
      mockWriteFile = jest.fn();
      mockAppendFile = jest.fn(); // For logging, used by the provider
      mockMkdir = jest.fn().mockResolvedValue(undefined); // To mock fs.mkdir

      jest.mock('fs/promises', () => ({
        readFile: mockReadFile,
        writeFile: mockWriteFile,
        appendFile: mockAppendFile, // Ensure appendFile is mocked for logging
        mkdir: mockMkdir, // Mock mkdir
      }));

      // Reset generateContent mock for safety, though it's also in the outer beforeEach
      mockGenerateContent.mockResolvedValue({
        response: { text: () => cacheResponseText },
      });
    });

    test('cache miss: should call API, return response, and write to cache', async () => {
      mockReadFile.mockResolvedValueOnce(JSON.stringify({})); // Empty cache
      const provider = new GeminiProvider({ apiKey: 'test-key' });

      const response = await provider.generateContent(cachePrompt, { ...cacheOptions, useCache: true });

      expect(response).toBe(cacheResponseText);
      expect(mockGetGenerativeModel).toHaveBeenCalled();
      expect(mockGenerateContent).toHaveBeenCalledWith(cachePrompt);
      expect(mockWriteFile).toHaveBeenCalledWith(
        expect.stringContaining('llm_cache.json'), // Path to cache file
        JSON.stringify({ [cachePromptWithOptionsHash]: cacheResponseText }, null, 2),
        'utf-8'
      );
      expect(mockAppendFile).toHaveBeenCalledWith(expect.stringContaining('gemini_interactions.log'), expect.stringContaining(cacheResponseText));
    });

    test('cache hit: should return cached response and not call API', async () => {
      const cachedData = { [cachePromptWithOptionsHash]: "Cached response" };
      mockReadFile.mockResolvedValueOnce(JSON.stringify(cachedData));
      const provider = new GeminiProvider({ apiKey: 'test-key' });

      const response = await provider.generateContent(cachePrompt, { ...cacheOptions, useCache: true });

      expect(response).toBe("Cached response");
      expect(mockGetGenerativeModel).not.toHaveBeenCalled();
      expect(mockGenerateContent).not.toHaveBeenCalled();
      expect(mockWriteFile).not.toHaveBeenCalled();
      expect(mockAppendFile).toHaveBeenCalledWith(expect.stringContaining('gemini_interactions.log'), expect.stringContaining("[CACHE HIT] Cached response"));
    });

    test('no cache option: should call API and not read/write cache file (but still log)', async () => {
      const provider = new GeminiProvider({ apiKey: 'test-key' });
      await provider.generateContent(cachePrompt, { ...cacheOptions, useCache: false });

      expect(mockReadFile).not.toHaveBeenCalled();
      expect(mockWriteFile).not.toHaveBeenCalled();
      expect(mockGetGenerativeModel).toHaveBeenCalled(); // API was called
      expect(mockAppendFile).toHaveBeenCalledWith(expect.stringContaining('gemini_interactions.log'), expect.stringContaining(cacheResponseText));
    });
  });
});
