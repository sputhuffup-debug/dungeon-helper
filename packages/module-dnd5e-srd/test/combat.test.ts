/**
 * The pack's d20 combat, spot-checked against the SRD 5.1 source data: the
 * Goblin's scimitar, the Adult Red Dragon's fire breath, damage modifiers,
 * every condition with helper text, a character's sheet attacks, and the
 * conditions doing what the SRD says on rolls.
 */
import {
  applyD20DamageModifiers,
  d20ActiveConditions,
  d20Attacks,
  d20CombatantFor,
  d20ConditionAdjustment,
  d20ConditionAutomation,
  d20RollMode,
  computeFields,
  moduleFromPackSource,
  type D20CombatDef,
  type GameModule,
} from "@campaign-forge/module-sdk";
import { beforeAll, describe, expect, it } from "vitest";
import { dnd5eSrdSource } from "../src";

let module: GameModule;
let def: D20CombatDef;
beforeAll(async () => {
  module = await moduleFromPackSource(dnd5eSrdSource);
  def = module.d20Combat!;
}, 60_000);

const monster = (id: string) => {
  const p = module.presets.find((x) => x.id === `dnd5e-srd.preset.${id}`);
  if (!p) throw new Error(`no preset ${id}`);
  return p;
};
const attacksOf = (id: string) => {
  const p = monster(id);
  const type = module.entityTypes.find((t) => t.id === p.entityType)!;
  return d20Attacks(def, d20CombatantFor(def, p.entityType)!, { fields: p.fields, computed: computeFields(type, p.fields) });
};

describe("SRD monsters as combatants", () => {
  it("Goblin: scimitar +4, 1d6+2 slashing, reach 5 ft.; shortbow +4 at range", () => {
    const [scimitar, shortbow] = attacksOf("goblin");
    expect(scimitar).toMatchObject({ name: "Scimitar", kind: "melee", bonus: 4, damage: [{ dice: "1d6+2", type: "slashing" }], reach: "5 ft." });
    expect(shortbow).toMatchObject({ name: "Shortbow", kind: "ranged", bonus: 4, damage: [{ dice: "1d6+2", type: "piercing" }], range: "80/320 ft." });
  });

  it("Adult Red Dragon: fire breath is a DC 21 Dexterity save for 18d6 fire, half on a success; frightful presence frightens, save ends", () => {
    const attacks = attacksOf("adult-red-dragon");
    expect(attacks.find((a) => a.name === "Bite")).toMatchObject({ bonus: 14, damage: [{ dice: "2d10+8", type: "piercing" }, { dice: "2d6", type: "fire" }], reach: "10 ft." });
    const breath = attacks.find((a) => a.name === "Fire Breath")!;
    expect(breath.bonus).toBeUndefined();
    expect(breath.save).toMatchObject({ dc: 21, save: "dexterity-save", half: true, damage: [{ dice: "18d6", type: "fire" }] });
    expect(attacks.find((a) => a.name === "Frightful Presence")!.save).toMatchObject({ dc: 19, save: "wisdom-save", conditions: [{ id: "frightened", duration: { rounds: 10, save: { save: "wisdom-save" } } }] });
    expect(monster("adult-red-dragon").fields.damageModifiers).toEqual([{ kind: "immunity", type: "fire" }]);
  });

  it("an attack whose hit asks for a save: Ghoul claws paralyze (DC 10 Constitution, save ends); Giant Spider bite 2d8 poison, half", () => {
    expect(attacksOf("ghoul").find((a) => a.name === "Claws")!.save).toMatchObject({ dc: 10, save: "constitution-save", conditions: [{ id: "paralyzed", duration: { rounds: 10, save: { save: "constitution-save" } } }] });
    const bite = attacksOf("giant-spider").find((a) => a.name === "Bite")!;
    expect(bite.damage).toEqual([{ dice: "1d8+3", type: "piercing" }]);
    expect(bite.save).toMatchObject({ dc: 11, save: "constitution-save", half: true, damage: [{ dice: "2d8", type: "poison" }] });
    expect(bite.save!.conditions).toBeUndefined();
  });

  it("damage modifiers: a Barbed Devil resists nonmagical weapons that aren't silvered", () => {
    const mods = monster("barbed-devil").fields.damageModifiers as Array<Record<string, unknown>>;
    expect(mods).toContainEqual({ kind: "resistance", type: "slashing", except: ["magical", "silvered"], note: "bludgeoning, piercing, and slashing from nonmagical weapons that aren't silvered" });
    expect(applyD20DamageModifiers(def, mods as never, [{ type: "slashing", amount: 9 }], ["silvered"]).total).toBe(9);
    const out = applyD20DamageModifiers(def, mods as never, [{ type: "slashing", amount: 9 }]);
    expect(out.lines).toEqual(["slashing resistance: 9 → 4"]);
    expect(applyD20DamageModifiers(def, mods as never, [{ type: "slashing", amount: 9 }], ["magical"]).total).toBe(9);
  });

  it("every SRD monster's attacks read cleanly", () => {
    for (const p of module.presets.filter((x) => x.entityType === "dnd5e-srd.monster")) {
      for (const a of attacksOf(p.id.replace("dnd5e-srd.preset.", ""))) {
        expect(a.damageNote, `${p.name}: ${a.name}`).toBeUndefined();
        for (const part of a.damage) expect(def.damageTypes.map((t) => t.id), `${p.name}: ${a.name}`).toContain(part.type);
      }
    }
  });
});

