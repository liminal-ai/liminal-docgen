import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";

import { generatedDocumentationMetadataSchema } from "../contracts/metadata.js";
import { err, ok } from "../types/common.js";
import type { EngineResult, PublishRequest } from "../types/index.js";
import type { GitAdapterForPublish } from "./adapters.js";
import { detectBaseBranch } from "./base-branch-detector.js";

export interface PreflightResult {
  outputPath: string;
  baseBranch: string;
  branchName: string;
  filesForCommit: string[];
}

export const runPreflight = async (
  request: PublishRequest & { outputPath: string },
  gitAdapter: Pick<
    GitAdapterForPublish,
    "branchExists" | "getDefaultBranch" | "getRemoteUrl"
  >,
): Promise<EngineResult<PreflightResult>> => {
  const outputDirectory = request.outputPath;
  const metadataPath = path.join(outputDirectory, ".doc-meta.json");
  const modulePlanPath = path.join(outputDirectory, ".module-plan.json");

  try {
    const outputStats = await stat(outputDirectory);

    if (!outputStats.isDirectory()) {
      return err(
        "PUBLISH_ERROR",
        `Documentation output path is not a directory: ${outputDirectory}`,
        {
          outputPath: outputDirectory,
        },
      );
    }
  } catch {
    return err(
      "PUBLISH_ERROR",
      `No documentation to publish: output directory does not exist at ${outputDirectory}`,
      {
        outputPath: outputDirectory,
      },
    );
  }

  try {
    const metadataContents = await readFile(metadataPath, "utf8");
    const parsed = JSON.parse(metadataContents) as unknown;
    const validation = generatedDocumentationMetadataSchema.safeParse(parsed);

    if (!validation.success) {
      return err(
        "PUBLISH_ERROR",
        "Documentation metadata is missing or invalid",
        {
          metadataPath,
          outputPath: outputDirectory,
          reason: validation.error.issues
            .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
            .join("; "),
        },
      );
    }
  } catch (error) {
    return err(
      "PUBLISH_ERROR",
      "Documentation metadata is missing or invalid",
      {
        metadataPath,
        outputPath: outputDirectory,
        reason: error instanceof Error ? error.message : String(error),
      },
    );
  }

  try {
    await stat(modulePlanPath);
  } catch {
    return err("PUBLISH_ERROR", "Documentation module plan is missing", {
      modulePlanPath,
      outputPath: outputDirectory,
    });
  }

  const remoteUrlResult = await gitAdapter.getRemoteUrl(request.repoPath);

  if (!remoteUrlResult.ok) {
    return remoteUrlResult;
  }

  const branchName = request.branchName ?? generateBranchName();

  if (await gitAdapter.branchExists(request.repoPath, branchName)) {
    return err(
      "PUBLISH_ERROR",
      `Publish branch already exists: ${branchName}`,
      {
        branchName,
        repoPath: request.repoPath,
      },
    );
  }

  const baseBranchResult = request.baseBranch
    ? ok(request.baseBranch)
    : await detectBaseBranch(request.repoPath, gitAdapter);

  if (!baseBranchResult.ok) {
    return baseBranchResult;
  }

  const filesForCommit = await collectFilesForCommit(
    request.repoPath,
    outputDirectory,
  );

  if (filesForCommit.length === 0) {
    return err(
      "PUBLISH_ERROR",
      `No documentation to publish: output directory is empty at ${outputDirectory}`,
      {
        outputPath: outputDirectory,
      },
    );
  }

  return ok({
    baseBranch: baseBranchResult.value,
    branchName,
    filesForCommit,
    outputPath: outputDirectory,
  });
};

const generateBranchName = (): string => {
  const timestamp = new Date().toISOString().replace(/[:.]/gu, "-");
  return `docs/update-${timestamp}`;
};

const collectFilesForCommit = async (
  repoPath: string,
  outputPath: string,
): Promise<string[]> => {
  const entries = await readdir(outputPath, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const absolutePath = path.join(outputPath, entry.name);

    if (entry.isDirectory()) {
      const nestedFiles = await collectFilesForCommit(repoPath, absolutePath);
      files.push(...nestedFiles);
      continue;
    }

    if (!entry.isFile()) {
      continue;
    }

    files.push(path.relative(repoPath, absolutePath));
  }

  return files.sort();
};
