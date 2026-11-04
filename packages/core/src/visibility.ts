/**
 * Visibility: pure projection rules. These are the functions a future sync
 * service would run to derive a player's view; v1 uses them for the
 * "preview as player" toggle, shares, player packets and export filtering.
 *
 * A player sees `players` and `revealed` records, `some_players` records
 * that name them, and, for the characters they play (`Viewer.characters`),
 * the fields the module marks owner-visible (`"x-visibility": "owner"`) and
 * the handouts given to the character's player (`Handout.toOwner`, or a
 * module `ownerHandouts` kind with `when: "always"`).
 */
import { evaluateLogic, ownerVisiblePaths, type ConditionalVisibilityDef, type EntityTypeDef, type GameModule, type VisibilityLevel } from "@campaign-forge/module-sdk";
import { now } from "./ids";
import { clone, deletePath, getPath, setPath } from "./paths";
import type { CampaignStore } from "./store";
import { playerLayout, playerLive } from "./sitemap";
import type { CampaignMaps, Entity, Handout, Id, SiteMap, Visibility } from "./types";

export interface Viewer {
  role: "gm" | "player";
  /** Member id, for `some_players`. */
  memberId?: string;
  /** Entity ids of the characters this player plays (see `memberViewer`); entities naming the member as `ownerMemberId` count too. */
  characters?: Id[];
}

export const GM_VIEWER: Viewer = { role: "gm" };

/** Modules are consulted for entity type definitions (and map legends and owner handout kinds, when given). */
export type ModuleTypes = Pick<GameModule, "entityTypes"> & Partial<Pick<GameModule, "mapGenerators" | "ownerHandouts" | "templates">>;

/** Does this player play the character? */
export function viewerOwns(viewer: Viewer, entity: Pick<Entity, "id" | "ownerMemberId"> | undefined): boolean {
  if (viewer.role !== "player" || !viewer.memberId || !entity) return false;
  return !!viewer.characters?.includes(entity.id) || (!!entity.ownerMemberId && entity.ownerMemberId === viewer.memberId);
}

/** The GM set a visibility on this field path or one of its parents. */
function hasOverride(entity: Entity, path: string): boolean {
  const fv = entity.fieldVisibility;
  if (!fv) return false;
  const segs = path.split(".");
  for (let i = segs.length; i > 0; i--) if (fv[segs.slice(0, i).join(".")]) return true;
  return false;
}

/**
 * May the viewer see this field of the entity? Its effective visibility, or,
 * for the player who plays it, an owner-visible mark on the path or a parent
 * (unless the GM set the field's visibility on this entity by hand).
 */
export function canSeeField(entity: Entity, def: EntityTypeDef | undefined, path: string, viewer: Viewer): boolean {
  if (canSee(fieldVisibilityOf(entity, def, path), viewer)) return true;
  if (!def || !viewerOwns(viewer, entity) || hasOverride(entity, path)) return false;
  return ownerVisiblePaths(def, entity.subtype).some((p) => path === p || path.startsWith(`${p}.`));
}

/** Field paths with a visibility of their own: the GM's overrides, the type's defaults and, for the owner, the owner-visible marks. */
function explicitPaths(entity: Entity, def: EntityTypeDef | undefined, viewer: Viewer): string[] {
  const out = [...Object.keys(entity.fieldVisibility ?? {}), ...Object.keys(def?.defaultVisibility ?? {})];
  for (const rule of activeVisibilityRules(entity, def)) out.push(...Object.keys(rule.fields));
  if (def && viewerOwns(viewer, entity)) out.push(...ownerVisiblePaths(def, entity.subtype));
  return out;
}

/** A path below this one is visible (so a hidden parent keeps those children: a nested field shared with this player, or marked for the owner). */
function visibleBelow(entity: Entity, def: EntityTypeDef | undefined, path: string, viewer: Viewer, candidates: string[]): boolean {
  return candidates.some((p) => p.startsWith(`${path}.`) && canSeeField(entity, def, p, viewer));
}

