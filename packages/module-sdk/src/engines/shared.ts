/** Helpers the built-in dice engines share. */
import { evaluateNumber } from "../logic";
import type { DicePool, DieSpec, JsonLogicRule, RolledDie, RollResult, Rng } from "../types";

export const num = (v: unknown, fallback = 0): number => (typeof v === "number" && Number.isFinite(v) ? v : fallback);

/** A number or JSONLogic over the input; non-numbers become `fallback`. */
export function numberRule(rule: JsonLogicRule | undefined, input: Record<string, unknown>, fallback = 0): number {
  if (rule === undefined || rule === null) return fallback;
  if (typeof rule === "number") return Number.isFinite(rule) ? rule : fallback;
  return evaluateNumber(rule, input);
}

export function signed(n: number): string {
  return n < 0 ? `− ${Math.abs(n)}` : `+ ${n}`;
}

/** Roll a pool that was not built by the engine (a free roll): each die kind `count` times, summed. */
export function rollFree(pool: DicePool, specs: DieSpec[], rng: Rng): RollResult {
  const dice: RolledDie[] = [];
  for (const spec of specs) {
    const n = Math.max(0, Math.floor(num(pool.dice[spec.id])));
    for (let i = 0; i < n; i++) dice.push({ die: spec.id, value: rng.int(1, spec.faces, { label: spec.name, die: spec.id }) });
  }
  const total = dice.reduce((a, d) => a + d.value, 0) + num(pool.modifier);
  return { pool, dice, successes: 0, symbols: {}, pushes: 0, canPush: false, total };
}

/** Is this pool one the engine built (as opposed to a free roll of chosen dice)? */
export function builtBy(pool: DicePool, engine: string): boolean {
  return pool.meta?.engine === engine;
}

export function assertInteger(value: unknown, label: string, min?: number, max?: number): void {
  if (value === undefined) return;
  if (typeof value !== "number" || !Number.isInteger(value) || (min !== undefined && value < min) || (max !== undefined && value > max)) {
    throw new Error(`dice engine: ${label} must be an integer${min !== undefined ? ` from ${min}` : ""}${max !== undefined ? ` to ${max}` : ""}`);
  }
}

export function capitalize(s: string): string {
  return s.length === 0 ? s : s[0]!.toUpperCase() + s.slice(1);
}
