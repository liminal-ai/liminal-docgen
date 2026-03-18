#!/usr/bin/env node

import {
  type ArgsDef,
  type CommandContext,
  type CommandDef,
  defineCommand,
  parseArgs,
  renderUsage,
} from "citty";
import {
  installCancellationHandler,
  resetCancellationState,
  setCancellationNoticeEnabled,
} from "./cli/cancellation.js";
import {
  EXIT_OPERATIONAL_FAILURE,
  EXIT_USAGE_ERROR,
} from "./cli/exit-codes.js";
import { writeHumanError, writeJsonError } from "./cli/output.js";

const subCommands = {
  analyze: () =>
    import("./commands/analyze.js").then((module) => module.default),
  check: () => import("./commands/check.js").then((module) => module.default),
  generate: () =>
    import("./commands/generate.js").then((module) => module.default),
  publish: () =>
    import("./commands/publish.js").then((module) => module.default),
  status: () => import("./commands/status.js").then((module) => module.default),
  update: () => import("./commands/update.js").then((module) => module.default),
  validate: () =>
    import("./commands/validate.js").then((module) => module.default),
};

type SubCommandName = keyof typeof subCommands;

export const mainCommand = defineCommand({
  meta: {
    description: "Liminal DocGen CLI",
    name: "liminal-docgen",
  },
  subCommands,
});

resetCancellationState();
installCancellationHandler();

await runCli(process.argv.slice(2));

async function runCli(args: string[]): Promise<void> {
  setCancellationNoticeEnabled(!hasJsonFlag(args));

  if (args.length === 0) {
    await writeUsage(mainCommand);
    return;
  }

  const commandToken = getFirstPositional(args);

  if (!commandToken) {
    if (hasHelpFlag(args)) {
      await writeUsage(mainCommand);
      return;
    }

    await writeUsageError("No command specified.", {
      json: hasJsonFlag(args),
    });
    return;
  }

  if (!isSubCommandName(commandToken)) {
    await writeUsageError(`Unknown command ${commandToken}`, {
      json: hasJsonFlag(args),
    });
    return;
  }

  const command = await resolveCommand(commandToken);
  const commandArgs = args.slice(args.indexOf(commandToken) + 1);

  if (hasHelpFlag(commandArgs)) {
    await writeUsage(command, mainCommand);
    return;
  }

  try {
    await executeCommand(command, commandArgs);
  } catch (error) {
    if (isCittyUsageError(error)) {
      await writeUsageError(error.message, {
        commandName: commandToken,
        json: hasJsonFlag(commandArgs),
      });
      return;
    }

    const message =
      error instanceof Error ? error.message : "Unexpected CLI failure";
    const details = error instanceof Error ? { stack: error.stack } : error;

    if (hasJsonFlag(commandArgs)) {
      writeJsonError(commandToken, {
        code: "CLI_ERROR",
        details,
        message,
      });
    } else {
      writeHumanError({
        code: "CLI_ERROR",
        details,
        message,
      });
    }

    process.exitCode = EXIT_OPERATIONAL_FAILURE;
  }
}

async function executeCommand<TArgs extends ArgsDef>(
  command: CommandDef<TArgs>,
  rawArgsForCommand: string[],
): Promise<void> {
  const args = parseArgs(
    rawArgsForCommand,
    (await resolveValue(command.args)) ?? {},
  );
  const context = {
    args,
    cmd: command,
    rawArgs: rawArgsForCommand,
  } as CommandContext<TArgs>;

  await command.setup?.(context);

  try {
    await command.run?.(context);
  } finally {
    await command.cleanup?.(context);
  }
}

async function writeUsage(
  command: CommandDef = mainCommand,
  parent?: CommandDef,
): Promise<void> {
  const usage = await renderUsage(command, parent);
  process.stdout.write(`${usage}\n`);
}

async function writeUsageError(
  message: string,
  options: { commandName?: SubCommandName; json: boolean },
): Promise<void> {
  if (options.json) {
    writeJsonError(options.commandName ?? "liminal-docgen", {
      code: "USAGE_ERROR",
      message,
    });
  } else {
    const command = options.commandName
      ? await resolveCommand(options.commandName)
      : mainCommand;

    await writeUsage(command, options.commandName ? mainCommand : undefined);
    writeHumanError({
      code: "USAGE_ERROR",
      message,
    });
  }

  process.exitCode = EXIT_USAGE_ERROR;
}

async function resolveCommand(
  name: SubCommandName,
): Promise<CommandDef<ArgsDef>> {
  return (await subCommands[name]()) as CommandDef<ArgsDef>;
}

async function resolveValue<T>(
  value: T | Promise<T> | (() => T) | (() => Promise<T>) | undefined,
): Promise<T | undefined> {
  if (typeof value === "function") {
    return (value as () => T | Promise<T>)();
  }

  return value;
}

function getFirstPositional(args: string[]): string | undefined {
  return args.find((argument) => !argument.startsWith("-"));
}

function hasHelpFlag(args: string[]): boolean {
  return args.includes("--help") || args.includes("-h");
}

function hasJsonFlag(args: string[]): boolean {
  return args.includes("--json");
}

function isSubCommandName(value: string): value is SubCommandName {
  return value in subCommands;
}

function isCittyUsageError(error: unknown): error is Error & { code?: string } {
  return error instanceof Error && error.name === "CLIError";
}
