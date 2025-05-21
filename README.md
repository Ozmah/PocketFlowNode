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
    git clone <your_repository_url>
    ```

    (Replace `<your_repository_url>` with the actual URL of this project's repository)

2.  **Navigate to the directory**:

    ```bash
    cd <repository_directory>
    ```

    (Replace `<repository_directory>` with the name of the cloned folder)

3.  **Install dependencies**:
    ```bash
    npm install
    ```
    (or `yarn install` if you prefer yarn)

## Environment Variables

Create a `.env` file in the root of the project. **This file should not be committed to git.** (Ensure `.env` is listed in your `.gitignore` file).

Contents of `.env`:

```env
# Required
GEMINI_API_KEY=your_google_gemini_api_key_here

# Optional
PORT=3000
GEMINI_MODEL=gemini-pro
NODE_ENV=development # 'production' for production builds
# LOG_LEVEL=debug # Example if a more sophisticated logger is added in the future
```

-   **`GEMINI_API_KEY` (Required)**: Your API key for Google Gemini. The application will not start without this key.
-   **`PORT` (Optional)**: The port on which the server will run. Defaults to `3000` (as typically set in `src/index.ts` or `process.env.PORT`).
-   **`GEMINI_MODEL` (Optional)**: The specific Gemini model to use. Defaults to `gemini-pro` (as set in `src/utils/llm.ts`).
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
	"maxAbstractions": 12
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
-   `useCache` (boolean, optional): Whether to use the caching mechanism for LLM responses. Default: `true`.
-   `maxAbstractions` (number, optional): The maximum number of key abstractions the LLM should try to identify. Default: `15` (as per `src/index.ts`).

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

## Project Structure (Brief)

```
.
├── .cache/            # LLM response cache and interaction logs (gitignored)
├── dist/              # Compiled JavaScript output (gitignored)
├── node_modules/      # Project dependencies (gitignored)
├── src/               # Source code
│   ├── core/          # Core logic for abstraction, relationships, chapters generation
│   ├── utils/         # Utility functions (LLM interaction, GitHub crawler, etc.)
│   ├── types.ts       # TypeScript type definitions for shared data structures
│   └── index.ts       # Express server setup, API endpoint routing, main workflow orchestration
├── tests/             # Unit tests
│   ├── core/          # Tests for core logic modules
│   └── utils/         # Tests for utility modules
├── .env               # Environment variables (gitignored by default, create this file)
├── .gitignore         # Specifies intentionally untracked files
├── jest.config.js     # Jest test runner configuration
├── package.json       # Project metadata and dependencies
├── package-lock.json  # Records exact versions of dependencies
├── README.md          # This file
└── tsconfig.json      # TypeScript compiler configuration
```

## Contributing

Contributions are welcome! If you'd like to contribute, please:

1.  Fork the repository.
2.  Create a new branch for your feature or bug fix (`git checkout -b feature/your-feature-name`).
3.  Make your changes.
4.  Ensure your code adheres to the existing style and that all tests pass (`npm test`).
5.  Commit your changes (`git commit -am 'Add some feature'`).
6.  Push to the branch (`git push origin feature/your-feature-name`).
7.  Submit a pull request with a clear description of your changes.

## License

This project is licensed under the MIT License. (It is recommended to create a `LICENSE` file in the root of the project containing the full MIT License text.)

```

```
