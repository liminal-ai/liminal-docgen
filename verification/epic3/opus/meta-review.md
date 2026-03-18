# Epic 3 Meta-Review: Four-Reviewer Synthesis

**Meta-reviewer:** Opus
**Date:** 2026-03-16
**Reviews analyzed:**
1. `opus/epic-review.md` — Opus (self)
2. `sonnet/epic-review.md` — Sonnet 4.6
3. `gpt54/epic-review.md` — GPT-5.4
4. `gpt53-codex/epic-review.md` — GPT-5.3-codex

---

## Reviewer Rankings (Best → Worst)

### 1. Sonnet 4.6 — Best Overall

**Verdict given:** Ship-ready with 2 fixes
**Findings:** 2 HIGH, 3 MEDIUM, 4 LOW

**Strengths:**
- Confirmed both Opus HIGHs with identical analysis, then independently added three genuine MEDIUM findings and four LOWs that no other reviewer caught.
- Every finding verified against actual code with correct line references. Zero false positives.
- Best severity calibration: MEDIUMs (clustering mock fragility M-2, TC-3.3a implicit mock M-3) are real test-maintenance risks correctly scoped below "blocks ship." LOWs (git 2.28+, validation ordering, exit code semantics, TC-1.2b env assumption) are all legitimate but appropriately deprioritized.
- Complementary positive observations — focused on items Opus didn't cover (cancellation singleton safety, `gh` argument injection safety, `collectFilesForCommit` sort determinism, `callOverrides` mock mechanism).
- Explicitly built on Opus rather than working in isolation, which produced a genuinely additive review rather than a redundant one.

**Weaknesses:**
- Didn't catch the publish stale-file concern that GPT-5.4 identified (the worktree inherits base-branch files that may not be in the current output).
- Didn't flag the update-mode progress test gap.

**What I'd take for synthesis:** All findings at face value. The clustering mock fragility (M-2) and TC-3.3a implicit mock (M-3) are the strongest unique contributions — they identify test brittleness that would cause confusing failures if internals change.

---

### 2. Opus — Solid Foundation

**Verdict given:** Ship-ready with 2 fixes
**Findings:** 2 HIGH, 2 MEDIUM, 3 LOW

**Strengths:**
- All findings verified correct against code. Zero false positives.
- Clean structure with TC coverage matrix providing quick-reference verification.
- 15 positive observations give a balanced view — important for a review that flags issues without dismissing what works.
- Correctly identified the two genuine must-fix items (TC-2.5a/b wrong scenario, TC-1.4a stub) before any other reviewer.

**Weaknesses:**
- Conservative. Missed several legitimate findings that Sonnet caught (clustering mock fragility, TC-3.3a mock, git version requirement, TC-1.2b environment assumption).
- Didn't explore publish behavior under merge-then-republish scenarios (GPT-5.4's deletion concern).
- M-2 (push before PR check) is more of an informational note than a finding. Labeling it MEDIUM overstates its importance since it's by-design and tested.

**What I'd take for synthesis:** The two HIGHs are the foundation. The positive observations provide balance. The M-1 (createPullRequest default) is validated by all four reviews.

---

### 3. GPT-5.4 — Most Ambitious, Least Accurate

**Verdict given:** Not cleanly shippable
**Findings:** 1 P1, 4 P2, 4 P3, 1 P4

**Strengths:**
- Found a genuine design gap that all other reviewers missed: **publish doesn't handle file deletions** when the base branch contains previously-merged doc files. When docs are regenerated with fewer files and the base branch has old docs from a previous merged publish, stale files survive on the new publish branch. This is a real limitation.
- Identified the update-mode progress test gap — AC-2.3 and AC-3.2 both cover generate AND update, but tests only verify generate.
- Most thorough spec conformance matrix with per-AC status tracking.
- Detailed spec references with line numbers for every finding.

