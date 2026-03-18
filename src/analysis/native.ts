import path from "node:path";

import ts from "typescript";

import type { ResolvedConfiguration } from "../types/index.js";
import type { DiscoveredRepositoryFile } from "./file-discovery.js";
import { buildScopedFileTree } from "./file-discovery.js";
import type {
  RawAnalysisFile,
  RawAnalysisOutput,
  RawCallRelationship,
  RawNode,
} from "./raw-output.js";

interface SourceFileContext {
  file: DiscoveredRepositoryFile;
  sourceFile: ts.SourceFile;
}

export const runNativeAnalysis = async (
  repoPath: string,
  scopedFiles: DiscoveredRepositoryFile[],
  _config: ResolvedConfiguration,
): Promise<RawAnalysisOutput> => {
  const fileTree = buildScopedFileTreePayload(repoPath, scopedFiles);
  const analyzedFiles = scopedFiles.filter((file) => file.supportedByNative);
  const unsupportedFiles = scopedFiles.filter(
    (file) => file.language !== null && !file.supportedByNative,
  );

  if (analyzedFiles.length === 0) {
    return {
      file_tree: fileTree,
      functions: [],
      relationships: [],
      summary: {
        files: buildSummaryFiles(analyzedFiles, unsupportedFiles),
        files_analyzed: 0,
        languages_found: [],
        total_files: scopedFiles.length,
        unsupported_files: buildUnsupportedFiles(unsupportedFiles),
      },
    };
  }

  const program = ts.createProgram({
    options: {
      allowJs: true,
      checkJs: false,
      jsx: ts.JsxEmit.Preserve,
      module: ts.ModuleKind.NodeNext,
      moduleResolution: ts.ModuleResolutionKind.NodeNext,
      noEmit: true,
      skipLibCheck: true,
      target: ts.ScriptTarget.ES2024,
    },
    rootNames: analyzedFiles.map((file) => file.absolutePath),
  });
  const checker = program.getTypeChecker();
  const sourceContexts = buildSourceContexts(program, analyzedFiles);
  const analyzedFilePathSet = new Set(
    analyzedFiles.map((file) => normalizeAbsolutePath(file.absolutePath)),
  );
  const relativePathByAbsolute = new Map(
    analyzedFiles.map(
      (file) => [normalizeAbsolutePath(file.absolutePath), file.path] as const,
    ),
  );
  const compilerHost: ts.ModuleResolutionHost = {
    directoryExists: ts.sys.directoryExists,
    fileExists: ts.sys.fileExists,
    getCurrentDirectory: ts.sys.getCurrentDirectory,
    readFile: ts.sys.readFile,
    realpath: ts.sys.realpath,
  };
  const exportedNodes: RawNode[] = [];

  for (const context of sourceContexts) {
    const importTargets = collectImportTargets(
      context.sourceFile,
      compilerHost,
      program.getCompilerOptions(),
      analyzedFilePathSet,
      relativePathByAbsolute,
    );
    exportedNodes.push(...collectExportedNodes(context, importTargets));
  }

  const transitiveExternalTargets = buildTransitiveExternalTargetMap(
    sourceContexts,
    checker,
    analyzedFilePathSet,
    relativePathByAbsolute,
  );
  const relationships = collectUsageRelationships(
    sourceContexts,
    checker,
    analyzedFilePathSet,
    relativePathByAbsolute,
    transitiveExternalTargets,
  );

  return {
    file_tree: fileTree,
    functions: exportedNodes.sort(compareRawNodes),
    relationships,
    summary: {
      files: buildSummaryFiles(analyzedFiles, unsupportedFiles),
      files_analyzed: analyzedFiles.length,
      languages_found: [
        ...new Set(
          analyzedFiles.flatMap((file) =>
            file.language ? [file.language] : [],
          ),
        ),
      ].sort(),
      total_files: scopedFiles.length,
      unsupported_files: buildUnsupportedFiles(unsupportedFiles),
    },
  };
};

