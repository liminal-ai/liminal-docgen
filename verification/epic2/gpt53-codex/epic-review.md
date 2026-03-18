# Epic 2 — GPT-5.3-Codex Full Codebase Review

## Executive Summary
Epic 2's orchestration pipeline is largely implemented and well-structured: stage decomposition is clear, runtime contracts are strongly typed, Zod validation is used consistently at inference boundaries, and the Epic 2 test suite is extensive. I ran the requested suites (`7` files, `117` tests) and they all passed.

There are two high-impact issues. First, the production Agent SDK adapter factory is still a hard-throw stub, so real (non-mocked) runs cannot complete. Second, module filename collision checks do not reserve `overview.md`; a module named `overview` can overwrite/corrupt the overview artifact contract. I also found important logic and contract gaps around relationship-impact mapping directionality, empty-module handling, and stage enum drift versus epic data contracts.

Coverage is broad: every AC and TC has at least one corresponding implementation path and test reference, with some "partial" areas where behavior is mocked-only or only partially exercised.

## Findings by Severity

### Critical
1. **Agent SDK adapter is unimplemented, blocking real generation/update runs.**
   File: `agent-sdk.ts:31`, `generate.ts:62`
   Description: `createAgentSDKAdapter()` throws unconditionally; `generateDocumentation()` fails immediately in production paths. All success-path behavior currently depends on test mocks.
   Recommendation: Implement a real adapter (query/session/usage/cost), then add at least one non-mocked integration smoke test behind an env guard.

2. **Reserved filename collision can break deterministic output (`overview.md`).**
   File: `module-generation.ts:188`, `overview-generation.ts:75`
   Description: Collision detection only checks module-to-module names, not reserved artifacts. A module named `overview` maps to `overview.md`, which conflicts with the generated overview file.
   Recommendation: Reserve and reject collisions with `overview.md`, `module-tree.json`, `.doc-meta.json`, `.module-plan.json` during planning/generation.

### Major
1. **Relationship impact mapping is one-directional (source-only), missing valid affected modules.**
   File: `affected-module-mapper.ts:257`
   Description: `getRelationshipImpacts` only considers relationships where `relationship.source === changedFile.path`; changed targets and some rename/delete cases can be missed.
   Recommendation: Include target-side checks and old/new path handling; add tests for target-side and rename relationship impacts.

2. **Empty-module edge case is blocked in real planning path despite generation-stage support.**
   File: `module-planning.ts:97`, `module-generation.ts:72`
   Description: Planner validation rejects empty modules, but generator implements placeholder behavior. TC-1.4c is currently validated via test stubbing, not realistic end-to-end path.
   Recommendation: Decide one canonical behavior: allow empty modules with placeholder/omit behavior, or strip them with warnings before generation.

3. **Stage contract drift from epic's documented stage union.**
   File: `orchestration.ts:9`, `generate.ts:56`, `generate.ts:193`
   Description: Runtime uses `resolving-configuration` and `writing-module-tree` stages not in epic contract's stage list.
   Recommendation: Either update the contract/spec to include these stages or normalize external stage values to the documented list.

4. **Metadata snapshot path can throw outside `EngineResult` handling.**
   File: `metadata-write.ts:44`, `metadata-write.ts:112`, `generate.ts:523`
   Description: Pre-write snapshot capture can throw non-ENOENT errors before `writeRunMetadata` returns an `EngineResult`; caller doesn't catch exceptions here.
   Recommendation: Wrap snapshot acquisition in try/catch and convert to structured `METADATA_ERROR`.

### Minor
1. **Potential type drift risk between inferred `ModulePlan.modules` item type and hand-written `PlannedModule`.**
   File: `planning.ts:1`, `contracts/planning.ts:6`
   Recommendation: Export and reuse a single inferred module item type from contracts.

2. **TC-4.5a test confirms pass count, but not true "second perspective" differentiation.**
   File: `quality-review.test.ts:506`
   Recommendation: Assert prompt/model payload differences across self vs second pass.

3. **TC-1.4c uses planner mocking to force an otherwise rejected empty-module plan.**
   File: `generate.test.ts:362`
   Recommendation: Add non-stubbed integration coverage once empty-module policy is finalized.

