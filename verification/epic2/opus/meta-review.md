# Epic 2 Review Meta-Report

**Author:** Opus (meta-reviewer)
**Date:** 2026-03-16
**Scope:** Comparative analysis of four independent Epic 2 verification reviews

---

## Ranking: Best to Worst

### 1. Sonnet (Best)

**Score: 9/10**

**What's good:**
- The most findings with the highest correctness rate. Nearly every finding is
  a genuine issue.
- Caught TC-1.8a test misalignment — the subtlest and most nuanced finding
  across all four reviews. The test is named for TC-1.8a (validation runs
  post-generation) but actually tests the failure path (validation errors block
  the run). The success-path assertion is covered implicitly in TC-1.1a/TC-3.4a,
  but the formal mapping is broken. Nobody else caught this.
- Caught two progress-event timing inconsistencies nobody else noticed:
  `computing-changes` progress emitted AFTER prior-state read (so failures
  happen in an unannounced stage), and `quality-review` progress emitted AFTER
  the review completes (opposite of every other stage). Both are real bugs.
- Caught `costUsd` being optional in `DocumentationRunFailure` but always
  populated at runtime — a clean type-level observation.
- Caught duplicate filename collision detection in both `module-generation.ts`
  and `module-tree-write.ts` — two maintenance surfaces for the same invariant.
- Excellent three-tier prioritized recommendations (address before merge,
  nice-to-have, track for later).
- Good calibration — explaining WHY the stub adapter is Critical rather than
  just stating it, acknowledging it may be intentional scaffolding.

**What's not good:**
- Did NOT catch the reserved filename collision (module named "overview" →
  `overview.md` overwrites the overview artifact). GPT-5.3-Codex caught this.
- Did NOT catch the metadata snapshot path that can throw outside `EngineResult`
  handling. Both GPT models caught this.
- The C-1 (stub adapter as Critical) classification is debatable. The test plan
  explicitly says mocking the adapter IS the testing strategy, and the adapter
  interface is designed for future replacement. Calling it Critical implies Epic
  2 is unshippable, which isn't necessarily true if the stub is tracked.

**What I'd take for a synthesis:**
The TC-1.8a finding, both progress-event timing issues, the `costUsd` type
inconsistency, and the three-tier recommendation format.

---

### 2. Opus

**Score: 8/10**

**What's good:**
- The only review that actually ran tests (203 passing) and type-checked the
  codebase. Every other review did static analysis only.
- The only review that counted Epic 2 tests against the test plan target (117
  actual vs 112 planned) and verified the per-chunk breakdown.
- Complete AC-by-AC compliance table (all 30 ACs) AND architecture compliance
  table (11 design elements) — the most structured verification.
- Identified test infrastructure gaps that others missed: unused fixture files
  (`clustering-single-module.json`, `review-fix-mermaid.json`), missing test
  helpers (`run-pipeline.ts`, `assert-output.ts`), and quantified the test
  helper duplication (~200 lines of duplicate setup across 5 files).
- Best positive observations section — called out specific defensive patterns
  (snapshot-based metadata writes, path traversal prevention, plan validation
  reuse, deterministic sorting) that demonstrate engineering quality.
- Most conservative and accurate severity calibration. Classified the stub
  adapter as Major (not Critical) with clear reasoning about Epic 2 boundaries.

**What's not good:**
- Missed the TC-1.8a test misalignment that Sonnet caught.
- Missed the reserved filename collision that GPT-5.3-Codex caught.
- Missed the metadata snapshot throw escape that both GPT models caught.
- Missed the progress-event timing inconsistencies that Sonnet caught.
- Fewer novel findings overall — the review is thorough but less sharp at
  finding subtle bugs vs. documenting known gaps.

**What I'd take for a synthesis:**
Test execution verification, test count breakdown, architecture compliance
table, positive observations, unused fixture tracking, and the test helper
duplication analysis.

---

### 3. GPT-5.3-Codex

**Score: 7/10**

**What's good:**
- Found the **reserved filename collision** — the single most impactful novel
  finding across all four reviews. A module named `"overview"` produces
  `overview.md`, which silently overwrites the overview artifact. This breaks
  the deterministic output convention (AC-1.7). The collision detection checks
  module-to-module names but not module-to-reserved-artifact names. This is a
  real bug that should be fixed.
