/**
 * d20 engine: one d20 (two with advantage or disadvantage, keeping the higher
 * or lower) + ability modifier + proficiency × skill + bonus + modifier,
 * against an optional DC. A natural `critOn`+ is a critical, a natural
 * `fumbleOn`- a fumble. Optionally four degrees of success (`critMargin`) and
 * a one-step shift on natural results (`naturalShift`).
 */
import type { DicePool, DiceSystem, JsonSchema, RolledDie, RollOutcome, RollResult, Rng } from "../types";
import { assertInteger, builtBy, capitalize, num, numberRule, rollFree, signed } from "./shared";
import type { D20EngineConfig, D20ModifierChoice } from "./types";

export type Advantage = "normal" | "advantage" | "disadvantage";

/** The ability modifier of a score: floor((score - 10) / 2). */
export function abilityModifier(score: number): number {
  return Math.floor((score - 10) / 2);
}

/** Roll option keys the engine uses itself (a `modifierChoices` id may not take one). */
const OWN_KEYS = new Set(["advantage", "dc", "modifier", "attribute", "skill", "attributeId", "skillId", "fields", "computed", "bonus"]);

function checkChoices(groups: D20ModifierChoice[] | undefined): void {
  if (groups === undefined) return;
  if (!Array.isArray(groups) || groups.length > 4) throw new Error("dice engine: modifierChoices must be a list of at most 4 groups");
  const ids = new Set<string>();
  for (const g of groups) {
    if (typeof g?.id !== "string" || !/^[a-zA-Z][a-zA-Z0-9-]{0,39}$/.test(g.id) || OWN_KEYS.has(g.id)) throw new Error(`dice engine: modifierChoices id "${String(g?.id)}" must be letters, digits and hyphens, and not one of the engine's options`);
    if (ids.has(g.id)) throw new Error(`dice engine: modifierChoices ids must be unique ("${g.id}")`);
    ids.add(g.id);
    if (!Array.isArray(g.choices) || g.choices.length < 2 || g.choices.length > 12) throw new Error(`dice engine: modifierChoices "${g.id}" needs 2 to 12 choices`);
    const labels = new Set<string>();
    for (const c of g.choices) {
      if (typeof c?.label !== "string" || c.label.trim() === "") throw new Error(`dice engine: modifierChoices "${g.id}" has a choice without a label`);
      if (labels.has(c.label)) throw new Error(`dice engine: modifierChoices "${g.id}" labels must be unique ("${c.label}")`);
      labels.add(c.label);
      assertInteger(c.value, `modifierChoices "${g.id}" value`, -50, 50);
    }
  }
}

/** The four degrees of success, worst first. */
const DEGREES = ["critical-failure", "failure", "success", "critical-success"] as const;
type Degree = (typeof DEGREES)[number];

