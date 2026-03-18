import { writeFile } from "node:fs/promises";
import path from "node:path";

import { toJSONSchema } from "zod";

import { overviewGenerationResultSchema } from "../../contracts/generation.js";
import type { InferenceProvider } from "../../inference/types.js";
import { buildOverviewPrompt } from "../../prompts/overview.js";
import { err, ok } from "../../types/common.js";
import type {
  EngineResult,
  GeneratedModuleSet,
  OverviewGenerationResult,
  RepositoryAnalysis,
  ResolvedRunConfig,
} from "../../types/index.js";
import { resolveOutputPath } from "../output-path.js";

const overviewOutputSchema = toJSONSchema(
  overviewGenerationResultSchema,
) as Record<string, unknown>;

export const generateOverview = async (
  moduleDocs: GeneratedModuleSet,
  analysis: RepositoryAnalysis,
  config: ResolvedRunConfig,
  provider: InferenceProvider,
): Promise<EngineResult<string>> => {
  const { systemPrompt, userMessage } = buildOverviewPrompt(
    {
      modules: [...moduleDocs.values()]
        .sort((left, right) => left.moduleName.localeCompare(right.moduleName))
        .map((moduleDoc) => ({
          components: [],
          description: moduleDoc.description,
          name: moduleDoc.moduleName,
        })),
      unmappedComponents: [],
    },
    moduleDocs,
    analysis,
  );

  try {
    const result = await provider.infer<OverviewGenerationResult>({
      outputSchema: overviewOutputSchema,
      systemPrompt,
      userMessage,
    });

    if (!result.ok) {
      return err("ORCHESTRATION_ERROR", "Overview generation failed", {
        sdkError: result.error,
      });
    }

    const parsedResult = overviewGenerationResultSchema.safeParse(
      result.value.output,
    );

    if (!parsedResult.success) {
      return err(
        "ORCHESTRATION_ERROR",
        "Agent SDK returned invalid overview documentation",
        {
          rawResponse: result.value.output,
          validationErrors: parsedResult.error.flatten(),
        },
      );
    }

    const content = normalizeOverviewContent(parsedResult.data);
    const outputPath = resolveOutputPath(config);
    const overviewPath = path.join(outputPath, "overview.md");
    await writeFile(overviewPath, ensureTrailingNewline(content), "utf8");

    return ok("overview.md");
  } catch (error) {
    return err("ORCHESTRATION_ERROR", "Overview generation failed", {
      cause: error instanceof Error ? error.message : String(error),
    });
  }
};

const normalizeOverviewContent = (result: OverviewGenerationResult): string => {
  const trimmedContent = result.content.trim();

  if (
    trimmedContent.includes("```mermaid") ||
    result.mermaidDiagram.trim().length === 0
  ) {
    return trimmedContent;
  }

  return `${trimmedContent}\n\n\`\`\`mermaid\n${result.mermaidDiagram.trim()}\n\`\`\``;
};

const ensureTrailingNewline = (value: string): string =>
  value.endsWith("\n") ? value : `${value}\n`;
