import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { toJSONSchema, z } from "zod";

import type { InferenceProvider } from "../inference/types.js";
import type { EngineResult } from "../types/common.js";
import { err, ok } from "../types/common.js";
import type { DocumentationStrategy, StrategyInput } from "./types.js";

const STRATEGY_FILE = ".doc-strategy.json";

export interface StrategySelectionOptions {
  /** Directory where .doc-strategy.json is read from / written to */
  readonly outputDir: string;
  /** When true, load prior strategy for comparison (update mode) */
  readonly loadPrior: boolean;
}

const codeZoneSchema = z.enum([
  "production",
  "test",
  "generated",
  "vendored",
  "infrastructure",
  "configuration",
  "build-script",
  "documentation",
]);

const repoClassificationSchema = z.enum([
  "service-app",
  "library",
  "cli-tool",
  "monolith",
  "monorepo",
  "mixed",
]);

const pageShapeSchema = z.enum([
  "full-structured",
  "summary-only",
  "overview-only",
]);

const documentationBoundarySchema = z.object({
  name: z.string().min(1),
  componentPatterns: z.array(z.string()),
  recommendedPageShape: pageShapeSchema,
});

const zoneGuidanceSchema = z.object({
  zone: codeZoneSchema,
  treatment: z.enum(["document", "summarize", "exclude"]),
  reason: z.string().min(1),
});

export const documentationStrategySchema = z.object({
  repoClassification: repoClassificationSchema,
  boundaries: z.array(documentationBoundarySchema),
  zoneGuidance: z.array(zoneGuidanceSchema),
});

const strategyOutputSchema = toJSONSchema(
  documentationStrategySchema,
) as Record<string, unknown>;

/**
 * Runs the documentation strategy selection stage. Makes a one-shot
 * inference call with the assembled strategy input and returns a
 * validated DocumentationStrategy.
 *
 * On success, persists the strategy to .doc-strategy.json in the output directory.
 * On failure, returns an EngineResult error with code STRATEGY_ERROR.
 *
 * Supports: AC-2.1, AC-2.2, AC-2.4
 *
 * @param provider - The inference provider for the one-shot call
 * @param strategyInput - The deterministic input from assembleStrategyInput()
 * @param options - Output directory and update-mode flag
 * @returns The documentation strategy or an error
 */
export async function selectStrategy(
  provider: InferenceProvider,
  strategyInput: StrategyInput,
  options: StrategySelectionOptions,
): Promise<EngineResult<DocumentationStrategy>> {
  // Load prior strategy if in update mode (for future comparison support)
  if (options.loadPrior) {
    await loadPriorStrategy(options.outputDir);
  }

  const systemPrompt = buildStrategySystemPrompt();
  const userMessage = JSON.stringify(strategyInput, null, 2);

  let result: EngineResult<{ output: unknown }>;
  try {
    result = await provider.infer<DocumentationStrategy>({
      systemPrompt,
      userMessage,
      outputSchema: strategyOutputSchema,
    });
  } catch (error) {
    return err("STRATEGY_ERROR", "Strategy inference call failed", {
      cause: error instanceof Error ? error.message : String(error),
    });
  }

  if (!result.ok) {
    return err(
      "STRATEGY_ERROR",
      "Strategy inference call failed",
      result.error,
    );
  }

  const parsed = documentationStrategySchema.safeParse(result.value.output);
  if (!parsed.success) {
    return err("STRATEGY_ERROR", "Strategy response failed schema validation", {
      rawResponse: result.value.output,
      validationErrors: parsed.error.flatten(),
    });
  }

  const strategy = parsed.data as DocumentationStrategy;

  // Persist strategy to .doc-strategy.json (2-space indent, no wrapper)
  const strategyPath = path.join(options.outputDir, STRATEGY_FILE);
  await writeFile(
    strategyPath,
    `${JSON.stringify(strategy, null, 2)}\n`,
    "utf-8",
  );

  return ok(strategy);
}

/**
 * Loads a previously persisted strategy from .doc-strategy.json.
 * Returns null if the file doesn't exist or can't be parsed.
 *
 * Supports: AC-2.2 (update mode)
 *
 * @param outputDir - Directory containing the prior .doc-strategy.json
 * @returns The prior strategy or null
 */
export async function loadPriorStrategy(
  outputDir: string,
): Promise<DocumentationStrategy | null> {
  try {
    const strategyPath = path.join(outputDir, STRATEGY_FILE);
    const content = await readFile(strategyPath, "utf-8");
    const json = JSON.parse(content);
    const parsed = documentationStrategySchema.safeParse(json);
    if (!parsed.success) {
      return null;
    }
    return parsed.data as DocumentationStrategy;
  } catch {
    return null;
  }
}

function buildStrategySystemPrompt(): string {
  return `You are a documentation strategy advisor for source code repositories.

You will receive a structured JSON object describing a repository's shape:
- componentCount: total number of source files/components
- languageDistribution: count of components per programming language
- directoryTreeSummary: top-level directories with component counts
- relationshipDensity: average number of relationship edges per component
- zoneDistribution: count of components per code zone (production, test, generated, etc.)
- roleDistribution: count of components per architectural role (service, handler, utility, etc.)

Based on this input, produce a DocumentationStrategy JSON object with:

1. repoClassification: What kind of repository is this?
   - "service-app": A backend service or web application
   - "library": A reusable library or SDK
   - "cli-tool": A command-line tool
   - "monolith": A large single-purpose application
   - "monorepo": A repository containing multiple distinct projects
   - "mixed": Doesn't fit neatly into one category

2. boundaries: Natural subsystem divisions for documentation. Each boundary has:
   - name: A human-readable name for the subsystem
   - componentPatterns: Glob patterns matching components in this boundary
   - recommendedPageShape: How detailed the documentation should be
     - "full-structured": Full documentation with diagrams, entity tables, flow notes
     - "summary-only": Overview and responsibilities only
     - "overview-only": Single paragraph, minimal detail

3. zoneGuidance: How to treat each code zone present in the repository:
   - zone: The code zone name
   - treatment: "document" (full docs), "summarize" (summary only), or "exclude" (skip)
   - reason: Brief explanation of why this treatment was chosen

Guidelines:
- Production code should almost always be "document"
- Test code is typically "summarize" or "exclude"
- Generated and vendored code should typically be "exclude"
- Infrastructure and build scripts are typically "summarize"
- Small repos (< 10 components) may benefit from "summary-only" for all modules
- Identify natural boundaries from the directory structure and role distribution`;
}
