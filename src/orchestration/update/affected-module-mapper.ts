import { CLUSTERING_THRESHOLD } from "../../contracts/planning.js";
import { ok } from "../../types/common.js";
import type {
  AnalyzedRelationship,
  ChangedFile,
  EngineResult,
  ModulePlan,
  PlannedModule,
  RepositoryAnalysis,
} from "../../types/index.js";
import type { AffectedModuleSet } from "../../types/update.js";
import { validateModulePlan } from "../stages/module-planning.js";

export interface AffectedModuleMappingResult {
  affectedModules: AffectedModuleSet;
  updatedPlan: ModulePlan;
}

export const mapToAffectedModules = (
  changedFiles: ChangedFile[],
  priorPlan: ModulePlan,
  freshAnalysis: RepositoryAnalysis,
): EngineResult<AffectedModuleMappingResult> => {
  const priorComponentToModule = buildPriorComponentToModuleMap(priorPlan);
  const priorKnownComponents = new Set([
    ...priorComponentToModule.keys(),
    ...priorPlan.unmappedComponents,
  ]);
  const currentComponentPaths = Object.keys(freshAnalysis.components).sort();
  const currentModuleAssignments = new Map<string, string>();
  const assignedComponentsByModule = new Map<string, Set<string>>(
    priorPlan.modules.map((module) => [module.name, new Set<string>()]),
  );
  const updatedUnmappedComponents = new Set<string>();
  const warnings = new Set<string>();
  const unmappableFiles = new Set<string>();
  const relationshipImpactedModules = new Set<string>();

  for (const componentPath of currentComponentPaths) {
    const mappedModule =
      priorComponentToModule.get(componentPath) ??
      mapComponentToExistingModule(componentPath, priorPlan);

    if (mappedModule) {
      assignedComponentsByModule.get(mappedModule)?.add(componentPath);
      currentModuleAssignments.set(componentPath, mappedModule);
      continue;
    }

    updatedUnmappedComponents.add(componentPath);
  }

  const updatedPlan: ModulePlan = {
    modules: priorPlan.modules
      .map((module) => ({
        ...module,
        components: [
          ...(assignedComponentsByModule.get(module.name) ?? new Set<string>()),
        ].sort(),
      }))
      .filter((module) => module.components.length > 0),
    unmappedComponents: [...updatedUnmappedComponents].sort(),
  };

  const validatedUpdatedPlan = validateModulePlan(updatedPlan, freshAnalysis);

  if (!validatedUpdatedPlan.ok) {
    return validatedUpdatedPlan;
  }

  const modulesToRegenerate = new Set<string>();
  const modulesToRemove = new Set(
    priorPlan.modules
      .filter((module) => !assignedComponentsByModule.get(module.name)?.size)
      .map((module) => module.name),
  );
  const affectedPriorComponents = new Set<string>();

  for (const changedFile of changedFiles) {
    const moduleNames = resolveChangedFileModules(
      changedFile,
      priorComponentToModule,
      currentModuleAssignments,
    );

    for (const moduleName of moduleNames) {
      if (!modulesToRemove.has(moduleName)) {
        modulesToRegenerate.add(moduleName);
      }
    }

    const trackedPriorPath = getTrackedPriorPath(
      changedFile,
      priorKnownComponents,
    );

    if (trackedPriorPath) {
      affectedPriorComponents.add(trackedPriorPath);
    }

    const newlyIntroducedPath = getNewlyIntroducedPath(
      changedFile,
      priorKnownComponents,
    );

    if (
      newlyIntroducedPath &&
      !currentModuleAssignments.has(newlyIntroducedPath)
    ) {
      unmappableFiles.add(newlyIntroducedPath);
      warnings.add(
        `New file "${newlyIntroducedPath}" could not be mapped to an existing module. Run full generation to refresh the module plan.`,
      );
    }

    if (
      (priorPlan.unmappedComponents.includes(changedFile.path) ||
        (changedFile.oldPath &&
          priorPlan.unmappedComponents.includes(changedFile.oldPath))) &&
      changedFile.changeType !== "added"
    ) {
      warnings.add(
        `Changed file "${changedFile.path}" is tracked as an unmapped component and was not regenerated.`,
      );
    }

    for (const relatedModule of getRelationshipImpacts(
      changedFile,
      currentModuleAssignments,
      freshAnalysis.relationships,
    )) {
      relationshipImpactedModules.add(relatedModule);

      if (!modulesToRemove.has(relatedModule)) {
        modulesToRegenerate.add(relatedModule);
      }
    }
  }

  const structuralChangeModules = getStructurallyChangedModules(
    priorPlan,
    validatedUpdatedPlan.value,
  );

  const priorComponentCount =
    priorPlan.modules.reduce(
      (total, module) => total + module.components.length,
      priorPlan.unmappedComponents.length,
    ) || 1;
  const requiresFullRegeneration = shouldRequireFullRegeneration({
    priorComponentCount,
    affectedPriorComponentCount: affectedPriorComponents.size,
    unmappableFileCount: unmappableFiles.size,
  });
  const fullRegenerationReason = requiresFullRegeneration
    ? buildFullRegenerationReason({
        priorComponentCount,
        affectedPriorComponentCount: affectedPriorComponents.size,
        unmappableFiles: [...unmappableFiles].sort(),
      })
    : undefined;

  if (affectedPriorComponents.size / priorComponentCount > 0.5) {
    warnings.add(
      "More than 50% of the prior components were affected. Full generation is recommended to refresh the documentation baseline.",
    );
  }

  if (modulesToRemove.size > 0) {
    warnings.add(
      "One or more modules lost all planned components during update mode. Full generation is recommended after this incremental update.",
    );
  }

  const remainingModuleNames = new Set(
    validatedUpdatedPlan.value.modules.map((module) => module.name),
  );

  return ok({
    affectedModules: {
      modulesToRegenerate: [...modulesToRegenerate].sort(),
      modulesToRemove: [...modulesToRemove].sort(),
      unchangedModules: [...remainingModuleNames]
        .filter((moduleName) => !modulesToRegenerate.has(moduleName))
        .sort(),
      overviewNeedsRegeneration:
        modulesToRemove.size > 0 ||
        structuralChangeModules.size > 0 ||
        relationshipImpactedModules.size > 0,
      moduleTreeNeedsRewrite:
        modulesToRemove.size > 0 || structuralChangeModules.size > 0,
      requiresFullRegeneration,
      ...(fullRegenerationReason ? { fullRegenerationReason } : {}),
      unmappableFiles: [...unmappableFiles].sort(),
      warnings: [...warnings].sort(),
    },
    updatedPlan: validatedUpdatedPlan.value,
  });
};

