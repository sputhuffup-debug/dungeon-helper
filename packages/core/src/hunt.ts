/**
 * The live hunt on a generated site map: hidden threat tokens the GM moves
 * zone by zone, suggested moves, sensor sweeps and the blips they leave.
 *
 * Everything here reads the module's `MapGeneratorDef.hunt` (movers, sensors,
 * steps, blip letters) and the generic layout and live state; nothing names a
 * rule from any game. Suggestions are pure and seeded: the same live state,
 * seed and module give the same suggestion, and nothing moves until the GM
 * accepts it.
 *
 * Projection: `playerTracker` is all the players get (blip letters, range
 * bands and directions); hidden tokens, trails, suggestions and the zones
 * behind blips stay in the GM's live state.
 */
import {
  createRng,
  evaluateLogic,
  evaluateNumber,
  type JsonLogicRule,
  type MapGeneratorDef,
  type MapHuntDef,
  type MapMarker,
  type MapMoverDef,
  type MapMoverPreference,
  type MapSensorDef,
  type MapZoneData,
  type RangeBandDef,
  type SiteLayout,
} from "@campaign-forge/module-sdk";
import { newId, now } from "./ids";
import { graphSearch, isDuctSheet, liveOf, rangeBandFor, updateLive, zoneGraph, zoneLayer } from "./sitemap";
import type { CampaignStore } from "./store";
import type { Entity, HuntBlip, HuntState, HuntSweep, HuntToken, HuntTokenState, Id, SiteMap, SiteMapLiveState } from "./types";

/** Letters blips take when the module names none. */
export const DEFAULT_BLIP_LETTERS: readonly string[] = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");
/** Sweeps the live state keeps. */
export const MAX_SWEEPS = 12;
const DEFAULT_TRAIL = 4;
const DEFAULT_JITTER = 0.3;

/** The hunt part of a map's live state, with defaults. */
export function huntOf(live: Pick<SiteMapLiveState, "hunt"> | undefined): HuntState {
  const h = live?.hunt;
  return {
    step: typeof h?.step === "number" ? h.step : 0,
    ...(h?.stepKind ? { stepKind: h.stepKind } : {}),
    tokens: Array.isArray(h?.tokens) ? h.tokens : [],
    sweeps: Array.isArray(h?.sweeps) ? h.sweeps : [],
  };
}

function editHunt(store: CampaignStore, mapId: Id, fn: (hunt: HuntState, live: SiteMapLiveState, map: SiteMap) => void): HuntState {
  const live = updateLive(store, mapId, (l, map) => {
    const hunt = huntOf(l);
    fn(hunt, l, map);
    l.hunt = hunt;
  });
  return huntOf(live);
}

function tokenIn(hunt: HuntState, tokenId: Id): HuntToken {
  const t = hunt.tokens.find((x) => x.id === tokenId);
  if (!t) throw new Error(`hunt token ${tokenId} not found`);
  return t;
}

// ---------------------------------------------------------------------------
// sources: what a hidden token is made from
// ---------------------------------------------------------------------------

/** A marker or entity a hidden token can be made from, with its mover kind. */
export interface HuntSource {
  key: string;
  label: string;
  mover: string;
  zone?: Id;
  marker?: string;
  entity?: Id;
  data: Record<string, unknown>;
  route?: Id[];
}

const when = (rule: JsonLogicRule | undefined, data: unknown): boolean => (rule === undefined ? true : !!evaluateLogic(rule, data));

/** The first mover kind a marker makes, if any. */
export function moverForMarker(hunt: MapHuntDef, marker: MapMarker): MapMoverDef | undefined {
  return hunt.movers.find((m) => (m.from?.markers ?? []).some((f) => f.kind === marker.kind && when(f.when, marker.data ?? {})));
}

/** The first mover kind an entity makes, if any. */
export function moverForEntity(hunt: MapHuntDef, entity: Pick<Entity, "type" | "subtype" | "tags" | "fields">): MapMoverDef | undefined {
  const data = { type: entity.type, subtype: entity.subtype, tags: entity.tags, fields: entity.fields };
  return hunt.movers.find((m) => (m.from?.entities ?? []).some((f) => f.type === entity.type && when(f.when, data)));
}

const primitive = (v: unknown): boolean => typeof v === "string" || typeof v === "number" || typeof v === "boolean";

function primitives(rec: Record<string, unknown> | undefined): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(rec ?? {})) if (primitive(v)) out[k] = v;
  return out;
}

