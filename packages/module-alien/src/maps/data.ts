/**
 * Data for the Alien site map generator: vocabularies, site catalogs, the
 * book's barrier armor and threat tiers, the owner's act budgets (a module
 * decision), range bands and the map legend. Rule text is our own paraphrase.
 */
import type { MapLegendEntry, PageRef, RangeBandDef } from "@campaign-forge/module-sdk";

export const MAP_GENERATOR_ID = "alien.map.site";

// ---------------------------------------------------------------------------
// Input vocabularies (ids as in the owner's spec, section 5)
// ---------------------------------------------------------------------------

export const SITE_TYPES = ["colony_block", "station_deck", "starship", "derelict", "mine", "research_lab", "alien_ruin"] as const;
export type SiteTypeId = (typeof SITE_TYPES)[number];
export const SITE_TYPE_LABELS: Record<SiteTypeId, string> = {
  colony_block: "Colony block",
  station_deck: "Station deck",
  starship: "Starship",
  derelict: "Derelict",
  mine: "Mine",
  research_lab: "Research lab",
  alien_ruin: "Alien ruin",
};

export const MAP_SIZES = ["small", "medium", "large"] as const;
export type MapSizeId = (typeof MAP_SIZES)[number];
/** Playable floor zones per size (ducts and out-of-bounds stubs are not counted). */
export const SIZE_ZONES: Record<MapSizeId, [number, number]> = { small: [12, 20], medium: [20, 32], large: [32, 45] };

export const DUCT_DENSITIES = ["none", "sparse", "normal", "dense"] as const;
export type DuctDensity = (typeof DUCT_DENSITIES)[number];
/** Share of rooms that get a duct access point (module decision). Each duct sheet keeps two or more room exits. */
export const DUCT_SHARE: Record<DuctDensity, number> = { none: 0, sparse: 0.2, normal: 0.35, dense: 0.6 };

/**
 * Chance per duct sheet of each generated hazard (module decision): a vent fan,
 * hot pipes, a flooded stretch (only when the brief allows flooding; +0.3 on a
 * crawlspace under a deck), a collapsed section and a one-way drop (on sheets
 * with a shaft).
 */
export const DUCT_HAZARD_ODDS: Record<SiteTypeId, { fan: number; steam: number; flooded: number; collapse: number; drop: number }> = {
  station_deck: { fan: 0.6, steam: 0.5, flooded: 0.15, collapse: 0.25, drop: 0.5 },
  starship: { fan: 0.6, steam: 0.6, flooded: 0.1, collapse: 0.2, drop: 0.5 },
  derelict: { fan: 0.4, steam: 0.4, flooded: 0.2, collapse: 0.6, drop: 0.6 },
  colony_block: { fan: 0.6, steam: 0.4, flooded: 0.25, collapse: 0.3, drop: 0.4 },
  research_lab: { fan: 0.6, steam: 0.5, flooded: 0.2, collapse: 0.25, drop: 0.4 },
  mine: { fan: 0.8, steam: 0.3, flooded: 0.5, collapse: 0.6, drop: 0.6 },
  alien_ruin: { fan: 0, steam: 0.3, flooded: 0.4, collapse: 0.6, drop: 0.7 },
};
/** Height of a duct shaft between levels in metres (a deck's height, as for ladders; module decision). */
export const DUCT_SHAFT_M = 4;

export const HAZARDS = ["fire", "vacuum", "zero_g", "radiation", "flooding"] as const;
export type HazardId = (typeof HAZARDS)[number];

export const WIN_PATHS = ["escape_craft", "airlock", "self_destruct", "signal", "seal_section"] as const;
export type WinPathId = (typeof WIN_PATHS)[number];
export const WIN_PATH_LABELS: Record<WinPathId, string> = {
  escape_craft: "Escape craft",
  airlock: "Airlock",
  self_destruct: "Self-destruct",
  signal: "Signal",
  seal_section: "Seal section",
};
/** Win paths that beat a threat without killing it (spec section 4). A signal only calls for help. */
export const NON_COMBAT_WIN_PATHS: readonly WinPathId[] = ["escape_craft", "airlock", "self_destruct", "seal_section"];

export const NPC_ROLES = ["crew", "survivor", "android"] as const;
export type NpcRole = (typeof NPC_ROLES)[number];

// ---------------------------------------------------------------------------
// Areas (floor tints)
// ---------------------------------------------------------------------------

