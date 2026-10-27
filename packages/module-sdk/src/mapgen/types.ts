/**
 * Built-in map generator engines: what a data pack declares in
 * `mapGenerators` (the engine, an id, a name and the engine's config, all
 * data). The SDK turns each entry into a contract `MapGeneratorDef` bound to
 * the module's tables, presets and lists. Like the dice engines, the engines
 * are code in the SDK; a pack only configures one. See
 * docs/modules/map-generators.md.
 *
 * Every expression is JSONLogic. Stocking rules read the dungeon context:
 *
 *   { inputs, site, theme, threat, level, room, result, preset, item, group, encounter, lock }
 *
 * - `inputs`: the brief (siteType, size, levels, partyLevel, partySize, threat, theme, faction, keyRooms);
 * - `site`: the site type (its `vars` spread in), `theme` and `threat` likewise (`theme` is null without one);
 * - `level`: the room's level (1 = the way in), `room`: { id, name, purpose, tags, area, depth, lair, entrance, key, passage, level };
 * - `result`: the row a `table` rolled; `preset` / `item`: the candidate a `where` or `fits` looks at;
 * - `group`: an encounter group ({ n, ... }) and `encounter` ({ groups, xp, activity }) in labels and details;
 * - `lock`: the lock a locked door's `doors.lock` picked.
 */
import type { JsonLogicRule, MapLegendEntry, MapZoneTable, PageRef, PlayModeId } from "../types";

/** The built-in engines a pack can name. */
export const MAP_ENGINES = ["dungeon"] as const;
export type MapEngineId = (typeof MAP_ENGINES)[number];

/** A map generator a data pack declares: a built-in engine and its config. */
export interface PackMapGenerator {
  engine: "dungeon";
  /** Namespaced by the pack id, like every id. */
  id: string;
  name: string;
  description?: string;
  page?: PageRef;
  cite?: string;
  original?: boolean;
  mode?: PlayModeId[];
  config: DungeonConfig;
}

/** The floor plan algorithms the dungeon engine has; a site type picks one. */
export const DUNGEON_ARCHETYPES = ["halls", "caverns", "keep", "channels", "nave", "tunnels"] as const;
export type DungeonArchetype = (typeof DUNGEON_ARCHETYPES)[number];

/** The ways two rooms (or a room and a passage) can be joined. */
export const DUNGEON_LINKS = ["open", "door", "locked", "secret", "bars", "rubble"] as const;
export type DungeonLinkKind = (typeof DUNGEON_LINKS)[number];

export interface DungeonConfig {
  /** One grid square: e.g. { size: 5, unit: "ft", metres: 1.524 }. */
  grid: { size: number; unit: string; metres: number };
  siteTypes: DungeonSiteType[];
  /** Dungeon sizes offered in the brief: how many rooms in all (spread over the levels). */
  sizes: Array<{ id: string; label: string; rooms: [number, number] }>;
  /** Most levels a brief can ask for (default 3). */
  maxLevels?: number;
  partyLevel?: DungeonRange;
  partySize?: DungeonRange;
  /** The threat dial: how many rooms hold an encounter, and `vars` the stocking rules read (as `threat`). */
  threats: DungeonThreat[];
  defaultThreat?: string;
  /** Optional themes (undead, raiders, beasts…): keywords that pick one from an adventure, `vars` the rules read (as `theme`). */
  themes?: DungeonTheme[];
  /** Words the map uses (defaults in brackets): level ("Level"), passage ("Passage"), outside ("Outside"), entrance ("Way in"), room ("Room"), lair ("Lair"), encounter ("Encounter"), trap ("Trap"), treasure ("Treasure"). */
  labels?: Record<string, string>;
  /** Tables rolled for every room's dressing, and for some passages'. */
  dressing?: { rooms?: string[]; passages?: string[]; passageChance?: number };
  doors?: DungeonDoors;
  encounters?: DungeonEncounters;
  traps?: DungeonTraps;
  treasure?: DungeonTreasure;
  /** Legend entries, merged over the engine's own (same target replaces): zone flags and their rules, relabelled borders and markers. */
  legend?: MapLegendEntry[];
  /** Module tables the GM rolls at the table for matching zones. */
  zoneTables?: MapZoneTable[];
  /** What accepting a map creates in the campaign. */
  accept?: DungeonAccept;
  /** Reading a brief from an adventure: scenes at a location of these subtypes become key rooms (default ["dungeon"]). */
  keyRooms?: { locationSubtypes?: string[] };
}

export interface DungeonRange {
  min: number;
  max: number;
  default: number;
}

export interface DungeonSiteType {
  id: string;
  label: string;
  archetype: DungeonArchetype;
  description?: string;
  /** Words that pick this site type from an adventure's text ("tower", "keep"). */
  keywords?: string[];
  /**
   * Room purposes: a table whose rows' results are `{ name, readAloud?, gm?, tags?, flags?, dressing? }`
   * (`flags` are zone flags such as `{ "water": true }`; `dressing` a table rolled for that room).
   */
  rooms: string;
  /** The lair (the deepest, largest room): a table of the same shape. Defaults to `rooms`. */
  lair?: string;
  /** The room the way in opens into: a table of the same shape. Defaults to `rooms`. */
  entrance?: string;
  /** The archetype's great hall (a temple's nave): a table of the same shape. Defaults to `rooms`. */
  hall?: string;
  /** Names: a passage ("Passage"), a level ("Level"), the ground outside ("Outside"). */
  passageName?: string;
  levelName?: string;
  outsideName?: string;
  /** How room links are joined: relative weights per kind (defaults depend on the archetype). */
  links?: Partial<Record<DungeonLinkKind, number>>;
  /** Zone flags each room gets with this chance (e.g. { "dark": 0.8, "difficult": 0.15 }). */
  flags?: Record<string, number>;
  /** Zone flags each passage gets with this chance (e.g. { "water": 1 } in a sewer). */
  passageFlags?: Record<string, number>;
  /** Values the stocking rules read as `site.<name>` (e.g. { "terrain": "underground" }). */
  vars?: Record<string, unknown>;
}

