/**
 * The generator's brief (spec section 5): JSON Schema, normalisation of loose
 * input, and the mapping from the cinematic builder's review context.
 */
import type { JsonSchema } from "@campaign-forge/module-sdk";
import { creaturePresets } from "../data/creatures";
import {
  CREATURE_TIERS,
  DUCT_DENSITIES,
  HAZARDS,
  MAP_SIZES,
  NPC_ROLES,
  SITE_TYPES,
  SITE_TYPE_LABELS,
  WIN_PATHS,
  WIN_PATH_LABELS,
  type DuctDensity,
  type HazardId,
  type MapSizeId,
  type NpcRole,
  type SiteTypeId,
  type WinPathId,
} from "./data";

export interface ThreatInput {
  /** Creature preset id, e.g. "alien.creature.xx121-drone". */
  creature: string;
  act: number;
  count: number;
}
export interface KeyRoomInput {
  name: string;
  act: number;
  description?: string;
}
export interface PuzzleInput {
  id: string;
  answer: string;
  act: number;
  /** Key room the puzzle belongs to (by name), if any. */
  room?: string;
}
export interface NpcInput {
  name: string;
  role: NpcRole;
}

export interface MapInputs {
  site_type: SiteTypeId;
  size: MapSizeId;
  decks: number;
  crew: number;
  runtime_h: number;
  threats: ThreatInput[];
  duct_density: DuctDensity;
  darkness: number;
  hazards: HazardId[];
  win_paths: WinPathId[];
  key_rooms: KeyRoomInput[];
  puzzles: PuzzleInput[];
  npcs: NpcInput[];
}

/** Creature presets that can be placed on a map: those with a Speed (not lore-only records). */
export const PLACEABLE_CREATURES = creaturePresets.filter((p) => typeof p.fields.speed === "number" && CREATURE_TIERS[p.id] !== undefined);
const CREATURE_IDS = PLACEABLE_CREATURES.map((p) => p.id);
export const DEFAULT_THREAT: ThreatInput = { creature: "alien.creature.xx121-drone", act: 2, count: 1 };

const act = { type: "integer", minimum: 1, maximum: 3, default: 1 };

