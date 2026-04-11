# Technical Design: Graceful Degradation and Scoring Removal

## Context

This companion document covers two related domains that bookend the module generation stage: what happens when generation fails (graceful degradation), and what gets removed once agentic generation replaces the prediction-based approach (scoring and repair cleanup).

Today, module generation is all-or-nothing. The `generateModuleDocs()` function in `src/orchestration/stages/module-generation.ts` iterates modules sequentially, and any single module failure returns an `EngineResult` error that aborts the entire run. There is no per-module outcome tracking, no placeholder page for failed modules, and no way for a run to complete with partial results. A timeout on module 3 of 20 means modules 4 through 20 never generate, and the user gets nothing.

The scoring and repair machinery is the other side of the same architectural gap. Because the system cannot recover from generation failures, it front-loads effort into predicting what the model should produce (`selectModuleDocumentationPacket` with its 574 lines of scoring heuristics) and then retroactively fixing what the model actually produced (`normalizeOptionalPacketFields`, `isRecoverableModulePacketMismatch`, `buildModuleRepairPrompt`, `coerceSummaryOnlyModuleGenerationResult`). This machinery exists because the system treats a schema-violating response as a run-ending failure. Once per-module failures are survivable, the repair logic loses its purpose on the agentic path.

The design is split across two chunks that ship in sequence. Chunk 5 introduces graceful degradation: per-module error boundaries, placeholder pages, the `ModuleGenerationOutcome` type, the tri-state `RunStatus`, and CLI exit code mapping. Chunk 6 removes the scoring and repair functions from the agentic generation path while preserving them on the one-shot fallback until that path is separately deprecated.

**ACs covered:** AC-4.4, AC-6.1 through AC-6.3, AC-7.1 through AC-7.3

**Prerequisite chunks:** Chunk 4 (agent runtime must exist before degradation wraps it)

---

## High Altitude: How Degradation Fits Around Generation

The module generation stage sits in the middle of the pipeline. Upstream stages (analysis, classification, strategy, planning) have already completed. Downstream stages (overview generation, validation, metadata write) expect a set of module pages to exist on disk. The question this design answers is: what does "a set of module pages" mean when some modules failed?

The current contract is binary. `generateModuleDocs()` returns either `EngineResult<GeneratedModuleSet>` on success or an error. The orchestrator at `src/orchestration/generate.ts` checks `result.ok` and either continues to overview generation or aborts. There is no middle ground.

The new contract introduces a middle ground. `generateModuleDocs()` always completes (barring a catastrophic infrastructure failure like inability to write to disk). It returns a result that contains every module's outcome, including failures. Failed modules get placeholder pages written to disk so downstream stages have a consistent file set. The orchestrator examines aggregate outcomes to determine run status.

```
                    Current Flow
                    ============
  Module 1 OK
  Module 2 OK
  Module 3 FAIL ──► generateModuleDocs returns err() ──► run aborts
  Module 4-20 never attempted

                    New Flow
                    ========
  Module 1 OK     ──► outcome: success
  Module 2 OK     ──► outcome: success
  Module 3 FAIL   ──► write placeholder ──► outcome: failed
  Module 4 OK     ──► outcome: success
  ...
  Module 20 OK    ──► outcome: success
  ──► generateModuleDocs returns ok(results) ──► orchestrator evaluates status
      status = partial-success (1 of 20 failed, below threshold)
```

Overview generation, validation, and metadata write all proceed. Validation reports placeholder pages as warnings rather than errors. The final `DocumentationRunResult` carries per-module outcomes so the caller knows exactly what succeeded and what did not.

---

## Medium Altitude: Module Architecture

### File Changes

The degradation and cleanup work touches three layers of the existing codebase:

| File | Change | Chunk |
|------|--------|-------|
| `src/types/orchestration.ts` | Add `RunStatus`, `ModuleGenerationOutcome`, rewrite `DocumentationRunResult` | 5 |
| `src/orchestration/stages/module-generation.ts` | Replace early-return-on-error with per-module try/catch, add placeholder writes, collect outcomes | 5 |
| `src/orchestration/generate.ts` | Replace binary success/failure with tri-state status evaluation | 5 |
| `src/orchestration/stages/module-generation.ts` | Remove calls to scoring/repair functions from the agentic path | 6 |
| `src/orchestration/module-doc-packet.ts` | No deletion, but agentic path stops calling `selectModuleDocumentationPacket` | 6 |
| `src/cli/output.ts` (or equivalent) | Map `RunStatus` to exit codes and stderr warnings | 5 |

