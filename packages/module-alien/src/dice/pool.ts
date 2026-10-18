import type { DicePool, DieSpec, RolledDie, RollResult, Rng } from "@campaign-forge/module-sdk";

export const BASE_DIE = "base";
export const STRESS_DIE = "stress";
export const SUCCESS = "success";
export const FACEHUGGER = "facehugger";

/** Two kinds of d6 (p. 42): a 6 on either is a success; a 1 on a stress die is the facehugger. */
export const dice: DieSpec[] = [
  { id: BASE_DIE, name: "Base die", faces: 6, symbols: { 6: SUCCESS }, color: "#d8d2c4" },
  { id: STRESS_DIE, name: "Stress die", faces: 6, symbols: { 6: SUCCESS, 1: FACEHUGGER }, color: "#f2c230" },
];

export const MAX_HELPERS = 3;

export interface PoolInput {
  attribute?: number;
  skill?: number;
  /** Flat modifier chosen by the GM (talents, circumstances, difficulty). */
  modifier?: number;
  /** Gear bonus (weapon or tool). */
  gear?: number;
  /** Number of helping characters; each adds +1, capped at three (p. 43). */
  helpers?: number;
  /** Current stress level: one stress die each. */
  stress?: number;
  /** Difficulty modifier, usually negative (p. 43). */
  difficulty?: number;
  /** Provenance / semantics for push rules. */
  android?: boolean;
  npc?: boolean;
  entity?: string;
  label?: string;
}

const num = (v: unknown, fallback = 0): number => (typeof v === "number" && Number.isFinite(v) ? v : fallback);

/**
 * Base dice = attribute + skill + gear + modifier + difficulty + helpers (max 3), never
 * below one base die (p. 42-43). Stress dice = current stress level.
 */
export function buildPool(input: Record<string, unknown>): DicePool {
  const i = input as PoolInput;
  const attribute = num(i.attribute);
  const skill = num(i.skill);
  const gear = num(i.gear);
  const modifier = num(i.modifier);
  const difficulty = num(i.difficulty);
  const helpers = Math.max(0, Math.min(MAX_HELPERS, Math.floor(num(i.helpers))));
  const stress = Math.max(0, Math.floor(num(i.stress)));

  const breakdown: NonNullable<DicePool["breakdown"]> = [];
  const add = (label: string, die: string, count: number) => {
    if (count !== 0) breakdown.push({ label, die, count });
  };
  add("Attribute", BASE_DIE, attribute);
  add("Skill", BASE_DIE, skill);
  add("Gear", BASE_DIE, gear);
  add("Modifier", BASE_DIE, modifier);
  add("Difficulty", BASE_DIE, difficulty);
  add(helpers === 1 ? "Helper" : `Helpers (${helpers}, max ${MAX_HELPERS})`, BASE_DIE, helpers);

  let base = attribute + skill + gear + modifier + difficulty + helpers;
  if (base < 1) {
    add("Minimum one base die", BASE_DIE, 1 - base);
    base = 1;
  }
  add("Stress level", STRESS_DIE, stress);

  return {
    dice: { [BASE_DIE]: base, [STRESS_DIE]: stress },
    breakdown,
    meta: {
      android: Boolean(i.android),
      npc: Boolean(i.npc),
      stress,
      ...(i.entity ? { entity: i.entity } : {}),
      ...(i.label ? { label: i.label } : {}),
    },
  };
}

function tally(diceRolled: RolledDie[]): { successes: number; symbols: Record<string, number> } {
  let successes = 0;
  const symbols: Record<string, number> = {};
  for (const d of diceRolled) {
    if (d.value === 6) {
      successes += 1;
      symbols[SUCCESS] = (symbols[SUCCESS] ?? 0) + 1;
    }
    if (d.die === STRESS_DIE && d.value === 1) symbols[FACEHUGGER] = (symbols[FACEHUGGER] ?? 0) + 1;
  }
  return { successes, symbols };
}

function pushAllowed(pool: DicePool, pushes: number, facehuggers: number, allowSecondPush = false): boolean {
  const android = Boolean(pool.meta?.android);
  const npc = Boolean(pool.meta?.npc);
  if (android || npc) return false;
  if (facehuggers > 0) return false;
  return pushes === 0 || (allowSecondPush && pushes === 1);
}

