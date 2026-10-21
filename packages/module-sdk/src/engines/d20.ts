/**
 * d20 engine: one d20 (two with advantage or disadvantage, keeping the higher
 * or lower) + ability modifier + proficiency × skill + bonus + modifier,
 * against an optional DC. A natural `critOn`+ is a critical, a natural
 * `fumbleOn`- a fumble.
 */
import type { DicePool, DiceSystem, RolledDie, RollResult, Rng } from "../types";
import { assertInteger, builtBy, capitalize, num, numberRule, rollFree, signed } from "./shared";
import type { D20EngineConfig } from "./types";

export type Advantage = "normal" | "advantage" | "disadvantage";

/** The ability modifier of a score: floor((score - 10) / 2). */
export function abilityModifier(score: number): number {
  return Math.floor((score - 10) / 2);
}

function advantageOf(v: unknown): Advantage {
  if (v === "advantage" || v === "disadvantage") return v;
  if (typeof v === "number") return v > 0 ? "advantage" : v < 0 ? "disadvantage" : "normal";
  return "normal";
}

export function createD20Engine(config: D20EngineConfig): DiceSystem {
  assertInteger(config.critOn, "critOn", 2, 20);
  assertInteger(config.fumbleOn, "fumbleOn", 1, 19);
  const critOn = config.critOn ?? 20;
  const fumbleOn = config.fumbleOn ?? 1;
  const useAbility = config.abilityModifier !== false;
  const labels = { success: "Success", failure: "Failure", ...config.labels };
  const specs = [{ id: "d20", name: "d20", faces: 20 }];

  const finish = (pool: DicePool, dice: RolledDie[], pushes: number): RollResult => {
    const kept = dice.find((d) => !d.dropped) ?? dice[0];
    const natural = kept?.value ?? 0;
    const modifier = num(pool.modifier);
    const total = natural + modifier;
    const critical = natural >= critOn;
    const fumble = natural <= fumbleOn;
    const dc = typeof pool.meta?.dc === "number" ? pool.meta.dc : undefined;
    const result: RollResult = { pool, dice, successes: 0, symbols: {}, pushes, canPush: false, total, critical, fumble };
    if (critical) result.symbols.critical = 1;
    if (fumble) result.symbols.fumble = 1;
    if (dc !== undefined) {
      result.target = dc;
      let pass = total >= dc;
      if (critical && config.critSucceeds) pass = true;
      if (fumble && config.fumbleFails) pass = false;
      result.successes = pass ? 1 : 0;
      result.outcome = pass
        ? { id: "success", label: critical ? `${labels.success} (natural ${natural})` : labels.success, tone: critical ? "critical" : "success" }
        : { id: "failure", label: fumble ? `${labels.failure} (natural ${natural})` : labels.failure, tone: fumble ? "fumble" : "failure" };
    } else if (critical || fumble) {
      result.outcome = critical ? { id: "critical", label: `Natural ${natural}`, tone: "critical" } : { id: "fumble", label: `Natural ${natural}`, tone: "fumble" };
    }
    return result;
  };

  return {
    engine: "d20",
    dice: specs,
    resultStyle: "total",
    rollOptions: {
      type: "object",
      properties: {
        advantage: { type: "string", title: "Roll", enum: ["normal", "advantage", "disadvantage"], default: "normal" },
        dc: { type: "integer", title: "DC", minimum: 1, maximum: 40 },
        modifier: { type: "integer", title: "Modifier", minimum: -20, maximum: 20, default: 0 },
      },
    },
    buildPool(input) {
      const attribute = num(input.attribute, useAbility ? 10 : 0);
      const skill = num(input.skill);
      const ability = useAbility ? abilityModifier(attribute) : attribute;
      const prof = Math.floor(skill * numberRule(config.proficiency, input));
      const bonus = Math.floor(numberRule(config.bonus, input));
      const extra = Math.floor(num(input.modifier));
      const advantage = advantageOf(input.advantage);
      const dc = typeof input.dc === "number" && Number.isFinite(input.dc) ? Math.floor(input.dc) : undefined;
      const breakdown: NonNullable<DicePool["breakdown"]> = [];
      const attrName = typeof input.attributeId === "string" ? capitalize(input.attributeId) : "Ability";
      if (ability !== 0 || useAbility) breakdown.push({ label: useAbility ? `${attrName} ${attribute}` : attrName, die: "mod", count: ability });
      if (prof !== 0) breakdown.push({ label: skill === 1 ? "Proficiency" : `Proficiency ×${skill}`, die: "mod", count: prof });
      if (bonus !== 0) breakdown.push({ label: "Bonus", die: "mod", count: bonus });
      if (extra !== 0) breakdown.push({ label: "Modifier", die: "mod", count: extra });
      const modifier = ability + prof + bonus + extra;
      const label = `1d20 ${signed(modifier)}${advantage === "normal" ? "" : ` (${advantage})`}${dc !== undefined ? ` vs DC ${dc}` : ""}`;
      return { dice: { d20: advantage === "normal" ? 1 : 2 }, breakdown, modifier, label, meta: { engine: "d20", advantage, ...(dc !== undefined ? { dc } : {}) } };
    },
    roll(pool: DicePool, rng: Rng): RollResult {
      if (!builtBy(pool, "d20")) return rollFree(pool, specs, rng);
      const advantage = advantageOf(pool.meta?.advantage);
      const first = rng.int(1, 20);
      if (advantage === "normal") return finish(pool, [{ die: "d20", value: first }], 0);
      const second = rng.int(1, 20);
      const keepFirst = advantage === "advantage" ? first >= second : first <= second;
      return finish(pool, [{ die: "d20", value: first, ...(keepFirst ? {} : { dropped: true }) }, { die: "d20", value: second, ...(keepFirst ? { dropped: true } : {}) }], 0);
    },
    describe(result) {
      if (result.total === undefined) return `${result.dice.map((d) => d.value).join(", ")}`;
      const kept = result.dice.find((d) => !d.dropped);
      const mod = num(result.pool.modifier);
      const base = `${kept?.value ?? "?"} ${signed(mod)} = ${result.total}`;
      if (result.target !== undefined) return `${base} vs DC ${result.target}: ${result.outcome?.label ?? ""}`;
      return result.outcome ? `${base} (${result.outcome.label})` : base;
    },
  };
}
