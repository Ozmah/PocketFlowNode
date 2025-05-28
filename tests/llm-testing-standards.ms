# PocketFlow Node.js Testing Standards - Comprehensive LLM Reference Guide

## 📋 Overview

This document serves as the definitive, comprehensive reference for writing and evaluating Jest tests in the PocketFlow Node.js project. It consolidates testing standards, real-world debugging experiences, and proven patterns for Node.js + Express + TypeScript + Jest testing, with special emphasis on LLM Provider testing patterns.

**Target Audience:** LLMs and developers writing tests for PocketFlow Node  
**Scope:** Unit and integration tests using Jest with TypeScript  
**Compliance:** ALL tests must adhere to these standards  
**Status:** Updated with real-world debugging insights and proven solutions

---

## 🎯 Critical Standards Checklist

### ✅ MUST HAVE (Non-negotiable)

-   [ ] Single mock clearing strategy (`jest.clearAllMocks()` ONLY)
-   [ ] Proper TypeScript mock typing
-   [ ] Complete environment variable management
-   [ ] Console output suppression in tests
-   [ ] ESM compatibility (`__esModule: true`)
-   [ ] Defensive beforeEach setup
-   [ ] Comprehensive error scenario coverage
-   [ ] Correct Jest API usage (no asymmetric matchers with `toThrow()`)
-   [ ] Proper mock hoisting patterns

### ⚠️ MUST NOT HAVE (Anti-patterns)

-   [ ] Mixed mock clearing (`mockReset()` + `jest.clearAllMocks()`)
-   [ ] Unhandled environment pollution
-   [ ] Console noise in test output
-   [ ] Incomplete mock configurations
-   [ ] Missing TypeScript types for mocks
-   [ ] `expect.stringContaining()` with `rejects.toThrow()` or `toThrow()`
-   [ ] `jest.resetModules()` (resets module cache, causes re-imports)
-   [ ] Mock hoisting violations (using variables before declaration)

---

## 🚨 Mock Hoisting: Critical Understanding

### The Problem

JavaScript hoisting and Jest's mock system can create initialization order issues that cause tests to fail with cryptic errors like:

```
ReferenceError: Cannot access 'mockVariable' before initialization
```

### ✅ CORRECT Mock Hoisting Pattern

**PROVEN SUCCESSFUL PATTERN** (From `chatgpt-provider.test.ts`):

```typescript
// ✅ CORRECT: Define mock structure BEFORE jest.mock()
const mockCreateChatCompletion = jest.fn();
const mockProviderInstance = {
	chat: {
		completions: {
			create: mockCreateChatCompletion,
		},
	},
};

// ✅ CORRECT: Define everything inside jest.mock() callback
jest.mock("external-module", () => {
	return jest.fn().mockImplementation(() => mockProviderInstance);
});

// ✅ CORRECT: Get typed reference AFTER the mock
const MockedConstructor = ExternalModule as jest.MockedClass<typeof ExternalModule>;
```

### ❌ INCORRECT Mock Hoisting Patterns

```typescript
// ❌ BAD: Trying to use variable in jest.mock() before it's fully initialized
const mockConstructor = jest.fn()...
jest.mock("module", () => mockConstructor); // ERROR: hoisting issue

// ❌ BAD: Complex mock definition that references uninitialized variables
jest.mock("module", () => mockComplexVariable); // If mockComplexVariable uses other mocks

// ❌ BAD: Trying to add properties to jest.fn() in global scope
const mockFn = jest.fn();
mockFn.APIError = class APIError extends Error {}; // Can cause hoisting issues
```

### 🔧 LLM Provider Mock Patterns (PROVEN)

Based on successful implementations, here are the exact patterns that work:

#### For OpenAI (ChatGPT) - REFERENCE PATTERN

```typescript
// ✅ PROVEN SUCCESSFUL - Use this as template
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

// Get typed reference after mock
const MockedOpenAIConstructor = OpenAI as jest.MockedClass<typeof OpenAI>;
```

#### For Anthropic (Claude) - ADAPTED PATTERN

```typescript
// ✅ CORRECT: Following the proven OpenAI pattern
const mockMessagesCreate = jest.fn();
const mockAnthropicInstance = {
	messages: {
		create: mockMessagesCreate,
	},
};

jest.mock("@anthropic-ai/sdk", () => {
	// Define everything inside the callback to avoid hoisting issues
	const constructorMock = jest.fn().mockImplementation(() => mockAnthropicInstance);

	// @ts-ignore - Necessary for adding APIError class
	constructorMock.APIError = class APIError extends Error {
		status?: number;
		headers?: Record<string, string>;
		constructor(message: string, status?: number, headers?: Record<string, string>) {
			super(message);
			this.name = "APIError";
			this.status = status;
			this.headers = headers;
		}
	};
	return constructorMock;
});

const MockedAnthropicConstructor = Anthropic as jest.MockedClass<typeof Anthropic>;
```

