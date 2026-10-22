/**
 * Entity types: the player character, the creature stat block (Monster Core
 * presets), the hazard stat block (GM Core presets), a roleplay NPC, and the
 * campaign types (location, faction, item, encounter, quest). Every derived
 * number (check totals by proficiency rank, class DC, AC, Hit Point maximum,
 * spell DC and attack, Bulk, the encounter's XP budget) is `computed`
 * JSONLogic, never stored (rule 4).
 */
import type { EntityTypeDef, JsonSchema, SheetField, SheetSection } from "@campaign-forge/module-sdk";
import { ANCESTRIES, ATTRIBUTES, CHARACTER, CLASSES, CREATURE, ENCOUNTER, FACTION, HAZARD, ITEM, LIST, LOCATION, LORE_SLOTS, NPC, QUEST, RANKS, rule, SAVES, SKILLS, totalName, TRADITIONS } from "../ids.ts";
import { add, floor, gt, ifs, lookup, max, min, proficiency, signedText, sub, v, type Rule } from "./logic.ts";

const int = (minV?: number, maxV?: number, def?: number): JsonSchema => ({ type: "integer", ...(minV !== undefined ? { minimum: minV } : {}), ...(maxV !== undefined ? { maximum: maxV } : {}), ...(def !== undefined ? { default: def } : {}) });
const text = (maxLength?: number): JsonSchema => ({ type: "string", ...(maxLength ? { maxLength } : {}) });
const longText: JsonSchema = { type: "string", maxLength: 40000 };
const tags: JsonSchema = { type: "array", items: { type: "string" }, default: [] };
const entryList: JsonSchema = { type: "array", items: { type: "object", properties: { name: { type: "string" }, desc: longText }, required: ["name"] }, default: [] };
const select = (path: string, label: string, values: string[]): SheetField => ({ path, label, widget: "select", options: values });

/** The checks a character rolls: Perception, saves, the sixteen skills and two Lore skills. */
const CHECKS = [...SAVES, ...SKILLS, ...LORE_SLOTS];
const rankSchema = int(0, 4, 0);
const rankLevels = RANKS.map((r) => ({ value: r.value, label: r.label }));
/** The valued conditions tracked as numbers on a sheet (the rest are listed by name). */
export const VALUED_CONDITIONS = ["frightened", "sickened", "clumsy", "drained", "enfeebled", "stupefied", "slowed", "stunned"] as const;
const conditionsSchema: JsonSchema = {
  type: "object",
  description: "Valued conditions; the GM applies their penalties to rolls.",
  properties: Object.fromEntries(VALUED_CONDITIONS.map((c) => [c, int(0, 10, 0)])),
  additionalProperties: false,
  default: Object.fromEntries(VALUED_CONDITIONS.map((c) => [c, 0])),
};
const attributesSchema = (minV: number, maxV: number): JsonSchema => ({
  type: "object",
  properties: Object.fromEntries(ATTRIBUTES.map((a) => [a.id, { ...int(minV, maxV, 0), title: a.name }])),
  required: ATTRIBUTES.map((a) => a.id),
  additionalProperties: false,
});
const attributeFields = (): SheetField[] => ATTRIBUTES.map((a): SheetField => ({ path: `attributes.${a.id}`, label: a.name, widget: "attribute", rule: rule("advice.attributes") }));

// ---------------------------------------------------------------------------
// Player character
// ---------------------------------------------------------------------------

/** Hit Points by ancestry or class id; a supplement's ids ("<supplement id>.<item id>") nest under the supplement id, which is how `lookup` reads a dotted path. */
export type HpTable = Record<string, number | Record<string, number>>;

