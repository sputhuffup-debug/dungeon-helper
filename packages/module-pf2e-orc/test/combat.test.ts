/**
 * The pack's d20 combat, spot-checked against the source: Monster Core
 * Strikes with their numbers, weaknesses and resistances, the 43 conditions
 * with helper text, and the conditions doing what the ORC rules say on rolls
 * (status penalties that do not stack, off-guard, frightened dropping at the
 * end of the turn, dying at 0 Hit Points).
 */
import {
  applyD20DamageModifiers,
  computeFields,
  createDiceEngine,
  d20ActiveConditions,
  d20Attacks,
  d20CombatantFor,
  d20ConditionAdjustment,
  d20RollInput,
  d20SaveDamageMultiplier,
  moduleFromPackSource,
  resolveD20Attack,
  rollEntered,
  tickD20Conditions,
  type D20CombatDef,
  type GameModule,
} from "@campaign-forge/module-sdk";
import { beforeAll, describe, expect, it } from "vitest";
import { dice as diceConfig } from "../scripts/authored/manifest.ts";
import { pf2eOrcSource } from "../src";

let module: GameModule;
let def: D20CombatDef;
beforeAll(async () => {
  module = await moduleFromPackSource(pf2eOrcSource);
  def = module.d20Combat!;
}, 120_000);

const preset = (name: string) => {
  const p = module.presets.find((x) => x.name === name);
  if (!p) throw new Error(`no preset ${name}`);
  return p;
};
const attacksOf = (name: string) => {
  const p = preset(name);
  const type = module.entityTypes.find((t) => t.id === p.entityType)!;
  return d20Attacks(def, d20CombatantFor(def, p.entityType)!, { fields: p.fields, computed: computeFields(type, p.fields) });
};

describe("Monster Core creatures as combatants", () => {
  it("Goblin Warrior: dogslicer +7, 1d6 slashing, agile; shortbow at range", () => {
    const [dogslicer, shortbow] = attacksOf("Goblin Warrior");
    expect(dogslicer).toMatchObject({ name: "Dogslicer", kind: "melee", bonus: 7, damage: [{ dice: "1d6", type: "slashing" }] });
    expect(dogslicer!.traits).toContain("agile");
    expect(shortbow).toMatchObject({ kind: "ranged", bonus: 7, damage: [{ dice: "1d6", type: "piercing" }] });
  });

  it("a Strike's effects stay with it, and persistent damage is a part of its own", () => {
    for (const p of module.presets.filter((x) => x.entityType === "pf2e-orc.creature")) {
      for (const a of attacksOf(p.name)) {
        expect(a.bonus, `${p.name}: ${a.name}`).toBeTypeOf("number");
        for (const part of a.damage) if (part.type !== undefined) expect(def.damageTypes.map((t) => t.id), `${p.name}: ${a.name}`).toContain(part.type);
      }
    }
    const persistent = module.presets.flatMap((p) => (p.entityType === "pf2e-orc.creature" ? attacksOf(p.name) : [])).filter((a) => a.damage.some((d) => d.persistent));
    expect(persistent.length).toBeGreaterThan(10);
  });

  it("weaknesses and resistances: a dryad's cold iron weakness, a gargoyle's physical resistance except adamantine", () => {
    const dryad = preset("Dryad").fields.damageModifiers as never;
    expect(dryad).toContainEqual({ kind: "weakness", type: "cold-iron", value: 5 });
    expect(applyD20DamageModifiers(def, dryad, [{ type: "slashing", amount: 6 }], ["cold-iron"]).lines).toEqual(["cold iron weakness 5: 6 → 11"]);
    expect(applyD20DamageModifiers(def, dryad, [{ type: "fire", amount: 4 }]).lines).toEqual(["fire weakness 5: 4 → 9"]);
    const gargoyle = preset("Gargoyle").fields.damageModifiers as never;
    expect(applyD20DamageModifiers(def, gargoyle, [{ type: "bludgeoning", amount: 12 }]).lines).toEqual(["bludgeoning (physical) resistance 5: 12 → 7"]);
    expect(applyD20DamageModifiers(def, gargoyle, [{ type: "bludgeoning", amount: 12 }], ["adamantine"]).total).toBe(12);
    // immunities to conditions go to conditionImmunities; immunities to effects (sleep) stay in the text list
    expect(preset("Adamantine Dragon (Adult)").fields.conditionImmunities).toEqual(["paralyzed", "petrified"]);
  });

  it("a Strike reads four degrees against AC; a critical hit doubles the total", () => {
    const dice = createDiceEngine(diceConfig);
    const roll = (face: number) => resolveD20Attack(def, rollEntered((rng) => dice.roll(dice.buildPool(d20RollInput({ base: [{ label: "Dogslicer", value: 7 }], dc: 16 })), rng), [face]), 16);
    expect(roll(19)).toMatchObject({ degree: "critical-success", critical: true }); // 26 ≥ 16 + 10
    expect(roll(9)).toMatchObject({ degree: "success", hit: true });
    expect(roll(2)).toMatchObject({ degree: "failure", hit: false });
    expect(roll(20).degree).toBe("critical-success");
    expect(def.rules.critDamage).toBe("total");
    expect(["critical-success", "success", "failure", "critical-failure"].map((d) => d20SaveDamageMultiplier(def, d as "success", true))).toEqual([0, 0.5, 1, 2]);
  });
});

