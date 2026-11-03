import {
  OWNER_VISIBILITY,
  weaponRowFrom,
  type EntityPreset,
  type EntityTypeDef,
  type GearCatalogConfig,
  type JsonLogicRule,
  type SheetField,
  type SheetSection,
  type WeaponAttackConfig,
  type WeaponListConfig,
} from "@campaign-forge/module-sdk";
import { CAMPAIGN, CINEMATIC } from "../modes";
import { OVERWHELMED_TRAUMA } from "../reference/mentalTraumas";
import {
  ATTRIBUTE_IDS,
  CAREER_IDS,
  CAREER_LABELS,
  labelledEnum,
  RANGE_IDS,
  RANGE_LABELS,
  SKILL_BINDINGS,
  SKILL_IDS,
  checkbox,
  enumField,
  intField,
  number,
  objectSchema,
  list,
  select,
  stringArray,
  stringField,
  text,
  textarea,
} from "./common";
import { DAMAGE_TYPES } from "./item";
import { ALLEGIANCE_TEXT, CAMPAIGN_ALLEGIANCES, FRICTION_KIND_LABEL, FRICTION_KINDS, TENSION_CAP } from "../procedures/campaign-agenda-data";

/** Talent ids the computed rules look for (reference/talents.ts, p. 51). */
export const HARDENED_TALENT = "hardened";
export const SEEN_IT_ALL_TALENT = "seen-it-all";
export const PACK_MULE_TALENT = "pack-mule";
/** Hardened and Seen It All can each be taken up to three times (p. 51). */
export const TALENT_STACK_CAP = 3;
/** Attribute caps (p. 25): humans 5 (2-4 at creation, 5 only in the key attribute); androids 8 in the key attribute, 7 in another. */
export const HUMAN_ATTRIBUTE_MAX = 5;
export const ANDROID_ATTRIBUTE_MAX = 8;
export const SKILL_MAX = 5;

/**
 * Campaign mode: the long-term personal agenda the campaign agenda generator
 * deals and moves on after each job (procedures/campaign-agendas.ts). Its goal
 * summary is kept equal to `personalAgenda`. GM-only; the open friction lines
 * also go to the players as a handout. Nothing here is computed: the tension
 * is raised by a stall and lowered by the GM, never derived.
 */
const campaignAgendaSchema = {
  type: "object",
  description: "Campaign mode: a long-term goal, this job's beat, the beats before it, the tension (0-3) and the open friction lines (p. 27, 30, 158-159).",
  properties: {
    goal: {
      type: "object",
      required: ["id", "title", "text"],
      properties: {
        id: { type: "string" },
        title: { type: "string" },
        text: { type: "string" },
        allegiance: { type: "string", ...labelledEnum(CAMPAIGN_ALLEGIANCES, Object.fromEntries(CAMPAIGN_ALLEGIANCES.map((a) => [a, ALLEGIANCE_TEXT[a].label]))) },
        answersTo: { type: "string" },
        motive: { type: "string" },
        why: { type: "string" },
        since: { type: "string" },
      },
    },
    beat: { type: "object", required: ["text"], properties: { n: { type: "integer", minimum: 0 }, text: { type: "string" }, job: { type: "string" } } },
    status: { type: "string", ...labelledEnum(["new", "advanced", "stalled"]) },
    tension: { type: "integer", minimum: 0, maximum: TENSION_CAP },
    history: {
      type: "array",
      items: {
        type: "object",
        required: ["text", "outcome"],
        properties: { goal: { type: "string" }, n: { type: "integer" }, job: { type: "string" }, text: { type: "string" }, outcome: { type: "string", ...labelledEnum(["advanced", "stalled", "resolved"]) } },
      },
    },
    past: { type: "array", items: { type: "object", required: ["id", "title"], properties: { id: { type: "string" }, title: { type: "string" }, text: { type: "string" }, job: { type: "string" } } } },
    secret: { type: "object", properties: { id: { type: "string" }, text: { type: "string" }, topic: { type: "string" } } },
    friction: {
      type: "array",
      items: {
        type: "object",
        required: ["kind", "text"],
        properties: {
          key: { type: "string" },
          kind: { type: "string", ...labelledEnum(FRICTION_KINDS, FRICTION_KIND_LABEL) },
          tpl: { type: "string" },
          with: { type: "array", items: { type: "string" } },
          outsider: { type: "string" },
          text: { type: "string" },
        },
      },
    },
  },
};

