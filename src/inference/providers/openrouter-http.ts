import { getErrorMessage } from "../../errors.js";
import { resolveInferenceAuth } from "../auth.js";
import { getProviderDefinition } from "../registry.js";
import {
  createAccumulator,
  errInference,
  errToolUseUnsupported,
  extractJsonCandidate,
  okInference,
} from "../shared.js";
import type {
  InferenceProvider,
  InferenceRequest,
  ResolvedInferenceConfiguration,
  ToolUseHandle,
  ToolUseRequest,
} from "../types.js";

interface OpenRouterChatResponse {
  choices?: Array<{
    message?: {
      content?: string | Array<{ text?: string; type?: string }>;
    };
  }>;
  error?: {
    message?: string;
  };
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
}

const OPENROUTER_API_BASE_URL = "https://openrouter.ai/api/v1";

export const createOpenRouterHttpProvider = (
  config: ResolvedInferenceConfiguration,
): InferenceProvider => {
  const accumulator = createAccumulator();
  const auth = resolveInferenceAuth(
    config.auth,
    getProviderDefinition("openrouter-http").defaultApiKeyEnvVar,
  );

  return {
    computeCost() {
      return accumulator.computeCost();
    },

    getAccumulatedUsage() {
      return accumulator.getAccumulatedUsage();
    },

    supportsToolUse(): boolean {
      return false;
    },

    inferWithTools(_request: ToolUseRequest): ToolUseHandle {
      return {
        result: Promise.resolve(errToolUseUnsupported("openrouter-http")),
        cancel: () => {},
      };
    },

    async infer<T>(request: InferenceRequest) {
      const apiKey = auth.apiKey;

      if (!apiKey) {
        return errInference(
          "OpenRouter API key is required for HTTP inference",
        );
      }

      try {
        const response = await fetch(
          `${OPENROUTER_API_BASE_URL}/chat/completions`,
          {
            body: JSON.stringify({
              messages: [
                { content: request.systemPrompt, role: "system" },
                { content: buildPrompt(request), role: "user" },
              ],
              model: request.model ?? config.model,
              stream: false,
            }),
            headers: {
              Authorization: `Bearer ${apiKey}`,
              "Content-Type": "application/json",
            },
            method: "POST",
          },
        );

        if (!response.ok) {
          const responseText = await response.text();
          return errInference("OpenRouter HTTP inference failed", {
            responseBody: responseText,
            status: response.status,
            statusText: response.statusText,
          });
        }

        const parsed = (await response.json()) as OpenRouterChatResponse;

        if (parsed.error?.message) {
          return errInference("OpenRouter HTTP inference failed", {
            responseBody: parsed,
          });
        }

        const content = getMessageContent(parsed);
        const output =
          request.outputSchema !== undefined
            ? extractJsonCandidate(content)
            : content;

        if (request.outputSchema !== undefined && output === undefined) {
          return errInference(
            "OpenRouter returned no structured output for the requested schema",
            {
              responseBody: parsed,
            },
          );
        }

        const usage = extractUsage(parsed.usage);
        accumulator.add({ costUsd: null, usage });

        return okInference({
          costUsd: null,
          output: output as T,
          usage,
        });
      } catch (error) {
        return errInference("OpenRouter HTTP inference failed unexpectedly", {
          cause: getErrorMessage(error),
        });
      }
    },
  };
};

const extractUsage = (
  usage: OpenRouterChatResponse["usage"],
): { inputTokens: number; outputTokens: number } | null => {
  if (
    !usage ||
    typeof usage.prompt_tokens !== "number" ||
    typeof usage.completion_tokens !== "number"
  ) {
    return null;
  }

  return {
    inputTokens: usage.prompt_tokens,
    outputTokens: usage.completion_tokens,
  };
};

const getMessageContent = (response: OpenRouterChatResponse): string => {
  const content = response.choices?.[0]?.message?.content;

  if (typeof content === "string") {
    return content;
  }

  if (Array.isArray(content)) {
    return content
      .map((part) => (typeof part.text === "string" ? part.text : ""))
      .join("");
  }

  return "";
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
