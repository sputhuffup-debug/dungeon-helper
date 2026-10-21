import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  checkDeterminism,
  computeFields,
  createRng,
  loadModule,
  moduleFromPackSource,
  packFromSource,
  runProcedure,
  type EntityTypeDef,
  type GameModule,
  type GeneratedGraph,
  type LoadedModule,
  type ReferenceItem,
} from "@campaign-forge/module-sdk";
import { beforeAll, describe, expect, it } from "vitest";
import { dnd5eSrdSource } from "../src";

const PACK_DIR = join(__dirname, "../pack");
const ATTRIBUTION =
  'This work includes material taken from the System Reference Document 5.1 ("SRD 5.1") by Wizards of the Coast LLC and available at https://dnd.wizards.com/resources/systems-reference-document. The SRD 5.1 is licensed under the Creative Commons Attribution 4.0 International License available at https://creativecommons.org/licenses/by/4.0/legalcode.';

let module: GameModule;
let loaded: LoadedModule;

beforeAll(async () => {
  module = await moduleFromPackSource(dnd5eSrdSource);
  loaded = loadModule(module, { seeds: 50 });
}, 60_000);

const list = (id: string) => {
  const l = loaded.referenceList(`dnd5e-srd.${id}`);
  if (!l) throw new Error(`no list ${id}`);
  return l;
};
const item = (listId: string, id: string): ReferenceItem => {
  const i = list(listId).items.find((x) => x.id === id);
  if (!i) throw new Error(`no ${id} in ${listId}`);
  return i;
};
const pc = (): EntityTypeDef => loaded.entityType("dnd5e-srd.character")!;
/** Every step whose result is an object (more than a label or name) shows the GM a line of its own, never a preset id or the result's keys. */
function expectReadableSteps(graph: GeneratedGraph): void {
  for (const [step, result] of Object.entries(graph.results)) {
    // a bare label or name already reads as itself
    if (result === null || typeof result !== "object" || Object.keys(result).every((k) => k === "label" || k === "name")) continue;
    const line = graph.display?.[step];
    expect(line, `${graph.procedure} step ${step}`).toBeTruthy();
    expect(line).not.toMatch(/dnd5e\-srd\.|preset|\b[a-z]\w*: (-?\d|\{)/);
  }
}

const monster = (): EntityTypeDef => loaded.entityType("dnd5e-srd.monster")!;
const preset = (name: string) => {
  const p = module.presets.find((x) => x.name === name);
  if (!p) throw new Error(`no preset ${name}`);
  return p;
};

/** A level-N character of a class with the given ability scores (default 10). */
function character(fields: Record<string, unknown>): Record<string, unknown> {
  const abilities = { strength: 10, dexterity: 10, constitution: 10, intelligence: 10, wisdom: 10, charisma: 10, ...(fields.abilities as object) };
  return { level: 1, hp: { max: 8, current: 8, temp: 0 }, ...fields, abilities };
}

describe("SRD 5.1 data pack", () => {
  it("loads its files lazily and passes conformance with no errors or warnings", async () => {
    const pack = await packFromSource(dnd5eSrdSource);
    expect(pack.parts).toBeUndefined();
    expect(loaded.report.issues).toEqual([]);
  });

  it("is deterministic: every generator and roll gives the same result twice", () => {
    expect(checkDeterminism(module, { seeds: 10 })).toEqual([]);
  });

  it("ships the SRD 5.1 licence and attribution exactly", () => {
    expect(module.manifest.license).toEqual({ spdx: "CC-BY-4.0", name: "Creative Commons Attribution 4.0 International", url: "https://creativecommons.org/licenses/by/4.0/", attribution: ATTRIBUTION });
    expect(module.manifest.citationStyle).toBe("section");
    const notice = readFileSync(join(__dirname, "../NOTICE"), "utf8");
    expect(notice).toContain(ATTRIBUTION);
    expect(notice).toContain("Copyright (c) [2018-2020] [Adrian Padua, Christopher Ward]");
    expect(readFileSync(join(__dirname, "../README.md"), "utf8")).toContain(ATTRIBUTION);
  });

  it("keeps every pack file under 2 MB and free of trademarks used as a name", () => {
    for (const f of readdirSync(PACK_DIR)) {
      const text = readFileSync(join(PACK_DIR, f), "utf8");
      expect(Buffer.byteLength(text), f).toBeLessThan(2 * 1024 * 1024);
      expect(text, f).not.toMatch(/Dungeons\s*&\s*Dragons|\bD&D\b|Forgotten Realms|Greyhawk/);
      // No API urls or image paths from the source.
      expect(text, f).not.toMatch(/"image":|\/api\/(2014|images)\//);
    }
  });

  it("has the whole SRD: 334 monsters, 319 spells, 362 magic items, 12 classes", () => {
    expect(module.presets.filter((p) => p.entityType === "dnd5e-srd.monster")).toHaveLength(334);
    expect(list("spells").items).toHaveLength(319);
    expect(list("magic-items").items).toHaveLength(362);
    expect(list("classes").items).toHaveLength(12);
    expect(list("conditions").items).toHaveLength(15);
    expect(list("skills").items).toHaveLength(18);
    expect(module.rules.filter((r) => r.cite?.startsWith("SRD 5.1")).length).toBeGreaterThan(140);
  });

  it("spot-checks monsters against the source", () => {
    const goblin = preset("Goblin");
    expect(goblin.fields).toMatchObject({ ac: 15, acNote: "leather armor, shield", hp: { max: 7, current: 7 }, hitDice: "2d6", cr: 0.25, xp: 50, size: "Small", creatureType: "humanoid" });
    expect(goblin.fields.skills).toEqual({ stealth: 2 });
    const c = computeFields(monster(), goblin.fields);
    expect(c).toMatchObject({ crLabel: "1/4", proficiencyBonus: 2, stealthBonus: 6, passivePerception: 9, dexterityMod: 2 });
    const dragon = preset("Adult Red Dragon");
    const d = computeFields(monster(), dragon.fields);
    expect(d).toMatchObject({ proficiencyBonus: 6, constitutionSave: 13, dexteritySave: 6, perceptionBonus: 13, passivePerception: 23, stealthBonus: 6 });
    expect((dragon.fields.actions as Array<{ name: string }>).map((a) => a.name)).toContain("Fire Breath (Recharge 5–6)");
    expect(dragon.fields.legendaryActions).toHaveLength(3);
    // The Lich's Arcana +18 is not ability + proficiency multiple; the difference is a flat bonus.
    expect(computeFields(monster(), preset("Lich").fields).arcanaBonus).toBe(18);
  });

  it("spot-checks spells and equipment", () => {
    expect(item("spells", "fireball")).toMatchObject({ level: 3, school: "Evocation", castingTime: "1 action", range: "150 feet", damage: "8d6 fire", savingThrow: "Dexterity", concentration: false });
    expect(item("spells", "fireball").description).toContain("20-foot-radius sphere");
    expect(item("spells", "bless")).toMatchObject({ concentration: true, duration: "Concentration, up to 1 minute" });
    expect(item("weapons", "longsword")).toMatchObject({ damage: "1d8 slashing", properties: "versatile (1d10)", cost: "15 gp" });
    expect(item("armor", "chain-mail")).toMatchObject({ armorClass: "16", strength: "Str 13", stealth: "Disadvantage" });
    expect(item("classes", "wizard")).toMatchObject({ hitDie: "d6", savingThrows: "Intelligence, Wisdom", spellcasting: "Intelligence" });
  });

  it("derives the character sheet: proficiency by level, skills with proficiency and expertise", () => {
    const wizard5 = computeFields(pc(), character({ class: "wizard", level: 5, abilities: { intelligence: 16 } }));
    expect(wizard5).toMatchObject({ proficiencyBonus: 3, spellAbility: "intelligence", spellSaveDc: 14, spellAttack: "+6", slotMax1: 4, slotMax2: 3, slotMax3: 2, slotMax4: 0, hitDie: "d6" });
    const rogue = character({ class: "rogue", level: 1, abilities: { dexterity: 14 }, skills: { stealth: 1 } });
    expect(computeFields(pc(), rogue).stealthBonus).toBe(4);
    expect(computeFields(pc(), { ...rogue, skills: { stealth: 2 } }).stealthBonus).toBe(6);
    expect(computeFields(pc(), { ...rogue, saves: { "dexterity-save": 1 } }).dexteritySave).toBe(4);
    expect(computeFields(pc(), { ...rogue, abilities: { ...(rogue.abilities as object), wisdom: 14 }, skills: { perception: 1 } }).passivePerception).toBe(14);
    expect(computeFields(pc(), character({ level: 9 })).proficiencyBonus).toBe(4);
    expect(computeFields(pc(), character({ level: 17 })).proficiencyBonus).toBe(6);
    expect(computeFields(pc(), character({ class: "paladin", level: 1 })).slotMax1).toBe(0);
    expect(computeFields(pc(), character({ class: "paladin", level: 2 })).slotMax1).toBe(2);
    expect(computeFields(pc(), character({ class: "warlock", level: 5 }))).toMatchObject({ slotMax1: 0, slotMax3: 2 });
    expect(computeFields(pc(), character({ class: "fighter", level: 3, abilities: { constitution: 14 } }))).toMatchObject({ hitDie: "d10", suggestedHpMax: 28, spellSaveDc: null, slotMax1: 0 });
  });

  it("rolls skills with the right modifier, matching the computed bonus", () => {
    const dice = module.dice;
    const fields = character({ class: "rogue", level: 1, abilities: { dexterity: 14 }, skills: { stealth: 2, perception: 1 }, saves: { "dexterity-save": 1 }, bonuses: { perception: 1 } });
    const computed = computeFields(pc(), fields);
    const input = (skillId: string, skill: number, attributeId: string) => ({ attribute: (fields.abilities as Record<string, number>)[attributeId], skill, skillId, attributeId, fields, computed });
    expect(dice.buildPool(input("stealth", 2, "dexterity")).modifier).toBe(computed.stealthBonus);
    expect(dice.buildPool(input("perception", 1, "wisdom")).modifier).toBe(computed.perceptionBonus);
    expect(dice.buildPool(input("dexterity-save", 1, "dexterity")).modifier).toBe(computed.dexteritySave);
    expect(dice.buildPool({ attribute: 14, skill: 0, attributeId: "dexterity", fields, computed }).modifier).toBe(2);
  });

  it("rolls d20 deterministically, keeping the higher die with advantage and the lower with disadvantage", () => {
    const dice = module.dice;
    const base = { attribute: 14, skill: 1, skillId: "stealth", attributeId: "dexterity", fields: character({}), computed: { proficiencyBonus: 2 } };
    for (let i = 0; i < 30; i++) {
      const adv = dice.roll(dice.buildPool({ ...base, advantage: "advantage", dc: 15 }), createRng(`adv-${i}`));
      expect(dice.roll(dice.buildPool({ ...base, advantage: "advantage", dc: 15 }), createRng(`adv-${i}`))).toEqual(adv);
      const kept = adv.dice.find((d) => !d.dropped)!;
      const dropped = adv.dice.find((d) => d.dropped)!;
      expect(adv.dice).toHaveLength(2);
      expect(kept.value).toBeGreaterThanOrEqual(dropped.value);
      expect(adv.total).toBe(kept.value + 4);
      expect(adv.outcome?.id).toBe(adv.total! >= 15 ? "success" : "failure");
      const dis = dice.roll(dice.buildPool({ ...base, advantage: "disadvantage" }), createRng(`adv-${i}`));
      expect(dis.dice.find((d) => !d.dropped)!.value).toBeLessThanOrEqual(dis.dice.find((d) => d.dropped)!.value);
    }
  });

  it("generates an encounter whose creatures carry their whole SRD stat block", () => {
    const proc = loaded.procedure("dnd5e-srd.proc.encounter")!;
    for (const terrain of ["forest", "underground", "urban"]) {
      for (const partyLevel of [1, 7, 13, 19]) {
        const graph = runProcedure(proc, module, { seed: `enc-${terrain}-${partyLevel}`, inputs: { terrain, partyLevel } });
        const encounter = graph.produced.entities.find((e) => e.type === "dnd5e-srd.encounter")!;
        const creatures = graph.produced.entities.filter((e) => e.type === "dnd5e-srd.monster");
        expect(creatures.length).toBeGreaterThan(0);
        expect(encounter.fields.creatures).toMatch(new RegExp(`^${creatures.length} × `));
        for (const c of creatures) {
          const p = module.presets.find((x) => x.id === c.preset)!;
          expect(p.fields).toMatchObject({ ac: c.fields.ac, abilities: c.fields.abilities });
          expect(graph.produced.relationships).toContainEqual({ type: "appears_in", from: c.tempId, to: "encounter" });
        }
        // The steps read as the GM would say them.
        expectReadableSteps(graph);
        const foe = graph.results.foe as { name: string; cr: number; xp: number };
        expect(graph.display?.foe).toBe(`${foe.name} (CR ${foe.cr}, ${foe.xp} XP each)`);
        expect(graph.display?.group).toBe(`${creatures.length} × ${foe.name}`);
        // Creatures come from the right level band.
        const crs = creatures.map((c) => Number(c.fields.cr));
        const band = partyLevel <= 4 ? [0, 3] : partyLevel <= 10 ? [1, 8] : partyLevel <= 16 ? [4, 15] : [9, 30];
        for (const cr of crs) expect(cr >= band[0]! && cr <= band[1]!, `${terrain} level ${partyLevel}: CR ${cr}`).toBe(true);
      }
    }
  });

  it("generates NPCs and settlements", () => {
    const npc = runProcedure(loaded.procedure("dnd5e-srd.proc.npc")!, module, { seed: "npc-1" });
    expect(npc.produced.entities[0]).toMatchObject({ type: "dnd5e-srd.npc", fields: { attitude: "indifferent" } });
    expect(module.presets.some((p) => p.name === npc.produced.entities[0]!.fields.statBlock)).toBe(true);
    const town = runProcedure(loaded.procedure("dnd5e-srd.proc.settlement")!, module, { seed: "town-1" });
    expect(town.produced.entities.map((e) => e.type)).toEqual(["dnd5e-srd.location", "dnd5e-srd.location", "dnd5e-srd.npc", "dnd5e-srd.quest"]);
    expect(town.produced.entities[1]!.name).toMatch(/^The \w+ \w+$/);
    for (const g of [npc, town]) expectReadableSteps(g);
  });

  it("marks everything it wrote itself as original, and cites everything from the SRD by section", () => {
    for (const t of module.tables) expect(t.original === true || /^SRD 5\.1 — /.test(t.cite ?? ""), t.id).toBe(true);
    for (const r of module.rules) expect(r.original === true || /^SRD 5\.1 — /.test(r.cite ?? ""), r.id).toBe(true);
    for (const p of module.presets) expect(p.cite, p.id).toMatch(/^SRD 5\.1 — Monsters: /);
    for (const t of module.templates) expect(t.original, t.id).toBe(true);
    for (const l of module.referenceLists) expect(l.cite, l.id).toMatch(/^SRD 5\.1 — /);
    expect(module.playGuides?.every((g) => g.original)).toBe(true);
    // The SRD's own dice tables become roll tables.
    expect(loaded.table("dnd5e-srd.madness.short-term-madness")?.rows).toHaveLength(10);
  });
});
