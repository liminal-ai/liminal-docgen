import { describe, expect, it, vi } from "vitest";
import {
  createInferenceProvider,
  validateInferenceCompatibility,
} from "../../src/inference/factory.js";
import * as claudeSdkProviderModule from "../../src/inference/providers/claude-sdk.js";
import { getProviderDefinition } from "../../src/inference/registry.js";

describe("inference provider registry and validation", () => {
  it("exposes capability metadata for each provider", () => {
    expect(getProviderDefinition("claude-sdk").capabilities.authModes).toEqual([
      "env",
      "api-key",
      "oauth",
    ]);
    expect(
      getProviderDefinition("openrouter-http").capabilities.authModes,
    ).toEqual(["env", "api-key"]);
    expect(
      getProviderDefinition("claude-cli").capabilities.supportsStructuredOutput,
    ).toBe(true);
  });

  it("accepts valid provider/auth combinations", () => {
    expect(
      validateInferenceCompatibility({
        auth: { mode: "oauth" },
        provider: "claude-cli",
      }),
    ).toEqual({ ok: true, value: undefined });
    expect(
      validateInferenceCompatibility({
        auth: { mode: "env" },
        provider: "openrouter-http",
      }),
    ).toEqual({ ok: true, value: undefined });
  });

  it("rejects invalid provider/auth combinations", () => {
    const result = validateInferenceCompatibility({
      auth: { mode: "oauth" },
      provider: "openrouter-http",
    });

    expect(result.ok).toBe(false);

    if (result.ok) {
      return;
    }

    expect(result.error.code).toBe("CONFIGURATION_ERROR");
    expect(result.error.message).toContain("not supported");
  });

  it("rejects claude-sdk factory creation when the optional SDK package is unavailable", () => {
    vi.spyOn(
      claudeSdkProviderModule,
      "isClaudeAgentSdkAvailable",
    ).mockReturnValue(false);

    const result = createInferenceProvider(
      {
        auth: { mode: "oauth" },
        provider: "claude-sdk",
      },
      { workingDirectory: process.cwd() },
    );

    expect(result.ok).toBe(false);

    if (result.ok) {
      return;
    }

    expect(result.error.code).toBe("DEPENDENCY_MISSING");
  });
});