const attributeProps = (max: number) =>
  Object.fromEntries(ATTRIBUTE_IDS.map((a) => [a, { type: "integer", minimum: 1, maximum: max }]));

const conditionList = (description: string) => ({
  type: "array",
  default: [],
  description,
  items: {
    type: "object",
    required: ["id", "label"],
    properties: {
      id: { type: "string" },
      label: { type: "string" },
      page: { type: ["integer", "array"] },
    },
  },
});

/**
 * Weapon stats a row copies from an `alien.item` weapon preset or entity:
 * the same keys and meanings as the item schema (gear tables, p. 82-89).
 */
export const WEAPON_STAT_KEYS = ["bonus", "damage", "damageType", "explosive", "rangeMin", "range", "ammo", "power", "special", "weight"] as const;

/** One weapon a character carries. Stats are copied (not linked), so the sheet works offline and can be edited. */
export const weaponRowSchema = {
  type: "object",
  required: ["name"],
  properties: {
    name: { type: "string", title: "Weapon" },
    presetId: { type: "string", description: "Module preset the stats were copied from (e.g. alien.item.knife)." },
    itemId: { type: "string", description: "Linked alien.item entity id in the campaign." },
    bonus: { ...intField(undefined, undefined, 0, "Modifier: extra dice for CLOSE COMBAT or RANGED COMBAT (p. 82); \"–\" is 0."), title: "Modifier" },
    damage: { ...intField(0, undefined, 1, "Base damage; +1 per extra success (p. 62, 64)."), title: "Damage" },
    damageType: { ...enumField(DAMAGE_TYPES, "normal", "Stun or fire damage (p. 71, 76); normal otherwise."), title: "Damage type" },
    explosive: { type: "boolean", default: false, title: "Explosive", description: "The E after the damage: hits everyone in the target's zone (p. 76)." },
    rangeMin: { ...enumField(RANGE_IDS, "adjacent", "Minimum range: -2 dice per band closer than this (p. 64)."), title: "Min range" },
    range: { ...enumField(RANGE_IDS, "adjacent", "Maximum range band (p. 55, 82)."), title: "Max range" },
    ammo: { type: ["integer", "string"], title: "Ammo", description: "Ammo supply rating, or \"Single-shot\" / \"Single use\" (p. 66)." },
    power: { ...intField(0, undefined, undefined, "Power supply rating of electrical weapons (p. 29)."), title: "Power" },
    special: { ...stringArray("Weapon features as the tables name them, e.g. Armor piercing, Full auto (p. 82)."), title: "Special" },
    weight: { type: "number", minimum: 0, default: 1, title: "Weight", description: "Counts toward encumbrance with the gear: 1 normal, 0.5 light, 0.25, 0 tiny (p. 28, 82)." },
    notes: { type: "string", title: "Notes" },
  },
};

