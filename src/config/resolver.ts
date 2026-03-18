import {
  configurationRequestSchema,
  resolvedConfigurationSchema,
} from "../contracts/configuration.js";
import { resolveInferenceConfiguration } from "../inference/auth.js";
import { validateInferenceCompatibility } from "../inference/factory.js";
import { err, ok } from "../types/common.js";
import type {
  ConfigurationErrorDetails,
  ConfigurationRequest,
  EngineResult,
  ResolvedConfiguration,
} from "../types/index.js";
import { getDefaults } from "./defaults.js";
import { loadConfigFile } from "./file-loader.js";

export const resolveConfiguration = async (
  request: ConfigurationRequest = {},
): Promise<EngineResult<ResolvedConfiguration>> => {
  const callerConfiguration = configurationRequestSchema.safeParse(request);

  if (!callerConfiguration.success) {
    const issue = callerConfiguration.error.issues[0];

    return err("CONFIGURATION_ERROR", "Caller configuration is invalid", {
      field: issue ? issue.path.join(".") || "request" : "request",
      issues: callerConfiguration.error.issues,
      reason:
        issue?.message ??
        "Configuration request does not match the expected shape",
    } satisfies ConfigurationErrorDetails);
  }

  const defaults = getDefaults();
  const fileConfigurationResult = await loadConfigFile(
    callerConfiguration.data.repoPath,
    callerConfiguration.data.configPath,
  );

  if (!fileConfigurationResult.ok) {
    return fileConfigurationResult;
  }

  const fileConfiguration = fileConfigurationResult.value ?? {};
  const resolvedInference =
    callerConfiguration.data.inference !== undefined
      ? resolveInferenceConfiguration(callerConfiguration.data.inference)
      : fileConfiguration.inference !== undefined
        ? resolveInferenceConfiguration(fileConfiguration.inference)
        : defaults.inference;
  const resolvedConfiguration: ResolvedConfiguration = {
    outputPath:
      callerConfiguration.data.outputPath ??
      fileConfiguration.outputPath ??
      defaults.outputPath,
    includePatterns: cloneStringArray(
      callerConfiguration.data.includePatterns ??
        fileConfiguration.includePatterns ??
        defaults.includePatterns,
    ),
    excludePatterns: cloneStringArray(
      callerConfiguration.data.excludePatterns ??
        fileConfiguration.excludePatterns ??
        defaults.excludePatterns,
    ),
    focusDirs: cloneStringArray(
      callerConfiguration.data.focusDirs ??
        fileConfiguration.focusDirs ??
        defaults.focusDirs,
    ),
    ...(resolvedInference ? { inference: resolvedInference } : {}),
  };

  const resolvedConfigurationResult = resolvedConfigurationSchema.safeParse(
    resolvedConfiguration,
  );

  if (!resolvedConfigurationResult.success) {
    const issue = resolvedConfigurationResult.error.issues[0];

    return err("CONFIGURATION_ERROR", "Resolved configuration is invalid", {
      field: issue ? issue.path.join(".") || "configuration" : "configuration",
      issues: resolvedConfigurationResult.error.issues,
      reason:
        issue?.message ??
        "Resolved configuration does not match the expected shape",
    } satisfies ConfigurationErrorDetails);
  }

  const validationError = validateResolvedConfiguration(resolvedConfiguration);

  if (validationError) {
    return err(
      "CONFIGURATION_ERROR",
      validationError.reason,
      validationError satisfies ConfigurationErrorDetails,
    );
  }

  if (resolvedConfiguration.inference) {
    const inferenceCompatibility = validateInferenceCompatibility(
      resolvedConfiguration.inference,
    );

    if (!inferenceCompatibility.ok) {
      return inferenceCompatibility;
    }
  }

  return ok(resolvedConfiguration);
};

const cloneStringArray = (values: string[]): string[] => [...values];

const validateResolvedConfiguration = (
  configuration: ResolvedConfiguration,
): ConfigurationErrorDetails | null => {
  if (configuration.outputPath.trim().length === 0) {
    return {
      field: "outputPath",
      reason: "outputPath must not be empty",
      value: configuration.outputPath,
    };
  }

  const includePatternError = validatePatterns(
    "includePatterns",
    configuration.includePatterns,
  );

  if (includePatternError) {
    return includePatternError;
  }

  const excludePatternError = validatePatterns(
    "excludePatterns",
    configuration.excludePatterns,
  );

  if (excludePatternError) {
    return excludePatternError;
  }

  return validatePaths("focusDirs", configuration.focusDirs);
};

const validatePatterns = (
  fieldName: "includePatterns" | "excludePatterns",
  patterns: string[],
): ConfigurationErrorDetails | null => {
  for (const [index, pattern] of patterns.entries()) {
    if (pattern.trim().length === 0) {
      return {
        field: `${fieldName}[${index}]`,
        reason: `${fieldName} entries must not be empty`,
        value: pattern,
      };
    }

    const syntaxError = getGlobSyntaxError(pattern);

    if (syntaxError) {
      return {
        field: `${fieldName}[${index}]`,
        reason: syntaxError,
        value: pattern,
      };
    }
  }

  return null;
};

const validatePaths = (
  fieldName: "focusDirs",
  paths: string[],
): ConfigurationErrorDetails | null => {
  for (const [index, value] of paths.entries()) {
    if (value.trim().length === 0) {
      return {
        field: `${fieldName}[${index}]`,
        reason: `${fieldName} entries must not be empty`,
        value,
      };
    }
  }

  return null;
};

const getGlobSyntaxError = (pattern: string): string | null => {
  const pairs = new Map<string, string>([
    ["[", "]"],
    ["{", "}"],
    ["(", ")"],
  ]);
  const closingCharacters = new Set<string>(pairs.values());
  const stack: string[] = [];
  let escaped = false;

  for (const character of pattern) {
    if (escaped) {
      escaped = false;
      continue;
    }

    if (character === "\\") {
      escaped = true;
      continue;
    }

    if (pairs.has(character)) {
      stack.push(character);
      continue;
    }

    if (!closingCharacters.has(character)) {
      continue;
    }

    const openingCharacter = stack.pop();

    if (!openingCharacter || pairs.get(openingCharacter) !== character) {
      return `Malformed glob pattern: ${pattern}`;
    }
  }

  return stack.length === 0 ? null : `Malformed glob pattern: ${pattern}`;
};
