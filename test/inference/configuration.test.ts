import { describe, expect, it } from "vitest";

import {
  buildInferenceConfigurationFromCliOverrides,
  normalizeOptionalModelSelection,
  resolveInferenceConfiguration,
} from "../../src/inference/index.js";

describe("inference configuration helpers", () => {
  it("normalizes blank and placeholder model overrides to undefined", () => {
    expect(normalizeOptionalModelSelection("")).toBeUndefined();
    expect(normalizeOptionalModelSelection("   ")).toBeUndefined();
    expect(
      normalizeOptionalModelSelection("REPLACE_WITH_CLAUDE_MODEL_ID"),
    ).toBeUndefined();
  });

  it("keeps real model overrides after trimming", () => {
    expect(normalizeOptionalModelSelection(" opus ")).toBe("opus");
  });

  it("builds CLI inference config from shared overrides", () => {
    expect(
      buildInferenceConfigurationFromCliOverrides({
        apiKeyEnv: "ANTHROPIC_API_KEY",
        authMode: "env",
        model: " opus ",
        provider: "claude-sdk",
      }),
    ).toEqual({
      auth: { apiKeyEnvVar: "ANTHROPIC_API_KEY", mode: "env" },
      model: "opus",
      provider: "claude-sdk",
    });
  });

  it("preserves provider defaults when model override normalizes away", () => {
    expect(
      resolveInferenceConfiguration({
        auth: { mode: "oauth" },
        model: "REPLACE_WITH_CLAUDE_MODEL_ID",
        provider: "claude-cli",
      }),
    ).toEqual({
      auth: { mode: "oauth" },
      model: "sonnet[1m]",
      provider: "claude-cli",
    });
  });

  it("applies the shared Claude default model when no model override is provided", () => {
    expect(
      resolveInferenceConfiguration({
        auth: { mode: "oauth" },
        provider: "claude-sdk",
      }),
    ).toEqual({
      auth: { mode: "oauth" },
      model: "sonnet[1m]",
      provider: "claude-sdk",
    });
  });
});