export const characterSchema = objectSchema(
  {
    isPC: { type: "boolean", default: false, description: "Player character (true) or NPC (false)." },
    android: { type: "boolean", default: false, description: "Androids cannot push, have no stress level and never panic (p. 25, 77)." },
    career: { type: "string", ...labelledEnum([...CAREER_IDS, ""], { ...CAREER_LABELS, "": "None" }), default: "", description: "Career id (alien.careers)." },
    attributes: {
      type: "object",
      additionalProperties: false,
      required: [...ATTRIBUTE_IDS],
      properties: attributeProps(ANDROID_ATTRIBUTE_MAX),
      default: { strength: 3, agility: 3, wits: 3, empathy: 3 },
      description: "14 points at creation, 2-4 each, 5 allowed in the career's key attribute; androids add +3 to two (p. 25).",
    },
    skills: {
      type: "object",
      additionalProperties: false,
      properties: Object.fromEntries(SKILL_IDS.map((s) => [s, intField(0, SKILL_MAX, 0)])),
      default: Object.fromEntries(SKILL_IDS.map((s) => [s, 0])),
      description: "Levels 0-5; 10 points at creation, up to 3 in career key skills and 1 elsewhere (p. 26).",
    },
    talents: {
      type: "array",
      default: [],
      items: {
        type: "object",
        required: ["id"],
        properties: { id: { type: "string" }, count: intField(1, undefined, 1, "Stack count for talents that stack.") },
      },
    },
    stress: intField(0, undefined, 0, "Current stress level; one stress die per point (p. 42, 72)."),
    damage: intField(0, undefined, 0, "Damage taken since full Health; Health left is computed, never stored. At zero Health the character is broken (p. 67-68)."),
    personalAgenda: stringField("Campaign mode: chosen, persistent, rewards XP (p. 27)."),
    agendas: {
      type: "array",
      default: [],
      description: "Cinematic mode: one hidden agenda per act (p. 27).",
      items: {
        type: "object",
        required: ["act", "text"],
        properties: { act: intField(1, 3), text: { type: "string" } },
      },
    },
    campaignAgenda: campaignAgendaSchema,
    gear: {
      type: "array",
      default: [],
      items: {
        type: "object",
        required: ["name"],
        properties: {
          name: { type: "string" },
          weight: { type: "number", minimum: 0, default: 1, description: "Regular item = 1, light 1/2 or 1/4, tiny 0, heavy 2+ (p. 28)." },
          qty: { type: "integer", minimum: 0, default: 1 },
          supply: intField(0, undefined, undefined, "Supply rating for consumables, or an item's power supply (p. 28-29)."),
          itemId: { type: "string", description: "Linked alien.item entity id." },
          presetId: { type: "string", description: "Item preset the row was picked from (e.g. alien.item.motion-tracker)." },
        },
      },
    },
    weapons: {
      type: "array",
      default: [],
      description: "Weapons carried, with their stats (p. 82-89); their weight counts toward encumbrance with the gear (p. 28).",
      items: weaponRowSchema,
    },
    signatureItem: stringField("A tiny keepsake of sentimental, not practical, value (p. 28)."),
    cash: { type: "number", minimum: 0, default: 0 },
    storyPoints: intField(0, 3, 0, "Cinematic mode only, max 3; one per act for pursuing the agenda (p. 44, 158)."),
    xp: intField(0, undefined, 0, "Campaign mode experience points (p. 30)."),
    trait: stringField("One-line personality trait (NPCs)."),
    goal: stringField("What this character wants; GM-only by default."),
    appearance: stringField(),
    buddy: stringField("Another PC, by entity id (older campaigns may hold a typed name). A buddy_of relationship counts too (p. 27)."),
    rival: stringField("Another PC, by entity id (older campaigns may hold a typed name). A rival_of relationship counts too (p. 27)."),
    background: stringField("Who the character is and where they come from; for pregenerated PCs, written to fit the plot (p. 157)."),
    // NPC dossier (appearance, trait and goal above are the book's four basics, p. 156).
    role: stringField("Public role or job aboard, e.g. Pilot."),
    voice: stringField("How they talk: pace, accent, favourite words."),
    fears: stringField("What frightens them."),
    secret: stringField("What they hide from the crew."),
    tells: stringField("Concrete habits or reactions that hint at the secret."),
    sampleLines: stringField("A few lines of dialogue in their voice."),
    arc: stringField("Cinematic: how they change across the three acts."),
    // Secret synthetic: an android posing as human (p. 25, 77). `attributes` hold its true scores.
    secretAndroid: { type: "boolean", default: false, description: "An android posing as human (p. 25, 77). Tick Android as well; `attributes` then hold the true scores." },
    coverAttributes: {
      type: "object",
      additionalProperties: false,
      properties: attributeProps(HUMAN_ATTRIBUTE_MAX),
      description: "The human-looking scores a secret android shows and rolls in front of the players (p. 25).",
    },
    fairClues: stringArray("Clues the GM drops that let observant players work out the secret."),
    secretOrders: stringField("What the synthetic has really been told to do."),
    fatigued: { type: "boolean", default: false, description: "Fatigued: no Health recovery, keep rolling Survival (p. 75). Androids are immune." },
    rads: intField(0, undefined, 0, "Accumulated radiation points (p. 77)."),
    criticalInjuries: conditionList("Critical injuries currently suffered (p. 70)."),
    mentalTraumas: conditionList("Mental traumas acquired (p. 74)."),
    lifePath: { type: "object", additionalProperties: true, description: "Provenance of Life Path rolls (p. 282-289)." },
  },
  {
    // Humans cap attributes at 5; androids may reach 8 in the key attribute and 7 in another (p. 25).
    if: { properties: { android: { const: true } }, required: ["android"] },
    then: { properties: { attributes: { properties: attributeProps(ANDROID_ATTRIBUTE_MAX) } } },
    else: { properties: { attributes: { properties: attributeProps(HUMAN_ATTRIBUTE_MAX) } } },
  },
);

