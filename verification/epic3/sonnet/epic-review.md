# Epic 3 Full-Codebase Verification Review

**Reviewer:** Sonnet 4.6
**Date:** 2026-03-16
**Scope:** Full codebase review — all Epic 3 source files, tests, specs, and helpers

**Artifacts reviewed:**
- `docs/documentation-engine/epic-3/epic.md` — full epic with ACs/TCs
- `docs/documentation-engine/epic-3/tech-design.md` — architecture, interfaces, flows
- `docs/documentation-engine/epic-3/test-plan.md` — TC-to-test mapping, fixture architecture, CI strategy
- `src/cli.ts`, `src/index.ts` — entry points
- `src/cli/` — cancellation, config-merger, exit-codes, output, progress
- `src/commands/` — all 7 command files
- `src/publish/` — publish, preflight, branch-manager, pr-creator, base-branch-detector, adapters
- `src/adapters/gh.ts` — real gh adapter
- `test/cli/` — commands, output, progress, smoke, failure tests
- `test/integration/` — sdk-contract, publish, e2e, determinism, failure tests
- `test/helpers/` — cli-runner, publish-fixtures, story5-fixtures, agent-sdk-mock, fixtures, git, temp

---

## Verdict

**Ship-ready with two fixes** (same as Opus conclusion). Both HIGH issues are in tests only; source is correct.

The two HIGH issues identified here align with the Opus review (H-1: TC-2.5a/b test wrong scenario; H-2: TC-1.4a stub). The Sonnet pass adds three MEDIUM findings the Opus review did not flag, and four LOW items.

---

## HIGH Severity

### H-1: TC-2.5a/TC-2.5b test wrong scenario (confirmed from Opus)

**Spec:** Both TCs require `docs check` with a `PATH` that excludes Python to verify DEPENDENCY_MISSING surfacing in human and JSON modes.

**Actual** (`test/cli/output.test.ts:140–185`): Both tests run `docs publish` on a repo with no remote and assert PUBLISH_ERROR containing "origin". This verifies generic error-surfacing mechanics but not the specified scenario.

**Coverage gap:** No CLI human-mode test for `DEPENDENCY_MISSING` (the JSON-mode Python-missing path is covered by TC-6.2b in `test/cli/failure.test.ts:55–83`, but the human-mode path is uncovered).

**Fix:** Re-implement TC-2.5a to use the `createGitOnlyPathDir()` helper (already present in `test/cli/failure.test.ts:208–219`) against `docs check --repo-path`. Keep TC-2.5b as its JSON-mode counterpart.

---

### H-2: TC-1.4a is a pass-through stub (confirmed from Opus)

**File:** `test/cli/commands.test.ts:319–324`

```typescript
it.skipIf(!INFERENCE_TESTS_ENABLED)(
  "TC-1.4a: CLI generate result matches SDK",
  async () => {
    expect(true).toBe(true);   // ← no actual assertions
  },
);
```

When `DOC_ENGINE_ENABLE_CLI_INFERENCE_TESTS=1`, the test activates and passes trivially. TC-1.4b (status parity) has a real implementation. TC-1.4a needs the same treatment.

**Fix:** Compare `docs generate --json` output against a direct `generateDocumentation()` SDK call on the same fixture repo, asserting equality of `result.mode`, `result.commitHash`, `result.generatedFiles`, and `result.warnings` (modulo `result.runId` and `result.durationSeconds` which are per-run).

---

## MEDIUM Severity

### M-1: `publishDocumentation()` defaults to PR creation when `createPullRequest` is omitted (confirmed from Opus)

**File:** `src/publish/publish.ts:64`

```typescript
if (request.createPullRequest === false) {
  // return without PR — false only, not undefined
}
// falls through to createPR()
```

`PublishRequest.createPullRequest?: boolean` — optional. A direct SDK caller who writes `publishDocumentation({ repoPath: "." })` will trigger the PR path. The CLI safely defaults via `args.createPr ?? false` in `config-merger.ts:110`, so CLI users are unaffected. But SDK callers are surprised.

**Fix:** `if (!request.createPullRequest)` treats both `false` and `undefined` as "no PR", which matches the principle of least surprise for an optional field.

---

### M-2: `createStory5MockSDK` omits clustering configuration

**File:** `test/helpers/story5-fixtures.ts:176–190`

```typescript
export const createStory5MockSDK = () =>
  createMockSDK({
    moduleGeneration: [     // ← no clustering config
      { output: CORE_PAGE, ... },
      { output: API_PAGE, ... },
    ],
    overview: { ... },
    qualityReview: { ... },
  });
```

`createMockSDK` returns `ORCHESTRATION_ERROR` for any call with no configured response (see `agent-sdk-mock.ts:58–70`). If the generation pipeline calls the clustering SDK operation for the `valid-ts` fixture, both `e2e.test.ts` and `determinism.test.ts` would fail with "No mock response configured for Agent SDK call 0".

**Context:** These tests pass today, which means one of two things is true:
1. The engine has a heuristic that skips the clustering SDK call for very small repos (≤N files), producing a trivial single-module plan directly — explaining why the expected plan has one "repo" module.
2. The clustering call IS made, but some other mechanism handles the missing config.