export const AREAS = ["ops", "medical", "habitation", "engineering", "cargo", "science", "security", "transit", "alien"] as const;
export type AreaId = (typeof AREAS)[number];
export const AREA_LABELS: Record<AreaId, string> = {
  ops: "Operations",
  medical: "Medical",
  habitation: "Habitation",
  engineering: "Engineering",
  cargo: "Cargo",
  science: "Science",
  security: "Security",
  transit: "Corridors and access",
  alien: "Alien structure",
};
export const AREA_COLORS: Record<AreaId, string> = {
  ops: "#5b8def",
  medical: "#4fb0a5",
  habitation: "#c9a227",
  engineering: "#d9822b",
  cargo: "#8a7f6a",
  science: "#9a6fd1",
  security: "#c0504d",
  transit: "#9aa3ad",
  alien: "#6b8f5e",
};

// ---------------------------------------------------------------------------
// Barriers (p. 68) and doors (p. 61)
// ---------------------------------------------------------------------------

/** Typical barrier armor levels (p. 68). The armored bulkhead is "4+"; 4 is used as its floor. */
export const BARRIER_ARMOR = { furniture: 1, innerBulkhead: 2, outerBulkhead: 3, armoredBulkhead: 4 } as const;
/** A typical metal door or hatch: armor 2, gives in after 10 damage (p. 61). */
export const DOOR_ARMOR = 2;
export const DOOR_HP = 10;

// ---------------------------------------------------------------------------
// Room catalog
// ---------------------------------------------------------------------------

export type RoomTag =
  | "terminal"
  | "secure"
  | "escape"
  | "airlock"
  | "self_destruct"
  | "signal"
  | "seal"
  | "start"
  | "dead_end"
  | "reactor"
  | "water"
  | "hull";

export interface RoomType {
  id: string;
  name: string;
  area: AreaId;
  /** Width and depth ranges in metres (soft; the layout may stretch or squeeze). */
  w: [number, number];
  d: [number, number];
  /** Chance the room is cluttered. */
  clutter: number;
  flammable?: boolean;
  tags?: RoomTag[];
  /** Lowercase words that match a key room name to this type. */
  keywords?: string[];
}

const R = (id: string, name: string, area: AreaId, w: [number, number], d: [number, number], clutter: number, extra: Partial<RoomType> = {}): RoomType => ({
  id,
  name,
  area,
  w,
  d,
  clutter,
  ...extra,
});

