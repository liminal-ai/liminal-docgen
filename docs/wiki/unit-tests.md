# Unit Tests

Comprehensive test suites for the `liminal-docgen` tool, covering all major subsystems. These tests validate correctness of analysis, CLI behavior, configuration, environment checks, metadata tracking, orchestration workflows, prompt construction, and input validation.

## Structure

Tests are organized under `liminal-docgen/test/` mirroring the source layout in `liminal-docgen/src/`:

### Analysis
- **`test/analysis/analyze.test.ts`** (643 LOC) — Tests for repository analysis logic including component discovery and relationship mapping.

### CLI
- **`test/cli/commands.test.ts`** (452 LOC) — Command parsing and dispatch.
- **`test/cli/output.test.ts`** (238 LOC) — Output formatting and display.
- **`test/cli/progress.test.ts`** (229 LOC) — Progress reporting during long-running operations.
- **`test/cli/failure.test.ts`** (208 LOC) — Graceful error handling paths.
- **`test/cli/smoke.test.ts`** (114 LOC) — Basic smoke tests for CLI startup.
- **`test/cli/check-error-output.test.ts`** (104 LOC) — Error message formatting validation.

### Configuration
- **`test/config/resolver.test.ts`** (185 LOC) — Config file resolution, defaults, and override logic.

### Environment
- **`test/environment/check.test.ts`** (368 LOC) — Pre-flight environment checks (dependencies, API keys, etc.).

### Metadata
- **`test/metadata/status.test.ts`** (299 LOC) — Wiki generation status tracking and staleness detection.

### Orchestration
The largest test area, covering the multi-stage wiki generation pipeline:
- **`test/orchestration/update.test.ts`** (1146 LOC) — Incremental update workflows.
- **`test/orchestration/generate.test.ts`** (788 LOC) — Full generation pipeline.
- **`test/orchestration/quality-review.test.ts`** (712 LOC) — LLM-driven quality review stage.
- **`test/orchestration/failure.test.ts`** (710 LOC) — Failure recovery and retry behavior.
- **`test/orchestration/progress.test.ts`** (506 LOC) — Stage progress tracking.
- **`test/orchestration/module-planning.test.ts`** (452 LOC) — Module grouping and planning logic.
- **`test/orchestration/pure-functions.test.ts`** (146 LOC) — Isolated pure-function unit tests.

### Prompts
- **`test/prompts/prompt-builders.test.ts`** (251 LOC) — LLM prompt template construction and variable substitution.

### Validation
- **`test/validation/validate.test.ts`** (476 LOC) — Input and output schema validation.

## Coverage Summary

| Area | Files | Total LOC |
|------|-------|-----------|
| Orchestration | 7 | 4,460 |
| CLI | 6 | 1,345 |
| Analysis | 1 | 643 |
| Validation | 1 | 476 |
| Environment | 1 | 368 |
| Metadata | 1 | 299 |
| Prompts | 1 | 251 |
| Configuration | 1 | 185 |
| **Total** | **19** | **8,027** |

## Running Tests

Tests use the standard TypeScript test runner configured for the project. Run from the `liminal-docgen` directory.

## Notes

- All test files are side-effect modules with no exports.
- Orchestration tests are the most extensive area, reflecting the complexity of the multi-stage generation pipeline.
- Tests mirror the `src/` directory structure for easy navigation between implementation and test code.
