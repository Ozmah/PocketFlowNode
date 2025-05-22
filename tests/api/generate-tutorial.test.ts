// tests/api/generate-tutorial.test.ts
import request from 'supertest';
import expressApp from '../../src/index'; // Asumiendo que src/index.ts exporta app como default
import { LlmProviderType, LlmGenerationOptions, LlmProviderConfig } from '../../src/llm/types';

// Mockear módulos del core y dependencias
jest.mock('../../src/utils/crawl_github_files');
jest.mock('../../src/core/identify-abstractions');
jest.mock('../../src/core/analyze-relationships');
jest.mock('../../src/core/order-chapters');
jest.mock('../../src/core/write-chapters');
jest.mock('../../src/core/combine-tutorial');
jest.mock('../../src/llm/factory'); // Mockear la factoría para controlar la instancia del provider

// Importar las funciones mockeadas para espiar sus llamadas
import { crawlGitHubFiles } from '../../src/utils/crawl_github_files';
import { identifyAbstractions } from '../../src/core/identify-abstractions';
import { analyzeRelationships } from '../../src/core/analyze-relationships';
import { orderChapters } from '../../src/core/order-chapters';
import { writeChapters } from '../../src/core/write-chapters';
import { combineTutorial } from '../../src/core/combine-tutorial';
import { createLlmProvider } from '../../src/llm/factory';

// Mock LlmProvider instance para ser devuelto por la factoría mockeada
const mockLlmProviderInstance = {
  providerType: 'gemini', // Default o lo que se configure
  generateContent: jest.fn().mockResolvedValue('mocked LLM response'),
};

