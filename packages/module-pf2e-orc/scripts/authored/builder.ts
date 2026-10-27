/**
 * The remaster character builder (`characterBuilders` in pack.json):
 * Ancestry (heritage, boosts and flaws) → Background → Class → Attribute
 * boosts → Skills and languages → Starting level → one step per level from 1
 * to the starting level (feats, skill increases, boosts, class features) →
 * Equipment → Details → Review, and a level-up that adds the next level.
 *
 * Everything a pick does comes from the `builder` data the converter attaches
 * to the source's own items (scripts/source/builderData.ts): ancestry boosts,
 * flaws, Hit Points, size, speed, senses and languages; a background's
 * boosts, skills, Lore and skill feat; a class's key attribute, initial
 * proficiencies, trained skills, feat and skill increase levels, its feat
 * list and, per level, its features with the proficiency increases and the
 * choices (instinct, doctrine, muse...) they bring; feats' levels, traits and
 * prerequisites. A supplement's items carry the same data, so its ancestries
 * and classes work the same way with their source badge. The few numbers the
 * source has no structured field for are written out here and cited
 * (starting wealth by level, GM Core).
 *
 * Attributes are modifiers (the remaster writes them down that way); a boost
 * adds 1, or, at +4 or more, marks a partial boost that the next boost to it
 * completes (`partialBoosts` on the sheet). Every rule is JSONLogic (rule 5);
 * computed values (Hit Points, AC, checks, DCs) stay computed (rule 4).
 */
import type { CharacterBuilderDef, CharacterBuilderGrant, CharacterBuilderStep, CharacterBuilderSubChoice, ReferenceList } from "@campaign-forge/module-sdk";
import { ATTRIBUTES, CHARACTER, cite, id, LIST, SAVES, SKILLS } from "../ids.ts";
import { add, cat, eq, floor, gt, ifs, lookup, max, mul, signedText, sub, v, type Rule } from "./logic.ts";

type Grant = CharacterBuilderGrant;
type Sub = CharacterBuilderSubChoice;
type Step = CharacterBuilderStep;

// ---------------------------------------------------------------------------
// JSONLogic helpers
// ---------------------------------------------------------------------------

const and = (...xs: Rule[]): Rule => (xs.length ? { and: xs } : true);
const or = (...xs: Rule[]): Rule => (xs.length ? { or: xs } : false);
const not = (x: Rule): Rule => ({ "!": x });
const ne = (a: Rule, b: Rule): Rule => ({ "!=": [a, b] });
const lt = (a: Rule, b: Rule): Rule => ({ "<": [a, b] });
const lte = (a: Rule, b: Rule): Rule => ({ "<=": [a, b] });
const gte = (a: Rule, b: Rule): Rule => ({ ">=": [a, b] });
const isIn = (a: Rule, list: Rule): Rule => ({ in: [a, list] });
const count = (x: Rule): Rule => ({ count: x });
const find = (list: Rule, key: string, value: Rule): Rule => ({ find: [list, key, value] });
const merge = (...xs: Rule[]): Rule => ({ merge: xs });
const mod = (a: Rule, b: Rule): Rule => ({ "%": [a, b] });
const startsWith = (a: Rule, b: Rule): Rule => ({ startsWith: [a, b] });
/** A literal list (a JSONLogic array evaluates element by element, so strings stay strings). */
const list = (xs: Rule[]): Rule => xs as unknown as Rule;
const lit = (x: unknown): Rule => x as Rule;
/** The value at a worked-out path, with a fallback. */
const varAt = (path: Rule, fallback: unknown): Rule => ({ var: [path, fallback as Rule] });
const rankAt = (path: Rule): Rule => varAt(cat("fields.", path), 0);

// ---------------------------------------------------------------------------
// Lists and names
// ---------------------------------------------------------------------------

const FEATS = { ancestry: id("feats.ancestry"), general: id("feats.general"), skill: id("feats.skill"), archetype: id("feats.archetype") };
const SHOP_LISTS = ["weapons", "armor", "shields", "gear", "alchemical", "consumables", "items"].map((k) => id(`equipment.${k}`));
const ATTR_IDS = ATTRIBUTES.map((a) => a.id);
const RANK_WORDS = ["untrained", "trained", "expert", "master", "legendary"];
/** Sheet paths of proficiency ranks a class or feature raises. */
const RANK_PATHS = ["saves.perception", "saves.fortitude", "saves.reflex", "saves.will", "attacks.simple", "attacks.martial", "attacks.advanced", "attacks.unarmed", "defenses.unarmored", "defenses.light", "defenses.medium", "defenses.heavy", "classDcRank", "spellcasting.rank"];

/** Names the review page uses for proficiency paths ("Fortitude expert", "martial weapons master"). */
const RANK_NAMES = {
  saves: Object.fromEntries(SAVES.map((s) => [s.id, s.name])),
  attacks: { simple: "Simple weapons", martial: "Martial weapons", advanced: "Advanced weapons", unarmed: "Unarmed attacks" },
  defenses: { unarmored: "Unarmored defense", light: "Light armor", medium: "Medium armor", heavy: "Heavy armor" },
  skills: { ...Object.fromEntries(SKILLS.map((s) => [s.id, s.name])), "lore-a": "Lore (first)", "lore-b": "Lore (second)" },
  classDcRank: "Class DC",
  spellcasting: { rank: "Spell attacks and spell DCs" },
};

/** The sixteen skills (ids of the skills list), and the two Lore slots as options of their own (skill increases may raise a Lore). */
const SKILL_IDS = list(SKILLS.map((s) => s.id));
const SKILL_INCREASE_OPTIONS = [...SKILLS.map((s) => ({ id: s.id, name: s.name })), { id: "lore-a", name: "Lore (first topic)" }, { id: "lore-b", name: "Lore (second topic)" }];

/**
 * Character wealth by level (GM Core, Treasure: Character Wealth): a new
 * character above 1st level starts with permanent items of these levels and
 * this much currency, or the lump sum instead. Level 1 is Player Core's 15 gp.
 */
const WEALTH: Array<{ items: string; currency: number; lump: number }> = [
  { items: "", currency: 15, lump: 15 },
  { items: "one 1st-level item", currency: 20, lump: 30 },
  { items: "one 2nd-level and two 1st-level items", currency: 25, lump: 75 },
  { items: "one 3rd-level, two 2nd-level and one 1st-level item", currency: 30, lump: 140 },
  { items: "one 4th-level, two 3rd-level, one 2nd-level and two 1st-level items", currency: 50, lump: 270 },
  { items: "one 5th-level, two 4th-level, one 3rd-level and two 2nd-level items", currency: 80, lump: 450 },
  { items: "one 6th-level, two 5th-level, one 4th-level and two 3rd-level items", currency: 125, lump: 720 },
  { items: "one 7th-level, two 6th-level, one 5th-level and two 4th-level items", currency: 180, lump: 1100 },
  { items: "one 8th-level, two 7th-level, one 6th-level and two 5th-level items", currency: 250, lump: 1600 },
  { items: "one 9th-level, two 8th-level, one 7th-level and two 6th-level items", currency: 350, lump: 2300 },
  { items: "one 10th-level, two 9th-level, one 8th-level and two 7th-level items", currency: 500, lump: 3200 },
  { items: "one 11th-level, two 10th-level, one 9th-level and two 8th-level items", currency: 700, lump: 4500 },
  { items: "one 12th-level, two 11th-level, one 10th-level and two 9th-level items", currency: 1000, lump: 6400 },
  { items: "one 13th-level, two 12th-level, one 11th-level and two 10th-level items", currency: 1500, lump: 9300 },
  { items: "one 14th-level, two 13th-level, one 12th-level and two 11th-level items", currency: 2250, lump: 13500 },
  { items: "one 15th-level, two 14th-level, one 13th-level and two 12th-level items", currency: 3250, lump: 20000 },
  { items: "one 16th-level, two 15th-level, one 14th-level and two 13th-level items", currency: 5000, lump: 30000 },
  { items: "one 17th-level, two 16th-level, one 15th-level and two 14th-level items", currency: 7500, lump: 45000 },
  { items: "one 18th-level, two 17th-level, one 16th-level and two 15th-level items", currency: 12000, lump: 69000 },
  { items: "one 19th-level, two 18th-level, one 17th-level and two 16th-level items", currency: 20000, lump: 112000 },
];

