import { readFile } from "node:fs/promises";
import path from "node:path";
import { configurationFileSchema } from "../contracts/configuration.js";
import { getErrorMessage } from "../errors.js";
import { err, ok } from "../types/common.js";
import type {
  ConfigurationErrorDetails,
  ConfigurationFileData,
  EngineResult,
} from "../types/index.js";

export const CONFIG_FILE_NAME = ".liminal-docgen.json";
export const LEGACY_CONFIG_FILE_NAME = ".docengine.json";

export const loadConfigFile = async (
  repoPath?: string,
  configPath?: string,
): Promise<EngineResult<ConfigurationFileData | null>> => {
  if (!configPath && !repoPath) {
    return ok(null);
  }

  const resolvedConfigPath = configPath
    ? path.resolve(configPath)
    : path.join(repoPath as string, CONFIG_FILE_NAME);

  let fileContents: string;

  try {
    fileContents = await readFile(resolvedConfigPath, "utf8");
  } catch (error) {
    if (isMissingFileError(error) && !configPath) {
      const legacyConfigPath = path.join(
        repoPath as string,
        LEGACY_CONFIG_FILE_NAME,
      );

      try {
        fileContents = await readFile(legacyConfigPath, "utf8");
      } catch (legacyError) {
        if (isMissingFileError(legacyError)) {
          return ok(null);
        }

        return err(
          "CONFIGURATION_ERROR",
          `Unable to read configuration file at ${legacyConfigPath}`,
          {
            field: "configFile",
            path: legacyConfigPath,
            reason: getErrorMessage(legacyError),
          } satisfies ConfigurationErrorDetails,
        );
      }
    } else {
      return err(
        "CONFIGURATION_ERROR",
        isMissingFileError(error)
          ? `Configuration file not found at ${resolvedConfigPath}`
          : `Unable to read configuration file at ${resolvedConfigPath}`,
        {
          field: "configFile",
          path: resolvedConfigPath,
          reason: getErrorMessage(error),
        } satisfies ConfigurationErrorDetails,
      );
    }
  }

  let parsed: unknown;

  try {
    parsed = JSON.parse(fileContents);
  } catch (error) {
    return err(
      "CONFIGURATION_ERROR",
      `Invalid JSON in configuration file at ${resolvedConfigPath}`,
      {
        field: "configFile",
        path: resolvedConfigPath,
        reason: getErrorMessage(error),
      } satisfies ConfigurationErrorDetails,
    );
  }

  const result = configurationFileSchema.safeParse(parsed);

  if (!result.success) {
    const issue = result.error.issues[0];

    return err(
      "CONFIGURATION_ERROR",
      `Invalid configuration file at ${resolvedConfigPath}`,
      {
        field: issue ? issue.path.join(".") || "configFile" : "configFile",
        issues: result.error.issues,
        path: resolvedConfigPath,
        reason:
          issue?.message ??
          "Configuration file does not match the expected shape",
      } satisfies ConfigurationErrorDetails,
    );
  }

  return ok(result.data);
};

const isMissingFileError = (error: unknown): error is NodeJS.ErrnoException =>
  error instanceof Error && "code" in error && error.code === "ENOENT";
