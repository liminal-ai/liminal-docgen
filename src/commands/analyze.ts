import { defineCommand } from "citty";
import { analyzeRepository } from "../analysis/analyze.js";
import { mergeAnalyzeRequest } from "../cli/config-merger.js";
import { EXIT_OPERATIONAL_FAILURE, EXIT_SUCCESS } from "../cli/exit-codes.js";
import {
  writeHumanAnalysis,
  writeHumanError,
  writeJsonError,
  writeJsonResult,
} from "../cli/output.js";

export default defineCommand({
  args: {
    config: {
      description: "Path to a configuration file.",
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
    include: {
      description: "Comma-separated include patterns.",
      type: "string",
    },
    json: {
      default: false,
      description: "Emit machine-readable JSON output.",
      type: "boolean",
    },
    "repo-path": {
      description: "Repository path to analyze.",
      required: true,
      type: "string",
    },
  },
  meta: {
    description: "Analyze repository structure.",
    name: "analyze",
  },
  async run({ args }) {
    const requestResult = await mergeAnalyzeRequest({
      config: args.config,
      exclude: args.exclude,
      focus: args.focus,
      include: args.include,
      repoPath: args["repo-path"],
    });

    if (!requestResult.ok) {
      if (args.json) {
        writeJsonError("analyze", requestResult.error);
      } else {
        writeHumanError(requestResult.error);
      }

      process.exitCode = EXIT_OPERATIONAL_FAILURE;
      return;
    }

    const result = await analyzeRepository(requestResult.value);

    if (!result.ok) {
      if (args.json) {
        writeJsonError("analyze", result.error);
      } else {
        writeHumanError(result.error);
      }

      process.exitCode = EXIT_OPERATIONAL_FAILURE;
      return;
    }

    if (args.json) {
      writeJsonResult("analyze", result.value);
    } else {
      writeHumanAnalysis(result.value);
    }

    process.exitCode = EXIT_SUCCESS;
  },
});
