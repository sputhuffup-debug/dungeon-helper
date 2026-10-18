/**
 * Table-side mutations: sessions (plan, start, wrap up), table mode (scenes,
 * rolls, reveals, running log) and the demo campaign loader. Everything is
 * game-agnostic: module semantics come from the module's dice operations,
 * tracker definitions and hooks.
 */
import {
  CampaignStore,
  RichTextRegistry,
  advanceWorldMinutes,
  appendTrackerLog,
  applyEffects,
  getCampaignTrackerState,
  getWorldMinutes,
  newId,
  updateCampaignTrackerState,
  applyImportedDocs,
  archiveTrackerState,
  autoTickChecklist,
  bodyOf,
  campaignDbName,
  getPath,
  getTrackerState,
  openPersistence,
  plainText,
  registerCampaign,
  reveal,
  updateTrackerState,
  type Entity,
  type Id,
  type Scene,
  type Session,
  type TimelineEvent,
  type TrackerState,
} from "@campaign-forge/core";
import {
  activeLifecyclesFor,
  advanceLifecycles,
  computeFields,
  createRng,
  lifecycleConfig,
  lifecycleState,
  startLifecycle,
  type DiceOperation,
  type DiceOperationResult,
  type Effect,
  type LifecycleConfig,
  type LifecycleInstance,
  type LoadedModule,
  type Prompt,
  type RollRecord,
  type RollResult,
  type TrackerDef,
} from "@campaign-forge/module-sdk";
import { appendPanic, clockState, clockUnits, type ClockUnit, type PromptAnswer } from "@campaign-forge/ui";
import * as Y from "yjs";
import type { CampaignContextValue } from "./CampaignProvider";

type Ctx = Pick<CampaignContextValue, "store" | "module">;
type DocCtx = Ctx & Pick<CampaignContextValue, "registry">;

/** Tracker-state keys the app owns (next to the module's tracker ids). */
export const TABLE_STATE = "table";
export const POSITIONS_STATE = "positions";
/** Tracker-log channels the app writes. */
export const DICE_LOG = "dice";
export const TABLE_LOG = "table";
export const REVEAL_LOG = "reveal";

/**
 * The core Session record has no planned-scene list; the app keeps one on
 * the record as an extra field (the store keeps unknown keys, export and
 * import carry them).
 */
export type PlannedSession = Session & { plannedScenes?: Id[] };

export interface TableState {
  sceneId?: Id;
  timer?: { running: boolean; since?: string; accumulatedMs: number };
}

export interface WrapUpAnswer {
  value: unknown;
  optionId?: string;
  label?: string;
  at: string;
}

export interface WrapUpRecord {
  answers?: Record<string, WrapUpAnswer>;
  looseEnds?: string[];
  timeline?: Id[];
  nextSession?: Id;
  /** Prompts raised by earlier answers (e.g. a roll after a failed check), kept so a reload still shows them. */
  followUps?: Prompt[];
}

// ---------------------------------------------------------------------------
// small helpers
// ---------------------------------------------------------------------------

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const str = (v: unknown): string | undefined => (typeof v === "string" && v.length > 0 ? v : undefined);
const nowIso = () => new Date().toISOString();

export function sessionLabel(s: Pick<Session, "number" | "title">): string {
  return s.title ? `Session ${s.number}: ${s.title}` : `Session ${s.number}`;
}

/** Sessions by number (then date). */
export function sortSessions<T extends Pick<Session, "number" | "date">>(sessions: readonly T[]): T[] {
  return [...sessions].sort((a, b) => a.number - b.number || a.date.localeCompare(b.date));
}

export function plannedScenesOf(session: Session | undefined): Id[] {
  const raw = (session as PlannedSession | undefined)?.plannedScenes;
  return Array.isArray(raw) ? raw.filter((x): x is Id => typeof x === "string") : [];
}

export function wrapUpOf(session: Session | undefined): WrapUpRecord {
  return isRecord(session?.wrapUp) ? (session.wrapUp as WrapUpRecord) : {};
}

/** Computed values of an entity, or `{}` when the type has none or a rule fails. */
export function computedOf(module: LoadedModule, entity: Pick<Entity, "type" | "fields">): Record<string, unknown> {
  const def = module.entityType(entity.type);
  if (!def) return {};
  try {
    return computeFields(def, entity.fields);
  } catch {
    return {};
  }
}

