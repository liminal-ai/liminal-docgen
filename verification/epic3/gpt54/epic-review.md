# Epic 3 — Full Codebase Verification Review
**Reviewer:** GPT-5.4 (Codex)
**Date:** 2026-03-16
**Scope:** CLI & Publish Pipeline — all source and test files

## Executive Summary
Epic 3 is close, but it is not cleanly shippable as implemented. The CLI surface is generally thin and well-factored, the public SDK export surface is coherent, and the publish flow is decomposed into sensible modules (`preflight`, `branch-manager`, `pr-creator`). The test suite is also broad enough to create a strong first impression: the listed CLI and integration suites are extensive, and most happy-path coverage is present.

That said, the review turned up a publish correctness bug that undermines the core contract of the epic: the publish branch does not mirror the current documentation output when files were deleted, and delete-only publishes can fail with `nothing to commit` while stale files remain on the publish branch. I also found contract-level drift between the specs and the CLI `check` implementation, a cancellation design that stops only after the full SDK run rather than between stages, and preflight validation that treats any parseable `.doc-meta.json` as “valid metadata”. These are not stylistic nits; they are places where the implementation no longer matches the Epic/Tech Design source of truth.

The tests currently overstate confidence. Several mapped TCs are either placeholders, only partially asserted, or exercise a different scenario than the spec names. So while the existing suites mostly pass, they do not yet prove full conformance to Epic 3 as written.

## Findings by Severity

### P1 — Critical (blocks ship)
1. Publish does not stage deletions from the documentation output, so stale docs survive on the publish branch and delete-only publishes can fail outright.  
   File: `code-wiki-gen/src/publish/branch-manager.ts:78`, `code-wiki-gen/src/publish/branch-manager.ts:97`, `code-wiki-gen/src/publish/branch-manager.ts:133`, `code-wiki-gen/src/publish/preflight.ts:100`  
   Description: `createDocsBranch()` copies only the files that currently exist in `filesForCommit` and stages only those paths. It never removes files that existed on the base branch but have been deleted from the current output directory. In practice this means a stale page like `docs/wiki/old.md` remains on the publish branch forever; if deletion is the only change, `git commit` sees a clean tree and publish fails with `Failed to commit documentation changes`. That breaks the Epic’s requirement that publish operate on “whatever documentation currently exists in the output directory” and violates the branch/file correctness expected by AC-4.2 and AC-4.5.  
   Spec reference: `docs/documentation-engine/epic-3/epic.md:348`, `docs/documentation-engine/epic-3/epic.md:367`, `docs/documentation-engine/epic-3/epic.md:442`, `docs/documentation-engine/epic-3/tech-design.md:846`, `docs/documentation-engine/epic-3/tech-design.md:884`  
   Suggested fix: make the worktree output directory mirror the source output directory exactly before staging, then use `git add -A <output-relative-path>` so deletions are committed.

### P2 — Major (should fix before ship)
1. Invalid `outputPath` values outside the repo are rejected only after publish has already created a worktree and local branch.  
   File: `code-wiki-gen/src/publish/branch-manager.ts:40`, `code-wiki-gen/src/publish/branch-manager.ts:49`, `code-wiki-gen/src/publish/branch-manager.ts:64`, `code-wiki-gen/src/publish/preflight.ts:100`  
   Description: repo containment is not validated in preflight. `publishDocumentation()` proceeds into `createDocsBranch()`, creates the worktree, creates the branch, and only then checks whether `outputPath` is inside the repository. A bad request therefore mutates repo state before returning `PUBLISH_ERROR`, which conflicts with the publish isolation guarantees on failure paths.  
   Spec reference: `docs/documentation-engine/epic-3/epic.md:356`, `docs/documentation-engine/epic-3/epic.md:438`, `docs/documentation-engine/epic-3/stories.md:581`, `docs/documentation-engine/epic-3/tech-design.md:834`  
   Suggested fix: move the “output path must live inside repo” check into `runPreflight()` before any git mutation.

