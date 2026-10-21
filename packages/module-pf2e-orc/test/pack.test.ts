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
  type DicePool,
  type EntityTypeDef,
  type GameModule,
  type LoadedModule,
  type ReferenceItem,
  type RollResult,
} from "@campaign-forge/module-sdk";
import { beforeAll, describe, expect, it } from "vitest";
import { ATTRIBUTION_LINES, ORC_NOTICE, TRADEMARK_NOTICE } from "../scripts/authored/manifest.ts";
import { anyReservedPattern, RESERVED } from "../scripts/source/reserved.ts";
import { pf2eOrcSource } from "../src";

const PACK_DIR = join(__dirname, "../pack");

let module: GameModule;
let loaded: LoadedModule;

beforeAll(async () => {
  module = await moduleFromPackSource(pf2eOrcSource);
  loaded = loadModule(module, { seeds: 40 });
}, 120_000);

const list = (id: string) => {
  const l = loaded.referenceList(`pf2e-orc.${id}`);
  if (!l) throw new Error(`no list ${id}`);
  return l;
};
const item = (listId: string, name: string): ReferenceItem => {
  const i = list(listId).items.find((x) => x.name === name);
  if (!i) throw new Error(`no ${name} in ${listId}`);
  return i;
};
const preset = (name: string) => {
  const p = module.presets.find((x) => x.name === name);
  if (!p) throw new Error(`no preset ${name}`);
  return p;
};
const pcType = (): EntityTypeDef => loaded.entityType("pf2e-orc.character")!;

/** A level-N character with the given attribute modifiers (default 0) and ranks. */
function character(fields: Record<string, unknown>): Record<string, unknown> {
  const attributes = { strength: 0, dexterity: 0, constitution: 0, intelligence: 0, wisdom: 0, charisma: 0, ...(fields.attributes as object) };
  return { level: 1, hp: { current: 10, temp: 0 }, ...fields, attributes };
}

/** Roll a pool with seeds until the d20 shows `natural`. */
function rollNatural(pool: DicePool, natural: number): RollResult {
  for (let i = 0; i < 3000; i++) {
    const r = module.dice.roll(pool, createRng(`nat-${natural}-${i}`));
    if (r.dice.find((d) => !d.dropped)?.value === natural) return r;
  }
  throw new Error(`no seed rolls a natural ${natural}`);
}

