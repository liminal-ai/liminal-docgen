import { mkdir, writeFile } from "node:fs/promises";
import { metadataWriteRequestSchema } from "../contracts/metadata.js";
import { getErrorMessage } from "../errors.js";
import { err, ok } from "../types/common.js";
import type { EngineResult, MetadataWriteRequest } from "../types/index.js";
import { getMetadataFilePath } from "./file.js";

export const writeMetadata = async (
  request: MetadataWriteRequest,
): Promise<EngineResult<void>> => {
  const parsedRequest = metadataWriteRequestSchema.safeParse(request);

  if (!parsedRequest.success) {
    const issue = parsedRequest.error.issues[0];

    return err("METADATA_ERROR", "Metadata write request is invalid", {
      field: issue ? issue.path.join(".") || "request" : "request",
      issues: parsedRequest.error.issues,
      reason:
        issue?.message ??
        "Metadata write request does not match the expected shape",
    });
  }

  const { metadata, outputPath } = parsedRequest.data;
  const metadataPath = getMetadataFilePath(outputPath);

  try {
    await mkdir(outputPath, { recursive: true });
    await writeFile(
      metadataPath,
      `${JSON.stringify(metadata, null, 2)}\n`,
      "utf8",
    );
  } catch (error) {
    return err(
      "METADATA_ERROR",
      `Unable to write metadata file at ${metadataPath}`,
      {
        path: metadataPath,
        reason: getErrorMessage(error),
      },
    );
  }

  return ok(undefined);
};
