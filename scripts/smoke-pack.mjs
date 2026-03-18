import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { access } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
const npxCommand = process.platform === "win32" ? "npx.cmd" : "npx";
const packageRoot = process.cwd();
const tempRoot = mkdtempSync(path.join(os.tmpdir(), "liminal-docgen-smoke-"));
const packDir = path.join(tempRoot, "pack");
const installDir = path.join(tempRoot, "install");

try {
  mkdirSync(packDir, { recursive: true });
  mkdirSync(installDir, { recursive: true });

  const output = execFileSync(
    npmCommand,
    ["pack", "--json", "--pack-destination", packDir],
    {
      cwd: packageRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "inherit"],
    },
  );

  const [packResult] = JSON.parse(output);

  if (!packResult?.filename) {
    throw new Error("npm pack did not return a tarball filename.");
  }

  writeFileSync(
    path.join(installDir, "package.json"),
    JSON.stringify(
      {
        name: "liminal-docgen-smoke",
        private: true,
        type: "module",
      },
      null,
      2,
    ),
  );

  const tarballPath = path.join(packDir, packResult.filename);

  execFileSync(npmCommand, ["install", tarballPath], {
    cwd: installDir,
    encoding: "utf8",
    stdio: ["ignore", "inherit", "inherit"],
  });

  execFileSync(npxCommand, ["--no-install", "liminal-docgen", "--help"], {
    cwd: installDir,
    encoding: "utf8",
    stdio: ["ignore", "inherit", "inherit"],
  });

  execFileSync(
    "node",
    [
      "--input-type=module",
      "-e",
      "const mod = await import('liminal-docgen'); if (typeof mod.analyzeRepository !== 'function') { throw new Error('Expected analyzeRepository export.'); }",
    ],
    {
      cwd: installDir,
      encoding: "utf8",
      stdio: ["ignore", "inherit", "inherit"],
    },
  );

  await access(
    path.join(
      installDir,
      "node_modules",
      "liminal-docgen",
      "dist",
      "analysis",
      "scripts",
      "analyze_repository.py",
    ),
  );

  console.log(`Smoke-tested packed tarball ${packResult.filename}.`);
} finally {
  rmSync(tempRoot, { force: true, recursive: true });
}
