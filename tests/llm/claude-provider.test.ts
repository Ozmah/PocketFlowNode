import { ClaudeProvider } from "../../src/llm/claude-provider";
import { LlmOptions } from "../../src/llm/llm-provider";
import * as llmUtils from "../../src/utils/llm";
import Anthropic from "@anthropic-ai/sdk";

// Mock '@anthropic-ai/sdk' module completely
const mockMessagesCreate = jest.fn();
const mockAnthropicInstance = {
	messages: {
		create: mockMessagesCreate,
	},
};

jest.mock("@anthropic-ai/sdk", () => {
	const constructorMock = jest.fn().mockImplementation(() => mockAnthropicInstance);

	// Mocking specific error classes if needed for instanceof checks
	// @ts-ignore
	constructorMock.APIError = class APIError extends Error {
		status?: number;
		headers?: Record<string, string>;
		constructor(message: string, status?: number, headers?: Record<string, string>) {
			super(message);
			this.name = "APIError"; // Important for error identification
			this.status = status;
			this.headers = headers;
		}
	};
	return constructorMock;
});

// Mock utility functions completely
jest.mock("../../src/utils/llm", () => ({
	loadCache: jest.fn(),
	saveCache: jest.fn(),
	logInteraction: jest.fn(),
	hashPrompt: jest.fn(),
	__esModule: true,
}));

