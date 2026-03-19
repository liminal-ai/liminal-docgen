import { readFile, rm } from "node:fs/promises";
import path from "node:path";
import {
  getChangedFilesBetweenCommits,
  getHeadCommitHash,
} from "../adapters/git.js";
import {
  createInferenceRuntime,
  InferenceRuntimeInitializationError,
} from "../inference/runtime.js";
import { err } from "../types/common.js";
import { moduleNameToFileName } from "../types/generation.js";
import type {
  ChangedFile,
  DocumentationRunRequest,
  DocumentationRunResult,
  DocumentationStage,
  GeneratedModuleSet,
  ModuleGenerationStageResult,
  ModulePlan,
  PlannedModule,
  ProgressCallback,
  ResolvedRunConfig,
  RunSuccessData,
  ValidationAndReviewResult,
  ValidationResult,
} from "../types/index.js";
import { evaluateRunStatus } from "../types/orchestration.js";
import { resolveOutputPath } from "./output-path.js";
import { RunContext } from "./run-context.js";
import { runEnvironmentCheck } from "./stages/environment-check.js";
import {
  MODULE_PLAN_FILE_NAME,
  writeRunMetadata,
} from "./stages/metadata-write.js";
import { generateModuleDocs } from "./stages/module-generation.js";
import { planModules } from "./stages/module-planning.js";
import { writeModuleTree } from "./stages/module-tree-write.js";
import { generateOverview } from "./stages/overview-generation.js";
import { resolveAndValidateRequest } from "./stages/resolve-and-validate.js";
import { runStructuralAnalysis } from "./stages/structural-analysis.js";
import {
  ValidationAndReviewError,
  validateAndReview,
} from "./stages/validation-and-review.js";
import { mapToAffectedModules } from "./update/affected-module-mapper.js";
import { readPriorGenerationState } from "./update/prior-state.js";

export const generateDocumentation = async (
  request: DocumentationRunRequest,
  onProgress?: ProgressCallback,
): Promise<DocumentationRunResult> => {
  const context = new RunContext(
    request.mode === "update" ? "update" : "full",
    onProgress,
  );
  const resolvedRequest = await resolveAndValidateRequest(request);

  if (!resolvedRequest.ok) {
    return context.assembleFailureResult(
      "resolving-configuration",
      resolvedRequest.error,
    );
  }

  const config = resolvedRequest.value;
  const outputPath = resolveOutputPath(config);
  context.emitProgress("checking-environment");
  const environmentResult = await runEnvironmentCheck(config);

  if (!environmentResult.ok) {
    return context.assembleFailureResult(
      "checking-environment",
      environmentResult.error,
      {
        outputPath,
      },
    );
  }

  if (config.mode === "update") {
    return runUpdateGeneration(config, context, outputPath);
  }

  return runFullGeneration(config, context, outputPath);
};

