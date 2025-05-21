import axios, { AxiosRequestConfig, AxiosError } from "axios";
import micromatch from "micromatch";
import { Buffer } from "buffer";

export interface FetchedFile {
	path: string;
	content: string;
}

export interface CrawlGitHubFilesOptions {
	token?: string;
	includePatterns?: string[];
	excludePatterns?: string[];
	maxFileSize?: number;
	useRelativePaths?: boolean;
}

export interface CrawlResult {
	files: FetchedFile[];
	stats: {
		downloadedCount: number;
		skippedCount: number;
		skippedFiles: { path: string; size?: number; reason: string }[];
	};
}

// Helper function for matching patterns
export function shouldIncludeFile(filePath: string, includePatterns?: string[], excludePatterns?: string[]): boolean {
	// console.log(`[DEBUG] shouldIncludeFile - Checking file: ${filePath}`);
	// console.log(`[DEBUG] shouldIncludeFile - Include patterns: ${JSON.stringify(includePatterns)}`);
	// console.log(`[DEBUG] shouldIncludeFile - Exclude patterns: ${JSON.stringify(excludePatterns)}`);

	const micromatchOptions = { dot: true }; // Enable matching dotfiles with globstars

	if (excludePatterns && micromatch.isMatch(filePath, excludePatterns, micromatchOptions)) {
		// console.log(`[DEBUG] shouldIncludeFile - File '${filePath}' Matched EXCLUDE pattern. Result: false`);
		return false;
	}

	if (includePatterns && includePatterns.length > 0) {
		const isIncluded = micromatch.isMatch(filePath, includePatterns, micromatchOptions);
		// console.log(`[DEBUG] shouldIncludeFile - File '${filePath}' vs INCLUDE patterns. Result: ${isIncluded}`);
		return isIncluded;
	}

	// console.log(`[DEBUG] shouldIncludeFile - No specific include patterns, file '${filePath}' included by default. Result: true`);
	return true;
}

// Helper function to parse GitHub URL
export function parseGitHubUrl(url: string): { owner: string; repo: string; ref: string; path: string } {
	// console.log(`[DEBUG] parseGitHubUrl - Input URL: ${url}`);
	const urlObj = new URL(url.replace(/\/$/, "")); // Remove trailing slash for consistency
	const pathParts = urlObj.pathname.split("/").filter((part) => part.length > 0);

	if (pathParts.length < 2) {
		// console.error(`[DEBUG] parseGitHubUrl - Invalid pathParts: ${JSON.stringify(pathParts)}`);
		throw new Error(
			"Invalid GitHub repository URL: Must include owner and repository name (e.g., https://github.com/owner/repo)."
		);
	}

	const owner = pathParts[0];
	const repo = pathParts[1];
	let ref: string;
	let path: string;

	const treeIndex = pathParts.indexOf("tree");
	if (treeIndex !== -1 && treeIndex + 1 < pathParts.length) {
		ref = pathParts[treeIndex + 1];
		path = pathParts.slice(treeIndex + 2).join("/");
	} else if (pathParts.length > 2 && pathParts[2] !== "blob" && pathParts[2] !== "commit") {
		// If no /tree/, and there are more than 2 parts, assume the 3rd part is a ref (branch, tag, commit hash)
		ref = pathParts[2];
		path = pathParts.slice(3).join("/");
	} else {
		// Default to 'main'. This will be overridden if noExplicitRef is true later.
		ref = "main";
		path = pathParts.slice(2).join("/");
	}
	// console.log(`[DEBUG] parseGitHubUrl - Parsed: owner=${owner}, repo=${repo}, ref=${ref}, path=${path}`);
	return { owner, repo, ref, path };
}

