import { describe, expect, it } from "vitest";
import {
  checkModule,
  computeFields,
  createRng,
  createTableRegistry,
  defaultFieldsFor,
  evaluateLogic,
  logicIssues,
  validateEntityFields,
  type CombatHealthDef,
  type EntityPreset,
  type HitInput,
} from "@campaign-forge/module-sdk";
import alienModule, { combat, resolveHit, specialAttacks, acidSplash, creatureTurn, CRITICAL_INJURY_CONDITION, CRITICAL_REROLL_FROM } from "../src";
import { characterType, creatureType } from "../src/entities";
import { SKILL_IDS, ATTRIBUTE_IDS } from "../src/entities/common";
import { rules } from "../src/rules";

const tableIds = new Set(alienModule.tables.map((t) => t.id));
const ruleIds = new Set(rules.map((r) => r.id));
const creatures = alienModule.presets.filter((p) => p.entityType === "alien.creature");
const characters = alienModule.presets.filter((p) => p.entityType === "alien.character");
const health = (type: string): CombatHealthDef => combat.health.find((h) => h.entityType === type)!;

/** The first broken entry whose `when` matches, as the table evaluates it. */
function brokenFor(def: CombatHealthDef, preset: Pick<EntityPreset, "entityType" | "fields">) {
  const entityType = alienModule.entityTypes.find((t) => t.id === preset.entityType)!;
  const fields = { ...defaultFieldsFor(entityType), ...preset.fields };
  const data = { fields, computed: computeFields(entityType, fields), type: preset.entityType };
  return def.broken?.find((b) => b.when === undefined || Boolean(evaluateLogic(b.when, data)));
}

const hit = (h: Partial<HitInput>) => resolveHit({ damage: 0, armor: 0, ...h });

describe("combat definition", () => {
  it("is registered on the module and links rule cards that exist", () => {
    expect(alienModule.combat).toBe(combat);
    expect(combat.rules!.length).toBeGreaterThan(5);
    for (const id of combat.rules!) expect(ruleIds.has(id), id).toBe(true);
    for (const slug of ["initiative", "actions", "attack-close", "attack-ranged", "damage-armor", "armor", "broken", "critical-injuries", "creature-speed", "acid-splash", "special-attacks", "broken-xenomorph"]) {
      expect(combat.rules).toContain(`alien.rule.${slug}`);
    }
  });

  it("settles opposed ties for the defender (p. 44)", () => {
    expect(combat.opposedTies).toMatchObject({ winner: "defender", page: [44, 65] });
  });

  it("points health entries at stored damage fields that default to 0, never at computed values", () => {
    for (const h of combat.health) {
      const type = alienModule.entityTypes.find((t) => t.id === h.entityType)!;
      expect(type, h.entityType).toBeDefined();
      expect(type.computed?.[h.damagePath], `${h.entityType}.${h.damagePath} must be stored`).toBeUndefined();
      const prop = (type.schema.properties as Record<string, { type?: string; default?: unknown; minimum?: number }>)[h.damagePath]!;
      expect(prop.type).toBe("integer");
      expect(prop.minimum).toBe(0);
      expect(prop.default).toBe(0);
      expect(defaultFieldsFor(type)[h.damagePath]).toBe(0);
      expect(h.page).toBeDefined();
      for (const b of h.broken ?? []) {
        expect(tableIds.has(b.table), b.table).toBe(true);
        if (b.operation) expect(alienModule.dice.operations?.[b.operation], b.operation).toBeDefined();
        if (b.when !== undefined) expect(logicIssues(b.when)).toEqual([]);
      }
    }
    expect(health("alien.character").maxPath).toBe("health");
    expect(characterType.computed?.health).toBeDefined();
    expect(health("alien.creature")).toMatchObject({ maxPath: "health", armorPath: "armor", armorBySource: { fire: "armorVsFire" } });
  });

  it("lets players record damage on their sheet and shows Health left as a computed value", () => {
    expect(characterType.playerEditable).toContain("damage");
    const fields = { ...defaultFieldsFor(characterType), attributes: { strength: 4, agility: 3, wits: 3, empathy: 3 }, damage: 2 };
    expect(computeFields(characterType, fields)).toMatchObject({ health: 4, healthRemaining: 2 });
    expect(computeFields(characterType, { ...fields, damage: 9 }).healthRemaining).toBe(0);
    const drone = creatures.find((c) => c.id === "alien.creature.xx121-drone")!;
    expect(computeFields(creatureType, { ...drone.fields, damage: 3 }).healthRemaining).toBe(4);
  });

  it("keeps every existing preset valid with the new fields", () => {
    for (const p of [...characters, ...creatures]) {
      const type = p.entityType === "alien.character" ? characterType : creatureType;
      const res = validateEntityFields(type, p.fields);
      expect(res.valid, `${p.id}: ${JSON.stringify(res.errors)}`).toBe(true);
      expect(validateEntityFields(type, { ...p.fields, damage: 3 }).valid).toBe(true);
    }
    expect(validateEntityFields(characterType, { damage: -1 }).valid).toBe(false);
    expect(validateEntityFields(creatureType, { damage: 1.5 }).valid).toBe(false);
  });
});