describe("conditions", () => {
  it("all 43 conditions have helper text, the source's citation and their rule card", () => {
    const list = module.referenceLists.find((l) => l.id === "pf2e-orc.conditions")!;
    expect(def.conditions).toHaveLength(43);
    expect(def.conditions.map((c) => c.id).sort()).toEqual(list.items.map((i) => i.id).sort());
    for (const c of def.conditions) {
      const item = list.items.find((i) => i.id === c.id)!;
      expect(c.summary.length, c.id).toBeGreaterThan(20);
      expect(c.cite).toBe(item.cite);
      expect(!!c.valued, c.id).toBe(item.valued === "yes");
      expect(module.rules.some((r) => r.id === c.rule), c.id).toBe(true);
    }
  });

  it("frightened 2: −2 status to checks, attack rolls and AC; drops by 1 at the end of its turn", () => {
    const active = d20ActiveConditions(def, [{ id: "frightened", value: 2 }]);
    expect(d20ConditionAdjustment(def, active, { roll: "check", ability: "dexterity", skill: "stealth" }).modifier).toBe(-2);
    expect(d20ConditionAdjustment(def, active, { roll: "attack", attackKind: "melee", ability: "strength" }).modifier).toBe(-2);
    expect(d20ConditionAdjustment(def, active, { roll: "ac" }).modifier).toBe(-2);
    const tick = tickD20Conditions(def, "pc", [{ id: "frightened", value: 2 }], { entity: "pc", at: "end" });
    expect(tick.records).toEqual([{ id: "frightened", value: 1 }]);
  });

  it("status penalties do not stack (the worst counts); a circumstance penalty adds to them", () => {
    const active = d20ActiveConditions(def, [
      { id: "frightened", value: 1 },
      { id: "clumsy", value: 2 },
      { id: "off-guard" },
    ]);
    const reflex = d20ConditionAdjustment(def, active, { roll: "save", save: "reflex", ability: "dexterity" });
    expect(reflex.modifier).toBe(-2);
    expect(reflex.parts.map((p) => [p.label, p.value, p.stacked])).toEqual([
      ["Frightened 1", -1, false],
      ["Clumsy 2", -2, true],
    ]);
    expect(d20ConditionAdjustment(def, active, { roll: "ac" }).modifier).toBe(-4);
  });

  it("unconscious brings blinded, off-guard and prone: −4 status AC plus −2 circumstance", () => {
    const active = d20ActiveConditions(def, [{ id: "unconscious" }]);
    expect(active.map((a) => a.id)).toEqual(["unconscious", "blinded", "off-guard", "prone"]);
    expect(d20ConditionAdjustment(def, active, { roll: "ac" }).modifier).toBe(-6);
    expect(d20ConditionAdjustment(def, active, { roll: "check", skill: "perception", ability: "wisdom" }).modifier).toBe(-4);
  });

  it("dying at 0 Hit Points: 1, 2 from a critical hit, plus wounded", () => {
    const rule = def.zeroHp![0]!;
    expect(rule.conditions![0]!.id).toBe("dying");
    expect(def.conditions.find((c) => c.id === "dying")!.implies).toEqual(["unconscious"]);
  });
});