/**
 * What a PC's own player always sees in their player packet, even when the
 * GM keeps the field (or the whole character) hidden from the other players
 * (module-sdk `OWNER_VISIBILITY`): the sheet they play from (stats, stress,
 * health, gear, XP, conditions) and their personal agenda, with the campaign
 * agenda's goal, current beat and tension. Not the campaign agenda's secret
 * or history, the per-act cinematic agendas (handed out act by act, see
 * `ownerHandouts`), the android box, the secret synthetic section or the NPC
 * dossier fields.
 */
export const CHARACTER_OWNER_FIELDS = [
  "isPC",
  "career",
  "attributes",
  "skills",
  "talents",
  "stress",
  "damage",
  "fatigued",
  "rads",
  "criticalInjuries",
  "mentalTraumas",
  "gear",
  "weapons",
  "signatureItem",
  "cash",
  "storyPoints",
  "xp",
  "buddy",
  "rival",
  "background",
  "personalAgenda",
  "campaignAgenda.goal",
  "campaignAgenda.beat",
  "campaignAgenda.tension",
] as const;

for (const path of CHARACTER_OWNER_FIELDS) {
  let node = characterSchema as Record<string, unknown>;
  for (const seg of path.split(".")) node = (node.properties as Record<string, Record<string, unknown>>)[seg]!;
  node["x-visibility"] = OWNER_VISIBILITY;
}

/** Stacks of a talent; an entry without a count counts once. */
const talentCount = (talentId: string, cap?: number): JsonLogicRule => {
  const total: JsonLogicRule = {
    sum: [
      {
        map: [
          { filter: [{ var: "fields.talents" }, { "==": [{ var: "id" }, talentId] }] },
          { if: [{ var: "count" }, { var: "count" }, 1] },
        ],
      },
    ],
  };
  return cap === undefined ? total : { min: [total, cap] };
};

/** Entries in fields.mentalTraumas matching a trauma id (bare, or as a `mental-trauma:<id>` condition id). */
const traumaCount = (traumaId: string): JsonLogicRule => ({
  count: [
    {
      filter: [{ var: "fields.mentalTraumas" }, { in: [{ var: "id" }, [traumaId, `mental-trauma:${traumaId}`]] }],
    },
  ],
});

const encumbranceLimit: JsonLogicRule = {
  "*": [{ var: "fields.attributes.strength" }, 2, { if: [{ ">": [talentCount(PACK_MULE_TALENT), 0] }, 2, 1] }],
};

const half = (a: string, b: string): JsonLogicRule => ({
  ceil: [{ "/": [{ "+": [{ var: `fields.attributes.${a}` }, { var: `fields.attributes.${b}` }] }, 2] }],
});

const coverHalf = (a: string, b: string): JsonLogicRule => ({
  ceil: [{ "/": [{ "+": [{ var: [`fields.coverAttributes.${a}`, 0] }, { var: [`fields.coverAttributes.${b}`, 0] }] }, 2] }],
});

/**
 * Derived at render time, never stored (p. 26, 28, 51, 74):
 * maximum Health = ceil((Strength + Agility) / 2) + Hardened (max 3);
 * Resolve = ceil((Wits + Empathy) / 2) + Seen It All (max 3) − 2 per Overwhelmed trauma;
 * encumbrance limit = Strength × 2 regular items (doubled by Pack Mule); over-encumbered up to twice that;
 * encumbrance = gear weight × quantity plus the weapons' weight.
 */