## AC Coverage Matrix
| AC ID | Description | Implemented | Tested | Notes |
|-------|-------------|-------------|--------|-------|
| AC-1.1 | Full-mode request returns run result | Partial | Yes | Runtime blocked by unimplemented adapter |
| AC-1.2 | Request/config/default merge | Yes | Yes | `resolveAndValidateRequest` + tests |
| AC-1.3 | ModulePlan from analysis | Yes | Yes | Mocked inference path |
| AC-1.4 | One module page per module | Partial | Yes | Empty-module path conflicted by planner validation; reserved-name collision risk |
| AC-1.5 | Overview after module docs | Yes | Yes | Works in pipeline |
| AC-1.6 | Write module-tree.json | Yes | Yes | Implemented and asserted |
| AC-1.7 | Deterministic output structure | Partial | Yes | `overview.md` collision edge case |
| AC-1.8 | Validation before completion | Yes | Yes | Implemented in finalize path |
| AC-1.9 | Metadata after success | Yes | Yes | Success-only metadata semantics implemented |
| AC-1.10 | Persist module plan | Yes | Yes | `.module-plan.json` written and tested |
| AC-2.1 | Update requires valid metadata/plan | Yes | Yes | Prior state loader enforces |
| AC-2.2 | Compute changed files | Yes | Yes | Git adapter integration mocked in tests |
| AC-2.3 | Map changed files to affected modules | Yes | Yes | Mapper implemented; edge limitations noted |
| AC-2.4 | Only affected modules regenerated | Yes | Yes | `modulesOverride` path validated |
| AC-2.5 | Structural changes alter scope correctly | Partial | Yes | Relationship mapping is source-biased |
| AC-2.6 | Overview regen on module removal only | Yes | Yes | `overviewNeedsRegeneration` behavior tested |
| AC-2.7 | Metadata update commit/timestamp | Yes | Yes | Update metadata assertions present |
| AC-2.8 | Update result fields (`updated/unchanged`) | Yes | Yes | Tested directly |
| AC-3.1 | Stage-aware progress events | Yes | Yes | Full + update stage sequences covered |
| AC-3.2 | Module progress includes counts | Yes | Yes | Full/update module events tested |
| AC-3.3 | runId consistency | Yes | Yes | Verified in progress suite |
| AC-3.4 | Full success result shape | Yes | Yes | Fields and cost scenarios covered |
| AC-3.5 | Failure result diagnostics | Yes | Yes | Covered in failure suite |
| AC-4.1 | Validation runs after generation/update | Yes | Yes | Both post-gen and post-update tested |
| AC-4.2 | Optional one self-review pass | Yes | Yes | Enabled/disabled/skip covered |
| AC-4.3 | Self-review fix scope bounded | Yes | Yes | File constraints + tests for no re-cluster |
| AC-4.4 | Revalidate after each pass | Yes | Yes | Call-count assertions present |
| AC-4.5 | Optional second-model pass | Partial | Yes | Pass logic works; "different perspective" weakly asserted |
| AC-4.6 | Final result reflects post-review validation | Yes | Yes | warn/fail/pass outcomes covered |
| AC-5.1 | Pre-inference env/analysis failure stop | Yes | Yes | Both scenarios tested |
| AC-5.2 | Agent failures report stage/context | Yes | Yes | Planning/module/overview failures covered |
| AC-5.3 | Warnings non-blocking, errors blocking | Yes | Yes | Both outcomes tested |
| AC-5.4 | Partial outputs predictable, no metadata | Yes | Yes | Partial file + metadata invariants tested |
| AC-5.5 | Emit failed progress event | Yes | Yes | Final `failed` event tested |

