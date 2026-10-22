/**
 * The SRD 5.2 character options added to the SRD 5.1 lists: counts, spot
 * checks against the source (5e-bits/5e-database src/2024/en), the edition
 * and source marks and citations on every item, names that tell the two
 * editions apart, and the links the PC sheet's suggestions follow (lineage to
 * species, subclass to class, feature to subclass).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { moduleFromPackSource, type GameModule, type ReferenceItem } from "@campaign-forge/module-sdk";
import { beforeAll, describe, expect, it } from "vitest";
import { text52 } from "../scripts/srd/srd52.ts";
import { CLASSES } from "../scripts/ids.ts";
import { dnd5eSrdSource } from "../src";

let module: GameModule;
beforeAll(async () => {
  module = await moduleFromPackSource(dnd5eSrdSource);
}, 60_000);

const items = (listId: string): ReferenceItem[] => {
  const l = module.referenceLists.find((x) => x.id === `dnd5e-srd.${listId}`);
  if (!l) throw new Error(`no list ${listId}`);
  return l.items;
};
const of2024 = (listId: string) => items(listId).filter((i) => i.edition === "2024");
const of51 = (listId: string) => items(listId).filter((i) => i.edition === undefined);
const item = (listId: string, id: string): ReferenceItem => {
  const i = items(listId).find((x) => x.id === id);
  if (!i) throw new Error(`no ${id} in ${listId}`);
  return i;
};

const LISTS = ["races", "subraces", "racial-traits", "backgrounds", "feats", "subclasses", "class-features"];

describe("SRD 5.2 character options", () => {
  it("adds every SRD 5.2 background, species, lineage, trait, subclass, subclass feature and feat, keeping the SRD 5.1 ones", () => {
    expect(of2024("backgrounds")).toHaveLength(4);
    expect(of2024("races")).toHaveLength(9);
    expect(of2024("subraces")).toHaveLength(24);
    expect(of2024("racial-traits")).toHaveLength(67);
    expect(of2024("subclasses")).toHaveLength(12);
    expect(of2024("class-features")).toHaveLength(58);
    expect(of2024("feats")).toHaveLength(17);
    // the SRD 5.1 items are all still there
    expect([of51("backgrounds"), of51("races"), of51("subraces"), of51("racial-traits"), of51("subclasses"), of51("class-features"), of51("feats")].map((l) => l.length)).toEqual([1, 9, 4, 38, 12, 407, 1]);
    // no 2024 classes, spells or monsters: only the options above
    for (const l of module.referenceLists.filter((x) => !LISTS.includes(x.id.slice("dnd5e-srd.".length)))) expect(l.items.filter((i) => i.edition), l.id).toEqual([]);
  });

  it("marks every 2024 item with its edition and source and cites it by SRD 5.2 section", () => {
    for (const l of LISTS) {
      for (const i of items(l)) {
        const is2024 = i.id.endsWith("-2024");
        expect(i.edition === "2024", `${l} ${i.id}`).toBe(is2024);
        if (!is2024) continue;
        expect(i.source, i.id).toBe("SRD 5.2");
        expect(i.cite, i.id).toMatch(/^SRD 5\.2 — (Character Origins|Feats|Classes): /);
        expect((i.cite ?? "").length).toBeLessThanOrEqual(200);
        expect(typeof i.description === "string" || l === "backgrounds", i.id).toBe(true);
      }
    }
    expect(item("races", "elf-2024").cite).toBe("SRD 5.2 — Character Origins: Species (Elf)");
    expect(item("backgrounds", "sage-2024").cite).toBe("SRD 5.2 — Character Origins: Backgrounds (Sage)");
    expect(item("subclasses", "college-of-lore-2024").cite).toBe("SRD 5.2 — Classes: Bard (College of Lore)");
    expect(item("feats", "alert-2024").cite).toBe("SRD 5.2 — Feats: Origin Feats (Alert)");
  });

  it("names a 2024 option the sheet stores apart from the SRD 5.1 option of the same name", () => {
    for (const l of ["races", "subraces", "backgrounds", "subclasses"]) {
      const names = items(l).map((i) => i.name.toLowerCase());
      expect(new Set(names).size, l).toBe(names.length);
    }
    expect(of2024("races").map((i) => i.name)).toEqual(["Dragonborn (2024)", "Dwarf (2024)", "Elf (2024)", "Gnome (2024)", "Goliath", "Halfling (2024)", "Human (2024)", "Orc", "Tiefling (2024)"]);
    expect(of2024("backgrounds").map((i) => i.name)).toEqual(["Acolyte (2024)", "Criminal", "Sage", "Soldier"]);
    expect(of2024("subclasses").filter((i) => i.name.endsWith("(2024)")).map((i) => i.name)).toEqual(["Champion (2024)", "Hunter (2024)", "Thief (2024)"]);
    expect(item("races", "elf")).toMatchObject({ name: "Elf", abilityBonuses: "Dexterity +2" });
    expect(item("races", "elf").edition).toBeUndefined();
  });

  it("links lineages to their species, subclasses to the sheet's classes and features to their subclass", () => {
    const species = new Set(of2024("races").map((i) => i.name));
    for (const s of of2024("subraces")) expect(species.has(String(s.race)), s.id).toBe(true);
    const elf = of2024("subraces").filter((s) => s.race === "Elf (2024)").map((s) => s.name);
    expect(elf).toEqual(["Elven Lineage: Drow", "Elven Lineage: High Elf", "Elven Lineage: Wood Elf"]);
    // the SRD 5.1 High Elf stays with the SRD 5.1 Elf
    expect(item("subraces", "high-elf").race).toBe("Elf");
    const classNames = new Map(items("classes").map((c) => [c.name, c.id]));
    for (const s of of2024("subclasses")) expect(CLASSES).toContain(classNames.get(String(s.class)));
    expect(new Set(of2024("subclasses").map((s) => s.class)).size).toBe(12);
    const subclasses = new Map(of2024("subclasses").map((s) => [s.name, s]));
    for (const f of of2024("class-features")) {
      const s = subclasses.get(String(f.subclass));
      expect(s, f.id).toBeDefined();
      expect(f.class).toBe(s!.class);
      expect(String(s!.features)).toContain(`${f.level}: ${f.name}`);
    }
    for (const t of of2024("racial-traits")) expect(String(t.races).split(", ").some((r) => species.has(r)), t.id).toBe(true);
  });

  it("spot-checks species and lineages against the source", () => {
    expect(item("races", "goliath-2024")).toMatchObject({ name: "Goliath", speed: "35 ft.", size: "Medium", creatureType: "Humanoid", abilityBonuses: "From background", traits: "Giant Ancestry, Large Form, Powerful Build" });
    const giant = of2024("subraces").filter((s) => s.race === "Goliath").map((s) => s.name);
    expect(giant).toEqual(["Giant Ancestry: Cloud's Jaunt", "Giant Ancestry: Fire's Burn", "Giant Ancestry: Frost's Chill", "Giant Ancestry: Hill's Tumble", "Giant Ancestry: Stone's Endurance", "Giant Ancestry: Storm's Thunder"]);
    expect(item("races", "goliath-2024").description).toContain("Fire's Burn (Fire Giant). When you hit a target with an attack roll and deal damage to it, you can also deal 1d10 Fire damage to that target.");
    expect(item("races", "tiefling-2024")).toMatchObject({ size: "Small or Medium (chosen when you select this species)", traits: "Darkvision (60 ft.), Fiendish Legacy, Otherworldly Presence" });
    expect(item("races", "dwarf-2024").traits).toBe("Darkvision (120 ft.), Dwarven Resilience, Dwarven Toughness, Stonecunning");
    expect(item("subraces", "elven-lineage-drow-2024")).toMatchObject({ summary: "Level 1: Darkvision (120 ft.), Dancing Lights; Level 3: Faerie Fire; Level 5: Darkness" });
    expect(item("subraces", "draconic-ancestor-blue-2024")).toMatchObject({ race: "Dragonborn (2024)", damageType: "Lightning", traits: "Breath Weapon: Lightning, Damage Resistance: Lightning" });
    // a trait the source ties to a lineage only from the lineage's side still names it
    expect(item("racial-traits", "draconic-damage-resistance-lightning-2024").races).toBe("Dragonborn (2024), Draconic Ancestor: Blue, Draconic Ancestor: Bronze");
    // the Draconic Ancestors table reads as a table
    expect(item("racial-traits", "draconic-ancestry-2024").description).toContain("| Dragon | Damage Type |\n| --- | --- |\n| Black | Acid |");
  });

  it("spot-checks backgrounds and feats against the source: abilities, origin feat, skills, tools", () => {
    expect(item("backgrounds", "sage-2024")).toMatchObject({ abilityScores: "Constitution, Intelligence, Wisdom", feat: "Magic Initiate (Wizard)", skills: "Arcana, History", tools: "Calligrapher's Supplies" });
    expect(item("backgrounds", "acolyte-2024")).toMatchObject({ name: "Acolyte (2024)", abilityScores: "Intelligence, Wisdom, Charisma", feat: "Magic Initiate (Cleric)", skills: "Insight, Religion" });
    expect(item("backgrounds", "criminal-2024")).toMatchObject({ abilityScores: "Dexterity, Constitution, Intelligence", feat: "Alert", skills: "Sleight of Hand, Stealth", tools: "Thieves' Tools" });
    expect(item("backgrounds", "soldier-2024")).toMatchObject({ abilityScores: "Strength, Dexterity, Constitution", feat: "Savage Attacker", skills: "Athletics, Intimidation" });
    expect(item("backgrounds", "soldier-2024").tools).toMatch(/^Gaming Set: choose 1 of Dice, Dragonchess, Playing Cards/);
    expect(item("backgrounds", "sage-2024").equipment).toBe("Choose A or B: (A) Quarterstaff, Calligrapher's Supplies, Book (history), Parchment (8 sheets), Robe, 8 GP; or (B) 50 GP");
    // the sheet shows a background's summary under the field
    expect(item("backgrounds", "sage-2024").summary).toBe("Ability scores Con, Int, Wis; feat Magic Initiate (Wizard); skills Arcana, History");
    // every background's origin feat is in the feats list, as an origin feat
    const feats = new Map(of2024("feats").map((f) => [f.name, f]));
    for (const b of of2024("backgrounds")) expect(feats.get(String(b.feat).replace(/ \(.*\)$/, ""))?.category, b.id).toBe("Origin");
    expect(item("feats", "grappler-2024")).toMatchObject({ category: "General", prerequisite: "Level 4+; Strength or Dexterity 13+" });
    expect(item("feats", "boon-of-fate-2024")).toMatchObject({ category: "Epic Boon", prerequisite: "Level 19+" });
    expect(item("feats", "savage-attacker-2024").description).toContain("roll the weapon's damage dice twice");
  });

  it("spot-checks subclasses and their features against the source", () => {
    const berserker = item("subclasses", "path-of-the-berserker-2024");
    expect(berserker).toMatchObject({ name: "Path of the Berserker", class: "Barbarian", summary: "Channel Rage into Violent Fury", features: "3: Frenzy; 6: Mindless Rage; 10: Retaliation; 14: Intimidating Presence" });
    expect(of2024("class-features").filter((f) => f.subclass === "Path of the Berserker").map((f) => [f.level, f.name])).toEqual([
      [3, "Frenzy"],
      [6, "Mindless Rage"],
      [10, "Retaliation"],
      [14, "Intimidating Presence"],
    ]);
    expect(item("class-features", "berserker-frenzy-2024").description).toMatch(/^If you use Reckless Attack while your Rage is active/);
    expect(item("subclasses", "champion-2024").features).toBe("3: Improved Critical; 3: Remarkable Athlete; 7: Additional Fighting Style; 10: Heroic Warrior; 15: Superior Critical; 18: Survivor");
    expect(item("class-features", "champion-improved-critical-2024")).toMatchObject({ subclass: "Champion (2024)", class: "Fighter", level: 3 });
    // spell tables read as tables, with the source's run-together rows split and its typo corrected
    const draconic = String(item("class-features", "draconic-sorcery-draconic-spells-2024").description);
    expect(draconic).toContain("| Sorcerer Level | Spells |\n| --- | --- |\n| 3 | Alter Self, Chromatic Orb, Command, Dragon’s Breath |\n| 5 | Fear, Fly |\n| 7 | Arcane Eye, Charm Monster |");
    expect(String(item("class-features", "devotion-oath-of-devotion-spells-2024").description)).toContain("Shield of Faith");
  });

  it("records the source commit and the conversion notes", () => {
    const readme = readFileSync(join(__dirname, "../README.md"), "utf8");
    expect(readme).toContain("a6212beb4b278917c2cff41c2b04c4ef4f3e0d6f");
    expect(readme).toContain("src/2024/en");
    const notes = readFileSync(join(__dirname, "../scripts/generated/conversion-notes.txt"), "utf8");
    expect(notes).toContain("SRD 5.2 background Sage: origin feat Magic Initiate given its spell list (Wizard)");
  });
});

describe("text52", () => {
  it("turns the source's line breaks, lists and tables into Markdown", () => {
    expect(text52("First.\n  Second line.")).toBe("First.\n\nSecond line.");
    expect(text52("Tenets:\n- One.\n- Two.")).toBe("Tenets:\n\n- One.\n- Two.");
    expect(text52("Choose:\nA. One.\n- B. Two.")).toBe("Choose:\n\nA. One.\n\nB. Two.");
    expect(text52("use their tenets as the\nmeasure of devotion.")).toBe("use their tenets as the measure of devotion.");
    expect(text52("Ward\nLand / Resistance\nArid / Fire\nPolar / Cold")).toBe("Ward\n\n| Land | Resistance |\n| --- | --- |\n| Arid | Fire |\n| Polar | Cold |");
    // a single "a / b" line is prose, not a table
    expect(text52("Hit points / level")).toBe("Hit points / level");
  });
});
