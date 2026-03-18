# Epic 3 — Meta-Review: Four-Reviewer Synthesis

**Author:** Sonnet 4.6
**Date:** 2026-03-16
**Reviews analyzed:**
- `verification/epic3/opus/epic-review.md` — Opus 4.6
- `verification/epic3/sonnet/epic-review.md` — Sonnet 4.6
- `verification/epic3/gpt54/epic-review.md` — GPT-5.4 (Codex)
- `verification/epic3/gpt53-codex/epic-review.md` — GPT-5.3-Codex

---

## Reviewer Rankings

### 1st — GPT-5.4 ⭐⭐⭐⭐⭐

**Best overall.** Found a genuine P1 source correctness bug (deletion staging) that all three Claude-family reviews missed. Has the most detailed spec conformance matrix (20 ACs, explicit Pass/Partial/Fail). Provides concrete, specific fixes. Spec citations include line numbers. Overreaches slightly on two items (SIGINT granularity and `.module-plan.json` requirement) but the core findings are technically grounded. This review changes the ship verdict from "two test fixes" to "one source fix + multiple test fixes."

**What it contributes to synthesis:** The deletion staging bug, the metadata schema-validation gap, the output-path-in-preflight recommendation, and the update-progress coverage gap.

---

### 2nd — Opus 4.6 ⭐⭐⭐⭐

**Best signal-to-noise ratio.** Clean, concise, accurate. Identified the two highest-priority test issues (TC-2.5a/b, TC-1.4a) with clear fix descriptions and no false positives. Positive observations are well-chosen and don't pad the review. Missing source-level bugs (deletion, adapter throw escapes) because it focused on test conformance rather than runtime correctness. The "ship-ready with two fixes" verdict is reasonable given the test-only scope of the findings, but the review should have dug deeper into source behavior.

**What it contributes to synthesis:** The most actionable H-1/H-2 descriptions, the cleanest framing of the TC-2.5 and TC-1.4a defects.

---

### 3rd — Sonnet 4.6 ⭐⭐⭐

**Most additional findings among the Claude-family reviews.** Confirmed Opus's HIGH issues and added three MEDIUM items: `createPullRequest` undefined behavior (shared with Opus), `createStory5MockSDK` missing clustering config (unique), and TC-3.3a mock ambiguity (unique). The clustering concern is the most uncertain finding in this batch — it's valid as a "fragile implicit assumption" flag but not a clear bug. The TC-3.3a mock concern is legitimate. Like Opus, missed the source-level deletion staging and adapter exception bugs.

**What it contributes to synthesis:** The clustering heuristic concern and TC-3.3a setup ambiguity.

---

### 4th — GPT-5.3-Codex ⭐⭐

**Uneven.** Found one valid P1 that others missed (publish adapter exceptions can escape `EngineResult` — an exception from `runSubprocess` or a git adapter would propagate as a Promise rejection, breaking the SDK contract). Also correctly identified TC-2.5, TC-1.4a, and metadata validation gaps. However, two findings are unreliable:
1. **Possible hallucination:** cites `src/contracts/publish.ts` and "Zod schemas defined but not exercised" — this file does not exist in the codebase. No `src/contracts/` directory was found.
2. **Questionable spec claim:** asserts `createPullRequest` should default to `true` per the epic, citing `epic.md:613` and `tech-design.md:1082`. Neither Opus nor GPT-5.4 (which also read the full specs) agreed. Standard CLI practice and the `--create-pr` flag name both imply false-by-default. This finding is likely a misread.

**What it contributes to synthesis:** The adapter exception finding (after discounting the Zod hallucination and the PR-default claim).

---

## Cross-Reviewer Agreement Table

| Finding | Opus | Sonnet | GPT-5.4 | GPT-5.3 | Confidence |
|---------|------|--------|---------|---------|------------|
| TC-2.5a/b test wrong scenario | H-1 | H-1 | P3 | P1 | **4/4 — high** |
| TC-1.4a stub test | H-2 | H-2 | P3 | P2 | **4/4 — high** |
| `createPullRequest` undefined behavior | M-1 | M-1 | — | P2* | **3/4** |
| Metadata validation too shallow | — | — | P2 | P2 | **2/4** |
| Output path validation too late | — | L-2 | P2 | — | **2/4** |
| Publish doesn't stage deletions | — | — | **P1** | — | **1/4** |
| Adapter exceptions escape EngineResult | — | — | — | **P1** | **1/4** |
| SIGINT stops between stages | — | — | P2 | — | **1/4** |
| `.module-plan.json` required (vs. spec) | — | — | P3 | — | **1/4** |
| `createStory5MockSDK` no clustering | — | M-2 | — | — | **1/4** |
| TC-3.3a mock ambiguity | — | M-3 | — | — | **1/4** |
| Update progress not verified | — | — | P3 | — | **1/4** |

*\*GPT-5.3 claims PR default should be TRUE — questionable; others frame this as "undefined treated as PR-requested" behavioral surprise*

---

## Finding Reliability Assessment

### High confidence — take these into synthesis

**A. TC-2.5a/b tests wrong scenario** (4/4)
All four reviewers independently caught this. Human-mode Python-missing path is untested.

**B. TC-1.4a stub** (4/4)
All four. `expect(true).toBe(true)` is a no-op regardless of inference environment.

**C. `createPullRequest` undefined → PR creation** (3/4, Opus framing)
The Opus/Sonnet framing is correct: the existing `=== false` check is surprising for SDK callers who omit the field. GPT-5.3's "default should be TRUE" claim is likely wrong.

