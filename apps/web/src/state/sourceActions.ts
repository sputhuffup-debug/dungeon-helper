/**
 * Adventure sources in the app ("Run this job"): make the adventure a
 * module's source definition fills from a campaign record, link the two,
 * plan its first scenes into the next session; and at the wrap-up, the
 * records a session ran and closing them with an outcome. Thin wrappers over
 * core's adventureSource.ts: nothing here knows what game it is or what a
 * job is.
 */
import { adventureClosed, adventureOfSource, adventureSourceFor, adventureSourceInput, type Adventure, type Entity, type Id, type Session } from "@campaign-forge/core";
import { setPath, sourceOpen, sourceRunnable, type AdventureSourceDef, type AdventureSourceOutcome, type PlayModeId } from "@campaign-forge/module-sdk";
import type { CampaignContextValue } from "./CampaignProvider";
import { ensureEntitySite, mapGeneratorsFor } from "./mapgenActions";
import { instantiateWithKeys } from "./prepActions";
import { planNextSession, plannedScenesOf, setPlannedScenes, sortSessions, updateSession, wrapUpOf, type WrapUpRecord } from "./tableActions";

type Ctx = Pick<CampaignContextValue, "store" | "module">;
type DocCtx = Ctx & Pick<CampaignContextValue, "registry"> & Partial<Pick<CampaignContextValue, "whenDocSynced">>;

/** The source definition that runs this record in this mode, if the module has one. */
export function sourceDefFor(ctx: Ctx, entity: Pick<Entity, "type">, mode: PlayModeId): AdventureSourceDef | undefined {
  return adventureSourceFor(ctx.module.module, entity, mode);
}

/** What the record is called in the app's text ("job"). */
export function sourceNoun(ctx: Ctx, def: AdventureSourceDef): string {
  return def.noun ?? ctx.module.entityType(def.entityType)?.name.toLowerCase() ?? "record";
}

/** The adventure made from this record, if any. */
export function adventureForEntity(ctx: Ctx, entityId: Id): Adventure | undefined {
  return adventureOfSource(ctx.store.list("adventures"), entityId);
}

/** Whether "Run this …" applies: the record has an adventure already, or the module's `when` holds. */
export function canRunEntity(ctx: Ctx, entity: Entity, mode: PlayModeId): AdventureSourceDef | undefined {
  const def = sourceDefFor(ctx, entity, mode);
  if (!def) return undefined;
  return adventureForEntity(ctx, entity.id) || sourceRunnable(def, entity.fields) ? def : undefined;
}

/**
 * The session new scenes go into: the one running, else the next planned
 * (lowest number), else a new one planned now.
 */
export function targetSession(ctx: Ctx): { session: Session; created: boolean } {
  const sessions = sortSessions(ctx.store.list("sessions"));
  const running = sessions.find((s) => s.status === "running");
  if (running) return { session: running, created: false };
  const planned = sessions.find((s) => s.status === "planned");
  if (planned) return { session: planned, created: false };
  return { session: planNextSession(ctx), created: true };
}

export interface RunFromEntityResult {
  adventure: Adventure;
  /** False when the record already had its adventure (nothing was made). */
  created: boolean;
  session?: Session;
  sessionCreated?: boolean;
  planned: Id[];
}

/**
 * "Run this job": the record's adventure, made from the source's template
 * and filled by its prefill the first time; afterwards the same adventure
 * (idempotent). When a map generator reads a brief from the record and
 * names its site, the site is made first (GM only), so the scene set there
 * shows the site map as soon as one is generated.
 */
export async function runFromEntity(ctx: DocCtx, entityId: Id, mode: PlayModeId, opts: { title?: string } = {}): Promise<RunFromEntityResult> {
  const existing = adventureForEntity(ctx, entityId);
  if (existing) return { adventure: existing, created: false, planned: [] };
  const entity = ctx.store.get("entities", entityId);
  if (!entity) throw new Error(`entities/${entityId} not found`);
  const def = sourceDefFor(ctx, entity, mode);
  if (!def) throw new Error(`The ${ctx.module.manifest.name} module cannot run a ${ctx.module.entityType(entity.type)?.name ?? entity.type} as an adventure.`);
  const template = ctx.module.template(def.template);
  if (!template) throw new Error(`The module has no template "${def.template}".`);
  for (const g of mapGeneratorsFor(ctx.module, mode)) {
    const site = g.briefFromEntity?.({ id: entity.id, name: entity.name, type: entity.type, fields: entity.fields })?.site;
    if (site) {
      ensureEntitySite(ctx, entity.id, site);
      break;
    }
  }
  const fill = def.prefill(adventureSourceInput(ctx.store.toJSON(), ctx.module.module, entity.id, mode));
  const made = await instantiateWithKeys(ctx, template, { fill, source: { entity: entity.id, def: def.id }, ...(opts.title ? { title: opts.title } : {}) });
  const ids = (fill.plan ?? []).map((k) => made.scenes[k]).filter((x): x is Id => !!x);
  if (ids.length === 0) return { adventure: made.adventure, created: true, planned: [] };
  const target = targetSession(ctx);
  setPlannedScenes(ctx, target.session.id, [...plannedScenesOf(target.session), ...ids]);
  return { adventure: made.adventure, created: true, session: ctx.store.get("sessions", target.session.id) ?? target.session, sessionCreated: target.created, planned: ids };
}

