import type {
  InferenceConfiguration,
  ResolvedInferenceConfiguration,
} from "../inference/types.js";
import type { EngineError } from "./common.js";
import type { ResolvedConfiguration } from "./configuration.js";
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

export type DocumentationRunResult =
  | DocumentationRunSuccess
  | DocumentationRunFailure;

export interface DocumentationRunResultBase {
  mode: "full" | "update";
  runId: string;
  durationSeconds: number;
  warnings: string[];
}

export interface DocumentationRunSuccess extends DocumentationRunResultBase {
  success: true;
  outputPath: string;
  generatedFiles: string[];
  modulePlan: ModulePlan;
  validationResult: ValidationResult;
  qualityReviewPasses: number;
  costUsd: number | null;
  commitHash: string;
  updatedModules?: string[];
  unchangedModules?: string[];
  overviewRegenerated?: boolean;
}

export interface DocumentationRunFailure extends DocumentationRunResultBase {
  success: false;
  failedStage: DocumentationStage;
  error: EngineError;
  outputPath?: string;
  commitHash?: string;
  generatedFiles?: string[];
  modulePlan?: ModulePlan;
  validationResult?: ValidationResult;
  qualityReviewPasses?: number;
  costUsd?: number | null;
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

// -- Agentic generation types (Story 0 foundation) --

/**
 * Tri-state run outcome. Replaces the binary success/failure discriminant
 * in a future story.
 *
 * - "success": all modules generated successfully
 * - "partial-success": at least one module failed, but half or more succeeded
 * - "failure": more than half of modules failed
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
 * Complete run result for agentic generation. Added alongside the existing
 * DocumentationRunSuccess/DocumentationRunFailure types — these will be
 * unified in Story 5. For now, both representations coexist.
 */
export interface AgenticDocumentationRunResult {
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

  outputPath?: string;
  generatedFiles?: string[];
  modulePlan?: ModulePlan;
  validationResult?: ValidationResult;
  qualityReviewPasses?: number;
  commitHash?: string;

  failedStage?: DocumentationStage;
  error?: EngineError;
}
