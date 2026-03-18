import { defineCommand } from "citty";
import { mergePublishRequest } from "../cli/config-merger.js";
import { EXIT_OPERATIONAL_FAILURE, EXIT_SUCCESS } from "../cli/exit-codes.js";
import {
  writeHumanError,
  writeHumanPublishResult,
  writeJsonError,
  writeJsonResult,
} from "../cli/output.js";
import { publishDocumentation } from "../publish/publish.js";

export default defineCommand({
  args: {
    "base-branch": {
      description: "Base branch for the publish branch.",
      type: "string",
    },
    "branch-name": {
      description: "Branch name to publish documentation to.",
      type: "string",
    },
    config: {
      description: "Path to a configuration file.",
      type: "string",
    },
    "commit-message": {
      description: "Commit message for the publish commit.",
      type: "string",
    },
    "create-pr": {
      default: false,
      description: "Create a pull request after pushing the branch.",
      type: "boolean",
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
    "pr-body": {
      description: "Pull request body.",
      type: "string",
    },
    "pr-title": {
      description: "Pull request title.",
      type: "string",
    },
    "repo-path": {
      description: "Repository path containing generated documentation.",
      required: true,
      type: "string",
    },
  },
  meta: {
    description:
      "Publish generated documentation to a branch and optional pull request.",
    name: "publish",
  },
  async run({ args }) {
    const requestResult = await mergePublishRequest({
      baseBranch: args["base-branch"],
      branchName: args["branch-name"],
      commitMessage: args["commit-message"],
      config: args.config,
      createPr: args["create-pr"],
      outputPath: args["output-path"],
      prBody: args["pr-body"],
      prTitle: args["pr-title"],
      repoPath: args["repo-path"],
    });

    if (!requestResult.ok) {
      if (args.json) {
        writeJsonError("publish", requestResult.error);
      } else {
        writeHumanError(requestResult.error);
      }

      process.exitCode = EXIT_OPERATIONAL_FAILURE;
      return;
    }

    const result = await publishDocumentation(requestResult.value);

    if (!result.ok) {
      if (args.json) {
        writeJsonError("publish", result.error);
      } else {
        writeHumanError(result.error);
      }

      process.exitCode = EXIT_OPERATIONAL_FAILURE;
      return;
    }

    if (args.json) {
      writeJsonResult("publish", result.value);
    } else {
      writeHumanPublishResult(result.value);
    }

    process.exitCode = EXIT_SUCCESS;
  },
});
