import { readFile } from "node:fs/promises";
import path from "node:path";

import { modulePlanSchema } from "../../contracts/planning.js";
import { getErrorMessage } from "../../errors.js";
import { readMetadata } from "../../metadata/reader.js";
import { err, ok } from "../../types/common.js";
import type {
  EngineResult,
  GeneratedDocumentationMetadata,
  ModulePlan,
} from "../../types/index.js";
import { MODULE_PLAN_FILE_NAME } from "../stages/metadata-write.js";

export interface PriorGenerationState {
  metadata: GeneratedDocumentationMetadata;
  modulePlan: ModulePlan;
}

export const readPriorGenerationState = async (
  outputPath: string,
): Promise<EngineResult<PriorGenerationState>> => {
  const metadataResult = await readMetadata(outputPath);

  if (!metadataResult.ok) {
    return metadataResult;
  }

  const modulePlanResult = await readPersistedModulePlan(outputPath);

  if (!modulePlanResult.ok) {
    return modulePlanResult;
  }

  return ok({
    metadata: metadataResult.value,
    modulePlan: modulePlanResult.value,
  });
};

const readPersistedModulePlan = async (
  outputPath: string,
): Promise<EngineResult<ModulePlan>> => {
  const modulePlanPath = path.join(outputPath, MODULE_PLAN_FILE_NAME);

  let rawPlan: string;

  try {
    rawPlan = await readFile(modulePlanPath, "utf8");
  } catch (error) {
    return err(
      "METADATA_ERROR",
      `Update mode requires a persisted module plan at ${modulePlanPath}. Run full generation to create a new module plan.`,
      {
        path: modulePlanPath,
        reason: getErrorMessage(error),
      },
    );
  }

  let parsedPlan: unknown;

  try {
    parsedPlan = JSON.parse(rawPlan);
  } catch (error) {
    return err(
      "METADATA_ERROR",
      `Invalid JSON in module plan at ${modulePlanPath}`,
      {
        path: modulePlanPath,
        reason: getErrorMessage(error),
      },
    );
  }

  const validation = modulePlanSchema.safeParse(parsedPlan);

  if (!validation.success) {
    return err("METADATA_ERROR", `Invalid module plan at ${modulePlanPath}`, {
      issues: validation.error.issues,
      path: modulePlanPath,
      reason:
        validation.error.issues[0]?.message ?? "Module plan shape is invalid",
    });
  }

  return ok(validation.data);
};
