# Epic 2 Verification — Meta-Review of Four Reviewer Reports

**Meta-reviewer:** GPT-5.4 (Codex)
**Date:** 2026-03-16
**Reports evaluated:**
1. Opus — `verification/epic2/opus/epic-review.md`
2. Sonnet — `verification/epic2/sonnet/epic-review.md`
3. GPT-5.4 — `verification/epic2/gpt54/epic-review.md`
4. GPT-5.3-Codex — `verification/epic2/gpt53-codex/epic-review.md`

---

## Ranking: Best to Worst

### 1st Place: Sonnet

**What's good:**
- Most meticulous TC-by-TC analysis. Every TC is individually accounted for with status, test file, and notes — making it easy to audit coverage at a glance.
- Found a unique, legitimate issue no other reviewer caught: **TC-1.8a misalignment** — the test covers the failure path (validation errors blocking the run) but the AC specifies the success path (`validationResult` present in a successful result). This is a genuine formal coverage gap.
- Highest density of unique minor findings that demonstrate deep reading: `costUsd` optionality mismatch between success/failure types (m-4), `computing-changes` progress event emitted after prior-state read rather than before it (m-2), duplicate collision detection between `generateModuleDocs` and `writeModuleTree` (m-5), `callOverrides` silently setting `hasMissingUsage` (m-6), and the `moduleNameToFileName` slash-stripping behavior (m-7).
- Prioritized action items with clear tiers: "address before merge," "nice-to-have before merge," and "low priority / track for later."
- Architecture compliance section is precise — calls out `writing-module-tree` having no progress event as a potential spec gap.

**What's not good:**
- Could have been more explicit about the metadata-write exception-escape risk (the `captureFileSnapshot` rethrow path that can break the "always structured failure" contract). This was caught by GPT-5.4 and GPT-5.3-Codex but not Sonnet.
- Classified the stub adapter as Critical but then said "may be intentional scaffolding" — slightly hedging on what is clearly a release-blocker.

**What I'd take for a synthesized best review:**
- The full TC coverage matrix with per-TC status and notes
- The TC-1.8a misalignment finding
- The prioritized action item tiers
- Minor findings m-2 (computing-changes event timing), m-4 (costUsd optionality), and m-7 (moduleNameToFileName slash behavior)

---

### 2nd Place: GPT-5.3-Codex

