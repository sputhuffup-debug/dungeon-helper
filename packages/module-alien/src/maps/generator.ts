/**
 * The Alien site map generator (`alien.map.site`): zone graph, grid layout
 * (with each deck's duct sheets), borders and ducts (links, shafts, collapsed
 * sections, access points), dressing (duct hazards included), encounters and
 * clues, then the validation checklist. Each stage draws from its own seeded stream, so re-seeding one
 * stage changes it and the stages after it, never the ones before. A map that
 * fails a block check is rebuilt from the zone graph with a new sub-seed, up
 * to 50 times.
 */
import { createRng, createTableRegistry, rollTable } from "@campaign-forge/module-sdk";
import type { MapBorderData, MapCheck, MapGeneratorContext, MapGeneratorResult, MapMarker, MapZoneData, Rng, RollTable, SiteLayout, TableRegistry } from "@campaign-forge/module-sdk";
import { creaturePresets } from "../data/creatures";
import { anomalousDetailTable, locationDetailTable, salvageTable } from "../tables/maps";
import {
  ACT_BUDGETS,
  ACT_BUDGET_NOTE,
  BARRIER_ARMOR,
  CONTACT_STRETCHES,
  CREATURE_TIERS,
  DOOR_ARMOR,
  DOOR_HP,
  DUCT_HAZARD_ODDS,
  DUCT_SHAFT_M,
  ENEMY_PRESENCE,
  MAP_GENERATOR_ID,
  MAX_ZONE_M,
  MIN_SPAWN_DISTANCE,
  NON_COMBAT_WIN_PATHS,
  PATH_LENGTH_BY_HOURS,
  ROOM_TYPES,
  SITE_PROFILES,
  SIZE_ZONES,
  THREAT_COST,
  THREAT_TIER_LABELS,
  WIN_PATH_LABELS,
  groupTier,
  type EnemyPresenceId,
  type SiteProfile,
  type ThreatTier,
  type WinPathId,
} from "./data";
import { bfs, components, disjointPaths, shortestPath, type Adjacency } from "./graph";
import { alienPassable, playerLayout, zoneAdjacency } from "./helpers";
import { normalizeMapInputs, type MapInputs, type PuzzleInput } from "./inputs";
import { DUCT_SHEET_MAX, type DuctSheet } from "./ducts";
import { layoutSite, polyBounds, type LayoutResult } from "./layout";
import { planSite, type Plan, type PlanNode } from "./plan";

export const MAP_STAGES = [
  { id: "graph", title: "Zone graph" },
  { id: "layout", title: "Grid layout" },
  { id: "borders", title: "Borders and ducts" },
  { id: "dressing", title: "Dressing" },
  { id: "encounters", title: "Encounters and clues" },
] as const;
export type MapStageId = (typeof MAP_STAGES)[number]["id"];

export const MAX_ATTEMPTS = 50;

/** Block checks that depend only on the brief: retrying cannot fix them. */
const INPUT_BOUND_CHECKS = new Set(["overwhelming-exit"]);

/**
 * A context for running the generator outside the app, with the same
 * convention as the core's: `rng(stream)` is
 * `createRng(stageSeeds[stage] ?? seed).fork(stream)`, where `stage` is the
 * stage id the stream name starts with.
 */
export function createMapContext(seed: string, opts: { stageSeeds?: Record<string, string>; tables?: TableRegistry } = {}): MapGeneratorContext {
  const stageSeeds = opts.stageSeeds ?? {};
  const stageOf = (stream: string) => MAP_STAGES.find((s) => stream === s.id || stream.startsWith(`${s.id}/`))?.id;
  return {
    seed,
    ...(opts.stageSeeds ? { stageSeeds: opts.stageSeeds } : {}),
    rng: (stream: string) => {
      const stage = stageOf(stream);
      return createRng((stage !== undefined ? stageSeeds[stage] : undefined) ?? seed).fork(stream);
    },
    tables: opts.tables ?? createTableRegistry([locationDetailTable, anomalousDetailTable, salvageTable]),
  };
}

/**
 * The stream for a stage, named "<stage>/alien.map.site...". A host that seeds
 * streams by stage (as the core does) applies the stage seed; the override is
 * also folded into the name, so re-seeding still works with a host that does not.
 */
function stageRng(ctx: MapGeneratorContext, stage: MapStageId, attempt: number): Rng {
  const override = ctx.stageSeeds?.[stage];
  return ctx.rng(`${stage}/${MAP_GENERATOR_ID}${override !== undefined ? `@${override}` : ""}${attempt > 1 ? `#${attempt}` : ""}`);
}

interface KeyZone {
  zone: string;
  act: number;
  name: string;
  index: number;
}

interface Draft {
  inputs: MapInputs;
  profile: SiteProfile;
  plan: Plan;
  layout: LayoutResult;
  zones: MapZoneData[];
  borders: MapBorderData[];
  markers: MapMarker[];
  start: string;
  keys: KeyZone[];
  /** Start then key zones in act order. */
  sequence: string[];
  wins: Array<{ type: WinPathId; zone: string }>;
  lostPassages: number;
  meta: Record<string, unknown>;
}

const zoneById = (d: Pick<Draft, "zones">) => new Map(d.zones.map((z) => [z.id, z]));
const nodeOfZone = (d: Draft, zone: string): PlanNode | undefined => {
  const k = d.layout.nodeOf.get(zone);
  return k ? d.plan.nodes.get(k) : undefined;
};
const shuffle = <T>(rng: Rng, list: T[]): T[] => {
  const a = list.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = rng.int(0, i);
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
};
const pickOne = <T>(rng: Rng, list: T[]): T | undefined => (list.length === 0 ? undefined : list[rng.int(0, list.length - 1)]);
const pairKey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);

// ---------------------------------------------------------------------------
// Stage 3: borders and ducts
// ---------------------------------------------------------------------------

function opening(rng: Rng, seg: [[number, number], [number, number]], width: number): [[number, number], [number, number]] {
  const [p, q] = seg;
  const vertical = p[0] === q[0];
  const lo = vertical ? Math.min(p[1], q[1]) : Math.min(p[0], q[0]);
  const hi = vertical ? Math.max(p[1], q[1]) : Math.max(p[0], q[0]);
  const w = Math.max(1, Math.min(width, hi - lo));
  const a = lo + rng.int(0, Math.max(0, hi - lo - w));
  return vertical
    ? [
        [p[0], a],
        [p[0], a + w],
      ]
    : [
        [a, p[1]],
        [a + w, p[1]],
      ];
}

function hasTag(n: PlanNode | undefined, tag: string): boolean {
  const t = n?.type ? ROOM_TYPES[n.type] : undefined;
  return !!t?.tags?.includes(tag as never);
}

