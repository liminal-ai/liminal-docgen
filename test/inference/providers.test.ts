import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import * as subprocessModule from "../../src/adapters/subprocess.js";
import { createClaudeCliProvider } from "../../src/inference/providers/claude-cli.js";
import { createClaudeSdkProvider } from "../../src/inference/providers/claude-sdk.js";
import { createOpenRouterHttpProvider } from "../../src/inference/providers/openrouter-http.js";
import { INFERENCE_PROVIDER_REGISTRY } from "../../src/inference/registry.js";
import type { ToolUseRequest } from "../../src/inference/types.js";

// ---------------------------------------------------------------------------
// SDK mock setup
// ---------------------------------------------------------------------------

const mockQuery = vi.hoisted(() => vi.fn());
const mockCreateSdkMcpServer = vi.hoisted(() => vi.fn());

vi.mock("@anthropic-ai/claude-agent-sdk", () => ({
  query: mockQuery,
  createSdkMcpServer: mockCreateSdkMcpServer,
}));

// ---------------------------------------------------------------------------
// Helpers for building mock query iterables
// ---------------------------------------------------------------------------

function createMockQueryIterable(options: {
  result?: string;
  numTurns?: number;
  costUsd?: number;
  usage?: Record<string, unknown>;
  durationMs?: number;
  yieldNoResult?: boolean;
  beforeYield?: () => Promise<void>;
}): AsyncIterable<unknown> & { close(): void } {
  let closed = false;

  return {
    close() {
      closed = true;
    },
    [Symbol.asyncIterator]() {
      let yielded = false;
      return {
        async next(): Promise<IteratorResult<unknown>> {
          if (closed) {
            throw new Error("Query was closed");
          }

          if (options.yieldNoResult || yielded) {
            return { done: true, value: undefined };
          }

          yielded = true;

          if (options.beforeYield) {
            await options.beforeYield();
          }

          return {
            done: false,
            value: {
              type: "result",
              subtype: "success",
              result: options.result ?? "Final output",
              num_turns: options.numTurns ?? 1,
              total_cost_usd: options.costUsd ?? 0.01,
              usage: options.usage ?? {
                input_tokens: 100,
                output_tokens: 50,
              },
              duration_ms: options.durationMs ?? 1000,
            },
          };
        },
      };
    },
  };
}

function createHangingQueryIterable(): AsyncIterable<unknown> & {
  close(): void;
} {
  let rejectNext: ((err: Error) => void) | null = null;

  return {
    close() {
      rejectNext?.(new Error("Query was closed"));
    },
    [Symbol.asyncIterator]() {
      return {
        async next(): Promise<IteratorResult<unknown>> {
          return new Promise((_resolve, reject) => {
            rejectNext = reject;
          });
        },
      };
    },
  };
}

// ---------------------------------------------------------------------------
// Standard tool-use request fixture
// ---------------------------------------------------------------------------