#### For Google AI (Gemini) - ADAPTED PATTERN

```typescript
// ✅ CORRECT: Following the proven pattern
const mockGenerateContent = jest.fn();
const mockGetGenerativeModel = jest.fn(() => ({
	generateContent: mockGenerateContent,
}));

jest.mock("@google/generative-ai", () => ({
	GoogleGenerativeAI: jest.fn(() => ({
		getGenerativeModel: mockGetGenerativeModel,
	})),
	HarmCategory: {
		HARM_CATEGORY_HARASSMENT: "HARM_CATEGORY_HARASSMENT",
		// ... other categories
	},
	HarmBlockThreshold: {
		BLOCK_NONE: "BLOCK_NONE",
	},
}));

const MockedGoogleGenerativeAIConstructor = GoogleGenerativeAI as jest.MockedClass<typeof GoogleGenerativeAI>;
```

---

## 🔧 1. Mock Configuration Standards

### ✅ CORRECT Mock Setup

```typescript
// External module mocking following proven patterns
const mockApiMethod = jest.fn();
const mockProviderInstance = {
	api: {
		method: mockApiMethod,
	},
};

jest.mock("external-module", () => {
	return jest.fn().mockImplementation(() => mockProviderInstance);
});

// Internal module mocking with ESM compatibility
jest.mock("../../src/utils/module", () => ({
	functionA: jest.fn(),
	functionB: jest.fn(),
	functionC: jest.fn(),
	__esModule: true, // 🎯 CRITICAL for ESM compatibility
}));
```

### ❌ INCORRECT Mock Setup

```typescript
// ❌ BAD: Hoisting violation
const mockVariable = complexInitialization();
jest.mock("module", () => mockVariable); // Can cause hoisting errors

// ❌ BAD: Missing ESM compatibility
jest.mock("../../src/utils/module", () => ({
	functionA: jest.fn(),
	functionB: jest.fn(),
	// Missing __esModule: true
}));

// ❌ BAD: Partial mock that allows real code execution
jest.mock("external-module", () => ({
	...jest.requireActual("external-module"),
	specificFunction: jest.fn(),
}));
```

---

## 🧹 2. Mock Lifecycle Management

### ✅ CORRECT Cleanup Pattern

```typescript
describe("ComponentName", () => {
	beforeEach(() => {
		// ✅ SINGLE source of truth for mock clearing
		jest.clearAllMocks();

		// ✅ Set up default mock implementations AFTER clearing
		(mockFunction as jest.Mock).mockReturnValue(defaultValue);
		(mockAsyncFunction as jest.Mock).mockResolvedValue(defaultAsyncValue);
	});
});
```

### ❌ INCORRECT Cleanup Patterns

```typescript
beforeEach(() => {
	// ❌ BAD: jest.resetModules() is a critical anti-pattern
	jest.resetModules(); // NEVER USE THIS

	// ❌ BAD: Redundant and potentially conflicting
	mockSpecificFunction.mockReset();
	mockAnotherFunction.mockClear();
	jest.clearAllMocks(); // This makes the above redundant

	// ❌ BAD: Manual cleanup of individual mocks when using clearAllMocks
	(utils.function as jest.Mock).mockReset();
});
```

---

## 🌍 3. Environment Variable Management

### ✅ CORRECT Environment Handling

```typescript
describe("ProviderClass", () => {
	const OLD_ENV = process.env;

	afterAll(() => {
		process.env = OLD_ENV; // ✅ Always restore
	});

	beforeEach(() => {
		process.env = { ...OLD_ENV }; // ✅ Clean slate per test

		// Set required env vars for test
		process.env.REQUIRED_API_KEY = MOCK_API_KEY;
	});

	test("should handle missing environment variable", () => {
		delete process.env.REQUIRED_API_KEY; // ✅ Safe deletion
		expect(() => new ProviderClass()).toThrow("REQUIRED_API_KEY environment variable is not set.");
	});
});
```

### ❌ INCORRECT Environment Handling

```typescript
// ❌ BAD: No backup of original environment
beforeEach(() => {
	process.env.API_KEY = "test-key";
});

// ❌ BAD: Direct mutation without restoration
test("missing env var test", () => {
	process.env.API_KEY = undefined; // Dangerous
	// ... rest of test
});

// ❌ BAD: No cleanup
afterAll(() => {
	// Missing environment restoration
});
```

---

## 🤫 4. Console Output Management

### ✅ CORRECT Console Suppression

