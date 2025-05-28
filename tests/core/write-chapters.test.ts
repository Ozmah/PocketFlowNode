import { sanitizeFilename, writeChapters } from "../../src/core/write-chapters";
import { Abstraction, FetchedFile, WriteChaptersOptions, ChapterOutput } from "../../src/types";
import { callLlm } from "../../src/utils/llm";

// Mock callLlm
jest.mock("../../src/utils/llm", () => ({
	callLlm: jest.fn(),
}));

describe("sanitizeFilename", () => {
	it("should create basic filename with padded chapter number", () => {
		expect(sanitizeFilename("Introduction", 1)).toBe("01_introduction.md");
		expect(sanitizeFilename("Chapter Ten", 10)).toBe("10_chapter_ten.md");
	});

	it("should replace internal spaces with underscores", () => {
		expect(sanitizeFilename("My Chapter Title", 3)).toBe("03_my_chapter_title.md");
	});

	it("should convert to lowercase", () => {
		expect(sanitizeFilename("UPPERCASE Title", 5)).toBe("05_uppercase_title.md");
	});

	it("should remove special characters except underscore, dot, hyphen, and handle dots correctly", () => {
		// Dots are allowed by the regex [^\w_.-]
		expect(sanitizeFilename("Chapter!@#$%^&*()+=[]{}\\|;:'\",<.>/? End", 7)).toBe("07_chapter._end.md"); // Dot from <.> is preserved
	});

	it("should handle names with existing underscores, dots, hyphens", () => {
		expect(sanitizeFilename("my_chapter-v1.0", 2)).toBe("02_my_chapter-v1.0.md");
	});

	it('should handle empty or only-special-character names with default "chapter"', () => {
		expect(sanitizeFilename("", 1)).toBe("01_chapter.md"); // Trimmed empty, then default
		expect(sanitizeFilename("!@#$", 2)).toBe("02_chapter.md"); // Special chars removed, becomes empty, then default
		expect(sanitizeFilename("   ", 3)).toBe("03_chapter.md"); // Trimmed empty, then default
		expect(sanitizeFilename("___", 4)).toBe("04_chapter.md"); // Only underscores, becomes empty after replace(/_/g, ''), then default
	});

	it("should trim leading/trailing spaces and handle them correctly", () => {
		expect(sanitizeFilename("  Chapter with Spaces  ", 4)).toBe("04_chapter_with_spaces.md");
	});

	it("should handle long names (no specific length limit enforced by function itself)", () => {
		const longName = "a".repeat(100);
		expect(sanitizeFilename(longName, 15)).toBe(`15_${longName}.md`);
	});

	it("should ensure chapter number is padded correctly", () => {
		expect(sanitizeFilename("Single Digit", 1)).toMatch(/^01_/);
		expect(sanitizeFilename("Double Digit", 12)).toMatch(/^12_/);
		expect(sanitizeFilename("Triple Digit", 123)).toMatch(/^123_/); // padStart(2, '0') will still result in '123'
	});
});

