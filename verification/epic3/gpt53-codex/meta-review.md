# Epic 3 — Cross-Model Meta-Review
**Author:** codex53-reviewer (gpt-5.3-codex perspective)
**Date:** 2026-03-16
**Reviews analyzed:** Opus, Sonnet 4.6, GPT-5.4, GPT-5.3-codex

---

## Ranking: Best to Worst

### 1. GPT-5.4 — Most Thorough, Most Honest

**What's good:**
- Found the single most critical bug across all four reviews: **publish doesn't stage file deletions**, meaning stale docs persist on the publish branch and delete-only publishes fail with "nothing to commit." No other reviewer caught this. It's a real correctness defect against AC-4.2/AC-4.5.
- Strongest spec-reading depth — the conformance matrix uses Pass/Partial/Fail with detailed justifications, not just checkmarks. You can see it actually traced each AC through implementation *and* tests.
- Unique findings no one else surfaced: SIGINT doesn't stop between stages (only checked before/after the full SDK call), `update` progress path is never tested despite explicit AC coverage, and `.module-plan.json` hard-requirement creates coupling not in the spec.
- Most honest about ship-readiness. Called it "not cleanly shippable" while others said "ship-ready with two test fixes." Given the deletion staging bug, GPT-5.4 was right.

**What's bad:**
- Severity may be slightly inflated on SIGINT (P2) — the design says "current session may finish but new stages should not start," but whether this is a ship-blocker vs. a design improvement is debatable.
- No positive observations section. Every other reviewer acknowledged what's working well; GPT-5.4 only flags problems. This makes the review feel adversarial rather than balanced.
- Line citations are slightly less precise than Opus/Sonnet (often block-level rather than exact line).

**For synthesis:** Take the publish deletion finding (P1), SIGINT inter-stage concern, progress update coverage gap, and module-plan observation. These are all unique and verified.

---

### 2. Opus — Most Balanced and Precise

**What's good:**
- Best file:line citation precision across all four reviews. Every finding pins to an exact line range.
- The positive observations section (15 items) is genuinely valuable — it documents *why* the codebase is well-built, not just what's broken. Items like worktree `try/finally` cleanup, singleton-safe cancellation handler, and sorted `filesForCommit` show deep reading.
- Clear TC Coverage Matrix (75 total, 73 verified, 1 stub, 2 misaligned) — easy to scan and audit.
- Verdict is crisp and actionable: "Ship-ready with two fixes. Both are test-only changes. Source code is correct."
- First to identify both HIGH findings (TC-2.5a/b wrong scenario, TC-1.4a stub) that became consensus across all reviews.

**What's bad:**
- Missed the publish deletion staging bug entirely. Called source code "correct and complete" — which GPT-5.4 disproved.
- M-2 (push succeeds before PR creation check) is flagged but immediately downgraded to "design awareness" — borderline not worth including if you're going to immediately dismiss it.
- Possibly too generous. "Ship-ready with two test fixes" doesn't account for the spec compliance drift that three other reviewers flagged more strongly (check contract, preflight metadata, createPullRequest default).

**For synthesis:** Take the positive observations section wholesale. Take the TC matrix format. Use Opus's severity calibration as the baseline (neither over- nor under-alarmed) but adjust upward for items GPT-5.4 found.

---

### 3. Sonnet 4.6 — Best Additive Analysis, Least Independent

**What's good:**
- Found three unique MEDIUM findings no other reviewer caught:
  - M-2: `createStory5MockSDK` omits clustering config — implicit heuristic dependency that could silently break.
  - M-3: TC-3.3a leaves `mockGetHeadCommitHash` unconfigured — test relies on undefined→null coercion.
  - L-1: `--initial-branch=main` requires git 2.28+ — CI portability concern.
- Deepest test internals analysis. Sonnet is the only reviewer that looked *inside* the mock machinery and questioned whether test assumptions were fragile.
- Specific fix suggestions are the most actionable (e.g., exact helper function to reuse for TC-2.5a fix).
- L-3 (exit code 1 for "env not ready" vs "runtime error") is a genuine UX semantics observation no one else made.

**What's bad:**
- Explicitly derivative. Opens with "same as Opus conclusion" and sections say "complementing what Opus noted." This is a follow-on pass, not an independent review.
- M-2 (clustering mock) is somewhat speculative — "the tests pass today" with two hypothesized explanations, neither confirmed. Good instinct, but not verified.
- No independent verdict formation. If Opus was wrong about ship-readiness (it was — publish deletion bug), Sonnet inherited that error.

**For synthesis:** Take M-2 (clustering mock fragility) and M-3 (TC-3.3a mock gap) as unique test-quality concerns. Take the git 2.28+ CI concern. The fix suggestions for TC-2.5a are the most copy-paste ready.

---

### 4. GPT-5.3-codex — Most Concise, Shallowest

**What's good:**
- Found one unique P1 no other reviewer flagged: **adapter methods can throw unhandled exceptions** that escape the `EngineResult` contract (timeout/spawn errors bypass structured error handling). This is a real gap — the publish orchestrator assumes adapters always return Result types, but `execFile` can throw.
- Compliance matrix is the cleanest format (✅/⚠️/❌ with one-line notes) — easy to scan at a glance.
- Zod schemas observation (P3) is unique and points to a contract enforcement gap: schemas exist but aren't exercised at runtime.
- Most actionable recommendations — five numbered items, each one sentence.