## TC Coverage Matrix
| TC ID | Description | Test File | Status | Notes |
|-------|-------------|-----------|--------|-------|
| TC-1.1a | Successful full generation | `generate.test.ts` | Covered | |
| TC-1.1b | Run ID assigned | `progress.test.ts` | Covered | |
| TC-1.2a | Request overrides config | `generate.test.ts` | Covered | |
| TC-1.2b | Defaults applied | `generate.test.ts` | Covered | |
| TC-1.2c | Invalid request structured error | `generate.test.ts` | Covered | |
| TC-1.3a | Components grouped | `module-planning.test.ts` | Covered | |
| TC-1.3b | Small repo bypass | `module-planning.test.ts` | Covered | |
| TC-1.3c | Names/descriptions present | `module-planning.test.ts` | Covered | |
| TC-1.3d | Unmapped components tracked | `module-planning.test.ts` | Covered | |
| TC-1.4a | Module pages written | `generate.test.ts` | Covered | |
| TC-1.4b | Module page references components | `generate.test.ts` | Covered | |
| TC-1.4c | Empty module handled | `generate.test.ts` | Partial | Test stubs planner to bypass real validation behavior |
| TC-1.5a | Overview written | `generate.test.ts` | Covered | |
| TC-1.5b | Overview references modules | `generate.test.ts` | Covered | |
| TC-1.5c | Overview includes Mermaid | `generate.test.ts` | Covered | |
| TC-1.6a | Module tree matches plan | `generate.test.ts` | Covered | |
| TC-1.6b | Hierarchy preserved | `generate.test.ts` | Covered | |
| TC-1.7a | Structural convention followed | `generate.test.ts` | Covered | |
| TC-1.7b | Filenames derived from module names | `generate.test.ts` | Covered | |
| TC-1.8a | Validation runs post-generation | `generate.test.ts` | Covered | |
| TC-1.8b | Warnings do not block | `quality-review.test.ts` | Covered | Co-validated via TC-4.6b path |
| TC-1.8c | Errors block completion | `quality-review.test.ts` | Covered | Co-validated via TC-4.6c path |
| TC-1.9a | Metadata reflects generation | `generate.test.ts` | Covered | |
| TC-1.10a | Module plan persisted | `generate.test.ts` | Covered | |
| TC-1.10b | Persisted plan matches result | `generate.test.ts` | Covered | |
| TC-2.1a | No prior metadata | `update.test.ts` | Covered | |
| TC-2.1b | Invalid metadata | `update.test.ts` | Covered | |
| TC-2.1c | Missing module plan | `update.test.ts` | Covered | |
| TC-2.2a | Files changed detected | `update.test.ts` | Covered | |
| TC-2.2b | No changes path | `update.test.ts` | Covered | |
| TC-2.2c | New files included | `update.test.ts` | Covered | |
| TC-2.2d | Deleted files included | `update.test.ts` | Covered | |
| TC-2.3a | Change maps to module | `update.test.ts` | Covered | |
| TC-2.3b | Unmapped change warns | `update.test.ts` | Covered | |
| TC-2.3c | New file maps to existing module | `update.test.ts` | Covered | |
| TC-2.3d | New file unmappable | `update.test.ts` | Covered | |
| TC-2.4a | Targeted regeneration | `update.test.ts` | Covered | |
| TC-2.4b | Multiple affected modules | `update.test.ts` | Covered | |
| TC-2.5a | New file triggers regen | `update.test.ts` | Covered | |
| TC-2.5b | Deleted file triggers regen | `update.test.ts` | Covered | |
| TC-2.5c | Relationship changes affect both sides | `update.test.ts` | Partial | Only source-side relationship scenario exercised |
| TC-2.6a | Removed module triggers overview regen | `update.test.ts` | Covered | |
| TC-2.6b | Content-only changes skip overview | `update.test.ts` | Covered | |
| TC-2.6c | Unmappable new files warn/no new module | `update.test.ts` | Covered | |
| TC-2.7a | Metadata updated after update | `update.test.ts` | Covered | |
| TC-2.8a | Update result fields | `update.test.ts` | Covered | |
| TC-3.1a | Stage events emitted | `progress.test.ts` | Covered | |
| TC-3.1b | Full stage sequence | `progress.test.ts` | Covered | |
| TC-3.1c | Update stage sequence | `update.test.ts` | Covered | |
| TC-3.2a | Full per-module progress | `progress.test.ts` | Covered | |
| TC-3.2b | Update per-module progress | `update.test.ts` | Covered | |
| TC-3.3a | runId consistency | `progress.test.ts` | Covered | |
| TC-3.4a | Complete success result | `progress.test.ts` | Covered | |
| TC-3.4b | Cost available | `progress.test.ts` | Covered | |
| TC-3.4c | Cost unavailable => null | `progress.test.ts` | Covered | |
| TC-3.4d | Warnings surfaced | `progress.test.ts` | Covered | |
| TC-3.5a | Failure result structure | `failure.test.ts` | Covered | |
| TC-4.1a | Validation post-generation | `quality-review.test.ts` | Covered | |
| TC-4.1b | Validation post-update | `update.test.ts` | Covered | |
| TC-4.2a | Self-review fixes broken link | `quality-review.test.ts` | Covered | |
| TC-4.2b | Self-review fixes Mermaid | `quality-review.test.ts` | Covered | |
| TC-4.2c | Self-review skipped when clean | `quality-review.test.ts` | Covered | |
| TC-4.2d | Self-review disabled behavior | `quality-review.test.ts` | Covered | |
| TC-4.3a | Allowed fix categories | `quality-review.test.ts` | Covered | |
| TC-4.3b | No re-clustering | `quality-review.test.ts` | Covered | |
| TC-4.3c | No unbounded iteration | `quality-review.test.ts` | Covered | |
| TC-4.4a | Revalidate after self-review | `quality-review.test.ts` | Covered | |
| TC-4.4b | Revalidate after second pass | `quality-review.test.ts` | Covered | |
| TC-4.5a | Second-model runs when enabled | `quality-review.test.ts` | Partial | Call-count checked; model/prompt distinction weakly verified |
| TC-4.5b | Second-model skipped when disabled | `quality-review.test.ts` | Covered | |
| TC-4.5c | Second-model skipped when no issues | `quality-review.test.ts` | Covered | |
| TC-4.6a | Clean validation after review | `quality-review.test.ts` | Covered | |
| TC-4.6b | Warnings remain after review | `quality-review.test.ts` | Covered | |
| TC-4.6c | Errors remain after review | `quality-review.test.ts` | Covered | |
| TC-5.1a | Env check failure handling | `failure.test.ts` | Covered | |
| TC-5.1b | Analysis failure handling | `failure.test.ts` | Covered | |
| TC-5.2a | Module generation failure handling | `failure.test.ts` | Covered | |
| TC-5.2b | Overview failure handling | `failure.test.ts` | Covered | |
| TC-5.2c | Clustering failure handling | `failure.test.ts` | Covered | |
| TC-5.3a | Warnings-only validation success | `failure.test.ts` | Covered | |
| TC-5.3b | Error validation failure | `failure.test.ts` | Covered | |
| TC-5.4a | Partial output on disk | `failure.test.ts` | Covered | |
| TC-5.4b | No metadata write on failure | `failure.test.ts` | Covered | |
| TC-5.5a | Final failed progress event | `failure.test.ts` | Covered | |

