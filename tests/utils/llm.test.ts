import { callLlm, CallLlmArgs, hashPrompt, loadCache, saveCache, logInteraction, ensureCacheDirExists } from '../../src/utils/llm';
import { getLlmProvider } from '../../src/llm/llm-factory'; // Actual path to the factory
import { LlmProvider } from '../../src/llm/llm-provider'; // For typing the mock
import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto'; // Keep for hashPrompt tests if any, or remove if no other tests use it.

// Mock the LLM factory
jest.mock('../../src/llm/llm-factory', () => ({
  getLlmProvider: jest.fn(),
}));

// Mock fs/promises for other utility functions if they are tested here
jest.mock('fs/promises');


const CACHE_DIR = path.join(process.cwd(), '.cache');
const LLM_CACHE_FILE = path.join(CACHE_DIR, 'llm_cache.json');
const LLM_LOG_FILE = path.join(CACHE_DIR, 'llm_interactions.log');


describe('callLlm refactored', () => {
  const mockGenerate = jest.fn();
  const mockProvider: LlmProvider = {
    generate: mockGenerate,
  };
  const testPrompt = 'Test prompt';
  const testResponse = 'Test LLM response from provider';

  beforeEach(() => {
    jest.clearAllMocks();
    (getLlmProvider as jest.Mock).mockReturnValue(mockProvider); // Default mock for getLlmProvider
    mockGenerate.mockResolvedValue(testResponse); // Default mock for provider.generate
  });

  test('should call getLlmProvider with default provider "gemini" if none is specified', async () => {
    const options: CallLlmArgs = { useCache: true };
    await callLlm(testPrompt, options);
    expect(getLlmProvider).toHaveBeenCalledWith(undefined); // Factory handles default to 'gemini'
  });

  test('should call getLlmProvider with the specified providerName', async () => {
    const providerName = 'chatgpt';
    const options: CallLlmArgs = { providerName, useCache: true };
    await callLlm(testPrompt, options);
    expect(getLlmProvider).toHaveBeenCalledWith(providerName);
  });

  test('should call provider.generate with the prompt and options', async () => {
    const options: CallLlmArgs = { useCache: true, modelName: 'test-model' };
    await callLlm(testPrompt, options);
    expect(mockGenerate).toHaveBeenCalledWith(testPrompt, options);
  });

  test('should return the result from provider.generate', async () => {
    const result = await callLlm(testPrompt, {});
    expect(result).toBe(testResponse);
  });

  test('should re-throw error if getLlmProvider throws an error', async () => {
    const factoryError = new Error('Unknown provider');
    (getLlmProvider as jest.Mock).mockImplementation(() => {
      throw factoryError;
    });
    await expect(callLlm(testPrompt, {})).rejects.toThrow(factoryError);
    // Check console.error for the additional logging in callLlm's catch block
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining(factoryError.message), expect.any(String));
  });

  test('should re-throw error if provider.generate throws an error', async () => {
    const providerError = new Error('Provider generation failed');
    mockGenerate.mockRejectedValue(providerError);
    await expect(callLlm(testPrompt, {})).rejects.toThrow(providerError);
    // Check console.error for the additional logging in callLlm's catch block
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining(providerError.message), expect.any(String));
  });
  
  // Test for the console.error logging within callLlm's catch block
  let consoleErrorSpy: jest.SpyInstance;

  beforeAll(() => {
    // Spy on console.error before all tests in this suite
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterAll(() => {
    // Restore console.error after all tests in this suite
    consoleErrorSpy.mockRestore();
  });
});

// --- Tests for other utility functions from llm.ts can remain below if they exist ---
// For example, if hashPrompt, loadCache, saveCache were tested directly.
// The provided initial file only had tests for the old callLlm.
// Adding example tests for other utils for completeness based on their exports.

