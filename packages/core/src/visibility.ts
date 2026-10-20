/**
 * Visibility: pure projection rules. These are the functions a future sync
 * service would run to derive a player's view; v1 uses them for the
 * "preview as player" toggle and export filtering.
 */
import type { EntityTypeDef, GameModule, VisibilityLevel } from "@campaign-forge/module-sdk";
import { now } from "./ids";
import { clone, deletePath, getPath } from "./paths";
import type { CampaignStore } from "./store";
import { playerLayout, playerLive } from "./sitemap";
import type { CampaignMaps, Entity, Id, SiteMap, Visibility } from "./types";

export interface Viewer {
  role: "gm" | "player";
  /** Member id, for `some_players`. */
  memberId?: string;
}

export const GM_VIEWER: Viewer = { role: "gm" };

/** Modules are consulted for entity type definitions (and map legends, when given). */
export type ModuleTypes = Pick<GameModule, "entityTypes"> & Partial<Pick<GameModule, "mapGenerators">>;

export function canSee(vis: Visibility | undefined, viewer: Viewer): boolean {
  if (viewer.role === "gm") return true;
  if (!vis) return false;
  switch (vis.level) {
    case "players":
    case "revealed":
      return true;
    case "some_players":
      return viewer.memberId !== undefined && (vis.players ?? []).includes(viewer.memberId);
    case "gm":
    default:
      return false;
  }
}

export function findEntityType(module: ModuleTypes | undefined, typeId: string): EntityTypeDef | undefined {
  return module?.entityTypes.find((t) => t.id === typeId);
}

/** Effective visibility of one field path on an entity. */
export function fieldVisibilityOf(entity: Entity, def: EntityTypeDef | undefined, path: string): Visibility {
  const override = entity.fieldVisibility?.[path];
  if (override) return override;
  // the closest ancestor path with an override also applies
  const segs = path.split(".");
  for (let i = segs.length - 1; i > 0; i--) {
    const parent = segs.slice(0, i).join(".");
    const o = entity.fieldVisibility?.[parent];
    if (o) return o;
  }
  const def_: VisibilityLevel | undefined = def?.defaultVisibility?.[path];
  if (def_) return { level: def_ };
  for (let i = segs.length - 1; i > 0; i--) {
    const parent = segs.slice(0, i).join(".");
    const d = def?.defaultVisibility?.[parent];
    if (d) return { level: d };
  }
  return entity.visibility;
}

/**
 * A copy of `entity` with every field the viewer may not see removed, or
 * `undefined` when the viewer may not see the entity at all. GM-only
 * bookkeeping (`fieldVisibility`, `provenance`, `sheetState`) is stripped
 * for players.
 */
export function projectEntityForViewer(entity: Entity, def: EntityTypeDef | undefined, viewer: Viewer): Entity | undefined {
  if (viewer.role === "gm") return clone(entity);
  if (!canSee(entity.visibility, viewer)) return undefined;
  const copy = clone(entity);
  const paths = new Set<string>([
    ...Object.keys(entity.fieldVisibility ?? {}),
    ...Object.keys(def?.defaultVisibility ?? {}),
  ]);
  // longest paths first so a hidden parent removes everything underneath
  const sorted = [...paths].sort((a, b) => b.length - a.length);
  for (const path of sorted) {
    if (getPath(copy.fields, path) === undefined) continue;
    if (!canSee(fieldVisibilityOf(entity, def, path), viewer)) deletePath(copy.fields, path);
  }
  delete copy.fieldVisibility;
  delete copy.provenance;
  delete copy.sheetState;
  return copy;
}

/**
 * The player projection of a whole campaign: only `players`, `revealed` and
 * the viewer's own `some_players` content. GM structures (adventures, acts,
 * scenes, sessions, notes, generator runs, tracker state) are empty for players.
 */
