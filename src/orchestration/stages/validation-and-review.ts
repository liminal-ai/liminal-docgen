import { readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";

import { toJSONSchema } from "zod";

import { reviewPatchPayloadSchema } from "../../contracts/quality-review.js";
import type { InferenceProvider } from "../../inference/types.js";
import { buildQualityReviewPrompt } from "../../prompts/quality-review.js";
import type {
  EngineError,
  QualityReviewConfig,
  QualityReviewPassResult,
  ReviewFilePatch,
  ValidationAndReviewResult,
  ValidationFinding,
  ValidationResult,
} from "../../types/index.js";
import { validateDocumentation } from "../../validation/validate.js";

const reviewPatchOutputSchema = toJSONSchema(
  reviewPatchPayloadSchema,
) as Record<string, unknown>;

export const validateAndReview = async (
  outputPath: string,
  config: QualityReviewConfig,
  provider: InferenceProvider,
  onQualityReviewStart?: () => void,
): Promise<ValidationAndReviewResult> => {
  const resolvedConfig = {
    secondModelReview: config.secondModelReview ?? false,
    selfReview: config.selfReview ?? true,
  } satisfies Required<QualityReviewConfig>;
  let validationResult = await runValidation(outputPath);
  let qualityReviewPasses = 0;

  if (validationResult.findings.length === 0) {
    return createResult(validationResult, qualityReviewPasses);
  }

  if (resolvedConfig.selfReview) {
    onQualityReviewStart?.();
    await runQualityReviewPass(
      outputPath,
      validationResult,
      {
        secondModelReview: false,
        selfReview: true,
      },
      provider,
      qualityReviewPasses,
    );
    qualityReviewPasses += 1;
    validationResult = await runValidation(outputPath);
  }

  if (
    resolvedConfig.secondModelReview &&
    validationResult.findings.length > 0
  ) {
    onQualityReviewStart?.();
    await runQualityReviewPass(
      outputPath,
      validationResult,
      {
        secondModelReview: true,
        selfReview: false,
      },
      provider,
      qualityReviewPasses,
    );
    qualityReviewPasses += 1;
    validationResult = await runValidation(outputPath);
  }

  return createResult(validationResult, qualityReviewPasses);
};

const createResult = (
  validationResult: ValidationResult,
  qualityReviewPasses: number,
): ValidationAndReviewResult => ({
  hasBlockingErrors: validationResult.errorCount > 0,
  qualityReviewPasses,
  validationResult,
});

const runValidation = async (outputPath: string): Promise<ValidationResult> => {
  const validationResult = await validateDocumentation({
    outputPath,
    requirePersistedArtifacts: false,
  });

  if (!validationResult.ok) {
    throw new ValidationAndReviewError(
      validationResult.error,
      "validating-output",
    );
  }

  return validationResult.value;
};

const runQualityReviewPass = async (
  outputPath: string,
  validationResult: ValidationResult,
  config: Required<QualityReviewConfig>,
  provider: InferenceProvider,
  completedPasses: number,
): Promise<QualityReviewPassResult> => {
  const fileContents = await readReferencedFiles(
    outputPath,
    validationResult.findings,
  );
  const { systemPrompt, userMessage } = buildQualityReviewPrompt(
    validationResult,
    fileContents,
    config,
  );

  try {
    const reviewResult = await provider.infer<ReviewFilePatch[]>({
      outputSchema: reviewPatchOutputSchema,
      systemPrompt,
      userMessage,
    });

    if (!reviewResult.ok) {
      throw new ValidationAndReviewError(
        {
          code: "ORCHESTRATION_ERROR",
          details: {
            sdkError: reviewResult.error,
          },
          message: "Quality review failed",
        },
        "quality-review",
        completedPasses,
      );
    }

    const parsedPatches = reviewPatchPayloadSchema.safeParse(
      reviewResult.value.output,
    );

    if (!parsedPatches.success) {
      throw new ValidationAndReviewError(
        {
          code: "ORCHESTRATION_ERROR",
          details: {
            rawResponse: reviewResult.value.output,
            validationErrors: parsedPatches.error.flatten(),
          },
          message: "Quality review returned an invalid patch payload",
        },
        "quality-review",
        completedPasses,
      );
    }

    return await applyReviewPatches(outputPath, parsedPatches.data);
  } catch (error) {
    if (error instanceof ValidationAndReviewError) {
      throw error;
    }

    throw new ValidationAndReviewError(
      {
        code: "ORCHESTRATION_ERROR",
        details: error instanceof Error ? { cause: error.message } : error,
        message: "Quality review failed unexpectedly",
      },
      "quality-review",
      completedPasses,
    );
  }
};

const readReferencedFiles = async (
  outputPath: string,
  findings: ValidationFinding[],
): Promise<Record<string, string>> => {
  const referencedFiles = new Map<string, string>();

  for (const finding of findings) {
    const filePath = finding.filePath;

    if (!filePath) {
      continue;
    }

    const resolvedPath = resolvePatchPath(outputPath, filePath);

    if (!resolvedPath) {
      continue;
    }

    if (!(await isReviewableExistingFile(resolvedPath))) {
      continue;
    }

    const relativePath = path
      .relative(outputPath, resolvedPath)
      .split(path.sep)
      .join("/");

    if (referencedFiles.has(relativePath)) {
      continue;
    }

    referencedFiles.set(relativePath, await readFile(resolvedPath, "utf8"));
  }

  return Object.fromEntries(referencedFiles);
};

const applyReviewPatches = async (
  outputPath: string,
  patches: ReviewFilePatch[],
): Promise<QualityReviewPassResult> => {
  const filesModified = new Set<string>();
  let patchesApplied = 0;

  for (const patch of patches) {
    const resolvedPath = resolvePatchPath(outputPath, patch.filePath);

    if (!resolvedPath || !(await isReviewableExistingFile(resolvedPath))) {
      continue;
    }

    await writeFile(resolvedPath, patch.newContent, "utf8");
    patchesApplied += 1;
    filesModified.add(
      path.relative(outputPath, resolvedPath).split(path.sep).join("/"),
    );
  }

  return {
    filesModified: [...filesModified].sort((left, right) =>
      left.localeCompare(right),
    ),
    patchesApplied,
  };
};

const resolvePatchPath = (
  outputPath: string,
  requestedPath: string,
): string | null => {
  const resolvedPath = path.resolve(outputPath, requestedPath);
  const relativePath = path.relative(outputPath, resolvedPath);

  if (
    relativePath === "" ||
    relativePath === "." ||
    relativePath.startsWith("..") ||
    path.isAbsolute(relativePath)
  ) {
    return null;
  }

  return resolvedPath;
};

const isReviewableExistingFile = async (filePath: string): Promise<boolean> => {
  if (path.extname(filePath).toLowerCase() !== ".md") {
    return false;
  }

  try {
    const fileStats = await stat(filePath);
    return fileStats.isFile();
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return false;
    }

    throw error;
  }
};

export class ValidationAndReviewError extends Error {
  readonly engineError: EngineError;
  readonly stage: "validating-output" | "quality-review";
  readonly qualityReviewPasses: number;

  constructor(
    engineError: EngineError,
    stage: "validating-output" | "quality-review",
    qualityReviewPasses = 0,
  ) {
    super(engineError.message);
    this.engineError = engineError;
    this.stage = stage;
    this.qualityReviewPasses = qualityReviewPasses;
    this.name = "ValidationAndReviewError";
  }
}
