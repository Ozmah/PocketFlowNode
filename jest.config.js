module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src', '<rootDir>/tests'], // Include a new 'tests' directory
  testMatch: ['**/tests/**/*.test.ts', '**/?(*.)+(spec|test).ts'], // Pattern for test files
};
