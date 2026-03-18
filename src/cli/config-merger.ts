import path from "node:path";
import { resolveConfiguration } from "../config/resolver.js";
import { ok } from "../types/common.js";
import type {
  AnalysisOptions,
  ConfigurationRequest,
  DocumentationRunRequest,
  DocumentationStatusRequest,
  EngineResult,
  PublishRequest,
  ResolvedConfiguration,
} from "../types/index.js";

export interface ConfigurableCliArgs {
  repoPath?: string;
  outputPath?: string;
  config?: string;
  include?: string;
  exclude?: string;
  focus?: string;
  provider?: "claude-sdk" | "claude-cli" | "openrouter-http";
  authMode?: "env" | "oauth";
  apiKeyEnv?: string;
  model?: string;
}

export interface PublishCliArgs {
  repoPath: string;
  outputPath?: string;
  config?: string;
  branchName?: string;
  commitMessage?: string;
  createPr?: boolean;
  prTitle?: string;
  prBody?: string;
  baseBranch?: string;
}

export const mergeCliConfiguration = async (
  args: ConfigurableCliArgs,
): Promise<EngineResult<ResolvedConfiguration>> => {
  return resolveConfiguration(toConfigurationRequest(args));
};

export const mergeAnalyzeRequest = async (
  args: ConfigurableCliArgs & { repoPath: string },
): Promise<EngineResult<AnalysisOptions>> => {
  const configurationResult = await mergeCliConfiguration(args);

  if (!configurationResult.ok) {
    return configurationResult;
  }

  return ok({
    excludePatterns: configurationResult.value.excludePatterns,
    focusDirs: configurationResult.value.focusDirs,
    includePatterns: configurationResult.value.includePatterns,
    repoPath: args.repoPath,
  });
};

export const mergeRunRequest = async (
  args: ConfigurableCliArgs & { repoPath: string },
  mode: DocumentationRunRequest["mode"],
): Promise<EngineResult<DocumentationRunRequest>> => {
  const configurationResult = await mergeCliConfiguration(args);

  if (!configurationResult.ok) {
    return configurationResult;
  }

  return ok({
    excludePatterns: configurationResult.value.excludePatterns,
    focusDirs: configurationResult.value.focusDirs,
    inference: configurationResult.value.inference,
    includePatterns: configurationResult.value.includePatterns,
    mode,
    outputPath: configurationResult.value.outputPath,
    repoPath: args.repoPath,
  });
};

export const mergeStatusRequest = async (
  args: ConfigurableCliArgs & { repoPath: string },
): Promise<EngineResult<DocumentationStatusRequest>> => {
  const configurationResult = await mergeCliConfiguration(args);

  if (!configurationResult.ok) {
    return configurationResult;
  }

  return ok({
    outputPath: configurationResult.value.outputPath,
    repoPath: args.repoPath,
  });
};

export const mergePublishRequest = async (
  args: PublishCliArgs,
): Promise<EngineResult<PublishRequest>> => {
  const configurationResult = await mergeCliConfiguration({
    config: args.config,
    outputPath: args.outputPath,
    repoPath: args.repoPath,
  });

  if (!configurationResult.ok) {
    return configurationResult;
  }

  return ok({
    baseBranch: args.baseBranch,
    branchName: args.branchName,
    commitMessage: args.commitMessage,
    createPullRequest: args.createPr ?? false,
    outputPath: configurationResult.value.outputPath,
    prBody: args.prBody,
    prTitle: args.prTitle,
    repoPath: args.repoPath,
  });
};

export const splitCommaSeparated = (value?: string): string[] | undefined => {
  if (value === undefined) {
    return undefined;
  }

  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
};

const toConfigurationRequest = (
  args: ConfigurableCliArgs,
): ConfigurationRequest => ({
  configPath: args.config
    ? path.resolve(process.cwd(), args.config)
    : undefined,
  excludePatterns: splitCommaSeparated(args.exclude),
  focusDirs: splitCommaSeparated(args.focus),
  inference:
    args.provider !== undefined ||
    args.authMode !== undefined ||
    args.apiKeyEnv !== undefined ||
    args.model !== undefined
      ? {
          auth: args.authMode
            ? args.authMode === "oauth"
              ? { mode: "oauth" as const }
              : {
                  apiKeyEnvVar: args.apiKeyEnv,
                  mode: "env" as const,
                }
            : args.apiKeyEnv
              ? {
                  apiKeyEnvVar: args.apiKeyEnv,
                  mode: "env" as const,
                }
              : undefined,
          model: args.model,
          provider: args.provider as
            | "claude-sdk"
            | "claude-cli"
            | "openrouter-http",
        }
      : undefined,
  includePatterns: splitCommaSeparated(args.include),
  outputPath: args.outputPath,
  repoPath: args.repoPath,
});
