import path from "node:path";
import { fileURLToPath } from "node:url";

import { ZodError } from "zod";
import { getPythonCommand } from "../adapters/python.js";
import {
  runSubprocess,
  SubprocessTimeoutError,
} from "../adapters/subprocess.js";
import { rawAnalysisOutputSchema } from "../contracts/analysis.js";
import { getErrorMessage } from "../errors.js";
import type { RawAnalysisOutput } from "./raw-output.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ANALYSIS_SCRIPT_PATH = path.resolve(
  __dirname,
  "./scripts/analyze_repository.py",
);
const ANALYSIS_TIMEOUT_MS = 60_000;

type AnalysisAdapterErrorCode =
  | "DEPENDENCY_MISSING"
  | "PATH_ERROR"
  | "ANALYSIS_ERROR";

export class AnalysisAdapterError extends Error {
  constructor(
    public readonly code: AnalysisAdapterErrorCode,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = "AnalysisAdapterError";
  }
}

export const runAnalysis = async (
  repoPath: string,
  relativeFilePaths: string[],
): Promise<RawAnalysisOutput> => {
  const pythonCommand = await getPythonCommand();

  if (!pythonCommand) {
    throw new AnalysisAdapterError(
      "DEPENDENCY_MISSING",
      "Python 3.11+ is required for structural analysis. Install Python 3.11+ and ensure it is available on PATH.",
    );
  }

  try {
    const result = await runSubprocess(
      pythonCommand,
      buildAnalysisArgs(repoPath, relativeFilePaths),
      {
        cwd: repoPath,
        timeoutMs: ANALYSIS_TIMEOUT_MS,
      },
    );

    if (result.exitCode !== 0) {
      throw new AnalysisAdapterError(
        "ANALYSIS_ERROR",
        "Python analysis subprocess failed.",
        {
          exitCode: result.exitCode,
          stderr: result.stderr.trim(),
          stdout: result.stdout.trim(),
        },
      );
    }

    return parseRawAnalysisOutput(result.stdout);
  } catch (error) {
    if (error instanceof AnalysisAdapterError) {
      throw error;
    }

    if (isNodeError(error) && error.code === "ENOENT") {
      throw new AnalysisAdapterError(
        "DEPENDENCY_MISSING",
        "Python 3.11+ is required for structural analysis. Install Python 3.11+ and ensure it is available on PATH.",
        { cause: error.message },
      );
    }

    if (error instanceof SubprocessTimeoutError) {
      throw new AnalysisAdapterError(
        "ANALYSIS_ERROR",
        "Python analysis subprocess timed out.",
        { cause: getErrorMessage(error) },
      );
    }

    throw new AnalysisAdapterError(
      "ANALYSIS_ERROR",
      "Python analysis subprocess failed.",
      { cause: getErrorMessage(error) },
    );
  }
};

const buildAnalysisArgs = (
  repoPath: string,
  relativeFilePaths: string[],
): string[] => [
  ANALYSIS_SCRIPT_PATH,
  "--repo-path",
  repoPath,
  ...flattenFlag("--file", relativeFilePaths),
];

const flattenFlag = (flag: string, values: string[]): string[] =>
  values.flatMap((value) => [flag, value]);

const parseRawAnalysisOutput = (stdout: string): RawAnalysisOutput => {
  let parsed: unknown;

  try {
    parsed = JSON.parse(stdout);
  } catch (error) {
    throw new AnalysisAdapterError(
      "ANALYSIS_ERROR",
      "Python analysis subprocess returned invalid JSON.",
      {
        cause: getErrorMessage(error),
        stdout: stdout.trim(),
      },
    );
  }

  try {
    return rawAnalysisOutputSchema.parse(parsed);
  } catch (error) {
    if (error instanceof ZodError) {
      throw new AnalysisAdapterError(
        "ANALYSIS_ERROR",
        "Python analysis subprocess returned an invalid payload shape.",
        { issues: error.issues },
      );
    }

    throw error;
  }
};

const isNodeError = (error: unknown): error is NodeJS.ErrnoException =>
  error instanceof Error && "code" in error;