/**
 * Spellcasting attributes that are not the key attribute: a champion's
 * devotion spells use Charisma (Player Core 2, Champion), a magus casts with
 * Intelligence (Impossible Magic, Magus). A supplement class nests under the
 * supplement id (how `lookup` reads a dotted id).
 */
const SPELL_ATTRIBUTE = { champion: "charisma", "pf2e-orc-books": { magus: "intelligence" } };

/**
 * What the builder leaves to the player for classes whose structure it does
 * not model (original advice), keyed like the sheet's class ids.
 */
const CLASS_NOTES: Record<string, unknown> = {
  alchemist: "Alchemist: record your formula book and the versatile vials and Quick Alchemy you prepare.",
  cleric: "Cleric: choose your deity and divine font with the GM (the module suggests no deities).",
  champion: "Champion: choose your deity and sanctification with the GM, and your blessing at 3rd level.",
  druid: "Druid: note your anathema and, for an animal order, your animal companion.",
  witch: "Witch: record your familiar's abilities and your patron's hexes.",
  wizard: "Wizard: record your spellbook and your arcane bond item.",
  "pf2e-orc-books": {
    animist: "Animist: choose your apparitions and their spells by hand.",
    commander: "Commander: note your banner and which tactics you have prepared.",
    exemplar: "Exemplar: note which ikons hold your divine spark; epithets after 3rd level are chosen by hand when the builder does not offer them.",
    guardian: "Guardian: record your guardian's armor and techniques.",
    gunslinger: "Gunslinger: note your deeds and your slinger's reload.",
    inventor: "Inventor: build your innovation's modifications (armor, construct, weapon or mortar) by hand.",
    magus: "Magus: prepare your spells and studious spells by hand.",
    necromancer: "Necromancer: record your thralls and grave spells.",
    psychic: "Psychic: choose your psi cantrips' amps and your spell repertoire by hand.",
    runesmith: "Runesmith: record your runic repertoire.",
    summoner: "Summoner: your eidolon is a creature of its own (its statistics, evolutions and actions) and is built by hand.",
    thaumaturge: "Thaumaturge: record your esoterica; implements after the first, adept and paragon benefits are chosen by hand when the builder does not offer them.",
  },
};

// ---------------------------------------------------------------------------
// Shared pieces
// ---------------------------------------------------------------------------

const rankLabel = (path: Rule, rank: Rule): Rule => cat(lookup(v("data.rankNames"), path, path), " ", lookup(v("data.rankWords"), rank, ""));
const attrName = (attr: Rule): Rule => lookup(v("data.attrNames"), attr, attr);
/** Has the character this feat (by name)? */
const hasFeat = (name: Rule): Rule => find(v("fields.feats", []), "name", name);

/**
 * Proficiency ranks from a list of `{ path, rank }` (each raised to at least
 * the rank). A skill training that finds the skill already trained counts
 * towards an extra trained skill of the player's choice (Player Core).
 */
function rankGrants(each: Rule): Grant[] {
  return [
    { path: "$extraSkills", op: "add", value: 1, each, when: and(eq(v("entry.rank"), 1), startsWith(v("entry.path"), "skills."), gte(rankAt(v("entry.path")), 1)), hidden: true },
    { path: v("entry.path"), op: "max", value: v("entry.rank"), each, when: lt(rankAt(v("entry.path")), v("entry.rank")), label: rankLabel(v("entry.path"), v("entry.rank")) },
  ];
}

/**
 * One attribute boost: +1, or at +4 or more a partial boost that the next
 * boost completes (Player Core, Attribute Boosts). `$intUp` says an
 * Intelligence increase happened (an extra skill and language at levels 5+).
 */
function boostGrants(attr: Rule): Grant[] {
  const cur = varAt(cat("fields.attributes.", attr), 0);
  return [
    { path: "$boost", value: ifs(lt(cur, 4), "full", isIn(attr, v("fields.partialBoosts", [])), "complete", "partial"), hidden: true },
    { path: cat("attributes.", attr), op: "add", value: 1, when: ne(v("vars.boost"), "partial"), label: cat("+1 ", attrName(attr), ifs(eq(v("vars.boost"), "complete"), " (second partial boost)", "")) },
    { path: "partialBoosts", op: "remove", value: attr, when: eq(v("vars.boost"), "complete"), hidden: true },
    { path: "partialBoosts", op: "append", value: attr, when: eq(v("vars.boost"), "partial"), label: cat("Partial boost to ", attrName(attr), " (at +4 or more, two boosts make +1)") },
    { path: "$intUp", value: true, when: and(eq(attr, "intelligence"), ne(v("vars.boost"), "partial")), hidden: true },
  ];
}

/** Attribute boosts to choose: `count` different attributes (one source never boosts one twice). */
function boostChoice(idName: string, label: Rule, countRule: Rule, extra: Partial<Sub> = {}): Sub {
  return {
    id: idName,
    label,
    source: { list: LIST.attributes },
    min: countRule,
    max: countRule,
    grants: boostGrants(v("item.id")),
    ...extra,
  };
}

/** A Lore skill into the first free (or same) of the sheet's two Lore slots. */
function loreGrants(name: Rule): Grant[] {
  const first = v("fields.loreTopics.first", "");
  const second = v("fields.loreTopics.second", "");
  return [
    { path: "$loreSlot", value: ifs(not(name), "", or(not(first), eq(first, name)), "first", or(not(second), eq(second, name)), "second", ""), hidden: true },
    { path: cat("loreTopics.", v("vars.loreSlot")), value: name, when: v("vars.loreSlot"), label: cat("Lore topic: ", name) },
    { path: ifs(eq(v("vars.loreSlot"), "first"), "skills.lore-a", "skills.lore-b"), op: "max", value: 1, when: v("vars.loreSlot"), label: cat(name, " trained") },
  ];
}

/** Class features (by id) appended as `{ name, desc }`; the ids are worked out once (a variable), not per list item. */
function featureGrant(ids: Rule): Grant[] {
  return [
    { path: "$featureIds", value: ids, hidden: true },
    { path: "features", op: "append", each: { list: LIST.classFeatures, where: and(v("vars.featureIds.0"), isIn(v("entry.id"), v("vars.featureIds"))) }, object: { name: v("entry.name"), desc: v("entry.description", "") } },
  ];
}

/** Feats a pick brings outright (a background's skill feat, Shield Block), filed at a level with a type. */
function bonusFeats(names: Rule, level: Rule, type: string): Grant {
  return { path: "feats", op: "append", each: names, when: not(hasFeat(v("entry"))), object: { level, type, name: v("entry") }, label: cat("Feat: ", v("entry")) };
}