No new files are introduced. This is a refactoring of existing modules, not a new architectural layer.

### What Gets Preserved vs. Removed

The scoring and repair removal is scoped to the agentic generation path. The one-shot fallback retains the full repair chain because it is still the production path for providers that do not support tool use. This table shows the disposition of every function in the current repair machinery:

| Function | Location | Agentic Path | One-Shot Fallback |
|----------|----------|-------------|-------------------|
| `selectModuleDocumentationPacket()` | `module-doc-packet.ts` | Not called | Called (unchanged) |
| `buildModuleDocumentationFacts()` | `module-doc-packet.ts` | Called (input helper, retained) | Called (unchanged) |
| `normalizeOptionalPacketFields()` | `module-generation.ts` | Not called | Called (unchanged) |
| `isRecoverableModulePacketMismatch()` | `module-generation.ts` | Not called | Called (unchanged) |
| `buildModuleRepairPrompt()` | `module-generation.ts` | Not called | Called (unchanged) |
| `coerceSummaryOnlyModuleGenerationResult()` | `module-generation.ts` | Not called | Called (unchanged) |
| `renderModuleDocumentationPacket()` | `module-doc-packet.ts` | Not called (agent uses section buffer) | Called (unchanged) |
| `defaultEntityTable()` | `module-doc-packet.ts` | Not called | Called (unchanged) |
| `defaultFlowNotes()` | `module-doc-packet.ts` | Not called | Called (unchanged) |

The agentic path produces pages through the agent's `write_section` tool calls, assembled by the section buffer (designed in `td-agent-runtime.md`). It does not need pre-generation scoring because the agent reads actual source code and decides what sections to produce. It does not need post-generation repair because validation catches errors after assembly, and failures are survivable through graceful degradation.

The key insight: repair machinery is load-bearing only when failures are catastrophic. Once failures are survivable, repair becomes optimization rather than necessity. We remove it from the agentic path immediately and keep it on the one-shot path where failures were historically most frequent and the repair chain has proven value.

---

## Medium Altitude: Flow-by-Flow Design

### Flow A: Per-Module Error Handling (AC-4.4, AC-7.1)

This flow changes `generateModuleDocs()` from an early-return-on-error pattern to a collect-all-outcomes pattern. The existing function signature returns `EngineResult<GeneratedModuleSet>`. The new signature returns `EngineResult<ModuleGenerationStageResult>`, where the result always contains the full set of outcomes and the generated module map.

The per-module error boundary wraps the generation call for each module in a try/catch. When generation fails for any reason (provider error, timeout, invalid output, unexpected exception), the system:

1. Logs the failure with module name, generation path, and error details
2. Writes a placeholder page to disk at the expected file path
3. Records a `ModuleGenerationOutcome` with `status: "failed"` and `hasPlaceholderPage: true`
4. Continues to the next module

The placeholder page format is deliberately minimal. It preserves the module name as the title, lists the component paths that would have been documented, and includes a notice that generation failed. This gives downstream validation a real file to check (cross-links to this module resolve) and gives the user a breadcrumb showing what the module was supposed to contain.

```markdown
# Module Name

> This module page could not be generated. The components listed below are
> part of this module but their documentation is not yet available.

## Components

- src/path/to/component-a.ts
- src/path/to/component-b.ts
- src/path/to/component-c.ts
```

The placeholder page deliberately omits failure reasons (those belong in the run result, not in the published documentation). It is a valid markdown file that renders cleanly in any viewer.

Infrastructure-level failures that prevent any module from being attempted (e.g., the output directory cannot be created, the filename derivation has collisions) still return an `EngineResult` error immediately. The per-module error boundary only applies to individual module generation attempts.

**Timing behavior.** When a module times out (per AC-4.5, designed in `td-agent-runtime.md`), the timeout handler produces the same `failed` outcome as any other error. The error boundary does not distinguish between timeout and other failures at the outcome level; the distinction is captured in the `failureReason` string.

### Flow B: Run Result Assembly (AC-7.2)

After all modules have been attempted, the orchestrator assembles the `DocumentationRunResult`. The assembly logic is straightforward:

```
successCount = outcomes where status === "success"
failureCount = outcomes where status === "failed"
totalModules = outcomes.length

if failureCount > totalModules / 2:
    status = "failure"
else if failureCount > 0:
    status = "partial-success"
else:
    status = "success"
```

