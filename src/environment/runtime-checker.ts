import { constants } from "node:fs";
import { access } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { isGitAvailable } from "../adapters/git.js";
import { isPythonAvailable } from "../adapters/python.js";
import type { EnvironmentCheckFinding } from "../types/index.js";

export const checkRuntimeDependencies = async (): Promise<
  EnvironmentCheckFinding[]
> => checkRuntimeDependenciesForScope({ requiresPython: true });

export const checkRuntimeDependenciesForScope = async (options: {
  requiresPython: boolean;
}): Promise<EnvironmentCheckFinding[]> => {
  const findings: EnvironmentCheckFinding[] = [];

  if (options.requiresPython && !(await isPythonAvailable())) {
    findings.push({
      category: "missing-dependency",
      dependencyName: "python",
      message:
        "Python 3.11+ is required for structural analysis. Install Python 3.11+ and ensure it is available on PATH.",
      severity: "error",
    });
  }

  if (!(await isGitAvailable())) {
    findings.push({
      category: "missing-dependency",
      dependencyName: "git",
      message: "Git is required for repository validation and commit metadata.",
      severity: "error",
    });
  }

  for (const scriptPath of options.requiresPython
    ? BUNDLED_ANALYSIS_SCRIPT_PATHS
    : []) {
    try {
      await access(scriptPath, constants.F_OK);
    } catch {
      findings.push({
        category: "environment",
        message: `Bundled analysis script is missing: ${scriptPath}`,
        severity: "error",
      });
      continue;
    }

    try {
      await access(scriptPath, constants.X_OK);
    } catch {
      findings.push({
        category: "environment",
        message: `Bundled analysis script is not executable: ${scriptPath}`,
        severity: "error",
      });
    }
  }

  return findings;
};

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const BUNDLED_ANALYSIS_SCRIPT_PATHS = [
  path.resolve(__dirname, "../analysis/scripts/analyze_repository.py"),
];
