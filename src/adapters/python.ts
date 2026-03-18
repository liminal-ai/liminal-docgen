import { runSubprocess } from "./subprocess.js";

export const isPythonAvailable = async (): Promise<boolean> => {
  const pythonCommand = await getPythonCommand();
  return pythonCommand !== null;
};

export const isTreeSitterLanguageAvailable = async (
  language: string,
): Promise<boolean> => {
  const moduleName = TREE_SITTER_MODULES[language];

  if (!moduleName) {
    return true;
  }

  const pythonCommand = await getPythonCommand();

  if (!pythonCommand) {
    return false;
  }

  try {
    const result = await runSubprocess(
      pythonCommand,
      [
        "-c",
        [
          "import importlib.util",
          "import sys",
          `sys.exit(0 if importlib.util.find_spec("${moduleName}") else 1)`,
        ].join("; "),
      ],
      { timeoutMs: 10_000 },
    );

    return result.exitCode === 0;
  } catch {
    return false;
  }
};

const PYTHON_COMMANDS = ["python3", "python"] as const;
const MINIMUM_PYTHON_MAJOR = 3;
const MINIMUM_PYTHON_MINOR = 11;
const TREE_SITTER_MODULES: Record<string, string> = {
  javascript: "tree_sitter_javascript",
  python: "tree_sitter_python",
  typescript: "tree_sitter_typescript",
};

export const getPythonCommand = async (): Promise<string | null> => {
  for (const command of PYTHON_COMMANDS) {
    try {
      const result = await runSubprocess(command, ["--version"], {
        timeoutMs: 10_000,
      });

      if (
        result.exitCode === 0 &&
        isSupportedPythonVersion(result.stdout || result.stderr)
      ) {
        return command;
      }
    } catch {
      // Ignore missing commands and keep probing fallbacks.
    }
  }

  return null;
};

const isSupportedPythonVersion = (versionOutput: string): boolean => {
  const match = versionOutput.match(/Python\s+(\d+)\.(\d+)(?:\.(\d+))?/i);

  if (!match) {
    return false;
  }

  const major = Number(match[1]);
  const minor = Number(match[2]);

  if (major !== MINIMUM_PYTHON_MAJOR) {
    return major > MINIMUM_PYTHON_MAJOR;
  }

  return minor >= MINIMUM_PYTHON_MINOR;
};
