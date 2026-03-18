# Epic 1 Full-Codebase Verification Review

**Reviewer:** Opus
**Date:** 2026-03-15
**Scope:** All 5 flows, all source and test files, all fixtures, package configuration
**Verdict:** Pass with 1 Major gap (AC-4.2d) and several Minor items

---

## Executive Summary

Epic 1's implementation is strong. Type contracts match the epic exactly. The architecture faithfully implements the tech design's module structure. The error model is consistent. Tests are comprehensive (85 tests, all passing) with correct mock boundaries. The single material gap is a missing required-file check for `.module-plan.json` (AC-4.2d), which is specified in the epic but absent from both code and tests. Everything else is solid.

---

## What's Good

### Type Contract Fidelity

Every public type matches the epic's data contracts character-for-character:

- `EngineResult<T>`, `EngineError`, `EngineErrorCode` — exact match
- `EnvironmentCheckResult`, `EnvironmentCheckFinding` — exact match including the `"environment"` category addition (compatible extension)
- `RepositoryAnalysis`, `AnalysisSummary`, `AnalyzedComponent`, `ExportedSymbol`, `AnalyzedRelationship` — exact match
- `DocumentationStatus`, `GeneratedDocumentationMetadata`, `MetadataWriteRequest` — exact match
- `ValidationResult`, `ValidationFinding`, `ModuleTreeEntry` — exact match
- `ResolvedConfiguration`, `ConfigurationRequest`, `AnalysisOptions` — exact match
- All operation request types — exact match

The `ConfigurationErrorDetails` type in `types/configuration.ts` is a useful implementation-level addition that provides structured error details beyond the epic's generic `details?: unknown`. This is a compatible enhancement.

### Architecture Alignment

The module structure faithfully implements the tech design:

| Tech Design Module | Implementation | Status |
|---|---|---|
| `config/resolver.ts` | Three-level merge: caller > file > defaults | Correct |
| `config/defaults.ts` | Built-in defaults with defensive cloning | Correct |
| `config/file-loader.ts` | `.docengine.json` discovery with zod validation | Correct |
| `environment/check.ts` | Orchestrates runtime + repo-aware checks | Correct |
| `environment/runtime-checker.ts` | Python, Git, bundled scripts | Correct |
| `environment/language-detector.ts` | File extension walk | Correct |
| `environment/parser-checker.ts` | Tree-sitter grammar availability | Correct |
| `analysis/analyze.ts` | Orchestrates adapter + normalizer + git hash | Correct |
| `analysis/adapter.ts` | Python subprocess invocation | Correct |
| `analysis/normalizer.ts` | Raw output → engine types (pure function) | Correct |
| `metadata/status.ts` | Read metadata + compare commits | Correct |
| `metadata/reader.ts` | Parse `.doc-meta.json` via shared shape validator | Correct |
| `metadata/writer.ts` | Serialize and persist with `mkdir -p` | Correct |
| `metadata/validate-shape.ts` | Shared zod validation (reader + validation check) | Correct |
| `validation/validate.ts` | Parallel check orchestration | Correct |
| All 5 `validation/checks/*` | Independent check functions | Correct |
| `adapters/git.ts`, `python.ts`, `subprocess.ts` | External boundary adapters | Correct |

The `contracts/` layer (zod schemas) and `analysis/raw-output.ts` (typed raw output) are clean additions that aren't in the tech design's file structure but serve the architecture well.

### Error Model Consistency

The `EngineResult<T>` discriminated union is used consistently across all 7 SDK operations. The two-layer error model (operational errors vs. domain findings) is correctly maintained:

- `checkEnvironment()` → findings inside success value; `ENVIRONMENT_ERROR` for operational failure
- `validateDocumentation()` → findings inside success value; `VALIDATION_ERROR` for operational failure
- `analyzeRepository()` → `DEPENDENCY_MISSING`, `PATH_ERROR`, `ANALYSIS_ERROR` for failures
- `getDocumentationStatus()` → `not_generated`/`invalid` are success states with findings; `PATH_ERROR` for git failure
- `resolveConfiguration()` → `CONFIGURATION_ERROR` for invalid input or malformed config file
- `readMetadata()` → `METADATA_ERROR` for missing/corrupt files
- `writeMetadata()` → `METADATA_ERROR` for invalid requests or write failures

Error codes map correctly to the epic's error code table.

### Cross-Module Integration

The shared dependencies work correctly:

- **Config → Analysis/Status:** `resolveConfiguration()` is called by `analyzeRepository()` (to merge `AnalysisOptions` with defaults) and `getDocumentationStatus()` (when `outputPath` not provided). Both paths are tested.
- **Shared metadata validation:** `metadata/validate-shape.ts` is used by both `metadata/reader.ts` and `validation/checks/metadata-shape.ts`, exactly as the tech design specified. This prevents validation logic duplication.
- **Git adapter shared:** Used by environment check (repo validation), analysis (commit hash), and status (HEAD comparison).
- **Python adapter shared:** Used by environment check (availability) and analysis adapter (subprocess invocation).