export interface DungeonThreat {
  id: string;
  label: string;
  /** Share of rooms (besides the lair) that hold an encounter, 0 to 1. */
  occupied: number;
  vars?: Record<string, unknown>;
}

export interface DungeonTheme {
  id: string;
  label: string;
  keywords?: string[];
  vars?: Record<string, unknown>;
  /** More dressing tables for every room of a dungeon with this theme. */
  dressing?: string[];
}

/**
 * Picking one thing from the module: roll a table, then take the preset or
 * list item it names (`id`), or pick one among presets of an entity type or
 * items of reference lists that pass `where` (fast `match` equalities first),
 * preferring those that `fits` (the theme).
 */
export interface DungeonPick {
  /** A table to roll first (its id, or JSONLogic yielding one); its row is `result` below. */
  table?: JsonLogicRule;
  /** Take this preset or list item (JSONLogic over the context and `result`). */
  id?: JsonLogicRule;
  /** Pick among presets of this entity type… */
  presets?: string;
  /** …or among the items of these reference lists. */
  lists?: string[];
  /** Field path (dotted, on the preset or item) -> JSONLogic value it must equal. Checked before `where`. */
  match?: Record<string, JsonLogicRule>;
  /** Candidate filter: the context plus `result` and the candidate as `preset` (or `item`). */
  where?: JsonLogicRule;
  /** Preferred candidates (e.g. the theme's creatures); the others are a fallback. */
  fits?: JsonLogicRule;
}

export interface DungeonEncounterGroup extends Omit<DungeonPick, "table"> {
  /** How many (JSONLogic over the context and `result`). */
  n: JsonLogicRule;
  /** Skip the group unless true. */
  when?: JsonLogicRule;
}

export interface DungeonEncounters {
  /** The encounter roll: a table (id or JSONLogic) whose row the groups read as `result`. */
  table: JsonLogicRule;
  /** Re-roll the table (up to four times) while this is false: theme fit. Reads `result` and its `preset`. */
  prefer?: JsonLogicRule;
  /** The creatures: one pick per group. */
  groups: DungeonEncounterGroup[];
  /** The entity type of creature presets (for groups that pick among presets, and for accepting). */
  creatureType: string;
  /** XP (or any cost) of one creature: the context plus `group` and `preset`. Summed into `encounter.xp`. */
  xp?: JsonLogicRule;
  /** "What they are doing": a table rolled per encounter (row label). */
  activity?: string;
  /** The key text (DCs, XP, tactics): the context plus `encounter`. */
  detail?: JsonLogicRule;
  /** Chance a passage holds a wandering group (default 0). */
  passages?: number;
  cite?: string;
  original?: boolean;
}

export interface DungeonTraps {
  /** Chance a room (or passage) is trapped: JSONLogic over the context (0 to 1). */
  chance: JsonLogicRule;
  pick: DungeonPick;
  /** Short name on the map: the context plus `result` / `preset`. */
  label: JsonLogicRule;
  /** DCs and effect for the key. */
  detail?: JsonLogicRule;
  cite?: string;
  original?: boolean;
}

export interface DungeonTreasure {
  /** Chance a room holds treasure (JSONLogic over the context, 0 to 1). The lair rule can read `room.lair`. */
  chance: JsonLogicRule;
  /** Coins: a dice expression (JSONLogic), rolled; `coinsLabel` turns the total into text (default "<total>"). */
  coins?: JsonLogicRule;
  coinsLabel?: JsonLogicRule;
  /** Items: how many (JSONLogic, default 0) and how to pick each. */
  itemCount?: JsonLogicRule;
  items?: DungeonPick;
  /** One item as text: the context plus `item` (and `result`). Default: the item's name. */
  itemLabel?: JsonLogicRule;
  cite?: string;
  original?: boolean;
}

export interface DungeonDoors {
  /** The lock on a locked door: a pick (e.g. a lock item by level), read as `lock` by `notes.locked`. */
  lock?: DungeonPick;
  /** GM notes per link kind (JSONLogic over the context and `lock`), shown in the key's exits. */
  notes?: Partial<Record<DungeonLinkKind, JsonLogicRule>>;
}

/** An entity the map's accept creates: its type, subtype and fields (dotted path -> JSONLogic over the context). */
export interface DungeonAcceptEntity {
  type: string;
  subtype?: string;
  fields?: Record<string, JsonLogicRule>;
}

export interface DungeonAccept {
  /** The dungeon itself (skipped when the GM picks an existing location). Context: `map` { name, rooms, levels }. */
  site?: DungeonAcceptEntity;
  /** One per room. Context: `room` { name, readAloud, details, gmNote, number, level, flags }. */
  room?: DungeonAcceptEntity;
  /** One per encounter, linked to its creatures. Context: `encounter` and its `room`. */
  encounter?: DungeonAcceptEntity;
  /** Creature entities from their presets (default true). */
  creatures?: boolean;
  /** Traps picked from presets become entities of their type (default true). */
  hazards?: boolean;
}
