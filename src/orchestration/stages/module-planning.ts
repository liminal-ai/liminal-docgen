import path from "node:path";

import { toJSONSchema } from "zod";

import {
  CLUSTERING_THRESHOLD,
  modulePlanSchema,
} from "../../contracts/planning.js";
import type { InferenceProvider } from "../../inference/types.js";
import { buildClusteringPrompt } from "../../prompts/clustering.js";
import type { EngineResult } from "../../types/common.js";
import { err, ok } from "../../types/common.js";
import type { RepositoryAnalysis } from "../../types/index.js";
import type { ModulePlan, PlannedModule } from "../../types/planning.js";

const modulePlanOutputSchema = toJSONSchema(modulePlanSchema) as Record<
  string,
  unknown
>;

export const planModules = async (
  analysis: RepositoryAnalysis,
  provider: InferenceProvider,
): Promise<EngineResult<ModulePlan>> => {
  const componentPaths = Object.keys(analysis.components).sort();

  if (componentPaths.length === 0) {
    return err(
      "ORCHESTRATION_ERROR",
      "Cannot plan modules for a repository analysis with no components",
      { componentCount: 0 },
    );
  }

  if (componentPaths.length <= CLUSTERING_THRESHOLD) {
    return validateModulePlan(buildSmallRepoPlan(analysis), analysis);
  }

  const { systemPrompt, userMessage } = buildClusteringPrompt(analysis);

  try {
    const result = await provider.infer<ModulePlan>({
      outputSchema: modulePlanOutputSchema,
      systemPrompt,
      userMessage,
    });

    if (!result.ok) {
      return err(
        "ORCHESTRATION_ERROR",
        "Module clustering failed",
        result.error,
      );
    }

    const parsedPlan = modulePlanSchema.safeParse(result.value.output);

    if (!parsedPlan.success) {
      return err(
        "ORCHESTRATION_ERROR",
        "Inference provider returned a module plan that does not match the expected schema",
        {
          rawResponse: result.value.output,
          validationErrors: parsedPlan.error.flatten(),
        },
      );
    }

    return validateModulePlan(parsedPlan.data, analysis);
  } catch (error) {
    return err("ORCHESTRATION_ERROR", "Module clustering failed", {
      cause: error instanceof Error ? error.message : String(error),
    });
  }
};

export const validateModulePlan = (
  plan: ModulePlan,
  analysis: RepositoryAnalysis,
): EngineResult<ModulePlan> => {
  const expectedComponents = new Set(Object.keys(analysis.components));
  const seenComponents = new Map<string, string[]>();
  const duplicateModuleNames = new Set<string>();
  const moduleNames = new Set<string>();
  const unknownComponents = new Set<string>();
  const emptyModules: string[] = [];

  if (plan.modules.length === 0) {
    return err(
      "ORCHESTRATION_ERROR",
      "Module plan must contain at least one module",
      { moduleCount: 0 },
    );
  }

  for (const module of plan.modules) {
    if (module.components.length === 0) {
      emptyModules.push(module.name);
    }

    if (moduleNames.has(module.name)) {
      duplicateModuleNames.add(module.name);
    }
    moduleNames.add(module.name);

    for (const component of module.components) {
      if (!expectedComponents.has(component)) {
        unknownComponents.add(component);
      }

      const locations = seenComponents.get(component) ?? [];
      locations.push(`module:${module.name}`);
      seenComponents.set(component, locations);
    }
  }

  for (const component of plan.unmappedComponents) {
    if (!expectedComponents.has(component)) {
      unknownComponents.add(component);
    }

    const locations = seenComponents.get(component) ?? [];
    locations.push("unmappedComponents");
    seenComponents.set(component, locations);
  }

  const overlappingComponents = [...seenComponents.entries()]
    .filter(([, locations]) => locations.length > 1)
    .map(([component, locations]) => ({
      component,
      locations,
    }));

  const missingComponents = [...expectedComponents].filter(
    (component) => !seenComponents.has(component),
  );

  if (
    emptyModules.length > 0 ||
    duplicateModuleNames.size > 0 ||
    unknownComponents.size > 0 ||
    overlappingComponents.length > 0 ||
    missingComponents.length > 0
  ) {
    return err("ORCHESTRATION_ERROR", "Module plan validation failed", {
      duplicateModuleNames: [...duplicateModuleNames].sort(),
      emptyModules,
      missingComponents,
      overlappingComponents,
      unknownComponents: [...unknownComponents].sort(),
    });
  }

  return ok(plan);
};

const buildSmallRepoPlan = (analysis: RepositoryAnalysis): ModulePlan => {
  const componentPaths = Object.keys(analysis.components).sort();

  if (hasNoMeaningfulDirectoryStructure(componentPaths)) {
    return {
      modules: [
        {
          components: componentPaths,
          description:
            "Single-module plan for a compact repository without distinct source directories",
          name: deriveRepositoryModuleName(analysis.repoPath),
        },
      ],
      unmappedComponents: [],
    };
  }

  const groupedComponents = new Map<string, string[]>();
  const unmappedComponents: string[] = [];

  for (const componentPath of componentPaths) {
    const directoryKey = getSignificantDirectory(componentPath);

    if (!directoryKey) {
      unmappedComponents.push(componentPath);
      continue;
    }

    const existing = groupedComponents.get(directoryKey) ?? [];
    existing.push(componentPath);
    groupedComponents.set(directoryKey, existing);
  }

  const modules = [...groupedComponents.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([directoryKey, components]) =>
      buildDirectoryModule(directoryKey, components),
    );

  return {
    modules,
    unmappedComponents: unmappedComponents.sort(),
  };
};

const hasNoMeaningfulDirectoryStructure = (componentPaths: string[]): boolean =>
  componentPaths.every(
    (componentPath) => getSignificantDirectory(componentPath) === null,
  );

const getSignificantDirectory = (filePath: string): string | null => {
  const pathSegments = filePath.split("/").filter(Boolean);
  const directorySegments = pathSegments.slice(0, -1);

  if (directorySegments.length === 0) {
    return null;
  }

  const significantSegments =
    directorySegments[0] === "src"
      ? directorySegments.slice(1, 3)
      : directorySegments.slice(0, 2);

  if (significantSegments.length === 0) {
    return null;
  }

  return significantSegments.join("/");
};

const buildDirectoryModule = (
  directoryKey: string,
  components: string[],
): PlannedModule => {
  return {
    components: [...components].sort(),
    description: `Components grouped from the ${directoryKey} directory cluster`,
    name: directoryKey,
  };
};

const deriveRepositoryModuleName = (repoPath: string): string => {
  const repoName = path.basename(repoPath).trim();

  if (repoName.length === 0) {
    return "repository";
  }

  return repoName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
};
