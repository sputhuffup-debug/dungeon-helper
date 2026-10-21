/**
 * Entity types: the player character, the monster / NPC stat block, a
 * roleplay NPC, and the campaign types (location, faction, item, encounter,
 * quest). Every derived number (modifiers, proficiency bonus, skill and save
 * bonuses, passive scores, initiative, spell save DC and attack, spell slots)
 * is `computed` JSONLogic, never stored (rule 4).
 */
import type { EntityTypeDef, JsonSchema, ReferenceList, SheetField } from "@campaign-forge/module-sdk";
import {
  ABILITIES,
  CHARACTER,
  CLASSES,
  ENCOUNTER,
  FACTION,
  ITEM,
  LIST,
  LOCATION,
  modName,
  MONSTER,
  NPC,
  QUEST,
  rule,
  saveBonusName,
  SAVES,
  skillBonusName,
  SKILLS,
} from "../ids.ts";
import { abilityMods, add, cat, eq, floor, gt, ifs, inList, lookup, max, min, mul, signedText, sub, v, type Rule } from "./logic.ts";

const int = (min?: number, maxV?: number, def?: number): JsonSchema => ({ type: "integer", ...(min !== undefined ? { minimum: min } : {}), ...(maxV !== undefined ? { maximum: maxV } : {}), ...(def !== undefined ? { default: def } : {}) });
const text = (maxLength?: number): JsonSchema => ({ type: "string", ...(maxLength ? { maxLength } : {}) });
const longText: JsonSchema = { type: "string", maxLength: 20000 };
const tags: JsonSchema = { type: "array", items: { type: "string" }, default: [] };
const entryList: JsonSchema = { type: "array", items: { type: "object", properties: { name: { type: "string" }, desc: longText }, required: ["name"] }, default: [] };

const abilitiesSchema: JsonSchema = {
  type: "object",
  properties: Object.fromEntries(ABILITIES.map((a) => [a.id, int(1, 30, 10)])),
  required: ABILITIES.map((a) => a.id),
  additionalProperties: false,
};
const savesSchema: JsonSchema = { type: "object", properties: Object.fromEntries(SAVES.map((s) => [s.id, int(0, 1, 0)])), additionalProperties: false, default: {} };
const skillsSchema: JsonSchema = { type: "object", properties: Object.fromEntries(SKILLS.map((s) => [s.id, int(0, 2, 0)])), additionalProperties: false, default: {} };
const bonusesSchema: JsonSchema = {
  type: "object",
  description: "Flat bonuses on top of ability modifier and proficiency, per skill or save (a magic item, a feature).",
  properties: Object.fromEntries([...SKILLS, ...SAVES].map((s) => [s.id, { ...int(-20, 20), title: s.name }])),
  additionalProperties: false,
  default: {},
};
const hpSchema: JsonSchema = {
  type: "object",
  properties: { max: int(1, 2000, 8), current: int(0, 2000, 8), temp: int(0, 500, 0) },
  required: ["max", "current"],
  additionalProperties: false,
};

/** Computed bonuses: ability modifiers, then every skill and save as modifier + proficiency × multiplier + flat bonus. */
function rollBonuses(): Record<string, Rule> {
  const out: Record<string, Rule> = {};
  const prof = (path: string): Rule => floor(mul(v("computed.proficiencyBonus", 0), v(path, 0)));
  for (const a of ABILITIES) out[saveBonusName(a.id)] = add(v(`computed.${modName(a.id)}`), prof(`fields.saves.${a.id}-save`), v(`fields.bonuses.${a.id}-save`, 0));
  for (const s of SKILLS) out[skillBonusName(s.id)] = add(v(`computed.${modName(s.ability)}`), prof(`fields.skills.${s.id}`), v(`fields.bonuses.${s.id}`, 0));
  return out;
}

const passives = (): Record<string, Rule> => ({
  passivePerception: add(10, v(`computed.${skillBonusName("perception")}`)),
  passiveInvestigation: add(10, v(`computed.${skillBonusName("investigation")}`)),
  passiveInsight: add(10, v(`computed.${skillBonusName("insight")}`)),
});

/** Character advancement: XP needed for each level (SRD 5.1, Beyond 1st Level). */
const XP_FOR_LEVEL = [0, 300, 900, 2700, 6500, 14000, 23000, 34000, 48000, 64000, 85000, 100000, 120000, 140000, 165000, 195000, 225000, 265000, 305000, 355000];