export function characterType(ancestryHp: HpTable, classHp: HpTable): EntityTypeDef {
  for (const a of ANCESTRIES) if (!(a in ancestryHp)) throw new Error(`ancestry ${a} missing from the ancestry list`);
  for (const c of CLASSES) if (!(c in classHp)) throw new Error(`class ${c} missing from the class list`);
  const level = v("fields.level", 1);
  const attr = (a: string): Rule => v(`fields.attributes.${a}`, 0);
  const prof = (rankPath: string): Rule => proficiency(v(rankPath, 0), level);

  const totals: Record<string, Rule> = {};
  for (const s of SAVES) totals[totalName(s.id)] = add(attr(s.attribute), prof(`fields.saves.${s.id}`), v(`fields.bonuses.${s.id}`, 0));
  for (const s of [...SKILLS, ...LORE_SLOTS]) totals[totalName(s.id)] = add(attr(s.attribute), prof(`fields.skills.${s.id}`), v(`fields.bonuses.${s.id}`, 0));

  const keyAttr: Rule = v({ cat: ["fields.attributes.", v("fields.keyAttribute", "strength")] } as unknown as string, 0);
  const spellAttr: Rule = v({ cat: ["fields.attributes.", v("fields.spellcasting.attribute", "charisma")] } as unknown as string, 0);
  const armorRank: Rule = v({ cat: ["fields.defenses.", v("fields.armor.category", "unarmored")] } as unknown as string, 0);
  const inventoryBulk: Rule = { sum: [{ map: [v("fields.inventory", []), { "*": [{ var: ["quantity", 1] }, { var: ["bulk", 0] }] }] }] };

  const computed: Record<string, Rule> = {
    ...totals,
    // Hit Points: ancestry HP + (class HP + Constitution) per level, plus any flat bonus (Toughness and the like).
    ancestryHp: lookup(ancestryHp, v("fields.ancestry", ""), 0),
    classHp: lookup(classHp, v("fields.class", ""), 0),
    hpMax: max(1, add(v("computed.ancestryHp", 0), { "*": [add(v("computed.classHp", 0), attr("constitution")), level] }, v("fields.hpBonus", 0))),
    classDc: add(10, keyAttr, prof("fields.classDcRank")),
    // AC: 10 + Dexterity (up to the armor's cap) + proficiency in the worn armor's category + the armor's item bonus and potency.
    armorRank,
    ac: add(10, min(attr("dexterity"), v("fields.armor.dexCap", 99)), proficiency(v("computed.armorRank", 0), level), v("fields.armor.acBonus", 0), v("fields.armor.potency", 0), v("fields.bonuses.ac", 0)),
    acShieldRaised: add(v("computed.ac", 10), v("fields.shield.acBonus", 0)),
    spellDc: ifs(gt(v("fields.spellcasting.rank", 0), 0), add(10, spellAttr, prof("fields.spellcasting.rank")), null),
    spellAttack: ifs(gt(v("fields.spellcasting.rank", 0), 0), signedText(add(spellAttr, prof("fields.spellcasting.rank"))), null),
    totalBulk: floor(add(inventoryBulk, 0.001)),
    encumberedAt: add(5, attr("strength")),
    maxBulk: add(10, attr("strength")),
    bulkStatus: ifs(gt(v("computed.totalBulk", 0), v("computed.maxBulk", 10)), "over the maximum: cannot carry more", gt(v("computed.totalBulk", 0), v("computed.encumberedAt", 5)), "encumbered", "unencumbered"),
    dyingMax: max(1, sub(4, v("fields.doomed", 0))),
    recoveryDc: add(10, v("fields.dying", 0)),
    initiative: v({ cat: ["computed.", v("fields.initiativeSkill", "perception"), "Total"] } as unknown as string, 0),
    xpToLevel: max(0, sub(1000, v("fields.xp", 0))),
  };

  const checkProps = (list: ReadonlyArray<{ id: string }>): JsonSchema => ({ type: "object", properties: Object.fromEntries(list.map((s) => [s.id, rankSchema])), additionalProperties: false, default: {} });
  const slots: JsonSchema = {
    type: "object",
    properties: Object.fromEntries(Array.from({ length: 10 }, (_, i) => [`r${i + 1}`, { type: "object", title: `Rank ${i + 1}`, properties: { max: int(0, 9, 0), used: int(0, 9, 0) }, additionalProperties: false }])),
    additionalProperties: false,
    default: {},
  };
  const schema: JsonSchema = {
    type: "object",
    properties: {
      isPC: { type: "boolean", default: true },
      player: text(120),
      ancestry: { type: "string", maxLength: 120, description: `An ancestry id from the Ancestries list (${ANCESTRIES.join(", ")}, or one a supplement adds).` },
      heritage: text(120),
      background: text(120),
      class: { type: "string", maxLength: 120, description: `A class id from the Classes list (${CLASSES.join(", ")}, or one a supplement adds).` },
      subclass: { ...text(120), description: "Class choice: a doctrine, instinct, muse, racket, mystery, school and so on." },
      level: int(1, 20, 1),
      xp: int(0, 999, 0),
      keyAttribute: { type: "string", enum: ATTRIBUTES.map((a) => a.id), default: "strength" },
      attributes: attributesSchema(-5, 7),
      saves: checkProps(SAVES),
      skills: checkProps([...SKILLS, ...LORE_SLOTS]),
      loreTopics: { type: "object", properties: { first: text(80), second: text(80) }, additionalProperties: false, default: {} },
      bonuses: {
        type: "object",
        description: "Item, status and circumstance bonuses (or penalties) per check, on top of attribute and proficiency.",
        properties: Object.fromEntries([...CHECKS.map((s) => [s.id, { ...int(-20, 20), title: s.name }]), ["ac", { ...int(-20, 20), title: "AC" }]]),
        additionalProperties: false,
        default: {},
      },
      classDcRank: { ...int(0, 4, 1), title: "Class DC proficiency" },
      defenses: { type: "object", properties: { unarmored: rankSchema, light: rankSchema, medium: rankSchema, heavy: rankSchema }, additionalProperties: false, default: { unarmored: 1, light: 0, medium: 0, heavy: 0 } },
      attacks: { type: "object", properties: { simple: rankSchema, martial: rankSchema, advanced: rankSchema, unarmed: rankSchema }, additionalProperties: false, default: { simple: 1, martial: 0, advanced: 0, unarmed: 1 } },
      armor: {
        type: "object",
        properties: {
          name: text(80),
          category: { type: "string", enum: ["unarmored", "light", "medium", "heavy"], default: "unarmored" },
          acBonus: int(0, 10, 0),
          dexCap: { ...int(0, 10), description: "Leave empty when the armor has no Dexterity cap." },
          strength: int(-5, 7),
          checkPenalty: int(-5, 0),
          speedPenalty: int(-20, 0),
          potency: int(0, 3, 0),
        },
        additionalProperties: false,
        default: { category: "unarmored", acBonus: 0, potency: 0 },
      },
      shield: { type: "object", properties: { name: text(80), acBonus: int(0, 5, 0), hardness: int(0, 50, 0), hp: int(0, 200, 0), maxHp: int(0, 200, 0) }, additionalProperties: false, default: {} },
      hp: { type: "object", properties: { current: int(0, 1000, 10), temp: int(0, 500, 0) }, required: ["current"], additionalProperties: false, default: { current: 10, temp: 0 } },
      hpBonus: { ...int(0, 200, 0), description: "Extra maximum Hit Points from feats and the like (e.g. Toughness)." },
      speed: int(0, 200, 25),
      heroPoints: int(0, 3, 1),
      dying: int(0, 4, 0),
      wounded: int(0, 3, 0),
      doomed: int(0, 3, 0),
      conditions: conditionsSchema,
      otherConditions: { type: "array", items: { type: "object" }, default: [] },
      initiativeSkill: { type: "string", enum: ["perception", ...SKILLS.map((s) => s.id)], default: "perception" },
      focus: { type: "object", properties: { current: int(0, 3, 0), max: int(0, 3, 0) }, additionalProperties: false, default: { current: 0, max: 0 } },
      spellcasting: {
        type: "object",
        properties: {
          tradition: { type: "string", enum: [...TRADITIONS] },
          kind: { type: "string", enum: ["prepared", "spontaneous"] },
          attribute: { type: "string", enum: ATTRIBUTES.map((a) => a.id) },
          rank: { ...rankSchema, title: "Spell proficiency" },
        },
        additionalProperties: false,
        default: { rank: 0 },
      },
      slots,
      spells: { ...tags, description: "Spells known or prepared (names from the spell lists)." },
      strikes: {
        type: "array",
        items: {
          type: "object",
          properties: { name: text(80), bonus: text(30), damage: text(80), traits: text(200), type: { type: "string", enum: ["melee", "ranged"], description: "Melee (the default) or ranged." } },
          required: ["name"],
        },
        default: [],
      },
      feats: {
        type: "array",
        items: { type: "object", properties: { level: int(1, 20, 1), type: { type: "string", enum: ["ancestry", "class", "general", "skill", "archetype", "bonus"] }, name: text(120) }, required: ["name"] },
        default: [],
      },
      features: entryList,
      languages: tags,
      inventory: {
        type: "array",
        items: { type: "object", properties: { name: text(120), quantity: int(0, 9999, 1), bulk: { type: "number", minimum: 0, maximum: 50, description: "Light is 0.1." }, invested: { type: "boolean" }, notes: text(200) }, required: ["name"] },
        default: [],
      },
      coins: { type: "object", properties: { cp: int(0), sp: int(0), gp: int(0), pp: int(0) }, additionalProperties: false, default: { cp: 0, sp: 0, gp: 15, pp: 0 } },
      appearance: text(4000),
      personality: text(4000),
      backstory: longText,
      notes: longText,
    },
    required: ["attributes", "level", "hp"],
    additionalProperties: false,
  };

  const savesWidget: SheetField = {
    path: "saves.*",
    label: "Perception and saving throws",
    widget: "skills",
    rule: rule("advice.proficiency"),
    config: { ref: LIST.saves, attributesPath: "attributes", levels: rankLevels, labels: { skill: "Check", attribute: "Attribute", attributeValue: "Mod", value: "Proficiency", pool: "Roll" } },
  };
  const skillsWidget: SheetField = {
    path: "skills.*",
    label: "Skills",
    widget: "skills",
    rule: rule("advice.proficiency"),
    config: {
      skills: [...SKILLS, ...LORE_SLOTS].map((s) => ({ id: s.id, name: s.name, attribute: s.attribute })),
      attributesPath: "attributes",
      levels: rankLevels,
      labels: { skill: "Skill", attribute: "Attribute", attributeValue: "Mod", value: "Proficiency", pool: "Roll" },
    },
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
            { path: "ancestry", label: "Ancestry", widget: "select", options: { ref: LIST.ancestries } },
            { path: "heritage", label: "Heritage", widget: "text" },
            { path: "background", label: "Background", widget: "text" },
            { path: "class", label: "Class", widget: "select", options: { ref: LIST.classes } },
            { path: "subclass", label: "Class choice", widget: "text" },
            { path: "level", label: "Level", widget: "number" },
            { path: "keyAttribute", label: "Key attribute", widget: "select", options: { ref: LIST.attributes } },
            { path: "xp", label: "Experience points", widget: "number" },
            { path: "xpToLevel", label: "XP to next level", widget: "computed" },
            { path: "player", label: "Player", widget: "text" },
            { path: "isPC", label: "Player character", widget: "checkbox" },
          ],
        },
        { id: "attributes", title: "Attribute modifiers", columns: 6, fields: attributeFields() },
        {
          id: "defense",
          title: "Defense and health",
          columns: 4,
          fields: [
            { path: "ac", label: "Armor Class", widget: "computed", rule: rule("advice.armor-class") },
            { path: "acShieldRaised", label: "AC with shield raised", widget: "computed", rule: rule("action.raise-a-shield") },
            { path: "hpMax", label: "Hit Point maximum", widget: "computed", rule: rule("advice.hit-points") },
            { path: "hp.current", label: "Hit Points", widget: "number" },
            { path: "hp.temp", label: "Temporary Hit Points", widget: "number" },
            { path: "hpBonus", label: "Bonus max HP", widget: "number" },
            { path: "speed", label: "Speed (feet)", widget: "number" },
            { path: "heroPoints", label: "Hero Points", widget: "number", rule: rule("advice.hero-points") },
            { path: "classDc", label: "Class DC", widget: "computed" },
            { path: "classDcRank", label: "Class DC proficiency (0–4)", widget: "number" },
            { path: "initiative", label: "Initiative", widget: "computed" },
            select("initiativeSkill", "Initiative uses", ["perception", ...SKILLS.map((s) => s.id)]),
          ],
        },
        { id: "saves", title: "Perception and saving throws", fields: [savesWidget] },
        { id: "skills", title: "Skills", fields: [skillsWidget, { path: "loreTopics", label: "Lore topics", widget: "object" }] },
        {
          id: "armor",
          title: "Armor, shield and proficiencies",
          collapsed: true,
          columns: 2,
          fields: [
            { path: "armor", label: "Armor", widget: "object" },
            { path: "shield", label: "Shield", widget: "object" },
            { path: "defenses", label: "Armor proficiency (0 untrained ... 4 legendary)", widget: "object" },
            { path: "attacks", label: "Weapon proficiency (0 untrained ... 4 legendary)", widget: "object" },
          ],
        },
        { id: "strikes", title: "Strikes", fields: [{ path: "strikes", label: "Strikes", widget: "table", config: { columns: ["name", { key: "bonus", label: "Attack" }, "damage", "traits", { key: "type", label: "Melee or ranged" }] } }] },
        {
          id: "conditions",
          title: "Conditions and dying",
          columns: 4,
          fields: [
            { path: "dying", label: "Dying", widget: "number", rule: rule("condition.dying") },
            { path: "wounded", label: "Wounded", widget: "number", rule: rule("condition.wounded") },
            { path: "doomed", label: "Doomed", widget: "number", rule: rule("condition.doomed") },
            { path: "recoveryDc", label: "Recovery check DC", widget: "computed" },
            ...VALUED_CONDITIONS.map((c): SheetField => ({ path: `conditions.${c}`, label: c.charAt(0).toUpperCase() + c.slice(1), widget: "number", rule: rule(`condition.${c}`) })),
            { path: "otherConditions", label: "Other conditions", widget: "conditions", span: 12 },
          ],
        },
        { id: "feats", title: "Feats and features", fields: [{ path: "feats", label: "Feats by level", widget: "table", config: { columns: ["level", "type", "name"] } }, { path: "features", label: "Class and ancestry features", widget: "entries" }, { path: "languages", label: "Languages", widget: "tags" }] },
        {
          id: "spellcasting",
          title: "Spellcasting",
          columns: 4,
          fields: [
            { path: "spellcasting", label: "Spellcasting", widget: "object", span: 6 },
            { path: "spellDc", label: "Spell DC", widget: "computed" },
            { path: "spellAttack", label: "Spell attack", widget: "computed" },
            { path: "focus.current", label: "Focus Points", widget: "number" },
            { path: "focus.max", label: "Focus Point maximum", widget: "number" },
            { path: "slots", label: "Spell slots per day (max and used)", widget: "object", span: 12 },
            { path: "spells", label: "Spells", widget: "tags", span: 12 },
          ],
        },
        {
          id: "inventory",
          title: "Inventory",
          fields: [
            { path: "inventory", label: "Inventory", widget: "table", config: { columns: ["name", "quantity", { key: "bulk", label: "Bulk (L = 0.1)" }, "invested", "notes"] } },
            { path: "totalBulk", label: "Bulk carried", widget: "computed", rule: rule("advice.bulk") },
            { path: "encumberedAt", label: "Encumbered above", widget: "computed" },
            { path: "maxBulk", label: "Maximum Bulk", widget: "computed" },
            { path: "bulkStatus", label: "Load", widget: "computed" },
            { path: "coins", label: "Coins", widget: "object" },
          ],
        },
        {
          id: "story",
          title: "Personality and story",
          collapsed: true,
          fields: [
            { path: "appearance", label: "Appearance", widget: "textarea" },
            { path: "personality", label: "Personality", widget: "textarea" },
            { path: "backstory", label: "Backstory", widget: "textarea" },
          ],
        },
        { id: "bonuses", title: "Other bonuses and penalties", collapsed: true, fields: [{ path: "bonuses", label: "Flat bonuses by check (and AC)", widget: "object" }] },
        { id: "notes", title: "GM notes", collapsed: true, fields: [{ path: "notes", label: "Notes", widget: "textarea" }] },
      ],
      summary: ["class", "level", "ac", "hp.current", "perceptionTotal"],
    },
    defaultVisibility: { notes: "gm" },
    playerEditable: ["hp.current", "hp.temp", "heroPoints", "focus.current", "slots", "inventory", "coins", "notes"],
  };
}