/** A skill or save to raise from a pick's `rankChoices` (one choice per element), with the feat a pick may bring. */
function rankChoices(idName: string, each: Rule, level: Rule): Sub[] {
  const shared = (listId: string, kind: "skills" | "saves"): Sub => ({
    id: `${idName}-${kind}`,
    label: ifs(eq(v("entry.rank"), 1), kind === "skills" ? "Trained skill" : "Trained save", cat(kind === "skills" ? "Skill" : "Save", " to ", lookup(v("data.rankWords"), v("entry.rank"), ""))),
    each,
    when: eq(v("entry.list"), kind),
    source: { values: v("entry.from"), list: listId },
    available: lt(rankAt(cat(`${kind}.`, v("option.id"))), v("entry.rank")),
    availableText: "Already at that rank.",
    grants: [
      { path: cat(`${kind}.`, v("item.id")), op: "max", value: v("entry.rank"), label: cat(v("item.name"), " ", lookup(v("data.rankWords"), v("entry.rank"), "")) },
      { path: "feats", op: "append", when: lookup(v("entry.feats"), v("item.id"), ""), object: { level, type: "skill", name: lookup(v("entry.feats"), v("item.id"), "") }, label: cat("Feat: ", lookup(v("entry.feats"), v("item.id"), "")) },
    ],
  });
  return [shared(LIST.skills, "skills"), shared(LIST.saves, "saves")];
}

/** Skills of the player's choice, trained (heritages and feats that say "a skill of your choice"). */
function anySkill(idName: string, countRule: Rule): Sub {
  return {
    id: idName,
    label: ifs(gt(countRule, 1), cat(countRule, " skills of your choice"), "A skill of your choice"),
    when: countRule,
    source: { values: SKILL_IDS, list: LIST.skills },
    min: countRule,
    max: countRule,
    available: lt(rankAt(cat("skills.", v("option.id"))), 1),
    availableText: "Already trained.",
    grants: [{ path: cat("skills.", v("item.id")), op: "max", value: 1, label: cat(v("item.name"), " trained") }],
  };
}

/**
 * Does a feat's prerequisite (its flat `builder.req`) hold: one of the paths
 * of `r0` at rank `n0` (and of `r1` at `n1`), the feats `f0` and `f1`, and
 * the attribute modifiers in `a`.
 */
function prereqOk(): Rule {
  const R = (k: string, d?: unknown) => v(k ? `option.builder.req.${k}` : "option.builder.req", d);
  const slot = (i: number) => or(not(R(`r${i}`)), ...[0, 1, 2, 3].map((k) => gte(rankAt(R(`r${i}.${k}`, "~")), R(`n${i}`, 9))));
  const feat = (i: number) => or(not(R(`f${i}`)), hasFeat(R(`f${i}`)));
  const attrs = and(...ATTR_IDS.map((a) => lte(R(`a.${a}`, -9), v(`fields.attributes.${a}`, 0))));
  return or(not(R("")), and(slot(0), slot(1), feat(0), feat(1), attrs));
}

/**
 * A feat to pick at `level`: from `lists` (JSONLogic giving list ids),
 * filtered by `where` and the feat's level; not one already taken (unless it
 * may be taken more than once) and with its prerequisites met. A
 * prerequisite the builder cannot check asks the GM to confirm it.
 */
function featChoice(o: { id: string; label: Rule; when: Rule; lists: Rule; where?: Rule; level: Rule; type: Rule; each?: Rule; nested?: boolean }): Sub {
  const taken = and(not(v("option.builder.repeat")), hasFeat(v("option.name")));
  // a feat that gives another feat (General Training, Natural Ambition): one level deep
  const bonus: Sub[] = o.nested
    ? []
    : [
        featChoice({
          id: "bonus-feat",
          label: cat(v("item.name"), ": a level ", v("entry.level"), " feat"),
          each: v("item.builder.featChoices", []),
          when: true,
          lists: ifs(eq(v("entry.category"), "class"), list([v("choices.class.item.builder.featList", "")]), list([FEATS.general, FEATS.skill])),
          where: and(lte(v("option.level", 1), v("entry.level", 1)), or(eq(lookup(v("entry.traits"), 0, ""), "class"), isIn(lookup(v("entry.traits"), 0, ""), v("option.traits", ""))), isIn(lookup(v("entry.traits"), 1, ""), v("option.traits", ""))),
          level: o.level,
          type: "bonus",
          nested: true,
        }),
      ];
  return {
    id: o.id,
    label: o.label,
    when: o.when,
    ...(o.each ? { each: o.each } : {}),
    source: { lists: o.lists, where: and(lte(v("option.level", 1), o.level), o.where ?? true) },
    available: and(not(taken), prereqOk()),
    availableText: ifs(taken, "Already taken.", cat("Prerequisites: ", v("option.prerequisites", ""))),
    columns: ["level", "traits", "prerequisites"],
    noun: "feat",
    grants: [
      { path: "feats", op: "append", object: { level: o.level, type: ifs(v("item.builder.archetype"), "archetype", o.type), name: v("item.name") }, label: cat(ifs(v("item.builder.archetype"), "archetype", o.type), " feat ", v("item.name"), " (level ", o.level, ")") },
      ...rankGrants(v("item.builder.ranks", [])),
      { path: "senses", op: "append", value: v("item.builder.senses", []) },
      { path: "hpPerLevel", op: "add", value: v("item.builder.hpPerLevel"), when: v("item.builder.hpPerLevel"), label: cat("+", v("item.builder.hpPerLevel"), " Hit Points per level") },
      bonusFeats(v("item.builder.feats", []), o.level, "bonus"),
      ...loreGrants(lookup(v("item.builder.lore", []), 0, "")),
    ],
    subChoices: [
      {
        id: "prereq",
        label: cat("Prerequisites: ", v("item.prerequisites", "")),
        help: "The builder cannot check these; the GM confirms them.",
        when: v("item.builder.req.confirm"),
        source: {
          options: [
            { id: "met", name: "Met (the GM confirms)", original: true },
            { id: "unmet", name: "Not met", original: true },
          ],
        },
        validate: [{ rule: ne(v("item.id"), "unmet"), message: "Choose another feat, or check the prerequisites with the GM." }],
      },
      ...rankChoices("skill", v("item.builder.rankChoices", []), o.level),
      anySkill("any-skill", v("item.builder.anySkill", 0)),
      ...bonus,
    ],
  };
}

