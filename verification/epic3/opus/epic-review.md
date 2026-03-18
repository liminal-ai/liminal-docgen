# Epic 3 Full-Codebase Verification Review

**Reviewer:** Opus
**Date:** 2026-03-16
**Scope:** All Epic 3 source files, test files, and spec artifacts

**Artifacts reviewed:**
- `docs/documentation-engine/epic-3/epic.md` (full epic with ACs/TCs)
- `docs/documentation-engine/epic-3/tech-design.md` (architecture, interfaces, flows)
- `docs/documentation-engine/epic-3/test-plan.md` (TC-to-test mapping, fixtures, CI strategy)
- All source under `src/cli/`, `src/commands/`, `src/publish/`, `src/adapters/gh.ts`, `src/adapters/git.ts`
- All tests under `test/cli/`, `test/integration/`
- Test helpers: `cli-runner.ts`, `publish-fixtures.ts`, `story5-fixtures.ts`, `fixtures.ts`
- Types: `types/publish.ts`, `types/cli.ts`, `types/index.ts`
- Entry points: `src/cli.ts`, `src/index.ts`

---

## Summary

Epic 3 implementation is **solid and well-structured**. All 75 TC test conditions are present with meaningful assertions. The architecture follows the spec's "thin CLI" constraint. The publish workflow uses worktrees correctly. Adapter injection enables clean test mocking. Two issues require attention before ship.

---

## HIGH Severity

### H-1: TC-2.5a/TC-2.5b in output.test.ts test wrong scenario

**Spec requirement (epic AC-2.5):**
- TC-2.5a: Run `docs check --repo-path <fixture>` with `PATH` modified to exclude Python → stderr includes `DEPENDENCY_MISSING` and "python"
- TC-2.5b: Run `docs check --json --repo-path <fixture>` with `PATH` modified to exclude Python → JSON envelope has `error.code`, `error.message`

**What's implemented (`test/cli/output.test.ts:140-185`):**
- TC-2.5a: Runs `docs publish --repo-path` on a repo with no remote → asserts `PUBLISH_ERROR` and "origin"
- TC-2.5b: Runs `docs publish --json --repo-path` on a repo with no remote → asserts `PUBLISH_ERROR`

