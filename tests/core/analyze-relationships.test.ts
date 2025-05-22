// tests/core/analyze-relationships.test.ts
// Mantén las pruebas existentes para helpers si las hay.

import { analyzeRelationships } from '../../src/core/analyze-relationships';
import { FetchedFile, Abstraction, AnalyzeRelationshipsOptions, ProjectAnalysis } from '../../src/types';
import { LlmProvider, LlmGenerationOptions } from '../../src/llm/types';

// Mock LlmProvider (puedes definirlo una vez y reusarlo si está en un archivo helper de test)
const mockGenerateContentRelationships = jest.fn();
const mockLlmProviderRelationships: LlmProvider = {
  providerType: 'gemini',
  generateContent: mockGenerateContentRelationships,
};

describe('analyzeRelationships main function', () => {
  const mockAbstractions: Abstraction[] = [
    { name: 'AuthModule', description: 'Handles auth', fileIndices: [0] },
    { name: 'UserDB', description: 'User database interface', fileIndices: [1] },
  ];
  const mockFilesData: FetchedFile[] = [
    { path: 'auth.ts', content: '...' },
    { path: 'db.ts', content: '...' },
  ];
  const mockProjectName = 'TestProject';

  beforeEach(() => {
    mockGenerateContentRelationships.mockReset();
  });

  test('should call LLM and parse valid YAML response for relationships', async () => {
    const llmResponseYAML = `
summary: "Project uses AuthModule to interact with UserDB."
relationships:
  - from_abstraction: "0 # AuthModule"
    to_abstraction: "1 # UserDB"
    label: "uses"
`;
    mockGenerateContentRelationships.mockResolvedValue(\`\`\`yaml
${llmResponseYAML}
\`\`\`);

    const options: AnalyzeRelationshipsOptions = { language: 'english', useCache: true };
    const result = await analyzeRelationships(mockAbstractions, mockFilesData, mockProjectName, mockLlmProviderRelationships, options);

    expect(mockGenerateContentRelationships).toHaveBeenCalledTimes(1);
    expect(result.summary).toBe("Project uses AuthModule to interact with UserDB.");
    expect(result.relationships).toEqual([
      { from: 0, to: 1, label: "uses" },
    ]);
  });

  test('should handle empty abstractions gracefully', async () => {
    const result = await analyzeRelationships([], mockFilesData, mockProjectName, mockLlmProviderRelationships, {});
    expect(result.relationships).toEqual([]);
    expect(result.summary).toContain("No abstractions provided");
    expect(mockGenerateContentRelationships).not.toHaveBeenCalled();
  });
  
  test('should correctly pass LlmGenerationOptions from AnalyzeRelationshipsOptions', async () => {
    mockGenerateContentRelationships.mockResolvedValue(\`summary: "Test"
relationships: []\`);
    const specificLlmOptions: LlmGenerationOptions = { temperature: 0.2 };
    const options: AnalyzeRelationshipsOptions = { 
      useCache: true,
      llmOptions: specificLlmOptions
    };
    
    await analyzeRelationships(mockAbstractions, mockFilesData, mockProjectName, mockLlmProviderRelationships, options);

    expect(mockGenerateContentRelationships).toHaveBeenCalledWith(
      expect.any(String), // prompt
      expect.objectContaining({
        useCache: true,
        temperature: 0.2
      })
    );
  });

  // Añadir más tests
});