const runFullGeneration = async (
  config: ResolvedRunConfig,
  context: RunContext,
  outputPath: string,
): Promise<DocumentationRunResult> => {
  context.emitProgress("analyzing-structure");
  const analysisResult = await runStructuralAnalysis(config);

  if (!analysisResult.ok) {
    return context.assembleFailureResult(
      "analyzing-structure",
      analysisResult.error,
      {
        outputPath,
      },
    );
  }

  const analysis = analysisResult.value;
  context.emitProgress("planning-modules");
  const providerInitializationFailure = ensureInferenceProviderInitialized(
    context,
    "planning-modules",
    config,
  );

  if (providerInitializationFailure) {
    return providerInitializationFailure;
  }

  const planResult = await planModules(
    analysis,
    context.getInferenceProvider(),
  );

  if (!planResult.ok) {
    return context.assembleFailureResult("planning-modules", planResult.error, {
      commitHash: analysis.commitHash,
      outputPath,
    });
  }

  const modulePlan = planResult.value;

  if (modulePlan.modules.length === 0) {
    return context.assembleFailureResult(
      "planning-modules",
      {
        code: "ORCHESTRATION_ERROR",
        message: "Module planning produced no modules",
      },
      {
        commitHash: analysis.commitHash,
        modulePlan,
        outputPath,
      },
    );
  }

  const moduleDocsResult = await generateModuleDocs(
    modulePlan,
    analysis,
    config,
    context.getInferenceProvider(),
    (moduleName, completed, total) => {
      context.recordGeneratedFile(moduleNameToFileName(moduleName));
      context.emitProgress("generating-module", {
        completed,
        moduleName,
        total,
      });
    },
  );

  if (!moduleDocsResult.ok) {
    return context.assembleFailureResult(
      "generating-module",
      moduleDocsResult.error,
      {
        commitHash: analysis.commitHash,
        modulePlan,
        outputPath,
      },
    );
  }

  const stageResult = moduleDocsResult.value;
  const runStatus = evaluateRunStatus(stageResult.outcomes);

  // On "failure" status (>half modules failed), skip downstream stages
  if (runStatus === "failure") {
    return assembleModuleFailureResult(context, stageResult, {
      commitHash: analysis.commitHash,
      modulePlan,
      outputPath,
    });
  }

  // On "success" or "partial-success", proceed to overview/validation
  const moduleDocs = stageResult.generatedModules;

  // Add warnings for failed modules on partial-success
  if (runStatus === "partial-success") {
    for (const outcome of stageResult.outcomes) {
      if (outcome.status === "failed") {
        context.addWarning(
          `Module "${outcome.moduleName}" failed to generate: ${outcome.failureReason ?? "unknown error"}`,
        );
      }
    }
  }

  context.emitProgress("generating-overview");
  const overviewResult = await generateOverview(
    moduleDocs,
    analysis,
    config,
    context.getInferenceProvider(),
  );

  if (!overviewResult.ok) {
    return context.assembleFailureResult(
      "generating-overview",
      overviewResult.error,
      {
        commitHash: analysis.commitHash,
        modulePlan,
        outputPath,
        moduleOutcomes: stageResult.outcomes,
        successCount: stageResult.successCount,
        failureCount: stageResult.failureCount,
        observationCount: stageResult.observationCount,
      },
    );
  }

  context.recordGeneratedFile(overviewResult.value);

  const treeResult = await writeModuleTree(modulePlan, outputPath);

  if (!treeResult.ok) {
    return context.assembleFailureResult(
      "writing-module-tree",
      treeResult.error,
      {
        commitHash: analysis.commitHash,
        modulePlan,
        outputPath,
      },
    );
  }

  context.recordGeneratedFile("module-tree.json");

  return finalizeRun(config, context, stageResult, {
    commitHash: analysis.commitHash,
    generatedFiles: collectOutputFiles(getModuleNames(modulePlan), {
      includeMetadata: true,
      includeModulePlan: true,
    }),
    modulePlan,
    outputPath,
  });
};

