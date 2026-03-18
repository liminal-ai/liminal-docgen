import { readFile } from "node:fs/promises";
import { getErrorMessage } from "../errors.js";
import { err, ok } from "../types/common.js";
import type {
  EngineResult,
  GeneratedDocumentationMetadata,
} from "../types/index.js";
import { getMetadataFilePath } from "./file.js";
import { validateMetadataShape } from "./validate-shape.js";

export const readMetadata = async (
  outputPath: string,
): Promise<EngineResult<GeneratedDocumentationMetadata>> => {
  const metadataPath = getMetadataFilePath(outputPath);

  let rawMetadata: string;

  try {
    rawMetadata = await readFile(metadataPath, "utf8");
  } catch (error) {
    return err(
      "METADATA_ERROR",
      `Unable to read metadata file at ${metadataPath}`,
      {
        path: metadataPath,
        reason: getErrorMessage(error),
      },
    );
  }

  let parsedMetadata: unknown;

  try {
    parsedMetadata = JSON.parse(rawMetadata);
  } catch (error) {
    return err(
      "METADATA_ERROR",
      `Invalid JSON in metadata file at ${metadataPath}`,
      {
        path: metadataPath,
        reason: getErrorMessage(error),
      },
    );
  }

  const validation = validateMetadataShape(parsedMetadata);

  if (!validation.valid) {
    return err("METADATA_ERROR", `Invalid metadata file at ${metadataPath}`, {
      path: metadataPath,
      reason: validation.reason,
    });
  }

  return ok(validation.metadata);
};
