# Environment Checks

Pre-flight environment validation that runs before wiki generation begins. This module detects available programming languages in the target repository, verifies that required runtime dependencies (Git, Python) are present, and confirms that tree-sitter parsers are operational.

## Components

| File | Purpose |
|---|---|
| `liminal-docgen/src/environment/check.ts` | Top-level `checkEnvironment` function that orchestrates all sub-checks and returns a consolidated environment status |
| `liminal-docgen/src/environment/language-detector.ts` | `detectLanguages` — scans the repository to determine which programming languages are present |
| `liminal-docgen/src/environment/runtime-checker.ts` | `checkRuntimeDependencies` — verifies Git and Python are available; also exports `BUNDLED_ANALYSIS_SCRIPT_PATHS` for locating bundled Python scripts |
| `liminal-docgen/src/environment/parser-checker.ts` | `checkParsers` — validates that tree-sitter parsers can be loaded for the detected languages |

## How It Works

1. **`checkEnvironment`** is the single entry point, called by the Orchestration module's `environment-check` stage.
2. It delegates to the three specialist checkers in sequence: language detection → runtime dependency verification → parser availability.
3. Results are returned as structured types defined in the Type Definitions module.

## Dependencies

- **External Adapters** — uses the Git and Python adapter interfaces (`adapters/git.ts`, `adapters/python.ts`) to probe for installed runtimes.
- **Shared Utilities** — language registry (`languages.ts`) for mapping file extensions to supported languages.
- **Type Definitions** — shared types from `types/common.ts` and `types/index.ts` for environment check results.

## Consumed By

- **Orchestration** — the `environment-check` stage imports `checkEnvironment` to gate the pipeline on a healthy environment before proceeding to analysis and generation stages.
