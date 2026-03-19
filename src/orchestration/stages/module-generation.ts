import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { ZodError } from "zod";
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

type ModuleGenerationValidationErrors = ReturnType<
  ZodError<ModuleGenerationResult>["flatten"]
>;

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

    const parsedResult = await parseModuleGenerationResult(
      provider,
      module,
      systemPrompt,
      userMessage,
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

const parseModuleGenerationResult = async (
  provider: InferenceProvider,
  module: PlannedModule,
  systemPrompt: string,
  userMessage: string,
  output: unknown,
): Promise<ReturnType<typeof moduleGenerationResultSchema.safeParse>> => {
  const normalizedOutput = normalizeOptionalPacketFields(output);
  const parsedResult = moduleGenerationResultSchema.safeParse(normalizedOutput);

  if (parsedResult.success) {
    return parsedResult;
  }

  if (
    !isRecoverableModulePacketMismatch(output, parsedResult.error.flatten())
  ) {
    return parsedResult;
  }

  const repairResult = await provider.infer<ModuleGenerationResult>({
    outputSchema: moduleGenerationOutputSchema,
    systemPrompt,
    userMessage: buildModuleRepairPrompt(
      module.name,
      userMessage,
      normalizedOutput,
      parsedResult.error.flatten(),
    ),
  });

  if (!repairResult.ok) {
    return coerceSummaryOnlyModuleGenerationResult(output) ?? parsedResult;
  }

  const repairedParse = moduleGenerationResultSchema.safeParse(
    normalizeOptionalPacketFields(repairResult.value.output),
  );

  if (repairedParse.success) {
    return repairedParse;
  }

  return (
    coerceSummaryOnlyModuleGenerationResult(repairResult.value.output) ??
    coerceSummaryOnlyModuleGenerationResult(normalizedOutput) ??
    repairedParse
  );
};

const isRecoverableModulePacketMismatch = (
  output: unknown,
  validationErrors: ModuleGenerationValidationErrors,
): boolean => {
  if (!isRecord(output)) {
    return false;
  }

  const packetMode = output.packetMode;

  if (packetMode !== "full-packet") {
    return false;
  }

  return (
    (validationErrors.fieldErrors.sequenceDiagram?.length ?? 0) > 0 ||
    (validationErrors.fieldErrors.flowNotes?.length ?? 0) > 0
  );
};

const buildModuleRepairPrompt = (
  moduleName: string,
  originalUserMessage: string,
  invalidOutput: unknown,
  validationErrors: ModuleGenerationValidationErrors,
): string =>
  [
    originalUserMessage,
    "",
    "Your previous response did not satisfy the output contract for this module packet.",
    `Module: ${moduleName}`,
    "",
    "Repair rules:",
    '- If you return packetMode "full-packet", you must include a non-empty structureDiagram, entityTable, sequenceDiagram, and flowNotes.',
    '- If you cannot provide a meaningful sequence diagram for this module, change packetMode to "summary-only" and omit sequenceDiagram and flowNotes.',
    "- Return corrected JSON only.",
    "",
    "Previous invalid JSON:",
    JSON.stringify(invalidOutput, null, 2),
    "",
    "Validation errors:",
    JSON.stringify(validationErrors, null, 2),
  ].join("\n");

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const normalizeOptionalPacketFields = (output: unknown): unknown => {
  if (!isRecord(output)) {
    return output;
  }

  const normalized = { ...output };
  const packetMode = normalized.packetMode;

  for (const key of [
    "pageContent",
    "overview",
    "structureDiagram",
    "sequenceDiagram",
  ] as const) {
    const value = normalized[key];

    if (typeof value === "string" && value.trim().length === 0) {
      delete normalized[key];
    }
  }

  for (const key of ["responsibilities", "entityTable", "flowNotes"] as const) {
    const value = normalized[key];

    if (Array.isArray(value) && value.length === 0) {
      delete normalized[key];
    }
  }

  if (packetMode === "summary-only") {
    delete normalized.sequenceDiagram;
    delete normalized.flowNotes;
  }

  return normalized;
};

const coerceSummaryOnlyModuleGenerationResult = (
  output: unknown,
): ReturnType<typeof moduleGenerationResultSchema.safeParse> | null => {
  if (!isRecord(output)) {
    return null;
  }

  const title =
    typeof output.title === "string" && output.title.trim().length > 0
      ? output.title
      : undefined;
  const crossLinks = Array.isArray(output.crossLinks)
    ? output.crossLinks.filter(
        (value): value is string => typeof value === "string",
      )
    : [];
  const overview =
    typeof output.overview === "string" && output.overview.trim().length > 0
      ? output.overview
      : undefined;
  const pageContent =
    typeof output.pageContent === "string" &&
    output.pageContent.trim().length > 0
      ? output.pageContent
      : undefined;
  const responsibilities = Array.isArray(output.responsibilities)
    ? output.responsibilities.filter(
        (value): value is string =>
          typeof value === "string" && value.trim().length > 0,
      )
    : undefined;

  if (!title || (!overview && !pageContent)) {
    return null;
  }

  return moduleGenerationResultSchema.safeParse({
    crossLinks,
    ...(overview ? { overview } : {}),
    packetMode: "summary-only",
    ...(pageContent ? { pageContent } : {}),
    ...(responsibilities && responsibilities.length > 0
      ? { responsibilities }
      : {}),
    title,
  });
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