const buildPriorComponentToModuleMap = (
  plan: ModulePlan,
): Map<string, string> => {
  const componentToModule = new Map<string, string>();

  for (const module of plan.modules) {
    for (const componentPath of module.components) {
      componentToModule.set(componentPath, module.name);
    }
  }

  return componentToModule;
};

const resolveChangedFileModules = (
  changedFile: ChangedFile,
  priorComponentToModule: Map<string, string>,
  currentModuleAssignments: Map<string, string>,
): Set<string> => {
  const moduleNames = new Set<string>();

  const currentModule = currentModuleAssignments.get(changedFile.path);

  if (currentModule) {
    moduleNames.add(currentModule);
  }

  const priorModule =
    priorComponentToModule.get(changedFile.oldPath ?? changedFile.path) ??
    priorComponentToModule.get(changedFile.path);

  if (priorModule) {
    moduleNames.add(priorModule);
  }

  return moduleNames;
};

const getTrackedPriorPath = (
  changedFile: ChangedFile,
  priorKnownComponents: Set<string>,
): string | null => {
  const candidatePaths = [
    changedFile.oldPath,
    changedFile.changeType === "deleted" ? changedFile.path : undefined,
    changedFile.path,
  ].filter((value): value is string => Boolean(value));

  for (const candidatePath of candidatePaths) {
    if (priorKnownComponents.has(candidatePath)) {
      return candidatePath;
    }
  }

  return null;
};

const getNewlyIntroducedPath = (
  changedFile: ChangedFile,
  priorKnownComponents: Set<string>,
): string | null => {
  if (
    changedFile.changeType !== "added" &&
    changedFile.changeType !== "renamed"
  ) {
    return null;
  }

  return priorKnownComponents.has(changedFile.path) ? null : changedFile.path;
};