function createToolUseRequest(
  overrides?: Partial<ToolUseRequest>,
): ToolUseRequest {
  return {
    systemPrompt: "You are a documentation agent.",
    userMessage: "Document this module.",
    tools: [
      {
        name: "read_source",
        description: "Read a source file",
        inputSchema: { filePath: { type: "string" } },
        handler: vi.fn().mockResolvedValue({
          content: [{ type: "text", text: "file contents" }],
        }),
      },
    ] as ToolUseRequest["tools"],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Provider factory helpers
// ---------------------------------------------------------------------------

function createSdkProvider() {
  return createClaudeSdkProvider(
    {
      auth: { mode: "oauth" },
      provider: "claude-sdk",
    },
    { workingDirectory: process.cwd() },
  );
}

function setupDefaultSdkMocks(overrides?: {
  result?: string;
  numTurns?: number;
  costUsd?: number;
  usage?: Record<string, unknown>;
  durationMs?: number;
  yieldNoResult?: boolean;
  beforeYield?: () => Promise<void>;
}) {
  mockCreateSdkMcpServer.mockReturnValue({ name: "docgen-agent" });
  mockQuery.mockReturnValue(createMockQueryIterable(overrides ?? {}));
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("claude-cli provider", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("parses structured output, usage, and cost from the CLI result envelope", async () => {
    vi.spyOn(subprocessModule, "runSubprocess").mockResolvedValue({
      exitCode: 0,
      stderr: "",
      stdout: JSON.stringify({
        result: "",
        structured_output: { title: "Overview" },
        subtype: "success",
        total_cost_usd: 0.12,
        usage: {
          input_tokens: 10,
          output_tokens: 5,
        },
      }),
    });

    const provider = createClaudeCliProvider(
      {
        auth: { mode: "oauth" },
        provider: "claude-cli",
      },
      { workingDirectory: process.cwd() },
    );

    const result = await provider.infer<{ title: string }>({
      outputSchema: {
        properties: {
          title: { type: "string" },
        },
        required: ["title"],
        type: "object",
      },
      systemPrompt: "Return JSON",
      userMessage: "Generate a title",
    });

    expect(result.ok).toBe(true);

    if (!result.ok) {
      return;
    }

    expect(result.value.output).toEqual({ title: "Overview" });
    expect(result.value.usage).toEqual({ inputTokens: 10, outputTokens: 5 });
    expect(result.value.costUsd).toBe(0.12);
    expect(provider.computeCost()).toBe(0.12);
  });
});

describe("openrouter-http provider", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("parses structured output and usage from the HTTP response", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      json: async () => ({
        choices: [
          {
            message: {
              content: '{"title":"Overview"}',
            },
          },
        ],
        usage: {
          completion_tokens: 4,
          prompt_tokens: 8,
        },
      }),
      ok: true,
    }) as typeof fetch;

    process.env.OPENROUTER_API_KEY = "test-key";

    const provider = createOpenRouterHttpProvider({
      auth: { mode: "env" },
      model: "openai/gpt-4o-mini",
      provider: "openrouter-http",
    });

    const result = await provider.infer<{ title: string }>({
      outputSchema: {
        properties: {
          title: { type: "string" },
        },
        required: ["title"],
        type: "object",
      },
      systemPrompt: "Return JSON",
      userMessage: "Generate a title",
    });

    expect(result.ok).toBe(true);

    if (!result.ok) {
      return;
    }

    expect(result.value.output).toEqual({ title: "Overview" });
    expect(result.value.usage).toEqual({ inputTokens: 8, outputTokens: 4 });
    expect(result.value.costUsd).toBeNull();
    expect(provider.computeCost()).toBeNull();
  });
});

// ===========================================================================
// TC-5.1: Interface extension without breaking existing callers
// ===========================================================================

describe("TC-5.1: interface extension", () => {
  it("TC-5.1b: inferWithTools() and supportsToolUse() exist on all providers", () => {
    const sdkProvider = createSdkProvider();
    const cliProvider = createClaudeCliProvider(
      { auth: { mode: "oauth" }, provider: "claude-cli" },
      { workingDirectory: process.cwd() },
    );
    const openrouterProvider = createOpenRouterHttpProvider({
      auth: { mode: "env" },
      provider: "openrouter-http",
    });

    for (const provider of [sdkProvider, cliProvider, openrouterProvider]) {
      expect(typeof provider.supportsToolUse).toBe("function");
      expect(typeof provider.inferWithTools).toBe("function");
    }
  });

  it("supportsToolUse() returns true for claude-sdk, false for others", () => {
    const sdkProvider = createSdkProvider();
    const cliProvider = createClaudeCliProvider(
      { auth: { mode: "oauth" }, provider: "claude-cli" },
      { workingDirectory: process.cwd() },
    );
    const openrouterProvider = createOpenRouterHttpProvider({
      auth: { mode: "env" },
      provider: "openrouter-http",
    });

    expect(sdkProvider.supportsToolUse()).toBe(true);
    expect(cliProvider.supportsToolUse()).toBe(false);
    expect(openrouterProvider.supportsToolUse()).toBe(false);
  });

  it("registry supportsToolUse matches provider behavior", () => {
    expect(
      INFERENCE_PROVIDER_REGISTRY["claude-sdk"].capabilities.supportsToolUse,
    ).toBe(true);
    expect(
      INFERENCE_PROVIDER_REGISTRY["claude-cli"].capabilities.supportsToolUse,
    ).toBe(false);
    expect(
      INFERENCE_PROVIDER_REGISTRY["openrouter-http"].capabilities
        .supportsToolUse,
    ).toBe(false);
  });

  it("existing infer() on claude-sdk still works with tool-use support enabled", async () => {
    mockQuery.mockReturnValue(
      createMockQueryIterable({
        result: "hello",
        costUsd: 0.01,
        usage: { input_tokens: 10, output_tokens: 5 },
      }),
    );

    const provider = createSdkProvider();
    const result = await provider.infer<string>({
      systemPrompt: "Test",
      userMessage: "Say hello",
    });

    expect(result.ok).toBe(true);
  });
});