export const MAP_INPUT_SCHEMA: JsonSchema = {
  type: "object",
  properties: {
    site_type: {
      type: "string",
      title: "Site type",
      enum: [...SITE_TYPES],
      enumLabels: SITE_TYPES.map((s) => SITE_TYPE_LABELS[s]),
      default: "station_deck",
      description: "Sets the room catalog, wall armor and whether outer walls face vacuum.",
    },
    size: {
      type: "string",
      title: "Size",
      enum: [...MAP_SIZES],
      enumLabels: ["Small (12-20 zones)", "Medium (20-32 zones)", "Large (32-45 zones)"],
      default: "medium",
      description: "Playable floor zones; ducts and sealed areas come on top.",
    },
    decks: { type: "integer", title: "Decks", minimum: 1, maximum: 3, default: 1, description: "Levels joined by stairs, ladders or lifts." },
    crew: { type: "integer", title: "Crew", minimum: 1, maximum: 5, default: 2, description: "PCs plus NPCs who fight alongside them; sets the act budgets and the start room size." },
    runtime_h: { type: "integer", title: "Runtime (hours)", minimum: 1, maximum: 5, default: 4, description: "Sets the number of key rooms and the target path length." },
    threats: {
      type: "array",
      title: "Threats",
      description: "Creatures by act. Each is placed at a spawn point and costs its tier against the act budget.",
      default: [{ ...DEFAULT_THREAT }],
      items: {
        type: "object",
        properties: {
          creature: { type: "string", title: "Creature", enum: CREATURE_IDS, enumLabels: PLACEABLE_CREATURES.map((p) => p.name), default: DEFAULT_THREAT.creature },
          act: { ...act, title: "Act", default: 2 },
          count: { type: "integer", title: "How many", minimum: 1, maximum: 30, default: 1 },
        },
        required: ["creature", "act"],
      },
    },
    duct_density: {
      type: "string",
      title: "Duct density",
      enum: [...DUCT_DENSITIES],
      enumLabels: ["None", "Sparse", "Normal", "Dense"],
      default: "normal",
      description: "Share of rooms with a duct access point.",
    },
    darkness: { type: "integer", title: "Darkness (%)", minimum: 0, maximum: 100, default: 40, description: "Share of zones that are dark." },
    hazards: {
      type: "array",
      title: "Hazards",
      uniqueItems: true,
      items: { type: "string", enum: [...HAZARDS], enumLabels: ["Fire", "Vacuum", "Zero-G", "Radiation", "Flooding"] },
      default: ["fire", "vacuum"],
      description: "Which hazard flags may appear.",
    },
    win_paths: {
      type: "array",
      title: "Win paths",
      uniqueItems: true,
      minItems: 1,
      items: { type: "string", enum: [...WIN_PATHS], enumLabels: WIN_PATHS.map((w) => WIN_PATH_LABELS[w]) },
      default: ["escape_craft"],
      description: "Endpoints the map must reach.",
    },
    key_rooms: {
      type: "array",
      title: "Key rooms",
      description: "Rooms that must exist, be named and be numbered. Generated when empty.",
      default: [],
      items: {
        type: "object",
        properties: {
          name: { type: "string", title: "Name" },
          act: { ...act, title: "Act" },
          description: { type: "string", title: "Description (GM only)" },
        },
        required: ["name"],
      },
    },
    puzzles: {
      type: "array",
      title: "Puzzles",
      description: "Each answer gets three clue zones on at least two routes.",
      default: [],
      items: {
        type: "object",
        properties: {
          id: { type: "string", title: "Id" },
          answer: { type: "string", title: "Answer" },
          act: { ...act, title: "Act" },
          room: { type: "string", title: "Key room" },
        },
        required: ["answer"],
      },
    },
    npcs: {
      type: "array",
      title: "NPCs",
      description: "Crew NPCs, survivors and androids get a zone per act.",
      default: [],
      items: {
        type: "object",
        properties: {
          name: { type: "string", title: "Name" },
          role: { type: "string", title: "Role", enum: [...NPC_ROLES], enumLabels: ["Crew", "Survivor", "Android"], default: "crew" },
        },
        required: ["name"],
      },
    },
  },
};

// ---------------------------------------------------------------------------
// normalisation
// ---------------------------------------------------------------------------

type Rec = Record<string, unknown>;
const isRec = (x: unknown): x is Rec => typeof x === "object" && x !== null && !Array.isArray(x);
const str = (x: unknown): string => (typeof x === "string" ? x.trim() : typeof x === "number" ? String(x) : "");
const clampInt = (x: unknown, lo: number, hi: number, dflt: number): number => {
  const n = typeof x === "number" ? x : typeof x === "string" && x.trim() !== "" ? Number(x) : NaN;
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, Math.round(n))) : dflt;
};
const oneOf = <T extends string>(x: unknown, list: readonly T[], dflt: T): T => {
  const s = str(x).toLowerCase().replace(/[\s-]+/g, "_");
  return (list as readonly string[]).includes(s) ? (s as T) : dflt;
};
const listOf = <T extends string>(x: unknown, list: readonly T[]): T[] => {
  if (!Array.isArray(x)) return [];
  const out: T[] = [];
  for (const v of x) {
    const s = str(v).toLowerCase().replace(/[\s-]+/g, "_");
    if ((list as readonly string[]).includes(s) && !out.includes(s as T)) out.push(s as T);
  }
  return out;
};

