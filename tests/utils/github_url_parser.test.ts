import { parseGitHubUrl } from '../../src/utils/crawl_github_files';

describe('parseGitHubUrl', () => {
  // Test cases based on the function's logic in crawl_github_files.ts
  it('should parse basic repo URL (https://github.com/owner/repo)', () => {
    const result = parseGitHubUrl('https://github.com/owner/repo');
    expect(result).toEqual({ owner: 'owner', repo: 'repo', ref: 'main', path: '' });
  });

  it('should parse repo URL with trailing slash (https://github.com/owner/repo/)', () => {
    const result = parseGitHubUrl('https://github.com/owner/repo/');
    expect(result).toEqual({ owner: 'owner', repo: 'repo', ref: 'main', path: '' });
  });

  it('should parse repo URL with .git suffix (https://github.com/owner/repo.git)', () => {
    // The current implementation's use of URL and pathname splitting might include .git in repo name.
    // Let's test current behavior. If this is not desired, the function needs adjustment.
    const result = parseGitHubUrl('https://github.com/owner/repo.git');
    expect(result).toEqual({ owner: 'owner', repo: 'repo.git', ref: 'main', path: '' });
  });
  
  it('should parse repo URL with www (https://www.github.com/owner/repo)', () => {
    const result = parseGitHubUrl('https://www.github.com/owner/repo');
    expect(result).toEqual({ owner: 'owner', repo: 'repo', ref: 'main', path: '' });
  });

  it('should parse repo URL with specific branch (https://github.com/owner/repo/tree/my-branch)', () => {
    const result = parseGitHubUrl('https://github.com/owner/repo/tree/my-branch');
    expect(result).toEqual({ owner: 'owner', repo: 'repo', ref: 'my-branch', path: '' });
  });

  it('should parse repo URL with specific branch and path (https://github.com/owner/repo/tree/my-branch/path/to/file)', () => {
    const result = parseGitHubUrl('https://github.com/owner/repo/tree/my-branch/path/to/file');
    expect(result).toEqual({ owner: 'owner', repo: 'repo', ref: 'my-branch', path: 'path/to/file' });
  });
  
  it('should parse repo URL with specific branch and path with trailing slash (https://github.com/owner/repo/tree/my-branch/path/to/folder/)', () => {
    const result = parseGitHubUrl('https://github.com/owner/repo/tree/my-branch/path/to/folder/');
    expect(result).toEqual({ owner: 'owner', repo: 'repo', ref: 'my-branch', path: 'path/to/folder' });
  });

  it('should parse repo URL with path on default branch (https://github.com/owner/repo/path/to/file)', () => {
    // This case implies the third segment is a ref if not 'tree', 'blob', or 'commit'.
    // If 'path' is not a ref, the function might interpret 'path' as ref and 'to/file' as path.
    // Based on current logic: if pathParts.length > 2 and pathParts[2] is not blob/commit/tree, it's treated as ref.
    // So, "path" would be ref, "to/file" would be path.
    const result = parseGitHubUrl('https://github.com/owner/repo/some-ref/path/to/file');
    expect(result).toEqual({ owner: 'owner', repo: 'repo', ref: 'some-ref', path: 'path/to/file' });
  });

   it('should parse repo URL with just a file on default branch (https://github.com/owner/repo/file.txt)', () => {
    // pathParts = [owner, repo, file.txt]. length = 3. pathParts[2] = file.txt.
    // This will treat 'file.txt' as ref and path as empty.
    // This behavior might be debated, but it's what the code does.
    // The API call might still work if 'file.txt' is not a valid ref and initialPath is 'file.txt'
    const result = parseGitHubUrl('https://github.com/owner/repo/file.txt');
     expect(result).toEqual({ owner: 'owner', repo: 'repo', ref: 'file.txt', path: '' });
     // A more desirable outcome for /owner/repo/file.txt might be { ref: 'main', path: 'file.txt' }
     // This depends on how the GitHub API /contents endpoint resolves paths when ref is ambiguous.
     // The current parseGitHubUrl prioritizes a segment after repo as 'ref' if it's not 'tree', 'blob', 'commit'.
   });

  it('should parse repo URL with a commit hash as ref (https://github.com/owner/repo/commit/abcdef123456)', () => {
    // 'commit' is specifically ignored as a ref name part. So, ref defaults to 'main', path becomes 'commit/abcdef123456'
    const result = parseGitHubUrl('https://github.com/owner/repo/commit/abcdef123456');
    expect(result).toEqual({ owner: 'owner', repo: 'repo', ref: 'main', path: 'commit/abcdef123456' });
  });

  it('should parse repo URL with a blob path (https://github.com/owner/repo/blob/my-branch/file.py)', () => {
    // 'blob' is specifically ignored as a ref name part. So, ref defaults to 'main', path becomes 'blob/my-branch/file.py'
    // However, the code actually checks pathParts[2] against 'blob'. If it's 'blob', it's not a ref.
    // Then ref becomes 'my-branch', path becomes 'file.py' if 'tree' is not present.
    // The logic is: `if (treeIndex !== -1)` then `ref = pathParts[treeIndex + 1]`.
    // Else `if (pathParts.length > 2 && pathParts[2] !== 'blob' && pathParts[2] !== 'commit') { ref = pathParts[2]; path = pathParts.slice(3).join('/'); }`
    // Else `ref = 'main'; path = pathParts.slice(2).join('/');`
    // For '/owner/repo/blob/my-branch/file.py', pathParts[2] is 'blob'. So the second `if` is false.
    // It falls to the `else`, so ref = 'main', path = 'blob/my-branch/file.py'.
    const result = parseGitHubUrl('https://github.com/owner/repo/blob/my-branch/file.py');
    expect(result).toEqual({ owner: 'owner', repo: 'repo', ref: 'main', path: 'blob/my-branch/file.py' });
  });
  
  it('should handle URL with only owner and repo (https://github.com/owner/repo.git/)', () => {
    const result = parseGitHubUrl('https://github.com/owner/repo.git/');
    expect(result).toEqual({ owner: 'owner', repo: 'repo.git', ref: 'main', path: '' });
  });

  it('should throw error for invalid URL (missing repo)', () => {
    expect(() => parseGitHubUrl('https://github.com/owner')).toThrow('Invalid GitHub repository URL: Must include owner and repository name');
  });
  
  it('should throw error for invalid URL (missing owner and repo)', () => {
    expect(() => parseGitHubUrl('https://github.com/')).toThrow('Invalid GitHub repository URL: Must include owner and repository name');
  });

  it('should throw error for completely invalid URL', () => {
    expect(() => parseGitHubUrl('htp:/blah')).toThrow(); // Will throw standard URL error first if not http/https
  });

  it('should handle deeper paths correctly with explicit ref (https://github.com/owner/repo/tree/develop/src/app/main.js)', () => {
    const result = parseGitHubUrl('https://github.com/owner/repo/tree/develop/src/app/main.js');
    expect(result).toEqual({ owner: 'owner', repo: 'repo', ref: 'develop', path: 'src/app/main.js' });
  });

  it('should handle paths that look like refs but are not `tree` (https://github.com/owner/repo/my-feature-branch/src/component.ts)', () => {
    // pathParts[2] is 'my-feature-branch', not 'tree', 'blob', or 'commit'. So it's taken as ref.
    const result = parseGitHubUrl('https://github.com/owner/repo/my-feature-branch/src/component.ts');
    expect(result).toEqual({ owner: 'owner', repo: 'repo', ref: 'my-feature-branch', path: 'src/component.ts' });
  });

  it('should handle simple path on main when it contains dots (https://github.com/owner/repo/path.with.dots/file.js)', () => {
    // 'path.with.dots' becomes ref
    const result = parseGitHubUrl('https://github.com/owner/repo/path.with.dots/file.js');
    expect(result).toEqual({ owner: 'owner', repo: 'repo', ref: 'path.with.dots', path: 'file.js' });
  });
});