function buildBorders(rng: Rng, d: Draft): void {
  const { plan, layout, profile } = d;
  const passages = new Map(plan.passages.filter((p) => p.kind !== "stairs").map((p) => [pairKey(layout.zoneOf.get(p.a)!, layout.zoneOf.get(p.b)!), p]));
  const drawn = new Set<string>();
  const borders: MapBorderData[] = [];
  const nextId = () => `B${String(borders.length + 1).padStart(3, "0")}`;

  for (const adj of layout.adjacency) {
    const key = pairKey(adj.a, adj.b);
    const p = passages.get(key);
    const na = nodeOfZone(d, adj.a);
    const nb = nodeOfZone(d, adj.b);
    const secure = hasTag(na, "secure") || hasTag(nb, "secure");
    const base: MapBorderData = { id: nextId(), a: adj.a, b: adj.b, kind: "wall", segment: adj.seg };
    if (!p) {
      const armor = secure ? Math.max(profile.wallArmor, BARRIER_ARMOR.armoredBulkhead) : profile.wallArmor;
      borders.push({ ...base, armor, ...(armor >= BARRIER_ARMOR.armoredBulkhead ? { flags: { armored: true } } : {}) });
      continue;
    }
    drawn.add(key);
    if (p.kind === "line" && p.seal) {
      borders.push({ ...base, kind: "blast", segment: adj.seg, armor: BARRIER_ARMOR.armoredBulkhead, lock: "electronic", flags: { sealable: true, armored: true } });
    } else if (p.kind === "line") {
      if (rng.next() < 0.3) borders.push({ ...base, kind: "door", segment: opening(rng, adj.seg, rng.int(1, 2)), armor: DOOR_ARMOR, hp: DOOR_HP, lock: "none" });
      else borders.push({ ...base, kind: "open" });
    } else if (p.kind === "open") {
      borders.push({ ...base, kind: "open" });
    } else if (p.kind === "oob") {
      borders.push({
        ...base,
        kind: "blast",
        segment: opening(rng, adj.seg, 3),
        armor: BARRIER_ARMOR.armoredBulkhead,
        lock: "electronic",
        lockedInActs: [1, 2, 3],
        flags: { outOfBounds: true, armored: true },
      });
    } else {
      const airlock = hasTag(na, "airlock") || hasTag(nb, "airlock");
      const hatch = airlock || rng.next() < profile.hatchShare;
      borders.push({ ...base, kind: hatch ? "hatch" : "door", segment: opening(rng, adj.seg, hatch ? 1 : rng.int(1, 2)), armor: DOOR_ARMOR, hp: DOOR_HP, lock: "none" });
    }
  }
  d.lostPassages = [...passages.keys()].filter((k) => !drawn.has(k)).length;

  // Deck links (no drawn segment).
  for (const p of plan.passages.filter((x) => x.kind === "stairs")) {
    borders.push({ id: nextId(), a: layout.zoneOf.get(p.a)!, b: layout.zoneOf.get(p.b)!, kind: "stairs", flags: { via: p.via ?? "stairs", ...(p.via === "ladder" ? { dropM: 4 } : {}) } });
  }
  // Ducts: links on each sheet, collapsed sections, shafts between sheets, then access points
  // (found during play, except the one at the start). A separate stream keeps the floor borders apart.
  buildDuctBorders(rng.fork("ducts"), d, borders, nextId);
  d.borders = borders;

  // Locks per act, kept only while every reachability and route requirement still holds.
  const doors = borders.filter((b) => b.kind === "door" || b.kind === "hatch");
  type Cand = { border: MapBorderData; acts: number[]; lock: "mechanical" | "electronic" };
  const cands: Cand[] = [];
  for (const b of doors) {
    const securePassage = passages.get(pairKey(b.a, b.b))?.secure === true;
    if (securePassage || hasTag(nodeOfZone(d, b.a), "secure") || hasTag(nodeOfZone(d, b.b), "secure")) cands.push({ border: b, acts: pickOne(rng, [[1], [1, 2], [1, 2, 3]])!, lock: "electronic" });
  }
  for (const b of shuffle(rng, doors).slice(0, 2)) cands.push({ border: b, acts: [2], lock: "electronic" });
  for (const b of shuffle(rng, doors).slice(0, 2)) cands.push({ border: b, acts: [3], lock: "electronic" });
  for (const b of shuffle(rng, doors).slice(0, 1)) cands.push({ border: b, acts: [1, 2, 3], lock: "mechanical" });
  // A lock stays only if no pair of consecutive key rooms loses a route (a single route stays a single route).
  const routeScore = () => routeCounts(d).reduce((n, r) => n + Math.min(2, r), 0);
  let baseline = routeScore();
  for (const c of shuffle(rng, cands)) {
    if ((c.border.lockedInActs ?? []).length > 0) continue;
    c.border.lock = c.lock;
    c.border.lockedInActs = c.acts;
    const score = routeScore();
    if (reachProblems(d).length === 0 && score >= baseline) {
      baseline = score;
      continue;
    }
    c.border.lock = "none";
    delete c.border.lockedInActs;
  }
}

/** The sheet links minus one link still join every zone on the sheet. */
function sheetConnectedWithout(sheet: DuctSheet, links: Array<{ a: string; b: string }>, skip: ReadonlySet<number>): boolean {
  const zones = new Set(sheet.zones);
  const adj = new Map<string, string[]>(sheet.zones.map((z) => [z, []]));
  links.forEach((l, i) => {
    if (skip.has(i) || !zones.has(l.a)) return;
    adj.get(l.a)!.push(l.b);
    adj.get(l.b)!.push(l.a);
  });
  return bfs(adj, sheet.zones[0]!).size === sheet.zones.length;
}

function buildDuctBorders(rng: Rng, d: Draft, borders: MapBorderData[], nextId: () => string): void {
  const { ducts } = d.layout;
  if (ducts.sheets.length === 0) return;
  const byId = zoneById(d);
  const odds = DUCT_HAZARD_ODDS[d.inputs.site_type];
  const exits = new Set(ducts.sheets.flatMap((s) => s.exits.map((e) => e.duct)));
  const setFlag = (zone: string, key: string, value: unknown) => {
    const z = byId.get(zone)!;
    z.flags = { ...z.flags, [key]: value };
  };

  // Collapsed sections: on some sheets, one link whose loss leaves the sheet in one piece.
  const collapsed = new Set<number>();
  for (const sheet of ducts.sheets) {
    if (rng.next() >= odds.collapse) continue;
    const zones = new Set(sheet.zones);
    const cands = ducts.links
      .map((l, i) => ({ l, i }))
      .filter(({ l, i }) => zones.has(l.a) && !exits.has(l.a) && !exits.has(l.b) && sheetConnectedWithout(sheet, ducts.links, new Set([...collapsed, i])));
    const c = pickOne(rng, cands);
    if (c) collapsed.add(c.i);
  }
  ducts.links.forEach((l, i) => {
    if (collapsed.has(i)) {
      borders.push({ id: nextId(), a: l.a, b: l.b, kind: "wall", segment: l.seg, armor: BARRIER_ARMOR.innerBulkhead, hp: DOOR_HP, hidden: true, flags: { duct: true, collapsed: true } });
      setFlag(l.a, "collapsed", true);
    } else borders.push({ id: nextId(), a: l.a, b: l.b, kind: "open", segment: l.seg, flags: { duct: true } });
  });

  // Shafts: a climbable one between each sheet and the sheet below it, sometimes a one-way drop as well.
  const sheetOf = (deck: string, role: "upper" | "lower") => ducts.sheets.find((s) => s.serves === deck && s.role === role);
  const pairs: Array<[DuctSheet, DuctSheet]> = [];
  const floorDecks = d.layout.decks.filter((x) => x.layer !== "duct");
  floorDecks.forEach((deck, i) => {
    const up = sheetOf(deck.id, "upper");
    const low = sheetOf(deck.id, "lower");
    if (up && low) pairs.push([up, low]);
    const next = floorDecks[i + 1];
    const above = next ? sheetOf(next.id, "upper") : undefined;
    if (up && above) pairs.push([above, up]);
  });
  const ends = new Set<string>();
  const endpoint = (sheet: DuctSheet): string => {
    const zones = sheet.zones.filter((z) => !exits.has(z) && !ends.has(z));
    const nodes = zones.filter((z) => byId.get(z)!.flags?.ductType !== "run");
    const z = pickOne(rng, nodes.length > 0 ? nodes : zones.length > 0 ? zones : sheet.zones)!;
    ends.add(z);
    return z;
  };
  const shaftTo = (zone: string, entry: Record<string, unknown>) => {
    const list = (byId.get(zone)!.flags?.shaftTo as Array<Record<string, unknown>> | undefined) ?? [];
    setFlag(zone, "shaftTo", [...list, entry]);
  };
  for (const [top, bottom] of pairs) {
    const drop = rng.next() < odds.drop;
    const links: Array<{ oneWay: boolean }> = [{ oneWay: false }, ...(drop ? [{ oneWay: true }] : [])];
    for (const { oneWay } of links) {
      const a = endpoint(top);
      const b = endpoint(bottom);
      borders.push({ id: nextId(), a, b, kind: "shaft", hidden: true, flags: { duct: true, direction: oneWay ? "down" : "both", dropM: DUCT_SHAFT_M, ...(oneWay ? { oneWay: true } : {}) } });
      shaftTo(a, { zone: b, deck: bottom.deck.id, way: "down", dropM: DUCT_SHAFT_M, ...(oneWay ? { oneWay: true } : {}) });
      shaftTo(b, { zone: a, deck: top.deck.id, way: "up", dropM: DUCT_SHAFT_M, ...(oneWay ? { oneWay: true } : {}) });
      if (oneWay) setFlag(a, "oneWayDrop", true);
    }
  }

  for (const sheet of ducts.sheets) for (const e of sheet.exits) borders.push({ id: nextId(), a: e.floor, b: e.duct, kind: "access", sealed: false, hidden: e.floor !== d.start });
}