/**
 * The note to show when the module keeps this handout with the GM (its kind's
 * `gmOnlyPurposes` name the handout's `purpose`): it is never given to the
 * character's player. Undefined for any other handout.
 */
export function handoutStaysWithGm(handout: Pick<Handout, "kind" | "purpose">, module: ModuleTypes | undefined): string | undefined {
  if (!handout.purpose) return undefined;
  const rule = module?.ownerHandouts?.find((r) => r.kind === handout.kind && r.gmOnlyPurposes?.includes(handout.purpose!));
  return rule ? (rule.gmOnlyNote ?? "This handout stays with the GM.") : undefined;
}

/**
 * May the viewer see this handout? Its visibility, or it was given to the
 * player of its character. A handout the module keeps with the GM is never
 * seen by a player, even if it was revealed or marked for players by mistake.
 */
export function canSeeHandout(handout: Pick<Handout, "visibility" | "character" | "toOwner" | "kind" | "purpose">, viewer: Viewer, maps: Pick<CampaignMaps, "entities">, module: ModuleTypes | undefined): boolean {
  if (viewer.role === "gm") return true;
  if (handoutStaysWithGm(handout, module) !== undefined) return false;
  if (canSee(handout.visibility, viewer)) return true;
  if (!handout.character || !viewerOwns(viewer, maps.entities[handout.character] ?? { id: handout.character })) return false;
  return handout.toOwner === true || !!module?.ownerHandouts?.some((r) => r.kind === handout.kind && r.when === "always");
}

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

/**
 * The type's field-dependent visibility rules (`conditionalVisibility`) that
 * hold for this entity now. A rule whose condition cannot be evaluated counts
 * as holding: a rule only ever exists to keep something from a viewer.
 */
export function activeVisibilityRules(entity: Pick<Entity, "fields">, def: EntityTypeDef | undefined): ConditionalVisibilityDef[] {
  return (def?.conditionalVisibility ?? []).filter((r) => {
    try {
      const v = evaluateLogic(r.when, { fields: entity.fields });
      return Array.isArray(v) ? v.length > 0 : !!v;
    } catch {
      return true;
    }
  });
}

/** The rule (of the holding ones) that sets this field path's default, on the path itself or a parent. */
export function visibilityRuleFor(entity: Pick<Entity, "fields">, def: EntityTypeDef | undefined, path: string): { rule: ConditionalVisibilityDef; level: VisibilityLevel } | undefined {
  const rules = activeVisibilityRules(entity, def);
  if (rules.length === 0) return undefined;
  const segs = path.split(".");
  for (let i = segs.length; i > 0; i--) {
    const p = segs.slice(0, i).join(".");
    for (const rule of rules) {
      const level = rule.fields[p];
      if (level) return { rule, level };
    }
  }
  return undefined;
}

/**
 * Effective visibility of one field path on an entity: the GM's setting on
 * the path or a parent, else a holding `conditionalVisibility` rule's, else
 * the type's default, else the entity's own visibility.
 */
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
  const ruled = visibilityRuleFor(entity, def, path);
  if (ruled) return { level: ruled.level };
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
 *
 * The player who plays the entity always sees it, with its owner-visible
 * fields (`"x-visibility": "owner"` in the schema) on top of what every
 * player sees; when the entity itself is GM-only they get its name, its
 * conditions and those fields only.
 */