/** Any 6 is a success; a stress die showing 1 blocks the push and calls for a stress response (p. 42-44). */
export function roll(pool: DicePool, rng: Rng): RollResult {
  const rolled: RolledDie[] = [];
  const baseCount = pool.dice[BASE_DIE] ?? 0;
  const stressCount = pool.dice[STRESS_DIE] ?? 0;
  for (let n = 0; n < baseCount; n++) rolled.push({ die: BASE_DIE, value: rng.int(1, 6) });
  for (let n = 0; n < stressCount; n++) rolled.push({ die: STRESS_DIE, value: rng.int(1, 6) });

  const { successes, symbols } = tally(rolled);
  const facehuggers = symbols[FACEHUGGER] ?? 0;
  const notes: string[] = [];
  if (facehuggers > 0) {
    notes.push(
      `${facehuggers} stress ${facehuggers === 1 ? "die" : "dice"} showed the facehugger: no push; make a stress response roll (p. 44).`,
    );
  }
  if (pool.meta?.android) notes.push("Androids never push (p. 25).");
  else if (pool.meta?.npc) notes.push("NPCs never push (p. 42).");

  return {
    pool,
    dice: rolled,
    successes,
    symbols,
    pushes: 0,
    canPush: pushAllowed(pool, 0, facehuggers),
    notes,
    meta: { ...(pool.meta ?? {}), stressAfter: pool.meta?.stress ?? stressCount },
  };
}

/**
 * Push (p. 43): keep every die showing a 6, re-roll the rest, raise stress by one and add
 * one stress die to the re-roll. Normally once per roll; a talent may allow a second push
 * (`input.allowSecondPush`).
 */
export function push(previous: RollResult, rng: Rng, input: Record<string, unknown> = {}): RollResult {
  if (!previous.canPush) {
    return { ...previous, notes: [...(previous.notes ?? []), "Push not allowed from this state."] };
  }
  const allowSecondPush = Boolean(input.allowSecondPush);
  const rolled: RolledDie[] = [];
  for (const d of previous.dice) {
    if (d.value === 6) rolled.push({ ...d, kept: true });
    else rolled.push({ die: d.die, value: rng.int(1, 6) });
  }
  rolled.push({ die: STRESS_DIE, value: rng.int(1, 6) });

  const stressBefore = Number(previous.meta?.stressAfter ?? previous.pool.meta?.stress ?? 0);
  const stressAfter = stressBefore + 1;
  const pool: DicePool = {
    ...previous.pool,
    dice: { ...previous.pool.dice, [STRESS_DIE]: (previous.pool.dice[STRESS_DIE] ?? 0) + 1 },
    breakdown: [...(previous.pool.breakdown ?? []), { label: "Push (+1 stress)", die: STRESS_DIE, count: 1 }],
    meta: { ...(previous.pool.meta ?? {}), stress: stressAfter },
  };

  const { successes, symbols } = tally(rolled);
  const facehuggers = symbols[FACEHUGGER] ?? 0;
  const pushes = previous.pushes + 1;
  const notes: string[] = [`Pushed: stress rises to ${stressAfter}.`];
  if (facehuggers > 0) notes.push("A stress die showed the facehugger on the push: make a stress response roll (p. 44).");

  return {
    pool,
    dice: rolled,
    successes,
    symbols,
    pushes,
    canPush: pushAllowed(pool, pushes, facehuggers, allowSecondPush),
    notes,
    meta: { ...(previous.meta ?? {}), stress: stressAfter, stressAfter, pushed: true },
  };
}

export function describe(result: RollResult): string {
  const base = result.dice.filter((d) => d.die === BASE_DIE).length;
  const stress = result.dice.filter((d) => d.die === STRESS_DIE).length;
  const faces = result.dice.map((d) => (d.die === STRESS_DIE ? `[${d.value}]` : `${d.value}`)).join(" ");
  const fh = result.symbols[FACEHUGGER] ?? 0;
  const parts = [
    `${base} base + ${stress} stress: ${faces}`,
    result.successes === 1 ? "1 success" : `${result.successes} successes`,
  ];
  if (fh > 0) parts.push(fh === 1 ? "facehugger!" : `${fh} facehuggers!`);
  if (result.pushes > 0) parts.push(`pushed x${result.pushes}`);
  if (result.canPush) parts.push("can push");
  return parts.join("; ");
}
