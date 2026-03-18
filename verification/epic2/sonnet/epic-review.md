# Epic 2 — Full Codebase Verification Review

**Reviewer:** Sonnet (automated)
**Date:** 2026-03-16
**Scope:** All source files under `src/orchestration/`, `src/prompts/`, `src/adapters/agent-sdk.ts`, `src/types/` and all test files under `test/orchestration/`, `test/prompts/`
**References:** `docs/documentation-engine/epic-2/epic.md`, `tech-design.md`, `test-plan.md`

---

## Executive Summary

The Epic 2 implementation is architecturally sound and impressively complete for an inference-driven orchestration layer. The type system is precise, the stage sequencing is correct, the error handling is thorough, and the test coverage is high (~110+ tests across 7 files). The two most significant gaps are: (1) the real Agent SDK adapter is an unimplemented stub, and (2) `pure-functions.test.ts` is entirely absent despite being specified in the test plan. Beyond those, only minor issues were found.

**TC coverage across all 82 specified TCs: ~100% with one misalignment noted (TC-1.8a).**

---

## Severity Classification

| Severity | Count | Description |
|----------|-------|-------------|
| Critical | 1 | Production-breaking; the core value proposition does not work |
| Major | 3 | Significant gaps against the spec or test plan |
| Minor | 7 | Implementation inconsistencies, semantic gaps, or missing edge cases |

---

## Critical Findings

### C-1: `createAgentSDKAdapter` is an unimplemented stub

**File:** `src/adapters/agent-sdk.ts:31`

```typescript
export const createAgentSDKAdapter = (): AgentSDKAdapter => {
  throw new Error("createAgentSDKAdapter: not yet implemented");
};
```

The entire inference capability — module clustering, documentation generation, overview generation, and quality review — is non-functional in production because the real Agent SDK adapter always throws. All tests avoid this by spying on `createAgentSDKAdapter` to inject a mock. The interface design (`AgentSDKAdapter`, `AgentQueryOptions`, `AgentQueryResult`, `TokenUsage`) is clean and correct, and the injection point in `RunContext.setSDK()` is properly designed.

**Impact:** The system cannot be used in production. Running `generateDocumentation` with real inputs would fail at `createAgentSDKAdapter()` (caught and reported as `failedStage: "planning-modules"` with `ORCHESTRATION_ERROR` — itself a minor secondary issue, see M-3).

**Disposition:** This may be intentional scaffolding if Agent SDK integration is a separate story. The test-plan's explicit mock strategy (`adapters/agent-sdk.ts` is the mock boundary, never the SDK package directly) supports this interpretation. However, for this epic to be considered fully shipped, a real implementation is required. If deliberately deferred, this must be tracked explicitly.

---

## Major Findings

### M-1: `pure-functions.test.ts` is completely absent

**Reference:** test-plan.md, "Pure Function Tests" section

The test plan specifies a dedicated `test/orchestration/pure-functions.test.ts` file with targeted isolated tests:

| Function | Planned Tests |
|----------|---------------|
| `moduleNameToFileName` | `"core"→"core.md"`, `"Auth Middleware"→"auth-middleware.md"`, `"my/module"→"mymodule.md"`, `""→".md"` (edge) |
| `mapToAffectedModules` | Various change sets against various plans (complex mapping logic) |

The file does not exist. The logic is partially covered through integration tests (e.g., TC-2.3a–2.5c exercise the mapper; TC-1.7b exercises `moduleNameToFileName` with `"auth-middleware"`), but the isolated edge-case coverage the test plan called for is missing.

**Specific gaps not covered anywhere:**
- `moduleNameToFileName("Auth Middleware")` → `"auth-middleware.md"` (spaces to dashes)
- `moduleNameToFileName("")` → `".md"` (empty-string edge case)
- Direct `mapToAffectedModules` unit tests for the ambiguous-mapping case (tie-break in `mapComponentToExistingModule` returns `null` when two modules have equal prefix score)

