import path from "node:path";

import * as ghAdapter from "../adapters/gh.js";
import * as gitAdapter from "../adapters/git.js";
import { err } from "../types/common.js";
import type {
  EngineResult,
  PublishRequest,
  PublishResult,
} from "../types/index.js";
import type { GhAdapterForPublish, GitAdapterForPublish } from "./adapters.js";
import { createDocsBranch } from "./branch-manager.js";
import { createPR } from "./pr-creator.js";
import { runPreflight } from "./preflight.js";

export type { GhAdapterForPublish, GitAdapterForPublish } from "./adapters.js";

export const publishDocumentation = async (
  request: PublishRequest,
  adapters?: {
    git: GitAdapterForPublish;
    gh: GhAdapterForPublish;
  },
): Promise<EngineResult<PublishResult>> => {
  try {
    return await publishDocumentationInternal(request, adapters);
  } catch (error) {
    return err(
      "PUBLISH_ERROR",
      error instanceof Error ? error.message : "Unexpected publish failure",
      {
        repoPath: request.repoPath,
        reason: error instanceof Error ? error.stack : String(error),
      },
    );
  }
};

const publishDocumentationInternal = async (
  request: PublishRequest,
  adapters?: {
    git: GitAdapterForPublish;
    gh: GhAdapterForPublish;
  },
): Promise<EngineResult<PublishResult>> => {
  const resolvedOutputPath = resolveOutputPath(
    request.repoPath,
    request.outputPath,
  );
  const resolvedAdapters = adapters ?? {
    gh: ghAdapter,
    git: gitAdapter,
  };

  const preflightResult = await runPreflight(
    {
      ...request,
      outputPath: resolvedOutputPath,
    },
    resolvedAdapters.git,
  );

  if (!preflightResult.ok) {
    return preflightResult;
  }

  const commitMessage =
    request.commitMessage ??
    `docs: update generated documentation in ${path.relative(request.repoPath, resolvedOutputPath) || "."}`;
  const branchResult = await createDocsBranch(
    {
      baseBranch: preflightResult.value.baseBranch,
      branchName: preflightResult.value.branchName,
      commitMessage,
      filesForCommit: preflightResult.value.filesForCommit,
      outputPath: resolvedOutputPath,
      repoPath: request.repoPath,
    },
    resolvedAdapters.git,
  );

  if (!branchResult.ok) {
    return branchResult;
  }

  const shouldCreatePR = request.createPullRequest ?? true;

  if (!shouldCreatePR) {
    return {
      ok: true,
      value: {
        branchName: preflightResult.value.branchName,
        commitHash: branchResult.value.commitHash,
        filesCommitted: branchResult.value.filesCommitted,
        pullRequestNumber: null,
        pullRequestUrl: null,
        pushedToRemote: true,
      },
    };
  }

  const pullRequestResult = await createPR(
    {
      baseBranch: preflightResult.value.baseBranch,
      body: request.prBody,
      branchName: preflightResult.value.branchName,
      commitHash: branchResult.value.commitHash,
      filesCount: branchResult.value.filesCommitted.length,
      repoPath: request.repoPath,
      title: request.prTitle,
    },
    resolvedAdapters.gh,
  );

  if (!pullRequestResult.ok) {
    return pullRequestResult;
  }

  return {
    ok: true,
    value: {
      branchName: preflightResult.value.branchName,
      commitHash: branchResult.value.commitHash,
      filesCommitted: branchResult.value.filesCommitted,
      pullRequestNumber: pullRequestResult.value.number,
      pullRequestUrl: pullRequestResult.value.url,
      pushedToRemote: true,
    },
  };
};

const resolveOutputPath = (repoPath: string, outputPath?: string): string => {
  const configuredOutputPath = outputPath ?? path.join("docs", "wiki");

  return path.isAbsolute(configuredOutputPath)
    ? configuredOutputPath
    : path.join(repoPath, configuredOutputPath);
};
