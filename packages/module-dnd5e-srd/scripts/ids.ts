/** Ids shared by the converted SRD data and the authored parts of the pack. */

export const PACK = "dnd5e-srd";
export const id = (rest: string): string => `${PACK}.${rest}`;

export const CHARACTER = id("character");
export const MONSTER = id("monster");
export const NPC = id("npc");
export const LOCATION = id("location");
export const FACTION = id("faction");
export const ITEM = id("item");
export const ENCOUNTER = id("encounter");
export const QUEST = id("quest");

/** The six abilities, in sheet order. Ids are the full names so rolls read "Dexterity 14". */
export const ABILITIES = [
  { id: "strength", short: "str", name: "Strength", abbr: "STR" },
  { id: "dexterity", short: "dex", name: "Dexterity", abbr: "DEX" },
  { id: "constitution", short: "con", name: "Constitution", abbr: "CON" },
  { id: "intelligence", short: "int", name: "Intelligence", abbr: "INT" },
  { id: "wisdom", short: "wis", name: "Wisdom", abbr: "WIS" },
  { id: "charisma", short: "cha", name: "Charisma", abbr: "CHA" },
] as const;
export type AbilityId = (typeof ABILITIES)[number]["id"];

export function abilityByShort(short: string): AbilityId {
  const a = ABILITIES.find((x) => x.short === short.toLowerCase());
  if (!a) throw new Error(`unknown ability "${short}"`);
  return a.id;
}

/** The eighteen skills (SRD 5.1, Using Ability Scores: Skills) and the ability each uses. */
export const SKILLS: ReadonlyArray<{ id: string; name: string; ability: AbilityId }> = [
  { id: "acrobatics", name: "Acrobatics", ability: "dexterity" },
  { id: "animal-handling", name: "Animal Handling", ability: "wisdom" },
  { id: "arcana", name: "Arcana", ability: "intelligence" },
  { id: "athletics", name: "Athletics", ability: "strength" },
  { id: "deception", name: "Deception", ability: "charisma" },
  { id: "history", name: "History", ability: "intelligence" },
  { id: "insight", name: "Insight", ability: "wisdom" },
  { id: "intimidation", name: "Intimidation", ability: "charisma" },
  { id: "investigation", name: "Investigation", ability: "intelligence" },
  { id: "medicine", name: "Medicine", ability: "wisdom" },
  { id: "nature", name: "Nature", ability: "intelligence" },
  { id: "perception", name: "Perception", ability: "wisdom" },
  { id: "performance", name: "Performance", ability: "charisma" },
  { id: "persuasion", name: "Persuasion", ability: "charisma" },
  { id: "religion", name: "Religion", ability: "intelligence" },
  { id: "sleight-of-hand", name: "Sleight of Hand", ability: "dexterity" },
  { id: "stealth", name: "Stealth", ability: "dexterity" },
  { id: "survival", name: "Survival", ability: "wisdom" },
];

/** Saving throw "skills": one per ability, rolled with the ability score and save proficiency. */
export const SAVES = ABILITIES.map((a) => ({ id: `${a.id}-save`, name: `${a.name} save`, ability: a.id }));

export const camel = (s: string): string => s.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());
/** Computed value names. */
export const modName = (ability: string): string => `${ability}Mod`;
export const skillBonusName = (skill: string): string => `${camel(skill)}Bonus`;
export const saveBonusName = (ability: string): string => `${ability}Save`;

export const CLASSES = ["barbarian", "bard", "cleric", "druid", "fighter", "monk", "paladin", "ranger", "rogue", "sorcerer", "warlock", "wizard"] as const;

/** Reference list ids. */
export const LIST = {
  abilities: id("ability-scores"),
  skills: id("skills"),
  saves: id("saving-throws"),
  alignments: id("alignments"),
  conditions: id("conditions"),
  damageTypes: id("damage-types"),
  languages: id("languages"),
  magicSchools: id("magic-schools"),
  weaponProperties: id("weapon-properties"),
  spells: id("spells"),
  weapons: id("weapons"),
  armor: id("armor"),
  gear: id("adventuring-gear"),
  tools: id("tools"),
  mounts: id("mounts-and-vehicles"),
  magicItems: id("magic-items"),
  classes: id("classes"),
  classFeatures: id("class-features"),
  subclasses: id("subclasses"),
  races: id("races"),
  subraces: id("subraces"),
  racialTraits: id("racial-traits"),
  backgrounds: id("backgrounds"),
  feats: id("feats"),
  sizes: id("sizes"),
  creatureTypes: id("creature-types"),
} as const;

/** The citation of SRD 5.1 content by section. */
export const cite = (section: string, sub?: string): string => (sub ? `SRD 5.1 — ${section}: ${sub}` : `SRD 5.1 — ${section}`);

/** The citation of SRD 5.2 content by section ("SRD 5.2 — Character Origins: Species (Elf)"). */
export const cite52 = (section: string, sub?: string): string => (sub ? `SRD 5.2 — ${section}: ${sub}` : `SRD 5.2 — ${section}`);

/** What every SRD 5.2 item carries, so the app badges it and tells it apart from the SRD 5.1 item of the same name. */
export const EDITION_2024 = "2024";
export const SOURCE_52 = "SRD 5.2";

export const rule = (rest: string): string => id(`rule.${rest}`);
export const preset = (monsterIndex: string): string => id(`preset.${monsterIndex}`);