/** The class choices a level brings (instinct, doctrine, tactics, implements...): class features or actions with one of the entry's tags. */
function selectionChoice(each: Rule, level: Rule): Sub {
  const tag = (i: number) => isIn(lookup(v("entry.tags"), i, "~"), v("option.builder.tags", []));
  return {
    id: "select",
    label: v("entry.name"),
    help: ifs(gt(v("entry.count"), 1), cat("Choose ", v("entry.count"), "."), ""),
    each,
    source: { lists: ifs(v("entry.actions"), list([LIST.actions]), list([LIST.classFeatures])), where: or(tag(0), tag(1), tag(2)) },
    min: v("entry.count"),
    max: v("entry.count"),
    available: not(find(v("fields.features", []), "name", v("option.name"))),
    availableText: "Already chosen.",
    sourceLabel: cat(v("entry.name"), " ", v("item.name")),
    grants: [
      { path: "features", op: "append", object: { name: v("item.name"), desc: v("item.description", "") }, label: cat(v("entry.name"), ": ", v("item.name")) },
      { path: "subclass", op: "append", value: v("item.name"), when: not(v("entry.actions")), hidden: true },
      ...rankGrants(v("item.builder.ranks", [])),
      { path: "senses", op: "append", value: v("item.builder.senses", []) },
      bonusFeats(v("item.builder.feats", []), level, "bonus"),
      { path: "features", op: "append", each: v("item.builder.grants", []), object: { name: v("entry"), desc: cat("Granted by ", v("item.name"), ".") } },
      // a doctrine's or research field's own features at this level
      ...featureGrant(lookup(v("choices.class.item.builder.levels", []), cat(sub(level, 1), ".o.", v("item.name"), ".f"), [])),
      ...rankGrants(lookup(v("choices.class.item.builder.levels", []), cat(sub(level, 1), ".o.", v("item.name"), ".r"), [])),
      bonusFeats(lookup(v("choices.class.item.builder.levels", []), cat(sub(level, 1), ".o.", v("item.name"), ".ft"), []), level, "bonus"),
    ],
    subChoices: [...rankChoices("skill", v("item.builder.rankChoices", []), level), anySkill("any-skill", v("item.builder.anySkill", 0))],
  };
}

/** A skill increase at `level`: trained in a new skill, or one rank up to the rank the level allows (expert; master from 7th; legendary from 15th). */
function skillIncrease(level: Rule): Sub {
  const maxRank = ifs(gte(level, 15), 4, gte(level, 7), 3, 2);
  const rank = rankAt(cat("skills.", v("option.id")));
  return {
    id: "skill-increase",
    label: cat("Level ", level, " skill increase"),
    help: cat("Up to ", lookup(v("data.rankWords"), maxRank, ""), " at this level."),
    source: { options: SKILL_INCREASE_OPTIONS },
    available: lt(rank, maxRank),
    availableText: cat("Already ", lookup(v("data.rankWords"), rank, ""), "."),
    grants: [{ path: cat("skills.", v("item.id")), op: "add", value: 1, label: cat(v("item.name"), " ", lookup(v("data.rankWords"), add(rankAt(cat("skills.", v("item.id"))), 1), "")) }],
  };
}

/** Languages to choose: the ancestry's own list first, then the module's. */
function languageChoice(idName: string, label: Rule, countRule: Rule, from: Rule): Sub {
  return {
    id: idName,
    label,
    when: gt(countRule, 0),
    source: { values: from },
    min: countRule,
    max: countRule,
    available: not(isIn(v("option.id"), v("fields.languages", []))),
    availableText: "Already known.",
    grants: [{ path: "languages", op: "append", value: v("item.id") }],
  };
}

// ---------------------------------------------------------------------------
// Per level
// ---------------------------------------------------------------------------

/**
 * What a level from 2 up brings: the class features gained (with their
 * proficiency increases and the choices they bring), the class, ancestry,
 * skill and general feats at the class's feat levels, a skill increase,
 * four attribute boosts at 5th, 10th, 15th and 20th, and an extra trained
 * skill and language when Intelligence went up. `level` is a number (when
 * building) or a rule (levelling up); `archetypes` says whether class feat
 * slots offer archetype feats.
 */
function levelContent(level: Rule, archetypes: Rule): { grants: Grant[]; subChoices: Sub[] } {
  const LV = (k: string, d: unknown = []) => lookup(v("choices.class.item.builder.levels", []), cat(sub(level, 1), ".", k), d);
  const at = (k: string) => isIn(level, v(`choices.class.item.builder.featLevels.${k}`, []));
  const subclass = v("fields.subclass", "");
  const traitMatch = or(...[0, 1, 2, 3, 4, 5, 6, 7].map((i) => isIn(lookup(v("fields.traits", []), i, "~"), v("option.builder.traits", []))));
  const after1 = gt(level, 1);
  const fromLevel2 = (gs: Grant[]): Grant[] => gs.map((g) => ({ ...g, when: g.when === undefined ? after1 : and(after1, g.when) }));
  return {
    grants: [
      { path: "$intUp", value: false, hidden: true },
      // 1st-level features come with the class pick
      ...fromLevel2([
      // the level's features and a doctrine's or research field's own (the option is the class choice on the sheet)
      ...featureGrant(merge(LV("f"), lookup(v("choices.class.item.builder.levels", []), cat(sub(level, 1), ".o.", subclass, ".f"), []))),
      { path: "features", op: "append", each: LV("n"), object: { name: v("entry"), desc: "" } },
      ...rankGrants(LV("r")),
      bonusFeats(LV("ft"), level, "bonus"),
      ...loreGrants(lookup(LV("lore"), 0, "")),
      // and their proficiency increases and feats
      ...rankGrants(lookup(v("choices.class.item.builder.levels", []), cat(sub(level, 1), ".o.", subclass, ".r"), [])),
      bonusFeats(lookup(v("choices.class.item.builder.levels", []), cat(sub(level, 1), ".o.", subclass, ".ft"), []), level, "bonus"),
      ]),
    ],
    subChoices: [
      { ...selectionChoice(LV("s"), level), when: after1 },
      ...rankChoices("feature", LV("c"), level).map((c) => ({ ...c, when: and(after1, c.when ?? true) })),
      // one feat choice per slot the level has: class, ancestry, skill and general feats at the class's levels,
      // then feats a class feature or (at 1st level) the heritage gives (`{ name?, level, traits, category? }`)
      featChoice({
        id: "feat",
        each: merge(
          ifs(at("class"), lit([{ kind: "class", label: "class feat" }]), list([])),
          ifs(at("ancestry"), lit([{ kind: "ancestry", label: "ancestry feat" }]), list([])),
          ifs(at("skill"), lit([{ kind: "skill", label: "skill feat" }]), list([])),
          ifs(at("general"), lit([{ kind: "general", label: "general feat" }]), list([])),
          LV("fc"),
          ifs(eq(level, 1), v("choices.ancestry.sub.heritage.item.builder.featChoices", []), list([])),
        ),
        label: ifs(v("entry.kind"), cat("Level ", level, " ", v("entry.label")), cat(v("entry.name", v("choices.ancestry.sub.heritage.item.name", "Heritage")), ": a level ", v("entry.level"), " feat")),
        when: true,
        lists: ifs(
          eq(v("entry.kind"), "class"),
          merge(list([v("choices.class.item.builder.featList", "")]), ifs(archetypes, list([FEATS.archetype]), list([]))),
          eq(v("entry.kind"), "ancestry"),
          list([FEATS.ancestry]),
          eq(v("entry.kind"), "skill"),
          list([FEATS.skill]),
          eq(v("entry.category"), "class"),
          list([v("choices.class.item.builder.featList", "")]),
          list([FEATS.general, FEATS.skill]),
        ),
        where: ifs(
          eq(v("entry.kind"), "ancestry"),
          traitMatch,
          v("entry.kind"),
          true,
          and(lte(v("option.level", 1), v("entry.level", 1)), isIn(lookup(v("entry.traits"), 0, ""), v("option.traits", "")), isIn(lookup(v("entry.traits"), 1, ""), v("option.traits", ""))),
        ),
        level,
        type: ifs(v("entry.kind"), v("entry.kind"), "bonus"),
      }),
      { ...skillIncrease(level), when: at("skillIncrease") },
      boostChoice("boosts", cat("Level ", level, ": four attribute boosts"), 4, {
        when: isIn(level, list([5, 10, 15, 20])),
        help: "Four different attributes; at +4 or more a boost is partial, and two make +1.",
      }),
      {
        ...anySkill("int-skill", 1),
        label: "Intelligence went up: one more trained skill",
        when: v("vars.intUp"),
      },
      languageChoice("int-language", "Intelligence went up: one more language", ifs(v("vars.intUp"), 1, 0), v("data.languages")),
    ],
  };
}

