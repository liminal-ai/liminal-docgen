import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const FIXTURES_ROOT = path.resolve(__dirname, "../fixtures");

export const REPOS = {
  validTs: path.join(FIXTURES_ROOT, "repos/valid-ts"),
  empty: path.join(FIXTURES_ROOT, "repos/empty"),
  multiLang: path.join(FIXTURES_ROOT, "repos/multi-lang"),
  noGit: path.join(FIXTURES_ROOT, "repos/no-git"),
};

export const DOCS_OUTPUT = {
  valid: path.join(FIXTURES_ROOT, "docs-output/valid"),
  brokenLinks: path.join(FIXTURES_ROOT, "docs-output/broken-links"),
  missingOverview: path.join(FIXTURES_ROOT, "docs-output/missing-overview"),
  missingTree: path.join(FIXTURES_ROOT, "docs-output/missing-tree"),
  missingMeta: path.join(FIXTURES_ROOT, "docs-output/missing-meta"),
  warningsOnly: path.join(FIXTURES_ROOT, "docs-output/warnings-only"),
  inconsistentTree: path.join(FIXTURES_ROOT, "docs-output/inconsistent-tree"),
  badMermaid: path.join(FIXTURES_ROOT, "docs-output/bad-mermaid"),
  corruptMetadata: path.join(FIXTURES_ROOT, "docs-output/corrupt-metadata"),
  missingMetadataFields: path.join(
    FIXTURES_ROOT,
    "docs-output/missing-metadata-fields",
  ),
  missingModulePlan: path.join(
    FIXTURES_ROOT,
    "docs-output/missing-module-plan",
  ),
};

export const CONFIG = {
  validConfig: path.join(FIXTURES_ROOT, "config/valid-config"),
  invalidConfig: path.join(FIXTURES_ROOT, "config/invalid-config"),
  extraFieldsConfig: path.join(FIXTURES_ROOT, "config/extra-fields-config"),
  noConfig: path.join(FIXTURES_ROOT, "config/no-config"),
};
