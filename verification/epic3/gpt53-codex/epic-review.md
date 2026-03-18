# Epic 3 — Full Codebase Verification Review
**Model:** gpt-5.3-codex
**Date:** 2026-03-16
**Scope:** All Epic 3 source, tests, and specifications

## Executive Summary
Epic 3 implementation is largely complete and the targeted suite passes (`10 files, 87 passed, 6 skipped`), with strong module boundaries and publish-flow test depth. The main risks are spec-contract drift in CLI error semantics and publish defaults, plus a publish error-handling gap where adapter throws can escape the `EngineResult` contract. Coverage is broad, but several acceptance-criteria checks are skipped or weakly asserted.

## Findings by Severity

### P1 — Critical (must fix before merge)
**[ERROR HANDLING] Publish adapter exceptions can escape the SDK contract** — `publishDocumentation()` assumes adapter methods always return `EngineResult`, but adapter methods can throw (for example timeout/spawn errors), causing uncaught exceptions instead of structured `PUBLISH_ERROR` results. This breaks the Epic 3 structured-failure contract for SDK consumers. `code-wiki-gen/src/adapters/gh.ts:24`, `code-wiki-gen/src/publish/publish.ts:33`, `code-wiki-gen/src/publish/publish.ts:78`. Recommendation: wrap adapter calls in try/catch at adapter and/or publish-orchestrator boundaries and normalize to `err("PUBLISH_ERROR", ...)`; add tests for thrown adapter failures.

**[SPEC COMPLIANCE] `docs check` missing-dependency path does not return structured error as specified** — Spec AC-2.5/TC-2.5a/b and AC-6.2b describe `DEPENDENCY_MISSING` structured error output, but current behavior emits a successful envelope with `passed: false` findings instead. `code-wiki-gen/src/commands/check.ts:44`, `code-wiki-gen/src/cli/output.ts:11`, `code-wiki-gen/test/cli/failure.test.ts:59`, `docs/documentation-engine/epic-3/epic.md:251`, `docs/documentation-engine/epic-3/epic.md:559`. Recommendation: either (1) align implementation to structured error semantics for dependency failures, or (2) formally update spec/TCs and downstream contracts to match findings-based semantics.

### P2 — Important (should fix soon)
**[SPEC COMPLIANCE] CLI publish default conflicts with contract (`createPullRequest` should default true)** — CLI sets `--create-pr` default false and merger coerces absent value to `false`, but Epic/Tech Design contract states default true. `code-wiki-gen/src/commands/publish.ts:31`, `code-wiki-gen/src/cli/config-merger.ts:110`, `docs/documentation-engine/epic-3/epic.md:613`, `docs/documentation-engine/epic-3/tech-design.md:1082`. Recommendation: make CLI default align with SDK contract (default true), and add an explicit opt-out flag (`--no-create-pr`) if needed.

**[CORRECTNESS] Publish preflight metadata validation is syntactic-only** — preflight accepts any JSON metadata without shape validation, so semantically invalid `.doc-meta.json` can pass AC-4.3 checks. `code-wiki-gen/src/publish/preflight.ts:49`. Recommendation: validate metadata schema/shape (reuse existing metadata validation path) before branch operations.

**[TEST COVERAGE] Key AC checks are skipped or non-assertive** — TC-1.4a is placeholder (`expect(true).toBe(true)`), and some inference-gated tests only assert exit code instead of payload parity/argument plumbing. `code-wiki-gen/test/cli/commands.test.ts:319`, `code-wiki-gen/test/cli/commands.test.ts:297`, `code-wiki-gen/test/cli/commands.test.ts:327`. Recommendation: replace placeholders with deterministic contract assertions (mocked SDK where needed) and keep smoke inference tests optional.

### P3 — Minor (nice to have)
**[CONTRACT ENFORCEMENT] Publish zod schemas are defined but not exercised in runtime path** — publish request/result schemas exist but are not used by publish orchestration or tests. `code-wiki-gen/src/contracts/publish.ts:3`. Recommendation: apply schema parsing at boundary points (CLI input to SDK, publish result construction) or remove contract claims from docs.