**Impact:** The `mapToAffectedModules` tie-break case (`candidateModuleNames.size !== 1`) is not tested in isolation. If this code path has a bug, it would surface only in complex integration scenarios.

---

### M-2: `TC-1.8a` test is misaligned with the TC's acceptance criteria

**File:** `test/orchestration/generate.test.ts:571`

The test is named and labelled `"TC-1.8a: validation runs post-generation and direct validation failures fail the run"`, but it calls `expectFailure` and tests a broken-link scenario. The epic's AC for TC-1.8a is:

> Full pipeline → `validationResult` present in result (on success)

The test actually covers the *failure* path (validation errors blocking the run), which belongs to TC-5.3b. The success-path verification of `validationResult` being populated is covered *implicitly* by TC-1.1a and TC-3.4a (both verify `validationResult.status: "pass"` on success), but TC-1.8a as a standalone test never exercises its stated precondition (clean output → successful run with validationResult populated).

**Impact:** Coverage gap is minor (the behavior is tested indirectly), but the misalignment means TC-1.8a's formal AC ("validationResult present in success result") has no dedicated passing test. A code reviewer or audit would not be able to map TC-1.8a to a test that demonstrates it.

---

### M-3: `LARGE_REPO_MODULE_THRESHOLD` is a dead constant

**File:** `src/contracts/planning.ts:4`

```typescript
export const LARGE_REPO_MODULE_THRESHOLD = 15;
```

This constant is exported and defined but never imported or used anywhere in the implementation. `CLUSTERING_THRESHOLD = 8` is used correctly. The dead constant adds noise to the contracts module and may indicate incomplete feature scope (e.g., a planned "large repo" code path that was never implemented).

**Impact:** Low, but it signals either incomplete implementation or stale spec-time thinking that should be removed.

---

## Minor Findings

### m-1: SDK init failure reports wrong `failedStage`

**File:** `src/orchestration/generate.ts:61-69`

```typescript
try {
  context.setSDK(createAgentSDKAdapter());
} catch (error) {
  return context.assembleFailureResult("planning-modules", {
    code: "ORCHESTRATION_ERROR",
    message: "Unable to initialize Agent SDK adapter",
    ...
  });
}
```

If adapter initialization fails, `failedStage` is reported as `"planning-modules"`, but no planning has occurred — the failure is in setup (before any stage begins). A more accurate stage would be `"checking-environment"` or a new `"initializing"` stage. Consumers diagnosing failures would see a misleading stage attribution.

---

### m-2: `computing-changes` progress event is emitted after prior-state read, not before it

**File:** `src/orchestration/generate.ts:221-233`

```typescript
const priorStateResult = await readPriorGenerationState(outputPath);
if (!priorStateResult.ok) {
  return context.assembleFailureResult("computing-changes", ...); // ← stage claimed
}
context.emitProgress("computing-changes"); // ← event emitted here
```

When `readPriorGenerationState` fails (TC-2.1a, TC-2.1b, TC-2.1c), the result has `failedStage: "computing-changes"`, and `assembleFailureResult` emits a `"failed"` event. But the `"computing-changes"` stage was never announced — consumers get a `"failed"` event without ever seeing `"computing-changes"` announced. This is inconsistent with how all other stages work (announce before doing work).

The stage sequence test (TC-3.1c) passes because it only tests the happy path where prior-state read succeeds and the event IS emitted. The inconsistency is undetected by tests.

---

### m-3: `quality-review` progress event emitted AFTER review completes

**File:** `src/orchestration/generate.ts:492-494`

```typescript
if (validationResult.qualityReviewPasses > 0) {
  context.emitProgress("quality-review"); // emitted after work is done
}
```

All other stages emit their progress event *before* the work begins (`emitProgress("planning-modules")` → then call `planModules()`). Quality review is the only stage that announces itself after completion. For error paths, `ValidationAndReviewError` triggers `emitProgress("quality-review")` mid-catch block. Consumers monitoring progress events would receive the `quality-review` event at an unexpected point in the timeline.

