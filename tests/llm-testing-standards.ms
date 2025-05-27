# PocketFlow Node.js Testing Standards - LLM Reference Guide

## 📋 Overview
This document serves as a comprehensive reference for writing and evaluating Jest tests in the PocketFlow Node.js project. It establishes strict standards for Node.js + Express + TypeScript + Jest testing patterns.

**Target Audience:** LLMs and developers writing tests for PocketFlow Node
**Scope:** Unit and integration tests using Jest with TypeScript
**Compliance:** ALL tests must adhere to these standards

---

## 🎯 Critical Standards Checklist

### ✅ MUST HAVE (Non-negotiable)
- [ ] Single mock clearing strategy (`jest.clearAllMocks()` ONLY)
- [ ] Proper TypeScript mock typing
- [ ] Complete environment variable management
- [ ] Console output suppression in tests
- [ ] ESM compatibility (`__esModule: true`)
- [ ] Defensive beforeEach setup
- [ ] Comprehensive error scenario coverage

### ⚠️ MUST NOT HAVE (Anti-patterns)
- [ ] Mixed mock clearing (`mockReset()` + `jest.clearAllMocks()`)
- [ ] Unhandled environment pollution
- [ ] Console noise in test output
- [ ] Incomplete mock configurations
- [ ] Missing TypeScript types for mocks

---

## 🔧 1. Mock Configuration Standards

### ✅ CORRECT Mock Setup
```typescript
// External module mocking
const mockCreateChatCompletion = jest.fn();
const mockProviderInstance = {
  chat: {
    completions: {
      create: mockCreateChatCompletion,
    },
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

// Note: For pure ESM projects, consider jest.unstable_mockModule()
// but for TypeScript projects with traditional builds, __esModule: true remains essential
```

### ❌ INCORRECT Mock Setup
```typescript
// ❌ BAD: Incomplete mock structure
jest.mock("external-module", () => jest.fn());

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
    
    // ✅ Set up default mock implementations
    (mockFunction as jest.Mock).mockReturnValue(defaultValue);
    (mockAsyncFunction as jest.Mock).mockResolvedValue(defaultAsyncValue);
  });
});
```

### ❌ INCORRECT Cleanup Patterns
```typescript
beforeEach(() => {
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
    expect(consoleLogSpy).toHaveBeenCalledWith(
      expect.stringContaining("Expected log message")
    );
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
// ✅ Proper constructor mock typing
const MockedConstructor = ExternalClass as jest.MockedClass<typeof ExternalClass>;

// ✅ Proper function mock typing with utility imports
import * as utils from "../../src/utils/module";
(utils.functionName as jest.Mock).mockReturnValue(value);

// ✅ Alternative: Using jest.mocked() (Jest 27+)
import { jest } from '@jest/globals';
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
expect((ExternalClass as any)).toHaveBeenCalled();
```

---

## 🧪 6. Test Structure Standards

### ✅ CORRECT Test Organization
```typescript
describe("ClassName", () => {
  // ✅ Constants defined at top level
  const MOCK_VALUE = "test-value";
  const EXPECTED_RESULT = "expected-result";
  
  // ✅ Setup/teardown in logical order
  beforeAll(() => { /* One-time setup */ });
  afterAll(() => { /* One-time cleanup */ });
  beforeEach(() => { /* Per-test setup */ });
  
  // ✅ Grouped by functionality
  describe("Constructor", () => {
    test("should initialize correctly with valid input", () => {
      // ✅ Clear test case
    });
    
    test("should throw error with invalid input", () => {
      // ✅ Error case testing
    });
  });
  
  describe("methodName", () => {
    beforeEach(() => {
      // ✅ Method-specific setup
    });
    
    test("should handle successful case", async () => {
      // ✅ Happy path
    });
    
    test("should handle error case", async () => {
      // ✅ Error path
    });
  });
});
```

---

## 🎯 7. Assertion Standards

