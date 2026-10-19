/**
 * Generated site maps: zone distances, the player projection, live table
 * state and the GM exports (zone key, distance table).
 *
 * Everything here reads the generic `SiteLayout` contract. Rules come from
 * the module's generator definition (`passable`, `rangeBands`, `legend`);
 * nothing in this file names a rule from any game.
 */
import {
  createRng,
  createTableRegistry,
  type GameModule,
  type MapBorderData,
  type MapGeneratorContext,
  type MapGeneratorDef,
  type MapGeneratorResult,
  type MapLegendEntry,
  type MapMarker,
  type MapZoneData,
  type RangeBandDef,
  type Rng,
  type SiteLayout,
  type TableRegistry,
} from "@campaign-forge/module-sdk";
import { newId, now } from "./ids";
import { clone } from "./paths";
import type { CampaignStore } from "./store";
import type { Id, SiteMap, SiteMapLiveState } from "./types";

export type LiveBorderOverride = SiteMapLiveState["borders"][string];

/** The part of a module the site map helpers read. */
export type MapModule = Pick<GameModule, "mapGenerators">;

/** The generator definition a map was made with, if the module has it. */
export function generatorFor(map: Pick<SiteMap, "generator">, module: MapModule | undefined): MapGeneratorDef | undefined {
  const id = map.generator?.id;
  if (!id) return undefined;
  return module?.mapGenerators?.find((g) => g.id === id);
}

// ---------------------------------------------------------------------------
// running a generator
// ---------------------------------------------------------------------------

export interface RunMapGeneratorOptions {
  seed: string;
  stageSeeds?: Record<string, string> | undefined;
}

/** The stage a named RNG stream belongs to: the stage id itself, or a stage id followed by "/", "." or ":". */
export function stageOfStream(stages: ReadonlyArray<{ id: string }>, stream: string): string | undefined {
  let best: string | undefined;
  for (const { id } of stages) {
    if (stream === id || stream.startsWith(`${id}/`) || stream.startsWith(`${id}.`) || stream.startsWith(`${id}:`)) {
      if (!best || id.length > best.length) best = id;
    }
  }
  return best;
}

/**
 * The context a generator runs with. `ctx.rng(stream)` is
 * `createRng(stageSeeds[stage] ?? seed).fork(stream)`, where `stage` is the
 * stage the stream belongs to, so re-running one stage with a new stage seed
 * changes only that stage's draws.
 */
export function mapGeneratorContext(tables: TableRegistry, def: Pick<MapGeneratorDef, "stages">, opts: RunMapGeneratorOptions): MapGeneratorContext {
  const stageSeeds = { ...(opts.stageSeeds ?? {}) };
  const ctx: MapGeneratorContext = {
    seed: opts.seed,
    rng: (stream: string): Rng => {
      const stage = stageOfStream(def.stages, stream);
      const base = (stage !== undefined ? stageSeeds[stage] : undefined) ?? opts.seed;
      return createRng(base).fork(stream);
    },
    tables,
  };
  if (Object.keys(stageSeeds).length > 0) ctx.stageSeeds = stageSeeds;
  return ctx;
}

/** Run a module's map generator. Same seed, stage seeds and inputs => same layout. */
export function runMapGenerator(module: Pick<GameModule, "tables">, def: MapGeneratorDef, inputs: Record<string, unknown>, opts: RunMapGeneratorOptions): MapGeneratorResult {
  return def.generate(inputs, mapGeneratorContext(createTableRegistry(module.tables), def, opts));
}

// ---------------------------------------------------------------------------
// border state and distances
// ---------------------------------------------------------------------------

export interface BorderStateOptions {
  act: number;
  live?: Pick<SiteMapLiveState, "borders"> | undefined;
  /** Module rule; the default treats walls, locked and sealed borders as impassable. */
  passable?: MapGeneratorDef["passable"] | undefined;
}

/** True when the border starts locked or closed in `act` (layout data only). */
export function lockedInAct(border: MapBorderData, act: number): boolean {
  return (border.lockedInActs ?? []).includes(act);
}

