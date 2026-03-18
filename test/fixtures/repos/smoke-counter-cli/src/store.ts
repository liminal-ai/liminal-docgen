export interface CounterStore {
  value: number;
}

export function loadCounterStore(): CounterStore {
  return { value: 2 };
}

export function incrementCount(store: CounterStore, amount: number): number {
  store.value += amount;
  return store.value;
}

export function formatCount(value: number): string {
  return `count:${value}`;
}
