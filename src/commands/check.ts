import { defineCommand } from "citty";
import { splitCommaSeparated } from "../cli/config-merger.js";
import { EXIT_OPERATIONAL_FAILURE, EXIT_SUCCESS } from "../cli/exit-codes.js";
import {
  writeHumanEnvironmentCheck,
  writeHumanError,
  writeJsonError,
  writeJsonResult,
} from "../cli/output.js";
import { checkEnvironment } from "../environment/check.js";

export default defineCommand({
  args: {
    provider: {
      description: "Inference provider to validate.",
      type: "string",
    },
    "auth-mode": {
      description: "Inference auth mode to validate (env or oauth).",
      type: "string",
    },
    "api-key-env": {
      description: "Environment variable name for API key auth.",
      type: "string",
    },
    model: {
      description: "Inference model override.",
      type: "string",
    },
    include: {
      description: "Comma-separated include patterns.",
      type: "string",
    },
    exclude: {
      description: "Comma-separated exclude patterns.",
      type: "string",
    },
    focus: {
      description: "Comma-separated focus directories.",
      type: "string",
    },
    json: {
      default: false,
      description: "Emit machine-readable JSON output.",
      type: "boolean",
    },
    "repo-path": {
      description:
        "Optional repository path to validate alongside runtime dependencies.",
      type: "string",
    },
  },
  meta: {
    description: "Check repository, provider, and auth readiness.",
    name: "check",
  },
  async run({ args }) {
    const result = await checkEnvironment({
      excludePatterns: splitCommaSeparated(args.exclude),
      focusDirs: splitCommaSeparated(args.focus),
      includePatterns: splitCommaSeparated(args.include),
      inference:
        args.provider !== undefined ||
        args["auth-mode"] !== undefined ||
        args["api-key-env"] !== undefined ||
        args.model !== undefined
          ? {
              auth: args["auth-mode"]
                ? args["auth-mode"] === "oauth"
                  ? { mode: "oauth" as const }
                  : {
                      apiKeyEnvVar: args["api-key-env"],
                      mode: "env" as const,
                    }
                : args["api-key-env"]
                  ? {
                      apiKeyEnvVar: args["api-key-env"],
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
      repoPath: args["repo-path"],
    });

    if (!result.ok) {
      if (args.json) {
        writeJsonError("check", result.error);
      } else {
        writeHumanError(result.error);
      }

      process.exitCode = EXIT_OPERATIONAL_FAILURE;
      return;
    }

    if (!result.value.passed) {
      const firstError = result.value.findings.find(
        (finding) => finding.severity === "error",
      );

      if (firstError) {
        const errorCode =
          firstError.category === "missing-dependency"
            ? "DEPENDENCY_MISSING"
            : "ENVIRONMENT_ERROR";
        const error = {
          code: errorCode,
          message: firstError.message,
          details: firstError.dependencyName
            ? { dependency: firstError.dependencyName }
            : undefined,
        };

        if (args.json) {
          writeJsonError("check", error);
        } else {
          writeHumanError(error);
        }

        process.exitCode = EXIT_OPERATIONAL_FAILURE;
        return;
      }
    }

    if (args.json) {
      writeJsonResult("check", result.value);
    } else {
      writeHumanEnvironmentCheck(result.value);
    }

    process.exitCode = result.value.passed
      ? EXIT_SUCCESS
      : EXIT_OPERATIONAL_FAILURE;
  },
});
