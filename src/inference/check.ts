import { runSubprocess } from "../adapters/subprocess.js";
import type { EnvironmentCheckFinding } from "../types/index.js";
import { resolveInferenceAuth, resolveInferenceConfiguration } from "./auth.js";
import { isClaudeAgentSdkAvailable } from "./providers/claude-sdk.js";
import { getProviderDefinition } from "./registry.js";
import type { InferenceConfiguration } from "./types.js";

export const checkInferenceProvider = async (
  config: InferenceConfiguration,
): Promise<EnvironmentCheckFinding[]> => {
  const resolvedConfig = resolveInferenceConfiguration(config);
  const auth = resolveInferenceAuth(
    resolvedConfig.auth,
    getProviderDefinition(resolvedConfig.provider).defaultApiKeyEnvVar,
  );
  const findings: EnvironmentCheckFinding[] = [];

  switch (resolvedConfig.provider) {
    case "claude-cli":
      if (!(await isClaudeCliAvailable())) {
        findings.push({
          category: "missing-dependency",
          dependencyName: "claude",
          message:
            "Claude CLI is required for the claude-cli provider. Install the `claude` CLI and ensure it is available on PATH.",
          severity: "error",
        });
      }
      break;
    case "claude-sdk":
      if (!(await isClaudeAgentSdkAvailable())) {
        findings.push({
          category: "missing-dependency",
          dependencyName: "@anthropic-ai/claude-agent-sdk",
          message:
            "Claude Agent SDK is required for the claude-sdk provider. Install @anthropic-ai/claude-agent-sdk to use this provider.",
          severity: "error",
        });
      }
      break;
    case "openrouter-http":
      findings.push({
        category: "environment",
        message:
          'Provider "openrouter-http" is currently unstable in end-to-end generation and is not recommended for reliable use.',
        severity: "warning",
      });
      break;
  }

  if (auth.mode === "oauth") {
    if (
      (resolvedConfig.provider === "claude-cli" ||
        resolvedConfig.provider === "claude-sdk") &&
      !(await isClaudeOauthAvailable())
    ) {
      findings.push({
        category: "environment",
        message:
          "Claude OAuth authentication is not available. Run `claude auth login` before using OAuth-backed Claude providers.",
        severity: "error",
      });
    }

    return findings;
  }

  if (!auth.apiKey) {
    findings.push({
      category: "environment",
      message: auth.apiKeyEnvVar
        ? `Environment variable ${auth.apiKeyEnvVar} is required for provider "${resolvedConfig.provider}".`
        : `API key is required for provider "${resolvedConfig.provider}".`,
      severity: "error",
    });
  }

  return findings;
};

export const isClaudeOauthAvailable = async (): Promise<boolean> => {
  try {
    const result = await runSubprocess("claude", ["auth", "status"], {
      timeoutMs: 10_000,
    });

    if (result.exitCode !== 0) {
      return false;
    }

    const parsed = JSON.parse(result.stdout) as { loggedIn?: boolean };
    return parsed.loggedIn === true;
  } catch {
    return false;
  }
};

const isClaudeCliAvailable = async (): Promise<boolean> => {
  try {
    const result = await runSubprocess("claude", ["--version"], {
      timeoutMs: 10_000,
    });

    return result.exitCode === 0;
  } catch {
    return false;
  }
};
