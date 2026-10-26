/**
 * The fifth edition character builder (`characterBuilders` in pack.json):
 * Edition → Species/Race → Class → Background → Ability scores → Starting
 * level → Spells → Equipment → Details → Review, and a level-up that adds a
 * class level (multiclassing included).
 *
 * The SRD lists carry most rules as text, so the builder attaches structured
 * data to their items (`itemData`): ability increases, speed, size and
 * darkvision of each race and lineage, each class's saves, proficiencies,
 * skill choices, equipment packages, spell counts and multiclass rules, each
 * background's skills, ability scores and origin feat. Everything is the
 * SRD's own numbers and names, read from the converted lists where they hold
 * them (class tables, features, traits, equipment) and written out here
 * where they are prose (cited per class or race); nothing is invented. The
 * three ability score methods are the SRD 5.2's (Character Creation); the
 * edition note for mixing the two rule sets is the module's own.
 *
 * Every rule is JSONLogic (rule 5), so the builder is plain data in the pack.
 */
import type { CharacterBuilderDef, CharacterBuilderGrant, CharacterBuilderStep, CharacterBuilderSubChoice, ReferenceItem, ReferenceList, RuleCard } from "@campaign-forge/module-sdk";
import { ABILITIES, CHARACTER, CLASSES, LIST, SKILLS, cite, cite52, id, rule, type AbilityId } from "../ids.ts";
import { add, cat, eq, floor, gt, ifs, lookup, max, min, mul, sub, v, type Rule } from "./logic.ts";

// ---------------------------------------------------------------------------
// JSONLogic helpers
// ---------------------------------------------------------------------------

/** `and` of nothing is true and `or` of nothing false (JSONLogic gives undefined for both). */
const and = (...xs: Rule[]): Rule => (xs.length ? { and: xs } : true);
const or = (...xs: Rule[]): Rule => (xs.length ? { or: xs } : false);
const not = (x: Rule): Rule => ({ "!": x });
const ne = (a: Rule, b: Rule): Rule => ({ "!=": [a, b] });
const lte = (a: Rule, b: Rule): Rule => ({ "<=": [a, b] });
const gte = (a: Rule, b: Rule): Rule => ({ ">=": [a, b] });
const lt = (a: Rule, b: Rule): Rule => ({ "<": [a, b] });
const isIn = (a: Rule, list: Rule): Rule => ({ in: [a, list] });
const count = (x: Rule): Rule => ({ count: x });
const find = (list: Rule, key: string, value: Rule): Rule => ({ find: [list, key, value] });
const lit = (x: unknown): Rule => x as Rule;
/** A list literal (a JSONLogic array evaluates element by element, so strings and numbers stay as they are). */
const list = (xs: Array<string | number>): Rule => xs as unknown as Rule;
/** The value at a computed path, with a fallback. */
const varAt = (path: Rule, fallback: unknown): Rule => ({ var: [path, fallback as Rule] });

const E = v("choices.edition.id", "2014");
const L = v("choices.level.value", 1);
const CLASS_NAME = v("choices.class.item.name", "");
const CB = (k: string, d?: unknown) => v(`choices.class.item.builder.${k}`, d);
const ABILITY_IDS = ABILITIES.map((a) => a.id);
const ABILITY_OPTIONS = ABILITIES.map((a) => ({ id: a.id, name: a.name }));
const level1 = (arr: string): Rule => lookup(v(arr, []), sub(L, 1), []);

/** Items of the current edition: 2014 keeps SRD 5.1 items, 2024 SRD 5.2 ones; supplement items (a source that is not SRD 5.2) show in every edition. */
function editionWhere(candidate = "option"): Rule {
  const ed = v(`${candidate}.edition`, "");
  const supplement = and(v(`${candidate}.source`, ""), ne(v(`${candidate}.source`, ""), "SRD 5.2"));
  return ifs(eq(E, "2014"), ne(ed, "2024"), eq(E, "2024"), or(eq(ed, "2024"), supplement), true);
}

/** Add an ability increase object (`{ dexterity: 2 }`) found at `obj`, one grant per ability. */
function addAbilities(obj: Rule, when?: Rule): CharacterBuilderGrant {
  return { path: cat("abilities.", v("entry")), op: "add", each: list(ABILITY_IDS), value: lookup(obj, v("entry"), 0), when: when === undefined ? ne(lookup(obj, v("entry"), 0), 0) : and(ne(lookup(obj, v("entry"), 0), 0), when) };
}

/** Append reference items as features `{ name, desc }`. */
function featuresFrom(listId: string, where: Rule): CharacterBuilderGrant {
  return { path: "features", op: "append", each: { list: listId, where }, object: { name: v("entry.name"), desc: v("entry.description", "") } };
}

/** A choice of `count` skills (ids at `from`, or every skill), skipping ones already held; each sets proficiency. */
function skillChoice(idName: string, label: Rule, from: Rule | null, countRule: Rule, when: Rule, extraAvailable?: Rule): CharacterBuilderSubChoice {
  const notHeld = lt(varAt(cat("fields.skills.", v("option.id")), 0), 1);
  return {
    id: idName,
    label,
    when,
    source: from === null ? { list: LIST.skills } : { values: from, list: LIST.skills },
    min: countRule,
    max: countRule,
    available: extraAvailable ? and(notHeld, extraAvailable) : notHeld,
    availableText: ifs(notHeld, "Your background gives it.", "Already proficient."),
    grants: [{ path: cat("skills.", v("item.id")), value: 1 }],
  };
}

// ---------------------------------------------------------------------------
// Source data helpers
// ---------------------------------------------------------------------------

function listById(lists: ReferenceList[], listId: string): ReferenceList {
  const l = lists.find((x) => x.id === listId);
  if (!l) throw new Error(`builder: list ${listId} is missing`);
  return l;
}

function need(l: ReferenceList, itemId: string): ReferenceItem {
  const it = l.items.find((x) => x.id === itemId);
  if (!it) throw new Error(`builder: ${l.id} has no item ${itemId}`);
  return it;
}

/** Weight in pounds from "2 lb." ("—" and fractions such as "1/4 lb." handled). */
function pounds(w: unknown): number | undefined {
  const t = String(w ?? "").trim();
  const m = /^(\d+(?:\.\d+)?)(?:\/(\d+))?\s*lb/.exec(t);
  if (!m) return undefined;
  return m[2] ? Number(m[1]) / Number(m[2]) : Number(m[1]);
}

/** A markdown table column by header ("Cantrips known"), one number per level row. */
function progressionColumn(progression: unknown, header: string): number[] | undefined {
  const rows = String(progression ?? "")
    .split("\n")
    .filter((r) => r.startsWith("|"))
    .map((r) => r.split("|").slice(1, -1).map((c) => c.trim()));
  const head = rows[0];
  if (!head) return undefined;
  const i = head.findIndex((h) => h.toLowerCase() === header.toLowerCase());
  if (i < 0) return undefined;
  const out = rows.slice(2).map((r) => Number(r[i]));
  return out.length === 20 && out.every((n) => Number.isFinite(n)) ? out : undefined;
}

// ---------------------------------------------------------------------------
// Classes (SRD 5.1, Classes; Multiclassing)
// ---------------------------------------------------------------------------

interface EquipItem {
  name: string;
  quantity?: number;
}
interface EquipPick {
  list: "weapons" | "gear" | "tools";
  categories: string[];
  count: number;
  label: string;
}
interface EquipOption {
  name: string;
  items?: Array<string | EquipItem>;
  picks?: EquipPick[];
}
interface ClassSpec {
  skills: { choose: number; from: string[] | "any" };
  proficiencies: string;
  tools?: { choose: number; categories: string[]; label: string };
  unarmored?: AbilityId;
  fixed: Array<string | EquipItem>;
  fixedPicks?: EquipPick[];
  choices: EquipOption[][];
  multiclass: { all?: Partial<Record<AbilityId, number>>; any?: Partial<Record<AbilityId, number>>; proficiencies: string; skill?: string[] | "any"; tool?: { categories: string[]; label: string } };
  spellcasting?: { kind: "known" | "prepared" | "spellbook" | "pact"; prepared?: { divisor: number } };
  expertise?: number[];
  todo?: string[];
}

const SIMPLE = ["Simple Melee", "Simple Ranged"];
const MARTIAL = ["Martial Melee", "Martial Ranged"];
const pickW = (categories: string[], n: number, label: string): EquipPick => ({ list: "weapons", categories, count: n, label });
const focus = (cat: string, label: string): EquipPick => ({ list: "gear", categories: [cat], count: 1, label });
const instrument: EquipPick = { list: "tools", categories: ["Musical Instrument"], count: 1, label: "a musical instrument" };