describe('POST /generate-tutorial API Endpoint with LLM Provider Selection', () => {
  const baseRequest = {
    repoUrl: 'https://github.com/example/repo',
    projectName: 'TestTutorial',
  };

  beforeEach(() => {
    jest.clearAllMocks();

    // Configurar mocks para devolver valores esperados y evitar errores
    (crawlGitHubFiles as jest.Mock).mockResolvedValue({ files: [{ path: 'file.ts', content: 'code' }], stats: { totalFiles: 1, fetchedCount: 1, skippedCount: 0 }});
    (identifyAbstractions as jest.Mock).mockResolvedValue([{ name: 'Abs1', description: 'Desc1', fileIndices: [0] }]);
    (analyzeRelationships as jest.Mock).mockResolvedValue({ summary: 'Summary', relationships: [] });
    (orderChapters as jest.Mock).mockResolvedValue([0]); // order de indices de abstracciones
    (writeChapters as jest.Mock).mockResolvedValue([{ chapterNumber: 1, abstractionIndex: 0, title: 'Abs1', content: '# Abs1', filename: '01_abs1.md' }]);
    (combineTutorial as jest.Mock).mockReturnValue([{ filename: 'index.md', content: '# TestTutorial' }]);
    
    // Configurar el mock de createLlmProvider para devolver nuestra instancia mockeada
    (createLlmProvider as jest.Mock).mockReturnValue(mockLlmProviderInstance);
  });

  test('should use Gemini provider by default and pass options correctly', async () => {
    process.env.GEMINI_API_KEY = 'test-gemini-key'; // Asegurar que la variable de entorno exista para el default

    const response = await request(expressApp)
      .post('/generate-tutorial')
      .send(baseRequest);

    expect(response.status).toBe(200); // Asumiendo que el zip se genera y envía
    expect(response.header['content-type']).toBe('application/zip');

    expect(createLlmProvider).toHaveBeenCalledWith('gemini', expect.objectContaining({
      apiKey: undefined, // No se pasó apiKey en request, así que es undefined
      modelName: undefined // No se pasó model en request
    }));
    
    const expectedLlmOptions = expect.objectContaining({ useCache: true }); // Default useCache
    expect(identifyAbstractions).toHaveBeenCalledWith(expect.anything(), expect.anything(), mockLlmProviderInstance, expect.objectContaining({ llmOptions: expectedLlmOptions }));
    expect(analyzeRelationships).toHaveBeenCalledWith(expect.anything(), expect.anything(), expect.anything(), mockLlmProviderInstance, expect.objectContaining({ llmOptions: expectedLlmOptions }));
    // ... y así para orderChapters y writeChapters
    expect(orderChapters).toHaveBeenCalledWith(expect.anything(), expect.anything(), expect.anything(), mockLlmProviderInstance, expect.objectContaining({ llmOptions: expectedLlmOptions }));
    expect(writeChapters).toHaveBeenCalledWith(expect.anything(), expect.anything(), expect.anything(), expect.anything(), mockLlmProviderInstance, expect.objectContaining({ llmOptions: expectedLlmOptions }));
  });

  test('should use specified provider (Claude) and pass its specific options', async () => {
    process.env.CLAUDE_API_KEY = 'test-claude-key'; // Asegurar que la variable de entorno exista

    const requestBody = {
      ...baseRequest,
      llmProvider: 'claude' as LlmProviderType,
      llmModel: 'claude-2.1',
      llmOptions: { temperature: 0.5 } as LlmGenerationOptions,
      useCache: false, // Para probar que esto se propaga a coreLlmGenerationOptions.useCache
    };

    await request(expressApp)
      .post('/generate-tutorial')
      .send(requestBody);

    expect(createLlmProvider).toHaveBeenCalledWith('claude', expect.objectContaining({
      apiKey: undefined, // No se pasó llmApiKey
      modelName: 'claude-2.1'
    }));

    const expectedLlmOptionsForClaude = expect.objectContaining({
      temperature: 0.5,
      useCache: false // Proviene de requestBody.useCache
    });
    expect(identifyAbstractions).toHaveBeenCalledWith(expect.anything(), expect.anything(), mockLlmProviderInstance, expect.objectContaining({ llmOptions: expectedLlmOptionsForClaude }));
    // ... y así para las otras funciones del core
    expect(analyzeRelationships).toHaveBeenCalledWith(expect.anything(), expect.anything(), expect.anything(), mockLlmProviderInstance, expect.objectContaining({ llmOptions: expectedLlmOptionsForClaude }));
    expect(orderChapters).toHaveBeenCalledWith(expect.anything(), expect.anything(), expect.anything(), mockLlmProviderInstance, expect.objectContaining({ llmOptions: expectedLlmOptionsForClaude }));
    expect(writeChapters).toHaveBeenCalledWith(expect.anything(), expect.anything(), expect.anything(), expect.anything(), mockLlmProviderInstance, expect.objectContaining({ llmOptions: expectedLlmOptionsForClaude }));
  });
  
  test('should use llmApiKey from request if provided', async () => {
    const requestBody = {
      ...baseRequest,
      llmProvider: 'openai' as LlmProviderType,
      llmApiKey: 'openai-key-from-request',
    };
    process.env.OPENAI_API_KEY = 'env-openai-key'; // Ensure env key exists, but request key should take precedence

    await request(expressApp)
      .post('/generate-tutorial')
      .send(requestBody);

    expect(createLlmProvider).toHaveBeenCalledWith('openai', expect.objectContaining({
      apiKey: 'openai-key-from-request',
    }));
  });

  test('should return 400 for invalid llmProvider', async () => {
    const requestBody = {
      ...baseRequest,
      llmProvider: 'invalid-provider',
    };
    const response = await request(expressApp)
      .post('/generate-tutorial')
      .send(requestBody);
    expect(response.status).toBe(400);
    expect(response.body.message).toContain("llmProvider must be one of 'gemini', 'claude', or 'openai'");
  });
  
  test('should return 500 if createLlmProvider throws (e.g. API key missing for non-Gemini default)', async () => {
    (createLlmProvider as jest.Mock).mockImplementation(() => { 
      throw new Error("Missing API Key for Claude"); 
    });
    // No establecemos CLAUDE_API_KEY en process.env aquí a propósito
    // para simular un error en la factoría si se intenta usar Claude sin key.

    const requestBody = {
      ...baseRequest,
      llmProvider: 'claude' as LlmProviderType,
    };

    const response = await request(expressApp)
      .post('/generate-tutorial')
      .send(requestBody);
      
    expect(response.status).toBe(500);
    expect(response.body.message).toContain("Failed to initialize LLM provider claude");
  });

  // Añadir más tests para cubrir diferentes combinaciones de llmOptions, etc.
});
