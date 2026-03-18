# Epic 1 — Full Codebase Verification Review (GPT-5.4)

**Date:** 2026-03-15
**Reviewer:** GPT-5.4 (Codex)
**Scope:** Full Epic 1 implementation vs. spec

## Executive Summary
The implementation is structurally close to the Epic 1 tech design: the SDK surface exists, the module layout is recognizable, shared metadata validation is reused correctly, validation checks are gated sensibly, and the package is green on its own verification commands (`pnpm test`, `pnpm typecheck`, `pnpm lint`). The code is not broadly unfinished or stubbed.

It is not, however, fully spec-complete. The most serious gap is in validation: the epic requires `.module-plan.json` to be treated as a required output artifact, but the implementation never checks for it. That omission is amplified by a coverage failure upstream: the epic defines `TC-4.2d`, the test plan dropped it, and the test suite therefore stays green while a required validation rule is missing. There are also meaningful contract drifts around repo validation, exported-symbol normalization, cross-link scoping, and error-code mapping.

Overall assessment: good engineering hygiene, incomplete spec compliance. This should not be treated as a clean Epic 1 sign-off until the critical validation gap and the major contract/coverage issues below are addressed.

## Critical Findings
### 1. Required `.module-plan.json` validation is missing entirely
**Description:** The epic and tech design require validation to report missing expected files individually, including `.module-plan.json`. The implementation only checks for `overview.md`, `module-tree.json`, and `.doc-meta.json`. A documentation output directory that is missing only `.module-plan.json` currently passes validation.

**Affected files**
- [file-presence.ts](/Users/leemoore/code/code-steward/code-wiki-gen/src/validation/checks/file-presence.ts:7)
- [validate.ts](/Users/leemoore/code/code-steward/code-wiki-gen/src/validation/validate.ts:67)
- [validate.test.ts](/Users/leemoore/code/code-steward/code-wiki-gen/test/validation/validate.test.ts:83)

**Spec reference**
- AC-4.2
- TC-4.2d
- Flow 5: expected files are `overview.md`, `module-tree.json`, `.doc-meta.json`, `.module-plan.json`

**Evidence**
- `REQUIRED_FILES` omits `.module-plan.json`.
- The validation suite has no `TC-4.2d` test.
- Manual spot-check confirmed the behavior: a temp output directory containing every other required file but no `.module-plan.json` returned `{"status":"pass","errorCount":0,"warningCount":0}`.
- The epic contains `TC-4.2d`, but the test plan drops it, so the missing behavior is invisible to the green test suite.

## Major Findings
### 1. `checkEnvironment()` falsely reports `invalid-repo` for valid repo subdirectories
**Description:** Git validity is currently defined as "`repoPath` realpath must exactly equal the git toplevel realpath." That is stricter than the rest of the SDK and breaks a common legitimate input: passing a directory inside a valid repository. Git commands work from subdirectories, analysis works from subdirectories, but environment check marks the path invalid.

**Affected files**
- [git.ts](/Users/leemoore/code/code-steward/code-wiki-gen/src/adapters/git.ts:26)
- [git.ts](/Users/leemoore/code/code-steward/code-wiki-gen/src/adapters/git.ts:49)
- [git.ts](/Users/leemoore/code/code-steward/code-wiki-gen/src/adapters/git.ts:54)
- [check.ts](/Users/leemoore/code/code-steward/code-wiki-gen/src/environment/check.ts:20)

**Spec reference**
- AC-1.4
- Flow 2 git repository verification

**Evidence**
- `getGitRepositoryStatus()` returns `"valid"` only when `gitRootPath === requestedRepoPath`.
- Manual spot-check against a real temp repo returned a success result with an `invalid-repo` error finding for `repo/src`, even though language detection succeeded in that same directory.

### 2. Cross-link validation accepts links that escape the documentation output directory
**Description:** The validator checks only whether a resolved target path exists. It does not enforce that the target remains under `outputPath`. A markdown link such as `../outside.md` is treated as valid if that file exists on disk, even though AC-4.3 scopes this flow to links between generated documentation pages in the output directory.

**Affected files**
- [cross-links.ts](/Users/leemoore/code/code-steward/code-wiki-gen/src/validation/checks/cross-links.ts:31)
- [cross-links.ts](/Users/leemoore/code/code-steward/code-wiki-gen/src/validation/checks/cross-links.ts:36)
- [validate.test.ts](/Users/leemoore/code/code-steward/code-wiki-gen/test/validation/validate.test.ts:130)

