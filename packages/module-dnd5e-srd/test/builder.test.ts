/**
 * The fifth edition character builder against the SRD: a level 1 Hill Dwarf
 * Cleric (SRD 5.1 rules), a level 3 Elf (2024) Wizard with the Sage (2024)
 * background, a Fighter 2 / Wizard 3 multiclass and its spell slots, the
 * Thornwick Homebrew supplement's options with their badge, and the
 * builder's conformance.
 */
import {
  builderChoices,
  checkSupplement,
  characterBuilderIssues,
  d20Attacks,
  d20CombatantFor,
  describeGrant,
  emptyDraft,
  formatPackIssue,
  moduleFromPackSource,
  resolveCharacterBuilder,
  type CharacterBuilderDef,
  type CharacterBuilderDraft,
  type CharacterBuilderResult,
  type GameModule,
} from "@campaign-forge/module-sdk";
import { beforeAll, describe, expect, it } from "vitest";
import { dnd5eSrdSource, thornwickHomebrewSupplement } from "../src";

let module: GameModule;
let withSupplement: GameModule;
let builder: CharacterBuilderDef;

beforeAll(async () => {
  module = await moduleFromPackSource(dnd5eSrdSource);
  builder = module.characterBuilders![0]!;
  const res = checkSupplement(await thornwickHomebrewSupplement(), module, { seeds: 5 });
  if (!res.module) throw new Error(res.issues.map(formatPackIssue).join("\n"));
  withSupplement = res.module;
}, 60_000);

const pc = () => module.entityTypes.find((t) => t.id === "dnd5e-srd.character")!;
const scores = (s: Record<string, number>) => ({ abilities: { abilities: { method: "standard", scores: s } } });
const build = (picks: Record<string, string[]>, extra: Partial<CharacterBuilderDraft> = {}, m: GameModule = module) => resolveCharacterBuilder(m, builder, { ...emptyDraft(builder), picks, values: { details: { "core.name": "Test" } }, ...extra });
const problems = (r: CharacterBuilderResult) => r.issues.filter((i) => i.level !== "warning").map((i) => `${i.step}${i.path ? ` ${i.path}` : ""}: ${i.message}`);
const featureNames = (r: CharacterBuilderResult) => (r.fields.features as Array<{ name: string }>).map((f) => f.name);

