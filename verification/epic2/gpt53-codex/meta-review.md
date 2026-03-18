# Epic 2 — Cross-Model Meta-Review

**Author:** GPT-5.3-Codex (meta-reviewer)
**Date:** 2026-03-16
**Input:** Four independent reviews by Opus, Sonnet, GPT-5.4, and GPT-5.3-Codex

---

## Rankings (Best → Worst)

### 1st: GPT-5.4

**What's good:**
- Deepest semantic analysis of all four reviews. Most willing to say "I would not sign off" — appropriate given the real gaps.
- Found two issues no other reviewer caught: (1) unstructured exceptions escaping `generateDocumentation` via metadata snapshot throws (Critical), and (2) Mermaid presence not enforced by the overview contract or validator (Major).
- Best at distinguishing "test passes because of mocking" vs "production behavior actually works." Every AC assessment includes a specific gap annotation with line references.
- Correctly identified that import-chain mapping is missing from the update-mode spec implementation, and that relationship-impact detection only sees current outgoing edges.
- Per-AC inline annotations are more useful than a matrix for understanding *how* each criterion is met (or not).

**What's not good:**
- Format is dense prose, harder to scan than matrix-based reviews. No AC/TC matrix tables — a reader must parse paragraphs to build coverage picture.
- Missed the reserved filename collision (`overview.md` overwrite risk) that GPT-5.3-Codex caught.
- Architecture section is thin relative to findings depth. No "positive observations" — comes across as purely fault-finding.
- Executive summary could be more actionable; it lists blockers but doesn't prioritize a fix order.

**What I'd take for synthesis:**
- The metadata exception escape finding (Critical) — this is the most dangerous bug identified across all four reviews.
- The Mermaid enforcement gap — a real contract weakness nobody else flagged.
- The "tests succeed only because of mocking" framing for TC-1.4c and the SDK adapter — this is the right way to communicate risk.
- The import-chain mapping observation for update mode.
- The per-AC gap annotations with specific line refs.

---

### 2nd: Sonnet

**What's good:**
- Best formatted and most actionable review. Clean severity tables, well-structured recommended actions (prioritized as "before merge" / "nice to have" / "track for later").
- Found the TC-1.8a test misalignment — a genuinely impressive and unique catch. The test claims to verify "validation runs post-generation" but actually tests the failure path. No other reviewer noticed this.
- Progress event timing analysis (m-2, m-3) is unique and insightful: `computing-changes` announced after prior-state read, `quality-review` announced after work completes. These are real consistency bugs in the progress contract.
- `costUsd` optional-but-always-populated type inconsistency (m-4) — a legitimate type system issue nobody else caught.
- Duplicate collision detection across two stages (m-5) — valid maintenance concern.
- "Missing Items vs Spec" table is a clean way to summarize spec-vs-implementation divergence.
- Most minor findings of any review (7), and each is genuinely useful, not padding.

**What's not good:**
- Missed the reserved filename collision, relationship mapping directionality, metadata snapshot exception escape, and empty-module policy inconsistency. These are arguably more impactful than some of the minors found.
- The `moduleNameToFileName` slash-stripping observation (m-7) is a documented design decision per the test plan — flagging it as a finding feels like a stretch.
- `callOverrides` mock behavior (m-6) is a test infrastructure concern that won't impact production.

**What I'd take for synthesis:**
- TC-1.8a misalignment — unique and valid, should be in any final report.
- Progress event timing inconsistencies (m-2, m-3) — unique operational correctness findings.
- The prioritized recommended actions format — best presentation of any review.
- `costUsd` type inconsistency — clean, actionable, easy fix.
- The "Missing Items vs Spec" summary table.

---

### 3rd: GPT-5.3-Codex (self)

**What's good:**
- Only review to identify the reserved filename collision (`overview.md` overwrite) — a genuine Critical that could corrupt output in production.
- Complete AC and TC matrices with per-row status and notes. Full contract/type alignment section.
- Ran the test suite (117 tests, all passing) — only one of two reviews to confirm execution.
- Clean structure with separate sections for findings, matrices, architecture, and recommendations.
- Good synthesis of relationship mapping directionality and empty-module policy issues.

