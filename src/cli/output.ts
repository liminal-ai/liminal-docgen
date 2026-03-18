import type {
  CliResultEnvelope,
  DocumentationRunResult,
  DocumentationStatus,
  EnvironmentCheckResult,
  PublishResult,
  RepositoryAnalysis,
  ValidationResult,
} from "../types/index.js";

export function writeJsonResult<T>(command: string, result: T): void {
  const envelope: CliResultEnvelope<unknown> = {
    command,
    result: normalizeForJson(result),
    success: true,
  };

  writeStdout(JSON.stringify(envelope));
}

export function writeJsonError(
  command: string,
  error: {
    code: string;
    message: string;
    details?: unknown;
  },
  context?: Record<string, unknown>,
): void {
  const details = mergeErrorDetails(error.details, context);

  writeStdout(
    JSON.stringify({
      command,
      error: {
        code: error.code,
        details: normalizeForJson(details),
        message: error.message,
      },
      success: false,
    } satisfies CliResultEnvelope<never>),
  );
}

export function writeHumanEnvironmentCheck(
  result: EnvironmentCheckResult,
): void {
  const lines = [
    `Environment: ${result.passed ? "PASS" : "FAIL"}`,
    `Detected languages: ${result.detectedLanguages.length > 0 ? result.detectedLanguages.join(", ") : "none"}`,
  ];

  if (result.findings.length === 0) {
    lines.push("Findings: none");
  } else {
    lines.push("Findings:");
    lines.push(
      ...result.findings.map(
        (finding) =>
          `- ${formatFindingLine(finding.severity, finding.category, finding.message)}`,
      ),
    );
  }

  writeStdout(lines.join("\n"));
}

export function writeHumanAnalysis(result: RepositoryAnalysis): void {
  writeStdout(
    [
      "Analysis complete",
      `Repository: ${result.repoPath}`,
      `Commit: ${result.commitHash}`,
      `Files analyzed: ${result.summary.totalFilesAnalyzed}`,
      `Components: ${result.summary.totalComponents}`,
      `Relationships: ${result.summary.totalRelationships}`,
      `Languages: ${result.summary.languagesFound.join(", ") || "none"}`,
      `Focus directories: ${result.focusDirs.join(", ") || "none"}`,
    ].join("\n"),
  );
}

export function writeHumanStatus(status: DocumentationStatus): void {
  writeStdout(
    [
      `Status: ${status.state}`,
      `Output path: ${status.outputPath}`,
      `Last generated: ${status.lastGeneratedAt ?? "never"}`,
      `Last generated commit: ${status.lastGeneratedCommitHash ?? "n/a"}`,
      `Current HEAD commit: ${status.currentHeadCommitHash ?? "n/a"}`,
    ].join("\n"),
  );
}

export function writeHumanValidation(result: ValidationResult): void {
  const lines = [
    `Validation: ${result.status}`,
    `Errors: ${result.errorCount}`,
    `Warnings: ${result.warningCount}`,
  ];

  if (result.findings.length === 0) {
    lines.push("Findings: none");
  } else {
    lines.push("Findings:");
    lines.push(
      ...result.findings.map(
        (finding) =>
          `- ${formatFindingLine(
            finding.severity,
            finding.category,
            finding.message,
          )}`,
      ),
    );
  }

  writeStdout(lines.join("\n"));
}

export function writeHumanRunResult(result: DocumentationRunResult): void {
  const lines = [
    `${result.mode === "full" ? "Generate" : "Update"}: ${result.success ? "SUCCESS" : "FAILURE"}`,
    `Run ID: ${result.runId}`,
    `Duration (seconds): ${result.durationSeconds}`,
  ];

  if (result.outputPath) {
    lines.push(`Output path: ${result.outputPath}`);
  }

  if (result.success) {
    lines.push(`Generated files: ${result.generatedFiles.length}`);
    lines.push(`Commit hash: ${result.commitHash}`);
    lines.push(`Cost (USD): ${result.costUsd ?? "n/a"}`);
  } else {
    lines.push(`Failed stage: ${result.failedStage}`);
  }

  if (result.warnings.length > 0) {
    lines.push(`Warnings: ${result.warnings.join("; ")}`);
  }

  writeStdout(lines.join("\n"));
}

export function writeHumanPublishResult(result: PublishResult): void {
  writeStdout(
    [
      "Publish complete",
      `Branch: ${result.branchName}`,
      `Commit hash: ${result.commitHash}`,
      `Pushed: ${result.pushedToRemote ? "yes" : "no"}`,
      `Pull request: ${result.pullRequestUrl ?? "not created"}`,
      `Files committed: ${result.filesCommitted.join(", ") || "none"}`,
    ].join("\n"),
  );
}

export function writeHumanError(error: {
  code: string;
  message: string;
  details?: unknown;
}): void {
  const lines = [`Error [${error.code}]: ${error.message}`];

  if (error.details !== undefined) {
    lines.push(
      `Details: ${JSON.stringify(normalizeForJson(error.details), null, 2)}`,
    );
  }

  writeStderr(lines.join("\n"));
}

const formatFindingLine = (
  severity: string,
  category: string,
  message: string,
): string => `[${severity.toUpperCase()}] ${category}: ${message}`;

const writeStdout = (value: string): void => {
  process.stdout.write(value.endsWith("\n") ? value : `${value}\n`);
};

const writeStderr = (value: string): void => {
  process.stderr.write(value.endsWith("\n") ? value : `${value}\n`);
};

const normalizeForJson = (value: unknown): unknown => {
  if (value instanceof Error) {
    return {
      message: value.message,
      name: value.name,
      stack: value.stack,
    };
  }

  if (Array.isArray(value)) {
    return value.map((entry) => normalizeForJson(entry));
  }

  if (isRecord(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, nestedValue]) => [
        key,
        normalizeForJson(nestedValue),
      ]),
    );
  }

  return value;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const mergeErrorDetails = (
  details: unknown,
  context?: Record<string, unknown>,
): unknown => {
  if (!context) {
    return details;
  }

  if (details === undefined) {
    return context;
  }

  if (isRecord(details)) {
    return {
      ...details,
      ...context,
    };
  }

  return {
    context,
    originalDetails: details,
  };
};