2. `docs check` does not implement the specified structured error contract for missing dependencies.  
   File: `code-wiki-gen/src/commands/check.ts:29`, `code-wiki-gen/src/commands/check.ts:44`, `code-wiki-gen/src/commands/check.ts:50`, `code-wiki-gen/src/cli/output.ts:45`  
   Description: when Python is missing, `checkEnvironment()` returns `ok({ passed: false, findings: [...] })`, and the CLI emits `success: true` JSON plus human-readable summary output on stdout. The Epic and Story text for TC-2.5a/b and TC-6.1b expect a structured `DEPENDENCY_MISSING` error code/message surface instead. Right now the CLI contract for dependency failure is materially different from the documented one.  
   Spec reference: `docs/documentation-engine/epic-3/epic.md:249`, `docs/documentation-engine/epic-3/epic.md:255`, `docs/documentation-engine/epic-3/stories.md:247`, `docs/documentation-engine/epic-3/stories.md:801`, `docs/documentation-engine/epic-3/test-plan.md:328`, `docs/documentation-engine/epic-3/test-plan.md:490`  
   Suggested fix: either change the CLI to wrap failed environment checks into a structured error envelope/stderr error path, or update the SDK/spec so there is a single consistent contract.

3. SIGINT handling never stops the pipeline between stages; cancellation is only checked before and after the entire SDK call.  
   File: `code-wiki-gen/src/cli/cancellation.ts:38`, `code-wiki-gen/src/cli/cancellation.ts:42`, `code-wiki-gen/src/commands/generate.ts:76`, `code-wiki-gen/src/commands/generate.ts:80`, `code-wiki-gen/src/commands/update.ts:76`, `code-wiki-gen/src/commands/update.ts:80`  
   Description: the cancellation flag is set on `SIGINT`, but the only checks are `finalizeCancellation()` immediately before and after `generateDocumentation()`. `isCancelled()` is never used by orchestration code, so Ctrl+C does not prevent later stages or later Agent SDK sessions from starting once the overall run is underway. That is weaker than the design, which explicitly says the current session may finish but new stages should not start.  
   Spec reference: `docs/documentation-engine/epic-3/tech-design.md:53`, `docs/documentation-engine/epic-3/tech-design.md:1259`, `docs/documentation-engine/epic-3/stories.md:300`, `docs/documentation-engine/epic-3/stories.md:338`  
   Suggested fix: thread a cancellation predicate into the orchestration layer and check it at stage boundaries before starting additional work.

4. Publish preflight treats any parseable `.doc-meta.json` as valid metadata.  
   File: `code-wiki-gen/src/publish/preflight.ts:49`  
   Description: the check is `readFile` + `JSON.parse` only. `{}` and other shape-invalid metadata pass preflight and can be published successfully. That is not “valid metadata” by the Epic’s wording, and it bypasses the shared metadata reader/contract the tech design names as the dependency for this module.  
   Spec reference: `docs/documentation-engine/epic-3/epic.md:410`, `docs/documentation-engine/epic-3/stories.md:553`, `docs/documentation-engine/epic-3/tech-design.md:341`  
   Suggested fix: validate metadata with the Epic 1 reader/schema instead of raw JSON parsing.

### P3 — Minor (fix when convenient)
1. Publish hard-requires `.module-plan.json`, even though Story 4 defines publish validity around output existence and valid metadata, not module-plan presence.  
   File: `code-wiki-gen/src/publish/preflight.ts:64`, `code-wiki-gen/test/integration/publish.test.ts:761`  
   Description: this adds a stricter publish precondition than the Epic/Story contract states. If intentional, the spec should say so; if not, this is unnecessary coupling between publish and an internal generation artifact.  
   Spec reference: `docs/documentation-engine/epic-3/epic.md:410`, `docs/documentation-engine/epic-3/stories.md:553`, `docs/documentation-engine/epic-3/tech-design.md:341`  
   Suggested fix: either remove the requirement or formalize it in the publish contract and acceptance criteria.

2. TC-1.4a is effectively untested because the mapped test is a placeholder.  
   File: `code-wiki-gen/test/cli/commands.test.ts:319`  
   Description: the test body is `expect(true).toBe(true)`, so the key CLI-to-SDK parity requirement for `generate` is not verified. This is especially risky because the CLI already has contract drift in other areas.  
   Spec reference: `docs/documentation-engine/epic-3/epic.md:167`, `docs/documentation-engine/epic-3/test-plan.md:312`  
   Suggested fix: replace the placeholder with a real subprocess-vs-SDK parity assertion.