const runUpdateGeneration = async (
  config: ResolvedRunConfig,
  context: RunContext,
  outputPath: string,
): Promise<DocumentationRunResult> => {
  context.emitProgress("computing-changes");
  const priorStateResult = await readPriorGenerationState(outputPath);

  if (!priorStateResult.ok) {
    return context.assembleFailureResult(
      "computing-changes",
      priorStateResult.error,
      {
        outputPath,
      },
    );
  }

  let currentCommitHash: string;
  let changedFiles: ChangedFile[];

  try {
    currentCommitHash = await getHeadCommitHash(config.repoPath);
    changedFiles = await getChangedFilesBetweenCommits(
      config.repoPath,
      priorStateResult.value.metadata.commitHash,
      currentCommitHash,
    );
  } catch (error) {
    return context.assembleFailureResult(
      "computing-changes",
      {
        code: "ORCHESTRATION_ERROR",
        details: error instanceof Error ? { cause: error.message } : error,
        message: "Unable to compute changed files for update mode",
      },
      {
        outputPath,
      },
    );
  }

  context.emitProgress("analyzing-structure");
  const analysisResult = await runStructuralAnalysis(config);

  if (!analysisResult.ok) {
    return context.assembleFailureResult(
      "analyzing-structure",
      analysisResult.error,
      {
        commitHash: currentCommitHash,
        outputPath,
      },
    );
  }

  const analysis = analysisResult.value;
  context.emitProgress("planning-modules");
  const affectedModulesResult = mapToAffectedModules(
    changedFiles,
    priorStateResult.value.modulePlan,
    analysis,
  );

  if (!affectedModulesResult.ok) {
    return context.assembleFailureResult(
      "planning-modules",
      affectedModulesResult.error,
      {
        commitHash: analysis.commitHash,
        modulePlan: priorStateResult.value.modulePlan,
        outputPath,
      },
    );
  }

  const { affectedModules, updatedPlan } = affectedModulesResult.value;

  for (const warning of affectedModules.warnings) {
    context.addWarning(warning);
  }

  if (affectedModules.requiresFullRegeneration) {
    if (affectedModules.fullRegenerationReason) {
      context.addWarning(affectedModules.fullRegenerationReason);
    }

    return context.assembleFailureResult(
      "planning-modules",
      {
        code: "ORCHESTRATION_ERROR",
        message:
          affectedModules.fullRegenerationReason ??
          "Incremental update is not trustworthy for the current repository changes. Run full generation to refresh the documentation baseline.",
      },
      {
        commitHash: analysis.commitHash,
        modulePlan: updatedPlan,
        outputPath,
      },
    );
  }

  const modulesToRegenerate = selectModules(
    updatedPlan,
    affectedModules.modulesToRegenerate,
  );
  const providerInitializationFailure = ensureInferenceProviderInitialized(
    context,
    "generating-module",
    config,
    {
      commitHash: analysis.commitHash,
      modulePlan: updatedPlan,
      outputPath,
    },
  );

  if (providerInitializationFailure) {
    return providerInitializationFailure;
  }

  const moduleDocsResult = await generateModuleDocs(
    updatedPlan,
    analysis,
    config,
    context.getInferenceProvider(),
    (moduleName, completed, total) => {
      context.recordGeneratedFile(moduleNameToFileName(moduleName));
      context.emitProgress("generating-module", {
        completed,
        moduleName,
        total,
      });
    },
    modulesToRegenerate,
  );

  if (!moduleDocsResult.ok) {
    return context.assembleFailureResult(
      "generating-module",
      moduleDocsResult.error,
      {
        commitHash: analysis.commitHash,
        modulePlan: updatedPlan,
        outputPath,
      },
    );
  }

  const stageResult = moduleDocsResult.value;
  const runStatus = evaluateRunStatus(stageResult.outcomes);

  // On "failure" status, skip downstream stages
  if (runStatus === "failure") {
    return assembleModuleFailureResult(context, stageResult, {
      commitHash: analysis.commitHash,
      modulePlan: updatedPlan,
      outputPath,
      updatedModules: affectedModules.modulesToRegenerate,
      unchangedModules: affectedModules.unchangedModules,
    });
  }

  // Add warnings for failed modules on partial-success
  if (runStatus === "partial-success") {
    for (const outcome of stageResult.outcomes) {
      if (outcome.status === "failed") {
        context.addWarning(
          `Module "${outcome.moduleName}" failed to generate: ${outcome.failureReason ?? "unknown error"}`,
        );
      }
    }
  }

  const moduleDocs = stageResult.generatedModules;
  const removedModulesResult = await removeModulePages(
    affectedModules.modulesToRemove,
    outputPath,
  );

  if (!removedModulesResult.ok) {
    return context.assembleFailureResult(
      "writing-module-tree",
      removedModulesResult.error,
      {
        commitHash: analysis.commitHash,
        modulePlan: updatedPlan,
        outputPath,
      },
    );
  }

  if (affectedModules.overviewNeedsRegeneration) {
    context.emitProgress("generating-overview");
    const overviewDocsResult = await loadModuleDocsForOverview(
      updatedPlan,
      moduleDocs,
      outputPath,
    );

    if (!overviewDocsResult.ok) {
      return context.assembleFailureResult(
        "generating-overview",
        overviewDocsResult.error,
        {
          commitHash: analysis.commitHash,
          modulePlan: updatedPlan,
          outputPath,
        },
      );
    }

    const overviewResult = await generateOverview(
      overviewDocsResult.value,
      analysis,
      config,
      context.getInferenceProvider(),
    );

    if (!overviewResult.ok) {
      return context.assembleFailureResult(
        "generating-overview",
        overviewResult.error,
        {
          commitHash: analysis.commitHash,
          modulePlan: updatedPlan,
          outputPath,
        },
      );
    }

    context.recordGeneratedFile(overviewResult.value);
  }

  if (affectedModules.moduleTreeNeedsRewrite) {
    const treeResult = await writeModuleTree(updatedPlan, outputPath);

    if (!treeResult.ok) {
      return context.assembleFailureResult(
        "writing-module-tree",
        treeResult.error,
        {
          commitHash: analysis.commitHash,
          modulePlan: updatedPlan,
          outputPath,
        },
      );
    }

    context.recordGeneratedFile("module-tree.json");
  }

  return finalizeRun(config, context, stageResult, {
    commitHash: analysis.commitHash,
    generatedFiles: collectOutputFiles(getModuleNames(updatedPlan), {
      includeMetadata: true,
      includeModulePlan: true,
    }),
    modulePlan: updatedPlan,
    outputPath,
    overviewRegenerated: affectedModules.overviewNeedsRegeneration,
    unchangedModules: affectedModules.unchangedModules,
    updatedModules: affectedModules.modulesToRegenerate,
  });
};

