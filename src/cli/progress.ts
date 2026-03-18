import type { DocumentationProgressEvent } from "../types/orchestration.js";

export function createProgressRenderer(jsonMode: boolean) {
  if (jsonMode) {
    return (_event: DocumentationProgressEvent) => {};
  }

  return (event: DocumentationProgressEvent) => {
    switch (event.stage) {
      case "resolving-configuration":
        process.stderr.write("→ Resolving configuration...\n");
        break;
      case "checking-environment":
        process.stderr.write("→ Checking environment...\n");
        break;
      case "analyzing-structure":
        process.stderr.write("→ Analyzing structure...\n");
        break;
      case "computing-changes":
        process.stderr.write("→ Computing changes...\n");
        break;
      case "planning-modules":
        process.stderr.write("→ Planning modules...\n");
        break;
      case "generating-module": {
        const name = event.moduleName || "(unknown)";
        const count =
          event.completed != null && event.total != null
            ? ` (${event.completed}/${event.total})`
            : "";
        process.stderr.write(`→ Generating module: ${name}${count}\n`);
        break;
      }
      case "generating-overview":
        process.stderr.write("→ Generating overview...\n");
        break;
      case "writing-module-tree":
        process.stderr.write("→ Writing module tree...\n");
        break;
      case "validating-output":
        process.stderr.write("→ Validating output...\n");
        break;
      case "quality-review":
        process.stderr.write("→ Running quality review...\n");
        break;
      case "writing-metadata":
        process.stderr.write("→ Writing metadata...\n");
        break;
      case "complete":
        process.stderr.write("→ Complete.\n");
        break;
      case "failed":
        process.stderr.write("→ Failed.\n");
        break;
      default:
        process.stderr.write(`→ ${event.stage}...\n`);
        break;
    }
  };
}