const abilityFields = (): SheetField[] => [
  ...ABILITIES.map((a): SheetField => ({ path: `abilities.${a.id}`, label: a.name, widget: "attribute", rule: rule("ability-scores-and-modifiers") })),
  ...ABILITIES.map((a): SheetField => ({ path: modName(a.id), label: `${a.abbr} modifier`, widget: "computed" })),
];

const skillsWidget = (hideZero: boolean): SheetField => ({
  path: "skills.*",
  label: "Skills",
  widget: "skills",
  rule: rule("ability-checks.skills"),
  config: {
    ref: LIST.skills,
    attributesPath: "abilities",
    levels: [
      { value: 0, label: "—" },
      { value: 1, label: "Proficient" },
      { value: 2, label: "Expertise" },
    ],
    labels: { skill: "Skill", attribute: "Ability", attributeValue: "Score", value: "Proficiency", pool: "Roll" },
    ...(hideZero ? { hideZero: true } : {}),
  },
});
const savesWidget = (hideZero: boolean): SheetField => ({
  path: "saves.*",
  label: "Saving throws",
  widget: "skills",
  rule: rule("saving-throws"),
  config: {
    ref: LIST.saves,
    attributesPath: "abilities",
    levels: [
      { value: 0, label: "—" },
      { value: 1, label: "Proficient" },
    ],
    labels: { skill: "Save", attribute: "Ability", attributeValue: "Score", value: "Proficiency", pool: "Roll" },
    ...(hideZero ? { hideZero: true } : {}),
  },
});
const bonusFields: SheetField[] = [{ path: "bonuses", label: "Flat bonuses by skill and save", widget: "object" }];

