/**
 * The dungeon brief: its JSON Schema (built from the pack's config), the
 * normalized inputs every stage reads, the words the map uses, and a brief
 * read from an adventure. Small and code-free of the floor plans, so the
 * module loads it eagerly and the engine itself stays a lazy chunk.
 */
import type { JsonSchema, MapBorderData, MapLegendEntry } from "../../types";
import type { DungeonConfig, DungeonSiteType, DungeonTheme, DungeonThreat, PackMapGenerator } from "../types";

export interface DungeonKeyRoom {
  name: string;
  /** GM text for the room (from the adventure). */
  description?: string;
  /** What the players are told on entering. */
  readAloud?: string;
  /** The dungeon's heart: placed in the lair. */
  lair?: boolean;
}

export interface DungeonInputs {
  siteType: string;
  size: string;
  levels: number;
  partyLevel: number;
  partySize: number;
  threat: string;
  theme: string;
  faction: string;
  keyRooms: DungeonKeyRoom[];
}

/** The brief's theme value for "no theme". */
export const NO_THEME = "any";

export const DUNGEON_STAGES = [
  { id: "layout", title: "Floor plan" },
  { id: "doors", title: "Doors and secrets" },
  { id: "dressing", title: "Room purposes and dressing" },
  { id: "stocking", title: "Encounters, traps and treasure" },
] as const;
export type DungeonStage = (typeof DUNGEON_STAGES)[number]["id"];

export const DEFAULT_LABELS: Record<string, string> = {
  level: "Level",
  passage: "Passage",
  outside: "Outside",
  entrance: "Way in",
  room: "Room",
  lair: "Lair",
  encounter: "Encounter",
  trap: "Trap",
  treasure: "Treasure",
};

export function labelOf(config: DungeonConfig, key: string): string {
  return config.labels?.[key] ?? DEFAULT_LABELS[key] ?? key;
}

const range = (r: { min: number; max: number; default: number } | undefined, fallback: { min: number; max: number; default: number }) => r ?? fallback;
const clampInt = (v: unknown, min: number, max: number, fallback: number) => {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : NaN;
  return Number.isFinite(n) ? Math.max(min, Math.min(max, Math.round(n))) : fallback;
};
const str = (v: unknown, max = 200) => (typeof v === "string" ? v.trim().slice(0, max) : "");

export function partyLevelRange(config: DungeonConfig) {
  return range(config.partyLevel, { min: 1, max: 20, default: 3 });
}
export function partySizeRange(config: DungeonConfig) {
  return range(config.partySize, { min: 1, max: 8, default: 4 });
}

function middle<T>(list: T[]): T | undefined {
  return list[Math.floor((list.length - 1) / 2)];
}

/** The brief with every value checked and defaulted. */
export function normalizeInputs(config: DungeonConfig, raw: Record<string, unknown>): DungeonInputs {
  const pl = partyLevelRange(config);
  const ps = partySizeRange(config);
  const site = config.siteTypes.find((s) => s.id === raw.siteType) ?? config.siteTypes[0]!;
  const size = config.sizes.find((s) => s.id === raw.size) ?? middle(config.sizes)!;
  const threat = config.threats.find((t) => t.id === raw.threat) ?? config.threats.find((t) => t.id === config.defaultThreat) ?? middle(config.threats)!;
  const theme = (config.themes ?? []).find((t) => t.id === raw.theme);
  const keyRooms = (Array.isArray(raw.keyRooms) ? raw.keyRooms : [])
    .filter((k): k is Record<string, unknown> => !!k && typeof k === "object" && !Array.isArray(k))
    .map((k) => {
      const room: DungeonKeyRoom = { name: str(k.name, 80) };
      const description = str(k.description, 2000);
      const readAloud = str(k.readAloud, 2000);
      if (description) room.description = description;
      if (readAloud) room.readAloud = readAloud;
      if (k.lair === true) room.lair = true;
      return room;
    })
    .filter((k) => k.name !== "")
    .slice(0, 12);
  return {
    siteType: site.id,
    size: size.id,
    levels: clampInt(raw.levels, 1, Math.max(1, config.maxLevels ?? 3), 1),
    partyLevel: clampInt(raw.partyLevel, pl.min, pl.max, pl.default),
    partySize: clampInt(raw.partySize, ps.min, ps.max, ps.default),
    threat: threat.id,
    theme: theme?.id ?? "",
    faction: str(raw.faction, 120),
    keyRooms,
  };
}

