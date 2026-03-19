import { readFile } from "node:fs/promises";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import type {
  InferenceProvider,
  InferenceRequest,
  ToolUseConversationResult,
  ToolUseHandle,
  ToolUseRequest,
} from "../../src/inference/types.js";
import {
  type AgenticGenerationContext,
  generateModuleDocs,
} from "../../src/orchestration/stages/module-generation.js";
import { ok } from "../../src/types/common.js";
import type {
  ModulePlan,
  RepositoryAnalysis,
  ResolvedRunConfig,
} from "../../src/types/index.js";
import { cleanupTempDir, createTempDir } from "../helpers/temp.js";

const tempDirs: string[] = [];

afterEach(async () => {
  for (const dir of tempDirs) {
    await cleanupTempDir(dir);
  }
  tempDirs.length = 0;
});

function createMinimalAnalysis(
  repoPath: string,
  componentPaths: string[],
): RepositoryAnalysis {
  return {
    repoPath,
    commitHash: "abc123",
    focusDirs: [],
    summary: {
      totalFilesAnalyzed: componentPaths.length,
      totalComponents: componentPaths.length,
      totalRelationships: 0,
      languagesFound: ["typescript"],
      languagesSkipped: [],
    },
    components: Object.fromEntries(
      componentPaths.map((p) => [
        p,
        {
          filePath: p,
          language: "typescript",
          linesOfCode: 50,
          exportedSymbols: [{ name: "sym", kind: "function", lineNumber: 1 }],
        },
      ]),
    ),
    relationships: [],
  };
}

function createMinimalPlan(
  modules: { name: string; components: string[] }[],
): ModulePlan {
  return {
    modules: modules.map((m) => ({
      name: m.name,
      description: `Description of ${m.name}`,
      components: m.components,
    })),
    unmappedComponents: [],
  };
}

/**
 * Creates a mock provider that supports tool use.
 * The tool use handler writes overview + source-coverage sections,
 * making the agent result successful.
 */
function createAgenticProvider(options?: {
  failForModules?: string[];
}): InferenceProvider {
  return {
    infer: () =>
      Promise.resolve(ok({ output: {} as never, usage: null, costUsd: null })),
    getAccumulatedUsage: () => ({ inputTokens: 0, outputTokens: 0 }),
    computeCost: () => null,
    supportsToolUse: () => true,
    inferWithTools(request: ToolUseRequest): ToolUseHandle {
      const resultPromise = (async () => {
        // Check if this module should fail (by inspecting the system prompt)
        const shouldFail = options?.failForModules?.some((name) =>
          request.systemPrompt.includes(`## Module: ${name}`),
        );

        if (shouldFail) {
          return {
            ok: false as const,
            error: {
              code: "AGENT_ERROR" as const,
              message: "Simulated agent failure",
            },
          };
        }

        // Simulate agent writing required sections
        const toolMap = new Map(request.tools.map((t) => [t.name, t.handler]));

        const writeSection = toolMap.get("write_section");
        if (writeSection) {
          await writeSection(
            { section: "overview", content: "Generated overview." },
            undefined,
          );
          await writeSection(
            { section: "source-coverage", content: "- src/file.ts" },
            undefined,
          );
        }

        const result: ToolUseConversationResult = {
          finalText: "Done.",
          turnCount: 3,
          durationMs: 500,
          usage: { inputTokens: 100, outputTokens: 50 },
          costUsd: 0.005,
        };

        return ok(result);
      })();

      return { result: resultPromise, cancel: () => {} };
    },
  };
}

/** Creates a mock provider that does NOT support tool use. */
function createOneShotProvider(): InferenceProvider {
  return {
    infer: <T>(request: InferenceRequest) =>
      Promise.resolve(
        ok({
          output: {
            title: "Module",
            packetMode: "summary-only",
            overview: "Overview content.",
            crossLinks: [],
          } as unknown as T,
          usage: { inputTokens: 100, outputTokens: 50 },
          costUsd: 0.005,
        }),
      ),
    getAccumulatedUsage: () => ({ inputTokens: 0, outputTokens: 0 }),
    computeCost: () => null,
    supportsToolUse: () => false,
    inferWithTools(): ToolUseHandle {
      return {
        result: Promise.resolve({
          ok: false as const,
          error: {
            code: "TOOL_USE_UNSUPPORTED" as const,
            message: "Not supported",
          },
        }),
        cancel: () => {},
      };
    },
  };
}