const assembleModuleFailureResult = (
  context: RunContext,
  stageResult: ModuleGenerationStageResult,
  options: {
    commitHash: string;
    modulePlan: ModulePlan;
    outputPath: string;
    updatedModules?: string[];
    unchangedModules?: string[];
  },
): DocumentationRunResult => {
  const failedModuleNames = stageResult.outcomes
    .filter((o) => o.status === "failed")
    .map((o) => o.moduleName);

  return context.assembleFailureResult(
    "generating-module",
    {
      code: "ORCHESTRATION_ERROR",
      message: `Module generation failed: ${stageResult.failureCount} of ${stageResult.outcomes.length} modules failed (${failedModuleNames.join(", ")})`,
    },
    {
      commitHash: options.commitHash,
      modulePlan: options.modulePlan,
      outputPath: options.outputPath,
      moduleOutcomes: stageResult.outcomes,
      successCount: stageResult.successCount,
      failureCount: stageResult.failureCount,
      observationCount: stageResult.observationCount,
      updatedModules: options.updatedModules,
      unchangedModules: options.unchangedModules,
    },
  );
};

const finalizeRun = async (
  config: ResolvedRunConfig,
  context: RunContext,
  stageResult: ModuleGenerationStageResult,
  options: {
    commitHash: string;
    generatedFiles: string[];
    modulePlan: ModulePlan;
    outputPath: string;
    updatedModules?: string[];
    unchangedModules?: string[];
    overviewRegenerated?: boolean;
  },
): Promise<DocumentationRunResult> => {
  const provisionalRunData: RunSuccessData = {
    commitHash: options.commitHash,
    generatedFiles: options.generatedFiles,
    metadataOutputPath: config.outputPath,
    mode: config.mode,
    modulePlan: options.modulePlan,
    outputPath: options.outputPath,
    qualityReviewPasses: 0,
    unchangedModules: options.unchangedModules,
    updatedModules: options.updatedModules,
    overviewRegenerated: options.overviewRegenerated,
    validationResult: {
      errorCount: 0,
      findings: [],
      status: "pass",
      warningCount: 0,
    },
  };

  let validationResult: ValidationAndReviewResult;

  try {
    context.emitProgress("validating-output");
    validationResult = await validateAndReview(
      options.outputPath,
      config.qualityReview,
      context.getInferenceProvider(),
      () => context.emitProgress("quality-review"),
    );
  } catch (error) {
    const validationError =
      error instanceof ValidationAndReviewError ? error : null;

    const engineError =
      validationError !== null
        ? validationError.engineError
        : {
            code: "VALIDATION_ERROR" as const,
            details: error instanceof Error ? { cause: error.message } : error,
            message: "Validation and review failed unexpectedly",
          };

    return context.assembleFailureResult(
      validationError?.stage ?? "validating-output",
      engineError,
      {
        commitHash: options.commitHash,
        modulePlan: options.modulePlan,
        outputPath: options.outputPath,
        qualityReviewPasses: validationError?.qualityReviewPasses,
        moduleOutcomes: stageResult.outcomes,
        successCount: stageResult.successCount,
        failureCount: stageResult.failureCount,
        observationCount: stageResult.observationCount,
      },
    );
  }

  if (validationResult.hasBlockingErrors) {
    return context.assembleFailureResult(
      "validating-output",
      {
        code: "ORCHESTRATION_ERROR",
        message: "Generated output failed validation",
      },
      {
        commitHash: options.commitHash,
        modulePlan: options.modulePlan,
        outputPath: options.outputPath,
        qualityReviewPasses: validationResult.qualityReviewPasses,
        validationResult: validationResult.validationResult,
        moduleOutcomes: stageResult.outcomes,
        successCount: stageResult.successCount,
        failureCount: stageResult.failureCount,
        observationCount: stageResult.observationCount,
      },
    );
  }

  const finalRunData: RunSuccessData = {
    ...provisionalRunData,
    qualityReviewPasses: validationResult.qualityReviewPasses,
    validationResult: validationResult.validationResult,
  };
  const successWarnings = [
    ...collectThinModuleWarnings(options.modulePlan),
    ...collectValidationWarnings(validationResult.validationResult),
  ];
  context.emitProgress("writing-metadata");
  const finalMetadataResult = await writeRunMetadata(
    finalRunData,
    options.modulePlan,
    options.outputPath,
  );

  if (!finalMetadataResult.ok) {
    return context.assembleFailureResult(
      "writing-metadata",
      finalMetadataResult.error,
      {
        commitHash: options.commitHash,
        modulePlan: options.modulePlan,
        outputPath: options.outputPath,
        qualityReviewPasses: validationResult.qualityReviewPasses,
        validationResult: validationResult.validationResult,
        moduleOutcomes: stageResult.outcomes,
        successCount: stageResult.successCount,
        failureCount: stageResult.failureCount,
        observationCount: stageResult.observationCount,
      },
    );
  }

  for (const warning of successWarnings) {
    context.addWarning(warning);
  }

  context.emitProgress("complete");
  const runStatus = evaluateRunStatus(stageResult.outcomes);
  const successResult = context.assembleSuccessResult(finalRunData);

  // Override with module outcome data
  return {
    ...successResult,
    status: runStatus,
    moduleOutcomes: stageResult.outcomes,
    successCount: stageResult.successCount,
    failureCount: stageResult.failureCount,
    observationCount: stageResult.observationCount,
  };
};