/** The JSON Schema of the brief, from the pack's site types, sizes, threats and themes. */
export function dungeonInputSchema(config: DungeonConfig): JsonSchema {
  const pl = partyLevelRange(config);
  const ps = partySizeRange(config);
  const themes = config.themes ?? [];
  const properties: Record<string, JsonSchema> = {
    siteType: { type: "string", title: "Site type", enum: config.siteTypes.map((s) => s.id), enumLabels: config.siteTypes.map((s) => s.label), default: config.siteTypes[0]!.id },
    size: { type: "string", title: "Size", enum: config.sizes.map((s) => s.id), enumLabels: config.sizes.map((s) => `${s.label} (${s.rooms[0]}–${s.rooms[1]} rooms)`), default: middle(config.sizes)!.id },
    levels: { type: "integer", title: "Levels", minimum: 1, maximum: Math.max(1, config.maxLevels ?? 3), default: 1 },
    partyLevel: { type: "integer", title: "Party level", minimum: pl.min, maximum: pl.max, default: pl.default },
    partySize: { type: "integer", title: "Party size", minimum: ps.min, maximum: ps.max, default: ps.default },
    threat: { type: "string", title: "Threat", enum: config.threats.map((t) => t.id), enumLabels: config.threats.map((t) => t.label), default: (config.threats.find((t) => t.id === config.defaultThreat) ?? middle(config.threats)!).id },
  };
  if (themes.length) properties.theme = { type: "string", title: "Theme", enum: [NO_THEME, ...themes.map((t) => t.id)], enumLabels: ["Any", ...themes.map((t) => t.label)], default: NO_THEME };
  properties.faction = { type: "string", title: "Who holds it (faction)", maxLength: 120, default: "" };
  properties.keyRooms = {
    type: "array",
    title: "Key rooms",
    description: "Rooms the adventure needs; the last one (or the one marked lair) is the dungeon's heart.",
    maxItems: 12,
    default: [],
    items: {
      type: "object",
      properties: {
        name: { type: "string", title: "Name", maxLength: 80 },
        description: { type: "string", title: "GM note", maxLength: 2000 },
        readAloud: { type: "string", title: "Read-aloud", maxLength: 2000 },
        lair: { type: "boolean", title: "Lair", default: false },
      },
      required: ["name"],
    },
  };
  return { type: "object", properties };
}

/** The context every stocking rule reads: the brief, the site type, the theme and the threat with their `vars`. */
export function baseContext(config: DungeonConfig, inputs: DungeonInputs): Record<string, unknown> {
  const site: DungeonSiteType = config.siteTypes.find((s) => s.id === inputs.siteType)!;
  const threat: DungeonThreat = config.threats.find((t) => t.id === inputs.threat)!;
  const theme: DungeonTheme | undefined = (config.themes ?? []).find((t) => t.id === inputs.theme);
  return {
    inputs,
    site: { id: site.id, label: site.label, archetype: site.archetype, description: site.description ?? "", ...(site.vars ?? {}) },
    threat: { id: threat.id, label: threat.label, occupied: threat.occupied, ...(threat.vars ?? {}) },
    theme: theme ? { id: theme.id, label: theme.label, ...(theme.vars ?? {}) } : null,
    faction: inputs.faction,
  };
}