- Found the metadata snapshot throw escape (shared with GPT-5.4).
- Found the relationship impact mapping directionality limitation.
- Found the type drift risk between `z.infer<typeof modulePlanSchema>` and the
  hand-declared `PlannedModule` — a genuine maintenance risk.
- Clean, complete AC and TC coverage matrices with "Partial" annotations that
  correctly flag where tests use mocking to bypass production paths.
- Good recommendations section with actionable items.

**What's not good:**
- **Completely missed `pure-functions.test.ts`** — the test plan's most
  explicitly specified missing artifact. Every other review caught this. A
  significant oversight for a spec-compliance review.
- Did not catch TC-1.8a misalignment.
- Did not catch progress-event timing inconsistencies.
- Did not catch test helper duplication or unused fixture files.
- Reserved filename collision as Critical is over-calibrated — it requires a
  module named exactly "overview", "module-tree", ".doc-meta", or
  ".module-plan" which is unlikely in practice (though possible).
- The AC matrix marks AC-1.1 as "Partial" due to the stub adapter, which is
  misleading — the AC's test conditions are fully satisfied by the test suite.
- Less generous with positive observations compared to Opus and Sonnet.

**What I'd take for a synthesis:**
The reserved filename collision finding (the review's crown jewel), the type
drift risk observation, and the "Partial" annotations on the TC matrix that
flag mock-dependent coverage.

---

### 4. GPT-5.4 (Worst)

**Score: 5/10**

**What's good:**
- Found the metadata snapshot throw escape (the `captureFileSnapshot` rethrow
  in `metadata-write.ts:101` that can bypass the `EngineResult` boundary).
- Found the Mermaid-presence enforcement gap — the contract allows empty
  `mermaidDiagram` and the validator only catches malformed blocks, not missing
  ones. This is a valid observation even if the normalizer compensates in most
  cases.
- Found the stage contract drift (runtime `DocumentationStage` includes values
  not in the epic's documented union).
- Per-AC coverage is thorough with specific file references for both
  implementation and test locations.
- Found the prior module plan shape-only validation (semantic corruption can
  slip into update mode).

**What's not good:**
- **Worst severity calibration.** The review leads with "I would not sign off
  on it as spec-complete" which is excessively negative for an implementation
  where all 203 tests pass, all 82 TCs are covered, and the architecture is
  fully compliant. This framing undermines reviewer credibility.
- **Two Critical findings, one questionable.** The metadata snapshot throw is
  listed as Critical, but it requires a non-ENOENT filesystem error during
  pre-write snapshot capture — an extremely unlikely scenario that would only
  occur with disk corruption or permission issues.
- **Several findings are incorrect or overstated:**
  - "import-chain mapping is not implemented" — the spec says "directory OR
    import chain" and the directory heuristic is a valid implementation choice.
    The test for TC-2.3c passes with directory-based mapping.
  - "relationship-change detection only sees current outgoing edges from
    changed files" — this is by design since the mapper works with fresh
    analysis relationships. The epic's TC-2.5c only specifies the "adds import"
    scenario, which IS covered.
  - "batching strategy not implemented" is listed as a finding but it was never
    specified as an AC or TC — it's a future optimization, not a gap.
  - "tests succeed only because they mock around production-critical gaps" is
    an unfair characterization of adapter-pattern testing. That's how the test
    plan SPECIFIES testing should work.
- **Missed pure-functions.test.ts** — only mentioned as Minor item 3, not
  elevated to Major despite the test plan explicitly specifying this file.
- Did not catch TC-1.8a misalignment.
- Did not catch progress-event timing inconsistencies.
- Did not catch unused fixtures or test helper duplication.
- Did not catch the reserved filename collision.
- Format is less polished (§-prefixed sections, no TC-by-TC matrix table,
  prose-heavy coverage descriptions).

**What I'd take for a synthesis:**
The metadata snapshot throw finding, the Mermaid enforcement observation (as a
Minor, not Major), and the stage contract drift finding.

---

## Cross-Review Finding Concordance

### Consensus findings (3+ reviewers agree)

| Finding | Opus | Sonnet | GPT-5.4 | GPT-5.3 | Severity |
|---------|------|--------|---------|---------|----------|
| Stub adapter blocks production | M3 | C-1 | C-1 | C-1 | Major-Critical |
| Missing `pure-functions.test.ts` | M1 | M-1 | m-3 | — | Major |
| `LARGE_REPO_MODULE_THRESHOLD` dead | M2 | M-3 | m-2 | — | Minor-Major |
| SDK init → wrong `failedStage` | m4 | m-1 | Maj-4 | — | Minor |
| Stage contract drift | — | — | Maj-5 | Maj-3 | Minor |

### Unique findings (only one reviewer caught)

| Finding | Reviewer | Validity | Severity |
|---------|----------|----------|----------|
| Reserved filename collision (`overview.md`) | GPT-5.3-Codex | **Valid — real bug** | Major |
| TC-1.8a test misalignment | Sonnet | **Valid** | Major |
| `computing-changes` progress emitted after prior-state read | Sonnet | **Valid** | Minor |
| `quality-review` progress emitted after work completes | Sonnet | **Valid** | Minor |
| `costUsd` optional but always populated in failure type | Sonnet | **Valid** | Minor |
| Duplicate collision detection (generation + tree write) | Sonnet | **Valid** | Minor |
| `callOverrides` silently sets `hasMissingUsage` | Sonnet | **Valid** | Minor |
| Metadata snapshot can throw outside EngineResult | GPT-5.4/5.3 | **Valid** | Minor |
| Type drift risk (inferred vs hand-written `PlannedModule`) | GPT-5.3-Codex | **Valid** | Minor |
| Mermaid presence not enforced (empty diagram accepted) | GPT-5.4 | Partially valid | Minor |
| Relationship mapping is source-only | GPT-5.4/5.3 | Partially valid | Minor |

### False or overstated findings

| Finding | Reviewer | Issue |
|---------|----------|-------|
| "Import-chain mapping not implemented" | GPT-5.4 | Spec says "directory OR import chain" — directory is valid |
| "Batching strategy not implemented" | GPT-5.4 | Not an AC/TC requirement |
| "Tests succeed only because they mock" | GPT-5.4 | That's the test plan's design |
| AC-1.1 marked "Partial" | GPT-5.3-Codex | All test conditions pass; adapter stub is by design |

---

## Synthesized "Best Review" — What It Would Include

If I were combining the best elements of all four reviews into one:

1. **From Sonnet:** TC-1.8a misalignment, both progress-event timing issues,
   `costUsd` type analysis, three-tier prioritized recommendations
2. **From Opus:** Test execution (203 passing), test count verification (117 vs
   112), architecture compliance matrix, positive observations, unused fixtures
3. **From GPT-5.3-Codex:** Reserved filename collision (the single best finding),
   type drift risk, TC "Partial" annotations
4. **From GPT-5.4:** Metadata snapshot throw escape, Mermaid enforcement
   observation (as Minor)

The synthesized review would have **0 Critical** (stub adapter is tracked
scaffolding), **5 Major** (missing pure-functions.test.ts, reserved filename
collision, TC-1.8a misalignment, dead threshold constant, metadata snapshot
escape), and **~10 Minor** findings.

---

## Reviewer Methodology Assessment

| Aspect | Opus | Sonnet | GPT-5.4 | GPT-5.3-Codex |
|--------|------|--------|---------|---------------|
| Ran tests | Yes | No | No | Claimed (7 files, 117 tests) |
| Verified type check | Yes | No | No | No |
| Test count vs plan | Exact | Approximate | No | Approximate |
| AC/TC matrix | Full table | Full table | Prose | Full table |
| Architecture table | Yes | Yes (inline) | Yes (inline) | No |
| Severity calibration | Conservative | Good | Over-inflated | Slightly over-inflated |
| False positive rate | 0% | ~0% | ~20% | ~10% |
| Unique novel findings | 0 | 5 | 1 (best single find) | 1 |
| Positive observations | Extensive | Extensive | Limited | Limited |
