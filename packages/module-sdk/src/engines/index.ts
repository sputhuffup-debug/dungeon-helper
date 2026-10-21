/** Built-in dice engines a data pack (or a TypeScript module) can select by id. */
import type { DiceSystem } from "../types";
import { createD100Engine } from "./d100";
import { createD20Engine } from "./d20";
import { createPoolEngine } from "./pool";
import { createTwoD6Engine } from "./twod6";
import type { DiceEngineConfig } from "./types";

export * from "./types";
export { abilityModifier, createD20Engine, type Advantage } from "./d20";
export { createPoolEngine } from "./pool";
export { createTwoD6Engine, DEFAULT_BANDS } from "./twod6";
export { createD100Engine, DEFAULT_DEGREES } from "./d100";
export { poolStrength } from "./strength";

/** Build a DiceSystem from an engine config. Throws on a config the engine cannot use. */
export function createDiceEngine(config: DiceEngineConfig): DiceSystem {
  switch (config?.engine) {
    case "d20":
      return createD20Engine(config);
    case "pool":
      return createPoolEngine(config);
    case "2d6":
      return createTwoD6Engine(config);
    case "d100":
      return createD100Engine(config);
    default:
      throw new Error(`unknown dice engine "${String((config as { engine?: unknown } | undefined)?.engine)}" (d20, pool, 2d6 or d100)`);
  }
}
