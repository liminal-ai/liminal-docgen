import { cpSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { validateDocumentation } from "../../src/index.js";
import type {
  GeneratedDocumentationMetadata,
  ValidationFinding,
  ValidationResult,
} from "../../src/types/index.js";
import { DOCS_OUTPUT } from "../helpers/fixtures.js";
import { cleanupTempDir, createTempDir } from "../helpers/temp.js";

const buildMetadata = (
  overrides: Partial<GeneratedDocumentationMetadata> = {},
): GeneratedDocumentationMetadata => ({
  commitHash: "abcdefabcdefabcdefabcdefabcdefabcdefabcd",
  componentCount: 2,
  filesGenerated: ["overview.md", "module-a.md", "module-b.md"],
  generatedAt: "2026-03-15T12:00:00.000Z",
  mode: "full",
  outputPath: "docs/wiki",
  ...overrides,
});

const expectValidation = (
  result: Awaited<ReturnType<typeof validateDocumentation>>,
): ValidationResult => {
  expect(result.ok).toBe(true);

  if (!result.ok) {
    throw new Error(
      `Expected validation to succeed: ${result.error.code} ${result.error.message}`,
    );
  }

  return result.value;
};

const findByCategory = (
  result: ValidationResult,
  category: ValidationFinding["category"],
): ValidationFinding[] =>
  result.findings.filter((finding) => finding.category === category);

describe("validation", () => {
  it("TC-4.1a: valid output directory returns pass", async () => {
    const value = expectValidation(
      await validateDocumentation({ outputPath: DOCS_OUTPUT.valid }),
    );

    expect(value).toEqual({
      errorCount: 0,
      findings: [],
      status: "pass",
      warningCount: 0,
    });
  });

  it("TC-4.1b: nonexistent directory returns fail", async () => {
    const outputPath = path.join(createTempDir(), "missing-output");

    try {
      const value = expectValidation(
        await validateDocumentation({ outputPath }),
      );

      expect(value.status).toBe("fail");
      expect(value.errorCount).toBe(1);
      expect(value.warningCount).toBe(0);
      expect(value.findings).toContainEqual({
        category: "missing-file",
        filePath: outputPath,
        message: `Output directory does not exist: ${outputPath}`,
        severity: "error",
      });
    } finally {
      cleanupTempDir(path.dirname(outputPath));
    }
  });

  it("relative output paths resolve the same as absolute paths", async () => {
    const workspacePath = createTempDir();
    const outputPath = path.join(workspacePath, "docs/wiki");
    const previousCwd = process.cwd();

    try {
      cpSync(DOCS_OUTPUT.valid, outputPath, { recursive: true });
      process.chdir(workspacePath);

      const value = expectValidation(
        await validateDocumentation({ outputPath: "docs/wiki" }),
      );

      expect(value).toEqual({
        errorCount: 0,
        findings: [],
        status: "pass",
        warningCount: 0,
      });
    } finally {
      process.chdir(previousCwd);
      cleanupTempDir(workspacePath);
    }
  });

  it("TC-4.2a: missing overview.md reported", async () => {
    const value = expectValidation(
      await validateDocumentation({ outputPath: DOCS_OUTPUT.missingOverview }),
    );

    expect(value.findings).toContainEqual({
      category: "missing-file",
      filePath: path.join(DOCS_OUTPUT.missingOverview, "overview.md"),
      message: `Missing required file: ${path.join(DOCS_OUTPUT.missingOverview, "overview.md")}`,
      severity: "error",
    });
  });

  it("TC-4.2b: missing module-tree.json reported", async () => {
    const value = expectValidation(
      await validateDocumentation({ outputPath: DOCS_OUTPUT.missingTree }),
    );

    expect(value.findings).toContainEqual({
      category: "missing-file",
      filePath: path.join(DOCS_OUTPUT.missingTree, "module-tree.json"),
      message: `Missing required file: ${path.join(DOCS_OUTPUT.missingTree, "module-tree.json")}`,
      severity: "error",
    });
  });

  it("TC-4.2c: missing .doc-meta.json reported", async () => {
    const value = expectValidation(
      await validateDocumentation({ outputPath: DOCS_OUTPUT.missingMeta }),
    );

    expect(value.findings).toContainEqual({
      category: "missing-file",
      filePath: path.join(DOCS_OUTPUT.missingMeta, ".doc-meta.json"),
      message: `Missing required file: ${path.join(DOCS_OUTPUT.missingMeta, ".doc-meta.json")}`,
      severity: "error",
    });
  });

  it("TC-4.2d: missing .module-plan.json reported", async () => {
    const value = expectValidation(
      await validateDocumentation({
        outputPath: DOCS_OUTPUT.missingModulePlan,
      }),
    );

    expect(value.findings).toContainEqual({
      category: "missing-file",
      filePath: path.join(DOCS_OUTPUT.missingModulePlan, ".module-plan.json"),
      message: `Missing required file: ${path.join(DOCS_OUTPUT.missingModulePlan, ".module-plan.json")}`,
      severity: "error",
    });
  });

  it("TC-4.3a: valid internal links produce no findings", async () => {
    const value = expectValidation(
      await validateDocumentation({ outputPath: DOCS_OUTPUT.valid }),
    );

    expect(findByCategory(value, "broken-link")).toEqual([]);
  });

  it("TC-4.3b: broken internal link reported as error", async () => {
    const value = expectValidation(
      await validateDocumentation({ outputPath: DOCS_OUTPUT.brokenLinks }),
    );

    expect(findByCategory(value, "broken-link")).toContainEqual({
      category: "broken-link",
      filePath: path.join(DOCS_OUTPUT.brokenLinks, "auth.md"),
      message: `Broken internal link in ${path.join(DOCS_OUTPUT.brokenLinks, "auth.md")}: ./session.md`,
      severity: "error",
      target: "./session.md",
    });
  });

  it("TC-4.4a: consistent tree produces no findings", async () => {
    const value = expectValidation(
      await validateDocumentation({ outputPath: DOCS_OUTPUT.valid }),
    );

    expect(value.status).toBe("pass");
    expect(findByCategory(value, "module-tree")).toEqual([]);
  });

  it("TC-4.4b: module in tree with no page reported", async () => {
    const value = expectValidation(
      await validateDocumentation({ outputPath: DOCS_OUTPUT.inconsistentTree }),
    );

    expect(findByCategory(value, "module-tree")).toContainEqual({
      category: "module-tree",
      filePath: path.join(DOCS_OUTPUT.inconsistentTree, "d.md"),
      message: `Module tree references a page that does not exist: d.md`,
      severity: "error",
    });
  });

  it("TC-4.4c: orphan module page reported as warning", async () => {
    const value = expectValidation(
      await validateDocumentation({ outputPath: DOCS_OUTPUT.inconsistentTree }),
    );

    expect(findByCategory(value, "module-tree")).toContainEqual({
      category: "module-tree",
      filePath: path.join(DOCS_OUTPUT.inconsistentTree, "e.md"),
      message: "Markdown page is not referenced by module-tree.json: e.md",
      severity: "warning",
    });
  });

  it("TC-4.4d: overview.md excluded from orphan check", async () => {
    const value = expectValidation(
      await validateDocumentation({ outputPath: DOCS_OUTPUT.valid }),
    );

    expect(findByCategory(value, "module-tree")).not.toContainEqual(
      expect.objectContaining({
        filePath: path.join(DOCS_OUTPUT.valid, "overview.md"),
        severity: "warning",
      }),
    );
  });

  it("TC-4.5a: valid Mermaid block produces no findings", async () => {
    const value = expectValidation(
      await validateDocumentation({ outputPath: DOCS_OUTPUT.valid }),
    );

    expect(findByCategory(value, "mermaid")).toEqual([]);
  });

  it("TC-4.5b: malformed Mermaid block reported as warning", async () => {
    const value = expectValidation(
      await validateDocumentation({ outputPath: DOCS_OUTPUT.badMermaid }),
    );

    expect(findByCategory(value, "mermaid")).toEqual([
      {
        category: "mermaid",
        filePath: path.join(DOCS_OUTPUT.badMermaid, "broken-one.md"),
        message: `Malformed Mermaid block in ${path.join(DOCS_OUTPUT.badMermaid, "broken-one.md")}: missing Mermaid diagram type declaration`,
        severity: "warning",
      },
      {
        category: "mermaid",
        filePath: path.join(DOCS_OUTPUT.badMermaid, "broken-two.md"),
        message: `Malformed Mermaid block in ${path.join(DOCS_OUTPUT.badMermaid, "broken-two.md")}: unbalanced Mermaid delimiters`,
        severity: "warning",
      },
    ]);
  });

  it("TC-4.6a: all checks pass -> pass summary", async () => {
    const value = expectValidation(
      await validateDocumentation({ outputPath: DOCS_OUTPUT.valid }),
    );

    expect(value.status).toBe("pass");
    expect(value.errorCount).toBe(0);
    expect(value.warningCount).toBe(0);
    expect(value.findings).toEqual([]);
  });

  it("TC-4.6b: warnings only -> warn summary", async () => {
    const value = expectValidation(
      await validateDocumentation({ outputPath: DOCS_OUTPUT.warningsOnly }),
    );

    expect(value.status).toBe("warn");
    expect(value.errorCount).toBe(0);
    expect(value.warningCount).toBe(2);
    expect(findByCategory(value, "module-tree")).toHaveLength(1);
    expect(findByCategory(value, "mermaid")).toHaveLength(1);
  });

  it("TC-4.6c: errors present -> fail summary", async () => {
    const value = expectValidation(
      await validateDocumentation({ outputPath: DOCS_OUTPUT.brokenLinks }),
    );

    expect(value.status).toBe("fail");
    expect(value.errorCount).toBeGreaterThan(0);
    expect(value.warningCount).toBe(0);
    expect(findByCategory(value, "broken-link")).toHaveLength(1);
  });

  it("TC-4.6d: invalid metadata JSON reported as metadata error", async () => {
    const value = expectValidation(
      await validateDocumentation({ outputPath: DOCS_OUTPUT.corruptMetadata }),
    );

    expect(findByCategory(value, "metadata")).toContainEqual({
      category: "metadata",
      filePath: path.join(DOCS_OUTPUT.corruptMetadata, ".doc-meta.json"),
      message: `Invalid JSON in metadata file at ${path.join(DOCS_OUTPUT.corruptMetadata, ".doc-meta.json")}`,
      severity: "error",
    });
    expect(value.status).toBe("fail");
  });

  it("TC-4.6e: metadata missing required fields reported as metadata error", async () => {
    const value = expectValidation(
      await validateDocumentation({
        outputPath: DOCS_OUTPUT.missingMetadataFields,
      }),
    );

    expect(findByCategory(value, "metadata")).toContainEqual({
      category: "metadata",
      filePath: path.join(DOCS_OUTPUT.missingMetadataFields, ".doc-meta.json"),
      message: `Invalid metadata file at ${path.join(DOCS_OUTPUT.missingMetadataFields, ".doc-meta.json")}: commitHash: Invalid input: expected string, received undefined`,
      severity: "error",
    });
    expect(value.status).toBe("fail");
  });

  it("output directory with no markdown files reports only missing required files", async () => {
    const outputPath = createTempDir();

    try {
      const value = expectValidation(
        await validateDocumentation({ outputPath }),
      );

      expect(value.status).toBe("fail");
      expect(value.errorCount).toBe(4);
      expect(value.warningCount).toBe(0);
      expect(findByCategory(value, "missing-file")).toEqual([
        {
          category: "missing-file",
          filePath: path.join(outputPath, "overview.md"),
          message: `Missing required file: ${path.join(outputPath, "overview.md")}`,
          severity: "error",
        },
        {
          category: "missing-file",
          filePath: path.join(outputPath, "module-tree.json"),
          message: `Missing required file: ${path.join(outputPath, "module-tree.json")}`,
          severity: "error",
        },
        {
          category: "missing-file",
          filePath: path.join(outputPath, ".doc-meta.json"),
          message: `Missing required file: ${path.join(outputPath, ".doc-meta.json")}`,
          severity: "error",
        },
        {
          category: "missing-file",
          filePath: path.join(outputPath, ".module-plan.json"),
          message: `Missing required file: ${path.join(outputPath, ".module-plan.json")}`,
          severity: "error",
        },
      ]);
      expect(findByCategory(value, "broken-link")).toEqual([]);
      expect(findByCategory(value, "mermaid")).toEqual([]);
    } finally {
      cleanupTempDir(outputPath);
    }
  });

  it("nested module-tree with children resolved correctly", async () => {
    const outputPath = createTempDir();

    try {
      await writeDocsOutput(outputPath, {
        ".doc-meta.json": JSON.stringify(buildMetadata(), null, 2),
        ".module-plan.json": "{}",
        "module-a.md": "# Module A\n",
        "nested/module-b.md": "# Module B\n",
        "module-tree.json": JSON.stringify(
          [
            {
              children: [{ name: "Module B", page: "nested/module-b.md" }],
              name: "Module A",
              page: "module-a.md",
            },
          ],
          null,
          2,
        ),
        "overview.md": "# Overview\n- [Module A](./module-a.md)\n",
      });

      const value = expectValidation(
        await validateDocumentation({ outputPath }),
      );

      expect(value).toEqual({
        errorCount: 0,
        findings: [],
        status: "pass",
        warningCount: 0,
      });
    } finally {
      cleanupTempDir(outputPath);
    }
  });

  it("Mermaid block with no diagram type keyword reports a warning", async () => {
    const outputPath = createTempDir();

    try {
      await writeDocsOutput(outputPath, {
        ".doc-meta.json": JSON.stringify(buildMetadata(), null, 2),
        ".module-plan.json": "{}",
        "module-a.md": "# Module A\n\n```mermaid\nA --> B\n```\n",
        "module-b.md": "# Module B\n",
        "module-tree.json": JSON.stringify(
          [
            { name: "Module A", page: "module-a.md" },
            { name: "Module B", page: "module-b.md" },
          ],
          null,
          2,
        ),
        "overview.md": "# Overview\n- [Module A](./module-a.md)\n",
      });

      const value = expectValidation(
        await validateDocumentation({ outputPath }),
      );
      const mermaidFindings = findByCategory(value, "mermaid");

      expect(value.status).toBe("warn");
      expect(mermaidFindings).toHaveLength(1);
      expect(mermaidFindings[0]?.message).toContain(
        "missing Mermaid diagram type declaration",
      );
    } finally {
      cleanupTempDir(outputPath);
    }
  });

  it("multiple broken links in the same file are all reported", async () => {
    const outputPath = createTempDir();

    try {
      await writeDocsOutput(outputPath, {
        ".doc-meta.json": JSON.stringify(buildMetadata(), null, 2),
        ".module-plan.json": "{}",
        "module-a.md":
          "# Module A\n\n- [Missing A](./missing-a.md)\n- [Missing B](./missing-b.md)\n",
        "module-b.md": "# Module B\n",
        "module-tree.json": JSON.stringify(
          [
            { name: "Module A", page: "module-a.md" },
            { name: "Module B", page: "module-b.md" },
          ],
          null,
          2,
        ),
        "overview.md": "# Overview\n- [Module A](./module-a.md)\n",
      });

      const value = expectValidation(
        await validateDocumentation({ outputPath }),
      );
      const brokenLinks = findByCategory(value, "broken-link");

      expect(value.status).toBe("fail");
      expect(brokenLinks).toEqual([
        {
          category: "broken-link",
          filePath: path.join(outputPath, "module-a.md"),
          message: `Broken internal link in ${path.join(outputPath, "module-a.md")}: ./missing-a.md`,
          severity: "error",
          target: "./missing-a.md",
        },
        {
          category: "broken-link",
          filePath: path.join(outputPath, "module-a.md"),
          message: `Broken internal link in ${path.join(outputPath, "module-a.md")}: ./missing-b.md`,
          severity: "error",
          target: "./missing-b.md",
        },
      ]);
    } finally {
      cleanupTempDir(outputPath);
    }
  });
});

const writeDocsOutput = async (
  outputPath: string,
  files: Record<string, string>,
): Promise<void> => {
  for (const [relativePath, contents] of Object.entries(files)) {
    const filePath = path.join(outputPath, relativePath);

    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, contents, "utf8");
  }
};