/** Class data the SRD 5.1 gives as prose: proficiencies, skills, equipment, multiclassing. Hit dice, saves, levels, features and spell slots come from the class list. */
const CLASS_SPECS: Record<(typeof CLASSES)[number], ClassSpec> = {
  barbarian: {
    skills: { choose: 2, from: ["animal-handling", "athletics", "intimidation", "nature", "perception", "survival"] },
    proficiencies: "Light armor, medium armor, shields; simple and martial weapons",
    unarmored: "constitution",
    fixed: ["Explorer's Pack", { name: "Javelin", quantity: 4 }],
    choices: [
      [{ name: "a greataxe", items: ["Greataxe"] }, { name: "any martial melee weapon", picks: [pickW(["Martial Melee"], 1, "a martial melee weapon")] }],
      [{ name: "two handaxes", items: [{ name: "Handaxe", quantity: 2 }] }, { name: "any simple weapon", picks: [pickW(SIMPLE, 1, "a simple weapon")] }],
    ],
    multiclass: { all: { strength: 13 }, proficiencies: "Shields; simple and martial weapons" },
  },
  bard: {
    skills: { choose: 3, from: "any" },
    proficiencies: "Light armor; simple weapons, hand crossbows, longswords, rapiers, shortswords",
    tools: { choose: 3, categories: ["Musical Instrument"], label: "Three musical instruments" },
    fixed: ["Leather Armor", "Dagger"],
    choices: [
      [{ name: "a rapier", items: ["Rapier"] }, { name: "a longsword", items: ["Longsword"] }, { name: "any simple weapon", picks: [pickW(SIMPLE, 1, "a simple weapon")] }],
      [{ name: "a diplomat's pack", items: ["Diplomat's Pack"] }, { name: "an entertainer's pack", items: ["Entertainer's Pack"] }],
      [{ name: "a lute", items: ["Lute"] }, { name: "any other musical instrument", picks: [instrument] }],
    ],
    multiclass: { all: { charisma: 13 }, proficiencies: "Light armor", skill: "any", tool: { categories: ["Musical Instrument"], label: "One musical instrument" } },
    spellcasting: { kind: "known" },
    expertise: [3, 10],
    todo: ["Jack of All Trades (half proficiency on other checks) is not added to the skill bonuses."],
  },
  cleric: {
    skills: { choose: 2, from: ["history", "insight", "medicine", "persuasion", "religion"] },
    proficiencies: "Light armor, medium armor, shields; simple weapons",
    fixed: ["Shield"],
    fixedPicks: [focus("Holy Symbols", "a holy symbol")],
    choices: [
      [{ name: "a mace", items: ["Mace"] }, { name: "a warhammer (if proficient)", items: ["Warhammer"] }],
      [{ name: "scale mail", items: ["Scale Mail"] }, { name: "leather armor", items: ["Leather Armor"] }, { name: "chain mail (if proficient)", items: ["Chain Mail"] }],
      [{ name: "a light crossbow and 20 bolts", items: ["Crossbow, light", { name: "Crossbow bolt", quantity: 20 }] }, { name: "any simple weapon", picks: [pickW(SIMPLE, 1, "a simple weapon")] }],
      [{ name: "a priest's pack", items: ["Priest's Pack"] }, { name: "an explorer's pack", items: ["Explorer's Pack"] }],
    ],
    multiclass: { all: { wisdom: 13 }, proficiencies: "Light armor, medium armor, shields" },
    spellcasting: { kind: "prepared", prepared: { divisor: 1 } },
  },
  druid: {
    skills: { choose: 2, from: ["arcana", "animal-handling", "insight", "medicine", "nature", "perception", "religion", "survival"] },
    proficiencies: "Light armor, medium armor, shields (druids will not wear armor or use shields made of metal); clubs, daggers, darts, javelins, maces, quarterstaffs, scimitars, sickles, slings, spears; herbalism kit",
    fixed: ["Leather Armor", "Explorer's Pack"],
    fixedPicks: [focus("Druidic Foci", "a druidic focus")],
    choices: [
      [{ name: "a wooden shield", items: ["Shield"] }, { name: "any simple weapon", picks: [pickW(SIMPLE, 1, "a simple weapon")] }],
      [{ name: "a scimitar", items: ["Scimitar"] }, { name: "any simple melee weapon", picks: [pickW(["Simple Melee"], 1, "a simple melee weapon")] }],
    ],
    multiclass: { all: { wisdom: 13 }, proficiencies: "Light armor, medium armor, shields (druids will not wear armor or use shields made of metal)" },
    spellcasting: { kind: "prepared", prepared: { divisor: 1 } },
  },
  fighter: {
    skills: { choose: 2, from: ["acrobatics", "animal-handling", "athletics", "history", "insight", "intimidation", "perception", "survival"] },
    proficiencies: "All armor, shields; simple and martial weapons",
    fixed: [],
    choices: [
      [{ name: "chain mail", items: ["Chain Mail"] }, { name: "leather armor, longbow, and 20 arrows", items: ["Leather Armor", "Longbow", { name: "Arrow", quantity: 20 }] }],
      [{ name: "a martial weapon and a shield", items: ["Shield"], picks: [pickW(MARTIAL, 1, "a martial weapon")] }, { name: "two martial weapons", picks: [pickW(MARTIAL, 2, "two martial weapons")] }],
      [{ name: "a light crossbow and 20 bolts", items: ["Crossbow, light", { name: "Crossbow bolt", quantity: 20 }] }, { name: "two handaxes", items: [{ name: "Handaxe", quantity: 2 }] }],
      [{ name: "a dungeoneer's pack", items: ["Dungeoneer's Pack"] }, { name: "an explorer's pack", items: ["Explorer's Pack"] }],
    ],
    multiclass: { any: { strength: 13, dexterity: 13 }, proficiencies: "Light armor, medium armor, shields; simple and martial weapons" },
  },
  monk: {
    skills: { choose: 2, from: ["acrobatics", "athletics", "history", "insight", "religion", "stealth"] },
    proficiencies: "Simple weapons, shortswords",
    tools: { choose: 1, categories: ["Artisan's Tools", "Musical Instrument"], label: "One type of artisan's tools or one musical instrument" },
    unarmored: "wisdom",
    fixed: [{ name: "Dart", quantity: 10 }],
    choices: [
      [{ name: "a shortsword", items: ["Shortsword"] }, { name: "any simple weapon", picks: [pickW(SIMPLE, 1, "a simple weapon")] }],
      [{ name: "a dungeoneer's pack", items: ["Dungeoneer's Pack"] }, { name: "an explorer's pack", items: ["Explorer's Pack"] }],
    ],
    multiclass: { all: { dexterity: 13, wisdom: 13 }, proficiencies: "Simple weapons, shortswords" },
  },
  paladin: {
    skills: { choose: 2, from: ["athletics", "insight", "intimidation", "medicine", "persuasion", "religion"] },
    proficiencies: "All armor, shields; simple and martial weapons",
    fixed: ["Chain Mail"],
    fixedPicks: [focus("Holy Symbols", "a holy symbol")],
    choices: [
      [{ name: "a martial weapon and a shield", items: ["Shield"], picks: [pickW(MARTIAL, 1, "a martial weapon")] }, { name: "two martial weapons", picks: [pickW(MARTIAL, 2, "two martial weapons")] }],
      [{ name: "five javelins", items: [{ name: "Javelin", quantity: 5 }] }, { name: "any simple melee weapon", picks: [pickW(["Simple Melee"], 1, "a simple melee weapon")] }],
      [{ name: "a priest's pack", items: ["Priest's Pack"] }, { name: "an explorer's pack", items: ["Explorer's Pack"] }],
    ],
    multiclass: { all: { strength: 13, charisma: 13 }, proficiencies: "Light armor, medium armor, shields; simple and martial weapons" },
    spellcasting: { kind: "prepared", prepared: { divisor: 2 } },
  },
  ranger: {
    skills: { choose: 3, from: ["animal-handling", "athletics", "insight", "investigation", "nature", "perception", "stealth", "survival"] },
    proficiencies: "Light armor, medium armor, shields; simple and martial weapons",
    fixed: ["Longbow", "Quiver", { name: "Arrow", quantity: 20 }],
    choices: [
      [{ name: "scale mail", items: ["Scale Mail"] }, { name: "leather armor", items: ["Leather Armor"] }],
      [{ name: "two shortswords", items: [{ name: "Shortsword", quantity: 2 }] }, { name: "two simple melee weapons", picks: [pickW(["Simple Melee"], 2, "two simple melee weapons")] }],
      [{ name: "a dungeoneer's pack", items: ["Dungeoneer's Pack"] }, { name: "an explorer's pack", items: ["Explorer's Pack"] }],
    ],
    multiclass: { all: { dexterity: 13, wisdom: 13 }, proficiencies: "Light armor, medium armor, shields; simple and martial weapons", skill: ["animal-handling", "athletics", "insight", "investigation", "nature", "perception", "stealth", "survival"] },
    spellcasting: { kind: "known" },
    todo: ["Favored Enemy and Natural Explorer: note the creature types and terrains you chose."],
  },
  rogue: {
    skills: { choose: 4, from: ["acrobatics", "athletics", "deception", "insight", "intimidation", "investigation", "perception", "performance", "persuasion", "sleight-of-hand", "stealth"] },
    proficiencies: "Light armor; simple weapons, hand crossbows, longswords, rapiers, shortswords; thieves' tools",
    fixed: ["Leather Armor", { name: "Dagger", quantity: 2 }, "Thieves' Tools"],
    choices: [
      [{ name: "a rapier", items: ["Rapier"] }, { name: "a shortsword", items: ["Shortsword"] }],
      [{ name: "a shortbow and quiver of 20 arrows", items: ["Shortbow", "Quiver", { name: "Arrow", quantity: 20 }] }, { name: "a shortsword", items: ["Shortsword"] }],
      [{ name: "a burglar's pack", items: ["Burglar's Pack"] }, { name: "a dungeoneer's pack", items: ["Dungeoneer's Pack"] }, { name: "an explorer's pack", items: ["Explorer's Pack"] }],
    ],
    multiclass: { all: { dexterity: 13 }, proficiencies: "Light armor; thieves' tools", skill: ["acrobatics", "athletics", "deception", "insight", "intimidation", "investigation", "perception", "performance", "persuasion", "sleight-of-hand", "stealth"] },
    expertise: [1, 6],
    todo: ["Expertise with thieves' tools (instead of a skill) is not offered: note it by hand."],
  },
  sorcerer: {
    skills: { choose: 2, from: ["arcana", "deception", "insight", "intimidation", "persuasion", "religion"] },
    proficiencies: "Daggers, darts, slings, quarterstaffs, light crossbows",
    fixed: [{ name: "Dagger", quantity: 2 }],
    choices: [
      [{ name: "a light crossbow and 20 bolts", items: ["Crossbow, light", { name: "Crossbow bolt", quantity: 20 }] }, { name: "any simple weapon", picks: [pickW(SIMPLE, 1, "a simple weapon")] }],
      [{ name: "a component pouch", items: ["Component pouch"] }, { name: "an arcane focus", picks: [focus("Arcane Foci", "an arcane focus")] }],
      [{ name: "a dungeoneer's pack", items: ["Dungeoneer's Pack"] }, { name: "an explorer's pack", items: ["Explorer's Pack"] }],
    ],
    multiclass: { all: { charisma: 13 }, proficiencies: "" },
    spellcasting: { kind: "known" },
  },
  warlock: {
    skills: { choose: 2, from: ["arcana", "deception", "history", "intimidation", "investigation", "nature", "religion"] },
    proficiencies: "Light armor; simple weapons",
    fixed: ["Leather Armor", { name: "Dagger", quantity: 2 }],
    fixedPicks: [pickW(SIMPLE, 1, "any simple weapon")],
    choices: [
      [{ name: "a light crossbow and 20 bolts", items: ["Crossbow, light", { name: "Crossbow bolt", quantity: 20 }] }, { name: "any simple weapon", picks: [pickW(SIMPLE, 1, "a simple weapon")] }],
      [{ name: "a component pouch", items: ["Component pouch"] }, { name: "an arcane focus", picks: [focus("Arcane Foci", "an arcane focus")] }],
      [{ name: "a scholar's pack", items: ["Scholar's Pack"] }, { name: "a dungeoneer's pack", items: ["Dungeoneer's Pack"] }],
    ],
    multiclass: { all: { charisma: 13 }, proficiencies: "Light armor; simple weapons" },
    spellcasting: { kind: "pact" },
  },
  wizard: {
    skills: { choose: 2, from: ["arcana", "history", "insight", "investigation", "medicine", "religion"] },
    proficiencies: "Daggers, darts, slings, quarterstaffs, light crossbows",
    fixed: ["Spellbook"],
    choices: [
      [{ name: "a quarterstaff", items: ["Quarterstaff"] }, { name: "a dagger", items: ["Dagger"] }],
      [{ name: "a component pouch", items: ["Component pouch"] }, { name: "an arcane focus", picks: [focus("Arcane Foci", "an arcane focus")] }],
      [{ name: "a scholar's pack", items: ["Scholar's Pack"] }, { name: "an explorer's pack", items: ["Explorer's Pack"] }],
    ],
    multiclass: { all: { intelligence: 13 }, proficiencies: "" },
    spellcasting: { kind: "spellbook", prepared: { divisor: 1 } },
  },
};

/** Option features (pick one of): "Fighting Style: Archery" and the like, grouped under the feature that offers them. */
interface GroupSpec {
  class: string;
  subclass?: string;
  name: string;
  /** Option feature names start with this. */
  prefix?: string;
  /** Or these option features (by id). */
  ids?: string[];
  /** Picks by class level: level -> how many in all from then on. */
  counts: Record<number, number>;
}
const GROUPS: GroupSpec[] = [
  { class: "Fighter", name: "Fighting Style", prefix: "Fighting Style: ", counts: { 1: 1 } },
  { class: "Paladin", name: "Fighting Style", prefix: "Fighting Style: ", counts: { 2: 1 } },
  { class: "Ranger", name: "Fighting Style", prefix: "Fighting Style: ", counts: { 2: 1 } },
  { class: "Sorcerer", name: "Metamagic", prefix: "Metamagic: ", counts: { 3: 2, 10: 3, 17: 4 } },
  { class: "Warlock", name: "Pact Boon", ids: ["pact-of-the-blade", "pact-of-the-chain", "pact-of-the-tome"], counts: { 3: 1 } },
  { class: "Warlock", name: "Eldritch Invocations", prefix: "Eldritch Invocation: ", counts: {} },
  { class: "Fighter", subclass: "Champion", name: "Additional Fighting Style", prefix: "Fighting Style: ", counts: { 10: 1 } },
  { class: "Druid", subclass: "Land", name: "Circle of the Land", prefix: "Circle of the Land: ", counts: { 2: 1 } },
  { class: "Sorcerer", subclass: "Draconic", name: "Dragon Ancestor", prefix: "Dragon Ancestor: ", counts: { 1: 1 } },
  { class: "Ranger", subclass: "Hunter", name: "Hunter's Prey", prefix: "Hunter's Prey: ", counts: { 3: 1 } },
  { class: "Ranger", subclass: "Hunter", name: "Defensive Tactics", prefix: "Defensive Tactics: ", counts: { 7: 1 } },
  { class: "Ranger", subclass: "Hunter", name: "Multiattack", prefix: "Multiattack: ", counts: { 11: 1 } },
  { class: "Ranger", subclass: "Hunter", name: "Superior Hunter's Defense", prefix: "Superior Hunter's Defense: ", counts: { 15: 1 } },
];
/** Features that stand for a later choice or a placeholder ("Arcane Tradition feature"), not granted as text. */
const PLACEHOLDER = /^(Ability Score Improvement|.* feature)$/;

/** Subclass data the SRD gives as prose (bonus proficiencies). */
const SUBCLASS_SPECS: Record<string, { proficiencies?: string; skills?: number }> = {
  life: { proficiencies: "Heavy armor" },
  lore: { skills: 3 },
};

/** Multiclass Spellcaster: the counts of each class's casting (SRD 5.1, the class tables). */
function spellcastingData(cls: ReferenceItem, spec: ClassSpec, slots: number[][] | undefined) {
  if (!spec.spellcasting) return undefined;
  const cantrips = progressionColumn(cls.progression, "Cantrips known") ?? Array(20).fill(0);
  const known = spec.spellcasting.kind === "spellbook" ? Array.from({ length: 20 }, (_, i) => 6 + 2 * i) : progressionColumn(cls.progression, "Spells known");
  if (!slots) throw new Error(`builder: no spell slots for ${cls.id}`);
  const maxLevel = slots.map((row) => row.reduce((m, n, i) => (n > 0 ? i + 1 : m), 0));
  const ability = String(cls.spellcasting).toLowerCase();
  if (!ABILITY_IDS.includes(ability as AbilityId)) throw new Error(`builder: ${cls.id} spellcasting ability ${String(cls.spellcasting)}`);
  return {
    kind: spec.spellcasting.kind,
    ability,
    list: cls.name,
    cantrips,
    ...(spec.spellcasting.kind === "prepared" ? {} : { known: known ?? Array(20).fill(0) }),
    ...(spec.spellcasting.prepared ? { preparedDivisor: spec.spellcasting.prepared.divisor } : {}),
    maxLevel,
  };
}