describe("broken tables (p. 68-70, 78, 208-209, 231)", () => {
  const ch = health("alien.character");
  const cr = health("alien.creature");
  const creature = (id: string) => creatures.find((c) => c.id === `alien.creature.${id}`)!;

  it("rolls critical injuries for humans and critical system damage for androids, NPCs included", () => {
    expect(brokenFor(ch, { entityType: "alien.character", fields: {} })).toMatchObject({ table: "alien.character.critical-injury", operation: "criticalInjury" });
    expect(brokenFor(ch, { entityType: "alien.character", fields: { android: true } })).toMatchObject({ table: "alien.character.android-critical-damage", operation: "androidCriticalDamage" });
    expect(brokenFor(ch, { entityType: "alien.character", fields: { android: true, secretAndroid: true } })?.table).toBe("alien.character.android-critical-damage");
    for (const npc of characters) {
      const expected = npc.fields.android === true ? "alien.character.android-critical-damage" : "alien.character.critical-injury";
      expect(brokenFor(ch, npc)?.table, npc.id).toBe(expected);
    }
  });

  it("rolls the broken xenomorph table for XX121 and Neomorphs, but not Facehuggers, Chestbursters or other species", () => {
    for (const id of ["xx121-drone", "xx121-soldier", "xx121-queen", "xx121-charger", "xx121-ovomorph", "neomorph-adult", "neomorph-neophyte", "neomorph-bloodburster"]) {
      expect(brokenFor(cr, creature(id))?.table, id).toBe("alien.creatures.broken-xenomorph");
    }
    for (const id of ["xx121-facehugger", "xx121-royal-facehugger", "xx121-praeto-facehugger", "xx121-chestburster", "xx121-bambi-burster", "xx121-imp", "xx121-queen-burster", "harvester", "lion-worm", "tanakan-scorpionid", "swarm"]) {
      expect(brokenFor(cr, creature(id)), id).toBeUndefined();
    }
    const table = alienModule.tables.find((t) => t.id === "alien.creatures.broken-xenomorph")!;
    expect(table.page).toBe(208);
    expect(table.rows.map((r) => r.label)).toEqual(["Rise Again", "Wounded", "Desperate Escape", "Last Breath", "Torn Apart"]);
  });

  it("re-rolls a critical injury the character already has, from 14 up (p. 68)", () => {
    const registry = createTableRegistry(alienModule.tables);
    const op = alienModule.dice.operations!.criticalInjury!;
    const all: string[] = [];
    for (let t = 1; t <= 6; t++) for (let u = 1; u <= 6; u++) if (t * 10 + u >= CRITICAL_REROLL_FROM) all.push(`${CRITICAL_INJURY_CONDITION}${t * 10 + u}`);
    const keep = `${CRITICAL_INJURY_CONDITION}35`;
    for (let seed = 0; seed < 40; seed++) {
      const res = op.run({ entity: "pc", conditions: all.filter((c) => c !== keep) }, createRng(`crit-${seed}`), registry);
      expect(res.total === 35 || res.total! < CRITICAL_REROLL_FROM, `seed ${seed}: ${res.total}`).toBe(true);
    }
    // Without conditions the roll is unchanged and deterministic.
    const a = op.run({ entity: "pc" }, createRng("same"), registry);
    const b = op.run({ entity: "pc" }, createRng("same"), registry);
    expect(a.total).toBe(b.total);
  });
});

describe("resolveHit: the armor rule (p. 62, 67, 71, 75, 76)", () => {
  it("adds 1 damage per extra success: the Rexim example hits for 2 (p. 67)", () => {
    expect(hit({ damage: 1, extraSuccesses: 1 }).damage).toBe(2);
  });
  it("subtracts the armor level from damage, never below zero, with no dice", () => {
    const r = hit({ damage: 2, extraSuccesses: 1, armor: 2 });
    expect(r.damage).toBe(1);
    expect(r.rolls).toBeUndefined();
    expect(r.explain).toContain("p. 67");
    expect(hit({ damage: 1, armor: 2 }).damage).toBe(0);
  });
  it("counts armor one step lower against armor piercing, to a minimum of zero", () => {
    expect(hit({ damage: 2, armor: 2, armorPiercing: true }).damage).toBe(1);
    expect(hit({ damage: 2, armor: 0, armorPiercing: true }).damage).toBe(2);
    expect(hit({ damage: 1, armor: 1, armorPiercing: true }).explain).toContain("armor piercing");
  });
  it("lowers armor one step more for a weak spot, after armor piercing", () => {
    expect(hit({ damage: 2, armor: 3, armorPiercing: true, weakSpot: true }).damage).toBe(1);
    expect(hit({ damage: 2, armor: 1, armorPiercing: true, weakSpot: true }).damage).toBe(2);
  });
  it("uses the armor given for fire (the creature's armor vs fire) as normal", () => {
    // A Drone has Armor Level 2, 1 vs fire (p. 217): the table passes armorVsFire for fire hits.
    const drone = creatures.find((c) => c.id === "alien.creature.xx121-drone")!;
    expect(drone.fields.armorVsFire).toBe(1);
    const r = hit({ damage: 2, extraSuccesses: 1, armor: drone.fields.armorVsFire as number, source: "fire" });
    expect(r.damage).toBe(2);
    expect(r.explain).toContain("vs fire");
  });
  it("ignores armor for falls and takes no Health for stun", () => {
    expect(hit({ damage: 3, armor: 2, source: "fall" }).damage).toBe(3);
    const stun = hit({ damage: 2, extraSuccesses: 1, armor: 1, source: "stun" });
    expect(stun.damage).toBe(0);
    expect(stun.explain).toContain("STAMINA at −2");
  });
  it("is reachable through the contract and deterministic", () => {
    const rng = createRng("x");
    expect(combat.resolveHit!({ damage: 2, armor: 1 }, rng)).toEqual(combat.resolveHit!({ damage: 2, armor: 1 }, rng));
  });
});