/** Reachability requirements: key rooms and win paths from the start, per act. */
function reachProblems(d: Pick<Draft, "zones" | "borders" | "start" | "keys" | "wins">): string[] {
  const out: string[] = [];
  const winZones = [...new Set(d.wins.map((w) => w.zone))];
  for (const act of [1, 2, 3]) {
    const adj = zoneAdjacency(d, act);
    const dist = bfs(adj, d.start);
    for (const k of d.keys) if ((act === 1 || k.act >= act) && !dist.has(k.zone)) out.push(`Act ${act}: ${k.zone} (${k.name}) cannot be reached from the start`);
    if (act === 1 || act === 3) for (const w of winZones) if (!dist.has(w)) out.push(`Act ${act}: win path ${w} cannot be reached from the start`);
    if (act === 3) {
      for (const k of d.keys.filter((x) => x.act === 3)) {
        const from = bfs(adj, k.zone);
        for (const w of winZones) if (!from.has(w)) out.push(`Act 3: win path ${w} cannot be reached from ${k.zone}`);
      }
    }
  }
  return out;
}

/** Separate routes (up to two) between each pair of consecutive key rooms, in the later room's act. */
function routeCounts(d: Pick<Draft, "zones" | "borders" | "sequence" | "keys">): number[] {
  const actOf = new Map(d.keys.map((k) => [k.zone, k.act]));
  const cache = new Map<number, Adjacency>();
  const out: number[] = [];
  for (let i = 1; i < d.sequence.length; i++) {
    const from = d.sequence[i - 1]!;
    const to = d.sequence[i]!;
    if (from === to) continue;
    const act = actOf.get(to) ?? 1;
    if (!cache.has(act)) cache.set(act, zoneAdjacency(d, act));
    out.push(disjointPaths(cache.get(act)!, from, to, 2).length);
  }
  return out;
}