/** A marker's patrol waypoints: waypoint markers whose data names it, in their `order`. */
export function routeOf(layout: Pick<SiteLayout, "markers">, marker: MapMarker): Id[] {
  return layout.markers
    .filter((w) => w.kind === "waypoint" && Object.values(w.data ?? {}).includes(marker.id))
    .sort((a, b) => Number(a.data?.order ?? 0) - Number(b.data?.order ?? 0))
    .map((w) => w.zone);
}

/** The map's markers that make hidden tokens (spawns, hostiles, NPC marks ...), for the act given (markers without an act always). */
export function huntMarkerSources(layout: SiteLayout, hunt: MapHuntDef, act?: number): HuntSource[] {
  const out: HuntSource[] = [];
  for (const m of layout.markers) {
    if (act !== undefined && m.act !== undefined && m.act !== act) continue;
    const mover = moverForMarker(hunt, m);
    if (!mover) continue;
    const route = routeOf(layout, m);
    out.push({ key: `marker:${m.id}`, label: m.label, mover: mover.id, zone: m.zone, marker: m.id, data: primitives(m.data), ...(route.length ? { route } : {}) });
  }
  return out;
}

/** Campaign entities that make hidden tokens (creatures, NPCs), each with its mover kind. */
export function huntEntitySources(entities: Entity[], hunt: MapHuntDef): HuntSource[] {
  const out: HuntSource[] = [];
  for (const e of entities) {
    const mover = moverForEntity(hunt, e);
    if (mover) out.push({ key: `entity:${e.id}`, label: e.name, mover: mover.id, entity: e.id, data: primitives(e.fields) });
  }
  return out;
}

/** Where a hidden token can come from, grouped for the GM's picker. */
export interface HuntSourceGroups {
  /** The map's marks that are not people (spawns, hostile groups), every act's. */
  marks: HuntSource[];
  /**
   * The people on the map: one source per person across acts (an NPC mark
   * per act becomes one, in the given act's zone when it has one), merged
   * with the campaign record of the same name.
   */
  npcs: HuntSource[];
  /** Other campaign records (creatures, people the map does not place). */
  cast: HuntSource[];
}

/**
 * The hidden-token sources of a map, grouped and deduplicated: marks, the
 * NPCs on this map (people marks, once per person, with their record) and
 * the rest of the cast. Sources already on the map (`placed`: marker and
 * entity ids of its tokens) are left out.
 */
export function huntSourceGroups(layout: SiteLayout, hunt: MapHuntDef, entities: Entity[], opts: { act?: number; placed?: Iterable<string> } = {}): HuntSourceGroups {
  const placed = new Set(opts.placed ?? []);
  const kindOf = new Map(layout.markers.map((m) => [m.id, m]));
  const all = huntMarkerSources(layout, hunt);
  const marks = all.filter((s) => kindOf.get(s.marker ?? "")?.kind !== "npc" && !placed.has(s.marker ?? ""));
  const cast = huntEntitySources(entities, hunt);
  const byName = new Map<string, HuntSource[]>();
  for (const s of all) {
    const m = kindOf.get(s.marker ?? "");
    if (m?.kind !== "npc") continue;
    const name = (typeof m.data?.name === "string" ? m.data.name : m.label).trim().toLowerCase();
    byName.set(name, [...(byName.get(name) ?? []), s]);
  }
  const merged = new Set<string>();
  const npcs: HuntSource[] = [];
  for (const [name, group] of byName) {
    const actOf = (s: HuntSource) => kindOf.get(s.marker ?? "")?.act;
    const pick = group.find((s) => opts.act !== undefined && actOf(s) === opts.act) ?? group.find((s) => actOf(s) === undefined) ?? [...group].sort((a, b) => (actOf(a) ?? 0) - (actOf(b) ?? 0))[0]!;
    const entity = cast.find((c) => c.label.trim().toLowerCase() === name);
    if (entity) merged.add(entity.key);
    if (group.some((s) => placed.has(s.marker ?? "")) || (entity?.entity && placed.has(entity.entity))) continue;
    npcs.push(entity ? { ...pick, label: entity.label, entity: entity.entity!, data: { ...entity.data, ...pick.data } } : pick);
  }
  return { marks, npcs, cast: cast.filter((c) => !merged.has(c.key) && !placed.has(c.entity ?? "")) };
}

// ---------------------------------------------------------------------------
// tokens
// ---------------------------------------------------------------------------

export interface NewHuntToken {
  label: string;
  zone: Id;
  mover: string;
  marker?: string | undefined;
  entity?: Id | undefined;
  data?: Record<string, unknown> | undefined;
  route?: Id[] | undefined;
  state?: HuntTokenState | undefined;
}

