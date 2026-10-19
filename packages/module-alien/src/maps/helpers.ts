/**
 * Helpers over a generated site layout that other parts of the app can use:
 * which borders can be passed in an act, zone-to-zone distances and range
 * bands, and the player projection that strips everything GM-only.
 */
import type { MapBorderData, MapMarker, MapZoneData, SiteLayout } from "@campaign-forge/module-sdk";
import { RANGE_BANDS } from "./data";
import { bfs, buildAdjacency, type Adjacency } from "./graph";

/**
 * Whether a border can be crossed in an act: walls never, sealed access points
 * never (p. 56), and a door, hatch, blast door or access point not while it is
 * locked in that act. Locked doors can still be broken or hacked (p. 61); for
 * distances and reachability they count as closed.
 */
export function alienPassable(border: MapBorderData, act: number): boolean {
  if (border.kind === "wall") return false;
  if (border.sealed) return false;
  if ((border.lockedInActs ?? []).includes(act)) return false;
  return true;
}

export interface DistanceOptions {
  /** Override passability (e.g. live border state). Defaults to `alienPassable`. */
  passable?: (border: MapBorderData, act: number) => boolean;
  /** Leave out duct zones (e.g. for a creature that cannot fit). */
  floorOnly?: boolean;
}

/** Zone adjacency over the borders passable in an act. */
export function zoneAdjacency(layout: Pick<SiteLayout, "zones" | "borders">, act: number, opts: DistanceOptions = {}): Adjacency {
  const pass = opts.passable ?? alienPassable;
  const keep = new Set(layout.zones.filter((z) => z.kind !== "out-of-bounds" && (!opts.floorOnly || z.layer !== "duct")).map((z) => z.id));
  return buildAdjacency(
    keep,
    layout.borders.filter((b) => keep.has(b.a) && keep.has(b.b) && pass(b, act)).map((b) => [b.a, b.b] as [string, string]),
  );
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
export const PLAYER_ZONE_FLAGS = ["sizeM", "outerEdges", "outerHull", "over"] as const;
/** Border flags players may see. */
export const PLAYER_BORDER_FLAGS = ["outerHull", "armored", "via", "duct", "outOfBounds", "closed"] as const;

const pick = (flags: Record<string, unknown> | undefined, keys: readonly string[]): Record<string, unknown> | undefined => {
  if (!flags) return undefined;
  const out: Record<string, unknown> = {};
  for (const k of keys) if (flags[k] !== undefined) out[k] = flags[k];
  return Object.keys(out).length > 0 ? out : undefined;
};

/**
 * The player's copy of a layout for an act: walls, doors, known hatches and
 * access points, duct outlines, area tints and key room names. Removes GM-only
 * markers (spawns, waypoints, clues, NPCs, win paths, hazards), GM notes,
 * rolled dressing, hidden borders, lock states, GM-only flags (darkness,
 * hazards) and the layout's checks and GM meta data. A blast door shut in this
 * act shows as closed, without saying why. Fog is left to the display.
 */
export function playerLayout(layout: SiteLayout, act: number): SiteLayout {
  const zones: MapZoneData[] = layout.zones.map((z) => {
    const out: MapZoneData = { id: z.id, deck: z.deck, kind: z.kind, poly: z.poly.map((p) => [p[0], p[1]]), cluttered: z.layer === "duct" ? false : z.cluttered };
    if (z.layer) out.layer = z.layer;
    if (z.layer !== "duct") {
      if (z.area) out.area = z.area;
      if (z.key) out.key = true;
      if (z.key && z.name) out.name = z.name;
      if (z.playerNote) out.playerNote = z.playerNote;
    }
    const flags = pick(z.flags, PLAYER_ZONE_FLAGS);
    if (flags) out.flags = flags;
    return out;
  });
  const borders: MapBorderData[] = layout.borders
    .filter((b) => !b.hidden)
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
  const out: SiteLayout = { decks: layout.decks.map((d) => ({ ...d })), zones, borders, markers, checks: [] };
  if (layout.start) out.start = layout.start;
  if (layout.gridM !== undefined) out.gridM = layout.gridM;
  return out;
}