/** The engine's legend, with the pack's entries over it (an entry for the same target replaces the engine's). */
export function dungeonLegend(config: DungeonConfig): MapLegendEntry[] {
  const L = (k: string) => labelOf(config, k);
  const base: MapLegendEntry[] = [
    { target: { border: "open" }, label: "Opening or archway" },
    { target: { border: "door" }, label: "Door (a red dot: locked)" },
    { target: { border: "door" }, label: "Secret door (dashed): the players see it once found", gmOnly: true },
    { target: { border: "bars" }, label: "Portcullis, gate or grate" },
    { target: { border: "rubble" }, label: "Collapsed passage (impassable until cleared)" },
    { target: { border: "stairs" }, label: "Stairs to another level" },
    { target: { kind: "exterior" }, label: L("outside") },
    { target: { marker: "start" }, label: L("entrance") },
    { target: { marker: "spawn" }, label: L("encounter"), gmOnly: true },
    { target: { marker: "trap" }, label: L("trap"), gmOnly: true },
    { target: { marker: "treasure" }, label: L("treasure"), gmOnly: true },
  ];
  const key = (e: MapLegendEntry) => JSON.stringify(e.target);
  const own = config.legend ?? [];
  const replaced = new Set(own.map(key));
  return [...base.filter((e) => !replaced.has(key(e))), ...own];
}

/** Walls and rubble block; so do sealed borders and doors locked in the act (every act: a dungeon has none). */
export function dungeonPassable(border: MapBorderData, act: number): boolean {
  if (border.kind === "wall" || border.kind === "rubble") return false;
  if (border.sealed) return false;
  if ((border.lockedInActs ?? []).includes(act)) return false;
  return true;
}

// ---------------------------------------------------------------------------
// the brief from an adventure
// ---------------------------------------------------------------------------

const isRec = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const mentions = (textLower: string, word: string) => word.trim() !== "" && new RegExp(`\\b${escapeRe(word.toLowerCase())}`).test(textLower);

/**
 * A brief from an adventure review context: the scenes set at a dungeon-like
 * location (a subtype in `keyRooms.locationSubtypes`, default "dungeon")
 * become key rooms (the last one the lair, read-aloud from the scene), the
 * site type and theme come from keywords in that location and the adventure,
 * and the party size from the PCs in its cast.
 */
export function dungeonInputsFromAdventure(gen: PackMapGenerator, ctx: Record<string, unknown>): Record<string, unknown> {
  const config = gen.config;
  const subtypes = config.keyRooms?.locationSubtypes ?? ["dungeon"];
  const scenes = (Array.isArray(ctx.scenes) ? ctx.scenes : []).filter(isRec);
  const atSite = (s: Record<string, unknown>) => isRec(s.location) && subtypes.includes(String(s.location.subtype ?? ""));
  const siteScenes = scenes.filter(atSite);
  const location = siteScenes.length ? (siteScenes[0]!.location as Record<string, unknown>) : undefined;
  const out: Record<string, unknown> = {};
  const keyRooms: DungeonKeyRoom[] = siteScenes
    .filter((s) => !location || (s.location as Record<string, unknown>).id === location.id)
    .map((s) => {
      const room: DungeonKeyRoom = { name: String(s.title ?? "").slice(0, 80) };
      const gm = String(s.body ?? s.purpose ?? "").trim();
      const readAloud = String(s.readAloud ?? "").trim();
      if (gm) room.description = gm.slice(0, 2000);
      if (readAloud) room.readAloud = readAloud.slice(0, 2000);
      return room;
    })
    .filter((r) => r.name !== "");
  if (keyRooms.length) {
    keyRooms[keyRooms.length - 1]!.lair = true;
    out.keyRooms = keyRooms;
  }
  const adventure = isRec(ctx.adventure) ? ctx.adventure : {};
  const siteText = [location?.name, location?.summary].map((x) => String(x ?? "")).join("\n").toLowerCase();
  const allText = [siteText, adventure.title, adventure.premise, adventure.gmSituation, ...scenes.map((s) => s.body)].map((x) => String(x ?? "")).join("\n").toLowerCase();
  const site = config.siteTypes.find((s) => (s.keywords ?? []).some((k) => mentions(siteText, k))) ?? config.siteTypes.find((s) => (s.keywords ?? []).some((k) => mentions(allText, k)));
  if (site) out.siteType = site.id;
  const theme = (config.themes ?? []).find((t) => (t.keywords ?? []).some((k) => mentions(allText, k)));
  if (theme) out.theme = theme.id;
  const cast = isRec(ctx.cast) ? ctx.cast : {};
  const pcs = Array.isArray(cast.pcs) ? cast.pcs.length : 0;
  const ps = partySizeRange(config);
  if (pcs >= ps.min && pcs <= ps.max) out.partySize = pcs;
  return out;
}