describe("ClaudeProvider", () => {
	const OLD_ENV = process.env;
	const MOCK_API_KEY = "test-anthropic-api-key";
	const MOCK_PROMPT = "Test prompt for Claude";
	const MOCK_RESPONSE_TEXT = "Test response from Claude";
	const MOCK_PROMPT_HASH = "claudehash789";

	// Get reference to the mocked Anthropic constructor
	const MockedAnthropicConstructor = Anthropic as jest.MockedClass<typeof Anthropic>;

	// Spy on console methods to suppress noise during tests
	let consoleWarnSpy: jest.SpyInstance;
	let consoleLogSpy: jest.SpyInstance;
	let consoleErrorSpy: jest.SpyInstance;

	beforeAll(() => {
		// Suppress console output during tests for cleaner test output
		consoleWarnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
		consoleLogSpy = jest.spyOn(console, "log").mockImplementation(() => {});
		consoleErrorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
	});

	afterAll(() => {
		// Restore console methods
		consoleWarnSpy.mockRestore();
		consoleLogSpy.mockRestore();
		consoleErrorSpy.mockRestore();
		process.env = OLD_ENV;
	});

	beforeEach(() => {
		// Reset environment cleanly
		process.env = { ...OLD_ENV };

		// Clear all mocks for consistent state
		jest.clearAllMocks();

		// Set up default mock implementations
		(llmUtils.hashPrompt as jest.Mock).mockReturnValue(MOCK_PROMPT_HASH);
		(llmUtils.loadCache as jest.Mock).mockResolvedValue({});
		(llmUtils.saveCache as jest.Mock).mockResolvedValue(undefined);
		(llmUtils.logInteraction as jest.Mock).mockResolvedValue(undefined);

		mockMessagesCreate.mockResolvedValue({
			content: [{ type: "text", text: MOCK_RESPONSE_TEXT }],
		});
	});

	describe("Constructor", () => {
		test("should throw an error if ANTHROPIC_API_KEY is not set", () => {
			delete process.env.ANTHROPIC_API_KEY;
			expect(() => new ClaudeProvider()).toThrow("ANTHROPIC_API_KEY environment variable is not set.");
		});

		test("should not throw an error if ANTHROPIC_API_KEY is set", () => {
			process.env.ANTHROPIC_API_KEY = MOCK_API_KEY;
			expect(() => new ClaudeProvider()).not.toThrow();
			expect(MockedAnthropicConstructor).toHaveBeenCalledWith({ apiKey: MOCK_API_KEY });
		});
	});

	describe("generate method", () => {
		beforeEach(() => {
			process.env.ANTHROPIC_API_KEY = MOCK_API_KEY;
		});

		test("should successfully generate text with cache miss", async () => {
			const provider = new ClaudeProvider();
			const options: LlmOptions = { useCache: true };
			const response = await provider.generate(MOCK_PROMPT, options);

			// Verify core functionality
			expect(llmUtils.hashPrompt).toHaveBeenCalledWith(MOCK_PROMPT);
			expect(llmUtils.loadCache).toHaveBeenCalledTimes(2); // Called twice as per implementation
			expect(mockMessagesCreate).toHaveBeenCalledWith({
				messages: [{ role: "user", content: MOCK_PROMPT }],
				model: "claude-instant-1.2",
				max_tokens: 2048,
			});
			expect(llmUtils.saveCache).toHaveBeenCalledWith({ [MOCK_PROMPT_HASH]: MOCK_RESPONSE_TEXT });
			expect(llmUtils.logInteraction).toHaveBeenCalledWith(MOCK_PROMPT, MOCK_RESPONSE_TEXT);
			expect(response).toBe(MOCK_RESPONSE_TEXT);

			// Verify console methods were called (even though we're suppressing output)
			expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining("Cache MISS for prompt hash"));
			expect(consoleLogSpy).toHaveBeenCalledWith(
				expect.stringContaining("Calling LLM (Model: claude-instant-1.2)")
			);
		});

		test("should successfully generate text without cache", async () => {
			const provider = new ClaudeProvider();
			const options: LlmOptions = { useCache: false };
			const response = await provider.generate(MOCK_PROMPT, options);

			expect(llmUtils.hashPrompt).toHaveBeenCalledWith(MOCK_PROMPT);
			expect(llmUtils.loadCache).not.toHaveBeenCalled();
			expect(mockMessagesCreate).toHaveBeenCalledTimes(1);
			expect(llmUtils.saveCache).not.toHaveBeenCalled();
			expect(llmUtils.logInteraction).toHaveBeenCalledWith(MOCK_PROMPT, MOCK_RESPONSE_TEXT);
			expect(response).toBe(MOCK_RESPONSE_TEXT);
		});

		test("should handle cache hit scenario", async () => {
			// Override the default empty cache for this test
			(llmUtils.loadCache as jest.Mock).mockResolvedValue({ [MOCK_PROMPT_HASH]: MOCK_RESPONSE_TEXT });

			const provider = new ClaudeProvider();
			const options: LlmOptions = { useCache: true };
			const response = await provider.generate(MOCK_PROMPT, options);

			expect(llmUtils.hashPrompt).toHaveBeenCalledWith(MOCK_PROMPT);
			expect(llmUtils.loadCache).toHaveBeenCalledTimes(1);
			expect(mockMessagesCreate).not.toHaveBeenCalled();
			expect(llmUtils.saveCache).not.toHaveBeenCalled();
			expect(llmUtils.logInteraction).toHaveBeenCalledWith(MOCK_PROMPT, `[CACHE HIT] ${MOCK_RESPONSE_TEXT}`);
			expect(response).toBe(MOCK_RESPONSE_TEXT);

			expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining("Cache HIT for prompt hash"));
		});

		test("should use custom model name when provided", async () => {
			const customModelName = "claude-custom-model";

			const provider = new ClaudeProvider();
			const options: LlmOptions = { useCache: true, modelName: customModelName };
			await provider.generate(MOCK_PROMPT, options);

			expect(mockMessagesCreate).toHaveBeenCalledWith(expect.objectContaining({ model: customModelName }));
		});

		test("should use environment ANTHROPIC_MODEL when available", async () => {
			process.env.ANTHROPIC_MODEL = "env-claude-model";

			const provider = new ClaudeProvider();
			const options: LlmOptions = { useCache: true };
			await provider.generate(MOCK_PROMPT, options);

			expect(mockMessagesCreate).toHaveBeenCalledWith(expect.objectContaining({ model: "env-claude-model" }));
		});

		test("should fallback to default model when no model specified", async () => {
			const provider = new ClaudeProvider();
			const options: LlmOptions = { useCache: true };
			await provider.generate(MOCK_PROMPT, options);

			expect(mockMessagesCreate).toHaveBeenCalledWith(expect.objectContaining({ model: "claude-instant-1.2" }));
		});

		test("should handle generic API errors", async () => {
			const errorMessage = "Anthropic API Error";
			mockMessagesCreate.mockRejectedValue(new Error(errorMessage));

			const provider = new ClaudeProvider();
			const options: LlmOptions = { useCache: true };

			await expect(provider.generate(MOCK_PROMPT, options)).rejects.toThrow(
				"Claude LLM API call failed (Model: claude-instant-1.2): Anthropic API Error"
			);

			expect(llmUtils.logInteraction).toHaveBeenCalledWith(MOCK_PROMPT, expect.any(Error));
			expect(consoleErrorSpy).toHaveBeenCalledWith(
				expect.stringContaining("Claude LLM API call failed"),
				expect.any(Error)
			);
		});

		test("should handle Anthropic specific error structures", async () => {
			const anthropicErrorMessage = "Invalid API key.";
			const status = 401;
			const headers = { "anthropic-request-id": "req_123" };
			const apiError = new (Anthropic as any).APIError(anthropicErrorMessage, status, headers);
			mockMessagesCreate.mockRejectedValue(apiError);

			const provider = new ClaudeProvider();

			await expect(provider.generate(MOCK_PROMPT, { useCache: true })).rejects.toThrow(
				"Claude LLM API call failed (Model: claude-instant-1.2): 401 APIError - Invalid API key. (Request ID: req_123)"
			);

			expect(llmUtils.logInteraction).toHaveBeenCalledWith(MOCK_PROMPT, expect.any(Error));
		});

		test("should handle invalid API response with no content", async () => {
			mockMessagesCreate.mockResolvedValue({ content: [] });

			const provider = new ClaudeProvider();
			await expect(provider.generate(MOCK_PROMPT, { useCache: true })).rejects.toThrow(
				"Invalid or empty response structure from Anthropic API."
			);
		});

		test("should handle invalid API response with wrong content type", async () => {
			mockMessagesCreate.mockResolvedValue({
				content: [{ type: "image", source: {} }],
			});

			const provider = new ClaudeProvider();
			await expect(provider.generate(MOCK_PROMPT, { useCache: true })).rejects.toThrow(
				"Invalid or empty response structure from Anthropic API."
			);
		});
	});
});