```typescript
describe("ClassWithLogging", () => {
	let consoleWarnSpy: jest.SpyInstance;
	let consoleLogSpy: jest.SpyInstance;
	let consoleErrorSpy: jest.SpyInstance;

	beforeAll(() => {
		// ✅ Suppress noise while preserving testability
		consoleWarnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
		consoleLogSpy = jest.spyOn(console, "log").mockImplementation(() => {});
		consoleErrorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
	});

	afterAll(() => {
		// ✅ Always restore console methods
		consoleWarnSpy.mockRestore();
		consoleLogSpy.mockRestore();
		consoleErrorSpy.mockRestore();
	});

	test("should log expected messages", async () => {
		await someFunction();

		// ✅ Verify console calls even when suppressed
		expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining("Expected log message"));
	});
});
```

### ❌ INCORRECT Console Management

```typescript
// ❌ BAD: No console suppression (noisy tests)
describe("ClassWithLogging", () => {
	// No console management
});

// ❌ BAD: Incomplete suppression
beforeAll(() => {
	jest.spyOn(console, "log").mockImplementation(() => {}); // Only log, missing warn/error
});

// ❌ BAD: No restoration
afterAll(() => {
	// Missing mockRestore() calls
});
```

---

## 📝 5. TypeScript Mock Typing Standards

### ✅ CORRECT TypeScript Mock Typing

```typescript
// ✅ Proper constructor mock typing - PROVEN PATTERN
const MockedConstructor = ExternalClass as jest.MockedClass<typeof ExternalClass>;

// ✅ Proper function mock typing with utility imports
import * as utils from "../../src/utils/module";
(utils.functionName as jest.Mock).mockReturnValue(value);

// ✅ Alternative: Using jest.mocked() (Jest 27+)
import { jest } from "@jest/globals";
const mockedFunction = jest.mocked(utils.functionName);
mockedFunction.mockReturnValue(value);

// ✅ Type-safe mock verification
expect(MockedConstructor).toHaveBeenCalledWith(expectedArgs);
```

### ❌ INCORRECT TypeScript Mock Typing

```typescript
// ❌ BAD: Using 'any' to bypass typing
(utils.functionName as any).mockReturnValue(value);

// ❌ BAD: No typing for constructor mocks
const mockedConstructor = ExternalClass; // Missing jest.MockedClass

// ❌ BAD: Incorrect assertion casting
expect(ExternalClass as any).toHaveBeenCalled();
```

---

## 🧪 6. Test Structure Standards

### ✅ CORRECT Test Organization (PROVEN PATTERN)

Based on successful LLM Provider tests:

```typescript
describe("ProviderName", () => {
	// ✅ Constants defined at top level
	const OLD_ENV = process.env;
	const MOCK_API_KEY = "test-api-key";
	const MOCK_PROMPT = "Test prompt";
	const MOCK_RESPONSE_TEXT = "Test response";
	const MOCK_PROMPT_HASH = "testhash123";

	// ✅ Console suppression (always include for LLM providers)
	let consoleWarnSpy: jest.SpyInstance;
	let consoleLogSpy: jest.SpyInstance;
	let consoleErrorSpy: jest.SpyInstance;

	beforeAll(() => {
		consoleWarnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
		consoleLogSpy = jest.spyOn(console, "log").mockImplementation(() => {});
		consoleErrorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
	});

	afterAll(() => {
		consoleWarnSpy.mockRestore();
		consoleLogSpy.mockRestore();
		consoleErrorSpy.mockRestore();
		process.env = OLD_ENV;
	});

	beforeEach(() => {
		// ✅ Environment reset and mock clearing ONLY
		process.env = { ...OLD_ENV };
		jest.clearAllMocks();

		// ✅ Set up default mock implementations
		(llmUtils.hashPrompt as jest.Mock).mockReturnValue(MOCK_PROMPT_HASH);
		(llmUtils.loadCache as jest.Mock).mockResolvedValue({});
		mockApiMethod.mockResolvedValue(mockSuccessResponse);
	});

	describe("Constructor", () => {
		test("should throw an error if API_KEY is not set", () => {
			delete process.env.API_KEY;
			expect(() => new ProviderClass()).toThrow("API_KEY environment variable is not set.");
		});

		test("should not throw an error if API_KEY is set", () => {
			process.env.API_KEY = MOCK_API_KEY;
			expect(() => new ProviderClass()).not.toThrow();
		});
	});

	describe("generate method", () => {
		beforeEach(() => {
			process.env.API_KEY = MOCK_API_KEY;
		});

		// ✅ Cache tests following proven pattern
		test("should successfully generate text with cache miss", async () => {
			const provider = new ProviderClass();
			const options: LlmOptions = { useCache: true };
			const response = await provider.generate(MOCK_PROMPT, options);

			// ✅ CONSISTENT ORDER: Input validation
			expect(llmUtils.hashPrompt).toHaveBeenCalledWith(MOCK_PROMPT);

			// ✅ Cache operations
			expect(llmUtils.loadCache).toHaveBeenCalledTimes(2);

			// ✅ API calls
			expect(MockedConstructor).toHaveBeenCalledWith({ apiKey: MOCK_API_KEY });
			expect(mockApiMethod).toHaveBeenCalledWith(expectedCallStructure);

			// ✅ Side effects
			expect(llmUtils.saveCache).toHaveBeenCalledWith({ [MOCK_PROMPT_HASH]: MOCK_RESPONSE_TEXT });
			expect(llmUtils.logInteraction).toHaveBeenCalledWith(MOCK_PROMPT, MOCK_RESPONSE_TEXT);

			// ✅ Return value
			expect(response).toBe(MOCK_RESPONSE_TEXT);

			// ✅ Console verification (if applicable)
			expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining("Cache MISS"));
		});

		// ... other tests following same pattern
	});
});
```

