# Epic 2 — Meta-Review: Comparison of Four AI Reviewer Reports

**Author:** Sonnet (meta-reviewer)
**Date:** 2026-03-16
**Reports reviewed:**
- `epic2/opus/epic-review.md` — Opus
- `epic2/sonnet/epic-review.md` — Sonnet (self)
- `epic2/gpt54/epic-review.md` — GPT-5.4
- `epic2/gpt53-codex/epic-review.md` — GPT-5.3-Codex

---

## 1. Rankings: Best to Worst

| Rank | Reviewer | Grade | Summary |
|------|----------|-------|---------|
| 1 | **Opus** | A | Accurate, calibrated, thorough, best architecture section |
| 2 | **GPT-5.3-Codex** | B+ | Found real unique issues; good tables; slightly overclaims |
| 3 | **Sonnet** | B | Accurate and fair; missed some production-path issues |
| 4 | **GPT-5.4** | C+ | Found real issues buried in noise; over-negative verdict; some questionable claims |

---

## 2. Finding Consensus Matrix

The table below maps every distinct finding across all four reports. ✓ = raised, — = not raised.

| Finding | Opus | Sonnet | GPT-5.4 | GPT-5.3-Codex | Verified? |
|---------|------|--------|---------|---------------|-----------|
| **Stub adapter (`createAgentSDKAdapter` throws)** | ✓ Major | ✓ Critical | ✓ Critical | ✓ Critical | ✓ Real |
| **`pure-functions.test.ts` absent** | ✓ Major | ✓ Major | ✓ Minor | ✓ (minor mention) | ✓ Real |
| **`LARGE_REPO_MODULE_THRESHOLD` dead constant** | ✓ Major | ✓ Major | ✓ Minor | — | ✓ Real |
| **TC-1.8a misalignment** | — | ✓ Major | — | — | ✓ Real |
| **`computing-changes` event emitted after prior-state read** | — | ✓ Minor | — | — | ✓ Real |
| **`quality-review` event emitted after completion** | — | ✓ Minor | ✓ (mentioned) | ✓ (mentioned) | ✓ Real |
| **SDK init failure → wrong `failedStage: "planning-modules"`** | ✓ Minor | ✓ Minor | ✓ Major | ✓ (mentioned) | ✓ Real |
| **Metadata snapshot can throw outside `EngineResult`** | — | — | ✓ Critical | ✓ Major | ✓ Real |
| **TC-1.4c (empty module) unreachable in production** | — | — | ✓ Major | ✓ Major | ✓ Real |
| **Reserved filename collision (`overview` → `overview.md`)** | — | — | — | ✓ Critical | ✓ Real |
| **Relationship impact mapping one-directional** | — | — | ✓ Major | ✓ Major | ✓ Real |
| **Stage enum drift from epic contract** | — | — | ✓ Major | ✓ Major | Uncertain |
| **Mermaid presence not enforced (empty `mermaidDiagram` allowed)** | — | — | ✓ Major | — | ✓ Real |
| **Missing update fixture dirs (replaced by `writePriorOutput`)** | ✓ Minor | — | — | — | Intentional alt |
| **Missing test helpers (`run-pipeline.ts`, `assert-output.ts`)** | ✓ Minor | — | — | — | Intentional alt |
| **Unused fixture files (`clustering-single-module.json`, `review-fix-mermaid.json`)** | ✓ Minor | — | — | — | ✓ Real |
| **Overview prompt receives stripped component lists** | ✓ Minor | — | — | — | ✓ Real |
| **`collectOutputFiles` semantic ambiguity in update mode** | ✓ Minor | — | — | — | ✓ Real |
| **`costUsd` optional in `DocumentationRunFailure` but always set** | — | ✓ Minor | — | — | ✓ Real |
| **Duplicate collision detection in generation + tree-write** | — | ✓ Minor | — | — | ✓ Real |
| **`callOverrides` without usage silently sets `hasMissingUsage`** | — | ✓ Minor | — | — | ✓ Real |
| **`PlannedModule` hand-declared instead of inferred from contract** | — | — | — | ✓ Minor | ✓ Real |
| **Brittle `callOverrides` (absolute SDK call indices)** | — | — | ✓ Minor | ✓ Minor | ✓ Real |
| **TC-4.5a doesn't verify second-model "different perspective"** | — | — | — | ✓ Minor | ✓ Real |

