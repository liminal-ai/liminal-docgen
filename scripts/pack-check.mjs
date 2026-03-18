import { execFileSync } from "node:child_process";

const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";

const output = execFileSync(npmCommand, ["pack", "--dry-run", "--json"], {
  cwd: process.cwd(),
  encoding: "utf8",
  stdio: ["ignore", "pipe", "inherit"],
});

const [packResult] = JSON.parse(output);

if (!packResult) {
  throw new Error("npm pack --dry-run returned no result.");
}

const allowedRootFiles = new Set([
  "LICENSE",
  "NOTICE",
  "README.md",
  "package.json",
]);

const unexpectedFiles = packResult.files
  .map((file) => file.path)
  .filter((filePath) => {
    if (allowedRootFiles.has(filePath)) {
      return false;
    }

    return !filePath.startsWith("dist/");
  });

if (unexpectedFiles.length > 0) {
  throw new Error(
    [
      "Packed tarball contains unexpected files:",
      ...unexpectedFiles.map((filePath) => `- ${filePath}`),
    ].join("\n"),
  );
}

const requiredFiles = [
  "dist/cli.js",
  "dist/index.js",
  "dist/analysis/scripts/analyze_repository.py",
  "LICENSE",
  "NOTICE",
  "README.md",
  "package.json",
];

const packedFiles = new Set(packResult.files.map((file) => file.path));
const missingFiles = requiredFiles.filter(
  (filePath) => !packedFiles.has(filePath),
);

if (missingFiles.length > 0) {
  throw new Error(
    [
      "Packed tarball is missing required files:",
      ...missingFiles.map((filePath) => `- ${filePath}`),
    ].join("\n"),
  );
}

console.log(
  `Verified packed tarball contents (${packResult.files.length} files, ${packResult.unpackedSize} bytes unpacked).`,
);