// ---------------------------------------------------------------------------
// Races and species (SRD 5.1, Races; SRD 5.2, Character Origins: Species)
// ---------------------------------------------------------------------------

interface RaceSpec {
  asi?: Partial<Record<AbilityId, number>>;
  speed?: number;
  size?: string;
  sizes?: string[];
  darkvision?: number;
  languages?: string[];
  languageChoice?: number;
  skills?: string[];
  skillChoice?: { count: number; from?: string[] };
  asiChoice?: { count: number; amount: number; exclude: AbilityId[] };
  proficiencies?: string;
  toolChoice?: string[];
  traits?: string[];
  hpPerLevel?: number;
  cantripChoice?: string;
  spells?: Array<{ name: string; level: number }>;
  originFeat?: boolean;
  ancestry?: string[];
  lineage?: boolean;
}

const DRAGON_COLOURS = ["black", "blue", "brass", "bronze", "copper", "gold", "green", "red", "silver", "white"];
const RACE_SPECS: Record<string, RaceSpec> = {
  // SRD 5.1
  dwarf: { asi: { constitution: 2 }, speed: 25, size: "Medium", darkvision: 60, languages: ["Common", "Dwarvish"], proficiencies: "Battleaxe, handaxe, light hammer, warhammer", toolChoice: ["smiths-tools", "brewers-supplies", "masons-tools"], traits: ["darkvision", "dwarven-resilience", "dwarven-combat-training", "tool-proficiency", "stonecunning"], lineage: true },
  "hill-dwarf": { asi: { wisdom: 1 }, traits: ["dwarven-toughness"], hpPerLevel: 1 },
  elf: { asi: { dexterity: 2 }, speed: 30, size: "Medium", darkvision: 60, languages: ["Common", "Elvish"], skills: ["perception"], traits: ["darkvision", "keen-senses", "fey-ancestry", "trance"], lineage: true },
  "high-elf": { asi: { intelligence: 1 }, proficiencies: "Longsword, shortsword, shortbow, longbow", traits: ["elf-weapon-training", "high-elf-cantrip", "extra-language"], cantripChoice: "Wizard", languageChoice: 1 },
  halfling: { asi: { dexterity: 2 }, speed: 25, size: "Small", languages: ["Common", "Halfling"], traits: ["lucky", "brave", "halfling-nimbleness"], lineage: true },
  "lightfoot-halfling": { asi: { charisma: 1 }, traits: ["naturally-stealthy"] },
  human: { asi: { strength: 1, dexterity: 1, constitution: 1, intelligence: 1, wisdom: 1, charisma: 1 }, speed: 30, size: "Medium", languages: ["Common"], languageChoice: 1 },
  dragonborn: { asi: { strength: 2, charisma: 1 }, speed: 30, size: "Medium", languages: ["Common", "Draconic"], traits: ["draconic-ancestry", "breath-weapon", "damage-resistance"], ancestry: DRAGON_COLOURS.map((c) => `draconic-ancestry-${c}`) },
  gnome: { asi: { intelligence: 2 }, speed: 25, size: "Small", darkvision: 60, languages: ["Common", "Gnomish"], traits: ["darkvision", "gnome-cunning"], lineage: true },
  "rock-gnome": { asi: { constitution: 1 }, proficiencies: "Tinker's tools", traits: ["artificers-lore", "tinker"] },
  "half-elf": { asi: { charisma: 2 }, asiChoice: { count: 2, amount: 1, exclude: ["charisma"] }, speed: 30, size: "Medium", darkvision: 60, languages: ["Common", "Elvish"], languageChoice: 1, skillChoice: { count: 2 }, traits: ["darkvision", "fey-ancestry", "skill-versatility"] },
  "half-orc": { asi: { strength: 2, constitution: 1 }, speed: 30, size: "Medium", darkvision: 60, languages: ["Common", "Orc"], skills: ["intimidation"], traits: ["darkvision", "menacing", "relentless-endurance", "savage-attacks"] },
  tiefling: { asi: { intelligence: 1, charisma: 2 }, speed: 30, size: "Medium", darkvision: 60, languages: ["Common", "Infernal"], traits: ["darkvision", "hellish-resistance", "infernal-legacy"], spells: [{ name: "Thaumaturgy", level: 1 }, { name: "Hellish Rebuke", level: 3 }, { name: "Darkness", level: 5 }] },
  // SRD 5.2 (no ability increases: they come from the background)
  "dragonborn-2024": { speed: 30, size: "Medium", darkvision: 60, lineage: true },
  "dwarf-2024": { speed: 30, size: "Medium", darkvision: 120, hpPerLevel: 1 },
  "elf-2024": { speed: 30, size: "Medium", darkvision: 60, skillChoice: { count: 1, from: ["insight", "perception", "survival"] }, lineage: true },
  "gnome-2024": { speed: 30, size: "Small", darkvision: 60, lineage: true },
  "goliath-2024": { speed: 35, size: "Medium", lineage: true },
  "halfling-2024": { speed: 30, size: "Small" },
  "human-2024": { speed: 30, size: "Medium", skillChoice: { count: 1 }, originFeat: true },
  "orc-2024": { speed: 30, size: "Medium", darkvision: 120 },
  "tiefling-2024": { speed: 30, sizes: ["Small", "Medium"], darkvision: 60, spells: [{ name: "Thaumaturgy", level: 1 }], lineage: true },
};

/** SRD 5.2 lineages: speed and darkvision beyond the species', and the spells their traits name. */
const LINEAGE_EXTRA: Record<string, { speed?: number; darkvision?: number; spells?: Record<string, string> }> = {
  "elven-lineage-drow-2024": { darkvision: 120 },
  "elven-lineage-wood-elf-2024": { speed: 35 },
  "elven-lineage-high-elf-2024": { spells: { "High Elf: Cantrip Versatility": "Prestidigitation" } },
  "gnomish-lineage-rock-gnome-2024": { spells: { "Gnomish Lineage: Rock Gnome": "Prestidigitation" } },
  "gnomish-lineage-forest-gnome-2024": { spells: { "Gnomish Lineage: Forest Gnome": "Speak with Animals" } },
};

function raceData(lists: ReferenceList[]): { races: Record<string, Record<string, unknown>>; subraces: Record<string, Record<string, unknown>> } {
  const races = listById(lists, LIST.races);
  const subraces = listById(lists, LIST.subraces);
  const traits = listById(lists, LIST.racialTraits);
  const tools = listById(lists, LIST.tools as string) as ReferenceList;
  const out: Record<string, Record<string, unknown>> = {};
  for (const r of races.items) {
    const spec = RACE_SPECS[r.id];
    if (!spec) throw new Error(`builder: no race data for ${r.id}`);
    const d: Record<string, unknown> = {};
    if (spec.asi) d.asi = spec.asi;
    if (spec.speed !== undefined) {
      if (Number(String(r.speed).replace(/\D/g, "")) !== spec.speed) throw new Error(`builder: ${r.id} speed ${String(r.speed)} vs ${spec.speed}`);
      d.speed = spec.speed;
    }
    if (spec.size) {
      if (r.size !== spec.size) throw new Error(`builder: ${r.id} size ${String(r.size)} vs ${spec.size}`);
      d.size = spec.size;
    }
    if (spec.sizes) d.sizes = spec.sizes;
    if (spec.darkvision) d.darkvision = spec.darkvision;
    if (spec.languages) d.languages = spec.languages;
    if (spec.languageChoice) d.languageChoice = spec.languageChoice;
    if (spec.skills) d.skills = spec.skills;
    if (spec.skillChoice) d.skillChoice = spec.skillChoice;
    if (spec.asiChoice) d.asiChoice = { ...spec.asiChoice, from: ABILITY_IDS.filter((a) => !spec.asiChoice!.exclude.includes(a)) };
    if (spec.proficiencies) d.proficiencies = spec.proficiencies;
    if (spec.toolChoice) {
      for (const t of spec.toolChoice) need(tools, t);
      d.toolChoice = spec.toolChoice;
    }
    if (spec.hpPerLevel) d.hpPerLevel = spec.hpPerLevel;
    if (spec.spells) d.spells = spec.spells;
    if (spec.originFeat) d.originFeat = true;
    if (spec.ancestry) {
      for (const t of spec.ancestry) need(traits, t);
      d.ancestry = spec.ancestry;
    }
    if (spec.lineage) d.lineage = true;
    // traits: the SRD 5.1 race's named ones; an SRD 5.2 species' own (not a lineage's)
    if (spec.traits) {
      for (const t of spec.traits) need(traits, t);
      d.traits = spec.traits;
    } else {
      const lineageNames = subraces.items.filter((s) => s.race === r.name).map((s) => s.name);
      const own = traits.items.filter((t) => {
        const of = String(t.races ?? "").split(",").map((s) => s.trim());
        return of.includes(r.name) && !of.some((n) => lineageNames.includes(n));
      });
      d.traits = own.map((t) => t.id);
    }
    out[r.id] = d;
  }
  const subs: Record<string, Record<string, unknown>> = {};
  for (const s of subraces.items) {
    const spec = RACE_SPECS[s.id];
    const d: Record<string, unknown> = {};
    if (spec) {
      if (spec.asi) d.asi = spec.asi;
      if (spec.proficiencies) d.proficiencies = spec.proficiencies;
      if (spec.hpPerLevel) d.hpPerLevel = spec.hpPerLevel;
      if (spec.cantripChoice) d.cantripChoice = spec.cantripChoice;
      if (spec.languageChoice) d.languageChoice = spec.languageChoice;
      for (const t of spec.traits ?? []) need(traits, t);
      d.traits = (spec.traits ?? []).map((t) => ({ id: t, level: 1 }));
    } else {
      if (s.edition !== "2024") throw new Error(`builder: no subrace data for ${s.id}`);
      // "Level 1: Darkvision (120 ft.), Dancing Lights; Level 3: Faerie Fire; Level 5: Darkness"
      const levels = new Map<string, number>();
      for (const part of String(s.summary ?? "").split(";")) {
        const m = /Level (\d+):\s*(.*)$/.exec(part.trim());
        if (m) for (const n of m[2]!.split(",").map((x) => x.trim()).filter(Boolean)) levels.set(n, Number(m[1]));
      }
      const mine = traits.items.filter((t) => String(t.races ?? "").split(",").map((x) => x.trim()).includes(s.name));
      if (!mine.length) throw new Error(`builder: no traits for lineage ${s.id}`);
      const extra = LINEAGE_EXTRA[s.id] ?? {};
      d.traits = mine.map((t) => ({ id: t.id, level: levels.get(t.name) ?? 1 }));
      const spells: Array<{ name: string; level: number }> = [];
      for (const t of mine) {
        const lvl = levels.get(t.name) ?? 1;
        if (t.id.startsWith("lineage-spell-")) spells.push({ name: t.name, level: lvl });
        const named = extra.spells?.[t.name];
        if (named) spells.push({ name: named, level: lvl });
      }
      if (spells.length) d.spells = spells;
      if (extra.speed) d.speed = extra.speed;
      if (extra.darkvision) d.darkvision = extra.darkvision;
    }
    subs[s.id] = d;
  }
  return { races: out, subraces: subs };
}

// ---------------------------------------------------------------------------
// Backgrounds and feats
// ---------------------------------------------------------------------------

interface BackgroundSpec {
  skills: string[];
  languageChoice?: number;
  tools?: string;
  toolChoice?: string[];
  equipment?: Array<string | EquipItem>;
  gp?: number;
  /** SRD 5.2: equipment A (with its gold), or B: 50 GP. */
  packages?: { a: Array<string | EquipItem>; aGp: number; bGp: number };
  feature?: string;
  abilityScores?: AbilityId[];
  feat?: string;
  featList?: string;
}

const BACKGROUND_SPECS: Record<string, BackgroundSpec> = {
  acolyte: { skills: ["insight", "religion"], languageChoice: 2, equipment: ["Clothes, common", "Pouch", { name: "Holy symbol" }], gp: 15, feature: "Shelter of the Faithful" },
  "acolyte-2024": { skills: ["insight", "religion"], tools: "Calligrapher's Supplies", abilityScores: ["intelligence", "wisdom", "charisma"], feat: "magic-initiate-2024", featList: "Cleric", packages: { a: ["Calligrapher's Supplies", { name: "Book (prayers)" }, { name: "Holy symbol" }, { name: "Parchment (one sheet)", quantity: 10 }, "Robes"], aGp: 8, bGp: 50 } },
  "criminal-2024": { skills: ["sleight-of-hand", "stealth"], tools: "Thieves' Tools", abilityScores: ["dexterity", "constitution", "intelligence"], feat: "alert-2024", packages: { a: [{ name: "Dagger", quantity: 2 }, "Thieves' Tools", "Crowbar", { name: "Pouch", quantity: 2 }, "Clothes, traveler's"], aGp: 16, bGp: 50 } },
  "sage-2024": { skills: ["arcana", "history"], tools: "Calligrapher's Supplies", abilityScores: ["constitution", "intelligence", "wisdom"], feat: "magic-initiate-2024", featList: "Wizard", packages: { a: ["Quarterstaff", "Calligrapher's Supplies", { name: "Book (history)" }, { name: "Parchment (one sheet)", quantity: 8 }, "Robes"], aGp: 8, bGp: 50 } },
  "soldier-2024": { skills: ["athletics", "intimidation"], toolChoice: ["Dice", "Dragonchess", "Playing Cards", "Three-Dragon Ante"], abilityScores: ["strength", "dexterity", "constitution"], feat: "savage-attacker-2024", packages: { a: ["Spear", "Shortbow", { name: "Arrow", quantity: 20 }, { name: "Gaming set" }, "Healer's Kit", "Quiver", "Clothes, traveler's"], aGp: 14, bGp: 50 } },
};

