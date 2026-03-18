import { readFile } from "node:fs/promises";

import type { ValidationFinding } from "../../types/index.js";
import { listMarkdownFiles } from "./shared.js";

const MERMAID_BLOCK_PATTERN = /```mermaid\s*([\s\S]*?)```/g;
const MERMAID_DIAGRAM_PATTERN =
  /^(graph|flowchart|sequenceDiagram|classDiagram|stateDiagram(?:-v2)?|erDiagram|gantt|pie|gitgraph)\b/;
const DELIMITER_PAIRS = new Map<string, string>([
  ["(", ")"],
  ["[", "]"],
  ["{", "}"],
]);
const CLOSING_DELIMITERS = new Set<string>(DELIMITER_PAIRS.values());

export const checkMermaid = async (
  outputPath: string,
): Promise<ValidationFinding[]> => {
  const markdownFiles = await listMarkdownFiles(outputPath);

  if (markdownFiles.length === 0) {
    return [];
  }

  const findings: ValidationFinding[] = [];

  for (const filePath of markdownFiles) {
    const contents = await readFile(filePath, "utf8");

    for (const mermaidBlock of extractMermaidBlocks(contents)) {
      const issues = validateMermaidBlock(mermaidBlock);

      if (issues.length === 0) {
        continue;
      }

      findings.push({
        category: "mermaid",
        filePath,
        message: `Malformed Mermaid block in ${filePath}: ${issues.join("; ")}`,
        severity: "warning",
      });
    }
  }

  return findings;
};

const extractMermaidBlocks = (contents: string): string[] =>
  [...contents.matchAll(MERMAID_BLOCK_PATTERN)].map((match) => match[1] ?? "");

const validateMermaidBlock = (block: string): string[] => {
  const issues: string[] = [];
  const firstNonEmptyLine = block
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .find((line) => line.length > 0);

  if (!firstNonEmptyLine || !MERMAID_DIAGRAM_PATTERN.test(firstNonEmptyLine)) {
    issues.push("missing Mermaid diagram type declaration");
  }

  if (!hasBalancedDelimiters(block)) {
    issues.push("unbalanced Mermaid delimiters");
  }

  return issues;
};

const hasBalancedDelimiters = (block: string): boolean => {
  const stack: string[] = [];
  let inSingleQuotes = false;
  let inDoubleQuotes = false;
  let escaped = false;

  for (const character of block) {
    if (escaped) {
      escaped = false;
      continue;
    }

    if (character === "\\") {
      escaped = true;
      continue;
    }

    if (character === "'" && !inDoubleQuotes) {
      inSingleQuotes = !inSingleQuotes;
      continue;
    }

    if (character === '"' && !inSingleQuotes) {
      inDoubleQuotes = !inDoubleQuotes;
      continue;
    }

    if (inSingleQuotes || inDoubleQuotes) {
      continue;
    }

    if (DELIMITER_PAIRS.has(character)) {
      stack.push(character);
      continue;
    }

    if (!CLOSING_DELIMITERS.has(character)) {
      continue;
    }

    const openingCharacter = stack.pop();

    if (
      !openingCharacter ||
      DELIMITER_PAIRS.get(openingCharacter) !== character
    ) {
      return false;
    }
  }

  return stack.length === 0 && !inSingleQuotes && !inDoubleQuotes;
};