---

### m-4: `costUsd` is optional in `DocumentationRunFailure` but always populated

**File:** `src/types/orchestration.ts:73`

```typescript
export interface DocumentationRunFailure extends DocumentationRunResultBase {
  ...
  costUsd?: number | null; // optional
}
```

`assembleFailureResult` in `RunContext` always assigns `costUsd: this.sdkAdapter.computeCost()`, so the field is never actually `undefined`. Declaring it optional forces callers to defensively handle `undefined` when it never occurs. The `DocumentationRunSuccess` type correctly declares `costUsd: number | null` (non-optional). Should be made non-optional on failure too.

---

### m-5: Duplicate filename collision detection between `generateModuleDocs` and `writeModuleTree`

**Files:** `src/orchestration/stages/module-generation.ts:182-213` and `src/orchestration/stages/module-tree-write.ts:53-69`

Both `getModuleFileNames` (in module-generation) and `buildModuleTree` (in module-tree-write) independently implement filename collision detection with separate error paths. In full generation, `generateModuleDocs` runs first and catches collisions, so `writeModuleTree` never sees them. But in update mode, `writeModuleTree` is only called when `overviewNeedsRegeneration` is true, and by that point module-generation has already run.

The duplication is defensive rather than harmful, but it creates two maintenance surfaces for the same invariant and slightly increases cognitive overhead when reading the code.

---

### m-6: `callOverrides` without `usage` silently sets `hasMissingUsage = true`

**File:** `test/helpers/agent-sdk-mock.ts:79-86`

```typescript
const usage = configuredResponse.usage ?? null;
if (usage) { ... } else { hasMissingUsage = true; }
```

When tests use `callOverrides` without providing `usage`, the mock marks all cost tracking as unavailable, causing `computeCost()` to return `null` for the entire run. This can surprise test authors who configure overrides for failure scenarios and don't realize it silently affects `costUsd`. Tests in `failure.test.ts` and `quality-review.test.ts` that use `callOverrides` don't check `costUsd`, so this has no current impact — but it's a gotcha for future test authors.

---

### m-7: `moduleNameToFileName` strips `/` to produce collision-prone names without guarantees

**File:** `src/types/generation.ts:22-28`

```typescript
export const moduleNameToFileName = (name: string): string => {
  return name
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "") // strips / and all non-alphanumeric-dash
    .concat(".md");
};
```

The regex removes `/` without replacement (not converting it to `-`), so `"my/module"` becomes `"mymodule.md"`, not `"my-module.md"`. This produces naming that is harder to read and more likely to collide with other modules (e.g., `"mymodule"` also becomes `"mymodule.md"`). The collision detection handles this correctly, but the naming behavior may be surprising. The test plan documents the `"my/module" → "mymodule.md"` expected value, so this is a known-and-accepted behavior — but worth noting as a design decision that differs from common practice (replacing `/` with `-`).

---

## TC Coverage Matrix

### Full Coverage Assessment