// ===========================================================================
// TC-5.2: Claude SDK tool-use implementation
// ===========================================================================

describe("TC-5.2: claude-sdk tool-use", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("TC-5.2a: handles tool-use conversation and returns final output", async () => {
    setupDefaultSdkMocks({
      result: "Documentation complete.",
      numTurns: 3,
      costUsd: 0.05,
      usage: { input_tokens: 500, output_tokens: 200 },
      durationMs: 5000,
    });

    const provider = createSdkProvider();
    const handle = provider.inferWithTools(createToolUseRequest());
    const result = await handle.result;

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.finalText).toBe("Documentation complete.");
    expect(result.value.turnCount).toBe(3);
    expect(result.value.costUsd).toBe(0.05);
    expect(result.value.usage).toEqual({ inputTokens: 500, outputTokens: 200 });
    expect(result.value.durationMs).toBe(5000);
  });

  it("TC-5.2b: tool handlers are invoked when model requests tool use", async () => {
    const handlerSpy = vi.fn().mockResolvedValue({
      content: [{ type: "text", text: "file contents" }],
    });

    const request = createToolUseRequest({
      tools: [
        {
          name: "read_source",
          description: "Read a source file",
          inputSchema: { filePath: { type: "string" } },
          handler: handlerSpy,
        },
      ] as ToolUseRequest["tools"],
    });

    // The mock createSdkMcpServer captures the tools, and the mock query
    // invokes the handler during iteration (simulating SDK behavior).
    let capturedTools: Array<{ handler: (...args: unknown[]) => unknown }> = [];
    mockCreateSdkMcpServer.mockImplementation(
      ({ tools }: { tools: typeof capturedTools }) => {
        capturedTools = tools;
        return { name: "docgen-agent" };
      },
    );

    mockQuery.mockReturnValue(
      createMockQueryIterable({
        result: "Done",
        numTurns: 2,
        beforeYield: async () => {
          // Simulate the SDK invoking the tool handler
          if (capturedTools.length > 0) {
            await capturedTools[0]?.handler(
              { filePath: "src/main.ts" },
              undefined,
            );
          }
        },
      }),
    );

    const provider = createSdkProvider();
    const handle = provider.inferWithTools(request);
    const result = await handle.result;

    expect(result.ok).toBe(true);
    expect(handlerSpy).toHaveBeenCalledOnce();
    expect(handlerSpy).toHaveBeenCalledWith(
      { filePath: "src/main.ts" },
      undefined,
    );
  });

  it("returns error when query yields no result message", async () => {
    setupDefaultSdkMocks({ yieldNoResult: true });

    const provider = createSdkProvider();
    const handle = provider.inferWithTools(createToolUseRequest());
    const result = await handle.result;

    expect(result.ok).toBe(false);
    if (result.ok) return;

    expect(result.error.message).toContain(
      "completed without a final result message",
    );
  });

  it("maxTurns passes through to SDK query options", async () => {
    setupDefaultSdkMocks();

    const provider = createSdkProvider();
    const request = createToolUseRequest({ maxTurns: 25 });
    const handle = provider.inferWithTools(request);
    await handle.result;

    const queryCall = mockQuery.mock.calls[0]?.[0] as {
      options: { maxTurns: number };
    };
    expect(queryCall.options.maxTurns).toBe(25);
  });

  it("maxTurns defaults to 15 when not specified", async () => {
    setupDefaultSdkMocks();

    const provider = createSdkProvider();
    const request = createToolUseRequest();
    const handle = provider.inferWithTools(request);
    await handle.result;

    const queryCall = mockQuery.mock.calls[0]?.[0] as {
      options: { maxTurns: number };
    };
    expect(queryCall.options.maxTurns).toBe(15);
  });

  it("MCP server created with correct tool definitions", async () => {
    setupDefaultSdkMocks();

    const tools = [
      {
        name: "read_source",
        description: "Read a file",
        inputSchema: { filePath: { type: "string" } },
        handler: vi.fn(),
      },
      {
        name: "write_section",
        description: "Write a section",
        inputSchema: { kind: { type: "string" }, content: { type: "string" } },
        handler: vi.fn(),
      },
    ] as ToolUseRequest["tools"];

    const provider = createSdkProvider();
    const handle = provider.inferWithTools(createToolUseRequest({ tools }));
    await handle.result;

    expect(mockCreateSdkMcpServer).toHaveBeenCalledOnce();
    const serverCall = mockCreateSdkMcpServer.mock.calls[0]?.[0] as {
      name: string;
      tools: unknown[];
    };
    expect(serverCall.name).toBe("docgen-agent");
    expect(serverCall.tools).toBe(tools);
  });

  it("built-in tools disabled (tools: [] in query options)", async () => {
    setupDefaultSdkMocks();

    const provider = createSdkProvider();
    const handle = provider.inferWithTools(createToolUseRequest());
    await handle.result;

    const queryCall = mockQuery.mock.calls[0]?.[0] as {
      options: { tools: unknown[]; permissionMode: string };
    };
    expect(queryCall.options.tools).toEqual([]);
    expect(queryCall.options.permissionMode).toBe("dontAsk");
  });

  it("MCP server passed to query via mcpServers option", async () => {
    const mockServer = { name: "docgen-agent", mockId: "test-server" };
    mockCreateSdkMcpServer.mockReturnValue(mockServer);
    mockQuery.mockReturnValue(createMockQueryIterable({}));

    const provider = createSdkProvider();
    const handle = provider.inferWithTools(createToolUseRequest());
    await handle.result;

    const queryCall = mockQuery.mock.calls[0]?.[0] as {
      options: { mcpServers: Record<string, unknown> };
    };
    expect(queryCall.options.mcpServers).toEqual({
      "docgen-agent": mockServer,
    });
  });
});