describe("generateModuleDocs — agentic routing", () => {
  it("uses agentic path when provider supports tool use", async () => {
    const outputDir = createTempDir();
    tempDirs.push(outputDir);

    const plan = createMinimalPlan([
      { name: "Core", components: ["src/core.ts"] },
    ]);
    const analysis = createMinimalAnalysis(outputDir, ["src/core.ts"]);
    const config: ResolvedRunConfig = {
      repoPath: outputDir,
      outputPath: outputDir,
    } as ResolvedRunConfig;

    const provider = createAgenticProvider();
    const result = await generateModuleDocs(plan, analysis, config, provider);

    expect(result.ok).toBe(true);
    if (result.ok) {
      const page = result.value.get("Core");
      expect(page).toBeDefined();
      // Agentic pages use assembleAgentPage which produces "# Module\n\n## Overview"
      expect(page?.content).toContain("## Overview");
    }
  });

  it("falls back to one-shot path for unsupported providers", async () => {
    const outputDir = createTempDir();
    tempDirs.push(outputDir);

    const plan = createMinimalPlan([
      { name: "Core", components: ["src/core.ts"] },
    ]);
    const analysis = createMinimalAnalysis(outputDir, ["src/core.ts"]);
    const config: ResolvedRunConfig = {
      repoPath: outputDir,
      outputPath: outputDir,
    } as ResolvedRunConfig;

    const provider = createOneShotProvider();
    const result = await generateModuleDocs(plan, analysis, config, provider);

    expect(result.ok).toBe(true);
    if (result.ok) {
      const page = result.value.get("Core");
      expect(page).toBeDefined();
    }
  });

  it("failed module agent allows remaining modules to proceed", async () => {
    const outputDir = createTempDir();
    tempDirs.push(outputDir);

    const plan = createMinimalPlan([
      { name: "Alpha", components: ["src/alpha.ts"] },
      { name: "Beta", components: ["src/beta.ts"] },
      { name: "Gamma", components: ["src/gamma.ts"] },
    ]);
    const analysis = createMinimalAnalysis(outputDir, [
      "src/alpha.ts",
      "src/beta.ts",
      "src/gamma.ts",
    ]);
    const config: ResolvedRunConfig = {
      repoPath: outputDir,
      outputPath: outputDir,
    } as ResolvedRunConfig;

    // Beta fails, Alpha and Gamma succeed
    const provider = createAgenticProvider({ failForModules: ["Beta"] });
    const result = await generateModuleDocs(plan, analysis, config, provider);

    expect(result.ok).toBe(true);
    if (result.ok) {
      // All three modules should have entries (Beta gets a placeholder)
      expect(result.value.size).toBe(3);
      expect(result.value.has("Alpha")).toBe(true);
      expect(result.value.has("Beta")).toBe(true);
      expect(result.value.has("Gamma")).toBe(true);
    }
  });

  it("failed module produces placeholder page", async () => {
    const outputDir = createTempDir();
    tempDirs.push(outputDir);

    const plan = createMinimalPlan([
      { name: "Failing", components: ["src/fail.ts"] },
    ]);
    const analysis = createMinimalAnalysis(outputDir, ["src/fail.ts"]);
    const config: ResolvedRunConfig = {
      repoPath: outputDir,
      outputPath: outputDir,
    } as ResolvedRunConfig;

    const provider = createAgenticProvider({ failForModules: ["Failing"] });
    const result = await generateModuleDocs(plan, analysis, config, provider);

    expect(result.ok).toBe(true);
    if (result.ok) {
      const page = result.value.get("Failing");
      expect(page).toBeDefined();
      expect(page?.content).toContain("Module generation failed");
      expect(page?.content).toContain("# Failing");

      // Verify the file was written to disk
      const fileContent = await readFile(page!.filePath, "utf8");
      expect(fileContent).toContain("Module generation failed");
    }
  });

  it("provider capability check determines routing", async () => {
    const outputDir = createTempDir();
    tempDirs.push(outputDir);

    const plan = createMinimalPlan([
      { name: "Test", components: ["src/test.ts"] },
    ]);
    const analysis = createMinimalAnalysis(outputDir, ["src/test.ts"]);
    const config: ResolvedRunConfig = {
      repoPath: outputDir,
      outputPath: outputDir,
    } as ResolvedRunConfig;

    // Provider says no tool use
    const provider = createOneShotProvider();
    expect(provider.supportsToolUse()).toBe(false);

    const result = await generateModuleDocs(plan, analysis, config, provider);
    expect(result.ok).toBe(true);
  });
});