/**
 * The border as it stands in `act` with the live overrides applied, so a
 * module's `passable` rule reads live state as ordinary border data:
 * `locked` / `open` set the lock for this act, `sealed` seals it and
 * `destroyed` turns it into an open border.
 */
export function effectiveBorder(border: MapBorderData, act: number, override?: LiveBorderOverride): MapBorderData {
  if (!override) return border;
  const b: MapBorderData = { ...border };
  if (override.destroyed) {
    b.kind = "open";
    b.sealed = false;
    b.lockedInActs = [];
    return b;
  }
  const others = (border.lockedInActs ?? []).filter((a) => a !== act);
  if (override.locked === true) b.lockedInActs = [...others, act];
  if (override.locked === false || override.open === true) b.lockedInActs = others;
  if (override.sealed !== undefined) b.sealed = override.sealed;
  return b;
}

/** Generic passability: walls, sealed borders and borders locked in this act block movement. */
export function defaultPassable(border: MapBorderData, act: number): boolean {
  if (border.kind === "wall") return false;
  if (border.sealed) return false;
  if (lockedInAct(border, act)) return false;
  return true;
}

export interface BorderState {
  border: MapBorderData;
  locked: boolean;
  sealed: boolean;
  destroyed: boolean;
  passable: boolean;
}

/** The effective state of one border in an act, live overrides included. */
export function borderState(border: MapBorderData, opts: BorderStateOptions): BorderState {
  const override = opts.live?.borders[border.id];
  const eff = effectiveBorder(border, opts.act, override);
  const passable = opts.passable ? opts.passable(eff, opts.act) : defaultPassable(eff, opts.act);
  return { border: eff, locked: lockedInAct(eff, opts.act), sealed: !!eff.sealed, destroyed: !!override?.destroyed, passable };
}

/** zone id -> zone id -> number of borders crossed on the shortest passable path. Unreachable zones are absent. */
export type ZoneDistances = Record<string, Record<string, number>>;

function adjacency(layout: SiteLayout, opts: BorderStateOptions): Map<string, string[]> {
  const adj = new Map<string, string[]>();
  for (const z of layout.zones) adj.set(z.id, []);
  for (const b of layout.borders) {
    // hidden borders still count: the distance is the GM's truth
    if (!adj.has(b.a) || !adj.has(b.b) || b.a === b.b) continue;
    if (!borderState(b, opts).passable) continue;
    adj.get(b.a)!.push(b.b);
    adj.get(b.b)!.push(b.a);
  }
  return adj;
}

function bfs(adj: Map<string, string[]>, from: string): { dist: Map<string, number>; prev: Map<string, string> } {
  const dist = new Map<string, number>([[from, 0]]);
  const prev = new Map<string, string>();
  const queue = [from];
  for (let i = 0; i < queue.length; i++) {
    const cur = queue[i]!;
    const d = dist.get(cur)!;
    for (const n of adj.get(cur) ?? []) {
      if (dist.has(n)) continue;
      dist.set(n, d + 1);
      prev.set(n, cur);
      queue.push(n);
    }
  }
  return { dist, prev };
}

/**
 * Shortest passable path (breadth-first, one step per border) from every
 * zone to every zone it can reach in `act`, honouring per-act locks, live
 * overrides (locked, open, sealed, destroyed) and sealed access points.
 * Hidden borders stay passable: the table is the GM's.
 */
export function zoneDistances(layout: SiteLayout, opts: BorderStateOptions & { from?: string[] }): ZoneDistances {
  const adj = adjacency(layout, opts);
  const out: ZoneDistances = {};
  for (const id of opts.from ?? layout.zones.map((z) => z.id)) {
    if (!adj.has(id)) continue;
    out[id] = Object.fromEntries(bfs(adj, id).dist);
  }
  return out;
}

/** One shortest passable path from `from` to `to` (zone ids, both ends included), or undefined. */
export function zonePath(layout: SiteLayout, from: string, to: string, opts: BorderStateOptions): string[] | undefined {
  const adj = adjacency(layout, opts);
  if (!adj.has(from) || !adj.has(to)) return undefined;
  const { dist, prev } = bfs(adj, from);
  if (!dist.has(to)) return undefined;
  const path = [to];
  while (path[0] !== from) path.unshift(prev.get(path[0]!)!);
  return path;
}

