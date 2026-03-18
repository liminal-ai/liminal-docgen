import type { InferenceConfiguration } from "../inference/types.js";

export interface EnvironmentCheckRequest {
  repoPath?: string;
  includePatterns?: string[];
  excludePatterns?: string[];
  focusDirs?: string[];
  inference?: InferenceConfiguration;
}

export interface EnvironmentCheckResult {
  passed: boolean;
  findings: EnvironmentCheckFinding[];
  detectedLanguages: string[];
}

export interface EnvironmentCheckFinding {
  severity: "warning" | "error";
  category:
    | "missing-dependency"
    | "invalid-repo"
    | "invalid-path"
    | "environment";
  message: string;
  dependencyName?: string;
  path?: string;
}