/** The player character sheet. `spellSlots` maps class id to 20 levels × 9 slot counts. */
export function characterType(classes: ReferenceList, spellSlots: Record<string, number[][]>): EntityTypeDef {
  const classItems = new Map(classes.items.map((c) => [c.id, c]));
  for (const c of CLASSES) if (!classItems.has(c)) throw new Error(`class ${c} missing from the SRD class list`);
  const level = v("fields.level", 1);
  const cls = v("fields.class", "");
  const levelIndex = max(0, min(19, sub(level, 1)));

  // Hit die by class, from the class list.
  const byDie = new Map<number, string[]>();
  for (const c of CLASSES) {
    const die = Number(String(classItems.get(c)!.hitDie).replace("d", ""));
    byDie.set(die, [...(byDie.get(die) ?? []), c]);
  }
  const hitDieFaces: Rule = ifs(...[...byDie.entries()].flatMap(([die, list]) => [inList(cls, list), die]), 0);

  // Spellcasting ability by class (an override field wins).
  const byAbility = new Map<string, string[]>();
  for (const c of CLASSES) {
    const a = String(classItems.get(c)!.spellcasting ?? "—").toLowerCase();
    if (ABILITIES.some((x) => x.id === a)) byAbility.set(a, [...(byAbility.get(a) ?? []), c]);
  }
  const classAbility: Rule = ifs(...[...byAbility.entries()].flatMap(([a, list]) => [inList(cls, list), a]), "");

  // Spell slots: classes with the same table share one rule branch.
  const groups = new Map<string, { classes: string[]; table: number[][] }>();
  for (const [c, table] of Object.entries(spellSlots).sort(([a], [b]) => a.localeCompare(b))) {
    const key = JSON.stringify(table);
    const g = groups.get(key) ?? { classes: [], table };
    g.classes.push(c);
    groups.set(key, g);
  }
  const slotRules: Record<string, Rule> = {};
  for (let lvl = 1; lvl <= 9; lvl++) {
    const branches = [...groups.values()].flatMap((g) => {
      const column = g.table.map((row) => row[lvl - 1] ?? 0);
      return column.some((n) => n > 0) ? [inList(cls, g.classes), lookup(column, levelIndex, 0)] : [];
    });
    slotRules[`slotMax${lvl}`] = branches.length ? ifs(...branches, 0) : 0;
  }
  const ord = ["1st", "2nd", "3rd", "4th", "5th", "6th", "7th", "8th", "9th"];
  const slotSummary: Rule = cat(...ord.map((o, i) => ifs(gt(v(`computed.slotMax${i + 1}`, 0), 0), cat(o, ": ", v(`computed.slotMax${i + 1}`), "  "), "")));

  const computed: Record<string, Rule> = {
    ...abilityMods(),
    proficiencyBonus: add(2, floor({ "/": [sub(level, 1), 4] })),
    ...rollBonuses(),
    ...passives(),
    initiative: add(v("computed.dexterityMod"), v("fields.initiativeBonus", 0)),
    hitDieFaces,
    hitDie: ifs(gt(v("computed.hitDieFaces"), 0), cat("d", v("computed.hitDieFaces")), "—"),
    hitDiceLeft: max(0, sub(level, v("fields.hitDiceSpent", 0))),
    // First level: the hit die's maximum; later levels: its average rounded up (half + 1); Constitution each level.
    suggestedHpMax: ifs(
      gt(v("computed.hitDieFaces"), 0),
      max(1, add(v("computed.hitDieFaces"), v("computed.constitutionMod"), mul(sub(level, 1), add(floor({ "/": [v("computed.hitDieFaces"), 2] }), 1, v("computed.constitutionMod"))))),
      null,
    ),
    nextLevelXp: ifs({ "<": [level, 20] }, lookup(XP_FOR_LEVEL, max(1, min(19, level)), null), null),
    carryingCapacity: mul(v("fields.abilities.strength", 10), 15),
    spellAbility: ifs(v("fields.spellcastingAbility", ""), v("fields.spellcastingAbility"), classAbility),
    spellcastingMod: ifs(v("computed.spellAbility"), v({ cat: ["computed.", v("computed.spellAbility"), "Mod"] } as unknown as string, 0), null),
    spellSaveDc: ifs(v("computed.spellAbility"), add(8, v("computed.proficiencyBonus"), v("computed.spellcastingMod", 0)), null),
    spellAttack: ifs(v("computed.spellAbility"), signedText(add(v("computed.proficiencyBonus"), v("computed.spellcastingMod", 0))), null),
    ...slotRules,
    spellSlots: slotSummary,
  };

  const schema: JsonSchema = {
    type: "object",
    properties: {
      isPC: { type: "boolean", default: true },
      player: text(120),
      class: { type: "string", enum: [...CLASSES] },
      subclass: text(120),
      level: int(1, 20, 1),
      race: text(120),
      subrace: text(120),
      background: text(120),
      alignment: { type: "string", enum: ["lawful-good", "neutral-good", "chaotic-good", "lawful-neutral", "neutral", "chaotic-neutral", "lawful-evil", "neutral-evil", "chaotic-evil"] },
      xp: int(0, 10000000, 0),
      abilities: abilitiesSchema,
      saves: savesSchema,
      skills: skillsSchema,
      bonuses: bonusesSchema,
      ac: int(0, 40, 10),
      initiativeBonus: int(-10, 20, 0),
      speed: int(0, 200, 30),
      hp: hpSchema,
      hitDiceSpent: int(0, 20, 0),
      deathSaves: { type: "object", properties: { successes: int(0, 3, 0), failures: int(0, 3, 0) }, additionalProperties: false, default: { successes: 0, failures: 0 } },
      exhaustion: int(0, 6, 0),
      inspiration: { type: "boolean", default: false },
      spellcastingAbility: { type: "string", enum: ABILITIES.map((a) => a.id), description: "Leave empty to use the class's spellcasting ability." },
      spellSlotsUsed: { type: "object", properties: Object.fromEntries(Array.from({ length: 9 }, (_, i) => [`level${i + 1}`, { ...int(0, 9, 0), title: `${ord[i]} level used` }])), additionalProperties: false, default: {} },
      spells: { ...tags, description: "Spells known or prepared (names from the Spells list)." },
      attacks: {
        type: "array",
        items: { type: "object", properties: { name: text(80), bonus: text(20), damage: text(80), notes: text(200) }, required: ["name"] },
        default: [],
      },
      features: entryList,
      proficiencies: { type: "string", maxLength: 4000 },
      languages: tags,
      equipment: {
        type: "array",
        items: { type: "object", properties: { name: text(120), quantity: int(0, 9999, 1), weight: { type: "number", minimum: 0 }, notes: text(200) }, required: ["name"] },
        default: [],
      },
      coins: { type: "object", properties: { cp: int(0), sp: int(0), ep: int(0), gp: int(0), pp: int(0) }, additionalProperties: false, default: { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 } },
      personality: { type: "object", properties: { traits: text(2000), ideals: text(2000), bonds: text(2000), flaws: text(2000) }, additionalProperties: false, default: {} },
      appearance: text(4000),
      backstory: longText,
      notes: longText,
    },
    required: ["abilities", "level", "hp"],
    additionalProperties: false,
  };

  return {
    id: CHARACTER,
    kind: "character",
    name: "Player character",
    plural: "Player characters",
    icon: "shield",
    schema,
    computed,
    sheet: {
      sections: [
        {
          id: "identity",
          title: "Character",
          columns: 3,
          fields: [
            { path: "class", label: "Class", widget: "select", options: { ref: LIST.classes } },
            { path: "level", label: "Level", widget: "number" },
            { path: "subclass", label: "Subclass", widget: "text" },
            { path: "race", label: "Race", widget: "text" },
            { path: "subrace", label: "Subrace", widget: "text" },
            { path: "background", label: "Background", widget: "text" },
            { path: "alignment", label: "Alignment", widget: "select", options: { ref: LIST.alignments } },
            { path: "xp", label: "Experience points", widget: "number" },
            { path: "nextLevelXp", label: "XP for next level", widget: "computed" },
            { path: "proficiencyBonus", label: "Proficiency bonus", widget: "computed", rule: rule("proficiency-bonus") },
            { path: "player", label: "Player", widget: "text" },
            { path: "isPC", label: "Player character", widget: "checkbox" },
          ],
        },
        { id: "abilities", title: "Ability scores", columns: 6, fields: abilityFields() },
        {
          id: "combat",
          title: "Combat",
          columns: 4,
          fields: [
            { path: "ac", label: "Armor Class", widget: "number" },
            { path: "initiative", label: "Initiative", widget: "computed", rule: rule("the-order-of-combat.initiative") },
            { path: "speed", label: "Speed (ft.)", widget: "number" },
            { path: "initiativeBonus", label: "Initiative bonus", widget: "number" },
            { path: "hp.max", label: "Hit point maximum", widget: "number", rule: rule("damage-and-healing.hit-points") },
            { path: "hp.current", label: "Current hit points", widget: "number" },
            { path: "hp.temp", label: "Temporary hit points", widget: "number", rule: rule("damage-and-healing.temporary-hit-points") },
            { path: "suggestedHpMax", label: "HP max (fixed values)", widget: "computed" },
            { path: "hitDie", label: "Hit die", widget: "computed" },
            { path: "hitDiceLeft", label: "Hit dice left", widget: "computed", rule: rule("resting.short-rest") },
            { path: "hitDiceSpent", label: "Hit dice spent", widget: "number" },
            { path: "exhaustion", label: "Exhaustion level", widget: "number", rule: rule("conditions.exhaustion") },
            { path: "deathSaves.successes", label: "Death save successes", widget: "number", rule: rule("damage-and-healing.dropping-to-0-hit-points") },
            { path: "deathSaves.failures", label: "Death save failures", widget: "number" },
            { path: "inspiration", label: "Inspiration", widget: "checkbox", rule: "dnd5e-srd.rule.advice.inspiration" },
          ],
        },
        { id: "saves", title: "Saving throws", fields: [savesWidget(false)] },
        {
          id: "skills",
          title: "Skills",
          fields: [
            skillsWidget(false),
            { path: "passivePerception", label: "Passive Wisdom (Perception)", widget: "computed", rule: rule("ability-checks.passive-checks") },
            { path: "passiveInvestigation", label: "Passive Intelligence (Investigation)", widget: "computed" },
            { path: "passiveInsight", label: "Passive Wisdom (Insight)", widget: "computed" },
          ],
        },
        { id: "attacks", title: "Attacks", fields: [{ path: "attacks", label: "Attacks", widget: "table", config: { columns: ["name", { key: "bonus", label: "Attack bonus" }, "damage", "notes"] } }] },
        {
          id: "spellcasting",
          title: "Spellcasting",
          columns: 4,
          fields: [
            { path: "spellcastingAbility", label: "Spellcasting ability (override)", widget: "select", options: { ref: LIST.abilities } },
            { path: "spellAbility", label: "Spellcasting ability", widget: "computed" },
            { path: "spellSaveDc", label: "Spell save DC", widget: "computed", rule: rule("casting-a-spell.spell-saving-throws") },
            { path: "spellAttack", label: "Spell attack bonus", widget: "computed", rule: rule("casting-a-spell.spell-attack-rolls") },
            { path: "spellSlots", label: "Spell slots", widget: "computed", span: 12, rule: rule("what-is-a-spell.spell-slots") },
            { path: "spellSlotsUsed", label: "Slots used", widget: "object", span: 12 },
            { path: "spells", label: "Spells known / prepared", widget: "tags", span: 12 },
          ],
        },
        {
          id: "features",
          title: "Features and proficiencies",
          fields: [
            { path: "features", label: "Features and traits", widget: "entries" },
            { path: "proficiencies", label: "Armor, weapon and tool proficiencies", widget: "textarea" },
            { path: "languages", label: "Languages", widget: "tags" },
          ],
        },
        {
          id: "equipment",
          title: "Equipment",
          fields: [
            { path: "equipment", label: "Equipment", widget: "table", config: { columns: ["name", "quantity", { key: "weight", label: "Weight (lb.)" }, "notes"] } },
            { path: "coins", label: "Coins", widget: "object" },
            { path: "carryingCapacity", label: "Carrying capacity (lb.)", widget: "computed", rule: rule("using-each-ability.strength") },
          ],
        },
        {
          id: "personality",
          title: "Personality and story",
          collapsed: true,
          fields: [
            { path: "personality", label: "Traits, ideals, bonds, flaws", widget: "object" },
            { path: "appearance", label: "Appearance", widget: "textarea" },
            { path: "backstory", label: "Backstory", widget: "textarea" },
          ],
        },
        { id: "bonuses", title: "Other bonuses", collapsed: true, fields: bonusFields },
        { id: "notes", title: "GM notes", collapsed: true, fields: [{ path: "notes", label: "Notes", widget: "textarea" }] },
      ],
      summary: ["class", "level", "ac", "hp.current", "passivePerception"],
    },
    defaultVisibility: { notes: "gm" },
    playerEditable: ["hp.current", "hp.temp", "deathSaves.successes", "deathSaves.failures", "spellSlotsUsed", "equipment", "coins", "notes"],
  };
}