3. The mapped TC-2.5 tests exercise publish failures, not the specified missing-Python `check` scenario.  
   File: `code-wiki-gen/test/cli/output.test.ts:140`, `code-wiki-gen/test/cli/output.test.ts:160`  
   Description: these tests currently verify `PUBLISH_ERROR`, which is a different failure path than the one named in the acceptance criteria and test plan. That mismatch helps the `docs check` contract drift go unnoticed.  
   Spec reference: `docs/documentation-engine/epic-3/epic.md:251`, `docs/documentation-engine/epic-3/test-plan.md:328`  
   Suggested fix: add the actual missing-Python subprocess scenario here and keep publish failure assertions as non-TC coverage.

4. Progress coverage is `generate`-only; `update` is not verified at either the CLI or SDK-contract layer.  
   File: `code-wiki-gen/test/cli/progress.test.ts:94`, `code-wiki-gen/test/integration/sdk-contract.test.ts:382`  
   Description: AC-2.3 and AC-3.2 both explicitly cover generate and update, but the tests only exercise full-generation progress. This leaves the update path unproven for stage rendering and event completeness.  
   Spec reference: `docs/documentation-engine/epic-3/epic.md:215`, `docs/documentation-engine/epic-3/epic.md:285`, `docs/documentation-engine/epic-3/test-plan.md:350`, `docs/documentation-engine/epic-3/stories.md:399`  
   Suggested fix: add update-mode progress tests at both the subprocess and SDK callback layers.

### P4 — Nitpick / Style
1. `relativeOutputPath` is computed in `createDocsBranch()` but never used beyond a late safety check.  
   File: `code-wiki-gen/src/publish/branch-manager.ts:59`  
   Description: the variable exists only to validate repo containment, then the code proceeds to copy/stage using `filesForCommit`. This is a small readability smell that also hints the containment check is sitting in the wrong layer.  
   Spec reference: none  
   Suggested fix: move the validation into preflight and either remove the variable or reuse it for output-root cleanup/staging.

## Spec Conformance Matrix
| Requirement (from epic/tech-design) | Status | Notes |
|--------------------------------------|--------|-------|
| Seven CLI commands exist and are invocable | Pass | `src/cli.ts` wires all seven commands; help/usage behavior is covered. |
| CLI argument parsing matches request types | Partial | Core wiring is present, but mapped tests do not fully prove propagation for `publish`, `generate`, `update`, include/exclude/focus. |
| Config resolution is CLI > config file > defaults | Pass | `cli/config-merger.ts` correctly delegates to Epic 1 resolver and resolves `--config` from CWD. |
| CLI is a thin wrapper over SDK operations | Partial | Command modules are thin, but `docs check` and JSON failure handling drift from the documented contract. |
| JSON mode emits one parseable `CliResultEnvelope` and suppresses progress | Pass | Output/progress implementation matches this for exercised paths. |
| Human-readable mode is scannable and writes progress to stderr | Pass | Status/validation/progress formatting is readable and stderr-separated. |
| Long-running commands render progress for `generate` and `update` | Partial | Renderer exists, but only `generate` is verified and cancellation semantics are incomplete. |
| CLI exit codes distinguish success / operational failure / usage / SIGINT | Partial | Numeric mapping exists, but SIGINT handling does not stop between stages as designed. |
| Error output includes code, message, and context | Partial | Works for many EngineError paths, but `docs check` dependency failures do not follow this contract. |
| Public SDK entry point re-exports operations and types | Pass | `src/index.ts` and integration tests cover this well. |
| Progress events are sufficient for stage-aware UI | Partial | Generate path is covered; update path is not verified. |
| `getDocumentationStatus()` supports not_generated / stale / current render states | Pass | Implementation and tests align. |
| `DocumentationRunResult` is persistence-ready | Pass | Success/failure fields and null-cost behavior are covered. |
| Publish is separate from generate/update | Pass | `publishDocumentation()` does not trigger generation. |
| Publish validates output exists and metadata is valid before git mutation | Fail | Metadata validation is shallow, and outside-repo `outputPath` is rejected after branch creation. |
| Publish uses worktree isolation and preserves caller context | Partial | Success-path preservation looks good; failure-path mutation leaks remain. |
| Publish commits the current documentation state only | Fail | Deleted docs are not staged as deletions; stale files can remain on the branch. |
| PR creation depends on `gh` only when requested | Pass | Push-only publish skips `gh`; PR path checks availability. |
| No-remote / push-rejected publish failures surface as structured errors | Pass | These paths are implemented and tested. |
| Epic 3 test harness verifies CLI/SDK/publish behavior outside the app | Partial | Broad coverage exists, but several mapped TCs are placeholders, mis-mapped, or only partially asserted. |

