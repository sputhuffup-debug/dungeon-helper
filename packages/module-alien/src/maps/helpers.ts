/**
 * Helpers over a generated site layout that other parts of the app can use:
 * which borders can be passed in an act, zone-to-zone distances and range
 * bands, and the player projection that strips everything GM-only.
 */
import type { MapBorderData, MapMarker, MapMove, MapZoneData, SiteLayout } from "@campaign-forge/module-sdk";
import { RANGE_BANDS } from "./data";
import { bfs, type Adjacency } from "./graph";

/**
 * Whether a border can be crossed in an act: walls never (a collapsed duct
 * section is a wall until cleared), sealed access points never (p. 56), and a
 * door, hatch, blast door or access point not while it is locked in that act.
 * Locked doors can still be broken or hacked (p. 61); for distances and
 * reachability they count as closed.
 *
 * With `move` (the step across the border), a one-way shaft is passable in
 * its direction only: `direction: "down"` (a drop, flagged `oneWay`) goes from
 * `a`, the top, to `b`; `"up"` from `b` to `a`. Without `move` a one-way shaft
 * counts as passable (it can be crossed at all).
 */
export function alienPassable(border: MapBorderData, act: number, move?: MapMove): boolean {
  if (border.kind === "wall") return false;
  if (border.sealed) return false;
  if ((border.lockedInActs ?? []).includes(act)) return false;
  if (move && border.kind === "shaft") {
    const dir = border.flags?.direction;
    if (dir === "down" && (move.from === border.b || (move.from !== border.a && move.vertical === "up"))) return false;
    if (dir === "up" && (move.from === border.a || (move.from !== border.b && move.vertical === "down"))) return false;
  }
  return true;
}

export interface DistanceOptions {
  /** Override passability (e.g. live border state). Defaults to `alienPassable`; `move` is the step being taken. */
  passable?: (border: MapBorderData, act: number, move?: MapMove) => boolean;
  /** Leave out duct zones (e.g. for a creature that cannot fit). */
  floorOnly?: boolean;
}

/**
 * Zone adjacency over the borders passable in an act. It is directed: a
 * one-way drop appears only from its top zone to its bottom zone.
 */
export function zoneAdjacency(layout: Pick<SiteLayout, "zones" | "borders"> & { decks?: SiteLayout["decks"] }, act: number, opts: DistanceOptions = {}): Adjacency {
  const pass = opts.passable ?? alienPassable;
  const keep = new Set(layout.zones.filter((z) => z.kind !== "out-of-bounds" && (!opts.floorOnly || z.layer !== "duct")).map((z) => z.id));
  const levelOf = new Map((layout.decks ?? []).map((d) => [d.id, d.level]));
  const zoneLevel = new Map(layout.zones.map((z) => [z.id, levelOf.get(z.deck)]));
  const move = (from: string, to: string): MapMove => {
    const a = zoneLevel.get(from);
    const b = zoneLevel.get(to);
    return { from, to, vertical: typeof a !== "number" || typeof b !== "number" || a === b ? "level" : b < a ? "down" : "up" };
  };
  const adj: Adjacency = new Map([...keep].map((z) => [z, []]));
  const add = (x: string, y: string) => {
    const list = adj.get(x)!;
    if (!list.includes(y)) list.push(y);
  };
  for (const b of layout.borders) {
    if (!keep.has(b.a) || !keep.has(b.b) || b.a === b.b) continue;
    if (pass(b, act, move(b.a, b.b))) add(b.a, b.b);
    if (pass(b, act, move(b.b, b.a))) add(b.b, b.a);
  }
  return adj;
}

/** Shortest zone distance from one zone to every reachable zone in an act. */
export function distancesFrom(layout: Pick<SiteLayout, "zones" | "borders">, from: string, act: number, opts: DistanceOptions = {}): Record<string, number> {
  return Object.fromEntries(bfs(zoneAdjacency(layout, act, opts), from));
}

/** Zone-to-zone distance table for an act (only reachable pairs appear). */
export function zoneDistances(layout: Pick<SiteLayout, "zones" | "borders">, act: number, opts: DistanceOptions & { zones?: string[] } = {}): Record<string, Record<string, number>> {
  const adj = zoneAdjacency(layout, act, opts);
  const out: Record<string, Record<string, number>> = {};
  for (const id of opts.zones ?? [...adj.keys()]) out[id] = Object.fromEntries(bfs(adj, id));
  return out;
}

/** The range band for a zone distance (0 Short, 1 Medium, 2-4 Long, 5+ Extreme; p. 55). Adjacent is tokens touching, not a distance. */
export function rangeBandFor(distance: number): { id: string; label: string } {
  const band = RANGE_BANDS.find((b) => b.maxDistance === undefined || distance <= b.maxDistance) ?? RANGE_BANDS[RANGE_BANDS.length - 1]!;
  return { id: band.id, label: band.label };
}

