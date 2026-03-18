import { readFile } from "node:fs/promises";

import { getMetadataFilePath } from "../../metadata/file.js";
import { validateMetadataShape } from "../../metadata/validate-shape.js";
import type { ValidationFinding } from "../../types/index.js";
import { pathExists } from "./shared.js";

export const checkMetadataShape = async (
  outputPath: string,
  requirePersistedArtifacts = true,
): Promise<ValidationFinding[]> => {
  if (!requirePersistedArtifacts) {
    return [];
  }

  const metadataPath = getMetadataFilePath(outputPath);

  if (!(await pathExists(metadataPath))) {
    return [];
  }

  const rawMetadata = await readFile(metadataPath, "utf8");
  let parsedMetadata: unknown;

  try {
    parsedMetadata = JSON.parse(rawMetadata);
  } catch {
    return [
      {
        category: "metadata",
        filePath: metadataPath,
        message: `Invalid JSON in metadata file at ${metadataPath}`,
        severity: "error",
      },
    ];
  }

  const validation = validateMetadataShape(parsedMetadata);

  if (validation.valid) {
    return [];
  }

  return [
    {
      category: "metadata",
      filePath: metadataPath,
      message: `Invalid metadata file at ${metadataPath}: ${validation.reason}`,
      severity: "error",
    },
  ];
};