## Spec Compliance Matrix
| Acceptance Criterion | Status | Notes |
|---|---|---|
| AC-1.1 Seven CLI commands map to SDK ops | ✅ | Implemented and covered in command tests. |
| AC-1.2 Command arguments map to request types | ✅ | Implemented; some assertions are shallow for inference-gated paths. |
| AC-1.3 CLI/config/default merge precedence | ✅ | Implemented via config-merger + resolver path. |
| AC-1.4 CLI delegates and matches SDK results | ⚠️ | TC-1.4b is strong; TC-1.4a is placeholder/skip-gated. |
| AC-2.1 `--json` outputs `CliResultEnvelope` | ✅ | Implemented and tested broadly. |
| AC-2.2 Human-readable output mode | ✅ | Implemented for status/validation/run/publish. |
| AC-2.3 Progress rendering for generate/update | ✅ | Implemented; live tests are auth-gated. |
| AC-2.4 Exit code semantics (0/1/2) | ✅ | Implemented and tested. |
| AC-2.5 Structured error output includes code/message/context | ❌ | `docs check` dependency failures are findings-based, not structured error envelopes. |
| AC-3.1 Public entry point exports operations/types | ✅ | Verified via `sdk-contract.test.ts`. |
| AC-3.2 Progress events sufficient for stage-aware UI | ✅ | Stage/module/final-event assertions present. |
| AC-3.3 Status shape supports tab render states | ✅ | not_generated/stale/current covered. |
| AC-3.4 Run result supports persistence use-cases | ✅ | success/failure/cost-null cases covered. |
| AC-3.5 Structured-data-only consumer contract | ✅ | Covered by SDK contract tests. |
| AC-4.1 Publish is standalone from generation/update | ✅ | Verified via publish tests. |
| AC-4.2 Branch/commit/push/optional PR flow | ⚠️ | Core flow works; CLI default PR behavior drifts from contract default. |
| AC-4.3 Preflight verifies output + valid metadata | ⚠️ | Metadata validation is JSON parse only (shape not enforced). |
| AC-4.4 Structured `PublishResult` fields | ✅ | Populated and tested with/without PR. |
| AC-4.5 No unrelated mutation; branch context preserved | ✅ | Real git integration tests validate preservation/doc-only commit. |
| AC-4.6 `gh` required only when PR requested | ✅ | Implemented and tested for requested/non-requested cases. |
| AC-4.7 Structured failures for missing remote/push rejection | ✅ | Implemented and tested. |
| AC-5.1 CLI fixture smoke verifiability | ✅ | status/check/validate smoke tests present. |
| AC-5.2 SDK callable without app runtime | ✅ | Import/callability tests present. |
| AC-5.3 TS fixture supports E2E verification | ✅ | analyze + generation output structure covered. |
| AC-5.4 Deterministic structure across runs | ✅ | file list + module-tree determinism covered. |
| AC-6.1 Consistent CLI/SDK failure surfacing | ✅ | PATH_ERROR parity and exit-code behavior covered. |
| AC-6.2 Failed stage + actionable recovery guidance | ⚠️ | Stage/recovery guidance mostly covered; dependency path uses findings, not structured error. |
| AC-6.3 Inspectable state after generation/update failure | ✅ | metadata/state preservation tests present. |

## Test Coverage Assessment
Coverage is strong across publish flow and SDK contract behavior, and all 10 requested files pass in a targeted run. Gaps remain in AC-critical assertions: 6 tests are skipped by default, TC-1.4a is a placeholder, and several CLI inference tests only assert exit code rather than payload equivalence/argument plumbing. Missing tests include: publish adapter-throw normalization, metadata shape-invalid preflight rejection, and CLI default PR behavior contract.

## Architecture Notes
CLI/command/publish/adapters boundaries are generally clean, and publish dependency injection (`git`/`gh` adapters) is a strong testability choice. The main architectural weakness is contract enforcement at boundaries: publish orchestration expects `EngineResult` returns but does not defend against thrown adapter exceptions. Preflight and branch-manager responsibilities are mostly sensible, but output-path-in-repo validation occurs late (inside branch manager), after branch/worktree operations may already begin.

## Recommendations
1. Normalize all publish-path failures to `EngineResult` (`PUBLISH_ERROR`) by catching adapter exceptions in `publishDocumentation()` and adapters.
2. Resolve the spec/implementation mismatch for `docs check` dependency failures (structured error vs findings-based result) and update either code or spec/TCs accordingly.
3. Align CLI publish default behavior with `createPullRequest` default-true contract, including explicit opt-out behavior.
4. Upgrade preflight metadata checks from JSON parse to schema/shape validation.
5. Replace placeholder/skip-only AC tests with deterministic assertions that can run in CI without live inference.