The "> half" threshold is intentionally generous. An even split (5 of 10 failed) is `partial-success`, not `failure`. The system errs toward reporting a usable result rather than discarding a run where half the docs are good. This threshold was specified in the epic and is not configurable.

The run result carries the full `moduleOutcomes` array regardless of status. A `failure` status means the run is considered unsuccessful overall, but all the individual outcomes and any generated pages are still available. The CLI maps status to exit codes: `success` and `partial-success` both exit 0, while `failure` exits 1. On `partial-success`, the CLI prints a warning to stderr listing the failed module names.

Downstream stages (overview generation, validation) proceed on `success` and `partial-success`. They skip on `failure`. This means a run with more than half its modules failing still writes whatever pages it managed to produce but does not attempt overview generation or validation against a clearly incomplete documentation set.

The existing `DocumentationRunSuccess` and `DocumentationRunFailure` types merge into a single `DocumentationRunResult` with a `status` discriminant instead of a `success` boolean. This is a breaking change to the run result type. All consumers of `DocumentationRunResult` need updating:

| Consumer | Change Required |
|----------|-----------------|
| `src/orchestration/generate.ts` | Produces new result shape |
| `src/cli/output.ts` | Maps `RunStatus` to exit code and output formatting |
| `test/orchestration/generate.test.ts` | Assertions updated for new shape |
| `test/cli/cli.test.ts` | Exit code assertions for partial-success |

The `success: boolean` field is removed entirely, not kept as a computed property. The `status` field is the single source of truth. This avoids the ambiguity of having both `success: true` and `status: "partial-success"` on the same object.

### Flow C: One-Shot Fallback (AC-7.3)

The one-shot fallback exists for providers that do not support tool use (detected by `provider.supportsToolUse()`, designed in `td-provider-tool-use.md`). When the provider lacks tool-use capability, module generation uses the existing `generateModulePage()` function with its full scoring and repair chain.

The critical design point is that graceful degradation applies identically on both paths. The per-module error boundary wraps both the agentic path and the one-shot path. A one-shot module failure produces the same `ModuleGenerationOutcome` shape, the same placeholder page, and the same continuation to the next module. The only difference in the outcome is the `generationPath` field: `"agentic"` vs `"one-shot"`.

This is a change from the current behavior where a one-shot failure aborts the run. The one-shot fallback path retains its repair logic (normalize, detect recoverable mismatch, repair prompt, coerce to summary-only), but when the repair chain is exhausted and the module still fails, it now produces a `failed` outcome with a placeholder instead of returning an error that kills the run.

The routing logic at the top of the per-module loop:

```
for each module:
    if provider.supportsToolUse():
        result = agenticGenerate(module, ...)
    else:
        result = oneShotGenerate(module, ...)   // existing generateModulePage

    if result is error:
        write placeholder
        record failed outcome
    else:
        record success outcome
```

The one-shot path does not receive any classification or strategy context in this design. It uses the same `selectModuleDocumentationPacket()` call as it does today. Classification and strategy are consumed by the agentic path only. This means the one-shot fallback is functionally identical to the current production behavior, plus graceful degradation.

### Flow D: Scoring Removal (AC-6.1 through AC-6.3)

Scoring removal is the simplest flow conceptually but requires careful surgical changes. The agentic generation path in `module-generation.ts` must not call any of the following functions:

- `selectModuleDocumentationPacket()` -- pre-generation scoring
- `normalizeOptionalPacketFields()` -- post-generation normalization
- `isRecoverableModulePacketMismatch()` -- repair detection
- `buildModuleRepairPrompt()` -- repair prompt construction
- `coerceSummaryOnlyModuleGenerationResult()` -- coercion fallback

The agentic path does still call `buildModuleDocumentationFacts()`. This function assembles entity candidates, flow candidates, relationship summaries, and source coverage from the analysis. These are input data, not predictions. The agent receives them as context and uses them to inform its documentation decisions.

The agentic path does not call `renderModuleDocumentationPacket()` either. Page assembly from agent output is handled by the section buffer (designed in `td-agent-runtime.md`), which assembles sections in canonical order after the agent finishes.

Validation (Mermaid syntax, cross-link resolution, required sections, metadata consistency) continues to run after generation, unchanged. Validation is the safety net that replaces the repair chain. The distinction: repair tries to fix bad output before it's final; validation reports bad output after it's final. With graceful degradation in place, a validation failure on a module does not kill the run -- it produces a warning or, in extreme cases, triggers the placeholder path.