**Spec reference**
- AC-4.3
- Flow 5 cross-link check specifics

**Evidence**
- The checker resolves relative paths and calls `pathExists()` without bounding the target to `outputPath`.
- Manual spot-check created `docs/overview.md` with `[Leak](../outside.md)` and a sibling `outside.md`; validation returned `status: "pass"` with no findings.
- No test covers link-escape behavior.

### 3. The implementation cannot enforce the “exports only” component contract
**Description:** The tech design explicitly chose “exports only in v1,” and AC-2.5 defines `exportedSymbols`. The raw adapter contract contains no export visibility field, and the normalizer blindly converts every raw node into an `exportedSymbol`. If the Python adapter emits internal symbols, they will be surfaced as exports with no way to filter them.

**Affected files**
- [raw-output.ts](/Users/leemoore/code/code-steward/code-wiki-gen/src/analysis/raw-output.ts:8)
- [analysis.ts](/Users/leemoore/code/code-steward/code-wiki-gen/src/types/analysis.ts:32)
- [normalizer.ts](/Users/leemoore/code/code-steward/code-wiki-gen/src/analysis/normalizer.ts:59)

**Spec reference**
- AC-2.5
- Tech design question 5 answer: “Exports only in v1”

**Evidence**
- `RawNode` has no `isExported`-style field.
- `normalize()` pushes every node from `raw.functions` into the `exportedSymbols` collection.
- Tests verify symbol shape, but there is no negative test proving internal symbols are excluded.

### 4. `getDocumentationStatus()` misclassifies git failures as `PATH_ERROR`
**Description:** Status queries collapse all `getHeadCommitHash()` failures into `PATH_ERROR`, including missing Git. That breaks the engine’s typed error model: missing Git is a dependency issue, not a path issue. Callers cannot branch reliably on `error.code`.

**Affected files**
- [status.ts](/Users/leemoore/code/code-steward/code-wiki-gen/src/metadata/status.ts:39)
- [status.ts](/Users/leemoore/code/code-steward/code-wiki-gen/src/metadata/status.ts:42)
- [git.ts](/Users/leemoore/code/code-steward/code-wiki-gen/src/adapters/git.ts:8)

**Spec reference**
- Engine error contract
- Tech design external contracts: Git process not found -> `DEPENDENCY_MISSING`

**Evidence**
- `getDocumentationStatus()` catches all hash-resolution failures and returns `PATH_ERROR`.
- Manual spot-check with `PATH` cleared returned `{"ok":false,"error":{"code":"PATH_ERROR","details":{"reason":"spawn git ENOENT"}}}`.
- There is no test covering missing Git during status queries.

### 5. Missing bundled analysis scripts are not reported as named missing dependencies
**Description:** Runtime dependencies include bundled analysis scripts. AC-1.2 requires each missing dependency to be identified by name in a typed finding rather than a generic environment problem. Missing or non-executable scripts are currently emitted as `category: "environment"` with no `dependencyName`.

**Affected files**
- [runtime-checker.ts](/Users/leemoore/code/code-steward/code-wiki-gen/src/environment/runtime-checker.ts:33)
- [runtime-checker.ts](/Users/leemoore/code/code-steward/code-wiki-gen/src/environment/runtime-checker.ts:37)
- [runtime-checker.ts](/Users/leemoore/code/code-steward/code-wiki-gen/src/environment/runtime-checker.ts:49)

**Spec reference**
- AC-1.2
- Flow 1 runtime dependencies include bundled analysis scripts

**Evidence**
- Missing scripts generate `category: "environment"` findings instead of `category: "missing-dependency"`.
- The findings name the file path in `message`, but not via `dependencyName`.
- The existing non-TC test only asserts `category: "environment"`, so the suite codifies the drift instead of catching it.

### 6. Include/exclude filtering is applied twice, with different responsibilities
**Description:** The tech design allows filtering in the adapter or, if needed, in the normalizer. The current implementation does both: the adapter passes include/exclude args to Python, and the normalizer re-applies glob filtering via `path.matchesGlob()`. That creates two filtering engines and risks mismatched semantics on edge-case patterns.

**Affected files**
- [adapter.ts](/Users/leemoore/code/code-steward/code-wiki-gen/src/analysis/adapter.ts:101)
- [normalizer.ts](/Users/leemoore/code/code-steward/code-wiki-gen/src/analysis/normalizer.ts:316)