// ---------------------------------------------------------------------------
// the wrap-up: close what the session ran
// ---------------------------------------------------------------------------

/** What the wrap-up keeps per record it closed: the outcome id. */
export type ClosedRecord = WrapUpRecord & { closed?: Record<Id, string> };

export interface SessionSource {
  entity: Entity;
  def: AdventureSourceDef;
  adventure?: Adventure;
  /** The outcome the GM picked in this session's wrap-up. */
  outcome?: string;
  /** The record still waits for an outcome. */
  open: boolean;
}

/**
 * The records a session ran: those whose adventure has a scene the session
 * planned or ran, then any other record its module still counts as open
 * (e.g. an accepted job not closed yet).
 */
export function sessionSources(ctx: Ctx, sessionId: Id, mode: PlayModeId): SessionSource[] {
  const session = ctx.store.get("sessions", sessionId);
  if (!session) return [];
  const closed = (wrapUpOf(session) as ClosedRecord).closed ?? {};
  const out: SessionSource[] = [];
  const seen = new Set<Id>();
  const push = (entity: Entity | undefined, def: AdventureSourceDef | undefined) => {
    if (!entity || !def || seen.has(entity.id)) return;
    seen.add(entity.id);
    const adventure = adventureForEntity(ctx, entity.id);
    out.push({ entity, def, ...(adventure ? { adventure } : {}), ...(closed[entity.id] ? { outcome: closed[entity.id] } : {}), open: sourceOpen(def, entity.fields) });
  };
  // closed in this wrap-up first, so a record stays listed after its outcome is picked
  for (const id of Object.keys(closed)) {
    const entity = ctx.store.get("entities", id);
    const adventure = entity ? adventureForEntity(ctx, id) : undefined;
    if (entity) push(entity, ctx.module.module.adventureSources?.find((d) => d.id === adventure?.source?.def) ?? sourceDefFor(ctx, entity, mode));
  }
  for (const sceneId of [...session.scenesRun, ...plannedScenesOf(session)]) {
    const act = ctx.store.get("acts", ctx.store.get("scenes", sceneId)?.act ?? "");
    const adventure = act ? ctx.store.get("adventures", act.adventure) : undefined;
    const entity = adventure?.source ? ctx.store.get("entities", adventure.source.entity) : undefined;
    if (entity) push(entity, ctx.module.module.adventureSources?.find((d) => d.id === adventure!.source!.def) ?? sourceDefFor(ctx, entity, mode));
  }
  for (const def of ctx.module.module.adventureSources ?? []) {
    if (def.mode?.length && !def.mode.includes(mode)) continue;
    for (const e of ctx.store.list("entities").filter((x) => x.type === def.entityType && sourceOpen(def, x.fields)).sort((a, b) => a.created.localeCompare(b.created))) push(e, def);
  }
  return out;
}

/** Close a record with an outcome: set its field, remember the outcome on the session. */
export function closeSource(ctx: Ctx, sessionId: Id, entityId: Id, outcome: AdventureSourceOutcome): void {
  ctx.store.transact(() => {
    const entity = ctx.store.get("entities", entityId);
    if (!entity) return;
    if (outcome.set) ctx.store.update("entities", entityId, { fields: setPath({ ...entity.fields }, outcome.set.path, outcome.set.value) });
    const session = ctx.store.get("sessions", sessionId);
    if (!session) return;
    const wrap = wrapUpOf(session) as ClosedRecord;
    updateSession(ctx, sessionId, { wrapUp: { ...wrap, closed: { ...(wrap.closed ?? {}), [entityId]: outcome.id } } as Session["wrapUp"] });
  });
}

/** Mark an adventure done (or planned again). */
export function setAdventureDone(ctx: Ctx, adventureId: Id, done: boolean): void {
  ctx.store.update("adventures", adventureId, { status: done ? "done" : "planned" });
}

/** Whether table mode skips this adventure's scenes: done, or its record closed. */
export function isAdventureClosed(ctx: Ctx, adventure: Pick<Adventure, "status" | "source">): boolean {
  return adventureClosed({ entities: Object.fromEntries(ctx.store.list("entities").map((e) => [e.id, e])) }, ctx.module.module, adventure);
}
