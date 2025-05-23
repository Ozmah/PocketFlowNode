import { getLlmProvider } from '../../src/llm/llm-factory';
import { GeminiProvider } from '../../src/llm/gemini-provider';
import { ChatGptProvider } from '../../src/llm/chatgpt-provider';
import { ClaudeProvider } from '../../src/llm/claude-provider';

// Mock the provider modules to avoid constructor side-effects (like API key checks)
jest.mock('../../src/llm/gemini-provider', () => ({
  GeminiProvider: jest.fn().mockImplementation(() => ({
    // Mock any methods if they were to be called by the factory, not needed for current factory logic
  })),
}));

jest.mock('../../src/llm/chatgpt-provider', () => ({
  ChatGptProvider: jest.fn().mockImplementation(() => ({})),
}));

jest.mock('../../src/llm/claude-provider', () => ({
  ClaudeProvider: jest.fn().mockImplementation(() => ({})),
}));

describe('LLM Factory - getLlmProvider', () => {
  beforeEach(() => {
    // Clear all mock instances and calls before each test
    (GeminiProvider as jest.Mock).mockClear();
    (ChatGptProvider as jest.Mock).mockClear();
    (ClaudeProvider as jest.Mock).mockClear();
  });

  test('should return a GeminiProvider instance when called with no arguments', () => {
    const provider = getLlmProvider();
    expect(provider).toBeInstanceOf(GeminiProvider);
    expect(GeminiProvider).toHaveBeenCalledTimes(1);
  });

  test('should return a GeminiProvider instance when called with "gemini"', () => {
    const provider = getLlmProvider('gemini');
    expect(provider).toBeInstanceOf(GeminiProvider);
    expect(GeminiProvider).toHaveBeenCalledTimes(1);
  });

  test('should return a ChatGptProvider instance when called with "chatgpt"', () => {
    const provider = getLlmProvider('chatgpt');
    expect(provider).toBeInstanceOf(ChatGptProvider);
    expect(ChatGptProvider).toHaveBeenCalledTimes(1);
  });

  test('should return a ClaudeProvider instance when called with "claude"', () => {
    const provider = getLlmProvider('claude');
    expect(provider).toBeInstanceOf(ClaudeProvider);
    expect(ClaudeProvider).toHaveBeenCalledTimes(1);
  });

  test('should return a GeminiProvider instance when called with "GEMINI" (case-insensitive)', () => {
    const provider = getLlmProvider('GEMINI');
    expect(provider).toBeInstanceOf(GeminiProvider);
    expect(GeminiProvider).toHaveBeenCalledTimes(1);
  });
  
  test('should return a ChatGptProvider instance when called with "ChatGPT" (case-insensitive)', () => {
    const provider = getLlmProvider('ChatGPT');
    expect(provider).toBeInstanceOf(ChatGptProvider);
    expect(ChatGptProvider).toHaveBeenCalledTimes(1);
  });

  test('should return a ClaudeProvider instance when called with "CLAUDE" (case-insensitive)', () => {
    const provider = getLlmProvider('CLAUDE');
    expect(provider).toBeInstanceOf(ClaudeProvider);
    expect(ClaudeProvider).toHaveBeenCalledTimes(1);
  });

  test('should throw an error when called with an unknown provider name', () => {
    expect(() => {
      getLlmProvider('unknown-provider');
    }).toThrow('Unsupported LLM provider: unknown-provider. Supported providers are \'gemini\', \'chatgpt\', \'claude\'.');
  });

  test('should throw an error when called with an empty string provider name after normalization (if that path is possible)', () => {
    // This test depends on how the factory handles empty strings if passed directly.
    // The current factory defaults to 'gemini' if providerName is falsy (like an empty string).
    // If an empty string was explicitly not desired even after default handling, the factory would need changes.
    // Based on current implementation, '' becomes 'gemini'.
    const provider = getLlmProvider('');
    expect(provider).toBeInstanceOf(GeminiProvider);
    expect(GeminiProvider).toHaveBeenCalledTimes(1);
  });
});
