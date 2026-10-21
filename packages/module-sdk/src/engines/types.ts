/**
 * Configuration of the built-in dice engines. Pure data (JSON), so a data
 * pack can pick an engine and a TypeScript module can call
 * `createDiceEngine(config)` with the same object. Numbers that depend on the
 * character (a proficiency bonus, a skill percentage) are JSONLogic over the
 * roll input; see `docs/modules/dice-engines.md`.
 *
 * The roll input every engine reads (the app builds it from the sheet's
 * skills widget; the roll panel adds the `rollOptions` values):
 *   attribute   number  the attribute / ability score / stat
 *   skill       number  the skill rating (pool, d100) or proficiency multiplier (d20)
 *   modifier    number  a flat modifier chosen at the table
 *   attributeId, skillId  ids of what is rolled
 *   fields, computed      the rolling entity's fields and computed values
 * plus the engine's own options (`dc`, `advantage`, `bonus`).
 */
import type { JsonLogicRule, RollTone } from "../types";

export type DiceEngineId = "d20" | "pool" | "2d6" | "d100";

/** d20 + modifiers against an optional DC, with advantage/disadvantage and natural crit/fumble flags. */
export interface D20EngineConfig {
  engine: "d20";
  /**
   * Treat `attribute` as an ability score and add its modifier
   * `floor((score - 10) / 2)` (default true). False adds `attribute` as is.
   */
  abilityModifier?: boolean;
  /**
   * Proficiency bonus: a number, or JSONLogic over the roll input (e.g.
   * `{ "var": "computed.proficiencyBonus" }`). It is multiplied by `skill`
   * (0 none, 0.5 half, 1 proficient, 2 expertise) and rounded down. Default 0.
   */
  proficiency?: JsonLogicRule;
  /** Extra flat bonus for every roll: a number or JSONLogic over the input. Default 0. */
  bonus?: JsonLogicRule;
  /** A natural roll at or above this is a critical (default 20). */
  critOn?: number;
  /** A natural roll at or below this is a fumble (default 1). */
  fumbleOn?: number;
  /** A natural critical succeeds whatever the DC (default false: flagged only). */
  critSucceeds?: boolean;
  /** A natural fumble fails whatever the DC (default false: flagged only). */
  fumbleFails?: boolean;
  labels?: { success?: string; failure?: string };
}

/** One kind of die in a pool. */
export interface PoolDieConfig {
  id: string;
  name: string;
  /** Faces (default 6). */
  faces?: number;
  /** Faces that count as one success each (default: the highest face). */
  success?: number[];
  /** Faces recorded as the "bane" symbol (e.g. [1]). */
  bane?: number[];
  /**
   * How many of this die: a number or JSONLogic over the input. Default: the
   * first die kind gets attribute + skill + modifier, the others none.
   */
  count?: JsonLogicRule;
  /** UI colour hint. */
  color?: string;
}

/** Year Zero style pools: count success faces, optionally push (re-roll every non-success). */
export interface PoolEngineConfig {
  engine: "pool";
  /** Die kinds (default one plain d6 that succeeds on a 6). */
  dice?: PoolDieConfig[];
  /** Fewest dice of the first kind (default 1). */
  minDice?: number;
  /**
   * Push: re-roll every die that is not a success. `max` pushes per roll
   * (default 1); `lockBanes` keeps bane faces too (default false). `false`: no push.
   */
  push?: false | { max?: number; lockBanes?: boolean };
  labels?: { success?: string; failure?: string };
}

/** A result band of a 2d6 roll: totals at or above `min` (the highest band that fits wins). */
export interface RollBand {
  min: number;
  id: string;
  label: string;
  tone?: RollTone;
}

/** Powered by the Apocalypse style: 2d6 + stat, read as bands (10+, 7-9, 6-). */
export interface TwoD6EngineConfig {
  engine: "2d6";
  /** The stat added: a number or JSONLogic over the input (default attribute + skill). */
  stat?: JsonLogicRule;
  /** Bands, any order (default 10+ strong hit, 7-9 weak hit, 6- miss). One must cover every total. */
  bands?: RollBand[];
}

/** A degree of success of a roll-under percentile roll: at or under `fraction` × target. */
export interface PercentileDegree {
  id: string;
  label: string;
  fraction: number;
  tone?: RollTone;
}

/** Roll-under percentile (BRP / Call of Cthulhu style) with degrees, criticals and fumbles. */
export interface D100EngineConfig {
  engine: "d100";
  /** The target percentage: a number or JSONLogic over the input (default skill, or attribute when skill is 0). */
  target?: JsonLogicRule;
  /** Success degrees, best first (default extreme 1/5, hard 1/2, regular 1). */
  degrees?: PercentileDegree[];
  /** Rolls at or under this are criticals (best degree) (default 1; 0 for none). */
  criticalAt?: number;
  /** Rolls at or over this are fumbles (default 100). */
  fumbleAt?: number;
  /** With a target under `below`, fumbles start at `at` instead (e.g. { below: 50, at: 96 }). */
  fumbleLowTarget?: { below: number; at: number };
  /** Bonus and penalty dice on the tens die: input `bonus` (+n bonus dice, -n penalty dice) (default true). */
  tensDice?: boolean;
  /** Push: re-roll the whole roll (default false). */
  push?: false | { max?: number };
  labels?: { failure?: string };
}

export type DiceEngineConfig = D20EngineConfig | PoolEngineConfig | TwoD6EngineConfig | D100EngineConfig;

export const DICE_ENGINE_IDS: readonly DiceEngineId[] = ["d20", "pool", "2d6", "d100"];