/** Place a hidden threat token. Returns its id. */
export function placeHuntToken(store: CampaignStore, mapId: Id, input: NewHuntToken): Id {
  const id = newId();
  editHunt(store, mapId, (hunt) => {
    const t: HuntToken = { id, label: input.label, zone: input.zone, mover: input.mover, state: input.state ?? "hidden", home: input.zone, trail: [] };
    if (input.marker) t.marker = input.marker;
    if (input.entity) t.entity = input.entity;
    if (input.data && Object.keys(input.data).length) t.data = { ...input.data };
    if (input.route?.length) {
      t.route = [...input.route];
      t.routeAt = 0;
    }
    hunt.tokens.push(t);
  });
  return id;
}

/** Place a token from a source at a zone (its own zone by default). */
export function placeHuntSource(store: CampaignStore, mapId: Id, source: HuntSource, zone?: Id): Id {
  const at = zone ?? source.zone;
  if (!at) throw new Error(`${source.label} has no zone: pick one`);
  return placeHuntToken(store, mapId, { label: source.label, zone: at, mover: source.mover, marker: source.marker, entity: source.entity, data: source.data, route: source.route });
}

/**
 * Move a token (the GM accepted a suggestion, picked a zone or dragged it).
 * The zones it passed through (`path`, both ends included) join its trail;
 * the move is stamped with the current step, which movement-only sensors read.
 */
export function moveHuntToken(store: CampaignStore, mapId: Id, tokenId: Id, zone: Id, opts: { path?: Id[] | undefined; trail?: number | undefined } = {}): HuntState {
  return editHunt(store, mapId, (hunt) => applyHuntMove(hunt, tokenId, zone, opts));
}

/** `moveHuntToken` on a hunt state in hand (a copy the caller owns): trail, step stamp and patrol route. */
export function applyHuntMove(hunt: HuntState, tokenId: Id, zone: Id, opts: { path?: Id[] | undefined; trail?: number | undefined } = {}): void {
  const t = tokenIn(hunt, tokenId);
  if (zone === t.zone) return;
  const passed = opts.path && opts.path[0] === t.zone && opts.path[opts.path.length - 1] === zone ? opts.path.slice(0, -1) : [t.zone];
  t.trail = [...t.trail, ...passed].slice(-(opts.trail ?? DEFAULT_TRAIL));
  t.zone = zone;
  t.movedAt = hunt.step;
  if (t.route?.length) {
    // reaching the next waypoint (or any later one) moves the patrol on
    const at = t.route.indexOf(zone, t.routeAt ?? 0);
    if (at >= 0) t.routeAt = (at + 1) % t.route.length;
  }
}

/**
 * Set a token's state. Seen (the GM reveals it) puts it on the player map:
 * `reveal` also reveals its zone, and the blip letter is retired unless
 * `keepLetter` (the physical signal token stays with it). Hidden or gone
 * keeps the letter as it is.
 */
export function setHuntTokenState(store: CampaignStore, mapId: Id, tokenId: Id, state: HuntTokenState, opts: { keepLetter?: boolean; reveal?: boolean } = {}): HuntState {
  return editHunt(store, mapId, (hunt, live) => {
    const t = tokenIn(hunt, tokenId);
    t.state = state;
    if (state === "seen") {
      if (!opts.keepLetter) delete t.letter;
      if (opts.reveal !== false && !live.revealed.includes(t.zone)) live.revealed = [...live.revealed, t.zone];
    }
    if (state === "gone") delete t.letter;
  });
}

/**
 * Name a token's blip by hand (e.g. the physical signal token on the table),
 * or clear it with undefined. A letter another token holds is swapped.
 */
export function setHuntLetter(store: CampaignStore, mapId: Id, tokenId: Id, letter: string | undefined): HuntState {
  return editHunt(store, mapId, (hunt) => {
    const t = tokenIn(hunt, tokenId);
    const old = t.letter;
    if (letter) {
      const holder = hunt.tokens.find((x) => x.id !== t.id && x.letter === letter);
      if (holder) {
        if (old) holder.letter = old;
        else delete holder.letter;
      }
      t.letter = letter;
    } else delete t.letter;
  });
}

export function setHuntHurt(store: CampaignStore, mapId: Id, tokenId: Id, hurt: boolean): HuntState {
  return editHunt(store, mapId, (hunt) => {
    const t = tokenIn(hunt, tokenId);
    if (hurt) t.hurt = true;
    else delete t.hurt;
  });
}

export function removeHuntToken(store: CampaignStore, mapId: Id, tokenId: Id): HuntState {
  return editHunt(store, mapId, (hunt) => {
    hunt.tokens = hunt.tokens.filter((t) => t.id !== tokenId);
  });
}

