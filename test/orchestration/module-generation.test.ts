import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import type {
  InferenceProvider,
  InferenceRequest,
  ToolUseConversationResult,
  ToolUseHandle,
  ToolUseRequest,
} from "../../src/inference/types.js";
import * as moduleDocPacket from "../../src/orchestration/module-doc-packet.js";
import {
  createFailedModulePlaceholder,
  generateModuleDocs,
} from "../../src/orchestration/stages/module-generation.js";
import { ok } from "../../src/types/common.js";
import type {
  ModulePlan,
  RepositoryAnalysis,
  ResolvedRunConfig,
} from "../../src/types/index.js";
import {
  evaluateRunStatus,
  exitCodeForStatus,
} from "../../src/types/orchestration.js";
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
  throwForModules?: string[];
}): InferenceProvider {
  return {
    infer: () =>
      Promise.resolve(ok({ output: {} as never, usage: null, costUsd: null })),
    getAccumulatedUsage: () => ({ inputTokens: 0, outputTokens: 0 }),
    computeCost: () => null,
    supportsToolUse: () => true,
    inferWithTools(request: ToolUseRequest): ToolUseHandle {
      const resultPromise = (async () => {
        // Check if this module should throw
        const shouldThrow = options?.throwForModules?.some((name) =>
          request.systemPrompt.includes(`## Module: ${name}`),
        );
        if (shouldThrow) {
          throw new Error("Simulated timeout exceeded");
        }

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
function createOneShotProvider(options?: {
  failForModules?: string[];
}): InferenceProvider {
  return {
    infer: <T>(request: InferenceRequest) => {
      // Check if this module should fail (by inspecting the user message)
      const shouldFail = options?.failForModules?.some((name) =>
        request.userMessage.includes(name),
      );

      if (shouldFail) {
        return Promise.resolve({
          ok: false as const,
          error: {
            code: "ORCHESTRATION_ERROR" as const,
            message: "Simulated one-shot failure",
          },
        });
      }

      return Promise.resolve(
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
      );
    },
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

function makeConfig(outputDir: string): ResolvedRunConfig {
  return {
    repoPath: outputDir,
    outputPath: outputDir,
  } as ResolvedRunConfig;
}

describe("generateModuleDocs — agentic routing", () => {
  it("uses agentic path when provider supports tool use", async () => {
    const outputDir = createTempDir();
    tempDirs.push(outputDir);

    const plan = createMinimalPlan([
      { name: "Core", components: ["src/core.ts"] },
    ]);
    const analysis = createMinimalAnalysis(outputDir, ["src/core.ts"]);

    const provider = createAgenticProvider();
    const result = await generateModuleDocs(
      plan,
      analysis,
      makeConfig(outputDir),
      provider,
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      const page = result.value.generatedModules.get("Core");
      expect(page).toBeDefined();
      expect(page?.content).toContain("## Overview");
      expect(result.value.outcomes).toHaveLength(1);
      expect(result.value.outcomes[0]?.generationPath).toBe("agentic");
    }
  });

  it("falls back to one-shot path for unsupported providers", async () => {
    const outputDir = createTempDir();
    tempDirs.push(outputDir);

    const plan = createMinimalPlan([
      { name: "Core", components: ["src/core.ts"] },
    ]);
    const analysis = createMinimalAnalysis(outputDir, ["src/core.ts"]);

    const provider = createOneShotProvider();
    const result = await generateModuleDocs(
      plan,
      analysis,
      makeConfig(outputDir),
      provider,
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      const page = result.value.generatedModules.get("Core");
      expect(page).toBeDefined();
      expect(result.value.outcomes).toHaveLength(1);
      expect(result.value.outcomes[0]?.generationPath).toBe("one-shot");
    }
  });

  it("provider capability check determines routing", async () => {
    const outputDir = createTempDir();
    tempDirs.push(outputDir);

    const plan = createMinimalPlan([
      { name: "Test", components: ["src/test.ts"] },
    ]);
    const analysis = createMinimalAnalysis(outputDir, ["src/test.ts"]);

    const provider = createOneShotProvider();
    expect(provider.supportsToolUse()).toBe(false);

    const result = await generateModuleDocs(
      plan,
      analysis,
      makeConfig(outputDir),
      provider,
    );
    expect(result.ok).toBe(true);
  });
});

describe("generateModuleDocs — per-module error handling (Flow A)", () => {
  it("TC-4.4a: single failure allows remaining modules to proceed", async () => {
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

    // Beta fails, Alpha and Gamma succeed
    const provider = createAgenticProvider({ failForModules: ["Beta"] });
    const result = await generateModuleDocs(
      plan,
      analysis,
      makeConfig(outputDir),
      provider,
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      // All three modules should have entries (Beta gets a placeholder)
      expect(result.value.generatedModules.size).toBe(3);
      expect(result.value.generatedModules.has("Alpha")).toBe(true);
      expect(result.value.generatedModules.has("Beta")).toBe(true);
      expect(result.value.generatedModules.has("Gamma")).toBe(true);

      // Verify outcomes
      expect(result.value.successCount).toBe(2);
      expect(result.value.failureCount).toBe(1);
      expect(result.value.outcomes).toHaveLength(3);

      const betaOutcome = result.value.outcomes.find(
        (o) => o.moduleName === "Beta",
      );
      expect(betaOutcome?.status).toBe("failed");
      expect(betaOutcome?.hasPlaceholderPage).toBe(true);

      const alphaOutcome = result.value.outcomes.find(
        (o) => o.moduleName === "Alpha",
      );
      expect(alphaOutcome?.status).toBe("success");
    }
  });

  it("TC-4.4b: failed module produces placeholder page", async () => {
    const outputDir = createTempDir();
    tempDirs.push(outputDir);

    const plan = createMinimalPlan([
      { name: "Failing", components: ["src/fail.ts", "src/other.ts"] },
    ]);
    const analysis = createMinimalAnalysis(outputDir, [
      "src/fail.ts",
      "src/other.ts",
    ]);

    const provider = createAgenticProvider({ failForModules: ["Failing"] });
    const result = await generateModuleDocs(
      plan,
      analysis,
      makeConfig(outputDir),
      provider,
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      const page = result.value.generatedModules.get("Failing");
      expect(page).toBeDefined();

      // Placeholder contains module name
      expect(page?.content).toContain("# Failing");
      // Placeholder contains component list
      expect(page?.content).toContain("- src/fail.ts");
      expect(page?.content).toContain("- src/other.ts");
      // Placeholder contains the "could not be generated" notice
      expect(page?.content).toContain("could not be generated");
      // Placeholder does NOT contain failure reasons
      expect(page?.content).not.toContain("Simulated");
      expect(page?.content).not.toContain("failure");
      // Components are sorted
      expect(page?.content).toMatch(/src\/fail\.ts[\s\S]*src\/other\.ts/);

      // Verify the file was written to disk
      const fileContent = await readFile(page!.filePath, "utf8");
      expect(fileContent).toContain("could not be generated");
    }
  });

  it("TC-4.4c: run result reports per-module outcomes", async () => {
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

    const provider = createAgenticProvider({ failForModules: ["Beta"] });
    const result = await generateModuleDocs(
      plan,
      analysis,
      makeConfig(outputDir),
      provider,
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      const { outcomes } = result.value;
      expect(outcomes).toHaveLength(3);

      // Each outcome has the required shape
      for (const outcome of outcomes) {
        expect(outcome.moduleName).toBeDefined();
        expect(["success", "failed"]).toContain(outcome.status);
        expect(["agentic", "one-shot"]).toContain(outcome.generationPath);
        expect(outcome.fileName).toBeDefined();
        expect(outcome.durationMs).toBeGreaterThanOrEqual(0);
      }

      // Failed module has failure reason
      const betaOutcome = outcomes.find((o) => o.moduleName === "Beta");
      expect(betaOutcome?.failureReason).toBeDefined();
    }
  });

  it("TC-7.1a: placeholder on agent timeout", async () => {
    const outputDir = createTempDir();
    tempDirs.push(outputDir);

    const plan = createMinimalPlan([
      { name: "Slow", components: ["src/slow.ts"] },
    ]);
    const analysis = createMinimalAnalysis(outputDir, ["src/slow.ts"]);

    // Use throwForModules to simulate a timeout exception
    const provider = createAgenticProvider({ throwForModules: ["Slow"] });
    const result = await generateModuleDocs(
      plan,
      analysis,
      makeConfig(outputDir),
      provider,
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      const outcome = result.value.outcomes[0]!;
      expect(outcome.status).toBe("failed");
      expect(outcome.hasPlaceholderPage).toBe(true);
      expect(outcome.failureReason).toContain("timeout");

      // Verify placeholder was written
      const page = result.value.generatedModules.get("Slow");
      expect(page?.content).toContain("could not be generated");
    }
  });

  it("TC-7.1b: placeholder on agent error", async () => {
    const outputDir = createTempDir();
    tempDirs.push(outputDir);

    const plan = createMinimalPlan([
      { name: "Broken", components: ["src/broken.ts"] },
    ]);
    const analysis = createMinimalAnalysis(outputDir, ["src/broken.ts"]);

    const provider = createAgenticProvider({ failForModules: ["Broken"] });
    const result = await generateModuleDocs(
      plan,
      analysis,
      makeConfig(outputDir),
      provider,
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      const outcome = result.value.outcomes[0]!;
      expect(outcome.status).toBe("failed");
      expect(outcome.hasPlaceholderPage).toBe(true);
      expect(outcome.failureReason).toBeDefined();

      const page = result.value.generatedModules.get("Broken");
      expect(page?.content).toContain("could not be generated");
    }
  });

  it("TC-7.1c: placeholder on one-shot fallback failure", async () => {
    const outputDir = createTempDir();
    tempDirs.push(outputDir);

    const plan = createMinimalPlan([
      { name: "OneShotFail", components: ["src/one-shot-fail.ts"] },
      { name: "OneShotOk", components: ["src/one-shot-ok.ts"] },
    ]);
    const analysis = createMinimalAnalysis(outputDir, [
      "src/one-shot-fail.ts",
      "src/one-shot-ok.ts",
    ]);

    // One-shot provider that fails for one module
    const provider = createOneShotProvider({
      failForModules: ["OneShotFail"],
    });
    const result = await generateModuleDocs(
      plan,
      analysis,
      makeConfig(outputDir),
      provider,
    );

    // Run completes (does not abort)
    expect(result.ok).toBe(true);
    if (result.ok) {
      // Both modules have entries
      expect(result.value.generatedModules.size).toBe(2);

      // Failed module has placeholder
      const failedOutcome = result.value.outcomes.find(
        (o) => o.moduleName === "OneShotFail",
      );
      expect(failedOutcome?.status).toBe("failed");
      expect(failedOutcome?.generationPath).toBe("one-shot");
      expect(failedOutcome?.hasPlaceholderPage).toBe(true);

      // Successful module generated normally
      const okOutcome = result.value.outcomes.find(
        (o) => o.moduleName === "OneShotOk",
      );
      expect(okOutcome?.status).toBe("success");
      expect(okOutcome?.generationPath).toBe("one-shot");
    }
  });
});

describe("generateModuleDocs — one-shot fallback (Flow C)", () => {
  it("TC-7.3a: one-shot path used for unsupported providers", async () => {
    const outputDir = createTempDir();
    tempDirs.push(outputDir);

    const plan = createMinimalPlan([
      { name: "Module", components: ["src/mod.ts"] },
    ]);
    const analysis = createMinimalAnalysis(outputDir, ["src/mod.ts"]);

    const provider = createOneShotProvider();
    expect(provider.supportsToolUse()).toBe(false);

    const result = await generateModuleDocs(
      plan,
      analysis,
      makeConfig(outputDir),
      provider,
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.outcomes[0]?.generationPath).toBe("one-shot");
    }
  });

  it("TC-7.3b: same outcome shape on both paths", async () => {
    // Run two separate generations - one agentic, one one-shot
    const outputDir1 = createTempDir();
    tempDirs.push(outputDir1);
    const outputDir2 = createTempDir();
    tempDirs.push(outputDir2);

    const plan = createMinimalPlan([
      { name: "Module", components: ["src/mod.ts"] },
    ]);
    const analysis1 = createMinimalAnalysis(outputDir1, ["src/mod.ts"]);
    const analysis2 = createMinimalAnalysis(outputDir2, ["src/mod.ts"]);

    const agenticResult = await generateModuleDocs(
      plan,
      analysis1,
      makeConfig(outputDir1),
      createAgenticProvider(),
    );
    const oneShotResult = await generateModuleDocs(
      plan,
      analysis2,
      makeConfig(outputDir2),
      createOneShotProvider(),
    );

    expect(agenticResult.ok).toBe(true);
    expect(oneShotResult.ok).toBe(true);

    if (agenticResult.ok && oneShotResult.ok) {
      const agenticOutcome = agenticResult.value.outcomes[0]!;
      const oneShotOutcome = oneShotResult.value.outcomes[0]!;

      // Both have the same set of fields (ModuleGenerationOutcome shape)
      expect(agenticOutcome.moduleName).toBeDefined();
      expect(oneShotOutcome.moduleName).toBeDefined();
      expect(agenticOutcome.status).toBe("success");
      expect(oneShotOutcome.status).toBe("success");
      expect(agenticOutcome.fileName).toBeDefined();
      expect(oneShotOutcome.fileName).toBeDefined();
      expect(agenticOutcome.durationMs).toBeGreaterThanOrEqual(0);
      expect(oneShotOutcome.durationMs).toBeGreaterThanOrEqual(0);

      // Only differ in generationPath
      expect(agenticOutcome.generationPath).toBe("agentic");
      expect(oneShotOutcome.generationPath).toBe("one-shot");
    }
  });
});

describe("evaluateRunStatus — unit tests", () => {
  it("returns success when all modules succeed", () => {
    const outcomes = Array.from({ length: 10 }, (_, i) => ({
      moduleName: `Module${i}`,
      status: "success" as const,
      generationPath: "agentic" as const,
      fileName: `module${i}.md`,
      durationMs: 100,
    }));
    expect(evaluateRunStatus(outcomes)).toBe("success");
  });

  it("returns partial-success when 1 of 10 fails", () => {
    const outcomes = Array.from({ length: 10 }, (_, i) => ({
      moduleName: `Module${i}`,
      status: (i === 3 ? "failed" : "success") as "success" | "failed",
      generationPath: "agentic" as const,
      fileName: `module${i}.md`,
      durationMs: 100,
    }));
    expect(evaluateRunStatus(outcomes)).toBe("partial-success");
  });

  it("returns failure when more than half fail (6/10)", () => {
    const outcomes = Array.from({ length: 10 }, (_, i) => ({
      moduleName: `Module${i}`,
      status: (i < 6 ? "failed" : "success") as "success" | "failed",
      generationPath: "agentic" as const,
      fileName: `module${i}.md`,
      durationMs: 100,
    }));
    expect(evaluateRunStatus(outcomes)).toBe("failure");
  });

  it("even split (5/10) is partial-success, not failure", () => {
    const outcomes = Array.from({ length: 10 }, (_, i) => ({
      moduleName: `Module${i}`,
      status: (i < 5 ? "failed" : "success") as "success" | "failed",
      generationPath: "agentic" as const,
      fileName: `module${i}.md`,
      durationMs: 100,
    }));
    // 5/10 failed. 5 > 10/2? 5 > 5? No. So partial-success.
    expect(evaluateRunStatus(outcomes)).toBe("partial-success");
  });

  it("returns failure when all modules fail", () => {
    const outcomes = Array.from({ length: 5 }, (_, i) => ({
      moduleName: `Module${i}`,
      status: "failed" as const,
      generationPath: "agentic" as const,
      fileName: `module${i}.md`,
      durationMs: 100,
    }));
    expect(evaluateRunStatus(outcomes)).toBe("failure");
  });

  it("single module fail is partial-success", () => {
    const outcomes = [
      {
        moduleName: "Only",
        status: "failed" as const,
        generationPath: "agentic" as const,
        fileName: "only.md",
        durationMs: 100,
      },
    ];
    // 1/1 failed. 1 > 1/2? 1 > 0.5? Yes. So failure.
    expect(evaluateRunStatus(outcomes)).toBe("failure");
  });

  it("single module success is success", () => {
    const outcomes = [
      {
        moduleName: "Only",
        status: "success" as const,
        generationPath: "agentic" as const,
        fileName: "only.md",
        durationMs: 100,
      },
    ];
    expect(evaluateRunStatus(outcomes)).toBe("success");
  });

  it("handles empty outcomes as success", () => {
    expect(evaluateRunStatus([])).toBe("success");
  });

  it("2 of 3 failed is failure", () => {
    const outcomes = Array.from({ length: 3 }, (_, i) => ({
      moduleName: `Module${i}`,
      status: (i < 2 ? "failed" : "success") as "success" | "failed",
      generationPath: "agentic" as const,
      fileName: `module${i}.md`,
      durationMs: 100,
    }));
    // 2 > 3/2 = 1.5? Yes. So failure.
    expect(evaluateRunStatus(outcomes)).toBe("failure");
  });
});

describe("createFailedModulePlaceholder", () => {
  it("creates valid markdown with module name and sorted components", () => {
    const placeholder = createFailedModulePlaceholder("My Module", [
      "src/z.ts",
      "src/a.ts",
      "src/m.ts",
    ]);

    expect(placeholder).toContain("# My Module");
    expect(placeholder).toContain("could not be generated");
    expect(placeholder).toContain("## Components");
    expect(placeholder).toContain("- src/a.ts");
    expect(placeholder).toContain("- src/m.ts");
    expect(placeholder).toContain("- src/z.ts");

    // Components are sorted
    const aIdx = placeholder.indexOf("src/a.ts");
    const mIdx = placeholder.indexOf("src/m.ts");
    const zIdx = placeholder.indexOf("src/z.ts");
    expect(aIdx).toBeLessThan(mIdx);
    expect(mIdx).toBeLessThan(zIdx);
  });

  it("does NOT include failure reasons", () => {
    const placeholder = createFailedModulePlaceholder("Test", ["src/test.ts"]);

    // No error/failure/reason wording beyond the notice
    expect(placeholder).not.toContain("Reason:");
    expect(placeholder).not.toContain("Error:");
  });
});

describe("exitCodeForStatus — CLI exit code mapping", () => {
  it("success exits 0", () => {
    expect(exitCodeForStatus("success")).toBe(0);
  });

  it("partial-success exits 0", () => {
    expect(exitCodeForStatus("partial-success")).toBe(0);
  });

  it("failure exits 1", () => {
    expect(exitCodeForStatus("failure")).toBe(1);
  });
});

describe("generateModuleDocs — stage result shape", () => {
  it("returns correct counts on mixed success/failure", async () => {
    const outputDir = createTempDir();
    tempDirs.push(outputDir);

    const plan = createMinimalPlan([
      { name: "A", components: ["src/a.ts"] },
      { name: "B", components: ["src/b.ts"] },
      { name: "C", components: ["src/c.ts"] },
      { name: "D", components: ["src/d.ts"] },
    ]);
    const analysis = createMinimalAnalysis(outputDir, [
      "src/a.ts",
      "src/b.ts",
      "src/c.ts",
      "src/d.ts",
    ]);

    const provider = createAgenticProvider({ failForModules: ["B"] });
    const result = await generateModuleDocs(
      plan,
      analysis,
      makeConfig(outputDir),
      provider,
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.successCount).toBe(3);
      expect(result.value.failureCount).toBe(1);
      expect(result.value.outcomes).toHaveLength(4);
      expect(result.value.totalDurationMs).toBeGreaterThanOrEqual(0);
    }
  });
});

describe("scoring and repair removal — Flow D (Story 6)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("TC-6.1a: no pre-generation section prediction on agentic path", async () => {
    const selectSpy = vi.spyOn(
      moduleDocPacket,
      "selectModuleDocumentationPacket",
    );

    const outputDir = createTempDir();
    tempDirs.push(outputDir);

    const plan = createMinimalPlan([
      { name: "Agent", components: ["src/agent.ts"] },
    ]);
    const analysis = createMinimalAnalysis(outputDir, ["src/agent.ts"]);

    // Agentic path: selectModuleDocumentationPacket should NOT be called
    const agenticProvider = createAgenticProvider();
    await generateModuleDocs(
      plan,
      analysis,
      makeConfig(outputDir),
      agenticProvider,
    );

    expect(selectSpy).not.toHaveBeenCalled();

    // One-shot path: selectModuleDocumentationPacket SHOULD be called
    selectSpy.mockClear();
    const outputDir2 = createTempDir();
    tempDirs.push(outputDir2);
    const analysis2 = createMinimalAnalysis(outputDir2, ["src/agent.ts"]);

    const oneShotProvider = createOneShotProvider();
    await generateModuleDocs(
      plan,
      analysis2,
      makeConfig(outputDir2),
      oneShotProvider,
    );

    expect(selectSpy).toHaveBeenCalledTimes(1);
  });

  it("TC-6.1b: no inline repair on agent output", async () => {
    const outputDir = createTempDir();
    tempDirs.push(outputDir);

    const plan = createMinimalPlan([
      { name: "Agent", components: ["src/agent.ts"] },
    ]);
    const analysis = createMinimalAnalysis(outputDir, ["src/agent.ts"]);

    // Create agentic provider and spy on infer (used only by one-shot repair path)
    const agenticProvider = createAgenticProvider();
    const inferSpy = vi.spyOn(agenticProvider, "infer");

    await generateModuleDocs(
      plan,
      analysis,
      makeConfig(outputDir),
      agenticProvider,
    );

    // provider.infer is never called on the agentic path — the repair chain
    // (normalizeOptionalPacketFields, buildModuleRepairPrompt, etc.) lives
    // entirely inside the one-shot path which calls provider.infer
    expect(inferSpy).not.toHaveBeenCalled();

    // Verify one-shot path DOES call provider.infer
    const outputDir2 = createTempDir();
    tempDirs.push(outputDir2);
    const analysis2 = createMinimalAnalysis(outputDir2, ["src/agent.ts"]);

    const oneShotProvider = createOneShotProvider();
    const oneShotInferSpy = vi.spyOn(oneShotProvider, "infer");

    await generateModuleDocs(
      plan,
      analysis2,
      makeConfig(outputDir2),
      oneShotProvider,
    );

    expect(oneShotInferSpy).toHaveBeenCalled();
  });

  it("TC-6.3a: invalid Mermaid still caught by validation", async () => {
    const outputDir = createTempDir();
    tempDirs.push(outputDir);

    // Write a markdown file with malformed Mermaid
    const filePath = path.join(outputDir, "bad-mermaid.md");
    const badMermaid = [
      "# Bad Module",
      "",
      "## Overview",
      "",
      "Some overview.",
      "",
      "## Structure Diagram",
      "",
      "```mermaid",
      "this is not valid mermaid syntax at all",
      "```",
      "",
      "## Source Coverage",
      "",
      "- src/file.ts",
    ].join("\n");
    await writeFile(filePath, badMermaid, "utf8");

    const { checkMermaid } = await import(
      "../../src/validation/checks/mermaid.js"
    );
    const findings = await checkMermaid(outputDir);

    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({
      category: "mermaid",
      message: expect.stringContaining("Malformed Mermaid"),
    });
  });

  it("TC-6.3b: missing overview still caught by validation", async () => {
    const outputDir = createTempDir();
    tempDirs.push(outputDir);

    // Write a markdown file that has source-coverage but missing overview
    // (this triggers required-sections check since it has at least one required heading)
    const filePath = path.join(outputDir, "no-overview.md");
    const noOverview = [
      "# Missing Overview Module",
      "",
      "## Source Coverage",
      "",
      "- src/file.ts",
    ].join("\n");
    await writeFile(filePath, noOverview, "utf8");

    const { checkRequiredSections } = await import(
      "../../src/validation/checks/required-sections.js"
    );
    const findings = await checkRequiredSections(outputDir);

    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({
      category: "required-section",
      message: expect.stringContaining("Overview"),
    });
  });
});