// ---------------------------------------------------------------------------
// Creature stat block (Monster Core presets)
// ---------------------------------------------------------------------------

const SIZES = ["Tiny", "Small", "Medium", "Large", "Huge", "Gargantuan"];
const damagePart: JsonSchema = { type: "object", properties: { dice: text(40), type: text(40), persistent: { type: "boolean" } }, required: ["dice"], additionalProperties: false };
const strikeTable: JsonSchema = {
  type: "array",
  items: {
    type: "object",
    properties: {
      name: text(120),
      type: { type: "string", enum: ["melee", "ranged"] },
      bonus: text(40),
      traits: text(400),
      damage: text(400),
      attack: { ...int(-20, 80), description: "Attack modifier, as the combat panel rolls it." },
      damageParts: { type: "array", items: damagePart, description: "Damage dice and types, as the combat panel rolls them." },
    },
    required: ["name"],
  },
  default: [],
};
/** Immunities, weaknesses and resistances as the combat panel applies them (the text lists stay for reading). */
export const damageModifiersSchema: JsonSchema = {
  type: "array",
  description: "Immunities (to damage types), weaknesses and resistances by damage type, group (physical, all) or material and trait (cold-iron, holy), with exceptions.",
  items: {
    type: "object",
    properties: { kind: { type: "string", enum: ["immunity", "weakness", "resistance"] }, type: text(60), value: int(0, 100), except: tags, note: text(200) },
    required: ["kind", "type"],
    additionalProperties: false,
  },
  default: [],
};
const combatDataSection = (strikes: boolean): SheetSection => ({
  id: "combat",
  title: "Combat panel data",
  collapsed: true,
  fields: [
    ...(strikes ? [{ path: "strikes", label: "Strikes (numbers)", widget: "table" as const, config: { columns: ["name", { key: "attack", label: "Attack" }, { key: "damageParts", label: "Damage", readonly: true }] } }] : []),
    { path: "damageModifiers", label: "Damage modifiers", widget: "table", config: { columns: ["kind", "type", "value", { key: "except", readonly: true }, "note"] } },
    { path: "conditionImmunities", label: "Condition immunities", widget: "tags" },
  ],
});

