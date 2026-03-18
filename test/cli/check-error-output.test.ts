import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/environment/check.js", () => ({
  checkEnvironment: vi.fn(),
}));

const { checkEnvironment } = await import("../../src/environment/check.js");
const checkCommand = (await import("../../src/commands/check.js")).default;

const mockCheckEnvironment = vi.mocked(checkEnvironment);

describe("TC-2.5: check command DEPENDENCY_MISSING structured error", () => {
  let stdoutOutput: string;
  let stderrOutput: string;
  let originalStdoutWrite: typeof process.stdout.write;
  let originalStderrWrite: typeof process.stderr.write;
  let savedExitCode: typeof process.exitCode;

  beforeEach(() => {
    stdoutOutput = "";
    stderrOutput = "";
    originalStdoutWrite = process.stdout.write;
    originalStderrWrite = process.stderr.write;
    savedExitCode = process.exitCode;

    process.stdout.write = ((chunk: string) => {
      stdoutOutput += chunk;
      return true;
    }) as typeof process.stdout.write;

    process.stderr.write = ((chunk: string) => {
      stderrOutput += chunk;
      return true;
    }) as typeof process.stderr.write;
  });

  afterEach(() => {
    process.stdout.write = originalStdoutWrite;
    process.stderr.write = originalStderrWrite;
    process.exitCode = savedExitCode;
    vi.restoreAllMocks();
  });

  it("TC-2.5a: DEPENDENCY_MISSING error rendered in human mode", async () => {
    mockCheckEnvironment.mockResolvedValueOnce({
      ok: true,
      value: {
        passed: false,
        findings: [
          {
            severity: "error",
            category: "missing-dependency",
            dependencyName: "python",
            message:
              "Python 3.11+ is required for structural analysis. Install Python 3.11+ and ensure it is available on PATH.",
          },
        ],
        detectedLanguages: [],
      },
    });

    await checkCommand.run?.({
      args: { json: false, "repo-path": undefined },
    } as never);

    expect(process.exitCode).toBe(1);
    expect(stderrOutput).toContain("DEPENDENCY_MISSING");
    expect(stderrOutput.toLowerCase()).toContain("python");
  });

  it("TC-2.5b: DEPENDENCY_MISSING error in JSON mode", async () => {
    mockCheckEnvironment.mockResolvedValueOnce({
      ok: true,
      value: {
        passed: false,
        findings: [
          {
            severity: "error",
            category: "missing-dependency",
            dependencyName: "python",
            message:
              "Python 3.11+ is required for structural analysis. Install Python 3.11+ and ensure it is available on PATH.",
          },
        ],
        detectedLanguages: [],
      },
    });

    await checkCommand.run?.({
      args: { json: true, "repo-path": undefined },
    } as never);

    expect(process.exitCode).toBe(1);
    const envelope = JSON.parse(stdoutOutput) as {
      success: boolean;
      error?: { code: string; message: string; details?: unknown };
    };
    expect(envelope.success).toBe(false);
    expect(envelope.error).toMatchObject({
      code: "DEPENDENCY_MISSING",
      message: expect.stringContaining("Python"),
    });
  });
});
