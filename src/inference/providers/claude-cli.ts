import { runSubprocess } from "../../adapters/subprocess.js";
import { getErrorMessage } from "../../errors.js";
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
} from "../types.js";

interface ClaudeCliResultEnvelope {
  subtype?: string;
  result?: string;
  structured_output?: unknown;
  usage?: Record<string, unknown>;
  total_cost_usd?: number;
}

export const createClaudeCliProvider = (
  config: ResolvedInferenceConfiguration,
  options: { workingDirectory: string },
): InferenceProvider => {
  const accumulator = createAccumulator();
  const auth = resolveInferenceAuth(
    config.auth,
    getProviderDefinition("claude-cli").defaultApiKeyEnvVar,
  );

  return {
    computeCost() {
      return accumulator.computeCost();
    },

    getAccumulatedUsage() {
      return accumulator.getAccumulatedUsage();
    },

    async infer<T>(request: InferenceRequest) {
      const args = [
        "-p",
        "--output-format",
        "json",
        "--permission-mode",
        "dontAsk",
        "--system-prompt",
        request.systemPrompt,
      ];

      if (request.model) {
        args.push("--model", request.model);
      } else if (config.model) {
        args.push("--model", config.model);
      }

      if (request.outputSchema) {
        args.push("--json-schema", JSON.stringify(request.outputSchema));
      }

      args.push(buildPrompt(request));

      try {
        const result = await runSubprocess("claude", args, {
          cwd: options.workingDirectory,
          env: buildClaudeCliEnv(auth),
          timeoutMs: 300_000,
        });

        if (result.exitCode !== 0) {
          return errInference("Claude CLI inference failed", {
            exitCode: result.exitCode,
            stderr: result.stderr.trim() || undefined,
            stdout: result.stdout.trim() || undefined,
          });
        }

        const parsedEnvelope = parseCliResult(result.stdout);

        if (!parsedEnvelope.ok) {
          return parsedEnvelope;
        }

        if (parsedEnvelope.value.subtype !== "success") {
          return errInference("Claude CLI returned a non-success result", {
            rawResult: parsedEnvelope.value,
          });
        }

        const output =
          request.outputSchema !== undefined
            ? (parsedEnvelope.value.structured_output ??
              extractJsonCandidate(parsedEnvelope.value.result ?? ""))
            : (parsedEnvelope.value.result ?? "").trim();

        if (request.outputSchema !== undefined && output === undefined) {
          return errInference(
            "Claude CLI returned no structured output for the requested schema",
            {
              rawResult: parsedEnvelope.value,
            },
          );
        }

        const usage = extractUsage(parsedEnvelope.value.usage);
        const costUsd = extractCost(parsedEnvelope.value.total_cost_usd);
        accumulator.add({ costUsd, usage });

        return okInference({
          costUsd,
          output: output as T,
          usage,
        });
      } catch (error) {
        return errInference("Claude CLI inference failed unexpectedly", {
          cause: getErrorMessage(error),
        });
      }
    },
  };
};

const parseCliResult = (
  stdout: string,
):
  | { ok: true; value: ClaudeCliResultEnvelope }
  | ReturnType<typeof errInference> => {
  try {
    return {
      ok: true,
      value: JSON.parse(stdout) as ClaudeCliResultEnvelope,
    };
  } catch (error) {
    return errInference("Claude CLI returned invalid JSON output", {
      cause: getErrorMessage(error),
      stdout: stdout.trim(),
    });
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

const buildClaudeCliEnv = (
  auth: ReturnType<typeof resolveInferenceAuth>,
): NodeJS.ProcessEnv => {
  const env = { ...process.env };

  if (
    (auth.mode === "env" || auth.mode === "api-key") &&
    auth.apiKey &&
    auth.apiKeyEnvVar
  ) {
    env[auth.apiKeyEnvVar] = auth.apiKey;
  }

  return env;
};

const extractUsage = (
  value: Record<string, unknown> | undefined,
): { inputTokens: number; outputTokens: number } | null => {
  if (!value) {
    return null;
  }

  const inputTokens = value.input_tokens;
  const outputTokens = value.output_tokens;

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
