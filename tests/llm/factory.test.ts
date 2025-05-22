// tests/llm/factory.test.ts
import { createLlmProvider } from '../../src/llm/factory';
import { GeminiProvider } from '../../src/llm/gemini-provider';
import { ClaudeProvider } from '../../src/llm/claude-provider';
import { OpenAIProvider } from '../../src/llm/openai-provider';
import { LlmProviderType, LlmProviderConfig } from '../../src/llm/types';

describe('LLM Factory: createLlmProvider', () => {
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    originalEnv = { ...process.env }; // Backup environment variables
    // Clear relevant env vars before each test
    delete process.env.GEMINI_API_KEY;
    delete process.env.CLAUDE_API_KEY;
    delete process.env.OPENAI_API_KEY;
  });

  afterEach(() => {
    process.env = originalEnv; // Restore environment variables
  });

  test('should create GeminiProvider', () => {
    process.env.GEMINI_API_KEY = 'test-gemini-key';
    const provider = createLlmProvider('gemini');
    expect(provider).toBeInstanceOf(GeminiProvider);
  });

  test('should create ClaudeProvider with API key from config', () => {
    const config: LlmProviderConfig = { apiKey: 'test-claude-key-config' };
    const provider = createLlmProvider('claude', config);
    expect(provider).toBeInstanceOf(ClaudeProvider);
  });

  test('should create ClaudeProvider with API key from env', () => {
    process.env.CLAUDE_API_KEY = 'test-claude-key-env';
    const provider = createLlmProvider('claude');
    expect(provider).toBeInstanceOf(ClaudeProvider);
  });

  test('should throw error if Claude API key is missing', () => {
    expect(() => createLlmProvider('claude')).toThrow('Claude API key must be provided');
  });

  test('should create OpenAIProvider with API key from config', () => {
    const config: LlmProviderConfig = { apiKey: 'test-openai-key-config' };
    const provider = createLlmProvider('openai', config);
    expect(provider).toBeInstanceOf(OpenAIProvider);
  });

  test('should create OpenAIProvider with API key from env', () => {
    process.env.OPENAI_API_KEY = 'test-openai-key-env';
    const provider = createLlmProvider('openai');
    expect(provider).toBeInstanceOf(OpenAIProvider);
  });

  test('should throw error if OpenAI API key is missing', () => {
    expect(() => createLlmProvider('openai')).toThrow('OpenAI API key must be provided');
  });
  
  test('should pass modelName to provider config', () => {
    process.env.GEMINI_API_KEY = 'test-gemini-key';
    const config: LlmProviderConfig = { modelName: 'gemini-custom-model' };
    const provider = createLlmProvider('gemini', config) as GeminiProvider;
    // Accessing private config for testing purposes, consider if there's a better way
    expect((provider as any).config.modelName).toBe('gemini-custom-model');
  });

  test('should throw error for unsupported provider type', () => {
    expect(() => createLlmProvider('unsupported' as LlmProviderType)).toThrow('Unsupported LLM provider type: unsupported');
  });
});