describe("conditions", () => {
  it("every SRD condition has helper text, a citation and its rule card", () => {
    const srd = module.referenceLists.find((l) => l.id === "dnd5e-srd.conditions")!;
    expect(def.conditions.map((c) => c.id).sort()).toEqual(srd.items.map((i) => i.id).sort());
    for (const c of def.conditions) {
      expect(c.summary.length, c.id).toBeGreaterThan(20);
      expect(c.cite).toBe(`SRD 5.1 — Conditions: ${c.name}`);
      expect(module.rules.some((r) => r.id === c.rule), c.id).toBe(true);
    }
  });

  it("poisoned: disadvantage on attack rolls and ability checks", () => {
    const active = d20ActiveConditions(def, [{ id: "poisoned" }]);
    expect(d20ConditionAdjustment(def, active, { roll: "attack", attackKind: "melee" }).disadvantage).toEqual(["Poisoned"]);
    expect(d20ConditionAdjustment(def, active, { roll: "check", ability: "dexterity" }).disadvantage).toEqual(["Poisoned"]);
    expect(d20ConditionAdjustment(def, active, { roll: "save", save: "dexterity-save" }).disadvantage).toEqual([]);
  });

  it("prone: melee attackers within 5 feet have advantage, ranged ones disadvantage", () => {
    const prone = d20ActiveConditions(def, [{ id: "prone" }]);
    expect(d20RollMode(undefined, d20ConditionAdjustment(def, prone, { roll: "attack", attackKind: "melee" }, { against: true, close: true })).mode).toBe("advantage");
    expect(d20RollMode(undefined, d20ConditionAdjustment(def, prone, { roll: "attack", attackKind: "ranged" }, { against: true, close: false })).mode).toBe("disadvantage");
  });

  it("unconscious brings incapacitated and prone: close hits are critical, Strength and Dexterity saves fail", () => {
    const active = d20ActiveConditions(def, [{ id: "unconscious" }]);
    expect(active.map((a) => a.id)).toEqual(["unconscious", "incapacitated", "prone"]);
    const against = d20ConditionAdjustment(def, active, { roll: "attack", attackKind: "melee" }, { against: true, close: true });
    expect(against.critOnHit).toEqual(["Unconscious"]);
    expect(d20ConditionAdjustment(def, active, { roll: "save", save: "strength-save", ability: "strength" }).autoFail).toEqual(["Unconscious"]);
    // a ranged attack: advantage (unconscious) and disadvantage (prone, far) cancel out
    expect(d20RollMode(undefined, d20ConditionAdjustment(def, active, { roll: "attack", attackKind: "ranged" }, { against: true, close: false })).mode).toBe("normal");
  });

  it("exhaustion by level: checks at 1, attacks and saves from 3", () => {
    expect(d20ConditionAdjustment(def, d20ActiveConditions(def, [{ id: "exhaustion", value: 2 }]), { roll: "attack" }).disadvantage).toEqual([]);
    expect(d20ConditionAdjustment(def, d20ActiveConditions(def, [{ id: "exhaustion", value: 3 }]), { roll: "attack" }).disadvantage).toEqual(["Exhaustion 3"]);
    expect(d20ConditionAutomation(def, def.conditions.find((c) => c.id === "exhaustion")!).manual).toContain("death (level 6)");
  });
});

describe("character sheet attacks", () => {
  it("a row's bonus and damage text, the type column, and a save cantrip written as DC 13 Dex", () => {
    const fields = {
      attacks: [
        { name: "Longsword", bonus: "+5", damage: "1d8 + 3 slashing", notes: "Versatile (1d10)" },
        { name: "Shortbow", bonus: "+5", damage: "1d6 + 3", type: "piercing", kind: "ranged" },
        { name: "Sacred Flame", bonus: "DC 13 Dex", damage: "1d8 radiant" },
      ],
    };
    const attacks = d20Attacks(def, d20CombatantFor(def, "dnd5e-srd.character")!, { fields });
    expect(attacks.map((a) => [a.name, a.kind, a.bonus, a.damage])).toEqual([
      ["Longsword", "melee", 5, [{ dice: "1d8+3", type: "slashing" }]],
      ["Shortbow", "ranged", 5, [{ dice: "1d6+3", type: "piercing" }]],
      ["Sacred Flame", "melee", undefined, []],
    ]);
    expect(attacks[2]!.save).toEqual({ dc: 13, save: "dexterity-save", damage: [{ dice: "1d8", type: "radiant" }] });
  });
});
