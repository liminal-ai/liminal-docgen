# Epic 1 Implementation Review (Code Steward Documentation Engine)

## Scope Reviewed
- Epic: `/Users/leemoore/code/code-steward/docs/documentation-engine/epic-1/epic.md`
- Tech design: `/Users/leemoore/code/code-steward/docs/documentation-engine/epic-1/tech-design.md`
- Test plan: `/Users/leemoore/code/code-steward/docs/documentation-engine/epic-1/test-plan.md`
- Source: all `src/**/*.ts`
- Tests: all `test/**/*.test.ts`

## Validation Performed
- Read all requested source and test files.
- Executed:
  - `npm test` (85/85 passing)
  - `npm run typecheck` (pass)
  - `npm run lint` (pass)
- Additional runtime verification of built artifact (`dist`) to check SDK export behavior.

### Critical

1. **AC-4.2 is not fully implemented: `.module-plan.json` is never validated as a required file.**
- **Spec requirement:** Epic explicitly requires expected files to include `.module-plan.json` and defines `TC-4.2d` for missing `.module-plan.json`.
  - `/Users/leemoore/code/code-steward/docs/documentation-engine/epic-1/epic.md:360`
  - `/Users/leemoore/code/code-steward/docs/documentation-engine/epic-1/epic.md:394`
- **Tech design requirement:** file-presence check is expected to validate `overview.md`, `module-tree.json`, `.doc-meta.json`, `.module-plan.json`.
  - `/Users/leemoore/code/code-steward/docs/documentation-engine/epic-1/tech-design.md:240`
- **Implementation gap:** required file list omits `.module-plan.json`.
  - `/Users/leemoore/code/code-steward/code-wiki-gen/src/validation/checks/file-presence.ts:7`
- **Test coverage gap:** no test for `TC-4.2d` in validation tests.
  - `/Users/leemoore/code/code-steward/code-wiki-gen/test/validation/validate.test.ts:83`
- **Observed behavior:** validation returns `pass` even when `.module-plan.json` is absent (reproduced with local temp fixture containing all other required files).
- **Impact:** Spec non-compliance; false positives in output validation readiness.

2. **Packaged SDK (`dist`) is not runnable for analysis/environment checks because the bundled Python script is not included in build output.**
- **Adapter/runtime code expects script under runtime-relative path:**
  - `/Users/leemoore/code/code-steward/code-wiki-gen/src/analysis/adapter.ts:14`
  - `/Users/leemoore/code/code-steward/code-wiki-gen/src/environment/runtime-checker.ts:63`
- **Package exports `dist` as runtime entrypoint:**
  - `/Users/leemoore/code/code-steward/code-wiki-gen/package.json:6`
- **Build config emits only TS files; no copy step for `src/analysis/scripts/analyze_repository.py`:**
  - `/Users/leemoore/code/code-steward/code-wiki-gen/tsconfig.build.json:10`
- **Observed behavior after `npm run build`:**
  - `checkEnvironment()` from `dist` reports missing script under `dist/analysis/scripts/analyze_repository.py`.
  - `analyzeRepository()` from `dist` fails with `ANALYSIS_ERROR` because Python cannot open the script path.
- **Impact:** Release-blocking runtime failure in packaged usage; undermines AC-1.1/TC-1.1a and AC-2.1 behavior for actual SDK consumers.

### Major

1. **`AnalysisSummary.totalFilesAnalyzed` deviates from the tech design mapping and under-reports in unsupported-language scenarios.**
- **Tech design mapping:** `summary.total_files -> AnalysisSummary.totalFilesAnalyzed`.
  - `/Users/leemoore/code/code-steward/docs/documentation-engine/epic-1/tech-design.md:500`
- **Implementation behavior:** `totalFilesAnalyzed` is set to `componentPaths.length` (supported+included component count), not adapter-reported total files.
  - `/Users/leemoore/code/code-steward/code-wiki-gen/src/analysis/normalizer.ts:106`
- **Observed behavior:** with one unsupported Rust file, normalized summary reports `totalFilesAnalyzed: 0` even when raw summary has `total_files: 1`.
- **Impact:** Contract/diagnostic drift for downstream consumers relying on summary fidelity.

2. **Cross-link validation can incorrectly treat links outside the documentation output directory as valid.**
- **Spec intent:** verify links between generated pages in output directory.
  - `/Users/leemoore/code/code-steward/docs/documentation-engine/epic-1/epic.md:399`
  - `/Users/leemoore/code/code-steward/docs/documentation-engine/epic-1/tech-design.md:684`
- **Implementation behavior:** resolves link target and checks filesystem existence only; no boundary check that target remains inside `outputPath`.
  - `/Users/leemoore/code/code-steward/code-wiki-gen/src/validation/checks/cross-links.ts:31`
  - `/Users/leemoore/code/code-steward/code-wiki-gen/src/validation/checks/cross-links.ts:36`
- **Observed behavior:** link `../outside.md` passes if that file exists outside docs output.
- **Impact:** false negatives for broken/invalid internal-doc linkage.

3. **Epic-to-test-plan traceability drift: `TC-4.2d` exists in epic but is missing from test plan mapping.**
- Epic includes `TC-4.2d`.
  - `/Users/leemoore/code/code-steward/docs/documentation-engine/epic-1/epic.md:394`
- Test plan validation mapping omits it.
  - `/Users/leemoore/code/code-steward/docs/documentation-engine/epic-1/test-plan.md:299`
- **Impact:** acceptance criterion gap escaped test planning and implementation.

### Minor

