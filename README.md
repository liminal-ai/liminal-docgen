# Liminal DocGen

Liminal DocGen is a TypeScript rewrite of repository-level documentation generation tooling. It analyzes a codebase, plans documentation modules, generates structured docs through explicit inference providers, validates the output, tracks metadata, supports incremental updates, and can publish results through Git workflows.

This repository is a TypeScript rewrite and port of [CodeWiki](https://github.com/FSoft-AI4Code/CodeWiki). It keeps that rewrite relationship explicit while making independent implementation choices in the analysis pipeline, inference-provider system, validation flow, CLI surface, and packaging model.

## What Liminal DocGen Does

Liminal DocGen currently supports:

- Native TypeScript structural analysis for JavaScript and TypeScript repositories
- Python-backed fallback analysis when Python is in scope
- Explicit inference-provider selection for generation and review
- Full generation, incremental update, validation, status, and publish flows
- Metadata tracking through `.doc-meta.json` and `.module-plan.json`
- Provider-backed live tests for:
  - `claude-sdk`
  - `claude-cli`

Current limitations:

- Provider selection is explicit; there is no automatic provider fallback
- Inference is one-shot and non-streaming
- Usage and cost values are only surfaced when a provider reports them
- Claude-backed OAuth support depends on local Claude CLI authentication state
- `openrouter-http` is currently unstable in generation flows and should not be relied on for consistent output

## Installation and Local Setup

Liminal DocGen requires Node.js 24 or newer.

Install and run it from npm without cloning this repository:

```bash
npx liminal-docgen --help
```

```bash
npm install -g liminal-docgen
```

Liminal DocGen ships as both a CLI and a small programmatic library surface through the package exports. Provider credentials and auth state stay local to your machine or runtime environment; the package does not bundle API keys, OAuth state, or provider secrets.

For local development in this repository, install dependencies:

```bash
npm install
```

Run the CLI locally:

```bash
npm run dev -- --help
```

Build the package:

```bash
npm run build
```

## Quick Start

1. Create or inspect your config file:

```text
.liminal-docgen.json
```

Liminal DocGen still accepts the legacy `.docengine.json` filename as a fallback, but `.liminal-docgen.json` is the default moving forward.

2. Validate the local environment and provider setup:

```bash
npm run dev -- check \
  --repo-path /path/to/repo \
  --provider claude-cli \
  --auth-mode oauth
```

3. Generate documentation:

```bash
npm run dev -- generate \
  --repo-path /path/to/repo \
  --provider claude-cli \
  --auth-mode oauth
```

4. Validate the generated output:

```bash
npm run dev -- validate \
  --output-path /path/to/repo/docs/wiki
```

5. Inspect generation status:

```bash
npm run dev -- status \
  --repo-path /path/to/repo
```

## CLI Commands

Top-level commands:

- `check` — check repository, provider, and auth readiness
- `analyze` — analyze repository structure
- `generate` — generate documentation with an explicit inference provider
- `update` — incrementally update documentation with an explicit inference provider
- `validate` — validate generated documentation artifacts and links
- `status` — inspect generation status from metadata and current Git state
- `publish` — publish generated documentation to a branch and optional pull request

Get help for any command:

```bash
npm run dev -- <command> --help
```

Examples:

```bash
npm run dev -- analyze --repo-path /path/to/repo
```

```bash
npm run dev -- check \
  --repo-path /path/to/repo \
  --provider openrouter-http \
  --auth-mode env \
  --api-key-env OPENROUTER_API_KEY
```

```bash
npm run dev -- generate \
  --repo-path /path/to/repo \
  --provider claude-sdk \
  --auth-mode env \
  --api-key-env ANTHROPIC_API_KEY
```

```bash
npm run dev -- update \
  --repo-path /path/to/repo \
  --provider claude-cli \
  --auth-mode oauth
```

```bash
npm run dev -- status --repo-path /path/to/repo
```

```bash
npm run dev -- publish \
  --repo-path /path/to/repo \
  --create-pr \
  --branch-name docs/liminal-update
```

## Provider System and Auth Modes

Supported inference providers:

- `claude-sdk`
- `claude-cli`
- `openrouter-http`

Supported auth modes:

- `oauth`
- `env`
- `api-key`

Provider/auth compatibility:

| Provider | Supported auth modes | Notes |
|---|---|---|
| `claude-sdk` | `oauth`, `env`, `api-key` | Uses the optional Claude Agent SDK package. OAuth depends on local Claude auth availability. |
| `claude-cli` | `oauth`, `env`, `api-key` | Uses the `claude` CLI. OAuth depends on `claude auth login`. |
| `openrouter-http` | `env`, `api-key` | Stateless HTTP provider. OAuth is not supported. Currently unstable in end-to-end generation and not recommended for production use. |

Recommended local practice:

- Use `claude-cli` with `oauth` for the most natural local operator workflow
- Use `claude-sdk` when you specifically want SDK-backed integration behavior
- Use `oauth` for Claude-backed providers when you already use the Claude CLI locally
- Use `env` for API-key-backed flows
- Do not store raw API keys in `.liminal-docgen.json`
- Avoid `openrouter-http` for reliable end-to-end generation until it stabilizes

Usage and cost behavior:

- `usage` and `costUsd` are provider-reported only
- When a provider does not expose one of those values, Liminal DocGen returns `null`
- Liminal DocGen does not estimate missing cost values

## Configuration File Reference

Default config filename:

```text
.liminal-docgen.json
```

Legacy fallback:

```text
.docengine.json
```

Complete example:

```json
{
  "outputPath": "docs/wiki",
  "includePatterns": ["src/**"],
  "excludePatterns": ["**/dist/**", "**/*.snap"],
  "focusDirs": ["src/core", "src/api"],
  "inference": {
    "provider": "claude-cli",
    "auth": {
      "mode": "env",
      "apiKeyEnvVar": "ANTHROPIC_API_KEY"
    },
    "model": "claude-sonnet-4-6"
  }
}
```

Field reference:

- `outputPath`
  - Relative or absolute output directory for generated docs
  - Defaults to `docs/wiki`
- `includePatterns`
  - Optional glob patterns to include in structural analysis
- `excludePatterns`
  - Optional glob patterns to exclude from structural analysis
- `focusDirs`
  - Optional directories to scope analysis more tightly
- `inference.provider`
  - Required for generation/update flows
  - One of `claude-sdk`, `claude-cli`, `openrouter-http`
- `inference.auth.mode`
  - `oauth`, `env`
  - Config-file auth intentionally omits raw API key persistence
- `inference.auth.apiKeyEnvVar`
  - Optional env var name override for env-based API key flows
- `inference.model`
  - Optional provider model override
  - When omitted, `claude-sdk` and `claude-cli` default to `sonnet[1m]`
  - For `claude-sdk` and `claude-cli`, this value is a Claude provider-specific model selector such as `default`, `sonnet`, or `opus`
  - For `openrouter-http`, this value is an OpenRouter model slug such as `openai/gpt-4o-mini`

Notes:

- Raw API keys are not intended to be stored in the project config file
- CLI flags and programmatic usage can still provide provider/auth/runtime inputs directly
- Programmatic/library callers may pass explicit API-key values at runtime where supported

## Common Workflows

### Check provider and repository readiness

```bash
npm run dev -- check \
  --repo-path /path/to/repo \
  --provider claude-sdk \
  --auth-mode oauth
```

### Analyze a repository without generating docs

```bash
npm run dev -- analyze \
  --repo-path /path/to/repo \
  --include src/** \
  --exclude '**/*.test.ts'
```

### Generate docs with OpenRouter

```bash
npm run dev -- generate \
  --repo-path /path/to/repo \
  --provider openrouter-http \
  --auth-mode env \
  --api-key-env OPENROUTER_API_KEY \
  --model openai/gpt-4o-mini
```

### Incrementally update docs

```bash
npm run dev -- update \
  --repo-path /path/to/repo \
  --provider claude-cli \
  --auth-mode oauth
```

### Validate generated docs

```bash
npm run dev -- validate \
  --output-path /path/to/repo/docs/wiki
```

### Inspect metadata-backed status

```bash
npm run dev -- status \
  --repo-path /path/to/repo
```

### Publish docs to a branch and PR

```bash
npm run dev -- publish \
  --repo-path /path/to/repo \
  --branch-name docs/liminal-update \
  --create-pr \
  --pr-title "docs: update generated documentation"
```

## Output Structure

By default, Liminal DocGen writes output to:

```text
docs/wiki
```

Generated artifacts include:

- `overview.md`
  - top-level repository overview
- `module-tree.json`
  - tree of generated module pages
- one markdown page per planned module
  - for example `core.md`, `api-layer.md`, `utilities.md`
- `.doc-meta.json`
  - generation metadata such as commit hash, generation time, and generated files
- `.module-plan.json`
  - persisted module plan used for update mode

## Testing and Verification

Deterministic verification:

```bash
npm run typecheck
npm test
npm run test:integration
```

Live provider-backed verification:

1. Fill in `.env.local`
2. Load it into your shell:

```bash
set -a
source .env.local
set +a
```

3. Run:

```bash
npm run test:live
```

What the live tests cover:

- `claude-sdk` with OAuth-backed local auth
- `claude-sdk` with API-key-backed auth
- `claude-cli` with OAuth-backed local auth
- `claude-cli` with API-key-backed auth
- explicit CLI shell generation with `claude-cli`
- live publish flow

`openrouter-http` remains available in the codebase and CLI surface, but it is currently unstable in end-to-end generation. It is not part of the live smoke gate and is not recommended for reliable use right now.

## Publishing Workflow

`publish` expects generated documentation to already exist in the target output directory.

The publish flow:

1. validates output and metadata presence
2. creates a temporary worktree
3. creates or checks out a publish branch
4. stages generated docs
5. commits the docs
6. pushes the branch
7. optionally creates a pull request with `gh`

Typical example:

```bash
npm run dev -- publish \
  --repo-path /path/to/repo \
  --branch-name docs/liminal-update \
  --base-branch main \
  --create-pr \
  --pr-title "docs: update generated documentation"
```

## Rewrite Attribution and License

Liminal DocGen is a TypeScript rewrite and port of [CodeWiki](https://github.com/FSoft-AI4Code/CodeWiki).

This repository acknowledges the upstream CodeWiki project as the basis for the rewrite and keeps that relationship explicit in:

- `README.md`
- `NOTICE`
- `LICENSE`

License:

- This repository is MIT licensed
- See [LICENSE](/Users/leemoore/code/agent-cli-tools/code-wiki-gen/LICENSE)
- See [NOTICE](/Users/leemoore/code/agent-cli-tools/code-wiki-gen/NOTICE) for the upstream attribution