export const characterComputed: Record<string, JsonLogicRule> = {
  hardened: talentCount(HARDENED_TALENT, TALENT_STACK_CAP),
  seenItAll: talentCount(SEEN_IT_ALL_TALENT, TALENT_STACK_CAP),
  health: { "+": [half("strength", "agility"), talentCount(HARDENED_TALENT, TALENT_STACK_CAP)] },
  resolve: {
    max: [
      0,
      { "-": [{ "+": [half("wits", "empathy"), talentCount(SEEN_IT_ALL_TALENT, TALENT_STACK_CAP)] }, { "*": [2, traumaCount(OVERWHELMED_TRAUMA)] }] },
    ],
  },
  encumbranceLimit,
  maxEncumbrance: { "*": [encumbranceLimit, 2] },
  /** Gear rows (weight × quantity) plus weapon rows (weight each). */
  encumbrance: {
    "+": [
      { sum: [{ map: [{ var: "fields.gear" }, { "*": [{ var: "weight" }, { var: "qty" }] }] }] },
      { sum: [{ map: [{ var: "fields.weapons" }, { var: "weight" }] }] },
    ],
  },
  /**
   * Secret androids: the Health shown to players is the larger of the cover and the true
   * Health, so taking damage never gives the android away; Resolve comes from the cover scores.
   */
  coverHealth: { max: [coverHalf("strength", "agility"), half("strength", "agility")] },
  coverResolve: coverHalf("wits", "empathy"),
  /** Health left after the damage taken; zero means broken (p. 68). */
  healthRemaining: { max: [0, { "-": [{ var: "computed.health" }, { var: ["fields.damage", 0] }] }] },
};

/** "A", "S", "M", "L", "E": the gear tables' range letters (p. 82). */
const bandLetter = (key: string): JsonLogicRule => ({
  if: [...RANGE_IDS.flatMap((id) => [{ "==": [{ var: key }, id] }, RANGE_LABELS[id].charAt(0)]), ""],
});

/** Signed modifier as the tables print it: +2, -1, "–" for none. */
const signedBonus: JsonLogicRule = { if: [{ ">": [{ var: "bonus" }, 0] }, { cat: ["+", { var: "bonus" }] }, { "<": [{ var: "bonus" }, 0] }, { var: "bonus" }, "–"] };

const damageText: JsonLogicRule = {
  cat: [
    { var: "damage" },
    { if: [{ var: "explosive" }, "E", ""] },
    { if: [{ "==": [{ var: "damageType" }, "stun"] }, " (stun)", { "==": [{ var: "damageType" }, "fire"] }, " (fire)", ""] },
  ],
};

const rangeText: JsonLogicRule = {
  if: [{ "==": [{ var: "rangeMin" }, { var: "range" }] }, bandLetter("range"), { cat: [bandLetter("rangeMin"), "/", bandLetter("range")] }],
};

const ammoText: JsonLogicRule = { if: [{ var: "ammo" }, { var: "ammo" }, { var: "power" }, { cat: ["Power ", { var: "power" }] }, "–"] };

/**
 * Attacks with a weapon row (p. 62-67): any attack at Adjacent range is
 * rolled with CLOSE COMBAT, firearms included; Short and beyond with RANGED
 * COMBAT. The weapon's modifier adds dice (as gear), and each band closer
 * than its minimum range costs 2 dice. A hit deals the weapon's damage plus
 * 1 per extra success; armor piercing lowers armor one step; stun and fire
 * go to the armor rule as hit sources (combat.ts).
 */
export const WEAPON_ATTACK: WeaponAttackConfig = {
  ranges: RANGE_IDS.map((id) => ({ id, label: RANGE_LABELS[id] })),
  minRangeKey: "rangeMin",
  maxRangeKey: "range",
  skill: { if: [{ "==": [{ var: "range" }, "adjacent"] }, "closeCombat", "rangedCombat"] },
  pool: {
    gear: { var: ["weapon.bonus", 0] },
    modifier: { "*": [-2, { var: "closer" }] },
  },
  damage: { var: ["weapon.damage", 0] },
  extraSuccessesAddDamage: true,
  armorPiercing: { in: ["Armor piercing", { var: ["weapon.special", []] }] },
  source: { if: [{ in: [{ var: "weapon.damageType" }, ["stun", "fire"]] }, { var: "weapon.damageType" }, ""] },
  notes: [
    { when: { ">": [{ var: "closer" }, 0] }, text: "Closer than the weapon's minimum range: −2 dice per band (p. 64)." },
    { when: { var: "weapon.explosive" }, text: "Explosive: a hit also strikes everyone else in the target's zone, who may dodge; a miss hurts no one (p. 76)." },
    { when: { "==": [{ var: "weapon.damageType" }, "stun"] }, text: "Stun: no Health is lost; the target rolls STAMINA at minus the damage or loses its next turn (p. 71)." },
    { when: { "==": [{ var: "weapon.damageType" }, "fire"] }, text: "Fire: armor works as normal; see the weapon's fire effect (p. 76, 86)." },
    { when: { ">": [{ var: "weapon.ammo" }, 0] }, text: "Afterwards, make an ammo supply roll unless an extra success is spent to save ammo (p. 66)." },
  ],
  rules: ["alien.rule.attack-close", "alien.rule.attack-ranged", "alien.rule.damage-armor", "alien.rule.weapons"],
};