/** The stat block every SRD monster and NPC preset fills. */
export function monsterType(): EntityTypeDef {
  const cr = v("fields.cr", 0);
  const computed: Record<string, Rule> = {
    ...abilityMods(),
    // +2 at CR 0-4, +1 per four CR above that (SRD 5.1, Monsters: Proficiency Bonus).
    proficiencyBonus: add(2, floor({ "/": [sub(max(cr, 1), 1), 4] })),
    ...rollBonuses(),
    ...passives(),
    initiative: add(v("computed.dexterityMod"), v("fields.initiativeBonus", 0)),
    crLabel: ifs(eq(cr, 0.125), "1/8", eq(cr, 0.25), "1/4", eq(cr, 0.5), "1/2", cat(cr)),
  };
  const schema: JsonSchema = {
    type: "object",
    properties: {
      size: { type: "string", enum: ["Tiny", "Small", "Medium", "Large", "Huge", "Gargantuan"], default: "Medium" },
      creatureType: text(80),
      creatureSubtype: text(80),
      alignment: text(80),
      ac: int(0, 40, 10),
      acNote: text(200),
      hp: hpSchema,
      hitDice: text(40),
      speed: text(200),
      initiativeBonus: int(-10, 20, 0),
      abilities: abilitiesSchema,
      saves: savesSchema,
      skills: skillsSchema,
      bonuses: bonusesSchema,
      damageVulnerabilities: tags,
      damageResistances: tags,
      damageImmunities: tags,
      conditionImmunities: tags,
      senses: text(400),
      languages: text(400),
      cr: { type: "number", minimum: 0, maximum: 30, default: 0 },
      xp: int(0, 1000000, 0),
      traits: entryList,
      actions: entryList,
      reactions: entryList,
      legendaryActions: entryList,
      description: longText,
      notes: longText,
    },
    required: ["abilities", "hp"],
    additionalProperties: false,
  };
  return {
    id: MONSTER,
    kind: "creature",
    name: "Monster",
    plural: "Monsters",
    icon: "bug",
    schema,
    computed,
    sheet: {
      sections: [
        {
          id: "statblock",
          title: "Stat block",
          columns: 4,
          fields: [
            { path: "size", label: "Size", widget: "select", options: ["Tiny", "Small", "Medium", "Large", "Huge", "Gargantuan"] },
            { path: "creatureType", label: "Type", widget: "text" },
            { path: "creatureSubtype", label: "Subtype", widget: "text" },
            { path: "alignment", label: "Alignment", widget: "text" },
            { path: "ac", label: "Armor Class", widget: "number" },
            { path: "acNote", label: "Armor", widget: "text" },
            { path: "hp.max", label: "Hit points", widget: "number", rule: rule("damage-and-healing.hit-points") },
            { path: "hitDice", label: "Hit dice", widget: "text" },
            { path: "hp.current", label: "Current hit points", widget: "number" },
            { path: "hp.temp", label: "Temporary hit points", widget: "number" },
            { path: "speed", label: "Speed", widget: "text", span: 6 },
            { path: "cr", label: "Challenge rating", widget: "number" },
            { path: "crLabel", label: "Challenge", widget: "computed" },
            { path: "xp", label: "XP", widget: "number" },
            { path: "proficiencyBonus", label: "Proficiency bonus", widget: "computed", rule: rule("proficiency-bonus") },
            { path: "initiative", label: "Initiative", widget: "computed" },
            { path: "passivePerception", label: "Passive Perception", widget: "computed", rule: rule("ability-checks.passive-checks") },
          ],
        },
        { id: "abilities", title: "Ability scores", columns: 6, fields: abilityFields() },
        { id: "saves", title: "Saving throws", fields: [savesWidget(true)] },
        { id: "skills", title: "Skills", fields: [skillsWidget(true)] },
        {
          id: "defenses",
          title: "Defenses, senses and languages",
          columns: 2,
          fields: [
            { path: "damageVulnerabilities", label: "Damage vulnerabilities", widget: "tags" },
            { path: "damageResistances", label: "Damage resistances", widget: "tags" },
            { path: "damageImmunities", label: "Damage immunities", widget: "tags" },
            { path: "conditionImmunities", label: "Condition immunities", widget: "tags" },
            { path: "senses", label: "Senses", widget: "text" },
            { path: "languages", label: "Languages", widget: "text" },
          ],
        },
        { id: "traits", title: "Traits", fields: [{ path: "traits", label: "Traits", widget: "entries" }] },
        {
          id: "actions",
          title: "Actions",
          fields: [
            { path: "actions", label: "Actions", widget: "entries", rule: rule("actions-in-combat") },
            { path: "reactions", label: "Reactions", widget: "entries" },
            { path: "legendaryActions", label: "Legendary actions", widget: "entries" },
          ],
        },
        { id: "description", title: "Description", collapsed: true, fields: [{ path: "description", label: "Description", widget: "textarea" }] },
        { id: "bonuses", title: "Other bonuses", collapsed: true, fields: [{ path: "initiativeBonus", label: "Initiative bonus", widget: "number" }, ...bonusFields] },
        { id: "notes", title: "GM notes", collapsed: true, fields: [{ path: "notes", label: "Notes", widget: "textarea" }] },
      ],
      summary: ["crLabel", "ac", "hp.current", "passivePerception"],
    },
    defaultVisibility: { notes: "gm", description: "gm" },
  };
}

