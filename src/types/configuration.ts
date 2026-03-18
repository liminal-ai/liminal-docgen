import type { ZodIssue } from "zod";
import type {
  InferenceConfiguration,
  InferenceProviderId,
  ResolvedInferenceConfiguration,
} from "../inference/types.js";

export interface ConfigurationRequest {
  repoPath?: string;
  outputPath?: string;
  includePatterns?: string[];
  excludePatterns?: string[];
  focusDirs?: string[];
  configPath?: string;
  inference?: InferenceConfiguration;
}

export interface ConfigurationErrorDetails {
  field: string;
  reason: string;
  value?: unknown;
  path?: string;
  issues?: ZodIssue[];
}

export interface ResolvedConfiguration {
  outputPath: string;
  includePatterns: string[];
  excludePatterns: string[];
  focusDirs: string[];
  inference?: ResolvedInferenceConfiguration;
}

export interface DefaultConfiguration extends ResolvedConfiguration {}

export interface ConfigurationFileData {
  outputPath?: string;
  includePatterns?: string[];
  excludePatterns?: string[];
  focusDirs?: string[];
  inference?: PersistedInferenceConfiguration;
}

export type PersistedInferenceAuthConfiguration =
  | {
      mode: "oauth";
    }
  | {
      mode: "env";
      apiKeyEnvVar?: string;
    };

export interface PersistedInferenceConfiguration {
  provider: InferenceProviderId;
  auth?: PersistedInferenceAuthConfiguration;
  model?: string;
}
