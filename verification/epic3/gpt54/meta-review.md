# Epic 3 — Cross-Model Meta-Review

**Author:** GPT-5.4 (Codex) — codex54-reviewer
**Date:** 2026-03-16
**Input:** Four independent verification reviews of Epic 3 (CLI & Publish Pipeline)

---

## Reviews Evaluated

| # | Reviewer | File | Verdict | Unique Findings |
|---|----------|------|---------|-----------------|
| 1 | Opus | `opus/epic-review.md` | Ship-ready with 2 test fixes | TC coverage matrix (75 TCs), 15 positive observations |
| 2 | Sonnet 4.6 | `sonnet/epic-review.md` | Ship-ready with 2 test fixes | Mock fragility (clustering, TC-3.3a), git 2.28+ dep |
| 3 | GPT-5.3 Codex | `gpt53-codex/epic-review.md` | Needs significant work | Adapter exceptions escape SDK contract, Zod schemas unused |
| 4 | GPT-5.4 Codex | `gpt54/epic-review.md` | Not cleanly shippable | Publish deletion bug, SIGINT inter-stage gap |

---

## Ranking: Best to Worst

### 1st — GPT-5.4 (Codex)

**Score: A**

The strongest review. Found the highest-impact unique bug across all four reviews: publish does not stage file deletions, meaning stale docs persist on the publish branch and delete-only publishes fail. No other reviewer caught this. Also uniquely identified that SIGINT cancellation is never checked between pipeline stages — the design says it should be, the implementation doesn't. These are real correctness and spec-conformance issues, not style nits.

The spec conformance matrix (19 requirements, Pass/Partial/Fail) is the most detailed and honest assessment of any review. The executive summary correctly calls out that "tests overstate confidence" — a judgment the Claude reviews both missed. The architecture section accurately pinpoints that invariants are enforced too late or not at all, which is the unifying theme across the publish findings.

**Strengths:**
- Found 2 unique, high-impact bugs no other reviewer caught
- Most honest ship-readiness assessment
- Strongest spec-tracing discipline (line references into epic.md, tech-design.md, stories.md, test-plan.md)
- Best architecture diagnosis (enforcement location as root cause)
- Clean severity calibration — the P1 genuinely blocks ship

**Weaknesses:**
- Some line citations are to file+approximate-line rather than exact ranges
- No positive observations section — pure defect focus
- Could have caught the adapter exception escape (found by GPT-5.3)

---

### 2nd — Opus

**Score: B+**

The most thorough structural analysis. The TC coverage matrix accounts for all 75 test conditions with counts per chunk — no other review achieves this granularity. The 15 positive observations are genuinely useful for understanding what's working well (adapter injection, worktree lifecycle, determinism verification, type-level tests). Line citations are consistently exact.

The critical weakness is verdict optimism. Opus concluded "ship-ready with two test fixes" and stated "the source code is correct and complete." That assessment missed the publish deletion bug, the SIGINT inter-stage gap, and the metadata validation gap — all of which are source-level issues, not test issues. The two HIGH findings (TC-2.5a/b wrong scenario, TC-1.4a stub) are real but are the least impactful of the cross-review finding set.

**Strengths:**
- Best TC-level coverage tracking (75 TCs, per-chunk breakdown)
- Most useful positive observations (15 items with architectural insight)
- Cleanest document structure and readability
- Precise line citations throughout
- M-2 (push before PR check) is a good design awareness flag

**Weaknesses:**
- Over-optimistic verdict — missed 3 source-level bugs
- Classified `docs check` drift as a test issue only (H-1), not a source contract issue
- Did not examine publish for deletion handling at all
- Did not analyze cancellation integration beyond the SIGINT test's existence

---

### 3rd — Sonnet 4.6

**Score: B**

Good complementary analysis that found novel test-fragility issues. M-2 (story5 mock missing clustering config) and M-3 (TC-3.3a unconfigured mock relying on undefined→null coercion) are genuine implicit-dependency risks that no other review flagged. L-1 (git 2.28+ requirement) and L-4 (TC-1.2b environment assumption) are practical CI concerns.