/** A price as the gear tables give it: the dollar cost, or the printed text for a range or "Varies". */
const costText: JsonLogicRule = { if: [{ var: "costText" }, { var: "costText" }, { cat: ["$", { var: "cost" }] }] };

/** The Weapons section's list: presets from the gear tables (vehicle-mounted weapons left out), campaign items, or blank rows. */
export const WEAPONS_CONFIG: WeaponListConfig = {
  presets: {
    entityType: "alien.item",
    subtype: "weapon",
    excludeTags: ["weapon:vehicle"],
    groups: [
      { tag: "weapon:ranged", label: "Ranged" },
      { tag: "weapon:melee", label: "Melee" },
      { tag: "weapon:explosive", label: "Explosive" },
    ],
  },
  items: { entityType: "alien.item", subtype: "weapon" },
  copy: [...WEAPON_STAT_KEYS],
  edit: [...WEAPON_STAT_KEYS, "notes"],
  presetKey: "presetId",
  itemKey: "itemId",
  columns: [
    { label: "Mod", display: signedBonus, numeric: true },
    { label: "Damage", display: damageText },
    { label: "Range", display: rangeText },
    { label: "Ammo", display: ammoText },
    { key: "special", label: "Special" },
    { key: "weight", label: "Weight", numeric: true },
    { key: "notes", label: "Notes" },
  ],
  pickerColumns: [
    { label: "Mod", display: signedBonus, numeric: true },
    { label: "Damage", display: damageText },
    { label: "Range", display: rangeText },
    { key: "weight", label: "Weight", numeric: true },
    { label: "Cost", display: costText, numeric: true },
  ],
  weightKey: "weight",
  totalComputed: "encumbrance",
  limitComputed: "encumbranceLimit",
  attack: WEAPON_ATTACK,
};

/** A weapon row copied from an `alien.item` weapon preset (the picker's copy, for builders and demos). */
export function weaponRowFromPreset(preset: EntityPreset): Record<string, unknown> {
  return weaponRowFrom(WEAPONS_CONFIG, preset, { presetId: preset.id });
}

/** Buddy and rival: a pick of the campaign's other PCs (p. 27); a name typed in an older campaign shows until the GM links it. */
const crewmate = (path: "buddy" | "rival", label: string): SheetField => ({
  path,
  label,
  widget: "ref",
  span: 6,
  mode: [CAMPAIGN],
  rule: "alien.rule.buddies-rivals",
  entityTypes: ["alien.character"],
  config: { pick: "select", pc: true },
});

/**
 * The Gear field's "From the gear list…": every portable item preset of
 * chapter 5 (vehicle-mounted weapons, mainframes and fixed installations left out),
 * grouped by the book's gear headings. Weapons go to the Weapons list with
 * their stats; everything else (suits and armor, the motion trackers, tools,
 * medical supplies, drugs, food) becomes a gear row with its weight, its
 * power supply where it has one, and the preset it came from.
 */
export const GEAR_CATALOG: GearCatalogConfig = {
  presets: {
    entityType: "alien.item",
    excludeTags: ["weapon:vehicle", "gear:computer-mainframes"],
    where: { "!=": [{ var: "fields.portable" }, false] },
    groups: [
      { tag: "weapon:ranged", label: "Ranged weapons" },
      { tag: "weapon:melee", label: "Melee weapons" },
      { tag: "weapon:explosive", label: "Explosives" },
      { tag: "gear:suits-armor", label: "Suits and armor" },
      { tag: "gear:vision-devices", label: "Vision devices" },
      { tag: "gear:diagnostics-display", label: "Diagnostics and display" },
      { tag: "gear:tools", label: "Tools" },
      { tag: "gear:medical-supplies", label: "Medical supplies" },
      { tag: "gear:pharmaceuticals", label: "Pharmaceuticals" },
      { tag: "gear:food-drink", label: "Food and drink" },
      { tag: "gear:data-storage", label: "Data storage" },
    ],
  },
  columns: [
    { label: "Cost", display: costText, numeric: true },
    { key: "weight", label: "Weight", numeric: true },
  ],
  copy: { weight: "weight", supply: "power" },
  presetKey: "presetId",
  routes: [{ path: "weapons", subtypes: ["weapon"] }],
  // the gear tables' skill modifiers (e.g. binoculars +2 OBSERVATION, p. 96): a pick on a table-mode skill roll
  skillBonus: { path: "skillBonus", input: "gear" },
};