| TC Range | Tests Present | Status | Notes |
|----------|--------------|--------|-------|
| TC-1.1a–b | ✓ | Pass | |
| TC-1.2a–c | ✓ | Pass | |
| TC-1.3a–d | ✓ | Pass | |
| TC-1.4a–c | ✓ | Pass | |
| TC-1.5a–c | ✓ | Pass | |
| TC-1.6a–b | ✓ | Pass | |
| TC-1.7a–b | ✓ | Pass | |
| TC-1.8a | ⚠ | Misaligned | Test covers failure path, not the AC success path (see M-2) |
| TC-1.8b–c | ✓ | Pass | Covered as TC-4.6b/4.6c in quality-review.test.ts |
| TC-1.9a | ✓ | Pass | |
| TC-1.10a–b | ✓ | Pass | |
| TC-2.1a–c | ✓ | Pass | |
| TC-2.2a–d | ✓ | Pass | |
| TC-2.3a–d | ✓ | Pass | |
| TC-2.4a–b | ✓ | Pass | |
| TC-2.5a–c | ✓ | Pass | |
| TC-2.6a–c | ✓ | Pass | |
| TC-2.7a | ✓ | Pass | |
| TC-2.8a | ✓ | Pass | |
| TC-3.1a–c | ✓ | Pass | |
| TC-3.2a–b | ✓ | Pass | |
| TC-3.3a | ✓ | Pass | |
| TC-3.4a–d | ✓ | Pass | |
| TC-3.5a | ✓ | Pass | In failure.test.ts |
| TC-4.1a–b | ✓ | Pass | |
| TC-4.2a–d | ✓ | Pass | |
| TC-4.3a–c | ✓ | Pass | |
| TC-4.4a–b | ✓ | Pass | |
| TC-4.5a–c | ✓ | Pass | |
| TC-4.6a–c | ✓ | Pass | |
| TC-5.1a–b | ✓ | Pass | |
| TC-5.2a–c | ✓ | Pass | |
| TC-5.3a–b | ✓ | Pass | |
| TC-5.4a–b | ✓ | Pass | |
| TC-5.5a | ✓ | Pass | |

**82 TCs specified. 81 covered, 1 misaligned (TC-1.8a).**

---

## Architecture Compliance

### Positive Observations

1. **Discriminated union result type** — `DocumentationRunResult = DocumentationRunSuccess | DocumentationRunFailure` with `success: boolean` discriminant is cleanly implemented and consistently used throughout.

2. **Stage sequencing** — The pipeline flow (env check → analysis → planning → generation → overview → tree → validation/review → metadata) is correctly implemented and matches the tech design. Update mode correctly prepends `computing-changes` and skips planning.

3. **Adapter injection pattern** — `RunContext.setSDK()` and the `AgentSDKAdapter` interface enable clean test isolation. Mocking at the adapter boundary (not the SDK package) is correctly implemented.

4. **Metadata atomicity** — `metadata-write.ts` implements snapshot-based rollback: it captures the current state of both `.module-plan.json` and `.doc-meta.json` before writing, and restores them on partial failure. This correctly prevents half-updated state.

5. **`validateModulePlan` reuse** — Called in both `planModules` (after inference) and `mapToAffectedModules` (after update-mode restructuring) — appropriate reuse of the invariant checking logic.

6. **Path traversal protection in `resolvePatchPath`** — The quality review patch application correctly rejects paths outside the output directory using `path.relative(...).startsWith("..")` and `path.isAbsolute(relative)` checks.

7. **Best-effort progress delivery** — The try-catch in `RunContext.emitProgress` correctly silences progress callback failures without interrupting the run (verified by the "progress callback errors swallowed" test).

8. **Overview-for-update hydration** — `loadModuleDocsForOverview` correctly merges freshly-generated module docs with existing files from disk, avoiding redundant re-reads of just-written files.

### Architecture Gaps

1. **Real adapter absent** (see C-1): Architecture is designed for injection but the production path doesn't exist.

