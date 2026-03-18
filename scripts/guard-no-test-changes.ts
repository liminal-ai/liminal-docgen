import { execFileSync } from "node:child_process";

const changedFiles = execFileSync(
  "git",
  ["diff", "--name-only", "--", "test"],
  {
    encoding: "utf8",
  },
).trim();

if (changedFiles.length > 0) {
  console.error("Test files changed during green phase:");
  console.error(changedFiles);
  process.exitCode = 1;
}
