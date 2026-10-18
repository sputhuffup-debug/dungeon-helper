import type { DiceSystem } from "@campaign-forge/module-sdk";
import { buildPool, describe, dice, push, roll } from "./pool";
import { operations } from "./operations";

export * from "./pool";
export * from "./tableIds";
export { operations, PANIC_TRAUMA_THRESHOLD, SUPPLY_MAX_DICE } from "./operations";
export { rollOnTable, rollExpression, findRow } from "./tableLookup";

/** The Alien dice adapter: base and stress d6, push with a stress cost (p. 42-44). */
export const diceSystem: DiceSystem = {
  dice,
  buildPool,
  roll,
  push,
  describe,
  operations,
};