const select = (path: string, label: string, values: string[]): SheetField => ({ path, label, widget: "select", options: values });

export const ENVIRONMENTS = ["arctic", "coast", "desert", "forest", "grassland", "hills", "mountain", "swamp", "underground", "urban", "planar"];

/** A non-player character for roleplay; a stat block, if it fights, is a Monster preset (Guard, Noble, Priest...). */
export function npcType(): EntityTypeDef {
  return {
    id: NPC,
    kind: "character",
    name: "NPC",
    plural: "NPCs",
    icon: "user",
    schema: {
      type: "object",
      properties: {
        occupation: text(120),
        race: text(80),
        alignment: { type: "string", enum: ["lawful-good", "neutral-good", "chaotic-good", "lawful-neutral", "neutral", "chaotic-neutral", "lawful-evil", "neutral-evil", "chaotic-evil"] },
        attitude: { type: "string", enum: ["hostile", "unfriendly", "indifferent", "friendly", "helpful"], default: "indifferent" },
        appearance: text(2000),
        quirk: text(400),
        voice: text(400),
        motivation: text(400),
        secret: text(400),
        statBlock: { type: "string", maxLength: 120, description: "The SRD stat block to use if it comes to a fight (e.g. Guard, Noble, Priest)." },
        notes: longText,
      },
      additionalProperties: false,
    },
    sheet: {
      sections: [
        {
          id: "who",
          title: "Who they are",
          columns: 2,
          fields: [
            { path: "occupation", label: "Occupation", widget: "text" },
            { path: "race", label: "Race", widget: "text" },
            { path: "alignment", label: "Alignment", widget: "select", options: { ref: LIST.alignments } },
            select("attitude", "Attitude toward the party", ["hostile", "unfriendly", "indifferent", "friendly", "helpful"]),
            { path: "statBlock", label: "Stat block", widget: "text" },
          ],
        },
        {
          id: "roleplay",
          title: "Playing them",
          columns: 2,
          fields: [
            { path: "appearance", label: "Appearance", widget: "textarea" },
            { path: "quirk", label: "Quirk", widget: "textarea" },
            { path: "voice", label: "Voice and manner", widget: "textarea" },
            { path: "motivation", label: "What they want", widget: "textarea" },
            { path: "secret", label: "Secret", widget: "textarea" },
          ],
        },
        { id: "notes", title: "GM notes", collapsed: true, fields: [{ path: "notes", label: "Notes", widget: "textarea" }] },
      ],
      summary: ["occupation", "attitude"],
    },
    defaultVisibility: { secret: "gm", notes: "gm", statBlock: "gm" },
  };
}

