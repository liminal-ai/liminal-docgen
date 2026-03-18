import type { DefaultConfiguration } from "../types/index.js";

const DEFAULT_CONFIGURATION = {
  outputPath: "docs/wiki",
  includePatterns: [],
  excludePatterns: [
    "**/node_modules/**",
    "**/.git/**",
    "**/dist/**",
    "**/build/**",
    "**/coverage/**",
    "**/out/**",
  ],
  focusDirs: [],
} satisfies DefaultConfiguration;

export const getDefaults = (): DefaultConfiguration => ({
  outputPath: DEFAULT_CONFIGURATION.outputPath,
  includePatterns: [...DEFAULT_CONFIGURATION.includePatterns],
  excludePatterns: [...DEFAULT_CONFIGURATION.excludePatterns],
  focusDirs: [...DEFAULT_CONFIGURATION.focusDirs],
});
