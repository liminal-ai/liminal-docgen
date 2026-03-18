import path from "node:path";

import { METADATA_FILE_NAME } from "../../metadata/file.js";
import type { ValidationFinding } from "../../types/index.js";
import { pathExists } from "./shared.js";

const REQUIRED_FILES = [
  "overview.md",
  "module-tree.json",
  METADATA_FILE_NAME,
  ".module-plan.json",
];

export const checkFilePresence = async (
  outputPath: string,
  requirePersistedArtifacts = true,
): Promise<ValidationFinding[]> => {
  const findings: ValidationFinding[] = [];
  const requiredFiles = requirePersistedArtifacts
    ? REQUIRED_FILES
    : REQUIRED_FILES.filter(
        (requiredFile) =>
          requiredFile !== METADATA_FILE_NAME &&
          requiredFile !== ".module-plan.json",
      );

  for (const requiredFile of requiredFiles) {
    const filePath = path.join(outputPath, requiredFile);

    if (await pathExists(filePath)) {
      continue;
    }

    findings.push({
      category: "missing-file",
      filePath,
      message: `Missing required file: ${filePath}`,
      severity: "error",
    });
  }

  return findings;
};
