import { getGitRepositoryStatus } from "../adapters/git.js";
import {
  createDiscoveryScope,
  detectLanguagesInScope,
  discoverRepositoryFiles,
} from "../analysis/file-discovery.js";
import { shouldRequirePythonForScope } from "../analysis/provider.js";
import { checkInferenceProvider } from "../inference/check.js";
import { err, ok } from "../types/common.js";
import type {
  EngineResult,
  EnvironmentCheckRequest,
  EnvironmentCheckResult,
} from "../types/index.js";
import { checkParsers } from "./parser-checker.js";
import { checkRuntimeDependenciesForScope } from "./runtime-checker.js";

export const checkEnvironment = async (
  request: EnvironmentCheckRequest = {},
): Promise<EngineResult<EnvironmentCheckResult>> => {
  try {
    const baseScope = createDiscoveryScope(request);
    let findings = await checkRuntimeDependenciesForScope({
      requiresPython: !request.repoPath && !request.inference,
    });
    let detectedLanguages: string[] = [];

    if (request.repoPath) {
      const repositoryStatus = await getGitRepositoryStatus(request.repoPath);

      if (repositoryStatus === "invalid-path") {
        findings.push({
          category: "invalid-path",
          message: `Path does not exist or is not a directory: ${request.repoPath}`,
          path: request.repoPath,
          severity: "error",
        });
      } else {
        const scopedFiles = await discoverRepositoryFiles(
          request.repoPath,
          baseScope,
        );
        detectedLanguages = detectLanguagesInScope(scopedFiles);
        findings = await checkRuntimeDependenciesForScope({
          requiresPython: shouldRequirePythonForScope(scopedFiles),
        });

        if (shouldRequirePythonForScope(scopedFiles)) {
          findings.push(...(await checkParsers(detectedLanguages)));
        }

        if (request.inference) {
          findings.push(...(await checkInferenceProvider(request.inference)));
        }

        if (repositoryStatus === "invalid-repo") {
          findings.push({
            category: "invalid-repo",
            message: `Path is not a git repository: ${request.repoPath}`,
            path: request.repoPath,
            severity: "error",
          });
        }
      }
    } else if (request.inference) {
      findings.push(...(await checkInferenceProvider(request.inference)));
    }

    return ok({
      detectedLanguages,
      findings,
      passed: !findings.some((finding) => finding.severity === "error"),
    });
  } catch (error) {
    return err(
      "ENVIRONMENT_ERROR",
      "Failed to complete environment check.",
      error,
    );
  }
};
