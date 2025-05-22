# AI Codebase Tutorial Generator (Node.js/TypeScript)

## Overview

This application generates chapter-based tutorials for software codebases using Large Language Models (LLMs). It is a Node.js/TypeScript Express API that accepts a public GitHub repository URL and parameters, then produces a downloadable ZIP archive containing the tutorial in Markdown format.

This project is a Node.js/TypeScript conversion and enhancement of the original Python-based "AI Codebase Knowledge Builder". (`https://github.com/The-Pocket/PocketFlow-Tutorial-Codebase-Knowledge`)

## Features

-   **GitHub Codebase Analysis**: Fetches and processes files from public GitHub repositories.
-   **Core Abstraction Identification**: Uses LLMs to identify key functions, classes, modules, and their roles.
-   **Relationship Analysis**: Determines how identified abstractions interact with each other.
-   **Chapter-Based Tutorial Generation**: Creates a structured, multi-chapter tutorial in Markdown.
-   **Multi-Language Support**: Tutorial content (narrative, code comments) can be generated in various languages, powered by the LLM.
-   **ZIP Archive Output**: Delivers the complete tutorial as a downloadable ZIP file.
-   **LLM Caching**: Caches responses from the LLM to speed up subsequent requests for identical prompts and reduce API costs.

## Prerequisites

-   **Node.js**: v18.x or later recommended.
-   **npm** (comes with Node.js) or **yarn**.
-   **Google Gemini API Key**: Essential for interacting with the LLM.

## Setup and Installation

1.  **Clone the repository**:

    ```bash
    git clone git@github.com:Ozmah/PocketFlowNode.git
    ```

2.  **Navigate to the directory**:

    ```bash
    cd PocketFlowNode
    ```

3.  **Install dependencies**:
    ```bash
    npm install
    ```
    (or `yarn install` if you prefer yarn)

## Environment Variables

Create a `.env` file in the root of the project. **This file should not be committed to git.** (Ensure `.env` is listed in your `.gitignore` file).

Contents of `.env` (see also `.env.sample`):

```env
# For Google Gemini (Required if using Gemini provider, see specific endpoint docs)
GEMINI_API_KEY=YOUR_GEMINI_API_KEY_HERE

# For Anthropic Claude (Required if using Claude provider)
CLAUDE_API_KEY=YOUR_CLAUDE_API_KEY_HERE

# For OpenAI (Required if using OpenAI provider)
OPENAI_API_KEY=YOUR_OPENAI_API_KEY_HERE

# Optional
PORT=3000
# GEMINI_MODEL=gemini-pro # Model can also be set per API call
NODE_ENV=development # 'production' for production builds
# LOG_LEVEL=debug
```

-   **`GEMINI_API_KEY`**: Your API key for Google Gemini. Required if using the Gemini provider. (Note: The application currently has a startup check for this key regardless of chosen provider for an endpoint; this might be refined in the future).
-   **`CLAUDE_API_KEY`**: Your API key for Anthropic Claude. Required if using the Claude provider.
-   **`OPENAI_API_KEY`**: Your API key for OpenAI. Required if using the OpenAI provider.
-   **`PORT` (Optional)**: The port on which the server will run. Defaults to `3000`.
-   **`NODE_ENV` (Optional)**: Set to `development` for development-specific features or `production`.

## Running the Application

1.  **Build the TypeScript code**:

    ```bash
    npm run build
    ```

    This command compiles the TypeScript files from `src` into JavaScript files in the `dist` directory using `tsc`.

2.  **Start the server**:

    ```bash
    npm start
    ```

    This command runs the compiled application from the `dist` directory using `node dist/index.js`.

    For development, you might consider using a tool like `ts-node-dev` or `nodemon` for automatic restarts on file changes. You can add a script to `package.json` for this, for example:

    ```json
    // In package.json "scripts":
    // "dev": "ts-node-dev --respawn --transpile-only src/index.ts"
    ```

    Then run `npm run dev`. (Note: `ts-node-dev` would need to be installed as a dev dependency: `npm install --save-dev ts-node-dev`)

## API Endpoint

### `POST /generate-tutorial`

This endpoint processes the GitHub repository and generates the tutorial.

**Request Body (JSON)**:

```json
{
	"repoUrl": "https://github.com/Ozmah/PocketNode",
	"projectName": "PocketNode Tutorial",
	"githubToken": "your_optional_github_token",
	"includePatterns": ["src/**/*.ts", "public/*.html"],
	"excludePatterns": ["**/*.test.ts", "**/node_modules/**"],
	"maxFileSize": 150000,
	"language": "spanish",
	"useCache": true,
	"maxAbstractions": 10,
	"llmProvider": "gemini", // O "claude", "openai"
	"llmApiKey": "YOUR_PROVIDER_API_KEY_IF_OVERRIDING_ENV", // Opcional
	"llmModel": "gemini-pro", // Opcional, ej: "claude-2.1", "gpt-4"
	"llmOptions": { // Opcional
	  "temperature": 0.6,
	  "maxTokens": 1000 
	  // "useCache" también puede ir aquí para Gemini, aunque el "useCache" global de arriba también se considera
	}
}
```