---

## 3. Verification of Contested Findings

### Metadata snapshot throw (GPT-5.4 Critical, GPT-5.3-Codex Major)

**Verdict: Real.** In `metadata-write.ts:108`, `captureFileSnapshot` re-throws non-ENOENT errors:
```typescript
if (error instanceof Error && "code" in error && error.code === "ENOENT") {
  return { exists: false };
}
throw error; // ← escapes EngineResult boundary
```
`writeRunMetadata` in `generate.ts:523` has no try-catch. A permission error reading an existing metadata file would cause an unhandled promise rejection, breaking the "always structured failure" contract. **Severity: Major** (not Critical — the scenario is unusual but possible).

### TC-1.4c empty-module unreachable in production (GPT-5.4 Major, GPT-5.3-Codex Major)

**Verdict: Real.** `validateModulePlan` rejects any plan where `module.components.length === 0` (returns `ORCHESTRATION_ERROR`). But `generateModuleDocs` has placeholder logic for empty modules. In a real (non-mocked) pipeline, no empty module ever reaches `generateModuleDocs` — the planner gates it out. TC-1.4c's test bypasses this by mocking `planModules` directly. The placeholder code is unreachable via the real production path. **This is a genuine design inconsistency** — either the planner should allow empty modules (with a warning) or the placeholder code should be removed. **Severity: Major.**

### Reserved filename collision (`overview` → `overview.md`) (GPT-5.3-Codex Critical)

**Verdict: Real, but severity overstated.** A module named `overview` produces `overview.md` via `moduleNameToFileName`, which collides with the generated overview file. The overview is written AFTER module pages, so `overview.md` would be overwritten. However, this requires the LLM to name a module "overview" — which the quality review prompt explicitly forbids restructuring. In practice this is improbable but the validation code has no guard. **Severity: Minor** (not Critical — the guard is missing but the scenario is highly unlikely and partially mitigated by the LLM instructions).

### Relationship impact mapping one-directional (GPT-5.4 Major, GPT-5.3-Codex Major)

**Verdict: Partially real.** `getRelationshipImpacts` only marks modules affected when the changed file is the relationship *source*. If file `utils/format.ts` changes and `core/index.ts` imports it, "core" is NOT flagged affected (only "utils"). TC-2.5c only tests the forward case (changed file is source). **However**, the epic's change detection goal ("detect structural changes that span module boundaries") is met for the primary scenario. The missing reverse-direction coverage is a gap in completeness but not a functional error for the tested cases. **Severity: Minor to Major** — meaningful gap but not a blocking defect.

### Stage enum drift from epic contract (GPT-5.4 Major, GPT-5.3-Codex Major)

**Verdict: Uncertain.** `DocumentationStage` includes `"resolving-configuration"` and `"writing-module-tree"` which may not be in the epic's formally documented stage union. Without the full epic text in scope, this cannot be fully verified. The stages are used consistently in `failedStage` results and the type is exported. If the epic documents the stage union as a closed contract, this is a real drift. **Flagging as Minor pending spec verification.**

### Mermaid presence not enforced (GPT-5.4 Major)

