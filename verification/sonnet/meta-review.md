# Epic 1 — Reviewer Meta-Report

**Author:** Sonnet Reviewer
**Date:** 2026-03-15
**Reviews assessed:**
1. `verification/opus/epic-review.md` — Opus
2. `verification/sonnet/epic-review.md` — Sonnet (this reviewer)
3. `verification/gpt54/epic-review.md` — GPT-5.4
4. `verification/gpt53-codex/epic-review.md` — GPT-5.3/Codex

---

## Rankings (Best to Worst)

| Rank | Reviewer | Verdict |
|------|----------|---------|
| 1 | GPT-5.4 | Most comprehensive, most accurate, full coverage matrices, identifies findings others missed |
| 2 | Sonnet | Strong error model and test analysis, no false statements, misses a few real findings |
| 3 | Opus | Clean writing, good structure, but contains one material factual error and misses significant findings |
| 4 | GPT-5.3/Codex | Shortest review, lowest finding count, but has one unique critical finding the others missed |

---

## Review-by-Review Analysis

---

### #1: GPT-5.4

**What's good:**

- **The most complete AC coverage matrix of any review.** Every AC is listed with status, evidence (file:line reference), and notes. This is the format most useful to a team lead or implementer.
- **Full TC coverage table** — every TC from both the epic and the test plan is in the matrix, including the dropped TC-4.2d explicitly marked as "Missing." No other review produces this artifact.
- **Finds the cross-link boundary escape issue** — that `checkCrossLinks` does not enforce that resolved target paths stay within `outputPath`. A `../outside.md` link passes validation if the file exists on disk. This is a real finding, verified against the code. No other reviewer caught it.
- **Identifies the "exports only" enforcement gap** — `RawNode` has no `isExported` field, so the normalizer blindly maps every raw node to `exportedSymbols`. If the Python adapter emits internal symbols, they surface as exports with no way to filter them. Valid observation.
- **Flags three genuinely weak tests** (TC-1.1b, TC-3.4b, TC-4.4a) with specific line references and explains *why* each is weaker than its name implies. This is precise and actionable.
- **Flags the dual filtering path** — include/exclude patterns are passed to Python via CLI args AND re-applied by the normalizer via `path.matchesGlob()`. Two filtering engines with potentially different glob semantics.
- **Correctly identifies the PATH_ERROR / DEPENDENCY_MISSING issue** in `status.ts` with a manual spot-check result included ("spawn git ENOENT" returned PATH_ERROR).
- **Recommends that bundled analysis scripts should emit `category: "missing-dependency"` instead of `category: "environment"`** per AC-1.2 — a valid finding that Sonnet also identified but others missed.
- All findings are anchored to file:line references. No vague claims.

**What's not good:**