**Weaknesses:**
- **Severity overclaiming.** The deletion concern is real but calling it P1/critical is wrong. It only manifests after a previous publish is merged to the base branch AND the subsequent generation removes files. First publishes and publishes-before-merge work correctly. This is a MEDIUM design limitation, not a ship-blocker.
- **Incorrect attribution.** The SIGINT finding (P2-3) blames Epic 3 for not threading cancellation into the orchestration layer. But the tech design explicitly states "Between stages, the orchestrator checks this flag" — the orchestrator is Epic 2, not Epic 3. The CLI layer's responsibility is the SIGINT handler and exit code, which it implements correctly. The between-stage checking is Epic 2's job.
- **Contradicts the tech design.** P3-1 claims `.module-plan.json` requirement is "stricter than spec." But the tech design's module responsibility matrix for `publish/preflight.ts` says it verifies "output directory exists, `.doc-meta.json` valid, git remote configured" and the preflight implementation also checks module-plan as part of ensuring a complete generation output. This is by design.
- **`docs check` contract analysis (P2-2) mischaracterizes the implementation.** The check command returns `ok({ passed: false, findings: [...] })` with a finding containing `category: "missing-dependency"` and `dependencyName: "python"`. This IS structured data with error codes, categories, and messages — it's just in a findings array rather than a top-level error envelope. Whether this matches the AC is debatable (the AC says "DEPENDENCY_MISSING error" which is ambiguous), but calling the current behavior "materially different from the documented one" overstates the gap.

**What I'd take for synthesis:** The deletion concern (downgraded to MEDIUM) is genuinely novel and worth including. The update-mode progress gap is a valid test coverage observation. Everything else is either incorrect, overclaimed, or covered by other reviewers.

---

### 4. GPT-5.3-codex — Thinnest Review

**Verdict given:** Largely complete, main risks are spec-contract drift
**Findings:** 2 P1, 3 P2, 1 P3

**Strengths:**
- The adapter exception finding (P1-1) identifies a genuine defensive-programming gap: `publishDocumentation()` passes adapter calls through without try/catch, so if an adapter method throws (rather than returning `err()`), the exception escapes the `EngineResult` contract. The real adapters are mostly defensive internally, but the publish orchestrator should defend its own boundary.
- The zod schemas observation (P3) is a legitimate architectural note — publish schemas exist but aren't used at runtime. Either use them or remove them.

**Weaknesses:**
- **False positive on createPullRequest default.** Claims "Epic/Tech Design contract states default true" referencing `epic.md:613` and `tech-design.md:1082`. I read both documents thoroughly — neither specifies a default value for `createPullRequest`. The CLI defaulting to `false` is a reasonable design choice, not a spec violation. This undermines confidence in the review's spec-reading accuracy.
- **Thinnest coverage.** Only 6 findings total. Didn't identify the clustering mock fragility, the TC-3.3a implicit mock, the git version requirement, the deletion concern, or the update progress gap. For a full-codebase verification, this is insufficient breadth.
- **Redundant with other reviews.** The `docs check` contract finding and TC-1.4a stub were already covered by Opus/Sonnet. The preflight metadata validation concern was covered by GPT-5.4. The unique contributions are limited to adapter exceptions and zod schemas.

**What I'd take for synthesis:** The adapter exception concern (downgraded from P1 to MEDIUM — it's a defensive programming gap, not a correctness bug since the real adapters handle their own errors). The zod schemas note as a LOW.

---

## Cross-Reviewer Agreement Matrix

