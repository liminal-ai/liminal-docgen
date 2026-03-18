/**
 * Canonical extension-to-language mapping shared across the engine.
 *
 * The environment language detector and analysis normalizer both depend on
 * this map. Keep it in sync with the Python analysis script's
 * LANGUAGE_BY_EXTENSION when adding new languages.
 */
export const LANGUAGE_BY_EXTENSION: Record<string, string> = {
  ".c": "c",
  ".cjs": "javascript",
  ".cpp": "cpp",
  ".cs": "csharp",
  ".cts": "typescript",
  ".go": "go",
  ".java": "java",
  ".js": "javascript",
  ".jsx": "javascript",
  ".kt": "kotlin",
  ".mjs": "javascript",
  ".mts": "typescript",
  ".php": "php",
  ".py": "python",
  ".rs": "rust",
  ".ts": "typescript",
  ".tsx": "typescript",
};
