import { stat } from "node:fs/promises";

import { getHeadCommitHash } from "../adapters/git.js";
import { resolveConfiguration } from "../config/resolver.js";
import { getErrorMessage } from "../errors.js";
import { err, ok } from "../types/common.js";
import type {
  AnalysisOptions,
  EngineResult,
  RepositoryAnalysis,
} from "../types/index.js";
import { AnalysisAdapterError, runAnalysis } from "./adapter.js";
import {
  createDiscoveryScope,
  discoverRepositoryFiles,
} from "./file-discovery.js";
import { runNativeAnalysis } from "./native.js";
import { normalize } from "./normalizer.js";
import {
  getPythonScopedConfiguration,
  selectAnalysisProvider,
} from "./provider.js";

export const analyzeRepository = async (
  options: AnalysisOptions,
): Promise<EngineResult<RepositoryAnalysis>> => {
  const pathError = await validateRepositoryPath(options.repoPath);

  if (pathError) {
    return pathError;
  }

  const configurationResult = await resolveConfiguration({
    excludePatterns: options.excludePatterns,
    focusDirs: options.focusDirs,
    includePatterns: options.includePatterns,
    repoPath: options.repoPath,
  });

  if (!configurationResult.ok) {
    return configurationResult;
  }

  try {
    const scopedFiles = await discoverRepositoryFiles(
      options.repoPath,
      createDiscoveryScope(configurationResult.value),
    );
    const providerSelection = selectAnalysisProvider(scopedFiles);
    const raw =
      providerSelection.kind === "python"
        ? await runAnalysis(
            options.repoPath,
            getPythonScopedConfiguration(configurationResult.value),
          )
        : await runNativeAnalysis(
            options.repoPath,
            providerSelection.scopedFiles,
            configurationResult.value,
          );
    const normalized = normalize(raw, configurationResult.value);
    const commitHash = await getHeadCommitHash(options.repoPath);

    return ok({
      commitHash,
      components: normalized.components,
      focusDirs: normalized.focusDirs,
      relationships: normalized.relationships,
      repoPath: options.repoPath,
      summary: normalized.summary,
    });
  } catch (error) {
    if (error instanceof AnalysisAdapterError) {
      return err(error.code, error.message, error.details);
    }

    return mapUnexpectedFailure(error);
  }
};

const validateRepositoryPath = async (
  repoPath: string,
): Promise<EngineResult<RepositoryAnalysis> | null> => {
  try {
    const repositoryStats = await stat(repoPath);

    if (!repositoryStats.isDirectory()) {
      return err(
        "PATH_ERROR",
        `Repository path is not a directory: ${repoPath}`,
        {
          path: repoPath,
        },
      );
    }

    return null;
  } catch (error) {
    return err("PATH_ERROR", `Repository path does not exist: ${repoPath}`, {
      cause: getErrorMessage(error),
      path: repoPath,
    });
  }
};

const mapUnexpectedFailure = (
  error: unknown,
): EngineResult<RepositoryAnalysis> => {
  if (isNodeError(error) && error.code === "ENOENT") {
    return err(
      "DEPENDENCY_MISSING",
      "Git is required to capture commit metadata.",
      {
        cause: error.message,
      },
    );
  }

  return err(
    "ANALYSIS_ERROR",
    "Failed to analyze repository structure.",
    error instanceof Error ? { cause: error.message } : error,
  );
};

const isNodeError = (error: unknown): error is NodeJS.ErrnoException =>
  error instanceof Error && "code" in error;