/** Every room type any site can use. Names are generic deck-plan labels. */
export const ROOM_TYPES: Record<string, RoomType> = Object.fromEntries(
  [
    R("dock", "Docking port", "transit", [5, 9], [5, 9], 0.3, { tags: ["start", "airlock", "hull"], keywords: ["dock", "docking", "port", "umbilical"] }),
    R("airlock", "Airlock", "transit", [4, 6], [4, 6], 0.1, { tags: ["airlock", "hull", "start"], keywords: ["airlock", "lock"] }),
    R("hangar", "Hangar", "cargo", [10, 16], [8, 12], 0.6, { tags: ["escape", "hull"], keywords: ["hangar", "bay", "shuttle", "dropship"] }),
    R("escape-pods", "Escape pods", "transit", [5, 9], [4, 7], 0.2, { tags: ["escape", "hull", "dead_end"], keywords: ["escape", "pod", "lifeboat"] }),
    R("vehicle-bay", "Vehicle bay", "cargo", [9, 14], [7, 11], 0.6, { tags: ["escape", "hull"], keywords: ["vehicle", "garage", "crawler", "rover", "tractor"] }),
    R("command", "Command center", "ops", [7, 12], [6, 10], 0.7, { tags: ["terminal", "self_destruct", "seal"], keywords: ["command", "bridge", "control", "ops", "operations"] }),
    R("comms", "Comms room", "ops", [4, 7], [4, 6], 0.8, { tags: ["terminal", "signal"], keywords: ["comms", "communication", "radio", "uplink", "antenna", "signal"] }),
    R("security", "Security station", "security", [5, 8], [4, 7], 0.7, { tags: ["terminal", "seal"], keywords: ["security", "guard", "brig", "marshal"] }),
    R("armory", "Armory", "security", [4, 6], [4, 6], 0.8, { tags: ["secure", "dead_end"], keywords: ["armory", "armoury", "weapons", "arsenal"] }),
    R("brig", "Brig", "security", [4, 7], [4, 6], 0.3, { tags: ["secure", "dead_end"], keywords: ["brig", "cell", "jail", "lockup"] }),
    R("medlab", "Medlab", "medical", [6, 10], [5, 8], 0.8, { flammable: true, tags: ["terminal"], keywords: ["med", "medlab", "medbay", "infirmary", "clinic", "surgery", "autodoc"] }),
    R("morgue", "Morgue", "medical", [4, 6], [4, 6], 0.5, { tags: ["dead_end"], keywords: ["morgue", "mortuary", "autopsy"] }),
    R("lab", "Lab", "science", [6, 10], [5, 8], 0.8, { flammable: true, tags: ["terminal"], keywords: ["lab", "laboratory", "research", "science", "specimen"] }),
    R("containment", "Containment", "science", [5, 8], [5, 7], 0.4, { tags: ["secure", "dead_end"], keywords: ["containment", "isolation", "quarantine", "specimen"] }),
    R("cold-storage", "Cold storage", "science", [3, 5], [3, 5], 0.7, { tags: ["dead_end"], keywords: ["cold", "freezer", "cryo storage"] }),
    R("quarters", "Quarters", "habitation", [4, 8], [4, 7], 0.8, { flammable: true, keywords: ["quarters", "cabin", "bunk", "dorm", "barracks"] }),
    R("mess", "Mess hall", "habitation", [8, 12], [6, 9], 0.7, { flammable: true, keywords: ["mess", "canteen", "cafeteria", "dining"] }),
    R("galley", "Galley", "habitation", [4, 7], [4, 6], 0.8, { flammable: true, keywords: ["galley", "kitchen"] }),
    R("rec", "Rec room", "habitation", [6, 10], [5, 8], 0.6, { flammable: true, keywords: ["rec", "recreation", "lounge", "bar", "gym"] }),
    R("hydroponics", "Hydroponics", "habitation", [7, 12], [6, 9], 0.9, { flammable: true, tags: ["water"], keywords: ["hydroponics", "garden", "greenhouse", "farm"] }),
    R("cryo", "Cryo bay", "habitation", [6, 10], [5, 8], 0.6, { keywords: ["cryo", "hypersleep", "freezer"] }),
    R("office", "Office", "ops", [4, 7], [4, 6], 0.8, { flammable: true, tags: ["terminal"], keywords: ["office", "admin", "administration", "manager", "corporate"] }),
    R("data-center", "Data center", "ops", [5, 8], [4, 7], 0.6, { tags: ["terminal"], keywords: ["data", "mainframe", "computer", "server", "mother"] }),
    R("storage", "Storage", "cargo", [4, 8], [4, 7], 0.9, { flammable: true, tags: ["dead_end"], keywords: ["storage", "store", "supply", "supplies", "locker"] }),
    R("cargo-hold", "Cargo hold", "cargo", [9, 16], [8, 12], 0.9, { keywords: ["cargo", "hold", "warehouse"] }),
    R("workshop", "Workshop", "engineering", [6, 10], [5, 8], 0.9, { flammable: true, keywords: ["workshop", "machine shop", "fabrication", "repair"] }),
    R("maintenance", "Maintenance", "engineering", [4, 7], [4, 6], 0.8, { tags: ["dead_end"], keywords: ["maintenance", "utility", "janitor"] }),
    R("life-support", "Life support", "engineering", [6, 9], [5, 8], 0.8, { tags: ["terminal"], keywords: ["life support", "air", "scrubber", "atmosphere", "oxygen"] }),
    R("reactor", "Reactor", "engineering", [8, 12], [7, 10], 0.6, { tags: ["reactor", "self_destruct", "secure"], keywords: ["reactor", "engine", "power", "core", "generator"] }),
    R("engine-room", "Engine room", "engineering", [8, 14], [7, 10], 0.7, { tags: ["reactor", "self_destruct"], keywords: ["engine", "drive", "thruster"] }),
    R("pump-room", "Pump room", "engineering", [5, 8], [4, 7], 0.8, { tags: ["water", "dead_end"], keywords: ["pump", "water", "sump", "drain"] }),
    R("drill-head", "Drill head", "engineering", [8, 14], [7, 11], 0.7, { keywords: ["drill", "face", "dig"] }),
    R("ore-processing", "Ore processing", "engineering", [9, 14], [7, 10], 0.8, { flammable: true, keywords: ["ore", "processing", "refinery", "smelter"] }),
    R("lift-station", "Lift station", "transit", [5, 8], [5, 7], 0.3, { tags: ["escape", "start"], keywords: ["lift", "elevator", "cage", "surface"] }),
    R("explosives", "Explosives store", "security", [3, 5], [3, 5], 0.7, { tags: ["secure", "dead_end"], keywords: ["explosive", "blasting", "magazine"] }),
    R("antechamber", "Antechamber", "alien", [6, 10], [5, 8], 0.3, { tags: ["start"], keywords: ["antechamber", "entrance", "entry", "gate"] }),
    R("glyph-hall", "Glyph hall", "alien", [9, 15], [7, 11], 0.5, { tags: ["terminal"], keywords: ["glyph", "hall", "mural", "carving"] }),
    R("ossuary", "Ossuary", "alien", [5, 9], [5, 8], 0.8, { tags: ["dead_end"], keywords: ["ossuary", "tomb", "remains", "crypt"] }),
    R("pilot-chamber", "Pilot chamber", "alien", [9, 14], [8, 12], 0.4, { tags: ["self_destruct"], keywords: ["pilot", "navigator", "chair", "cockpit"] }),
    R("ampule-vault", "Ampule vault", "alien", [6, 10], [5, 8], 0.7, { tags: ["secure", "dead_end"], keywords: ["ampule", "urn", "vault", "cylinder", "accelerant"] }),
    R("hatchery", "Hatchery", "alien", [8, 12], [7, 10], 0.8, { tags: ["dead_end"], keywords: ["hatchery", "egg", "nest", "hive"] }),
    R("fissure", "Fissure", "alien", [4, 7], [4, 7], 0.6, { tags: ["dead_end"], keywords: ["fissure", "crack", "cave"] }),
    R("surface-exit", "Surface exit", "transit", [5, 9], [5, 8], 0.3, { tags: ["escape", "airlock", "start", "hull"], keywords: ["exit", "surface", "landing", "outside", "dropship"] }),
  ].map((r) => [r.id, r]),
);