export function creatureType(): EntityTypeDef {
  const computed: Record<string, Rule> = {
    // Stat blocks write their totals down; the dice engine reads them as the whole modifier.
    statBlock: true,
    initiative: v("fields.saves.perception", 0),
    hpLeft: max(0, v("fields.hp.current", 0)),
  };
  const schema: JsonSchema = {
    type: "object",
    properties: {
      level: int(-1, 30, 0),
      rarity: { type: "string", enum: ["common", "uncommon", "rare", "unique"], default: "common" },
      size: { type: "string", enum: SIZES, default: "Medium" },
      traits: tags,
      saves: { type: "object", properties: Object.fromEntries(SAVES.map((s) => [s.id, int(-10, 60, 0)])), additionalProperties: false, default: { perception: 0, fortitude: 0, reflex: 0, will: 0 } },
      senses: text(600),
      languages: text(600),
      skills: { type: "object", properties: Object.fromEntries(SKILLS.map((s) => [s.id, int(-10, 60, 0)])), additionalProperties: false, default: {} },
      lore: text(400),
      attributes: attributesSchema(-5, 15),
      items: text(1000),
      ac: int(0, 70, 10),
      acNote: text(200),
      saveNote: text(400),
      hp: { type: "object", properties: { max: int(0, 2000, 10), current: int(0, 2000, 10), temp: int(0, 500, 0) }, required: ["max", "current"], additionalProperties: false },
      hpNote: text(400),
      hardness: int(0, 50),
      immunities: tags,
      weaknesses: tags,
      resistances: tags,
      damageModifiers: damageModifiersSchema,
      conditionImmunities: tags,
      speed: text(300),
      strikes: strikeTable,
      abilities: entryList,
      defenses: entryList,
      actions: entryList,
      spells: entryList,
      focusPoints: int(0, 3),
      conditions: conditionsSchema,
      description: longText,
      notes: longText,
    },
    required: ["attributes", "hp"],
    additionalProperties: false,
  };
  return {
    id: CREATURE,
    kind: "creature",
    name: "Creature",
    plural: "Creatures",
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
            { path: "level", label: "Level", widget: "number" },
            select("rarity", "Rarity", ["common", "uncommon", "rare", "unique"]),
            select("size", "Size", SIZES),
            { path: "traits", label: "Traits", widget: "tags" },
            { path: "senses", label: "Senses", widget: "text", span: 6 },
            { path: "languages", label: "Languages", widget: "text", span: 6 },
            { path: "ac", label: "AC", widget: "number" },
            { path: "acNote", label: "AC note", widget: "text" },
            { path: "hp.max", label: "HP", widget: "number" },
            { path: "hp.current", label: "Current HP", widget: "number" },
            { path: "hp.temp", label: "Temporary HP", widget: "number" },
            { path: "hpNote", label: "HP note", widget: "text" },
            { path: "hardness", label: "Hardness", widget: "number" },
            { path: "speed", label: "Speed", widget: "text", span: 6 },
            { path: "saveNote", label: "Save note", widget: "text", span: 6 },
            { path: "immunities", label: "Immunities", widget: "tags" },
            { path: "weaknesses", label: "Weaknesses", widget: "tags" },
            { path: "resistances", label: "Resistances", widget: "tags" },
          ],
        },
        {
          id: "saves",
          title: "Perception and saves",
          fields: [
            {
              path: "saves.*",
              label: "Perception and saves",
              widget: "skills",
              config: { skills: SAVES.map((s) => ({ id: s.id, name: s.name })), min: -10, max: 60, labels: { skill: "Check", attribute: "—", attributeValue: "—", value: "Modifier", pool: "Roll" } },
            },
          ],
        },
        {
          id: "skills",
          title: "Skills",
          fields: [
            {
              path: "skills.*",
              label: "Skills",
              widget: "skills",
              config: { skills: SKILLS.map((s) => ({ id: s.id, name: s.name })), min: -10, max: 60, hideZero: true, labels: { skill: "Skill", attribute: "—", attributeValue: "—", value: "Modifier", pool: "Roll" } },
            },
            { path: "lore", label: "Lore", widget: "text" },
          ],
        },
        { id: "attributes", title: "Attribute modifiers", columns: 6, fields: ATTRIBUTES.map((a): SheetField => ({ path: `attributes.${a.id}`, label: a.abbr, widget: "number" })) },
        { id: "items", title: "Items", fields: [{ path: "items", label: "Items", widget: "text" }] },
        { id: "abilities", title: "Abilities", fields: [{ path: "abilities", label: "Senses and interaction", widget: "entries" }, { path: "defenses", label: "Defensive abilities and reactions", widget: "entries" }] },
        {
          id: "offense",
          title: "Strikes, actions and spells",
          fields: [
            { path: "strikes", label: "Strikes", widget: "table", rule: rule("action.strike"), config: { columns: ["name", "type", { key: "bonus", label: "Attack [MAP]" }, "traits", "damage"] } },
            { path: "actions", label: "Actions", widget: "entries" },
            { path: "spells", label: "Spellcasting", widget: "entries" },
            { path: "focusPoints", label: "Focus Points", widget: "number" },
          ],
        },
        { id: "conditions", title: "Conditions", collapsed: true, columns: 4, fields: VALUED_CONDITIONS.map((c): SheetField => ({ path: `conditions.${c}`, label: c.charAt(0).toUpperCase() + c.slice(1), widget: "number" })) },
        combatDataSection(true),
        { id: "description", title: "Description", collapsed: true, fields: [{ path: "description", label: "Description", widget: "textarea" }] },
        { id: "notes", title: "GM notes", collapsed: true, fields: [{ path: "notes", label: "Notes", widget: "textarea" }] },
      ],
      summary: ["level", "ac", "hp.current", "saves.perception"],
    },
    defaultVisibility: { notes: "gm", description: "gm" },
  };
}