---

## 🎯 7. Assertion Standards

### ✅ CORRECT Assertions (PROVEN ORDER)

Based on successful LLM Provider tests, use this consistent order:

```typescript
test("should perform complete operation", async () => {
	const result = await provider.generate(MOCK_PROMPT, options);

	// 1. ✅ Input validation
	expect(llmUtils.hashPrompt).toHaveBeenCalledWith(MOCK_PROMPT);

	// 2. ✅ Cache operations
	expect(llmUtils.loadCache).toHaveBeenCalledTimes(2);

	// 3. ✅ API calls
	expect(MockedConstructor).toHaveBeenCalledWith(expectedArgs);
	expect(mockApiMethod).toHaveBeenCalledWith(expectedCallStructure);

	// 4. ✅ Side effects
	expect(llmUtils.saveCache).toHaveBeenCalledWith(expectedData);
	expect(llmUtils.logInteraction).toHaveBeenCalledWith(MOCK_PROMPT, MOCK_RESPONSE_TEXT);

	// 5. ✅ Return value
	expect(result).toBe(EXPECTED_RESULT);

	// 6. ✅ Console verification (if applicable)
	expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining("Expected message"));

	// 7. ✅ Negative cases
	expect(mockUnrelatedFunction).not.toHaveBeenCalled();
});
```

### ❌ INCORRECT Assertions

```typescript
test("incomplete test", async () => {
	// ❌ BAD: Only testing return value
	const result = await provider.generate(MOCK_PROMPT);
	expect(result).toBe(EXPECTED_RESULT);

	// Missing verification of:
	// - Function calls
	// - Side effects
	// - Negative cases
});
```

---

## 🎯 8. Jest API Limitations and Error Testing Patterns

### ✅ CORRECT Error Testing Patterns

```typescript
describe("Error Testing Best Practices", () => {
	test("should handle API errors with regex patterns", async () => {
		const errorMessage = "API Error";
		mockFunction.mockRejectedValue(new Error(errorMessage));

		// ✅ CORRECT: Use regex for flexible matching
		await expect(provider.method()).rejects.toThrow(/API Error.*failed.*status/);

		// ✅ CORRECT: Use exact string if known
		await expect(provider.method()).rejects.toThrow("Exact error message expected");

		// ✅ CORRECT: Use Error class
		await expect(provider.method()).rejects.toThrow(Error);
	});

	test("should handle provider-specific errors correctly", async () => {
		// ✅ REAL-WORLD EXAMPLE: Match actual error messages
		const genericErrorMessage = "Network Error";
		mockApiCall.mockRejectedValue(new Error(genericErrorMessage));

		// ✅ CORRECT: Test actual behavior, not idealized behavior
		await expect(provider.generate(MOCK_PROMPT)).rejects.toThrow(
			"Provider LLM API call failed (Model: model-name): Network Error"
		);

		expect(llmUtils.logInteraction).toHaveBeenCalledWith(MOCK_PROMPT, expect.any(Error));
	});

	test("should verify error details separately when complex", async () => {
		mockFunction.mockRejectedValue(new Error("API Error"));

		try {
			await provider.method();
			fail("Should have thrown an error");
		} catch (error) {
			// ✅ CORRECT: Detailed verification after catch
			expect(error).toBeInstanceOf(Error);
			expect(error.message).toContain("API Error");
			expect(error.message).toMatch(/API.*Error/);
		}
	});
});
```

### ❌ INCORRECT Error Testing Anti-Patterns

```typescript
// ❌ BAD: rejects.toThrow() with asymmetric matchers
await expect(method()).rejects.toThrow(
	expect.stringContaining("message") // DOES NOT WORK
);

// ❌ BAD: Complex matchers with rejects.toThrow()
await expect(method()).rejects.toThrow(
	expect.objectContaining({ message: "error" }) // WILL FAIL
);

// ❌ BAD: Testing idealized behavior instead of actual behavior
await expect(provider.generate()).rejects.toThrow(
	"Invalid response structure from API" // If provider doesn't actually validate this
);
```