/**
 * A step passes (a stretch, a round): the step count goes up and this step's
 * blips go stale, so detected tokens are hidden again until the next sweep.
 */
export function advanceHunt(store: CampaignStore, mapId: Id, stepKind?: string): HuntState {
  return editHunt(store, mapId, (hunt) => applyHuntAdvance(hunt, stepKind));
}

/** `advanceHunt` on a hunt state in hand. */
export function applyHuntAdvance(hunt: HuntState, stepKind?: string): void {
  hunt.step += 1;
  if (stepKind) hunt.stepKind = stepKind;
  for (const t of hunt.tokens) if (t.state === "detected") t.state = "hidden";
}

// ---------------------------------------------------------------------------
// suggested moves
// ---------------------------------------------------------------------------

/** One place a token could go, with its score and the reasons for it. */
export interface HuntMoveOption {
  zone: Id;
  /** Zones from where it is to there, both ends included (one zone when it stays). */
  path: Id[];
  score: number;
  reasons: string[];
}

export interface HuntMoveSuggestion {
  token: Id;
  from: Id;
  mover: string;
  /** Zones it may move this step. */
  reach: number;
  best: HuntMoveOption;
  /** The next best zone, when there is another. */
  alternative?: HuntMoveOption;
  /** Every reachable zone, best first (for "pick another zone"). */
  options: HuntMoveOption[];
  seed: string;
}

export interface HuntTarget {
  zone: Id;
  label: string;
}

export interface SuggestOptions {
  /** The generator definition (its `hunt`, `passable`). */
  def: Pick<MapGeneratorDef, "hunt" | "passable">;
  /** Zones of the PCs (stalk targets). */
  targets: HuntTarget[];
  /** Seed base: the suggestion seed is `${seed}:${step}:${huntTokenKey(token)}`. */
  seed: string;
  /** Step id (`hunt.steps[].id`) the move is for; the hunt's last step kind, else the first step. */
  stepKind?: string | undefined;
}

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

/** The weights a token moves by: its mover's, its posture's laid over them, then hurt. */
export function moverWeights(mover: MapMoverDef, token: Pick<HuntToken, "data" | "hurt">): MapMoverPreference {
  const posture = token.data?.[mover.postureKey ?? "posture"];
  const layers = [mover.prefer, typeof posture === "string" ? mover.postures?.[posture] : undefined, token.hurt ? mover.hurt : undefined].filter((x): x is MapMoverPreference => !!x);
  const out: MapMoverPreference = {};
  for (const l of layers) {
    const { flags, ...rest } = l;
    Object.assign(out, rest);
    if (flags) out.flags = { ...(out.flags ?? {}), ...flags };
  }
  return out;
}

/** Zones a token may move in a step of `stepKind`: its mover's rule over its data (at least 0). */
export function moverReach(mover: MapMoverDef, token: Pick<HuntToken, "data">, stepKind: string | undefined): number {
  const rule = stepKind !== undefined ? mover.zones?.[stepKind] : undefined;
  if (rule === undefined) return 1;
  const n = typeof rule === "number" ? rule : evaluateNumber(rule, token.data ?? {});
  return Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 1;
}

/** The zone graph a mover walks: playable zones, ducts only if it may, passable borders in the act. */
export function moverGraph(layout: SiteLayout, live: Pick<SiteMapLiveState, "act" | "borders">, def: Pick<MapGeneratorDef, "passable">, mover: Pick<MapMoverDef, "ducts">, include?: Id): Map<string, string[]> {
  return zoneGraph(layout, {
    act: live.act,
    live,
    passable: def.passable,
    keep: (z) => z.id === include || (z.kind !== "out-of-bounds" && (mover.ducts === true || zoneLayer(layout, z) !== "duct")),
  });
}

function reverse(adj: Map<string, string[]>): Map<string, string[]> {
  const out = new Map<string, string[]>([...adj.keys()].map((k) => [k, []]));
  for (const [a, ns] of adj) for (const b of ns) out.get(b)?.push(a);
  return out;
}

/** Steps from every zone to the nearest of `to` (multi-source search on the reversed graph). */
function distancesTo(adj: Map<string, string[]>, to: Id[]): Map<string, number> {
  const rev = reverse(adj);
  const dist = new Map<string, number>();
  const queue: string[] = [];
  for (const z of to) if (rev.has(z) && !dist.has(z)) {
    dist.set(z, 0);
    queue.push(z);
  }
  for (let i = 0; i < queue.length; i++) {
    const cur = queue[i]!;
    for (const n of rev.get(cur) ?? []) {
      if (dist.has(n)) continue;
      dist.set(n, dist.get(cur)! + 1);
      queue.push(n);
    }
  }
  return dist;
}

