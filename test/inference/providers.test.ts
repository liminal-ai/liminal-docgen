import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import * as subprocessModule from "../../src/adapters/subprocess.js";
import { createClaudeCliProvider } from "../../src/inference/providers/claude-cli.js";
import { createOpenRouterHttpProvider } from "../../src/inference/providers/openrouter-http.js";

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
