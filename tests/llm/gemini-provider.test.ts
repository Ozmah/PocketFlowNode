import { GeminiProvider } from "../../src/llm/gemini-provider";
import { LlmOptions } from "../../src/llm/llm-provider";
import * as llmUtils from "../../src/utils/llm";
import { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } from "@google/generative-ai";

// Mock '@google/generative-ai' module completely
const mockGenerateContent = jest.fn();
const mockGetGenerativeModel = jest.fn(() => ({
	generateContent: mockGenerateContent,
}));
const mockGoogleGenerativeAIInstance = {
	getGenerativeModel: mockGetGenerativeModel,
};

jest.mock("@google/generative-ai", () => ({
	GoogleGenerativeAI: jest.fn().mockImplementation(() => mockGoogleGenerativeAIInstance),
	HarmCategory: {
		HARM_CATEGORY_HARASSMENT: "HARM_CATEGORY_HARASSMENT",
		HARM_CATEGORY_HATE_SPEECH: "HARM_CATEGORY_HATE_SPEECH",
		HARM_CATEGORY_SEXUALLY_EXPLICIT: "HARM_CATEGORY_SEXUALLY_EXPLICIT",
		HARM_CATEGORY_DANGEROUS_CONTENT: "HARM_CATEGORY_DANGEROUS_CONTENT",
	},
	HarmBlockThreshold: {
		BLOCK_NONE: "BLOCK_NONE",
	},
}));

// Mock utility functions completely
jest.mock("../../src/utils/llm", () => ({
	loadCache: jest.fn(),
	saveCache: jest.fn(),
	logInteraction: jest.fn(),
	hashPrompt: jest.fn(),
	__esModule: true,
}));