const sections: SheetSection[] = [
  {
    id: "identity",
    title: "Identity",
    columns: 4,
    fields: [
      checkbox("isPC", "Player character"),
      checkbox("android", "Android", { rule: "alien.rule.androids" }),
      select("career", "Career", { ref: "alien.careers" }, { span: 6, rule: "alien.rule.careers" }),
      crewmate("buddy", "Buddy"),
      crewmate("rival", "Rival"),
      text("signatureItem", "Signature item", { span: 6, rule: "alien.rule.signature-item" }),
      number("cash", "Cash ($)", { rule: "alien.rule.cash" }),
    ],
  },
  {
    id: "attributes",
    title: "Attributes",
    columns: 4,
    fields: ATTRIBUTE_IDS.map((a) => ({
      path: `attributes.${a}`,
      label: a.charAt(0).toUpperCase() + a.slice(1),
      widget: "attribute" as const,
      span: 3,
      rule: "alien.rule.attributes",
      config: { skills: SKILL_BINDINGS.filter((s) => s.attribute === a).map((s) => s.id) },
    })),
  },
  {
    id: "skills",
    title: "Skills",
    fields: [
      {
        path: "skills",
        label: "Skills",
        widget: "skills",
        span: 12,
        rule: "alien.rule.skill-rolls",
        options: { ref: "alien.skills" },
        config: { skills: SKILL_BINDINGS, max: SKILL_MAX, attributesPath: "attributes", stressPath: "stress" },
      },
    ],
  },
  {
    id: "talents",
    title: "Talents",
    fields: [
      {
        path: "talents",
        label: "Talents",
        widget: "talents",
        span: 12,
        rule: "alien.rule.talents",
        options: { ref: "alien.talents" },
        config: { ref: "alien.talents", careerPath: "career", stackable: true },
      },
    ],
  },
  {
    id: "stress",
    title: "Stress & Conditions",
    columns: 4,
    fields: [
      {
        path: "stress",
        label: "Stress",
        widget: "stress",
        span: 6,
        rule: "alien.rule.stress",
        config: { resolve: "computed.resolve", panicOperation: "panicRoll", stressResponseOperation: "stressResponse" },
      },
      { path: "health", label: "Health", widget: "computed", span: 3, readonly: true, rule: "alien.rule.health" },
      { path: "resolve", label: "Resolve", widget: "computed", span: 3, readonly: true, rule: "alien.rule.resolve" },
      number("damage", "Damage taken", { rule: "alien.rule.damage-armor" }),
      { path: "healthRemaining", label: "Health left", widget: "computed", span: 3, readonly: true, rule: "alien.rule.broken" },
      checkbox("fatigued", "Fatigued"),
      number("rads", "Rads"),
      { path: "criticalInjuries", label: "Critical injuries", widget: "conditions", span: 6, rule: "alien.rule.critical-injuries" },
      { path: "mentalTraumas", label: "Mental traumas", widget: "conditions", span: 6, rule: "alien.rule.mental-trauma" },
    ],
  },
  {
    id: "gear",
    title: "Gear",
    fields: [
      {
        path: "gear",
        label: "Gear",
        widget: "gear",
        span: 12,
        rule: "alien.rule.encumbrance",
        config: {
          encumbrance: "computed.encumbrance",
          encumbranceLimit: "computed.encumbranceLimit",
          maxEncumbrance: "computed.maxEncumbrance",
          supplyOperation: "supplyRoll",
          itemEntityType: "alien.item",
          totalComputed: "encumbrance",
          limitComputed: "encumbranceLimit",
          catalog: GEAR_CATALOG as unknown as Record<string, unknown>,
        },
      },
    ],
  },
  {
    id: "weapons",
    title: "Weapons",
    fields: [
      {
        path: "weapons",
        label: "Weapons",
        widget: "weapons",
        span: 12,
        rule: "alien.rule.weapons",
        config: WEAPONS_CONFIG as unknown as Record<string, unknown>,
      },
    ],
  },
  {
    id: "agenda",
    title: "Agenda",
    columns: 2,
    fields: [
      textarea("personalAgenda", "Personal agenda", { mode: [CAMPAIGN], rule: "alien.rule.agendas" }),
      {
        path: "agendas",
        label: "Agendas (one per act)",
        widget: "list",
        span: 12,
        mode: [CINEMATIC],
        rule: "alien.rule.agendas",
        config: { columns: [{ path: "act", label: "Act" }, { path: "text", label: "Agenda" }] },
      },
      number("storyPoints", "Story Points", { mode: [CINEMATIC], rule: "alien.rule.story-points", config: { max: 3 } }),
      number("xp", "XP", { mode: [CAMPAIGN], rule: "alien.rule.xp" }),
    ],
  },
  {
    id: "background",
    title: "Background",
    columns: 1,
    // appearance is here, for PCs and NPCs alike (a career gives a PC one); the rest of the dossier is NPC-only
    fields: [textarea("background", "Background", { rule: "alien.rule.pregenerated-characters" }), textarea("appearance", "Appearance")],
  },
  {
    id: "npc",
    title: "NPC dossier",
    columns: 2,
    // NPCs only: a PC's sheet drops it unless something in it is filled in
    when: { "!": { var: "fields.isPC" } },
    fields: [
      text("role", "Public role", { span: 6 }),
      text("trait", "Trait", { span: 6, rule: "alien.rule.npcs" }),
      textarea("voice", "Voice", { span: 6 }),
      textarea("tells", "Tells", { span: 6 }),
      textarea("goal", "Goal / wants (GM)", { span: 6, rule: "alien.rule.npcs" }),
      textarea("fears", "Fears", { span: 6 }),
      textarea("secret", "Secret (GM)"),
      textarea("sampleLines", "Sample lines"),
      textarea("arc", "Arc by act", { mode: [CINEMATIC], rule: "alien.rule.three-acts" }),
    ],
  },
  {
    id: "secretAndroid",
    title: "Secret synthetic",
    columns: 4,
    collapsed: true,
    fields: [
      checkbox("secretAndroid", "Poses as human", { rule: "alien.rule.androids" }),
      ...ATTRIBUTE_IDS.map((a) => ({
        path: `coverAttributes.${a}`,
        label: `Cover ${a.charAt(0).toUpperCase()}${a.slice(1)}`,
        widget: "attribute" as const,
        span: 3,
        rule: "alien.rule.androids",
      })),
      { path: "coverHealth", label: "Health shown", widget: "computed", span: 3, readonly: true, rule: "alien.rule.android-damage" },
      { path: "coverResolve", label: "Resolve shown", widget: "computed", span: 3, readonly: true },
      list("fairClues", "Fair clues"),
      textarea("secretOrders", "Secret orders"),
    ],
  },
  {
    id: "lifePath",
    title: "Life Path provenance",
    mode: [CAMPAIGN],
    collapsed: true,
    fields: [{ path: "lifePath", label: "Life Path rolls", widget: "object", span: 12, readonly: true, rule: "alien.rule.life-paths" }],
  },
];

export const characterType: EntityTypeDef = {
  id: "alien.character",
  kind: "character",
  name: "Character",
  plural: "Characters",
  icon: "user",
  schema: characterSchema,
  sheet: {
    sections,
    summary: ["career", "stress", "health", "resolve", "android"],
    create: ["isPC", "weapons"],
  },
  computed: characterComputed,
  defaultVisibility: {
    appearance: "players",
    career: "players",
    goal: "gm",
    trait: "gm",
    personalAgenda: "gm",
    agendas: "gm",
    campaignAgenda: "gm",
    lifePath: "gm",
    voice: "gm",
    fears: "gm",
    secret: "gm",
    tells: "gm",
    sampleLines: "gm",
    arc: "gm",
    secretAndroid: "gm",
    fairClues: "gm",
    secretOrders: "gm",
    coverAttributes: "players",
  },
  playerEditable: ["stress", "damage", "gear", "weapons", "cash", "talents", "skills", "personalAgenda", "agendas", "storyPoints", "xp", "signatureItem", "buddy", "rival", "background"],
};