const fmt = (n: number) => (Math.round(n * 100) / 100).toString();

/**
 * Where a hidden token could go this step, best first: every zone it can
 * reach within its mover's zones per step (staying put included), scored by
 * the mover's weights (closing on the nearest PC, its route, keeping near
 * home, ducts, cover, zone flags, keeping out of sight, not doubling back)
 * plus seeded noise. Undefined when the map has no hunt or the token is gone.
 */
export function suggestHuntMove(layout: SiteLayout, live: SiteMapLiveState, token: HuntToken, opts: SuggestOptions): HuntMoveSuggestion | undefined {
  const hunt = opts.def.hunt;
  if (!hunt || token.state === "gone") return undefined;
  const mover = hunt.movers.find((m) => m.id === token.mover) ?? hunt.movers[0];
  if (!mover) return undefined;
  const h = huntOf(live);
  const stepKind = opts.stepKind ?? h.stepKind ?? hunt.steps[0]?.id;
  const reach = moverReach(mover, token, stepKind);
  const w = moverWeights(mover, token);
  const adj = moverGraph(layout, live, opts.def, mover, token.zone);
  const { dist, prev } = graphSearch(adj, token.zone);
  const targetZones = opts.targets.map((t) => t.zone).filter((z) => adj.has(z));
  const toTarget = targetZones.length ? distancesTo(adj, targetZones) : new Map<string, number>();
  const nextWaypoint = token.route?.[token.routeAt ?? 0];
  const toRoute = nextWaypoint && adj.has(nextWaypoint) ? distancesTo(adj, [nextWaypoint]) : undefined;
  const fromHome = adj.has(token.home) ? graphSearch(adj, token.home).dist : undefined;
  const revealed = new Set(live.revealed);
  const trail = new Set(token.trail);
  const flagsAt = (z: MapZoneData) => ({ ...(z.flags ?? {}), ...(live.zoneFlags[z.id] ?? {}) });
  // who it is closing on: the PCs nearest to where it stands
  const nearest: string[] = [];
  let whoDist = Infinity;
  const fromHere = dist;
  for (const t of opts.targets) {
    const d = fromHere.get(t.zone);
    if (d === undefined || d > whoDist) continue;
    if (d < whoDist) nearest.length = 0;
    whoDist = d;
    nearest.push(t.label);
  }
  const who = nearest.length === 0 ? "its prey" : nearest.length === 1 ? nearest[0]! : nearest.length === 2 ? `${nearest[0]} and ${nearest[1]}` : `${nearest[0]} and ${nearest.length - 1} others`;
  const seed = `${opts.seed}:${h.step}:${huntTokenKey(token)}`;
  const rng = createRng(seed);
  const jitter = mover.jitter ?? DEFAULT_JITTER;
  const curT = toTarget.get(token.zone);
  const curR = toRoute?.get(token.zone);
  // candidates in layout order, so the noise is drawn the same way each time
  const candidates = layout.zones.filter((z) => {
    const d = dist.get(z.id);
    return d !== undefined && d <= reach;
  });
  const options: HuntMoveOption[] = candidates.map((z) => {
    const parts: Array<[number, string]> = [];
    const stay = z.id === token.zone;
    if (w.approach && curT !== undefined) {
      const d = toTarget.get(z.id);
      if (d !== undefined && d !== curT) {
        const gain = curT - d;
        parts.push([w.approach * gain, gain > 0 ? `${gain} zone${gain === 1 ? "" : "s"} closer to ${who}` : `${-gain} zone${gain === -1 ? "" : "s"} farther from ${who}`]);
      }
    }
    if (w.route && toRoute && curR !== undefined) {
      const d = toRoute.get(z.id);
      if (d !== undefined && d !== curR) parts.push([w.route * (curR - d), curR > d ? "along its route" : "off its route"]);
    }
    if (w.home && fromHome) {
      const d = fromHome.get(z.id);
      if (d !== undefined && d > 0) parts.push([w.home * d, `${d} zone${d === 1 ? "" : "s"} from where it started`]);
    }
    if (w.duct && zoneLayer(layout, z) === "duct") parts.push([w.duct, "in the ducts"]);
    if (w.cluttered && z.cluttered) parts.push([w.cluttered, "cluttered"]);
    for (const [flag, weight] of Object.entries(w.flags ?? {})) if (flagsAt(z)[flag]) parts.push([weight, flag]);
    if (w.revealed && revealed.has(z.id)) parts.push([w.revealed, "where the crew can see"]);
    if (w.stay && stay) parts.push([w.stay, "stays put"]);
    if (w.trail && !stay && trail.has(z.id)) parts.push([w.trail, "doubling back"]);
    const noise = rng.next() * jitter;
    const path: Id[] = [z.id];
    while (path[0] !== token.zone) path.unshift(prev.get(path[0]!)!);
    const reasons = parts.filter(([v]) => v !== 0).sort((a, b) => Math.abs(b[0]) - Math.abs(a[0])).map(([, r]) => r);
    if (stay && !reasons.includes("stays put")) reasons.push("stays put");
    return { zone: z.id, path, score: Number(fmt(sum(parts.map(([v]) => v)) + noise)), reasons };
  });
  options.sort((a, b) => b.score - a.score || layout.zones.findIndex((z) => z.id === a.zone) - layout.zones.findIndex((z) => z.id === b.zone));
  const best = options[0];
  if (!best) return undefined;
  const alternative = options[1];
  return { token: token.id, from: token.zone, mover: mover.id, reach, best, ...(alternative ? { alternative } : {}), options, seed };
}