const buildSourceContexts = (
  program: ts.Program,
  files: DiscoveredRepositoryFile[],
): SourceFileContext[] => {
  const fileByAbsolutePath = new Map(
    files.map(
      (file) => [normalizeAbsolutePath(file.absolutePath), file] as const,
    ),
  );

  return program
    .getSourceFiles()
    .filter(
      (sourceFile) =>
        !sourceFile.isDeclarationFile &&
        fileByAbsolutePath.has(normalizeAbsolutePath(sourceFile.fileName)),
    )
    .map((sourceFile) => ({
      file: fileByAbsolutePath.get(
        normalizeAbsolutePath(sourceFile.fileName),
      ) as DiscoveredRepositoryFile,
      sourceFile,
    }))
    .sort((left, right) => left.file.path.localeCompare(right.file.path));
};

const collectImportTargets = (
  sourceFile: ts.SourceFile,
  compilerHost: ts.ModuleResolutionHost,
  compilerOptions: ts.CompilerOptions,
  analyzedFilePathSet: Set<string>,
  relativePathByAbsolute: Map<string, string>,
): string[] => {
  const targets = new Set<string>();

  for (const statement of sourceFile.statements) {
    if (
      (ts.isImportDeclaration(statement) ||
        ts.isExportDeclaration(statement)) &&
      statement.moduleSpecifier &&
      ts.isStringLiteralLike(statement.moduleSpecifier)
    ) {
      const target = resolveModuleTarget(
        statement.moduleSpecifier.text,
        sourceFile.fileName,
        compilerOptions,
        compilerHost,
        analyzedFilePathSet,
        relativePathByAbsolute,
      );

      if (target) {
        targets.add(target);
      }
    }
  }

  return [...targets].sort();
};

const collectExportedNodes = (
  context: SourceFileContext,
  importTargets: string[],
): RawNode[] => {
  const nodes: RawNode[] = [];

  for (const statement of context.sourceFile.statements) {
    if (!isExportedStatement(statement)) {
      continue;
    }

    if (ts.isClassDeclaration(statement) && statement.name) {
      nodes.push(
        createRawNode(
          context.file.path,
          statement.name.text,
          "class",
          statement,
          context.sourceFile,
          importTargets,
        ),
      );
      continue;
    }

    if (ts.isFunctionDeclaration(statement) && statement.name) {
      nodes.push(
        createRawNode(
          context.file.path,
          statement.name.text,
          "function",
          statement,
          context.sourceFile,
          importTargets,
        ),
      );
      continue;
    }

    if (ts.isInterfaceDeclaration(statement)) {
      nodes.push(
        createRawNode(
          context.file.path,
          statement.name.text,
          "interface",
          statement,
          context.sourceFile,
          importTargets,
        ),
      );
      continue;
    }

    if (ts.isTypeAliasDeclaration(statement)) {
      nodes.push(
        createRawNode(
          context.file.path,
          statement.name.text,
          "type_alias",
          statement,
          context.sourceFile,
          importTargets,
        ),
      );
      continue;
    }

    if (ts.isEnumDeclaration(statement)) {
      nodes.push(
        createRawNode(
          context.file.path,
          statement.name.text,
          "enum",
          statement,
          context.sourceFile,
          importTargets,
        ),
      );
      continue;
    }

    if (!ts.isVariableStatement(statement)) {
      continue;
    }

    for (const declaration of statement.declarationList.declarations) {
      if (!ts.isIdentifier(declaration.name)) {
        continue;
      }

      nodes.push(
        createRawNode(
          context.file.path,
          declaration.name.text,
          getVariableComponentType(declaration.name.text),
          declaration,
          context.sourceFile,
          importTargets,
        ),
      );
    }
  }

  return nodes;
};

const buildTransitiveExternalTargetMap = (
  sourceContexts: SourceFileContext[],
  checker: ts.TypeChecker,
  analyzedFilePathSet: Set<string>,
  relativePathByAbsolute: Map<string, string>,
): Map<string, Set<string>> => {
  const map = new Map<string, Set<string>>();

  for (const context of sourceContexts) {
    const visit = (node: ts.Node): void => {
      if (
        ts.isFunctionLike(node) ||
        ts.isClassDeclaration(node) ||
        ts.isClassExpression(node)
      ) {
        const key = getDeclarationKey(node);

        if (key) {
          map.set(
            key,
            collectExternalTargetsForNode(
              node,
              context.file.path,
              checker,
              analyzedFilePathSet,
              relativePathByAbsolute,
            ),
          );
        }
      }

      ts.forEachChild(node, visit);
    };

    ts.forEachChild(context.sourceFile, visit);
  }

  return map;
};