**Spec reference**
- AC-2.2
- AC-2.3
- Flow 3 include/exclude filtering note

**Evidence**
- Adapter-level filtering is already expressed in subprocess arguments.
- Normalizer-level filtering then discards files and relationships again using Node glob semantics.
- No tests exercise edge-case pattern disagreements between adapter and normalizer.

## Minor Findings
### 1. Three test cases are present but weaker than their names imply
**Description:** These tests are not hollow, but they under-assert the condition they claim to validate.

**Affected files**
- [check.test.ts](/Users/leemoore/code/code-steward/code-wiki-gen/test/environment/check.test.ts:73)
- [status.test.ts](/Users/leemoore/code/code-steward/code-wiki-gen/test/metadata/status.test.ts:152)
- [validate.test.ts](/Users/leemoore/code/code-steward/code-wiki-gen/test/validation/validate.test.ts:144)

**Spec reference**
- TC-1.1b
- TC-3.4b
- TC-4.4a

**Evidence**
- `TC-1.1b` checks outcomes but not that parser checks were actually skipped.
- `TC-3.4b` asserts only `state === "invalid"`, not that the missing field is specifically `commitHash`.
- `TC-4.4a` says “no findings” but only asserts the absence of `module-tree` findings.

### 2. The test plan is missing an epic TC and its running totals are stale
**Description:** The epic defines `TC-4.2d`, but the test plan omits it. Separately, the test plan says the suite totals 82 tests, while the actual suite currently runs 85.

**Affected files**
- [test-plan.md](/Users/leemoore/code/code-steward/docs/documentation-engine/epic-1/test-plan.md:299)
- [validate.test.ts](/Users/leemoore/code/code-steward/code-wiki-gen/test/validation/validate.test.ts:47)

**Spec reference**
- Epic TC-4.2d
- Test plan “Running Totals”

**Evidence**
- `pnpm test` reported `85 passed`.
- The test-plan validation chunk and running totals still describe 82 tests.

### 3. `AnalysisSummary` is recomputed instead of following the tech design’s direct mapping
**Description:** The design maps adapter `summary.total_files` to `totalFilesAnalyzed` and `summary.languages_found` to `languagesFound`. The normalizer discards those adapter values and recomputes summary fields from normalized artifacts. That is a semantic drift, even if most current tests still pass.

**Affected files**
- [normalizer.ts](/Users/leemoore/code/code-steward/code-wiki-gen/src/analysis/normalizer.ts:96)

**Spec reference**
- Flow 3 normalization mapping

**Evidence**
- `totalFilesAnalyzed`, `totalComponents`, `totalRelationships`, and `languagesFound` are all recomputed in `normalize()`.
- No test asserts parity with adapter-reported summary values.