/** The range band a zone distance falls in: the first band whose `maxDistance` covers it. */
export function rangeBandFor(distance: number | undefined, bands: RangeBandDef[] | undefined): RangeBandDef | undefined {
  if (distance === undefined || !bands) return undefined;
  return bands.find((b) => b.maxDistance === undefined || distance <= b.maxDistance);
}

// ---------------------------------------------------------------------------
// numbering and legend lookups
// ---------------------------------------------------------------------------

/** Map numbers: playable zones in layout order, floor zones first, then ducts. Out-of-bounds zones get none. */
export function zoneNumbers(layout: Pick<SiteLayout, "zones">): Map<string, number> {
  const out = new Map<string, number>();
  let n = 1;
  for (const z of layout.zones) if (z.kind !== "out-of-bounds" && z.layer !== "duct") out.set(z.id, n++);
  for (const z of layout.zones) if (z.kind !== "out-of-bounds" && z.layer === "duct") out.set(z.id, n++);
  return out;
}

export function isFlagTarget(t: MapLegendEntry["target"]): t is { flag: string; value?: unknown } {
  return "flag" in t;
}

/** True when a flag legend entry applies to a flag value. */
export function flagEntryMatches(entry: MapLegendEntry, flags: Record<string, unknown> | undefined): boolean {
  const t = entry.target;
  if (!isFlagTarget(t) || !flags) return false;
  const v = flags[t.flag];
  return "value" in t && t.value !== undefined ? v === t.value : !!v;
}

/** The legend's flag entries that apply to these flags. */
export function matchingFlagEntries(legend: MapLegendEntry[] | undefined, flags: Record<string, unknown> | undefined): MapLegendEntry[] {
  return (legend ?? []).filter((e) => flagEntryMatches(e, flags));
}

function humanizeKey(key: string): string {
  return key
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .replace(/^./, (c) => c.toUpperCase());
}

/** Readable labels for a zone's flags: legend labels when the module has flag entries, else the truthy flags by name. */
export function flagLabels(flags: Record<string, unknown> | undefined, legend: MapLegendEntry[] | undefined): string[] {
  if (!flags) return [];
  const hasFlagEntries = (legend ?? []).some((e) => isFlagTarget(e.target));
  if (hasFlagEntries) return matchingFlagEntries(legend, flags).map((e) => e.label);
  return Object.entries(flags)
    .filter(([, v]) => v !== false && v !== undefined && v !== null && v !== 0 && v !== "")
    .map(([k, v]) => (v === true ? humanizeKey(k) : `${humanizeKey(k)}: ${String(v)}`));
}

export function borderKindLabel(kind: MapBorderData["kind"], legend: MapLegendEntry[] | undefined): string {
  const e = (legend ?? []).find((x) => "border" in x.target && x.target.border === kind);
  return e?.label ?? kind;
}

// ---------------------------------------------------------------------------
// the player projection
// ---------------------------------------------------------------------------

/** Marker kinds that never reach a player output, whatever their `gmOnly` says. */
export const GM_MARKER_KINDS: ReadonlySet<MapMarker["kind"]> = new Set(["spawn", "clue", "npc", "waypoint"]);

/** Border flags the renderer draws and players can see (wall weight). */
const PLAYER_BORDER_FLAGS = new Set(["outerHull"]);

export interface PlayerLayoutOptions {
  act: number;
  /** Zones the players have seen; when given (and not printing) every other zone is fogged. */
  revealed?: Id[] | undefined;
  /** Printing shows the whole map (no fog); GM-only data is still removed. */
  print?: boolean;
  /** The module legend: flags with a player-visible legend entry stay. */
  legend?: MapLegendEntry[] | undefined;
  /** Live border overrides: `known` borders and locks show, live seals show. */
  live?: Pick<SiteMapLiveState, "borders"> | undefined;
}

/** A layout fit for players, plus the zones drawn as fog. */
export interface PlayerLayout extends SiteLayout {
  fogged: Id[];
}

function playerFlags(flags: Record<string, unknown> | undefined, visible: Set<string>): Record<string, unknown> | undefined {
  if (!flags) return undefined;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(flags)) if (visible.has(k) && (typeof v === "boolean" || typeof v === "number" || typeof v === "string")) out[k] = v;
  return Object.keys(out).length ? out : undefined;
}

