import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { toJSONSchema } from "zod";

import { moduleGenerationResultSchema } from "../../contracts/generation.js";
import type { InferenceProvider } from "../../inference/types.js";
import { buildModuleDocPrompt } from "../../prompts/module-doc.js";
import { err, ok } from "../../types/common.js";
import { moduleNameToFileName } from "../../types/generation.js";
import type {
  EngineResult,
  GeneratedModuleSet,
  ModuleGenerationResult,
  ModulePlan,
  PlannedModule,
  RepositoryAnalysis,
  ResolvedRunConfig,
} from "../../types/index.js";
import {
  buildModuleDocumentationFacts,
  defaultEntityTable,
  defaultFlowNotes,
  renderModuleDocumentationPacket,
  selectModuleDocumentationPacket,
} from "../module-doc-packet.js";
import { resolveOutputPath } from "../output-path.js";

export type ModuleProgressCallback = (
  moduleName: string,
  completed: number,
  total: number,
) => void;

const moduleGenerationOutputSchema = toJSONSchema(
  moduleGenerationResultSchema,
) as Record<string, unknown>;

export const generateModuleDocs = async (
  plan: ModulePlan,
  analysis: RepositoryAnalysis,
  config: ResolvedRunConfig,
  provider: InferenceProvider,
  onModuleProgress?: ModuleProgressCallback,
  modulesOverride?: PlannedModule[],
): Promise<EngineResult<GeneratedModuleSet>> => {
  const outputPath = resolveOutputPath(config);
  const modules = [...(modulesOverride ?? plan.modules)].sort((left, right) =>
    left.name.localeCompare(right.name),
  );
  const fileNamesResult = getModuleFileNames(modules);

  if (!fileNamesResult.ok) {
    return fileNamesResult;
  }

  try {
    await mkdir(outputPath, { recursive: true });
  } catch (error) {
    return err("ORCHESTRATION_ERROR", "Unable to create output directory", {
      cause: error instanceof Error ? error.message : String(error),
      outputPath,
    });
  }

  const generatedModules: GeneratedModuleSet = new Map();

  for (const [index, module] of modules.entries()) {
    const fileName = fileNamesResult.value.get(module.name);

    if (!fileName) {
      return err("ORCHESTRATION_ERROR", "Missing derived filename for module", {
        moduleName: module.name,
      });
    }

    const filePath = path.join(outputPath, fileName);
    const contentResult =
      module.components.length === 0
        ? ok(createPlaceholderModulePage(module))
        : await generateModulePage(module, plan, analysis, config, provider);

    if (!contentResult.ok) {
      return contentResult;
    }

    try {
      await writeFile(
        filePath,
        ensureTrailingNewline(contentResult.value),
        "utf8",
      );
    } catch (error) {
      return err("ORCHESTRATION_ERROR", "Unable to write module page", {
        cause: error instanceof Error ? error.message : String(error),
        filePath,
        moduleName: module.name,
      });
    }

    onModuleProgress?.(module.name, index + 1, modules.length);

    generatedModules.set(module.name, {
      content: contentResult.value,
      description: module.description,
      fileName,
      filePath,
      moduleName: module.name,
    });
  }

  return ok(generatedModules);
};

