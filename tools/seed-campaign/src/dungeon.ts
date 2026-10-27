/**
 * A generated dungeon for a demo: run the module's map generator with a
 * fixed brief and seed, save it as the location's map, accept its rooms,
 * encounters and creatures into the campaign (as the map workbench's save
 * does), show it on the adventure's scenes there and, optionally, start the
 * table's live state with the way in and the first rooms revealed.
 *
 * Browser-safe: no `node:` imports.
 */
import { acceptMapProduce, linkMapToScenes, revealZones, runMapGenerator, setBorderState, setZoneFlag, startLive, type CampaignStore, type Id, type SiteMap } from "@campaign-forge/core";
import type { GameModule, SiteLayout } from "@campaign-forge/module-sdk";

export interface SeedDungeonOptions {
  generatorId: string;
  seed: string;
  name: string;
  /** The brief; the generator's defaults fill the rest. */
  inputs: Record<string, unknown>;
  adventureId: Id;
  /** The dungeon location the rooms go into. */
  locationId: Id;
  /** Start live play with this many rooms revealed from the way in, a trap found and a secret door found (for the player screen). */
  live?: { rooms: number } | undefined;
}

/** Zones in the order the players would walk into them from the way in, through doors they can see. */
export function walkOrder(layout: SiteLayout): string[] {
  const order = [layout.start!];
  const seen = new Set(order);
  for (let i = 0; i < order.length; i++) {
    const cur = order[i]!;
    for (const b of layout.borders) {
      if (b.hidden || b.kind === "rubble" || b.kind === "wall" || (b.a !== cur && b.b !== cur)) continue;
      const other = b.a === cur ? b.b : b.a;
      if (seen.has(other)) continue;
      seen.add(other);
      order.push(other);
    }
  }
  return order;
}

export function seedDungeon(store: CampaignStore, game: GameModule, o: SeedDungeonOptions): SiteMap {
  const def = (game.mapGenerators ?? []).find((g) => g.id === o.generatorId);
  if (!def?.produce) throw new Error(`demo: module has no map generator "${o.generatorId}"`);
  const defaults: Record<string, unknown> = {};
  for (const [k, s] of Object.entries((def.inputs as { properties?: Record<string, { default?: unknown }> }).properties ?? {})) if (s.default !== undefined) defaults[k] = structuredClone(s.default);
  const inputs = { ...defaults, ...structuredClone(o.inputs) };
  const result = runMapGenerator(game, def, structuredClone(inputs), { seed: o.seed });
  if (result.failedCheck) throw new Error(`demo: the dungeon "${o.name}" failed its check "${result.failedCheck}"`);
  const created = store.createMap({ name: o.name, location: o.locationId });
  store.update("maps", created.id, { layout: structuredClone(result.layout), generator: { id: def.id, seed: o.seed, inputs, attempts: result.attempts }, adventure: o.adventureId });
  const supplements = (game.manifest.supplements ?? []).map((s) => ({ id: s.id, version: s.version }));
  acceptMapProduce(store, created.id, def.produce(result.layout, inputs), {
    moduleId: game.manifest.id,
    moduleVersion: game.manifest.version,
    locationId: o.locationId,
    ...(supplements.length ? { supplements } : {}),
  });
  linkMapToScenes(store, created.id, o.adventureId, o.locationId);
  if (o.live) {
    const layout = store.get("maps", created.id)!.layout!;
    startLive(store, created.id, 1);
    const walk = walkOrder(layout);
    const rooms = walk.filter((id) => layout.zones.find((z) => z.id === id)?.kind === "room").slice(0, o.live.rooms);
    const shown = walk.slice(0, walk.indexOf(rooms[rooms.length - 1] ?? layout.start!) + 1);
    revealZones(store, created.id, shown);
    // the party found a trap in a room they have seen, and any secret door out of one
    const trap = layout.markers.find((m) => m.kind === "trap" && shown.includes(m.zone));
    if (trap) setZoneFlag(store, created.id, trap.zone, "trap", "found");
    const secret = layout.borders.find((b) => b.hidden && (shown.includes(b.a) || shown.includes(b.b)));
    if (secret) setBorderState(store, created.id, secret.id, { known: true });
  }
  return store.get("maps", created.id)!;
}
