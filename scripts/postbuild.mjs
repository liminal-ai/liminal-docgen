import { chmodSync, cpSync, mkdirSync } from "node:fs";

mkdirSync("dist/analysis/scripts", { recursive: true });
cpSync(
  "src/analysis/scripts/analyze_repository.py",
  "dist/analysis/scripts/analyze_repository.py",
);
chmodSync("dist/analysis/scripts/analyze_repository.py", 0o755);