/** Resolve a creature reference (preset id, id slug or name) to a placeable preset id. */
export function resolveCreature(ref: unknown): string | undefined {
  const s = str(ref);
  if (!s) return undefined;
  if (CREATURE_IDS.includes(s)) return s;
  const slug = s.toLowerCase();
  const bySlug = CREATURE_IDS.find((id) => id.endsWith(`.${slug}`) || id.endsWith(`-${slug}`));
  if (bySlug) return bySlug;
  return PLACEABLE_CREATURES.find((p) => p.name.toLowerCase() === slug)?.id;
}

/** Fill defaults and clamp loose input into a complete brief. */
export function normalizeMapInputs(raw: Record<string, unknown> = {}): MapInputs {
  const threatsRaw = raw.threats ?? raw.threat;
  const threats: ThreatInput[] = [];
  if (Array.isArray(threatsRaw)) {
    for (const t of threatsRaw) {
      if (!isRec(t)) continue;
      const creature = resolveCreature(t.creature ?? t.id ?? t.name);
      if (!creature) continue;
      threats.push({ creature, act: clampInt(t.act, 1, 3, 2), count: clampInt(t.count, 1, 30, 1) });
    }
  }
  const hazards = raw.hazards === undefined ? (["fire", "vacuum"] as HazardId[]) : listOf(raw.hazards, HAZARDS);
  const wins = listOf(raw.win_paths, WIN_PATHS);
  const keyRooms: KeyRoomInput[] = [];
  if (Array.isArray(raw.key_rooms)) {
    for (const k of raw.key_rooms) {
      const name = isRec(k) ? str(k.name) : str(k);
      if (!name) continue;
      const desc = isRec(k) ? str(k.description) : "";
      keyRooms.push({ name, act: clampInt(isRec(k) ? k.act : undefined, 1, 3, 1), ...(desc ? { description: desc } : {}) });
    }
  }
  const puzzles: PuzzleInput[] = [];
  if (Array.isArray(raw.puzzles)) {
    raw.puzzles.forEach((p, i) => {
      if (!isRec(p)) return;
      const answer = str(p.answer);
      if (!answer) return;
      const room = str(p.room);
      puzzles.push({ id: str(p.id) || `P${i + 1}`, answer, act: clampInt(p.act, 1, 3, 2), ...(room ? { room } : {}) });
    });
  }
  const npcs: NpcInput[] = [];
  if (Array.isArray(raw.npcs)) {
    for (const n of raw.npcs) {
      const name = isRec(n) ? str(n.name) : str(n);
      if (!name) continue;
      npcs.push({ name, role: oneOf(isRec(n) ? n.role : undefined, NPC_ROLES, "crew") });
    }
  }
  return {
    site_type: oneOf(raw.site_type, SITE_TYPES, "station_deck"),
    size: oneOf(raw.size, MAP_SIZES, "medium"),
    decks: clampInt(raw.decks, 1, 3, 1),
    crew: clampInt(raw.crew, 1, 5, 2),
    runtime_h: clampInt(raw.runtime_h, 1, 5, 4),
    threats: threatsRaw === undefined ? [{ ...DEFAULT_THREAT }] : threats,
    duct_density: oneOf(raw.duct_density, DUCT_DENSITIES, "normal"),
    darkness: clampInt(raw.darkness, 0, 100, 40),
    hazards,
    win_paths: wins.length > 0 ? wins : ["escape_craft"],
    key_rooms: keyRooms,
    puzzles,
    npcs,
  };
}

// ---------------------------------------------------------------------------
// From the cinematic builder's review context
// ---------------------------------------------------------------------------

const fieldsOf = (x: Rec): Rec => (isRec(x.fields) ? x.fields : {});
const members = (ctx: Rec, role: string): Rec[] => {
  const top = ctx[role];
  if (Array.isArray(top)) return top.filter(isRec);
  const cast = isRec(ctx.cast) ? ctx.cast[role] : undefined;
  return Array.isArray(cast) ? cast.filter(isRec) : [];
};