/** Suggestions for every token still in play (hidden, detected or seen). */
export function suggestHuntMoves(layout: SiteLayout, live: SiteMapLiveState, opts: SuggestOptions): HuntMoveSuggestion[] {
  return huntOf(live)
    .tokens.filter((t) => t.state !== "gone")
    .map((t) => suggestHuntMove(layout, live, t, opts))
    .filter((s): s is HuntMoveSuggestion => !!s);
}

/** The seed base for a map's suggestions: its generator seed, else its id. */
export function huntSeed(map: Pick<SiteMap, "id" | "generator">): string {
  return `hunt:${map.generator?.seed ?? map.id}`;
}

/**
 * A token's part of its suggestion seed: the map marker it came from (a
 * layout id, the same on every run of the generator), else its label and
 * where it was placed. Never its record id, which is new on every placement.
 */
export function huntTokenKey(token: Pick<HuntToken, "marker" | "label" | "home">): string {
  return token.marker ? `marker:${token.marker}` : `${token.label}@${token.home}`;
}

// ---------------------------------------------------------------------------
// sensors and sweeps
// ---------------------------------------------------------------------------

/** The sensors an entity carries (gear rows by name, the preset a row was picked from, or a linked item entity's preset). */
export function carriedSensors(hunt: MapHuntDef | undefined, entity: Pick<Entity, "fields">, itemPreset?: (itemId: string) => string | undefined): MapSensorDef[] {
  if (!hunt?.sensors?.length) return [];
  const rows: Array<Record<string, unknown>> = [];
  for (const path of hunt.gearPaths ?? ["gear"]) {
    const v = entity.fields[path];
    if (Array.isArray(v)) for (const r of v) if (r && typeof r === "object") rows.push(r as Record<string, unknown>);
  }
  const names = new Set(rows.map((r) => (typeof r.name === "string" ? r.name.trim().toLowerCase() : "")).filter(Boolean));
  const presets = new Set<string>();
  for (const r of rows) {
    if (typeof r.presetId === "string") presets.add(r.presetId);
    if (typeof r.itemId === "string") {
      const p = itemPreset?.(r.itemId);
      // an item entity's preset, or (older preset kits) the preset id itself
      presets.add(p ?? r.itemId);
    }
  }
  return hunt.sensors.filter((s) => (s.carried.names ?? []).some((n) => names.has(n.toLowerCase())) || (s.carried.presets ?? []).some((p) => presets.has(p)));
}

/** A point for a zone on the deck plan: its centre, or for a zone on a duct sheet the centre of the nearest floor zone it opens into. */
function anchorOf(layout: SiteLayout, zoneId: Id): { x: number; y: number; level: number | undefined } | undefined {
  const decks = new Map(layout.decks.map((d) => [d.id, d]));
  const byId = new Map(layout.zones.map((z) => [z.id, z]));
  const own = byId.get(zoneId);
  if (!own) return undefined;
  let at: MapZoneData = own;
  if (isDuctSheet(decks.get(own.deck))) {
    const adj = zoneGraph(layout, { act: 1, anyBorder: true });
    const { dist } = graphSearch(adj, zoneId);
    const floors = [...dist.entries()].filter(([id]) => {
      const z = byId.get(id);
      return z && z.kind !== "out-of-bounds" && !isDuctSheet(decks.get(z.deck));
    });
    floors.sort((a, b) => a[1] - b[1] || layout.zones.indexOf(byId.get(a[0])!) - layout.zones.indexOf(byId.get(b[0])!));
    const floor = floors[0] ? byId.get(floors[0][0]) : undefined;
    if (floor) at = floor;
  }
  const xs = at.poly.map((p) => p[0]);
  const ys = at.poly.map((p) => p[1]);
  return { x: (Math.min(...xs) + Math.max(...xs)) / 2, y: (Math.min(...ys) + Math.max(...ys)) / 2, level: decks.get(own.deck)?.level };
}