/** Flag names the legend shows to players. */
export function playerFlagNames(legend: MapLegendEntry[] | undefined): Set<string> {
  const out = new Set<string>();
  for (const e of legend ?? []) if (isFlagTarget(e.target) && !e.gmOnly) out.add(e.target.flag);
  return out;
}

/**
 * The player projection of a layout. It is built by copying allowed fields
 * (never by deleting forbidden ones), so new GM fields cannot leak by default:
 * - zones keep id, deck, kind, layer, outline, area, cluttered, key, the name
 *   of key zones, the player note and legend-visible flags; GM notes, act
 *   shading, details and salvage are dropped;
 * - fogged zones keep only id, deck, kind, layer and outline;
 * - hidden borders are dropped unless the live state marks them `known`;
 *   locks show only when `known`; armor, hit points and GM flags are dropped;
 * - markers keep only player kinds (start, win, label, hazard) that are not
 *   `gmOnly`, without their act or data, and only in visible zones;
 * - checks are dropped.
 */
export function playerLayout(layout: SiteLayout, opts: PlayerLayoutOptions): PlayerLayout {
  const visibleFlags = playerFlagNames(opts.legend);
  const revealed = opts.revealed && !opts.print ? new Set(opts.revealed) : undefined;
  const fogged = new Set<string>();
  const borderLive = opts.live?.borders ?? {};

  // borders first: a duct reached only by hidden borders is a secret network
  const shownBorders = layout.borders.filter((b) => !b.hidden || borderLive[b.id]?.known === true);
  const touched = new Set<string>();
  for (const b of shownBorders) {
    touched.add(b.a);
    touched.add(b.b);
  }
  const secret = new Set<string>();
  for (const z of layout.zones) {
    if (z.layer !== "duct") continue;
    const all = layout.borders.filter((b) => b.a === z.id || b.b === z.id);
    if (all.length > 0 && !touched.has(z.id)) secret.add(z.id);
  }

  const zones: MapZoneData[] = [];
  for (const z of layout.zones) {
    if (secret.has(z.id)) continue;
    const isFogged = !!revealed && z.kind !== "out-of-bounds" && !revealed.has(z.id);
    const base: MapZoneData = { id: z.id, deck: z.deck, kind: z.kind, poly: z.poly.map((p) => [p[0], p[1]] as [number, number]), cluttered: false };
    if (z.layer) base.layer = z.layer;
    if (isFogged) {
      fogged.add(z.id);
      zones.push(base);
      continue;
    }
    // duct zones are outlines only
    if (z.layer === "duct") {
      zones.push(base);
      continue;
    }
    base.cluttered = z.cluttered;
    if (z.area !== undefined) base.area = z.area;
    if (z.key) {
      base.key = true;
      if (z.name !== undefined) base.name = z.name;
    }
    if (z.playerNote !== undefined) base.playerNote = z.playerNote;
    const flags = playerFlags(z.flags, visibleFlags);
    if (flags) base.flags = flags;
    zones.push(base);
  }
  const zoneIds = new Set(zones.map((z) => z.id));

  const borders: MapBorderData[] = [];
  for (const b of shownBorders) {
    if (!zoneIds.has(b.a) || !zoneIds.has(b.b)) continue;
    // walls deep in the fog stay hidden
    if (fogged.has(b.a) && fogged.has(b.b)) continue;
    const live = borderLive[b.id];
    const eff = effectiveBorder(b, opts.act, live);
    const out: MapBorderData = { id: b.id, a: b.a, b: b.b, kind: eff.kind };
    if (b.segment) out.segment = [[b.segment[0][0], b.segment[0][1]], [b.segment[1][0], b.segment[1][1]]];
    if (typeof b.armor === "number" && b.armor >= 4) out.armor = b.armor;
    if (eff.sealed) out.sealed = true;
    if (live?.known === true && lockedInAct(eff, opts.act)) {
      out.lockedInActs = [opts.act];
      if (b.lock) out.lock = b.lock;
    }
    if (b.flags) {
      const f: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(b.flags)) if ((PLAYER_BORDER_FLAGS.has(k) || visibleFlags.has(k)) && typeof v === "boolean") f[k] = v;
      if (Object.keys(f).length) out.flags = f;
    }
    borders.push(out);
  }

  const markers: MapMarker[] = [];
  for (const m of layout.markers) {
    if (m.gmOnly || GM_MARKER_KINDS.has(m.kind)) continue;
    if (!zoneIds.has(m.zone) || fogged.has(m.zone)) continue;
    markers.push({ id: m.id, kind: m.kind, zone: m.zone, label: m.label, gmOnly: false });
  }

  const out: PlayerLayout = {
    decks: layout.decks.map((d) => ({ id: d.id, name: d.name, width: d.width, height: d.height })),
    zones,
    borders,
    markers,
    checks: [],
    fogged: [...fogged],
  };
  if (layout.start && zoneIds.has(layout.start)) out.start = layout.start;
  if (layout.gridM !== undefined) out.gridM = layout.gridM;
  return out;
}

