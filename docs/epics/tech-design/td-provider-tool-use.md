# Technical Design: Provider Interface Extension for Tool Use

## Context

This companion document covers Flow 5 of the agentic module generation epic: extending the inference provider interface to support multi-turn tool-use conversations. It maps to AC-5.1 through AC-5.4, delivers as Story 2 in the epic's story breakdown, and produces work in Chunk 0 (foundation types) and Chunk 2 (provider implementation).

**Parent index:** `docs/epics/tech-design/index.md`
**Epic:** `docs/epics/agentic-module-generation.md`

The inference provider layer sits between the orchestration pipeline and the underlying LLM backends. Today, every pipeline stage that needs inference calls `provider.infer()` — a single-turn request/response pattern where the caller sends a system prompt and user message, optionally requests structured JSON output, and receives a typed result wrapped in `EngineResult<InferenceResponse<T>>`. Three providers implement this interface: `claude-sdk` (using the Claude Agent SDK's `query()` function), `claude-cli` (shelling out to the `claude` CLI), and `openrouter-http` (calling the OpenRouter chat completions API over HTTP).

The agentic module generation flow (Chunk 4, covered in `td-agent-runtime.md`) requires a different interaction pattern. Instead of one request yielding one structured response, the agent needs tools — the ability to read source files, write page sections, and report observations — executed during the model's conversation. The model calls these tools as needed, the system executes them and returns results, and the conversation continues until the model produces a final result.

### The Real SDK Surface

The Claude Agent SDK does **not** support caller-defined tool definitions passed directly to `query()`. The `tools` option on `query()` accepts either:
- `string[]` — names of built-in tools (e.g., `['Bash', 'Read', 'Edit']`)
- `{ type: 'preset'; preset: 'claude_code' }` — all default Claude Code tools
- `[]` — disable all built-in tools

Custom tools are supported through the **SDK MCP server** pattern. The SDK exports `createSdkMcpServer()` which creates an in-process MCP server that registers custom tool definitions with handler functions. These tools run in the same process as the caller — no external server needed. The SDK makes them available to the model alongside (or instead of) built-in tools.

The key types from the SDK:

```typescript
// From @anthropic-ai/claude-agent-sdk
type SdkMcpToolDefinition<Schema extends AnyZodRawShape> = {
  name: string;
  description: string;
  inputSchema: Schema;           // Zod schema (v3 or v4)
  annotations?: ToolAnnotations;
  handler: (args: InferShape<Schema>, extra: unknown) => Promise<CallToolResult>;
};

function createSdkMcpServer(options: {
  name: string;
  version?: string;
  tools?: Array<SdkMcpToolDefinition<any>>;
}): McpSdkServerConfigWithInstance;

// Convenience helper
function tool<Schema>(
  name: string,
  description: string,
  inputSchema: Schema,
  handler: (args: InferShape<Schema>, extra: unknown) => Promise<CallToolResult>,
  extras?: { annotations?: ToolAnnotations },
): SdkMcpToolDefinition<Schema>;
```

The `Query` object returned by `query()` is an `AsyncGenerator<SDKMessage, void>` with control methods:
- `interrupt(): Promise<void>` — stop the current query
- `close(): void` — forcefully terminate the underlying process

The `SDKResultMessage` on success carries:
- `result: string` — the model's final text
- `num_turns: number`
- `total_cost_usd: number`
- `usage: NonNullableUsage`
- `structured_output?: unknown`
- `duration_ms: number`

This means the tool execution loop is managed entirely by the SDK. The caller defines tool handlers, the SDK invokes them when the model requests tool use, and the caller receives the final result after all tool use is complete. The provider does not need to manage a turn-by-turn conversation loop or relay tool-use messages.

---

## High Altitude: Where Provider Extension Fits

The canonical pipeline order from the index doc places module generation after classification, strategy, and planning:

```
analysis -> component classification -> strategy -> planning -> archetype assignment -> generation
```

Provider extension is infrastructure that the generation stage consumes. It does not add a new pipeline stage; it widens the capability surface that an existing stage can use.

```
                                  +-----------------------+
                                  |  Module Generation    |
                                  |  (orchestration)      |
                                  +---+-------+-----------+
                                      |       |
                              agentic |       | one-shot
                              path    |       | path
                                      v       v
                          +-----------+--+ +--+-----------+
                          | inferWith    | | infer()      |
                          | Tools()      | | (existing)   |
                          +-----------+--+ +--+-----------+
                                      |       |
                          +-----------+-------+-----------+
                          |     InferenceProvider          |
                          |  (extended interface)          |
                          +-----------+-------+-----------+
                                      |       |
                  +-------------------+---+---+---+-------------------+
                  |                       |                           |
          +-------+-------+     +--------+--------+      +-----------+---------+
          | claude-sdk    |     | claude-cli      |      | openrouter-http     |
          | (tool-use OK) |     | (tool-use: no)  |      | (tool-use: no)      |
          +---------------+     +-----------------+      +---------------------+
```

The generation stage checks `provider.supportsToolUse()` before choosing its path. If tool use is available, it constructs a `ToolUseRequest` with tool definitions (as `SdkMcpToolDefinition[]`) and the provider handles everything — creating the MCP server, running the query, collecting the result. If tool use is unavailable, it falls back to the existing `infer()` one-shot path.

The provider's responsibility in tool-use mode is more complete than in one-shot mode but narrower than the previous design assumed. The provider creates an in-process MCP server from the tool definitions, passes it to `query()`, iterates the async generator for the result, and returns the final outcome. The provider does not manage the tool execution loop — the SDK does that by invoking the tool handlers directly. The caller (agent runtime) provides the tool handlers as part of the `SdkMcpToolDefinition[]` array.

This separation matters for testing. Provider tests verify that MCP server creation works, that the query runs with tools available, that the result is correctly extracted, and that unsupported providers return the right error code. Agent runtime tests verify that tool handler functions produce the right outputs for given inputs. The tool handlers are pure functions that the runtime defines and the provider passes through to the SDK.

---

## Medium Altitude: Module Architecture

### Files and Responsibilities

| File | Change Type | Responsibility |
|------|-------------|----------------|
| `src/inference/types.ts` | Modified | Gains `ToolUseRequest`, `ToolUseConversationResult` types. `InferenceProvider` interface gains `supportsToolUse()` and `inferWithTools()`. `InferenceProviderCapabilities` gains `supportsToolUse` boolean. |
| `src/inference/providers/claude-sdk.ts` | Modified | Implements `inferWithTools()` using `createSdkMcpServer()` and `query()`. Implements `supportsToolUse()` returning `true`. |
| `src/inference/providers/claude-cli.ts` | Modified | `inferWithTools()` returns `TOOL_USE_UNSUPPORTED`. `supportsToolUse()` returns `false`. |
| `src/inference/providers/openrouter-http.ts` | Modified | Same as claude-cli. |
| `src/inference/registry.ts` | Modified | Each provider's capabilities gains `supportsToolUse: true/false`. |
| `src/inference/shared.ts` | Modified | Gains `errToolUseUnsupported()` helper. |
| `src/types/common.ts` | Modified | `EngineErrorCode` union gains `"TOOL_USE_UNSUPPORTED"`. |
| `test/inference/providers.test.ts` | Modified | Extended with tool-use test cases. |

The key architectural choice: `inferWithTools()` receives `SdkMcpToolDefinition[]` — the same type the SDK uses. The provider does not define its own tool definition abstraction. This keeps the type boundary thin: the agent runtime constructs SDK-native tool definitions with handler functions, and the provider passes them straight through. No translation layer, no intermediate types.

The tradeoff is that the agent runtime imports from `@anthropic-ai/claude-agent-sdk` for the `SdkMcpToolDefinition` type and the `tool()` helper. This couples the runtime to the SDK at the type level but not at the implementation level — the runtime defines tool handlers using the SDK's type shape, but the provider is the only module that calls SDK functions. If the SDK's tool definition type changes, only the runtime's tool builder and the provider's MCP server creation need updating.

### Interaction with Existing Infrastructure

The provider extension preserves existing patterns without modification.

**Accumulator pattern.** The `SDKResultSuccess` message carries `total_cost_usd` and aggregate `usage` for the entire conversation, including all tool-use turns. The provider calls `accumulator.add()` once with the final result's values — the same pattern as one-shot `infer()`. No per-turn accumulation is needed because the SDK's result message is already aggregate.

**Auth environment pattern.** The `claude-sdk` provider uses `withClaudeSdkAuthEnv()` to set environment variables during a `query()` call. The `inferWithTools()` method uses the same wrapper.

**Error handling pattern.** All provider methods produce `EngineResult<T>`. For `inferWithTools()`, the result is wrapped in a `ToolUseHandle` — the `handle.result` promise resolves to `EngineResult<ToolUseConversationResult>`. Errors use `errInference()` for inference failures and `errToolUseUnsupported()` for capability mismatches. The caller awaits `handle.result` to get the `EngineResult`, and can call `handle.cancel()` to abort early.

---

## Medium Altitude: Flow Design

### Tool-Use Conversation Lifecycle

The `inferWithTools()` method manages a complete tool-use conversation. The caller provides SDK-native tool definitions (with handlers already attached); the provider creates an MCP server, runs the query, and returns the result.

```
Caller (agent runtime)                    Provider (claude-sdk)                    Claude SDK
     |                                         |                                      |
     |  inferWithTools(request)                |                                      |
     |  - systemPrompt                         |                                      |
     |  - userMessage                          |                                      |
     |  - tools: SdkMcpToolDefinition[]        |                                      |
     |  - maxTurns                             |                                      |
     |---------------------------------------->|                                      |
     |                                         |                                      |
     |                                         |  createSdkMcpServer({                |
     |                                         |    name: "docgen-agent",              |
     |                                         |    tools: request.tools               |
     |                                         |  })                                   |
     |                                         |------------------------------------->|
     |                                         |                                      |
     |                                         |  query({                             |
     |                                         |    options: {                         |
     |                                         |      tools: [],                       |  ← disable built-in tools
     |                                         |      mcpServers: { "docgen-agent": server },
     |                                         |      systemPrompt,                    |
     |                                         |      maxTurns,                        |
     |                                         |      permissionMode: "dontAsk"        |
     |                                         |    },                                 |
     |                                         |    prompt: userMessage                 |
     |                                         |  })                                   |
     |                                         |------------------------------------->|
     |                                         |                                      |
     |                                         |  SDK manages conversation internally: |
     |                                         |  - model requests tool_use            |
     |                                         |  - SDK calls handler() on tool def    |
     |                                         |  - handler returns CallToolResult     |
     |                                         |  - SDK sends result back to model     |
     |                                         |  - ... repeats until model is done    |
     |                                         |                                      |
     |                                         |  <-- async iterable yields messages   |
     |                                         |  ... (intermediate messages ignored)   |
     |                                         |                                      |
     |                                         |  SDKResultSuccess {                   |
     |                                         |    result, num_turns, usage,           |
     |                                         |    total_cost_usd, duration_ms         |
     |                                         |  }                                    |
     |                                         |<-------------------------------------|
     |                                         |                                      |
     |  EngineResult<ToolUseConversationResult>|                                      |
     |<----------------------------------------|                                      |
```

The critical insight: the provider does not manage a tool execution loop. The SDK does. The provider's job is to:
1. Create an MCP server from the tool definitions
2. Start a query with that server attached and built-in tools disabled
3. Iterate the async generator until the result message arrives
4. Extract usage, cost, and final text from the result
5. Return a `ToolUseConversationResult`

The tool handlers execute in-process when the SDK invokes them. They are synchronous from the provider's perspective — the SDK calls them, waits for the `Promise<CallToolResult>`, and continues the conversation. The provider never sees individual tool-use messages; it only sees the final result.

### Tool Call Counting

The `SDKResultSuccess` message includes `num_turns` but not a separate tool call count. To track tool calls, the agent runtime wraps each tool handler with a counter before passing the definitions to the provider:

```typescript
// In agent runtime, before calling inferWithTools:
let toolCallCount = 0;
const countedTools = tools.map(t => ({
  ...t,
  handler: async (args, extra) => {
    toolCallCount++;
    return t.handler(args, extra);
  },
}));
```

The provider does not need to count tool calls. It passes through whatever tool definitions it receives. The runtime tracks tool calls at the handler level because that's where the calls actually execute.

This means `ToolUseConversationResult` carries `turnCount` (from `SDKResultSuccess.num_turns`) but not `toolCallCount`. The caller (agent runtime) maintains its own tool call counter.

### Cancellation

The SDK's `Query` interface provides `interrupt()` and `close()` for stopping a running query. The agent runtime needs timeout enforcement (AC-4.5), which means it needs a way to stop the query externally.

The provider returns a handle alongside the result promise so the caller can cancel:

```typescript
interface ToolUseHandle {
  result: Promise<EngineResult<ToolUseConversationResult>>;
  cancel: () => void;
}
```

The `cancel()` function calls `query.close()` on the underlying SDK query. The result promise resolves with a failed `EngineResult` when cancellation occurs. The agent runtime uses this to implement timeout:

```typescript
const handle = provider.inferWithTools(request);
const timer = setTimeout(() => handle.cancel(), config.timeoutMs);
try {
  const result = await handle.result;
  // ... handle result
} finally {
  clearTimeout(timer);
}
```

This replaces the previous design's `AbortSignal` approach. `query.close()` is the SDK's native cancellation mechanism — it cleans up the subprocess, pending requests, and MCP transports. Using `AbortSignal` would have required the provider to bridge between the signal and the SDK's cancellation API, adding complexity without benefit.

### Unsupported Provider Path

For `claude-cli` and `openrouter-http`, `inferWithTools()` returns `TOOL_USE_UNSUPPORTED` immediately:

```typescript
inferWithTools(_request: ToolUseRequest): ToolUseHandle {
  return {
    result: Promise.resolve(errToolUseUnsupported("claude-cli")),
    cancel: () => {},
  };
}
```

### Usage Accumulation

The `SDKResultSuccess` message includes `total_cost_usd` and aggregate `usage` for the entire conversation. The provider calls `accumulator.add()` once with these values. This is identical to the one-shot `infer()` accumulation pattern — one call to `add()` per provider method invocation.

The accumulator does not know whether usage came from a one-shot call or a multi-turn conversation. It receives `{ usage, costUsd }` and adds to its totals. This is the right abstraction boundary.

---

## Low Altitude: Interface Definitions

### Extended InferenceProvider Interface (AC-5.1)

```typescript
// src/inference/types.ts — InferenceProvider gains two methods

export interface InferenceProvider {
  // Existing — unchanged (AC-5.1, TC-5.1a)
  infer<T>(request: InferenceRequest): Promise<EngineResult<InferenceResponse<T>>>;
  getAccumulatedUsage(): InferenceUsage;
  computeCost(): number | null;

  // New (AC-5.1, TC-5.1b)
  supportsToolUse(): boolean;
  inferWithTools(request: ToolUseRequest): ToolUseHandle;
}
```

`supportsToolUse()` is synchronous — the provider knows at construction time whether it supports tool use. `inferWithTools()` returns a `ToolUseHandle` (not a Promise) so the caller can access both the result promise and the cancel function.

### ToolUseRequest (AC-5.1, AC-5.2)

```typescript
// src/inference/types.ts
import type { SdkMcpToolDefinition } from "@anthropic-ai/claude-agent-sdk";

export interface ToolUseRequest {
  systemPrompt: string;
  userMessage: string;
  tools: SdkMcpToolDefinition<any>[];
  maxTurns?: number;
  model?: string;
}
```

`ToolUseRequest` takes `SdkMcpToolDefinition[]` directly — the SDK's native tool definition type. Each definition includes `name`, `description`, `inputSchema` (Zod), and `handler`. The provider passes these to `createSdkMcpServer()` without transformation.

There is no `toolExecutor` callback. The executor logic is embedded in each tool definition's `handler` function. The agent runtime constructs the tool definitions with handlers that dispatch to `executeReadSource`, `executeWriteSection`, and `executeReportObservation`. The provider never sees the dispatch logic.

### ToolUseHandle (AC-5.4, AC-4.5)

```typescript
// src/inference/types.ts

export interface ToolUseHandle {
  /** Promise that resolves when the conversation completes or is cancelled. */
  result: Promise<EngineResult<ToolUseConversationResult>>;
  /** Cancel the running conversation. Calls query.close() on the SDK. */
  cancel: () => void;
}
```

### ToolUseConversationResult (AC-5.4)

```typescript
// src/inference/types.ts

export interface ToolUseConversationResult {
  /** The model's final text after all tool use is complete. */
  finalText: string;
  /** Number of conversation turns (from SDK's num_turns). */
  turnCount: number;
  /** Total duration of the conversation in milliseconds. */
  durationMs: number;
  /** Aggregate usage across all turns. */
  usage: InferenceUsage | null;
  /** Aggregate cost across all turns. */
  costUsd: number | null;
}
```

Note: no `toolCallCount` here. Tool call counting is the agent runtime's responsibility — it wraps handlers with counters (see td-agent-runtime.md). The provider only reports what the SDK provides: turn count, usage, and cost.

### Extended InferenceProviderCapabilities (AC-5.1, AC-5.3)

```typescript
// src/inference/types.ts

export interface InferenceProviderCapabilities {
  authModes: readonly InferenceAuthMode[];
  supportsModelSelection: boolean;
  supportsStructuredOutput: boolean;
  reportsUsage: boolean;
  reportsCost: boolean;
  supportsToolUse: boolean;  // NEW
}
```

### Extended EngineErrorCode (Chunk 0 foundation)

```typescript
// src/types/common.ts

export type EngineErrorCode =
  | "ENVIRONMENT_ERROR"
  | "DEPENDENCY_MISSING"
  | "ANALYSIS_ERROR"
  | "METADATA_ERROR"
  | "VALIDATION_ERROR"
  | "CONFIGURATION_ERROR"
  | "ORCHESTRATION_ERROR"
  | "PATH_ERROR"
  | "PUBLISH_ERROR"
  // New error codes for agentic generation (Chunk 0)
  | "TOOL_USE_UNSUPPORTED"
  | "CLASSIFICATION_ERROR"
  | "STRATEGY_ERROR"
  | "AGENT_ERROR";
```

### Error Helper (AC-5.3)

```typescript
// src/inference/shared.ts

export const errToolUseUnsupported = (
  providerId: string,
): EngineResult<never> =>
  err(
    "TOOL_USE_UNSUPPORTED",
    `Provider "${providerId}" does not support tool-use conversations. ` +
    `Use a provider with tool-use support (e.g., claude-sdk) for agentic generation, ` +
    `or the system will fall back to one-shot generation.`,
    { providerId },
  );
```

### Registry Updates

```typescript
// src/inference/registry.ts

"claude-sdk": {
  capabilities: {
    authModes: ["env", "api-key", "oauth"],
    reportsCost: true,
    reportsUsage: true,
    supportsModelSelection: true,
    supportsStructuredOutput: true,
    supportsToolUse: true,       // NEW
  },
},

"claude-cli": {
  capabilities: {
    // ... existing fields unchanged
    supportsToolUse: false,      // NEW
  },
},

"openrouter-http": {
  capabilities: {
    // ... existing fields unchanged
    supportsToolUse: false,      // NEW
  },
},
```

---

## Claude SDK Provider: inferWithTools Implementation

The implementation outline:

```typescript
// src/inference/providers/claude-sdk.ts — new method on the returned provider object

inferWithTools(request: ToolUseRequest): ToolUseHandle {
  let queryInstance: Query | null = null;

  const resultPromise = (async (): Promise<EngineResult<ToolUseConversationResult>> => {
    try {
      const sdk = await loadClaudeAgentSdk();
      const mcpServer = sdk.createSdkMcpServer({
        name: "docgen-agent",
        tools: request.tools,
      });

      let finalResult: SDKResultSuccess | null = null;

      await withClaudeSdkAuthEnv(auth, async () => {
        queryInstance = sdk.query({
          options: {
            cwd: options.workingDirectory,
            maxTurns: request.maxTurns ?? 15,
            model: request.model ?? config.model,
            permissionMode: "dontAsk",
            systemPrompt: request.systemPrompt,
            tools: [],                              // disable built-in tools
            mcpServers: {
              "docgen-agent": mcpServer,
            },
          },
          prompt: request.userMessage,
        });

        for await (const message of queryInstance) {
          const sdkMessage = message as SDKMessage;
          if (sdkMessage.type === "result" && sdkMessage.subtype === "success") {
            finalResult = sdkMessage as SDKResultSuccess;
          }
        }
      });

      if (finalResult === null) {
        return errInference(
          "Claude Agent SDK tool-use query completed without a final result message",
        );
      }

      const usage = extractUsage(finalResult.usage);
      const costUsd = extractCost(finalResult.total_cost_usd);
      accumulator.add({ costUsd, usage });

      return {
        ok: true,
        value: {
          costUsd,
          durationMs: finalResult.duration_ms,
          finalText: finalResult.result ?? "",
          turnCount: finalResult.num_turns,
          usage,
        },
      };
    } catch (error) {
      if (error instanceof sdk.AbortError) {
        return errInference("Tool-use query was cancelled", { cancelled: true });
      }
      return errInference("Claude Agent SDK tool-use query failed unexpectedly", {
        cause: getErrorMessage(error),
      });
    }
  })();

  return {
    result: resultPromise,
    cancel: () => {
      queryInstance?.close();
    },
  };
}
```

Key details:

**MCP server creation.** `createSdkMcpServer()` takes the tool definitions directly. The tools' `handler` functions run in-process when the SDK invokes them. No external server, no network, no serialization overhead.

**Built-in tools disabled.** `tools: []` disables all built-in Claude Code tools (Bash, Read, Edit, etc.). The agent only has access to the three tools we define. This is a security boundary — the agent cannot execute arbitrary commands or modify files outside our sandboxed `read_source` tool.

**`permissionMode: "dontAsk"`.** Same as the existing `infer()` implementation. The agent's tools run without permission prompts because the tool handlers enforce their own safety (sandbox checking in `read_source`, fire-and-forget in `report_observation`).

**Cancellation via `query.close()`.** The `cancel()` function captures the `queryInstance` reference and calls `close()` on it. This forcefully terminates the SDK subprocess and all pending work. The `for await` loop will throw, which the catch block handles.

**Result extraction reuses existing helpers.** `extractUsage()` and `extractCost()` are the same functions used by the one-shot `infer()` method.

---

## TC to Test Mapping

### AC-5.1: Interface Extension Without Breaking Existing Callers

| TC | Test Description | Test Location | Type |
|----|-----------------|---------------|------|
| TC-5.1a | Existing `infer()` callers compile and behave identically | `test/inference/providers.test.ts` | Existing tests pass unchanged |
| TC-5.1b | `inferWithTools()` and `supportsToolUse()` exist on all providers | `test/inference/providers.test.ts` | Unit test per provider |

### AC-5.2: Claude SDK Provider Implements Tool Use Correctly

| TC | Test Description | Test Location | Type |
|----|-----------------|---------------|------|
| TC-5.2a | Claude SDK handles tool-use conversation and returns final output | `test/inference/providers.test.ts` | Integration with mocked SDK |
| TC-5.2b | Tool handlers are invoked by the SDK when model requests tool use | `test/inference/providers.test.ts` | Integration with mocked SDK |

**TC-5.2a detail:** Mock `createSdkMcpServer` and `query()`. Provide a tool definition with a mock handler. Mock the query to yield a `SDKResultSuccess` with `num_turns: 3`, known usage, and cost. Verify `inferWithTools()` returns `ok: true` with correct `turnCount`, `finalText`, usage, and cost.

**TC-5.2b detail:** Provide a tool definition whose handler records calls. Mock the SDK to invoke the handler during query iteration. After `inferWithTools()` completes, verify the handler was called with expected arguments.

Additional edge case tests:

| Test Description | Type |
|-----------------|------|
| Returns error when SDK query yields no result message | Unit |
| Returns error when SDK result has error subtype | Unit |
| Tool handler errors are surfaced as `CallToolResult` with `isError: true` | Unit |
| `maxTurns` parameter passes through to SDK query options | Unit |
| MCP server created with correct tool definitions | Unit |
| Built-in tools disabled (`tools: []` in query options) | Unit |

### AC-5.3: Unsupported Providers Report Cleanly

| TC | Test Description | Test Location | Type |
|----|-----------------|---------------|------|
| TC-5.3a | OpenRouter returns `TOOL_USE_UNSUPPORTED` from `inferWithTools()` | `test/inference/providers.test.ts` | Unit |
| TC-5.3b | Module generation falls back to one-shot for unsupported providers | `test/orchestration/module-generation.test.ts` | Integration (Chunk 4/5) |

### AC-5.4: Usage and Cost Tracking Across Multi-Turn Conversations

| TC | Test Description | Test Location | Type |
|----|-----------------|---------------|------|
| TC-5.4a | Token usage accumulated from final SDK result | `test/inference/providers.test.ts` | Integration with mocked SDK |
| TC-5.4b | Cost accumulated from final SDK result | `test/inference/providers.test.ts` | Integration with mocked SDK |

Additional:

| Test Description | Type |
|-----------------|------|
| Usage is null when SDK result doesn't include usage fields | Unit |
| Multiple `inferWithTools()` calls accumulate correctly | Unit |
| Mixed `infer()` + `inferWithTools()` calls accumulate into same totals | Unit |

### Cancellation Tests

| Test Description | Type |
|-----------------|------|
| `cancel()` calls `query.close()` and result resolves with error | Unit |
| `cancel()` before query starts is a no-op | Unit |

### Test Count Estimate

| Category | Count |
|----------|-------|
| TC-5.1 (interface, backward compat) | 4 |
| TC-5.2 (Claude SDK tool-use + edge cases) | 8 |
| TC-5.3 (unsupported provider errors) | 3 |
| TC-5.4 (usage/cost accumulation) | 5 |
| Cancellation | 2 |
| **Total** | **~22** |

---

## Chunk Breakdown

### Chunk 0: Foundation Types (shared with all companion docs)

Provider-relevant items:

| Item | File | Description |
|------|------|-------------|
| `ToolUseRequest` type | `src/inference/types.ts` | Request shape referencing `SdkMcpToolDefinition[]` |
| `ToolUseHandle` type | `src/inference/types.ts` | Result promise + cancel function |
| `ToolUseConversationResult` type | `src/inference/types.ts` | Conversation result with turn count and usage |
| `supportsToolUse: boolean` on capabilities | `src/inference/types.ts` | Static capability flag |
| `supportsToolUse()` and `inferWithTools()` on interface | `src/inference/types.ts` | Method signatures |
| `TOOL_USE_UNSUPPORTED` error code | `src/types/common.ts` | Added to `EngineErrorCode` union |
| `errToolUseUnsupported()` helper | `src/inference/shared.ts` | Produces typed error |
| Stub implementations | All three providers | `supportsToolUse()` returns `false`; `inferWithTools()` returns `TOOL_USE_UNSUPPORTED` |

**Chunk 0 verification:** `npm run red-verify`. All existing tests pass unchanged.

### Chunk 2: Provider Tool-Use Implementation

**Prerequisite:** Chunk 0.
**Parallel with:** Chunk 1 (classification).

| Item | File | Description |
|------|------|-------------|
| `inferWithTools()` implementation | `src/inference/providers/claude-sdk.ts` | MCP server creation + query with tools |
| `supportsToolUse()` returns `true` | `src/inference/providers/claude-sdk.ts` | Capability flag |
| `supportsToolUse: true` in registry | `src/inference/registry.ts` | Static declaration |
| Tool-use tests | `test/inference/providers.test.ts` | ~22 tests |

**Implementation sequence:**

1. Add `supportsToolUse: true` to claude-sdk registry entry.
2. Write tests for TC-5.3a (unsupported providers). They pass against stubs.
3. Write tests for TC-5.1b (method existence). They pass against stubs.
4. Write tests for TC-5.2a/b (tool-use conversation). They fail — red phase.
5. Implement `inferWithTools()` in claude-sdk.ts. Tests go green.
6. Write tests for TC-5.4a/b (accumulation) and cancellation. Adjust as needed.
7. Full verification: `npm run verify`.

**Chunk 2 verification:** `npm run verify`. All existing + ~22 new tests pass.

---

## Design Risks and Mitigations

**Risk: SDK MCP server API stability.** `createSdkMcpServer()` is a public export but the SDK is pre-1.0. The API surface may change. Mitigation: the MCP server creation is isolated in one function within the claude-sdk provider. If the API changes, only that function updates.

**Risk: In-process tool handler performance.** Tool handlers run in the same process as the SDK's subprocess communication. A slow `read_source` handler (large file read) blocks the conversation. Mitigation: `read_source` caps at 2000 lines (designed in td-agent-runtime.md), and file I/O is fast for files under that size. If performance becomes an issue, handlers can be made non-blocking via worker threads, but this is not expected to be necessary.

**Risk: `query.close()` cleanup completeness.** The SDK documentation says `close()` "forcefully ends the query, cleaning up all resources including pending requests, MCP transports, and the CLI subprocess." If cleanup is incomplete (orphaned processes), the runtime's timeout path may leak resources. Mitigation: the test suite for cancellation verifies that no pending promises remain after `cancel()`. In production, the per-module timeout is a safety cap, not the normal path — most modules complete well within the budget.

---

## Cross-References

| Topic | Document |
|-------|----------|
| How the agent runtime constructs tool definitions and handlers | `td-agent-runtime.md` (Chunk 4) |
| How module generation routes between agentic and one-shot paths | `td-degradation-cleanup.md` (Chunk 5) |
| Classification types shipped in Chunk 0 alongside provider types | `td-strategy-classification.md` (Chunk 0, 1) |
| Error codes and `EngineResult<T>` pattern | `index.md` (Cross-Cutting Decisions) |
| Timeout enforcement using `ToolUseHandle.cancel()` | `td-agent-runtime.md` (AC-4.5) |

---

## Self-Review Checklist

- [x] All four ACs (5.1-5.4) have interface definitions with AC references
- [x] Every TC has a test description, location, and type
- [x] Test count estimate provided (~22 tests)
- [x] Chunk 0 and Chunk 2 breakdown with verification gates
- [x] Implementation sequence within Chunk 2 follows TDD
- [x] Error handling uses existing `EngineResult<T>` pattern with new error code
- [x] Accumulator behavior specified (final-only from SDK result)
- [x] SDK integration based on actual `createSdkMcpServer()` + `SdkMcpToolDefinition` API
- [x] Cancellation uses SDK-native `query.close()`, not `AbortSignal`
- [x] No mutations to files outside the inference layer (except Chunk 0 `common.ts`)
- [x] Risks identified with mitigations
- [x] Copy-paste ready TypeScript interfaces