describe("the fifth edition builder", () => {
  it("passes its conformance checks and dry run", () => {
    expect(characterBuilderIssues(module)).toEqual([]);
  });

  it("builds a level 1 Hill Dwarf Cleric with SRD 5.1 rules", () => {
    const r = build(
      {
        edition: ["2014"],
        species: ["dwarf"],
        "species/lineage": ["hill-dwarf"],
        "species/tool": ["smiths-tools"],
        class: ["cleric"],
        "class/skills": ["history", "medicine"],
        background: ["acolyte"],
        "background/languages": ["elvish", "giant"],
        level: ["1"],
        "level/subclass": ["life"],
        "spells/cantrips": ["guidance", "sacred-flame", "spare-the-dying"],
        "spells/prepared": ["command", "guiding-bolt", "healing-word", "shield-of-faith"],
        "equipment/pick-gear.0": ["amulet"],
        "equipment/class.0": ["cleric-0-a"],
        "equipment/class.1": ["cleric-1-a"],
        "equipment/class.2": ["cleric-2-a"],
        "equipment/class.3": ["cleric-3-a"],
      },
      scores({ strength: 13, dexterity: 10, constitution: 14, intelligence: 8, wisdom: 15, charisma: 12 }),
    );
    expect(problems(r)).toEqual([]);
    expect(r.complete).toBe(true);
    const f = r.fields;
    expect(f).toMatchObject({ class: "cleric", level: 1, race: "Dwarf", subrace: "Hill Dwarf", subclass: "Life", background: "Acolyte", speed: 25, size: "Medium", darkvision: 60, isPC: true });
    // Dwarf +2 Con, Hill Dwarf +1 Wis
    expect(f.abilities).toEqual({ strength: 13, dexterity: 10, constitution: 16, intelligence: 8, wisdom: 16, charisma: 12 });
    // d8 + Con 3 at 1st level, +1 Dwarven Toughness
    expect(f.hp).toEqual({ max: 12, current: 12, temp: 0 });
    // scale mail 14 + Dex 0 (max 2), shield +2
    expect(f.ac).toBe(16);
    expect(f.saves).toEqual({ "wisdom-save": 1, "charisma-save": 1 });
    expect(f.skills).toEqual({ insight: 1, religion: 1, history: 1, medicine: 1 });
    expect(f.languages).toEqual(["Common", "Dwarvish", "Elvish", "Giant"]);
    // the Life domain's level 1 spells, always prepared, then the cantrips and the spells prepared today (Wisdom 3 + level 1)
    expect(f.spells).toEqual(["Bless", "Cure Wounds", "Guidance", "Sacred Flame", "Spare the Dying", "Command", "Guiding Bolt", "Healing Word", "Shield of Faith"]);
    const prepared = builderChoices(r).find((x) => x.path === "spells/prepared")!;
    expect(prepared.label).toBe("Prepare 4 Cleric spells (up to level 1)");
    expect(prepared.options.find((o) => o.id === "bless")).toMatchObject({ available: false, reason: "Always prepared." });
    expect(String(f.proficiencies)).toBe("Battleaxe, handaxe, light hammer, warhammer; Smith's Tools; Light armor, medium armor, shields; simple weapons; Heavy armor");
    // the weapons become attack rows that table mode can roll: Strength (or Dexterity for the crossbow) plus proficiency
    expect(f.attacks).toEqual([
      { name: "Mace", damage: "1d6", type: "bludgeoning", ability: "strength", kind: "melee", proficient: true, notes: "monk" },
      { name: "Crossbow, light", damage: "1d8", type: "piercing", ability: "dexterity", kind: "ranged", proficient: true, notes: "ammunition (range 80/320), loading, two-handed" },
    ]);
    expect(featureNames(r)).toEqual(expect.arrayContaining(["Darkvision", "Dwarven Toughness", "Spellcasting: Cleric", "Divine Domain", "Disciple of Life", "Bonus Proficiency", "Shelter of the Faithful"]));
    expect(featureNames(r)).not.toContain("Ability Score Improvement");
    // the Acolyte's kit as the SRD 5.1 lists it: holy symbol, prayer book, five sticks of incense, vestments, common clothes, pouch
    expect((f.equipment as Array<{ name: string }>).map((e) => e.name)).toEqual(["Shield", "Holy symbol", "Prayer book", "Incense (stick)", "Vestments", "Clothes, common", "Pouch", "Amulet", "Mace", "Scale Mail", "Crossbow, light", "Crossbow bolt", "Priest's Pack"]);
    expect((f.coins as { gp: number }).gp).toBe(15);
    // computed values stay computed
    const c = r.computed;
    expect(c.proficiencyBonus).toBe(2);
    expect(c.wisdomSave).toBe(5);
    expect(c.medicineBonus).toBe(5);
    expect(c.spellSaveDc).toBe(13);
    expect(c.slotMax1).toBe(2);
    // the sheet's fixed-value maximum counts Dwarven Toughness too, so it agrees with the builder
    expect(c.suggestedHpMax).toBe(12);
    expect(c.spellAbility).toBe("wisdom");
    expect(r.name).toBe("Test");
    expect(r.summary).toBe("Hill Dwarf Cleric 1");
    expect(f.edition).toBe("2014");
    // the review reads values as the sheet does
    const cls = r.grants.find((x) => x.field === "class")!;
    expect(describeGrant(module, pc(), cls)).toBe("Class Cleric");
    const skill = r.grants.find((x) => x.field === "skills.history")!;
    expect(describeGrant(module, pc(), skill)).toBe("History Proficient");
    // every grant names its source
    const g = (field: string) => r.grants.find((x) => x.field === field && x.op === "add")!;
    expect(`${describeGrant(module, pc(), g("abilities.constitution"))} from ${g("abilities.constitution").source}`).toBe("+2 Constitution from race Dwarf");
    expect(`${describeGrant(module, pc(), g("abilities.wisdom"))} from ${g("abilities.wisdom").source}`).toBe("+1 Wisdom from subrace Hill Dwarf");
  });

  it("builds a level 3 Elf (2024) Wizard with the Sage (2024) background", () => {
    const r = build(
      {
        edition: ["2024"],
        species: ["elf-2024"],
        "species/lineage": ["elven-lineage-high-elf-2024"],
        "species/skills": ["perception"],
        class: ["wizard"],
        "class/skills": ["investigation", "insight"],
        background: ["sage-2024"],
        "background/abilities": ["two-one"],
        "background/abilities/plus2": ["intelligence"],
        "background/abilities/plus1": ["constitution"],
        "background/languages2024": ["dwarvish", "elvish"],
        "background/spellList/cantrips": ["fire-bolt", "mage-hand"],
        "background/spellList/spell": ["shield"],
        level: ["3"],
        "level/subclass": ["evoker-2024"],
        "level/hp": ["average"],
        "spells/cantrips": ["light", "ray-of-frost", "minor-illusion"],
        "spells/known": ["magic-missile", "sleep", "burning-hands", "detect-magic", "mage-armor", "thunderwave", "misty-step", "scorching-ray", "web", "hold-person"].filter((x) => x !== "detect-magic").concat(["identify"]),
        "equipment/class.0": ["wizard-0-a"],
        "equipment/class.1": ["wizard-1-a"],
        "equipment/class.2": ["wizard-2-a"],
        "equipment/background": ["a"],
      },
      scores({ strength: 8, dexterity: 13, constitution: 14, intelligence: 15, wisdom: 12, charisma: 10 }),
    );
    expect(problems(r)).toEqual([]);
    const f = r.fields;
    expect(f).toMatchObject({ class: "wizard", level: 3, race: "Elf (2024)", subrace: "Elven Lineage: High Elf", subclass: "Evoker", background: "Sage", speed: 30, darkvision: 60, xp: 900 });
    // SRD 5.2: no species increases; the Sage's +2 Intelligence and +1 Constitution
    expect(f.abilities).toEqual({ strength: 8, dexterity: 13, constitution: 15, intelligence: 17, wisdom: 12, charisma: 10 });
    // 6 + Con 2 at 1st level, then 4 + 2 for each of levels 2 and 3
    expect((f.hp as { max: number }).max).toBe(20);
    expect(f.ac).toBe(11);
    expect(f.saves).toEqual({ "intelligence-save": 1, "wisdom-save": 1 });
    expect(f.skills).toEqual({ perception: 1, investigation: 1, insight: 1, arcana: 1, history: 1 });
    expect(f.languages).toEqual(["Common", "Dwarvish", "Elvish"]);
    // the lineage's Prestidigitation (level 1) and Detect Magic (level 3), Magic Initiate's, then the class's
    expect(f.spells).toEqual(["Prestidigitation", "Detect Magic", "Fire Bolt", "Mage Hand", "Shield", "Light", "Ray of Frost", "Minor Illusion", "Magic Missile", "Sleep", "Burning Hands", "Mage Armor", "Thunderwave", "Misty Step", "Scorching Ray", "Web", "Hold Person", "Identify"]);
    // an SRD 5.2 build gets the SRD 5.2 wizard's features, not the SRD 5.1 ones (no "Arcane Tradition"), and its subclass at level 3
    expect(featureNames(r)).toEqual(expect.arrayContaining(["Darkvision (60 ft.)", "Keen Senses", "Trance", "High Elf: Cantrip Versatility", "Detect Magic", "Magic Initiate (Wizard)", "Spellcasting", "Ritual Adept", "Arcane Recovery", "Scholar", "Evocation Savant", "Potent Cantrip"]));
    expect(featureNames(r)).not.toContain("Arcane Tradition");
    expect(featureNames(r)).not.toContain("Wizard Subclass");
    expect((r.fields.features as Array<{ name: string; desc: string }>).find((x) => x.name === "Arcane Recovery")!.desc).toMatch(/Short Rest/);
    // the species without its edition mark ("Elf", not "Elf (2024)")
    expect(r.summary).toBe("Elf Wizard 3");
    expect(featureNames(r)).not.toContain("Misty Step");
    expect((f.coins as { gp: number }).gp).toBe(8);
    const c = r.computed;
    expect([c.slotMax1, c.slotMax2, c.slotMax3]).toEqual([4, 2, 0]);
    expect(c.spellSaveDc).toBe(13);
    expect(c.spellAttack).toBe("+5");
    expect(c.intelligenceSave).toBe(5);
    expect(c.perceptionBonus).toBe(3);
    const dex = r.grants.find((x) => x.field === "abilities.intelligence" && x.op === "add")!;
    expect(`${describeGrant(module, pc(), dex)} from ${dex.source}`).toBe("+2 Intelligence from background Sage");
    // the Magic Initiate list is the Sage's, picked by itself
    expect(builderChoices(r).find((x) => x.path === "background/spellList")!.picked).toEqual(["Wizard"]);
    // the class skills skip the background's
    const skills = builderChoices(r).find((x) => x.path === "class/skills")!;
    expect(skills.options.find((o) => o.id === "arcana")).toMatchObject({ available: false, reason: "Your background gives it." });
  });

  it("levels a Fighter 2 into a Fighter 2 / Wizard 3 with the multiclass spellcaster's slots", () => {
    let r = build(
      {
        edition: ["2014"],
        species: ["human"],
        "species/languages": ["elvish"],
        class: ["fighter"],
        "class/skills": ["athletics", "perception"],
        background: ["acolyte"],
        "background/languages": ["dwarvish", "giant"],
        level: ["2"],
        "level/options.0": ["fighter-fighting-style-defense"],
        "level/hp": ["average"],
        "equipment/class.0": ["fighter-0-a"],
        "equipment/class.1": ["fighter-1-a"],
        "equipment/class.1/pick-weapons.0": ["longsword"],
        "equipment/class.2": ["fighter-2-b"],
        "equipment/class.3": ["fighter-3-b"],
      },
      scores({ strength: 15, dexterity: 13, constitution: 14, intelligence: 12, wisdom: 10, charisma: 8 }),
    );
    expect(problems(r)).toEqual([]);
    // d10 + 3 at 1st, 6 + 3 at 2nd (human: Con 15 -> +2... 14 + 1 = 15, +2)
    expect((r.fields.hp as { max: number }).max).toBe(10 + 2 + 6 + 2);
    // chain mail 16, shield 2, Defense 1
    expect(r.fields.ac).toBe(19);
    let fields = r.fields;
    const up = (picks: Record<string, string[]>) => {
      const res = resolveCharacterBuilder(module, builder, { ...emptyDraft(builder, "levelUp"), picks }, { base: fields });
      expect(problems(res)).toEqual([]);
      fields = res.fields;
      return res;
    };
    r = up({ class: ["wizard"], hp: ["average"], "spells/cantrips": ["fire-bolt", "light", "mage-hand"], "spells/known": ["magic-missile", "shield", "sleep", "detect-magic", "mage-armor", "burning-hands"] });
    expect(fields.classLevels).toEqual([
      { class: "fighter", level: 2, subclass: "" },
      { class: "wizard", level: 1 },
    ]);
    expect(featureNames(r)).toEqual(expect.arrayContaining(["Arcane Recovery", "Spellcasting: Wizard"]));
    r = up({ class: ["wizard"], hp: ["average"], "features/subclass": ["evocation"], "spells/known": ["thunderwave", "identify"] });
    expect(fields.subclass).toBeUndefined();
    expect(fields.classLevels).toEqual([
      { class: "fighter", level: 2, subclass: "" },
      { class: "wizard", level: 2, subclass: "Evocation" },
    ]);
    r = up({ class: ["wizard"], hp: ["average"], "spells/known": ["misty-step", "scorching-ray"] });
    expect(fields.level).toBe(5);
    expect(fields.classLevels).toEqual([
      { class: "fighter", level: 2, subclass: "" },
      { class: "wizard", level: 3, subclass: "Evocation" },
    ]);
    const c = r.computed;
    // a third-level caster on the Multiclass Spellcaster table: four 1st-level and two 2nd-level slots
    expect(c.casterLevel).toBe(3);
    expect([c.slotMax1, c.slotMax2, c.slotMax3]).toEqual([4, 2, 0]);
    expect(c.proficiencyBonus).toBe(3);
    expect(c.classSummary).toBe("Fighter 2 / Wizard 3");
    expect(c.hitDie).toBe("2d10 + 3d6");
    // HP: 12 + 8 at fighter levels, then three wizard levels of 4 + 2
    expect((fields.hp as { max: number }).max).toBe(20 + 3 * 6);
    expect(c.suggestedHpMax).toBe(38);
    // Int 13 is the wizard's prerequisite; with Int 12 the option is closed
    const low = resolveCharacterBuilder(module, builder, { ...emptyDraft(builder, "levelUp"), picks: {} }, { base: { ...fields, abilities: { ...(fields.abilities as object), intelligence: 12 }, classLevels: [], class: "fighter", level: 2 } });
    expect(low.steps[0]!.choice!.options.find((o) => o.id === "wizard")).toMatchObject({ available: false, reason: "Needs Intelligence 13." });
  });

  it("levels a Fighter 1 into a Life Cleric: Wisdom casting, prepared and domain spells; the fighter's weapons attack in table mode", () => {
    const r = build(
      {
        edition: ["2014"],
        species: ["human"],
        "species/languages": ["elvish"],
        class: ["fighter"],
        "class/skills": ["athletics", "perception"],
        background: ["acolyte"],
        "background/languages": ["dwarvish", "giant"],
        level: ["1"],
        "level/options.0": ["fighter-fighting-style-defense"],
        "equipment/class.0": ["fighter-0-a"],
        "equipment/class.1": ["fighter-1-a"],
        "equipment/class.1/pick-weapons.0": ["longsword"],
        "equipment/class.2": ["fighter-2-b"],
        "equipment/class.3": ["fighter-3-b"],
      },
      scores({ strength: 15, dexterity: 13, constitution: 14, intelligence: 10, wisdom: 12, charisma: 8 }),
    );
    expect(problems(r)).toEqual([]);
    // Str 16 (+3), proficient: +5 to hit, 1d8+3; the handaxes too
    expect(r.fields.attacks).toEqual([
      { name: "Longsword", damage: "1d8", type: "slashing", ability: "strength", kind: "melee", proficient: true, notes: "versatile (1d10)" },
      { name: "Handaxe", damage: "1d6", type: "slashing", ability: "strength", kind: "melee", proficient: true, notes: "light, thrown (range 20/60), monk" },
    ]);
    const combat = module.d20Combat!;
    const pcCombatant = d20CombatantFor(combat, "dnd5e-srd.character")!;
    const attacks = d20Attacks(combat, pcCombatant, { fields: r.fields, computed: r.computed });
    expect(attacks.map((a) => [a.name, a.bonus, a.damage.map((d) => `${d.dice} ${d.type}`).join(" ")])).toEqual([
      ["Longsword", 5, "1d8+3 slashing"],
      ["Handaxe", 5, "1d6+3 slashing"],
    ]);

    const up = resolveCharacterBuilder(module, builder, { ...emptyDraft(builder, "levelUp"), picks: { class: ["cleric"], hp: ["average"], "features/subclass": ["life"], "spells/cantrips": ["guidance", "light", "sacred-flame"], "spells/prepared": ["command", "healing-word"] } }, { base: r.fields });
    expect(problems(up)).toEqual([]);
    const f = up.fields;
    expect(f.classLevels).toEqual([
      { class: "fighter", level: 1, subclass: "" },
      { class: "cleric", level: 1, subclass: "Life" },
    ]);
    // the Life domain's level 1 spells come with the subclass; Wisdom 13 (+1) + level 1 = 2 prepared
    expect(f.spells).toEqual(["Bless", "Cure Wounds", "Guidance", "Light", "Sacred Flame", "Command", "Healing Word"]);
    expect(builderChoices(up).find((c) => c.path === "spells/prepared")!.label).toBe("Prepare 2 more Cleric spells (up to level 1)");
    // a multiclass character casts with its spellcasting class's ability: DC 8 + 2 + 1, attack +3
    expect(up.computed.spellAbility).toBe("wisdom");
    expect(up.computed.spellSaveDc).toBe(11);
    expect(up.computed.spellAttack).toBe("+3");
    expect(up.computed.spellSlots).toBe("1st: 2  ");
  });

  it("offers a supplement's options with their badge, and uses their builder data", () => {
    const r = build({ edition: ["2014"], species: ["thornwick-homebrew.mossborn"], background: ["thornwick-homebrew.ferrywright"] }, {}, withSupplement);
    const moss = r.steps.find((s) => s.id === "species")!.choice!.options.find((o) => o.id === "thornwick-homebrew.mossborn")!;
    expect(moss.source).toBe("Thornwick Homebrew");
    expect(r.steps.find((s) => s.id === "background")!.choice!.options.find((o) => o.id === "thornwick-homebrew.ferrywright")!.source).toBe("Thornwick Homebrew");
    expect(r.fields).toMatchObject({ race: "Mossborn", size: "Small", speed: 25, background: "Ferrywright" });
    expect((r.fields.skills as Record<string, number>).athletics).toBe(1);
    // the SRD 5.2 lists keep supplement items in 2024 mode too
    const r24 = build({ edition: ["2024"] }, {}, withSupplement);
    expect(r24.steps.find((s) => s.id === "species")!.choice!.options.some((o) => o.id === "thornwick-homebrew.mossborn")).toBe(true);
    expect(r24.steps.find((s) => s.id === "species")!.choice!.options.some((o) => o.id === "dwarf")).toBe(false);
  });
});