### 📋 toThrow() and rejects.toThrow() API Reference

**ACCEPTS:**

-   ✅ String (exact match): `"Exact error message"`
-   ✅ RegExp (pattern match): `/API.*Error/`
-   ✅ Error Class: `Error`, `TypeError`, etc.
-   ✅ Error Instance: `new Error("message")`

**DOES NOT ACCEPT:**

-   ❌ `expect.stringContaining()`
-   ❌ `expect.objectContaining()`
-   ❌ `expect.arrayContaining()`
-   ❌ Any asymmetric matchers

---

## 🚨 9. Real-World Error Scenarios (LEARNED FROM DEBUGGING)

### ✅ Test Actual Behavior, Not Idealized Behavior

**CRITICAL LESSON:** Always test what the code actually does, not what you think it should do.

```typescript
// ✅ CORRECT: Test actual GeminiProvider behavior
test("should handle malformed response correctly", async () => {
	// Mock actual malformed response
	mockGenerateContent.mockResolvedValue({});

	const provider = new GeminiProvider();

	// ✅ Test actual error message generated by the provider
	await expect(provider.generate(MOCK_PROMPT, { useCache: true })).rejects.toThrow(
		"Gemini LLM API call failed (Model: gemini-pro): Cannot read properties of undefined (reading 'text')"
	);
});

// ✅ CORRECT: Some providers don't validate undefined responses
test("should handle undefined response from API", async () => {
	mockGenerateContent.mockResolvedValue({
		response: { text: () => undefined },
	});

	const provider = new GeminiProvider();
	const response = await provider.generate(MOCK_PROMPT, { useCache: true });

	// ✅ Test actual behavior: provider returns undefined
	expect(response).toBeUndefined();
	expect(llmUtils.logInteraction).toHaveBeenCalledWith(MOCK_PROMPT, undefined);
});
```

### ❌ INCORRECT: Testing Idealized Behavior

```typescript
// ❌ BAD: Testing behavior that doesn't exist
test("should validate API response", async () => {
	mockApiCall.mockResolvedValue({ invalid: "response" });

	// ❌ This will fail if the provider doesn't actually validate responses
	await expect(provider.generate()).rejects.toThrow("Invalid response structure from API");
});
```

---

## 🔍 10. Cache Testing Patterns (PROVEN)

### ✅ CORRECT Cache Testing

```typescript
describe("Caching Behavior", () => {
	test("should handle cache miss scenario", async () => {
		(llmUtils.loadCache as jest.Mock).mockResolvedValue({}); // Empty cache

		const result = await provider.generate(MOCK_PROMPT, { useCache: true });

		// ✅ Verify cache operations in correct order
		expect(llmUtils.hashPrompt).toHaveBeenCalledWith(MOCK_PROMPT);
		expect(llmUtils.loadCache).toHaveBeenCalledTimes(2); // Load + reload before save
		expect(mockApiCall).toHaveBeenCalledTimes(1);
		expect(llmUtils.saveCache).toHaveBeenCalledWith({ [MOCK_HASH]: MOCK_RESPONSE });
		expect(llmUtils.logInteraction).toHaveBeenCalledWith(MOCK_PROMPT, MOCK_RESPONSE);

		expect(result).toBe(MOCK_RESPONSE);
	});

	test("should handle cache hit scenario", async () => {
		(llmUtils.loadCache as jest.Mock).mockResolvedValue({ [MOCK_HASH]: MOCK_RESPONSE });

		const result = await provider.generate(MOCK_PROMPT, { useCache: true });

		// ✅ Verify cache short-circuit
		expect(llmUtils.loadCache).toHaveBeenCalledTimes(1);
		expect(mockApiCall).not.toHaveBeenCalled();
		expect(llmUtils.saveCache).not.toHaveBeenCalled();
		expect(llmUtils.logInteraction).toHaveBeenCalledWith(MOCK_PROMPT, `[CACHE HIT] ${MOCK_RESPONSE}`);

		expect(result).toBe(MOCK_RESPONSE);
	});

	test("should not use cache when useCache is false", async () => {
		const result = await provider.generate(MOCK_PROMPT, { useCache: false });

		// ✅ Verify cache bypass
		expect(llmUtils.hashPrompt).toHaveBeenCalledWith(MOCK_PROMPT);
		expect(llmUtils.loadCache).not.toHaveBeenCalled();
		expect(mockApiCall).toHaveBeenCalledTimes(1);
		expect(llmUtils.saveCache).not.toHaveBeenCalled();
		expect(llmUtils.logInteraction).toHaveBeenCalledWith(MOCK_PROMPT, MOCK_RESPONSE);

		expect(result).toBe(MOCK_RESPONSE);
	});
});
```