**What's bad:**
- At 70 lines, it's the shallowest review by far. Opus is 165, Sonnet is 272, GPT-5.4 is 135.
- Missed the publish deletion staging bug (GPT-5.4's P1).
- Missed SIGINT inter-stage cancellation concern, progress update coverage gap, clustering mock fragility, and git version portability.
- No positive observations. No test internals analysis. Architecture notes are a single paragraph.
- The "createPullRequest should default true" P2 cites spec lines but doesn't verify whether the spec actually says default-true or whether this is a misread — the other reviews are more careful here.

**For synthesis:** Take the adapter exception finding (genuine and unique). Take the zod schema observation. Take the compliance matrix format for the final synthesis report's quick-reference table.

---

## Cross-Review Consensus Map

### Universal Agreement (4/4 reviewers)
| Finding | Opus | Sonnet | GPT-5.4 | GPT-5.3 |
|---------|------|--------|---------|---------|
| TC-2.5a/b test wrong scenario (publish error, not Python-missing check) | H-1 | H-1 | P3-3 | P1-2 (partial) |
| TC-1.4a is a no-op stub | H-2 | H-2 | P3-2 | P2-3 |
| Preflight metadata validation is JSON-parse-only | — | — | P2-4 | P2-2 |

### Strong Agreement (3/4 reviewers)
| Finding | Who found it | Who missed it |
|---------|-------------|---------------|
| `createPullRequest` SDK default surprise (undefined → PR creation) | Opus, Sonnet, GPT-5.3 | GPT-5.4 (mentioned differently as spec contract) |
| `docs check` dependency path doesn't return structured error | GPT-5.4, GPT-5.3, Opus (implicit in H-1) | Sonnet (inherited from Opus) |
| Output path validated after worktree/branch creation | Sonnet, GPT-5.4, GPT-5.3 | Opus |

### Unique Findings (1 reviewer only)
| Finding | Reviewer | Significance |
|---------|----------|-------------|
| Publish doesn't stage deletions — stale docs persist | GPT-5.4 | **Highest-impact finding across all reviews** |
| Adapter exceptions can escape EngineResult contract | GPT-5.3 | Real gap — execFile throws aren't caught |
| SIGINT doesn't stop between orchestration stages | GPT-5.4 | Design-level concern, debatable severity |
| `createStory5MockSDK` omits clustering config | Sonnet | Fragility concern in test fixtures |
| TC-3.3a mock not configured for getHeadCommitHash | Sonnet | Implicit test assumption |
| `update` progress path never tested | GPT-5.4 | AC coverage gap |
| `.module-plan.json` hard-required by publish | GPT-5.4 | Spec coupling not documented |
| Zod schemas defined but not exercised at runtime | GPT-5.3 | Contract enforcement gap |
| git 2.28+ required for `--initial-branch` | Sonnet | CI portability |

---

## Synthesis Recommendations

For a final consolidated review, I would structure it as follows:

### Take from GPT-5.4:
- The publish deletion staging finding as the top P1
- SIGINT inter-stage concern as a design-level P2
- Progress update coverage gap
- The honest "not cleanly shippable" framing (the other three reviews were too optimistic)

### Take from Opus:
- The positive observations section (the synthesis should acknowledge what's working, not just what's broken)
- The TC Coverage Matrix format (75 TCs, detailed chunk breakdown)
- Severity calibration style (precise, not inflated)
- File:line citation precision

### Take from Sonnet:
- Story5 mock clustering concern and TC-3.3a mock gap (unique test-quality findings)
- The specific fix suggestions (most copy-paste ready of the four)
- Git 2.28+ CI portability note
- Exit code semantics observation

### Take from GPT-5.3-codex:
- Adapter exception escape finding as a P1 (no other reviewer caught this)
- Compliance matrix format (✅/⚠️/❌) for the quick-reference table
- Zod schema observation

### Proposed Severity for Synthesis:
| # | Finding | Proposed Severity | Source |
|---|---------|------------------|--------|
| 1 | Publish doesn't stage deletions | P1 | GPT-5.4 |
| 2 | Adapter exceptions escape EngineResult | P1 | GPT-5.3 |
| 3 | `docs check` contract drift (structured error vs findings) | P1 | GPT-5.4 + GPT-5.3 (consensus) |
| 4 | TC-2.5a/b test wrong scenario | P2 | All four (consensus) |
| 5 | TC-1.4a placeholder stub | P2 | All four (consensus) |
| 6 | Preflight metadata validation shallow | P2 | GPT-5.4 + GPT-5.3 + Sonnet |
| 7 | Output path validated after git mutation | P2 | Sonnet + GPT-5.4 + GPT-5.3 |
| 8 | `createPullRequest` default mismatch | P2 | Opus + Sonnet + GPT-5.3 |
| 9 | SIGINT doesn't stop between stages | P2 | GPT-5.4 |
| 10 | `update` progress path untested | P3 | GPT-5.4 |
| 11 | Story5 mock clustering implicit | P3 | Sonnet |
| 12 | TC-3.3a mock unconfigured | P3 | Sonnet |
| 13 | Zod schemas unused at runtime | P3 | GPT-5.3 |
| 14 | `.module-plan.json` coupling | P3 | GPT-5.4 |
| 15 | git 2.28+ CI requirement | P3 | Sonnet |

---

## Overall Assessment

**No single review was complete.** GPT-5.4 found the most critical bug but missed the adapter exception gap. GPT-5.3-codex found the adapter gap but missed the deletion bug. Opus was the most precise but the most optimistic. Sonnet added unique test-quality depth but couldn't form an independent verdict.

The correct ship assessment is GPT-5.4's: **not cleanly shippable as-is.** The publish deletion staging bug is a real correctness defect, the adapter exception escape is a contract violation, and the `docs check` contract drift means the spec, implementation, and tests all disagree. These three P1s need resolution before merge. The remaining P2/P3 items are important but don't block ship.

Multi-model review was essential here. No single model found everything. The deletion staging bug (GPT-5.4) and the adapter exception gap (GPT-5.3) are both genuine, and each was caught by exactly one reviewer.