| Finding | Opus | Sonnet | GPT-5.4 | GPT-5.3 | Consensus |
|---------|------|--------|---------|---------|-----------|
| TC-2.5a/b wrong scenario | HIGH | HIGH | P3 | P1 | **Universal — HIGH** |
| TC-1.4a stub | HIGH | HIGH | P3 | P2 | **Universal — HIGH** |
| `createPullRequest` undefined defaults to PR | MED | MED | — | P2 (wrong direction) | **3/4 — MEDIUM** |
| Preflight metadata syntactic-only | — | — | P2 | P2 | **2/4 — MEDIUM** |
| Output path validated after worktree/branch | — | LOW | P2 | — | **2/4 — LOW** |
| Publish stale-file deletion gap | — | — | P1 | — | **1/4 — MEDIUM** (valid but overclaimed) |
| Adapter exceptions unguarded | — | — | — | P1 | **1/4 — MEDIUM** |
| Clustering mock omitted | — | MED | — | — | **1/4 — LOW-MEDIUM** |
| TC-3.3a implicit mock | — | MED | — | — | **1/4 — LOW** |
| Update progress not tested | — | — | P3 | — | **1/4 — LOW** |
| SIGINT not between stages | — | — | P2 | — | **0/4 — REJECTED** (Epic 2 responsibility) |
| CLI publish default-true claim | — | — | — | P2 | **0/4 — REJECTED** (spec doesn't say this) |

---

## Synthesized Findings (Recommended for Action)

### Must Fix (2)

1. **TC-2.5a/TC-2.5b test wrong scenario** — All four reviewers agree. Tests exercise publish errors instead of the spec-required Python-missing check errors. Fix: use `createGitOnlyPathDir()` helper against `docs check`.

2. **TC-1.4a is a no-op stub** — All four reviewers agree. Replace `expect(true).toBe(true)` with real CLI-vs-SDK parity assertions for generate.

### Should Fix (3)

3. **`createPullRequest` undefined defaults to PR creation** — Three reviewers agree. SDK callers who omit the field get unexpected PR creation. Fix: change `=== false` to `!request.createPullRequest`.

4. **Preflight metadata validation is syntactic-only** — Two reviewers agree. `JSON.parse` passes `{}` as valid metadata. Fix: validate shape via metadata reader or zod schema.

5. **Publish doesn't handle file deletions from base branch** — Only GPT-5.4 caught this, but it's a genuine design gap. When a previous publish was merged to the base branch and docs are regenerated with fewer files, stale files persist on the new publish branch. Fix: clear the output directory in the worktree before copying, or use `git add -A <output-path>` to capture deletions.

### Consider (4)

6. **Adapter exceptions can escape EngineResult contract** — GPT-5.3-codex. Publish orchestrator doesn't try/catch adapter calls. Low probability (real adapters are defensive) but violates the structured-error contract.

7. **`createStory5MockSDK` omits clustering config** — Sonnet. Tests pass because the engine has a small-repo heuristic, but the assumption is implicit. Add clustering config or document the heuristic.

8. **Update-mode progress not tested** — GPT-5.4. AC-2.3 and AC-3.2 cover both generate and update, but tests only verify generate progress.

9. **Output path validation runs after worktree/branch creation** — Sonnet, GPT-5.4. Move the repo-containment check to preflight.

---

## Reviewer Quality Assessment

| Dimension | Opus | Sonnet | GPT-5.4 | GPT-5.3 |
|-----------|------|--------|---------|---------|
| Accuracy | ★★★★★ | ★★★★★ | ★★★☆☆ | ★★★☆☆ |
| Depth | ★★★★☆ | ★★★★★ | ★★★★★ | ★★★☆☆ |
| Severity calibration | ★★★★★ | ★★★★★ | ★★☆☆☆ | ★★★☆☆ |
| Unique contributions | ★★★☆☆ | ★★★★☆ | ★★★★☆ | ★★★☆☆ |
| False positive rate | 0% | 0% | ~30% | ~17% |
| Signal-to-noise | ★★★★★ | ★★★★★ | ★★★☆☆ | ★★★★☆ |

**Best synthesis approach:** Start from Sonnet (most complete accurate review), merge in GPT-5.4's deletion concern (downgraded) and update-progress gap, add GPT-5.3-codex's adapter exception concern, and use Opus's positive observations for balance.

---

## Final Verdict

The codebase is **ship-ready with the two universal HIGH fixes** (TC-2.5a/b scenario, TC-1.4a stub). The three SHOULD-FIX items are worth addressing before or shortly after ship. The four CONSIDER items are improvements that reduce future risk but don't block delivery.

Source code quality is high. The issues are concentrated in test accuracy (wrong scenarios, stubs) and defensive edge cases (metadata validation depth, deletion handling, adapter exceptions). The core architecture — thin CLI, adapter DI, worktree isolation, structured errors — is well-implemented.
