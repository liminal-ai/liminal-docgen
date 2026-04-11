<!-- Source: docs/epics/agentic-module-generation-stories.md -->

## Story 2: Provider Tool-Use Support

### Summary
<!-- Jira: Summary field -->

At least one provider (claude-sdk) can run multi-turn tool-use conversations; unsupported providers report this cleanly.

### Description
<!-- Jira: Description field -->

**User Profile:**
- **Primary User:** Developer running `liminal-docgen generate` against their codebase
- **Context:** Generating or regenerating a documentation wiki for a repository, especially mid-to-large codebases (100+ components) with mixed architectural patterns
- **Mental Model:** "I point the tool at my repo and it produces a useful wiki that reflects my actual code structure"
- **Key Constraint:** Generation must complete reliably without manual intervention. Failures on individual modules should not abort the entire run.

**Objective:** Implement `inferWithTools()` on the claude-sdk provider so it can run multi-turn conversations with tool use. Providers that don't support tool use return a clear "not supported" error. Usage and cost tracking accumulates across all turns.

**Scope:**

*In:*
- `inferWithTools()` implementation for claude-sdk provider
- Tool call loop: model requests tool use → caller executes → result passed back
- Usage/cost accumulation across all turns
- `supportsToolUse()` returns `true` for claude-sdk, `false` for others
- Clear error from unsupported providers
- Fallback detection: module generation checks provider capability before attempting agentic generation

*Out:*
- OpenRouter tool-use support (stays one-shot)
- Claude CLI tool-use support (stays one-shot pending A2 validation — epic tech design question #2)
- New provider implementations
- Agent logic or tool implementations (Story 4)

**Claude CLI decision:** The epic identifies claude-cli tool-use capability as assumption A2 (unvalidated) and tech design question #2. Until A2 is validated, claude-cli remains one-shot. `supportsToolUse()` returns `false` for claude-cli. If A2 is validated during this story, claude-cli tool-use can be added as a follow-up; if not, claude-cli uses the one-shot fallback path established by AC-5.3b.

**Dependencies:** Story 0 (type definitions and provider interface)

### Acceptance Criteria
<!-- Jira: Acceptance Criteria field -->

**AC-5.1:** Provider interface supports tool-use conversations without breaking existing one-shot callers

- **TC-5.1a: Existing `infer()` calls unchanged**
  - Given: Any code that calls `provider.infer()`
  - When: Provider interface is extended
  - Then: All existing `infer()` callers compile and behave identically
- **TC-5.1b: `inferWithTools()` available on interface**
  - Given: An `InferenceProvider` instance
  - When: Caller invokes `inferWithTools()`
  - Then: Method exists and accepts tool definitions, system prompt, and initial message

**AC-5.2:** Providers that support tool use implement it correctly

- **TC-5.2a: Claude SDK provider supports tool use**
  - Given: A claude-sdk provider instance
  - When: `inferWithTools()` is called with tool definitions and a prompt
  - Then: Provider handles multi-turn conversation, executes tool calls, and returns final output
- **TC-5.2b: Tool call results are passed back to the model**
  - Given: Model returns a tool-use request during conversation
  - When: Tool is executed and result is available
  - Then: Result is sent back to the model and conversation continues

**AC-5.3:** Providers that don't support tool use report this cleanly

- **TC-5.3a: OpenRouter returns unsupported capability error**
  - Given: An openrouter-http provider instance
  - When: `inferWithTools()` is called
  - Then: Returns an error with code indicating tool use is not supported
- **TC-5.3b: Module generation falls back to one-shot for unsupported providers**
  - Given: A provider that does not support tool use
  - When: Module generation detects this
  - Then: Falls back to the existing one-shot structured-output path

**AC-5.4:** Usage and cost tracking works across multi-turn conversations

- **TC-5.4a: Token usage accumulated across all turns**
  - Given: A tool-use conversation with 5 turns
  - When: Conversation completes
  - Then: `getAccumulatedUsage()` reflects total input and output tokens from all turns
- **TC-5.4b: Cost accumulated across all turns**
  - Given: A tool-use conversation with cost reporting
  - When: Conversation completes
  - Then: `computeCost()` reflects total cost from all turns

### Technical Design
<!-- Jira: Technical Notes or sub-section of Description -->

```typescript
interface InferenceProvider {
  // Existing — unchanged
  infer<T>(request: InferenceRequest): Promise<EngineResult<InferenceResponse<T>>>;
  getAccumulatedUsage(): InferenceUsage;
  computeCost(): number | null;

  // New
  supportsToolUse(): boolean;
  inferWithTools(request: ToolUseRequest): Promise<EngineResult<ToolUseConversationResult>>;
}

interface ToolUseRequest {
  systemPrompt: string;
  userMessage: string;
  tools: ToolDefinition[];
  maxTurns?: number;
  model?: string;
}

interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

interface ToolUseConversationResult {
  finalText: string;
  toolCallCount: number;
  turnCount: number;
  usage: InferenceUsage;
  costUsd: number | null;
}
```

*See the tech design document for full architecture, implementation targets, and test mapping.*

### Definition of Done
<!-- Jira: Definition of Done or Acceptance Criteria footer -->

- [ ] `inferWithTools()` implemented for claude-sdk provider
- [ ] Multi-turn tool call loop handles tool requests and passes results back
- [ ] `supportsToolUse()` returns `true` for claude-sdk, `false` for others
- [ ] Unsupported providers return clear error from `inferWithTools()`
- [ ] Usage and cost tracking accumulates across all conversation turns
- [ ] Existing `infer()` callers compile and behave identically
- [ ] All tests pass