---

## 📊 11. Coverage Requirements

### ✅ MANDATORY Test Coverage

-   **Constructor scenarios**: Valid initialization, missing dependencies
-   **Happy path**: All primary functionality with expected inputs
-   **Error scenarios**: API failures, invalid responses, network issues
-   **Edge cases**: Empty inputs, null values, boundary conditions
-   **Configuration variants**: Different options, environment variables
-   **Cache behavior**: Hit, miss, disabled scenarios
-   **Async patterns**: Promise resolution, rejection, timeout handling
-   **Real-world malformed responses**: Test actual provider behavior

---

## 🚫 12. Anti-Patterns to Avoid (UPDATED)

### ❌ CRITICAL Violations

```typescript
// ❌ jest.resetModules() - CRITICAL ANTI-PATTERN
beforeEach(() => {
	jest.resetModules(); // NEVER USE - causes performance issues and state problems
});

// ❌ Mock hoisting violations
const mockVariable = complexInitialization();
jest.mock("module", () => mockVariable); // Can cause hoisting errors

// ❌ Mixed mock clearing strategies
beforeEach(() => {
	mockFunction.mockReset();
	jest.clearAllMocks(); // REDUNDANT and potentially harmful
});

// ❌ Environment pollution
test("env test", () => {
	process.env.KEY = "value"; // No restoration
});

// ❌ Incomplete mocking allowing real code execution
jest.mock("module", () => ({
	...jest.requireActual("module"), // DANGEROUS partial mock
	specificFunction: jest.fn(),
}));

// ❌ Testing idealized instead of actual behavior
await expect(provider.method()).rejects.toThrow(
	"Perfect validation message" // If provider doesn't actually generate this
);

// ❌ Missing async handling
test("async test", () => {
	provider.asyncMethod(); // Missing await
	expect(result).toBe(expected); // Will fail
});

// ❌ Using asymmetric matchers with toThrow
await expect(method()).rejects.toThrow(
	expect.stringContaining("error") // WILL FAIL
);
```

---

## 🔍 13. Common Test Failure Patterns & Debugging (REAL-WORLD)

### Mock Hoisting Errors

**SYMPTOM:** `ReferenceError: Cannot access 'mockVariable' before initialization`  
**CAUSE:** Using variables in `jest.mock()` callback that aren't properly hoisted  
**SOLUTION:** Follow the proven patterns from Section 2

```typescript
// ✅ SOLUTION: Define everything needed inside jest.mock()
jest.mock("module", () => {
	const mockInstance = { method: jest.fn() };
	const constructorMock = jest.fn().mockImplementation(() => mockInstance);
	return constructorMock;
});
```

### Failed rejects.toThrow() Tests

**SYMPTOM:** Test fails with "Expected asymmetric matcher" error  
**CAUSE:** Using `expect.stringContaining()` with `rejects.toThrow()`  
**SOLUTION:** Use regex patterns or exact strings

**SYMPTOM:** Error message doesn't match expected pattern  
**SOLUTION:** Debug actual error messages:

```typescript
test("debug error messages", async () => {
	try {
		await provider.method();
		fail("Should have thrown");
	} catch (error) {
		console.log("ACTUAL ERROR:", error.message); // Debug actual message
		// Then create appropriate test expectation
		expect(error.message).toMatch(/actual.*pattern/);
	}
});
```

### Provider Behavior Mismatches

**SYMPTOM:** Tests expect specific validation errors but get generic JavaScript errors  
**SOLUTION:** Test actual provider behavior, not idealized behavior

```typescript
// ✅ CORRECT: Test what actually happens
test("should handle malformed response", async () => {
	mockApiCall.mockResolvedValue({});

	// Test the actual error that gets thrown
	await expect(provider.generate()).rejects.toThrow("Cannot read properties of undefined (reading 'property')");
});
```

---

## 📋 LLM Evaluation Checklist (UPDATED)

When evaluating or writing tests, verify:

1. **Mock Strategy**: Single `jest.clearAllMocks()` pattern? ✅/❌
2. **TypeScript**: Proper mock typing throughout? ✅/❌
3. **Environment**: Complete env var backup/restore? ✅/❌
4. **Console**: Suppressed but verifiable console output? ✅/❌
5. **Coverage**: All required scenarios covered? ✅/❌
6. **Error Handling**: Tests actual provider behavior? ✅/❌
7. **Async**: Proper async/await usage? ✅/❌
8. **Assertions**: Complete verification in correct order? ✅/❌
9. **Anti-patterns**: No forbidden patterns present? ✅/❌
10. **ESM**: `__esModule: true` in module mocks? ✅/❌
11. **Error Testing**: Uses correct patterns with `rejects.toThrow()`? ✅/❌
12. **Jest API**: Avoids asymmetric matchers with `toThrow()`? ✅/❌
13. **jest.resetModules()**: Avoids use of `jest.resetModules()`? ✅/❌
14. **Mock Hoisting**: Follows proven hoisting patterns? ✅/❌