export function createD20Engine(config: D20EngineConfig): DiceSystem {
  assertInteger(config.critOn, "critOn", 2, 20);
  assertInteger(config.fumbleOn, "fumbleOn", 1, 19);
  assertInteger(config.critMargin, "critMargin", 1, 40);
  if (config.proficiencyMode !== undefined && config.proficiencyMode !== "multiply" && config.proficiencyMode !== "add") throw new Error('dice engine: proficiencyMode must be "multiply" or "add"');
  checkChoices(config.modifierChoices);
  const critOn = config.critOn ?? 20;
  const fumbleOn = config.fumbleOn ?? 1;
  const useAbility = config.abilityModifier !== false;
  const addProficiency = config.proficiencyMode === "add";
  const fourDegrees = config.critMargin !== undefined;
  const margin = config.critMargin ?? 0;
  const labels = { success: "Success", failure: "Failure", criticalSuccess: "Critical success", criticalFailure: "Critical failure", ...config.labels };
  for (const f of config.freeDice ?? []) assertInteger(f, "freeDice", 2, 100);
  const specs = [{ id: "d20", name: "d20", faces: 20 }, ...[...new Set(config.freeDice ?? [])].filter((f) => f !== 20).map((f) => ({ id: `d${f}`, name: `d${f}`, faces: f }))];

  // Roll mode names (e.g. fortune / misfortune); the mechanics stay advantage / disadvantage.
  const modeName: Record<Advantage, string> = { normal: "normal", advantage: "advantage", disadvantage: "disadvantage", ...config.advantageNames };
  const modeNames = [modeName.normal, modeName.advantage, modeName.disadvantage];
  if (modeNames.some((n) => typeof n !== "string" || n.trim() === "") || new Set(modeNames).size !== 3) throw new Error("dice engine: advantageNames must be three different, non-empty names");
  const advantageOf = (v: unknown): Advantage => {
    if (v === "advantage" || v === modeName.advantage) return "advantage";
    if (v === "disadvantage" || v === modeName.disadvantage) return "disadvantage";
    if (typeof v === "number") return v > 0 ? "advantage" : v < 0 ? "disadvantage" : "normal";
    return "normal";
  };

  const choiceProps: Record<string, JsonSchema> = {};
  for (const g of config.modifierChoices ?? []) choiceProps[g.id] = { type: "string", title: g.title, enum: g.choices.map((c) => c.label), default: g.choices[0]!.label };

  const outcomeFor = (degree: Degree, natural: number, shifted: boolean): RollOutcome => {
    const note = shifted ? ` (natural ${natural})` : "";
    switch (degree) {
      case "critical-success":
        return { id: degree, label: `${labels.criticalSuccess}${note}`, tone: "critical" };
      case "success":
        return { id: degree, label: `${labels.success}${note}`, tone: "success" };
      case "failure":
        return { id: degree, label: `${labels.failure}${note}`, tone: "failure" };
      default:
        return { id: degree, label: `${labels.criticalFailure}${note}`, tone: "fumble" };
    }
  };

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
    if (dc !== undefined && fourDegrees) {
      result.target = dc;
      let step = total >= dc + margin ? 3 : total >= dc ? 2 : total <= dc - margin ? 0 : 1;
      const base = step;
      if (config.naturalShift && critical) step = Math.min(3, step + 1);
      if (config.naturalShift && fumble) step = Math.max(0, step - 1);
      const degree = DEGREES[step]!;
      result.successes = step === 3 ? 2 : step === 2 ? 1 : 0;
      result.outcome = outcomeFor(degree, natural, step !== base);
    } else if (dc !== undefined) {
      result.target = dc;
      let pass = total >= dc;
      if (critical && (config.critSucceeds || config.naturalShift)) pass = true;
      if (fumble && (config.fumbleFails || config.naturalShift)) pass = false;
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
        advantage: { type: "string", title: "Roll", enum: modeNames, default: modeName.normal },
        dc: { type: "integer", title: "DC", minimum: 1, maximum: 60 },
        modifier: { type: "integer", title: "Modifier", minimum: -20, maximum: 20, default: 0 },
        ...choiceProps,
      },
    },
    buildPool(input) {
      const attribute = num(input.attribute, useAbility ? 10 : 0);
      const skill = num(input.skill);
      const ability = useAbility ? abilityModifier(attribute) : attribute;
      const prof = addProficiency ? Math.floor(numberRule(config.proficiency, input)) : Math.floor(skill * numberRule(config.proficiency, input));
      const bonus = Math.floor(numberRule(config.bonus, input));
      const extra = Math.floor(num(input.modifier));
      const advantage = advantageOf(input.advantage);
      const dc = typeof input.dc === "number" && Number.isFinite(input.dc) ? Math.floor(input.dc) : undefined;
      const breakdown: NonNullable<DicePool["breakdown"]> = [];
      const attrName = typeof input.attributeId === "string" ? capitalize(input.attributeId) : "Ability";
      if (ability !== 0 || useAbility) breakdown.push({ label: useAbility ? `${attrName} ${attribute}` : attrName, die: "mod", count: ability });
      if (prof !== 0) breakdown.push({ label: addProficiency || skill === 1 ? "Proficiency" : `Proficiency ×${skill}`, die: "mod", count: prof });
      if (bonus !== 0) breakdown.push({ label: "Bonus", die: "mod", count: bonus });
      let situational = 0;
      for (const g of config.modifierChoices ?? []) {
        const picked = g.choices.find((c) => c.label === input[g.id]) ?? g.choices[0]!;
        if (picked.value !== 0) breakdown.push({ label: picked.label, die: "mod", count: picked.value });
        situational += picked.value;
      }
      if (extra !== 0) breakdown.push({ label: "Modifier", die: "mod", count: extra });
      const modifier = ability + prof + bonus + situational + extra;
      const label = `1d20 ${signed(modifier)}${advantage === "normal" ? "" : ` (${modeName[advantage]})`}${dc !== undefined ? ` vs DC ${dc}` : ""}`;
      return { dice: { d20: advantage === "normal" ? 1 : 2 }, breakdown, modifier, label, meta: { engine: "d20", advantage, ...(dc !== undefined ? { dc } : {}) } };
    },
    roll(pool: DicePool, rng: Rng): RollResult {
      if (!builtBy(pool, "d20")) return rollFree(pool, specs, rng);
      const advantage = advantageOf(pool.meta?.advantage);
      const first = rng.int(1, 20, { label: "d20", die: "d20" });
      if (advantage === "normal") return finish(pool, [{ die: "d20", value: first }], 0);
      const second = rng.int(1, 20, { label: "d20", die: "d20" });
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