/** Zone flags players may see on their copy of the map. */
export const PLAYER_ZONE_FLAGS = ["sizeM", "outerEdges", "outerHull", "singleFile"] as const;
/** Duct hazard flags players see once they have crawled into the zone. */
export const FOUND_DUCT_FLAGS = ["fan", "steam", "flooded", "collapsed", "oneWayDrop"] as const;
/** Border flags players may see. */
export const PLAYER_BORDER_FLAGS = ["outerHull", "armored", "via", "duct", "outOfBounds", "closed", "direction", "dropM"] as const;

const pick = (flags: Record<string, unknown> | undefined, keys: readonly string[]): Record<string, unknown> | undefined => {
  if (!flags) return undefined;
  const out: Record<string, unknown> = {};
  for (const k of keys) if (flags[k] !== undefined) out[k] = flags[k];
  return Object.keys(out).length > 0 ? out : undefined;
};

export interface PlayerLayoutOptions {
  /** Border ids the crew has found (hidden access points, shafts, collapsed sections). */
  found?: Iterable<string>;
  /** Duct zone ids the crew has crawled into. */
  revealed?: Iterable<string>;
}

/**
 * The player's copy of a layout for an act: walls, doors, known hatches and
 * access points, area tints and key room names. Removes GM-only markers
 * (spawns, waypoints, clues, NPCs, win paths, hazards), GM notes, rolled
 * dressing, hidden borders, lock states, GM-only flags (darkness, hazards) and
 * the layout's checks and GM meta data. A blast door shut in this act shows as
 * closed, without saying why.
 *
 * Duct sheets are the GM's: a duct zone appears only once the crew knows it,
 * as the far end of a known access point or a zone in `revealed`, and only as
 * an outline. Exit labels (`exitTo`) show on revealed zones, and the floor
 * side's `ductTo` only once its access point is known; duct hazards show once
 * the zone is revealed. A duct sheet with no known zone is left out. Fog over
 * floor zones is left to the display.
 */
export function playerLayout(layout: SiteLayout, act: number, opts: PlayerLayoutOptions = {}): SiteLayout {
  const found = new Set(opts.found ?? []);
  const revealed = new Set(opts.revealed ?? []);
  const known = (b: MapBorderData) => !b.hidden || found.has(b.id);
  const ductIds = new Set(layout.zones.filter((z) => z.layer === "duct").map((z) => z.id));
  const knownDucts = new Set<string>(revealed);
  const knownAccess = new Set<string>();
  for (const b of layout.borders) {
    if (b.kind !== "access" || !known(b)) continue;
    knownAccess.add(b.a);
    knownAccess.add(b.b);
    for (const z of [b.a, b.b]) if (ductIds.has(z)) knownDucts.add(z);
  }
  const zones: MapZoneData[] = [];
  for (const z of layout.zones) {
    const duct = z.layer === "duct";
    if (duct && !knownDucts.has(z.id)) continue;
    const out: MapZoneData = { id: z.id, deck: z.deck, kind: z.kind, poly: z.poly.map((p) => [p[0], p[1]]), cluttered: duct ? false : z.cluttered };
    if (z.layer) out.layer = z.layer;
    if (!duct) {
      if (z.area) out.area = z.area;
      if (z.key) out.key = true;
      if (z.key && z.name) out.name = z.name;
      if (z.playerNote) out.playerNote = z.playerNote;
    }
    const flags = pick(z.flags, duct && revealed.has(z.id) ? [...PLAYER_ZONE_FLAGS, ...FOUND_DUCT_FLAGS, "exitTo"] : PLAYER_ZONE_FLAGS) ?? {};
    if (!duct && knownAccess.has(z.id) && z.flags?.ductTo !== undefined) flags.ductTo = z.flags.ductTo;
    if (Object.keys(flags).length > 0) out.flags = flags;
    zones.push(out);
  }
  const shown = new Set(zones.map((z) => z.id));
  const borders: MapBorderData[] = layout.borders
    .filter((b) => known(b) && shown.has(b.a) && shown.has(b.b))
    .map((b) => {
      const out: MapBorderData = { id: b.id, a: b.a, b: b.b, kind: b.kind };
      if (b.segment) out.segment = [
        [b.segment[0][0], b.segment[0][1]],
        [b.segment[1][0], b.segment[1][1]],
      ];
      if (b.armor !== undefined) out.armor = b.armor;
      if (b.hp !== undefined) out.hp = b.hp;
      if (b.sealed) out.sealed = true;
      const flags = pick(b.flags, PLAYER_BORDER_FLAGS) ?? {};
      if (b.kind === "blast" && (b.lockedInActs ?? []).includes(act)) flags.closed = true;
      if (Object.keys(flags).length > 0) out.flags = flags;
      return out;
    });
  const markers: MapMarker[] = layout.markers.filter((m) => !m.gmOnly).map((m) => ({ id: m.id, kind: m.kind, zone: m.zone, label: m.label, gmOnly: false }));
  const decksShown = new Set(zones.map((z) => z.deck));
  const out: SiteLayout = { decks: layout.decks.filter((d) => d.layer !== "duct" || decksShown.has(d.id)).map((d) => ({ ...d })), zones, borders, markers, checks: [] };
  if (layout.start) out.start = layout.start;
  if (layout.gridM !== undefined) out.gridM = layout.gridM;
  return out;
}