const COMPASS = ["E", "NE", "N", "NW", "W", "SW", "S", "SE"] as const;

/**
 * The bearing from one zone to another on the deck plan: a compass point
 * ("N" is up the map), or "here" when they share a spot; `vertical` when the
 * other is on a higher or lower level. A zone on a duct sheet (not drawn to
 * the deck's scale) reads from the floor zone it opens into.
 */
export function zoneBearing(layout: SiteLayout, from: Id, to: Id): { direction: string; vertical?: "above" | "below" } {
  const a = anchorOf(layout, from);
  const b = anchorOf(layout, to);
  if (!a || !b) return { direction: "here" };
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const vertical = typeof a.level === "number" && typeof b.level === "number" && a.level !== b.level ? (b.level > a.level ? "above" : "below") : undefined;
  if (Math.hypot(dx, dy) < 1) return { direction: "here", ...(vertical ? { vertical } : {}) };
  const angle = Math.atan2(-dy, dx);
  const sector = ((Math.round(angle / (Math.PI / 4)) % 8) + 8) % 8;
  return { direction: COMPASS[sector]!, ...(vertical ? { vertical } : {}) };
}

export interface SweepReading {
  token: HuntToken;
  distance: number;
  band: RangeBandDef | undefined;
  direction: string;
  vertical?: "above" | "below";
}

/** Zone distance a sensor reads from a zone: across every border (it reads through walls), or along passable ones. */
export function sensorDistances(layout: SiteLayout, live: Pick<SiteMapLiveState, "act" | "borders">, def: Pick<MapGeneratorDef, "passable">, sensor: Pick<MapSensorDef, "through">, from: Id): Map<string, number> {
  const adj = zoneGraph(layout, { act: live.act, live, passable: def.passable, anyBorder: sensor.through === "any", keep: (z) => z.kind !== "out-of-bounds" || z.id === from });
  return graphSearch(adj, from).dist;
}

/**
 * What a sweep from `from` picks up: tokens in play and not yet seen, within
 * the sensor's range band, that moved this step when it reads movement only.
 * Nearest first, then in placement order.
 */
export function sweepReadings(layout: SiteLayout, live: SiteMapLiveState, def: Pick<MapGeneratorDef, "passable" | "rangeBands">, sensor: MapSensorDef, from: Id): SweepReading[] {
  const hunt = huntOf(live);
  const dist = sensorDistances(layout, live, def, sensor, from);
  const max = def.rangeBands?.find((b) => b.id === sensor.range)?.maxDistance ?? Infinity;
  const out: SweepReading[] = [];
  hunt.tokens.forEach((t) => {
    if (t.state === "gone" || t.state === "seen") return;
    if (sensor.detects === "moved" && t.movedAt !== hunt.step) return;
    const d = dist.get(t.zone);
    if (d === undefined || d > max) return;
    const bearing = zoneBearing(layout, from, t.zone);
    out.push({ token: t, distance: d, band: rangeBandFor(d, def.rangeBands), ...bearing });
  });
  const order = new Map(hunt.tokens.map((t, i) => [t.id, i]));
  return out.sort((a, b) => a.distance - b.distance || order.get(a.token.id)! - order.get(b.token.id)!);
}

/** The next free blip letter: the first of `letters` no token in play holds. */
export function nextBlipLetter(tokens: HuntToken[], letters: readonly string[] = DEFAULT_BLIP_LETTERS): string {
  const held = new Set(tokens.filter((t) => t.state !== "gone" && t.letter).map((t) => t.letter!));
  const free = letters.find((l) => !held.has(l));
  if (free) return free;
  // more blips than letters: number them past the set
  for (let n = 2; ; n++) for (const l of letters) if (!held.has(`${l}${n}`)) return `${l}${n}`;
}

export interface SweepInput {
  by: { name: string; entity?: Id | undefined };
  from: Id;
  sensor: MapSensorDef;
  def: Pick<MapGeneratorDef, "passable" | "rangeBands" | "hunt">;
  at?: string;
}

