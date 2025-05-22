// tests/core/identify-abstractions.test.ts
// Mantén las pruebas existentes para helpers si las hay.

import { identifyAbstractions } from '../../src/core/identify-abstractions';
import { FetchedFile, IdentifyAbstractionsOptions, Abstraction } from '../../src/types';
import { LlmProvider, LlmGenerationOptions } from '../../src/llm/types';

// Mock LlmProvider
const mockGenerateContent = jest.fn();
const mockLlmProvider: LlmProvider = {
  providerType: 'gemini', // o cualquier tipo, no es crucial para el mock aquí
  generateContent: mockGenerateContent,
};

describe('identifyAbstractions main function', () => {
  const mockFilesData: FetchedFile[] = [
    { path: 'src/service.ts', content: 'export class Service {}' },
    { path: 'src/utils.ts', content: 'export function helper() {}' },
  ];
  const mockProjectName = 'TestProject';

  beforeEach(() => {
    mockGenerateContent.mockReset();
  });

  test('should call LLM and parse valid YAML response', async () => {
    const llmResponseYAML = `
- name: "Service Class"
  description: "Handles main business logic."
  file_indices: [0]
- name: "Helper Function"
  description: "Provides utility functions."
  file_indices: [1]
`;
    mockGenerateContent.mockResolvedValue(\`\`\`yaml
${llmResponseYAML}
\`\`\`);

    const options: IdentifyAbstractionsOptions = { language: 'english', useCache: true, maxAbstractions: 5 };
    const result = await identifyAbstractions(mockFilesData, mockProjectName, mockLlmProvider, options);

    expect(mockGenerateContent).toHaveBeenCalledTimes(1);
    // Podrías añadir un expect más específico para el prompt si es estable
    expect(result).toEqual([
      { name: "Service Class", description: "Handles main business logic.", fileIndices: [0] },
      { name: "Helper Function", description: "Provides utility functions.", fileIndices: [1] },
    ]);
  });

  test('should handle empty filesData gracefully', async () => {
    const result = await identifyAbstractions([], mockProjectName, mockLlmProvider, {});
    expect(result).toEqual([]);
    expect(mockGenerateContent).not.toHaveBeenCalled();
  });

  test('should correctly pass LlmGenerationOptions from IdentifyAbstractionsOptions', async () => {
    mockGenerateContent.mockResolvedValue("[]"); // Empty YAML array
    const specificLlmOptions: LlmGenerationOptions = { model: 'test-model', temperature: 0.5 };
    const options: IdentifyAbstractionsOptions = { 
      useCache: false, 
      llmOptions: specificLlmOptions 
    };
    
    await identifyAbstractions(mockFilesData, mockProjectName, mockLlmProvider, options);

    expect(mockGenerateContent).toHaveBeenCalledWith(
      expect.any(String), // prompt
      expect.objectContaining({
        useCache: false, // de options.useCache
        model: 'test-model', // de options.llmOptions
        temperature: 0.5   // de options.llmOptions
      })
    );
  });

  test('should throw error for invalid YAML response', async () => {
    mockGenerateContent.mockResolvedValue("this is not yaml");
    const options: IdentifyAbstractionsOptions = {};
    await expect(identifyAbstractions(mockFilesData, mockProjectName, mockLlmProvider, options))
      .rejects.toThrow(/Failed to parse LLM response as YAML/);
  });
  
  // Añadir más tests para cubrir otros casos (ej: YAML malformado, índices inválidos en YAML, etc.)
});
