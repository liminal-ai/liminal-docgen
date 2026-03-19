import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { ObservationCollector } from "../../src/agent/observation-collector.js";
import { runAgentForModule } from "../../src/agent/runtime.js";
import type { AgentRuntimeConfig } from "../../src/agent/types.js";
import { DEFAULT_AGENT_CONFIG } from "../../src/agent/types.js";
import type {
  InferenceProvider,
  ToolUseConversationResult,
  ToolUseHandle,
  ToolUseRequest,
} from "../../src/inference/types.js";
import { ok } from "../../src/types/common.js";
import {
  createMockAgentModuleContext,
  createTypeOnlyModuleContext,
} from "../fixtures/agent-fixtures.js";
import { cleanupTempDir, createTempDir } from "../helpers/temp.js";

const tempDirs: string[] = [];

afterEach(async () => {
  for (const dir of tempDirs) {
    await cleanupTempDir(dir);
  }
  tempDirs.length = 0;
});

/** Tool call script entry: name + args */
interface MockToolCall {
  name: string;
  input: Record<string, unknown>;
}

/**
 * Creates a mock provider that simulates a tool-use conversation.
 * When inferWithTools is called, the mock invokes the tool handlers
 * embedded in the SdkMcpToolDefinition[] for each scripted tool call,
 * then resolves with a ToolUseConversationResult.
 */
function createMockToolUseProvider(
  toolCalls: MockToolCall[],
  options?: {
    delayMs?: number;
    failResult?: boolean;
    cancelledResult?: boolean;
  },
): InferenceProvider {
  return {
    infer: () =>
      Promise.resolve(ok({ output: {} as never, usage: null, costUsd: null })),
    getAccumulatedUsage: () => ({ inputTokens: 0, outputTokens: 0 }),
    computeCost: () => null,
    supportsToolUse: () => true,
    inferWithTools(request: ToolUseRequest): ToolUseHandle {
      let cancelled = false;

      const resultPromise = (async () => {
        if (options?.delayMs) {
          await new Promise((resolve) => setTimeout(resolve, options.delayMs));
        }

        if (cancelled || options?.cancelledResult) {
          return {
            ok: false as const,
            error: {
              code: "AGENT_ERROR" as const,
              message: "Tool-use query was cancelled",
              details: { cancelled: true },
            },
          };
        }

        if (options?.failResult) {
          return {
            ok: false as const,
            error: {
              code: "AGENT_ERROR" as const,
              message: "Agent conversation failed",
            },
          };
        }

        // Execute the scripted tool calls by invoking the handlers
        // embedded in the tool definitions (simulating what the SDK does)
        const toolMap = new Map(request.tools.map((t) => [t.name, t.handler]));

        for (const call of toolCalls) {
          const handler = toolMap.get(call.name);
          if (handler) {
            await handler(call.input, undefined);
          }
        }

        const result: ToolUseConversationResult = {
          finalText: "Documentation generated.",
          turnCount: toolCalls.length + 1,
          durationMs: 1000,
          usage: { inputTokens: 500, outputTokens: 200 },
          costUsd: 0.01,
        };

        return ok(result);
      })();

      return {
        result: resultPromise,
        cancel: () => {
          cancelled = true;
        },
      };
    },
  };
}

async function setupRepoWithFiles(
  repoRoot: string,
  files: Record<string, string>,
): Promise<void> {
  for (const [filePath, content] of Object.entries(files)) {
    const fullPath = path.join(repoRoot, filePath);
    await mkdir(path.dirname(fullPath), { recursive: true });
    await writeFile(fullPath, content, "utf8");
  }
}

