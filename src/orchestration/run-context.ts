import { randomUUID } from "node:crypto";
import type { InferenceProvider } from "../inference/types.js";
import type { EngineError } from "../types/common.js";
import type {
  DocumentationProgressEvent,
  DocumentationRunFailure,
  DocumentationRunSuccess,
  DocumentationStage,
  ProgressCallback,
  RunSuccessData,
} from "../types/orchestration.js";

export class RunContext {
  readonly runId: string;
  readonly startTime: number;
  readonly mode: "full" | "update";

  private warnings: string[] = [];
  private generatedFiles = new Set<string>();
  private onProgress: ProgressCallback | undefined;
  private inferenceProvider: InferenceProvider;

  constructor(
    mode: "full" | "update",
    onProgress?: ProgressCallback,
    inferenceProvider: InferenceProvider = createNoopInferenceProvider(),
  ) {
    this.runId = randomUUID();
    this.startTime = Date.now();
    this.mode = mode;
    this.inferenceProvider = inferenceProvider;
    this.onProgress = onProgress;
  }

  emitProgress(
    stage: DocumentationStage,
    extra?: Partial<DocumentationProgressEvent>,
  ): void {
    if (!this.onProgress) {
      return;
    }

    try {
      this.onProgress({
        runId: this.runId,
        stage,
        timestamp: new Date().toISOString(),
        ...extra,
      });
    } catch {
      // Progress delivery is best-effort and must not interrupt the run.
    }
  }

  addWarning(message: string): void {
    this.warnings.push(message);
  }

  recordGeneratedFile(fileName: string): void {
    this.generatedFiles.add(fileName);
  }

  getWarnings(): string[] {
    return [...this.warnings];
  }

  getGeneratedFiles(): string[] {
    return [...this.generatedFiles].sort((left, right) =>
      left.localeCompare(right),
    );
  }

  getInferenceProvider(): InferenceProvider {
    return this.inferenceProvider;
  }

  setInferenceProvider(inferenceProvider: InferenceProvider): void {
    this.inferenceProvider = inferenceProvider;
  }

  getDurationSeconds(): number {
    return Math.max((Date.now() - this.startTime) / 1000, 0.001);
  }

  assembleSuccessResult(data: RunSuccessData): DocumentationRunSuccess {
    return {
      success: true,
      mode: this.mode,
      runId: this.runId,
      durationSeconds: this.getDurationSeconds(),
      warnings: this.getWarnings(),
      outputPath: data.outputPath,
      generatedFiles: data.generatedFiles,
      modulePlan: data.modulePlan,
      validationResult: data.validationResult,
      qualityReviewPasses: data.qualityReviewPasses,
      costUsd: this.inferenceProvider.computeCost(),
      commitHash: data.commitHash,
      updatedModules: data.updatedModules,
      unchangedModules: data.unchangedModules,
      overviewRegenerated: data.overviewRegenerated,
    };
  }

  assembleFailureResult(
    stage: DocumentationStage,
    error: EngineError,
    extra?: Partial<DocumentationRunFailure>,
  ): DocumentationRunFailure {
    const generatedFiles = mergeGeneratedFiles(
      this.getGeneratedFiles(),
      extra?.generatedFiles,
    );

    this.emitProgress("failed");

    return {
      ...extra,
      ...(generatedFiles ? { generatedFiles } : {}),
      costUsd: this.inferenceProvider.computeCost(),
      success: false,
      mode: this.mode,
      runId: this.runId,
      durationSeconds: this.getDurationSeconds(),
      warnings: this.getWarnings(),
      failedStage: stage,
      error,
    };
  }
}

const mergeGeneratedFiles = (
  recordedFiles: string[],
  extraFiles?: string[],
): string[] | undefined => {
  const mergedFiles = new Set([...recordedFiles, ...(extraFiles ?? [])]);

  if (mergedFiles.size === 0) {
    return undefined;
  }

  return [...mergedFiles].sort((left, right) => left.localeCompare(right));
};

const createNoopInferenceProvider = (): InferenceProvider => ({
  computeCost: () => null,
  getAccumulatedUsage: () => ({ inputTokens: 0, outputTokens: 0 }),
  infer: async () => ({
    ok: false,
    error: {
      code: "ORCHESTRATION_ERROR",
      message: "Inference provider is not configured",
    },
  }),
});
