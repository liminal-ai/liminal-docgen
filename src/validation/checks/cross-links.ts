import { readFile } from "node:fs/promises";
import path from "node:path";

import type { ValidationFinding } from "../../types/index.js";
import { listMarkdownFiles, pathExists } from "./shared.js";

const MARKDOWN_LINK_PATTERN = /(?<!!)\[[^\]]+\]\(([^)]+)\)/g;
const EXTERNAL_SCHEME_PATTERN = /^[a-z][a-z0-9+.-]*:/i;

export const checkCrossLinks = async (
  outputPath: string,
): Promise<ValidationFinding[]> => {
  const markdownFiles = await listMarkdownFiles(outputPath);

  if (markdownFiles.length === 0) {
    return [];
  }

  const findings: ValidationFinding[] = [];

  for (const filePath of markdownFiles) {
    const contents = await readFile(filePath, "utf8");

    for (const match of contents.matchAll(MARKDOWN_LINK_PATTERN)) {
      const rawTarget = match[1]?.trim();

      if (!rawTarget || !shouldValidateLink(rawTarget)) {
        continue;
      }

      const resolvedTargetPath = path.resolve(
        path.dirname(filePath),
        stripLinkSuffixes(rawTarget),
      );

      const normalizedTarget = path.normalize(resolvedTargetPath);
      const normalizedOutput = path.normalize(outputPath);

      if (
        !normalizedTarget.startsWith(`${normalizedOutput}${path.sep}`) &&
        normalizedTarget !== normalizedOutput
      ) {
        findings.push({
          category: "broken-link",
          filePath,
          message: `Broken internal link in ${filePath}: ${rawTarget}`,
          severity: "error",
          target: rawTarget,
        });
        continue;
      }

      if (await pathExists(resolvedTargetPath)) {
        continue;
      }

      findings.push({
        category: "broken-link",
        filePath,
        message: `Broken internal link in ${filePath}: ${rawTarget}`,
        severity: "error",
        target: rawTarget,
      });
    }
  }

  return findings;
};

// Only validates internal .md links — non-markdown targets (images, JSON, etc.)
// are intentionally excluded as they are not part of the documentation graph.
const shouldValidateLink = (target: string): boolean => {
  if (target.startsWith("#")) {
    return false;
  }

  if (EXTERNAL_SCHEME_PATTERN.test(target)) {
    return false;
  }

  return stripLinkSuffixes(target).toLowerCase().endsWith(".md");
};

const stripLinkSuffixes = (target: string): string =>
  target.split("#", 1)[0]?.split("?", 1)[0] ?? target;