**Impact:** The tests verify that structured errors render correctly in both human and JSON modes (which is the AC's intent), but they test a **different error scenario** than specified. The publish error path works, but the Python-missing check rendering path is only partially covered — `test/cli/failure.test.ts:55-83` covers TC-6.2b (JSON mode Python missing via `check`), but there is no human-mode Python-missing test.

**Recommendation:** Either (a) re-implement TC-2.5a/b to match the spec's Python-missing scenario using the `createGitOnlyPathDir()` helper from failure.test.ts, or (b) keep the current tests but relabel them as non-TC tests and add properly-labeled TC-2.5a/b tests with the PATH-excluded-Python approach.

### H-2: TC-1.4a is a no-op stub

**File:** `test/cli/commands.test.ts:319-324`

```typescript
it.skipIf(!INFERENCE_TESTS_ENABLED)(
  "TC-1.4a: CLI generate result matches SDK",
  async () => {
    expect(true).toBe(true);
  },
);
```

**Impact:** Even when the inference environment IS available (`DOC_ENGINE_ENABLE_CLI_INFERENCE_TESTS=1`), this test passes without verifying anything. TC-1.4b (status parity) has a real implementation comparing CLI and SDK results — TC-1.4a should follow the same pattern.

**Recommendation:** Implement a real test body that runs both CLI generate and SDK generate against a fixture repo and compares the result fields (modulo timestamps/runIds, as the epic specifies).

---

## MEDIUM Severity

### M-1: SDK `createPullRequest` defaults to PR creation when omitted

**File:** `src/publish/publish.ts:64`

```typescript
if (request.createPullRequest === false) {
  // return without PR
}
// falls through to PR creation
```

`PublishRequest.createPullRequest` is `boolean | undefined`. When a direct SDK caller omits it, `undefined === false` evaluates to `false`, so the code proceeds to create a PR. The CLI correctly defaults to `false` via `config-merger.ts:110` (`args.createPr ?? false`), but direct SDK callers might be surprised that omitting `createPullRequest` triggers PR creation.

**Recommendation:** Consider changing the check to `if (!request.createPullRequest)` so that `undefined` and `false` both skip PR creation. Alternatively, default `createPullRequest` to `false` inside `publishDocumentation()` before the check. This is a design choice, but the current behavior is a footgun for SDK callers.

### M-2: Push succeeds before PR creation check (TC-4.6a)

**File:** `src/publish/publish.ts:48-93`

The publish flow always pushes the branch (via `createDocsBranch`), then checks `createPullRequest` and attempts PR creation. If `gh` is unavailable and `createPullRequest: true`, the branch is already pushed to remote but the function returns an error. The pushed branch is orphaned.

**Status:** This is the current design and the test at `publish.test.ts:513` explicitly asserts `expect(git.pushBranch).toHaveBeenCalled()` before the PR error. The epic doesn't specify rollback behavior. Flagging as a design awareness item, not a bug.

---

## LOW Severity

### L-1: Test file allocation differs from test plan

The test plan allocates "CLI binary starts without error" to `commands.test.ts` Non-TC tests, but the implementation places it in `output.test.ts:14-19`. Minor bookkeeping difference; doesn't affect coverage.

### L-2: `bare-remote` fixture location differs from test plan

Test plan specifies `test/fixtures/publish/bare-remote/` as a persistent fixture created in `beforeAll`. Implementation uses `createPublishTestEnv()` in `publish-fixtures.ts` which creates ephemeral temp directories. This is actually **better** than the plan — no persistent fixture state to manage. Noting for traceability only.

### L-3: Non-TC test count slightly differs from plan

The test plan specifies 16 non-TC tests across all chunks. The implementation includes one extra non-TC test (`publish.test.ts:761-784` — "missing module plan blocks publish") beyond the plan's 5 non-TC tests for Chunk 4. This is additive coverage and is fine.

---

## Positive Observations

### Architecture Quality

1. **Thin CLI constraint respected** — Every command module follows the pattern: parse args → merge config → call SDK → format output → set exit code. No orchestration logic in the CLI layer.

2. **Adapter injection** — `publishDocumentation()` accepts optional `{ git, gh }` adapters for test mocking while defaulting to real adapters in production. Clean DI without a framework.

3. **Worktree lifecycle** — `branch-manager.ts` uses `try/finally` to ensure `removeWorktree` is called even on errors. Proper cleanup on all paths.

4. **Type safety at the boundary** — `publish/adapters.ts` defines narrow adapter interfaces (`Pick<GitAdapterForPublish, ...>`) so each module only depends on the methods it uses.

### Test Quality

5. **Complete TC coverage** — All 75 test conditions from the epic are implemented with meaningful assertions. The only exception is TC-1.4a (H-2 above).

6. **Real git tests where it matters** — TC-4.5a and TC-4.5b use `createPublishTestEnv()` with actual git repos and bare remotes to verify branch preservation and doc-only commits. No mocks for the things that matter most.

7. **SIGINT test** — `progress.test.ts:166-228` spawns a real subprocess, sends SIGINT, and verifies exit code 130 and cancellation messages. Thorough verification of the Ctrl+C contract.

8. **Determinism verification** — `determinism.test.ts` runs generation twice on separate repos and compares file lists and module trees. Catches non-deterministic output.

9. **Environment-gated inference tests** — Tests requiring Claude API are properly gated with `describe.skipIf` guards. CI-safe tests run without credentials.

10. **Type-level verification** — `sdk-contract.test.ts:307-380` uses `expectTypeOf()` to verify all consumer-facing types are importable and correctly shaped. TypeScript compilation is itself a test.

### Source Code Quality

11. **Error messages are actionable** — Publish errors include the specific field that failed (e.g., `outputPath`, `branchName`, `repoPath`). The `gh` missing error suggests `set createPullRequest: false` as an alternative.

12. **Base branch fallback** — `base-branch-detector.ts` implements the three-step fallback (symbolic-ref → origin/main → origin/master) with a clear error when all fail. The non-TC test verifies all three paths.

13. **Auto-generated branch names** — Use ISO timestamp with deterministic formatting. Testable with `vi.useFakeTimers()`.

14. **PR body auto-generation** — Includes commit hash and file count. Verified by test.

15. **Output path validation in branch-manager** — Rejects output paths outside the repository (`relativeOutputPath.startsWith("..") || path.isAbsolute(relativeOutputPath)`). Defensive check against misconfiguration.

---

## TC Coverage Matrix

| Chunk | TC Range | Count | Status |
|-------|----------|-------|--------|
| 1: CLI Commands | TC-1.1a–TC-1.4b | 13 | All present; TC-1.4a is a stub (H-2) |
| 1: CLI Output | TC-2.1a–TC-2.5b | 11 | All present; TC-2.5a/b test wrong scenario (H-1) |
| 2: Progress | TC-2.3a–TC-2.3c | 3 | All present (env-gated) |
| 3: SDK Contract | TC-3.1a–TC-3.5b | 13 | All present with meaningful assertions |
| 4: Publish | TC-4.1a–TC-4.7b | 18 | All present; mix of mock and real git tests |
| 5: Test Harness | TC-5.1a–TC-5.4b | 9 | All present |
| 6: Failure | TC-6.1a–TC-6.3c | 8 | All present |
| **Total** | | **75** | **73 verified, 1 stub, 2 misaligned** |

---

## Verdict

**Ship-ready with two fixes:**
1. Fix TC-2.5a/TC-2.5b to test the spec-specified Python-missing scenario (H-1)
2. Implement TC-1.4a test body for when inference tests are enabled (H-2)

Both are test-only changes. The source code is correct and complete. The M-1 SDK default is a design decision worth discussing but does not block ship.