const generateModulePage = async (
  module: PlannedModule,
  plan: ModulePlan,
  analysis: RepositoryAnalysis,
  _config: ResolvedRunConfig,
  provider: InferenceProvider,
): Promise<EngineResult<string>> => {
  const selection = selectModuleDocumentationPacket(module, plan, analysis);
  const facts = buildModuleDocumentationFacts(module, plan, analysis);
  const { systemPrompt, userMessage } = buildModuleDocPrompt(
    module,
    plan,
    analysis,
    selection,
    facts,
  );

  try {
    const result = await provider.infer<ModuleGenerationResult>({
      outputSchema: moduleGenerationOutputSchema,
      systemPrompt,
      userMessage,
    });

    if (!result.ok) {
      return err("ORCHESTRATION_ERROR", "Module generation failed", {
        moduleName: module.name,
        providerError: result.error,
      });
    }

    const parsedResult = moduleGenerationResultSchema.safeParse(
      result.value.output,
    );

    if (!parsedResult.success) {
      return err(
        "ORCHESTRATION_ERROR",
        "Inference provider returned invalid module documentation",
        {
          moduleName: module.name,
          rawResponse: result.value.output,
          validationErrors: parsedResult.error.flatten(),
        },
      );
    }

    return ok(
      normalizeModulePage(
        {
          ...parsedResult.data,
          entityTable:
            parsedResult.data.entityTable ??
            (selection.packetMode === "full-packet"
              ? defaultEntityTable(facts.entityCandidates)
              : undefined),
          flowNotes:
            parsedResult.data.flowNotes ??
            (selection.recommendSequenceDiagram
              ? defaultFlowNotes(facts.flowCandidates)
              : undefined),
        },
        selection,
        facts,
      ),
    );
  } catch (error) {
    return err("ORCHESTRATION_ERROR", "Module generation failed", {
      cause: error instanceof Error ? error.message : String(error),
      moduleName: module.name,
    });
  }
};

const normalizeModulePage = (
  result: ModuleGenerationResult,
  selection: ReturnType<typeof selectModuleDocumentationPacket>,
  facts: ReturnType<typeof buildModuleDocumentationFacts>,
): string => {
  if (result.overview || result.structureDiagram || result.sequenceDiagram) {
    return renderModuleDocumentationPacket(result, selection, facts);
  }

  const trimmedContent = result.pageContent?.trim() ?? "";

  if (trimmedContent.startsWith("#")) {
    return trimmedContent;
  }

  return `# ${result.title}\n\n${trimmedContent}`;
};

const createPlaceholderModulePage = (module: PlannedModule): string =>
  [
    `# ${module.name}`,
    "",
    module.description,
    "",
    "## Status",
    "",
    "No repository components were assigned to this module during planning.",
  ].join("\n");

const RESERVED_OUTPUT_FILES = new Set([
  "overview.md",
  "module-tree.json",
  ".doc-meta.json",
  ".module-plan.json",
]);

const getModuleFileNames = (
  modules: PlannedModule[],
): EngineResult<Map<string, string>> => {
  const derivedNames = new Map<string, string>();
  const collisions = new Map<string, string[]>();
  const reservedCollisions: { fileName: string; moduleName: string }[] = [];

  for (const module of modules) {
    const fileName = moduleNameToFileName(module.name);

    if (RESERVED_OUTPUT_FILES.has(fileName)) {
      reservedCollisions.push({ fileName, moduleName: module.name });
      continue;
    }

    const existingModule = [...derivedNames.entries()].find(
      ([, existingFileName]) => existingFileName === fileName,
    )?.[0];

    if (existingModule) {
      const conflictingModules = collisions.get(fileName) ?? [existingModule];
      conflictingModules.push(module.name);
      collisions.set(fileName, conflictingModules);
      continue;
    }

    derivedNames.set(module.name, fileName);
  }

  if (reservedCollisions.length > 0) {
    return err(
      "ORCHESTRATION_ERROR",
      "Module name collides with reserved output filename",
      {
        reservedCollisions: reservedCollisions.sort((left, right) =>
          left.fileName.localeCompare(right.fileName),
        ),
      },
    );
  }

  if (collisions.size > 0) {
    return err("ORCHESTRATION_ERROR", "Derived module page filenames collide", {
      collisions: [...collisions.entries()]
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([fileName, moduleNames]) => ({
          fileName,
          moduleNames: [...new Set(moduleNames)].sort(),
        })),
    });
  }

  return ok(derivedNames);
};

const ensureTrailingNewline = (value: string): string =>
  value.endsWith("\n") ? value : `${value}\n`;