**What's good:**
- Found the **`overview.md` reserved filename collision** (Critical #2) — a genuine, unique finding that no other reviewer caught. A module named "overview" produces `overview.md`, which would overwrite the generated overview artifact. This is a real correctness bug.
- Ran the test suite (117 tests, all passing) — the only reviewer to actually execute code rather than perform purely static analysis.
- Strong contract/type alignment section that identifies the `PlannedModule` hand-declared vs inferred type drift risk.
- Clear, actionable recommendations with specific remediation steps.
- Good AC coverage matrix with honest "Partial" markings and explanatory notes.

**What's not good:**
- Less granular TC analysis compared to Sonnet — uses a table but doesn't provide the same depth of per-TC reasoning.
- Some findings overlap with other reviews without adding distinguishing detail (e.g., the stub adapter finding is the same across all four reports).
- Missing some of the subtle findings Sonnet caught (TC-1.8a misalignment, costUsd optionality, computing-changes event timing).

**What I'd take for a synthesized best review:**
- The `overview.md` reserved filename collision — this is the single most actionable unique finding across all four reports
- The contract/type alignment analysis (PlannedModule drift risk)
- The "ran the tests" verification
- The relationship-impact directionality framing (clearer than GPT-5.4's version)

---

### 3rd Place: GPT-5.4

**What's good:**
- Found the **metadata-write exception escape** path (Critical #2) — `captureFileSnapshot` can rethrow non-ENOENT errors, and the call site in `generate.ts:523` lacks a top-level catch, violating the "always structured failure" contract. GPT-5.3-Codex also found this, but GPT-5.4 was more specific about the call chain.
- Comprehensive AC-by-AC walkthrough with file and line citations for both implementation and test coverage.
- Good coverage of update-mode relationship mapping gaps — correctly identifies that relationship detection only sees outgoing edges from changed files and misses import-chain mapping.
- Explicit section on incremental update path assessment.

**What's not good:**
- Some findings overlap heavily with other reviews without new insight. The "stage contract drift" finding, for example, was better articulated by GPT-5.3-Codex with concrete remediation options.
- The "parent-module integrity not validated" gap under AC-1.3 is vaguely specified — it's unclear what "parent-module integrity" means in this context and whether it's a real gap.
- Only 4 minor findings vs Sonnet's 7 — missed several subtle issues (TC-1.8a misalignment, costUsd optionality, computing-changes event ordering, duplicate collision detection).
- Prompt tests characterized as "lightweight substring tests" without specific recommendations for improvement.

**What I'd take for a synthesized best review:**
- The metadata-write exception escape finding with specific call-chain detail
- The update-mode relationship mapping analysis
- The recovery & failure handling section structure

---

### 4th Place: Opus

**What's good:**
- Excellent writing quality — clear, well-organized, easy to read. Best prose of the four reports.
- Strong "Positive Observations" section that calls out defensive engineering practices (snapshot-based metadata writes, path traversal prevention, bounded quality review, deterministic sorting). This is valuable context that other reviews largely omit.
- Clean architecture compliance table mapping design elements to status.
- Nuanced test design quality analysis — correctly notes that duplicated helpers across test files is a reasonable design choice for self-containment despite DRY concerns.
- Ran test count verification (117 tests, 203 total) and provided a clear coverage metrics table.

**What's not good:**
- **Too lenient.** Classified the stub adapter as Major (M3) when every other reviewer rated it Critical. The verdict — "The implementation is ready for production use" — is misleading: the system literally cannot run outside mocked tests.
- Fewest unique findings. Every issue Opus found was also found by at least two other reviewers. No novel discoveries.
- Missed significant issues that other reviewers caught:
  - The metadata-write exception escape (GPT-5.4, GPT-5.3-Codex)
  - The `overview.md` reserved filename collision (GPT-5.3-Codex)
  - The TC-1.8a test/AC misalignment (Sonnet)
  - Mermaid presence not enforced (GPT-5.4)
  - Update-mode relationship mapping partiality (GPT-5.4, GPT-5.3-Codex)
- "No critical issues found" contradicts three other reviewers, all of whom independently classified the stub adapter as Critical.

**What I'd take for a synthesized best review:**
- The positive observations section — other reviews are deficit-focused; Opus correctly highlights what's working well
- The architecture compliance table format
- The test design quality analysis (strengths + weaknesses balanced)
- The nuanced note about test helper duplication being a valid design choice

---

## Cross-Review Finding Consensus

### Issues found by all 4 reviewers (high confidence)
| Finding | Opus | Sonnet | GPT-5.4 | GPT-5.3-Codex |
|---------|------|--------|---------|---------------|
| Agent SDK adapter is a stub | M3 | C-1 | Critical #1 | Critical #1 |
| Missing `pure-functions.test.ts` | M1 | M-1 | Minor #3 | Minor #3 |
| `LARGE_REPO_MODULE_THRESHOLD` dead constant | M2 | M-3 | Minor #2 | — (implicit in type drift) |
| SDK init failure misattributed to `planning-modules` stage | m4 | m-1 | Major #4 | — (implicit in stage drift) |

### Issues found by 3 reviewers
| Finding | Reviewers | Severity consensus |
|---------|-----------|-------------------|
| Stage contract drift (`resolving-configuration`, `writing-module-tree`) | Sonnet (implicit), GPT-5.4, GPT-5.3-Codex | Major |
| Update-mode relationship mapping partial (source-only) | GPT-5.4, GPT-5.3-Codex, Opus (implicit) | Major |
| Metadata-write exception can escape structured result | GPT-5.4, GPT-5.3-Codex, Sonnet (implicit) | Major–Critical |

### Issues found by 2 reviewers
| Finding | Reviewers |
|---------|-----------|
| Empty-module (TC-1.4c) unreachable in real pipeline | GPT-5.4, GPT-5.3-Codex |
| Mermaid presence not enforced | GPT-5.4, GPT-5.3-Codex |
| `quality-review` progress emitted late | Sonnet, GPT-5.4 |
| Brittle `callOverrides` test patterns | Sonnet, GPT-5.4 |

### Unique findings (found by 1 reviewer only)
| Finding | Reviewer | Value |
|---------|----------|-------|
| `overview.md` reserved filename collision | GPT-5.3-Codex | **High** — real correctness bug |
| TC-1.8a test/AC misalignment | Sonnet | **High** — formal coverage gap |
| `costUsd` optional in failure but always populated | Sonnet | Medium — type precision |
| `computing-changes` event emitted after work, not before | Sonnet | Medium — consistency |
| Duplicate collision detection in two stages | Sonnet | Low — maintenance surface |
| `callOverrides` silently sets `hasMissingUsage` | Sonnet | Low — test authoring gotcha |
| `moduleNameToFileName` strips `/` without replacing | Sonnet | Low — design decision note |
| `PlannedModule` hand-declared vs inferred drift risk | GPT-5.3-Codex | Medium — future type safety |

---

## Synthesized Verdict

The implementation is **architecturally sound but not spec-complete**. The pipeline design, stage separation, defensive patterns, and test coverage demonstrate production-quality engineering. However, three blockers prevent sign-off:

1. **The Agent SDK adapter is a stub** (unanimous across all reviewers). Without a real adapter, Epic 2 cannot run outside tests. This must be either implemented or explicitly tracked as a deferred story.

2. **The `overview.md` reserved filename collision** (GPT-5.3-Codex only, but clearly valid). A module named "overview" would corrupt the output directory. This needs a guard in planning or filename derivation.

3. **Metadata-write can throw past the structured result boundary** (GPT-5.4, GPT-5.3-Codex). The "always return an `EngineResult`" contract is violated when `captureFileSnapshot` hits a non-ENOENT error.

Beyond those, the update-mode relationship mapping partiality, stage contract drift, and TC-1.8a misalignment should be resolved before the epic is considered fully verified.

---

## Reviewer Effectiveness Summary

| Rank | Reviewer | Criticals | Majors | Minors | Unique Findings | Strength | Weakness |
|------|----------|-----------|--------|--------|-----------------|----------|----------|
| 1 | Sonnet | 1 | 3 | 7 | 6 | Precision, TC granularity | Missed metadata exception escape |
| 2 | GPT-5.3-Codex | 2 | 4 | 3 | 2 | Unique `overview.md` find, ran tests | Less TC-level detail |
| 3 | GPT-5.4 | 2 | 5 | 4 | 0 | Metadata exception, update-mode depth | No unique findings, some vague claims |
| 4 | Opus | 0 | 3 | 6 | 0 | Writing quality, positive observations | Too lenient, missed real issues |