**Verdict: Real.** `normalizeOverviewContent` in `overview-generation.ts`:
```typescript
if (trimmedContent.includes("```mermaid") || result.mermaidDiagram.trim().length === 0) {
  return trimmedContent; // Returns content without Mermaid if diagram is empty
}
```
If the model returns `mermaidDiagram: ""`, the overview is written without any Mermaid block. The epic's AC-1.5 says the overview "includes at least one Mermaid diagram." Validation only warns about *malformed* Mermaid, not *absent* Mermaid. **Severity: Minor** (the validator should catch absence; the implementation allows it to slip through silently). Not Major because the LLM prompt explicitly asks for a Mermaid diagram and this would only fail if the model omits it.

---

## 4. Report-by-Report Assessment

---

### Rank 1: Opus

**Grade: A**

**What's good:**
- **Perfect severity calibration.** The stub adapter is correctly classified as Major (likely intentional scaffolding), not Critical. Opus is the only reviewer that resisted the temptation to inflate severity on a known-placeholder.
- **Complete architecture compliance table.** The AC-by-AC compliance matrix (30 ACs, all mapped) is the most useful artifact in any of the four reports. It's structured so a reader can immediately see coverage status without reading prose.
- **Unique findings of real value.** The overview prompt receiving stripped component lists (m5) is a real prompt-quality observation missed by all others. `collectOutputFiles` semantic ambiguity (m6) is a legitimate note about misleading metadata. Unused fixture files (m3) and missing helper files (m2) are spec-vs-implementation divergences worth documenting.
- **Balanced positives section.** Explicitly calls out the defensive metadata write, path traversal prevention, bounded quality review, and deterministic sorting — important for the next reviewer to understand what's *working*.
- **Accurate verdict.** "Ready for production modulo stub" is precisely right.

**What's not good:**
- Missed several real findings that others caught: metadata snapshot throw escape, TC-1.4c production unreachability, reserved filename collision (`overview.md`), relationship mapping directionality gap.
- Minor inconsistency: classifies stub adapter as Major but says "No critical issues found" while also noting the engine "cannot be used outside of tests" — these statements are in tension.

**What I'd take from Opus:** The AC compliance matrix, the severity calibration standard, the unique minor findings (overview prompt, collectOutputFiles, unused fixtures), and the balanced verdict.

---

### Rank 2: GPT-5.3-Codex

**Grade: B+**

**What's good:**
- **Best unique findings.** The reserved filename collision (`overview.md`) is a genuine gap missed by all other reviewers. The metadata snapshot throw escape is correctly identified and well-explained. Relationship mapping directionality is correctly identified as a gap.
- **Comprehensive TC coverage matrix.** The 82-TC table is extremely thorough, with per-TC status notes for the partial/covered distinction. Useful for auditors.
- **Good recommendations section.** Six prioritized recommendations are concrete and actionable.
- **Type drift observation.** The `PlannedModule` hand-declaration vs. Zod-inferred type drift is a subtle but real future maintenance risk.
- **Honest about TC-1.4c being partial** — calling it out correctly.

**What's not good:**
- **Severity inflation on `overview.md` collision.** Classifying it as Critical requires a module named exactly "overview" — a scenario the LLM prompt guards against. Should be Minor.
- **Some findings are speculative or design-level objections.** "Import chain" vs. directory-heuristic mapping is a design choice the tech design documented; calling it a "partial implementation" somewhat misrepresents intent.
- The executive summary is slightly sparse — one paragraph without a clear bottom line.
- `PlannedModule` type drift is real but very low-impact since TypeScript structural typing means they'll stay compatible unless the Zod schema diverges significantly.

**What I'd take from GPT-5.3-Codex:** The reserved filename finding, metadata snapshot throw, relationship directionality gap, TC coverage matrix, and the `PlannedModule` type note.

---

### Rank 3: Sonnet (self-assessment)

**Grade: B**

**What's good:**
- **TC-1.8a misalignment** — the only reviewer to catch that the test is labelled with the wrong TC and tests a failure path rather than the success AC. Real and actionable.
- **Event ordering semantics.** The `computing-changes` event emitted after prior-state read (causing `failedStage` to be reported without the stage being announced) is a genuine inconsistency not caught by others. The `quality-review` event emitted after completion is also valid.
- **`costUsd` typing** — correctly observed that it's optional in `DocumentationRunFailure` but always populated.
- **TC coverage matrix** with explicit pass/misalign status.
- Accurate findings with no false positives.

**What's not good:**
- **Missed the most impactful production-path issues**: TC-1.4c empty-module unreachability, metadata snapshot throw escape, reserved filename collision, and relationship mapping directionality. These are significant gaps in the review.
- The stub adapter was classified as Critical when Major is more appropriate given the deliberate test-mock architecture.
- Some minor findings are too granular (duplicate collision detection logic is more of a style note than a real issue).
- The `moduleNameToFileName` strip-vs-replace observation is noted as "worth noting" but doesn't explain impact.

**What I'd take from Sonnet:** TC-1.8a misalignment, `computing-changes` event ordering issue, `quality-review` event timing, `costUsd` type inconsistency, and the TC matrix structure.

---

### Rank 4: GPT-5.4

**Grade: C+**

**What's good:**
- **Did identify real issues**: metadata snapshot throw, TC-1.4c empty-module path, relationship mapping directionality, stage enum drift.
- **Line-number precision** — every claim is anchored to a specific file:line, which is technically useful even if it makes the report dense.
- **Correctly notes brittle `callOverrides`** — the absolute SDK call index approach is a maintenance risk.
- The summary table (AC ID, Implemented, Tested, Notes) is functional.

**What's not good:**
- **Over-negative executive summary.** "I would not sign off on it as spec-complete" is too strong. The implementation is well-tested, architecturally sound, and most gaps are minor. The stub adapter and a few test gaps don't warrant that blanket verdict.
- **Severity inflation across the board.** Two Criticals, five Majors — compared to Opus's zero Criticals and three Majors. Several of GPT-5.4's Majors are really Minors (e.g., batching strategy not implemented — the test plan didn't require batching; "import chain" mapping is a design choice).
- **"Import chain" claim is a design objection, not a bug.** The tech design explicitly chose directory-prefix heuristics for new-file mapping. Claiming this is "partial" misrepresents intent.
- **Mermaid claim is stretched as Major.** The LLM prompt explicitly asks for a Mermaid diagram; calling the absence of a hard enforcement guard a Major issue overstates the risk.
- **Dense line-number citations make it hard to read** without jumping to the codebase. The report reads more like a linter output than a review.
- **Unique findings overlap significantly** with GPT-5.3-Codex, reducing incremental value.
- **No positive observations section.** The review reads purely as a defect list, which gives a distorted picture of implementation quality.

**What I'd take from GPT-5.4:** The metadata snapshot throw finding, the `callOverrides` brittleness note, and confirmation of the relationship directionality and TC-1.4c issues. Not the verdict or severity ratings.

---

## 5. Findings Unique to Each Reviewer

| Reviewer | Unique Findings of Real Value |
|----------|------------------------------|
| **Opus** | Overview prompt receives stripped component lists; `collectOutputFiles` semantic ambiguity; unused fixture files; missing planned helper files |
| **GPT-5.3-Codex** | Reserved `overview.md` filename collision; `PlannedModule` type drift risk; TC-4.5a second-model perspective not asserted |
| **Sonnet** | TC-1.8a test misalignment (wrong AC); `computing-changes` event emitted before stage announced; `costUsd` optional vs always-set |
| **GPT-5.4** | Mermaid presence not enforced (empty `mermaidDiagram`); brittle `callOverrides` absolute index |
| **All four found** | Stub adapter |
| **Three of four found** | `pure-functions.test.ts` absent; metadata snapshot throw (GPT-5.4 + GPT-5.3-Codex); relationship directionality (GPT-5.4 + GPT-5.3-Codex); TC-1.4c production unreachability (GPT-5.4 + GPT-5.3-Codex) |

---

## 6. Synthesized Finding Priority List

If writing a single best review from all four inputs, the finding list would be:

### Critical
*(None — the stub adapter is Major given the deliberate test architecture)*

### Major
1. **Stub adapter** — production non-functional (all four)
2. **`pure-functions.test.ts` absent** — specified in test plan, missing (3 of 4)
3. **TC-1.4c empty-module unreachable in production** — planner rejects what generator handles (GPT-5.4, GPT-5.3-Codex, confirmed)
4. **Metadata snapshot can throw outside `EngineResult`** — breaks structured-failure contract (GPT-5.4, GPT-5.3-Codex, confirmed)
5. **Relationship impact mapping is source-only** — changed target files don't propagate to importing modules (GPT-5.4, GPT-5.3-Codex, confirmed)
6. **TC-1.8a misalignment** — test named after success AC, tests failure path (Sonnet only)

### Minor
7. `LARGE_REPO_MODULE_THRESHOLD` dead constant (Opus, Sonnet)
8. SDK init failure → misleading `failedStage: "planning-modules"` (Opus, Sonnet, GPT-5.4)
9. Reserved filename collision (`module named "overview"` → `overview.md`) (GPT-5.3-Codex, severity downgraded from Critical)
10. `computing-changes` event emitted after prior-state read (Sonnet)
11. `quality-review` event emitted after completion (Sonnet, GPT-5.4, GPT-5.3-Codex)
12. Stage enum includes `"resolving-configuration"` and `"writing-module-tree"` — needs spec verification (GPT-5.4, GPT-5.3-Codex)
13. Mermaid presence not enforced when `mermaidDiagram: ""` (GPT-5.4)
14. `costUsd` optional in `DocumentationRunFailure` but always set (Sonnet)
15. Overview prompt receives stripped component lists (Opus)
16. `collectOutputFiles` includes all files regardless of what was regenerated in update mode (Opus)
17. Unused fixture files (Opus)
18. Missing planned helper files replaced by per-file duplication (Opus)
19. `PlannedModule` type hand-declared instead of inferred from Zod contract (GPT-5.3-Codex)
20. Brittle `callOverrides` with absolute SDK call indices (GPT-5.4, GPT-5.3-Codex)
21. `costUsd`/`callOverrides` mock behavior: missing usage sets `hasMissingUsage = true` (Sonnet)

---

## 7. Meta-Observations on AI Reviewer Behavior

**Severity inflation is the most common failure mode.** Three of four reviewers classified the stub adapter as Critical. Opus correctly read the test architecture (spy injection everywhere, deliberate mock boundary) and classified it as Major. The others didn't sufficiently account for intentional design context.

**Unique finds require code path imagination.** The highest-value unique findings required the reviewer to mentally trace non-obvious execution paths: GPT-5.3-Codex's `overview.md` collision requires tracing `moduleNameToFileName("overview")`; Sonnet's event ordering issue requires tracing the failure path through `computing-changes`; GPT-5.4's Mermaid gap requires reading `normalizeOverviewContent` carefully against the AC. Reviews that found these went beyond pattern-matching to actual reasoning.

**Positive observations matter for calibration.** Opus's "Positive Observations" section is the most useful single section in any report for a reader trying to understand overall quality. GPT-5.4's total absence of positive observations makes its overall verdict unreliable.

**Dense citation style vs. prose style is a tradeoff.** GPT-5.4's per-line-number citation style is precise but hard to read. Opus's prose style is more readable but loses specificity. The best format combines prose explanation with targeted file:line anchors only for the most important findings.

**Consensus ≠ correct.** The TC-1.4c production unreachability finding was raised by GPT-5.4 and GPT-5.3-Codex but missed by Opus and Sonnet. The metadata snapshot throw was also missed by Opus and Sonnet. Two reviewers can independently miss the same real issue, while two different reviewers independently find it. Cross-reviewer synthesis adds genuine value.