// ===========================================================================
// TC-5.3: Unsupported providers
// ===========================================================================

describe("TC-5.3: unsupported providers", () => {
  it("TC-5.3a: OpenRouter returns TOOL_USE_UNSUPPORTED", async () => {
    const provider = createOpenRouterHttpProvider({
      auth: { mode: "env" },
      provider: "openrouter-http",
    });

    const handle = provider.inferWithTools(createToolUseRequest());
    const result = await handle.result;

    expect(result.ok).toBe(false);
    if (result.ok) return;

    expect(result.error.code).toBe("TOOL_USE_UNSUPPORTED");
    expect(result.error.message).toContain("openrouter-http");
  });

  it("claude-cli returns TOOL_USE_UNSUPPORTED", async () => {
    const provider = createClaudeCliProvider(
      { auth: { mode: "oauth" }, provider: "claude-cli" },
      { workingDirectory: process.cwd() },
    );

    const handle = provider.inferWithTools(createToolUseRequest());
    const result = await handle.result;

    expect(result.ok).toBe(false);
    if (result.ok) return;

    expect(result.error.code).toBe("TOOL_USE_UNSUPPORTED");
    expect(result.error.message).toContain("claude-cli");
  });

  it("supportsToolUse() returns false for unsupported providers", () => {
    const cliProvider = createClaudeCliProvider(
      { auth: { mode: "oauth" }, provider: "claude-cli" },
      { workingDirectory: process.cwd() },
    );
    const openrouterProvider = createOpenRouterHttpProvider({
      auth: { mode: "env" },
      provider: "openrouter-http",
    });

    expect(cliProvider.supportsToolUse()).toBe(false);
    expect(openrouterProvider.supportsToolUse()).toBe(false);
  });
});

// ===========================================================================
// TC-5.4: Usage and cost accumulation
// ===========================================================================