## AC Coverage Matrix
| AC ID | Status | Evidence | Notes |
|---|---|---|---|
| AC-1.1 | Implemented | [check.ts](/Users/leemoore/code/code-steward/code-wiki-gen/src/environment/check.ts:12) | Standalone structured result returned via `EngineResult<EnvironmentCheckResult>`. |
| AC-1.2 | Partial | [runtime-checker.ts](/Users/leemoore/code/code-steward/code-wiki-gen/src/environment/runtime-checker.ts:15) | Python/Git/parsers are named; bundled scripts are not surfaced as named `missing-dependency` findings. |
| AC-1.3 | Implemented | [language-detector.ts](/Users/leemoore/code/code-steward/code-wiki-gen/src/environment/language-detector.ts:4) | Repo languages are detected and returned. |
| AC-1.4 | Partial | [git.ts](/Users/leemoore/code/code-steward/code-wiki-gen/src/adapters/git.ts:26) | Works for repo roots, but falsely rejects valid subdirectories inside a repo. |
| AC-1.5 | Implemented | [check.ts](/Users/leemoore/code/code-steward/code-wiki-gen/src/environment/check.ts:44) | `passed` is derived from presence of error findings. |
| AC-2.1 | Implemented | [analyze.ts](/Users/leemoore/code/code-steward/code-wiki-gen/src/analysis/analyze.ts:14) | Returns normalized `RepositoryAnalysis`. |
| AC-2.2 | Implemented | [adapter.ts](/Users/leemoore/code/code-steward/code-wiki-gen/src/analysis/adapter.ts:101) | Include patterns are honored, though filtering is duplicated. |
| AC-2.3 | Implemented | [normalizer.ts](/Users/leemoore/code/code-steward/code-wiki-gen/src/analysis/normalizer.ts:316) | Exclude patterns are honored, though filtering is duplicated. |
| AC-2.4 | Implemented | [normalizer.ts](/Users/leemoore/code/code-steward/code-wiki-gen/src/analysis/normalizer.ts:98) | `focusDirs` preserved without restricting analysis scope. |
| AC-2.5 | Partial | [normalizer.ts](/Users/leemoore/code/code-steward/code-wiki-gen/src/analysis/normalizer.ts:66) | Shape is correct, but “exported symbols” cannot be enforced because raw nodes carry no export visibility. |
| AC-2.6 | Implemented | [normalizer.ts](/Users/leemoore/code/code-steward/code-wiki-gen/src/analysis/normalizer.ts:221) | Relationships are normalized with `source`, `target`, and `type`. |
| AC-2.7 | Implemented | [analyze.ts](/Users/leemoore/code/code-steward/code-wiki-gen/src/analysis/analyze.ts:37) | Commit hash recorded from Git. |
| AC-2.8 | Implemented | [adapter.ts](/Users/leemoore/code/code-steward/code-wiki-gen/src/analysis/adapter.ts:42) | Hard failures return typed errors; unsupported languages remain in successful results. |
| AC-3.1 | Implemented | [status.ts](/Users/leemoore/code/code-steward/code-wiki-gen/src/metadata/status.ts:27) | Missing metadata yields `not_generated`. |
| AC-3.2 | Implemented | [status.ts](/Users/leemoore/code/code-steward/code-wiki-gen/src/metadata/status.ts:50) | Matching commit hash yields `current`. |
| AC-3.3 | Implemented | [status.ts](/Users/leemoore/code/code-steward/code-wiki-gen/src/metadata/status.ts:55) | Differing commit hash yields `stale`. |
| AC-3.4 | Implemented | [reader.ts](/Users/leemoore/code/code-steward/code-wiki-gen/src/metadata/reader.ts:45) | Invalid JSON/shape yields `invalid` in status flow. |
| AC-3.5 | Implemented | [writer.ts](/Users/leemoore/code/code-steward/code-wiki-gen/src/metadata/writer.ts:7) | Metadata write persists the required fields. |
| AC-3.6 | Implemented | [reader.ts](/Users/leemoore/code/code-steward/code-wiki-gen/src/metadata/reader.ts:10) | Read returns metadata or typed `METADATA_ERROR`. |
| AC-4.1 | Implemented | [validate.ts](/Users/leemoore/code/code-steward/code-wiki-gen/src/validation/validate.ts:20) | Validation runs standalone and returns a structured result. |
| AC-4.2 | Partial | [file-presence.ts](/Users/leemoore/code/code-steward/code-wiki-gen/src/validation/checks/file-presence.ts:7) | `.module-plan.json` is missing from required-file checks. |
| AC-4.3 | Partial | [cross-links.ts](/Users/leemoore/code/code-steward/code-wiki-gen/src/validation/checks/cross-links.ts:31) | Broken links are detected, but links can escape `outputPath` and still pass. |
| AC-4.4 | Implemented | [module-tree.ts](/Users/leemoore/code/code-steward/code-wiki-gen/src/validation/checks/module-tree.ts:15) | Tree/page consistency and orphan warnings are implemented. |
| AC-4.5 | Implemented | [mermaid.ts](/Users/leemoore/code/code-steward/code-wiki-gen/src/validation/checks/mermaid.ts:16) | Mermaid syntax warnings are implemented. |
| AC-4.6 | Implemented | [validate.ts](/Users/leemoore/code/code-steward/code-wiki-gen/src/validation/validate.ts:87) | Status, counts, and findings are derived correctly. |
| AC-5.1 | Implemented | [defaults.ts](/Users/leemoore/code/code-steward/code-wiki-gen/src/config/defaults.ts:17) | Built-in defaults are applied. |
| AC-5.2 | Implemented | [resolver.ts](/Users/leemoore/code/code-steward/code-wiki-gen/src/config/resolver.ts:42) | Caller options take precedence field-by-field. |
| AC-5.3 | Implemented | [file-loader.ts](/Users/leemoore/code/code-steward/code-wiki-gen/src/config/file-loader.ts:13) | Config file values are used when caller options are absent. |
| AC-5.4 | Implemented | [resolver.ts](/Users/leemoore/code/code-steward/code-wiki-gen/src/config/resolver.ts:95) | Invalid values return typed `CONFIGURATION_ERROR` details. |
| AC-5.5 | Implemented | [resolver.ts](/Users/leemoore/code/code-steward/code-wiki-gen/src/config/resolver.ts:42) | Resolved config is fully populated and typed. |