## Contract/Type Alignment
- Strong alignment points:
  - `ModulePlan` type is inferred from Zod contract (`types/planning.ts` → `contracts/planning.ts`), reducing schema/type drift.
  - Inference outputs (`module`, `overview`, `quality-review`) are schema-gated both at query boundary (`outputSchema`) and via `safeParse`.
  - Validation and metadata contracts are used at persistence/validation boundaries.

- Misalignments/risk:
  - `DocumentationStage` values exposed in runtime include undocumented stages (`resolving-configuration`, `writing-module-tree`) vs epic's stage contract.
  - `PlannedModule` is hand-declared while `ModulePlan.modules` item is inferred separately, creating potential future drift.
  - AC-4.5 "second-model perspective" is represented by config/prompt flow, but not strongly encoded in types/options (no explicit model selection contract in orchestration calls).

## Test Quality Assessment
- Strengths:
  - Tests are behavior-oriented: they verify filesystem artifacts, metadata contents, progress sequences, and failure discriminators.
  - Update tests meaningfully assert selective regeneration using file mtimes and module-specific content.
  - Failure tests validate partial output and "metadata-on-success-only" semantics.
  - Prompt tests validate structural prompt invariants for all builders.

- Gaps:
  - All success paths rely on a mocked SDK adapter; there is no integration guardrail for the real adapter path, which is currently a stub.
  - Some scenarios are validated via stubbing internals (notably TC-1.4c), reducing confidence in real pipeline behavior.
  - TC-4.5a coverage checks pass count, not true second-pass differentiation semantics.
  - Relationship-impact tests do not cover target-side relationship changes.

## Architecture Notes
- Positive:
  - Stage-oriented orchestration in `generate.ts` is readable and testable.
  - `RunContext` cleanly centralizes run ID, warning accumulation, progress emission, and result assembly.
  - Update mapping logic is encapsulated and mostly pure (`affected-module-mapper`), improving unit-testability and extensibility.
  - Metadata write path has thoughtful rollback behavior.

- Concerns:
  - Core runtime dependency (SDK adapter) is not production-ready.
  - A few contract seams (stage enum, second-model semantics) are currently enforced by convention, not by hard interfaces.

## Recommendations
1. Implement `createAgentSDKAdapter()` and add one non-mocked integration smoke test (env-gated) to prevent regressions.
2. Add reserved artifact filename validation (`overview.md`, `module-tree.json`, `.doc-meta.json`, `.module-plan.json`) in module filename derivation.
3. Fix relationship impact mapping to include target-side/rename/delete paths and add explicit tests.
4. Reconcile empty-module policy across planning and generation so TC-1.4c is valid end-to-end without stubbing internals.
5. Align public `DocumentationStage` with epic contract (or update docs/contracts if expanded stages are intentional).
6. Harden metadata-write snapshot error handling to always return structured `EngineResult` failures.
