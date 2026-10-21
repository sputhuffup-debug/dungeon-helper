/**
 * Dice pool engine (Year Zero style, generalizing the example module): roll
 * a handful of dice, count the faces that are successes, optionally push
 * (re-roll every die that is not a success, keeping banes when `lockBanes`).
 */
import type { DicePool, DieSpec, DiceSystem, RolledDie, RollResult, Rng } from "../types";
import { assertInteger, num, numberRule } from "./shared";
import type { PoolDieConfig, PoolEngineConfig } from "./types";

interface DieRule {
  spec: DieSpec;
  success: Set<number>;
  bane: Set<number>;
  config: PoolDieConfig;
}

export function createPoolEngine(config: PoolEngineConfig): DiceSystem {
  const kinds = config.dice && config.dice.length > 0 ? config.dice : [{ id: "d6", name: "d6", faces: 6, success: [6], bane: [] }];
  const ids = new Set<string>();
  const rules: DieRule[] = kinds.map((k) => {
    if (!k.id || ids.has(k.id)) throw new Error(`dice engine: pool die ids must be unique and non-empty ("${k.id}")`);
    ids.add(k.id);
    const faces = k.faces ?? 6;
    assertInteger(faces, `die "${k.id}" faces`, 2, 1000);
    const success = new Set(k.success ?? [faces]);
    const bane = new Set(k.bane ?? []);
    const symbols: Record<number, string> = {};
    for (const f of bane) symbols[f] = "bane";
    for (const f of success) symbols[f] = "success";
    return { spec: { id: k.id, name: k.name, faces, symbols, ...(k.color ? { color: k.color } : {}) }, success, bane, config: k };
  });
  const minDice = config.minDice ?? 1;
  assertInteger(minDice, "minDice", 0, 100);
  const push = config.push === false ? undefined : { max: config.push?.max ?? 1, lockBanes: config.push?.lockBanes ?? false };
  if (push) assertInteger(push.max, "push.max", 1, 10);
  const labels = { success: "Success", failure: "Failure", ...config.labels };
  const ruleOf = (id: string) => rules.find((r) => r.spec.id === id);

  const tally = (pool: DicePool, dice: RolledDie[], pushes: number, notes?: string[]): RollResult => {
    const symbols: Record<string, number> = {};
    let successes = 0;
    for (const d of dice) {
      const r = ruleOf(d.die);
      if (!r) continue;
      if (r.success.has(d.value)) {
        successes++;
        symbols.success = (symbols.success ?? 0) + 1;
      } else if (r.bane.has(d.value)) symbols.bane = (symbols.bane ?? 0) + 1;
    }
    const result: RollResult = {
      pool,
      dice,
      successes,
      symbols,
      pushes,
      canPush: !!push && pushes < push.max,
      outcome: successes > 0 ? { id: "success", label: labels.success, tone: "success" } : { id: "failure", label: labels.failure, tone: "failure" },
    };
    if (notes) result.notes = notes;
    return result;
  };

  return {
    engine: "pool",
    dice: rules.map((r) => r.spec),
    resultStyle: "successes",
    rollOptions: { type: "object", properties: { modifier: { type: "integer", title: "Modifier (dice)", minimum: -10, maximum: 10, default: 0 } } },
    buildPool(input) {
      const dice: Record<string, number> = {};
      const breakdown: NonNullable<DicePool["breakdown"]> = [];
      rules.forEach((r, i) => {
        let count: number;
        if (r.config.count !== undefined) {
          count = Math.max(0, Math.floor(numberRule(r.config.count, input)));
          if (count !== 0) breakdown.push({ label: r.spec.name, die: r.spec.id, count });
        } else if (i === 0) {
          const attribute = Math.floor(num(input.attribute));
          const skill = Math.floor(num(input.skill));
          const modifier = Math.floor(num(input.modifier));
          if (attribute) breakdown.push({ label: "Attribute", die: r.spec.id, count: attribute });
          if (skill) breakdown.push({ label: "Skill", die: r.spec.id, count: skill });
          if (modifier) breakdown.push({ label: "Modifier", die: r.spec.id, count: modifier });
          count = attribute + skill + modifier;
        } else count = 0;
        if (i === 0 && count < minDice) {
          breakdown.push({ label: `Minimum ${minDice}`, die: r.spec.id, count: minDice - count });
          count = minDice;
        }
        dice[r.spec.id] = count;
      });
      return { dice, breakdown, meta: { engine: "pool" } };
    },
    roll(pool: DicePool, rng: Rng): RollResult {
      const dice: RolledDie[] = [];
      for (const r of rules) {
        const n = Math.max(0, Math.floor(num(pool.dice[r.spec.id])));
        for (let i = 0; i < n; i++) dice.push({ die: r.spec.id, value: rng.int(1, r.spec.faces) });
      }
      return tally(pool, dice, 0);
    },
    ...(push
      ? {
          push(previous: RollResult, rng: Rng): RollResult {
            if (!previous.canPush) return previous;
            const dice = previous.dice.map((d) => {
              const r = ruleOf(d.die);
              const keep = !r || r.success.has(d.value) || (push.lockBanes && r.bane.has(d.value));
              return keep ? { ...d, kept: true } : { die: d.die, value: rng.int(1, r.spec.faces) };
            });
            return tally(previous.pool, dice, previous.pushes + 1, ["pushed"]);
          },
        }
      : {}),
    describe(result) {
      const n = result.dice.length;
      return `${result.successes} success${result.successes === 1 ? "" : "es"} on ${n} di${n === 1 ? "e" : "ce"}${result.pushes ? ` (pushed${result.pushes > 1 ? ` ×${result.pushes}` : ""})` : ""}`;
    },
  };
}
