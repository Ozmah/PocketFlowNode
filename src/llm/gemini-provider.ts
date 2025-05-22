// src/llm/gemini-provider.ts
import { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } from "@google/generative-ai";
import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import { LlmProvider, LlmGenerationOptions, GeminiProviderConfig, LlmProviderType } from './types';

// Ensure GEMINI_API_KEY is checked at the start or handled by the factory/caller.
// For now, we assume apiKey is passed in config or available in process.env

const DEFAULT_GEMINI_MODEL_NAME = "gemini-pro";

const CACHE_DIR = path.join(process.cwd(), '.cache');
const LLM_CACHE_FILE = path.join(CACHE_DIR, 'llm_cache.json'); // Consider provider-specific cache files or a structured cache
const LLM_LOG_FILE = path.join(CACHE_DIR, 'gemini_interactions.log'); // Provider-specific log

interface LlmCache {
  [promptHash: string]: string;
}

// Helper function to ensure cache directory exists
async function ensureCacheDirExists(): Promise<void> {
  try {
    await fs.mkdir(CACHE_DIR, { recursive: true });
  } catch (error: any) {
    if (error.code !== 'EEXIST') {
      console.warn(`Could not create cache directory ${CACHE_DIR}:`, error);
    }
  }
}

// Helper function to load cache
async function loadCache(): Promise<LlmCache> {
  await ensureCacheDirExists();
  try {
    const data = await fs.readFile(LLM_CACHE_FILE, 'utf-8');
    return JSON.parse(data) as LlmCache;
  } catch (error: any) {
    if (error.code === 'ENOENT') {
      return {};
    }
    console.warn('Error loading Gemini LLM cache:', error);
    return {};
  }
}

// Helper function to save cache
async function saveCache(cache: LlmCache): Promise<void> {
  await ensureCacheDirExists();
  try {
    await fs.writeFile(LLM_CACHE_FILE, JSON.stringify(cache, null, 2), 'utf-8');
  } catch (error) {
    console.warn('Error saving Gemini LLM cache:', error);
  }
}

// Helper function to log interactions
async function logInteraction(prompt: string, response: string | Error): Promise<void> {
  await ensureCacheDirExists();
  const timestamp = new Date().toISOString();
  const logEntry = `[${timestamp}]
PROMPT:
${prompt}
RESPONSE:
${response instanceof Error ? response.stack : response}
---
`;
  try {
    await fs.appendFile(LLM_LOG_FILE, logEntry);
  } catch (error) {
    console.warn('Error writing to Gemini LLM log file:', error);
  }
}

function hashPrompt(prompt: string): string {
  return crypto.createHash('sha256').update(prompt).digest('hex');
}

export class GeminiProvider implements LlmProvider {
  readonly providerType: LlmProviderType = "gemini";
  private config: GeminiProviderConfig;
  private genAI: GoogleGenerativeAI;

  constructor(config: GeminiProviderConfig) {
    this.config = { 
      modelName: DEFAULT_GEMINI_MODEL_NAME, 
      ...config 
    };

    const apiKey = this.config.apiKey || process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error("Gemini API key is not provided in config or GEMINI_API_KEY environment variable.");
    }
    this.genAI = new GoogleGenerativeAI(apiKey);
  }

  async generateContent(prompt: string, options?: LlmGenerationOptions): Promise<string> {
    const useCache = options?.useCache ?? true;
    const modelName = options?.model || this.config.modelName || DEFAULT_GEMINI_MODEL_NAME;
    const promptHash = hashPrompt(prompt + JSON.stringify(options || {})); // Include options in hash

    if (useCache) {
      const cache = await loadCache();
      if (cache[promptHash]) {
        console.log(`Gemini LLM Cache HIT for prompt hash: ${promptHash.substring(0,10)}...`);
        const cachedResponse = cache[promptHash];
        await logInteraction(prompt, `[CACHE HIT] ${cachedResponse}`);
        return cachedResponse;
      }
      console.log(`Gemini LLM Cache MISS for prompt hash: ${promptHash.substring(0,10)}...`);
    }

    try {
      const modelInstance = this.genAI.getGenerativeModel({
        model: modelName,
        safetySettings: [ // Default safety settings, can be made configurable
            { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_NONE },
            { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_NONE },
            { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_NONE },
            { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE },
        ],
        generationConfig: { // Pass through common options
            temperature: options?.temperature,
            maxOutputTokens: options?.maxTokens,
            topP: options?.topP,
            topK: options?.topK,
        }
      });

      console.log(`Calling Gemini LLM (Model: ${modelName}) with prompt (hash: ${promptHash.substring(0,10)}...)...`);
      
      const result = await modelInstance.generateContent(prompt);
      const response = await result.response;
      const responseText = response.text();

      if (useCache) {
        const cache = await loadCache();
        cache[promptHash] = responseText;
        await saveCache(cache);
      }

      await logInteraction(prompt, responseText);
      return responseText;

    } catch (error: any) {
      let errorMessage = `Gemini LLM API call failed (Model: ${modelName})`;
      if (error.message) {
          errorMessage += `: ${error.message}`;
      }
      if (error.details) { // gRPC-like error structure
          errorMessage += ` - Details: ${error.details}`;
      }
      
      console.error(errorMessage, error);
      await logInteraction(prompt, new Error(errorMessage + (error.stack ? `
${error.stack}` : '')));
      throw new Error(errorMessage);
    }
  }
}