describe("writeChapters", () => {
	const mockCallLlm = callLlm as jest.Mock;

	const sampleAbstractions: Abstraction[] = [
		{ name: "Abstraction 1", description: "Desc 1", fileIndices: [0] },
		{ name: "Abstraction 2", description: "Desc 2", fileIndices: [1] },
	];
	const sampleFilesData: FetchedFile[] = [
		{ path: "file1.ts", content: "content1" },
		{ path: "file2.ts", content: "content2" },
	];
	const sampleProjectName = "TestProject";
	const sampleChapterOrder = [0, 1]; // Indices from sampleAbstractions

	beforeEach(() => {
		mockCallLlm.mockReset();
		jest.clearAllMocks();
		mockCallLlm.mockResolvedValue("# Chapter Title\nDefault chapter content.");
	});

	test("should call callLlm for each chapter in order", async () => {
		await writeChapters(sampleChapterOrder, sampleAbstractions, sampleFilesData, sampleProjectName);
		expect(mockCallLlm).toHaveBeenCalledTimes(sampleChapterOrder.length);
		// Check that it was called with prompts containing the abstraction names
		expect(mockCallLlm.mock.calls[0][0]).toContain(sampleAbstractions[0].name);
		expect(mockCallLlm.mock.calls[1][0]).toContain(sampleAbstractions[1].name);
	});

	test("should pass default useCache=true to callLlm if not specified in options", async () => {
		await writeChapters(sampleChapterOrder, sampleAbstractions, sampleFilesData, sampleProjectName, {});
		expect(mockCallLlm).toHaveBeenCalledTimes(sampleChapterOrder.length);
		sampleChapterOrder.forEach((_, index) => {
			expect(mockCallLlm.mock.calls[index][1]).toEqual(
				expect.objectContaining({
					useCache: true,
					providerName: undefined, // Default if not specified
					modelName: undefined, // Default if not specified
				})
			);
		});
	});

	test("should pass specified useCache, providerName, and llmModelName to callLlm", async () => {
		const options: WriteChaptersOptions = {
			useCache: false,
			providerName: "test-provider",
			llmModelName: "test-model-123",
			language: "english", // language is used in prompt, not directly in callLlm options object
		};
		await writeChapters(sampleChapterOrder, sampleAbstractions, sampleFilesData, sampleProjectName, options);

		expect(mockCallLlm).toHaveBeenCalledTimes(sampleChapterOrder.length);
		sampleChapterOrder.forEach((_, index) => {
			expect(mockCallLlm.mock.calls[index][1]).toEqual(
				expect.objectContaining({
					useCache: false,
					providerName: "test-provider",
					modelName: "test-model-123", // Note: llmModelName from WriteChaptersOptions becomes modelName for CallLlmArgs
				})
			);
		});
	});

	test("should pass undefined for providerName and llmModelName if not in options", async () => {
		const options: WriteChaptersOptions = {
			useCache: true,
			language: "french",
		};
		await writeChapters(sampleChapterOrder, sampleAbstractions, sampleFilesData, sampleProjectName, options);

		expect(mockCallLlm).toHaveBeenCalledTimes(sampleChapterOrder.length);
		sampleChapterOrder.forEach((_, index) => {
			expect(mockCallLlm.mock.calls[index][1]).toEqual(
				expect.objectContaining({
					useCache: true,
					providerName: undefined,
					modelName: undefined,
				})
			);
		});
	});

	test("should return chapter outputs with correct structure", async () => {
		mockCallLlm
			.mockResolvedValueOnce(`# Chapter 1: ${sampleAbstractions[0].name}\nContent for Abstraction 1.`)
			.mockResolvedValueOnce(`# Chapter 2: ${sampleAbstractions[1].name}\nContent for Abstraction 2.`);

		const results = await writeChapters(sampleChapterOrder, sampleAbstractions, sampleFilesData, sampleProjectName);

		expect(results).toHaveLength(sampleChapterOrder.length);

		expect(results[0]).toEqual(
			expect.objectContaining({
				chapterNumber: 1,
				abstractionIndex: sampleChapterOrder[0],
				title: sampleAbstractions[0].name,
				content: expect.stringContaining(sampleAbstractions[0].name),
				filename: expect.stringMatching(/^01_/),
			})
		);

		expect(results[1]).toEqual(
			expect.objectContaining({
				chapterNumber: 2,
				abstractionIndex: sampleChapterOrder[1],
				title: sampleAbstractions[1].name,
				content: expect.stringContaining(sampleAbstractions[1].name),
				filename: expect.stringMatching(/^02_/),
			})
		);
	});

	test("should handle empty chapterOrder gracefully", async () => {
		const consoleWarnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
		const results = await writeChapters([], sampleAbstractions, sampleFilesData, sampleProjectName);
		expect(results).toEqual([]);
		expect(mockCallLlm).not.toHaveBeenCalled();
		expect(consoleWarnSpy).toHaveBeenCalledWith(
			"writeChapters called with no chapterOrder. Returning empty array."
		);
		consoleWarnSpy.mockRestore();
	});

	test("should handle missing abstraction for an index gracefully", async () => {
		const consoleWarnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
		// Order references an index not in abstractions array
		const faultyChapterOrder = [0, 2]; // Abstraction at index 2 does not exist

		mockCallLlm.mockImplementation(async (prompt: string, options: any) => {
			if (prompt.includes(sampleAbstractions[0].name))
				return `# Chapter 1: ${sampleAbstractions[0].name}\nContent for Abstraction 1.`;
			return "Default mock LLM response";
		});

		const results = await writeChapters(faultyChapterOrder, sampleAbstractions, sampleFilesData, sampleProjectName);

		expect(mockCallLlm).toHaveBeenCalledTimes(1); // Only called for abstraction 0
		expect(results).toHaveLength(1); // Only one chapter generated
		expect(results[0].title).toBe(sampleAbstractions[0].name);
		expect(consoleWarnSpy).toHaveBeenCalledWith("Skipping chapter 2: Abstraction with index 2 not found.");
		consoleWarnSpy.mockRestore();
	});

	// Edge cases to be implemented

	// test("should handle LLM service failure", () => {

	// });

	// test("should handle malformed LLM response", () => {

	// });
});
