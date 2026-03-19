import { createRequire } from "node:module";

import { getErrorMessage } from "../../errors.js";
import type { EngineResult } from "../../types/common.js";
import { resolveInferenceAuth } from "../auth.js";
import { getProviderDefinition } from "../registry.js";
import {
  createAccumulator,
  errInference,
  extractJsonCandidate,
  okInference,
} from "../shared.js";
import type {
  InferenceProvider,
  InferenceRequest,
  ResolvedInferenceConfiguration,
  ToolUseConversationResult,
  ToolUseHandle,
  ToolUseRequest,
} from "../types.js";

interface ClaudeSdkResultMessage {
  subtype: string;
  result: string;
  structured_output?: unknown;
  usage: Record<string, unknown>;
  total_cost_usd?: number;
  stop_reason?: string;
  errors?: string[];
  num_turns?: number;
  duration_ms?: number;
}

interface SdkQueryInstance extends AsyncIterable<unknown> {
  close(): void;
}

const CLAUDE_AGENT_SDK_MODULE = "@anthropic-ai/claude-agent-sdk";
const require = createRequire(import.meta.url);

export const createClaudeSdkProvider = (
  config: ResolvedInferenceConfiguration,
  options: { workingDirectory: string },
): InferenceProvider => {
  const accumulator = createAccumulator();
  const auth = resolveInferenceAuth(
    config.auth,
    getProviderDefinition("claude-sdk").defaultApiKeyEnvVar,
  );

  return {
    computeCost() {
      return accumulator.computeCost();
    },

    getAccumulatedUsage() {
      return accumulator.getAccumulatedUsage();
    },

    supportsToolUse(): boolean {
      return true;
    },

    inferWithTools(request: ToolUseRequest): ToolUseHandle {
      let queryInstance: SdkQueryInstance | null = null;
      let cancelled = false;

      const resultPromise = (async (): Promise<
        EngineResult<ToolUseConversationResult>
      > => {
        try {
          const sdk = await loadClaudeAgentSdk();
          const mcpServer = sdk.createSdkMcpServer({
            name: "docgen-agent",
            tools: request.tools,
          });

          let finalResult: ClaudeSdkResultMessage | null = null;

          await withClaudeSdkAuthEnv(auth, async () => {
            queryInstance = sdk.query({
              options: {
                cwd: options.workingDirectory,
                maxTurns: request.maxTurns ?? 15,
                model: request.model ?? config.model,
                permissionMode: "dontAsk",
                systemPrompt: request.systemPrompt,
                tools: [],
                mcpServers: {
                  "docgen-agent": mcpServer,
                },
              },
              prompt: request.userMessage,
            }) as SdkQueryInstance;

            for await (const message of queryInstance) {
              const sdkMessage = message as {
                type?: string;
              } & ClaudeSdkResultMessage;

              if (
                sdkMessage.type === "result" &&
                sdkMessage.subtype === "success"
              ) {
                finalResult = sdkMessage;
              }
            }
          });

          if (finalResult === null) {
            return errInference(
              "Claude Agent SDK tool-use query completed without a final result message",
            );
          }

          const resultMessage: ClaudeSdkResultMessage = finalResult;
          const usage = extractUsage(resultMessage.usage);
          const costUsd = extractCost(resultMessage.total_cost_usd);
          accumulator.add({ costUsd, usage });

          return {
            ok: true as const,
            value: {
              costUsd,
              durationMs: resultMessage.duration_ms ?? 0,
              finalText: resultMessage.result ?? "",
              turnCount: resultMessage.num_turns ?? 0,
              usage,
            },
          };
        } catch (error) {
          if (cancelled) {
            return errInference("Tool-use query was cancelled", {
              cancelled: true,
            });
          }
          return errInference(
            "Claude Agent SDK tool-use query failed unexpectedly",
            { cause: getErrorMessage(error) },
          );
        }
      })();

      return {
        result: resultPromise,
        cancel: () => {
          cancelled = true;
          queryInstance?.close();
        },
      };
    },

    async infer<T>(request: InferenceRequest) {
      try {
        const sdk = await loadClaudeAgentSdk();
        const query = sdk.query;
        let finalResult: ClaudeSdkResultMessage | null = null;

        await withClaudeSdkAuthEnv(auth, async () => {
          for await (const message of query({
            options: {
              cwd: options.workingDirectory,
              maxTurns: 3,
              model: request.model ?? config.model,
              outputFormat: request.outputSchema
                ? {
                    schema: request.outputSchema,
                    type: "json_schema",
                  }
                : undefined,
              permissionMode: "dontAsk",
              systemPrompt: request.systemPrompt,
              tools: [],
            },
            prompt: buildPrompt(request),
          })) {
            const sdkMessage = message as {
              type?: string;
            } & ClaudeSdkResultMessage;

            if (sdkMessage.type === "result") {
              finalResult = sdkMessage;
            }
          }
        });

        if (finalResult === null) {
          return errInference(
            "Claude Agent SDK query completed without a final result message",
          );
        }

        const resultMessage: ClaudeSdkResultMessage = finalResult;

        if (resultMessage.subtype !== "success") {
          return errInference(
            resultMessage.errors?.[0] ??
              `Claude Agent SDK execution failed with result subtype "${resultMessage.subtype}"`,
            {
              errors: resultMessage.errors,
              stopReason: resultMessage.stop_reason,
              subtype: resultMessage.subtype,
            },
          );
        }

        const output =
          request.outputSchema !== undefined
            ? (resultMessage.structured_output ??
              extractJsonCandidate(resultMessage.result))
            : resultMessage.result;

        if (request.outputSchema !== undefined && output === undefined) {
          return errInference(
            "Claude Agent SDK returned no structured output for the requested schema",
            {
              rawResult: resultMessage.result,
              stopReason: resultMessage.stop_reason,
            },
          );
        }

        const usage = extractUsage(resultMessage.usage);
        const costUsd = extractCost(resultMessage.total_cost_usd);
        accumulator.add({ costUsd, usage });

        return okInference({
          costUsd,
          output: output as T,
          usage,
        });
      } catch (error) {
        return errInference("Claude Agent SDK query failed unexpectedly", {
          cause: getErrorMessage(error),
        });
      }
    },
  };
};

