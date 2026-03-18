import { defineCommand } from "citty";
import { EXIT_OPERATIONAL_FAILURE, EXIT_SUCCESS } from "../cli/exit-codes.js";
import {
  writeHumanError,
  writeHumanValidation,
  writeJsonError,
  writeJsonResult,
} from "../cli/output.js";
import { validateDocumentation } from "../validation/validate.js";

export default defineCommand({
  args: {
    json: {
      default: false,
      description: "Emit machine-readable JSON output.",
      type: "boolean",
    },
    "output-path": {
      description: "Documentation output path to validate.",
      required: true,
      type: "string",
    },
  },
  meta: {
    description: "Validate generated documentation artifacts and links.",
    name: "validate",
  },
  async run({ args }) {
    const result = await validateDocumentation({
      outputPath: args["output-path"],
    });

    if (!result.ok) {
      if (args.json) {
        writeJsonError("validate", result.error);
      } else {
        writeHumanError(result.error);
      }

      process.exitCode = EXIT_OPERATIONAL_FAILURE;
      return;
    }

    if (args.json) {
      writeJsonResult("validate", result.value);
    } else {
      writeHumanValidation(result.value);
    }

    process.exitCode =
      result.value.status === "fail" ? EXIT_OPERATIONAL_FAILURE : EXIT_SUCCESS;
  },
});