**COMPLIANCE SCORE**: \_\_\_/14 (Must be 14/14 for approval)

---

## 📝 Standard Test List for LlmProvider (COMPREHENSIVE)

This section defines the exact test cases that must be implemented for any `LlmProvider`, based on proven successful implementations.

### Constructor Tests (MANDATORY)

```typescript
describe("Constructor", () => {
	test("should throw an error if API_KEY is not set", () => {
		delete process.env.PROVIDER_API_KEY;
		expect(() => new ProviderClass()).toThrow("PROVIDER_API_KEY environment variable is not set.");
	});

	test("should not throw an error if API_KEY is set", () => {
		process.env.PROVIDER_API_KEY = MOCK_API_KEY;
		expect(() => new ProviderClass()).not.toThrow();
		expect(MockedConstructor).toHaveBeenCalledWith({ apiKey: MOCK_API_KEY });
	});
});
```

### Generate Method Tests (COMPREHENSIVE)

#### Cache Handling (MANDATORY - All 3 scenarios)

```typescript
test("successful API call with no cache hit (useCache=true, cache empty)", async () => {
	const provider = new ProviderClass();
	const options: LlmOptions = { useCache: true };
	const response = await provider.generate(MOCK_PROMPT, options);

	// 1. Input validation
	expect(llmUtils.hashPrompt).toHaveBeenCalledWith(MOCK_PROMPT);

	// 2. Cache operations
	expect(llmUtils.loadCache).toHaveBeenCalledTimes(2);

	// 3. API calls
	expect(MockedConstructor).toHaveBeenCalledWith({ apiKey: MOCK_API_KEY });
	expect(mockApiMethod).toHaveBeenCalledWith(expectedStructure);

	// 4. Side effects
	expect(llmUtils.saveCache).toHaveBeenCalledWith({ [MOCK_PROMPT_HASH]: MOCK_RESPONSE_TEXT });
	expect(llmUtils.logInteraction).toHaveBeenCalledWith(MOCK_PROMPT, MOCK_RESPONSE_TEXT);

	// 5. Return value
	expect(response).toBe(MOCK_RESPONSE_TEXT);
});

test("successful API call when useCache is false", async () => {
	const provider = new ProviderClass();
	const options: LlmOptions = { useCache: false };
	await provider.generate(MOCK_PROMPT, options);

	expect(llmUtils.hashPrompt).toHaveBeenCalledWith(MOCK_PROMPT);
	expect(llmUtils.loadCache).not.toHaveBeenCalled();
	expect(mockApiMethod).toHaveBeenCalledTimes(1);
	expect(llmUtils.saveCache).not.toHaveBeenCalled();
	expect(llmUtils.logInteraction).toHaveBeenCalledWith(MOCK_PROMPT, MOCK_RESPONSE_TEXT);
});

test("cache hit scenario (useCache=true)", async () => {
	(llmUtils.loadCache as jest.Mock).mockResolvedValue({ [MOCK_PROMPT_HASH]: MOCK_RESPONSE_TEXT });

	const provider = new ProviderClass();
	const options: LlmOptions = { useCache: true };
	const response = await provider.generate(MOCK_PROMPT, options);

	expect(llmUtils.loadCache).toHaveBeenCalledTimes(1);
	expect(mockApiMethod).not.toHaveBeenCalled();
	expect(llmUtils.saveCache).not.toHaveBeenCalled();
	expect(llmUtils.logInteraction).toHaveBeenCalledWith(MOCK_PROMPT, `[CACHE HIT] ${MOCK_RESPONSE_TEXT}`);
	expect(response).toBe(MOCK_RESPONSE_TEXT);
});
```

#### Model Configuration (MANDATORY - All 3 scenarios)

```typescript
test("should use custom model name when provided", async () => {
	const customModelName = "custom-model";
	const provider = new ProviderClass();
	const options: LlmOptions = { useCache: true, modelName: customModelName };
	await provider.generate(MOCK_PROMPT, options);

	expect(mockApiMethod).toHaveBeenCalledWith(expect.objectContaining({ model: customModelName }));
});

test("should use environment model when available", async () => {
	process.env.PROVIDER_MODEL = "env-model";
	const provider = new ProviderClass();
	const options: LlmOptions = { useCache: true };
	await provider.generate(MOCK_PROMPT, options);

	expect(mockApiMethod).toHaveBeenCalledWith(expect.objectContaining({ model: "env-model" }));
});

test("should fallback to default model", async () => {
	delete process.env.PROVIDER_MODEL;
	const provider = new ProviderClass();
	const options: LlmOptions = { useCache: true };
	await provider.generate(MOCK_PROMPT, options);

	expect(mockApiMethod).toHaveBeenCalledWith(expect.objectContaining({ model: "default-model" }));
});
```