export interface SiteProfile {
  id: SiteTypeId;
  /** "space" sites have outer bulkheads that can decompress; "ground" sites have exterior walls; "rock" sites are cut into stone. */
  hull: "space" | "ground" | "rock";
  /** Most ships auto-seal a breached zone (p. 75). */
  autoSeal: boolean;
  /** Armor of walls between zones and of exterior walls (p. 68 barrier table; rock is a module decision). */
  wallArmor: number;
  outerArmor: number;
  corridorWidth: [number, number];
  corridorName: string;
  /** Share of room doors drawn as hatches. */
  hatchShare: number;
  /** Extra chance (on top of the input) that a zone is dark. */
  darkBias: number;
  /** Chance a zone's detail comes from the anomalous table. */
  anomalous: number;
  /** Room ids and weights for ordinary rooms. */
  rooms: Array<[string, number]>;
  /** Start room, in preference order. */
  start: string[];
  /** Room ids that can hold each win path, in preference order. */
  win: Record<WinPathId, string[]>;
}

const commonWin = (escape: string[]): Record<WinPathId, string[]> => ({
  escape_craft: escape,
  airlock: ["airlock"],
  self_destruct: ["reactor", "engine-room", "command"],
  signal: ["comms", "command"],
  seal_section: ["security", "command"],
});