### ✅ CORRECT Assertions
```typescript
test("should perform complete operation", async () => {
  // ✅ Comprehensive verification
  const result = await provider.generate(MOCK_PROMPT, options);
  
  // Verify function calls
  expect(mockUtilFunction).toHaveBeenCalledWith(expectedArgs);
  expect(mockUtilFunction).toHaveBeenCalledTimes(1);
  
  // Verify side effects
  expect(mockSaveFunction).toHaveBeenCalledWith(expectedData);
  
  // Verify return value
  expect(result).toBe(EXPECTED_RESULT);
  
  // Verify negative cases
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

## ⚠️ 8. Error Scenario Coverage Requirements

### ✅ REQUIRED Error Test Cases
```typescript
describe("Error Handling", () => {
  test("should handle generic API errors", async () => {
    const errorMessage = "Generic API Error";
    mockApiCall.mockRejectedValue(new Error(errorMessage));
    
    await expect(provider.generate(MOCK_PROMPT)).rejects.toThrow(
      expect.stringContaining("Expected error pattern")
    );
    
    // ✅ Verify error logging
    expect(mockLogFunction).toHaveBeenCalledWith(MOCK_PROMPT, expect.any(Error));
  });
  
  test("should handle provider-specific errors", async () => {
    const specificError = new ProviderSpecificError("Specific message");
    mockApiCall.mockRejectedValue(specificError);
    
    await expect(provider.generate(MOCK_PROMPT)).rejects.toThrow(
      expect.stringContaining("Specific message")
    );
  });
  
  test("should handle malformed API responses", async () => {
    mockApiCall.mockResolvedValue({ invalid: "response" });
    
    await expect(provider.generate(MOCK_PROMPT)).rejects.toThrow(
      "Invalid response structure"
    );
  });
});
```

---

## 🔍 9. Cache Testing Patterns

### ✅ CORRECT Cache Testing
```typescript
describe("Caching Behavior", () => {
  test("should handle cache miss scenario", async () => {
    (mockLoadCache as jest.Mock).mockResolvedValue({}); // Empty cache
    
    const result = await provider.generate(MOCK_PROMPT, { useCache: true });
    
    // ✅ Verify cache operations
    expect(mockLoadCache).toHaveBeenCalledTimes(2); // Load + reload before save
    expect(mockApiCall).toHaveBeenCalledTimes(1);
    expect(mockSaveCache).toHaveBeenCalledWith({ [MOCK_HASH]: MOCK_RESPONSE });
    
    expect(result).toBe(MOCK_RESPONSE);
  });
  
  test("should handle cache hit scenario", async () => {
    (mockLoadCache as jest.Mock).mockResolvedValue({ [MOCK_HASH]: MOCK_RESPONSE });
    
    const result = await provider.generate(MOCK_PROMPT, { useCache: true });
    
    // ✅ Verify cache short-circuit
    expect(mockLoadCache).toHaveBeenCalledTimes(1);
    expect(mockApiCall).not.toHaveBeenCalled();
    expect(mockSaveCache).not.toHaveBeenCalled();
    
    expect(result).toBe(MOCK_RESPONSE);
  });
});
```

---

## 📊 10. Coverage Requirements

### ✅ MANDATORY Test Coverage
- **Constructor scenarios**: Valid initialization, missing dependencies
- **Happy path**: All primary functionality with expected inputs
- **Error scenarios**: API failures, invalid responses, network issues
- **Edge cases**: Empty inputs, null values, boundary conditions
- **Configuration variants**: Different options, environment variables
- **Cache behavior**: Hit, miss, disabled scenarios
- **Async patterns**: Promise resolution, rejection, timeout handling

---

## 🚫 11. Anti-Patterns to Avoid

### ❌ CRITICAL Violations
```typescript
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

// ❌ Missing async handling
test("async test", () => {
  provider.asyncMethod(); // Missing await
  expect(result).toBe(expected); // Will fail
});

// ❌ Shared mutable state between tests
let sharedVariable = "initial"; // BAD: Shared state

// ❌ Missing error assertions
test("error test", async () => {
  mockFunction.mockRejectedValue(new Error("test"));
  await provider.method(); // Missing expect().rejects.toThrow()
});
```

---

## 📋 LLM Evaluation Checklist

When evaluating or writing tests, verify:

1. **Mock Strategy**: Single `jest.clearAllMocks()` pattern? ✅/❌
2. **TypeScript**: Proper mock typing throughout? ✅/❌
3. **Environment**: Complete env var backup/restore? ✅/❌
4. **Console**: Suppressed but verifiable console output? ✅/❌
5. **Coverage**: All required scenarios covered? ✅/❌
6. **Error Handling**: Comprehensive error scenario testing? ✅/❌
7. **Async**: Proper async/await usage? ✅/❌
8. **Assertions**: Complete verification of calls and side effects? ✅/❌
9. **Anti-patterns**: No forbidden patterns present? ✅/❌
10. **ESM**: `__esModule: true` in module mocks? ✅/❌

**COMPLIANCE SCORE**: ___/10 (Must be 10/10 for approval)

---

## 📝 2025 Update Notes

**Verified Patterns (May 2025):**
- ✅ `jest.clearAllMocks()` remains the industry standard
- ✅ `__esModule: true` still required for TypeScript/Node.js projects
- ✅ Console suppression patterns unchanged
- ✅ Environment variable management patterns current
- ✅ TypeScript mock typing patterns validated
- 🆕 `jest.mocked()` available as alternative (Jest 27+)
- 🆕 Experimental ESM support improving but traditional patterns still essential

---

## 🎯 Quick Reference Commands

```typescript
// Standard beforeEach pattern
beforeEach(() => {
  jest.clearAllMocks();
  (mockFunction as jest.Mock).mockReturnValue(defaultValue);
});

// Environment backup pattern
const OLD_ENV = process.env;
beforeEach(() => { process.env = { ...OLD_ENV }; });
afterAll(() => { process.env = OLD_ENV; });

// Console suppression pattern
let consoleSpy: jest.SpyInstance;
beforeAll(() => { consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {}); });
afterAll(() => { consoleSpy.mockRestore(); });

// TypeScript mock typing
const MockedClass = OriginalClass as jest.MockedClass<typeof OriginalClass>;
(utils.function as jest.Mock).mockReturnValue(value);

// Alternative with jest.mocked() (Jest 27+)
const mockedUtils = jest.mocked(utils);
mockedUtils.function.mockReturnValue(value);
```

---

**Document Version**: 1.1  
**Last Updated**: May 2025 (Verified against current industry standards)  
**Compliance Level**: Mandatory for all PocketFlow Node.js tests