import { ChatGptProvider } from "../../src/llm/chatgpt-provider";
import { LlmOptions } from "../../src/llm/llm-provider";
import * as llmUtils from "../../src/utils/llm";
import OpenAI from "openai";

// Mock 'openai' module completely
const mockCreateChatCompletion = jest.fn();
const mockOpenAIInstance = {
	chat: {
		completions: {
			create: mockCreateChatCompletion,
		},
	},
};

jest.mock("openai", () => {
	return jest.fn().mockImplementation(() => mockOpenAIInstance);
});

// Mock utility functions completely
jest.mock("../../src/utils/llm", () => ({
	loadCache: jest.fn(),
	saveCache: jest.fn(),
	logInteraction: jest.fn(),
	hashPrompt: jest.fn(),
	__esModule: true,
}));

describe("ChatGptProvider", () => {
	const OLD_ENV = process.env;
	const MOCK_API_KEY = "test-openai-api-key";
	const MOCK_PROMPT = "Test prompt for ChatGPT";
	const MOCK_RESPONSE_TEXT = "Test response from ChatGPT";
	const MOCK_PROMPT_HASH = "chatgpthash456";

	// Get reference to the mocked OpenAI constructor
	const MockedOpenAIConstructor = OpenAI as jest.MockedClass<typeof OpenAI>;

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

		mockCreateChatCompletion.mockResolvedValue({
			choices: [{ message: { content: MOCK_RESPONSE_TEXT } }],
		});
	});

	describe("Constructor", () => {
		test("should throw an error if OPENAI_API_KEY is not set", () => {
			delete process.env.OPENAI_API_KEY;
			expect(() => new ChatGptProvider()).toThrow("OPENAI_API_KEY environment variable is not set.");
		});

		test("should not throw an error if OPENAI_API_KEY is set", () => {
			process.env.OPENAI_API_KEY = MOCK_API_KEY;
			expect(() => new ChatGptProvider()).not.toThrow();
			expect(MockedOpenAIConstructor).toHaveBeenCalledWith({ apiKey: MOCK_API_KEY });
		});
	});

	describe("generate method", () => {
		beforeEach(() => {
			process.env.OPENAI_API_KEY = MOCK_API_KEY;
		});

		test("should successfully generate text with cache miss", async () => {
			const provider = new ChatGptProvider();
			const options: LlmOptions = { useCache: true };
			const response = await provider.generate(MOCK_PROMPT, options);

			// Verify core functionality
			expect(llmUtils.hashPrompt).toHaveBeenCalledWith(MOCK_PROMPT);
			expect(llmUtils.loadCache).toHaveBeenCalledTimes(2); // Called twice as per implementation
			expect(mockCreateChatCompletion).toHaveBeenCalledWith({
				messages: [{ role: "user", content: MOCK_PROMPT }],
				model: "gpt-3.5-turbo",
			});
			expect(llmUtils.saveCache).toHaveBeenCalledWith({ [MOCK_PROMPT_HASH]: MOCK_RESPONSE_TEXT });
			expect(llmUtils.logInteraction).toHaveBeenCalledWith(MOCK_PROMPT, MOCK_RESPONSE_TEXT);
			expect(response).toBe(MOCK_RESPONSE_TEXT);

			// Verify console methods were called (even though we're suppressing output)
			expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining("Cache MISS for prompt hash"));
			expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining("Calling LLM (Model: gpt-3.5-turbo)"));
		});

		test("should successfully generate text without cache", async () => {
			const provider = new ChatGptProvider();
			const options: LlmOptions = { useCache: false };
			const response = await provider.generate(MOCK_PROMPT, options);

			expect(llmUtils.hashPrompt).toHaveBeenCalledWith(MOCK_PROMPT);
			expect(llmUtils.loadCache).not.toHaveBeenCalled();
			expect(mockCreateChatCompletion).toHaveBeenCalledTimes(1);
			expect(llmUtils.saveCache).not.toHaveBeenCalled();
			expect(llmUtils.logInteraction).toHaveBeenCalledWith(MOCK_PROMPT, MOCK_RESPONSE_TEXT);
			expect(response).toBe(MOCK_RESPONSE_TEXT);
		});

		test("should handle cache hit scenario", async () => {
			// Override the default empty cache for this test
			(llmUtils.loadCache as jest.Mock).mockResolvedValue({ [MOCK_PROMPT_HASH]: MOCK_RESPONSE_TEXT });

			const provider = new ChatGptProvider();
			const options: LlmOptions = { useCache: true };
			const response = await provider.generate(MOCK_PROMPT, options);

			expect(llmUtils.hashPrompt).toHaveBeenCalledWith(MOCK_PROMPT);
			expect(llmUtils.loadCache).toHaveBeenCalledTimes(1);
			expect(mockCreateChatCompletion).not.toHaveBeenCalled();
			expect(llmUtils.saveCache).not.toHaveBeenCalled();
			expect(llmUtils.logInteraction).toHaveBeenCalledWith(MOCK_PROMPT, `[CACHE HIT] ${MOCK_RESPONSE_TEXT}`);
			expect(response).toBe(MOCK_RESPONSE_TEXT);

			expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining("Cache HIT for prompt hash"));
		});

		test("should use custom model name when provided", async () => {
			const customModelName = "gpt-4-custom";

			const provider = new ChatGptProvider();
			const options: LlmOptions = { useCache: true, modelName: customModelName };
			await provider.generate(MOCK_PROMPT, options);

			expect(mockCreateChatCompletion).toHaveBeenCalledWith(expect.objectContaining({ model: customModelName }));
		});

		test("should use environment OPENAI_MODEL when available", async () => {
			process.env.OPENAI_MODEL = "env-openai-model";

			const provider = new ChatGptProvider();
			const options: LlmOptions = { useCache: true };
			await provider.generate(MOCK_PROMPT, options);

			expect(mockCreateChatCompletion).toHaveBeenCalledWith(
				expect.objectContaining({ model: "env-openai-model" })
			);
		});

		test("should fallback to default model when no model specified", async () => {
			const provider = new ChatGptProvider();
			const options: LlmOptions = { useCache: true };
			await provider.generate(MOCK_PROMPT, options);

			expect(mockCreateChatCompletion).toHaveBeenCalledWith(expect.objectContaining({ model: "gpt-3.5-turbo" }));
		});

		test("should handle generic API errors", async () => {
			const errorMessage = "OpenAI API Error";
			mockCreateChatCompletion.mockRejectedValue(new Error(errorMessage));

			const provider = new ChatGptProvider();
			const options: LlmOptions = { useCache: true };

			await expect(provider.generate(MOCK_PROMPT, options)).rejects.toThrow(
				"ChatGPT LLM API call failed (Model: gpt-3.5-turbo): OpenAI API Error"
			);

			expect(llmUtils.logInteraction).toHaveBeenCalledWith(MOCK_PROMPT, expect.any(Error));
			expect(consoleErrorSpy).toHaveBeenCalledWith(
				expect.stringContaining("ChatGPT LLM API call failed"),
				expect.any(Error)
			);
		});

		test("should handle OpenAI specific error structures", async () => {
			const openAIErrorMessage = "Invalid API key.";
			const apiError = {
				response: {
					data: {
						error: { message: openAIErrorMessage },
					},
				},
			};
			mockCreateChatCompletion.mockRejectedValue(apiError);

			const provider = new ChatGptProvider();

			await expect(provider.generate(MOCK_PROMPT, { useCache: true })).rejects.toThrow(
				"ChatGPT LLM API call failed (Model: gpt-3.5-turbo): Invalid API key."
			);

			expect(llmUtils.logInteraction).toHaveBeenCalledWith(MOCK_PROMPT, expect.any(Error));
		});

		test("should handle invalid API response with no choices", async () => {
			mockCreateChatCompletion.mockResolvedValue({ choices: [] });

			const provider = new ChatGptProvider();
			await expect(provider.generate(MOCK_PROMPT, { useCache: true })).rejects.toThrow(
				"Invalid response structure from OpenAI API."
			);
		});

		test("should handle invalid API response with null content", async () => {
			mockCreateChatCompletion.mockResolvedValue({
				choices: [{ message: { content: null } }],
			});

			const provider = new ChatGptProvider();
			await expect(provider.generate(MOCK_PROMPT, { useCache: true })).rejects.toThrow(
				"Received null or undefined content from OpenAI API."
			);
		});
	});
});