export const SITE_PROFILES: Record<SiteTypeId, SiteProfile> = {
  station_deck: {
    id: "station_deck",
    hull: "space",
    autoSeal: true,
    wallArmor: BARRIER_ARMOR.innerBulkhead,
    outerArmor: BARRIER_ARMOR.outerBulkhead,
    corridorWidth: [2, 3],
    corridorName: "Corridor",
    hatchShare: 0.15,
    darkBias: 0,
    anomalous: 0,
    rooms: [["quarters", 4], ["mess", 1], ["galley", 1], ["rec", 1], ["medlab", 1], ["lab", 1], ["office", 2], ["data-center", 1], ["storage", 3], ["workshop", 1], ["maintenance", 2], ["life-support", 1], ["hydroponics", 1], ["security", 1], ["armory", 1], ["cold-storage", 1], ["cryo", 1], ["comms", 1]],
    start: ["dock", "airlock"],
    win: commonWin(["escape-pods", "hangar"]),
  },
  starship: {
    id: "starship",
    hull: "space",
    autoSeal: true,
    wallArmor: BARRIER_ARMOR.innerBulkhead,
    outerArmor: BARRIER_ARMOR.outerBulkhead,
    corridorWidth: [2, 2],
    corridorName: "Passage",
    hatchShare: 0.5,
    darkBias: 0.05,
    anomalous: 0,
    rooms: [["quarters", 3], ["galley", 1], ["mess", 1], ["medlab", 1], ["cryo", 1], ["storage", 2], ["cargo-hold", 2], ["maintenance", 2], ["life-support", 1], ["workshop", 1], ["armory", 1], ["data-center", 1], ["comms", 1], ["cold-storage", 1]],
    start: ["airlock", "dock"],
    win: commonWin(["escape-pods", "hangar"]),
  },
  derelict: {
    id: "derelict",
    hull: "space",
    autoSeal: false,
    wallArmor: BARRIER_ARMOR.innerBulkhead,
    outerArmor: BARRIER_ARMOR.outerBulkhead,
    corridorWidth: [2, 3],
    corridorName: "Passage",
    hatchShare: 0.5,
    darkBias: 0.3,
    anomalous: 0.5,
    rooms: [["quarters", 3], ["galley", 1], ["medlab", 1], ["cryo", 2], ["storage", 2], ["cargo-hold", 2], ["maintenance", 2], ["life-support", 1], ["lab", 1], ["containment", 1], ["data-center", 1], ["morgue", 1]],
    start: ["airlock", "dock"],
    win: commonWin(["escape-pods", "hangar"]),
  },
  colony_block: {
    id: "colony_block",
    hull: "ground",
    autoSeal: false,
    wallArmor: BARRIER_ARMOR.innerBulkhead,
    outerArmor: BARRIER_ARMOR.outerBulkhead,
    corridorWidth: [2, 3],
    corridorName: "Corridor",
    hatchShare: 0.05,
    darkBias: 0,
    anomalous: 0,
    rooms: [["quarters", 4], ["mess", 1], ["galley", 1], ["rec", 1], ["medlab", 1], ["office", 2], ["storage", 3], ["workshop", 1], ["maintenance", 2], ["life-support", 1], ["hydroponics", 1], ["security", 1], ["brig", 1], ["pump-room", 1], ["data-center", 1], ["comms", 1]],
    start: ["airlock", "vehicle-bay"],
    win: commonWin(["vehicle-bay", "hangar"]),
  },
  research_lab: {
    id: "research_lab",
    hull: "ground",
    autoSeal: false,
    wallArmor: BARRIER_ARMOR.innerBulkhead,
    outerArmor: BARRIER_ARMOR.outerBulkhead,
    corridorWidth: [2, 3],
    corridorName: "Corridor",
    hatchShare: 0.05,
    darkBias: 0,
    anomalous: 0,
    rooms: [["lab", 4], ["containment", 2], ["cold-storage", 2], ["medlab", 1], ["morgue", 1], ["office", 2], ["data-center", 1], ["quarters", 2], ["galley", 1], ["storage", 2], ["maintenance", 1], ["life-support", 1], ["security", 1], ["comms", 1]],
    start: ["airlock", "dock"],
    win: commonWin(["vehicle-bay", "hangar"]),
  },
  mine: {
    id: "mine",
    hull: "rock",
    autoSeal: false,
    wallArmor: BARRIER_ARMOR.armoredBulkhead,
    outerArmor: BARRIER_ARMOR.armoredBulkhead,
    corridorWidth: [3, 3],
    corridorName: "Tunnel",
    hatchShare: 0.1,
    darkBias: 0.15,
    anomalous: 0,
    rooms: [["drill-head", 2], ["ore-processing", 2], ["storage", 2], ["explosives", 1], ["workshop", 2], ["maintenance", 2], ["pump-room", 2], ["quarters", 2], ["galley", 1], ["medlab", 1], ["office", 1], ["life-support", 1]],
    start: ["lift-station"],
    win: { escape_craft: ["lift-station", "vehicle-bay"], airlock: ["airlock", "surface-exit"], self_destruct: ["explosives", "reactor"], signal: ["comms", "office"], seal_section: ["security", "office"] },
  },
  alien_ruin: {
    id: "alien_ruin",
    hull: "rock",
    autoSeal: false,
    wallArmor: BARRIER_ARMOR.armoredBulkhead,
    outerArmor: BARRIER_ARMOR.armoredBulkhead,
    corridorWidth: [3, 3],
    corridorName: "Gallery",
    hatchShare: 0.4,
    darkBias: 0.3,
    anomalous: 1,
    rooms: [["glyph-hall", 2], ["ossuary", 2], ["ampule-vault", 1], ["hatchery", 1], ["fissure", 2], ["antechamber", 1], ["storage", 1], ["cold-storage", 1]],
    start: ["surface-exit", "antechamber"],
    win: { escape_craft: ["surface-exit"], airlock: ["surface-exit", "antechamber"], self_destruct: ["pilot-chamber"], signal: ["pilot-chamber", "glyph-hall"], seal_section: ["antechamber", "glyph-hall"] },
  },
};

// ---------------------------------------------------------------------------
// Threats: tiers (p. 305), costs and act budgets (owner's heuristic)
// ---------------------------------------------------------------------------

export const THREAT_TIERS = ["lesser", "greater", "overwhelming"] as const;
export type ThreatTier = (typeof THREAT_TIERS)[number];
export const THREAT_TIER_LABELS: Record<ThreatTier, string> = { lesser: "Lesser foe", greater: "Greater enemy or group", overwhelming: "Overwhelming enemy" };
/** Budget cost per tier: the owner's heuristic (module decision, not a book rule). */
export const THREAT_COST: Record<ThreatTier, number> = { lesser: 1, greater: 3, overwhelming: 6 };