The rendering functions (`renderModuleDocumentationPacket`, `renderEntityTable`, `renderFlowNotes`, `escapeMarkdownCell`) are retained because the one-shot fallback path uses them. They are not dead code. The scoring functions (`buildSelectionMetrics`, `buildSummaryOnlyReason`, `buildDowngradeReason`, and the scoring constants like `HIGH_VALUE_MODULE_NAME_PATTERNS`) are likewise retained for the one-shot path. No functions are deleted in this chunk.

What changes is the call graph. Before Chunk 6, there is one path through `generateModulePage` and it always calls scoring and repair. After Chunk 6, there are two entry points: `agenticGenerateModule()` (new, no scoring/repair) and the existing `generateModulePage()` (unchanged, full scoring/repair). The routing logic from Flow C determines which path executes.

---

## Low Altitude: Interface Definitions

### Run-Level Types

```typescript
/**
 * Tri-state run outcome. Replaces the binary success/failure discriminant.
 *
 * - "success": all modules generated successfully
 * - "partial-success": at least one module failed, but half or more succeeded
 * - "failure": more than half of modules failed
 */
type RunStatus = "success" | "partial-success" | "failure";

/**
 * Outcome of generating a single module's documentation page.
 * Every module in the plan produces exactly one outcome.
 */
interface ModuleGenerationOutcome {
  moduleName: string;
  status: "success" | "failed";
  generationPath: "agentic" | "one-shot";
  fileName: string;
  durationMs: number;
  turnCount?: number;
  toolCallCount?: number;
  failureReason?: string;
  hasPlaceholderPage?: boolean;
  observationCount?: number;
}

/**
 * Complete run result. This replaces the DocumentationRunSuccess |
 * DocumentationRunFailure union. The `status` field is the discriminant;
 * there is no `success` boolean.
 */
interface DocumentationRunResult {
  status: RunStatus;
  runId: string;
  mode: "full" | "update";
  moduleOutcomes: ModuleGenerationOutcome[];
  successCount: number;
  failureCount: number;
  totalDurationMs: number;
  warnings: string[];
  observationCount: number;
  costUsd: number | null;

  // Present when status is "success" or "partial-success"
  outputPath?: string;
  generatedFiles?: string[];
  modulePlan?: ModulePlan;
  validationResult?: ValidationResult;
  qualityReviewPasses?: number;
  commitHash?: string;

  // Present when status is "failure" and a pipeline-level error occurred
  failedStage?: DocumentationStage;
  error?: EngineError;
}
```

### Stage-Internal Types

```typescript
/**
 * Internal result of the module generation stage.
 * This is the return value of generateModuleDocs(), not exposed to CLI callers.
 */
interface ModuleGenerationStageResult {
  outcomes: ModuleGenerationOutcome[];
  generatedModules: GeneratedModuleSet;
  successCount: number;
  failureCount: number;
  totalDurationMs: number;
  observationCount: number;
}
```

### Status Evaluation

```typescript
/**
 * Determines run status from module outcomes.
 * Pure function, no side effects.
 */
function evaluateRunStatus(
  outcomes: ModuleGenerationOutcome[],
): RunStatus {
  const total = outcomes.length;
  const failureCount = outcomes.filter(o => o.status === "failed").length;

  if (failureCount > total / 2) return "failure";
  if (failureCount > 0) return "partial-success";
  return "success";
}
```

### Placeholder Page Builder

```typescript
/**
 * Creates a minimal markdown page for a module that failed to generate.
 * The page is valid markdown with the module title and component list.
 * Failure reasons are intentionally omitted -- they belong in the run result.
 */
function createFailedModulePlaceholder(
  moduleName: string,
  components: string[],
): string {
  const lines = [
    `# ${moduleName}`,
    "",
    "> This module page could not be generated. The components listed below are",
    "> part of this module but their documentation is not yet available.",
    "",
    "## Components",
    "",
    ...components.sort().map(c => `- ${c}`),
  ];
  return lines.join("\n");
}
```

### CLI Exit Code Mapping

```typescript
/**
 * Maps RunStatus to process exit code.
 * partial-success exits 0 because the user has usable output.
 * Warnings are printed to stderr separately.
 */