export function locationType(): EntityTypeDef {
  return {
    id: LOCATION,
    kind: "location",
    name: "Location",
    plural: "Locations",
    icon: "map",
    schema: {
      type: "object",
      properties: {
        environment: { type: "string", enum: ENVIRONMENTS },
        size: { type: "string", enum: ["hamlet", "village", "town", "city", "metropolis"] },
        population: text(120),
        ruler: text(200),
        danger: { type: "string", enum: ["safe", "low", "moderate", "high", "deadly"], default: "low" },
        features: tags,
        description: longText,
        secrets: longText,
      },
      additionalProperties: false,
    },
    sheet: {
      sections: [
        {
          id: "overview",
          title: "Overview",
          columns: 2,
          fields: [
            select("environment", "Environment", ENVIRONMENTS),
            select("danger", "Danger", ["safe", "low", "moderate", "high", "deadly"]),
            { path: "features", label: "Notable features", widget: "tags", span: 12 },
            { path: "description", label: "Description", widget: "textarea", span: 12 },
          ],
        },
        { id: "secrets", title: "Secrets", fields: [{ path: "secrets", label: "Secrets", widget: "textarea" }] },
      ],
      summary: ["environment", "danger"],
    },
    subtypes: [
      {
        id: "settlement",
        name: "Settlement",
        sheet: {
          sections: [
            {
              id: "settlement",
              title: "Settlement",
              columns: 3,
              fields: [select("size", "Size", ["hamlet", "village", "town", "city", "metropolis"]), { path: "population", label: "Population", widget: "text" }, { path: "ruler", label: "Who is in charge", widget: "text" }],
            },
          ],
        },
      },
      { id: "dungeon", name: "Dungeon or lair" },
      { id: "wilderness", name: "Wilderness" },
      { id: "building", name: "Building" },
      { id: "plane", name: "Plane" },
    ],
    defaultVisibility: { secrets: "gm" },
  };
}