export interface PlayerLiveState {
  zoneFlags: Record<Id, Record<string, unknown>>;
  tokens: Array<{ id: Id; label: string; zone: Id }>;
}

/** Live state for players: visible tokens and legend-visible zone flags in zones they can see. Pings stay with the GM. */
export function playerLive(live: SiteMapLiveState | undefined, projected: PlayerLayout, legend: MapLegendEntry[] | undefined): PlayerLiveState {
  const visible = new Set(projected.zones.filter((z) => !projected.fogged.includes(z.id)).map((z) => z.id));
  const flagNames = playerFlagNames(legend);
  const zoneFlags: PlayerLiveState["zoneFlags"] = {};
  for (const [zone, flags] of Object.entries(live?.zoneFlags ?? {})) {
    if (!visible.has(zone)) continue;
    const f = playerFlags(flags, flagNames);
    if (f) zoneFlags[zone] = f;
  }
  const tokens = (live?.tokens ?? []).filter((t) => !t.gmOnly && visible.has(t.zone)).map((t) => ({ id: t.id, label: t.label, zone: t.zone }));
  return { zoneFlags, tokens };
}

// ---------------------------------------------------------------------------
// live table state
// ---------------------------------------------------------------------------

export function emptyLive(act = 1): SiteMapLiveState {
  return { act, revealed: [], borders: {}, zoneFlags: {}, tokens: [], pings: [] };
}

/** The map's live state, with defaults for missing parts. */
export function liveOf(map: Pick<SiteMap, "live">): SiteMapLiveState {
  const l = map.live;
  if (!l) return emptyLive();
  return {
    act: typeof l.act === "number" ? l.act : 1,
    revealed: Array.isArray(l.revealed) ? l.revealed : [],
    borders: l.borders ?? {},
    zoneFlags: l.zoneFlags ?? {},
    tokens: Array.isArray(l.tokens) ? l.tokens : [],
    pings: Array.isArray(l.pings) ? l.pings : [],
  };
}

function writeLive(store: CampaignStore, mapId: Id, fn: (live: SiteMapLiveState, map: SiteMap) => SiteMapLiveState | void): SiteMapLiveState {
  return store.transact(() => {
    const map = store.get("maps", mapId);
    if (!map) throw new Error(`maps/${mapId} not found`);
    const live = clone(liveOf(map));
    const next = fn(live, map) ?? live;
    store.update("maps", mapId, { live: next });
    return next;
  });
}

/** Start (or restart) live play on a map: the act, a clean slate, and the start zone revealed. */
export function startLive(store: CampaignStore, mapId: Id, act = 1): SiteMapLiveState {
  return writeLive(store, mapId, (_l, map) => {
    const live = emptyLive(act);
    if (map.layout?.start) live.revealed = [map.layout.start];
    return live;
  });
}

/**
 * Change the act. Lock overrides (`locked`, `open`) belong to the act, so they
 * are cleared and the new act's locks come from the layout; physical changes
 * (`sealed`, `destroyed`) and what the players found (`known`) stay, as do
 * fog, tokens and zone flags.
 */
