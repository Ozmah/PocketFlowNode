// tests/api/llm.test.ts
import request from 'supertest';
import express from 'express'; // Import express to define a type for the app
import { LlmProviderType, LlmGenerationOptions } from '../../src/llm/types';
import { createLlmProvider } from '../../src/llm/factory'; // Actual factory
import { GeminiProvider } from '../../src/llm/gemini-provider';
import { ClaudeProvider } from '../../src/llm/claude-provider';
import { OpenAIProvider } from '../../src/llm/openai-provider';

// Mock the actual providers to avoid real API calls and control responses
jest.mock('../../src/llm/gemini-provider');
jest.mock('../../src/llm/claude-provider');
jest.mock('../../src/llm/openai-provider');

// Mock the factory to return mocked providers
jest.mock('../../src/llm/factory', () => ({
  createLlmProvider: jest.fn(),
}));

// Setup Express app for testing
// We need to re-require the app from src/index or set it up similarly.
// For simplicity in this subtask, we'll define a minimal app setup.
// In a real scenario, you'd import your configured Express app instance.
let app: express.Express;

const mockGeminiGenerate = jest.fn();
const mockClaudeGenerate = jest.fn();
const mockOpenAIGenerate = jest.fn();

describe('POST /llm/generate API Endpoint', () => {
  beforeAll(async () => {
    // Dynamically import app after mocks are set up
    // This is a common pattern when your app setup might involve modules that get mocked
    const { default: expressApp } = await import('../../src/index'); // Assuming src/index.ts exports the app as default
    app = expressApp;
  });
  
  beforeEach(() => {
    jest.clearAllMocks();

    // Setup mock implementations for providers
    (GeminiProvider as jest.Mock).mockImplementation(() => ({
      generateContent: mockGeminiGenerate,
    }));
    (ClaudeProvider as jest.Mock).mockImplementation(() => ({
      generateContent: mockClaudeGenerate,
    }));
    (OpenAIProvider as jest.Mock).mockImplementation(() => ({
      generateContent: mockOpenAIGenerate,
    }));

    // Setup the factory mock to return the correct mocked provider
    (createLlmProvider as jest.Mock).mockImplementation((providerType: LlmProviderType) => {
      if (providerType === 'gemini') return new (GeminiProvider as any)({});
      if (providerType === 'claude') return new (ClaudeProvider as any)({apiKey: 'mock-key'}); // Claude needs a key
      if (providerType === 'openai') return new (OpenAIProvider as any)({apiKey: 'mock-key'}); // OpenAI needs a key
      throw new Error('Unsupported provider in mock factory');
    });
  });

  test('should return 400 if provider is missing', async () => {
    const response = await request(app)
      .post('/llm/generate')
      .send({ prompt: "test" });
    expect(response.status).toBe(400);
    expect(response.body.message).toContain("provider is required");
  });

  test('should return 400 if prompt is missing', async () => {
    const response = await request(app)
      .post('/llm/generate')
      .send({ provider: "gemini" });
    expect(response.status).toBe(400);
    expect(response.body.message).toContain("prompt is required");
  });

  test('should call Gemini provider and return its response', async () => {
    const mockResponse = "Gemini says hello";
    mockGeminiGenerate.mockResolvedValue(mockResponse);
    process.env.GEMINI_API_KEY = 'test-gemini-key'; // Ensure env var is set for Gemini if factory checks

    const response = await request(app)
      .post('/llm/generate')
      .send({ provider: "gemini", prompt: "Hello Gemini" });

    expect(response.status).toBe(200);
    expect(response.body.response).toBe(mockResponse);
    expect(createLlmProvider).toHaveBeenCalledWith("gemini", expect.objectContaining({ apiKey: undefined }));
    expect(mockGeminiGenerate).toHaveBeenCalledWith("Hello Gemini", expect.any(Object));
  });

  test('should call Claude provider with API key from request and return its response', async () => {
    const mockResponse = "Claude says hello";
    mockClaudeGenerate.mockResolvedValue(mockResponse);

    const response = await request(app)
      .post('/llm/generate')
      .send({ provider: "claude", prompt: "Hello Claude", apiKey: "claude-req-key" });

    expect(response.status).toBe(200);
    expect(response.body.response).toBe(mockResponse);
    expect(createLlmProvider).toHaveBeenCalledWith("claude", expect.objectContaining({ apiKey: "claude-req-key" }));
    expect(mockClaudeGenerate).toHaveBeenCalledWith("Hello Claude", expect.any(Object));
  });

  test('should call OpenAI provider and return its response, passing options', async () => {
    const mockResponse = "OpenAI says hello";
    mockOpenAIGenerate.mockResolvedValue(mockResponse);
    process.env.OPENAI_API_KEY = 'test-openai-key'; // Ensure env var for OpenAI

    const generationOptions: LlmGenerationOptions = { model: "gpt-4", temperature: 0.5 };
    const response = await request(app)
      .post('/llm/generate')
      .send({ provider: "openai", prompt: "Hello OpenAI", options: generationOptions });

    expect(response.status).toBe(200);
    expect(response.body.response).toBe(mockResponse);
    expect(createLlmProvider).toHaveBeenCalledWith("openai", expect.objectContaining({}));
    expect(mockOpenAIGenerate).toHaveBeenCalledWith("Hello OpenAI", expect.objectContaining(generationOptions));
  });

  test('should return 500 if provider throws an error', async () => {
    const errorMessage = "Provider internal error";
    mockGeminiGenerate.mockRejectedValue(new Error(errorMessage));
    process.env.GEMINI_API_KEY = 'test-gemini-key';

    const response = await request(app)
      .post('/llm/generate')
      .send({ provider: "gemini", prompt: "Trigger error" });

    expect(response.status).toBe(500);
    expect(response.body.message).toContain("An error occurred with the gemini LLM provider");
    expect(response.body.error).toBe(errorMessage);
  });
  
  test('should correctly pass model from request body to provider options', async () => {
    mockGeminiGenerate.mockResolvedValue("Response with model");
    process.env.GEMINI_API_KEY = 'test-gemini-key';

    await request(app)
      .post('/llm/generate')
      .send({ provider: "gemini", prompt: "Test model", model: "gemini-pro-specific" });

    expect(mockGeminiGenerate).toHaveBeenCalledWith(
      "Test model",
      expect.objectContaining({ model: "gemini-pro-specific" })
    );
  });
  
  test('should correctly pass model from options to provider options', async () => {
    mockGeminiGenerate.mockResolvedValue("Response with model from options");
    process.env.GEMINI_API_KEY = 'test-gemini-key';

    await request(app)
      .post('/llm/generate')
      .send({ provider: "gemini", prompt: "Test model", options: { model: "gemini-pro-options" } });

    expect(mockGeminiGenerate).toHaveBeenCalledWith(
      "Test model",
      expect.objectContaining({ model: "gemini-pro-options" })
    );
  });

  // Test case for when model is in both request body and options (request body.model should take precedence as per current endpoint logic)
   test('model in requestBody should take precedence over model in options', async () => {
    mockGeminiGenerate.mockResolvedValue("Response with model precedence");
    process.env.GEMINI_API_KEY = 'test-gemini-key';

    await request(app)
      .post('/llm/generate')
      .send({ 
        provider: "gemini", 
        prompt: "Test model precedence", 
        model: "body-model", // This should be used
        options: { model: "options-model" } 
      });

    // The endpoint logic gives precedence to requestBody.model when creating LlmProviderConfig,
    // and then again when creating LlmGenerationOptions.
    // The createLlmProvider is called with config.modelName = "body-model"
    // The provider.generateContent is called with options.model = "body-model"
    expect(createLlmProvider).toHaveBeenCalledWith("gemini", expect.objectContaining({ modelName: "body-model" }));
    expect(mockGeminiGenerate).toHaveBeenCalledWith(
      "Test model precedence",
      expect.objectContaining({ model: "body-model" }) // body-model should win
    );
  });
});