/** Player characters: character-kind entities flagged as PCs or owned by a member. */
export function playerCharacters(ctx: Ctx): Entity[] {
  return ctx.store
    .list("entities")
    .filter((e) => ctx.module.entityType(e.type)?.kind === "character" && (e.fields.isPC === true || !!e.ownerMemberId))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** Every scene in adventure order: adventures (active first), acts by order, scenes by order. */
export function scenesInAdventureOrder(store: CampaignStore): Scene[] {
  const rank = { active: 0, planned: 1, done: 2 } as const;
  const adventures = [...store.list("adventures")].sort((a, b) => rank[a.status] - rank[b.status] || a.created.localeCompare(b.created));
  const out: Scene[] = [];
  const seen = new Set<Id>();
  for (const a of adventures) {
    for (const actId of a.acts) {
      const act = store.get("acts", actId);
      if (!act) continue;
      for (const sid of act.scenes) {
        const scene = store.get("scenes", sid);
        if (scene && !seen.has(sid)) {
          seen.add(sid);
          out.push(scene);
        }
      }
    }
  }
  // scenes outside any act
  for (const s of store.list("scenes")) if (!seen.has(s.id)) out.push(s);
  return out;
}

/** The scene list table mode steps through: the session's planned scenes, else adventure order. */
export function sessionSceneOrder(store: CampaignStore, session: Session): Scene[] {
  const planned = plannedScenesOf(session)
    .map((id) => store.get("scenes", id))
    .filter((s): s is Scene => !!s);
  return planned.length ? planned : scenesInAdventureOrder(store);
}

/** Tracker state of a session: the live one, else the most recent archived one. */
export function sessionTrackerState(store: CampaignStore, sessionId: Id): TrackerState | undefined {
  const all = store.list("trackerState").filter((t) => t.session === sessionId);
  return all.find((t) => !t.archived) ?? [...all].sort((a, b) => b.updated.localeCompare(a.updated))[0];
}

export function tableStateOf(state: Record<string, unknown> | undefined): TableState {
  const raw = state?.[TABLE_STATE];
  return isRecord(raw) ? (raw as TableState) : {};
}

// ---------------------------------------------------------------------------
// session checklist auto-ticks
// ---------------------------------------------------------------------------

/**
 * Checklist items the app ticks itself when the related action happens.
 * Auto-ticks only ever set an item to done, and never one the GM unticked
 * (see `autoTickChecklist` in core); the GM can always untick.
 */
export const AUTO_TICK = {
  /** A scene is planned for the session. */
  scenes: "prep.scenes",
  /** The session log has text. */
  notes: "play.notes",
  /** Something is revealed in the session. */
  reveals: "play.reveals",
  /** The module's end-of-session prompts are all answered, or there are none. */
  rewards: "wrap.rewards",
  /** The session summary is saved. */
  summary: "wrap.summary",
  /** Loose ends are carried into the next session. */
  looseEnds: "wrap.loose-ends",
  /** Timeline entries are confirmed. */
  timeline: "wrap.timeline",
  /** The next session is planned. */
  schedule: "wrap.schedule",
} as const;

function tick(ctx: Ctx, sessionId: Id, ...items: string[]): void {
  if (items.length) autoTickChecklist(ctx.store, sessionId, items);
}

/** Tick "Note names and promises" when the session log has text. */
export async function tickLogNotes(ctx: DocCtx, sessionId: Id): Promise<void> {
  const text = await sessionLogText(ctx, sessionId);
  if (text.trim() && ctx.store.has("sessions", sessionId)) tick(ctx, sessionId, AUTO_TICK.notes);
}

/** Whether every end-of-session prompt (and follow-up) has an answer; true when there are none. */
export function sessionPromptsAnswered(ctx: Ctx, sessionId: Id, prompts: Prompt[] = sessionEndPrompts(ctx, sessionId)): boolean {
  const wrapUp = wrapUpOf(ctx.store.get("sessions", sessionId));
  const answers = wrapUp.answers ?? {};
  return [...prompts, ...(wrapUp.followUps ?? [])].every((p) => !!answers[p.id]);
}

// ---------------------------------------------------------------------------
// sessions
// ---------------------------------------------------------------------------

function addDays(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return new Date().toISOString().slice(0, 10);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** The latest session marked done, by number. */
export function lastDoneSession(store: CampaignStore): Session | undefined {
  return sortSessions(store.list("sessions").filter((s) => s.status === "done")).at(-1);
}

/**
 * Plan the next session. Its plan starts with the loose ends the previous
 * finished session carried forward (unless `nextPlan` is given).
 */
export function planNextSession(ctx: Ctx, input: { title?: string; date?: string; nextPlan?: string[] } = {}): Session {
  const store = ctx.store;
  const prev = lastDoneSession(store);
  const latest = sortSessions(store.list("sessions")).at(-1);
  const today = new Date().toISOString().slice(0, 10);
  const proposed = latest ? addDays(latest.date, 7) : today;
  const date = input.date ?? (proposed > today ? proposed : today);
  const number = (latest?.number ?? 0) + 1;
  const nextPlan = input.nextPlan ?? [...(wrapUpOf(prev).looseEnds ?? [])];
  return store.transact(() => {
    const s = store.createSession({ number, date, status: "planned", attendees: store.meta().members.map((m) => m.id), ...(input.title ? { title: input.title } : {}) });
    if (latest && latest.status !== "planned") tick(ctx, latest.id, AUTO_TICK.schedule);
    return store.update("sessions", s.id, { nextPlan });
  });
}

export function updateSession(ctx: Ctx, sessionId: Id, patch: Partial<PlannedSession>): Session {
  return ctx.store.update("sessions", sessionId, patch as Partial<Session>);
}

export function setPlannedScenes(ctx: Ctx, sessionId: Id, sceneIds: Id[]): Session {
  return ctx.store.transact(() => {
    const ids = [...new Set(sceneIds)];
    updateSession(ctx, sessionId, { plannedScenes: ids });
    if (ids.length > 0) tick(ctx, sessionId, AUTO_TICK.scenes);
    return ctx.store.get("sessions", sessionId)!;
  });
}

/** Mark a session running and open its table state on its first scene. */
export function startPlannedSession(ctx: Ctx, sessionId: Id): Session {
  const store = ctx.store;
  return store.transact(() => {
    const session = store.get("sessions", sessionId);
    if (!session) throw new Error(`sessions/${sessionId} not found`);
    const patch: Partial<Session> = { status: "running" };
    if (session.attendees.length === 0) patch.attendees = store.meta().members.map((m) => m.id);
    const updated = store.update("sessions", sessionId, patch);
    const order = sessionSceneOrder(store, updated);
    const first = order.find((s) => s.status === "planned") ?? order[0];
    const table: TableState = { timer: { running: true, since: nowIso(), accumulatedMs: 0 } };
    if (first) table.sceneId = first.id;
    const current = tableStateOf(getTrackerState(store, sessionId).state);
    updateTrackerState(store, sessionId, TABLE_STATE, { ...table, ...current });
    appendTrackerLog(store, sessionId, { tracker: TABLE_LOG, text: `${sessionLabel(updated)} started` });
    return updated;
  });
}

// ---------------------------------------------------------------------------
// table mode: scenes, timer, positions
// ---------------------------------------------------------------------------

export function setCurrentScene(ctx: Ctx, sessionId: Id, sceneId: Id | undefined): void {
  const store = ctx.store;
  store.transact(() => {
    const current = tableStateOf(getTrackerState(store, sessionId).state);
    updateTrackerState(store, sessionId, TABLE_STATE, { ...current, sceneId });
    const scene = sceneId ? store.get("scenes", sceneId) : undefined;
    if (scene) appendTrackerLog(store, sessionId, { tracker: TABLE_LOG, text: `Scene: ${scene.title}`, data: { scene: scene.id } });
  });
}

/** Mark a scene run or skipped; a run scene is added to the session's `scenesRun`. */
export function markScene(ctx: Ctx, sessionId: Id, sceneId: Id, status: Scene["status"]): void {
  const store = ctx.store;
  store.transact(() => {
    const scene = store.update("scenes", sceneId, { status });
    const session = store.get("sessions", sessionId);
    if (!session) return;
    const scenesRun = session.scenesRun.filter((id) => id !== sceneId);
    if (status === "run") scenesRun.push(sceneId);
    store.update("sessions", sessionId, { scenesRun });
    appendTrackerLog(store, sessionId, { tracker: TABLE_LOG, text: `Scene ${status === "planned" ? "reopened" : status}: ${scene.title}`, data: { scene: sceneId, status } });
  });
}

export function toggleSceneEvent(ctx: Ctx, sceneId: Id, eventId: Id, done: boolean): void {
  const scene = ctx.store.get("scenes", sceneId);
  if (!scene) return;
  ctx.store.update("scenes", sceneId, { events: scene.events.map((e) => (e.id === eventId ? { ...e, done } : e)) });
}

export function setTimer(ctx: Ctx, sessionId: Id, action: "start" | "pause" | "reset"): void {
  const store = ctx.store;
  store.transact(() => {
    const current = tableStateOf(getTrackerState(store, sessionId).state);
    const t = current.timer ?? { running: false, accumulatedMs: 0 };
    const elapsed = t.running && t.since ? Date.now() - Date.parse(t.since) : 0;
    let timer: NonNullable<TableState["timer"]>;
    if (action === "start") timer = t.running ? t : { running: true, since: nowIso(), accumulatedMs: t.accumulatedMs };
    else if (action === "pause") timer = { running: false, accumulatedMs: t.accumulatedMs + Math.max(0, elapsed) };
    else timer = { running: t.running, ...(t.running ? { since: nowIso() } : {}), accumulatedMs: 0 };
    updateTrackerState(store, sessionId, TABLE_STATE, { ...current, timer });
  });
}

export function timerElapsedMs(timer: TableState["timer"], at = Date.now()): number {
  if (!timer) return 0;
  const running = timer.running && timer.since ? Math.max(0, at - Date.parse(timer.since)) : 0;
  return timer.accumulatedMs + running;
}

/** Token zone positions on the scene map, keyed by entity id. */
export function setPosition(ctx: Ctx, sessionId: Id, entityId: Id, zoneId: Id | undefined): void {
  const store = ctx.store;
  store.transact(() => {
    const raw = getTrackerState(store, sessionId).state[POSITIONS_STATE];
    const positions: Record<string, string> = isRecord(raw) ? { ...(raw as Record<string, string>) } : {};
    if (zoneId) positions[entityId] = zoneId;
    else delete positions[entityId];
    updateTrackerState(store, sessionId, POSITIONS_STATE, positions);
  });
}

export function logTable(ctx: Ctx, sessionId: Id, text: string, data?: unknown): void {
  appendTrackerLog(ctx.store, sessionId, { tracker: TABLE_LOG, text, ...(data !== undefined ? { data } : {}) });
}

// ---------------------------------------------------------------------------
// dice
// ---------------------------------------------------------------------------

export interface DiceLogData {
  kind: "operation" | "pool" | "free";
  seed: string;
  operation?: string;
  input?: Record<string, unknown>;
  label?: string;
  total?: number;
  rolls?: RollRecord[];
  result?: RollResult;
  effects?: Effect[];
}

/** How many dice log entries the session has (the per-roll seed counter). */
export function diceCounter(store: CampaignStore, sessionId: Id): number {
  const ts = store.list("trackerState").find((t) => t.session === sessionId && !t.archived);
  return ts ? ts.log.filter((l) => l.tracker === DICE_LOG).length : 0;
}

/** The seed of the next roll: `sessionId:counter`, so every roll is reproducible from the log. */
export function nextRollSeed(store: CampaignStore, sessionId: Id): string {
  return `${sessionId}:${diceCounter(store, sessionId)}`;
}

/**
 * Build a dice operation's input from an entity: each property the
 * operation's input schema names is taken from `extra`, the entity id,
 * a computed value, a field, or a field one level down (e.g. an attribute).
 * Item-based operations (a tracker passing `itemIndex` + `path`) read the
 * item's rating, path and name.
 */
export function operationInput(module: LoadedModule, op: DiceOperation, entity: Entity | undefined, extra: Record<string, unknown> = {}): Record<string, unknown> {
  const props = isRecord(op.input.properties) ? (op.input.properties as Record<string, unknown>) : {};
  const input: Record<string, unknown> = {};
  const fields = entity?.fields ?? {};
  const computed = entity ? computedOf(module, entity) : {};

  if (typeof extra.itemIndex === "number" && typeof extra.path === "string") {
    const itemsPath = extra.path;
    const item = getPath(fields, `${itemsPath}.${extra.itemIndex}`);
    const tracker = module.module.trackers.find((t) => t.config?.operation === op.id && typeof t.config?.ratingPath === "string");
    const ratingKey = (tracker?.config?.ratingPath as string | undefined) ?? "supply";
    const rating = isRecord(item) ? item[ratingKey] : extra[ratingKey];
    if ("rating" in props) input.rating = typeof rating === "number" ? rating : extra[ratingKey];
    if ("path" in props) input.path = `${itemsPath}.${extra.itemIndex}.${ratingKey}`;
    if ("label" in props && isRecord(item) && typeof item.name === "string") input.label = item.name;
  }

  for (const key of Object.keys(props)) {
    if (key in input) continue;
    if (key in extra) {
      input[key] = extra[key];
      continue;
    }
    if (key === "entity") {
      if (entity) input.entity = entity.id;
      continue;
    }
    if (key === "conditions") {
      if (entity) input.conditions = (entity.conditions ?? []).map((c) => c.id);
      continue;
    }
    const v = lookupValue(fields, computed, key);
    if (v !== undefined) input[key] = v;
  }
  return input;
}

function lookupValue(fields: Record<string, unknown>, computed: Record<string, unknown>, key: string): unknown {
  if (key in computed) return computed[key];
  const direct = getPath(fields, key);
  if (direct !== undefined) return direct;
  for (const v of Object.values(fields)) {
    if (isRecord(v) && key in v && typeof v[key] !== "object") return v[key];
  }
  return undefined;
}

export interface OperationRoll {
  operation: DiceOperation;
  entity?: Entity;
  input: Record<string, unknown>;
  seed: string;
  result: DiceOperationResult;
  /** Prompts raised by the operation's effects. */
  prompts: Prompt[];
}

/**
 * Run a module dice operation for an entity with a seeded rng
 * (`sessionId:counter`), apply its effects, log it, and record panic-style
 * results on the module's stress tracker (`panicLog`, read by the
 * session-end hook).
 */
export function rollOperation(ctx: Ctx, sessionId: Id, operationId: string, entityId?: Id, extra: Record<string, unknown> = {}): OperationRoll {
  const store = ctx.store;
  const op = ctx.module.module.dice.operations?.[operationId];
  if (!op) throw new Error(`The module has no dice operation "${operationId}"`);
  const entity = entityId ? store.get("entities", entityId) : undefined;
  const input = operationInput(ctx.module, op, entity, extra);
  return store.transact(() => {
    const seed = nextRollSeed(store, sessionId);
    const result = op.run(input, createRng(seed), ctx.module.tables);
    const applied = applyEffects(store, result.effects ?? [], effectContext(ctx, sessionId));
    if (entity && typeof result.total === "number") recordPanic(ctx, sessionId, operationId, entity.id, result);
    const data: DiceLogData = { kind: "operation", seed, operation: operationId, input, label: result.label, rolls: result.rolls, ...(result.effects ? { effects: result.effects } : {}) };
    if (typeof result.total === "number") data.total = result.total;
    appendTrackerLog(store, sessionId, {
      tracker: DICE_LOG,
      text: `${entity ? `${entity.name}: ` : ""}${op.name}: ${result.label}`,
      ...(entity ? { entity: entity.id } : {}),
      data,
    });
    return { operation: op, ...(entity ? { entity } : {}), input, seed, result, prompts: applied.prompts };
  });
}

/** The stress-kind tracker whose panic operation this is gets the result in its `panicLog`. */
function recordPanic(ctx: Ctx, sessionId: Id, operationId: string, entityId: Id, result: DiceOperationResult): void {
  for (const def of ctx.module.module.trackers) {
    if (def.kind !== "stress") continue;
    const cfg = def.config ?? {};
    const ops = isRecord(cfg.operations) ? cfg.operations : {};
    const panicOp = str(cfg.panicOperation) ?? str(ops.panic) ?? "panicRoll";
    if (panicOp !== operationId) continue;
    if (typeof result.total !== "number") continue; // no roll was made (e.g. an exempt android)
    const state = getTrackerState(ctx.store, sessionId).state[def.id];
    updateTrackerState(ctx.store, sessionId, def.id, appendPanic(state, { entity: entityId, total: result.total, label: result.label }));
  }
}

/** Log a pool roll (skill roll, push, free roll) made with `seed`. */
export function recordPoolRoll(ctx: Ctx, sessionId: Id, input: { label: string; seed: string; result: RollResult; entityId?: Id; kind?: "pool" | "free" }): void {
  const data: DiceLogData = { kind: input.kind ?? "pool", seed: input.seed, label: input.label, result: input.result };
  appendTrackerLog(ctx.store, sessionId, {
    tracker: DICE_LOG,
    text: `${input.label}: ${ctx.module.module.dice.describe(input.result)}`,
    ...(input.entityId ? { entity: input.entityId } : {}),
    data,
  });
}

/** Effect context for the campaign's module: session log plus preset lookup (for spawn and stage changes). */
export function effectContext(ctx: Ctx, sessionId?: Id): { sessionId?: Id; preset: LoadedModule["preset"] } {
  return { ...(sessionId ? { sessionId } : {}), preset: (id) => ctx.module.preset(id) };
}

/** Apply effects for the session (tracker onEffects, prompt answers). */
export function applySessionEffects(ctx: Ctx, sessionId: Id, effects: Effect[]): Prompt[] {
  if (effects.length === 0) return [];
  return applyEffects(ctx.store, effects, effectContext(ctx, sessionId)).prompts;
}

// ---------------------------------------------------------------------------
// campaign-scoped trackers, in-world time and life cycles
// ---------------------------------------------------------------------------

/** Tracker-log channel for in-world time. */
export const WORLD_LOG = "world";

/** A tracker's live state: on the campaign for `campaign` scope, else on the session. */
export function trackerStateOf(ctx: Ctx, sessionId: Id | undefined, def: TrackerDef): unknown {
  if (def.scope === "campaign") return getCampaignTrackerState(ctx.store, def.id);
  return sessionId ? sessionTrackerState(ctx.store, sessionId)?.state[def.id] : undefined;
}

/** Write a tracker's state where its scope keeps it. */
export function setTrackerStateOf(ctx: Ctx, sessionId: Id | undefined, def: TrackerDef, next: unknown): void {
  if (def.scope === "campaign") updateCampaignTrackerState(ctx.store, def.id, next);
  else if (sessionId) updateTrackerState(ctx.store, sessionId, def.id, next);
}

/** In-world minutes the clock shows as elapsed (the same sum the clock tracker displays). */
export function clockElapsedMinutes(units: ClockUnit[], state: unknown): number {
  const counters = clockState(state, units).counters;
  return units.reduce((sum, u) => sum + (u.minutes ?? 0) * (counters[u.id] ?? 0), 0);
}

/**
 * World minutes to add when the clock goes from `counted` (the furthest elapsed time
 * already turned into world time) to `next`. Only time past that high-water mark counts,
 * so stepping the clock back and forward again never counts the same time twice.
 */
export function clockAdvanceMinutes(units: ClockUnit[], counted: number, next: unknown): number {
  return Math.max(0, clockElapsedMinutes(units, next) - counted);
}

/** Session tracker-state key holding a clock's high-water mark of counted elapsed minutes. */
const countedKey = (clockId: string) => `${clockId}:worldCounted`;

/**
 * Set the session clock (a `clock` tracker) and move in-world time forward by
 * what it advanced. Going back or resetting the clock does not rewind the
 * world. Returns the prompts the advance raised.
 */
export function setClockState(ctx: Ctx, sessionId: Id, def: TrackerDef, next: unknown): Prompt[] {
  return ctx.store.transact(() => {
    const units = clockUnits(def.config);
    const state = getTrackerState(ctx.store, sessionId).state;
    const stored = state[countedKey(def.id)];
    const counted = typeof stored === "number" ? stored : clockElapsedMinutes(units, state[def.id]);
    updateTrackerState(ctx.store, sessionId, def.id, next);
    const minutes = clockAdvanceMinutes(units, counted, next);
    if (minutes <= 0) return [];
    updateTrackerState(ctx.store, sessionId, countedKey(def.id), counted + minutes);
    return advanceWorldTime(ctx, sessionId, minutes).prompts;
  });
}

/** Campaign-scoped life-cycle trackers of the module. */
export function lifecycleTrackers(ctx: Ctx): TrackerDef[] {
  return ctx.module.module.trackers.filter((t) => t.kind === "lifecycle" && t.scope === "campaign");
}

export interface WorldAdvance {
  /** World minutes after the advance. */
  at: number;
  prompts: Prompt[];
}

function hasCondition(store: CampaignStore, entityId: string, condition: string): boolean {
  return !!store.get("entities", entityId)?.conditions?.some((c) => c.id === condition);
}

/**
 * Move in-world time forward and run every campaign life cycle over it: due
 * checks roll their dice operation for the host (seeded per session roll,
 * logged), finished stages move on, spawned creatures are created from their
 * presets and later stages swap the presets. Player characters are asked to
 * witness births.
 */
export function advanceWorldTime(ctx: Ctx, sessionId: Id | undefined, minutes: number): WorldAdvance {
  const store = ctx.store;
  return store.transact(() => {
    if (!(minutes > 0)) return { at: getWorldMinutes(store), prompts: [] };
    const at = advanceWorldMinutes(store, minutes);
    const prompts: Prompt[] = [];
    if (sessionId) appendTrackerLog(store, sessionId, { tracker: WORLD_LOG, text: `In-world time +${minutes} min`, data: { minutes, at } });
    const witnesses = playerCharacters(ctx).map((e) => ({ id: e.id, name: e.name }));
    for (const def of lifecycleTrackers(ctx)) {
      const raw = getCampaignTrackerState(store, def.id);
      const state = lifecycleState(raw);
      if (state.instances.every((i) => i.ended || i.paused)) continue;
      const result = advanceLifecycles(lifecycleConfig(def.config), state, minutes, {
        at,
        witnesses,
        newId: () => newId(),
        hasCondition: (entity, condition) => hasCondition(store, entity, condition),
        runCheck: (inst, check) => {
          if (!sessionId || !store.has("entities", inst.host)) return false;
          const roll = rollOperation(ctx, sessionId, check.operation, inst.host);
          prompts.push(...roll.prompts);
          return true;
        },
      });
      prompts.push(...applyEffects(store, result.effects, effectContext(ctx, sessionId)).prompts);
      updateCampaignTrackerState(store, def.id, { ...(isRecord(raw) ? raw : {}), instances: result.state.instances });
    }
    return { at, prompts };
  });
}

/** Where a life cycle can start from this entity: as its subject, or as the source creature. */
export interface LifecycleStartOption {
  def: TrackerDef;
  config: LifecycleConfig;
  role: "host" | "source";
  /** Variant preselected for a source (by its preset). */
  variant: string;
}

export function lifecycleStartOptions(ctx: Ctx, entity: Pick<Entity, "type" | "provenance"> & { fields?: Entity["fields"] }): LifecycleStartOption[] {
  const kind = ctx.module.entityType(entity.type)?.kind;
  const out: LifecycleStartOption[] = [];
  for (const def of lifecycleTrackers(ctx)) {
    const config = lifecycleConfig(def.config);
    if (!config.start) continue;
    const preset = entity.provenance?.preset;
    const bySource = preset ? config.variants.find((v) => v.sourcePresets?.includes(preset)) : undefined;
    if (bySource && kind && (config.start.sourceKinds ?? []).includes(kind)) out.push({ def, config, role: "source", variant: bySource.id });
    else if (kind && config.start.entityKinds.includes(kind) && !isExempt(config, entity)) out.push({ def, config, role: "host", variant: config.defaultVariant });
  }
  return out;
}

/** Whether the config's `start.exemptField` rules the entity out as a subject (e.g. an android). */
export function isExempt(config: LifecycleConfig, entity: { fields?: Entity["fields"] }): boolean {
  const field = config.start?.exemptField;
  return !!field && !!getPath(entity.fields ?? {}, field);
}

// Parsed configs and states, keyed by the (cached, immutable) objects they come from, so
// every card rendered for one store snapshot shares a single parse.
const parsedConfigs = new WeakMap<object, LifecycleConfig>();
const parsedStates = new WeakMap<object, ReturnType<typeof lifecycleState>>();

function cachedConfig(def: TrackerDef): LifecycleConfig {
  const key = def.config;
  if (!key) return lifecycleConfig(key);
  let c = parsedConfigs.get(key);
  if (!c) parsedConfigs.set(key, (c = lifecycleConfig(key)));
  return c;
}

function cachedState(raw: unknown): ReturnType<typeof lifecycleState> {
  if (!raw || typeof raw !== "object") return lifecycleState(raw);
  let s = parsedStates.get(raw);
  if (!s) parsedStates.set(raw, (s = lifecycleState(raw)));
  return s;
}

/** Running life-cycle instances that involve the entity (as host or spawn), per tracker. */
export function activeLifecycles(ctx: Ctx, entityId: Id): Array<{ def: TrackerDef; config: LifecycleConfig; instance: LifecycleInstance }> {
  return lifecycleTrackers(ctx).flatMap((def) => {
    const config = cachedConfig(def);
    return activeLifecyclesFor(cachedState(getCampaignTrackerState(ctx.store, def.id)), entityId).map((instance) => ({ def, config, instance }));
  });
}

/**
 * Start a life cycle on `host` at the current in-world
 * time. The seed comes from the tracker, host, world time and instance count,
 * so replaying the same steps gives the same rolled durations.
 */
export function startLifecycleFor(ctx: Ctx, sessionId: Id | undefined, trackerId: string, input: { host: Id; variant?: string; source?: Id }): { instance: LifecycleInstance; prompts: Prompt[] } {
  const store = ctx.store;
  const def = lifecycleTrackers(ctx).find((t) => t.id === trackerId);
  if (!def) throw new Error(`No campaign life-cycle tracker "${trackerId}"`);
  const host = store.get("entities", input.host);
  if (!host) throw new Error(`entities/${input.host} not found`);
  return store.transact(() => {
    const config = lifecycleConfig(def.config);
    const raw = getCampaignTrackerState(store, def.id);
    const state = lifecycleState(raw);
    const at = getWorldMinutes(store);
    const id = newId();
    const result = startLifecycle(
      config,
      state,
      { id, variant: input.variant ?? config.defaultVariant, host: host.id, hostName: host.name, seed: `${def.id}:${host.id}:${at}:${state.instances.length}`, ...(input.source ? { source: input.source } : {}) },
      { at, newId: () => newId(), witnesses: playerCharacters(ctx).map((e) => ({ id: e.id, name: e.name })) },
    );
    const prompts = applyEffects(store, result.effects, effectContext(ctx, sessionId)).prompts;
    updateCampaignTrackerState(store, def.id, { ...(isRecord(raw) ? raw : {}), instances: result.state.instances });
    return { instance: result.state.instances.find((i) => i.id === id)!, prompts };
  });
}

// ---------------------------------------------------------------------------
// reveals
// ---------------------------------------------------------------------------

function tagLastReveal(store: CampaignStore, sessionId: Id, sceneId: Id | undefined): void {
  if (!sceneId) return;
  const session = store.get("sessions", sessionId);
  if (!session || session.reveals.length === 0) return;
  const reveals = [...session.reveals];
  const last = reveals[reveals.length - 1]!;
  reveals[reveals.length - 1] = { ...last, scene: sceneId };
  store.update("sessions", sessionId, { reveals });
}

/** Reveal a handout to the players in this session, logged with its scene. */
export function revealHandout(ctx: Ctx, sessionId: Id, handoutId: Id, sceneId?: Id): void {
  const store = ctx.store;
  store.transact(() => {
    reveal(store, { kind: "handout", id: handoutId }, sessionId);
    tagLastReveal(store, sessionId, sceneId);
    tick(ctx, sessionId, AUTO_TICK.reveals);
    const h = store.get("handouts", handoutId);
    appendTrackerLog(store, sessionId, { tracker: REVEAL_LOG, text: `Revealed handout: ${h?.title ?? handoutId}`, data: { handout: handoutId, scene: sceneId } });
  });
}

/** Reveal an entity (a clue) to the players in this session, logged with its scene. */
export function revealEntityAtTable(ctx: Ctx, sessionId: Id, entityId: Id, sceneId?: Id): void {
  const store = ctx.store;
  store.transact(() => {
    reveal(store, { kind: "entity", id: entityId }, sessionId);
    tagLastReveal(store, sessionId, sceneId);
    tick(ctx, sessionId, AUTO_TICK.reveals);
    const e = store.get("entities", entityId);
    appendTrackerLog(store, sessionId, { tracker: REVEAL_LOG, text: `Revealed: ${e?.name ?? entityId}`, entity: entityId, data: { entity: entityId, scene: sceneId } });
  });
}

// ---------------------------------------------------------------------------
// running log
// ---------------------------------------------------------------------------

function clockTime(at: Date): string {
  return `${String(at.getHours()).padStart(2, "0")}:${String(at.getMinutes()).padStart(2, "0")}`;
}

/** Append `[HH:MM] text` as a new paragraph to the session's log doc. */
export async function appendLogLine(ctx: DocCtx, sessionId: Id, text: string, at: Date = new Date()): Promise<void> {
  const session = ctx.store.get("sessions", sessionId);
  if (!session) throw new Error(`sessions/${sessionId} not found`);
  await ctx.registry.whenReady(session.logDoc);
  const doc = ctx.registry.open(session.logDoc);
  const paragraph = new Y.XmlElement("paragraph");
  const run = new Y.XmlText();
  run.insert(0, `[${clockTime(at)}] ${text.trim()}`);
  paragraph.insert(0, [run]);
  doc.transact(() => bodyOf(doc).push([paragraph]));
  tick(ctx, sessionId, AUTO_TICK.notes);
}

/** Plain text of the session log. */
export async function sessionLogText(ctx: DocCtx, sessionId: Id): Promise<string> {
  const session = ctx.store.get("sessions", sessionId);
  if (!session) return "";
  await ctx.registry.whenReady(session.logDoc);
  return plainText(ctx.registry.open(session.logDoc));
}

/** A summary draft: the first non-empty lines of the log. */
export function summaryDraft(logText: string, lines = 6): string {
  return logText
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .slice(0, lines)
    .join("\n");
}

// ---------------------------------------------------------------------------
// wrap-up
// ---------------------------------------------------------------------------

/** The module's end-of-session prompts for the campaign's PCs and the session's tracker state. */
export function sessionEndPrompts(ctx: Ctx, sessionId: Id): Prompt[] {
  const hook = ctx.module.module.hooks?.onSessionEnd;
  if (!hook) return [];
  const characters = playerCharacters(ctx).map((e) => ({ id: e.id, name: e.name, fields: e.fields }));
  const trackerState = sessionTrackerState(ctx.store, sessionId)?.state ?? {};
  return hook({ mode: ctx.store.meta().mode, characters, trackerState });
}

export function recordWrapUpAnswer(ctx: Ctx, sessionId: Id, promptId: string, answer: Omit<WrapUpAnswer, "at">): void {
  const session = ctx.store.get("sessions", sessionId);
  if (!session) return;
  const wrapUp = wrapUpOf(session);
  ctx.store.update("sessions", sessionId, { wrapUp: { ...wrapUp, answers: { ...(wrapUp.answers ?? {}), [promptId]: { ...answer, at: nowIso() } } } });
}

export interface PromptOutcome {
  /** Follow-up prompts raised by the answer's effects (or a roll's effects). */
  prompts: Prompt[];
  roll?: OperationRoll;
}

/**
 * Answer a module prompt: apply the answer's effects, run the named dice
 * operation for a roll prompt without options, and remember the answer on
 * the session so it is applied once.
 */
export function answerPrompt(ctx: Ctx, sessionId: Id, prompt: Prompt, answer: PromptAnswer, opts: { record?: boolean } = {}): PromptOutcome {
  return ctx.store.transact(() => {
    const prompts = applySessionEffects(ctx, sessionId, answer.effects);
    let roll: OperationRoll | undefined;
    const op = answer.roll?.operation ?? (prompt.kind === "roll" && !answer.optionId ? prompt.roll?.operation : undefined);
    if (op && !answer.optionId) {
      roll = rollOperation(ctx, sessionId, op, prompt.entity);
      prompts.push(...roll.prompts);
    }
    const label = answer.optionId ? prompt.options?.find((o) => o.id === answer.optionId)?.label : roll ? roll.result.label : typeof answer.value === "boolean" ? (answer.value ? "Yes" : "No") : undefined;
    if (opts.record !== false) {
      recordWrapUpAnswer(ctx, sessionId, prompt.id, {
        value: answer.value ?? (roll ? roll.result.total ?? null : null),
        ...(answer.optionId ? { optionId: answer.optionId } : {}),
        ...(label ? { label } : {}),
      });
      if (prompts.length) {
        const wrapUp = wrapUpOf(ctx.store.get("sessions", sessionId));
        const known = new Set((wrapUp.followUps ?? []).map((p) => p.id));
        const followUps = [...(wrapUp.followUps ?? []), ...prompts.filter((p) => !known.has(p.id))];
        ctx.store.update("sessions", sessionId, { wrapUp: { ...wrapUp, followUps } as Record<string, unknown> });
      }
      if (sessionPromptsAnswered(ctx, sessionId)) tick(ctx, sessionId, AUTO_TICK.rewards);
    }
    return { prompts, ...(roll ? { roll } : {}) };
  });
}

export interface TimelineDraft {
  key: string;
  text: string;
  entities: Id[];
  include: boolean;
}

/** One timeline entry per scene run and per handout revealed in the session. */
export function suggestTimeline(store: CampaignStore, sessionId: Id): TimelineDraft[] {
  const session = store.get("sessions", sessionId);
  if (!session) return [];
  const out: TimelineDraft[] = [];
  for (const sceneId of session.scenesRun) {
    const scene = store.get("scenes", sceneId);
    if (!scene) continue;
    const location = scene.location ? store.get("entities", scene.location) : undefined;
    out.push({
      key: `scene:${scene.id}`,
      text: `${scene.title}${location ? ` at ${location.name}` : ""}.`,
      entities: [...(location ? [location.id] : []), ...scene.participants.filter((id) => store.has("entities", id))],
      include: true,
    });
  }
  const seen = new Set<Id>();
  for (const r of session.reveals) {
    if (!r.handout || seen.has(r.handout)) continue;
    seen.add(r.handout);
    const h = store.get("handouts", r.handout);
    if (!h) continue;
    out.push({ key: `handout:${h.id}`, text: `The crew learns: ${h.title}.`, entities: h.character && store.has("entities", h.character) ? [h.character] : [], include: true });
  }
  return out;
}

export interface FinishSessionInput {
  summary: string;
  rewards?: Session["rewards"];
  timeline?: Array<Pick<TimelineDraft, "text" | "entities" | "include">>;
  looseEnds?: string[];
}

export interface FinishSessionResult {
  session: Session;
  timeline: TimelineEvent[];
  next?: Session;
}

/**
 * Close a session: create the confirmed timeline entries on the campaign's
 * current in-world date, store summary, rewards and wrap-up, archive the
 * tracker state and carry loose ends into the next planned session.
 */
export function finishSession(ctx: Ctx, sessionId: Id, input: FinishSessionInput): FinishSessionResult {
  const store = ctx.store;
  return store.transact(() => {
    const session = store.get("sessions", sessionId);
    if (!session) throw new Error(`sessions/${sessionId} not found`);
    // read before the tracker state is archived: the prompts depend on it
    const promptsDone = sessionPromptsAnswered(ctx, sessionId);
    const date = store.meta().currentDate ?? "";
    const timeline = (input.timeline ?? [])
      .filter((t) => t.include && t.text.trim())
      .map((t) => store.createTimelineEvent({ inWorldDate: date, text: t.text.trim(), entities: t.entities, session: sessionId }));
    const looseEnds = (input.looseEnds ?? []).map((l) => l.trim()).filter(Boolean);
    const rewards = (input.rewards ?? []).filter((r) => r.characterId && (String(r.value ?? "").trim() || r.kind.trim()));

    // carry loose ends into the next planned session (or a new one)
    let next = sortSessions(store.list("sessions").filter((s) => s.status === "planned" && s.id !== sessionId))[0];
    if (next) {
      next = store.update("sessions", next.id, { nextPlan: [...next.nextPlan, ...looseEnds.filter((l) => !next!.nextPlan.includes(l))] });
    }

    const wrapUp: WrapUpRecord = { ...wrapUpOf(session), looseEnds, timeline: timeline.map((t) => t.id) };
    const updated = store.update("sessions", sessionId, {
      status: "done",
      summary: input.summary.trim(),
      rewards: [...session.rewards, ...rewards],
      wrapUp: wrapUp as Record<string, unknown>,
    });
    appendTrackerLog(store, sessionId, { tracker: TABLE_LOG, text: `${sessionLabel(updated)} ended` });
    archiveTrackerState(store, sessionId);
    if (!next) next = planNextSession(ctx, { nextPlan: looseEnds });
    store.update("sessions", sessionId, { wrapUp: { ...wrapUp, nextSession: next.id } as Record<string, unknown> });
    tick(
      ctx,
      sessionId,
      ...[
        promptsDone && AUTO_TICK.rewards,
        input.summary.trim() && AUTO_TICK.summary,
        looseEnds.length > 0 && AUTO_TICK.looseEnds,
        timeline.length > 0 && AUTO_TICK.timeline,
        AUTO_TICK.schedule,
      ].filter((x): x is string => typeof x === "string"),
    );
    return { session: store.get("sessions", sessionId)!, timeline, next };
  });
}

// ---------------------------------------------------------------------------
// demo campaign
// ---------------------------------------------------------------------------

/** Create the "Skyfire Down" demo campaign on this device (records, rich-text bodies, index entry). */
export async function loadDemoCampaign(seed = "skyfire-down"): Promise<Id> {
  const { demoCampaignJSON } = await import("@campaign-forge/seed-campaign");
  const { maps, docs } = demoCampaignJSON(seed);
  const store = CampaignStore.fromJSON(maps);
  const meta = store.meta();
  const registry = new RichTextRegistry();
  const persistence = openPersistence(store, { name: campaignDbName(meta.id), registry });
  try {
    await persistence.whenSynced;
    await applyImportedDocs(registry, new Map(Object.entries(docs)));
    await new Promise((r) => setTimeout(r, 60));
    await registerCampaign({ id: meta.id, name: meta.name, moduleId: meta.moduleId, updated: new Date().toISOString() });
  } finally {
    persistence.destroy();
    registry.closeAll();
    store.destroy();
  }
  return meta.id;
}