export function setAct(store: CampaignStore, mapId: Id, act: number): SiteMapLiveState {
  return writeLive(store, mapId, (live) => {
    if (live.act !== act) {
      const kept: SiteMapLiveState["borders"] = {};
      for (const [id, o] of Object.entries(live.borders)) {
        const k: LiveBorderOverride = {};
        if (o.sealed !== undefined) k.sealed = o.sealed;
        if (o.destroyed) k.destroyed = true;
        if (o.known) k.known = true;
        if (Object.keys(k).length) kept[id] = k;
      }
      live.borders = kept;
    }
    live.act = act;
  });
}

/** Reveal (or re-fog with `reveal: false`) zones on the player map. */
export function revealZones(store: CampaignStore, mapId: Id, zones: Id[], reveal = true): SiteMapLiveState {
  return writeLive(store, mapId, (live) => {
    const set = new Set(live.revealed);
    for (const z of zones) {
      if (reveal) set.add(z);
      else set.delete(z);
    }
    live.revealed = [...set];
  });
}

/** Merge an override into a border's live state; `undefined` values clear that part, `null` clears the override. */
export function setBorderState(store: CampaignStore, mapId: Id, borderId: Id, patch: Partial<LiveBorderOverride> | null): SiteMapLiveState {
  return writeLive(store, mapId, (live) => {
    if (patch === null) {
      delete live.borders[borderId];
      return;
    }
    const next: Record<string, unknown> = { ...(live.borders[borderId] ?? {}) };
    for (const [k, v] of Object.entries(patch)) {
      if (v === undefined) delete next[k];
      else next[k] = v;
    }
    if (Object.keys(next).length) live.borders[borderId] = next as LiveBorderOverride;
    else delete live.borders[borderId];
  });
}

/** Set a module-defined flag on a zone during play; `undefined` or `false` clears it. */
export function setZoneFlag(store: CampaignStore, mapId: Id, zoneId: Id, flag: string, value: unknown): SiteMapLiveState {
  return writeLive(store, mapId, (live) => {
    const flags = { ...(live.zoneFlags[zoneId] ?? {}) };
    if (value === undefined || value === false) delete flags[flag];
    else flags[flag] = value;
    if (Object.keys(flags).length) live.zoneFlags[zoneId] = flags;
    else delete live.zoneFlags[zoneId];
  });
}

export interface NewToken {
  label: string;
  zone: Id;
  gmOnly?: boolean;
  entity?: Id;
}

/** Place a token on a zone. Returns its id. */
export function placeToken(store: CampaignStore, mapId: Id, token: NewToken): Id {
  const id = newId();
  writeLive(store, mapId, (live) => {
    const t: SiteMapLiveState["tokens"][number] = { id, label: token.label, zone: token.zone, gmOnly: token.gmOnly ?? false };
    if (token.entity) t.entity = token.entity;
    live.tokens.push(t);
  });
  return id;
}

export function moveToken(store: CampaignStore, mapId: Id, tokenId: Id, zone: Id): SiteMapLiveState {
  return writeLive(store, mapId, (live) => {
    const t = live.tokens.find((x) => x.id === tokenId);
    if (!t) throw new Error(`token ${tokenId} not found`);
    t.zone = zone;
  });
}

export function updateToken(store: CampaignStore, mapId: Id, tokenId: Id, patch: Partial<Pick<NewToken, "label" | "gmOnly">>): SiteMapLiveState {
  return writeLive(store, mapId, (live) => {
    const t = live.tokens.find((x) => x.id === tokenId);
    if (!t) throw new Error(`token ${tokenId} not found`);
    if (patch.label !== undefined) t.label = patch.label;
    if (patch.gmOnly !== undefined) t.gmOnly = patch.gmOnly;
  });
}

export function removeToken(store: CampaignStore, mapId: Id, tokenId: Id): SiteMapLiveState {
  return writeLive(store, mapId, (live) => {
    live.tokens = live.tokens.filter((t) => t.id !== tokenId);
  });
}

/** Add a tracker ping on a zone (GM-only; cleared each stretch). */
export function addPing(store: CampaignStore, mapId: Id, zone: Id, at: string = now()): SiteMapLiveState {
  return writeLive(store, mapId, (live) => {
    live.pings.push({ zone, at });
  });
}