/** Every piece of text an act carries (title, goal, pacing, fields, scenes). */
function actText(a: Rec): string {
  const parts: string[] = [str(a.title), str(a.goal), str(a.pacing)];
  for (const v of Object.values(fieldsOf(a))) parts.push(str(v));
  for (const s of Array.isArray(a.scenes) ? a.scenes.filter(isRec) : []) {
    parts.push(str(s.title), str(s.body), str(s.purpose), str(s.readAloud));
    for (const v of Object.values(fieldsOf(s))) parts.push(str(v));
  }
  return parts.join("\n").toLowerCase();
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const mentions = (text: string, name: string): boolean => name.trim() !== "" && new RegExp(`\\b${escapeRe(name.toLowerCase())}\\b`).test(text);

const WIN_WORDS: Array<[WinPathId, RegExp]> = [
  ["escape_craft", /\b(escape|shuttle|lifeboat|dropship|pod|evac|launch)/i],
  ["airlock", /\bairlock/i],
  ["self_destruct", /\b(self[- ]?destruct|detonat|overload|meltdown|nuke|blow (it|the))/i],
  ["signal", /\b(signal|distress|beacon|transmi|broadcast|mayday|call for help)/i],
  ["seal_section", /\b(seal|quarantine|lock ?down|bulkhead)/i],
];

const SITE_WORDS: Array<[SiteTypeId, RegExp]> = [
  ["derelict", /\bderelict/i],
  ["alien_ruin", /\b(ruin|temple|engineer|juggernaut|pyramid)/i],
  ["mine", /\b(mine|mining|shaft|tunnel)/i],
  ["research_lab", /\b(lab|laboratory|research)/i],
  ["colony_block", /\b(colony|settlement|outpost)/i],
  ["starship", /\b(ship|vessel|freighter|tug|frigate)/i],
  ["station_deck", /\bstation/i],
];

/**
 * Generator inputs from an adventure review context (see core builder.ts):
 * locations become key rooms (act from a location's `act` field, else the act
 * whose text names it, else `zoneOrder`, else spread in order), location
 * puzzles become puzzles, crew counts PCs plus NPCs, threats are creature names
 * found in the acts and the adventure's `threats` field, and win paths come
 * from the Act 3 text, the countdown and the epilogue.
 */
export function inputsFromAdventure(ctx: Record<string, unknown>): Record<string, unknown> {
  const adventure = isRec(ctx.adventure) ? ctx.adventure : {};
  const af = fieldsOf(adventure);
  const acts = (Array.isArray(ctx.acts) ? ctx.acts.filter(isRec) : []).slice().sort((a, b) => Number(a.number) - Number(b.number));
  const actTexts = new Map<number, string>();
  for (const a of acts) {
    const n = clampInt(a.number, 1, 3, 1);
    actTexts.set(n, `${actTexts.get(n) ?? ""}\n${actText(a)}`);
  }
  const zoneOrder = str(af.zoneOrder)
    .split(/[>,;\n]|->|→/)
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);

  const locations = members(ctx, "locations");
  const keyRooms: KeyRoomInput[] = [];
  const puzzles: PuzzleInput[] = [];
  locations.forEach((loc, i) => {
    const f = fieldsOf(loc);
    const name = str(loc.name);
    if (!name) return;
    let actNo: number | undefined;
    if (f.act !== undefined && f.act !== null && str(f.act) !== "") actNo = clampInt(f.act, 1, 3, 1);
    if (actNo === undefined) {
      for (const n of [1, 2, 3]) {
        if (mentions(actTexts.get(n) ?? "", name)) {
          actNo = n;
          break;
        }
      }
    }
    if (actNo === undefined && zoneOrder.length > 0) {
      const at = zoneOrder.findIndex((z) => z === name.toLowerCase() || z.includes(name.toLowerCase()));
      if (at >= 0) actNo = Math.min(3, 1 + Math.floor((at * 3) / zoneOrder.length));
    }
    if (actNo === undefined) actNo = Math.min(3, 1 + Math.floor((i * 3) / Math.max(1, locations.length)));
    const description = str(f.description) || str(loc.summary);
    keyRooms.push({ name, act: actNo, ...(description ? { description } : {}) });
    const puzzle = str(f.puzzle);
    if (puzzle) {
      const answer = str(f.puzzleSolution) || str(f.puzzleClue) || puzzle;
      puzzles.push({ id: `P${puzzles.length + 1}`, answer, act: actNo, room: name });
    }
  });

  const pcs = members(ctx, "pcs");
  const npcMembers = members(ctx, "npcs");
  const npcs: NpcInput[] = npcMembers
    .map((n) => {
      const f = fieldsOf(n);
      const android = f.android === true || f.secretAndroid === true;
      return { name: str(n.name), role: (android ? "android" : "crew") as NpcRole };
    })
    .filter((n) => n.name !== "");

  // Threats: creature names in each act's text, then the adventure's threat notes.
  const threats: ThreatInput[] = [];
  const seen = new Set<string>();
  const byLongestName = PLACEABLE_CREATURES.slice().sort((a, b) => b.name.length - a.name.length);
  /** Common words that only count as creatures in the threats field or when the text is about aliens. */
  const GENERIC = new Set(["worker", "soldier", "sentry", "scout", "drone", "swarm", "imp", "stalker", "charger"]);
  const findCreatures = (text: string, threatField = false): string[] => {
    const out: string[] = [];
    let rest = text.toLowerCase();
    const xenoContext = threatField || /xeno|alien|creature|monster|neomorph|hive|organism/.test(rest);
    for (const p of byLongestName) {
      const base = p.name.toLowerCase().replace(/\s*\(.*\)$/, "");
      if (!base || (GENERIC.has(base) && !xenoContext)) continue;
      if (mentions(rest, base) || mentions(rest, `${base}s`)) {
        out.push(p.id);
        rest = rest.replace(new RegExp(`\\b${escapeRe(base)}s?\\b`, "g"), " ");
      }
    }
    if (out.length === 0 && /\bxenomorph/.test(rest)) out.push(DEFAULT_THREAT.creature);
    return out;
  };
  for (const n of [1, 2, 3]) {
    for (const id of findCreatures(actTexts.get(n) ?? "")) {
      if (seen.has(id)) continue;
      seen.add(id);
      threats.push({ creature: id, act: n, count: 1 });
    }
  }
  for (const id of findCreatures(str(af.threats), true)) {
    if (seen.has(id)) continue;
    seen.add(id);
    // Threats named only in the notes: lesser foes open Act 1, the first greater one is the Act 2 hunter, overwhelming ones wait for Act 3.
    const tier = CREATURE_TIERS[id]?.tier;
    const strong = (t: ThreatInput) => CREATURE_TIERS[t.creature]?.tier !== "lesser";
    const act = tier === "overwhelming" ? 3 : tier === "greater" ? (threats.some((t) => t.act === 2 && strong(t)) ? 3 : 2) : threats.some((t) => t.act === 1) ? 2 : 1;
    threats.push({ creature: id, act, count: 1 });
  }

  const finale = [actTexts.get(3) ?? "", str(af.countdown), str(adventure.epilogue)].join("\n");
  const winPaths = WIN_WORDS.filter(([, re]) => re.test(finale)).map(([w]) => w);

  const siteText = [str(adventure.title), str(adventure.premise), str(adventure.playerIntro), str(adventure.gmSituation)].join("\n");
  const site = SITE_WORDS.find(([, re]) => re.test(siteText))?.[0];

  const out: Record<string, unknown> = {
    crew: Math.min(5, Math.max(1, pcs.length + npcMembers.length)),
    key_rooms: keyRooms,
    puzzles,
    npcs,
  };
  if (af.targetHours !== undefined) out.runtime_h = clampInt(af.targetHours, 1, 5, 4);
  if (threats.length > 0) out.threats = threats;
  if (winPaths.length > 0) out.win_paths = winPaths;
  if (site) out.site_type = site;
  return out;
}
