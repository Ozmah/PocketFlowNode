// tests/core/order-chapters.test.ts
import { orderChapters } from '../../src/core/order-chapters';
import { Abstraction, ProjectAnalysis, OrderChaptersOptions } from '../../src/types';
import { LlmProvider, LlmGenerationOptions } from '../../src/llm/types';

// Mock LlmProvider
const mockGenerateContentOrder = jest.fn();
const mockLlmProviderOrder: LlmProvider = {
  providerType: 'gemini',
  generateContent: mockGenerateContentOrder,
};

describe('orderChapters main function', () => {
  const mockAbstractions: Abstraction[] = [
    { name: 'UI', description: 'User Interface', fileIndices: [0] },
    { name: 'Logic', description: 'Core Logic', fileIndices: [1] },
    { name: 'DB', description: 'Database', fileIndices: [2] },
  ];
  const mockProjectAnalysis: ProjectAnalysis = {
    summary: 'A simple app with UI, Logic, and DB.',
    relationships: [
      { from: 0, to: 1, label: 'calls' }, // UI calls Logic
      { from: 1, to: 2, label: 'uses' },  // Logic uses DB
    ],
  };
  const mockProjectName = 'TestProject';

  beforeEach(() => {
    mockGenerateContentOrder.mockReset();
  });

  test('should call LLM and parse valid YAML response for chapter order', async () => {
    const llmResponseYAML = `
- 0 # UI
- 1 # Logic
- 2 # DB
`;
    mockGenerateContentOrder.mockResolvedValue(\`\`\`yaml
${llmResponseYAML}
\`\`\`);

    const options: OrderChaptersOptions = { language: 'english', useCache: true };
    const result = await orderChapters(mockAbstractions, mockProjectAnalysis, mockProjectName, mockLlmProviderOrder, options);

    expect(mockGenerateContentOrder).toHaveBeenCalledTimes(1);
    expect(result).toEqual([0, 1, 2]);
  });

  test('should handle empty abstractions gracefully', async () => {
    const result = await orderChapters([], mockProjectAnalysis, mockProjectName, mockLlmProviderOrder, {});
    expect(result).toEqual([]);
    expect(mockGenerateContentOrder).not.toHaveBeenCalled();
  });
  
  test('should correctly pass LlmGenerationOptions from OrderChaptersOptions', async () => {
    mockGenerateContentOrder.mockResolvedValue("- 0\n- 1\n- 2"); // Simple valid YAML
     const specificLlmOptions: LlmGenerationOptions = { model: "claude-custom" };
    const options: OrderChaptersOptions = { 
      useCache: false,
      llmOptions: specificLlmOptions
    };
    
    await orderChapters(mockAbstractions, mockProjectAnalysis, mockProjectName, mockLlmProviderOrder, options);

    expect(mockGenerateContentOrder).toHaveBeenCalledWith(
      expect.any(String), // prompt
      expect.objectContaining({
        useCache: false,
        model: "claude-custom"
      })
    );
  });

  test('should throw error for invalid YAML (not an array)', async () => {
    mockGenerateContentOrder.mockResolvedValue("summary: This is not an array");
    await expect(orderChapters(mockAbstractions, mockProjectAnalysis, mockProjectName, mockLlmProviderOrder, {}))
      .rejects.toThrow("LLM output is not an array of ordered indices.");
  });
  
  test('should throw error if LLM output has duplicate indices', async () => {
    const llmResponseYAML = `
- 0 # UI
- 1 # Logic
- 0 # UI again
`;
    mockGenerateContentOrder.mockResolvedValue(\`\`\`yaml
${llmResponseYAML}
\`\`\`);
    await expect(orderChapters(mockAbstractions, mockProjectAnalysis, mockProjectName, mockLlmProviderOrder, {}))
      .rejects.toThrow("Duplicate abstraction index 0 found in LLM output.");
  });

  test('should throw error if LLM output is incomplete', async () => {
    const llmResponseYAML = `
- 0 # UI
- 1 # Logic
`; // Missing index 2
    mockGenerateContentOrder.mockResolvedValue(\`\`\`yaml
${llmResponseYAML}
\`\`\`);
    await expect(orderChapters(mockAbstractions, mockProjectAnalysis, mockProjectName, mockLlmProviderOrder, {}))
      .rejects.toThrow("LLM output for chapter order is incomplete. Missing indices: [2]");
  });

  // Añadir más tests
});