describe("GeminiProvider", () => {
	const OLD_ENV = process.env;
	const MOCK_API_KEY = "test-gemini-api-key";
	const MOCK_PROMPT = "Test prompt for Gemini";
	const MOCK_RESPONSE_TEXT = "Test response from Gemini";
	const MOCK_PROMPT_HASH = "geminihash456";

	// Get reference to the mocked GoogleGenerativeAI constructor
	const MockedGoogleGenerativeAIConstructor = GoogleGenerativeAI as jest.MockedClass<typeof GoogleGenerativeAI>;

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

		mockGenerateContent.mockResolvedValue({
			response: { text: () => MOCK_RESPONSE_TEXT },
		});
	});

	describe("Constructor", () => {
		test("should throw an error if GEMINI_API_KEY is not set", () => {
			delete process.env.GEMINI_API_KEY;
			expect(() => new GeminiProvider()).toThrow("GEMINI_API_KEY environment variable is not set.");
		});

		test("should not throw an error if GEMINI_API_KEY is set", () => {
			process.env.GEMINI_API_KEY = MOCK_API_KEY;
			expect(() => new GeminiProvider()).not.toThrow();
		});
	});

	describe("generate method", () => {
		beforeEach(() => {
			process.env.GEMINI_API_KEY = MOCK_API_KEY;
		});

		test("should successfully generate text with cache miss", async () => {
			const provider = new GeminiProvider();
			const options: LlmOptions = { useCache: true };
			const response = await provider.generate(MOCK_PROMPT, options);

			// Verify core functionality
			expect(llmUtils.hashPrompt).toHaveBeenCalledWith(MOCK_PROMPT);
			expect(llmUtils.loadCache).toHaveBeenCalledTimes(2); // Called twice as per implementation
			expect(MockedGoogleGenerativeAIConstructor).toHaveBeenCalledWith(MOCK_API_KEY);
			expect(mockGetGenerativeModel).toHaveBeenCalledWith({
				model: "gemini-2.5-flash",
				safetySettings: [
					{ category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_NONE },
					{ category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_NONE },
					{
						category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
						threshold: HarmBlockThreshold.BLOCK_NONE,
					},
					{
						category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
						threshold: HarmBlockThreshold.BLOCK_NONE,
					},
				],
			});
			expect(mockGenerateContent).toHaveBeenCalledWith(MOCK_PROMPT);
			expect(llmUtils.saveCache).toHaveBeenCalledWith({ [MOCK_PROMPT_HASH]: MOCK_RESPONSE_TEXT });
			expect(llmUtils.logInteraction).toHaveBeenCalledWith(MOCK_PROMPT, MOCK_RESPONSE_TEXT);
			expect(response).toBe(MOCK_RESPONSE_TEXT);

			// Verify console methods were called (even though we're suppressing output)
			expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining("Cache MISS for prompt hash"));
			expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining("Calling LLM (Model: gemini-pro)"));
		});

		test("should successfully generate text without cache", async () => {
			const provider = new GeminiProvider();
			const options: LlmOptions = { useCache: false };
			const response = await provider.generate(MOCK_PROMPT, options);

			expect(llmUtils.hashPrompt).toHaveBeenCalledWith(MOCK_PROMPT);
			expect(llmUtils.loadCache).not.toHaveBeenCalled();
			expect(mockGenerateContent).toHaveBeenCalledTimes(1);
			expect(llmUtils.saveCache).not.toHaveBeenCalled();
			expect(llmUtils.logInteraction).toHaveBeenCalledWith(MOCK_PROMPT, MOCK_RESPONSE_TEXT);
			expect(response).toBe(MOCK_RESPONSE_TEXT);
		});

		test("should handle cache hit scenario", async () => {
			// Override the default empty cache for this test
			(llmUtils.loadCache as jest.Mock).mockResolvedValue({ [MOCK_PROMPT_HASH]: MOCK_RESPONSE_TEXT });

			const provider = new GeminiProvider();
			const options: LlmOptions = { useCache: true };
			const response = await provider.generate(MOCK_PROMPT, options);

			expect(llmUtils.hashPrompt).toHaveBeenCalledWith(MOCK_PROMPT);
			expect(llmUtils.loadCache).toHaveBeenCalledTimes(1);
			expect(mockGenerateContent).not.toHaveBeenCalled();
			expect(llmUtils.saveCache).not.toHaveBeenCalled();
			expect(llmUtils.logInteraction).toHaveBeenCalledWith(MOCK_PROMPT, `[CACHE HIT] ${MOCK_RESPONSE_TEXT}`);
			expect(response).toBe(MOCK_RESPONSE_TEXT);

			expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining("Cache HIT for prompt hash"));
		});

		test("should use custom model name when provided", async () => {
			const customModelName = "gemini-custom-model";

			const provider = new GeminiProvider();
			const options: LlmOptions = { useCache: true, modelName: customModelName };
			await provider.generate(MOCK_PROMPT, options);

			expect(mockGetGenerativeModel).toHaveBeenCalledWith(expect.objectContaining({ model: customModelName }));
		});

		test("should use environment GEMINI_MODEL when available", async () => {
			process.env.GEMINI_MODEL = "env-gemini-model";

			const provider = new GeminiProvider();
			const options: LlmOptions = { useCache: true };
			await provider.generate(MOCK_PROMPT, options);

			expect(mockGetGenerativeModel).toHaveBeenCalledWith(expect.objectContaining({ model: "env-gemini-model" }));
		});

		test("should fallback to default model when no model specified", async () => {
			const provider = new GeminiProvider();
			const options: LlmOptions = { useCache: true };
			await provider.generate(MOCK_PROMPT, options);

			expect(mockGetGenerativeModel).toHaveBeenCalledWith(expect.objectContaining({ model: "gemini-pro" }));
		});

		test("should handle generic API errors", async () => {
			const errorMessage = "Gemini API Error";
			mockGenerateContent.mockRejectedValue(new Error(errorMessage));

			const provider = new GeminiProvider();
			const options: LlmOptions = { useCache: true };

			await expect(provider.generate(MOCK_PROMPT, options)).rejects.toThrow(
				"Gemini LLM API call failed (Model: gemini-pro): Gemini API Error"
			);

			expect(llmUtils.logInteraction).toHaveBeenCalledWith(MOCK_PROMPT, expect.any(Error));
			expect(consoleErrorSpy).toHaveBeenCalledWith(
				expect.stringContaining("Gemini LLM API call failed"),
				expect.any(Error)
			);
		});

		test("should handle Gemini specific error structures", async () => {
			const geminiErrorMessage = "Invalid API key.";
			const errorDetails = "Specific error details from API";
			const apiError = new Error(geminiErrorMessage);
			// @ts-ignore
			apiError.details = errorDetails;
			mockGenerateContent.mockRejectedValue(apiError);

			const provider = new GeminiProvider();

			await expect(provider.generate(MOCK_PROMPT, { useCache: true })).rejects.toThrow(
				"Gemini LLM API call failed (Model: gemini-pro): Invalid API key. - Details: Specific error details from API"
			);

			expect(llmUtils.logInteraction).toHaveBeenCalledWith(MOCK_PROMPT, expect.any(Error));
		});

		test("should handle invalid API response with no response property", async () => {
			mockGenerateContent.mockResolvedValue({});

			const provider = new GeminiProvider();
			await expect(provider.generate(MOCK_PROMPT, { useCache: true })).rejects.toThrow(
				"Gemini LLM API call failed (Model: gemini-pro): Cannot read properties of undefined (reading 'text')"
			);
		});

		test("should handle invalid API response with no text method", async () => {
			mockGenerateContent.mockResolvedValue({
				response: {},
			});

			const provider = new GeminiProvider();
			await expect(provider.generate(MOCK_PROMPT, { useCache: true })).rejects.toThrow(
				"Gemini LLM API call failed (Model: gemini-pro): generationResponse.text is not a function"
			);
		});

		test("should handle invalid API response with text method returning undefined", async () => {
			mockGenerateContent.mockResolvedValue({
				response: { text: () => undefined },
			});

			const provider = new GeminiProvider();
			const response = await provider.generate(MOCK_PROMPT, { useCache: true });

			// GeminiProvider currently returns undefined if response.text() returns undefined
			expect(response).toBeUndefined();
			expect(llmUtils.logInteraction).toHaveBeenCalledWith(MOCK_PROMPT, undefined);
		});
	});
});