const removeModulePages = async (moduleNames: string[], outputPath: string) => {
  try {
    await Promise.all(
      moduleNames.map((moduleName) =>
        rm(path.join(outputPath, moduleNameToFileName(moduleName)), {
          force: true,
        }),
      ),
    );
  } catch (error) {
    return err(
      "ORCHESTRATION_ERROR",
      "Unable to remove obsolete module pages",
      {
        cause: error instanceof Error ? error.message : String(error),
        modules: moduleNames,
        outputPath,
      },
    );
  }

  return { ok: true as const, value: undefined };
};

const loadModuleDocsForOverview = async (
  modulePlan: ModulePlan,
  updatedModuleDocs: GeneratedModuleSet,
  outputPath: string,
): Promise<import("../types/index.js").EngineResult<GeneratedModuleSet>> => {
  const hydratedDocs: GeneratedModuleSet = new Map(updatedModuleDocs);

  try {
    for (const module of modulePlan.modules) {
      if (hydratedDocs.has(module.name)) {
        continue;
      }

      const fileName = moduleNameToFileName(module.name);
      const content = await readFile(path.join(outputPath, fileName), "utf8");

      hydratedDocs.set(module.name, {
        content,
        description: module.description,
        fileName,
        filePath: path.join(outputPath, fileName),
        moduleName: module.name,
      });
    }
  } catch (error) {
    return err(
      "ORCHESTRATION_ERROR",
      "Unable to load existing module documentation for overview regeneration",
      error instanceof Error ? { cause: error.message } : error,
    );
  }

  return {
    ok: true as const,
    value: hydratedDocs,
  };
};

const selectModules = (
  plan: ModulePlan,
  moduleNames: string[],
): PlannedModule[] => {
  const moduleNameSet = new Set(moduleNames);
  return plan.modules.filter((module) => moduleNameSet.has(module.name));
};

const getModuleNames = (plan: ModulePlan): string[] =>
  plan.modules.map((module) => module.name);

const collectOutputFiles = (
  moduleNames: string[],
  options?: {
    includeMetadata?: boolean;
    includeModulePlan?: boolean;
  },
): string[] =>
  [
    ...moduleNames
      .map((moduleName) => moduleNameToFileName(moduleName))
      .sort((left, right) => left.localeCompare(right)),
    ...(options?.includeMetadata ? [".doc-meta.json"] : []),
    ...(options?.includeModulePlan ? [MODULE_PLAN_FILE_NAME] : []),
    "module-tree.json",
    "overview.md",
  ].sort((left, right) => left.localeCompare(right));

const collectThinModuleWarnings = (
  modulePlan: RunSuccessData["modulePlan"],
): string[] =>
  modulePlan.modules
    .filter((module) => module.components.length <= 1)
    .map((module) => {
      const componentLabel =
        module.components.length === 1 ? "1 component" : "0 components";

      return `Thin module "${module.name}" has ${componentLabel}; generated docs may be sparse.`;
    });

const collectValidationWarnings = (
  validationResult: ValidationResult,
): string[] =>
  validationResult.findings
    .filter((finding) => finding.severity === "warning")
    .map((finding) => finding.message);

const ensureInferenceProviderInitialized = (
  context: RunContext,
  stage: DocumentationStage,
  config: ResolvedRunConfig,
  extra?: Partial<DocumentationRunResult>,
): DocumentationRunResult | null => {
  try {
    context.setInferenceProvider(
      createInferenceRuntime(config.inference, {
        workingDirectory: config.repoPath,
      }),
    );
    return null;
  } catch (error) {
    if (error instanceof InferenceRuntimeInitializationError) {
      return context.assembleFailureResult(stage, error.engineError, extra);
    }

    return context.assembleFailureResult(
      stage,
      {
        code: "ORCHESTRATION_ERROR",
        message: "Unable to initialize inference provider",
        details: error instanceof Error ? { cause: error.message } : error,
      },
      extra,
    );
  }
};
