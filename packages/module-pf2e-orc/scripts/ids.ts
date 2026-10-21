/** Ids shared by the converted ORC data and the authored parts of the pack. */

export const PACK = "pf2e-orc";
export const id = (rest: string): string => `${PACK}.${rest}`;

export const CHARACTER = id("character");
export const CREATURE = id("creature");
export const HAZARD = id("hazard");
export const NPC = id("npc");
export const LOCATION = id("location");
export const FACTION = id("faction");
export const ITEM = id("item");
export const ENCOUNTER = id("encounter");
export const QUEST = id("quest");

/** The six attributes, in sheet order. The remaster writes modifiers down (−5 to +7), not scores. */
export const ATTRIBUTES = [
  { id: "strength", short: "str", name: "Strength", abbr: "Str" },
  { id: "dexterity", short: "dex", name: "Dexterity", abbr: "Dex" },
  { id: "constitution", short: "con", name: "Constitution", abbr: "Con" },
  { id: "intelligence", short: "int", name: "Intelligence", abbr: "Int" },
  { id: "wisdom", short: "wis", name: "Wisdom", abbr: "Wis" },
  { id: "charisma", short: "cha", name: "Charisma", abbr: "Cha" },
] as const;
export type AttributeId = (typeof ATTRIBUTES)[number]["id"];

export function attributeByShort(short: string): AttributeId {
  const a = ATTRIBUTES.find((x) => x.short === short.toLowerCase());
  if (!a) throw new Error(`unknown attribute "${short}"`);
  return a.id;
}

/** The sixteen skills and the attribute each uses, plus two Lore slots a character names. */
export const SKILLS: ReadonlyArray<{ id: string; name: string; attribute: AttributeId }> = [
  { id: "acrobatics", name: "Acrobatics", attribute: "dexterity" },
  { id: "arcana", name: "Arcana", attribute: "intelligence" },
  { id: "athletics", name: "Athletics", attribute: "strength" },
  { id: "crafting", name: "Crafting", attribute: "intelligence" },
  { id: "deception", name: "Deception", attribute: "charisma" },
  { id: "diplomacy", name: "Diplomacy", attribute: "charisma" },
  { id: "intimidation", name: "Intimidation", attribute: "charisma" },
  { id: "medicine", name: "Medicine", attribute: "wisdom" },
  { id: "nature", name: "Nature", attribute: "wisdom" },
  { id: "occultism", name: "Occultism", attribute: "intelligence" },
  { id: "performance", name: "Performance", attribute: "charisma" },
  { id: "religion", name: "Religion", attribute: "wisdom" },
  { id: "society", name: "Society", attribute: "intelligence" },
  { id: "stealth", name: "Stealth", attribute: "dexterity" },
  { id: "survival", name: "Survival", attribute: "wisdom" },
  { id: "thievery", name: "Thievery", attribute: "dexterity" },
];
export const LORE_SLOTS = [
  { id: "lore-a", name: "Lore (first)", attribute: "intelligence" as AttributeId },
  { id: "lore-b", name: "Lore (second)", attribute: "intelligence" as AttributeId },
];

/** Perception and the three saving throws: rolled like skills, kept apart on the sheet. */
export const SAVES: ReadonlyArray<{ id: string; name: string; attribute: AttributeId }> = [
  { id: "perception", name: "Perception", attribute: "wisdom" },
  { id: "fortitude", name: "Fortitude", attribute: "constitution" },
  { id: "reflex", name: "Reflex", attribute: "dexterity" },
  { id: "will", name: "Will", attribute: "wisdom" },
];

/** Proficiency ranks as stored on a character sheet (0 untrained ... 4 legendary). */
export const RANKS = [
  { value: 0, label: "Untrained" },
  { value: 1, label: "Trained" },
  { value: 2, label: "Expert" },
  { value: 3, label: "Master" },
  { value: 4, label: "Legendary" },
];

export const camel = (s: string): string => s.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());
/** Computed value names. */
export const totalName = (check: string): string => `${camel(check)}Total`;

export const CLASSES = ["alchemist", "barbarian", "bard", "champion", "cleric", "druid", "fighter", "investigator", "monk", "oracle", "ranger", "rogue", "sorcerer", "swashbuckler", "witch", "wizard"] as const;
export const ANCESTRIES = ["catfolk", "dwarf", "elf", "gnome", "goblin", "halfling", "hobgoblin", "human", "kholo", "kobold", "leshy", "lizardfolk", "orc", "ratfolk", "tengu", "tripkee"] as const;
export const TRADITIONS = ["arcane", "divine", "occult", "primal"] as const;

/** Reference list ids. */
export const LIST = {
  attributes: id("attributes"),
  skills: id("skills"),
  saves: id("saves"),
  ranks: id("proficiency-ranks"),
  conditions: id("conditions"),
  actions: id("actions"),
  ancestries: id("ancestries"),
  heritages: id("heritages"),
  backgrounds: id("backgrounds"),
  classes: id("classes"),
  classFeatures: id("class-features"),
  ancestryFeatures: id("ancestry-features"),
  monsterAbilities: id("monster-abilities"),
  familiarAbilities: id("familiar-abilities"),
  relicGifts: id("relic-gifts"),
  vehicles: id("vehicles"),
} as const;

/** The four books an entry may come from, as cited ("Pathfinder" left out of the citation). */
export const BOOKS: Record<string, string> = {
  "Pathfinder Player Core": "Player Core",
  "Pathfinder Player Core 2": "Player Core 2",
  "Pathfinder GM Core": "GM Core",
  "Pathfinder Monster Core": "Monster Core",
};

/** A section citation: "Player Core — Conditions: Frightened". */
export const cite = (book: string, section: string, sub?: string): string => (sub ? `${book} — ${section}: ${sub}` : `${book} — ${section}`);

export const rule = (rest: string): string => id(`rule.${rest}`);
export const preset = (slug: string): string => id(`preset.${slug}`);

/** A safe id segment: lower case letters, digits and hyphens. */
export function slug(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