export function factionType(): EntityTypeDef {
  return {
    id: FACTION,
    kind: "faction",
    name: "Faction",
    plural: "Factions",
    icon: "flag",
    schema: {
      type: "object",
      properties: {
        goal: text(400),
        leader: text(200),
        alignment: { type: "string", enum: ["lawful-good", "neutral-good", "chaotic-good", "lawful-neutral", "neutral", "chaotic-neutral", "lawful-evil", "neutral-evil", "chaotic-evil"] },
        resources: text(1000),
        standing: { ...int(-3, 3, 0), description: "The party's standing: -3 sworn enemies, 0 unknown, +3 trusted allies." },
        methods: text(1000),
        secrets: longText,
      },
      additionalProperties: false,
    },
    sheet: {
      sections: [
        {
          id: "overview",
          title: "Overview",
          columns: 2,
          fields: [
            { path: "goal", label: "What they want", widget: "textarea", span: 12 },
            { path: "leader", label: "Leader", widget: "text" },
            { path: "alignment", label: "Alignment", widget: "select", options: { ref: LIST.alignments } },
            { path: "standing", label: "Party standing (-3 to +3)", widget: "attribute" },
            { path: "resources", label: "Resources", widget: "textarea" },
            { path: "methods", label: "Methods", widget: "textarea" },
          ],
        },
        { id: "secrets", title: "Secrets", fields: [{ path: "secrets", label: "Secrets", widget: "textarea" }] },
      ],
      summary: ["goal", "standing"],
    },
    defaultVisibility: { secrets: "gm" },
  };
}