**What's not good:**
- Missed `pure-functions.test.ts` gap (Opus and Sonnet both caught this).
- Missed TC-1.8a test misalignment (Sonnet's unique find).
- Missed progress event timing inconsistencies (Sonnet's unique find).
- Missed metadata exception escape (GPT-5.4's unique find).
- Missed Mermaid enforcement gap (GPT-5.4's unique find).
- Several findings overlap heavily with GPT-5.4 without adding new analysis depth.
- Fewer unique minor findings than Sonnet — minor tier feels thin.

**What I'd take for synthesis:**
- The reserved filename collision finding — must be in any final report.
- The AC and TC matrices — cleanest tabular coverage representation.
- The contract/type alignment section format.

---

### 4th: Opus

**What's good:**
- Most polished and professional writing. Clear, confident prose with well-calibrated hedging ("likely intentional," "valid design choice").
- "Positive Observations" section is unique and valuable — it highlights defensive design patterns (snapshot metadata writes, path traversal prevention, bounded quality review, deterministic sorting) that demonstrate production-quality engineering. No other review does this.
- Architecture alignment table mapping tech design elements to compliance status is the cleanest of any review.
- Test quality assessment is balanced — acknowledges both strengths and weaknesses with specific examples.
- Correctly identified the `LARGE_REPO_MODULE_THRESHOLD` dead export, the missing `pure-functions.test.ts`, and the SDK init stage misattribution.
- Best at explaining *why* the test plan divergences (fixture dirs, helper files) are acceptable design choices rather than bugs.

**What's not good:**
- Missed the most impactful findings: reserved filename collision, relationship mapping directionality, metadata snapshot exception escape, empty-module policy inconsistency, Mermaid enforcement gap, TC-1.8a misalignment, and progress event timing issues.
- Severity calibration is too lenient. Classifying the SDK adapter stub as Major (not Critical) with "likely intentional" framing underestimates the risk. An adapter that always throws is a Critical regardless of intent — it means the system cannot run.
- Zero Critical findings is a red flag for a review of this scope. It suggests the review prioritized being reassuring over being thorough.
- Over-indexed on test plan compliance (missing test files, missing fixture directories, unused fixtures) rather than runtime behavior gaps. Three of six Minors are about test infrastructure divergence from the plan, which is the least impactful finding category.
- "The implementation is ready for production use" verdict is premature given the gaps other reviews found.

**What I'd take for synthesis:**
- The "Positive Observations" section — every review should include what's working well, not just what's broken.
- The architecture alignment table format (tech design element → compliance status).
- The test plan divergence analysis — understanding *why* the implementation chose different infrastructure than the plan specified.
- The `collectOutputFiles` semantic ambiguity observation (m6) — a valid metadata clarity concern nobody else raised.

---

## Cross-Review Finding Concordance

### Universally Identified (4/4 reviews)
| Finding | Opus | Sonnet | GPT-5.4 | GPT-5.3-Codex |
|---------|------|--------|---------|---------------|
| Agent SDK adapter is unimplemented stub | Major (M3) | Critical (C-1) | Critical (#1) | Critical (#1) |
| `LARGE_REPO_MODULE_THRESHOLD` dead constant | Major (M2) | Major (M-3) | Minor (#2) | — (missed) |

### Identified by 3/4
| Finding | Who Found | Who Missed |
|---------|-----------|------------|
| Missing `pure-functions.test.ts` | Opus (M1), Sonnet (M-1), GPT-5.4 (Minor #3) | GPT-5.3-Codex |
| SDK init maps to wrong `failedStage` | Opus (m4), Sonnet (m-1), GPT-5.4 (Major #4) | GPT-5.3-Codex |
| Stage contract drift (`DocumentationStage`) | Sonnet (implicit), GPT-5.4 (Major #5), GPT-5.3-Codex (Major #3) | Opus |

### Identified by 2/4
| Finding | Who Found | Who Missed |
|---------|-----------|------------|
| Empty-module policy inconsistency (TC-1.4c) | GPT-5.4 (Major #1), GPT-5.3-Codex (Major #2) | Opus, Sonnet |
| Relationship mapping one-directional | GPT-5.4 (Major #3), GPT-5.3-Codex (Major #1) | Opus, Sonnet |
| Metadata snapshot can throw past EngineResult | GPT-5.4 (Critical #2), GPT-5.3-Codex (Major #4) | Opus, Sonnet |

### Unique Findings (1/4 only)
| Finding | Reviewer | Severity |
|---------|----------|----------|
| Reserved filename collision (`overview.md`) | GPT-5.3-Codex | Critical |
| TC-1.8a test misalignment | Sonnet | Major |
| Mermaid presence not enforced | GPT-5.4 | Major |
| Progress event: `computing-changes` emitted late | Sonnet | Minor |
| Progress event: `quality-review` emitted after work | Sonnet | Minor |
| `costUsd` optional but always populated | Sonnet | Minor |
| Duplicate collision detection across stages | Sonnet | Minor |
| `callOverrides` silently sets hasMissingUsage | Sonnet | Minor |
| Overview prompt receives empty component lists | Opus | Minor |
| `collectOutputFiles` includes all files in update mode | Opus | Minor |
| Prior module plan only shape-validated | GPT-5.4 | Minor |
| Brittle test call-index dependencies | GPT-5.4 | Minor |
| Import-chain mapping not implemented | GPT-5.4 | Observation |

---

## If Synthesizing a Best Review

The ideal review would combine:

1. **GPT-5.4's findings depth** — its Critical/Major findings are the most important for production safety
2. **Sonnet's format and unique catches** — TC-1.8a, progress timing, prioritized actions
3. **GPT-5.3-Codex's filename collision finding and matrices** — the only Critical nobody else found, plus the cleanest tabular coverage
4. **Opus's positive observations and architecture table** — a review should acknowledge what's working

The synthesized finding list would have **4 Critical, 6 Major, ~10 Minor** — significantly more aggressive than any individual review, but accurately reflecting the combined signal.

### Severity Calibration Notes

The biggest calibration disagreement is the SDK adapter stub:
- Opus: Major ("likely intentional")
- Sonnet, GPT-5.4, GPT-5.3-Codex: Critical

The Critical classification is correct. Regardless of intent, the production path throws unconditionally. "Intentional scaffolding" is a planning decision, not a severity reduction — the system cannot function.

Opus's zero-Critical assessment is the most significant calibration miss across all four reviews.

---

## Model Capability Observations

| Dimension | Best | Notes |
|-----------|------|-------|
| Semantic depth | GPT-5.4 | Found issues requiring multi-file reasoning (exception propagation, contract enforcement gaps) |
| Precision / unique catches | Sonnet | TC-1.8a misalignment, progress timing — subtle issues requiring close reading |
| Breadth of minor findings | Sonnet | 7 minors, each genuinely useful |
| Format / readability | Sonnet | Best structure, best recommended actions |
| Positive framing | Opus | Only review with "what's good" section |
| Risk calibration | GPT-5.4 | Most accurate severity ratings, most willing to block |
| Coverage matrices | GPT-5.3-Codex | Cleanest AC/TC tables |
| Test execution | Opus, GPT-5.3-Codex | Both confirmed 117 tests passing |
| Unique Critical finding | GPT-5.3-Codex | Reserved filename collision |
