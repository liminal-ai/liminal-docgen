# VS Code Copilot Codex-Style Agents

These workspace agents are narrow, manual-selection approximations of a Codex-style workflow inside VS Code.

## Included Agents

- `GPT-5.2 Mode`
- `GPT-5.4 Codex Mode`
- `GPT-5.3-Codex Mode`

## Design Choices

- Minimal tool list: `codebase`, `search`, `usages`, `editFiles`, `runCommands`
- No fetch, MCP, browser, GitHub, or broad external tools
- No subagents
- Short prompts that bias toward small reads, small diffs, and narrow verification
- Intentional mismatch from full Codex runtime: these agents keep only the tool subset that maps cleanly to VS Code
- Explicit preference for `apply_patch` if you add it to your shell environment
- `GPT-5.2 Mode` is based on the non-Codex `gpt-5.2` prompt shape from Codex, adapted to VS Code and stripped of CLI-only instructions

## Install / Use

1. Open this workspace in VS Code.
2. Open Copilot Chat in Agent mode.
3. Pick one of the custom agents from the agent dropdown.

VS Code detects workspace custom agents from `.github/agents/*.agent.md`.

## Suggested Use

- Use `GPT-5.2 Mode` when you want the general GPT-5.2 model with more explicit workflow guidance than the lean Codex-mode agents.
- Use `GPT-5.4 Codex Mode` for debugging, ambiguous tasks, and cross-file reasoning.
- Use `GPT-5.3-Codex Mode` for focused implementation, refactors, and test-fix loops.
- `GPT-5.4` gets the leaner prompt because newer Codex research points to stronger built-in instruction following and tool behavior.

## Next Iterations

- Add prompt files like `/codex-impl` and `/codex-review`
- Add scoped hooks to discourage unsafe or noisy terminal usage
- Tune workspace settings to reduce autopilot behavior and MCP discovery
