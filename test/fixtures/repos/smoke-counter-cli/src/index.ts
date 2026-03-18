import { parseCommand } from "./input.js";
import { formatCount, incrementCount, loadCounterStore } from "./store.js";

export function runCounterCli(args: string[]): string {
  const command = parseCommand(args);
  const store = loadCounterStore();

  if (command.kind === "show") {
    return formatCount(store.value);
  }

  return formatCount(incrementCount(store, command.amount));
}