1. **Validation schema does not constrain summary counts to non-negative integers.**
- Current schema allows any number (`z.number()`) for `errorCount`/`warningCount`.
  - `/Users/leemoore/code/code-steward/code-wiki-gen/src/contracts/validation.ts:24`
- Low runtime risk because counts are internally derived, but contract could be tightened.

2. **`getGitRepositoryStatus()` enforces repo-root equality and treats subdirectories within a repo as `invalid-repo`.**
- Root-equality check:
  - `/Users/leemoore/code/code-steward/code-wiki-gen/src/adapters/git.ts:54`
- Might be stricter than some callers expect when passing nested repo paths.

---

## AC Coverage

| AC | Status | Notes |
|---|---|---|
| AC-1.1 | **Gap (packaged runtime)** | Source behavior is correct in tests, but packaged `dist` fails runtime script prerequisite checks due missing bundled script. |
| AC-1.2 | Satisfied | Named dependency findings implemented. |
| AC-1.3 | Satisfied | Repo language detection implemented. |
| AC-1.4 | Satisfied | Git repo/path validation implemented. |
| AC-1.5 | Satisfied | Warning/error severities and `passed` derivation implemented. |
| AC-2.1 | **Gap (packaged runtime)** | `dist` analysis fails due missing Python script artifact. |
| AC-2.2 | Satisfied | Include pattern filtering implemented and tested. |
| AC-2.3 | Satisfied | Exclude pattern filtering implemented and tested. |
| AC-2.4 | Satisfied | Focus dirs preserved; non-focus components retained. |
| AC-2.5 | Satisfied | Component shape fields present. |
| AC-2.6 | Satisfied | Relationship shape fields present. |
| AC-2.7 | Satisfied | Commit hash capture implemented. |
| AC-2.8 | Satisfied | Structured errors + partial support diagnostics present. |
| AC-3.1 | Satisfied | `not_generated` on missing metadata path. |
| AC-3.2 | Satisfied | `current` on matching commit hash. |
| AC-3.3 | Satisfied | `stale` on differing commit hash. |
| AC-3.4 | Satisfied | `invalid` for malformed/missing required metadata fields. |
| AC-3.5 | Satisfied | Metadata write persists required fields and replaces previous file. |
| AC-3.6 | Satisfied | Metadata read returns object or structured error. |
| AC-4.1 | Satisfied | Standalone validation implemented. |
| AC-4.2 | **Gap** | `.module-plan.json` missing from required-file checks. |
| AC-4.3 | **Partial** | Internal link checking works, but lacks output-directory boundary enforcement. |
| AC-4.4 | Satisfied | Module-tree consistency checks implemented. |
| AC-4.5 | Satisfied | Mermaid basic syntax checks implemented. |
| AC-4.6 | Satisfied | Structured summary/counts/findings implemented. |
| AC-5.1 | Satisfied | Defaults applied. |
| AC-5.2 | Satisfied | Caller options override config/defaults. |
| AC-5.3 | Satisfied | Config file values used when caller values absent. |
| AC-5.4 | Satisfied | Structured configuration errors for invalid values/patterns. |
| AC-5.5 | Satisfied | Typed resolved config with populated fields. |

## TC Coverage

### Test-Plan TCs (68 listed)
- **Covered and passing:** all 68 TCs listed in `test-plan.md` have corresponding tests in:
  - `/Users/leemoore/code/code-steward/code-wiki-gen/test/config/resolver.test.ts`
  - `/Users/leemoore/code/code-steward/code-wiki-gen/test/environment/check.test.ts`
  - `/Users/leemoore/code/code-steward/code-wiki-gen/test/analysis/analyze.test.ts`
  - `/Users/leemoore/code/code-steward/code-wiki-gen/test/metadata/status.test.ts`
  - `/Users/leemoore/code/code-steward/code-wiki-gen/test/validation/validate.test.ts`
- Test run result: **85/85 tests passed**.

### TC Gaps Beyond Test-Plan Mapping
- **TC-4.2d (from epic): not covered** (not present in test plan mapping or validation tests).

## Interface Compliance

- **Compliant:** core SDK operation signatures and domain types are implemented as `EngineResult<T>` surfaces, with contracts and zod-backed validation in place.
- **Deviation:** `AnalysisSummary.totalFilesAnalyzed` behavior diverges from tech-design mapping (uses normalized component count rather than raw `summary.total_files`).
- **Deviation:** validation expected-files contract omits `.module-plan.json`.

## Architecture Alignment

- **Aligned:** module boundaries and orchestration flow are broadly consistent with design (config resolver, env check phases, adapter+normalizer analysis, metadata shared shape validation, validation check pipeline).
- **Drift:** file-presence check implementation does not match documented expected-file set.
- **Drift:** packaging/build pipeline does not preserve required Python adapter script in runtime artifact.

## Test Quality Assessment

- Strengths:
  - Tests are behavior-oriented and generally assert concrete outputs (good specificity).
  - External boundary mocking is mostly consistent with plan.
  - Coverage breadth across flows is strong.
- Gaps:
  - Missing test for epic `TC-4.2d`.
  - No test that enforces cross-link target stays within docs output root.
  - No build-artifact/runtime test to catch missing bundled Python script in `dist`.

## Summary

| Metric | Count |
|---|---:|
| Total ACs checked | 30 |
| ACs satisfied | 26 |
| AC gaps/partials | 4 |
| Total TCs checked (epic ∪ test plan) | 69 |
| TCs covered by tests | 68 |
| TC gaps | 1 |
| Overall assessment | **Fail** |