/**
 * One group of choices per level in `levels` (a list of level numbers): a
 * single option, picked by itself, whose grants and sub-choices are the
 * level's. The level is the builder variable `level` inside, so the rules
 * are written once for every level.
 */
function levelsChoice(levels: Rule, archetypes: Rule): Sub {
  const content = levelContent(v("vars.level", 1), archetypes);
  return {
    id: "lv",
    label: cat("Level ", v("entry")),
    each: levels,
    source: { options: [{ id: "go", name: "This level", summary: "Its feats, skill increase, boosts and class features.", original: true }] },
    sourceLabel: cat("level ", v("entry")),
    grants: [{ path: "$level", value: v("entry"), hidden: true }, ...content.grants],
    subChoices: content.subChoices,
  };
}

// ---------------------------------------------------------------------------
// The builder
// ---------------------------------------------------------------------------

export interface BuilderInput {
  lists: ReferenceList[];
}

/** Language names the module's ancestries speak or may learn (the languages the builder offers beyond an ancestry's own). */
function languageNames(lists: ReferenceList[]): string[] {
  const ancestries = lists.find((l) => l.id === LIST.ancestries);
  if (!ancestries) throw new Error("builder: no ancestries list");
  const out = new Set<string>();
  for (const a of ancestries.items) {
    const b = (a.builder ?? {}) as { languages?: string[]; additionalLanguages?: string[] };
    for (const l of [...(b.languages ?? []), ...(b.additionalLanguages ?? [])]) out.add(l);
  }
  return [...out].sort();
}

