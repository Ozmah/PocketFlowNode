import { sanitizeFilename } from '../../src/core/write-chapters';

describe('sanitizeFilename', () => {
  it('should create basic filename with padded chapter number', () => {
    expect(sanitizeFilename('Introduction', 1)).toBe('01_introduction.md');
    expect(sanitizeFilename('Chapter Ten', 10)).toBe('10_chapter_ten.md');
  });

  it('should replace internal spaces with underscores', () => {
    expect(sanitizeFilename('My Chapter Title', 3)).toBe('03_my_chapter_title.md');
  });

  it('should convert to lowercase', () => {
    expect(sanitizeFilename('UPPERCASE Title', 5)).toBe('05_uppercase_title.md');
  });

  it('should remove special characters except underscore, dot, hyphen, and handle dots correctly', () => {
    // Dots are allowed by the regex [^\w_.-]
    expect(sanitizeFilename('Chapter!@#$%^&*()+=[]{}\\|;:\'",<.>/? End', 7))
      .toBe('07_chapter._end.md'); // Dot from <.> is preserved
  });
  
  it('should handle names with existing underscores, dots, hyphens', () => {
    expect(sanitizeFilename('my_chapter-v1.0', 2)).toBe('02_my_chapter-v1.0.md');
  });

  it('should handle empty or only-special-character names with default "chapter"', () => {
    expect(sanitizeFilename('', 1)).toBe('01_chapter.md'); // Trimmed empty, then default
    expect(sanitizeFilename('!@#$', 2)).toBe('02_chapter.md'); // Special chars removed, becomes empty, then default
    expect(sanitizeFilename('   ', 3)).toBe('03_chapter.md'); // Trimmed empty, then default
    expect(sanitizeFilename('___', 4)).toBe('04_chapter.md'); // Only underscores, becomes empty after replace(/_/g, ''), then default
  });

  it('should trim leading/trailing spaces and handle them correctly', () => {
    expect(sanitizeFilename('  Chapter with Spaces  ', 4)).toBe('04_chapter_with_spaces.md');
  });
  
  it('should handle long names (no specific length limit enforced by function itself)', () => {
    const longName = 'a'.repeat(100);
    expect(sanitizeFilename(longName, 15)).toBe(`15_${longName}.md`);
  });

  it('should ensure chapter number is padded correctly', () => {
    expect(sanitizeFilename('Single Digit', 1)).toMatch(/^01_/);
    expect(sanitizeFilename('Double Digit', 12)).toMatch(/^12_/);
    expect(sanitizeFilename('Triple Digit', 123)).toMatch(/^123_/); // padStart(2, '0') will still result in '123'
  });
});

// Mock LlmProvider
const mockGenerateContentWrite = jest.fn();
const mockLlmProviderWrite: LlmProvider = {
  providerType: 'gemini',
  generateContent: mockGenerateContentWrite,
};

describe('writeChapters main function', () => {
  const mockAbstractions: Abstraction[] = [
    { name: 'Chapter One', description: 'First chapter desc', fileIndices: [0] },
    { name: 'Chapter Two', description: 'Second chapter desc', fileIndices: [1] },
  ];
  const mockChapterOrder: number[] = [0, 1]; // Order of abstraction indices
  const mockFilesData: FetchedFile[] = [
    { path: 'file1.ts', content: 'content for file1' },
    { path: 'file2.ts', content: 'content for file2' },
  ];
  const mockProjectName = 'MyTutorial';

  beforeEach(() => {
    mockGenerateContentWrite.mockReset();
  });

  test('should call LLM for each chapter and return ChapterOutput array', async () => {
    mockGenerateContentWrite
      .mockResolvedValueOnce('# Chapter 1: Chapter One\nContent for chapter one.')
      .mockResolvedValueOnce('# Chapter 2: Chapter Two\nContent for chapter two.');

    const options: WriteChaptersOptions = { language: 'english', useCache: true };
    const result = await writeChapters(mockChapterOrder, mockAbstractions, mockFilesData, mockProjectName, mockLlmProviderWrite, options);

    expect(mockGenerateContentWrite).toHaveBeenCalledTimes(2);
    // Check call for first chapter
    expect(mockGenerateContentWrite).toHaveBeenNthCalledWith(1, 
      expect.stringContaining('This chapter focuses on the abstraction: "Chapter One"'), // Parte del prompt
      expect.objectContaining({ useCache: true })
    );
    // Check call for second chapter
    expect(mockGenerateContentWrite).toHaveBeenNthCalledWith(2,
      expect.stringContaining('This chapter focuses on the abstraction: "Chapter Two"'), // Parte del prompt
      expect.objectContaining({ useCache: true })
    );

    expect(result).toHaveLength(2);
    expect(result[0]).toEqual(expect.objectContaining({
      chapterNumber: 1,
      abstractionIndex: 0,
      title: 'Chapter One',
      content: '# Chapter 1: Chapter One\nContent for chapter one.',
      filename: '01_chapter_one.md'
    }));
    expect(result[1]).toEqual(expect.objectContaining({
      chapterNumber: 2,
      abstractionIndex: 1,
      title: 'Chapter Two',
      content: '# Chapter 2: Chapter Two\nContent for chapter two.',
      filename: '02_chapter_two.md'
    }));
  });

  test('should handle empty chapterOrder gracefully', async () => {
    const result = await writeChapters([], mockAbstractions, mockFilesData, mockProjectName, mockLlmProviderWrite, {});
    expect(result).toEqual([]);
    expect(mockGenerateContentWrite).not.toHaveBeenCalled();
  });

  test('should prepend default heading if LLM output is missing it', async () => {
    mockGenerateContentWrite.mockResolvedValueOnce('Content without heading.');
    const result = await writeChapters([0], [mockAbstractions[0]], mockFilesData, mockProjectName, mockLlmProviderWrite, {});
    expect(result[0].content).toMatch(/^# Chapter 1: Chapter One\n\nContent without heading./);
  });
  
  test('should correctly pass LlmGenerationOptions from WriteChaptersOptions', async () => {
    mockGenerateContentWrite.mockResolvedValueOnce('# Chapter 1: Test\nContent');
    const specificLlmOptions: LlmGenerationOptions = { model: "gpt-4-custom", temperature: 0.1 };
    const options: WriteChaptersOptions = {
      useCache: false,
      llmOptions: specificLlmOptions
    };

    await writeChapters([0], [mockAbstractions[0]], mockFilesData, mockProjectName, mockLlmProviderWrite, options);

    expect(mockGenerateContentWrite).toHaveBeenCalledWith(
      expect.any(String), // prompt
      expect.objectContaining({
        useCache: false,
        model: "gpt-4-custom",
        temperature: 0.1
      })
    );
  });
  // Añadir más tests
});
