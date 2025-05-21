import { callLlm } from '../../src/utils/llm'; // Adjust path as necessary
import { GoogleGenerativeAI } from '@google/generative-ai';
import fs from 'fs/promises';
import crypto from 'crypto';
import path from 'path';

// Mock @google/generative-ai
jest.mock('@google/generative-ai');

// Mock fs/promises
jest.mock('fs/promises');

const mockGenerateContent = jest.fn();
const mockGetGenerativeModel = jest.fn(() => ({
  generateContent: mockGenerateContent,
}));

const CACHE_DIR = path.join(process.cwd(), '.cache');
const LLM_CACHE_FILE = path.join(CACHE_DIR, 'llm_cache.json');
const LLM_LOG_FILE = path.join(CACHE_DIR, 'llm_interactions.log'); // Assuming this is the log file path

describe('callLlm', () => {
  let originalApiKey: string | undefined;
  const testPrompt = "Test prompt";
  const testResponse = "Test LLM response";
  const promptHash = crypto.createHash('sha256').update(testPrompt).digest('hex');

  beforeEach(() => {
    // Reset mocks for each test
    jest.clearAllMocks();

    // Backup original API key and set a test one
    originalApiKey = process.env.GEMINI_API_KEY;
    process.env.GEMINI_API_KEY = "test-api-key";

    // Setup default mock implementations
    (GoogleGenerativeAI as jest.Mock).mockImplementation(() => ({
      getGenerativeModel: mockGetGenerativeModel,
    }));
    mockGenerateContent.mockResolvedValue({
      response: {
        text: () => testResponse,
      },
    });

    // Default fs mocks
    (fs.readFile as jest.Mock).mockResolvedValue(JSON.stringify({})); // Empty cache
    (fs.writeFile as jest.Mock).mockResolvedValue(undefined);
    (fs.appendFile as jest.Mock).mockResolvedValue(undefined); // For logging
    (fs.mkdir as jest.Mock).mockResolvedValue(undefined); // For ensureCacheDirExists
  });

  afterEach(() => {
    // Restore original API key
    process.env.GEMINI_API_KEY = originalApiKey;
  });

  test('should throw error if GEMINI_API_KEY is not set', async () => {
    delete process.env.GEMINI_API_KEY; // Remove API key for this test
    await expect(callLlm(testPrompt)).rejects.toThrow("GEMINI_API_KEY environment variable is not set.");
    expect(fs.appendFile).toHaveBeenCalledWith(LLM_LOG_FILE, expect.stringContaining("GEMINI_API_KEY environment variable is not set."));
  });

  test('cache miss: should call LLM, return response, and write to cache', async () => {
    (fs.readFile as jest.Mock).mockResolvedValueOnce(JSON.stringify({})); // Empty cache

    const response = await callLlm(testPrompt, { useCache: true });

    expect(response).toBe(testResponse);
    expect(GoogleGenerativeAI).toHaveBeenCalledWith("test-api-key");
    expect(mockGetGenerativeModel).toHaveBeenCalled();
    expect(mockGenerateContent).toHaveBeenCalledWith(testPrompt);
    expect(fs.writeFile).toHaveBeenCalledWith(
      LLM_CACHE_FILE,
      JSON.stringify({ [promptHash]: testResponse }, null, 2),
      'utf-8'
    );
    expect(fs.appendFile).toHaveBeenCalledWith(LLM_LOG_FILE, expect.stringContaining(testResponse));
  });

  test('cache hit: should return cached response and not call LLM', async () => {
    const cachedData = { [promptHash]: "Cached test response" };
    (fs.readFile as jest.Mock).mockResolvedValueOnce(JSON.stringify(cachedData));

    const response = await callLlm(testPrompt, { useCache: true });

    expect(response).toBe("Cached test response");
    expect(mockGetGenerativeModel).not.toHaveBeenCalled();
    expect(mockGenerateContent).not.toHaveBeenCalled();
    expect(fs.writeFile).not.toHaveBeenCalled(); // Should not write if cache hit
    expect(fs.appendFile).toHaveBeenCalledWith(LLM_LOG_FILE, expect.stringContaining("[CACHE HIT] Cached test response"));
  });
  
  test('no cache: should call LLM and not read from or write to cache file (but still log)', async () => {
    const response = await callLlm(testPrompt, { useCache: false });

    expect(response).toBe(testResponse);
    expect(GoogleGenerativeAI).toHaveBeenCalledWith("test-api-key");
    expect(mockGetGenerativeModel).toHaveBeenCalled();
    expect(mockGenerateContent).toHaveBeenCalledWith(testPrompt);
    
    expect(fs.readFile).not.toHaveBeenCalledWith(LLM_CACHE_FILE, 'utf-8'); // Should not read cache file
    expect(fs.writeFile).not.toHaveBeenCalled(); // Should not write to cache file
    
    // Should still log the interaction
    expect(fs.appendFile).toHaveBeenCalledWith(LLM_LOG_FILE, expect.stringContaining(testResponse));
    expect(fs.appendFile).not.toHaveBeenCalledWith(LLM_LOG_FILE, expect.stringContaining("[CACHE HIT]"));
  });

  test('should handle LLM API call failure gracefully', async () => {
    const apiError = new Error("LLM API Error");
    mockGenerateContent.mockRejectedValueOnce(apiError);

    try {
      await callLlm(testPrompt);
      // If callLlm doesn't throw, the test should fail
      throw new Error("callLlm did not throw an error when expected"); 
    } catch (error: any) {
      expect(error.message).toContain("LLM API call failed");
      expect(error.message).toContain("LLM API Error"); // Check for original error message part
    }
    
    // Ensure error is logged
    expect(fs.appendFile).toHaveBeenCalledWith(LLM_LOG_FILE, expect.stringContaining("LLM API call failed"));
    expect(fs.appendFile).toHaveBeenCalledWith(LLM_LOG_FILE, expect.stringContaining(apiError.stack || apiError.message));
  });

  test('should handle cache read error: call LLM and attempt to write to cache', async () => {
    (fs.readFile as jest.Mock).mockRejectedValueOnce(new Error("Cache read error"));

    const response = await callLlm(testPrompt, { useCache: true });

    expect(response).toBe(testResponse); // Should still get response from LLM
    expect(mockGenerateContent).toHaveBeenCalledWith(testPrompt); // LLM was called
    expect(fs.writeFile).toHaveBeenCalledWith( // Should attempt to write to cache
      LLM_CACHE_FILE,
      JSON.stringify({ [promptHash]: testResponse }, null, 2),
      'utf-8'
    );
  });

  test('should handle cache write error: return LLM response but log warning', async () => {
    (fs.writeFile as jest.Mock).mockRejectedValueOnce(new Error("Cache write error"));
    // Mock console.warn to check if it's called
    const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

    const response = await callLlm(testPrompt, { useCache: true });

    expect(response).toBe(testResponse); // Should still get response from LLM
    expect(mockGenerateContent).toHaveBeenCalledWith(testPrompt);
    expect(consoleWarnSpy).toHaveBeenCalledWith('Error saving LLM cache:', expect.any(Error));
    
    consoleWarnSpy.mockRestore();
  });

  test('should create cache directory if it does not exist', async () => {
    // Simulate cache directory not existing, then fs.mkdir succeeding.
    // For this test, we are interested in the ensureCacheDirExists logic which is called by loadCache/saveCache.
    // fs.mkdir is already mocked to resolve. We need to ensure it's called if appropriate.
    // The actual check for EEXIST is inside ensureCacheDirExists, which is not directly tested here,
    // but its effect (calling mkdir) is.
    
    await callLlm(testPrompt, { useCache: true });
    expect(fs.mkdir).toHaveBeenCalledWith(CACHE_DIR, { recursive: true });
  });
});
