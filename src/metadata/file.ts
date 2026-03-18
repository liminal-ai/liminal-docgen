import path from "node:path";

export const METADATA_FILE_NAME = ".doc-meta.json";

export const getMetadataFilePath = (outputPath: string): string =>
  path.join(outputPath, METADATA_FILE_NAME);