If (1) is true, this is fine as designed, but the comment or fixture documentation should make this assumption explicit. If the heuristic threshold ever changes, these tests would silently break.

**Risk:** Medium — the tests are currently passing, but the assumption is implicit and fragile.

**Recommendation:** Add a `clustering` config to `createStory5MockSDK` that returns the expected single-module plan, or add a comment documenting the heuristic that makes clustering optional here.

---

### M-3: TC-3.3a test leaves `mockGetHeadCommitHash` unconfigured

**File:** `test/integration/sdk-contract.test.ts:493–508`

```typescript
it("TC-3.3a: not-generated state for empty tab render", async () => {
  const status = expectStatus(
    await getDocumentationStatus({
      outputPath: DOCS_OUTPUT.missingMeta,   // no metadata file
      repoPath: REPOS.validTs,
    }),
  );
  expect(status).toEqual({
    currentHeadCommitHash: null,   // ← must be null, not undefined
    ...
  });
});
```

`mockGetHeadCommitHash` is not configured before this call (no `mockResolvedValue`). As a plain `vi.fn()`, it returns `undefined` asynchronously. If `getDocumentationStatus` calls `getHeadCommitHash` for the "not_generated" path and receives `undefined`, the test passes only if the implementation coerces `undefined → null` before returning.

If the status implementation does NOT call `getHeadCommitHash` when metadata is absent (returns early with all-null fields), this is fine. But the test relies on this implementation detail implicitly.

**Risk:** Low-medium — tests may pass today but could silently change behavior if the status implementation is refactored.

**Recommendation:** Add an explicit `mockGetHeadCommitHash.mockResolvedValue(null)` (or choose any value) in the TC-3.3a test to make the intent unambiguous, or add a comment explaining why the mock is intentionally not set.

---

## LOW Severity

### L-1: `createPublishTestEnv()` requires git 2.28+ for `--initial-branch` flag

**File:** `test/helpers/publish-fixtures.ts:79`

```typescript
runGit(["init", "--initial-branch=main", repoPath]);
```

The `--initial-branch` flag was introduced in git 2.28 (released 2020-07-27). On older CI images or developer machines with git < 2.28, TC-4.5a and TC-4.5b would fail at environment setup, not at the test logic.

**Risk:** Low — most modern environments have git 2.28+, but CI images pinned to older versions would fail.

**Recommendation:** Document the minimum git version requirement in the CI configuration, or use `git init && git symbolic-ref HEAD refs/heads/main` as a more portable alternative.

---

### L-2: Output path validation in `branch-manager.ts` runs after worktree and branch creation

**File:** `src/publish/branch-manager.ts:63–76`

```typescript
// After createWorktree() and createBranch():
if (relativeOutputPath.startsWith("..") || path.isAbsolute(relativeOutputPath)) {
  return err("PUBLISH_ERROR", "Documentation output path must live inside the repository...");
}
```

If `outputPath` is outside the repo, a worktree and branch have already been created (then cleaned up via `finally`). This means:
1. A stray worktree directory is created and removed — harmless but unnecessary work.
2. A new branch is created in the repo — the worktree is removed but the branch persists locally.

This is not a leak (the `finally` block runs `removeWorktree`), and the worktree creation/removal is fast. The deeper concern is the branch created in the worktree that persists after the error.

**Note:** This validation could move into `preflight.ts` to catch it before any git operations are started. Moving it there would also provide a clearer error location. This is a minor design observation, not a correctness bug.

---

### L-3: `check` command exit code conflates "environment not ready" with "operational failure"

**File:** `src/commands/check.ts:50–52`

```typescript
process.exitCode = result.value.passed
  ? EXIT_SUCCESS
  : EXIT_OPERATIONAL_FAILURE;
```

When `checkEnvironment` succeeds but finds issues (`passed: false`), the CLI exits with code 1 (`EXIT_OPERATIONAL_FAILURE`). Exit code 1 conventionally means an unexpected failure. A check reporting findings is expected behavior — some documentation systems use exit code 1 only for unexpected failures and a separate code for "check failed gracefully."

This is consistent with the epic's specified exit code table (code 1 for all non-0, non-2 exits), but warrants a comment in `check.ts` explaining that exit code 1 here signals "env not ready" not "runtime error."

**No code change required** — this is a documentation note.

---

### L-4: TC-1.2b assumes `detectedLanguages: []` in all test environments

**File:** `test/cli/commands.test.ts:82–95`

```typescript
it("TC-1.2b: check accepts optional repo-path", async () => {
  const { envelope } = await runCliJson<EnvironmentCheckResult>(["check", "--json"]);
  expect(envelope.result?.detectedLanguages).toEqual([]);  // ← assumes empty
  ...
});
```

`check --json` without `--repo-path` calls `checkEnvironment({ repoPath: undefined })`. If `undefined` causes the environment check to analyze the current working directory (CWD of the test process), detected languages would be non-empty in many environments. The test's assertion would then fail.