/** Consecutive key rooms (start first) with fewer than two separate routes, in the later room's act. */
function routeFailures(d: Pick<Draft, "zones" | "borders" | "sequence" | "keys" | "start">): Array<{ from: string; to: string; act: number; routes: number }> {
  const actOf = new Map(d.keys.map((k) => [k.zone, k.act]));
  const cache = new Map<number, Adjacency>();
  const adjFor = (act: number) => {
    if (!cache.has(act)) cache.set(act, zoneAdjacency(d, act));
    return cache.get(act)!;
  };
  const out: Array<{ from: string; to: string; act: number; routes: number }> = [];
  for (let i = 1; i < d.sequence.length; i++) {
    const from = d.sequence[i - 1]!;
    const to = d.sequence[i]!;
    if (from === to) continue;
    const act = actOf.get(to) ?? 1;
    const routes = disjointPaths(adjFor(act), from, to, 2).length;
    if (routes < 2) out.push({ from, to, act, routes });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Stage 4: dressing
// ---------------------------------------------------------------------------

/** Details that imply a hazard or a lighting state. */
const DETAIL_EFFECTS: Record<string, { hazard?: "vacuum" | "zero_g" | "radiation" | "flooding"; dark?: boolean; radiation?: "weak" | "strong"; drop?: boolean }> = {
  Airless: { hazard: "vacuum" },
  Breached: { hazard: "vacuum" },
  Weightless: { hazard: "zero_g" },
  "Altered gravity": { hazard: "zero_g" },
  Radioactive: { hazard: "radiation", radiation: "weak" },
  "Radioactive hot spot": { hazard: "radiation", radiation: "strong" },
  Flooded: { hazard: "flooding" },
  Darkened: { dark: true },
  "Unnerving shadows": { dark: true },
  Illuminated: { dark: false },
  "Strobe-lit": { dark: false },
  "Eerie light": { dark: false },
  "Dark pit": { drop: true },
};

function tableFor(ctx: MapGeneratorContext, local: RollTable): RollTable {
  return ctx.tables.get(local.id) ?? local;
}

function dress(rng: Rng, d: Draft, ctx: MapGeneratorContext): void {
  const { inputs, profile } = d;
  const allowed = new Set(inputs.hazards);
  const registry = createTableRegistry([locationDetailTable, anomalousDetailTable, salvageTable]);
  const detailTable = tableFor(ctx, locationDetailTable);
  const anomalous = tableFor(ctx, anomalousDetailTable);
  const salvage = tableFor(ctx, salvageTable);
  const floor = d.zones.filter((z) => z.layer !== "duct");
  const playable = floor.filter((z) => z.kind !== "out-of-bounds");
  const keyZones = new Set(d.keys.map((k) => k.zone));
  const winZones = new Set(d.wins.map((w) => w.zone));

  // Dead ends: rooms with one way in over floor borders.
  const passOpen = d.borders.filter((b) => b.kind !== "wall" && b.kind !== "access" && b.kind !== "stairs" && !(b.flags?.outOfBounds === true));
  const degree = new Map<string, number>();
  for (const b of passOpen) {
    degree.set(b.a, (degree.get(b.a) ?? 0) + 1);
    degree.set(b.b, (degree.get(b.b) ?? 0) + 1);
  }

  const forcedDark = new Map<string, boolean>();
  for (const z of floor) {
    const n = nodeOfZone(d, z.id);
    const t = n?.type ? ROOM_TYPES[n.type] : undefined;
    const flags: Record<string, unknown> = { ...(z.flags ?? {}) };
    if (z.kind === "out-of-bounds") {
      z.cluttered = false;
      if (profile.hull === "space" && allowed.has("vacuum")) flags.atmosphere = "none";
      z.flags = flags;
      continue;
    }
    z.cluttered = z.kind === "room" ? rng.next() < (t?.clutter ?? 0.6) : rng.next() < 0.15;
    if (z.kind === "room" && (degree.get(z.id) ?? 0) <= 1) flags.deadEnd = true;
    if (t) flags.type = t.id;

    // Location detail (p. 297-298); re-roll details whose hazard the brief rules out.
    const table = rng.next() < profile.anomalous ? anomalous : detailTable;
    const details: string[] = [];
    const rollDetail = (): string | undefined => {
      for (let tries = 0; tries < 8; tries++) {
        const rec = rollTable(table, rng, registry);
        const res = rec.result as Record<string, unknown>;
        if (res.rollTwice) return "twice";
        const detail = String(res.detail ?? rec.rowLabel ?? "");
        const fx = DETAIL_EFFECTS[detail];
        if (fx?.hazard && (!allowed.has(fx.hazard) || z.id === d.start)) continue;
        if (details.includes(detail)) continue;
        return detail;
      }
      return undefined;
    };
    const first = rollDetail();
    if (first === "twice") {
      for (let i = 0; i < 2; i++) {
        const x = rollDetail();
        if (x && x !== "twice") details.push(x);
      }
    } else if (first) details.push(first);
    for (const det of details) {
      const fx = DETAIL_EFFECTS[det];
      if (!fx) continue;
      if (fx.dark !== undefined) forcedDark.set(z.id, fx.dark);
      if (fx.hazard === "vacuum") flags.atmosphere = "none";
      if (fx.hazard === "zero_g") flags.gravity = false;
      if (fx.hazard === "radiation") flags.radiation = fx.radiation ?? "weak";
      if (fx.hazard === "flooding") flags.flooded = true;
      if (fx.drop) flags.dropM = 2 * rng.int(2, 5);
    }
    if (details.length > 0) z.details = details;

    // Salvage (p. 297): the rare column in key rooms and dead ends (module decision).
    if (z.kind === "room" || rng.next() < 0.25) {
      const rec = rollTable(salvage, rng, registry);
      const res = rec.result as Record<string, unknown>;
      const rare = z.kind === "room" && (keyZones.has(z.id) || flags.deadEnd === true);
      z.salvage = [String(rare ? res.rare : res.common)];
    }

    // Hazards by room type and site.
    if (allowed.has("fire") && t?.flammable) flags.flammable = true;
    if (allowed.has("radiation") && t?.tags?.includes("reactor")) flags.radiation = "strong";
    if (allowed.has("flooding") && t?.tags?.includes("water") && (profile.hull !== "space") && rng.next() < 0.5) flags.flooded = true;
    if (allowed.has("zero_g") && z.id !== d.start && rng.next() < (profile.id === "derelict" ? 0.2 : profile.hull === "space" ? 0.03 : 0)) flags.gravity = false;
    if (allowed.has("vacuum") && profile.id === "derelict" && z.id !== d.start && !keyZones.has(z.id) && !winZones.has(z.id) && rng.next() < 0.08) flags.atmosphere = "none";
    const outer = Array.isArray(flags.outerEdges) && flags.outerEdges.length > 0;
    if (profile.hull === "space" && outer) {
      flags.outerHull = true;
      if (profile.autoSeal) flags.autoSeal = true;
    }
    if (outer && z.kind !== "exterior") flags.outerArmor = profile.outerArmor;
    z.flags = flags;
  }

  // Darkness: the brief's share of playable zones, plus the site's bias; details force some.
  const target = Math.round(((Math.min(100, inputs.darkness + profile.darkBias * 100)) / 100) * playable.length);
  for (const z of playable) z.flags = { ...z.flags, dark: forcedDark.get(z.id) === true };
  let dark = playable.filter((z) => z.flags!.dark === true).length;
  for (const z of shuffle(rng, playable)) {
    if (dark >= target) break;
    if (z.flags!.dark || forcedDark.get(z.id) === false || z.id === d.start) continue;
    z.flags!.dark = true;
    dark++;
  }
  const byId = zoneById(d);
  if (inputs.darkness > 0) {
    // Every way into an Act 2 key room passes a dark zone: darken its neighbours.
    const adj2 = zoneAdjacency(d, 2);
    for (const k of d.keys.filter((x) => x.act === 2)) {
      for (const n of adj2.get(k.zone) ?? []) {
        const z = byId.get(n)!;
        if (z.layer !== "duct" && n !== d.start) z.flags = { ...z.flags, dark: true };
      }
    }
  }
  // Every duct is dark unless something lights it (p. 57), and carries its generated hazards.
  for (const z of d.zones) if (z.layer === "duct") z.flags = { ...z.flags, dark: true };
  dressDucts(rng.fork("ducts"), d);

  // Hiding places on the main routes: at least 40% cluttered.
  const route = mainRouteZones(d);
  const onRoute = route.map((id) => byId.get(id)!).filter((z) => z.layer !== "duct");
  let cluttered = onRoute.filter((z) => z.cluttered).length;
  for (const z of shuffle(rng, onRoute.filter((x) => !x.cluttered))) {
    if (cluttered >= Math.ceil(0.4 * onRoute.length)) break;
    z.cluttered = true;
    z.details = [...(z.details ?? []), "Debris"];
    cluttered++;
  }

  // GM notes on key rooms.
  for (const k of d.keys) {
    const n = nodeOfZone(d, k.zone);
    const desc = n?.keyRoom?.description;
    if (desc) byId.get(k.zone)!.gmNote = desc;
  }
}

/** Duct hazards per sheet (module decision; see DUCT_HAZARD_ODDS): vent fans, hot pipes and flooded stretches. */
function dressDucts(rng: Rng, d: Draft): void {
  const allowed = new Set(d.inputs.hazards);
  const odds = DUCT_HAZARD_ODDS[d.inputs.site_type];
  const byId = zoneById(d);
  const danger = (z: MapZoneData) => ["fan", "steam", "flooded", "collapsed", "oneWayDrop"].some((f) => z.flags?.[f] === true);
  for (const sheet of d.layout.ducts.sheets) {
    const zones = sheet.zones.map((id) => byId.get(id)!);
    const used = new Set<string>();
    const free = zones.filter((z) => z.flags?.exitTo === undefined && z.flags?.shaftTo === undefined && !danger(z));
    const take = (shapes: string[]): MapZoneData | undefined => {
      const z = pickOne(rng, free.filter((x) => !used.has(x.id) && shapes.includes(String(x.flags?.ductType))));
      if (z) used.add(z.id);
      return z;
    };
    const set = (z: MapZoneData | undefined, flag: string) => {
      if (z) z.flags = { ...z.flags, [flag]: true };
    };
    if (rng.next() < odds.fan) set(take(["run"]), "fan");
    if (rng.next() < odds.steam) set(take(["run", "bend"]), "steam");
    if (allowed.has("flooding") && rng.next() < odds.flooded + (sheet.role === "lower" ? 0.3 : 0)) set(take(["run", "dead-end"]), "flooded");
    // Every sheet holds at least one danger.
    if (!zones.some(danger)) set(take(["run", "bend", "dead-end", "junction"]), odds.fan > 0 ? "fan" : "steam");
  }
}

/** Zones on the shortest floor routes between consecutive key rooms and on to the final win path. */
function mainRouteZones(d: Pick<Draft, "zones" | "borders" | "sequence" | "keys" | "wins" | "start">): string[] {
  const out = new Set<string>();
  const actOf = new Map(d.keys.map((k) => [k.zone, k.act]));
  const legs: Array<[string, string, number]> = [];
  for (let i = 1; i < d.sequence.length; i++) legs.push([d.sequence[i - 1]!, d.sequence[i]!, actOf.get(d.sequence[i]!) ?? 1]);
  const last = d.sequence[d.sequence.length - 1]!;
  for (const w of d.wins) legs.push([last, w.zone, 3]);
  for (const [a, b, act] of legs) {
    const path = shortestPath(zoneAdjacency(d, act, { floorOnly: true }), a, b);
    for (const z of path ?? []) out.add(z);
  }
  return [...out];
}

// ---------------------------------------------------------------------------
// Stage 5: encounters and clues
// ---------------------------------------------------------------------------

interface ThreatSpec {
  creature: string;
  name: string;
  act: number;
  count: number;
  tier: ThreatTier;
  cost: number;
  speed: number;
}

export function threatSpecs(inputs: MapInputs): ThreatSpec[] {
  return inputs.threats.map((t) => {
    const preset = creaturePresets.find((p) => p.id === t.creature)!;
    const base = CREATURE_TIERS[t.creature]?.tier ?? "greater";
    const tier = groupTier(base, t.count);
    let speed = typeof preset.fields.speed === "number" ? preset.fields.speed : 1;
    const swarm = preset.fields.swarmSpeed;
    if (t.count > 1 && Array.isArray(swarm)) {
      // Facehugger swarms move faster as they grow (p. 213).
      const row = (swarm as Array<{ min: number; max?: number; speed: number }>).find((r) => t.count >= r.min && (r.max === undefined || t.count <= r.max));
      if (row) speed = row.speed;
    }
    return { creature: t.creature, name: preset.name, act: t.act, count: t.count, tier, cost: THREAT_COST[tier], speed };
  });
}

function placeEncounters(rng: Rng, d: Draft): void {
  const { inputs } = d;
  const byId = zoneById(d);
  const markers: MapMarker[] = [];
  const nextId = () => `M${String(markers.length + 1).padStart(3, "0")}`;
  const keyZones = new Set(d.keys.map((k) => k.zone));
  const winZones = new Set(d.wins.map((w) => w.zone));
  const adjCache = new Map<number, Adjacency>();
  const adjFor = (act: number) => {
    if (!adjCache.has(act)) adjCache.set(act, zoneAdjacency(d, act));
    return adjCache.get(act)!;
  };
  const focusOf = (act: number) => d.keys.find((k) => k.act === act)?.zone ?? d.keys.filter((k) => k.act < act).pop()?.zone ?? d.start;

  markers.push({ id: nextId(), kind: "start", zone: d.start, label: "Start", gmOnly: false });

  // Spawns: duct junctions and vent chambers, or dark, cluttered rooms, at least five zones from the start.
  const lair = (z: MapZoneData) => z.layer === "duct" && z.flags?.exitTo === undefined && (z.flags?.ductType === "junction" || z.flags?.ductType === "chamber");
  const spawnPool = d.zones.filter(
    (z) =>
      z.kind !== "out-of-bounds" &&
      z.id !== d.start &&
      !keyZones.has(z.id) &&
      !winZones.has(z.id) &&
      (lair(z) || (z.kind === "room" && z.cluttered && z.flags?.dark === true)),
  );
  const usedSpawn = new Set<string>();
  const threats = threatSpecs(inputs);
  const spawnMarkers: MapMarker[] = [];
  for (const t of threats) {
    const adj = adjFor(t.act);
    const fromStart = bfs(adj, d.start);
    const focus = focusOf(t.act);
    const fromFocus = bfs(adj, focus);
    const want = t.speed > 0 ? CONTACT_STRETCHES * t.speed : 0;
    const far = (z: MapZoneData) => (fromStart.get(z.id) ?? -1) >= MIN_SPAWN_DISTANCE;
    // Preferred: duct zones or dark, cluttered rooms; else any far zone that is not a key room.
    let pool = spawnPool.filter(far);
    if (pool.length === 0) pool = d.zones.filter((z) => z.kind !== "out-of-bounds" && !keyZones.has(z.id) && !winZones.has(z.id) && far(z));
    const scored = pool
      .map((z) => {
        const df = fromFocus.get(z.id) ?? 99;
        const score = (t.speed > 0 ? Math.abs(df - want) : -df * 0.1) - (lair(z) ? 0.5 : 0) + (usedSpawn.has(z.id) ? 3 : 0) + rng.next() * 0.3;
        return { z, score };
      })
      .sort((a, b) => a.score - b.score);
    let zone = scored[0]?.z.id;
    if (!zone) {
      // Nothing far enough: the farthest zone, which the spawn check will flag.
      zone = [...fromStart.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? d.start;
    }
    usedSpawn.add(zone);
    const active = t.act >= 2;
    const df = fromFocus.get(zone);
    const m: MapMarker = {
      id: nextId(),
      kind: "spawn",
      zone,
      label: `${t.name}${t.count > 1 ? ` x${t.count}` : ""}`,
      act: t.act,
      gmOnly: true,
      data: {
        creature: t.creature,
        name: t.name,
        count: t.count,
        tier: t.tier,
        tierLabel: THREAT_TIER_LABELS[t.tier],
        cost: t.cost,
        speed: t.speed,
        state: active ? "active" : "passive",
        ...(active ? {} : { wakesOn: "noise, light or a PC in sight" }),
        distanceFromStart: fromStart.get(zone) ?? null,
        focus,
        contactStretches: t.speed > 0 && df !== undefined ? Math.ceil(df / t.speed) : null,
      },
    };
    markers.push(m);
    spawnMarkers.push(m);
    if (active) {
      const path = shortestPath(adj, zone, focus) ?? [];
      const inner = path.slice(1, -1);
      const n = Math.min(3, inner.length);
      for (let i = 0; i < n; i++) {
        const at = inner[Math.floor(((i + 1) * inner.length) / (n + 1))]!;
        markers.push({ id: nextId(), kind: "waypoint", zone: at, label: `${t.name} patrol ${i + 1}`, act: t.act, gmOnly: true, data: { spawn: m.id, order: i + 1 } });
      }
    }
  }

  // NPCs: a zone per act.
  const rooms = d.zones.filter((z) => z.kind === "room" && z.layer !== "duct");
  const inRegion = (act: number, pred: (z: MapZoneData) => boolean = () => true) => {
    const list = rooms.filter((z) => (z.acts ?? [])[0] === act && pred(z));
    return list.length > 0 ? list : rooms.filter(pred).length > 0 ? rooms.filter(pred) : rooms;
  };
  const terminal = (z: MapZoneData) => hasTag(nodeOfZone(d, z.id), "terminal");
  for (const npc of inputs.npcs) {
    let zones: string[];
    if (npc.role === "android") zones = [1, 2, 3].map((a) => pickOne(rng, inRegion(a, terminal))!.id);
    else if (npc.role === "survivor") {
      const hide = pickOne(rng, inRegion(1 + rng.int(0, 1), (z) => z.cluttered && z.flags?.deadEnd === true && z.id !== d.start && !keyZones.has(z.id)))!.id;
      zones = [hide, hide, focusOf(3)];
    } else zones = [d.start, pickOne(rng, inRegion(2))!.id, focusOf(3)];
    zones.forEach((zone, i) => markers.push({ id: nextId(), kind: "npc", zone, label: npc.name, act: i + 1, gmOnly: true, data: { name: npc.name, role: npc.role } }));
  }

  // Clues: three zones per puzzle, two of them on separate routes into the puzzle's room.
  const keyByName = new Map(d.keys.map((k) => [k.name.toLowerCase(), k]));
  const floorAdj = new Map<number, Adjacency>();
  for (const p of inputs.puzzles) placeClues(rng, d, p, keyByName, adjFor, floorAdj, markers, nextId, byId);

  // Win paths.
  const act3Puzzles = inputs.puzzles.filter((p) => p.act === 3).map((p) => p.id);
  for (const w of d.wins) {
    const data: Record<string, unknown> = { type: w.type, requires: act3Puzzles };
    if (w.type === "seal_section") {
      const blast = d.borders.find((b) => b.flags?.sealable === true && (b.a === w.zone || b.b === w.zone));
      if (blast) data.border = blast.id;
    }
    markers.push({ id: nextId(), kind: "win", zone: w.zone, label: WIN_PATH_LABELS[w.type], act: 3, gmOnly: true, data });
  }

  // Hazards worth a marker.
  for (const z of d.zones) {
    if (z.kind === "out-of-bounds") continue;
    const f = z.flags ?? {};
    const notes: string[] = [];
    if (f.fan === true) notes.push("Vent fan");
    if (f.steam === true) notes.push("Hot pipes");
    if (f.collapsed === true) notes.push("Collapsed section");
    if (f.oneWayDrop === true) notes.push(`One-way drop ${DUCT_SHAFT_M} m`);
    if (f.atmosphere === "none") notes.push("No atmosphere");
    if (f.gravity === false) notes.push("Zero-G");
    if (typeof f.radiation === "string") notes.push(`Radiation (${f.radiation})`);
    if (f.flooded === true) notes.push("Flooded");
    if (typeof f.dropM === "number") notes.push(`Drop ${f.dropM} m`);
    if (notes.length > 0) markers.push({ id: nextId(), kind: "hazard", zone: z.id, label: notes.join(", "), gmOnly: true });
  }
  d.markers = markers;

  // Act summary: budgets (module decision), threat cost so far, encounter timer start (p. 303).
  const budgets = ACT_BUDGETS[inputs.crew] ?? ACT_BUDGETS[2]!;
  const acts: Record<string, unknown> = {};
  for (const a of [1, 2, 3]) {
    const cost = threats.filter((t) => t.act <= a).reduce((n, t) => n + t.cost, 0);
    const presence: EnemyPresenceId = a === 1 ? (threats.some((t) => t.act === 1) ? "uncertain" : "all-clear") : a === 2 ? (threats.some((t) => t.act === 1) ? "confirmed" : "suspected") : "closing";
    const level = ENEMY_PRESENCE.find((p) => p.id === presence)!;
    acts[String(a)] = { budget: budgets[a - 1], cost, presence, presenceLabel: level.label, presenceDice: level.dice, focus: focusOf(a) };
  }
  d.meta = { ...d.meta, acts, budgetNote: ACT_BUDGET_NOTE };
}

function placeClues(
  rng: Rng,
  d: Draft,
  p: PuzzleInput,
  keyByName: Map<string, KeyZone>,
  adjFor: (act: number) => Adjacency,
  floorAdj: Map<number, Adjacency>,
  markers: MapMarker[],
  nextId: () => string,
  byId: Map<string, MapZoneData>,
): void {
  // Without a key room in the act, a room of the act's region with two ways in (a duct access point or two passable borders).
  const actRooms = d.zones.filter((z) => z.kind === "room" && z.layer !== "duct" && z.id !== d.start && (z.acts ?? [])[0] === p.act);
  const ways = (z: MapZoneData) => (adjFor(p.act).get(z.id) ?? []).length;
  const anyRooms = d.zones.filter((z) => z.kind === "room" && z.layer !== "duct" && z.id !== d.start).sort((a, b) => Math.abs(((a.acts ?? [])[0] ?? 1) - p.act) - Math.abs(((b.acts ?? [])[0] ?? 1) - p.act));
  const target =
    (p.room ? keyByName.get(p.room.toLowerCase())?.zone : undefined) ??
    d.keys.find((k) => k.act === p.act)?.zone ??
    (actRooms.find((z) => z.flags?.ductTo !== undefined && ways(z) >= 2) ?? actRooms.find((z) => ways(z) >= 2) ?? anyRooms.find((z) => ways(z) >= 2) ?? actRooms[0])?.id ??
    d.keys[0]?.zone ??
    d.start;
  const at = d.sequence.indexOf(target);
  if (!floorAdj.has(p.act)) floorAdj.set(p.act, zoneAdjacency(d, p.act, { floorOnly: true }));
  // Routes need a zone between the two rooms, so a direct door between them does not count.
  const withoutDirect = (adj: Adjacency, a: string): Adjacency => {
    const out: Adjacency = new Map();
    for (const [k, list] of adj) out.set(k, list.filter((n) => !((k === a && n === target) || (k === target && n === a))));
    return out;
  };
  // Anchor: the key room before this one, else earlier ones, else the start.
  const anchors = [...(at > 0 ? d.sequence.slice(0, at).reverse() : []), d.start, ...d.sequence].filter((z, i, all) => z !== target && all.indexOf(z) === i);
  let anchor = anchors[0] ?? d.start;
  let routes: string[][] = [];
  for (const a of anchors) {
    routes = disjointPaths(withoutDirect(floorAdj.get(p.act)!, a), a, target, 2);
    if (routes.length < 2) routes = disjointPaths(withoutDirect(adjFor(p.act), a), a, target, 2);
    anchor = a;
    if (routes.length >= 2) break;
  }
  const chosen: Array<{ zone: string; route?: string[] }> = [];
  const pickOn = (route: string[]): string | undefined => {
    const inner = route.slice(1, -1).filter((z) => !chosen.some((c) => c.zone === z));
    const rooms = inner.filter((z) => byId.get(z)?.kind === "room");
    const floor = inner.filter((z) => byId.get(z)?.layer !== "duct");
    return pickOne(rng, rooms.length > 0 ? rooms : floor.length > 0 ? floor : inner);
  };
  for (const r of routes.slice(0, 2)) {
    const z = pickOn(r);
    if (z) chosen.push({ zone: z, route: r });
  }
  const fallbacks = [target, ...(adjFor(p.act).get(target) ?? []), anchor].filter((z) => byId.get(z)?.kind !== "out-of-bounds");
  for (const z of fallbacks) {
    if (chosen.length >= 3) break;
    if (!chosen.some((c) => c.zone === z)) chosen.push({ zone: z });
  }
  chosen.slice(0, 3).forEach((c, i) =>
    markers.push({
      id: nextId(),
      kind: "clue",
      zone: c.zone,
      label: `Clue ${p.id}-${"abc"[i]}`,
      act: p.act,
      gmOnly: true,
      data: { puzzle: p.id, answer: p.answer, target, anchor, ...(c.route ? { route: c.route } : {}) },
    }),
  );
}

// ---------------------------------------------------------------------------
// Stage 6: validation
// ---------------------------------------------------------------------------

/** Zone flags that never reach the player map unless found (duct hazards and exit labels need the zone revealed). */
const GM_ZONE_FLAGS = ["dark", "flammable", "atmosphere", "gravity", "radiation", "flooded", "deadEnd", "type", "exitTo", "fan", "steam", "collapsed", "oneWayDrop", "shaftTo", "ductType"];

function check(id: string, level: "block" | "warn", ok: boolean, message: string, page?: MapCheck["page"]): MapCheck {
  return { id, level, ok, message, ...(page !== undefined ? { page } : {}) };
}

/** The spec's validation checklist (section 9, without the lorebook check), plus layout sanity checks. */
export function validateLayout(layout: SiteLayout, inputs: MapInputs, extra: { keys: KeyZone[]; sequence: string[]; wins: Array<{ type: WinPathId; zone: string }>; lostPassages?: number }): MapCheck[] {
  const checks: MapCheck[] = [];
  const d = { zones: layout.zones, borders: layout.borders, start: layout.start ?? "", keys: extra.keys, sequence: extra.sequence, wins: extra.wins };
  const byId = new Map(layout.zones.map((z) => [z.id, z]));
  const floor = layout.zones.filter((z) => z.layer !== "duct");
  const playable = floor.filter((z) => z.kind !== "out-of-bounds");

  // Zone count for the size.
  const [lo, hi] = SIZE_ZONES[inputs.size];
  checks.push(check("zone-count", "block", playable.length >= lo && playable.length <= hi, `${playable.length} playable zones (${inputs.size}: ${lo}-${hi})`));

  // Every key room the brief names exists on the map.
  const missing = inputs.key_rooms.filter((k) => !extra.keys.some((x) => x.name === k.name));
  checks.push(check("key-rooms", "block", missing.length === 0, missing.length === 0 ? `${extra.keys.length} key rooms placed and named` : `No room left for: ${missing.map((k) => k.name).join(", ")}`, 157));

  // Layout sanity: every passage drawn, no overlapping zones.
  let overlaps = 0;
  const fb = layout.zones.map((z) => ({ z, r: polyBounds(z.poly) }));
  for (let i = 0; i < fb.length; i++)
    for (let j = i + 1; j < fb.length; j++) {
      const a = fb[i]!;
      const b = fb[j]!;
      if (a.z.deck !== b.z.deck) continue;
      if (a.r.x0 < b.r.x1 && b.r.x0 < a.r.x1 && a.r.y0 < b.r.y1 && b.r.y0 < a.r.y1) overlaps++;
    }
  checks.push(check("layout-intact", "block", overlaps === 0 && (extra.lostPassages ?? 0) === 0, overlaps === 0 && !extra.lostPassages ? "Zones tile the deck and every planned passage is drawn" : `${overlaps} overlapping zones, ${extra.lostPassages ?? 0} passages not drawn`));

  // Reachability with Act 1 states, win paths with Act 3 states.
  const reach = reachProblems(d);
  const act1 = reach.filter((m) => m.startsWith("Act 1"));
  checks.push(check("reach-act1", "block", act1.length === 0, act1.length === 0 ? "Every key room and win path is reachable from the start in Act 1" : act1.join("; ")));
  const act3 = reach.filter((m) => m.startsWith("Act 3") && m.includes("win path"));
  checks.push(check("win-act3", "block", act3.length === 0, act3.length === 0 ? "Every win path is reachable in Act 3" : act3.join("; ")));

  // Path length for the runtime: shortest walk from the start to the farthest win path (floor first, ducts if the floor is shut).
  const [pl, ph] = PATH_LENGTH_BY_HOURS[inputs.runtime_h] ?? [8, 16];
  const walk = finalWinDistance(d);
  checks.push(check("path-length", "warn", walk >= pl && walk <= ph, `Start to the final win path: ${walk < 0 ? "no route" : `${walk} zones`} (aim for ${pl}-${ph} for ${inputs.runtime_h} h)`));

  // Two routes between consecutive key rooms, except one deliberate Act 3 chokepoint.
  const fails = routeFailures(d);
  const okRoutes = fails.length === 0 || (fails.length === 1 && fails[0]!.act === 3);
  checks.push(
    check(
      "two-routes",
      "block",
      okRoutes,
      fails.length === 0
        ? "Every pair of consecutive key rooms has two or more separate routes"
        : `${fails.map((f) => `${f.from} to ${f.to}: ${f.routes} route${f.routes === 1 ? "" : "s"}`).join("; ")}${okRoutes ? " (the one deliberate Act 3 chokepoint)" : ""}`,
    ),
  );

  // Duct networks (sheets joined by shafts) need two or more access points.
  const ductZones = layout.zones.filter((z) => z.layer === "duct").map((z) => z.id);
  const ductAdj = new Map<string, string[]>(ductZones.map((z) => [z, []]));
  for (const b of layout.borders) if ((b.kind === "open" || b.kind === "shaft" || (b.kind === "wall" && b.flags?.collapsed === true)) && ductAdj.has(b.a) && ductAdj.has(b.b)) {
    ductAdj.get(b.a)!.push(b.b);
    ductAdj.get(b.b)!.push(b.a);
  }
  const nets = components(ductAdj, ductZones);
  const accessOf = (net: string[]) => layout.borders.filter((b) => b.kind === "access" && !b.sealed && (net.includes(b.a) || net.includes(b.b))).length;
  const badNets = nets.filter((n) => accessOf(n) < 2);
  checks.push(check("duct-access", "block", badNets.length === 0, badNets.length === 0 ? `${nets.length} duct network${nets.length === 1 ? "" : "s"}, each with two or more access points` : `Duct network at ${badNets.map((n) => n[0]).join(", ")} has fewer than two access points`, 56));

  // Every duct sheet reaches two or more rooms through unsealed access points (p. 56).
  const ductDecks = layout.decks.filter((x) => x.layer === "duct");
  const lonelySheets = ductDecks.filter((deck) => {
    const rooms = new Set(
      layout.borders
        .filter((b) => b.kind === "access" && !b.sealed && byId.get(b.b)?.deck === deck.id && byId.get(b.a)?.kind === "room")
        .map((b) => b.a),
    );
    return rooms.size < 2;
  });
  checks.push(check("duct-rooms", "block", lonelySheets.length === 0, ductDecks.length === 0 ? "No duct sheets" : lonelySheets.length === 0 ? `${ductDecks.length} duct sheet${ductDecks.length === 1 ? "" : "s"}, each reaching two or more rooms` : `Fewer than two rooms reached from ${lonelySheets.map((x) => x.id).join(", ")}`, 56));

  // Every exit is labelled with where it comes out, and its floor zone points back.
  const unlabelled: string[] = [];
  for (const b of layout.borders.filter((x) => x.kind === "access")) {
    const duct = byId.get(b.b);
    const to = duct?.flags?.exitTo as { zone?: string; name?: string } | undefined;
    const back = byId.get(b.a)?.flags?.ductTo as { zone?: string } | undefined;
    if (!to || to.zone !== b.a || !to.name || back?.zone !== b.b) unlabelled.push(b.b);
  }
  for (const z of layout.zones) if (z.flags?.exitTo !== undefined && !layout.borders.some((b) => b.kind === "access" && b.b === z.id)) unlabelled.push(z.id);
  checks.push(check("duct-exits", "block", unlabelled.length === 0, unlabelled.length === 0 ? "Every duct exit names the room or spot it leads to" : `Exits without a label: ${unlabelled.join(", ")}`, 56));

  // Duct zones: 25 m or less, runs 1 m wide, 8-20 zones per sheet (module decision).
  const ductBad: string[] = [];
  for (const z of layout.zones.filter((x) => x.layer === "duct")) {
    const r = polyBounds(z.poly);
    if (sizeOf(z) > MAX_ZONE_M || (z.flags?.ductType === "run" && Math.min(r.x1 - r.x0, r.y1 - r.y0) !== 1)) ductBad.push(z.id);
  }
  const ductCounts = ductDecks.map((deck) => layout.zones.filter((z) => z.deck === deck.id).length);
  const crowded = ductCounts.some((n) => n > DUCT_SHEET_MAX);
  checks.push(check("duct-size", "block", ductBad.length === 0 && !crowded, ductBad.length === 0 && !crowded ? `Duct zones are ${MAX_ZONE_M} m or less and runs are 1 m wide` : `Duct zones too big or too wide: ${ductBad.join(", ") || "none"}${crowded ? `; a sheet has over ${DUCT_SHEET_MAX} zones` : ""}`, 54));

  // Zone sizes (p. 54).
  const tooBig = playable.filter((z) => z.kind !== "corridor" && sizeOf(z) > MAX_ZONE_M);
  checks.push(check("room-size", "block", tooBig.length === 0, tooBig.length === 0 ? `No room over ${MAX_ZONE_M} m across` : `Over ${MAX_ZONE_M} m: ${tooBig.map((z) => z.id).join(", ")}`, 54));
  const longCorr = playable.filter((z) => z.kind === "corridor" && sizeOf(z) > MAX_ZONE_M);
  checks.push(check("corridor-split", "block", longCorr.length === 0, longCorr.length === 0 ? `Corridors are split into zones of ${MAX_ZONE_M} m or less` : `Corridor runs over ${MAX_ZONE_M} m: ${longCorr.map((z) => z.id).join(", ")}`, [54, 55]));

  // Crawlspaces are open (p. 56).
  const clutteredDucts = layout.zones.filter((z) => (z.layer === "duct" || z.kind === "crawlspace") && (z.cluttered || z.flags?.singleFile !== true));
  checks.push(check("crawlspace-open", "block", clutteredDucts.length === 0, clutteredDucts.length === 0 ? "Every crawlspace zone is open and single file" : `Cluttered or not single file: ${clutteredDucts.map((z) => z.id).join(", ")}`, [55, 56]));

  // Spawns at least five zones from the start (p. 55, 58).
  const spawns = layout.markers.filter((m) => m.kind === "spawn");
  const near = spawns.filter((m) => {
    const dist = bfs(zoneAdjacency(d, m.act ?? 1), d.start).get(m.zone);
    return dist === undefined || dist < MIN_SPAWN_DISTANCE;
  });
  checks.push(check("spawn-distance", "block", near.length === 0, near.length === 0 ? `Every spawn is ${MIN_SPAWN_DISTANCE}+ zones from the start, past Long range and the tracker` : `Too close to the start: ${near.map((m) => `${m.label} in ${m.zone}`).join(", ")}`, [55, 58]));

  // Act budgets (owner's heuristic).
  const threats = threatSpecs(inputs);
  const budgets = ACT_BUDGETS[inputs.crew] ?? ACT_BUDGETS[2]!;
  const off: string[] = [];
  for (const a of [1, 2, 3]) {
    const cost = threats.filter((t) => t.act <= a).reduce((n, t) => n + t.cost, 0);
    const [bl, bh] = budgets[a - 1]!;
    if (cost < bl || cost > bh) off.push(`Act ${a} ${cost} (budget ${bl === bh ? bl : `${bl}-${bh}`})`);
  }
  checks.push(check("act-budget", "warn", off.length === 0, off.length === 0 ? `Threat cost fits the budget for a crew of ${inputs.crew}` : `Threat cost: ${off.join(", ")} for a crew of ${inputs.crew}`, 305));

  // Overwhelming threats need a way to win without killing them.
  const overwhelming = threats.filter((t) => t.tier === "overwhelming");
  const nonCombat = inputs.win_paths.some((w) => NON_COMBAT_WIN_PATHS.includes(w)) && extra.wins.some((w) => NON_COMBAT_WIN_PATHS.includes(w.type));
  checks.push(check("overwhelming-exit", "block", overwhelming.length === 0 || nonCombat, overwhelming.length === 0 ? "No overwhelming threat" : nonCombat ? "Overwhelming threat with a way to win without killing it" : `${overwhelming.map((t) => t.name).join(", ")} needs an escape craft, airlock, self-destruct or sealable section`, 305));

  // Three clues per puzzle, on two or more separate routes.
  const clueProblems: string[] = [];
  for (const p of inputs.puzzles) {
    const ms = layout.markers.filter((m) => m.kind === "clue" && m.data?.puzzle === p.id);
    const zonesSet = new Set(ms.map((m) => m.zone));
    if (ms.length < 3 || zonesSet.size < 3) {
      clueProblems.push(`${p.id}: ${zonesSet.size} clue zones`);
      continue;
    }
    const adj = zoneAdjacency(d, p.act);
    const routed = ms
      .map((m) => ({ zone: m.zone, route: Array.isArray(m.data?.route) ? (m.data!.route as string[]) : undefined }))
      .filter((x): x is { zone: string; route: string[] } => !!x.route && validRoute(adj, x.route) && x.route.slice(1, -1).includes(x.zone));
    let separate = false;
    for (let i = 0; i < routed.length && !separate; i++)
      for (let j = i + 1; j < routed.length && !separate; j++) {
        const a = new Set(routed[i]!.route.slice(1, -1));
        const b = routed[j]!.route.slice(1, -1);
        const sameEnds = routed[i]!.route[0] === routed[j]!.route[0] && routed[i]!.route.at(-1) === routed[j]!.route.at(-1);
        if (sameEnds && !b.some((z) => a.has(z))) separate = true;
      }
    if (!separate) clueProblems.push(`${p.id}: clues are not on two separate routes`);
  }
  checks.push(check("three-clues", "block", clueProblems.length === 0, inputs.puzzles.length === 0 ? "No puzzles" : clueProblems.length === 0 ? "Every puzzle answer sits in three zones on two or more routes" : clueProblems.join("; ")));

  // Hiding places on the main routes.
  const route = mainRouteZones(d).map((id) => byId.get(id)!).filter((z) => z.layer !== "duct");
  const share = route.length === 0 ? 1 : route.filter((z) => z.cluttered).length / route.length;
  checks.push(check("cluttered-routes", "warn", share >= 0.4, `${Math.round(share * 100)}% of the zones on the main routes are cluttered (aim for 40%+)`, 54));

  // Darkness on the way to the Act 2 key rooms.
  const act2 = extra.keys.filter((k) => k.act === 2);
  const lit = act2.filter((k) => {
    const darkZones = new Set(layout.zones.filter((z) => z.flags?.dark === true && z.id !== k.zone && z.id !== d.start).map((z) => z.id));
    return bfs(zoneAdjacency(d, 2), d.start, darkZones).has(k.zone);
  });
  checks.push(check("dark-route", "warn", act2.length === 0 || lit.length === 0, act2.length === 0 ? "No Act 2 key room" : lit.length === 0 ? "Every route to the Act 2 key rooms passes a dark zone" : `A lit route reaches ${lit.map((k) => k.zone).join(", ")}`, 57));

  // Outer hull only where an edge faces the hull (p. 75).
  const badHull = floor.filter((z) => z.flags?.outerHull === true && !(Array.isArray(z.flags?.outerEdges) && (z.flags!.outerEdges as unknown[]).length > 0));
  checks.push(check("outer-hull", "block", badHull.length === 0, badHull.length === 0 ? "Outer-hull zones all sit on hull-facing edges" : `Outer hull without a hull edge: ${badHull.map((z) => z.id).join(", ")}`, 75));

  // Fire spread: flammable zones are not one open-linked mass.
  const flam = playable.filter((z) => z.flags?.flammable === true).map((z) => z.id);
  const fireAdj = new Map<string, string[]>(flam.map((z) => [z, []]));
  for (const b of layout.borders) if (b.kind === "open" && fireAdj.has(b.a) && fireAdj.has(b.b)) {
    fireAdj.get(b.a)!.push(b.b);
    fireAdj.get(b.b)!.push(b.a);
  }
  const largest = Math.max(0, ...components(fireAdj, flam).map((c) => c.length));
  const fireOk = flam.length <= 1 || (largest < flam.length && largest <= 3);
  checks.push(check("fire-spread", "warn", fireOk, flam.length === 0 ? "Nothing flammable" : `${flam.length} flammable zones; the largest group linked by open borders has ${largest}`, 76));

  // No spoilers in the player projection.
  const leaks: string[] = [];
  for (const a of [1, 2, 3]) {
    const p = playerLayout(layout, a);
    if (p.markers.some((m) => m.gmOnly)) leaks.push(`Act ${a}: GM-only markers`);
    if (p.zones.some((z) => z.gmNote !== undefined || z.details !== undefined || z.salvage !== undefined)) leaks.push(`Act ${a}: GM notes or dressing`);
    if (p.zones.some((z) => z.flags && GM_ZONE_FLAGS.some((f) => f in z.flags!))) leaks.push(`Act ${a}: GM-only zone flags`);
    const ductsShown = p.zones.filter((z) => z.layer === "duct").map((z) => z.id);
    const knownExits = new Set(p.borders.filter((b) => b.kind === "access").map((b) => b.b));
    if (ductsShown.some((z) => !knownExits.has(z))) leaks.push(`Act ${a}: duct zones the crew has not found`);
    const knownFloor = new Set(p.borders.filter((b) => b.kind === "access").map((b) => b.a));
    if (p.zones.some((z) => z.flags?.ductTo !== undefined && !knownFloor.has(z.id))) leaks.push(`Act ${a}: duct access the crew has not found`);
    if (p.borders.some((b) => b.hidden || b.lock !== undefined || b.lockedInActs !== undefined)) leaks.push(`Act ${a}: hidden borders or lock states`);
    if (p.meta !== undefined || p.checks.length > 0) leaks.push(`Act ${a}: GM data`);
  }
  checks.push(check("no-spoilers", "block", leaks.length === 0, leaks.length === 0 ? "The player map carries no spawns, clues, NPC positions, GM notes or hidden borders" : leaks.join("; ")));

  // Placement rule: greater threats have two ways in, one through the ducts.
  const lonely = spawns.filter((m) => {
    const tier = m.data?.tier;
    if (tier !== "greater" && tier !== "overwhelming") return false;
    const focus = typeof m.data?.focus === "string" ? m.data.focus : d.start;
    if (focus === m.zone) return false;
    const paths = disjointPaths(zoneAdjacency(d, m.act ?? 2), m.zone, focus, 2);
    return paths.length < 2 || !paths.some((p) => p.some((z) => byId.get(z)?.layer === "duct"));
  });
  checks.push(check("threat-approach", "warn", lonely.length === 0, spawns.length === 0 ? "No threats placed" : lonely.length === 0 ? "Greater threats have two ways to the crew, one through the ducts" : `One way in, or none through the ducts: ${lonely.map((m) => m.label).join(", ")}`));

  return checks;
}

/** Shortest distance in Act 3 from the start to the farthest win path, on the floor (with ducts when the floor is shut). */
export function finalWinDistance(d: Pick<Draft, "zones" | "borders" | "start" | "wins">): number {
  const floor = bfs(zoneAdjacency(d, 3, { floorOnly: true }), d.start);
  const all = bfs(zoneAdjacency(d, 3), d.start);
  const dists = d.wins.map((w) => floor.get(w.zone) ?? all.get(w.zone)).filter((x): x is number => x !== undefined);
  return dists.length === d.wins.length && dists.length > 0 ? Math.max(...dists) : -1;
}

function sizeOf(z: MapZoneData): number {
  const r = polyBounds(z.poly);
  return Math.max(r.x1 - r.x0, r.y1 - r.y0);
}

function validRoute(adj: Adjacency, route: string[]): boolean {
  for (let i = 1; i < route.length; i++) if (!(adj.get(route[i - 1]!) ?? []).includes(route[i]!)) return false;
  return route.length >= 2;
}

// ---------------------------------------------------------------------------
// The pipeline
// ---------------------------------------------------------------------------

function toLayout(d: Draft): SiteLayout {
  return { decks: d.layout.decks, zones: d.zones, borders: d.borders, markers: d.markers, start: d.start, gridM: 1, checks: [], meta: d.meta };
}

export function runOnce(inputs: MapInputs, ctx: MapGeneratorContext, attempt: number): { layout: SiteLayout; checks: MapCheck[] } {
  const profile = SITE_PROFILES[inputs.site_type];
  const plan = planSite(stageRng(ctx, "graph", attempt), inputs, profile);
  const layout = layoutSite(stageRng(ctx, "layout", attempt), plan, profile, inputs);
  const start = layout.zoneOf.get(plan.start)!;
  const keys: KeyZone[] = plan.sequence
    .slice(1)
    .map((k) => plan.nodes.get(k)!)
    .map((n) => ({ zone: layout.zoneOf.get(n.key)!, act: n.keyRoom!.act, name: n.keyRoom!.name || n.name || "", index: n.keyRoom!.index }));
  const d: Draft = {
    inputs,
    profile,
    plan,
    layout,
    zones: layout.zones,
    borders: [],
    markers: [],
    start,
    keys,
    sequence: [start, ...keys.map((k) => k.zone)],
    wins: plan.wins.map((w) => ({ type: w.type, zone: layout.zoneOf.get(w.node)! })),
    lostPassages: 0,
    meta: { generator: MAP_GENERATOR_ID, siteType: inputs.site_type, size: inputs.size, keyRooms: [] as unknown[] },
  };
  buildBorders(stageRng(ctx, "borders", attempt), d);
  dress(stageRng(ctx, "dressing", attempt), d, ctx);
  placeEncounters(stageRng(ctx, "encounters", attempt), d);
  d.meta.keyRooms = d.keys.map((k) => ({ zone: k.zone, act: k.act, name: k.name }));
  d.meta.sequence = d.sequence;
  d.meta.wins = d.wins;
  d.meta.ducts = layout.ducts.sheets.map((s) => ({ deck: s.deck.id, serves: s.serves, role: s.role, level: s.deck.level, zones: s.zones.length, exits: s.exits.map((e) => ({ zone: e.duct, to: e.floor, name: e.name })) }));
  const out = toLayout(d);
  const checks = validateLayout(out, inputs, { keys: d.keys, sequence: d.sequence, wins: d.wins, lostPassages: d.lostPassages });
  out.checks = checks;
  return { layout: out, checks };
}

/** Generate a site map. Deterministic for the same inputs, seed and stage seeds. */
export function generateSiteMap(rawInputs: Record<string, unknown>, ctx: MapGeneratorContext): MapGeneratorResult {
  const inputs = normalizeMapInputs(rawInputs);
  const failures = new Map<string, number>();
  let last: SiteLayout | undefined;
  let attempt = 0;
  while (attempt < MAX_ATTEMPTS) {
    attempt++;
    const { layout, checks } = runOnce(inputs, ctx, attempt);
    last = layout;
    const failing = checks.filter((c) => c.level === "block" && !c.ok);
    if (failing.length === 0) return { layout, attempts: attempt };
    for (const c of failing) failures.set(c.id, (failures.get(c.id) ?? 0) + 1);
    if (failing.every((c) => INPUT_BOUND_CHECKS.has(c.id))) break;
  }
  const worst = [...failures.entries()].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))[0]![0];
  return { layout: last!, attempts: attempt, failedCheck: worst };
}

export { alienPassable };