export function characterBuilder(input: BuilderInput): CharacterBuilderDef {
  const L = v("choices.level.value", 1);
  const C = (k: string, d?: unknown) => v(`choices.class.item.builder.${k}`, d);
  const A = (k: string, d?: unknown) => v(`choices.ancestry.item.builder.${k}`, d);
  for (const l of [...Object.values(FEATS), ...SHOP_LISTS, LIST.classFeatures, LIST.actions, LIST.ancestryFeatures]) if (!input.lists.some((x) => x.id === l)) throw new Error(`builder: no list ${l}`);

  const ancestryStep: Step = {
    kind: "choice",
    id: "ancestry",
    title: "Ancestry",
    intro: "Hit Points, size, speed, senses, languages and traits; a heritage; ancestry boosts and flaws.",
    cite: cite("Player Core", "Ancestries"),
    guide: [
      "Your ancestry feat comes at the Level 1 step, after your class and skills are known.",
      "The alternative ancestry boosts (two free boosts and no flaw) suit an ancestry whose fixed boosts do not fit the character.",
    ],
    noun: "ancestry",
    columns: ["hp", "size", "speed", "boosts", "flaws"],
    source: { list: LIST.ancestries },
    grants: [
      { path: "ancestry", value: v("item.id") },
      { path: "size", value: v("item.builder.size"), when: v("item.builder.size") },
      { path: "speed", value: v("item.builder.speed"), when: v("item.builder.speed") },
      { path: "senses", op: "append", value: v("item.builder.vision"), when: v("item.builder.vision") },
      { path: "traits", op: "append", value: v("item.builder.traits", []) },
      { path: "languages", op: "append", value: v("item.builder.languages", []) },
      { path: "features", op: "append", each: { list: LIST.ancestryFeatures, where: isIn(v("entry.name"), v("item.builder.features", [])) }, object: { name: v("entry.name"), desc: v("entry.description", "") } },
    ],
    subChoices: [
      {
        id: "heritage",
        label: "Heritage",
        help: "Your ancestry's heritages, or a versatile heritage open to any ancestry.",
        noun: "heritage",
        source: { list: LIST.heritages, where: or(eq(v("option.builder.ancestry", ""), v("item.builder.trait")), v("option.builder.versatile")) },
        columns: ["ancestry"],
        grants: [
          { path: "heritage", value: v("item.name") },
          { path: "features", op: "append", object: { name: v("item.name"), desc: v("item.description", "") }, hidden: true },
          { path: "traits", op: "append", value: v("item.builder.traits", []) },
          { path: "senses", op: "append", value: v("item.builder.senses", []) },
          { path: "size", value: v("item.builder.size"), when: v("item.builder.size") },
          { path: "speed", value: v("item.builder.speed"), when: v("item.builder.speed") },
          { path: "languages", op: "append", value: v("item.builder.languages", []) },
          // a heritage with its own ancestry Hit Points (the sheet adds the difference as bonus Hit Points)
          { path: "hpBonus", op: "add", value: sub(v("item.builder.ancestryHp", 0), A("hp", 0)), when: v("item.builder.ancestryHp"), label: cat("Ancestry Hit Points ", v("item.builder.ancestryHp"), " (", v("item.name"), ")") },
          ...rankGrants(v("item.builder.ranks", [])),
          bonusFeats(v("item.builder.feats", []), 1, "bonus"),
          { path: "features", op: "append", each: v("item.builder.grants", []), object: { name: v("entry"), desc: cat("Granted by ", v("item.name"), ".") } },
        ],
        subChoices: [...rankChoices("skill", v("item.builder.rankChoices", []), 1), anySkill("any-skill", v("item.builder.anySkill", 0))],
      },
      {
        id: "boosts",
        label: "Ancestry boosts",
        source: {
          options: [
            { id: "standard", name: "The ancestry's boosts and flaws", summary: "Its fixed boosts and flaws, and its free boost.", cite: cite("Player Core", "Ancestries", "Attribute Boosts") },
            { id: "alternate", name: "Two free boosts", summary: "Instead of the fixed boosts and flaws: two free boosts to different attributes.", cite: cite("Player Core", "Ancestries", "Alternative Ancestry Boosts") },
          ],
        },
        grants: [
          { path: cat("attributes.", v("entry")), op: "add", value: 1, each: A("boosts", []), when: eq(v("item.id"), "standard"), label: cat("+1 ", attrName(v("entry"))) },
          { path: cat("attributes.", v("entry")), op: "add", value: -1, each: A("flaws", []), when: eq(v("item.id"), "standard"), label: cat("−1 ", attrName(v("entry")), " (flaw)") },
        ],
        subChoices: [
          boostChoice("free", ifs(eq(v("item.id"), "standard"), "Free boosts", "Two free boosts"), ifs(eq(v("item.id"), "standard"), A("freeBoosts", 1), 2), {
            available: or(eq(v("choices.ancestry.sub.boosts.id"), "alternate"), not(isIn(v("option.id"), A("boosts", [])))),
            availableText: "The ancestry already boosts it.",
          }),
        ],
      },
    ],
  };

  const backgroundStep: Step = {
    kind: "choice",
    id: "background",
    title: "Background",
    intro: "Two attribute boosts, trained skills and Lore, and a skill feat.",
    cite: cite("Player Core", "Backgrounds"),
    noun: "background",
    columns: ["boosts", "skills", "feat"],
    source: { list: LIST.backgrounds },
    grants: [
      { path: "background", value: v("item.name") },
      ...rankGrants(v("item.builder.ranks", [])),
      { path: "$extraSkills", op: "add", value: 1, each: v("item.builder.skills", []), when: gte(rankAt(v("entry")), 1), hidden: true },
      { path: v("entry"), op: "max", value: 1, each: v("item.builder.skills", []), label: cat(lookup(v("data.rankNames"), v("entry"), v("entry")), " trained") },
      ...loreGrants(lookup(v("item.builder.lore", []), 0, "")),
      ...loreGrants(lookup(v("item.builder.lore", []), 1, "")),
      bonusFeats(v("item.builder.feats", []), 1, "skill"),
      { path: "features", op: "append", each: v("item.builder.grants", []), object: { name: v("entry"), desc: cat("Granted by ", v("item.name"), ".") } },
    ],
    subChoices: [
      boostChoice("boost", "Boost (one of the two)", 1, { when: v("item.builder.boosts"), source: { values: v("item.builder.boosts"), list: LIST.attributes } }),
      boostChoice("free", "Free boost", v("item.builder.freeBoosts", 1), {
        available: not(isIn(v("option.id"), v("choices.background.sub.boost.ids", []))),
        availableText: "The background already boosts it.",
      }),
      ...rankChoices("skill", v("item.builder.rankChoices", []), 1),
      anySkill("any-skill", v("item.builder.anySkill", 0)),
    ],
  };

  const classStep: Step = {
    kind: "choice",
    id: "class",
    title: "Class",
    intro: "Key attribute, Hit Points, initial proficiencies, trained skills and 1st-level features with their choices.",
    cite: cite("Player Core", "Classes"),
    guide: ["Skills you choose come at the Skills step, once your Intelligence is known.", "Class and ancestry feats come at the Level 1 step."],
    noun: "class",
    columns: ["hp", "keyAttribute", "perception", "spellcasting"],
    source: { list: LIST.classes },
    grants: [
      { path: "class", value: v("item.id") },
      ...rankGrants(v("item.builder.ranks", [])),
      { path: "$extraSkills", op: "add", value: 1, each: v("item.builder.skills", []), when: gte(rankAt(v("entry")), 1), hidden: true },
      { path: v("entry"), op: "max", value: 1, each: v("item.builder.skills", []), label: cat(lookup(v("data.rankNames"), v("entry"), v("entry")), " trained") },
      ...loreGrants(lookup(v("item.builder.lore", []), 0, "")),
      ...loreGrants(lookup(v("item.builder.lore", []), 1, "")),
      { path: "keyAttribute", value: lookup(v("item.builder.key", []), 0, ""), when: eq(count(v("item.builder.key", [])), 1) },
      ...boostGrants(lookup(v("item.builder.key", []), 0, "")).map((g) => ({ ...g, when: and(eq(count(v("item.builder.key", [])), 1), g.when ?? true) })),
      { path: "spellcasting.tradition", value: v("item.builder.spell.tradition"), when: v("item.builder.spell.tradition") },
      { path: "spellcasting.kind", value: v("item.builder.spell.kind"), when: v("item.builder.spell.kind") },
      ...featureGrant(v("item.builder.levels.0.f", [])),
      { path: "features", op: "append", each: v("item.builder.levels.0.n", []), object: { name: v("entry"), desc: "" } },
      ...rankGrants(v("item.builder.levels.0.r", [])),
      bonusFeats(v("item.builder.levels.0.ft", []), 1, "bonus"),
      ...loreGrants(lookup(v("item.builder.levels.0.lore", []), 0, "")),
      { path: "features", op: "append", object: { name: "Other weapon proficiency", desc: v("item.builder.otherAttacks") }, when: v("item.builder.otherAttacks") },
    ],
    subChoices: [
      {
        id: "key",
        label: "Key attribute",
        help: "Your class offers two; the one you pick gets the class's boost.",
        when: gt(count(v("item.builder.key", [])), 1),
        source: { values: v("item.builder.key"), list: LIST.attributes },
        grants: [{ path: "keyAttribute", value: v("item.id"), label: cat("Key attribute ", v("item.name")) }, ...boostGrants(v("item.id"))],
      },
      ...rankChoices("skill", v("item.builder.rankChoices", []), 1),
      ...rankChoices("feature", v("item.builder.levels.0.c", []), 1),
      selectionChoice(v("item.builder.levels.0.s", []), 1),
    ],
  };

  const boostsStep: Step = {
    kind: "choice",
    id: "boosts",
    title: "Attribute boosts",
    intro: "Four free boosts to four different attributes, after ancestry, background and class.",
    cite: cite("Player Core", "Attributes", "Attribute Boosts"),
    guide: [
      "The remaster writes attribute modifiers, not scores: every boost adds 1.",
      "No source boosts one attribute twice, so a 1st-level modifier is at most +4.",
      "Your class's key attribute should usually be your highest.",
    ],
    summary: cat(...ATTRIBUTES.flatMap((a, i) => [i ? " · " : "", a.abbr, " ", signedText(v(`fields.attributes.${a.id}`, 0))])),
    source: { list: LIST.attributes },
    min: 4,
    max: 4,
    grants: boostGrants(v("item.id")),
  };

  const extraSkills = add(C("additionalSkills", 0), max(0, v("fields.attributes.intelligence", 0)), v("vars.extraSkills", 0));
  const languageCount = add(max(0, v("fields.attributes.intelligence", 0)), A("languageCount", 0), v("choices.ancestry.sub.heritage.item.builder.languageCount", 0));
  const skillsStep: Step = {
    kind: "choice",
    id: "skills",
    title: "Skills and languages",
    intro: "Your class's trained skills (plus your Intelligence modifier), and your extra languages.",
    cite: cite("Player Core", "Classes", "Initial Proficiencies"),
    guide: ["A skill your background and class both train counts once: you pick another instead (the count includes it)."],
    summary: cat(extraSkills, " skills, ", languageCount, " languages"),
    subChoices: [
      {
        id: "class",
        label: cat("Trained skills: ", extraSkills),
        help: cat(C("additionalSkills", 0), " from your class, ", max(0, v("fields.attributes.intelligence", 0)), " from Intelligence", ifs(v("vars.extraSkills"), cat(", ", v("vars.extraSkills"), " for skills trained twice"), "")),
        source: { values: SKILL_IDS, list: LIST.skills },
        min: extraSkills,
        max: extraSkills,
        available: lt(rankAt(cat("skills.", v("option.id"))), 1),
        availableText: "Already trained.",
        sourceLabel: cat("class ", v("choices.class.item.name", "")),
        grants: [{ path: cat("skills.", v("item.id")), op: "max", value: 1, label: cat(v("item.name"), " trained") }],
      },
      languageChoice("languages", cat("Languages: ", languageCount), languageCount, merge(A("additionalLanguages", []), v("data.languages"))),
    ],
  };

  const levelStep: Step = {
    kind: "choice",
    id: "level",
    title: "Starting level",
    intro: "Level 1 to 20: the steps after this one walk through each level's feats, skill increases, boosts and class features.",
    cite: cite("GM Core", "Treasure", "Character Wealth"),
    source: { range: { min: 1, max: 20, label: "Level" } },
    grants: [{ path: "level", value: v("item.value") }],
    subChoices: [
      {
        id: "archetypes",
        label: "Archetype feats",
        help: "Class feat slots can take archetype feats (dedications first); the builder does not check the archetype rules.",
        source: { options: [{ id: "yes", name: "Offer archetype feats in class feat slots", cite: cite("Player Core", "Archetypes") }] },
        min: 0,
        max: 1,
      },
    ],
  };
  const archetypesCreate = eq(v("choices.level.sub.archetypes.id", ""), "yes");

  const levelsStep: Step = {
    kind: "choice",
    id: "levels",
    title: "Level by level",
    intro: "Each level up to your starting level: ancestry and class feats, skill and general feats, skill increases, four boosts at 5th, 10th, 15th and 20th, and the class features gained.",
    cite: cite("Player Core", "Leveling Up"),
    guide: [
      "Feats whose prerequisites the builder can read (skill ranks, attributes, other feats) are offered only when met; others ask the GM to confirm.",
      "Skill increases go up to expert, master from 7th level and legendary from 15th.",
    ],
    summary: cat("Levels 1 to ", L),
    subChoices: [levelsChoice(lookup(v("data.levels"), sub(L, 1), list([1])), archetypesCreate)],
  };

  const budget = mul(100, lookup(v("data.wealth"), cat(sub(L, 1), ".", ifs(eq(v("choices.equipment.id", "currency"), "lump"), "lump", "currency")), 15));
  const left = sub(v("vars.budget", 1500), v("vars.spent", 0));
  const equipmentStep: Step = {
    kind: "choice",
    id: "equipment",
    title: "Equipment",
    intro: "Starting money for your level, and an optional shopping list from the equipment lists.",
    cite: cite("GM Core", "Treasure", "Character Wealth"),
    guide: [
      "At 1st level you have 15 gp. Above it, GM Core gives currency plus permanent items of set levels, or one lump sum.",
      "Picked armor and shields go on the sheet (AC follows); weapons become Strikes rows whose attack bonus you write in.",
    ],
    summary: cat(floor({ "/": [left, 100] }), " gp left"),
    source: {
      options: [
        { id: "currency", name: "Currency and permanent items", summary: "The table's currency; the permanent items it lists are chosen with the GM.", cite: cite("GM Core", "Treasure", "Character Wealth") },
        { id: "lump", name: "Lump sum", summary: "All of it as money to spend.", cite: cite("GM Core", "Treasure", "Character Wealth") },
      ],
    },
    grants: [{ path: "$budget", value: budget, hidden: true }],
    subChoices: [
      {
        id: "shop",
        label: "Shopping list",
        help: cat("Items of your level or lower; ", floor({ "/": [v("vars.budget", 0), 100] }), " gp to spend."),
        source: { lists: list(SHOP_LISTS), where: and(lte(v("option.level", 0), L), v("option.builder")) },
        min: 0,
        max: 40,
        columns: ["price", "level", "bulk"],
        sourceLabel: "starting equipment",
        grants: [
          { path: "$spent", op: "add", value: v("item.builder.cp", 0), hidden: true },
          { path: "inventory", op: "append", object: { name: v("item.name"), quantity: v("item.builder.per", 1), bulk: v("item.builder.bulk", 0) }, label: cat(v("item.name"), " (", v("item.price", ""), ")") },
          { path: "armor.name", value: v("item.name"), when: v("item.builder.armor"), hidden: true },
          { path: "armor.category", value: v("item.builder.armor.category"), when: v("item.builder.armor"), label: cat("Armor: ", v("item.name")) },
          { path: "armor.acBonus", value: v("item.builder.armor.acBonus", 0), when: v("item.builder.armor"), hidden: true },
          { path: "armor.dexCap", value: v("item.builder.armor.dexCap"), when: and(v("item.builder.armor"), ne(v("item.builder.armor.dexCap", "none"), "none")), hidden: true },
          { path: "armor.strength", value: v("item.builder.armor.strength"), when: v("item.builder.armor.strength"), hidden: true },
          { path: "armor.checkPenalty", value: v("item.builder.armor.checkPenalty"), when: v("item.builder.armor.checkPenalty"), hidden: true },
          { path: "armor.speedPenalty", value: v("item.builder.armor.speedPenalty"), when: v("item.builder.armor.speedPenalty"), hidden: true },
          { path: "shield.name", value: v("item.name"), when: v("item.builder.shield"), label: cat("Shield: ", v("item.name")) },
          { path: "shield.acBonus", value: v("item.builder.shield.acBonus", 0), when: v("item.builder.shield"), hidden: true },
          { path: "shield.hardness", value: v("item.builder.shield.hardness", 0), when: v("item.builder.shield"), hidden: true },
          { path: "shield.hp", value: v("item.builder.shield.hp", 0), when: v("item.builder.shield"), hidden: true },
          { path: "shield.maxHp", value: v("item.builder.shield.hp", 0), when: v("item.builder.shield"), hidden: true },
          { path: "strikes", op: "append", object: { name: v("item.name"), damage: v("item.damage", ""), traits: v("item.traits", ""), type: v("item.builder.strike") }, when: v("item.builder.strike"), label: cat("Strike: ", v("item.name")) },
        ],
        validate: [{ rule: lte(v("vars.spent", 0), v("vars.budget", 0)), message: cat("Over budget by ", floor({ "/": [sub(v("vars.spent", 0), v("vars.budget", 0)), 100] }), " gp or more.") }],
      },
    ],
  };

  const detailsStep: Step = {
    kind: "fields",
    id: "details",
    title: "Details",
    intro: "Name, deity (written in freely), age, pronouns, looks and personality.",
    original: true,
    fields: [
      { path: "core.name", label: "Name", required: true },
      { path: "player", label: "Player" },
      { path: "deity", label: "Deity", help: "Any deity or philosophy your GM's setting has; the module suggests none." },
      { path: "age", label: "Age" },
      { path: "pronouns", label: "Pronouns" },
      { path: "appearance", label: "Appearance", widget: "textarea" },
      { path: "personality", label: "Personality", widget: "textarea" },
      { path: "backstory", label: "Backstory", widget: "textarea" },
    ],
  };

  const levelTodo = (upTo: Rule): Rule => merge(...Array.from({ length: 20 }, (_, k) => ifs(gte(upTo, k + 1), C(`levels.${k}.todo`, []), list([]))));
  const todo = (upTo: Rule): Rule => ({
    merge: [
      { map: [levelTodo(upTo), cat(v(""), ": make its choices by hand (the builder adds its text only).")] },
      ifs(lookup(v("data.classNotes"), v("fields.class", ""), ""), list([lookup(v("data.classNotes"), v("fields.class", ""), "")]), list([])),
      ifs(gt(v("fields.spellcasting.rank", 0), 0), lit(["Spells: choose your cantrips and spells (and spell slots or repertoire) from the spell lists by hand; the builder sets your spellcasting proficiency, tradition and attribute."]), list([])),
      ifs(and(gt(v("fields.spellcasting.rank", 0), 0), not(v("fields.spellcasting.tradition"))), lit(["Spellcasting tradition: set it on the sheet (your class choice decides it)."]), list([])),
      ifs(gt(count(v("fields.strikes", [])), 0), lit(["Strikes: write in each weapon's attack bonus and any damage bonus."]), list([])),
      ifs(gt(count(v("fields.feats", [])), 0), lit(["Feats: the builder applies the skills, senses, Lore, Hit Points per level and feats they give; check each feat's text for the rest."]), list([])),
      ifs(find(v("fields.feats", []), "type", "archetype"), lit(["Archetype feats: check the dedication rules (two other feats of an archetype before another dedication)."]), list([])),
      ifs(A("more"), list([cat(v("choices.ancestry.item.name", ""), ": make its other choices by hand (size, form and so on).")]), list([])),
      ifs(v("choices.ancestry.sub.heritage.item.builder.more"), list([cat(v("choices.ancestry.sub.heritage.item.name", ""), ": make its other choices by hand.")]), list([])),
      ifs(v("choices.background.item.builder.more"), list([cat(v("choices.background.item.name", ""), ": make its other choices by hand.")]), list([])),
      ifs(and(eq(v("choices.equipment.id", ""), "currency"), gt(L, 1)), list([cat("Permanent items for level ", L, ": ", lookup(v("data.wealth"), cat(sub(L, 1), ".items"), ""), ", chosen with the GM.")]), list([])),
      ifs(and(v("fields.skills.lore-a"), not(v("fields.loreTopics.first"))), lit(["Lore: name your first Lore skill on the sheet."]), list([])),
      ifs(and(v("fields.skills.lore-b"), not(v("fields.loreTopics.second"))), lit(["Lore: name your second Lore skill on the sheet."]), list([])),
      ifs(and(v("choices.ancestry.item"), not(A("trait"))), list([cat(v("choices.ancestry.item.name", ""), ": the module has no structured data for it; apply its boosts, Hit Points and languages by hand.")]), list([])),
      ifs(and(v("choices.class.item"), not(C("ranks"))), list([cat(v("choices.class.item.name", ""), ": the module has no structured data for this class; apply its proficiencies and features by hand.")]), list([])),
    ],
  });

  const reviewStep: Step = { kind: "review", id: "review", title: "Review", intro: "The sheet as it will be saved, where every number came from, and what is left to do by hand.", todo: todo(L) };

  // spellcasting attribute: the key attribute, or the class's own (champion, magus)
  const spellAttribute = ifs(lookup(v("data.spellAttribute"), v("fields.class", ""), ""), lookup(v("data.spellAttribute"), v("fields.class", ""), ""), v("fields.keyAttribute", "strength"));

  // --- level up -------------------------------------------------------------------
  const NL = add(v("base.level", 1), 1);
  const luClass: Step = {
    kind: "choice",
    id: "class",
    title: "Class",
    intro: "The level is added in your class.",
    cite: cite("Player Core", "Leveling Up"),
    noun: "a level in",
    source: { list: LIST.classes, where: eq(v("option.id"), v("base.class", "")) },
    grants: [
      { path: "$oldHp", value: v("computed.hpMax", 0), hidden: true },
      { path: "level", value: NL, label: cat("Level ", NL) },
    ],
    subChoices: [
      {
        id: "archetypes",
        label: "Archetype feats",
        help: "Class feat slots can take archetype feats; the builder does not check the archetype rules.",
        source: { options: [{ id: "yes", name: "Offer archetype feats in class feat slots", cite: cite("Player Core", "Archetypes") }] },
        min: 0,
        max: 1,
      },
    ],
  };
  const luLevel: Step = {
    kind: "choice",
    id: "new-level",
    title: "New level",
    intro: "The class features, feats, skill increase and boosts the new level brings. Hit Points follow from the sheet.",
    cite: cite("Player Core", "Leveling Up"),
    summary: cat("Level ", NL),
    subChoices: [levelsChoice(list([NL]), eq(v("choices.class.sub.archetypes.id", ""), "yes"))],
  };

  const signed = (a: string) => signedText(v(`fields.attributes.${a}`, 0));
  return {
    id: id("builder"),
    entityType: CHARACTER,
    name: "Build a character",
    description: "Ancestry, heritage, background, class, attribute boosts, skills and languages, starting level with every level's feats, skill increases and boosts, equipment and details, each grant traced to its source.",
    cite: cite("Player Core", "Character Creation"),
    defaults: { isPC: true, coins: { cp: 0, sp: 0, gp: 0, pp: 0 } },
    data: {
      rankNames: RANK_NAMES,
      rankWords: RANK_WORDS,
      attrNames: Object.fromEntries(ATTRIBUTES.map((a) => [a.id, a.name])),
      wealth: WEALTH,
      levels: Array.from({ length: 20 }, (_, i) => Array.from({ length: i + 1 }, (_, k) => k + 1)),
      languages: languageNames(input.lists),
      spellAttribute: SPELL_ATTRIBUTE,
      classNotes: CLASS_NOTES,
    },
    steps: [ancestryStep, backgroundStep, classStep, boostsStep, skillsStep, levelStep, levelsStep, equipmentStep, detailsStep, reviewStep],
    finally: [
      { path: "spellcasting.attribute", value: spellAttribute, when: gt(v("fields.spellcasting.rank", 0), 0), label: cat("Spellcasting attribute ", attrName(spellAttribute)) },
      { path: "coins.gp", value: floor({ "/": [left, 100] }), when: v("choices.equipment.item"), label: cat("Money left: ", floor({ "/": [left, 100] }), " gp ", mod(floor({ "/": [left, 10] }), 10), " sp ", mod(left, 10), " cp") },
      { path: "coins.sp", value: mod(floor({ "/": [left, 10] }), 10), when: v("choices.equipment.item"), hidden: true },
      { path: "coins.cp", value: mod(left, 10), when: v("choices.equipment.item"), hidden: true },
      { path: "hp.current", value: v("computed.hpMax", 1), hidden: true },
      { path: "core.summary", value: cat(ifs(v("fields.heritage"), v("fields.heritage"), v("choices.ancestry.item.name", "")), " ", v("choices.class.item.name", ""), " ", v("fields.level", 1)), when: v("choices.class.item"), hidden: true },
    ],
    preview: [
      { label: "Attributes", value: cat(...ATTRIBUTES.flatMap((a, i) => [i ? " · " : "", a.abbr, " ", signed(a.id)])) },
      { label: "Partial boosts", value: v("fields.partialBoosts", []) },
      { label: "Hit Points", value: v("computed.hpMax") },
      { label: "Armor Class", value: v("computed.ac") },
      { label: "Perception", value: signedText(v("computed.perceptionTotal", 0)) },
      { label: "Saves", value: cat("Fort ", signedText(v("computed.fortitudeTotal", 0)), " · Ref ", signedText(v("computed.reflexTotal", 0)), " · Will ", signedText(v("computed.willTotal", 0))) },
      { label: "Class DC", value: v("computed.classDc") },
      { label: "Spell DC", value: v("computed.spellDc", "") },
      { label: "Speed", value: cat(v("fields.speed", 25), " feet") },
      { label: "Languages", value: v("fields.languages", []) },
      { label: "Feats", value: { map: [v("fields.feats", []), v("name")] } },
    ],
    levelUp: {
      title: "Level up",
      when: and(lt(v("fields.level", 1), 20), v("fields.class")),
      whenText: "Already level 20, or no class on the sheet.",
      steps: [luClass, luLevel, { kind: "review", id: "review", title: "Review", intro: "What the new level adds, and what is left to do by hand.", todo: todo(NL) }],
      finally: [
        { path: "hp.current", op: "add", value: sub(v("computed.hpMax", 0), v("vars.oldHp", 0)), when: gt(sub(v("computed.hpMax", 0), v("vars.oldHp", 0)), 0), label: cat("+", sub(v("computed.hpMax", 0), v("vars.oldHp", 0)), " Hit Points") },
        { path: "core.summary", value: cat(v("fields.heritage", ""), " ", v("choices.class.item.name", ""), " ", v("fields.level", 1)), when: and(v("choices.class.item"), v("fields.heritage")), hidden: true },
      ],
    },
  };
}