export function itemType(): EntityTypeDef {
  return {
    id: ITEM,
    kind: "item",
    name: "Item",
    plural: "Items",
    icon: "box",
    schema: {
      type: "object",
      properties: {
        category: text(80),
        rarity: { type: "string", enum: ["mundane", "common", "uncommon", "rare", "very rare", "legendary", "artifact"], default: "mundane" },
        attunement: { type: "boolean", default: false },
        attunedTo: text(120),
        value: text(80),
        weight: { type: "number", minimum: 0 },
        charges: { type: "object", properties: { current: int(0, 100, 0), max: int(0, 100, 0) }, additionalProperties: false },
        description: longText,
        notes: longText,
      },
      additionalProperties: false,
    },
    sheet: {
      sections: [
        {
          id: "item",
          title: "Item",
          columns: 3,
          fields: [
            { path: "category", label: "Category", widget: "text" },
            select("rarity", "Rarity", ["mundane", "common", "uncommon", "rare", "very rare", "legendary", "artifact"]),
            { path: "attunement", label: "Requires attunement", widget: "checkbox" },
            { path: "attunedTo", label: "Attuned to", widget: "text" },
            { path: "value", label: "Value", widget: "text" },
            { path: "weight", label: "Weight (lb.)", widget: "number" },
            { path: "charges.current", label: "Charges", widget: "number" },
            { path: "charges.max", label: "Max charges", widget: "number" },
            { path: "description", label: "Description", widget: "textarea", span: 12 },
          ],
        },
        { id: "notes", title: "GM notes", collapsed: true, fields: [{ path: "notes", label: "Notes", widget: "textarea" }] },
      ],
      summary: ["rarity", "category"],
    },
    defaultVisibility: { notes: "gm" },
  };
}

export function encounterType(): EntityTypeDef {
  return {
    id: ENCOUNTER,
    kind: "encounter",
    name: "Encounter",
    plural: "Encounters",
    icon: "swords",
    schema: {
      type: "object",
      properties: {
        environment: { type: "string", enum: ENVIRONMENTS },
        partyLevel: int(1, 20, 1),
        creatures: text(1000),
        activity: text(400),
        twist: text(400),
        tactics: text(2000),
        treasure: text(2000),
        xpTotal: int(0, 10000000, 0),
        status: { type: "string", enum: ["planned", "running", "done", "skipped"], default: "planned" },
        notes: longText,
      },
      additionalProperties: false,
    },
    sheet: {
      sections: [
        {
          id: "encounter",
          title: "Encounter",
          columns: 3,
          fields: [
            select("environment", "Environment", ENVIRONMENTS),
            { path: "partyLevel", label: "Party level", widget: "number" },
            select("status", "Status", ["planned", "running", "done", "skipped"]),
            { path: "creatures", label: "Creatures", widget: "textarea", span: 12 },
            { path: "activity", label: "What they are doing", widget: "text", span: 6 },
            { path: "twist", label: "Twist", widget: "text", span: 6 },
            { path: "xpTotal", label: "XP (total)", widget: "number" },
            { path: "tactics", label: "Tactics", widget: "textarea", span: 12 },
            { path: "treasure", label: "Treasure", widget: "textarea", span: 12 },
          ],
        },
        { id: "notes", title: "GM notes", collapsed: true, fields: [{ path: "notes", label: "Notes", widget: "textarea" }] },
      ],
      summary: ["creatures", "status"],
    },
    defaultVisibility: { tactics: "gm", notes: "gm", treasure: "gm" },
  };
}

export function questType(): EntityTypeDef {
  return {
    id: QUEST,
    kind: "job",
    name: "Quest",
    plural: "Quests",
    icon: "briefcase",
    schema: {
      type: "object",
      properties: {
        hook: text(1000),
        patron: text(200),
        objective: text(1000),
        reward: text(400),
        deadline: text(200),
        status: { type: "string", enum: ["rumour", "offered", "active", "completed", "failed"], default: "rumour" },
        complications: longText,
      },
      additionalProperties: false,
    },
    sheet: {
      sections: [
        {
          id: "quest",
          title: "Quest",
          columns: 2,
          fields: [
            { path: "hook", label: "Hook", widget: "textarea", span: 12 },
            { path: "patron", label: "Patron", widget: "text" },
            select("status", "Status", ["rumour", "offered", "active", "completed", "failed"]),
            { path: "objective", label: "Objective", widget: "textarea" },
            { path: "reward", label: "Reward", widget: "text" },
            { path: "deadline", label: "Deadline", widget: "text" },
            { path: "complications", label: "Complications", widget: "textarea", span: 12 },
          ],
        },
      ],
      summary: ["status", "patron"],
    },
    defaultVisibility: { complications: "gm" },
  };
}