export function projectEntityForViewer(entity: Entity, def: EntityTypeDef | undefined, viewer: Viewer): Entity | undefined {
  if (viewer.role === "gm") return clone(entity);
  const owned = viewerOwns(viewer, entity);
  const visible = canSee(entity.visibility, viewer);
  if (!visible && !owned) return undefined;
  const copy = clone(entity);
  const candidates = explicitPaths(entity, def, viewer);
  const paths = new Set<string>(candidates);
  // a GM-only entity its player plays: every field inherits GM-only, so each is checked
  if (!visible) {
    for (const k of Object.keys(copy.fields)) paths.add(k);
    delete copy.summary;
    copy.tags = [];
  }
  /** Remove what the viewer may not see at `path`, keeping the visible children of a hidden parent. */
  const prune = (path: string, depth: number): void => {
    const value = getPath(copy.fields, path);
    if (value === undefined || canSeeField(entity, def, path, viewer)) return;
    if (depth < 12 && value && typeof value === "object" && !Array.isArray(value) && visibleBelow(entity, def, path, viewer, candidates)) {
      for (const k of Object.keys(value as Record<string, unknown>)) prune(`${path}.${k}`, depth + 1);
      return;
    }
    deletePath(copy.fields, path);
  };
  // longest paths first so a hidden parent removes everything underneath
  const sorted = [...paths].sort((a, b) => b.length - a.length || a.localeCompare(b));
  for (const path of sorted) prune(path, 0);
  // a hidden field with a stand-in shows the stand-in's value in its place (a cover story), never a gap that gives it away
  for (const rule of activeVisibilityRules(entity, def)) {
    for (const [target, from] of Object.entries(rule.standIns ?? {})) {
      const value = getPath(entity.fields, from);
      if (value !== undefined && !canSeeField(entity, def, target, viewer)) setPath(copy.fields, target, clone(value));
    }
  }
  delete copy.fieldVisibility;
  delete copy.provenance;
  delete copy.sheetState;
  if (copy.contact) {
    const contact = playerContact(entity.contact!);
    if (contact) copy.contact = contact;
    else delete copy.contact;
  }
  return copy;
}

/**
 * What the players see of a crew contact: since when, where to find them and
 * the favours each way. The stance, grudges, what they know, the place
 * entity, the betrayal and the GM's note are left out (built by copying the
 * allowed fields, never by deleting the rest).
 */
export function playerContact(contact: NonNullable<Entity["contact"]>): Entity["contact"] {
  const out = { since: contact.since, favours: { owedToCrew: contact.favours?.owedToCrew ?? 0, owedByCrew: contact.favours?.owedByCrew ?? 0 } } as NonNullable<Entity["contact"]>;
  if (contact.foundAt) out.foundAt = contact.foundAt;
  return out;
}

/**
 * The player projection of a whole campaign: only `players`, `revealed` and
 * the viewer's own `some_players` content, plus what the viewer's own
 * characters show their player (owner-visible fields, handouts given to
 * them). GM structures (adventures, acts, scenes, sessions, notes, generator
 * runs and drafts, tracker state, arc threads) are empty for players, and so are campaign settings
 * and other players' member records. A handout's own image goes with it; an
 * entity's portrait only when that image is visible.
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
  const handouts: Record<Id, Handout> = {};
  for (const h of Object.values(maps.handouts)) {
    if (!canSeeHandout(h, viewer, maps, module)) continue;
    const copy = clone(h);
    // template guidance is the GM's placeholder text, never the players'
    delete copy.guide;
    handouts[h.id] = copy;
  }
  const siteMaps = pick(maps.maps);
  for (const m of Object.values(siteMaps)) projectSiteMapInPlace(m, module);
  const assets = pick(maps.assets);
  for (const h of Object.values(handouts)) {
    const a = h.asset ? maps.assets[h.asset] : undefined;
    if (a) assets[a.id] = clone(a);
  }
  for (const e of Object.values(entities)) if (e.image && !(e.image in assets)) delete e.image;
  const members = maps.meta.members
    .filter((m) => m.role === "gm" || m.id === viewer.memberId)
    .map((m) => {
      const out = { ...m };
      delete out.contact;
      return out;
    });
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
    generatorDrafts: {},
    trackerState: {},
    assets,
    ledger: pick(maps.ledger ?? {}),
    travel: pick(maps.travel ?? {}),
    advancement: pick(maps.advancement ?? {}, (r) => r.character in entities),
    arcs: {},
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