describe("Fantasy d20 Remaster (ORC) data pack", () => {
  it("loads its files lazily and passes conformance with no errors or warnings", async () => {
    const pack = await packFromSource(pf2eOrcSource);
    expect(pack.parts).toBeUndefined();
    expect(loaded.report.issues).toEqual([]);
  });

  it("is deterministic: every generator and roll gives the same result twice", () => {
    expect(checkDeterminism(module, { seeds: 8 })).toEqual([]);
  });

  it("ships the ORC notice, the attribution notices and the trademark disclaimer", () => {
    const license = module.manifest.license!;
    expect(license).toMatchObject({ spdx: "LicenseRef-ORC", name: "ORC License", url: "https://paizo.com/orclicense" });
    expect(license.attribution).toContain(ORC_NOTICE);
    for (const l of ATTRIBUTION_LINES) expect(license.attribution).toContain(l);
    expect(license.attribution).toContain(TRADEMARK_NOTICE);
    expect(module.manifest.name).toBe("Fantasy d20 Remaster (ORC)");
    expect(module.manifest.name).not.toMatch(/Pathfinder/);
    expect(module.manifest.citationStyle).toBe("section");
    const notice = readFileSync(join(__dirname, "../NOTICE"), "utf8");
    const readme = readFileSync(join(__dirname, "../README.md"), "utf8");
    for (const text of [notice, readme]) {
      expect(text).toContain(ORC_NOTICE);
      for (const l of ATTRIBUTION_LINES) expect(text).toContain(l);
      expect(text).toContain("Not affiliated with or endorsed by Paizo Inc. Pathfinder is a trademark of Paizo Inc.");
    }
    expect(notice).toContain("TODO(owner)");
    expect(notice).toContain("Apache License");
    expect(readme).toMatch(/Commit: `[0-9a-f]{40}`/);
  });

  it("keeps every pack file small, and free of images, Foundry markup and Reserved Material", () => {
    // the combined pattern matches whole words only
    expect("Golarion's skies, Golarionish, Absalom.".match(anyReservedPattern("g"))).toEqual(["Golarion", "Absalom"]);
    const files = readdirSync(PACK_DIR);
    expect(files.length).toBeLessThanOrEqual(64);
    for (const f of files) {
      const raw = readFileSync(join(PACK_DIR, f), "utf8");
      expect(Buffer.byteLength(raw), f).toBeLessThan(2 * 1024 * 1024);
      expect(Buffer.byteLength(JSON.stringify(JSON.parse(raw))), `${f} (minified)`).toBeLessThan(500_000);
      expect(raw, f).not.toMatch(/"img":|\.webp|\.svg"|systems\/pf2e|@UUID|@Check|@Damage|@Template|@Localize|\[\[\/|<\/?(p|strong|span)\b/);
      // The manifest carries the attribution (which names the books); everything else must not name the setting or the trademark.
      const data = JSON.parse(raw) as Record<string, unknown>;
      delete data.manifest;
      const text = JSON.stringify(data);
      expect(text.match(anyReservedPattern("g")) ?? [], `${f} contains Reserved Material`).toEqual([]);
    }
  });

  it("has the four core books' ORC content: 490 creatures, 32 hazards, 43 conditions, 16 classes and ancestries", () => {
    expect(module.presets.filter((p) => p.entityType === "pf2e-orc.creature")).toHaveLength(490);
    expect(module.presets.filter((p) => p.entityType === "pf2e-orc.hazard")).toHaveLength(32);
    expect(list("conditions").items).toHaveLength(43);
    expect(list("classes").items).toHaveLength(16);
    expect(list("ancestries").items).toHaveLength(16);
    expect(list("heritages").items.length).toBe(106);
    expect(list("backgrounds").items.length).toBe(63);
    expect(list("actions").items.length).toBe(166);
    const spells = module.referenceLists.filter((l) => l.id.startsWith("pf2e-orc.spells.")).reduce((n, l) => n + l.items.length, 0);
    expect(spells).toBe(663);
    const feats = new Set(module.referenceLists.filter((l) => l.id.startsWith("pf2e-orc.feats.")).flatMap((l) => l.items.map((i) => i.name)));
    expect(feats.size).toBeGreaterThan(1750);
    // Reserved Material and unique named creatures are gone.
    for (const name of ["Treerazer", "Grim Reaper"]) expect(module.presets.some((p) => p.name === name), name).toBe(false);
    expect(module.referenceLists.flatMap((l) => l.items).some((i) => /Sorshen|First World|Boneyard/.test(i.name))).toBe(false);
    expect(RESERVED.length).toBeGreaterThan(250);
  });

  it("spot-checks Monster Core stat blocks against the source", () => {
    const goblin = preset("Goblin Warrior");
    expect(goblin.cite).toBe("Monster Core — Creatures: Goblin Warrior");
    expect(goblin.fields).toMatchObject({ level: -1, size: "Small", ac: 16, hp: { max: 6, current: 6 }, saves: { perception: 2, fortitude: 5, reflex: 7, will: 3 }, speed: "25 feet", senses: "darkvision" });
    expect(goblin.fields.skills).toEqual({ acrobatics: 5, athletics: 2, nature: 1, stealth: 5 });
    expect(goblin.fields.attributes).toEqual({ strength: 0, dexterity: 3, constitution: 1, intelligence: 0, wisdom: -1, charisma: 1 });
    expect(goblin.fields.strikes).toEqual([
      { name: "Dogslicer", type: "melee", bonus: "+7 [+3/−1]", traits: "agile, backstabber, finesse", damage: "1d6 slashing" },
      { name: "Shortbow", type: "ranged", bonus: "+7 [+2/−3]", traits: "deadly d10, reload 0, range increment 60 feet", damage: "1d6 piercing" },
    ]);
    expect((goblin.fields.defenses as Array<{ name: string }>)[0]!.name).toBe("Goblin Scuttle ↺");
    const dragon = preset("Adamantine Dragon (Adult, Spellcaster)");
    expect(dragon.fields).toMatchObject({ level: 13, size: "Huge", ac: 33, hp: { max: 220 }, saves: { perception: 23, fortitude: 25, reflex: 20, will: 23 }, speed: "30 feet, burrow 40 feet, fly 150 feet" });
    expect((dragon.fields.actions as Array<{ name: string; desc: string }>).find((a) => a.name.startsWith("Avalanche Breath"))).toMatchObject({ name: "Avalanche Breath ◆◆" });
    expect((dragon.fields.spells as Array<{ name: string; desc: string }>)[0]!.desc).toMatch(/^DC 34, attack \+27; \*\*6th\*\* Petrify, Tangling Creepers;/);
    const pit = preset("Hidden Pit");
    expect(pit.fields).toMatchObject({ level: 0, complexity: "simple", stealth: 8, ac: 10, hardness: 3, hp: { max: 12 }, disable: "DC 12 Thievery to remove the trapdoor" });
    expect(computeFields(loaded.entityType("pf2e-orc.hazard")!, pit.fields)).toMatchObject({ stealthDc: 18, brokenThreshold: 6 });
  });

  it("spot-checks spells, equipment, conditions and character options", () => {
    expect(item("spells.rank-3-4", "Fireball")).toMatchObject({ rank: 3, rankText: "3rd rank", traditions: "arcane, primal", traits: "concentrate, fire, manipulate", cast: "◆◆", range: "500 feet", area: "20-foot burst", defense: "basic Reflex" });
    expect(item("spells.rank-3-4", "Fireball").description).toContain("**Heightened (+1)** The damage increases by 2d6.");
    expect(item("spells.rank-1-2", "Heal")).toMatchObject({ cast: "◆ to ◆◆◆", traditions: "divine, primal", defense: "basic Fortitude" });
    expect(item("equipment.weapons", "Longsword")).toMatchObject({ price: "1 gp", bulk: "1", damage: "1d8 S", category: "martial", group: "sword", traits: "versatile P" });
    expect(item("equipment.armor", "Full Plate")).toMatchObject({ acBonus: "+6", dexCap: "+0", strength: "+4", checkPenalty: "−3", speedPenalty: "−10 ft.", bulk: "4", price: "30 gp" });
    expect(item("conditions", "Frightened")).toMatchObject({ valued: "yes", cite: "Player Core — Conditions: Frightened" });
    expect(item("ancestries", "Dwarf")).toMatchObject({ hp: 10, size: "Medium", speed: "20 feet", boosts: "Constitution, Wisdom, free", flaws: "Charisma" });
    expect(item("classes", "Fighter")).toMatchObject({ hp: 10, keyAttribute: "Dexterity or Strength", perception: "Expert", saves: "Fortitude Expert, Reflex Expert, Will Trained" });
    expect(item("backgrounds", "Acolyte")).toMatchObject({ boosts: "Intelligence or Wisdom, free", skills: "Religion, Scribing Lore", feat: "Student of the Canon" });
    expect(item("feats.class-fighter", "Reactive Shield")).toMatchObject({ level: 1, actions: "↺" });
    // Foundry inline rolls become plain text.
    expect(loaded.rule("pf2e-orc.rule.action.strike")!.summary).toContain("**Critical Success**");
  });

  it("derives a Player Core character: proficiency by rank and level, AC, HP, class DC, Bulk", () => {
    const pc = pcType();
    const fighter = character({
      level: 3,
      ancestry: "dwarf",
      class: "fighter",
      keyAttribute: "strength",
      attributes: { strength: 4, dexterity: 1, constitution: 2, wisdom: 1, charisma: -1 },
      saves: { perception: 2, fortitude: 2, reflex: 2, will: 1 },
      skills: { athletics: 1, intimidation: 2 },
      defenses: { unarmored: 1, light: 1, medium: 1, heavy: 1 },
      armor: { category: "heavy", acBonus: 6, dexCap: 0 },
      shield: { acBonus: 2 },
      classDcRank: 1,
      inventory: [{ name: "Full Plate", quantity: 1, bulk: 4 }, { name: "Rations", quantity: 12, bulk: 0.1 }],
    });
    // untrained +0; trained/expert/master/legendary = level + 2/4/6/8
    expect(computeFields(pc, fighter)).toMatchObject({
      perceptionTotal: 1 + 3 + 4,
      fortitudeTotal: 2 + 3 + 4,
      willTotal: 1 + 3 + 2,
      athleticsTotal: 4 + 3 + 2,
      intimidationTotal: -1 + 3 + 4,
      stealthTotal: 1,
      hpMax: 10 + (10 + 2) * 3,
      ac: 10 + 0 + (3 + 2) + 6,
      acShieldRaised: 23,
      classDc: 10 + 4 + 5,
      totalBulk: 5,
      encumberedAt: 9,
      maxBulk: 14,
      bulkStatus: "unencumbered",
      initiative: 8,
      spellDc: null,
    });
    const legend = computeFields(pc, character({ level: 20, attributes: { dexterity: 4 }, skills: { stealth: 4, acrobatics: 3 } }));
    expect([legend.stealthTotal, legend.acrobaticsTotal]).toEqual([4 + 20 + 8, 4 + 20 + 6]);
    const wizard = computeFields(pc, character({ level: 5, ancestry: "elf", class: "wizard", attributes: { intelligence: 4, constitution: 1, dexterity: 2 }, defenses: { unarmored: 1 }, spellcasting: { tradition: "arcane", attribute: "intelligence", rank: 1 } }));
    expect(wizard).toMatchObject({ spellDc: 10 + 4 + 7, spellAttack: "+11", hpMax: 6 + (6 + 1) * 5, ac: 10 + 2 + 7 });
    expect(computeFields(pc, character({ doomed: 1, dying: 2 }))).toMatchObject({ dyingMax: 3, recoveryDc: 12 });
    expect(computeFields(pc, character({ attributes: { strength: 0 }, inventory: [{ name: "Anvil", quantity: 1, bulk: 11 }] })).bulkStatus).toBe("over the maximum: cannot carry more");
  });

  it("rolls a character's checks with the sheet's totals, and a creature's from its stat block", () => {
    const pc = pcType();
    const fields = character({ level: 4, attributes: { dexterity: 3, wisdom: 2 }, saves: { perception: 2, reflex: 1 }, skills: { stealth: 3 }, bonuses: { stealth: 1 } });
    const computed = computeFields(pc, fields);
    const input = (skillId: string, skill: number, attributeId: string) => ({ attribute: (fields.attributes as Record<string, number>)[attributeId], skill, skillId, attributeId, fields, computed });
    expect(module.dice.buildPool(input("stealth", 3, "dexterity")).modifier).toBe(computed.stealthTotal);
    expect(module.dice.buildPool(input("perception", 2, "wisdom")).modifier).toBe(computed.perceptionTotal);
    expect(module.dice.buildPool(input("reflex", 1, "dexterity")).modifier).toBe(computed.reflexTotal);
    expect(module.dice.buildPool(input("athletics", 0, "strength")).modifier).toBe(0);
    const goblin = preset("Goblin Warrior");
    const gc = computeFields(loaded.entityType("pf2e-orc.creature")!, goblin.fields);
    expect(gc).toMatchObject({ statBlock: true, initiative: 2 });
    expect(module.dice.buildPool({ attribute: 0, skill: 5, skillId: "stealth", fields: goblin.fields, computed: gc }).modifier).toBe(5);
  });

  it("reads rolls as four degrees of success, with natural 20 and natural 1 shifting one step", () => {
    const pool = (modifier: number, dc: number) => module.dice.buildPool({ attribute: modifier, skill: 0, dc });
    expect(rollNatural(pool(10, 20), 10).outcome).toMatchObject({ id: "success", label: "Success" });
    expect(rollNatural(pool(10, 10), 10).outcome).toMatchObject({ id: "critical-success", label: "Critical success" });
    expect(rollNatural(pool(0, 15), 6).outcome).toMatchObject({ id: "failure" });
    expect(rollNatural(pool(0, 15), 5).outcome).toMatchObject({ id: "critical-failure", label: "Critical failure" });
    expect(rollNatural(pool(5, 30), 20).outcome).toMatchObject({ id: "success", label: "Success (natural 20)" });
    expect(rollNatural(pool(0, 15), 20).outcome).toMatchObject({ id: "critical-success" });
    expect(rollNatural(pool(19, 10), 1).outcome).toMatchObject({ id: "success", label: "Success (natural 1)" });
    expect(rollNatural(pool(5, 10), 1).outcome).toMatchObject({ id: "critical-failure" });
    const options = module.dice.rollOptions!.properties as Record<string, { enum?: string[] }>;
    expect(options.advantage!.enum).toEqual(["normal", "fortune", "misfortune"]);
    expect(options.map!.enum).toEqual(["1st attack", "2nd attack (−5)", "3rd attack (−10)", "2nd attack, agile (−4)", "3rd attack, agile (−8)"]);
    expect(module.dice.buildPool({ attribute: 9, skill: 0, map: "2nd attack, agile (−4)" }).modifier).toBe(5);
    const fortune = module.dice.roll(module.dice.buildPool({ attribute: 0, skill: 0, advantage: "fortune" }), createRng("fortune"));
    expect(fortune.total).toBe(Math.max(...fortune.dice.map((d) => d.value)));
  });

  it("builds encounters that spend GM Core's XP budget on Monster Core creatures", () => {
    const proc = loaded.procedure("pf2e-orc.proc.encounter")!;
    const budget = (threat: string, size: number) => ({ trivial: 40, low: 60, moderate: 80, severe: 120, extreme: 160 })[threat]! + (size - 4) * ({ trivial: 10, low: 20, moderate: 20, severe: 30, extreme: 40 })[threat]!;
    for (const threat of ["trivial", "low", "moderate", "severe", "extreme"]) {
      for (const partySize of [2, 4, 6]) {
        for (const partyLevel of [1, 2, 3, 9, 17, 18, 19, 20]) {
          const graph = runProcedure(proc, module, { seed: `enc-${threat}-${partySize}-${partyLevel}`, inputs: { partyLevel, partySize, threat } });
          const encounter = graph.produced.entities.find((e) => e.type === "pf2e-orc.encounter")!;
          const creatures = graph.produced.entities.filter((e) => e.type === "pf2e-orc.creature");
          expect(creatures.length).toBeGreaterThan(0);
          expect(encounter.fields.xpTotal, `${threat} ${partySize} at ${partyLevel}`).toBe(budget(threat, partySize));
          const xp = creatures.reduce((sum, c) => sum + ({ "-4": 10, "-3": 15, "-2": 20, "-1": 30, "0": 40, "1": 60, "2": 80, "3": 120, "4": 160 } as Record<string, number>)[String(Number(c.fields.level) - partyLevel)]!, 0);
          expect(xp).toBe(encounter.fields.xpTotal);
          const def = loaded.entityType("pf2e-orc.encounter")!;
          expect(computeFields(def, encounter.fields).xpBudget).toBe(budget(threat, partySize));
          for (const c of creatures) expect(graph.produced.relationships).toContainEqual({ type: "appears_in", from: c.tempId, to: "encounter" });
        }
      }
    }
  });

  it("generates NPCs and settlements", () => {
    const npc = runProcedure(loaded.procedure("pf2e-orc.proc.npc")!, module, { seed: "npc-1" });
    expect(npc.produced.entities[0]).toMatchObject({ type: "pf2e-orc.npc", fields: { attitude: "indifferent" } });
    expect(module.presets.some((p) => p.name === npc.produced.entities[0]!.fields.statBlock)).toBe(true);
    const town = runProcedure(loaded.procedure("pf2e-orc.proc.settlement")!, module, { seed: "town-1" });
    expect(town.produced.entities.map((e) => e.type)).toEqual(["pf2e-orc.location", "pf2e-orc.location", "pf2e-orc.npc", "pf2e-orc.quest"]);
  });

  it("cites every converted entry by book and section, and marks what it wrote itself as original", () => {
    const BOOK = /^(Player Core|Player Core 2|GM Core|Monster Core) — /;
    for (const p of module.presets) expect(p.cite, p.id).toMatch(BOOK);
    for (const l of module.referenceLists) {
      expect(l.cite, l.id).toMatch(BOOK);
      for (const i of l.items) if (!l.id.endsWith("attributes") && !l.id.endsWith("skills") && !l.id.endsWith("saves") && !l.id.endsWith("proficiency-ranks")) expect(i.cite, `${l.id} ${i.id}`).toMatch(BOOK);
    }
    for (const r of module.rules) expect(r.original === true || BOOK.test(r.cite ?? ""), r.id).toBe(true);
    for (const t of module.tables) expect(t.original === true || BOOK.test(t.cite ?? ""), t.id).toBe(true);
    for (const t of module.templates) expect(t.original, t.id).toBe(true);
    expect(module.playGuides?.every((g) => g.original)).toBe(true);
    expect(module.calendar?.months.map((m) => m.name)).not.toContain("Abadius");
  });
});