export function clearPings(store: CampaignStore, mapId: Id): SiteMapLiveState {
  return writeLive(store, mapId, (live) => {
    live.pings = [];
  });
}

// ---------------------------------------------------------------------------
// exports: zone key and distance table
// ---------------------------------------------------------------------------

export interface ZoneKeyRow {
  number: number | undefined;
  id: string;
  name: string;
  kind: string;
  deck: string;
  cover: "cluttered" | "open";
  flags: string[];
  exits: Array<{ zone: string; number: number | undefined; name: string; kind: string; notes: string[] }>;
  details: string[];
  salvage: string[];
  clues: string[];
  gmNote: string;
}

function zoneName(z: MapZoneData | undefined, fallback: string): string {
  return z?.name ?? (z ? humanizeKey(z.kind) : fallback);
}

/** One row per playable zone, in map-number order: the GM's zone key. */
export function zoneKeyRows(map: Pick<SiteMap, "layout" | "generator">, module?: MapModule): ZoneKeyRow[] {
  const layout = map.layout;
  if (!layout) return [];
  const legend = generatorFor(map, module)?.legend;
  const numbers = zoneNumbers(layout);
  const byId = new Map(layout.zones.map((z) => [z.id, z]));
  const rows: ZoneKeyRow[] = [];
  const ordered = [...numbers.keys()].map((id) => byId.get(id)!);
  for (const z of ordered) {
    const exits: ZoneKeyRow["exits"] = [];
    for (const b of layout.borders) {
      if (b.a !== z.id && b.b !== z.id) continue;
      const other = b.a === z.id ? b.b : b.a;
      const notes: string[] = [];
      if (b.lock && b.lock !== "none") notes.push(`${b.lock} lock`);
      if (b.lockedInActs?.length) notes.push(`locked in act ${b.lockedInActs.join(", ")}`);
      if (b.sealed) notes.push("sealed");
      if (b.hidden) notes.push("hidden");
      if (typeof b.armor === "number") notes.push(`armor ${b.armor}`);
      if (typeof b.hp === "number") notes.push(`${b.hp} HP`);
      notes.push(...flagLabels(b.flags, legend));
      exits.push({ zone: other, number: numbers.get(other), name: zoneName(byId.get(other), other), kind: borderKindLabel(b.kind, legend), notes });
    }
    rows.push({
      number: numbers.get(z.id),
      id: z.id,
      name: zoneName(z, z.id),
      kind: z.kind,
      deck: z.deck,
      cover: z.cluttered ? "cluttered" : "open",
      flags: flagLabels(z.flags, legend),
      exits,
      details: z.details ?? [],
      salvage: z.salvage ?? [],
      clues: layout.markers.filter((m) => m.kind === "clue" && m.zone === z.id).map((m) => m.label),
      gmNote: z.gmNote ?? "",
    });
  }
  return rows;
}

function exitText(e: ZoneKeyRow["exits"][number]): string {
  const who = e.number !== undefined ? `${e.number} ${e.name}` : e.name;
  return `${who} (${[e.kind, ...e.notes].join(", ")})`;
}

function mdCell(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/\|/g, "\\|").replace(/\r?\n/g, " ");
}

/** The zone key as a Markdown table. */
export function zoneKeyMarkdown(map: Pick<SiteMap, "layout" | "generator" | "name">, module?: MapModule): string {
  const rows = zoneKeyRows(map, module);
  const lines = [
    `# ${map.name}: zone key`,
    "",
    "| # | Zone | Cover | Flags | Exits | Details | Salvage | Clues | GM note |",
    "| --- | --- | --- | --- | --- | --- | --- | --- | --- |",
  ];
  for (const r of rows) {
    const cells = [
      r.number !== undefined ? String(r.number) : "",
      `${r.name} (${r.id})`,
      r.cover,
      r.flags.join(", "),
      r.exits.map(exitText).join("; "),
      r.details.join("; "),
      r.salvage.join("; "),
      r.clues.join("; "),
      r.gmNote,
    ];
    lines.push(`| ${cells.map(mdCell).join(" | ")} |`);
  }
  return `${lines.join("\n")}\n`;
}

