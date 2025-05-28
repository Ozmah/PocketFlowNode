# PocketFlow Node

**Automatically generate comprehensive tutorials from any GitHub repository using AI.**

Transform code repositories into structured, educational tutorials with detailed explanations, code examples, and visual diagrams. Perfect for documentation, onboarding, code reviews, and educational content creation.

This project is a Node.js/TypeScript conversion and enhancement of the original Python-based "AI Codebase Knowledge Builder". (`https://github.com/The-Pocket/PocketFlow-Tutorial-Codebase-Knowledge`)

## 🚨 CRITICAL REQUIREMENTS

**The application WILL NOT work without these three essential components:**

### 1. LLM API Key (MANDATORY)

At least one LLM provider API key is **REQUIRED**:

```bash
# Choose ONE or more providers
export GEMINI_API_KEY="your_gemini_api_key_here"        # Google Gemini
export OPENAI_API_KEY="your_openai_api_key_here"       # ChatGPT/OpenAI
export ANTHROPIC_API_KEY="your_anthropic_api_key_here" # Claude/Anthropic
```

**⚠️ Without an API key, the server will refuse to start.**

### 2. GitHub Token (MANDATORY for real usage)

Create a GitHub Personal Access Token:

1. Go to [GitHub Settings > Developer settings > Personal access tokens](https://github.com/settings/tokens)
2. Generate new token (classic) with `repo` permissions
3. Use it in ALL requests

**⚠️ Without a GitHub token:**

-   Rate limit: 60 requests/hour (insufficient for most repositories)
-   Cannot access private repositories
-   Large repositories will fail due to API limits

### 3. LLM Model Configuration (CRITICAL)

**Default Models Used by Code:**

-   **Gemini**: `gemini-2.5-pro`
-   **ChatGPT**: `o3`
-   **Claude**: `claude-3-7-sonnet-20250219`

**Method 1: Environment Variables (Recommended)**

```bash
export GEMINI_MODEL="Gemini 2.5"                    # Override Gemini default
export OPENAI_MODEL="ChatGPT o3"                                # Override OpenAI default
export ANTHROPIC_MODEL="Claude Sonnet 3.7"     # Override Claude default
```

**Method 2: Modify Source Code**
Edit the default model constants in the provider files:

```typescript
// src/llm/gemini-provider.ts
const DEFAULT_GEMINI_MODEL_NAME = "gemini-pro"; // Change this

// src/llm/chatgpt-provider.ts
const DEFAULT_CHATGPT_MODEL_NAME = "o3"; // Change this

// src/llm/claude-provider.ts
const DEFAULT_CLAUDE_MODEL_NAME = "claude-3-7-sonnet-20250219"; // Change this
```

**Method 3: Per-Request Override**

```json
{
	"repoUrl": "https://github.com/user/repo",
	"llmProvider": "gemini",
	"llmModelName": "gemini-2.5-flash"
}
```

### ⚠️ Model Compatibility Warning

Different models have different:

-   **Context limits** (affects large repositories)
-   **Cost structures** (can impact API bills significantly)
-   **Performance characteristics** (speed vs quality trade-offs)

**Recommended Models for Production (2025):**

-   **Gemini**: `gemini-2.5-flash` (best balance)
-   **OpenAI**: `gpt-4` (highest quality)
-   **Claude**: `claude-3-sonnet` (best for detailed analysis)

## What It Does

PocketFlow Node analyzes GitHub repositories and creates complete tutorial documentation by:

1. **Crawling** repository files with intelligent filtering
2. **Identifying** key code abstractions and concepts
3. **Analyzing** relationships between components
4. **Ordering** concepts in optimal learning sequence
5. **Writing** detailed chapters with explanations and examples
6. **Combining** everything into a cohesive tutorial with navigation

**Input:** GitHub repository URL  
**Output:** Professional tutorial as downloadable ZIP file

## Quick Start

## Quick Start

### Start the Server

```bash
# 1. Set your LLM API key (see CRITICAL REQUIREMENTS above)
export GEMINI_API_KEY="your_gemini_api_key_here"

# 2. Optional: Override default model
export GEMINI_MODEL="gemini-2.5-flash"

# 3. Install and start
npm install
npm start
```

### Generate Your First Tutorial

```bash
curl -X POST http://localhost:3000/generate-tutorial \
  -H "Content-Type: application/json" \
  -d '{
    "repoUrl": "https://github.com/expressjs/express",
    "githubToken": "ghp_your_github_token_here"
  }' \
  --output express-tutorial.zip
```

## API Usage

### Basic Request

**Endpoint:** `POST /generate-tutorial`

**Minimal working configuration (MUST include githubToken):**

```json
{
	"repoUrl": "https://github.com/username/repository",
	"githubToken": "ghp_your_github_token_here"
}
```

### Common Configurations

**Public repository with recommended settings:**

```json
{
	"repoUrl": "https://github.com/facebook/react",
	"githubToken": "ghp_your_token_here",
	"projectName": "React Core Library",
	"language": "english",
	"maxAbstractions": 15
}
```

**Private repository with GitHub token:**

```json
{
	"repoUrl": "https://github.com/company/private-repo",
	"githubToken": "ghp_your_token_here",
	"projectName": "Internal API Documentation",
	"language": "spanish"
}
```

**Selective file analysis:**

```json
{
	"repoUrl": "https://github.com/vercel/next.js/tree/canary/packages/next",
	"includePatterns": ["src/**/*.ts", "src/**/*.tsx", "*.md"],
	"excludePatterns": ["**/*.test.*", "**/*.spec.*", "dist/**"],
	"maxFileSize": 1048576,
	"maxAbstractions": 20
}
```

**Advanced LLM configuration:**

```json
{
	"repoUrl": "https://github.com/nestjs/nest",
	"projectName": "NestJS Framework Guide",
	"language": "english",
	"llmProvider": "claude",
	"llmModelName": "claude-2",
	"useCache": true,
	"maxAbstractions": 25
}
```

### Complete Example with cURL

```bash
curl -X POST http://localhost:3000/generate-tutorial \
  -H "Content-Type: application/json" \
  -d '{
    "repoUrl": "https://github.com/company/enterprise-app/tree/main/src",
    "projectName": "Enterprise Application Tutorial",
    "githubToken": "ghp_your_github_token_here",
    "includePatterns": [
      "**/*.{ts,js,tsx,jsx}",
      "**/*.md",
      "package.json",
      "tsconfig.json"
    ],
    "excludePatterns": [
      "node_modules/**",
      "dist/**",
      "build/**",
      "**/*.test.*",
      "**/*.spec.*",
      "coverage/**",
      "*.log"
    ],
    "maxFileSize": 2097152,
    "language": "spanish",
    "useCache": true,
    "maxAbstractions": 30,
    "llmProvider": "claude",
    "llmModelName": "claude-2",
    "llmOptions": {}
  }' \
  --output enterprise-tutorial.zip
```

## Parameters Reference

| Parameter         | Type     | Required         | Default          | Description                                                         |
| ----------------- | -------- | ---------------- | ---------------- | ------------------------------------------------------------------- |
| `repoUrl`         | string   | ✅               | -                | GitHub repository URL (supports branches and specific paths)        |
| `githubToken`     | string   | ⚠️ **Essential** | -                | GitHub personal access token (see CRITICAL REQUIREMENTS)            |
| `projectName`     | string   | ❌               | Auto-detected    | Custom name for the generated tutorial                              |
| `includePatterns` | string[] | ❌               | All files        | Glob patterns for files to include                                  |
| `excludePatterns` | string[] | ❌               | Common excludes  | Glob patterns for files to exclude                                  |
| `maxFileSize`     | number   | ❌               | 1048576          | Maximum file size in bytes (1MB default)                            |
| `language`        | string   | ❌               | "english"        | Tutorial language (english, spanish, french, etc.)                  |
| `useCache`        | boolean  | ❌               | true             | Enable LLM response caching for faster repeated runs                |
| `maxAbstractions` | number   | ❌               | 15               | Maximum number of key concepts to identify (1-50)                   |
| `llmProvider`     | string   | ❌               | "gemini"         | LLM provider: "gemini", "chatgpt", "claude"                         |
| `llmModelName`    | string   | ❌               | Provider default | Specific model name (overrides default - see CRITICAL REQUIREMENTS) |
| `llmOptions`      | object   | ❌               | {}               | Additional provider-specific options                                |

### Supported Repository URLs

```
https://github.com/owner/repo
https://github.com/owner/repo/tree/branch-name
https://github.com/owner/repo/tree/main/src/components
https://github.com/owner/repo/commit/abc123def
```

## Tutorial Output Structure

Generated tutorials are delivered as ZIP files containing:

```
tutorial-name/
├── index.md                    # Main index with project overview
│                              # Includes Mermaid diagram of relationships
├── 01_first_concept.md        # Chapter 1: First key concept
├── 02_second_concept.md       # Chapter 2: Second concept
├── 03_third_concept.md        # Chapter 3: Third concept
└── ...                        # Additional chapters as needed
```

### What Each Chapter Contains

-   **Concept Introduction** - Clear explanation of the abstraction
-   **Motivation & Context** - Why this concept exists and its purpose
-   **Code Examples** - Relevant snippets with detailed explanations
-   **Visual Diagrams** - Mermaid flowcharts and sequence diagrams when helpful
-   **Cross-References** - Links to related concepts in other chapters
-   **Learning Objectives** - What you'll understand after reading

## Real-World Use Cases

### 🎓 Educational Content

Generate tutorials for programming courses, workshops, or self-study materials from real-world codebases.

```json
{
	"repoUrl": "https://github.com/airbnb/javascript",
	"projectName": "JavaScript Style Guide Tutorial",
	"language": "english",
	"maxAbstractions": 12
}
```

### 📚 Team Onboarding

Create comprehensive guides for new team members to understand existing codebases.

```json
{
	"repoUrl": "https://github.com/company/main-application",
	"githubToken": "ghp_token",
	"projectName": "Application Architecture Guide",
	"language": "english",
	"includePatterns": ["src/**/*.ts", "docs/**/*.md"],
	"maxAbstractions": 25
}
```

### 🔍 Code Review & Documentation

Generate detailed explanations of complex codebases for review or documentation purposes.

```json
{
	"repoUrl": "https://github.com/microsoft/TypeScript/tree/main/src/compiler",
	"projectName": "TypeScript Compiler Internals",
	"maxAbstractions": 20,
	"llmProvider": "claude"
}
```

### 🌐 Open Source Contribution

Understand the architecture of open source projects before contributing.

```json
{
	"repoUrl": "https://github.com/vuejs/core/tree/main/packages/reactivity",
	"projectName": "Vue.js Reactivity System",
	"includePatterns": ["src/**/*.ts"],
	"excludePatterns": ["**/__tests__/**"],
	"maxAbstractions": 15
}
```

## LLM Provider Options

### Gemini (Default)

-   **Default Model:** `gemini-pro` (can be overridden - see CRITICAL REQUIREMENTS)
-   **Recommended Models 2025:** `gemini-2.5-flash`, `gemini-2.5-pro`
-   **Best for:** General-purpose analysis, fast processing, cost-effective
-   **Requires:** `GEMINI_API_KEY` environment variable

### ChatGPT/OpenAI

-   **Default Model:** `gpt-3.5-turbo` (can be overridden - see CRITICAL REQUIREMENTS)
-   **Recommended Models 2025:** `gpt-4`, `gpt-4-turbo`, `gpt-4.1`
-   **Best for:** Detailed explanations, complex reasoning, highest quality output
-   **Requires:** `OPENAI_API_KEY` environment variable

### Claude/Anthropic

-   **Default Model:** `claude-instant-1.2` (can be overridden - see CRITICAL REQUIREMENTS)
-   **Recommended Models 2025:** `claude-3-sonnet`, `claude-4-sonnet`, `claude-3-opus`
-   **Best for:** Long-form content, nuanced understanding, detailed analysis
-   **Requires:** `ANTHROPIC_API_KEY` environment variable

### Provider Selection with Custom Model

```json
{
	"llmProvider": "claude",
	"llmModelName": "claude-3-sonnet"
}
```

### Override Default Models Globally

```bash
export GEMINI_MODEL="gemini-2.5-flash"
export OPENAI_MODEL="gpt-4"
export ANTHROPIC_MODEL="claude-3-sonnet"
```

## Project Types & Results

### ✅ Excellent Results

-   **Well-structured libraries** with clear architecture
-   **Framework source code** with established patterns
-   **Educational repositories** with good naming conventions
-   **API projects** with defined endpoints and middleware

### ⚠️ Good Results

-   **Large applications** with mixed responsibilities
-   **Monorepos** with multiple packages
-   **Legacy codebases** with some documentation

### ❌ Limited Results

-   **Primarily configuration files** with little logic
-   **Binary-heavy repositories** with minimal source code
-   **Poorly documented code** with unclear naming
-   **Highly procedural code** without clear patterns

## Response Format

### Success Response

```http
HTTP/1.1 200 OK
Content-Type: application/zip
Content-Disposition: attachment; filename="project-tutorial.zip"

[Binary ZIP content]
```

### Error Response

```json
{
	"message": "Detailed error description"
}
```

## Contributing

We welcome contributions! The codebase follows strict TypeScript standards with comprehensive testing using Jest.

### Development Setup

```bash
git clone https://github.com/your-org/pocketflow-node
cd pocketflow-node
npm install
npm run dev
```

### Testing

```bash
npm test              # Run all tests
npm run test:watch    # Watch mode for development
npm run test:coverage # Generate coverage report
```

## License

MIT License - see LICENSE file for details.

---

**Made with ❤️ for developers who love great documentation**
