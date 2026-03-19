import { readFile } from "node:fs/promises";
import path from "node:path";

import type {
  AgentRuntimeConfig,
  ReadSourceInput,
  ReadSourceOutput,
} from "../types.js";

/**
 * Execute a read_source tool call. Returns file content sandboxed
 * to the repository root.
 *
 * Sandbox enforcement (AC-4.1b):
 * - Resolves the path relative to repoRoot
 * - Normalizes with path.resolve to collapse ../
 * - Rejects if the resolved path doesn't start with repoRoot
 *
 * Line cap (from index Q3 answer):
 * - Returns first maxReadLines lines (default 2000)
 * - If file exceeds cap, returns truncation notice with omitted line count
 *
 * References: AC-4.1a (read component source), AC-4.1b (sandbox),
 *             AC-4.1c (multiple reads)
 */
export async function executeReadSource(
  input: ReadSourceInput,
  config: AgentRuntimeConfig,
): Promise<ReadSourceOutput> {
  const resolvedPath = path.resolve(config.repoRoot, input.filePath);

  // Sandbox check: resolved path must be within repo root
  if (
    !resolvedPath.startsWith(config.repoRoot + path.sep) &&
    resolvedPath !== config.repoRoot
  ) {
    return {
      error: `Path "${input.filePath}" resolves outside the repository root. Access denied.`,
    };
  }

  try {
    const content = await readFile(resolvedPath, "utf8");
    const lines = content.split("\n");

    if (lines.length <= config.maxReadLines) {
      return {
        content,
        lineCount: lines.length,
        truncated: false,
      };
    }

    const truncatedContent = lines.slice(0, config.maxReadLines).join("\n");
    const omittedCount = lines.length - config.maxReadLines;

    return {
      content: `${truncatedContent}\n\n--- Truncated: ${omittedCount} lines omitted (file has ${lines.length} total lines) ---`,
      lineCount: config.maxReadLines,
      truncated: true,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      error: `Failed to read "${input.filePath}": ${message}`,
    };
  }
}