export const isClaudeAgentSdkAvailable = (): boolean => {
  try {
    require.resolve(CLAUDE_AGENT_SDK_MODULE);
    return true;
  } catch {
    return false;
  }
};

const loadClaudeAgentSdk = async (): Promise<{
  query: (params: unknown) => AsyncIterable<unknown>;
  createSdkMcpServer: (options: { name: string; tools: unknown[] }) => unknown;
}> => {
  try {
    const moduleName = CLAUDE_AGENT_SDK_MODULE;
    return (await import(moduleName)) as {
      query: (params: unknown) => AsyncIterable<unknown>;
      createSdkMcpServer: (options: {
        name: string;
        tools: unknown[];
      }) => unknown;
    };
  } catch (error) {
    throw new Error(
      `Claude Agent SDK is not available: ${getErrorMessage(error)}`,
    );
  }
};

const buildPrompt = (request: InferenceRequest): string => {
  if (!request.outputSchema) {
    return request.userMessage;
  }

  return [
    request.userMessage,
    "",
    "Return only valid JSON that matches the requested schema exactly.",
    "Do not include markdown fences, prose, labels, or explanatory text.",
    "If a field contains markdown content, place that markdown inside the JSON string value.",
    "",
    "Requested JSON schema:",
    JSON.stringify(request.outputSchema, null, 2),
  ].join("\n");
};

const extractUsage = (
  usage: Record<string, unknown>,
): { inputTokens: number; outputTokens: number } | null => {
  const inputTokens = usage.inputTokens ?? usage.input_tokens;
  const outputTokens = usage.outputTokens ?? usage.output_tokens;

  if (typeof inputTokens !== "number" || typeof outputTokens !== "number") {
    return null;
  }

  return {
    inputTokens,
    outputTokens,
  };
};

const extractCost = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) ? value : null;

const withClaudeSdkAuthEnv = async (
  auth: ReturnType<typeof resolveInferenceAuth>,
  callback: () => Promise<void>,
): Promise<void> => {
  if (
    auth.mode !== "env" &&
    !(auth.mode === "api-key" && auth.apiKey && auth.apiKeyEnvVar)
  ) {
    await callback();
    return;
  }

  if (!auth.apiKeyEnvVar || !auth.apiKey) {
    await callback();
    return;
  }

  const previousValue = process.env[auth.apiKeyEnvVar];
  process.env[auth.apiKeyEnvVar] = auth.apiKey;

  try {
    await callback();
  } finally {
    if (previousValue === undefined) {
      delete process.env[auth.apiKeyEnvVar];
    } else {
      process.env[auth.apiKeyEnvVar] = previousValue;
    }
  }
};
