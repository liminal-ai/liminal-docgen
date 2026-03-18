import path from "node:path";

export const resolveOutputPath = ({
  outputPath,
  repoPath,
}: {
  repoPath: string;
  outputPath: string;
}): string =>
  path.isAbsolute(outputPath) ? outputPath : path.join(repoPath, outputPath);