interface FeatSpec {
  requires?: { level?: number; all?: Partial<Record<AbilityId, number>>; any?: Partial<Record<AbilityId, number>>; spellcasting?: boolean };
  increase?: { from: AbilityId[]; amount: number; max: number };
  skills?: number;
  spells?: { lists: string[] };
  exclude?: "asi" | "fighting-style";
  todo?: string;
}
const FEAT_SPECS: Record<string, FeatSpec> = {
  grappler: { requires: { all: { strength: 13 } } },
  "alert-2024": { todo: "Alert: add your proficiency bonus to Initiative bonus on the sheet." },
  "magic-initiate-2024": { spells: { lists: ["Cleric", "Druid", "Wizard"] }, todo: "Magic Initiate: note which ability (Intelligence, Wisdom or Charisma) casts its spells." },
  "savage-attacker-2024": {},
  "skilled-2024": { skills: 3 },
  "ability-score-improvement-2024": { exclude: "asi" },
  "grappler-2024": { requires: { level: 4, any: { strength: 13, dexterity: 13 } }, increase: { from: ["strength", "dexterity"], amount: 1, max: 20 } },
  "archery-2024": { exclude: "fighting-style" },
  "defense-2024": { exclude: "fighting-style" },
  "great-weapon-fighting-2024": { exclude: "fighting-style" },
  "two-weapon-fighting-2024": { exclude: "fighting-style" },
};
const BOON: FeatSpec = { requires: { level: 19 }, increase: { from: [...ABILITY_IDS], amount: 1, max: 30 } };

// ---------------------------------------------------------------------------
// Equipment rows from names
// ---------------------------------------------------------------------------

interface Gear {
  rows: Array<{ name: string; quantity: number; weight?: number }>;
  armor?: { base: number; dex: "full" | "max2" | "none" };
  shield?: boolean;
}

function equipmentIndex(equipment: ReferenceList[]) {
  const byName = new Map<string, ReferenceItem>();
  for (const l of equipment) for (const it of l.items) byName.set(it.name.toLowerCase(), it);
  const armorOf = (it: ReferenceItem): Gear["armor"] | "shield" | undefined => {
    const ac = String(it.armorClass ?? "");
    if (!ac) return undefined;
    if (ac.startsWith("+")) return "shield";
    const m = /^(\d+)(\s*\+\s*Dex modifier(\s*\(max 2\))?)?/.exec(ac);
    if (!m) return undefined;
    return { base: Number(m[1]), dex: m[2] ? (m[3] ? "max2" : "full") : "none" };
  };
  /** Rows (with weights from the lists) for item names; names not in the lists stay as written. */
  const gear = (items: Array<string | EquipItem>): Gear => {
    const g: Gear = { rows: [] };
    for (const x of items) {
      const it = typeof x === "string" ? { name: x } : x;
      const q = it.quantity ?? 1;
      const hit = byName.get(it.name.toLowerCase());
      const unit = hit ? pounds(hit.weight) : undefined;
      // ammunition is weighed per bundle of 20 in the gear list
      const ammo = hit?.category === "Ammunition";
      const weight = unit === undefined ? undefined : ammo ? Math.round(((unit * q) / 20) * 100) / 100 : Math.round(unit * q * 100) / 100;
      g.rows.push({ name: hit?.name ?? it.name, quantity: q, ...(weight !== undefined ? { weight } : {}) });
      if (hit) {
        const a = armorOf(hit);
        if (a === "shield") g.shield = true;
        else if (a) g.armor = a;
      }
    }
    return g;
  };
  return { gear, byName };
}

// ---------------------------------------------------------------------------
// Reusable sub-choices
// ---------------------------------------------------------------------------

/** An ability score improvement: +2 to one, +1 to two, or a feat (with whatever the feat asks). */
function asiChoice(idName: string, label: Rule, when: Rule | undefined, each: Rule | undefined, levelRule: Rule): CharacterBuilderSubChoice {
  const below = (n: number) => lte(add(varAt(cat("fields.abilities.", v("option.id")), 10), n), 20);
  return {
    id: idName,
    label,
    ...(when ? { when } : {}),
    ...(each ? { each } : {}),
    sourceLabel: cat(v("item.name"), ifs(each ? v("entry") : false, cat(" (level ", v("entry"), ")"), "")),
    source: {
      options: [
        { id: "plus2", name: "+2 to one ability", summary: "Increase one ability score by 2 (not above 20).", cite: cite("Classes", "Ability Score Improvement") },
        { id: "plus1", name: "+1 to two abilities", summary: "Increase two ability scores by 1 each (not above 20).", cite: cite("Classes", "Ability Score Improvement") },
        { id: "feat", name: "A feat", summary: "Take a feat instead, if you meet its prerequisite.", cite: cite("Feats") },
      ],
    },
    subChoices: [
      { id: "plus2", label: "Increase by 2", when: eq(v("item.id"), "plus2"), source: { options: ABILITY_OPTIONS }, available: below(2), availableText: "It would go above 20.", grants: [{ path: cat("abilities.", v("item.id")), op: "add", value: 2 }] },
      { id: "plus1", label: "Increase two by 1", when: eq(v("item.id"), "plus1"), source: { options: ABILITY_OPTIONS }, min: 2, max: 2, available: below(1), availableText: "It would go above 20.", grants: [{ path: cat("abilities.", v("item.id")), op: "add", value: 1 }] },
      {
        id: "feat",
        label: "Feat",
        when: eq(v("item.id"), "feat"),
        source: { list: LIST.feats, where: and(not(v("option.builder.exclude", "")), ne(v("option.category", ""), "Origin"), editionWhere()) },
        available: featAvailable(levelRule),
        availableText: cat("Prerequisite: ", v("option.prerequisite", "—")),
        columns: ["category", "prerequisite"],
        grants: [{ path: "features", op: "append", object: { name: v("item.name"), desc: v("item.description", "") } }],
        subChoices: featSubChoices("parent.builder"),
      },
    ],
  };
}

/** Does a feat's prerequisite (its builder data) hold? */
function featAvailable(levelRule: Rule): Rule {
  const req = (k: string) => v(`option.builder.requires.${k}`);
  const score = (a: string) => v(`fields.abilities.${a}`, 10);
  const all = and(...ABILITY_IDS.map((a) => lte(lookup(req("all"), a, 0), score(a))));
  const any = ifs(req("any"), or(...ABILITY_IDS.map((a) => lte(lookup(req("any"), a, 99), score(a)))), true);
  const spell = ifs(req("spellcasting"), v("computed.spellAbility", ""), true);
  return and(lte(v("option.builder.requires.level", 0), levelRule), all, any, spell);
}

/**
 * What a feat asks for, from its builder data at `data` (relative to the
 * sub-choice context: "parent.builder" for a picked feat,
 * "parent.builder.featData" for a background's origin feat).
 */
function featSubChoices(data: string, fixedList?: string): CharacterBuilderSubChoice[] {
  const d = (k: string) => v(`${data}.${k}`);
  return [
    {
      id: "increase",
      label: cat("Increase by ", d("increase.amount")),
      when: d("increase"),
      source: { values: d("increase.from"), list: LIST.abilities },
      available: lt(varAt(cat("fields.abilities.", v("option.id")), 10), v(`${data}.increase.max`, 20)),
      availableText: "Already at the maximum.",
      grants: [{ path: cat("abilities.", v("item.id")), op: "add", value: v(`${data}.increase.amount`, 1) }],
    },
    skillChoice("skills", cat("Choose ", d("skills"), " skills"), null, d("skills"), d("skills")),
    {
      id: "spellList",
      label: "Spell list",
      when: d("spells"),
      source: { values: fixedList ? ifs(v(fixedList), [v(fixedList)] as unknown as Rule, d("spells.lists")) : d("spells.lists") },
      subChoices: [
        { id: "cantrips", label: cat("Two ", v("item.id"), " cantrips"), source: { list: LIST.spells, where: and(eq(v("option.level"), 0), isIn(v("item.id"), v("option.classes", []))) }, min: 2, max: 2, grants: [{ path: "spells", op: "append", value: v("item.name") }] },
        { id: "spell", label: cat("One level 1 ", v("item.id"), " spell"), source: { list: LIST.spells, where: and(eq(v("option.level"), 1), isIn(v("item.id"), v("option.classes", []))) }, grants: [{ path: "spells", op: "append", value: v("item.name") }] },
      ],
    },
  ];
}

/**
 * Class option features (fighting style, metamagic...): one choice per entry
 * of `each` (`{ g, count, atLevel }`), whose options are group `g` of `table`
 * (`[{ name, options }]`).
 */
function groupChoice(idName: string, each: Rule, table: Rule, when?: Rule): CharacterBuilderSubChoice {
  const held = find(v("fields.features", []), "name", v("option.name"));
  const group = (k: string) => lookup(lookup(table, v("entry.g"), {}), k, k === "name" ? "" : []);
  return {
    id: idName,
    label: group("name"),
    each,
    ...(when ? { when } : {}),
    source: { values: group("options"), list: LIST.classFeatures },
    min: v("entry.count"),
    max: v("entry.count"),
    available: and(lte(v("option.level", 1), v("entry.atLevel", 20)), not(held)),
    availableText: ifs(held, "Already chosen.", cat("From level ", v("option.level"), ".")),
    grants: [{ path: "features", op: "append", object: { name: v("item.name"), desc: v("item.description", "") } }],
  };
}

/** Per level (index 0 = level 1): the groups with picks owed, all of them (`all`) or only the new ones (`new`). */
function groupLevels(groups: Array<{ counts: Record<number, number> }>): { all: Array<Array<{ g: number; count: number; atLevel: number }>>; new: Array<Array<{ g: number; count: number; atLevel: number }>> } {
  const at = (g: { counts: Record<number, number> }, lvl: number) => Math.max(0, ...Object.entries(g.counts).filter(([k]) => Number(k) <= lvl).map(([, n]) => n));
  const all = Array.from({ length: 20 }, (_, i) => groups.map((g, gi) => ({ g: gi, count: at(g, i + 1), atLevel: i + 1 })).filter((x) => x.count > 0));
  const fresh = Array.from({ length: 20 }, (_, i) => groups.map((g, gi) => ({ g: gi, count: at(g, i + 1) - at(g, i), atLevel: i + 1 })).filter((x) => x.count > 0));
  return { all, new: fresh };
}

// ---------------------------------------------------------------------------
// The builder
// ---------------------------------------------------------------------------

export interface BuilderInput {
  lists: ReferenceList[];
  equipment: ReferenceList[];
  spellSlots: Record<string, number[][]>;
}

/** Original and SRD-summary rule cards the builder links to. */
export function builderRules(): RuleCard[] {
  return [
    {
      id: rule("multiclassing"),
      title: "Multiclassing",
      cite: cite("Multiclassing"),
      tags: ["character", "advancement"],
      summary: [
        "A summary of the SRD 5.1's multiclassing rules, as the character builder applies them.",
        "",
        "**Prerequisites.** To take a level in a new class you need a score of 13 in its prime ability, and in your current classes' too: Barbarian Strength; Bard Charisma; Cleric Wisdom; Druid Wisdom; Fighter Strength or Dexterity; Monk Dexterity and Wisdom; Paladin Strength and Charisma; Ranger Dexterity and Wisdom; Rogue Dexterity; Sorcerer Charisma; Warlock Charisma; Wizard Intelligence.",
        "",
        "**Proficiencies.** A new class gives only some of its starting proficiencies: Barbarian shields, simple and martial weapons; Bard light armor, one skill, one musical instrument; Cleric and Druid light and medium armor, shields; Fighter, Paladin and Ranger light and medium armor, shields, simple and martial weapons (a ranger also one skill from its list); Monk simple weapons and shortswords; Rogue light armor, one skill from its list, thieves' tools; Warlock light armor and simple weapons; Sorcerer and Wizard none.",
        "",
        "**Hit points and dice.** Only your first class gives its full hit die at 1st level; each later level adds that class's die (or its average) and your Constitution modifier. Your proficiency bonus follows your total character level.",
        "",
        "**Spell slots.** With the Spellcasting feature from more than one class, add your bard, cleric, druid, sorcerer and wizard levels, half your paladin and ranger levels (rounded down), and read your slots from the Multiclass Spellcaster table (the same as a full caster's). Pact Magic slots stay separate. Spells known and prepared are counted per class.",
      ].join("\n"),
    },
    {
      id: rule("character-creation"),
      title: "Ability scores at character creation",
      cite: cite52("Character Creation", "Determine Ability Scores"),
      tags: ["character"],
      summary: [
        "The three ways the SRD 5.2 gives to determine ability scores, as the builder offers them.",
        "",
        "- **Standard array:** 15, 14, 13, 12, 10, 8, each assigned to one ability.",
        "- **Random generation:** roll four d6 and add the highest three, six times, then assign the totals.",
        "- **Point cost:** 27 points; every score starts at 8 and costs 8: 0, 9: 1, 10: 2, 11: 3, 12: 4, 13: 5, 14: 7, 15: 9.",
        "",
        "Then apply the increases your background (SRD 5.2) or race (SRD 5.1) gives; no score can go above 20.",
      ].join("\n"),
    },
  ];
}

