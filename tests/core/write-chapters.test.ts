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
