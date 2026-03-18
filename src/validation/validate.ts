import { stat } from "node:fs/promises";
import path from "node:path";

import {
  validationRequestSchema,
  validationResultSchema,
} from "../contracts/validation.js";
import { err, ok } from "../types/common.js";
import type {
  EngineResult,
  ValidationFinding,
  ValidationRequest,
  ValidationResult,
} from "../types/index.js";
import { checkCrossLinks } from "./checks/cross-links.js";
import { checkFilePresence } from "./checks/file-presence.js";
import { checkMermaid } from "./checks/mermaid.js";
import { checkMetadataShape } from "./checks/metadata-shape.js";
import { checkModuleTree } from "./checks/module-tree.js";

export const validateDocumentation = async (
  request: ValidationRequest,
): Promise<EngineResult<ValidationResult>> => {
  const parsedRequest = validationRequestSchema.safeParse(request);

  if (!parsedRequest.success) {
    const issue = parsedRequest.error.issues[0];

    return err("VALIDATION_ERROR", "Validation request is invalid", {
      field: issue ? issue.path.join(".") || "request" : "request",
      issues: parsedRequest.error.issues,
      reason:
        issue?.message ??
        "Validation request does not match the expected shape",
    });
  }

  try {
    const outputPath = path.resolve(parsedRequest.data.outputPath);
    const requirePersistedArtifacts =
      parsedRequest.data.requirePersistedArtifacts;
    const outputDirectory = await getOutputDirectory(outputPath);

    if (!outputDirectory.exists) {
      return ok(
        createValidationResult([
          {
            category: "missing-file",
            filePath: outputPath,
            message: `Output directory does not exist: ${outputPath}`,
            severity: "error",
          },
        ]),
      );
    }

    if (!outputDirectory.isDirectory) {
      return ok(
        createValidationResult([
          {
            category: "missing-file",
            filePath: outputPath,
            message: `Output path is not a directory: ${outputPath}`,
            severity: "error",
          },
        ]),
      );
    }

    const findings = (
      await Promise.all([
        checkFilePresence(outputPath, requirePersistedArtifacts),
        checkCrossLinks(outputPath),
        checkMetadataShape(outputPath, requirePersistedArtifacts),
        checkModuleTree(outputPath),
        checkMermaid(outputPath),
      ])
    ).flat();

    return ok(validationResultSchema.parse(createValidationResult(findings)));
  } catch (error) {
    return err(
      "VALIDATION_ERROR",
      "Failed to validate documentation output.",
      error instanceof Error ? { cause: error.message } : error,
    );
  }
};

const createValidationResult = (
  findings: ValidationFinding[],
): ValidationResult => {
  const errorCount = findings.filter(
    (finding) => finding.severity === "error",
  ).length;
  const warningCount = findings.length - errorCount;

  return {
    errorCount,
    findings,
    status: errorCount > 0 ? "fail" : warningCount > 0 ? "warn" : "pass",
    warningCount,
  };
};

const getOutputDirectory = async (
  outputPath: string,
): Promise<{ exists: boolean; isDirectory: boolean }> => {
  try {
    const outputStats = await stat(outputPath);

    return {
      exists: true,
      isDirectory: outputStats.isDirectory(),
    };
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return {
        exists: false,
        isDirectory: false,
      };
    }

    throw error;
  }
};
