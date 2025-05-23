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
-   **Node.js**: v18.x or later recommended.
-   **npm** (comes with Node.js) or **yarn**.
-   **LLM API Keys**: At least one API key for an LLM provider (Google Gemini, OpenAI, or Anthropic) is required. The application will not start if no keys are configured.

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

Contents of `.env`:

```env
# LLM API Keys - At least one is required
GEMINI_API_KEY=your_google_gemini_api_key_here
OPENAI_API_KEY=your_openai_api_key_here
ANTHROPIC_API_KEY=your_anthropic_api_key_here

# Optional: Default model names if not specified in API requests
# These are only examples; the application has internal defaults for each provider.
# GEMINI_MODEL=gemini-pro 
# OPENAI_MODEL=gpt-3.5-turbo
# ANTHROPIC_MODEL=claude-instant-1.2

# Other Optional Variables
PORT=3000
NODE_ENV=development # 'production' for production builds
# LOG_LEVEL=debug # Example if a more sophisticated logger is added in the future
```

-   **LLM API Keys (At least one is Required)**:
    -   `GEMINI_API_KEY`: Your API key for Google Gemini models.
    -   `OPENAI_API_KEY`: Your API key for OpenAI (ChatGPT) models.
    -   `ANTHROPIC_API_KEY`: Your API key for Anthropic (Claude) models.
    The application checks for these keys at startup. It will log warnings for any missing keys and will exit if **none** of these API keys are found. If multiple keys are provided, you can select the LLM provider via the API request.
-   **`PORT` (Optional)**: The port on which the server will run. Defaults to `3000`.
-   **`*_MODEL` (Optional)**: You can set default model names for each provider (e.g., `GEMINI_MODEL`, `OPENAI_MODEL`, `ANTHROPIC_MODEL`). These serve as fallback defaults if a model is not specified in an API request. The application has its own internal defaults if these are not set (e.g., "gemini-pro", "gpt-3.5-turbo", "claude-instant-1.2").
-   **`NODE_ENV` (Optional)**: Set to `development` for development-specific features (like more detailed error stacks in API responses) or `production` for production.

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
	"llmProvider": "openai",
	"llmModelName": "gpt-4-turbo",
	"llmOptions": { "temperature": 0.5 }
}
```

**Field Descriptions**:

-   `repoUrl` (string, required): The URL of the public GitHub repository to analyze.
-   `projectName` (string, optional): A name for the project. This will be used in the tutorial title and as the base name for the downloaded ZIP file. If not provided, it's derived from the `repoUrl`.
-   `githubToken` (string, optional): A GitHub Personal Access Token. Useful for accessing private repositories or for higher API rate limits.
-   `includePatterns` (string[], optional): Glob patterns for files to include. Uses `micromatch` with `dot:true`.
-   `excludePatterns` (string[], optional): Glob patterns for files to exclude. Exclusions override inclusions. Uses `micromatch` with `dot:true`.
-   `maxFileSize` (number, optional): Maximum individual file size in bytes. Default: `1024 * 1024` (1MB).
-   `language` (string, optional): Target language for tutorial content (e.g., "english", "spanish"). Default: `"english"`.
-   `useCache` (boolean, optional): Whether to use LLM response caching. Enabled by default (`true`). Caching stores LLM responses for identical prompts to speed up subsequent requests and reduce API costs. Cache files are stored in the `.cache` directory.
-   `maxAbstractions` (number, optional): Maximum number of key abstractions to identify. Default: `15`.
-   `llmProvider` (string, optional): Specifies the LLM provider to use.
    -   Valid values: `"gemini"`, `"chatgpt"`, `"claude"`.
    -   If not specified, defaults to `"gemini"`.
    -   Ensure the corresponding API key for the selected provider is set in the `.env` file.
-   `llmModelName` (string, optional): Specifies the particular model from the chosen provider.
    -   Examples: `"gemini-pro"`, `"gemini-1.5-flash"`, `"gpt-4"`, `"gpt-3.5-turbo"`, `"claude-3-opus-20240229"`, `"claude-instant-1.2"`.
    -   If not provided, a default model for the selected provider will be used (e.g., "gemini-pro" for Gemini, "gpt-3.5-turbo" for ChatGPT).
-   `llmOptions` (object, optional): Allows passing additional, provider-specific options to the LLM. This is an advanced feature and is generally not needed for standard use. For example, `{"temperature": 0.7, "max_tokens": 1000}`. The exact options depend on the chosen LLM provider's API.

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
