# Integration and Live Tests

This module contains the integration and live test suites for the `liminal-docgen` package. These tests validate end-to-end behavior, determinism, failure handling, publishing workflows, and SDK contract compliance — ranging from isolated integration tests with mocks to live tests that run against real infrastructure.

## Purpose

- **Verify correctness** of the wiki generation pipeline beyond unit-level concerns
- **Ensure determinism** so that identical inputs always produce identical outputs
- **Validate failure modes** to confirm graceful degradation and meaningful error reporting
- **Test publishing workflows** end-to-end, including output formatting and destination handling
- **Enforce SDK contracts** to guarantee the public API surface behaves as documented
- **Run live smoke tests** against real infrastructure (LLM providers, publish targets) to catch environment-specific issues

## Components

### Integration Tests

| File | Description |
|------|-------------|
| `liminal-docgen/test/integration/determinism.test.ts` | Asserts that repeated runs with the same input produce identical wiki output |
| `liminal-docgen/test/integration/e2e.test.ts` | Full end-to-end pipeline test from repository ingestion to wiki page output |
| `liminal-docgen/test/integration/failure.test.ts` | Exercises error paths — malformed input, network failures, partial results |
| `liminal-docgen/test/integration/publish.test.ts` | Tests the publish step including formatting, file output, and destination routing |
| `liminal-docgen/test/integration/sdk-contract.test.ts` | Validates the public SDK surface against expected input/output contracts |

### Live Tests

| File | Description |
|------|-------------|
| `liminal-docgen/test/live/generate.live.test.ts` | Runs wiki generation against a real LLM provider to validate live output quality |
| `liminal-docgen/test/live/publish.live.test.ts` | Publishes output to a real target to verify end-to-end delivery |

> **Note:** Live tests require valid credentials and network access. They are typically excluded from CI and run on-demand or in dedicated environments.

## Running

```bash
# Integration tests (safe to run in CI)
npx vitest run test/integration

# Live tests (requires real credentials)
npx vitest run test/live
```

## Design Notes

- Integration tests are self-contained and do not depend on external services; they mock infrastructure boundaries as needed.
- The `publish.test.ts` suite is the largest at ~870 LOC, reflecting the complexity of publish destination routing and output formatting.
- The `sdk-contract.test.ts` suite (~690 LOC) acts as a contract test layer, helping catch breaking API changes early.
- Live tests are intentionally lightweight and focused on smoke-level validation rather than exhaustive coverage.
