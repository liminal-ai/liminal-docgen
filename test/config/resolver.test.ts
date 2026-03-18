import { resolveConfiguration } from "../../src/config/resolver.js";
import type { ResolvedConfiguration } from "../../src/types/index.js";
import { CONFIG } from "../helpers/fixtures.js";

const expectResolved = (
  result: Awaited<ReturnType<typeof resolveConfiguration>>,
): ResolvedConfiguration => {
  expect(result.ok).toBe(true);

  if (!result.ok) {
    throw new Error(
      `Expected configuration resolution to succeed: ${result.error.message}`,
    );
  }

  return result.value;
};

describe("resolveConfiguration", () => {
  it("TC-5.1a: defaults to docs/wiki output path when nothing configured", async () => {
    const value = expectResolved(
      await resolveConfiguration({ repoPath: CONFIG.noConfig }),
    );

    expect(value.outputPath).toBe("docs/wiki");
  });

  it("TC-5.1b: applies default exclude patterns when none configured", async () => {
    const value = expectResolved(
      await resolveConfiguration({ repoPath: CONFIG.noConfig }),
    );

    expect(value.excludePatterns).toEqual(
      expect.arrayContaining([
        "**/node_modules/**",
        "**/.git/**",
        "**/dist/**",
        "**/build/**",
      ]),
    );
  });

  it("TC-5.2a: caller outputPath overrides default", async () => {
    const value = expectResolved(
      await resolveConfiguration({
        outputPath: "docs/api-docs",
        repoPath: CONFIG.noConfig,
      }),
    );

    expect(value.outputPath).toBe("docs/api-docs");
  });

  it("TC-5.2b: caller outputPath overrides config file", async () => {
    const value = expectResolved(
      await resolveConfiguration({
        outputPath: "docs/api-docs",
        repoPath: CONFIG.validConfig,
      }),
    );

    expect(value.outputPath).toBe("docs/api-docs");
  });

  it("TC-5.2c: partial override preserves unset fields from config file", async () => {
    const value = expectResolved(
      await resolveConfiguration({
        outputPath: "docs/custom",
        repoPath: CONFIG.validConfig,
      }),
    );

    expect(value.outputPath).toBe("docs/custom");
    expect(value.excludePatterns).toEqual(["**/dist/**", "**/*.snap"]);
  });

  it("TC-5.3a: config file value used when caller doesn't set field", async () => {
    const value = expectResolved(
      await resolveConfiguration({ repoPath: CONFIG.validConfig }),
    );

    expect(value.outputPath).toBe("docs/generated");
  });

  it("TC-5.3b: missing config file uses defaults without error", async () => {
    const result = await resolveConfiguration({ repoPath: CONFIG.noConfig });

    expect(result.ok).toBe(true);

    if (!result.ok) {
      return;
    }

    expect(result.value.outputPath).toBe("docs/wiki");
    expect(result.value.excludePatterns).toEqual(
      expect.arrayContaining(["**/node_modules/**", "**/.git/**"]),
    );
  });

  it("TC-5.4a: empty output path produces CONFIGURATION_ERROR", async () => {
    const result = await resolveConfiguration({
      outputPath: "",
      repoPath: CONFIG.noConfig,
    });

    expect(result.ok).toBe(false);

    if (result.ok) {
      return;
    }

    expect(result.error.code).toBe("CONFIGURATION_ERROR");
    expect(result.error.details).toMatchObject({
      field: "outputPath",
    });
  });

  it("TC-5.4b: malformed glob produces CONFIGURATION_ERROR", async () => {
    const result = await resolveConfiguration({
      includePatterns: ["[invalid"],
      repoPath: CONFIG.noConfig,
    });

    expect(result.ok).toBe(false);

    if (result.ok) {
      return;
    }

    expect(result.error.code).toBe("CONFIGURATION_ERROR");
    expect(result.error.details).toMatchObject({
      field: "includePatterns[0]",
      value: "[invalid",
    });
  });

  it("TC-5.5a: resolved config has all fields populated", async () => {
    const value = expectResolved(
      await resolveConfiguration({
        focusDirs: ["src/core"],
        includePatterns: ["src/**"],
        repoPath: CONFIG.validConfig,
      }),
    );

    expect(value).toEqual({
      excludePatterns: ["**/dist/**", "**/*.snap"],
      focusDirs: ["src/core"],
      includePatterns: ["src/**"],
      outputPath: "docs/generated",
    });
    expect(Object.values(value)).not.toContain(undefined);
  });

  it("malformed JSON in config file returns CONFIGURATION_ERROR", async () => {
    const result = await resolveConfiguration({
      repoPath: CONFIG.invalidConfig,
    });

    expect(result.ok).toBe(false);

    if (result.ok) {
      return;
    }

    expect(result.error.code).toBe("CONFIGURATION_ERROR");
    expect(result.error.details).toMatchObject({
      field: "configFile",
      path: expect.stringContaining(".liminal-docgen.json"),
    });
  });

  it("unknown fields in config file are silently ignored", async () => {
    const value = expectResolved(
      await resolveConfiguration({ repoPath: CONFIG.extraFieldsConfig }),
    );

    expect(value).toEqual({
      excludePatterns: ["**/coverage/**"],
      focusDirs: [],
      includePatterns: [],
      outputPath: "docs/generated",
    });
  });
});
