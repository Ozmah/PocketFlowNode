import { sanitizeForMermaid } from '../../src/core/combine-tutorial';

describe('sanitizeForMermaid', () => {
  it('should replace double quotes with #quot;', () => {
    expect(sanitizeForMermaid('This is a "quoted" string')).toBe('This is a #quot;quoted#quot; string');
  });

  it('should replace opening parentheses with #lpar;', () => {
    expect(sanitizeForMermaid('Function(call)')).toBe('Function#lpar;call#rpar;');
  });

  it('should replace closing parentheses with #rpar;', () => {
    expect(sanitizeForMermaid('Array[index] (old_syntax)')).toBe('Array[index] #lpar;old_syntax#rpar;');
  });

  it('should handle mixed characters', () => {
    expect(sanitizeForMermaid('A "complex" (example) with multiple issues'))
      .toBe('A #quot;complex#quot; #lpar;example#rpar; with multiple issues');
  });

  it('should handle strings with no special characters', () => {
    expect(sanitizeForMermaid('Simple_string-123')).toBe('Simple_string-123');
  });

  it('should handle empty strings', () => {
    expect(sanitizeForMermaid('')).toBe('');
  });

  it('should handle strings with only special characters', () => {
    expect(sanitizeForMermaid('""()()""')).toBe('#quot;#quot;#lpar;#rpar;#lpar;#rpar;#quot;#quot;');
  });
  
  // Test for any other characters that might have been added to sanitize
  // (Currently, only ", (, ) are explicitly handled by the provided function snippet)
  it('should not alter other characters like hyphens or underscores', () => {
    expect(sanitizeForMermaid('Keep-this_and-that')).toBe('Keep-this_and-that');
  });
});
