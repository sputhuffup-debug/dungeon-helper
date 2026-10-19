/**
 * Live play on a generated site map, for table mode: what the GM can do to a
 * border, the range between two zones, and the clock signal that clears
 * tracker pings. State is written through the core live helpers.
 */
import {
  borderState,
  clearPings,
  liveOf,
  rangeBandFor,
  startLive,
  zoneDistances,
  zonePath,
  type CampaignStore,
  type Id,
  type Scene,
  type SiteMap,
  type SiteMapLiveState,
} from "@campaign-forge/core";
import type { MapBorderData, MapGeneratorDef, RangeBandDef, SiteLayout } from "@campaign-forge/module-sdk";
import { clockState, clockUnits } from "@campaign-forge/ui";

/** Which live toggles a border offers. */
export function borderControls(b: Pick<MapBorderData, "kind" | "hidden" | "lock">): { lock: boolean; seal: boolean; destroy: boolean; known: boolean } {
  const door = b.kind === "door" || b.kind === "hatch" || b.kind === "blast";
  return {
    lock: door,
    seal: b.kind === "access" || b.kind === "hatch" || b.kind === "door",
    destroy: door || b.kind === "wall" || b.kind === "access",
    known: !!b.hidden || door,
  };
}

export interface RangeReading {
  from: string;
  to: string;
  distance: number | undefined;
  band: RangeBandDef | undefined;
  path: string[] | undefined;
}

/** "What range is that?": the zone distance, its range band and one shortest path, in the live state. */
export function measureRange(layout: SiteLayout, live: SiteMapLiveState, def: MapGeneratorDef | undefined, from: string, to: string): RangeReading {
  const opts = { act: live.act, live, passable: def?.passable };
  const distance = zoneDistances(layout, { ...opts, from: [from] })[from]?.[to];
  return { from, to, distance, band: rangeBandFor(distance, def?.rangeBands), path: zonePath(layout, from, to, opts) };
}

/** The borders touching a zone, with their live state. */
export function zoneExits(layout: SiteLayout, live: SiteMapLiveState, def: MapGeneratorDef | undefined, zone: string) {
  return layout.borders
    .filter((b) => b.a === zone || b.b === zone)
    .map((b) => ({ border: b, other: b.a === zone ? b.b : b.a, override: live.borders[b.id] ?? {}, state: borderState(b, { act: live.act, live, passable: def?.passable }) }));
}

/**
 * The clock's position at the stretch level and above: every counter but the
 * smallest unit. It changes when a stretch (or anything bigger) passes, which
 * is when tracker pings go stale.
 */
export function clockStamp(config: Record<string, unknown> | undefined, state: unknown): string {
  const units = clockUnits(config);
  if (units.length < 2) return "";
  const c = clockState(state, units).counters;
  return units
    .slice(1)
    .map((u) => c[u.id] ?? 0)
    .join(":");
}

/** Clear the map's pings when the clock stamp moved on. Returns the stamp to remember. */
export function clearPingsOnStretch(store: CampaignStore, map: SiteMap, previous: string | undefined, next: string): string {
  if (previous !== undefined && previous !== next && liveOf(map).pings.length > 0) clearPings(store, map.id);
  return next;
}

/** The act number of the scene's act, if it has one. */
export function sceneActNumber(store: CampaignStore, scene: Scene | undefined): number | undefined {
  if (!scene?.act) return undefined;
  return store.get("acts", scene.act)?.number;
}

/** Start live play on a generated map that has none yet (the scene's act, else 1). */
export function ensureLive(store: CampaignStore, map: SiteMap, act: number | undefined): void {
  if (map.layout && !map.live) startLive(store, map.id, act ?? 1);
}

export type LiveTool = "select" | "reveal" | "measure" | "ping";

/** Zones the player map shows as fog: every zone not yet revealed (out-of-bounds zones are never fogged). */
export function unrevealed(layout: SiteLayout, live: SiteMapLiveState): Id[] {
  const seen = new Set(live.revealed);
  return layout.zones.filter((z) => z.kind !== "out-of-bounds" && !seen.has(z.id)).map((z) => z.id);
}