**Field Descriptions**:

-   `repoUrl` (string, required): The URL of the public GitHub repository to analyze.
-   `projectName` (string, optional): A name for the project. This will be used in the tutorial title and as the base name for the downloaded ZIP file. If not provided, it's derived from the `repoUrl` (e.g., the repository name).
-   `githubToken` (string, optional): A GitHub Personal Access Token. Useful for accessing private repositories (though current implementation primarily targets public ones) or for higher API rate limits when fetching repository contents.
-   `includePatterns` (string[], optional): An array of glob patterns specifying which files to include in the analysis. Example: `["src/**/*.js", "*.md"]`. Uses `micromatch` with `dot:true` enabled (matches dotfiles).
-   `excludePatterns` (string[], optional): An array of glob patterns specifying which files to exclude from the analysis. Example: `["**/node_modules/**", "**/*.log"]`. Exclusions take precedence over inclusions. Uses `micromatch` with `dot:true` enabled.
-   `maxFileSize` (number, optional): The maximum size (in bytes) for individual files to be included in the analysis. Default: `1024 * 1024` (1MB) as per `src/utils/crawl_github_files.ts`.
-   `language` (string, optional): The target language for the generated tutorial content (e.g., "english", "spanish", "french"). Default: `"english"`.
-   `useCache` (boolean, optional): Whether to use the caching mechanism for LLM responses. Default: `true`. This applies to LLM calls made by core functions if not overridden by `llmOptions`.
-   `maxAbstractions` (number, optional): The maximum number of key abstractions the LLM should try to identify. Default: `15`.
-   `llmProvider` (string, optional): Specifies the LLM provider to use for tutorial generation. 
    -   Enum: `"gemini"`, `"claude"`, `"openai"`.
    -   If not provided, defaults to `"gemini"`.
-   `llmApiKey` (string, optional): The API key for the selected LLM provider. If provided, this will override the corresponding environment variable (e.g., `GEMINI_API_KEY`, `CLAUDE_API_KEY`, `OPENAI_API_KEY`) for this specific tutorial generation.
-   `llmModel` (string, optional): The specific model name to use for the selected LLM provider (e.g., `"gemini-pro"`, `"claude-2.1"`, `"gpt-4"`). If not provided, a default model for the chosen provider will be used.
-   `llmOptions` (object, optional): Additional parameters for the LLM generation, passed to all LLM calls within the tutorial generation process. These can include:
    -   `temperature` (number): Controls randomness.
    -   `maxTokens` (number): Maximum number of tokens for LLM responses.
    -   `useCache` (boolean, specific to Gemini): Overrides the global `useCache` setting for LLM calls if provided here.
    -   Other provider-specific parameters.

**Success Response**:

-   **Status Code**: `200 OK`
-   **Content-Type**: `application/zip`
-   **Content-Disposition**: `attachment; filename="<projectName_or_derived_name>.zip"`
    (e.g., `attachment; filename="PocketNode Tutorial.zip"`)
-   **Body**: The ZIP archive containing the tutorial files (`index.md` and individual chapter Markdown files).

**Error Responses**:

-   **Status Code**: `400 Bad Request`
    -   **Body (JSON)**: `{ "message": "Descriptive error message about invalid input." }`
    -   Example: If `repoUrl` is missing or invalid, or if no files are fetched.
-   **Status Code**: `500 Internal Server Error`
    -   **Body (JSON)**: `{ "message": "An internal server error occurred during tutorial generation." }` (In development, might include more details like `error` and `stack`).
    -   Example: If an unexpected error occurs in the backend during processing. More details will be logged on the server.

### `POST /llm/generate`

This endpoint provides direct access to the configured LLM providers (Gemini, Claude, OpenAI) for text generation tasks. It allows dynamic selection of the provider, model, and other generation parameters.

**Request Body (JSON)**:

```json
{
  "provider": "gemini",
  "prompt": "Explain the concept of a promise in JavaScript in simple terms.",
  "apiKey": "YOUR_PROVIDER_API_KEY_IF_OVERRIDING_ENV",
  "model": "gemini-pro",
  "options": {
    "temperature": 0.7,
    "maxTokens": 500,
    "useCache": true
  }
}
```

**Field Descriptions**:

-   `provider` (string, required): Specifies the LLM provider to use.
    -   Enum: `"gemini"`, `"claude"`, `"openai"`
