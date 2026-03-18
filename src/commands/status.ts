import { defineCommand } from "citty";
import { mergeStatusRequest } from "../cli/config-merger.js";
import { EXIT_OPERATIONAL_FAILURE, EXIT_SUCCESS } from "../cli/exit-codes.js";
import {
  writeHumanError,
  writeHumanStatus,
  writeJsonError,
  writeJsonResult,
} from "../cli/output.js";
import { getDocumentationStatus } from "../metadata/status.js";

export default defineCommand({
  args: {
    config: {
      description: "Path to a configuration file.",
      type: "string",
    },
    json: {
      default: false,
      description: "Emit machine-readable JSON output.",
      type: "boolean",
    },
    "output-path": {
      description: "Explicit documentation output path.",
      type: "string",
    },
    "repo-path": {
      description: "Repository path to inspect.",
      required: true,
      type: "string",
    },
  },
  meta: {
    description:
      "Inspect generation status from metadata and current Git state.",
    name: "status",
  },
  async run({ args }) {
    const requestResult = await mergeStatusRequest({
      config: args.config,
      outputPath: args["output-path"],
      repoPath: args["repo-path"],
    });

    if (!requestResult.ok) {
      if (args.json) {
        writeJsonError("status", requestResult.error);
      } else {
        writeHumanError(requestResult.error);
      }

      process.exitCode = EXIT_OPERATIONAL_FAILURE;
      return;
    }

    const result = await getDocumentationStatus(requestResult.value);

    if (!result.ok) {
      if (args.json) {
        writeJsonError("status", result.error);
      } else {
        writeHumanError(result.error);
      }

      process.exitCode = EXIT_OPERATIONAL_FAILURE;
      return;
    }

    if (args.json) {
      writeJsonResult("status", result.value);
    } else {
      writeHumanStatus(result.value);
    }

    process.exitCode = EXIT_SUCCESS;
  },
});