const collectUsageRelationships = (
  sourceContexts: SourceFileContext[],
  checker: ts.TypeChecker,
  analyzedFilePathSet: Set<string>,
  relativePathByAbsolute: Map<string, string>,
  transitiveExternalTargets: Map<string, Set<string>>,
): RawCallRelationship[] => {
  const seen = new Set<string>();
  const relationships: RawCallRelationship[] = [];

  for (const context of sourceContexts) {
    const sourcePath = context.file.path;
    const addRelationship = (targetPath: string) => {
      if (targetPath === sourcePath) {
        return;
      }

      const key = `${sourcePath}->${targetPath}`;

      if (seen.has(key)) {
        return;
      }

      seen.add(key);
      relationships.push({
        callee: targetPath,
        caller: sourcePath,
        is_resolved: true,
      });
    };

    const visit = (node: ts.Node): void => {
      if (!ts.isCallExpression(node) && !ts.isNewExpression(node)) {
        ts.forEachChild(node, visit);
        return;
      }

      const symbol = getResolvedSymbolForCallLike(node, checker);
      const targetPaths = getSymbolTargetPaths(
        symbol,
        checker,
        analyzedFilePathSet,
        relativePathByAbsolute,
      );

      for (const targetPath of targetPaths) {
        addRelationship(targetPath);
      }

      const transitiveTargets = new Set<string>();
      const declarations = symbol?.getDeclarations() ?? [];

      for (const declaration of declarations) {
        const transitiveKey = getDeclarationKey(declaration);

        if (!transitiveKey) {
          continue;
        }

        for (const target of transitiveExternalTargets.get(transitiveKey) ??
          []) {
          transitiveTargets.add(target);
        }
      }

      for (const targetPath of transitiveTargets) {
        addRelationship(targetPath);
      }

      ts.forEachChild(node, visit);
    };

    ts.forEachChild(context.sourceFile, visit);
  }

  return relationships.sort(compareRelationships);
};

const collectExternalTargetsForNode = (
  node: ts.Node,
  sourcePath: string,
  checker: ts.TypeChecker,
  analyzedFilePathSet: Set<string>,
  relativePathByAbsolute: Map<string, string>,
): Set<string> => {
  const targets = new Set<string>();

  const visit = (child: ts.Node): void => {
    if (ts.isCallExpression(child) || ts.isNewExpression(child)) {
      for (const targetPath of getSymbolTargetPaths(
        getResolvedSymbolForCallLike(child, checker),
        checker,
        analyzedFilePathSet,
        relativePathByAbsolute,
      )) {
        if (targetPath !== sourcePath) {
          targets.add(targetPath);
        }
      }
    }

    ts.forEachChild(child, visit);
  };

  ts.forEachChild(node, visit);
  return targets;
};

const getResolvedSymbolForCallLike = (
  node: ts.CallExpression | ts.NewExpression,
  checker: ts.TypeChecker,
): ts.Symbol | undefined => {
  const candidate = ts.isPropertyAccessExpression(node.expression)
    ? node.expression.name
    : node.expression;

  const symbol =
    checker.getSymbolAtLocation(candidate) ??
    checker.getSymbolAtLocation(node.expression);

  if (!symbol) {
    return undefined;
  }

  return symbol.flags & ts.SymbolFlags.Alias
    ? checker.getAliasedSymbol(symbol)
    : symbol;
};