2. **`writing-module-tree` has no progress event** — The stage is present in `DocumentationStage` type and can fail (returned as `failedStage`), but no `context.emitProgress("writing-module-tree")` is called before writing the tree. This is consistent between implementation and test (TC-3.1b doesn't include this stage in expected events), so it appears intentional. If the spec intended consumers to observe this stage, it's missing.

3. **`runUpdateGeneration` has the `priorStateResult` read outside any announced stage** — Minor structural gap (see m-2 above).

---

## Test Quality Assessment

### Strengths

- **Helper infrastructure is excellent** — `createMockSDK` with schema-based query-type detection, `callOverrides`, `globalError`, and per-call module-generation responses is a well-designed test boundary. It avoids the brittleness of position-only call matching while providing fine-grained control.
- **`writePriorOutput` in update tests** — The programmatic output fixture builder (rather than static files) allows precise control of prior state and timestamp assertions. The `setFixedTimes` + `utimes` approach for TC-2.4a/2.4b (verifying which files were actually modified) is clean.
- **Real filesystem validation** — Most tests write to temp directories and verify actual file presence/absence. This is more trustworthy than pure mock assertion.
- **Shared boilerplate is appropriately duplicated** — `setupPipelineMocks`, `buildAnalysis`, `expectSuccess`/`expectFailure` are repeated across test files. While DRY advocates might consolidate this, the duplication keeps each test file self-contained and readable.

### Weaknesses

- **`pure-functions.test.ts` absent** (see M-1)
- **TC-1.8a misalignment** (see M-2)
- **No test for `moduleNameToFileName("")`** — The edge case is documented in the test plan but not covered anywhere.
- **`TC-3.2a` module-event order is implicitly correct** — The test asserts events ordered as `fiveModulePlan.modules.map(...)`, which happens to match alphabetical sort since `module-1`...`module-5` sort correctly. If a test were introduced with modules that sort differently from their declaration order, the assertion pattern could mislead. Not a bug, but a future maintenance trap.
- **`generate.test.ts` and `failure.test.ts` both import from `src/orchestration/generate.ts`** directly, while `generate.test.ts`, `progress.test.ts`, and `quality-review.test.ts` import from `src/index.js`. This inconsistency is minor but slightly confusing.

---

## Missing Items vs. Spec

| Item | Spec Reference | Status |
|------|---------------|--------|
| `pure-functions.test.ts` | test-plan.md § Pure Function Tests | Missing |
| `createAgentSDKAdapter` real impl | epic AC-1, tech-design § Agent SDK Adapter | Missing (stub only) |
| `"Auth Middleware"→"auth-middleware.md"` test | test-plan.md § Pure Function Tests | Missing |
| `""→".md"` edge case test | test-plan.md § Pure Function Tests | Missing |
| TC-1.8a success-path assertion | epic TC-1.8a | Misaligned |
| `LARGE_REPO_MODULE_THRESHOLD` usage | contracts/planning.ts:4 | Dead constant |
| Agent SDK integration test (manual) | test-plan.md § Integration Tests | Not in CI (by design per plan) |
| Update fixture directories (`valid-prior-output`, etc.) | test-plan.md § Fixture Architecture | Not present as static fixtures; replaced by programmatic `writePriorOutput` (acceptable alternative) |

---

## Recommended Actions

**Address before merge:**
1. **(C-1)** Decide and document whether `createAgentSDKAdapter` real implementation is in-scope for Epic 2 or a tracked future story. If in-scope, implement it. If deferred, add a `// TODO: Epic-N` comment and a tracking issue.
2. **(M-1)** Create `test/orchestration/pure-functions.test.ts` with the isolated `moduleNameToFileName` and `mapToAffectedModules` tests specified in the test plan.
3. **(M-2)** Fix or rename TC-1.8a: either add a success-path test that verifies `validationResult` is populated in a successful run, or rename the existing test to reflect what it actually tests.

**Nice-to-have before merge:**
4. **(M-3)** Remove `LARGE_REPO_MODULE_THRESHOLD` or add a comment explaining its intended future use.
5. **(m-2)** Emit `context.emitProgress("computing-changes")` before calling `readPriorGenerationState` in `runUpdateGeneration` to make the progress semantics consistent.
6. **(m-1)** Map SDK init failure to a more accurate `failedStage` (or accept the current behavior with a comment).

**Low priority / track for later:**
7. **(m-3)** Consider emitting `quality-review` progress before the review starts, not after.
8. **(m-4)** Make `costUsd` non-optional in `DocumentationRunFailure`.
9. **(m-6)** Document the `callOverrides`+missing-usage behavior in `agent-sdk-mock.ts`.
