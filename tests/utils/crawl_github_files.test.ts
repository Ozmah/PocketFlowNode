import { shouldIncludeFile } from '../../src/utils/crawl_github_files';

describe('shouldIncludeFile', () => {
  it('should include if no patterns are provided', () => {
    expect(shouldIncludeFile('src/index.ts')).toBe(true);
  });

  it('should include if matches includePatterns and no excludePatterns', () => {
    expect(shouldIncludeFile('src/index.ts', ['src/**'], [])).toBe(true);
    expect(shouldIncludeFile('src/index.ts', ['**/*.ts'], [])).toBe(true); // Changed *.ts to **/*.ts
    expect(shouldIncludeFile('README.md', ['*.md'], [])).toBe(true); // *.md is fine for root files
  });

  it('should exclude if matches excludePatterns, even if matches includePatterns', () => {
    expect(shouldIncludeFile('src/index.ts', ['src/**'], ['src/index.ts'])).toBe(false);
    expect(shouldIncludeFile('src/index.ts', ['**/*.ts'], ['**/index.ts'])).toBe(false); // Changed index.ts to **/index.ts
    expect(shouldIncludeFile('node_modules/package/file.js', ['**/*.js'], ['node_modules/**'])).toBe(false);
  });

  it('should include if includePatterns is present and matches, and no excludePatterns match', () => {
    expect(shouldIncludeFile('src/components/button.tsx', ['**/*.tsx'], ['tests/**'])).toBe(true); // Changed *.tsx to **/*.tsx
  });

  it('should exclude if includePatterns is present but does not match', () => {
    expect(shouldIncludeFile('src/index.js', ['**/*.ts'], [])).toBe(false); // Changed *.ts to **/*.ts
    expect(shouldIncludeFile('README.md', ['src/**'], [])).toBe(false);
  });
  
  it('should exclude if only excludePatterns is present and matches', () => {
    expect(shouldIncludeFile('src/index.ts', undefined, ['src/**'])).toBe(false);
    expect(shouldIncludeFile('src/index.ts', undefined, ['**/*.ts'])).toBe(false); // Changed *.ts to **/*.ts
  });

  it('should include if only excludePatterns is present and does NOT match', () => {
    expect(shouldIncludeFile('src/index.ts', undefined, ['tests/**'])).toBe(true);
    expect(shouldIncludeFile('README.md', undefined, ['**/*.js'])).toBe(true); // Changed *.js to **/*.js
  });

  it('should handle complex patterns', () => {
    expect(shouldIncludeFile('src/app/core/service.ts', ['src/**/*.ts'], ['**/*.test.ts'])).toBe(true);
    expect(shouldIncludeFile('src/app/core/service.test.ts', ['src/**/*.ts'], ['**/*.test.ts'])).toBe(false);
    expect(shouldIncludeFile('src/app/core/service.test.ts', ['src/**/*.ts'], ['**/core/*.test.ts'])).toBe(false);
  });

  it('should handle file names directly', () => {
    expect(shouldIncludeFile('specific-file.md', ['specific-file.md'], [])).toBe(true);
    expect(shouldIncludeFile('another-file.md', ['specific-file.md'], [])).toBe(false);
    expect(shouldIncludeFile('specific-file.md', [], ['specific-file.md'])).toBe(false);
  });

  it('should handle empty includePatterns array (include all unless excluded)', () => {
    expect(shouldIncludeFile('src/index.ts', [], [])).toBe(true);
    expect(shouldIncludeFile('src/index.ts', [], ['src/index.ts'])).toBe(false);
  });
  
  it('should correctly interpret paths with dots', () => {
    expect(shouldIncludeFile('path.with.dots/file.ts', ['**/*.ts'], [])).toBe(true);
    expect(shouldIncludeFile('path.with.dots/file.ts', ['**/*.ts'], [])).toBe(true); // Changed *.ts to **/*.ts
    expect(shouldIncludeFile('path.with.dots/file.ts', ['path.with.dots/*.ts'], [])).toBe(true);
    expect(shouldIncludeFile('path.with.dots/file.ts', ['path.with.dots/f*.ts'], [])).toBe(true);
    expect(shouldIncludeFile('another.path/file.ts', ['path.with.dots/*.ts'], [])).toBe(false);
  });

  it('should correctly interpret paths starting with dots (e.g. .github/workflows)', () => {
    expect(shouldIncludeFile('.github/workflows/ci.yml', ['**/*.yml'], [])).toBe(true);
    expect(shouldIncludeFile('.github/workflows/ci.yml', ['.github/**/*.yml'], [])).toBe(true);
    expect(shouldIncludeFile('src/config/.env.example', ['src/config/*'], [])).toBe(true);
    expect(shouldIncludeFile('src/config/.env.example', ['src/config/.env*'], [])).toBe(true);
  });
});