const getSymbolTargetPaths = (
  symbol: ts.Symbol | undefined,
  checker: ts.TypeChecker,
  analyzedFilePathSet: Set<string>,
  relativePathByAbsolute: Map<string, string>,
): Set<string> => {
  const targets = new Set<string>();

  if (!symbol) {
    return targets;
  }

  const resolvedSymbol =
    symbol.flags & ts.SymbolFlags.Alias
      ? checker.getAliasedSymbol(symbol)
      : symbol;

  for (const declaration of resolvedSymbol.getDeclarations() ?? []) {
    const sourceFile = declaration.getSourceFile();
    const absolutePath = normalizeAbsolutePath(sourceFile.fileName);

    if (!analyzedFilePathSet.has(absolutePath)) {
      continue;
    }

    const relativePath = relativePathByAbsolute.get(absolutePath);

    if (relativePath) {
      targets.add(relativePath);
    }
  }

  return targets;
};

const resolveModuleTarget = (
  moduleSpecifier: string,
  containingFile: string,
  compilerOptions: ts.CompilerOptions,
  compilerHost: ts.ModuleResolutionHost,
  analyzedFilePathSet: Set<string>,
  relativePathByAbsolute: Map<string, string>,
): string | null => {
  if (!moduleSpecifier.startsWith(".")) {
    return null;
  }

  const resolution = ts.resolveModuleName(
    moduleSpecifier,
    containingFile,
    compilerOptions,
    compilerHost,
  ).resolvedModule;

  if (!resolution) {
    return null;
  }

  const resolvedPath = normalizeAbsolutePath(resolution.resolvedFileName);

  if (!analyzedFilePathSet.has(resolvedPath)) {
    return null;
  }

  return relativePathByAbsolute.get(resolvedPath) ?? null;
};

const getDeclarationKey = (node: ts.Node): string | null => {
  const sourceFile = node.getSourceFile();

  if (!sourceFile.fileName) {
    return null;
  }

  return `${normalizeAbsolutePath(sourceFile.fileName)}:${node.pos}:${node.end}`;
};

const createRawNode = (
  filePath: string,
  name: string,
  componentType: RawNode["component_type"],
  node: ts.Node,
  sourceFile: ts.SourceFile,
  importTargets: string[],
): RawNode => {
  const start = sourceFile.getLineAndCharacterOfPosition(
    node.getStart(sourceFile),
  );
  const end = sourceFile.getLineAndCharacterOfPosition(node.getEnd());

  return {
    component_type: componentType,
    depends_on: [...importTargets],
    end_line: end.line + 1,
    file_path: filePath,
    id: `${filePath}:${name}`,
    name,
    relative_path: filePath,
    start_line: start.line + 1,
  };
};

const getVariableComponentType = (name: string): RawNode["component_type"] =>
  /^[A-Z0-9_]+$/u.test(name) ? "constant" : "variable";

const isExportedStatement = (statement: ts.Statement): boolean =>
  ts.canHaveModifiers(statement) &&
  ts
    .getModifiers(statement)
    ?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword) ===
    true;

const buildSummaryFiles = (
  analyzedFiles: DiscoveredRepositoryFile[],
  unsupportedFiles: DiscoveredRepositoryFile[],
): RawAnalysisFile[] =>
  [...analyzedFiles, ...unsupportedFiles]
    .filter((file) => file.language !== null)
    .map((file) => ({
      language: file.language,
      lines_of_code: file.linesOfCode,
      path: file.path,
      supported: file.supportedByNative,
    }))
    .sort((left, right) => left.path.localeCompare(right.path));

const buildUnsupportedFiles = (
  files: DiscoveredRepositoryFile[],
): RawAnalysisFile[] =>
  files
    .filter((file) => file.language !== null)
    .map((file) => ({
      language: file.language,
      lines_of_code: file.linesOfCode,
      path: file.path,
      supported: false,
    }))
    .sort((left, right) => left.path.localeCompare(right.path));

const buildScopedFileTreePayload = (
  repoPath: string,
  files: DiscoveredRepositoryFile[],
) => buildScopedFileTree(repoPath, files);

const normalizeAbsolutePath = (value: string): string => path.normalize(value);

const compareRawNodes = (left: RawNode, right: RawNode): number =>
  left.file_path.localeCompare(right.file_path) ||
  left.start_line - right.start_line ||
  left.name.localeCompare(right.name);

const compareRelationships = (
  left: RawCallRelationship,
  right: RawCallRelationship,
): number =>
  left.caller.localeCompare(right.caller) ||
  left.callee.localeCompare(right.callee);