// ---------------------------------------------------------------------------
// Hazard stat block (GM Core presets)
// ---------------------------------------------------------------------------

export function hazardType(): EntityTypeDef {
  return {
    id: HAZARD,
    kind: "creature",
    name: "Hazard",
    plural: "Hazards",
    icon: "pin",
    schema: {
      type: "object",
      properties: {
        level: int(-1, 30, 0),
        complexity: { type: "string", enum: ["simple", "complex"], default: "simple" },
        rarity: { type: "string", enum: ["common", "uncommon", "rare", "unique"], default: "common" },
        traits: tags,
        stealth: { ...int(-10, 60, 0), description: "Stealth modifier (the DC is 10 higher)." },
        stealthNote: text(400),
        description: longText,
        disable: longText,
        ac: int(0, 70, 10),
        saves: { type: "object", properties: { fortitude: int(-10, 60, 0), reflex: int(-10, 60, 0), will: int(-10, 60, 0) }, additionalProperties: false, default: {} },
        hardness: int(0, 100, 0),
        hp: { type: "object", properties: { max: int(0, 2000, 0), current: int(0, 2000, 0), temp: int(0, 500, 0) }, required: ["max", "current"], additionalProperties: false, default: { max: 0, current: 0, temp: 0 } },
        hpNote: text(400),
        immunities: tags,
        weaknesses: tags,
        resistances: tags,
        damageModifiers: damageModifiersSchema,
        conditionImmunities: tags,
        actions: entryList,
        routine: longText,
        reset: longText,
        notes: longText,
      },
      additionalProperties: false,
    },
    computed: {
      statBlock: true,
      stealthDc: add(10, v("fields.stealth", 0)),
      brokenThreshold: floor({ "/": [v("fields.hp.max", 0), 2] }),
      // Complex hazards roll initiative with their Stealth.
      initiative: v("fields.stealth", 0),
    },
    sheet: {
      sections: [
        {
          id: "hazard",
          title: "Hazard",
          columns: 4,
          fields: [
            { path: "level", label: "Level", widget: "number" },
            select("complexity", "Complexity", ["simple", "complex"]),
            select("rarity", "Rarity", ["common", "uncommon", "rare", "unique"]),
            { path: "traits", label: "Traits", widget: "tags" },
            { path: "stealth", label: "Stealth modifier", widget: "number" },
            { path: "stealthDc", label: "Stealth DC", widget: "computed" },
            { path: "stealthNote", label: "Stealth note", widget: "text", span: 6 },
            { path: "description", label: "Description", widget: "textarea", span: 12 },
            { path: "disable", label: "Disable", widget: "textarea", span: 12 },
            { path: "ac", label: "AC", widget: "number" },
            { path: "hardness", label: "Hardness", widget: "number" },
            { path: "hp.max", label: "HP", widget: "number" },
            { path: "hp.current", label: "Current HP", widget: "number" },
            { path: "brokenThreshold", label: "Broken Threshold", widget: "computed" },
            { path: "immunities", label: "Immunities", widget: "tags" },
            { path: "weaknesses", label: "Weaknesses", widget: "tags" },
            { path: "resistances", label: "Resistances", widget: "tags" },
          ],
        },
        {
          id: "saves",
          title: "Saves",
          fields: [{ path: "saves.*", label: "Saves", widget: "skills", config: { skills: SAVES.filter((s) => s.id !== "perception").map((s) => ({ id: s.id, name: s.name })), min: -10, max: 60, labels: { skill: "Save", attribute: "—", attributeValue: "—", value: "Modifier", pool: "Roll" } } }],
        },
        { id: "actions", title: "Actions and routine", fields: [{ path: "actions", label: "Actions", widget: "entries" }, { path: "routine", label: "Routine", widget: "textarea" }, { path: "reset", label: "Reset", widget: "textarea" }] },
        combatDataSection(false),
        { id: "notes", title: "GM notes", collapsed: true, fields: [{ path: "notes", label: "Notes", widget: "textarea" }] },
      ],
      summary: ["level", "complexity", "stealthDc", "hp.current"],
    },
    defaultVisibility: { notes: "gm", disable: "gm", stealthNote: "gm" },
  };
}

