# Test Fixtures

Static fixture repositories used by the `liminal-docgen` test suite. Each fixture simulates a different repository scenario to exercise parsing, analysis, and edge-case handling.

## Purpose

These fixtures provide deterministic, minimal sample projects that tests can point at without needing to create temporary files or mock the filesystem. They cover multi-language support, missing-git scenarios, and valid TypeScript codebases.

## Fixture Repositories

### `multi-lang`

A repository containing both Python and TypeScript source files, used to verify that the wiki generator correctly handles multiple languages in a single repo.

| File | Language | Exports |
|------|----------|---------|
| `liminal-docgen/test/fixtures/repos/multi-lang/analyzer.py` | Python | `summarize` (function) |
| `liminal-docgen/test/fixtures/repos/multi-lang/src/index.ts` | TypeScript | `greet` (function) |

### `no-git`

A repository with no `.git` directory, used to test graceful handling when git metadata is unavailable.

| File | Exports |
|------|---------|
| `liminal-docgen/test/fixtures/repos/no-git/src/index.ts` | `noGitFixture` (variable) |

### `valid-ts`

A small but realistic TypeScript project with multiple modules and inter-file dependencies (auth, session management, bootstrap entry point).

| File | Exports |
|------|---------|
| `liminal-docgen/test/fixtures/repos/valid-ts/src/auth.ts` | `AuthService` (class) |
| `liminal-docgen/test/fixtures/repos/valid-ts/src/index.ts` | `bootstrapAuth` (function) |
| `liminal-docgen/test/fixtures/repos/valid-ts/src/session.ts` | `SESSION_TTL_MS` (constant), `createSession` (function) |

## Notes

- These fixtures have **no runtime dependencies** on other modules; they are pure static data.
- No other modules currently declare a direct dependency on these fixtures, but they are consumed implicitly by test files under `liminal-docgen/test/`.
