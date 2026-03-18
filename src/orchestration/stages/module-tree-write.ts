import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { err, ok } from "../../types/common.js";
import { moduleNameToFileName } from "../../types/generation.js";
import type {
  EngineResult,
  ModulePlan,
  ModuleTree,
  ModuleTreeEntry,
  PlannedModule,
} from "../../types/index.js";

export const writeModuleTree = async (
  plan: ModulePlan,
  outputPath: string,
): Promise<EngineResult<void>> => {
  const treeResult = buildModuleTree(plan);

  if (!treeResult.ok) {
    return treeResult;
  }

  try {
    await mkdir(outputPath, { recursive: true });
    await writeFile(
      path.join(outputPath, "module-tree.json"),
      `${JSON.stringify(treeResult.value, null, 2)}\n`,
      "utf8",
    );
  } catch (error) {
    return err("ORCHESTRATION_ERROR", "Unable to write module tree", {
      cause: error instanceof Error ? error.message : String(error),
      outputPath,
    });
  }

  return ok(undefined);
};

const buildModuleTree = (plan: ModulePlan): EngineResult<ModuleTree> => {
  const modulesByName = new Map(
    plan.modules.map((module) => [module.name, module] as const),
  );
  const childrenByParent = new Map<string, PlannedModule[]>();
  const roots: PlannedModule[] = [];
  const seenFileNames = new Map<string, string>();

  for (const module of [...plan.modules].sort((left, right) =>
    left.name.localeCompare(right.name),
  )) {
    const fileName = moduleNameToFileName(module.name);
    const existingModuleName = seenFileNames.get(fileName);

    if (existingModuleName) {
      return err(
        "ORCHESTRATION_ERROR",
        "Derived module page filenames collide",
        {
          collisions: [
            {
              fileName,
              moduleNames: [existingModuleName, module.name].sort(),
            },
          ],
        },
      );
    }

    seenFileNames.set(fileName, module.name);

    if (module.parentModule && modulesByName.has(module.parentModule)) {
      const children = childrenByParent.get(module.parentModule) ?? [];
      children.push(module);
      childrenByParent.set(module.parentModule, children);
      continue;
    }

    roots.push(module);
  }

  return ok(
    roots
      .sort((left, right) => left.name.localeCompare(right.name))
      .map((module) => createTreeEntry(module, childrenByParent)),
  );
};

const createTreeEntry = (
  module: PlannedModule,
  childrenByParent: Map<string, PlannedModule[]>,
): ModuleTreeEntry => {
  const children = (childrenByParent.get(module.name) ?? [])
    .sort((left, right) => left.name.localeCompare(right.name))
    .map((child) => createTreeEntry(child, childrenByParent));

  return {
    children: children.length > 0 ? children : undefined,
    name: module.name,
    page: moduleNameToFileName(module.name),
  };
};