// ---------------------------------------------------------------------------
// Roleplay NPC and campaign types
// ---------------------------------------------------------------------------

export const ATTITUDES = ["hostile", "unfriendly", "indifferent", "friendly", "helpful"];
export const ENVIRONMENTS = ["aquatic", "arctic", "desert", "forest", "mountain", "plains", "swamp", "underground", "urban", "planar"];

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
        ancestry: text(80),
        attitude: { type: "string", enum: ATTITUDES, default: "indifferent" },
        appearance: text(2000),
        quirk: text(400),
        voice: text(400),
        motivation: text(400),
        secret: text(400),
        statBlock: { type: "string", maxLength: 120, description: "The creature stat block to use if it comes to a fight." },
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
            { path: "ancestry", label: "Ancestry", widget: "text" },
            { ...select("attitude", "Attitude toward the party", ATTITUDES), rule: rule("condition.indifferent") },
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
        level: { ...int(0, 25), description: "Settlement level, or the level of the threats here." },
        size: { type: "string", enum: ["hamlet", "village", "town", "city", "metropolis"] },
        population: text(120),
        government: text(200),
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
              columns: 4,
              fields: [select("size", "Size", ["hamlet", "village", "town", "city", "metropolis"]), { path: "level", label: "Level", widget: "number" }, { path: "population", label: "Population", widget: "text" }, { path: "government", label: "Who is in charge", widget: "text" }],
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
        level: int(0, 30, 0),
        rarity: { type: "string", enum: ["common", "uncommon", "rare", "unique"], default: "common" },
        category: text(80),
        traits: tags,
        price: text(80),
        bulk: { type: "number", minimum: 0, maximum: 50, description: "Light is 0.1." },
        usage: text(120),
        invested: { type: "boolean", default: false },
        heldBy: text(120),
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
            { path: "level", label: "Item level", widget: "number" },
            select("rarity", "Rarity", ["common", "uncommon", "rare", "unique"]),
            { path: "category", label: "Category", widget: "text" },
            { path: "traits", label: "Traits", widget: "tags", span: 12 },
            { path: "price", label: "Price", widget: "text" },
            { path: "bulk", label: "Bulk (L = 0.1)", widget: "number" },
            { path: "usage", label: "Usage", widget: "text" },
            { path: "invested", label: "Invested", widget: "checkbox" },
            { path: "heldBy", label: "Carried by", widget: "text" },
            { path: "description", label: "Description", widget: "textarea", span: 12 },
          ],
        },
        { id: "notes", title: "GM notes", collapsed: true, fields: [{ path: "notes", label: "Notes", widget: "textarea" }] },
      ],
      summary: ["level", "price"],
    },
    defaultVisibility: { notes: "gm" },
  };
}