#### Error Handling (MANDATORY - Test actual behavior)

```typescript
test("should handle generic API errors", async () => {
	const errorMessage = "Generic API Error";
	mockApiMethod.mockRejectedValue(new Error(errorMessage));

	const provider = new ProviderClass();

	// ✅ Test actual error format produced by provider
	await expect(provider.generate(MOCK_PROMPT, { useCache: true })).rejects.toThrow(
		"Provider LLM API call failed (Model: default-model): Generic API Error"
	);

	expect(llmUtils.logInteraction).toHaveBeenCalledWith(MOCK_PROMPT, expect.any(Error));
});

test("should handle provider-specific errors", async () => {
	// Test provider-specific error structures
	const specificError = new ProviderSpecificError("Specific message", 401);
	mockApiMethod.mockRejectedValue(specificError);

	await expect(provider.generate(MOCK_PROMPT, { useCache: true })).rejects.toThrow(
		/Provider.*API call failed.*401.*Specific message/
	);
});

test("should handle malformed API responses", async () => {
	// ✅ CRITICAL: Test actual malformed response handling
	mockApiMethod.mockResolvedValue({ invalidStructure: true });

	const provider = new ProviderClass();

	// ✅ Test what actually happens, not idealized validation
	await expect(provider.generate(MOCK_PROMPT, { useCache: true }))
		.rejects.toThrow
		// Use actual error message generated by provider
		();
});
```

---

## 🎯 Quick Reference Commands (UPDATED)

```typescript
// Standard beforeEach pattern (PROVEN)
beforeEach(() => {
	process.env = { ...OLD_ENV };
	jest.clearAllMocks();

	// Set up default mock implementations
	(mockFunction as jest.Mock).mockReturnValue(defaultValue);
});

// Environment backup pattern (PROVEN)
const OLD_ENV = process.env;
beforeEach(() => {
	process.env = { ...OLD_ENV };
});
afterAll(() => {
	process.env = OLD_ENV;
});

// Console suppression pattern (PROVEN)
let consoleSpy: jest.SpyInstance;
beforeAll(() => {
	consoleSpy = jest.spyOn(console, "log").mockImplementation(() => {});
});
afterAll(() => {
	consoleSpy.mockRestore();
});

// TypeScript mock typing (PROVEN)
const MockedClass = OriginalClass as jest.MockedClass<typeof OriginalClass>;
(utils.function as jest.Mock).mockReturnValue(value);

// LLM Provider mock pattern (PROVEN - use as template)
const mockApiMethod = jest.fn();
const mockInstance = { api: { method: mockApiMethod } };
jest.mock("sdk", () => jest.fn().mockImplementation(() => mockInstance));
const MockedConstructor = SDK as jest.MockedClass<typeof SDK>;

// ✅ CORRECT Error Testing Patterns
await expect(asyncFunction()).rejects.toThrow(/error.*pattern/);
await expect(asyncFunction()).rejects.toThrow("Exact error message");
await expect(asyncFunction()).rejects.toThrow(SpecificErrorClass);

// ❌ INCORRECT - DO NOT USE
await expect(asyncFunction()).rejects.toThrow(expect.stringContaining("error"));
jest.resetModules(); // NEVER USE THIS
```

---

## 🚨 CRITICAL CHANGE LOG

### Version 2.0 Updates (MAJOR):

-   **ADDED**: Comprehensive mock hoisting section with real-world debugging insights
-   **ADDED**: Proven LLM Provider mock patterns from successful implementations
-   **ADDED**: Real-world error scenarios and debugging based on actual test failures
-   **ADDED**: "Test actual behavior, not idealized behavior" principle
-   **UPDATED**: All examples to reflect patterns from successful chatgpt-provider.test.ts
-   **EXPANDED**: Error testing patterns with specific provider examples
-   **CONSOLIDATED**: All knowledge from debugging sessions into unified guide
-   **VERIFIED**: All patterns against working test implementations

### Version 1.3 Updates:

-   **ADDED**: `jest.resetModules()` as a critical anti-pattern
-   **UPDATED**: LLM Evaluation Checklist to 13 points
-   **ADDED**: Mock hoisting violations to anti-patterns

### Version 1.2 Updates:

-   **FIXED**: All incorrect `expect.stringContaining()` usage with `toThrow()`
-   **ADDED**: Jest API Limitations and Error Testing Patterns section
-   **VERIFIED**: All code examples tested against actual Jest behavior

---