describe('Utility Functions from llm.ts', () => {
  describe('hashPrompt', () => {
    test('should return a consistent SHA256 hash', () => {
      const prompt1 = "Hello World";
      const prompt2 = "Hello World";
      const prompt3 = "Hello World!";
      
      expect(hashPrompt(prompt1)).toBe(crypto.createHash('sha256').update(prompt1).digest('hex'));
      expect(hashPrompt(prompt1)).toEqual(hashPrompt(prompt2));
      expect(hashPrompt(prompt1)).not.toEqual(hashPrompt(prompt3));
    });
  });

  describe('ensureCacheDirExists', () => {
    beforeEach(() => {
      (fs.mkdir as jest.Mock).mockClear();
    });

    test('should call fs.mkdir with recursive true', async () => {
      await ensureCacheDirExists();
      expect(fs.mkdir).toHaveBeenCalledWith(CACHE_DIR, { recursive: true });
    });

    test('should not warn if fs.mkdir throws EEXIST error', async () => {
      const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
      const eexistError = new Error("EEXIST: file already exists, mkdir '/app/.cache'");
      // @ts-ignore
      eexistError.code = 'EEXIST';
      (fs.mkdir as jest.Mock).mockRejectedValueOnce(eexistError);
      
      await ensureCacheDirExists();
      expect(fs.mkdir).toHaveBeenCalledTimes(1);
      expect(consoleWarnSpy).not.toHaveBeenCalled();
      consoleWarnSpy.mockRestore();
    });

    test('should warn if fs.mkdir throws other error', async () => {
      const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
      const otherError = new Error("Some other error");
      (fs.mkdir as jest.Mock).mockRejectedValueOnce(otherError);
      
      await ensureCacheDirExists();
      expect(fs.mkdir).toHaveBeenCalledTimes(1);
      expect(consoleWarnSpy).toHaveBeenCalledWith(`Could not create cache directory ${CACHE_DIR}:`, otherError);
      consoleWarnSpy.mockRestore();
    });
  });

  describe('loadCache', () => {
    beforeEach(() => {
      (fs.readFile as jest.Mock).mockClear();
      (fs.mkdir as jest.Mock).mockClear(); // ensureCacheDirExists calls mkdir
    });

    test('should call ensureCacheDirExists then try to read cache file', async () => {
      (fs.readFile as jest.Mock).mockResolvedValueOnce(JSON.stringify({ test: "data" }));
      const cache = await loadCache();
      expect(fs.mkdir).toHaveBeenCalledWith(CACHE_DIR, { recursive: true }); // From ensureCacheDirExists
      expect(fs.readFile).toHaveBeenCalledWith(LLM_CACHE_FILE, 'utf-8');
      expect(cache).toEqual({ test: "data" });
    });

    test('should return empty object if cache file does not exist (ENOENT)', async () => {
      const enoentError = new Error("ENOENT: no such file or directory");
      // @ts-ignore
      enoentError.code = 'ENOENT';
      (fs.readFile as jest.Mock).mockRejectedValueOnce(enoentError);
      const cache = await loadCache();
      expect(cache).toEqual({});
    });

    test('should return empty object and warn on other read errors', async () => {
      const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
      const otherError = new Error("Cache read permission denied");
      (fs.readFile as jest.Mock).mockRejectedValueOnce(otherError);
      
      const cache = await loadCache();
      expect(cache).toEqual({});
      expect(consoleWarnSpy).toHaveBeenCalledWith('Error loading LLM cache:', otherError);
      consoleWarnSpy.mockRestore();
    });
  });

  describe('saveCache', () => {
     beforeEach(() => {
      (fs.writeFile as jest.Mock).mockClear();
      (fs.mkdir as jest.Mock).mockClear(); // ensureCacheDirExists calls mkdir
    });
    const testCacheData = { prompt123: "response123" };

    test('should call ensureCacheDirExists then try to write cache file', async () => {
      await saveCache(testCacheData);
      expect(fs.mkdir).toHaveBeenCalledWith(CACHE_DIR, { recursive: true }); // From ensureCacheDirExists
      expect(fs.writeFile).toHaveBeenCalledWith(LLM_CACHE_FILE, JSON.stringify(testCacheData, null, 2), 'utf-8');
    });

    test('should warn on cache write error', async () => {
      const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
      const writeError = new Error("Cache write permission denied");
      (fs.writeFile as jest.Mock).mockRejectedValueOnce(writeError);
      
      await saveCache(testCacheData);
      expect(consoleWarnSpy).toHaveBeenCalledWith('Error saving LLM cache:', writeError);
      consoleWarnSpy.mockRestore();
    });
  });

  describe('logInteraction', () => {
    beforeEach(() => {
      (fs.appendFile as jest.Mock).mockClear();
      (fs.mkdir as jest.Mock).mockClear(); // ensureCacheDirExists calls mkdir
    });
    const testPrompt = "Log prompt";
    const testResponse = "Log response";

    test('should call ensureCacheDirExists then try to append to log file', async () => {
      await logInteraction(testPrompt, testResponse);
      expect(fs.mkdir).toHaveBeenCalledWith(CACHE_DIR, { recursive: true }); // From ensureCacheDirExists
      expect(fs.appendFile).toHaveBeenCalledWith(LLM_LOG_FILE, expect.stringContaining(testPrompt));
      expect(fs.appendFile).toHaveBeenCalledWith(LLM_LOG_FILE, expect.stringContaining(testResponse));
    });
    
    test('should format Error object response correctly', async () => {
        const errorResponse = new Error("Logged error response");
        errorResponse.stack = "Error: Logged error response\n    at Test (test.js:1:1)";
        await logInteraction(testPrompt, errorResponse);
        expect(fs.appendFile).toHaveBeenCalledWith(LLM_LOG_FILE, expect.stringContaining(errorResponse.stack!));
    });

    test('should warn on log append error', async () => {
      const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
      const appendError = new Error("Log append permission denied");
      (fs.appendFile as jest.Mock).mockRejectedValueOnce(appendError);
      
      await logInteraction(testPrompt, testResponse);
      expect(consoleWarnSpy).toHaveBeenCalledWith('Error writing to LLM log file:', appendError);
      consoleWarnSpy.mockRestore();
    });
  });
});