## Test Coverage Assessment
The suite is broad, but it is not as spec-complete as the test names suggest.

The most serious gap is `TC-1.4a`: `code-wiki-gen/test/cli/commands.test.ts:319` is a placeholder and provides no real CLI-vs-SDK parity proof for `generate`. `TC-1.2d` and `TC-1.2e` also do not actually assert that the required argument values reached the SDK shape; they mostly assert that the command exited. That leaves the core “thin CLI” contract under-verified for the commands most likely to drift.

`TC-2.5a` and `TC-2.5b` are mis-mapped. The test plan explicitly names missing-Python `docs check` coverage, but `code-wiki-gen/test/cli/output.test.ts:140` and `code-wiki-gen/test/cli/output.test.ts:160` verify publish errors instead. That gap matters because the actual `docs check` behavior already deviates from the spec and the current tests never catch it.

Progress coverage is also incomplete relative to the written ACs. `code-wiki-gen/test/cli/progress.test.ts:94` and `code-wiki-gen/test/integration/sdk-contract.test.ts:382` cover `generate`, but not `update`, even though both AC-2.3 and AC-3.2 explicitly include the update path. On the publish side, success-path worktree preservation is tested with real git, but failure-path preservation is not equivalently exercised with a real worktree. Determinism coverage is directionally useful, but `code-wiki-gen/test/integration/determinism.test.ts:133` only compares top-level file names and `module-tree.json`; it would not catch nested output determinism regressions.

## Architecture & Design Quality
The module boundaries are mostly good. The CLI utilities are small and readable, command modules are thin, and the publish flow is separated into preflight, branch, and PR concerns in a way that is easy to reason about. The public SDK entry point is also clean and appropriately minimal.

Where the design slips is in enforcement location and shared-contract reuse. The repo-containment safety check lives in `branch-manager.ts` instead of preflight, which is how a bad request can mutate git state before failing. `publish/preflight.ts` also bypasses the metadata reader/schema contract and falls back to raw `JSON.parse`, weakening type safety exactly at a trust boundary. Cancellation is similarly isolated in a tidy helper, but not actually integrated into the orchestration lifecycle the design describes.

TypeScript usage is otherwise solid. The code avoids unsafe casts in the core implementation, the publish adapter interfaces are explicit, and the CLI/output helpers are straightforward to test. The biggest architectural issue is not maintainability; it is that a few key invariants are enforced too late or not at all.

## Cross-Cutting Concerns
Security / safety: publish accepts shape-invalid metadata and can create a branch before rejecting an out-of-repo output path. Neither is a classic security issue, but both are trust-boundary problems that weaken operator expectations.

Error handling: most EngineError-based paths are structured and consistent, but `docs check` is the notable exception. That inconsistency leaks into both human and JSON modes and undermines the “structured contract, not console parsing” story for operators and scripts.

Logging / operator UX: the stdout/stderr split is good. Progress rendering is intentionally simple and should behave well in CI/pipes. The cancellation UX message is also reasonable; the problem is the backend behavior behind it.

CI / verification: the current suites are good at catching broad regressions, but a passing run does not currently mean “Epic 3 conforms to spec”. Several of the gaps above come from mislabeled or incomplete tests rather than missing test files.

## Recommendations
1. Fix publish to mirror the output directory exactly: delete stale files in the worktree output root and stage with `git add -A` so deletions are committed.
2. Move all publish safety validation into preflight, especially repo-containment checks, before any worktree or branch creation occurs.
3. Replace raw `.doc-meta.json` parsing with shared metadata/schema validation.
4. Decide the real `docs check` contract and make the implementation, spec, and tests agree; right now all three disagree.
5. Thread cancellation into the orchestration layer so Ctrl+C stops new stages after the current session completes.
6. Repair the test-plan drift: implement real `TC-1.4a`, restore missing-Python coverage for `TC-2.5`, add `update` progress tests, and add a real-worktree failure preservation test for publish.