- **Some findings are inflated in severity.** The "repo subdirectory" issue (Major #1) — that `getGitRepositoryStatus` returns `invalid-repo` for a valid subdirectory — is presented as a clear defect, but the epic's assumption A4 says "target directory is a valid git repository," strongly implying the repo root is expected. This is more of a design decision than a defect. Calling it Major overstates it.
- **The "exports only" finding (Major #3) is real but speculative.** The report doesn't read the Python script to verify whether it actually emits internal symbols. Without that verification, it's a potential gap, not a confirmed one.
- **The dual-filtering finding (Major #6) is more design observation than defect.** Passing patterns to Python improves efficiency; the normalizer re-applies for determinism on the normalized output. This may be intentional.
- **Overall verdict "should not be treated as a clean Epic 1 sign-off" is overstated** given that several of the Majors are debatable.

**What to take from it:**
- The full AC/TC coverage matrices
- The cross-link boundary issue
- The exports-only enforcement gap
- The three weak test observations
- The `category: "environment"` vs `"missing-dependency"` finding for bundled scripts

---

### #2: Sonnet (this reviewer)

**What's good:**

- **Verified all fixture directory contents directly.** The review confirms there are no `.module-plan.json` files anywhere in the fixture tree, which is directly relevant to the CRITICAL-1 gap resolution guidance.
- **Correctly identifies PATH_ERROR vs ENVIRONMENT_ERROR** in `status.ts` as MAJOR-1.
- **Correct test count (85 vs planned 82)** with explanation of where the extra tests came from.
- **`isTimeoutError` fragility finding** — the string-match against subprocess error message internals is a real coupling concern.
- **Identifies dead `checkParserAvailability` alias** and the dead `NotImplementedError` class.
- **MAJOR-4 (chmod test)** — legitimate concern about mutating real source file permissions in a test.
- **Zod v4 message fragility in TC-4.6e** — pinned assertion against `"Invalid input: expected string, received undefined"` which could break on Zod upgrades.
- **No false statements.** Every claim is verifiable against the code.

**What's not good:**

- **Misses the cross-link boundary issue** — the most impactful finding GPT-5.4 caught. The code at `cross-links.ts:36` was read but the boundary constraint was not noticed.
- **Misses the "exports only" enforcement gap** — doesn't note that `RawNode` has no visibility field.
- **Misses the `LANGUAGE_BY_EXTENSION` map divergence** between `language-detector.ts` and `normalizer.ts` — Opus found this and it's a genuine inconsistency.
- **MAJOR-3 (`isTreeSitterLanguageAvailable` for unknown languages) is over-elevated.** The function is not in the public SDK surface, and the calling code in `checkParsers` guards against this path via `PARSER_REQUIREMENTS`. Flagging it as Major is too high.
- **MAJOR-4 (chmod test) is also slightly over-elevated.** The `finally` block restores correctly and vitest runs sequentially by default. Worth flagging as a minor robustness concern, not a Major.

**What to take from it:**
- The PATH_ERROR/ENVIRONMENT_ERROR semantic mismatch
- The `isTimeoutError` fragility
- The Zod message pinning in TC-4.6e
- The dead code findings
- Confirmation that no `.module-plan.json` fixture files exist (contradicting Opus's claim)

---

### #3: Opus

**What's good:**

- **Clean, confident writing.** The clearest prose of all four reviews. The structure (What's Good / Findings / Coverage Matrix / Quality Gates / Recommendations) is readable and logical.
- **Correctly identifies the canonical gap** (M1: `.module-plan.json`) with good spec referencing.
- **Runs and reports actual quality gates** — biome, tsc, vitest — with their actual outputs. "90 files checked, no issues" and "85/85 tests" are concrete data points.
- **Reports the `LANGUAGE_BY_EXTENSION` map divergence (m1)** — the fact that `language-detector.ts` recognizes `.cjs`/`.cts`/`.mjs`/`.mts` but `normalizer.ts` doesn't, and vice versa for `.c`/`.go`/`.java`/`.rs`. This is a genuine inconsistency that could produce confusing behavior where `checkEnvironment` says "TypeScript detected" for a repo with only `.mts` files while `analyzeRepository` finds zero components. No other reviewer caught this.
- **Notes the Python script quality** — confirms it's a real functioning analyzer, not a stub. This is useful context the other reviewers don't provide.
- **Identifies the `getErrorMessage` helper duplication (m3)** — six files with identical logic, different fallbacks.
- **Clean recommendations section** — prioritizes M1 as immediate, correctly defers m3/m4/m5/m6.
- **68/68 TCs column is accurate** — consistent with the other reviews.

**What's not good:**

- **Contains a material factual error.** The review states: *"Note: The fixture infrastructure already includes `.module-plan.json` files in all doc-output fixtures (they were clearly anticipated), so the fix is straightforward."* This is demonstrably false. There are no `.module-plan.json` files in any fixture directory. This is a hallucinated detail that could mislead the implementer into thinking the fixture work is already done when it is not.
- **Misses PATH_ERROR/ENVIRONMENT_ERROR** in `status.ts` — even though the review goes through the error model in detail, it passes on this as correct. The review's error model table says `PATH_ERROR` for git failure in status is correct, which it isn't.
- **Misses the cross-link boundary issue** — doesn't notice that links can escape `outputPath`.
- **Misses the exports-only enforcement gap.**
- **No warning about the dual-filtering path.**
- **Finding severity (Major vs Minor) is somewhat compressed** — the `LANGUAGE_BY_EXTENSION` divergence (m1) could have a real impact on language detection consistency for Epic 2 clustering, but it's filed as Minor. The PATH_ERROR issue isn't filed at all.

**What to take from it:**
- The `LANGUAGE_BY_EXTENSION` map divergence between language-detector and normalizer
- The Python script quality confirmation
- The quality gates table format (biome, tsc, vitest actual results)
- The `getErrorMessage` duplication observation

---

### #4: GPT-5.3/Codex

**What's good:**

- **Finds one genuinely unique critical finding that every other reviewer missed: the Python script is not included in the build output.** The build config (`tsconfig.build.json`) emits only TypeScript files. The `package.json` exports from `dist`. The Python script is resolved via a path relative to the compiled JS file (`dist/analysis/scripts/analyze_repository.py`) but is never copied there. If Code Steward imports from the built package rather than source, both `checkEnvironment` and `analyzeRepository` fail. The reviewer manually verified this by running `npm run build` and calling the dist entrypoint. This is a real release-blocking packaging gap.
- **Correctly identifies `totalFilesAnalyzed` deviation** — the tech design maps `summary.total_files` → `totalFilesAnalyzed`, but the implementation sets it to `componentPaths.length` (supported components only). With unsupported files, this under-reports.
- **Cross-link boundary issue identified** — same finding as GPT-5.4, independently confirmed.
- **TC-4.2d gap correctly identified.**
- **AC coverage table is concise and useful.**

**What's not good:**

- **This is by far the shortest review.** Many flows and modules receive no specific analysis. The error model is not examined. The config resolver logic is not evaluated. The test quality observations are minimal.
- **"Overall assessment: Fail" is contextually heavy.** The packaging issue is real, but the package is `"private": true`. Whether `dist` being broken is "release-blocking" depends on how Code Steward imports it. In a monorepo with TypeScript path aliases pointing to source, this may not matter at all for current consumers.
- **No test analysis beyond count and pass/fail.** No assessment of mock boundary discipline, fixture quality, or TC naming.
- **No architecture assessment.** The review does not examine whether the module structure matches the tech design.
- **Validation schema `z.number()` finding is genuinely minor** — internal derivation means counts can't actually be negative. This feels like padding.
- **The repo-subdirectory finding** is marked Minor here (vs Major in GPT-5.4), which is actually the more defensible severity given the epic's assumption A4.

**What to take from it:**
- The Python script not bundled in dist finding (unique and verified)
- The `totalFilesAnalyzed` tech design deviation
- The brevity as a lesson: identifying 2-3 genuinely important things is more useful than 20 partially-analyzed findings

---

## Findings Comparison Across All Four Reviews

| Finding | GPT-5.4 | Sonnet | Opus | GPT-5.3 |
|---------|---------|--------|------|---------|
| AC-4.2d / `.module-plan.json` not validated | ✅ Critical | ✅ Critical | ✅ Major | ✅ Critical |
| PATH_ERROR vs ENVIRONMENT_ERROR in status.ts | ✅ Major | ✅ Major | ❌ Missed | ❌ Missed |
| Python script not bundled in dist | ❌ Missed | ❌ Missed | ❌ Missed | ✅ Critical |
| Cross-link boundary escape issue | ✅ Major | ❌ Missed | ❌ Missed | ✅ Major |
| "Exports only" enforcement gap | ✅ Major | ❌ Missed | ❌ Missed | ❌ Missed |
| Dual filtering (adapter + normalizer) | ✅ Major | ❌ Missed | ❌ Missed | ❌ Missed |
| LANGUAGE_BY_EXTENSION map divergence | ❌ Missed | ❌ Missed | ✅ Minor | ❌ Missed |
| Weak tests (TC-1.1b, TC-3.4b, TC-4.4a) | ✅ Minor | ❌ Missed | ❌ Missed | ❌ Missed |
| Bundled script `category: "environment"` vs `"missing-dependency"` | ✅ Major | ✅ Minor | ❌ Missed | ❌ Missed |
| `totalFilesAnalyzed` tech design deviation | ✅ Minor | ❌ Missed | ❌ Missed | ✅ Major |
| `isTimeoutError` fragility | ❌ Missed | ✅ Major | ❌ Missed | ❌ Missed |
| Zod message pinning in TC-4.6e | ❌ Missed | ✅ Minor | ❌ Missed | ❌ Missed |
| `checkParserAvailability` alias dead code | ❌ Mentioned in TC count | ✅ Minor | ✅ Minor | ❌ Missed |
| `NotImplementedError` dead code | ❌ Missed | ✅ Minor | ❌ Missed | ❌ Missed |
| `getErrorMessage` duplication | ❌ Mentioned | ❌ Missed | ✅ Minor | ❌ Missed |
| Opus fixture claim is false | N/A | N/A | ❌ False claim | N/A |

**Findings unique to a single reviewer:**
- GPT-5.4 only: exports-only enforcement gap, dual filtering, three specific weak test assertions
- Sonnet only: `isTimeoutError` fragility, Zod message pinning, `NotImplementedError` dead code
- Opus only: `LANGUAGE_BY_EXTENSION` map divergence, Python script quality confirmation
- GPT-5.3 only: Python script not bundled in dist

---

## What to Take From Each Review for a Best Synthesized Report

**From GPT-5.4:**
- The full AC/TC coverage matrices (copy verbatim as the most useful tabular artifact)
- Cross-link boundary escape finding (verified real, no other reviewer caught it)
- Exports-only enforcement gap (flag as potential concern pending Python script audit)
- Weak test assertions for TC-1.1b, TC-3.4b, TC-4.4a
- Dual filtering observation (flag as design concern, not defect)
- Bundled scripts not emitting `"missing-dependency"` category

**From Sonnet:**
- PATH_ERROR vs ENVIRONMENT_ERROR semantic mismatch (with verified manual test)
- `isTimeoutError` fragility (unique and real)
- Zod message pinning in TC-4.6e (unique and real)
- Fixture inventory confirming no `.module-plan.json` files exist (contradicts Opus)
- Dead code findings (`NotImplementedError`, `checkParserAvailability`)

**From Opus:**
- `LANGUAGE_BY_EXTENSION` map divergence between language-detector and normalizer (unique, real, and has Epic 2 implications for clustering)
- Python script quality confirmation (useful context)
- Quality gates table (biome 90 files, tsc zero errors, vitest 85/85)

**From GPT-5.3/Codex:**
- Python script not bundled in dist (unique, verified by actually running the build — no other reviewer did this)
- `totalFilesAnalyzed` tech design mapping deviation

---

## What a Best Synthesized Review Would Look Like

**Structure:**
1. Executive summary with quality gate table (from Opus format)
2. Verdict: Pass with documented gaps (Opus's framing is better than GPT-5.3's "Fail" which over-weights debatable findings)

**Findings, correctly ranked:**

*Critical (must fix before shipping):*
- AC-4.2d: `.module-plan.json` not validated — all four reviewers agree
- Python script not bundled in dist — GPT-5.3 only, but verified

*Major:*
- PATH_ERROR vs ENVIRONMENT_ERROR in `status.ts` (Sonnet, GPT-5.4)
- Cross-link boundary escape: `../outside.md` passes validation (GPT-5.4, GPT-5.3)
- `category: "environment"` instead of `"missing-dependency"` for bundled scripts (GPT-5.4, Sonnet)

*Minor:*
- `LANGUAGE_BY_EXTENSION` map divergence between language-detector and normalizer (Opus only — has Epic 2 implications)
- `totalFilesAnalyzed` set to component count, not adapter-reported total (GPT-5.4, GPT-5.3)
- Weak test assertions for TC-1.1b, TC-3.4b, TC-4.4a (GPT-5.4 only)
- `isTimeoutError` string-match fragility (Sonnet only)
- Zod message pinning in TC-4.6e (Sonnet only)
- Dead code: `NotImplementedError`, `checkParserAvailability` alias (Sonnet, Opus)

*Design observations (no fix required, document for Epic 2):*
- Exports-only enforcement depends on Python script behavior — no `isExported` field in raw contract (GPT-5.4)
- Dual filtering: adapter + normalizer both apply include/exclude with different semantics (GPT-5.4)
- Repo subdirectory behavior: `getGitRepositoryStatus` requires repo root — acceptable per A4 assumption (GPT-5.4, GPT-5.3)
- `getErrorMessage` helper duplication — tolerable at current scale (Opus)

**AC/TC coverage matrix:** Take GPT-5.4's format verbatim — it's the only review with a complete, linked, per-status table for all 29 ACs and all 69 TCs (including the epic-only TC-4.2d).

---

## Summary Assessment

The strongest review is **GPT-5.4** by a meaningful margin. It finds the most real issues, provides the most complete coverage matrices, and anchors every finding to file:line evidence. Its main weakness is severity inflation on a few findings.

The weakest review is **GPT-5.3/Codex** — too short to be comprehensive — but it earns credit for being the only reviewer who actually ran the build and discovered the Python script packaging gap, which is the most operationally impactful finding in the entire set.

**Opus** writes well but makes a verifiable false claim about fixture infrastructure (stating `.module-plan.json` files already exist in fixtures, which is false). A factual error in a code review is a trust problem, regardless of writing quality.

**Sonnet** (this reviewer) is accurate but incomplete — no false statements, but misses several real findings that a more systematic check of every module would have surfaced (the cross-link boundary being the most significant miss).