export function characterBuilder(input: BuilderInput): CharacterBuilderDef {
  const lists = [...input.lists, ...input.equipment];
  const classes = listById(lists, LIST.classes);
  const features = listById(lists, LIST.classFeatures);
  const subclasses = listById(lists, LIST.subclasses);
  const backgrounds = listById(lists, LIST.backgrounds);
  const feats = listById(lists, LIST.feats);
  const tools = listById(lists, LIST.tools);
  const { gear } = equipmentIndex(input.equipment);

  // --- class data ---------------------------------------------------------
  const classData: Record<string, Record<string, unknown>> = {};
  const featureData: Record<string, Record<string, unknown>> = {};
  for (const f of features.items) {
    if (f.edition === "2024") continue;
    if (PLACEHOLDER.test(f.name)) featureData[f.id] = { skip: true };
  }
  const groupsFor = (spec: GroupSpec) => {
    const opts = features.items.filter((f) => f.edition !== "2024" && f.class === spec.class && (spec.prefix ? f.name.startsWith(spec.prefix) : spec.ids!.includes(f.id)) && (spec.subclass === undefined ? !f.subclass || spec.name === "Additional Fighting Style" : f.subclass === spec.subclass));
    // "Additional Fighting Style" (Champion) offers the fighter's styles
    const options = spec.name === "Additional Fighting Style" ? features.items.filter((f) => f.class === "Fighter" && !f.subclass && f.name.startsWith("Fighting Style: ")) : opts;
    if (!options.length) throw new Error(`builder: no options for ${spec.class} ${spec.name}`);
    for (const o of options) featureData[o.id] = { option: true };
    return options;
  };
  const classItem = (c: string) => need(classes, c);
  for (const c of CLASSES) {
    const item = classItem(c);
    const spec = CLASS_SPECS[c];
    const name = item.name;
    const saves = String(item.savingThrows).split(",").map((s) => s.trim().toLowerCase());
    for (const s of saves) if (!ABILITY_IDS.includes(s as AbilityId)) throw new Error(`builder: ${c} save ${s}`);
    // skills: check the authored list against the SRD text
    const choiceText = String(item.skillChoices);
    if (spec.skills.from !== "any") for (const s of spec.skills.from) if (!choiceText.includes(SKILLS.find((x) => x.id === s)!.name)) throw new Error(`builder: ${c} skill ${s} not in "${choiceText}"`);
    const mine = features.items.filter((f) => f.class === name && f.edition !== "2024");
    const subclassLevel = Math.min(...mine.filter((f) => f.subclass).map((f) => Number(f.level)));
    const asiLevels = mine.filter((f) => f.name === "Ability Score Improvement" && !f.subclass).map((f) => Number(f.level)).sort((a, b) => a - b);
    const byLevel = (levels: number[]) => Array.from({ length: 20 }, (_, i) => levels.filter((l) => l <= i + 1));
    // option groups of the class (not of a subclass), with the picks owed by level
    const groups = GROUPS.filter((g) => g.class === name && !g.subclass).map((g) => {
      const options = groupsFor(g);
      const counts = { ...g.counts };
      if (g.name === "Eldritch Invocations") {
        const col = progressionColumn(item.progression, "Invocations known");
        if (!col) throw new Error("builder: warlock invocations column");
        col.forEach((n, i) => (counts[i + 1] = n));
      }
      return { name: g.name, options: options.map((o) => o.id), counts };
    });
    const levels = groupLevels(groups);
    const eq0 = gear(spec.fixed);
    const fixedArmor = eq0.armor;
    const d: Record<string, unknown> = {
      hitDie: Number(String(item.hitDie).replace("d", "")),
      saves,
      proficiencies: spec.proficiencies,
      skills: { choose: spec.skills.choose, from: spec.skills.from === "any" ? SKILLS.map((s) => s.id) : spec.skills.from },
      subclassLevel,
      asiLevels,
      asiByLevel: byLevel(asiLevels),
      expertiseLevels: spec.expertise ?? [],
      expertiseByLevel: byLevel(spec.expertise ?? []),
      groups: groups.map((g) => ({ name: g.name, options: g.options })),
      groupsByLevel: levels.all,
      groupsNewByLevel: levels.new,
      equipment: {
        fixed: eq0.rows,
        ...(fixedArmor ? { armor: fixedArmor } : {}),
        ...(eq0.shield ? { shield: true } : {}),
        picks: spec.fixedPicks ?? [],
        choices: spec.choices.map((group, gi) => ({
          label: group.map((o, i) => `(${String.fromCharCode(97 + i)}) ${o.name}`).join(" or "),
          options: group.map((o, i) => {
            const g = gear(o.items ?? []);
            return { id: `${c}-${gi}-${String.fromCharCode(97 + i)}`, name: `(${String.fromCharCode(97 + i)}) ${o.name}`, rows: g.rows, ...(g.armor ? { armor: g.armor } : {}), ...(g.shield ? { shield: true } : {}), picks: o.picks ?? [] };
          }),
        })),
      },
      multiclass: {
        ...(spec.multiclass.all ? { all: spec.multiclass.all } : {}),
        ...(spec.multiclass.any ? { any: spec.multiclass.any } : {}),
        text: String(item.multiclassing),
        proficiencies: spec.multiclass.proficiencies,
        ...(spec.multiclass.skill ? { skill: spec.multiclass.skill === "any" ? SKILLS.map((s) => s.id) : spec.multiclass.skill } : {}),
        ...(spec.multiclass.tool ? { tool: { ids: tools.items.filter((t) => spec.multiclass.tool!.categories.includes(String(t.category))).map((t) => t.id), label: spec.multiclass.tool.label } } : {}),
      },
      todo: spec.todo ?? [],
    };
    if (spec.tools) d.tools = { choose: spec.tools.choose, ids: tools.items.filter((t) => spec.tools!.categories.includes(String(t.category))).map((t) => t.id), label: spec.tools.label };
    if (spec.unarmored) d.unarmored = spec.unarmored;
    const sc = spellcastingData(item, spec, input.spellSlots[c]);
    if (sc) d.spellcasting = sc;
    // prerequisites as text, checked against the SRD's
    const mcText = String(item.multiclassing);
    for (const [a, n] of Object.entries({ ...spec.multiclass.all, ...spec.multiclass.any })) if (!mcText.toLowerCase().includes(`${a} ${n}`)) throw new Error(`builder: ${c} multiclass ${a} ${n} vs "${mcText}"`);
    classData[c] = d;
  }
  // subclass option groups (Dragon Ancestor, Circle of the Land, Hunter's Prey...) and proficiencies
  const subclassData: Record<string, Record<string, unknown>> = {};
  for (const s of subclasses.items) {
    const groups = GROUPS.filter((g) => g.subclass === s.name && g.class === s.class).map((g) => ({ name: g.name, options: groupsFor(g).map((o) => o.id), counts: g.counts }));
    const extra = SUBCLASS_SPECS[s.id] ?? {};
    if (!groups.length && !extra.proficiencies && !extra.skills) continue;
    const levels = groupLevels(groups);
    subclassData[s.id] = {
      ...(groups.length ? { groups: groups.map((g) => ({ name: g.name, options: g.options })), groupsByLevel: levels.all, groupsNewByLevel: levels.new } : {}),
      ...(extra.proficiencies ? { proficiencies: extra.proficiencies } : {}),
      ...(extra.skills ? { skills: extra.skills } : {}),
    };
  }

  // --- races, backgrounds, feats --------------------------------------------
  const race = raceData(lists);
  const featData: Record<string, Record<string, unknown>> = {};
  for (const f of feats.items) {
    const spec = f.category === "Epic Boon" ? { ...BOON, ...(String(f.prerequisite).includes("Spellcasting") ? { requires: { ...BOON.requires, spellcasting: true } } : {}) } : FEAT_SPECS[f.id];
    if (!spec) throw new Error(`builder: no feat data for ${f.id}`);
    featData[f.id] = { ...spec };
  }
  const backgroundData: Record<string, Record<string, unknown>> = {};
  for (const b of backgrounds.items) {
    const spec = BACKGROUND_SPECS[b.id];
    if (!spec) throw new Error(`builder: no background data for ${b.id}`);
    const skillText = String(b.skills);
    for (const s of spec.skills) if (!skillText.includes(SKILLS.find((x) => x.id === s)!.name)) throw new Error(`builder: ${b.id} skill ${s} not in "${skillText}"`);
    const d: Record<string, unknown> = { skills: spec.skills };
    if (spec.languageChoice) d.languageChoice = spec.languageChoice;
    if (spec.tools) d.tools = spec.tools;
    if (spec.toolChoice) d.toolChoice = spec.toolChoice;
    if (spec.equipment) d.equipment = gear(spec.equipment).rows;
    if (spec.gp) d.gp = spec.gp;
    if (spec.packages) {
      d.packages = [
        { id: "a", name: `(A) ${String(b.equipment).replace(/^Choose A or B: \(A\) /, "").replace(/; or \(B\).*$/, "")}`, rows: gear(spec.packages.a).rows, gp: spec.packages.aGp },
        { id: "b", name: `(B) ${spec.packages.bGp} GP`, rows: [], gp: spec.packages.bGp },
      ];
    }
    if (spec.feature) d.feature = spec.feature;
    if (spec.abilityScores) {
      for (const a of spec.abilityScores) if (!String(b.abilityScores).toLowerCase().includes(a)) throw new Error(`builder: ${b.id} ability ${a}`);
      d.abilityScores = spec.abilityScores;
    }
    if (spec.feat) {
      const feat = need(feats, spec.feat);
      d.feat = feat.id;
      d.featName = String(b.feat);
      d.featData = featData[feat.id];
      d.featText = feat.description;
      if (spec.featList) d.featList = spec.featList;
    }
    backgroundData[b.id] = d;
  }

  // equipment weights for the "any simple weapon" kind of picks
  const weight = (l: ReferenceList) => Object.fromEntries(l.items.map((i) => [i.id, pounds(i.weight)]).filter(([, w]) => w !== undefined).map(([k, w]) => [k, { weight: w }]));
  const itemData: CharacterBuilderDef["itemData"] = {
    [LIST.classes]: classData,
    [LIST.classFeatures]: featureData,
    [LIST.subclasses]: subclassData,
    [LIST.races]: race.races,
    [LIST.subraces]: race.subraces,
    [LIST.backgrounds]: backgroundData,
    [LIST.feats]: featData,
    [LIST.weapons]: weight(listById(lists, LIST.weapons)),
    [LIST.gear]: weight(listById(lists, LIST.gear)),
    [LIST.tools]: weight(tools),
  };

  // --- shared rules ----------------------------------------------------------
  const rowGrant = (rows: Rule, when?: Rule): CharacterBuilderGrant => ({ path: "equipment", op: "append", value: rows, ...(when ? { when } : {}) });
  const pickRow: CharacterBuilderGrant = { path: "equipment", op: "append", object: { name: v("item.name"), quantity: 1, weight: v("item.builder.weight", 0) } };
  const picksOf = (listKey: "weapons" | "gear" | "tools", listId: string, picks: string): CharacterBuilderSubChoice => ({
    id: `pick-${listKey}`,
    label: v("entry.label"),
    each: { filter: [v(picks, []), eq(v("list"), listKey)] },
    source: { list: listId, where: isIn(v("option.category", ""), v("entry.categories", [])) },
    min: v("entry.count", 1),
    max: v("entry.count", 1),
    grants: [pickRow],
  });
  const picks = (path: string) => [picksOf("weapons", LIST.weapons, path), picksOf("gear", LIST.gear, path), picksOf("tools", LIST.tools, path)];
  const twoThousandFourBackground = v("choices.background.item.builder.abilityScores");
  // race ability increases: 2014 rules, or mixed rules when the background has none
  const raceAsi = or(eq(E, "2014"), and(eq(E, "mixed"), not(twoThousandFourBackground)));

  const spellcasting = (k: string, d?: unknown) => CB(`spellcasting.${k}`, d);
  const cantripsAt = (lvl: Rule) => lookup(spellcasting("cantrips", []), sub(lvl, 1), 0);
  const knownAt = (lvl: Rule) => lookup(spellcasting("known", []), sub(lvl, 1), 0);
  const maxSpellAt = (lvl: Rule) => lookup(spellcasting("maxLevel", []), sub(lvl, 1), 0);
  const classSpellWhere = (lo: number, hi: Rule) => and(gte(v("option.level"), lo), lte(v("option.level"), hi), isIn(CLASS_NAME, v("option.classes", [])));
  const notKnown = not(isIn(v("option.name"), v("fields.spells", [])));

  const skillNames = SKILLS.map((s) => s.id);
  const skillsList: Rule = { merge: skillNames.map((s) => ifs(gte(v(`fields.skills.${s}`, 0), 1), [cat(SKILLS.find((x) => x.id === s)!.name, ifs(eq(v(`fields.skills.${s}`, 0), 2), " (expertise)", ""))] as unknown as Rule, lit([]))) };
  const savesList: Rule = { merge: ABILITIES.map((a) => ifs(gte(v(`fields.saves.${a.id}-save`, 0), 1), lit([a.name]), lit([]))) };

  // hit points: average (the sheet's suggested maximum) or the dice rolled, plus Dwarven Toughness
  const hpRolled = eq(v("choices.level.sub.hp.id", "average"), "roll");
  const hpMax = add(
    ifs(hpRolled, add(v("vars.hitDie", 0), v("choices.level.sub.hp.rolled", 0), mul(v("fields.level", 1), v("computed.constitutionMod", 0))), v("computed.suggestedHpMax", 1)),
    mul(v("fields.level", 1), v("vars.hpPerLevel", 0)),
  );
  // armor class: armor (Dex in full, up to 2, or not at all), else the class's unarmored defense, else 10 + Dex; a shield adds 2
  const dexMod = v("computed.dexterityMod", 0);
  const unarmoredAbility = v("vars.unarmored", "");
  const ac = add(
    ifs(
      v("vars.armor"),
      add(v("vars.armor.base", 10), ifs(eq(v("vars.armor.dex"), "full"), dexMod, eq(v("vars.armor.dex"), "max2"), min(2, dexMod), 0)),
      and(unarmoredAbility, or(eq(unarmoredAbility, "constitution"), not(v("vars.shield")))),
      add(10, dexMod, varAt(cat("computed.", unarmoredAbility, "Mod"), 0)),
      add(10, dexMod),
    ),
    ifs(v("vars.shield"), 2, 0),
    // Fighting Style: Defense, +1 while wearing armor
    ifs(and(v("vars.armor"), find(v("fields.features", []), "name", "Fighting Style: Defense")), 1, 0),
  );

  // --- steps -----------------------------------------------------------------
  const editionStep: CharacterBuilderStep = {
    kind: "choice",
    id: "edition",
    title: "Edition",
    intro: "Which rules the character's origin follows.",
    guide: [
      "SRD 5.1 (2014): your race gives ability score increases; backgrounds give skills, languages and equipment.",
      "SRD 5.2 (2024): your background gives +2/+1 or +1/+1/+1 among three abilities and an origin feat; species give traits, not increases.",
      "Classes follow the SRD 5.1 tables either way: the SRD 5.2 classes are not in this module.",
    ],
    source: {
      options: [
        { id: "2014", name: "SRD 5.1 (2014 rules)", summary: "Races with ability score increases, SRD 5.1 backgrounds and subclasses.", cite: cite("Races") },
        { id: "2024", name: "SRD 5.2 (2024 rules)", summary: "Species, backgrounds with ability scores and an origin feat, SRD 5.2 subclasses and feats.", cite: cite52("Character Origins") },
        { id: "mixed", name: "Mixed", summary: "Options from both. Ability score increases come from one place only: the background when it lists them, the race otherwise.", original: true },
      ],
    },
  };

  const speciesStep: CharacterBuilderStep = {
    kind: "choice",
    id: "species",
    title: "Species / race",
    intro: "Traits, size, speed, senses and languages; with SRD 5.1 rules, ability score increases too.",
    noun: "race",
    columns: ["size", "speed", "abilityBonuses"],
    source: { list: LIST.races, where: editionWhere() },
    grants: [
      { path: "race", value: v("item.name") },
      addAbilities(v("item.builder.asi", {}), raceAsi),
      { path: "speed", value: v("item.builder.speed"), when: v("item.builder.speed") },
      { path: "size", value: v("item.builder.size"), when: v("item.builder.size") },
      { path: "darkvision", op: "max", value: v("item.builder.darkvision"), when: v("item.builder.darkvision") },
      { path: "languages", op: "append", value: v("item.builder.languages", []), when: v("item.builder.languages") },
      { path: "proficiencies", op: "append", separator: "; ", value: v("item.builder.proficiencies"), when: v("item.builder.proficiencies") },
      { path: cat("skills.", v("entry")), each: v("item.builder.skills", []), value: 1 },
      { path: "$hpPerLevel", op: "add", value: v("item.builder.hpPerLevel", 0), when: v("item.builder.hpPerLevel") },
      featuresFrom(LIST.racialTraits, isIn(v("entry.id"), v("item.builder.traits", []))),
      { path: "spells", op: "append", each: v("item.builder.spells", []), when: lte(v("entry.level"), L), value: v("entry.name") },
    ],
    subChoices: [
      {
        id: "lineage",
        label: ifs(eq(v("item.edition", ""), "2024"), "Lineage", "Subrace"),
        when: v("item.builder.lineage"),
        noun: "subrace",
        source: { list: LIST.subraces, where: eq(v("option.race"), v("item.name")) },
        grants: [
          { path: "subrace", value: v("item.name") },
          addAbilities(v("item.builder.asi", {}), raceAsi),
          { path: "speed", value: v("item.builder.speed"), when: v("item.builder.speed") },
          { path: "darkvision", op: "max", value: v("item.builder.darkvision"), when: v("item.builder.darkvision") },
          { path: "proficiencies", op: "append", separator: "; ", value: v("item.builder.proficiencies"), when: v("item.builder.proficiencies") },
          { path: "$hpPerLevel", op: "add", value: v("item.builder.hpPerLevel", 0), when: v("item.builder.hpPerLevel") },
          { path: "features", op: "append", each: { list: LIST.racialTraits, where: and(isIn(v("entry.id"), { map: [v("item.builder.traits", []), v("id")] }), lte(lookup(find(v("item.builder.traits", []), "id", v("entry.id")), "level", 1), L)) }, object: { name: v("entry.name"), desc: v("entry.description", "") } },
          { path: "spells", op: "append", each: v("item.builder.spells", []), when: lte(v("entry.level"), L), value: v("entry.name") },
        ],
        subChoices: [
          { id: "cantrip", label: cat("One ", v("item.builder.cantripChoice"), " cantrip"), when: v("item.builder.cantripChoice"), source: { list: LIST.spells, where: and(eq(v("option.level"), 0), isIn(v("item.builder.cantripChoice"), v("option.classes", []))) }, grants: [{ path: "spells", op: "append", value: v("item.name") }] },
          { id: "language", label: "Extra language", when: v("item.builder.languageChoice"), source: { list: LIST.languages }, available: not(isIn(v("option.name"), v("fields.languages", []))), availableText: "Already known.", grants: [{ path: "languages", op: "append", value: v("item.name") }] },
        ],
      },
      { id: "ancestry", label: "Draconic ancestry", when: v("item.builder.ancestry"), source: { values: v("item.builder.ancestry"), list: LIST.racialTraits }, grants: [{ path: "features", op: "append", object: { name: v("item.name"), desc: v("item.description", "") } }] },
      { id: "size", label: "Size", when: v("item.builder.sizes"), source: { values: v("item.builder.sizes") }, grants: [{ path: "size", value: v("item.id") }] },
      {
        id: "abilities",
        label: cat("+", v("item.builder.asiChoice.amount"), " to ", v("item.builder.asiChoice.count"), " other abilities"),
        when: and(v("item.builder.asiChoice"), raceAsi),
        source: { values: v("item.builder.asiChoice.from"), list: LIST.abilities },
        min: v("item.builder.asiChoice.count"),
        max: v("item.builder.asiChoice.count"),
        grants: [{ path: cat("abilities.", v("item.id")), op: "add", value: v("parent.builder.asiChoice.amount", 1) }],
      },
      skillChoice("skills", ifs(eq(v("item.builder.skillChoice.count"), 1), "One skill", cat(v("item.builder.skillChoice.count"), " skills")), ifs(v("item.builder.skillChoice.from"), v("item.builder.skillChoice.from"), list(skillNames)), v("item.builder.skillChoice.count", 0), v("item.builder.skillChoice")),
      { id: "languages", label: cat(v("item.builder.languageChoice"), " extra language"), when: v("item.builder.languageChoice"), source: { list: LIST.languages }, min: v("item.builder.languageChoice"), max: v("item.builder.languageChoice"), available: not(isIn(v("option.name"), v("fields.languages", []))), availableText: "Already known.", grants: [{ path: "languages", op: "append", value: v("item.name") }] },
      { id: "tool", label: "Artisan's tools", when: v("item.builder.toolChoice"), source: { values: v("item.builder.toolChoice"), list: LIST.tools }, grants: [{ path: "proficiencies", op: "append", separator: "; ", value: v("item.name") }] },
      {
        id: "feat",
        label: "Origin feat",
        when: v("item.builder.originFeat"),
        source: { list: LIST.feats, where: eq(v("option.category"), "Origin") },
        grants: [{ path: "features", op: "append", object: { name: v("item.name"), desc: v("item.description", "") } }],
        subChoices: featSubChoices("parent.builder"),
      },
    ],
  };

  const classStep: CharacterBuilderStep = {
    kind: "choice",
    id: "class",
    title: "Class",
    intro: "Hit die, saving throws, proficiencies, skills and the features up to your starting level.",
    noun: "class",
    columns: ["hitDie", "savingThrows", "spellcasting"],
    source: { list: LIST.classes },
    guide: ["Subclass, ability score improvements and the class's other choices come at the Starting level step; spells at the Spells step."],
    grants: [
      { path: "class", value: v("item.id") },
      { path: cat("saves.", v("entry"), "-save"), each: v("item.builder.saves", []), value: 1 },
      { path: "proficiencies", op: "append", separator: "; ", value: v("item.builder.proficiencies"), when: v("item.builder.proficiencies") },
      { path: "$hitDie", value: v("item.builder.hitDie", 0), hidden: true },
      { path: "$unarmored", value: v("item.builder.unarmored", ""), when: v("item.builder.unarmored"), hidden: true },
      { path: "spellcastingAbility", value: v("item.builder.spellcasting.ability"), when: and(v("item.builder.spellcasting"), not(isIn(v("item.id"), list(CLASSES as unknown as string[])))) },
      featuresFrom(LIST.classFeatures, and(eq(v("entry.class"), v("item.name")), not(v("entry.subclass", "")), lte(v("entry.level"), L), not(v("entry.builder.skip")), not(v("entry.builder.option")), ne(v("entry.edition", ""), "2024"))),
    ],
    subChoices: [
      skillChoice("skills", cat("Choose ", v("item.builder.skills.choose"), " skills"), v("item.builder.skills.from"), v("item.builder.skills.choose", 0), v("item.builder.skills"), not(isIn(v("option.id"), v("choices.background.item.builder.skills", [])))),
      { id: "tools", label: v("item.builder.tools.label"), when: v("item.builder.tools"), source: { values: v("item.builder.tools.ids"), list: LIST.tools }, min: v("item.builder.tools.choose"), max: v("item.builder.tools.choose"), grants: [{ path: "proficiencies", op: "append", separator: "; ", value: v("item.name") }] },
    ],
  };

  const backgroundStep: CharacterBuilderStep = {
    kind: "choice",
    id: "background",
    title: "Background",
    intro: "Skills, tools, languages and a feature; with SRD 5.2 rules, ability scores and an origin feat.",
    noun: "background",
    columns: ["skills", "abilityScores", "feat"],
    source: { list: LIST.backgrounds, where: editionWhere() },
    grants: [
      { path: "background", value: v("item.name") },
      { path: cat("skills.", v("entry")), each: v("item.builder.skills", []), value: 1 },
      { path: "proficiencies", op: "append", separator: "; ", value: v("item.builder.tools"), when: v("item.builder.tools") },
      { path: "features", op: "append", object: { name: v("item.builder.feature", v("item.feature")), desc: v("item.description", "") }, when: or(v("item.builder.feature"), v("item.feature")) },
      { path: "features", op: "append", object: { name: v("item.builder.featName"), desc: v("item.builder.featText", "") }, when: v("item.builder.featName") },
      // SRD 5.2: Common and two standard languages
      { path: "languages", op: "append", value: "Common", when: v("item.builder.abilityScores") },
    ],
    subChoices: [
      {
        id: "abilities",
        label: "Ability scores",
        help: cat("Among ", v("item.abilityScores", ""), "; none above 20."),
        when: and(v("item.builder.abilityScores"), ne(E, "2014")),
        source: {
          options: [
            { id: "two-one", name: "+2 and +1", summary: "Increase one of the three by 2 and a different one by 1.", cite: cite52("Character Origins", "Backgrounds") },
            { id: "one-one-one", name: "+1 to all three", summary: "Increase each of the three by 1.", cite: cite52("Character Origins", "Backgrounds") },
          ],
        },
        grants: [{ path: cat("abilities.", v("entry")), op: "add", value: 1, each: v("choices.background.item.builder.abilityScores", []), when: eq(v("item.id"), "one-one-one") }],
        subChoices: [
          { id: "plus2", label: "+2 to", when: eq(v("item.id"), "two-one"), source: { values: v("choices.background.item.builder.abilityScores"), list: LIST.abilities }, grants: [{ path: cat("abilities.", v("item.id")), op: "add", value: 2 }] },
          {
            id: "plus1",
            label: "+1 to",
            when: eq(v("item.id"), "two-one"),
            source: { values: v("choices.background.item.builder.abilityScores"), list: LIST.abilities },
            available: ne(v("option.id"), v("choices.background.sub.abilities.sub.plus2.id", "")),
            availableText: "Already +2.",
            grants: [{ path: cat("abilities.", v("item.id")), op: "add", value: 1 }],
          },
        ],
      },
      { id: "languages", label: cat(v("item.builder.languageChoice"), " languages of your choice"), when: v("item.builder.languageChoice"), source: { list: LIST.languages }, min: v("item.builder.languageChoice"), max: v("item.builder.languageChoice"), available: not(isIn(v("option.name"), v("fields.languages", []))), availableText: "Already known.", grants: [{ path: "languages", op: "append", value: v("item.name") }] },
      {
        id: "languages2024",
        label: "Two languages",
        help: "Common plus two standard languages (SRD 5.2, Character Creation).",
        when: and(v("item.builder.abilityScores"), ne(E, "2014")),
        source: { list: LIST.languages, where: eq(v("option.type"), "Standard") },
        min: 2,
        max: 2,
        available: not(isIn(v("option.name"), v("fields.languages", []))),
        availableText: "Already known.",
        grants: [{ path: "languages", op: "append", value: v("item.name") }],
      },
      { id: "tool", label: "Gaming set", when: v("item.builder.toolChoice"), source: { values: v("item.builder.toolChoice") }, grants: [{ path: "proficiencies", op: "append", separator: "; ", value: cat("Gaming set (", v("item.name"), ")") }] },
      ...featSubChoices("parent.builder.featData", "parent.builder.featList").map((s) => ({ ...s, when: and(s.when as Rule, v("item.builder.featData")) })),
    ],
  };

  const abilityStep: CharacterBuilderStep = {
    kind: "abilities",
    id: "abilities",
    title: "Ability scores",
    intro: "Base scores; increases from your race or background are added on top.",
    cite: cite52("Character Creation", "Determine Ability Scores"),
    path: "abilities",
    abilities: ABILITIES.map((a) => ({ id: a.id, name: a.name, abbr: a.abbr })),
    modifier: floor({ "/": [sub(v("score"), 10), 2] }),
    max: 20,
    methods: [
      { id: "standard", kind: "array", name: "Standard array", values: [15, 14, 13, 12, 10, 8], summary: "15, 14, 13, 12, 10 and 8, each to one ability.", cite: cite52("Character Creation", "Standard Array") },
      { id: "point-buy", kind: "pointBuy", name: "Point buy", budget: 27, min: 8, max: 15, costs: { 8: 0, 9: 1, 10: 2, 11: 3, 12: 4, 13: 5, 14: 7, 15: 9 }, summary: "27 points; every score from 8 to 15.", cite: cite52("Character Creation", "Point Cost") },
      { id: "roll", kind: "roll", name: "Roll 4d6, drop the lowest", dice: "4d6", keep: 3, summary: "Six rolls of four d6, the highest three added; assign the totals.", cite: cite52("Character Creation", "Random Generation") },
      { id: "manual", kind: "manual", name: "Typed in", min: 3, max: 18, summary: "Scores rolled away from the app or set by the GM.", original: true },
    ],
  };

  const levelStep: CharacterBuilderStep = {
    kind: "choice",
    id: "level",
    title: "Starting level",
    intro: "Level 1 to 20: hit points, proficiency bonus, subclass and the choices your class makes up to that level.",
    cite: cite("Beyond 1st Level"),
    source: { range: { min: 1, max: 20, label: "Level" } },
    grants: [
      { path: "level", value: v("item.value") },
      { path: "xp", value: lookup(lit([0, 300, 900, 2700, 6500, 14000, 23000, 34000, 48000, 64000, 85000, 100000, 120000, 140000, 165000, 195000, 225000, 265000, 305000, 355000]), sub(v("item.value"), 1), 0) },
    ],
    subChoices: [
      {
        id: "subclass",
        label: cat(CLASS_NAME, " subclass"),
        when: and(v("choices.class.item.builder.subclassLevel"), gte(v("item.value"), v("choices.class.item.builder.subclassLevel", 99))),
        noun: "subclass",
        source: { list: LIST.subclasses, where: and(eq(v("option.class"), CLASS_NAME), editionWhere()) },
        columns: ["flavor"],
        grants: [
          { path: "subclass", value: v("item.name") },
          { path: "proficiencies", op: "append", separator: "; ", value: v("item.builder.proficiencies"), when: v("item.builder.proficiencies") },
          featuresFrom(LIST.classFeatures, and(eq(v("entry.subclass"), v("item.name")), eq(v("entry.class"), CLASS_NAME), lte(v("entry.level"), L), not(v("entry.builder.option")))),
        ],
        subChoices: [
          skillChoice("skills", cat("Bonus proficiencies: ", v("item.builder.skills"), " skills"), null, v("item.builder.skills", 0), v("item.builder.skills")),
          groupChoice("options", lookup(v("item.builder.groupsByLevel", []), sub(L, 1), []), v("item.builder.groups", [])),
        ],
      },
      groupChoice("options", level1("choices.class.item.builder.groupsByLevel"), CB("groups", [])),
      asiChoice("asi", cat("Level ", v("entry"), ": ability scores or a feat"), undefined, level1("choices.class.item.builder.asiByLevel"), L),
      {
        id: "expertise",
        label: cat("Level ", v("entry"), ": expertise in two skills"),
        each: level1("choices.class.item.builder.expertiseByLevel"),
        source: { list: LIST.skills },
        min: 2,
        max: 2,
        available: eq(varAt(cat("fields.skills.", v("option.id")), 0), 1),
        availableText: "Needs proficiency (or has expertise).",
        grants: [{ path: cat("skills.", v("item.id")), value: 2 }],
      },
      {
        id: "hp",
        label: "Hit points after 1st level",
        when: gt(v("item.value"), 1),
        source: {
          options: [
            { id: "average", name: "Average", summary: "The die's average rounded up, each level after the first.", cite: cite("Classes", "Hit Points") },
            { id: "roll", name: "Roll", summary: "Roll the hit die for each level after the first.", cite: cite("Classes", "Hit Points"), roll: cat(sub(v("choices.level.value", 1), 1), "d", CB("hitDie", 8)) },
          ],
        },
      },
    ],
  };

  const spellsStep: CharacterBuilderStep = {
    kind: "choice",
    id: "spells",
    title: "Spells",
    intro: "Cantrips and the spells you know (a wizard's spellbook); prepared casters prepare from their whole list each day.",
    when: and(v("choices.class.item.builder.spellcasting"), or(gt(cantripsAt(L), 0), gt(knownAt(L), 0), gt(maxSpellAt(L), 0))),
    summary: cat(
      ifs(gt(cantripsAt(L), 0), cat(cantripsAt(L), " cantrips"), ""),
      ifs(gt(knownAt(L), 0), cat(ifs(gt(cantripsAt(L), 0), ", ", ""), knownAt(L), ifs(eq(spellcasting("kind"), "spellbook"), " in the spellbook", " known")), ""),
      ifs(spellcasting("preparedDivisor"), cat("; prepare ", max(1, add(varAt(cat("computed.", spellcasting("ability"), "Mod"), 0), floor({ "/": [L, spellcasting("preparedDivisor", 1)] }))), " a day"), ""),
    ),
    subChoices: [
      { id: "cantrips", label: cat(cantripsAt(L), " ", CLASS_NAME, " cantrips"), when: gt(cantripsAt(L), 0), source: { list: LIST.spells, where: classSpellWhere(0, 0) }, min: cantripsAt(L), max: cantripsAt(L), available: notKnown, availableText: "Already known.", grants: [{ path: "spells", op: "append", value: v("item.name") }] },
      {
        id: "known",
        label: cat(knownAt(L), ifs(eq(spellcasting("kind"), "spellbook"), " spells for your spellbook", " spells known"), " (up to level ", maxSpellAt(L), ")"),
        when: gt(knownAt(L), 0),
        source: { list: LIST.spells, where: classSpellWhere(1, maxSpellAt(L)) },
        min: knownAt(L),
        max: knownAt(L),
        available: notKnown,
        availableText: "Already known.",
        grants: [{ path: "spells", op: "append", value: v("item.name") }],
      },
    ],
  };

  const equipmentStep: CharacterBuilderStep = {
    kind: "choice",
    id: "equipment",
    title: "Equipment",
    intro: "Your class's starting equipment, line by line, and your background's (or its gold).",
    cite: cite("Equipment"),
    noun: "starting equipment",
    grants: [
      rowGrant(CB("equipment.fixed", [])),
      { path: "$armor", value: CB("equipment.armor"), when: CB("equipment.armor"), hidden: true },
      { path: "$shield", value: true, when: CB("equipment.shield"), hidden: true },
      rowGrant(v("choices.background.item.builder.equipment", []), v("choices.background.item.builder.equipment")),
      { path: "coins.gp", op: "add", value: v("choices.background.item.builder.gp", 0), when: v("choices.background.item.builder.gp") },
    ],
    subChoices: [
      ...picks("choices.class.item.builder.equipment.picks"),
      {
        id: "class",
        label: v("entry.label"),
        each: CB("equipment.choices", []),
        sourceLabel: cat(CLASS_NAME, " equipment"),
        source: { values: v("entry.options") },
        grants: [rowGrant(v("item.rows", []), v("item.rows")), { path: "$armor", value: v("item.armor"), when: v("item.armor"), hidden: true }, { path: "$shield", value: true, when: v("item.shield"), hidden: true }],
        subChoices: picks("item.picks"),
      },
      {
        id: "background",
        label: cat(v("choices.background.item.name", "Background"), " equipment"),
        when: v("choices.background.item.builder.packages"),
        sourceLabel: cat("background ", v("choices.background.item.name", "")),
        source: { values: v("choices.background.item.builder.packages") },
        grants: [rowGrant(v("item.rows", []), v("item.rows")), { path: "coins.gp", op: "add", value: v("item.gp", 0) }],
      },
    ],
  };

  const detailsStep: CharacterBuilderStep = {
    kind: "fields",
    id: "details",
    title: "Details",
    intro: "Name, alignment, personality and looks.",
    fields: [
      { path: "core.name", label: "Name", required: true },
      { path: "player", label: "Player" },
      { path: "alignment", label: "Alignment", widget: "select", options: { ref: LIST.alignments } },
      { path: "personality.traits", label: "Personality traits", widget: "textarea" },
      { path: "personality.ideals", label: "Ideals", widget: "textarea" },
      { path: "personality.bonds", label: "Bonds", widget: "textarea" },
      { path: "personality.flaws", label: "Flaws", widget: "textarea" },
      { path: "appearance", label: "Appearance", widget: "textarea" },
      { path: "backstory", label: "Backstory", widget: "textarea" },
    ],
  };

  const todo: Rule = {
    merge: [
      CB("todo", []),
      ifs(gt({ count: v("fields.equipment", []) }, 0), lit(["Attack rows: add your weapons' attack bonus and damage on the sheet."]), lit([])),
      ifs(v("choices.background.item.builder.featData.todo"), [v("choices.background.item.builder.featData.todo")] as unknown as Rule, lit([])),
      ifs(eq(E, "mixed"), lit(["Mixed rules: check with your GM which options and increases you use."]), lit([])),
      ifs(and(v("choices.species.item"), not(v("choices.species.item.builder"))), [cat(v("choices.species.item.name"), ": the module has no structured data for it; apply its traits, increases and languages by hand.")] as unknown as Rule, lit([])),
      ifs(and(v("choices.background.item"), not(v("choices.background.item.builder"))), [cat(v("choices.background.item.name"), ": apply its skills, languages and equipment by hand.")] as unknown as Rule, lit([])),
      ifs(and(v("choices.class.item"), not(v("choices.class.item.builder"))), [cat(v("choices.class.item.name"), ": the module has no structured data for this class; apply its proficiencies, features and hit points by hand.")] as unknown as Rule, lit([])),
    ],
  };

  const reviewStep: CharacterBuilderStep = { kind: "review", id: "review", title: "Review", intro: "The sheet as it will be saved, and where every number came from.", todo };

  // --- level up ------------------------------------------------------------------
  const baseLevels = v("base.classLevels", []);
  const LC = (k: string, d?: unknown) => v(`choices.class.item.builder.${k}`, d);
  /** The level the character reaches in the class picked (class level after this level-up). */
  const newClassLevel = (cls: Rule): Rule => ifs(gt(count(baseLevels), 0), add(lookup(find(baseLevels, "class", cls), "level", 0), 1), eq(cls, v("base.class")), add(v("base.level", 1), 1), 1);
  const NL = v("vars.classLevel", 1);
  const currentClasses: Rule = ifs(gt(count(baseLevels), 0), { map: [baseLevels, v("class")] }, [v("base.class", "")] as unknown as Rule);
  const meets = (req: string, any: boolean) => (any ? or : and)(...ABILITY_IDS.map((a) => lte(lookup(v(req), a, any ? 99 : 0), v(`fields.abilities.${a}`, 10))));
  const reqOk = (prefix: string) => and(meets(`${prefix}.multiclass.all`, false), ifs(v(`${prefix}.multiclass.any`), meets(`${prefix}.multiclass.any`, true), true));
  // the current classes' prerequisites, from the class data (one branch per SRD class)
  const currentOk = and(
    ...CLASSES.map((c) => {
      const mc = (classData[c]!.multiclass as { all?: Record<string, number>; any?: Record<string, number> }) ?? {};
      const allOf = Object.entries(mc.all ?? {}).map(([a, n]) => gte(v(`fields.abilities.${a}`, 10), n));
      const all = allOf.length ? and(...allOf) : true;
      const any = mc.any ? or(...Object.entries(mc.any).map(([a, n]) => gte(v(`fields.abilities.${a}`, 10), n))) : true;
      return or(not(isIn(c, currentClasses)), and(all, any));
    }),
  );
  const isNewClass = not(isIn(v("item.id"), currentClasses));
  const subclassOf = (cls: Rule): Rule => ifs(gt(count(baseLevels), 0), lookup(find(baseLevels, "class", cls), "subclass", ""), eq(cls, v("base.class")), v("base.subclass", ""), "");

  const luClass: CharacterBuilderStep = {
    kind: "choice",
    id: "class",
    title: "Class",
    intro: "A level in one of your classes, or a first level in a new one if you meet both classes' prerequisites.",
    cite: cite("Multiclassing"),
    noun: "a level in",
    columns: ["hitDie", "multiclassing"],
    source: { list: LIST.classes },
    available: or(isIn(v("option.id"), currentClasses), and(reqOk("option.builder"), currentOk)),
    availableText: ifs(currentOk, cat("Needs ", v("option.multiclassing", "its prerequisite"), "."), "Your current classes' prerequisites are not met."),
    grants: [
      { path: "$classLevel", value: newClassLevel(v("item.id")), hidden: true },
      { path: "$subclass", value: subclassOf(v("item.id")), hidden: true },
      // a single-class character's levels go into the class list first
      { path: "classLevels", op: "upsert", key: "class", when: and(eq(count(baseLevels), 0), ne(v("item.id"), v("base.class"))), object: { class: v("base.class"), level: v("base.level", 1), subclass: v("base.subclass", "") }, hidden: true },
      { path: "classLevels", op: "upsert", key: "class", when: or(gt(count(baseLevels), 0), ne(v("item.id"), v("base.class"))), object: { class: v("item.id"), level: NL }, label: cat(v("item.name"), " ", NL) },
      { path: "level", op: "add", value: 1 },
      { path: "proficiencies", op: "append", separator: "; ", value: v("item.builder.multiclass.proficiencies"), when: and(isNewClass, v("item.builder.multiclass.proficiencies")) },
      featuresFrom(LIST.classFeatures, and(eq(v("entry.class"), v("item.name")), not(v("entry.subclass", "")), eq(v("entry.level"), NL), not(v("entry.builder.skip")), not(v("entry.builder.option")), ne(v("entry.edition", ""), "2024"))),
      featuresFrom(LIST.classFeatures, and(v("vars.subclass", ""), eq(v("entry.class"), v("item.name")), eq(v("entry.subclass", ""), v("vars.subclass", "")), eq(v("entry.level"), NL), not(v("entry.builder.option")))),
    ],
    subChoices: [
      skillChoice("skill", "One skill (multiclassing)", v("item.builder.multiclass.skill"), 1, and(isNewClass, v("item.builder.multiclass.skill"))),
      { id: "tool", label: v("item.builder.multiclass.tool.label"), when: and(isNewClass, v("item.builder.multiclass.tool")), source: { values: v("item.builder.multiclass.tool.ids"), list: LIST.tools }, grants: [{ path: "proficiencies", op: "append", separator: "; ", value: v("item.name") }] },
    ],
  };
  const toughness = ifs(find(v("base.features", []), "name", "Dwarven Toughness"), 1, 0);
  const luHp: CharacterBuilderStep = {
    kind: "choice",
    id: "hp",
    title: "Hit points",
    intro: "The class's hit die (its average rounded up, or a roll) plus your Constitution modifier.",
    cite: cite("Classes", "Hit Points"),
    source: {
      options: [
        { id: "average", name: "Average", summary: "Half the die plus one.", cite: cite("Classes", "Hit Points") },
        { id: "roll", name: "Roll", summary: "Roll the class's hit die.", cite: cite("Classes", "Hit Points"), roll: cat("1d", LC("hitDie", 8)) },
      ],
    },
    grants: [
      { path: "$hpGain", value: max(1, add(ifs(eq(v("item.id"), "roll"), v("item.rolled", 1), add(floor({ "/": [LC("hitDie", 8), 2] }), 1)), v("computed.constitutionMod", 0))), hidden: true },
      { path: "hp.max", op: "add", value: add(v("vars.hpGain", 0), toughness), label: cat("+", add(v("vars.hpGain", 0), toughness), " hit point maximum") },
      { path: "hp.current", op: "add", value: add(v("vars.hpGain", 0), toughness), hidden: true },
    ],
  };
  const groupsNew = lookup(LC("groupsNewByLevel", []), sub(NL, 1), []);
  const luFeatures: CharacterBuilderStep = {
    kind: "choice",
    id: "features",
    title: "New features",
    intro: "A subclass at its level, ability score improvements and the class's other choices.",
    summary: cat(v("choices.class.item.name", ""), " ", NL),
    grants: [],
    subChoices: [
      {
        id: "subclass",
        label: cat(v("choices.class.item.name", ""), " subclass"),
        when: and(eq(NL, LC("subclassLevel", 99)), not(v("vars.subclass", ""))),
        noun: "subclass",
        source: { list: LIST.subclasses, where: eq(v("option.class"), v("choices.class.item.name", "")) },
        grants: [
          { path: "subclass", value: v("item.name"), when: eq(v("choices.class.id"), v("base.class")) },
          { path: "classLevels", op: "upsert", key: "class", when: gt(count(v("fields.classLevels", [])), 0), object: { class: v("choices.class.id"), subclass: v("item.name") }, hidden: true },
          { path: "proficiencies", op: "append", separator: "; ", value: v("item.builder.proficiencies"), when: v("item.builder.proficiencies") },
          featuresFrom(LIST.classFeatures, and(eq(v("entry.subclass"), v("item.name")), eq(v("entry.class"), v("choices.class.item.name", "")), lte(v("entry.level"), NL), not(v("entry.builder.option")))),
        ],
        subChoices: [skillChoice("skills", cat("Bonus proficiencies: ", v("item.builder.skills"), " skills"), null, v("item.builder.skills", 0), v("item.builder.skills")), groupChoice("options", lookup(v("item.builder.groupsByLevel", []), sub(NL, 1), []), v("item.builder.groups", []))],
      },
      groupChoice("options", groupsNew, LC("groups", [])),
      groupChoice("subclassOptions", lookup(lookup(lookup(v("data.subclassGroups", {}), v("vars.subclass", ""), {}), "groupsNewByLevel", []), sub(NL, 1), []), lookup(lookup(v("data.subclassGroups", {}), v("vars.subclass", ""), {}), "groups", []), v("vars.subclass", "")),
      asiChoice("asi", cat(v("choices.class.item.name", ""), " ", NL, ": ability scores or a feat"), isIn(NL, LC("asiLevels", [])), undefined, v("fields.level", 1)),
      {
        id: "expertise",
        label: "Expertise in two skills",
        when: isIn(NL, LC("expertiseLevels", [])),
        source: { list: LIST.skills },
        min: 2,
        max: 2,
        available: eq(varAt(cat("fields.skills.", v("option.id")), 0), 1),
        availableText: "Needs proficiency (or has expertise).",
        grants: [{ path: cat("skills.", v("item.id")), value: 2 }],
      },
    ],
  };
  // the class's spell counts at the new class level, minus what it had before
  const luCantrips = sub(lookup(LC("spellcasting.cantrips", []), sub(NL, 1), 0), lookup(LC("spellcasting.cantrips", []), sub(NL, 2), 0));
  const luKnown = sub(lookup(LC("spellcasting.known", []), sub(NL, 1), 0), ifs(gt(NL, 1), lookup(LC("spellcasting.known", []), sub(NL, 2), 0), 0));
  const luMax = lookup(LC("spellcasting.maxLevel", []), sub(NL, 1), 0);
  const luSpells: CharacterBuilderStep = {
    kind: "choice",
    id: "spells",
    title: "Spells",
    intro: "New cantrips and spells known at this class level.",
    when: and(LC("spellcasting"), or(gt(luCantrips, 0), gt(luKnown, 0))),
    subChoices: [
      { id: "cantrips", label: cat(luCantrips, " new cantrips"), when: gt(luCantrips, 0), source: { list: LIST.spells, where: classSpellWhere(0, 0) }, min: luCantrips, max: luCantrips, available: notKnown, availableText: "Already known.", grants: [{ path: "spells", op: "append", value: v("item.name") }] },
      { id: "known", label: cat(luKnown, " new spells (up to level ", luMax, ")"), when: gt(luKnown, 0), source: { list: LIST.spells, where: classSpellWhere(1, luMax) }, min: luKnown, max: luKnown, available: notKnown, availableText: "Already known.", grants: [{ path: "spells", op: "append", value: v("item.name") }] },
    ],
  };

  return {
    id: id("builder"),
    entityType: CHARACTER,
    name: "Build a character",
    description: "Edition, species, class, background, ability scores, starting level, spells, equipment and details, with every grant traced to its source.",
    cite: cite("Classes"),
    defaults: { isPC: true },
    data: { subclassGroups: Object.fromEntries(subclasses.items.filter((s) => subclassData[s.id]?.groups).map((s) => [s.name, { groups: subclassData[s.id]!.groups, groupsNewByLevel: subclassData[s.id]!.groupsNewByLevel }])) },
    itemData,
    steps: [editionStep, speciesStep, classStep, backgroundStep, abilityStep, levelStep, spellsStep, equipmentStep, detailsStep, reviewStep],
    finally: [
      { path: "hp.max", value: max(1, hpMax), label: cat("Hit point maximum ", max(1, hpMax), ifs(hpRolled, " (rolled)", " (average)"), ifs(v("vars.hpPerLevel"), " with Dwarven Toughness", "")) },
      { path: "hp.current", value: v("fields.hp.max", 1), hidden: true },
      { path: "ac", value: ac, label: cat("Armor Class ", ac) },
      { path: "core.summary", value: cat(ifs(and(v("fields.subrace", ""), not(isIn(":", v("fields.subrace", "")))), v("fields.subrace"), v("fields.race", "")), " ", v("choices.class.item.name", ""), " ", v("fields.level", 1)), when: v("choices.class.item"), hidden: true },
    ],
    preview: [
      { label: "Hit points", value: v("fields.hp.max") },
      { label: "Armor Class", value: v("fields.ac") },
      { label: "Proficiency bonus", value: cat("+", v("computed.proficiencyBonus")) },
      { label: "Speed", value: cat(v("fields.speed", 30), " ft.", ifs(v("fields.darkvision"), cat(", darkvision ", v("fields.darkvision"), " ft."), "")) },
      { label: "Saving throws", value: savesList },
      { label: "Skills", value: skillsList },
      { label: "Spell slots", value: v("computed.spellSlots", "") },
      { label: "Spell save DC", value: v("computed.spellSaveDc", "") },
      { label: "Languages", value: v("fields.languages", []) },
      { label: "Features", value: { map: [v("fields.features", []), v("name")] } },
    ],
    levelUp: {
      title: "Level up",
      when: lt(v("fields.level", 1), 20),
      whenText: "Already level 20.",
      steps: [luClass, luHp, luFeatures, luSpells, { kind: "review", id: "review", title: "Review", intro: "What the new level adds.", todo: CB("todo", []) }],
      finally: [
        {
          path: "core.summary",
          value: cat(ifs(and(v("fields.subrace", ""), not(isIn(":", v("fields.subrace", "")))), v("fields.subrace"), v("fields.race", "")), " ", ifs(v("computed.classSummary", ""), v("computed.classSummary"), cat(v("choices.class.item.name", ""), " ", v("fields.level", 1)))),
          when: v("choices.class.item"),
          hidden: true,
        },
      ],
    },
  };
}
