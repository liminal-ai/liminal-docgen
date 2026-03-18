import { access } from "node:fs/promises";
import path from "node:path";

import { getHeadCommitHash } from "../adapters/git.js";
import { resolveConfiguration } from "../config/resolver.js";
import { getErrorMessage } from "../errors.js";
import { err, ok } from "../types/common.js";
import type {
  DocumentationStatus,
  DocumentationStatusRequest,
  EngineResult,
} from "../types/index.js";
import { getMetadataFilePath } from "./file.js";
import { readMetadata } from "./reader.js";

export const getDocumentationStatus = async (
  request: DocumentationStatusRequest,
): Promise<EngineResult<DocumentationStatus>> => {
  const resolvedPaths = await resolveStatusPaths(request);

  if (!resolvedPaths.ok) {
    return resolvedPaths;
  }

  const { filesystemOutputPath, outputPath } = resolvedPaths.value;
  const metadataPath = getMetadataFilePath(filesystemOutputPath);

  if (!(await pathExists(metadataPath))) {
    return ok(createStatus("not_generated", outputPath));
  }

  const metadataResult = await readMetadata(filesystemOutputPath);

  if (!metadataResult.ok) {
    return ok(createStatus("invalid", outputPath));
  }

  let currentHeadCommitHash: string;

  try {
    currentHeadCommitHash = await getHeadCommitHash(request.repoPath);
  } catch (error) {
    return err(
      "ENVIRONMENT_ERROR",
      "Unable to resolve the current HEAD commit hash",
      {
        repoPath: request.repoPath,
        reason: getErrorMessage(error),
      },
    );
  }

  const { generatedAt, commitHash } = metadataResult.value;

  return ok({
    currentHeadCommitHash,
    lastGeneratedAt: generatedAt,
    lastGeneratedCommitHash: commitHash,
    outputPath,
    state: commitHash === currentHeadCommitHash ? "current" : "stale",
  });
};

const resolveStatusPaths = async (
  request: DocumentationStatusRequest,
): Promise<
  EngineResult<{ outputPath: string; filesystemOutputPath: string }>
> => {
  if (request.outputPath) {
    return ok({
      filesystemOutputPath: resolveOutputPath(
        request.repoPath,
        request.outputPath,
      ),
      outputPath: request.outputPath,
    });
  }

  const configurationResult = await resolveConfiguration({
    repoPath: request.repoPath,
  });

  if (!configurationResult.ok) {
    return configurationResult;
  }

  return ok({
    filesystemOutputPath: resolveOutputPath(
      request.repoPath,
      configurationResult.value.outputPath,
    ),
    outputPath: configurationResult.value.outputPath,
  });
};

const resolveOutputPath = (repoPath: string, outputPath: string): string =>
  path.isAbsolute(outputPath) ? outputPath : path.join(repoPath, outputPath);

const pathExists = async (filePath: string): Promise<boolean> => {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
};

const createStatus = (
  state: DocumentationStatus["state"],
  outputPath: string,
): DocumentationStatus => ({
  currentHeadCommitHash: null,
  lastGeneratedAt: null,
  lastGeneratedCommitHash: null,
  outputPath,
  state,
});
