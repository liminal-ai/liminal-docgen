export type CounterCommand =
  | { kind: "show" }
  | { kind: "increment"; amount: number };

export function parseCommand(args: string[]): CounterCommand {
  const firstArg = args[0];

  if (firstArg === "show" || firstArg === undefined) {
    return { kind: "show" };
  }

  if (firstArg === "inc") {
    const amountArg = Number(args[1] ?? "1");
    return {
      amount: Number.isFinite(amountArg) ? amountArg : 1,
      kind: "increment",
    };
  }

  return { kind: "show" };
}
