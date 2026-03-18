import { checkEnvironment } from "../../environment/check.js";
import { err } from "../../types/common.js";
import type {
  EngineResult,
  EnvironmentCheckFinding,
  EnvironmentCheckResult,
  ResolvedRunConfig,
} from "../../types/index.js";

export const runEnvironmentCheck = async (
  config: ResolvedRunConfig,
): Promise<EngineResult<EnvironmentCheckResult>> => {
  const result = await checkEnvironment({
    excludePatterns: config.excludePatterns,
    focusDirs: config.focusDirs,
    includePatterns: config.includePatterns,
    repoPath: config.repoPath,
  });

  if (!result.ok) {
    return result;
  }

  if (result.value.passed) {
    return result;
  }

  const primaryErrorFinding = result.value.findings.find(
    (finding) => finding.severity === "error",
  );

  if (!primaryErrorFinding) {
    return err("ENVIRONMENT_ERROR", "Environment check failed", {
      findings: result.value.findings,
    });
  }

  return err(
    mapFindingToErrorCode(primaryErrorFinding),
    primaryErrorFinding.message,
    {
      findings: result.value.findings,
    },
  );
};

const mapFindingToErrorCode = (
  finding: EnvironmentCheckFinding,
): "DEPENDENCY_MISSING" | "ENVIRONMENT_ERROR" | "PATH_ERROR" => {
  switch (finding.category) {
    case "missing-dependency":
      return "DEPENDENCY_MISSING";
    case "invalid-path":
      return "PATH_ERROR";
    case "environment":
    case "invalid-repo":
      return "ENVIRONMENT_ERROR";
  }
};
