/**
 * The remaster character builder against the rules: a level 1 human fighter
 * and a level 1 elf wizard (Hit Points, attribute modifiers, proficiency
 * ranks, trained skills, feats at the right levels, spellcasting), a level 5
 * character's partial boost and skill increases (and the boost that
 * completes it at 10th), a level-up, a doctrine's own features, feat
 * prerequisites, the built-in supplement's ancestries and classes with their
 * badge, and no Reserved Material in anything the builder shows.
 */
import {
  applySupplements,
  builderChoices,
  characterBuilderIssues,
  computeFields,
  emptyDraft,
  moduleFromPackSource,
  resolveCharacterBuilder,
  supplementFromSource,
  type CharacterBuilderDraft,
  type CharacterBuilderResult,
  type ChoiceState,
  type GameModule,
} from "@campaign-forge/module-sdk";
import { beforeAll, describe, expect, it } from "vitest";
import { anyReservedPattern } from "../scripts/source/reserved.ts";
import { pf2eOrcSource } from "../src";
import { pf2eOrcBooksSource } from "../src/supplement";

let base: GameModule;
let merged: GameModule;

beforeAll(async () => {
  base = await moduleFromPackSource(pf2eOrcSource);
  merged = applySupplements(base, [await supplementFromSource(pf2eOrcBooksSource)]);
}, 180_000);

const builderOf = (m: GameModule) => m.characterBuilders![0]!;
const CHARACTER = "pf2e-orc.character";

function draft(m: GameModule, picks: Record<string, string[]>, mode: "create" | "levelUp" = "create"): CharacterBuilderDraft {
  return { ...emptyDraft(builderOf(m), mode), picks, values: { details: { "core.name": "Test" } } };
}
function build(m: GameModule, picks: Record<string, string[]>, base_?: Record<string, unknown>): CharacterBuilderResult {
  return resolveCharacterBuilder(m, builderOf(m), draft(m, picks, base_ ? "levelUp" : "create"), base_ ? { base: base_ } : {});
}
const choice = (res: CharacterBuilderResult, path: string): ChoiceState => {
  const c = builderChoices(res).find((x) => x.path === path);
  if (!c) throw new Error(`no choice ${path}: ${builderChoices(res).map((x) => x.path).join(", ")}`);
  return c;
};
const computed = (m: GameModule, fields: Record<string, unknown>) => computeFields(m.entityTypes.find((t) => t.id === CHARACTER)!, fields);
const problems = (res: CharacterBuilderResult) => res.issues.filter((i) => i.level !== "warning").map((i) => `${i.path ?? i.step}: ${i.message}`);
/** The feat slots of a level, by label ("Level 1 class feat" → its path). */
const featPath = (res: CharacterBuilderResult, level: number, label: string): string => {
  const c = builderChoices(res).find((x) => x.label === `Level ${level} ${label}`);
  if (!c) throw new Error(`no ${label} at level ${level}: ${builderChoices(res).map((x) => `${x.path} ${x.label}`).join("; ")}`);
  return c.path;
};

/** A human fighter: Skilled Human (Medicine), Warrior, Strength key, Athletics; a shield, scale mail and a longsword. */
const FIGHTER: Record<string, string[]> = {
  ancestry: ["human"],
  "ancestry/heritage": ["skilled-human"],
  "ancestry/heritage/any-skill": ["medicine"],
  "ancestry/boosts": ["standard"],
  "ancestry/boosts/free": ["strength", "constitution"],
  background: ["warrior"],
  "background/boost": ["strength"],
  "background/free": ["dexterity"],
  class: ["fighter"],
  "class/key": ["strength"],
  "class/skill-skills.0": ["athletics"],
  boosts: ["strength", "dexterity", "constitution", "wisdom"],
  "skills/class": ["acrobatics", "crafting", "society"],
  "skills/languages": ["Dwarven"],
  level: ["1"],
  "levels/lv.0/feat.0": ["sudden-charge"],
  "levels/lv.0/feat.1": ["natural-ambition"],
  "levels/lv.0/feat.1/bonus-feat.0": ["double-slice"],
  equipment: ["currency"],
  "equipment/shop": ["scale-mail", "steel-shield", "longsword", "adventurers-pack"],
};