/**
 * Sweep with a sensor from a zone: every token it picks up becomes a
 * detected blip with a letter (the one it holds, else the next free one, in
 * order of detection), and the sweep is recorded for the GM's log and the
 * players' readout.
 */
export function recordSweep(store: CampaignStore, mapId: Id, input: SweepInput): HuntSweep {
  let sweep: HuntSweep | undefined;
  editHunt(store, mapId, (hunt, live, map) => {
    if (!map.layout) throw new Error(`maps/${mapId} has no generated layout`);
    const readings = sweepReadings(map.layout, { ...live, hunt }, input.def, input.sensor, input.from);
    const letters = input.def.hunt?.blipLetters ?? DEFAULT_BLIP_LETTERS;
    const blips: HuntBlip[] = [];
    for (const r of readings) {
      const t = tokenIn(hunt, r.token.id);
      if (!t.letter) t.letter = nextBlipLetter(hunt.tokens, letters);
      if (t.state === "hidden") t.state = "detected";
      blips.push({ letter: t.letter, token: t.id, distance: r.distance, band: r.band?.id ?? "", bandLabel: r.band?.label ?? `${r.distance} zones`, direction: r.direction, ...(r.vertical ? { vertical: r.vertical } : {}) });
    }
    sweep = { id: newId(), step: hunt.step, at: input.at ?? now(), by: { name: input.by.name, ...(input.by.entity ? { entity: input.by.entity } : {}) }, zone: input.from, sensor: input.sensor.id, sensorLabel: input.sensor.label, blips };
    hunt.sweeps = [...hunt.sweeps, sweep].slice(-MAX_SWEEPS);
  });
  return sweep!;
}

/** "Sweep by Lee-Ann: blips A (Medium, NE), B (Long, S)"; "no movement" when it picked up nothing. */
export function sweepLogText(sweep: Pick<HuntSweep, "by" | "blips">): string {
  if (sweep.blips.length === 0) return `Sweep by ${sweep.by.name}: no movement`;
  const blip = (b: HuntBlip) => `${b.letter} (${[b.bandLabel, b.direction, b.vertical].filter(Boolean).join(", ")})`;
  return `Sweep by ${sweep.by.name}: blip${sweep.blips.length === 1 ? "" : "s"} ${sweep.blips.map(blip).join(", ")}`;
}

// ---------------------------------------------------------------------------
// the player projection
// ---------------------------------------------------------------------------

export interface PlayerBlip {
  letter: string;
  band: string;
  bandLabel: string;
  direction: string;
  vertical?: "above" | "below";
  /** The GM has since revealed the threat behind it: the blip flipped to its token on the map. */
  seen?: boolean;
}

export interface PlayerSweep {
  by: string;
  sensor: string;
  step: number;
  /** A sweep from an earlier step: its blips are where things were. */
  stale: boolean;
  blips: PlayerBlip[];
}

export interface PlayerTrackerState {
  step: number;
  sweeps: PlayerSweep[];
}

/**
 * What the players' tracker readout shows: this step's sweeps, else the last
 * one (stale). Built by copying allowed fields: a blip's letter, band and
 * direction only, never its token, zone or distance.
 */
export function playerTracker(hunt: HuntState | undefined): PlayerTrackerState | undefined {
  const sweeps = hunt?.sweeps ?? [];
  if (!hunt || sweeps.length === 0) return undefined;
  const current = sweeps.filter((s) => s.step === hunt.step);
  const shown = current.length ? current : sweeps.slice(-1);
  const seen = new Set(hunt.tokens.filter((t) => t.state === "seen").map((t) => t.id));
  return {
    step: hunt.step,
    sweeps: shown.map((s) => ({
      by: s.by.name,
      sensor: s.sensorLabel,
      step: s.step,
      stale: s.step !== hunt.step,
      blips: s.blips.map((b) => ({ letter: b.letter, band: b.band, bandLabel: b.bandLabel, direction: b.direction, ...(b.vertical ? { vertical: b.vertical } : {}), ...(seen.has(b.token) ? { seen: true } : {}) })),
    })),
  };
}

/** The map's hunt definition, if its generator has one. */
export function huntDefFor(map: Pick<SiteMap, "generator">, generators: MapGeneratorDef[] | undefined): MapGeneratorDef | undefined {
  const def = generators?.find((g) => g.id === map.generator?.id);
  return def?.hunt ? def : undefined;
}

/** Live state for a map with the hunt defaults filled in (for callers holding a map record). */
export function liveHunt(map: Pick<SiteMap, "live">): { live: SiteMapLiveState; hunt: HuntState } {
  const live = liveOf(map);
  return { live, hunt: huntOf(live) };
}