describe("runAgentForModule", () => {
  it("agent produces structure diagram for module with class hierarchy", async () => {
    const repoRoot = createTempDir();
    tempDirs.push(repoRoot);
    await setupRepoWithFiles(repoRoot, {
      "src/services/user-service.ts": "export class UserService {}",
    });

    const provider = createMockToolUseProvider([
      {
        name: "read_source",
        input: { filePath: "src/services/user-service.ts" },
      },
      {
        name: "write_section",
        input: {
          section: "overview",
          content: "Manages user operations.",
        },
      },
      {
        name: "write_section",
        input: {
          section: "structure-diagram",
          content:
            "```mermaid\nclassDiagram\n  class UserService {\n    +createUser()\n  }\n```",
        },
      },
      {
        name: "write_section",
        input: {
          section: "source-coverage",
          content:
            "- src/services/user-service.ts\n- src/repositories/user-repository.ts\n- src/models/user.ts",
        },
      },
    ]);

    const config: AgentRuntimeConfig = { ...DEFAULT_AGENT_CONFIG, repoRoot };
    const collector = new ObservationCollector("test-run");
    const context = createMockAgentModuleContext();

    const result = await runAgentForModule(
      context,
      provider,
      config,
      collector,
    );

    expect(result.status).toBe("success");
    expect(result.sections["structure-diagram"]).toContain("classDiagram");
  });

  it("agent omits sequence diagram for type-only module", async () => {
    const repoRoot = createTempDir();
    tempDirs.push(repoRoot);

    const provider = createMockToolUseProvider([
      {
        name: "write_section",
        input: { section: "overview", content: "Type definitions." },
      },
      {
        name: "write_section",
        input: {
          section: "entity-table",
          content:
            "| Name | Kind | Role |\n| --- | --- | --- |\n| Result | type | Core result type |",
        },
      },
      {
        name: "write_section",
        input: {
          section: "source-coverage",
          content: "- src/types/common.ts\n- src/types/api.ts",
        },
      },
    ]);

    const config: AgentRuntimeConfig = { ...DEFAULT_AGENT_CONFIG, repoRoot };
    const collector = new ObservationCollector("test-run");
    const context = createTypeOnlyModuleContext();

    const result = await runAgentForModule(
      context,
      provider,
      config,
      collector,
    );

    expect(result.status).toBe("success");
    expect(result.sections["sequence-diagram"]).toBeUndefined();
  });

  it("agent includes sequence diagram for orchestration module", async () => {
    const repoRoot = createTempDir();
    tempDirs.push(repoRoot);

    const provider = createMockToolUseProvider([
      {
        name: "write_section",
        input: { section: "overview", content: "Orchestrates user flows." },
      },
      {
        name: "write_section",
        input: {
          section: "sequence-diagram",
          content: "sequenceDiagram\n  A->>B: process",
        },
      },
      {
        name: "write_section",
        input: {
          section: "source-coverage",
          content: "- src/services/user-service.ts",
        },
      },
    ]);

    const config: AgentRuntimeConfig = { ...DEFAULT_AGENT_CONFIG, repoRoot };
    const collector = new ObservationCollector("test-run");

    const result = await runAgentForModule(
      createMockAgentModuleContext(),
      provider,
      config,
      collector,
    );

    expect(result.status).toBe("success");
    expect(result.sections["sequence-diagram"]).toContain("sequenceDiagram");
  });

  it("run succeeds regardless of observation count", async () => {
    const repoRoot = createTempDir();
    tempDirs.push(repoRoot);

    // Generate 20 observations + required sections
    const toolCalls: MockToolCall[] = [];

    for (let i = 0; i < 20; i++) {
      toolCalls.push({
        name: "report_observation",
        input: {
          category: "classification-gap",
          subject: `src/file${i}.ts`,
          observation: `Observation ${i}`,
        },
      });
    }

    toolCalls.push(
      {
        name: "write_section",
        input: { section: "overview", content: "Overview" },
      },
      {
        name: "write_section",
        input: { section: "source-coverage", content: "- src/file.ts" },
      },
    );

    const provider = createMockToolUseProvider(toolCalls);
    const config: AgentRuntimeConfig = { ...DEFAULT_AGENT_CONFIG, repoRoot };
    const collector = new ObservationCollector("test-run");

    const result = await runAgentForModule(
      createMockAgentModuleContext(),
      provider,
      config,
      collector,
    );

    expect(result.status).toBe("success");
    expect(result.observationCount).toBe(20);
  });

  it("agent terminates after time budget exceeded", async () => {
    const repoRoot = createTempDir();
    tempDirs.push(repoRoot);

    const provider = createMockToolUseProvider([], { delayMs: 500 });
    const config: AgentRuntimeConfig = {
      ...DEFAULT_AGENT_CONFIG,
      repoRoot,
      timeoutMs: 50,
    };
    const collector = new ObservationCollector("test-run");

    const result = await runAgentForModule(
      createMockAgentModuleContext(),
      provider,
      config,
      collector,
    );

    expect(result.status).toBe("failed");
    expect(result.failureReason).toContain("time budget");
  });

  it("timeout cleanup clears timer", async () => {
    const repoRoot = createTempDir();
    tempDirs.push(repoRoot);

    const provider = createMockToolUseProvider([], { delayMs: 200 });
    const config: AgentRuntimeConfig = {
      ...DEFAULT_AGENT_CONFIG,
      repoRoot,
      timeoutMs: 50,
    };
    const collector = new ObservationCollector("test-run");

    // This should not leave pending timers after resolution
    const result = await runAgentForModule(
      createMockAgentModuleContext(),
      provider,
      config,
      collector,
    );

    expect(result.status).toBe("failed");
    // The fact that we get here without hanging means cleanup worked
  });

  it("fails when required sections are missing", async () => {
    const repoRoot = createTempDir();
    tempDirs.push(repoRoot);

    const provider = createMockToolUseProvider([
      {
        name: "write_section",
        input: { section: "overview", content: "Overview only" },
      },
      // Missing source-coverage
    ]);

    const config: AgentRuntimeConfig = { ...DEFAULT_AGENT_CONFIG, repoRoot };
    const collector = new ObservationCollector("test-run");

    const result = await runAgentForModule(
      createMockAgentModuleContext(),
      provider,
      config,
      collector,
    );

    expect(result.status).toBe("failed");
    expect(result.failureReason).toContain("source-coverage");
  });

  it("handles conversation failure gracefully", async () => {
    const repoRoot = createTempDir();
    tempDirs.push(repoRoot);

    const provider = createMockToolUseProvider([], { failResult: true });
    const config: AgentRuntimeConfig = { ...DEFAULT_AGENT_CONFIG, repoRoot };
    const collector = new ObservationCollector("test-run");

    const result = await runAgentForModule(
      createMockAgentModuleContext(),
      provider,
      config,
      collector,
    );

    expect(result.status).toBe("failed");
    expect(result.failureReason).toContain("Agent conversation failed");
  });

  it("tracks tool call count", async () => {
    const repoRoot = createTempDir();
    tempDirs.push(repoRoot);

    const provider = createMockToolUseProvider([
      { name: "read_source", input: { filePath: "src/test.ts" } },
      {
        name: "write_section",
        input: { section: "overview", content: "Overview" },
      },
      {
        name: "write_section",
        input: { section: "source-coverage", content: "- src/test.ts" },
      },
    ]);

    const config: AgentRuntimeConfig = { ...DEFAULT_AGENT_CONFIG, repoRoot };
    const collector = new ObservationCollector("test-run");

    const result = await runAgentForModule(
      createMockAgentModuleContext(),
      provider,
      config,
      collector,
    );

    expect(result.status).toBe("success");
    expect(result.toolCallCount).toBe(3);
    expect(result.turnCount).toBe(4); // toolCalls.length + 1
  });
});