describe("creature turns (p. 208-210)", () => {
  it("covers alien.creature with Speed and the signature attack table", () => {
    expect(combat.creatureTurns).toEqual([creatureTurn]);
    expect(creatureTurn).toMatchObject({ entityType: "alien.creature", speedPath: "speed", attackTablePath: "attackTable", page: 208 });
    expect(creatureTurn.notes!.length).toBeGreaterThan(5);
    for (const n of creatureTurn.notes!) expect(n.page, n.text).toBeDefined();
  });

  it("resolves every creature attack table to a registered D6 table with attack-shaped rows", () => {
    const withTable = creatures.filter((c) => typeof c.fields.attackTable === "string");
    expect(withTable.length).toBeGreaterThan(15);
    for (const c of withTable) {
      const table = alienModule.tables.find((t) => t.id === c.fields.attackTable);
      expect(table, `${c.id} -> ${String(c.fields.attackTable)}`).toBeDefined();
      expect(table!.dice).toBe("1d6");
      expect(table!.page).toBeDefined();
      for (const row of table!.rows) {
        const res = row.result as Record<string, unknown>;
        expect(typeof res.name, `${table!.id} ${row.label}`).toBe("string");
        expect(typeof res.dice).toBe("number");
        expect(["number", "string"]).toContain(typeof res.damage);
        expect(typeof res.armorPiercing).toBe("boolean");
        expect(typeof res.effect).toBe("string");
      }
    }
  });

  it("splashes acid with dice = rating + damage taken (capped at max Health), damage 1, not from fire (p. 210)", () => {
    expect(creatureTurn.onDamaged).toBe(acidSplash);
    expect(acidSplash).toMatchObject({ ratingPath: "acidSplash", addDamageTaken: true, damageTakenCapPath: "health", damage: 1, exceptSources: ["fire"], page: 210 });
    expect(acidSplash.reach).toContain("Adjacent");
    const dice = (c: EntityPreset, taken: number) =>
      (c.fields[acidSplash.ratingPath] as number) + (acidSplash.addDamageTaken ? Math.min(taken, c.fields[acidSplash.damageTakenCapPath!] as number) : 0);
    // The book's example: rating 8, 5 damage from a Smartgun = 13 base dice.
    const drone = creatures.find((c) => c.id === "alien.creature.xx121-drone")!;
    expect(drone.fields.acidSplash).toBe(8);
    expect(dice(drone, 5)).toBe(13);
    expect(dice(drone, 20)).toBe(8 + 7);
  });

  it("gives an Acid Splash rating to every XX121 with stats and to nothing else", () => {
    for (const c of creatures) {
      if (c.fields.loreOnly) continue;
      expect(typeof c.fields.acidSplash === "number", c.id).toBe(c.fields.species === "xx121");
    }
  });
});

describe("special attacks (p. 62)", () => {
  const rollIds = new Set([...SKILL_IDS, ...ATTRIBUTE_IDS.map((a) => `attr:${a}`)]);

  it("lists the book's four close combat special attacks", () => {
    expect(combat.specialAttacks).toBe(specialAttacks);
    expect(specialAttacks.map((s) => s.name)).toEqual(["Disarm", "Pass", "Shove", "Grapple"]);
  });

  it("rolls valid ids as a full action, opposed by a defend roll, with a page and an effect", () => {
    const ids = new Set<string>();
    for (const s of specialAttacks) {
      expect(ids.has(s.id)).toBe(false);
      ids.add(s.id);
      expect(rollIds.has(s.roll), s.roll).toBe(true);
      if (s.opposed) expect(rollIds.has(s.opposed), s.opposed).toBe(true);
      expect(s.roll).toBe("closeCombat");
      expect(s.action).toBe("full");
      expect(s.page).toBe(62);
      expect(s.effect.length).toBeGreaterThan(20);
      expect(s.requires).toContain("Adjacent");
    }
  });
});

describe("conformance", () => {
  it("still passes the sdk suite", () => {
    const report = checkModule(alienModule, { skipProcedureRuns: true });
    expect(report.issues.filter((i) => i.severity === "error").map((e) => `${e.where}: ${e.message}`)).toEqual([]);
  });
});