const getRelationshipImpacts = (
  changedFile: ChangedFile,
  currentModuleAssignments: Map<string, string>,
  relationships: AnalyzedRelationship[],
): Set<string> => {
  const changedPaths = new Set(
    [changedFile.path, changedFile.oldPath].filter((value): value is string =>
      Boolean(value),
    ),
  );

  const impactedModules = new Set<string>();

  for (const relationship of relationships) {
    if (
      !changedPaths.has(relationship.source) &&
      !changedPaths.has(relationship.target)
    ) {
      continue;
    }

    const sourceModule = currentModuleAssignments.get(relationship.source);
    const targetModule = currentModuleAssignments.get(relationship.target);

    if (!sourceModule || !targetModule || sourceModule === targetModule) {
      continue;
    }

    impactedModules.add(sourceModule);
    impactedModules.add(targetModule);
  }

  return impactedModules;
};

const getStructurallyChangedModules = (
  priorPlan: ModulePlan,
  updatedPlan: ModulePlan,
): Set<string> => {
  const updatedModulesByName = new Map(
    updatedPlan.modules.map((module) => [module.name, module] as const),
  );
  const structuralChangeModules = new Set<string>();

  for (const priorModule of priorPlan.modules) {
    const updatedModule = updatedModulesByName.get(priorModule.name);

    if (!updatedModule) {
      structuralChangeModules.add(priorModule.name);
      continue;
    }

    if (
      !areSortedListsEqual(priorModule.components, updatedModule.components)
    ) {
      structuralChangeModules.add(priorModule.name);
    }
  }

  return structuralChangeModules;
};

const areSortedListsEqual = (left: string[], right: string[]): boolean => {
  if (left.length !== right.length) {
    return false;
  }

  const sortedLeft = [...left].sort();
  const sortedRight = [...right].sort();

  return sortedLeft.every((value, index) => value === sortedRight[index]);
};

const shouldRequireFullRegeneration = (options: {
  priorComponentCount: number;
  affectedPriorComponentCount: number;
  unmappableFileCount: number;
}): boolean => {
  if (options.priorComponentCount <= CLUSTERING_THRESHOLD) {
    return false;
  }

  if (options.affectedPriorComponentCount / options.priorComponentCount > 0.5) {
    return true;
  }

  return options.unmappableFileCount > 0;
};

const buildFullRegenerationReason = (options: {
  priorComponentCount: number;
  affectedPriorComponentCount: number;
  unmappableFiles: string[];
}): string => {
  if (options.unmappableFiles.length > 0) {
    return `Update mode detected new or moved files that could not be mapped to the existing module plan (${options.unmappableFiles.join(", ")}). Run full generation to refresh the documentation baseline.`;
  }

  return `Update mode affected ${options.affectedPriorComponentCount} of ${options.priorComponentCount} tracked components. Run full generation to refresh the documentation baseline.`;
};

const mapComponentToExistingModule = (
  componentPath: string,
  priorPlan: ModulePlan,
): string | null => {
  let bestScore = 0;
  let candidateModuleNames = new Set<string>();

  for (const module of priorPlan.modules) {
    const score = getBestPrefixScore(componentPath, module);

    if (score === 0) {
      continue;
    }

    if (score > bestScore) {
      bestScore = score;
      candidateModuleNames = new Set([module.name]);
      continue;
    }

    if (score === bestScore) {
      candidateModuleNames.add(module.name);
    }
  }

  return candidateModuleNames.size === 1
    ? ([...candidateModuleNames][0] ?? null)
    : null;
};

const getBestPrefixScore = (
  candidatePath: string,
  module: PlannedModule,
): number => {
  return module.components.reduce(
    (bestScore, componentPath) =>
      Math.max(
        bestScore,
        getSharedDirectoryPrefixScore(candidatePath, componentPath),
      ),
    0,
  );
};

const getSharedDirectoryPrefixScore = (
  candidatePath: string,
  componentPath: string,
): number => {
  const candidateSegments = getDirectorySegments(candidatePath);
  const componentSegments = getDirectorySegments(componentPath);
  let sharedSegments = 0;

  while (
    sharedSegments < candidateSegments.length &&
    sharedSegments < componentSegments.length &&
    candidateSegments[sharedSegments] === componentSegments[sharedSegments]
  ) {
    sharedSegments += 1;
  }

  return sharedSegments;
};

const getDirectorySegments = (filePath: string): string[] =>
  filePath.split("/").slice(0, -1).filter(Boolean);