/**
 * Tier per creature preset. The book's examples (p. 305) fix three of them:
 * Facehugger lesser, Drones greater, Queen overwhelming. The rest follow the
 * owner's spec table where it lists them and are module decisions otherwise.
 */
export const CREATURE_TIERS: Record<string, { tier: ThreatTier; book?: boolean }> = {
  "alien.creature.xx121-ovomorph": { tier: "lesser" },
  "alien.creature.xx121-queens-egg": { tier: "lesser" },
  "alien.creature.xx121-facehugger": { tier: "lesser", book: true },
  "alien.creature.xx121-praeto-facehugger": { tier: "lesser" },
  "alien.creature.xx121-royal-facehugger": { tier: "lesser" },
  "alien.creature.xx121-chestburster": { tier: "lesser" },
  "alien.creature.xx121-bambi-burster": { tier: "lesser" },
  "alien.creature.xx121-imp": { tier: "lesser" },
  "alien.creature.xx121-queen-burster": { tier: "lesser" },
  "alien.creature.xx121-drone": { tier: "greater", book: true },
  "alien.creature.xx121-scout": { tier: "greater" },
  "alien.creature.xx121-stalker": { tier: "greater" },
  "alien.creature.xx121-soldier": { tier: "greater" },
  "alien.creature.xx121-worker": { tier: "lesser" },
  "alien.creature.xx121-sentry": { tier: "greater" },
  "alien.creature.xx121-praetorian": { tier: "overwhelming" },
  "alien.creature.xx121-charger": { tier: "overwhelming" },
  "alien.creature.xx121-queen": { tier: "overwhelming", book: true },
  "alien.creature.neomorph-bloodburster": { tier: "lesser" },
  "alien.creature.neomorph-neophyte": { tier: "lesser" },
  "alien.creature.neomorph-adult": { tier: "greater" },
  "alien.creature.harvester": { tier: "overwhelming" },
  "alien.creature.harvester-juvenile": { tier: "lesser" },
  "alien.creature.lion-worm": { tier: "greater" },
  "alien.creature.tanakan-scorpionid": { tier: "lesser" },
  "alien.creature.swarm": { tier: "greater" },
};

/**
 * Tier of a group (module decision): two to five lesser foes count as a greater
 * group, six or more as overwhelming; two or more greater enemies are overwhelming.
 */
export function groupTier(tier: ThreatTier, count: number): ThreatTier {
  if (count <= 1 || tier === "overwhelming") return tier;
  if (tier === "greater") return "overwhelming";
  return count >= 6 ? "overwhelming" : "greater";
}

/** Act budgets by crew size [min, max] for acts 1-3: the owner's playtest heuristic, not a book rule. */
export const ACT_BUDGETS: Record<number, [[number, number], [number, number], [number, number]]> = {
  1: [[0, 1], [3, 3], [3, 6]],
  2: [[1, 1], [3, 3], [6, 6]],
  3: [[1, 2], [3, 4], [6, 7]],
  4: [[1, 2], [3, 4], [6, 7]],
  5: [[2, 2], [4, 6], [7, 9]],
};
export const ACT_BUDGET_NOTE = "Act budgets are the owner's starting heuristic for playtesting (module decision), not a book rule.";

/** Encounter timer enemy presence levels and their stress dice (p. 303). */
export const ENEMY_PRESENCE = [
  { id: "all-clear", label: "All Clear", dice: 1 },
  { id: "uncertain", label: "Uncertain", dice: 2 },
  { id: "suspected", label: "Suspected", dice: 3 },
  { id: "confirmed", label: "Confirmed", dice: 4 },
  { id: "closing", label: "Closing", dice: 5 },
  { id: "near", label: "Near", dice: 6 },
] as const;
export type EnemyPresenceId = (typeof ENEMY_PRESENCE)[number]["id"];

/** Path length (start to final win path) that suits a runtime in hours (module decision; 3-4 hours is the spec's 8-16). */
export const PATH_LENGTH_BY_HOURS: Record<number, [number, number]> = { 1: [3, 8], 2: [5, 12], 3: [8, 16], 4: [8, 16], 5: [10, 20] };

/** Zone limits (p. 54): zones up to about 25 m across; corridors 2-3 m wide (spec). */
export const MAX_ZONE_M = 25;
/** Spawns sit beyond Long range and the M314's four-zone reach (p. 55, 58). */
export const MIN_SPAWN_DISTANCE = 5;
/** First contact aims for about three stretches into the act (spec heuristic). */
export const CONTACT_STRETCHES = 3;