-   `prompt` (string, required): The text prompt to send to the LLM.
-   `apiKey` (string, optional): The API key for the selected provider. If provided, this will override the corresponding environment variable (e.g., `GEMINI_API_KEY`, `CLAUDE_API_KEY`, `OPENAI_API_KEY`) for this specific call.
-   `model` (string, optional): The specific model name to use for the selected provider (e.g., `"gemini-pro"`, `"claude-2"`, `"gpt-4"`). If not provided, a default model for the provider will be used.
-   `options` (object, optional): Additional parameters for the LLM generation. Common options include:
    -   `temperature` (number): Controls randomness.
    -   `maxTokens` (number): Maximum number of tokens to generate. (Note: Parameter name might vary slightly by provider, e.g. `max_tokens_to_sample` for Claude, `maxOutputTokens` for Gemini internal config). The endpoint normalizes this where possible.
    -   `topP` (number): Nucleus sampling parameter.
    -   `topK` (number): Top-K sampling parameter.
    -   `useCache` (boolean, specific to Gemini via this endpoint): Whether the Gemini provider should use its caching mechanism. Defaults to `true` for Gemini if not specified.
    -   Other provider-specific parameters can also be included here.

**Success Response**:

-   **Status Code**: `200 OK`
-   **Body (JSON)**: `{ "response": "The text generated by the LLM." }`

**Example `curl` Request**:

```bash
curl -X POST http://localhost:3000/llm/generate \
-H "Content-Type: application/json" \
-d '{
  "provider": "gemini",
  "prompt": "Translate \"Hello, world!\" into Spanish.",
  "model": "gemini-pro",
  "options": {
    "useCache": true
  }
}'
```

**Error Responses**:

-   **Status Code**: `400 Bad Request`
    -   **Body (JSON)**: `{ "message": "Descriptive error message about invalid input." }`
    -   Example: If `provider` or `prompt` is missing.
-   **Status Code**: `500 Internal Server Error`
    -   **Body (JSON)**: `{ "message": "An error occurred with the <provider_name> LLM provider.", "error": "Detailed error from provider if available." }`
    -   Example: If the selected LLM provider's API call fails.

## Running Tests

To run the automated tests:

```bash
npm test
```

This command uses Jest to execute all unit tests located in the `tests` directory. Tests cover utility functions, core logic helpers, and LLM interaction points (with mocks).

## Project Structure

```
.
├── .cache/            # LLM response cache and interaction logs (gitignored)
├── jekyll/            # Jekyll configuration for documentation site
├── node_modules/      # Project dependencies (gitignored)
├── src/               # Source code
│   ├── core/          # Core logic for abstraction, relationships, chapters generation
│   ├── utils/         # Utility functions (LLM interaction, GitHub crawler, etc.)
│   ├── types.ts       # TypeScript type definitions for shared data structures
│   └── index.ts       # Express server setup, API endpoint routing, main workflow orchestration
├── tests/             # Unit tests
│   ├── core/          # Tests for core logic modules
│   └── utils/         # Tests for utility modules
├── .env               # Environment variables (gitignored, create this file)
├── .gitignore         # Specifies intentionally untracked files
├── jest.config.js     # Jest test runner configuration
├── LICENSE            # MIT License
├── package.json       # Project metadata and dependencies
├── package-lock.json  # Records exact versions of dependencies
├── README.md          # This file
└── tsconfig.json      # TypeScript compiler configuration
```

Note: The `dist/` directory will be created when you build the project using `npm run build`. It contains the compiled JavaScript output and is gitignored.

## Additional Prerequisites for Jekyll Integration

-   **Ruby**: v3.1.0 or later (required for Jekyll)
-   **Bundler**: Ruby gem manager (`gem install bundler`)
-   **Jekyll**: Static site generator (`gem install jekyll`)

### Windows Users:

-   Download **Ruby+Devkit** from https://rubyinstaller.org/downloads/
-   Ensure you select "WITH DEVKIT" version
-   Run `ridk install` when prompted during installation

### Linux/macOS Users:

```bash
# Install Ruby version manager (recommended)
curl -sSL https://get.rvm.io | bash -s stable
rvm install ruby-3.1.0
rvm use ruby-3.1.0 --default

# Install Jekyll and Bundler
gem install jekyll bundler
```

## Tutorial File Format

Each tutorial chapter file must begin with YAML front matter (the content between the triple dashes). This front matter configures how Jekyll and the Just The Docs theme will process and display the page:

Front matter for index.md:

```yaml
---
layout: default
title: "IndexTitle"
nav_order: 1
has_children: true
---
```

Front matter for the rest of the files:

```yaml
---
layout: default
title: "Chapter Title"
parent: "IndexTitle"
nav_order: 1
liquid: false
---
```

### Front Matter Fields Description

-   `layout: default` - Uses the default page template from Just The Docs theme
-   `title: "Chapter Title"` - The page title that appears in navigation and browser tab
-   `parent: "Router"` - Groups this page under the main "Router" section in the sidebar navigation
-   `nav_order: 1` - Controls the ordering of pages in the navigation menu (1, 2, 3, etc.)
-   `liquid: false` - Disables Jekyll's Liquid template processing to prevent conflicts with code containing double braces `{{ }}`

The front matter must be followed by your standard Markdown content starting with a heading.

---

## MIT License

Copyright (c) 2024 PocketFlow Node Contributors

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