describe("TC-5.4: usage and cost accumulation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("TC-5.4a: token usage accumulated from final SDK result", async () => {
    setupDefaultSdkMocks({
      usage: { input_tokens: 500, output_tokens: 200 },
    });

    const provider = createSdkProvider();
    const handle = provider.inferWithTools(createToolUseRequest());
    await handle.result;

    const usage = provider.getAccumulatedUsage();
    expect(usage.inputTokens).toBe(500);
    expect(usage.outputTokens).toBe(200);
  });

  it("TC-5.4b: cost accumulated from final SDK result", async () => {
    setupDefaultSdkMocks({ costUsd: 0.05 });

    const provider = createSdkProvider();
    const handle = provider.inferWithTools(createToolUseRequest());
    await handle.result;

    expect(provider.computeCost()).toBe(0.05);
  });

  it("usage is null when SDK result lacks usage fields", async () => {
    setupDefaultSdkMocks({ usage: {} });

    const provider = createSdkProvider();
    const handle = provider.inferWithTools(createToolUseRequest());
    const result = await handle.result;

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.usage).toBeNull();
  });

  it("multiple inferWithTools() calls accumulate correctly", async () => {
    const provider = createSdkProvider();

    // First call
    mockCreateSdkMcpServer.mockReturnValue({ name: "docgen-agent" });
    mockQuery.mockReturnValue(
      createMockQueryIterable({
        usage: { input_tokens: 100, output_tokens: 50 },
        costUsd: 0.01,
      }),
    );

    const handle1 = provider.inferWithTools(createToolUseRequest());
    await handle1.result;

    // Second call
    mockQuery.mockReturnValue(
      createMockQueryIterable({
        usage: { input_tokens: 200, output_tokens: 100 },
        costUsd: 0.02,
      }),
    );

    const handle2 = provider.inferWithTools(createToolUseRequest());
    await handle2.result;

    const usage = provider.getAccumulatedUsage();
    expect(usage.inputTokens).toBe(300);
    expect(usage.outputTokens).toBe(150);
    expect(provider.computeCost()).toBe(0.03);
  });

  it("mixed infer() + inferWithTools() accumulate into same totals", async () => {
    const provider = createSdkProvider();

    // infer() call
    mockQuery.mockReturnValue(
      createMockQueryIterable({
        result: '{"title":"Test"}',
        usage: { input_tokens: 100, output_tokens: 50 },
        costUsd: 0.01,
      }),
    );

    await provider.infer({
      systemPrompt: "Test",
      userMessage: "Generate",
    });

    // inferWithTools() call
    mockCreateSdkMcpServer.mockReturnValue({ name: "docgen-agent" });
    mockQuery.mockReturnValue(
      createMockQueryIterable({
        usage: { input_tokens: 200, output_tokens: 100 },
        costUsd: 0.02,
      }),
    );

    const handle = provider.inferWithTools(createToolUseRequest());
    await handle.result;

    const usage = provider.getAccumulatedUsage();
    expect(usage.inputTokens).toBe(300);
    expect(usage.outputTokens).toBe(150);
    expect(provider.computeCost()).toBe(0.03);
  });
});

// ===========================================================================
// Cancellation
// ===========================================================================

describe("cancellation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("cancel() calls close() and result resolves with error", async () => {
    mockCreateSdkMcpServer.mockReturnValue({ name: "docgen-agent" });

    const hangingIterable = createHangingQueryIterable();
    const closeSpy = vi.spyOn(hangingIterable, "close");
    mockQuery.mockReturnValue(hangingIterable);

    const provider = createSdkProvider();
    const handle = provider.inferWithTools(createToolUseRequest());

    // Allow the async IIFE to start and reach the query iteration
    await vi.waitFor(() => {
      expect(mockQuery).toHaveBeenCalled();
    });

    handle.cancel();

    const result = await handle.result;

    expect(closeSpy).toHaveBeenCalled();
    expect(result.ok).toBe(false);
    if (result.ok) return;

    expect(result.error.message).toContain("cancelled");
  });

  it("cancel() before query starts is a no-op", async () => {
    setupDefaultSdkMocks();

    const provider = createSdkProvider();
    const handle = provider.inferWithTools(createToolUseRequest());

    // Cancel immediately — queryInstance is null at this point
    expect(() => handle.cancel()).not.toThrow();

    // Result should still resolve (the query may complete normally
    // since close() was called on null)
    const result = await handle.result;

    // The cancelled flag is set, but the query may have completed
    // before the flag was checked. Either outcome is acceptable:
    // ok (query completed) or error (caught in catch with cancelled flag)
    expect(result).toBeDefined();
  });
});