// ---------------------------------------------------------------------------
// Range bands (p. 55)
// ---------------------------------------------------------------------------

/**
 * Range in zones (p. 55). Adjacent ("in your face") is not a zone distance:
 * on a scaled map it means tokens or bases touching inside the same zone (p. 61).
 */
export const RANGE_BANDS: RangeBandDef[] = [
  { id: "short", label: "Short", maxDistance: 0 },
  { id: "medium", label: "Medium", maxDistance: 1 },
  { id: "long", label: "Long", maxDistance: 4 },
  { id: "extreme", label: "Extreme" },
];

// ---------------------------------------------------------------------------
// Legend
// ---------------------------------------------------------------------------

const L = (target: MapLegendEntry["target"], label: string, rule: string, page?: PageRef, extra: Partial<MapLegendEntry> = {}): MapLegendEntry => ({
  target,
  label,
  rule,
  ...(page !== undefined ? { page } : {}),
  ...extra,
});

export const MAP_LEGEND: MapLegendEntry[] = [
  // Borders and access
  L({ border: "open" }, "Open border", "Blocks neither movement nor line of sight.", 55),
  L({ border: "wall" }, "Wall or inner bulkhead", "Blocks movement and sight; armor 2 (4+ when armored).", [55, 68]),
  L({ flag: "outerHull" }, "Outer bulkhead", "Armor 3. A missed shot that could breach it rolls a stress die; a breach vents the zone. Marks zones with a wall on the hull.", [68, 75], { gmOnly: true, icon: "vacuum" }),
  L({ flag: "armored" }, "Armored bulkhead", "Armor 4 or more.", 68),
  L({ border: "door" }, "Door", "Unlocked: free to pass. Cover against the next zone. Armor 2, 10 damage to break.", [61, 66]),
  L({ flag: "locked" }, "Locked door", "Lock as a quick action; break it (close combat, +2 dice) or open an electronic lock with Comtech.", 61, { gmOnly: true }),
  L({ border: "hatch" }, "Hatch", "Works like a door; often in floors or ceilings.", 61),
  L({ border: "blast" }, "Blast door", "Armored (4+); normally worked by the station's systems, not by force.", 68),
  L(
    { kind: "crawlspace" },
    "Duct or crawlspace",
    "Open zone: no hiding and no cover. Each duct network is its own sheet, a maze not drawn to the deck's scale, so an exit's place on the sheet says nothing about where its room lies; read the exit label.",
    [55, 56],
  ),
  L({ flag: "singleFile" }, "Single file", "Nobody passes anyone else in here, friends included, and the person ahead blocks line of sight.", [55, 61]),
  L({ border: "access" }, "Access point", "Entering costs one zone of movement. A cutting torch can seal it (Heavy Machinery, full action, one try per stretch).", 56),
  L({ flag: "exitTo" }, "Duct exit", "Where this access point comes out: the room named, or a spot in a corridor. Unknown to the crew until found.", 56, { gmOnly: true, icon: "exit" }),
  L({ flag: "ductTo" }, "Duct access", "An access point here leads into the duct zone named, on its own sheet.", 56, { gmOnly: true }),
  L({ flag: "sealed" }, "Sealed access point", "Impassable, even to a Xenomorph. Acid still burns through a duct floor in one stretch where there is gravity; over a room, that makes a new access point (the GM picks the room).", 56),
  L({ border: "stairs" }, "Stairs, ladder or lift", "Links decks; counts as a border between two zones.", 55),
  L(
    { border: "shaft" },
    "Duct shaft",
    "A vertical link between duct levels, one zone of movement. A hurried climb is a Mobility roll (full action, p. 60); a fall in gravity deals half the height in metres, rounded down (p. 75).",
    [60, 75],
    { gmOnly: true },
  ),
  L(
    { flag: "oneWayDrop" },
    "One-way drop",
    "Module decision: too sheer to climb back, so it is passable downward only. Going down is a fall (p. 75) unless taken as a controlled jump: roll Mobility, each success takes 1 off the damage; body armor does not help.",
    75,
    { gmOnly: true, icon: "drop" },
  ),
  // Zone fills
  L({ area: "ops" }, AREA_LABELS.ops, "Floor tint by function.", undefined, { color: AREA_COLORS.ops }),
  L({ area: "medical" }, AREA_LABELS.medical, "Floor tint by function.", undefined, { color: AREA_COLORS.medical }),
  L({ area: "habitation" }, AREA_LABELS.habitation, "Floor tint by function.", undefined, { color: AREA_COLORS.habitation }),
  L({ area: "engineering" }, AREA_LABELS.engineering, "Floor tint by function.", undefined, { color: AREA_COLORS.engineering }),
  L({ area: "cargo" }, AREA_LABELS.cargo, "Floor tint by function.", undefined, { color: AREA_COLORS.cargo }),
  L({ area: "science" }, AREA_LABELS.science, "Floor tint by function.", undefined, { color: AREA_COLORS.science }),
  L({ area: "security" }, AREA_LABELS.security, "Floor tint by function.", undefined, { color: AREA_COLORS.security }),
  L({ area: "transit" }, AREA_LABELS.transit, "Floor tint by function.", undefined, { color: AREA_COLORS.transit }),
  L({ area: "alien" }, AREA_LABELS.alien, "Floor tint by function.", undefined, { color: AREA_COLORS.alien }),
  L({ flag: "cluttered" }, "Cluttered", "Somewhere to hide or take cover.", [54, 66]),
  L({ flag: "open" }, "Open", "No hiding and no cover, except by a door or hatch.", [54, 66]),
  L({ flag: "dark" }, "Dark", "Humans and androids roll Observation at -2 dice; a flashlight cancels it; Xenomorphs ignore it. Ducts are dark unless something lights them.", 57, { gmOnly: true, icon: "dark" }),
  L({ flag: "flammable" }, "Flammable", "A fire here can spread through an open border on a D6 roll of 5-6 each round.", 76, { gmOnly: true, icon: "fire" }),
  L({ flag: "atmosphere", value: "none" }, "No atmosphere", "Vacuum: +1 stress each round and a Survival roll before acting.", 75, { gmOnly: true, icon: "vacuum" }),
  L({ flag: "gravity", value: false }, "Zero gravity", "-2 dice to Close Combat, Heavy Machinery, Mobility and Ranged Combat; each move needs Mobility.", 76, { gmOnly: true, icon: "float" }),
  L({ flag: "radiation" }, "Radiation", "Rads per shift (weak), stretch (strong) or round (extreme).", 77, { gmOnly: true, icon: "radiation" }),
  L({ flag: "flooded" }, "Flooded", "Under water: a Survival roll every round against suffocation. A flooded duct stretch is under water from end to end (module decision).", 75, { gmOnly: true, icon: "water" }),
  L(
    { flag: "fan" },
    "Vent fan",
    "Module decision: a running fan blocks the duct. Stop it at its panel with Comtech, or jam it with Heavy Machinery; either is a full action (p. 60).",
    60,
    { gmOnly: true, icon: "fan" },
  ),
  L(
    { flag: "steam" },
    "Hot pipes",
    "Extreme heat (p. 75): a Survival roll to get through; on a failure you are fatigued until you are clear of it. One roll per crossing is a module decision.",
    75,
    { gmOnly: true, icon: "steam" },
  ),
  L(
    { flag: "collapsed" },
    "Collapsed section",
    "Debris walls off the duct here until cleared. Module decision: treat it as an inner bulkhead (armor 2, p. 68) that gives way after 10 damage, like a door (p. 61).",
    [61, 68],
    { gmOnly: true, icon: "collapse" },
  ),
  L({ flag: "dropM" }, "Drop", "A fall deals damage equal to half the height in metres, rounded down.", 75, { gmOnly: true, icon: "hazard" }),
  L({ kind: "out-of-bounds" }, "Out of bounds", "Shown for scale; closed to play.", undefined),
  L({ kind: "shaft" }, "Shaft", "A vertical zone; falling rules apply.", 75),
  // GM-only markers
  L({ marker: "start" }, "Start", "Where the crew begins."),
  L({ marker: "spawn" }, "Spawn point", "Creature, act and Speed (zones per stretch in stealth mode).", [55, 208], { gmOnly: true }),
  L({ marker: "waypoint" }, "Patrol waypoint", "Where an active threat moves between stretches.", 55, { gmOnly: true }),
  L({ marker: "clue" }, "Clue", "One of three placements for a puzzle answer.", undefined, { gmOnly: true }),
  L({ marker: "npc" }, "NPC", "Where an NPC is in each act.", undefined, { gmOnly: true }),
  L({ marker: "win" }, "Win path", "An endpoint that ends the scenario.", undefined, { gmOnly: true }),
  L({ marker: "hazard" }, "Hazard", "A hazard the GM should remember here.", [75, 77], { gmOnly: true }),
  L({ marker: "label" }, "Zone number", "Zone id for the zone key; the GM keeps a hidden copy of the map for NPC tokens.", 56, { gmOnly: true }),
];