## TC Coverage Matrix
Note: the final row includes epic-only `TC-4.2d` because the test plan dropped it; otherwise the most important validation gap would disappear from this matrix.

| TC ID | Status | Test File | Notes |
|---|---|---|---|
| TC-5.1a | Covered | [resolver.test.ts](/Users/leemoore/code/code-steward/code-wiki-gen/test/config/resolver.test.ts) | Default output path asserted. |
| TC-5.1b | Covered | [resolver.test.ts](/Users/leemoore/code/code-steward/code-wiki-gen/test/config/resolver.test.ts) | Default exclude patterns asserted. |
| TC-5.2a | Covered | [resolver.test.ts](/Users/leemoore/code/code-steward/code-wiki-gen/test/config/resolver.test.ts) | Caller overrides default. |
| TC-5.2b | Covered | [resolver.test.ts](/Users/leemoore/code/code-steward/code-wiki-gen/test/config/resolver.test.ts) | Caller overrides config file. |
| TC-5.2c | Covered | [resolver.test.ts](/Users/leemoore/code/code-steward/code-wiki-gen/test/config/resolver.test.ts) | Partial override asserted. |
| TC-5.3a | Covered | [resolver.test.ts](/Users/leemoore/code/code-steward/code-wiki-gen/test/config/resolver.test.ts) | Config file value used. |
| TC-5.3b | Covered | [resolver.test.ts](/Users/leemoore/code/code-steward/code-wiki-gen/test/config/resolver.test.ts) | Missing config uses defaults. |
| TC-5.4a | Covered | [resolver.test.ts](/Users/leemoore/code/code-steward/code-wiki-gen/test/config/resolver.test.ts) | `CONFIGURATION_ERROR` asserted. |
| TC-5.4b | Covered | [resolver.test.ts](/Users/leemoore/code/code-steward/code-wiki-gen/test/config/resolver.test.ts) | Invalid glob error asserted. |
| TC-5.5a | Covered | [resolver.test.ts](/Users/leemoore/code/code-steward/code-wiki-gen/test/config/resolver.test.ts) | Fully populated config asserted. |
| TC-1.1a | Covered | [check.test.ts](/Users/leemoore/code/code-steward/code-wiki-gen/test/environment/check.test.ts) | Happy-path environment pass asserted. |
| TC-1.1b | Weak | [check.test.ts](/Users/leemoore/code/code-steward/code-wiki-gen/test/environment/check.test.ts:73) | Asserts outputs, but not that parser checks were actually skipped. |
| TC-1.2a | Covered | [check.test.ts](/Users/leemoore/code/code-steward/code-wiki-gen/test/environment/check.test.ts) | Missing Python named correctly. |
| TC-1.2b | Covered | [check.test.ts](/Users/leemoore/code/code-steward/code-wiki-gen/test/environment/check.test.ts) | Missing TS parser named correctly. |
| TC-1.2c | Covered | [check.test.ts](/Users/leemoore/code/code-steward/code-wiki-gen/test/environment/check.test.ts) | Multiple missing deps asserted separately. |
| TC-1.2d | Covered | [check.test.ts](/Users/leemoore/code/code-steward/code-wiki-gen/test/environment/check.test.ts) | Missing Git named correctly. |
| TC-1.3a | Covered | [check.test.ts](/Users/leemoore/code/code-steward/code-wiki-gen/test/environment/check.test.ts) | TypeScript detection asserted. |
| TC-1.3b | Covered | [check.test.ts](/Users/leemoore/code/code-steward/code-wiki-gen/test/environment/check.test.ts) | Multi-language detection asserted. |
| TC-1.4a | Covered | [check.test.ts](/Users/leemoore/code/code-steward/code-wiki-gen/test/environment/check.test.ts) | Valid git repo path has no git errors. |
| TC-1.4b | Covered | [check.test.ts](/Users/leemoore/code/code-steward/code-wiki-gen/test/environment/check.test.ts) | Non-git dir yields `invalid-repo`. |
| TC-1.4c | Covered | [check.test.ts](/Users/leemoore/code/code-steward/code-wiki-gen/test/environment/check.test.ts) | Missing path yields `invalid-path`. |
| TC-1.5a | Covered | [check.test.ts](/Users/leemoore/code/code-steward/code-wiki-gen/test/environment/check.test.ts) | Warning severity and `passed: true` asserted. |
| TC-1.5b | Covered | [check.test.ts](/Users/leemoore/code/code-steward/code-wiki-gen/test/environment/check.test.ts) | Error severity and `passed: false` asserted. |
| TC-2.1a | Covered | [analyze.test.ts](/Users/leemoore/code/code-steward/code-wiki-gen/test/analysis/analyze.test.ts) | Populated analysis result asserted. |
| TC-2.1b | Covered | [analyze.test.ts](/Users/leemoore/code/code-steward/code-wiki-gen/test/analysis/analyze.test.ts) | Empty summary asserted. |
| TC-2.2a | Covered | [analyze.test.ts](/Users/leemoore/code/code-steward/code-wiki-gen/test/analysis/analyze.test.ts) | Include-scope result and adapter args asserted. |
| TC-2.2b | Covered | [analyze.test.ts](/Users/leemoore/code/code-steward/code-wiki-gen/test/analysis/analyze.test.ts) | All files included when patterns absent. |
| TC-2.3a | Covered | [analyze.test.ts](/Users/leemoore/code/code-steward/code-wiki-gen/test/analysis/analyze.test.ts) | Generated file excluded. |
| TC-2.3b | Covered | [analyze.test.ts](/Users/leemoore/code/code-steward/code-wiki-gen/test/analysis/analyze.test.ts) | Include/exclude combined behavior asserted. |
| TC-2.4a | Covered | [analyze.test.ts](/Users/leemoore/code/code-steward/code-wiki-gen/test/analysis/analyze.test.ts) | `focusDirs` preserved. |
| TC-2.4b | Covered | [analyze.test.ts](/Users/leemoore/code/code-steward/code-wiki-gen/test/analysis/analyze.test.ts) | Non-focus files remain present. |
| TC-2.5a | Covered | [analyze.test.ts](/Users/leemoore/code/code-steward/code-wiki-gen/test/analysis/analyze.test.ts) | Component structure asserted. |
| TC-2.5b | Covered | [analyze.test.ts](/Users/leemoore/code/code-steward/code-wiki-gen/test/analysis/analyze.test.ts) | Empty `exportedSymbols` asserted. |
| TC-2.6a | Covered | [analyze.test.ts](/Users/leemoore/code/code-steward/code-wiki-gen/test/analysis/analyze.test.ts) | Import relationship asserted. |
| TC-2.6b | Covered | [analyze.test.ts](/Users/leemoore/code/code-steward/code-wiki-gen/test/analysis/analyze.test.ts) | Empty relationships asserted. |
| TC-2.7a | Covered | [analyze.test.ts](/Users/leemoore/code/code-steward/code-wiki-gen/test/analysis/analyze.test.ts) | Commit hash asserted. |
| TC-2.8a | Covered | [analyze.test.ts](/Users/leemoore/code/code-steward/code-wiki-gen/test/analysis/analyze.test.ts) | `DEPENDENCY_MISSING` asserted. |
| TC-2.8b | Covered | [analyze.test.ts](/Users/leemoore/code/code-steward/code-wiki-gen/test/analysis/analyze.test.ts) | `PATH_ERROR` asserted. |
| TC-2.8c | Covered | [analyze.test.ts](/Users/leemoore/code/code-steward/code-wiki-gen/test/analysis/analyze.test.ts) | `languagesSkipped` asserted. |
| TC-2.8d | Covered | [analyze.test.ts](/Users/leemoore/code/code-steward/code-wiki-gen/test/analysis/analyze.test.ts) | Supported and skipped languages both asserted. |
| TC-3.1a | Covered | [status.test.ts](/Users/leemoore/code/code-steward/code-wiki-gen/test/metadata/status.test.ts) | `not_generated` for nonexistent output asserted. |
| TC-3.1b | Covered | [status.test.ts](/Users/leemoore/code/code-steward/code-wiki-gen/test/metadata/status.test.ts) | `not_generated` without metadata asserted. |
| TC-3.2a | Covered | [status.test.ts](/Users/leemoore/code/code-steward/code-wiki-gen/test/metadata/status.test.ts) | `current` state asserted. |
| TC-3.3a | Covered | [status.test.ts](/Users/leemoore/code/code-steward/code-wiki-gen/test/metadata/status.test.ts) | `stale` state asserted. |
| TC-3.4a | Covered | [status.test.ts](/Users/leemoore/code/code-steward/code-wiki-gen/test/metadata/status.test.ts) | Corrupt metadata yields `invalid`. |
| TC-3.4b | Weak | [status.test.ts](/Users/leemoore/code/code-steward/code-wiki-gen/test/metadata/status.test.ts:152) | Asserts generic invalid state, not the missing `commitHash` cause. |
| TC-3.5a | Covered | [status.test.ts](/Users/leemoore/code/code-steward/code-wiki-gen/test/metadata/status.test.ts) | Full metadata persistence asserted. |
| TC-3.5b | Covered | [status.test.ts](/Users/leemoore/code/code-steward/code-wiki-gen/test/metadata/status.test.ts) | Update metadata replacement asserted. |
| TC-3.6a | Covered | [status.test.ts](/Users/leemoore/code/code-steward/code-wiki-gen/test/metadata/status.test.ts) | Successful read asserted. |
| TC-3.6b | Covered | [status.test.ts](/Users/leemoore/code/code-steward/code-wiki-gen/test/metadata/status.test.ts) | Structured metadata error asserted. |
| TC-4.1a | Covered | [validate.test.ts](/Users/leemoore/code/code-steward/code-wiki-gen/test/validation/validate.test.ts) | Pass summary asserted. |
| TC-4.1b | Covered | [validate.test.ts](/Users/leemoore/code/code-steward/code-wiki-gen/test/validation/validate.test.ts) | Missing directory finding asserted. |
| TC-4.2a | Covered | [validate.test.ts](/Users/leemoore/code/code-steward/code-wiki-gen/test/validation/validate.test.ts) | Missing overview asserted. |
| TC-4.2b | Covered | [validate.test.ts](/Users/leemoore/code/code-steward/code-wiki-gen/test/validation/validate.test.ts) | Missing tree asserted. |
| TC-4.2c | Covered | [validate.test.ts](/Users/leemoore/code/code-steward/code-wiki-gen/test/validation/validate.test.ts) | Missing metadata asserted. |
| TC-4.3a | Covered | [validate.test.ts](/Users/leemoore/code/code-steward/code-wiki-gen/test/validation/validate.test.ts) | Valid links produce no `broken-link` findings. |
| TC-4.3b | Covered | [validate.test.ts](/Users/leemoore/code/code-steward/code-wiki-gen/test/validation/validate.test.ts) | Broken link finding asserted. |
| TC-4.4a | Weak | [validate.test.ts](/Users/leemoore/code/code-steward/code-wiki-gen/test/validation/validate.test.ts:144) | Test name says “no findings” but asserts only no `module-tree` findings. |
| TC-4.4b | Covered | [validate.test.ts](/Users/leemoore/code/code-steward/code-wiki-gen/test/validation/validate.test.ts) | Missing tree page asserted. |
| TC-4.4c | Covered | [validate.test.ts](/Users/leemoore/code/code-steward/code-wiki-gen/test/validation/validate.test.ts) | Orphan page warning asserted. |
| TC-4.4d | Covered | [validate.test.ts](/Users/leemoore/code/code-steward/code-wiki-gen/test/validation/validate.test.ts) | `overview.md` exclusion asserted. |
| TC-4.5a | Covered | [validate.test.ts](/Users/leemoore/code/code-steward/code-wiki-gen/test/validation/validate.test.ts) | Valid Mermaid produces no findings. |
| TC-4.5b | Covered | [validate.test.ts](/Users/leemoore/code/code-steward/code-wiki-gen/test/validation/validate.test.ts) | Mermaid warning asserted. |
| TC-4.6a | Covered | [validate.test.ts](/Users/leemoore/code/code-steward/code-wiki-gen/test/validation/validate.test.ts) | Pass summary asserted. |
| TC-4.6b | Covered | [validate.test.ts](/Users/leemoore/code/code-steward/code-wiki-gen/test/validation/validate.test.ts) | Warn summary asserted. |
| TC-4.6c | Covered | [validate.test.ts](/Users/leemoore/code/code-steward/code-wiki-gen/test/validation/validate.test.ts) | Fail summary asserted. |
| TC-4.6d | Covered | [validate.test.ts](/Users/leemoore/code/code-steward/code-wiki-gen/test/validation/validate.test.ts) | Metadata JSON error asserted. |
| TC-4.6e | Covered | [validate.test.ts](/Users/leemoore/code/code-steward/code-wiki-gen/test/validation/validate.test.ts) | Missing metadata field error asserted. |
| TC-4.2d (Epic only) | Missing | — | Present in the epic, omitted from the test plan, and absent from the test suite. |