// --- Main function ---
export async function crawlGitHubFiles(repoUrl: string, options: CrawlGitHubFilesOptions = {}): Promise<CrawlResult> {
	console.log("[DEBUG] crawlGitHubFiles - repoUrl:", repoUrl);
	console.log("[DEBUG] crawlGitHubFiles - options:", JSON.stringify(options));
	const {
		token,
		includePatterns,
		excludePatterns,
		maxFileSize = 1024 * 1024, // Default 1MB
		useRelativePaths = true,
	} = options;

	const result: CrawlResult = {
		files: [],
		stats: {
			downloadedCount: 0,
			skippedCount: 0,
			skippedFiles: [] as { path: string; size?: number; reason: string }[],
		},
	};

	let parsedUrl;
	try {
		parsedUrl = parseGitHubUrl(repoUrl);
	} catch (error: any) {
		console.error(`[DEBUG] crawlGitHubFiles - Error parsing GitHub URL '${repoUrl}': ${error.message}`);
		result.stats.skippedFiles.push({ path: repoUrl, reason: `Invalid GitHub URL: ${error.message}`, size: 0 });
		result.stats.skippedCount++;
		return result;
	}

	let { owner, repo, ref: parsedRef, path: initialPath } = parsedUrl;
	let effectiveRef = parsedRef; // This will be the ref we actually use

	console.log(
		`[DEBUG] crawlGitHubFiles - Parsed URL: owner=${owner}, repo=${repo}, parsedRef=${parsedRef}, initialPath='${initialPath}'`
	);

	// --- START OF MODIFICATION TO GET DEFAULT BRANCH ---
	const urlObjForRefCheck = new URL(repoUrl.replace(/\/$/, ""));
	const pathPartsForRefCheck = urlObjForRefCheck.pathname.split("/").filter((part) => part.length > 0);

	const hasExplicitRefFromUrl =
		pathPartsForRefCheck.includes("tree") ||
		(pathPartsForRefCheck.length > 2 &&
			pathPartsForRefCheck.indexOf("tree") === -1 &&
			pathPartsForRefCheck[2] !== "blob" &&
			pathPartsForRefCheck[2] !== "commit");

	if (!hasExplicitRefFromUrl) {
		console.log(
			`[DEBUG] crawlGitHubFiles - URL ('${repoUrl}') does not seem to specify an explicit ref. Attempting to fetch 'default_branch' for ${owner}/${repo}.`
		);
		try {
			const repoMetaUrl = `https://api.github.com/repos/${owner}/${repo}`;
			console.log(`[DEBUG] crawlGitHubFiles - Fetching repo metadata from: ${repoMetaUrl}`);
			const repoMetaConfig: AxiosRequestConfig = {};
			if (token) {
				repoMetaConfig.headers = { Authorization: `Bearer ${token}` };
			}
			const repoMetaResponse = await axios.get(repoMetaUrl, repoMetaConfig);
			const defaultBranch = repoMetaResponse.data.default_branch;

			if (defaultBranch) {
				console.log(
					`[DEBUG] crawlGitHubFiles - Default branch from API: '${defaultBranch}'. Using this as 'effectiveRef'.`
				);
				effectiveRef = defaultBranch;
			} else {
				console.warn(
					`[DEBUG] crawlGitHubFiles - Could not determine 'default_branch' from API for ${owner}/${repo}. Will use originally parsed ref: '${parsedRef}'`
				);
			}
		} catch (error: any) {
			let errorMsg = error.message;
			if (axios.isAxiosError(error) && error.response) {
				errorMsg = `Status ${error.response.status} - ${JSON.stringify(error.response.data, null, 2)}`;
			}
			console.error(
				`[DEBUG] crawlGitHubFiles - Error fetching repo metadata for ${owner}/${repo} to determine default_branch: ${errorMsg}. Will use originally parsed ref: '${parsedRef}'`
			);
		}
	} else {
		console.log(
			`[DEBUG] crawlGitHubFiles - URL ('${repoUrl}') appears to specify an explicit ref: '${parsedRef}'. Using this as 'effectiveRef'.`
		);
	}
	// --- END OF MODIFICATION ---

	console.log(`[DEBUG] crawlGitHubFiles - EFFECTIVE REF TO USE for crawl: '${effectiveRef}'`);
	console.log(
		`[DEBUG] crawlGitHubFiles - Starting crawl for: ${owner}/${repo}, ref: ${effectiveRef}, initialPath: '${initialPath}'`
	);

	const visitedDirs = new Set<string>();

	async function fetchDirectory(currentPath: string): Promise<void> {
		console.log(
			`[DEBUG] fetchDirectory - Attempting to fetch directory: ${currentPath} using ref: ${effectiveRef}`
		);
		if (visitedDirs.has(currentPath)) {
			console.warn(`[DEBUG] fetchDirectory - Skipping already visited directory: ${currentPath}`);
			return;
		}
		visitedDirs.add(currentPath);

		const apiUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${currentPath}?ref=${effectiveRef}`;
		console.log(`[DEBUG] fetchDirectory - API URL: ${apiUrl}`);
		const config: AxiosRequestConfig = {};
		if (token) {
			config.headers = { Authorization: `Bearer ${token}` };
		}

		try {
			const response = await axios.get(apiUrl, config);
			const items = response.data;
			console.log(
				`[DEBUG] fetchDirectory - Received ${
					Array.isArray(items) ? items.length : "non-array"
				} items for path '${currentPath}'`
			);

			if (!Array.isArray(items)) {
				console.warn(
					`[DEBUG] fetchDirectory - Expected array for '${currentPath}', received:`,
					typeof items,
					items
				);
				if (items && typeof items === "object" && items.type === "file") {
					console.log(`[DEBUG] fetchDirectory - Path '${currentPath}' is a single file, processing it.`);
					await processFileItem(items);
					return;
				} else if (items && typeof items === "object" && items.type === "symlink" && items.target) {
					console.log(`[DEBUG] fetchDirectory - Skipping symlink at non-array path: ${items.path}`);
					result.stats.skippedFiles.push({
						path: items.path,
						reason: "Symbolic link (non-array path)",
						size: items.size,
					});
					result.stats.skippedCount++;
					return;
				}
				result.stats.skippedFiles.push({
					path: currentPath,
					reason: "Path is not a directory or not found (non-array response)",
					size: 0,
				});
				result.stats.skippedCount++;
				return;
			}

			for (const item of items) {
				console.log(`[DEBUG] fetchDirectory - Processing item: ${item.path}, type: ${item.type}`);
				// const itemApiUrl = item.url; // Not directly used here, but available

				if (item.type === "dir") {
					// Add trailing slash for directory matching, as patterns might expect it
					const dirPathForCheck = item.path.endsWith("/") ? item.path : item.path + "/";
					if (shouldIncludeFile(dirPathForCheck, includePatterns, excludePatterns)) {
						console.log(`[DEBUG] fetchDirectory - Recursing into directory: ${item.path}`);
						await fetchDirectory(item.path);
					} else {
						console.log(`[DEBUG] fetchDirectory - EXCLUDING directory based on patterns: ${item.path}`);
						result.stats.skippedFiles.push({
							path: item.path,
							reason: "Excluded by pattern (directory)",
							size: 0, // Directories don't have a size in this context
						});
						// Note: Files within this excluded directory won't be processed further.
						// If you want to count them as skipped, you'd need to list them.
						// For now, we just skip the directory traversal.
					}
				} else if (item.type === "file") {
					console.log(`[DEBUG] fetchDirectory - Found file, calling processFileItem for: ${item.path}`);
					await processFileItem(item);
				} else if (item.type === "symlink") {
					console.log(
						`[DEBUG] fetchDirectory - Skipping symlink: ${item.path} (target: ${item.target || "N/A"})`
					);
					result.stats.skippedFiles.push({ path: item.path, reason: "Symbolic link", size: item.size });
					result.stats.skippedCount++;
				} else {
					console.log(`[DEBUG] fetchDirectory - Skipping unknown item type '${item.type}': ${item.path}`);
					result.stats.skippedFiles.push({
						path: item.path,
						reason: `Unsupported type: ${item.type}`,
						size: item.size,
					});
					result.stats.skippedCount++;
				}
			}
		} catch (error: any) {
			console.error(`[DEBUG] fetchDirectory - Error in fetchDirectory for path '${currentPath}'`);
			handleApiError(error, apiUrl, currentPath);
		}
	}

	async function processFileItem(item: any): Promise<void> {
		const filePath = item.path;
		const fileSize = item.size;
		console.log(`[DEBUG] processFileItem - Processing file: ${filePath}, Size: ${fileSize}`);

		if (!shouldIncludeFile(filePath, includePatterns, excludePatterns)) {
			console.log(`[DEBUG] processFileItem - File SKIPPED by pattern: ${filePath}`);
			result.stats.skippedFiles.push({ path: filePath, size: fileSize, reason: "Excluded by pattern" });
			result.stats.skippedCount++;
			return;
		}

		if (maxFileSize && fileSize > maxFileSize) {
			console.log(`[DEBUG] processFileItem - File SKIPPED (too large): ${filePath}, Size: ${fileSize}`);
			result.stats.skippedFiles.push({ path: filePath, size: fileSize, reason: "Exceeded maxFileSize" });
			result.stats.skippedCount++;
			return;
		}

		const fileApiUrl = item.git_url || item.url;
		console.log(`[DEBUG] processFileItem - Fetching content for: ${filePath} from ${fileApiUrl}`);
		const config: AxiosRequestConfig = {};
		if (token) {
			config.headers = { Authorization: `Bearer ${token}` };
		}

		try {
			let contentBase64: string;
			if (item.content && item.encoding === "base64") {
				console.log(`[DEBUG] processFileItem - Using existing base64 content for ${filePath}`);
				contentBase64 = item.content;
			} else {
				console.log(`[DEBUG] processFileItem - Fetching content via API for ${filePath} (URL: ${item.url})`);
				const fileDataResponse = await axios.get(item.url, config);
				if (fileDataResponse.data.encoding !== "base64" || !fileDataResponse.data.content) {
					console.warn(
						`[DEBUG] processFileItem - File ${filePath} content not base64 or missing. URL: ${item.url}. Response data:`,
						fileDataResponse.data
					);
					result.stats.skippedFiles.push({
						path: filePath,
						size: fileSize,
						reason: "Content not base64 or missing after fetch",
					});
					result.stats.skippedCount++;
					return;
				}
				contentBase64 = fileDataResponse.data.content;
			}

			const content = Buffer.from(contentBase64, "base64").toString("utf-8");
			// console.log(`[DEBUG] processFileItem - Successfully decoded content for ${filePath} (First 100 chars: ${content.substring(0,100)})`);

			let finalPath = filePath;
			if (useRelativePaths && initialPath && filePath.startsWith(initialPath)) {
				// Ensure initialPath, if not empty, ends with a slash for correct relative path calculation
				const basePath = initialPath.endsWith("/") || initialPath === "" ? initialPath : initialPath + "/";
				if (filePath.startsWith(basePath)) {
					finalPath = filePath.substring(basePath.length);
				}
				// console.log(`[DEBUG] processFileItem - Adjusted finalPath (relative to initialPath '${basePath}'): ${finalPath}`);
			} else {
				// console.log(`[DEBUG] processFileItem - finalPath (no adjustment or not relative): ${finalPath}`);
			}

			result.files.push({ path: finalPath, content });
			result.stats.downloadedCount++;
			console.log(`[DEBUG] processFileItem - File ADDED: ${finalPath} (Size: ${fileSize})`);
		} catch (error: any) {
			console.error(`[DEBUG] processFileItem - Error processing file item for ${filePath}`);
			handleApiError(error, fileApiUrl, filePath);
		}
	}

	function handleApiError(error: any, apiUrl: string, resourcePath: string): void {
		let reason = `API error for ${resourcePath}`;
		console.error(`[DEBUG] handleApiError - API URL: ${apiUrl}, Resource: ${resourcePath}`);
		if (axios.isAxiosError(error)) {
			const axiosError = error as AxiosError;
			reason = `API Error (${axiosError.response?.status || "Unknown status"}) for ${resourcePath}: ${
				axiosError.message
			}`;
			console.error(`[DEBUG] handleApiError - Axios error: ${reason}`, axiosError.response?.data);

			if (axiosError.response?.status === 404) {
				reason = `Resource not found (404): ${resourcePath} at ${apiUrl}. Message: ${
					axiosError.response.data?.message || "N/A"
				}`;
			} else if (axiosError.response?.status === 403) {
				const rateLimitRemaining = axiosError.response.headers["x-ratelimit-remaining"];
				if (rateLimitRemaining === "0") {
					reason = `GitHub API rate limit exceeded for ${resourcePath}.`;
					console.warn(`[DEBUG] handleApiError - ${reason}`);
				} else {
					reason = `GitHub API permission error (403) for ${resourcePath}.`;
					console.warn(`[DEBUG] handleApiError - ${reason}`);
				}
			} else if (axiosError.response?.status === 401) {
				reason = `GitHub API authentication error (401) for ${resourcePath}.`;
				console.error(`[DEBUG] handleApiError - ${reason}`);
			}
		} else {
			reason = `Unexpected error processing ${resourcePath}: ${error.message}`;
			console.error(`[DEBUG] handleApiError - Unexpected error: ${reason}`, error);
		}
		result.stats.skippedFiles.push({ path: resourcePath, reason, size: 0 });
		result.stats.skippedCount++;
	}

	const initialApiUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${initialPath}?ref=${effectiveRef}`;

	try {
		console.log(
			`[DEBUG] crawlGitHubFiles - Preparing to fetch initial path: '${
				initialPath || "repo root"
			}' using ref: '${effectiveRef}'`
		);
		console.log(`[DEBUG] crawlGitHubFiles - Initial API URL: ${initialApiUrl}`);

		const initialConfig: AxiosRequestConfig = {};
		if (token) {
			initialConfig.headers = { Authorization: `Bearer ${token}` };
		}
		const initialResponse = await axios.get(initialApiUrl, initialConfig);
		const initialData = initialResponse.data;
		console.log(
			`[DEBUG] crawlGitHubFiles - Initial response for '${
				initialPath || "repo root"
			}': type is ${typeof initialData}, isArray: ${Array.isArray(initialData)}`
		);

		if (Array.isArray(initialData)) {
			console.log(
				`[DEBUG] crawlGitHubFiles - Initial path '${
					initialPath || "repo root"
				}' is a directory (array response). Iterating ${initialData.length} items.`
			);
			for (const item of initialData) {
				if (item.type === "dir") {
					const dirPathForCheck = item.path.endsWith("/") ? item.path : item.path + "/";
					if (shouldIncludeFile(dirPathForCheck, includePatterns, excludePatterns)) {
						console.log(`[DEBUG] crawlGitHubFiles - (Initial) Recursing into directory: ${item.path}`);
						await fetchDirectory(item.path);
					} else {
						console.log(`[DEBUG] crawlGitHubFiles - (Initial) EXCLUDING directory: ${item.path}`);
						result.stats.skippedFiles.push({
							path: item.path,
							reason: "Excluded by pattern (directory at initial)",
							size: 0,
						});
					}
				} else if (item.type === "file") {
					console.log(`[DEBUG] crawlGitHubFiles - (Initial) Processing file: ${item.path}`);
					await processFileItem(item);
				} else if (item.type === "symlink") {
					console.log(`[DEBUG] crawlGitHubFiles - (Initial) Skipping symlink: ${item.path}`);
					result.stats.skippedFiles.push({
						path: item.path,
						reason: "Symbolic link (initial path)",
						size: item.size,
					});
					result.stats.skippedCount++;
				} else {
					console.log(
						`[DEBUG] crawlGitHubFiles - (Initial) Skipping unknown item type '${item.type}': ${item.path}`
					);
				}
			}
		} else if (typeof initialData === "object" && initialData.type === "file") {
			console.log(`[DEBUG] crawlGitHubFiles - Initial path '${initialPath}' is a single file. Processing.`);
			await processFileItem(initialData);
		} else if (typeof initialData === "object" && initialData.type === "dir") {
			console.log(
				`[DEBUG] crawlGitHubFiles - Initial path '${initialPath}' is a directory (object response). Calling fetchDirectory for its contents: '${
					initialData.path || initialPath || ""
				}'`
			);
			await fetchDirectory(initialData.path || initialPath || "");
		} else if (typeof initialData === "object" && initialData.type === "symlink") {
			console.log(
				`[DEBUG] crawlGitHubFiles - Initial path is a symlink: ${initialData.path} (target: ${
					initialData.target || "N/A"
				})`
			);
			result.stats.skippedFiles.push({
				path: initialData.path,
				reason: "Initial path is a symbolic link",
				size: initialData.size,
			});
			result.stats.skippedCount++;
		} else {
			console.warn(
				`[DEBUG] crawlGitHubFiles - Initial path '${initialPath}' type not recognized or not found. Data:`,
				initialData
			);
			result.stats.skippedFiles.push({
				path: initialPath || `repo root (${owner}/${repo})`,
				reason: "Initial path type not recognized or not found",
				size: 0,
			});
			result.stats.skippedCount++;
		}
	} catch (error: any) {
		console.error(
			`[DEBUG] crawlGitHubFiles - Error fetching/processing initial path '${
				initialPath || "repo root"
			}' using ref '${effectiveRef}'`
		);
		handleApiError(error, initialApiUrl, initialPath || `repo root (${owner}/${repo})`);
	}

	console.log(
		"[DEBUG] crawlGitHubFiles - Crawl finished. Downloaded:",
		result.stats.downloadedCount,
		"Skipped:",
		result.stats.skippedCount
	);
	// console.log("[DEBUG] crawlGitHubFiles - Skipped files details:", JSON.stringify(result.stats.skippedFiles, null, 2));
	return result;
}
