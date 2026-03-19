import type {
  InferenceProvider,
  InferenceRequest,
  InferenceResponse,
  InferenceUsage,
} from "../../src/inference/index.js";
import type { EngineError, EngineResult } from "../../src/types/common.js";
import type {
  ModuleGenerationResult,
  OverviewGenerationResult,
} from "../../src/types/generation.js";
import type { ModulePlan } from "../../src/types/planning.js";
import type { ReviewFilePatch } from "../../src/types/quality-review.js";

interface MockResponse<T> {
  output: T;
  usage?: InferenceUsage;
}

export interface MockInferenceProvider extends InferenceProvider {
  query<T>(
    options: InferenceRequest,
  ): Promise<EngineResult<InferenceResponse<T>>>;
}

export interface MockSDKConfig {
  clustering?: MockResponse<ModulePlan>;
  moduleGeneration?:
    | MockResponse<ModuleGenerationResult>
    | MockResponse<ModuleGenerationResult>[];
  overview?: MockResponse<OverviewGenerationResult>;
  qualityReview?: MockResponse<ReviewFilePatch[]>;
  globalError?: EngineError;
  callOverrides?: Record<number, MockResponse<unknown> | EngineError>;
}

type QueryKind =
  | "clustering"
  | "module-generation"
  | "overview"
  | "quality-review";

const MOCK_INPUT_TOKEN_RATE_USD = 0.000003;
const MOCK_OUTPUT_TOKEN_RATE_USD = 0.000015;

export const createMockSDK = (config: MockSDKConfig): MockInferenceProvider => {
  let callCount = 0;
  let moduleGenerationCallCount = 0;
  let hasMissingUsage = false;
  const accumulatedUsage: InferenceUsage = {
    inputTokens: 0,
    outputTokens: 0,
  };

  const query = async <T>(
    options: InferenceRequest,
  ): Promise<EngineResult<InferenceResponse<T>>> => {
    const callIndex = callCount++;
    const override = config.callOverrides?.[callIndex];
    const configuredResponse =
      override ?? config.globalError ?? getConfiguredResponse(options);

    if (!configuredResponse) {
      return {
        ok: false,
        error: {
          code: "ORCHESTRATION_ERROR",
          message: `No mock response configured for inference provider call ${callIndex}`,
          details: {
            callIndex,
            detectedKind: detectQueryKind(options),
          },
        },
      };
    }

    if (isEngineError(configuredResponse)) {
      return {
        ok: false,
        error: configuredResponse,
      };
    }

    const usage = configuredResponse.usage ?? null;

    if (usage) {
      accumulatedUsage.inputTokens += usage.inputTokens;
      accumulatedUsage.outputTokens += usage.outputTokens;
    } else {
      hasMissingUsage = true;
    }

    return {
      ok: true,
      value: {
        costUsd: usage
          ? Number(
              (
                usage.inputTokens * MOCK_INPUT_TOKEN_RATE_USD +
                usage.outputTokens * MOCK_OUTPUT_TOKEN_RATE_USD
              ).toFixed(6),
            )
          : null,
        output: configuredResponse.output as T,
        usage,
      },
    };
  };

  const provider: MockInferenceProvider = {
    computeCost(): number | null {
      if (hasMissingUsage) {
        return null;
      }

      const cost =
        accumulatedUsage.inputTokens * MOCK_INPUT_TOKEN_RATE_USD +
        accumulatedUsage.outputTokens * MOCK_OUTPUT_TOKEN_RATE_USD;

      return Number(cost.toFixed(6));
    },

    getAccumulatedUsage(): InferenceUsage {
      return { ...accumulatedUsage };
    },

    infer<T>(
      options: InferenceRequest,
    ): Promise<EngineResult<InferenceResponse<T>>> {
      return provider.query(options);
    },

    supportsToolUse(): boolean {
      return false;
    },

    inferWithTools() {
      return {
        result: Promise.resolve({
          ok: false as const,
          error: {
            code: "TOOL_USE_UNSUPPORTED" as const,
            message: "Mock provider does not support tool use",
          },
        }),
        cancel: () => {},
      };
    },

    query,
  };

  return provider;

  function getConfiguredResponse(
    options: InferenceRequest,
  ): MockResponse<unknown> | EngineError | undefined {
    switch (detectQueryKind(options)) {
      case "clustering":
        return config.clustering;
      case "module-generation":
        return getModuleGenerationResponse();
      case "overview":
        return config.overview;
      case "quality-review":
        return config.qualityReview;
    }
  }

  function getModuleGenerationResponse():
    | MockResponse<ModuleGenerationResult>
    | EngineError
    | undefined {
    if (Array.isArray(config.moduleGeneration)) {
      const response = config.moduleGeneration[moduleGenerationCallCount];
      moduleGenerationCallCount += 1;

      if (response) {
        return response;
      }

      return {
        code: "ORCHESTRATION_ERROR",
        message: "No mock module generation response remaining",
        details: {
          configuredResponses: config.moduleGeneration.length,
          requestedIndex: moduleGenerationCallCount - 1,
        },
      };
    }

    return config.moduleGeneration;
  }
};

const detectQueryKind = (options: InferenceRequest): QueryKind => {
  const schemaKeys = getSchemaKeys(options.outputSchema);

  if (schemaKeys.has("modules") && schemaKeys.has("unmappedComponents")) {
    return "clustering";
  }

  if (
    (schemaKeys.has("pageContent") || schemaKeys.has("overview")) &&
    schemaKeys.has("title") &&
    schemaKeys.has("crossLinks")
  ) {
    return "module-generation";
  }

  if (schemaKeys.has("content") && schemaKeys.has("mermaidDiagram")) {
    return "overview";
  }

  if (schemaKeys.has("filePath") && schemaKeys.has("newContent")) {
    return "quality-review";
  }

  const haystack =
    `${options.systemPrompt}\n${options.userMessage}`.toLowerCase();

  if (
    haystack.includes("quality review") ||
    haystack.includes("self-review") ||
    haystack.includes("validation finding") ||
    haystack.includes("review patch")
  ) {
    return "quality-review";
  }

  if (haystack.includes("overview") || haystack.includes("mermaid")) {
    return "overview";
  }

  if (
    haystack.includes("cluster") ||
    haystack.includes("module plan") ||
    haystack.includes("unmapped component")
  ) {
    return "clustering";
  }

  return "module-generation";
};

const getSchemaKeys = (
  schema: Record<string, unknown> | undefined,
): Set<string> => {
  const keys = new Set<string>();

  collectSchemaKeys(schema, keys);

  return keys;
};

const collectSchemaKeys = (value: unknown, keys: Set<string>): void => {
  if (!isRecord(value)) {
    return;
  }

  for (const [key, nestedValue] of Object.entries(value)) {
    keys.add(key);

    if (key === "properties" && isRecord(nestedValue)) {
      for (const propertyKey of Object.keys(nestedValue)) {
        keys.add(propertyKey);
      }
    }

    collectSchemaKeys(nestedValue, keys);
  }
};

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === "object" && value !== null;
};

const isEngineError = (
  value: MockResponse<unknown> | EngineError,
): value is EngineError => {
  return "code" in value && "message" in value;
};