### Test Quality

- **85 tests, all passing.** Exceeds the test plan's estimated 82 (3 extra analysis adapter tests).
- **Mock boundaries are correct:** Mocks exist only at external boundaries (subprocess, git, python, filesystem). Internal modules (normalizer, resolver, language detector, validation checks) are exercised through entry points, not mocked.
- **Fixtures are comprehensive:** 4 repo fixtures, 10 doc-output fixtures, 4 config fixtures — each purpose-built for specific test scenarios.
- **Temp directories are properly managed:** Created with `mkdtempSync` and cleaned up in `finally` blocks.
- **TC traceability:** Every test name starts with the TC ID, making the mapping from epic to test immediate.

### Defensive Coding

- Glob syntax validation with bracket matching in `resolver.ts`
- Subprocess timeout handling in `subprocess.ts` and `adapter.ts`
- Path existence checks before analysis and validation
- Zod schema validation at every system boundary (config file, metadata file, raw analysis output, validation request)
- Deterministic sorted output (components, symbols, relationships) for stable assertions

### SDK Surface

All 7 operations are correctly exported from `src/index.ts`. All types re-exported from `src/types/index.ts`. The public surface matches the tech design's operation table exactly.

### Python Analysis Script

The bundled `analyze_repository.py` is a real, functioning analyzer — not a stub. It handles TypeScript/JavaScript (via regex-based export extraction with optional tree-sitter validation) and Python (via AST parsing). It produces the expected JSON output shape that passes the `rawAnalysisOutputSchema` zod validation. Import resolution with relative path handling is correctly implemented.

---

## Findings

### Critical

None.

### Major

#### M1: AC-4.2d — `.module-plan.json` not checked by validation

**Location:** `src/validation/checks/file-presence.ts:7`

The epic explicitly lists `.module-plan.json` as a required file in both the flow description and AC-4.2d:

> **AC-4.2d:** Missing .module-plan.json
> Given: Output directory exists but `.module-plan.json` is missing
> When: Validation runs
> Then: Finding with `severity: "error"`, `category: "missing-file"`, identifying `.module-plan.json`

The `REQUIRED_FILES` array currently contains only 3 entries:

```typescript
const REQUIRED_FILES = ["overview.md", "module-tree.json", METADATA_FILE_NAME];
```

`.module-plan.json` is missing. No test for TC-4.2d exists. No `missing-module-plan` fixture exists.

Note: The fixture infrastructure already includes `.module-plan.json` files in all doc-output fixtures (they were clearly anticipated), so the fix is straightforward:

1. Add `".module-plan.json"` to `REQUIRED_FILES`
2. Create a `missing-module-plan` fixture
3. Add the TC-4.2d test
4. Update the "empty directory" test's expected `errorCount` from 3 to 4

**This was also missed in the test plan** — the TC-to-Test Mapping for Chunk 5 lists TC-4.2a through TC-4.2c but omits TC-4.2d.

---

### Minor

#### m1: `LANGUAGE_BY_EXTENSION` maps differ between language-detector and normalizer

**Location:** `src/environment/language-detector.ts:20-30` and `src/analysis/normalizer.ts:415-429`

The language-detector recognizes: `.cjs`, `.cts`, `.js`, `.jsx`, `.mjs`, `.mts`, `.py`, `.ts`, `.tsx` (3 languages)
The normalizer recognizes: `.c`, `.cpp`, `.cs`, `.go`, `.java`, `.js`, `.jsx`, `.kt`, `.php`, `.py`, `.rs`, `.ts`, `.tsx` (12 languages)