The main weakness is intellectual dependence on Opus. The review explicitly frames itself as confirming Opus findings and adding supplementary items. This led it to inherit Opus's blind spots: same verdict ("ship-ready with two fixes"), same missed source bugs. A review that defers to another reviewer's framing will also defer to their errors.

**Strengths:**
- Found unique test-fragility findings (M-2, M-3) with clear risk analysis
- Practical CI/environment concerns (git version, env assumptions)
- Complementary positive observations that don't duplicate Opus
- Good detail on fix recommendations (e.g., exact helper to reuse for TC-2.5a)

**Weaknesses:**
- Explicitly followed Opus verdict — inherited all blind spots
- Missed same 3 source-level bugs as Opus
- Did not independently assess ship-readiness
- L-2 (output path validated late) was flagged LOW when GPT-5.4 correctly flagged it P2

---

### 4th — GPT-5.3 Codex

**Score: B-**

Found one unique and important P1: adapter exceptions can escape the `EngineResult` contract in `publishDocumentation()`, causing uncaught exceptions instead of structured errors. This is a real trust-boundary issue that no other review caught. The createPullRequest default finding is also correctly framed as a spec-vs-implementation conflict (CLI defaults false, spec says default true), which is sharper than Opus/Sonnet's framing.

However, this is the shortest and least detailed review. It has fewer findings total, less precise line citations, no positive observations, and no TC-level coverage analysis. The spec compliance matrix uses simple checkmarks without the nuance of Opus's per-chunk counts or GPT-5.4's Pass/Partial/Fail gradations. It missed the publish deletion bug and the SIGINT inter-stage gap.

**Strengths:**
- Unique P1: adapter exception escape — genuine contract violation
- Sharper framing of createPullRequest default as spec drift
- Zod schema observation (defined but unused) is a valid contract-enforcement gap
- Concise — gets to the point quickly

**Weaknesses:**
- Shortest review with fewest total findings
- No positive observations or architecture quality section
- Less precise citations (file:line but not ranges)
- Missed publish deletion and SIGINT inter-stage issues
- Spec compliance matrix lacks nuance

---

## Cross-Review Finding Concordance

### Unanimous (found by all 4 reviewers)
| Finding | Opus | Sonnet | GPT-5.3 | GPT-5.4 |
|---------|------|--------|---------|---------|
| TC-2.5a/b tests wrong scenario | H-1 | H-1 | P1 (part) | P3-3 |
| TC-1.4a is a placeholder stub | H-2 | H-2 | P2 (part) | P3-2 |

### Majority (3 of 4)
| Finding | Found by | Missed by |
|---------|----------|-----------|
| `createPullRequest` undefined defaults to PR | Opus, Sonnet, GPT-5.3 | GPT-5.4 |
| Preflight metadata validation is syntactic-only | GPT-5.3, GPT-5.4 + (Sonnet L-2 adjacent) | Opus |
| Output path validated after git mutation | Sonnet, GPT-5.4 + (Opus M-2 adjacent) | GPT-5.3 |

### Found by 1 reviewer only (unique)
| Finding | Reviewer | Severity | Synthesis Value |
|---------|----------|----------|-----------------|
| Publish doesn't stage deletions | GPT-5.4 | P1 | **Must include** — highest-impact finding across all reviews |
| SIGINT not checked between stages | GPT-5.4 | P2 | **Must include** — spec-level deviation |
| Adapter exceptions escape EngineResult | GPT-5.3 | P1 | **Must include** — trust boundary violation |
| Mock clustering config implicit | Sonnet | M-2 | Include — test fragility risk |
| TC-3.3a mock unconfigured | Sonnet | M-3 | Include — implicit assumption |
| git 2.28+ requirement | Sonnet | L-1 | Include — CI portability |
| TC-1.2b env assumption | Sonnet | L-4 | Include — test brittleness |
| Zod schemas defined but unused | GPT-5.3 | P3 | Include — contract enforcement gap |
| Progress coverage generate-only | GPT-5.4 | P3 | Include — AC coverage gap |
| Module-plan hard-required | GPT-5.4 | P3 | Include — spec coupling |

