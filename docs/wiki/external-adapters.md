# External Adapters

Low-level wrappers that isolate the rest of the application from external tools and processes. Every interaction with the shell, Git, GitHub, Python, or the Claude Agent SDK flows through this module, making it straightforward to mock during testing and swap implementations if needed.

## Components

### Subprocess Runner
**`liminal-docgen/src/adapters/subprocess.ts`** (79 LOC)

Generic child-process executor used by the other adapters. Exports:
- `runSubprocess` – spawns a command, captures stdout/stderr, and enforces timeouts
- `SubprocessResult` – typed result interface
- `SubprocessTimeoutError` – custom error for timed-out processes

### Git CLI Adapter
**`liminal-docgen/src/adapters/git.ts`** (397 LOC)

Comprehensive wrapper around the `git` CLI. Provides functions for:
- Repository inspection (`isGitRepository`, `isGitAvailable`, `getGitRepositoryStatus`, `getHeadCommitHash`, `getDefaultBranch`)
- Diff / change detection (`getChangedFilesBetweenCommits`)
- Worktree management (`createWorktree`, `removeWorktree`)
- Branching and committing (`createBranch`, `branchExists`, `stageFiles`, `stageAllChanges`, `commit`)
- Remote operations (`pushBranch`, `getRemoteUrl`)

This is the most heavily depended-upon adapter, consumed by Environment Checks, Metadata, Structural Analysis, and Publish modules.

### GitHub CLI Adapter
**`liminal-docgen/src/adapters/gh.ts`** (87 LOC)

Thin wrapper around the `gh` CLI for GitHub-specific operations:
- `isGhAvailable` – checks whether `gh` is installed and authenticated
- `createPullRequest` – opens a PR from the generated wiki branch

### Python Runtime Adapter
**`liminal-docgen/src/adapters/python.ts`** (88 LOC)

Detects and interacts with the local Python environment:
- `isPythonAvailable` / `getPythonCommand` – locates a usable Python 3 binary
- `isTreeSitterLanguageAvailable` – checks whether a tree-sitter grammar package is installed

Used by the Structural Analysis and Environment Checks modules to verify parser availability.

### Agent SDK Adapter
**`liminal-docgen/src/adapters/agent-sdk.ts`** (254 LOC)

Abstraction over the Claude Agent SDK for LLM-powered generation:
- `AgentSDKAdapter` – interface defining `query` and lifecycle methods
- `createAgentSDKAdapter` – factory that returns a configured adapter instance
- `AgentQueryOptions` / `AgentQueryResult` / `TokenUsage` – supporting types

Consumed extensively by the Orchestration module for wiki page planning, generation, and review stages.

## Dependencies

All adapters import shared types from the **Type Definitions** module (`liminal-docgen/src/types/common.ts`, `liminal-docgen/src/types/index.ts`).

## Downstream Consumers

| Consumer Module | Adapters Used |
|---|---|
| Environment Checks | git, python |
| Metadata | git |
| Structural Analysis | git, python |
| Orchestration | agent-sdk |
| Publish | git, gh |
