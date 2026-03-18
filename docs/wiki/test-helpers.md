# Test Helpers

Shared test infrastructure providing mocks, fixtures, runners, and utilities used across the `liminal-docgen` test suite.

## Purpose

This module centralizes all reusable test support code so that individual test files remain focused on assertions rather than setup boilerplate. It covers:

- **Agent SDK mocking** – a configurable mock of the Claude Agent SDK for deterministic testing
- **CLI test runner** – programmatic invocation of the CLI with stdout/stderr capture
- **Fixture management** – paths to static fixtures, live Git repos, and story-specific test data
- **Git helpers** – thin wrappers for running Git commands and reading commit hashes from fixture repos
- **Publish test doubles** – mock Git and GitHub adapters for publish-flow tests
- **Temp directory lifecycle** – create/cleanup helpers for isolated test workspaces

## Components

| File | Key Exports | Description |
|------|-------------|-------------|
| `liminal-docgen/test/helpers/agent-sdk-mock.ts` | `MockSDKConfig`, `createMockSDK` | Configurable mock of the Agent SDK; returns canned responses for analysis, planning, and quality-review calls |
| `liminal-docgen/test/helpers/cli-runner.ts` | `runCli`, `runCliJson`, `CliRunResult` | Spawns the CLI as a child process and captures exit code, stdout, and stderr |
| `liminal-docgen/test/helpers/fixtures.ts` | `FIXTURES_ROOT`, `REPOS`, `DOCS_OUTPUT`, `CONFIG` | Canonical path constants pointing to the shared fixture directory tree |
| `liminal-docgen/test/helpers/git.ts` | `runGit`, `getFixtureCommitHash`, `getFixtureShortCommitHash` | Convenience wrappers for executing Git commands against fixture repos |
| `liminal-docgen/test/helpers/live-fixtures.ts` | `createLiveGenerationRepo`, `seedCommittedDocsOutput`, `removeDocsPage`, `readJsonFile`, `gitShowFromRemote` | Creates temporary Git repos with realistic committed content for end-to-end generation tests |
| `liminal-docgen/test/helpers/publish-fixtures.ts` | `createMockGitForPublish`, `createMockGh`, `createPublishTestEnv` | Test doubles for the Git and GitHub adapters used during wiki publish |
| `liminal-docgen/test/helpers/story5-fixtures.ts` | `STORY5_EXPECTED_FILES`, `createGitFixtureRepo`, `buildValidTsRawAnalysis`, `createStory5MockSDK` | Fixtures and factory helpers specific to Story 5 (structural analysis integration) |
| `liminal-docgen/test/helpers/temp.ts` | `createTempDir`, `cleanupTempDir` | Creates OS-level temp directories and cleans them up after tests |

## Dependencies on Other Modules

- **Type Definitions** – The Agent SDK mock imports shared types from `src/types/common.ts`, `src/types/planning.ts`, `src/types/quality-review.ts`, and `src/types/cli.ts` to ensure mock return values conform to production interfaces.
- **Structural Analysis** – `story5-fixtures.ts` imports `src/analysis/raw-output.ts` to build valid raw analysis objects that match the real analyzer's output shape.

## Usage Pattern

Test files import only what they need:

```ts
import { createMockSDK } from '../helpers/agent-sdk-mock';
import { FIXTURES_ROOT } from '../helpers/fixtures';
import { createTempDir, cleanupTempDir } from '../helpers/temp';
```

This keeps test setup declarative and avoids duplicating mock logic across spec files.