---

## What I'd Take for a Synthesis

### Verdict
Adopt **GPT-5.4's assessment**: not cleanly shippable. The publish deletion bug alone blocks ship. The Opus/Sonnet "ship-ready with 2 test fixes" verdict is incorrect — it missed source-level bugs.

### P1 Findings (from synthesis)
1. **Publish deletion bug** (GPT-5.4) — stale docs persist, delete-only publishes fail
2. **Adapter exceptions escape SDK contract** (GPT-5.3) — uncaught exceptions instead of structured errors

### P2 Findings (from synthesis)
1. **Output path validation runs after git mutation** (GPT-5.4, Sonnet)
2. **`docs check` contract drift** (GPT-5.4, GPT-5.3) — findings-based vs structured error
3. **SIGINT not checked between stages** (GPT-5.4) — weaker than design specifies
4. **Metadata validation syntactic-only** (GPT-5.4, GPT-5.3)
5. **`createPullRequest` default mismatch** (Opus, Sonnet, GPT-5.3) — CLI defaults false, spec says true

### TC Coverage Matrix
Adopt **Opus's per-chunk TC matrix** (75 TCs with counts) as the structural skeleton, annotated with **GPT-5.4's Pass/Partial/Fail** gradations for spec conformance.

### Architecture & Positive Observations
Adopt **Opus's 15 positive observations** + **Sonnet's 8 complementary items** for the "what's working" section. Use **GPT-5.4's architecture diagnosis** (enforcement location as root cause) as the framing for the "what needs attention" section.

### Test Fragility
Adopt **Sonnet's unique findings** (M-2 clustering mock, M-3 TC-3.3a, L-1 git version, L-4 env assumption) — these are practical CI risks that the other reviews missed.

### Recommendations
Merge all four recommendation lists, deduplicated, ordered by synthesis severity:
1. Fix publish to mirror output directory (delete stale files, `git add -A`)
2. Wrap adapter calls in try/catch, normalize to EngineResult
3. Move all preflight validation before git mutation
4. Resolve `docs check` contract across impl/spec/tests
5. Validate metadata with shared schema, not raw JSON.parse
6. Thread cancellation into orchestration stage boundaries
7. Align createPullRequest default with spec
8. Repair test drift: TC-1.4a, TC-2.5, update progress, failure-path worktree
9. Add adapter-throw tests, metadata-shape-invalid tests
10. Document git 2.28+ requirement, fix env-dependent test assumptions

---

## Model Capability Observations

| Dimension | Best Performer | Notes |
|-----------|---------------|-------|
| Bug-finding depth | GPT-5.4 | Found highest-impact unique bugs (publish deletion, SIGINT) |
| Structural thoroughness | Opus | 75-TC matrix, 15 positive observations, best document structure |
| Complementary analysis | Sonnet | Best at finding implicit assumptions and test fragility |
| Contract-boundary analysis | GPT-5.3 | Adapter exception escape is a sharp trust-boundary find |
| Verdict accuracy | GPT-5.4 | Only reviewer whose verdict matches the actual state |
| Over-optimism risk | Opus, Sonnet | Both said "ship-ready" while missing source bugs |
| Conciseness | GPT-5.3 | Most efficient use of output space, but at cost of depth |
| Spec tracing | GPT-5.4 | Most references into spec files per finding |

**Key takeaway:** No single review was sufficient. The synthesis of all four is materially stronger than any individual review. The two most impactful unique findings came from different models (GPT-5.4: publish deletion, GPT-5.3: adapter exceptions). The Claude models (Opus, Sonnet) excelled at structural analysis and positive observations but were over-optimistic on ship-readiness. The GPT models were more critical and found deeper source-level bugs.