/** XP budgets by threat (GM Core, Building Encounters) and the adjustment per character beyond four. */
export const THREAT_BUDGETS: Record<string, { budget: number; perCharacter: number }> = {
  trivial: { budget: 40, perCharacter: 10 },
  low: { budget: 60, perCharacter: 20 },
  moderate: { budget: 80, perCharacter: 20 },
  severe: { budget: 120, perCharacter: 30 },
  extreme: { budget: 160, perCharacter: 40 },
};
/** XP for one creature by its level relative to the party's (GM Core, Building Encounters). */
export const CREATURE_XP: Record<string, number> = { "-4": 10, "-3": 15, "-2": 20, "-1": 30, "0": 40, "1": 60, "2": 80, "3": 120, "4": 160 };

export function encounterType(): EntityTypeDef {
  const threat = v("fields.threat", "moderate");
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
        partySize: int(1, 10, 4),
        threat: { type: "string", enum: Object.keys(THREAT_BUDGETS), default: "moderate" },
        creatures: text(2000),
        xpTotal: int(0, 10000, 0),
        activity: text(400),
        twist: text(400),
        tactics: text(2000),
        treasure: text(2000),
        status: { type: "string", enum: ["planned", "running", "done", "skipped"], default: "planned" },
        notes: longText,
      },
      additionalProperties: false,
    },
    computed: {
      xpBudget: add(lookup(Object.fromEntries(Object.entries(THREAT_BUDGETS).map(([k, b]) => [k, b.budget])), threat, 80), { "*": [sub(v("fields.partySize", 4), 4), lookup(Object.fromEntries(Object.entries(THREAT_BUDGETS).map(([k, b]) => [k, b.perCharacter])), threat, 20)] }),
      xpLeft: sub(v("computed.xpBudget", 80), v("fields.xpTotal", 0)),
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
            { path: "partySize", label: "Party size", widget: "number" },
            { ...select("threat", "Threat", Object.keys(THREAT_BUDGETS)), rule: rule("advice.encounter-budget") },
            { path: "xpBudget", label: "XP budget", widget: "computed" },
            { path: "xpTotal", label: "XP spent", widget: "number" },
            { path: "xpLeft", label: "XP left in the budget", widget: "computed" },
            select("status", "Status", ["planned", "running", "done", "skipped"]),
            { path: "creatures", label: "Creatures", widget: "textarea", span: 12 },
            { path: "activity", label: "What they are doing", widget: "text", span: 6 },
            { path: "twist", label: "Twist", widget: "text", span: 6 },
            { path: "tactics", label: "Tactics", widget: "textarea", span: 12 },
            { path: "treasure", label: "Treasure", widget: "textarea", span: 12 },
          ],
        },
        { id: "notes", title: "GM notes", collapsed: true, fields: [{ path: "notes", label: "Notes", widget: "textarea" }] },
      ],
      summary: ["threat", "creatures", "status"],
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