describe("the remaster character builder", { timeout: 60_000 }, () => {
  it("passes conformance and its dry run, with and without the supplement", { timeout: 120_000 }, () => {
    expect(characterBuilderIssues(base)).toEqual([]);
    expect(characterBuilderIssues(merged)).toEqual([]);
  });

  it("builds a level 1 human fighter by the rules", () => {
    const res = build(base, FIGHTER);
    expect(problems(res)).toEqual([]);
    expect(res.complete).toBe(true);
    const f = res.fields as Record<string, any>;
    // boosts: ancestry Str/Con, background Str/Dex, class key Str, four free Str/Dex/Con/Wis
    expect(f.attributes).toEqual({ strength: 4, dexterity: 2, constitution: 2, intelligence: 0, wisdom: 1, charisma: 0 });
    expect(f.partialBoosts).toEqual([]);
    expect(f).toMatchObject({ ancestry: "human", heritage: "Skilled Human", background: "Warrior", class: "fighter", level: 1, keyAttribute: "strength", size: "Medium", speed: 25 });
    // initial proficiencies: Perception, Fortitude and Reflex expert, Will trained; martial expert, advanced trained; all armor trained; class DC trained
    expect(f.saves).toEqual({ perception: 2, fortitude: 2, reflex: 2, will: 1 });
    expect(f.attacks).toEqual({ simple: 2, martial: 2, advanced: 1, unarmed: 2 });
    expect(f.defenses).toEqual({ unarmored: 1, light: 1, medium: 1, heavy: 1 });
    expect(f.classDcRank).toBe(1);
    // trained: Medicine (heritage), Intimidation and Warfare Lore (background), Athletics (class choice), three more (3 + Int 0)
    expect(f.skills).toEqual({ medicine: 1, intimidation: 1, "lore-a": 1, athletics: 1, acrobatics: 1, crafting: 1, society: 1 });
    expect(f.loreTopics).toEqual({ first: "Warfare Lore" });
    expect(f.languages).toEqual(["Common", "Dwarven"]);
    expect(f.feats).toEqual([
      { level: 1, type: "skill", name: "Intimidating Glare" },
      { level: 1, type: "bonus", name: "Shield Block" },
      { level: 1, type: "class", name: "Sudden Charge" },
      { level: 1, type: "ancestry", name: "Natural Ambition" },
      { level: 1, type: "bonus", name: "Double Slice" },
    ]);
    expect(f.features.map((x: { name: string }) => x.name)).toEqual(expect.arrayContaining(["Skilled Human", "Reactive Strike", "Shield Block"]));
    // scale mail and a steel shield on the sheet, the longsword as a Strike, the rest of 15 gp as money
    expect(f.armor).toMatchObject({ name: "Scale Mail", category: "medium", acBonus: 3, dexCap: 2, strength: 2, checkPenalty: -2, speedPenalty: -5 });
    expect(f.shield).toMatchObject({ name: "Steel Shield", acBonus: 2, hardness: 5, hp: 20, maxHp: 20 });
    expect(f.strikes).toEqual([{ name: "Longsword", damage: "1d8 S", traits: expect.stringContaining("versatile P"), type: "melee" }]);
    expect(f.coins).toEqual({ cp: 0, sp: 5, gp: 6, pp: 0 });
    // computed, never stored: HP 8 + (10 + 2) × 1; AC 10 + Dex 2 (cap 2) + trained 3 + 3; Perception Wis 1 + expert 5
    const c = res.computed as Record<string, unknown>;
    expect(c.hpMax).toBe(20);
    expect(f.hp.current).toBe(20);
    expect(c.ac).toBe(18);
    expect(c.acShieldRaised).toBe(20);
    expect([c.perceptionTotal, c.fortitudeTotal, c.reflexTotal, c.willTotal]).toEqual([6, 7, 7, 4]);
    expect(c.athleticsTotal).toBe(7);
    expect(c.classDc).toBe(17);
    expect(c.spellDc).toBeNull();
    expect(res.summary).toBe("Skilled Human Fighter 1");
    // the review names each grant's source
    const label = (field: string) => res.grants.filter((g) => g.field === field && !g.hidden).map((g) => `${g.label} from ${g.source}`);
    expect(label("attributes.strength")).toEqual(["+1 Strength from ancestry Human", "+1 Strength from background Warrior", "+1 Strength from class Fighter", "+1 Strength from Attribute boosts: Strength"]);
    expect(label("saves.fortitude")).toEqual(["Fortitude expert from class Fighter"]);
    expect(res.todo.some((t) => /Strikes: write in each weapon's attack bonus/.test(t))).toBe(true);
  });

  it("builds a level 1 elf wizard by the rules, with a school, a thesis and spellcasting", () => {
    const picks = {
      ancestry: ["elf"],
      "ancestry/heritage": ["cavern-elf"],
      "ancestry/boosts": ["standard"],
      "ancestry/boosts/free": ["wisdom"],
      background: ["scholar"],
      "background/boost": ["intelligence"],
      "background/free": ["constitution"],
      "background/skill-skills.0": ["arcana"],
      class: ["wizard"],
      "class/select.0": ["school-of-battle-magic"],
      "class/select.1": ["spell-blending"],
      boosts: ["intelligence", "dexterity", "constitution", "wisdom"],
      level: ["1"],
      "levels/lv.0/feat.0": ["otherworldly-magic"],
      equipment: ["currency"],
    };
    let res = build(base, picks);
    // the wizard has no 1st-level class feat: one slot, the ancestry feat
    expect(builderChoices(res).filter((c) => c.path.startsWith("levels/lv.0/feat.")).map((c) => c.label)).toEqual(["Level 1 ancestry feat"]);
    // Arcana from the background, then the class's Arcana again: one more skill to pick (2 + Int 4 + 1); Int 4 languages
    expect(choice(res, "skills/class").min).toBe(7);
    expect(choice(res, "skills/languages").min).toBe(4);
    res = build(base, { ...picks, "skills/class": ["crafting", "occultism", "society", "nature", "religion", "medicine", "diplomacy"], "skills/languages": ["Draconic", "Fey", "Gnomish", "Goblin"] });
    expect(problems(res)).toEqual([]);
    const f = res.fields as Record<string, any>;
    // Dex and Int fixed, Con flaw, a free Wis; background Int, Con; class Int; four free
    expect(f.attributes).toEqual({ strength: 0, dexterity: 2, constitution: 1, intelligence: 4, wisdom: 2, charisma: 0 });
    expect(f.saves).toEqual({ perception: 1, fortitude: 1, reflex: 1, will: 2 });
    expect(f.defenses).toEqual({ unarmored: 1, light: 0, medium: 0, heavy: 0 });
    expect(f.spellcasting).toEqual({ rank: 1, tradition: "arcane", kind: "prepared", attribute: "intelligence" });
    expect(f.senses).toEqual(["low-light vision", "darkvision"]);
    expect(f.speed).toBe(30);
    expect(f.subclass).toBe("School of Battle Magic, Spell Blending");
    expect(f.features.map((x: { name: string }) => x.name)).toEqual(expect.arrayContaining(["Arcane Bond", "Arcane School", "Arcane Thesis", "Wizard Spellcasting", "School of Battle Magic", "Spell Blending"]));
    expect(f.feats).toEqual([
      { level: 1, type: "skill", name: "Assurance" },
      { level: 1, type: "ancestry", name: "Otherworldly Magic" },
    ]);
    expect(f.loreTopics).toEqual({ first: "Academia Lore" });
    const c = res.computed as Record<string, unknown>;
    // HP 6 + (6 + 1) × 1; spell DC 10 + Int 4 + trained 3; Will Wis 2 + expert 5
    expect([c.hpMax, c.spellDc, c.spellAttack, c.willTotal, c.perceptionTotal, c.arcanaTotal]).toEqual([13, 17, "+7", 7, 5, 7]);
    expect(res.todo.some((t) => t.startsWith("Spells: choose"))).toBe(true);
  });

  it("applies a level 5 partial boost and skill increases, and completes the boost at 10th", () => {
    const at5 = {
      ...FIGHTER,
      level: ["5"],
      "levels/lv.1/feat.0": ["double-slice"],
      "levels/lv.2/skill-increase": ["athletics"],
      "levels/lv.4/boosts": ["strength", "dexterity", "constitution", "intelligence"],
    };
    let res = build(base, at5);
    // master Athletics waits for 7th level; Acrobatics can go to expert
    const inc5 = choice(res, "levels/lv.4/skill-increase");
    expect(inc5.options.find((o) => o.id === "athletics")).toMatchObject({ available: false, reason: "Already expert." });
    expect(inc5.options.find((o) => o.id === "acrobatics")!.available).toBe(true);
    // Double Slice taken at 1st is not offered again at 2nd
    expect(choice(res, featPath(res, 2, "class feat")).options.find((o) => o.id === "double-slice")!.available).toBe(false);
    res = build(base, { ...at5, "levels/lv.4/skill-increase": ["acrobatics"] });
    let f = res.fields as Record<string, any>;
    // Strength was +4: the boost is partial; the others go up by 1
    expect(f.attributes).toEqual({ strength: 4, dexterity: 3, constitution: 3, intelligence: 1, wisdom: 1, charisma: 0 });
    expect(f.partialBoosts).toEqual(["strength"]);
    expect(f.skills).toMatchObject({ athletics: 2, acrobatics: 2 });
    // Bravery at 3rd: Will expert
    expect(f.saves.will).toBe(2);
    expect(f.feats.filter((x: { level: number }) => x.level === 2).map((x: { type: string }) => x.type)).toEqual(["class"]);
    // Intelligence went up: one more trained skill and language are asked
    expect(builderChoices(res).map((c) => c.path)).toEqual(expect.arrayContaining(["levels/lv.4/int-skill", "levels/lv.4/int-language"]));
    expect((res.computed as Record<string, unknown>).hpMax).toBe(8 + (10 + 3) * 5);
    expect(res.grants.find((g) => g.field === "partialBoosts" && g.op === "append")!.label).toBe("Partial boost to Strength (at +4 or more, two boosts make +1)");

    res = build(base, { ...at5, "levels/lv.4/skill-increase": ["acrobatics"], level: ["10"], "levels/lv.9/boosts": ["strength", "dexterity", "wisdom", "charisma"] });
    f = res.fields as Record<string, any>;
    expect(f.attributes.strength).toBe(5);
    expect(f.partialBoosts).toEqual([]);
    // Fighter at 7th: Perception master; 9th: Fortitude master
    expect(f.saves).toMatchObject({ perception: 3, fortitude: 3 });
  });

  it("levels a character up: the next level's feats, Hit Points and features", () => {
    const made = build(base, FIGHTER);
    const fields = made.fields;
    let res = build(base, {}, fields);
    expect(res.steps.map((s) => s.id)).toEqual(["class", "new-level", "review"]);
    // the character's class is the only option, picked by itself
    expect(choice(res, "class").picked).toEqual(["fighter"]);
    expect(builderChoices(res).filter((c) => c.path.startsWith("new-level/lv.0/feat.")).map((c) => c.label)).toEqual(["Level 2 class feat", "Level 2 skill feat"]);
    res = build(base, { "new-level/lv.0/feat.0": ["exacting-strike"], "new-level/lv.0/feat.1": ["battle-medicine"] }, fields);
    expect(problems(res)).toEqual([]);
    const f = res.fields as Record<string, any>;
    expect(f.level).toBe(2);
    expect(f.feats.slice(-2)).toEqual([
      { level: 2, type: "class", name: "Exacting Strike" },
      { level: 2, type: "skill", name: "Battle Medicine" },
    ]);
    // 20 + 12 Hit Points, the current Hit Points with them
    expect(computed(base, f).hpMax).toBe(32);
    expect(f.hp.current).toBe(32);
  });

  it("gives a doctrine's own features at their levels", () => {
    const picks = {
      ancestry: ["dwarf"],
      "ancestry/heritage": ["rock-dwarf"],
      "ancestry/boosts": ["alternate"],
      "ancestry/boosts/free": ["wisdom", "strength"],
      background: ["acolyte"],
      "background/boost": ["wisdom"],
      "background/free": ["constitution"],
      class: ["cleric"],
      "class/select.0": ["warpriest"],
      boosts: ["wisdom", "strength", "constitution", "dexterity"],
      level: ["3"],
    };
    const res = build(base, picks);
    const f = res.fields as Record<string, any>;
    // the alternate ancestry boosts: no Charisma flaw, no fixed Constitution and Wisdom
    expect(f.attributes.charisma).toBe(0);
    expect(f.subclass).toBe("Warpriest");
    // First Doctrine (Warpriest): Fortitude expert, light and medium armor, Shield Block and Deadly Simplicity; Second (3rd): martial weapons
    expect(f.saves.fortitude).toBe(2);
    expect(f.defenses).toMatchObject({ light: 1, medium: 1 });
    expect(f.attacks.martial).toBe(1);
    expect(f.feats.map((x: { name: string }) => x.name)).toEqual(expect.arrayContaining(["Shield Block", "Deadly Simplicity"]));
    expect(f.features.map((x: { name: string }) => x.name)).toEqual(expect.arrayContaining(["Warpriest", "First Doctrine (Warpriest)", "Second Doctrine (Warpriest)"]));
    expect(f.spellcasting).toMatchObject({ rank: 1, tradition: "divine", attribute: "wisdom" });
    expect(res.todo.some((t) => /choose your deity/.test(t))).toBe(true);
  });

  it("checks feat prerequisites it can read, and asks the GM for the rest", () => {
    const res = build(base, { ...FIGHTER, level: ["2"] });
    const skillFeats = choice(res, featPath(res, 2, "skill feat"));
    // Battle Medicine needs Medicine trained (the heritage gave it); Intimidating Prowess needs expert Intimidation and Strength +3
    expect(skillFeats.options.find((o) => o.id === "battle-medicine")!.available).toBe(true);
    expect(skillFeats.options.find((o) => o.id === "intimidating-prowess")).toMatchObject({ available: false, reason: "Prerequisites: Strength +3; expert in Intimidation" });
    const withAssurance = build(base, { ...FIGHTER, level: ["2"], [featPath(res, 2, "skill feat")]: ["assurance"] });
    const confirm = choice(withAssurance, `${featPath(res, 2, "skill feat")}/prereq`);
    expect(confirm.label).toBe("Prerequisites: trained in at least one skill");
    const refused = build(base, { ...FIGHTER, level: ["2"], [featPath(res, 2, "skill feat")]: ["assurance"], [`${featPath(res, 2, "skill feat")}/prereq`]: ["unmet"] });
    expect(refused.issues.some((i) => i.level === "error" && /Choose another feat/.test(i.message))).toBe(true);
  });

  it("offers the supplement's ancestries and classes with their badge, and builds them from their own data", () => {
    let res = build(merged, {});
    const minotaur = choice(res, "ancestry").options.find((o) => o.id === "pf2e-orc-books.minotaur")!;
    expect(minotaur.source).toBe("Remaster ORC books");
    expect(choice(res, "class").options.filter((o) => o.source === "Remaster ORC books").map((o) => o.name)).toEqual(["Animist", "Commander", "Exemplar", "Guardian", "Gunslinger", "Inventor", "Magus", "Necromancer", "Psychic", "Runesmith", "Summoner", "Thaumaturge"]);
    const picks: Record<string, string[]> = {
      ancestry: ["pf2e-orc-books.minotaur"],
      "ancestry/boosts": ["standard"],
      "ancestry/boosts/free": ["intelligence"],
      background: ["scholar"],
      "background/boost": ["intelligence"],
      "background/free": ["dexterity"],
      "background/skill-skills.0": ["arcana"],
      class: ["pf2e-orc-books.magus"],
      "class/key": ["strength"],
      boosts: ["strength", "dexterity", "constitution", "intelligence"],
      level: ["2"],
    };
    res = build(merged, picks);
    const hybrid = choice(res, "class/select.0");
    expect(hybrid.label).toBe("Hybrid Study");
    expect(hybrid.options.length).toBeGreaterThan(3);
    expect(hybrid.options.every((o) => o.source === "Remaster ORC books")).toBe(true);
    const classFeats = choice(res, featPath(res, 2, "class feat"));
    expect(classFeats.options.length).toBeGreaterThan(5);
    expect(classFeats.options.every((o) => o.source === "Remaster ORC books")).toBe(true);
    expect(classFeats.options.map((o) => o.name)).toEqual(expect.arrayContaining(["Raise a Tome", "Expansive Spellstrike"]));
    const f = res.fields as Record<string, any>;
    expect(f).toMatchObject({ ancestry: "pf2e-orc-books.minotaur", class: "pf2e-orc-books.magus", size: "Large", keyAttribute: "strength" });
    expect(f.senses).toEqual(["darkvision"]);
    expect(f.languages).toEqual(["Common", "Jotun"]);
    // a magus casts arcane spells with Intelligence, whatever its key attribute
    expect(f.spellcasting).toMatchObject({ rank: 1, tradition: "arcane", kind: "prepared", attribute: "intelligence" });
    // Hit Points from the supplement's numbers in the sheet's lookup: 10 + (8 + Con 2) × 2
    expect(computed(merged, f).hpMax).toBe(30);

    // a commander picks five tactics (actions the supplement adds); a core bard may pick the supplement's muse
    res = build(merged, { ancestry: ["human"], class: ["pf2e-orc-books.commander"] });
    const tactics = choice(res, "class/select.0");
    expect([tactics.label, tactics.min, tactics.max]).toEqual(["Tactics", 5, 5]);
    expect(tactics.options.length).toBeGreaterThanOrEqual(5);
    res = build(merged, { ancestry: ["human"], class: ["bard"] });
    expect(choice(res, "class/select.0").options.find((o) => o.name === "Zoophonia")!.source).toBe("Remaster ORC books");
  });

  it("shows no Reserved Material: the builder's text and every item's builder data", () => {
    const text = (x: unknown) => JSON.stringify(x);
    expect(text(builderOf(base)).match(anyReservedPattern())).toBeNull();
    const builderData = merged.referenceLists.flatMap((l) => l.items.filter((i) => i.builder).map((i) => ({ id: i.id, builder: i.builder })));
    expect(builderData.length).toBeGreaterThan(1000);
    expect(text(builderData).match(anyReservedPattern())).toBeNull();
    // the deity is free text: no option anywhere lists one
    expect(text(builderOf(base))).not.toMatch(/"deity","label":"Deity","widget":"select"/);
  });
});