If `repoPath: undefined` means "skip language detection entirely", the test is correct. But this is an implicit assumption — the test doesn't control what `checkEnvironment` does with an undefined repo path.

**Recommendation:** Either add `--repo-path /dev/null` (or a guaranteed-empty fixture) to control the environment, or add a comment documenting why undefined repoPath produces empty languages.

---

## Technical Positive Observations

(Complementing what Opus noted — focusing on items not already covered there.)

### Source

1. **Cancellation handler is singleton-safe.** `installCancellationHandler()` in `src/cli.ts:47` uses the `sigintHandlerInstalled` guard in `cancellation.ts` — repeated calls are idempotent. The handler is installed once at startup before any command parsing, ensuring SIGINT is captured even if the command setup is slow.

2. **JSON mode respects all output channels.** In JSON mode: stdout carries only the JSON envelope (single parseable object), stderr carries nothing (no progress, no errors). This matches `CliResultEnvelope` design exactly. The `setCancellationNoticeEnabled(!hasJsonFlag(args))` call in `src/cli.ts:52` suppresses the cancellation notice in JSON mode. Correct.

3. **`gh pr create` argument handling.** The `gh.ts` adapter passes `--body` as a separate argument to `execFile` (not shell-interpolated), so PR bodies with shell-special characters are safe. URL parsing handles optional trailing slashes.

4. **`collectFilesForCommit` returns sorted paths.** `files.sort()` at the end of `preflight.ts:151` ensures `filesForCommit` is deterministic regardless of filesystem ordering. This matters for reproducible commits and test assertions against `EXPECTED_DOC_FILES`.

5. **`mergePublishRequest` correctly maps `createPr → createPullRequest`.** The CLI uses kebab-case arg (`--create-pr`) mapped to camelCase SDK field (`createPullRequest: args.createPr ?? false`). The `?? false` default means the CLI never sends `undefined` to the SDK.

### Tests

6. **`detectBaseBranch` is tested directly** in `publish.test.ts:686–722`. By calling `detectBaseBranch()` with three different mock configurations, the fallback chain (symbolic-ref → main → master → error) is fully exercised without going through the full `publishDocumentation()` path. Clean unit test design.

7. **`callOverrides` mechanism in `createMockSDK`.** The `callOverrides: { 1: EngineError }` config (used in TC-6.3a) injects a failure at a specific SDK call index. This is a flexible mechanism that avoids verbose per-test mock chaining. It correctly triggers mid-pipeline failures without restructuring the entire mock.

8. **SIGINT test spawns a real subprocess.** `progress.test.ts:166–228` sends a real SIGINT signal to a child process and verifies both the exit code (130) and stderr messages. This tests the full cancellation contract across a process boundary — not just the cancellation module in isolation.

---

## TC Coverage Matrix (Sonnet Pass)

| Chunk | TCs | Status | Notes |
|-------|-----|--------|-------|
| 1: CLI Commands (TC-1.1a–1.4b) | 13 | 12 real, 1 stub | TC-1.4a stub (H-2) |
| 1: CLI Output (TC-2.1a–2.5b) | 11 | 9 correct, 2 misaligned | TC-2.5a/b wrong scenario (H-1) |
| 2: Progress (TC-2.3a–2.3c) | 3 | All present, env-gated | Correct gate: `ANTHROPIC_API_KEY` |
| 3: SDK Contract (TC-3.1a–3.5b) | 13 | 12 clear, 1 implicit | TC-3.3a mock setup concern (M-3) |
| 4: Publish (TC-4.1a–4.7b) | 18 | All present | Mix of mock + real git |
| 5: Test Harness (TC-5.1a–5.4b) | 9 | All present | TC-5.1b depends on Python in CI |
| 6: Failure (TC-6.1a–6.3c) | 8 | All present | TC-6.3b/c correctly combined |
| **Total** | **75** | **73 verified, 1 stub, 2 misaligned** | |

---

## Summary of Findings

| ID | Severity | File | Description |
|----|----------|------|-------------|
| H-1 | HIGH | `test/cli/output.test.ts:140–185` | TC-2.5a/b test wrong scenario (publish error, not Python missing) |
| H-2 | HIGH | `test/cli/commands.test.ts:319–324` | TC-1.4a is a pass-through stub |
| M-1 | MEDIUM | `src/publish/publish.ts:64` | `undefined` createPullRequest defaults to PR creation |
| M-2 | MEDIUM | `test/helpers/story5-fixtures.ts:176` | `createStory5MockSDK` omits clustering — implicit heuristic dependency |
| M-3 | MEDIUM | `test/integration/sdk-contract.test.ts:493` | TC-3.3a mock not configured — relies on undefined→null coercion |
| L-1 | LOW | `test/helpers/publish-fixtures.ts:79` | `--initial-branch=main` requires git 2.28+ |
| L-2 | LOW | `src/publish/branch-manager.ts:63` | Output path validated after worktree/branch creation |
| L-3 | LOW | `src/commands/check.ts:50` | Exit code 1 for expected "not ready" state lacks documentation |
| L-4 | LOW | `test/cli/commands.test.ts:88` | TC-1.2b assumes empty `detectedLanguages` without env control |