export function projectCampaignForViewer(maps: CampaignMaps, module: ModuleTypes | undefined, viewer: Viewer): CampaignMaps {
  if (viewer.role === "gm") return clone(maps);
  const entities: Record<Id, Entity> = {};
  for (const e of Object.values(maps.entities)) {
    const p = projectEntityForViewer(e, findEntityType(module, e.type), viewer);
    if (p) entities[p.id] = p;
  }
  const pick = <T extends { id: Id; visibility: Visibility }>(records: Record<Id, T>, extra?: (r: T) => boolean): Record<Id, T> => {
    const out: Record<Id, T> = {};
    for (const r of Object.values(records)) {
      if (canSee(r.visibility, viewer) && (!extra || extra(r))) out[r.id] = clone(r);
    }
    return out;
  };
  const relationships = pick(maps.relationships, (r) => r.from in entities && r.to in entities);
  const timeline = pick(maps.timeline);
  for (const t of Object.values(timeline)) t.entities = t.entities.filter((id) => id in entities);
  const handouts = pick(maps.handouts);
  const siteMaps = pick(maps.maps);
  for (const m of Object.values(siteMaps)) projectSiteMapInPlace(m, module);
  const assets = pick(maps.assets);
  const members = maps.meta.members.filter((m) => m.role === "gm" || m.id === viewer.memberId);
  return {
    meta: { ...clone(maps.meta), members, settings: {} },
    entities,
    relationships,
    adventures: {},
    acts: {},
    scenes: {},
    sessions: {},
    timeline,
    handouts,
    notes: {},
    maps: siteMaps,
    generatorRuns: {},
    trackerState: {},
    assets,
    ledger: pick(maps.ledger ?? {}),
    travel: pick(maps.travel ?? {}),
  };
}

/**
 * Strip GM data from a site map a player may see: hidden access points, the
 * generator brief, and a generated layout replaced by its player projection
 * (fog from the live state) with live state limited to what players see.
 */
function projectSiteMapInPlace(m: SiteMap, module: ModuleTypes | undefined): void {
  m.accessPoints = m.accessPoints.filter((a) => !a.hidden);
  const generatorId = m.generator?.id;
  delete m.generator;
  if (!m.layout) {
    delete m.live;
    return;
  }
  const legend = module?.mapGenerators?.find((g) => g.id === generatorId)?.legend;
  const act = m.live?.act ?? 1;
  const projected = playerLayout(m.layout, { act, revealed: m.live?.revealed, legend, live: m.live });
  m.layout = projected;
  if (!m.live) return;
  const live = playerLive(m.live, projected, legend);
  const zoneIds = new Set(projected.zones.map((z) => z.id));
  m.live = {
    act,
    revealed: m.live.revealed.filter((z) => zoneIds.has(z)),
    borders: {},
    zoneFlags: live.zoneFlags,
    tokens: live.tokens.map((t) => ({ ...t, gmOnly: false })),
    pings: [],
  };
}

export interface RevealTarget {
  kind: "entity" | "handout" | "timeline";
  id: Id;
  /** For entities: reveal one field path instead of the whole record. */
  field?: string;
}

/**
 * Flip a record (or one entity field) to `revealed`, remembering the session,
 * and append the reveal to the session's log.
 */
export function reveal(store: CampaignStore, target: RevealTarget, sessionId: Id): void {
  const at = now();
  store.transact(() => {
    const revealed: Visibility = { level: "revealed", revealedIn: sessionId };
    switch (target.kind) {
      case "entity": {
        const entity = store.get("entities", target.id);
        if (!entity) throw new Error(`entities/${target.id} not found`);
        if (target.field) {
          const fieldVisibility = { ...(entity.fieldVisibility ?? {}), [target.field]: revealed };
          store.update("entities", entity.id, { fieldVisibility });
        } else {
          store.update("entities", entity.id, { visibility: { ...revealed, ...(entity.visibility.players ? { players: entity.visibility.players } : {}) } });
        }
        break;
      }
      case "handout": {
        const handout = store.get("handouts", target.id);
        if (!handout) throw new Error(`handouts/${target.id} not found`);
        store.update("handouts", handout.id, { visibility: revealed, revealedIn: sessionId });
        break;
      }
      case "timeline": {
        const event = store.get("timeline", target.id);
        if (!event) throw new Error(`timeline/${target.id} not found`);
        store.update("timeline", event.id, { visibility: revealed });
        break;
      }
    }
    const session = store.get("sessions", sessionId);
    if (session) {
      const entry: { at: string; handout?: Id; entity?: Id; field?: string } = { at };
      if (target.kind === "entity") entry.entity = target.id;
      if (target.kind === "handout") entry.handout = target.id;
      if (target.field) entry.field = target.field;
      store.update("sessions", session.id, { reveals: [...session.reveals, entry] });
    }
  });
}