## Interface Compliance
- **`EnvironmentCheckFinding` partial drift for runtime scripts:** Python, Git, and parser failures use the expected `missing-dependency` shape, but bundled analysis script failures do not. That is a semantic mismatch with the AC-1.2 contract.
- **`ExportedSymbol[]` contract is not enforceable:** the raw adapter contract and normalizer do not preserve export visibility, so `exportedSymbols` currently means “all raw nodes that survived normalization,” not “exports only.”
- **`EngineError.code` drift in status flow:** missing Git during `getDocumentationStatus()` returns `PATH_ERROR`, contradicting the engine’s documented dependency/path separation.
- **`AnalysisSummary` semantics drift:** the implementation recomputes summary counts and languages instead of following the tech design’s direct mapping from adapter summary fields.

## Architecture Assessment
The high-level module structure is mostly aligned with the tech design. Public SDK exports exist in [index.ts](/Users/leemoore/code/code-steward/code-wiki-gen/src/index.ts:2), configuration resolution is centralized, analysis remains behind an adapter boundary, metadata shape validation is shared exactly as designed, and validation is composed from independent check functions aggregated in parallel.

The main architectural deviations are:
- **Validation responsibility gap:** [file-presence.ts](/Users/leemoore/code/code-steward/code-wiki-gen/src/validation/checks/file-presence.ts:7) does not implement the full required artifact set from Flow 5.
- **Repo validation semantics drift:** [git.ts](/Users/leemoore/code/code-steward/code-wiki-gen/src/adapters/git.ts:26) introduces a stricter “repo root only” notion that is not reflected elsewhere in the SDK.
- **Dual filtering path:** include/exclude semantics are split between adapter and normalizer, which weakens determinism at the adapter boundary.
- **Cross-link scope leak:** the validator reads beyond the documentation output boundary, so the data-flow contract is broader than the spec intends.

