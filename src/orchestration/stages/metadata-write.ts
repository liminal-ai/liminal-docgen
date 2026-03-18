import { readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import { getMetadataFilePath } from "../../metadata/file.js";
import { writeMetadata } from "../../metadata/writer.js";
import { err } from "../../types/common.js";
import type {
  EngineResult,
  ModulePlan,
  RunSuccessData,
} from "../../types/index.js";

export const MODULE_PLAN_FILE_NAME = ".module-plan.json";

export const writeRunMetadata = async (
  result: RunSuccessData,
  plan: ModulePlan,
  outputPath: string,
): Promise<EngineResult<void>> => {
  return writeArtifacts(
    {
      commitHash: result.commitHash,
      generatedFiles: result.generatedFiles,
      metadataOutputPath: result.metadataOutputPath,
      mode: result.mode,
    },
    plan,
    outputPath,
  );
};

const writeArtifacts = async (
  data: {
    commitHash: string;
    generatedFiles: string[];
    metadataOutputPath: string;
    mode: "full" | "update";
  },
  plan: ModulePlan,
  outputPath: string,
): Promise<EngineResult<void>> => {
  const modulePlanPath = path.join(outputPath, MODULE_PLAN_FILE_NAME);
  const metadataPath = getMetadataFilePath(outputPath);

  let modulePlanSnapshot: FileSnapshot;
  let metadataSnapshot: FileSnapshot;

  try {
    [modulePlanSnapshot, metadataSnapshot] = await Promise.all([
      captureFileSnapshot(modulePlanPath),
      captureFileSnapshot(metadataPath),
    ]);
  } catch (error) {
    return err(
      "METADATA_ERROR",
      "Unable to capture file snapshot before writing metadata",
      {
        reason: error instanceof Error ? error.message : String(error),
      },
    );
  }

  try {
    await writeFile(
      modulePlanPath,
      `${JSON.stringify(plan, null, 2)}\n`,
      "utf8",
    );
  } catch (error) {
    await restoreFileSnapshot(modulePlanPath, modulePlanSnapshot);
    return err(
      "METADATA_ERROR",
      `Unable to write module plan at ${modulePlanPath}`,
      {
        path: modulePlanPath,
        reason: error instanceof Error ? error.message : String(error),
      },
    );
  }

  const metadataResult = await writeMetadata({
    metadata: {
      commitHash: data.commitHash,
      componentCount: countPlannedComponents(plan),
      filesGenerated: [...data.generatedFiles].sort(),
      generatedAt: new Date().toISOString(),
      mode: data.mode,
      outputPath: data.metadataOutputPath,
    },
    outputPath,
  });

  if (metadataResult.ok) {
    return metadataResult;
  }

  await Promise.all([
    restoreFileSnapshot(modulePlanPath, modulePlanSnapshot),
    restoreFileSnapshot(metadataPath, metadataSnapshot),
  ]);
  return metadataResult;
};

const countPlannedComponents = (plan: ModulePlan): number =>
  plan.modules.reduce(
    (total, module) => total + module.components.length,
    plan.unmappedComponents.length,
  );

interface FileSnapshot {
  exists: boolean;
  contents?: string;
}

const captureFileSnapshot = async (filePath: string): Promise<FileSnapshot> => {
  try {
    return {
      contents: await readFile(filePath, "utf8"),
      exists: true,
    };
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return { exists: false };
    }

    throw error;
  }
};

const restoreFileSnapshot = async (
  filePath: string,
  snapshot: FileSnapshot,
): Promise<void> => {
  try {
    if (snapshot.exists) {
      await writeFile(filePath, snapshot.contents ?? "", "utf8");
      return;
    }

    await safeRemove(filePath);
  } catch {
    // Best-effort restoration preserves the primary metadata error.
  }
};

const safeRemove = async (filePath: string): Promise<void> => {
  try {
    await rm(filePath, { force: true });
  } catch {
    // Best-effort cleanup preserves success-only metadata semantics.
  }
};
