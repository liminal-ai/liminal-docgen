import type {
  InferenceConfiguration,
  ResolvedInferenceConfiguration,
} from "../inference/types.js";
import type { EngineError } from "./common.js";
import type { ResolvedConfiguration } from "./configuration.js";
import type { GeneratedModuleSet } from "./generation.js";
import type { ModulePlan } from "./planning.js";
import type { QualityReviewConfig } from "./quality-review.js";
import type { ValidationResult } from "./validation.js";

export type ProgressCallback = (event: DocumentationProgressEvent) => void;

export type DocumentationStage =
  | "resolving-configuration"
  | "checking-environment"
  | "analyzing-structure"
  | "computing-changes"
  | "planning-modules"
  | "generating-module"
  | "generating-overview"
  | "writing-module-tree"
  | "validating-output"
  | "quality-review"
  | "writing-metadata"
  | "complete"
  | "failed";

export interface DocumentationProgressEvent {
  runId: string;
  stage: DocumentationStage;
  moduleName?: string;
  completed?: number;
  total?: number;
  timestamp: string;
}

export interface DocumentationRunRequest {
  repoPath: string;
  mode: "full" | "update";
  outputPath?: string;
  includePatterns?: string[];
  excludePatterns?: string[];
  focusDirs?: string[];
  qualityReview?: QualityReviewConfig;
  inference?: InferenceConfiguration;
}

/**
 * Tri-state run outcome. The `status` field is the single source of truth —
 * there is no `success` boolean.
 *
 * - "success": all modules generated successfully
 * - "partial-success": at least one module failed, but half or more succeeded
 * - "failure": more than half of modules failed, or a pipeline-level error occurred
 */
export type RunStatus = "success" | "partial-success" | "failure";

/**
 * Outcome of generating a single module's documentation page.
 * Every module in the plan produces exactly one outcome.
 */
export interface ModuleGenerationOutcome {
  moduleName: string;
  status: "success" | "failed";
  generationPath: "agentic" | "one-shot";
  fileName: string;
  durationMs: number;
  turnCount?: number;
  toolCallCount?: number;
  failureReason?: string;
  hasPlaceholderPage?: boolean;
  observationCount?: number;
}

/**
 * Complete run result. Replaces the former DocumentationRunSuccess |
 * DocumentationRunFailure union. The `status` field is the discriminant;
 * there is no `success` boolean.
 */
export interface DocumentationRunResult {
  status: RunStatus;
  runId: string;
  mode: "full" | "update";
  moduleOutcomes: ModuleGenerationOutcome[];
  successCount: number;
  failureCount: number;
  totalDurationMs: number;
  warnings: string[];
  observationCount: number;
  costUsd: number | null;

  // Present when status is "success" or "partial-success"
  outputPath?: string;
  generatedFiles?: string[];
  modulePlan?: ModulePlan;
  validationResult?: ValidationResult;
  qualityReviewPasses?: number;
  commitHash?: string;

  // Present on update runs
  updatedModules?: string[];
  unchangedModules?: string[];
  overviewRegenerated?: boolean;

  // Present when status is "failure" and a pipeline-level error occurred
  failedStage?: DocumentationStage;
  error?: EngineError;
}

/**
 * Internal result of the module generation stage.
 * Return value of generateModuleDocs(), not exposed to CLI callers.
 */
export interface ModuleGenerationStageResult {
  outcomes: ModuleGenerationOutcome[];
  generatedModules: GeneratedModuleSet;
  successCount: number;
  failureCount: number;
  totalDurationMs: number;
  observationCount: number;
}

export interface ResolvedRunConfig extends ResolvedConfiguration {
  repoPath: string;
  mode: "full" | "update";
  qualityReview: Required<QualityReviewConfig>;
  inference: ResolvedInferenceConfiguration;
}

export interface ValidationAndReviewResult {
  validationResult: ValidationResult;
  qualityReviewPasses: number;
  hasBlockingErrors: boolean;
}

export interface RunSuccessData {
  outputPath: string;
  metadataOutputPath: string;
  generatedFiles: string[];
  modulePlan: ModulePlan;
  validationResult: ValidationResult;
  qualityReviewPasses: number;
  commitHash: string;
  mode: "full" | "update";
  updatedModules?: string[];
  unchangedModules?: string[];
  overviewRegenerated?: boolean;
}

/**
 * Determines run status from module outcomes.
 * Pure function, no side effects.
 */
export function evaluateRunStatus(
  outcomes: ModuleGenerationOutcome[],
): RunStatus {
  const total = outcomes.length;
  const failureCount = outcomes.filter((o) => o.status === "failed").length;

  if (failureCount > total / 2) return "failure";
  if (failureCount > 0) return "partial-success";
  return "success";
}

/**
 * Maps RunStatus to process exit code.
 * partial-success exits 0 because the user has usable output.
 */
export function exitCodeForStatus(status: RunStatus): number {
  switch (status) {
    case "success":
      return 0;
    case "partial-success":
      return 0;
    case "failure":
      return 1;
  }
}