function exitCodeForStatus(status: RunStatus): number {
  switch (status) {
    case "success":
      return 0;
    case "partial-success":
      return 0;
    case "failure":
      return 1;
  }
}
```

---

## TC to Test Mapping

Each test case from the epic maps to a specific test file and approach. Tests are grouped by the flow they exercise.

### Flow A: Per-Module Error Handling

| TC | Test Description | File | Approach |
|----|-----------------|------|----------|
| TC-4.4a | Single module failure allows remaining modules to proceed | `test/orchestration/module-generation.test.ts` | Mock provider to fail on specific module index; verify all other modules generate |
| TC-4.4b | Failed module produces a placeholder page | `test/orchestration/module-generation.test.ts` | Trigger failure on one module; verify placeholder file on disk with expected content |
| TC-4.4c | Run result reports per-module outcomes | `test/orchestration/module-generation.test.ts` | Run with mixed success/failure; assert `moduleOutcomes` array has correct length, statuses, and generation paths |
| TC-7.1a | Placeholder written on agent timeout | `test/orchestration/module-generation.test.ts` | Configure short timeout; verify placeholder written and outcome has `failureReason` containing "timeout" |
| TC-7.1b | Placeholder written on agent error | `test/orchestration/module-generation.test.ts` | Mock provider to throw; verify placeholder written and outcome records error |
| TC-7.1c | Placeholder written on one-shot fallback failure | `test/orchestration/module-generation.test.ts` | Use mock provider without tool-use support; fail one-shot generation; verify placeholder and continuation |

### Flow B: Run Result Assembly

| TC | Test Description | File | Approach |
|----|-----------------|------|----------|
| TC-7.2a | Run succeeds with warnings when 1 of 10 modules fails | `test/orchestration/generate.test.ts` | 10-module plan with 1 failure; assert `status: "partial-success"`, 9 success + 1 placeholder |
| TC-7.2b | Run fails when more than half of modules fail | `test/orchestration/generate.test.ts` | 10-module plan with 6 failures; assert `status: "failure"` |
| TC-7.2c | All modules succeed | `test/orchestration/generate.test.ts` | 10-module plan with 0 failures; assert `status: "success"` |
| -- | Even split is partial-success (boundary) | `test/orchestration/generate.test.ts` | 10-module plan with 5 failures; assert `status: "partial-success"` (not failure) |
| -- | Status evaluation pure function | `test/orchestration/generate.test.ts` | Unit test `evaluateRunStatus()` with edge cases: 0 modules, 1 module fail, all fail, boundary cases |

### Flow C: One-Shot Fallback

| TC | Test Description | File | Approach |
|----|-----------------|------|----------|
| TC-7.3a | One-shot path used when provider lacks tool-use capability | `test/orchestration/module-generation.test.ts` | Mock provider with `supportsToolUse() = false`; verify `generateModulePage` (one-shot) called, not agentic path |
| TC-7.3b | Per-module outcomes reported same way on both paths | `test/orchestration/module-generation.test.ts` | Run two modules, one on each path; verify both outcomes have identical shape, differing only in `generationPath` |

### Flow D: Scoring Removal

| TC | Test Description | File | Approach |
|----|-----------------|------|----------|
| TC-6.1a | No pre-generation section prediction on agentic path | `test/orchestration/module-generation.test.ts` | Spy on `selectModuleDocumentationPacket`; run agentic generation; verify spy not called |
| TC-6.1b | No inline repair on agent output | `test/orchestration/module-generation.test.ts` | Spy on `normalizeOptionalPacketFields` and `buildModuleRepairPrompt`; run agentic generation; verify spies not called |
| TC-6.2a | Rendering from agent-produced sections matches expected format | `test/agent/section-buffer.test.ts` | Feed sections to buffer assembler; verify markdown output structure |
| TC-6.2b | Rendering handles partial sections | `test/agent/section-buffer.test.ts` | Feed only overview + responsibilities; verify no empty diagram placeholders in output |
| TC-6.3a | Invalid Mermaid still caught by validation | `test/orchestration/generate.test.ts` | Generate page with bad Mermaid; run validation; verify error reported |
| TC-6.3b | Missing overview still caught by validation | `test/orchestration/generate.test.ts` | Generate page without overview; run validation; verify error reported |

### CLI Exit Code Tests

| TC | Test Description | File | Approach |
|----|-----------------|------|----------|
| -- | success exits 0 | `test/cli/cli.test.ts` | Full pipeline run with all modules succeeding; assert exit code 0 |
| -- | partial-success exits 0 with stderr warning | `test/cli/cli.test.ts` | Full pipeline run with 1 module failing; assert exit code 0, stderr contains failed module name |
| -- | failure exits 1 | `test/cli/cli.test.ts` | Full pipeline run with majority failure; assert exit code 1 |

### Test Count Estimate

| Area | New Tests | Modified Tests | Total |
|------|-----------|---------------|-------|
| Per-module error handling (Flow A) | 6 | 0 | 6 |
| Run result assembly (Flow B) | 5 | 2 | 7 |
| One-shot fallback (Flow C) | 2 | 0 | 2 |
| Scoring removal (Flow D) | 6 | 0 | 6 |
| CLI exit codes | 3 | 1 | 4 |
| **Total** | **22** | **3** | **25** |

---

## Chunk Breakdown

### Chunk 5: Graceful Degradation

**Goal:** Module generation failures are survivable. Runs complete with partial results. Per-module outcomes are tracked.

**Prerequisite:** Chunk 4 (agent runtime exists and can generate module pages)

**Scope:**

1. Add `RunStatus`, `ModuleGenerationOutcome`, and `ModuleGenerationStageResult` types to `src/types/orchestration.ts`
2. Rewrite `DocumentationRunResult` from a success/failure union to a single interface with `status: RunStatus`
3. Refactor `generateModuleDocs()` to wrap each module in a try/catch, collect outcomes, write placeholders for failures
4. Add `createFailedModulePlaceholder()` function (replaces the existing `createPlaceholderModulePage` which is for empty-component modules, a different case)
5. Add `evaluateRunStatus()` pure function
6. Update `src/orchestration/generate.ts` to use the new result shape and to continue to overview/validation on `partial-success`
7. Update CLI output to map `RunStatus` to exit codes and print warnings to stderr on `partial-success`
8. Update all existing tests that assert on `DocumentationRunResult` shape

**Verification:** `npm run verify` (format, lint, typecheck, test). The breaking type change means every consumer must be updated before typecheck passes.

**Estimated size:** ~300 lines changed, ~150 lines of new tests

### Chunk 6: Scoring and Repair Removal (Agentic Path)

**Goal:** The agentic generation path does not call pre-generation scoring or post-generation repair functions. Validation remains the quality gate.

**Prerequisite:** Chunk 4 (agentic path exists), Chunk 5 (graceful degradation handles failures that validation catches)

**Scope:**

1. Ensure the agentic generation entry point (`agenticGenerateModule` or equivalent from Chunk 4) does not import or call scoring/repair functions
2. Verify that `buildModuleDocumentationFacts()` is still called by the agentic path (it provides entity candidates and relationship data as context)
3. Verify that the one-shot fallback path still calls the full scoring/repair chain unchanged
4. Add spy-based tests confirming the agentic path does not invoke scoring/repair
5. Add tests confirming validation still catches bad output regardless of generation path

**Verification:** `npm run verify`. All existing one-shot tests continue to pass because the one-shot path is unchanged.

**Estimated size:** ~100 lines changed (mostly routing logic), ~80 lines of new tests

**Why this is a separate chunk from Chunk 5:** Scoring removal is a no-op without the agentic path, and it is safe to ship only after graceful degradation proves that validation-caught errors are survivable. Separating the chunks lets the team validate degradation behavior independently before removing the repair safety net.

---

## Design Notes

**Why not delete the scoring functions entirely?** The one-shot fallback path is the production path for OpenRouter and any future provider that does not support tool use. Deleting the scoring and repair chain would mean one-shot failures are unrecoverable. The functions stay alive until the one-shot path is separately deprecated, which is out of scope for this epic.

**Why not make the failure threshold configurable?** The epic specifies "> half" as the threshold. Making it configurable adds surface area (CLI flag, config file field, documentation) for marginal value. If a team wants stricter control, they can inspect the `moduleOutcomes` array in the JSON output and apply their own threshold. The built-in threshold is intentionally generous because partial documentation is better than no documentation.

**Why does partial-success exit 0?** A non-zero exit code in CI pipelines typically means "stop the build." Documentation generation with a few failed modules is a warning, not a build-breaker. Users who want strict behavior can check the JSON output's `status` field or count the failures in `moduleOutcomes`. Exiting 0 with stderr warnings follows the convention established by tools like `eslint --max-warnings` and `tsc` with non-blocking diagnostics.

**Why are failure reasons excluded from placeholder pages?** Placeholder pages are published documentation artifacts. They may be committed to a repository, served on an internal wiki, or read by developers who did not run the generation. Error messages about provider timeouts or schema violations are operational noise in that context. The run result (available via JSON output or CLI stderr) is the appropriate channel for failure diagnostics.