function csvCell(v: unknown): string {
  const s = v === undefined || v === null ? "" : String(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(rows: unknown[][]): string {
  return `${rows.map((r) => r.map(csvCell).join(",")).join("\r\n")}\r\n`;
}

/** The zone key as CSV (one row per zone). */
export function zoneKeyCsv(map: Pick<SiteMap, "layout" | "generator">, module?: MapModule): string {
  const rows: unknown[][] = [["number", "id", "name", "kind", "deck", "cover", "flags", "exits", "details", "salvage", "clues", "gm_note"]];
  for (const r of zoneKeyRows(map, module)) {
    rows.push([r.number ?? "", r.id, r.name, r.kind, r.deck, r.cover, r.flags.join("; "), r.exits.map(exitText).join("; "), r.details.join("; "), r.salvage.join("; "), r.clues.join("; "), r.gmNote]);
  }
  return toCsv(rows);
}

export interface DistanceTableOptions {
  /** Key zones (and the start) only; default true. */
  keyOnly?: boolean;
  /** Act whose border states apply; defaults to the live act, else 1. */
  act?: number;
  module?: MapModule | undefined;
  /** Apply the live border overrides (default true). */
  useLive?: boolean;
}

export interface DistanceTable {
  act: number;
  zones: Array<{ id: string; number: number | undefined; name: string }>;
  bands: RangeBandDef[];
  /** from -> to -> distance; unreachable pairs are absent. */
  distance: ZoneDistances;
  /** from -> to -> range band id. */
  band: Record<string, Record<string, string>>;
}

/** Zone-to-zone distances and range bands for the key zones (or every zone). */
export function distanceTable(map: Pick<SiteMap, "layout" | "generator" | "live">, opts: DistanceTableOptions = {}): DistanceTable {
  const layout = map.layout;
  const act = opts.act ?? map.live?.act ?? 1;
  const def = generatorFor(map, opts.module);
  const bands = def?.rangeBands ?? [];
  if (!layout) return { act, zones: [], bands, distance: {}, band: {} };
  const numbers = zoneNumbers(layout);
  const keyOnly = opts.keyOnly ?? true;
  const picked = layout.zones.filter((z) => numbers.has(z.id) && (!keyOnly || z.key || z.id === layout.start));
  const ids = picked.map((z) => z.id);
  const all = zoneDistances(layout, { act, live: opts.useLive === false ? undefined : map.live, passable: def?.passable, from: ids });
  const distance: ZoneDistances = {};
  const band: DistanceTable["band"] = {};
  for (const a of ids) {
    distance[a] = {};
    band[a] = {};
    for (const b of ids) {
      const d = all[a]?.[b];
      if (d === undefined) continue;
      distance[a]![b] = d;
      const rb = rangeBandFor(d, bands);
      if (rb) band[a]![b] = rb.id;
    }
  }
  return { act, zones: picked.map((z) => ({ id: z.id, number: numbers.get(z.id), name: zoneName(z, z.id) })), bands, distance, band };
}

/** The distance table as CSV: one row per zone pair (from, to, distance, range band). */
export function distanceTableCsv(map: Pick<SiteMap, "layout" | "generator" | "live">, opts: DistanceTableOptions = {}): string {
  const t = distanceTable(map, opts);
  const bandLabel = new Map(t.bands.map((b) => [b.id, b.label]));
  const rows: unknown[][] = [["from_number", "from_id", "from_name", "to_number", "to_id", "to_name", "distance", "range_band"]];
  for (const a of t.zones) {
    for (const b of t.zones) {
      const d = t.distance[a.id]?.[b.id];
      const band = t.band[a.id]?.[b.id];
      rows.push([a.number ?? "", a.id, a.name, b.number ?? "", b.id, b.name, d ?? "unreachable", band ? (bandLabel.get(band) ?? band) : ""]);
    }
  }
  return toCsv(rows);
}

/** The distance table as JSON. */
export function distanceTableJson(map: Pick<SiteMap, "layout" | "generator" | "live">, opts: DistanceTableOptions = {}): string {
  return `${JSON.stringify(distanceTable(map, opts), null, 2)}\n`;
}