## Test Quality Assessment
The suite is generally solid in structure. Tests target entry points rather than internals, mock mostly at external boundaries, and use fixtures meaningfully. There are no hollow or placeholder tests in the current `.test.ts` files, and the package verification commands are green:
- `pnpm test`
- `pnpm typecheck`
- `pnpm lint`

The quality problems are coverage and precision, not emptiness:
- The most important gap is **missing epic coverage for `TC-4.2d`**. This is the reason a spec violation survives a green suite.
- A few tests are **weaker than their names** (`TC-1.1b`, `TC-3.4b`, `TC-4.4a`).
- There are **no regression tests** for the major semantic issues found here: repo subdirectory handling, output-boundary link escape, exported-symbol filtering, or status error-code mapping when Git is unavailable.

## Recommendations
1. Add `.module-plan.json` to [file-presence.ts](/Users/leemoore/code/code-steward/code-wiki-gen/src/validation/checks/file-presence.ts:7), add `TC-4.2d` back to the test plan, and add a validation test that fails when only that file is missing.
2. Decide whether `repoPath` may be a repo subdirectory. If yes, fix [getGitRepositoryStatus()](/Users/leemoore/code/code-steward/code-wiki-gen/src/adapters/git.ts:26) to accept paths inside a repo; if no, tighten the public contract and make all SDK entry points enforce that consistently.
3. Constrain cross-link validation to targets inside `outputPath`, then add regression coverage for `../` escapes and same-directory relative links.
4. Extend the Python/raw analysis contract with explicit export visibility or normalize only nodes proven to be exported, then add negative tests for internal symbols.
5. Normalize error mapping in [status.ts](/Users/leemoore/code/code-steward/code-wiki-gen/src/metadata/status.ts:39) so missing Git returns `DEPENDENCY_MISSING` and path failures remain `PATH_ERROR`.
6. Choose one filtering authority for analysis include/exclude behavior and add pattern-edge-case tests so adapter and normalizer cannot diverge silently.