**D. Publish doesn't stage file deletions** (GPT-5.4 only — but verified against code)
`branch-manager.ts` copies only current output files and stages only those paths. If the base branch has prior docs at that location (from a merged previous publish), those stale files remain on the new publish branch. GPT-5.4 is correct. The other reviewers missed this.

**E. Adapter exceptions can escape EngineResult** (GPT-5.3 only — but verified against code)
`publishDocumentation()` has no top-level try/catch. If a git or gh adapter throws (vs. returning `{ ok: false }`), the SDK call rejects rather than resolving to `EngineResult`. CLI callers land in the `catch(error)` block and emit `CLI_ERROR`; direct SDK callers get an unhandled rejection. GPT-5.3 is correct. The Zod finding from the same reviewer is likely hallucinated.

### Medium confidence — flag but verify

**F. Metadata validation too shallow** (2/4)
`preflight.ts` parses `.doc-meta.json` with `JSON.parse` but doesn't validate shape. `{}` would pass. This is real but lower severity than framed — the TC coverage doesn't include shape-invalid metadata, and the spec says "valid metadata," which could be read as "structurally present and parseable."

**G. Output path validation too late** (2/4)
Confirmed: repo containment check happens inside `branch-manager.ts` after worktree and branch creation. A bad request creates a branch before failing. Low-severity because the worktree is cleaned up, but the branch artifact persists.

### Uncertain / low confidence — flag only

**H. SIGINT granularity** (GPT-5.4 only)
Current behavior: SIGINT sets a flag, the running operation completes, then `finalizeCancellation` exits. GPT-5.4 calls this insufficient because new stages keep starting mid-run. However, the test plan's SIGINT test verifies this "finish current operation" pattern explicitly, suggesting it's the intended design. Not a bug.

**I. `.module-plan.json` required for publish** (GPT-5.4 only)
The spec says publish validates "output exists and valid metadata." Requiring module-plan is stricter than spec. However, the non-TC test `missing module plan blocks publish` was intentionally added. If this is a deliberate design decision, it needs a comment in preflight.

**J. Update progress not verified** (GPT-5.4 only)
ACs 2.3 and 3.2 mention both generate and update. Progress tests only cover generate. The update path shares the same `createProgressRenderer` code, making this a low-risk gap, but the TC mapping is technically incomplete.

**K. `createStory5MockSDK` clustering gap** (Sonnet only)
Passing tests imply the engine has a heuristic for very small repos. The assumption is implicit.

---

## Revised Consensus Verdict

**Not ship-ready without one source fix.**

GPT-5.4's deletion staging finding is a correctness bug: any publish after the first merged docs cycle can leave stale pages on the new branch. The fix is non-trivial (requires either a `git rm` step or mirroring the output directory in the worktree before staging). The other three reviews missed this because they focused on the happy-path tests, which all use a fresh branch from a base branch without prior docs.

GPT-5.3's adapter exception finding is also real but lower severity: it only affects SDK direct callers (CLI callers are protected by `src/cli.ts`'s catch block). A `try/catch` wrapper in `publishDocumentation()` fixes it.

With those two source fixes plus the two test fixes (TC-2.5a/b, TC-1.4a), the implementation is clean.

**Revised minimum ship gate:**
1. ✅ Fix deletion staging in `branch-manager.ts` (source)
2. ✅ Wrap `publishDocumentation()` in try/catch → EngineResult (source)
3. ✅ Implement TC-2.5a/b with Python-missing PATH scenario (tests)
4. ✅ Replace TC-1.4a stub with real assertion (tests)

---

## What Each Review Would Contribute to a Best Synthesis

| Reviewer | Take | Leave |
|----------|------|-------|
| **GPT-5.4** | Deletion staging bug, metadata shape validation, output-path-in-preflight recommendation, update progress gap, spec conformance matrix structure | SIGINT-between-stages concern (design intent), overstatement of some P2s |
| **Opus** | Cleanest framing of TC-2.5a/b and TC-1.4a, positive observations section | Nothing — accurate and well-written |
| **Sonnet** | `createStory5MockSDK` clustering concern, TC-3.3a mock ambiguity, git 2.28 requirement | Nothing — findings are accurate |
| **GPT-5.3** | Adapter exception finding | Zod schemas claim (probable hallucination), `createPullRequest` default=true claim |

---

## Structural Observations About the Reviews

**GPT-5.4 is the most thorough reviewer** because it went beyond test analysis into runtime behavioral correctness — it asked "does the code actually do what the spec says in all scenarios?" not just "does the test coverage map to the TCs?" The deletion staging bug required thinking through the full publish lifecycle (base branch with prior merged docs), which is exactly the scenario test fixtures don't cover.

**The Claude-family reviews (Opus, Sonnet) share a systematic blind spot:** both focused heavily on test accuracy (TC mapping, test assertions) and less on source correctness under unusual-but-valid scenarios. The two source bugs (deletion staging, adapter exceptions) were found only by the GPT models. This is a meaningful pattern: Claude reviewers tend to be stronger at "does the test coverage match the spec?" and weaker at "what runtime scenarios does the code fail to handle?"

**GPT-5.3 has a reliability problem:** the Zod schemas citation references a file that doesn't exist. This is the hallucination risk of a model confidently citing fabricated evidence. In a synthesis, findings from this reviewer need independent code verification before inclusion.

**No reviewer** verified the `createStory5MockSDK` clustering behavior end-to-end. The E2E and determinism tests clearly pass, but the mechanism (heuristic vs. default mock behavior) is unexplained in the codebase. A complete review would have checked the orchestration code for the small-repo heuristic.