This means:
- `.mjs`/`.cjs`/`.mts`/`.cts` files are detected as JavaScript/TypeScript by `checkEnvironment()` but NOT recognized by the normalizer (they'd get `language: null` and be excluded from components)
- `.c`/`.go`/`.java`/`.rs` files are recognized by the normalizer but NOT detected by `checkEnvironment()` (no parser warnings would be generated for them)

The Python script's `LANGUAGE_BY_EXTENSION` matches the normalizer's map, which is consistent for the analysis path. But the environment checker's narrower map means `checkEnvironment()` could report "TypeScript detected" for a repo with only `.mts` files, while `analyzeRepository()` would produce zero components for those files.

**Recommendation:** Either align the maps or document the intentional divergence. The language-detector should at minimum include the same extensions as the normalizer for the languages it covers (add `.mjs`, `.cjs`, `.mts`, `.cts` extensions to the normalizer, or acknowledge that the environment check is intentionally scoped to a subset).

#### m2: Unused `checkParserAvailability` alias export

**Location:** `src/environment/parser-checker.ts:31`

```typescript
export const checkParserAvailability = checkParsers;
```

This alias is never imported by any module. It adds unnecessary surface area. Either remove it or document why it exists (perhaps for a planned external consumer).

#### m3: Duplicate `getErrorMessage` helpers

**Location:** Multiple files — `config/file-loader.ts:83`, `analysis/analyze.ts:104`, `analysis/adapter.ts:152`, `metadata/reader.ts:57`, `metadata/writer.ts:48`, `metadata/status.ts:114`

Six separate `getErrorMessage` helpers with identical logic (`error instanceof Error ? error.message : "Unknown..."`) but different fallback messages. This is not a bug — each has a context-appropriate fallback — but a shared utility in a `utils/` or `adapters/` module would reduce duplication.

**Recommendation:** Leave as-is if the codebase stays small. Consider consolidating if more modules are added in Epic 2.

#### m4: `isAnalyzableFile` semantic complexity in normalizer

**Location:** `src/analysis/normalizer.ts:308-314`

The interaction between the `supported` flag from file metadata, the `skippedLanguageSet` derived from unsupported files, and the `isAnalyzableFile` filter is non-trivial:

```typescript
const isAnalyzableFile = (metadata: FileMetadata, skippedLanguageSet: Set<string>): boolean =>
  metadata.supported && metadata.language !== null && !skippedLanguageSet.has(metadata.language);
```

A file is analyzable if it's marked `supported`, has a language, AND that language isn't in the skipped set. The `supported` flag and `skippedLanguageSet` membership can overlap, making the triple condition potentially confusing for future maintainers. A brief inline comment explaining the semantics would help.

#### m5: Cross-link validation only checks `.md` targets

**Location:** `src/validation/checks/cross-links.ts:62`

```typescript
return stripLinkSuffixes(target).toLowerCase().endsWith(".md");
```

Links to non-markdown targets (e.g., images, JSON files) are silently skipped. This is correct per the epic ("Internal relative markdown links between generated documentation pages are verified"), but worth noting: if future documentation includes links to `.json` files (like `module-tree.json`), those won't be validated.

#### m6: Python script reads source files twice

**Location:** `src/analysis/scripts/analyze_repository.py:241-270`

The `analyze_files` function reads each source file once to extract exports (line 242), then reads it again to resolve imports (line 270). For large repositories, this doubles I/O. The source content from the first read could be cached and passed to the import resolution pass.

**Impact:** Low for v1 (analysis performance is dominated by tree-sitter parsing and filesystem walking). Worth noting for optimization if analysis becomes a bottleneck.

---

## AC/TC Coverage Matrix

| Flow | ACs | TCs | Code | Tests | Status |
|------|-----|-----|------|-------|--------|
| 1. Configuration | AC-5.1 – AC-5.5 | TC-5.1a – TC-5.5a | All implemented | 12 tests (10 TC + 2 non-TC) | **Pass** |
| 2. Environment | AC-1.1 – AC-1.5 | TC-1.1a – TC-1.5b | All implemented | 15 tests (13 TC + 2 non-TC) | **Pass** |
| 3. Analysis | AC-2.1 – AC-2.8 | TC-2.1a – TC-2.8d | All implemented | 23 tests (17 TC + 6 non-TC) | **Pass** |
| 4. Metadata | AC-3.1 – AC-3.6 | TC-3.1a – TC-3.6b | All implemented | 13 tests (10 TC + 3 non-TC) | **Pass** |
| 5. Validation | AC-4.1 – AC-4.6 | TC-4.1a – TC-4.6e | **AC-4.2d missing** | 22 tests (17 TC + 5 non-TC) | **Fail (M1)** |
| **Total** | **29 ACs** | **68 TCs** | **67/68 implemented** | **85 tests** | |

The 1 missing TC (TC-4.2d) is the `.module-plan.json` gap described in M1.

---

## Quality Gates

| Gate | Result |
|------|--------|
| `biome check .` | Pass — 90 files checked, no issues |
| `tsc --noEmit` | Pass — zero type errors |
| `vitest run` | Pass — 85/85 tests |
| AC/TC coverage | 67/68 TCs implemented (98.5%) |

---

## Recommendations

1. **Fix M1 immediately** — add `.module-plan.json` to `REQUIRED_FILES`, create fixture, add test. This is a 15-minute fix that closes the only AC gap.
2. **Consider m1 (language map alignment)** before Epic 2 — clustering and generation will depend on consistent language detection across the engine.
3. **Remove m2 (unused alias)** in the next cleanup pass.
4. **Defer m3/m4/m5/m6** — these are informational and don't affect correctness.

---

## Conclusion

The Epic 1 implementation is high quality. The codebase demonstrates strong alignment with the epic specification, tech design, and test plan. Types are exact. Architecture is faithful. Error handling is consistent. Tests are thorough with correct boundary discipline. The single AC gap (M1) is localized and easy to fix. The codebase is ready for Epic 2 development once M1 is addressed.
