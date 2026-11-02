/**
 * Campaign arcs: the generic engine behind a module's `ArcsDef`.
 *
 * - Threads (`arcs` map, always GM-only): a sponsor's scheme with stages from
 *   the first hints to the endgame, clues in each stage and a clock. A module
 *   generator drafts them (`Offer.arc`); accepting creates the record here.
 * - Clues move unseen -> seeded (placed in a job's material by a board, or by
 *   hand) -> found (the crew learnt it, in a session or a job).
 * - Clocks tick between jobs: a seeded roll per thread (`ArcsDef.tick`, more
 *   for a thread the crew ignored) or the GM's hand; reaching a milestone
 *   suggests its payoffs, which boards then deal.
 * - Faction heat lives on the faction (`ArcsDef.heat.path`), contacts on the
 *   NPC (`Entity.contact`).
 * - `arcsSnapshot` is what a board reads (an `x-arcs` input); `crewNotes` is
 *   the only view of all this the players get.
 *
 * Crew notes are built by copying allowed fields from the player projection
 * (`projectCampaignForViewer`) and from the found clues: a thread's
 * player-facing title once the viewer may see one of its found clues, those
 * clues' player text, met contacts with where to find them and their
 * favours, and the places and factions the viewer may see. The GM's title,
 * sponsor (until revealed), goal, method, weakness, cost, clock, heat and
 * every unseen or seeded clue never go in. Nothing here names a game.
 */
import {
  clampHeat,
  clueKindLabel,
  heatLabel,
  rollArcTick,
  type ArcDraft,
  type ArcSnapshot,
  type ArcsDef,
  type ArcTickRoll,
  type ContactStance,
  type GameModule,
  type OfferArcLink,
  type PlayModeId,
} from "@campaign-forge/module-sdk";
import { newId, now } from "./ids";
import { clone, getPath, setPath } from "./paths";
import type { CampaignStore } from "./store";
import type { ArcClue, ArcClueFound, ArcClueSeeding, ArcLinks, ArcMilestone, ArcStage, ArcThread, CampaignMaps, Entity, EntityContact, Id } from "./types";
import { canSee, findEntityType, projectCampaignForViewer, type ModuleTypes, type Viewer } from "./visibility";

/** A module as the arcs engine reads it. */
export type ArcsModule = ModuleTypes & Partial<Pick<GameModule, "arcs">>;

/** The module's arcs, when they apply in this play mode. */
export function arcsDefFor(module: Partial<Pick<GameModule, "arcs">> | undefined, mode?: PlayModeId): ArcsDef | undefined {
  const def = module?.arcs;
  if (!def) return undefined;
  if (mode !== undefined && def.mode && def.mode.length > 0 && !def.mode.includes(mode)) return undefined;
  return def;
}

const GM_ONLY = { level: "gm" } as const;
const uniq = <T>(xs: T[]): T[] => [...new Set(xs)];

function thread(store: CampaignStore, id: Id): ArcThread {
  const t = store.get("arcs", id);
  if (!t) throw new Error(`arcs/${id} not found`);
  return t;
}

/** Threads in board order. */
export function threadsInOrder(threads: Iterable<ArcThread>): ArcThread[] {
  return [...threads].sort((a, b) => a.order - b.order || a.created.localeCompare(b.created) || a.id.localeCompare(b.id));
}

/** Every clue of a thread with its stage. */
export function cluesOf(t: Pick<ArcThread, "stages">): Array<{ clue: ArcClue; stage: ArcStage; stageIndex: number }> {
  return t.stages.flatMap((stage, stageIndex) => stage.clues.map((clue) => ({ clue, stage, stageIndex })));
}

export function findClue(t: Pick<ArcThread, "stages">, clueId: Id): { clue: ArcClue; stage: ArcStage; stageIndex: number } | undefined {
  return cluesOf(t).find((x) => x.clue.id === clueId);
}

/** The stage the crew is in: the first with a clue not yet found (the last when every clue is found). */
export function currentStageIndex(t: Pick<ArcThread, "stages">): number {
  const i = t.stages.findIndex((s) => s.clues.some((c) => c.state !== "found"));
  return i === -1 ? Math.max(0, t.stages.length - 1) : i;
}

export function threadCounts(t: Pick<ArcThread, "stages">): { total: number; unseen: number; seeded: number; found: number } {
  const all = cluesOf(t).map((x) => x.clue.state);
  return { total: all.length, unseen: all.filter((s) => s === "unseen").length, seeded: all.filter((s) => s === "seeded").length, found: all.filter((s) => s === "found").length };
}

function editClue(store: CampaignStore, threadId: Id, clueId: Id, fn: (c: ArcClue) => ArcClue): ArcThread {
  const t = thread(store, threadId);
  let hit = false;
  const stages = t.stages.map((s) => ({
    ...s,
    clues: s.clues.map((c) => {
      if (c.id !== clueId) return c;
      hit = true;
      return fn(clone(c));
    }),
  }));
  if (!hit) throw new Error(`clue ${clueId} not found in arcs/${threadId}`);
  return store.update("arcs", threadId, { stages });
}

const addLink = (links: ArcLinks | undefined, key: keyof ArcLinks, id: Id | undefined): ArcLinks | undefined => {
  if (!id) return links;
  const out: ArcLinks = { ...(links ?? {}) };
  out[key] = uniq([...(out[key] ?? []), id]);
  return out;
};

// ---------------------------------------------------------------------------
// threads
// ---------------------------------------------------------------------------

export interface CreateThreadOptions {
  /** Offer tempId -> entity id, for a sponsor the offer created. */
  idMap?: Record<string, Id>;
  source?: ArcThread["source"];
}

/** Create a thread from a module's draft (an accepted `Offer.arc`). GM-only, active, at the end of the board. */
export function createThread(store: CampaignStore, draft: ArcDraft, opts: CreateThreadOptions = {}): ArcThread {
  const order = Math.max(-1, ...store.list("arcs").map((t) => t.order)) + 1;
  const stages: ArcStage[] = draft.stages.map((s) => ({
    id: newId(),
    title: s.title,
    ...(s.summary ? { summary: s.summary } : {}),
    clues: s.clues.map((c) => ({ id: newId(), kind: c.kind, text: c.text, playerText: c.playerText, ...(c.unlocks ? { unlocks: c.unlocks } : {}), state: "unseen" as const })),
  }));
  const segments = Math.max(1, Math.floor(draft.clock.segments));
  const milestones: ArcMilestone[] = draft.clock.milestones
    .map((m) => {
      const stage = m.stage !== undefined ? stages[m.stage]?.id : undefined;
      return { at: Math.max(1, Math.min(segments, Math.floor(m.at))), text: m.text, ...(stage ? { stage } : {}), ...(m.payoffs?.length ? { payoffs: m.payoffs.map((p) => ({ kind: p.kind, text: p.text })) } : {}) };
    })
    .sort((a, b) => a.at - b.at);
  const sponsorRef = draft.sponsor;
  const sponsor = sponsorRef ? (opts.idMap?.[sponsorRef] ?? (store.has("entities", sponsorRef) ? sponsorRef : undefined)) : undefined;
  const rec: Omit<ArcThread, "id" | "created" | "updated"> = {
    title: draft.title,
    playerTitle: draft.playerTitle,
    goal: draft.goal,
    method: draft.method,
    weakness: draft.weakness,
    cost: draft.cost,
    stages,
    clock: { segments, filled: 0, milestones, log: [] },
    status: "active",
    order,
    visibility: { ...GM_ONLY },
  };
  if (sponsor) rec.sponsor = sponsor;
  if (opts.source) rec.source = clone(opts.source);
  if (draft.page !== undefined) rec.page = clone(draft.page);
  if (draft.cite !== undefined) rec.cite = clone(draft.cite);
  return store.insert("arcs", rec);
}

export type ThreadPatch = Partial<Pick<ArcThread, "title" | "playerTitle" | "goal" | "method" | "weakness" | "cost" | "status" | "sponsor" | "sponsorRevealed">>;

/** Rename a thread, change its status or sponsor, reveal the sponsor to the players. */
export function updateThread(store: CampaignStore, threadId: Id, patch: ThreadPatch): ArcThread {
  thread(store, threadId);
  const p: ThreadPatch = {};
  for (const [k, v] of Object.entries(patch) as Array<[keyof ThreadPatch, unknown]>) {
    if (typeof v === "string") (p as Record<string, unknown>)[k] = k === "sponsor" ? v || undefined : v.trim();
    else (p as Record<string, unknown>)[k] = v;
  }
  return store.update("arcs", threadId, p);
}

/** Move a thread to another column of the board. */
export function moveThread(store: CampaignStore, threadId: Id, newIndex: number): ArcThread[] {
  const list = threadsInOrder(store.list("arcs")).filter((t) => t.id !== threadId);
  const t = thread(store, threadId);
  list.splice(Math.max(0, Math.min(newIndex, list.length)), 0, t);
  store.transact(() => list.forEach((x, i) => x.order !== i && store.update("arcs", x.id, { order: i })));
  return threadsInOrder(store.list("arcs"));
}

export function removeThread(store: CampaignStore, threadId: Id): void {
  store.transact(() => {
    store.remove("arcs", threadId);
    // contacts forget what they knew of it
    for (const e of store.list("entities")) {
      if (e.contact?.knows.some((k) => k.thread === threadId)) store.update("entities", e.id, { contact: { ...e.contact, knows: e.contact.knows.filter((k) => k.thread !== threadId) } });
    }
  });
}

// ---------------------------------------------------------------------------
// stages and clues
// ---------------------------------------------------------------------------

/** Reorder the stages of a thread (stage ids, milestones and clues move with them). */
export function moveStage(store: CampaignStore, threadId: Id, stageId: Id, newIndex: number): ArcThread {
  const t = thread(store, threadId);
  const stage = t.stages.find((s) => s.id === stageId);
  if (!stage) throw new Error(`stage ${stageId} not found`);
  const stages = t.stages.filter((s) => s.id !== stageId);
  stages.splice(Math.max(0, Math.min(newIndex, stages.length)), 0, stage);
  return store.update("arcs", threadId, { stages });
}

export function addStage(store: CampaignStore, threadId: Id, input: { title: string; summary?: string }, index?: number): ArcStage {
  const t = thread(store, threadId);
  const stage: ArcStage = { id: newId(), title: input.title.trim() || `Stage ${t.stages.length + 1}`, clues: [] };
  if (input.summary?.trim()) stage.summary = input.summary.trim();
  const stages = [...t.stages];
  stages.splice(index === undefined ? stages.length : Math.max(0, Math.min(index, stages.length)), 0, stage);
  store.update("arcs", threadId, { stages });
  return stage;
}

export function updateStage(store: CampaignStore, threadId: Id, stageId: Id, patch: { title?: string; summary?: string }): ArcThread {
  const t = thread(store, threadId);
  const stages = t.stages.map((s) => {
    if (s.id !== stageId) return s;
    const next = { ...s };
    if (patch.title !== undefined && patch.title.trim()) next.title = patch.title.trim();
    if (patch.summary !== undefined) {
      if (patch.summary.trim()) next.summary = patch.summary.trim();
      else delete next.summary;
    }
    return next;
  });
  return store.update("arcs", threadId, { stages });
}

/** Remove a stage and its clues; its milestones no longer open a stage. */
export function removeStage(store: CampaignStore, threadId: Id, stageId: Id): ArcThread {
  const t = thread(store, threadId);
  const milestones = t.clock.milestones.map((m) => {
    if (m.stage !== stageId) return m;
    const out = { ...m };
    delete out.stage;
    return out;
  });
  return store.update("arcs", threadId, { stages: t.stages.filter((s) => s.id !== stageId), clock: { ...t.clock, milestones } });
}

export interface ClueInput {
  kind: string;
  text: string;
  playerText?: string;
  unlocks?: string;
}

export function addClue(store: CampaignStore, threadId: Id, stageId: Id, input: ClueInput): ArcClue {
  const t = thread(store, threadId);
  const clue: ArcClue = { id: newId(), kind: input.kind, text: input.text.trim(), playerText: (input.playerText ?? input.text).trim(), state: "unseen" };
  if (input.unlocks?.trim()) clue.unlocks = input.unlocks.trim();
  let hit = false;
  const stages = t.stages.map((s) => {
    if (s.id !== stageId) return s;
    hit = true;
    return { ...s, clues: [...s.clues, clue] };
  });
  if (!hit) throw new Error(`stage ${stageId} not found`);
  store.update("arcs", threadId, { stages });
  return clue;
}

export type CluePatch = Partial<Pick<ArcClue, "kind" | "text" | "playerText" | "unlocks" | "players" | "links">>;

export function updateClue(store: CampaignStore, threadId: Id, clueId: Id, patch: CluePatch): ArcThread {
  return editClue(store, threadId, clueId, (c) => {
    for (const [k, v] of Object.entries(patch)) {
      if (v === undefined || (typeof v === "string" && k === "unlocks" && !v.trim())) delete (c as unknown as Record<string, unknown>)[k];
      else (c as unknown as Record<string, unknown>)[k] = typeof v === "string" ? v.trim() : clone(v);
    }
    return c;
  });
}

export function removeClue(store: CampaignStore, threadId: Id, clueId: Id): ArcThread {
  const t = thread(store, threadId);
  return store.update("arcs", threadId, { stages: t.stages.map((s) => ({ ...s, clues: s.clues.filter((c) => c.id !== clueId) })) });
}

/** Move a clue to another stage (at the end, or at `index`). */
export function moveClue(store: CampaignStore, threadId: Id, clueId: Id, stageId: Id, index?: number): ArcThread {
  const t = thread(store, threadId);
  const found = findClue(t, clueId);
  if (!found) throw new Error(`clue ${clueId} not found`);
  if (!t.stages.some((s) => s.id === stageId)) throw new Error(`stage ${stageId} not found`);
  const stages = t.stages.map((s) => ({ ...s, clues: s.clues.filter((c) => c.id !== clueId) }));
  const target = stages.find((s) => s.id === stageId)!;
  target.clues.splice(index === undefined ? target.clues.length : Math.max(0, Math.min(index, target.clues.length)), 0, found.clue);
  return store.update("arcs", threadId, { stages });
}

/** Place a clue in a job's material (or on an NPC): it becomes seeded, with where it sits. A found clue stays found. */
export function seedClue(store: CampaignStore, threadId: Id, clueId: Id, seeding: Omit<ArcClueSeeding, "at"> & { at?: string }): ArcThread {
  return editClue(store, threadId, clueId, (c) => {
    const s: ArcClueSeeding = { at: seeding.at ?? now() };
    for (const k of ["job", "posting", "run", "slot", "slotLabel", "entity", "text"] as const) if (seeding[k]) s[k] = seeding[k];
    c.seeded = s;
    if (c.state !== "found") c.state = "seeded";
    c.links = addLink(addLink(c.links, "jobs", s.job), "entities", s.entity);
    return c;
  });
}

/** Take a clue back out of the job it was seeded in (back to unseen, unless the crew already found it). */
export function unseedClue(store: CampaignStore, threadId: Id, clueId: Id): ArcThread {
  return editClue(store, threadId, clueId, (c) => {
    delete c.seeded;
    if (c.state === "seeded") c.state = "unseen";
    return c;
  });
}

export interface FoundInput extends Omit<ArcClueFound, "at"> {
  at?: string;
  /** Only these players learnt it (absent: the whole crew). */
  players?: Id[];
}

/** The crew learnt a clue: found, with the session and job it was found in. */
export function markClueFound(store: CampaignStore, threadId: Id, clueId: Id, input: FoundInput = {}): ArcThread {
  return editClue(store, threadId, clueId, (c) => {
    const f: ArcClueFound = { at: input.at ?? now() };
    for (const k of ["session", "job", "entity", "via"] as const) if (input[k]) (f as unknown as Record<string, unknown>)[k] = input[k];
    c.found = f;
    c.state = "found";
    c.links = addLink(addLink(addLink(c.links, "sessions", f.session), "jobs", f.job), "entities", f.entity);
    if (input.players) c.players = [...input.players];
    return c;
  });
}

/** Undo "found": back to seeded when it was placed somewhere, else unseen. */
export function unmarkClueFound(store: CampaignStore, threadId: Id, clueId: Id): ArcThread {
  return editClue(store, threadId, clueId, (c) => {
    delete c.found;
    c.state = c.seeded ? "seeded" : "unseen";
    return c;
  });
}

/** Clues tied to a record: seeded in it, found in it, carried by it or linked to it. */
export function cluesFor(maps: Pick<CampaignMaps, "arcs">, id: Id): Array<{ thread: ArcThread; clue: ArcClue; stage: ArcStage }> {
  const out: Array<{ thread: ArcThread; clue: ArcClue; stage: ArcStage }> = [];
  for (const t of threadsInOrder(Object.values(maps.arcs ?? {}))) {
    for (const { clue, stage } of cluesOf(t)) {
      const l = clue.links ?? {};
      const hit = clue.seeded?.job === id || clue.seeded?.entity === id || clue.found?.job === id || clue.found?.session === id || [...(l.entities ?? []), ...(l.jobs ?? []), ...(l.sessions ?? []), ...(l.scenes ?? [])].includes(id);
      if (hit) out.push({ thread: t, clue, stage });
    }
  }
  return out;
}

/** Seeded clues the crew could have found in a session (or any seeded clue when no session narrows it). */
export function seededClues(maps: Pick<CampaignMaps, "arcs">): Array<{ thread: ArcThread; clue: ArcClue; stage: ArcStage }> {
  return threadsInOrder(Object.values(maps.arcs ?? {})).flatMap((t) => cluesOf(t).filter((x) => x.clue.state === "seeded").map((x) => ({ thread: t, clue: x.clue, stage: x.stage })));
}

/** NPCs who work for a thread: tie one (a betrayer's "why"). */
export function tieAgent(store: CampaignStore, threadId: Id, entityId: Id): ArcThread {
  const t = thread(store, threadId);
  return store.update("arcs", threadId, { agents: uniq([...(t.agents ?? []), entityId]) });
}

export function untieAgent(store: CampaignStore, threadId: Id, entityId: Id): ArcThread {
  const t = thread(store, threadId);
  return store.update("arcs", threadId, { agents: (t.agents ?? []).filter((x) => x !== entityId) });
}

// ---------------------------------------------------------------------------
// clocks
// ---------------------------------------------------------------------------

/** When the thread's clock last moved (its creation before that). */
export function lastTickAt(t: Pick<ArcThread, "clock" | "created">): string {
  return t.clock.log.reduce((at, x) => (x.at > at ? x.at : at), t.created);
}

/** An active thread the crew ignored: no clue of it found since its clock last moved. */
export function isThreadIgnored(t: Pick<ArcThread, "clock" | "created" | "stages" | "status">): boolean {
  if (t.status !== "active") return false;
  const since = lastTickAt(t);
  return !cluesOf(t).some((x) => x.clue.state === "found" && (x.clue.found?.at ?? "") > since);
}

export interface ClockMove {
  thread: ArcThread;
  from: number;
  to: number;
  /** Milestones reached by this move, with their payoff suggestions. */
  reached: ArcMilestone[];
}

/** Advance (or wind back) a thread's clock. Milestones it reaches are marked; winding back below one clears it. */
export function advanceClock(
  store: CampaignStore,
  threadId: Id,
  by: number,
  opts: { how?: "roll" | "hand"; roll?: { dice: string; faces: number[]; total: number; seed: string }; ignored?: boolean; note?: string; session?: Id; at?: string } = {},
): ClockMove {
  const t = thread(store, threadId);
  const at = opts.at ?? now();
  const from = t.clock.filled;
  const to = Math.max(0, Math.min(t.clock.segments, from + Math.round(by)));
  const reached: ArcMilestone[] = [];
  const milestones = t.clock.milestones.map((m) => {
    if (m.at <= to && !m.reached) {
      const r = { ...m, reached: at };
      reached.push(r);
      return r;
    }
    if (m.at > to && m.reached) {
      const r = { ...m };
      delete r.reached;
      return r;
    }
    return m;
  });
  const entry: ArcThread["clock"]["log"][number] = { at, by: to - from, how: opts.how ?? "hand" };
  if (opts.roll) entry.roll = clone(opts.roll);
  if (opts.ignored) entry.ignored = true;
  if (opts.note) entry.note = opts.note;
  if (opts.session) entry.session = opts.session;
  const next = store.update("arcs", threadId, { clock: { ...t.clock, filled: to, milestones, log: [...t.clock.log, entry] } });
  return { thread: next, from, to, reached };
}

/** One thread's planned tick between jobs. */
export interface ArcTickPlan {
  thread: Id;
  title: string;
  from: number;
  to: number;
  by: number;
  ignored: boolean;
  roll: ArcTickRoll;
  /** Milestones this tick would reach. */
  reaches: ArcMilestone[];
}

/**
 * Plan the between-jobs tick of every active thread: one roll each from
 * `<seed>/<thread id>`, plus the module's extra for an ignored thread. Pure:
 * same campaign, seed and module, same plan. Nothing moves until applied.
 */
export function planArcTicks(maps: Pick<CampaignMaps, "arcs">, def: Pick<ArcsDef, "tick">, seed: string): ArcTickPlan[] {
  const out: ArcTickPlan[] = [];
  for (const t of threadsInOrder(Object.values(maps.arcs ?? {}))) {
    if (t.status !== "active") continue;
    const ignored = isThreadIgnored(t);
    const roll = rollArcTick(def, `${seed}/${t.id}`, ignored);
    if (!roll) continue;
    const from = t.clock.filled;
    const to = Math.max(0, Math.min(t.clock.segments, from + roll.ticks + roll.ignored));
    out.push({ thread: t.id, title: t.title, from, to, by: to - from, ignored, roll, reaches: t.clock.milestones.filter((m) => m.at > from && m.at <= to) });
  }
  return out;
}

/** Apply planned ticks (each logged as a roll, with the session when there is one). */
export function applyArcTicks(store: CampaignStore, plans: ArcTickPlan[], opts: { session?: Id; note?: string } = {}): ClockMove[] {
  return store.transact(() =>
    plans
      .filter((p) => store.has("arcs", p.thread))
      .map((p) =>
        advanceClock(store, p.thread, p.roll.ticks + p.roll.ignored, {
          how: "roll",
          roll: { dice: p.roll.dice, faces: p.roll.faces, total: p.roll.total, seed: p.roll.seed },
          ...(p.ignored ? { ignored: true } : {}),
          ...(opts.note ? { note: opts.note } : {}),
          ...(opts.session ? { session: opts.session } : {}),
        }),
      ),
  );
}

/** Payoffs of milestones the clock has reached and no board has used yet. */
export function pendingPayoffs(t: Pick<ArcThread, "clock">): Array<{ milestone: number; kind: string; text: string; milestoneText: string }> {
  return t.clock.milestones.filter((m) => m.reached || m.at <= t.clock.filled).flatMap((m) => (m.payoffs ?? []).filter((p) => !p.used).map((p) => ({ milestone: m.at, kind: p.kind, text: p.text, milestoneText: m.text })));
}

/** Mark a milestone's payoff as used (a board dealt it, or the GM did by hand). */
export function useArcPayoff(store: CampaignStore, threadId: Id, milestone: number, kind: string, job?: Id): ArcThread {
  const t = thread(store, threadId);
  const at = now();
  let done = false;
  const milestones = t.clock.milestones.map((m) => {
    if (m.at !== milestone || done) return m;
    const payoffs = (m.payoffs ?? []).map((p) => {
      if (done || p.kind !== kind || p.used) return p;
      done = true;
      return { ...p, used: { at, ...(job ? { job } : {}) } };
    });
    return { ...m, payoffs };
  });
  return store.update("arcs", threadId, { clock: { ...t.clock, milestones } });
}

// ---------------------------------------------------------------------------
// faction heat
// ---------------------------------------------------------------------------

/** Whether the entity carries heat under the module's arcs. */
export function carriesHeat(def: ArcsDef | undefined, entity: Pick<Entity, "type">): boolean {
  return !!def?.heat?.entityTypes.includes(entity.type);
}

export function heatOf(def: ArcsDef | undefined, entity: Pick<Entity, "type" | "fields">): number {
  if (!def?.heat || !carriesHeat(def, entity)) return 0;
  const v = getPath(entity.fields, def.heat.path);
  return clampHeat(def, typeof v === "number" ? v : 0);
}

/** Set a faction's heat (clamped to the module's scale). */
export function setHeat(store: CampaignStore, def: ArcsDef, entityId: Id, value: number): Entity {
  const e = store.get("entities", entityId);
  if (!e) throw new Error(`entities/${entityId} not found`);
  if (!def.heat || !carriesHeat(def, e)) throw new Error(`${e.name} carries no heat`);
  const fields = setPath(clone(e.fields), def.heat.path, clampHeat(def, value));
  return store.update("entities", entityId, { fields });
}

export function adjustHeat(store: CampaignStore, def: ArcsDef, entityId: Id, by: number): Entity {
  const e = store.get("entities", entityId);
  if (!e) throw new Error(`entities/${entityId} not found`);
  return setHeat(store, def, entityId, heatOf(def, e) + by);
}

/** Every entity that carries heat, hottest first (then by name). */
export function factionHeat(maps: Pick<CampaignMaps, "entities">, def: ArcsDef | undefined): Array<{ entity: Entity; heat: number; label: string }> {
  if (!def?.heat) return [];
  return Object.values(maps.entities)
    .filter((e) => carriesHeat(def, e))
    .map((entity) => ({ entity, heat: heatOf(def, entity), label: heatLabel(def, heatOf(def, entity)) }))
    .sort((a, b) => b.heat - a.heat || a.entity.name.localeCompare(b.entity.name) || a.entity.id.localeCompare(b.entity.id));
}

/**
 * Who may have noticed the crew on a job: factions linked to the job (its
 * employer), factions its NPCs belong to, factions named in its text fields
 * (complications, twist), and sponsors of threads with a clue in it.
 */
export function heatSuggestions(maps: Pick<CampaignMaps, "entities" | "relationships" | "arcs">, def: ArcsDef | undefined, jobId: Id): Array<{ entity: Entity; why: string }> {
  if (!def?.heat) return [];
  const job = maps.entities[jobId];
  if (!job) return [];
  const out = new Map<Id, string>();
  const add = (id: Id | undefined, why: string) => {
    const e = id ? maps.entities[id] : undefined;
    if (e && carriesHeat(def, e) && !out.has(e.id)) out.set(e.id, why);
  };
  const rels = Object.values(maps.relationships);
  for (const r of rels) {
    if (r.to === jobId) add(r.from, r.type.replace(/_/g, " "));
    if (r.from === jobId) add(r.to, r.type.replace(/_/g, " "));
  }
  const people = rels.filter((r) => r.to === jobId || r.from === jobId).map((r) => (r.to === jobId ? r.from : r.to));
  for (const r of rels) if (r.type === "member_of" && people.includes(r.from)) add(r.to, `${maps.entities[r.from]?.name ?? "an NPC"} works for them`);
  const text = Object.values(job.fields)
    .flatMap((v) => (typeof v === "string" ? [v] : Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []))
    .join(" ")
    .toLowerCase();
  for (const e of Object.values(maps.entities)) if (carriesHeat(def, e) && e.name.length > 2 && text.includes(e.name.toLowerCase())) add(e.id, "named in the job");
  for (const t of Object.values(maps.arcs ?? {})) if (cluesOf(t).some((x) => x.clue.seeded?.job === jobId)) add(t.sponsor, `sponsor of a thread with a clue in the job`);
  return [...out].map(([id, why]) => ({ entity: maps.entities[id]!, why }));
}

// ---------------------------------------------------------------------------
// contacts
// ---------------------------------------------------------------------------

export interface ContactInput {
  stance?: ContactStance;
  owedToCrew?: number;
  owedByCrew?: number;
  grudges?: string[];
  knows?: Array<{ thread: Id; clue: Id }>;
  foundAt?: string;
  place?: Id;
  lastSeen?: EntityContact["lastSeen"];
  betrayer?: boolean;
  note?: string;
}

function contactOf(input: ContactInput, base?: EntityContact): EntityContact {
  const c: EntityContact = base ? clone(base) : { since: now(), stance: "neutral", favours: { owedToCrew: 0, owedByCrew: 0 }, grudges: [], knows: [] };
  if (input.stance) c.stance = input.stance;
  if (input.owedToCrew !== undefined) c.favours.owedToCrew = Math.max(0, Math.round(input.owedToCrew));
  if (input.owedByCrew !== undefined) c.favours.owedByCrew = Math.max(0, Math.round(input.owedByCrew));
  if (input.grudges) c.grudges = input.grudges.map((g) => g.trim()).filter(Boolean);
  if (input.knows) c.knows = input.knows.filter((k, i, a) => a.findIndex((x) => x.thread === k.thread && x.clue === k.clue) === i);
  for (const k of ["foundAt", "note"] as const) {
    const v = input[k];
    if (v === undefined) continue;
    if (v.trim()) c[k] = v.trim();
    else delete c[k];
  }
  if (input.place !== undefined) {
    if (input.place) c.place = input.place;
    else delete c.place;
  }
  if (input.lastSeen) c.lastSeen = { ...(c.lastSeen ?? {}), ...input.lastSeen };
  if (input.betrayer !== undefined) {
    if (input.betrayer) c.betrayer = true;
    else delete c.betrayer;
  }
  return c;
}

/**
 * Make an NPC one of the crew's contacts. `reveal` lets the players see a
 * GM-only NPC (they met them): its visibility becomes players.
 */
export function addContact(store: CampaignStore, entityId: Id, input: ContactInput = {}, opts: { reveal?: boolean } = {}): Entity {
  const e = store.get("entities", entityId);
  if (!e) throw new Error(`entities/${entityId} not found`);
  const patch: Partial<Entity> = { contact: contactOf(input, e.contact) };
  if (opts.reveal && e.visibility.level === "gm") patch.visibility = { level: "players" };
  return store.update("entities", entityId, patch);
}

export function updateContact(store: CampaignStore, entityId: Id, input: ContactInput): Entity {
  const e = store.get("entities", entityId);
  if (!e?.contact) throw new Error(`entities/${entityId} is not a contact`);
  return store.update("entities", entityId, { contact: contactOf(input, e.contact) });
}

export function removeContact(store: CampaignStore, entityId: Id): Entity {
  return store.update("entities", entityId, { contact: undefined });
}

/** The crew's contacts, by name. */
export function contactsOf(maps: Pick<CampaignMaps, "entities">): Entity[] {
  return Object.values(maps.entities)
    .filter((e) => !!e.contact)
    .sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
}

/**
 * NPCs of a job who could become contacts: characters linked to the job that
 * are not player characters and not contacts yet (the GM unticks the dead).
 */
export function contactCandidates(maps: Pick<CampaignMaps, "entities" | "relationships">, module: ModuleTypes | undefined, jobId: Id): Entity[] {
  const ids = Object.values(maps.relationships)
    .filter((r) => r.to === jobId || r.from === jobId)
    .map((r) => (r.to === jobId ? r.from : r.to));
  return uniq(ids)
    .map((id) => maps.entities[id])
    .filter((e): e is Entity => !!e && findEntityType(module, e.type)?.kind === "character" && e.fields.isPC !== true && !e.ownerMemberId && !e.contact)
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** "Owes the crew a favour", "The crew owes them 2 favours", ... as the players may read it. */
export function favourLine(f: { owedToCrew: number; owedByCrew: number }): string {
  const n = (k: number) => (k === 1 ? "a favour" : `${k} favours`);
  const parts: string[] = [];
  if (f.owedToCrew > 0) parts.push(`owes the crew ${n(f.owedToCrew)}`);
  if (f.owedByCrew > 0) parts.push(`the crew owes them ${n(f.owedByCrew)}`);
  if (parts.length === 0) return "No favours either way.";
  const s = parts.join("; ");
  return `${s.charAt(0).toUpperCase()}${s.slice(1)}.`;
}

// ---------------------------------------------------------------------------
// what a board reads
// ---------------------------------------------------------------------------

/** Scalar fields of an entity (for a board's weighting, e.g. a faction's type). */
function scalars(fields: Record<string, unknown>): Record<string, string | number | boolean> {
  const out: Record<string, string | number | boolean> = {};
  for (const [k, v] of Object.entries(fields)) if (typeof v === "string" || typeof v === "boolean" || (typeof v === "number" && Number.isFinite(v))) out[k] = v;
  return out;
}

/**
 * The arcs as a board reads them (an `x-arcs` input): threads with their
 * clues and clocks, faction heat above zero, and contacts, plus the GM's
 * choices. Sorted for stable output.
 */
export function arcsSnapshot(maps: Pick<CampaignMaps, "arcs" | "entities">, module: ArcsModule | undefined, choices: { seedClue?: string; influence?: boolean } = {}): ArcSnapshot {
  const def = module?.arcs;
  const threads = threadsInOrder(Object.values(maps.arcs ?? {})).map((t) => {
    const sponsor = t.sponsor ? maps.entities[t.sponsor] : undefined;
    return {
      id: t.id,
      title: t.title,
      ...(sponsor ? { sponsor: sponsor.id, sponsorName: sponsor.name } : {}),
      goal: t.goal,
      method: t.method,
      status: t.status,
      segments: t.clock.segments,
      filled: t.clock.filled,
      ignored: isThreadIgnored(t),
      clues: cluesOf(t).map(({ clue, stageIndex }) => ({ id: clue.id, stage: stageIndex, kind: clue.kind, text: clue.text, playerText: clue.playerText, state: clue.state })),
      payoffs: pendingPayoffs(t).map((p) => ({ milestone: p.milestone, kind: p.kind, text: p.text })),
    };
  });
  const heat = factionHeat(maps, def)
    .filter((h) => h.heat > 0)
    .map((h) => ({ id: h.entity.id, name: h.entity.name, heat: h.heat, label: h.label, fields: scalars(h.entity.fields) }));
  const contacts = contactsOf(maps).map((e) => {
    const c = e.contact!;
    return {
      id: e.id,
      name: e.name,
      stance: c.stance,
      owedToCrew: c.favours.owedToCrew,
      owedByCrew: c.favours.owedByCrew,
      grudges: [...c.grudges],
      knows: c.knows.map((k) => ({ thread: k.thread, clue: k.clue })),
      ...(c.foundAt ? { foundAt: c.foundAt } : {}),
      ...(c.betrayer ? { betrayer: true } : {}),
      ...(e.visibility.level !== "gm" ? { visible: true } : {}),
    };
  });
  const out: ArcSnapshot = { threads, heat, contacts };
  if (choices.seedClue !== undefined) out.seedClue = choices.seedClue;
  if (choices.influence !== undefined) out.influence = choices.influence;
  return out;
}

/** True when the snapshot holds nothing a board could use. */
export function arcsSnapshotEmpty(s: Pick<ArcSnapshot, "threads" | "heat" | "contacts"> | undefined): boolean {
  return !s || (s.threads.length === 0 && s.heat.length === 0 && s.contacts.length === 0);
}

/**
 * Record what an accepted offer ties to the arcs: a clue it seeds (with the
 * job, posting and slot), an NPC it ties to a thread, a payoff it used, a
 * contact it brought back (last seen on the job).
 */
export function applyOfferArcLinks(
  store: CampaignStore,
  links: OfferArcLink[] | undefined,
  ctx: { job?: Id; posting?: string; run?: Id; idMap?: Record<string, Id>; session?: Id; slotLabel?: (slot: string) => string | undefined },
): void {
  if (!links?.length) return;
  const resolve = (ref: string | undefined): Id | undefined => (ref ? (ctx.idMap?.[ref] ?? (store.has("entities", ref) ? ref : undefined)) : undefined);
  store.transact(() => {
    for (const l of links) {
      const t = l.thread ? store.get("arcs", l.thread) : undefined;
      switch (l.kind) {
        case "clue": {
          if (!t || !l.clue || !findClue(t, l.clue)) break;
          const entity = resolve(l.entity);
          const label = l.slotLabel ?? (l.slot ? ctx.slotLabel?.(l.slot) : undefined);
          seedClue(store, t.id, l.clue, {
            ...(ctx.job ? { job: ctx.job } : {}),
            ...(ctx.posting ? { posting: ctx.posting } : {}),
            ...(ctx.run ? { run: ctx.run } : {}),
            ...(l.slot ? { slot: l.slot } : {}),
            ...(label ? { slotLabel: label } : {}),
            ...(entity ? { entity } : {}),
            ...(l.text ? { text: l.text } : {}),
          });
          break;
        }
        case "agent": {
          const entity = resolve(l.entity);
          if (t && entity) tieAgent(store, t.id, entity);
          break;
        }
        case "payoff": {
          if (t && l.milestone !== undefined && l.payoff) useArcPayoff(store, t.id, l.milestone, l.payoff, ctx.job);
          break;
        }
        case "contact": {
          const entity = resolve(l.entity);
          const e = entity ? store.get("entities", entity) : undefined;
          if (e?.contact) store.update("entities", e.id, { contact: { ...e.contact, lastSeen: { ...(e.contact.lastSeen ?? {}), ...(ctx.job ? { job: ctx.job } : {}), ...(ctx.session ? { session: ctx.session } : {}), at: now() } } });
          break;
        }
      }
    }
  });
}

// ---------------------------------------------------------------------------
// crew notes: the players' view
// ---------------------------------------------------------------------------

export interface CrewNotesClue {
  id: Id;
  kind: string;
  kindLabel: string;
  text: string;
  /** "Session 1", when it was found in one. */
  foundIn?: string;
  /** The job it was found on, when the viewer may see the job. */
  job?: string;
  /** Learnt by this player alone (not the whole crew). */
  personal?: boolean;
}

export interface CrewNotesThread {
  id: Id;
  /** The player-facing title only. */
  title: string;
  /** Who is behind it, once the GM revealed it and the viewer may see them. */
  sponsor?: string;
  clues: CrewNotesClue[];
}

export interface CrewNotesContact {
  id: Id;
  name: string;
  foundAt?: string;
  favours: { owedToCrew: number; owedByCrew: number };
  favourLine: string;
  personal?: boolean;
}

export interface CrewNotes {
  title: string;
  threads: CrewNotesThread[];
  contacts: CrewNotesContact[];
  places: Array<{ id: Id; name: string; summary?: string }>;
  factions: Array<{ id: Id; name: string; summary?: string }>;
  empty: boolean;
}

/** May this player read this found clue? The whole crew's clue, or one they learnt themselves. */
export function clueVisibleTo(clue: Pick<ArcClue, "state" | "players">, viewer: Viewer): boolean {
  if (clue.state !== "found") return false;
  if (!clue.players) return true;
  return viewer.memberId !== undefined && clue.players.includes(viewer.memberId);
}

const byName = <T extends { name: string; id: string }>(a: T, b: T) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id);

/**
 * The crew notes one viewer may read: for a player, their own (with what
 * they learnt alone); for the group (`{ role: "player" }`) what the whole
 * crew knows. A GM viewer gets the group's notes (a preview). Pure.
 */
export function crewNotes(maps: CampaignMaps, module: ArcsModule | undefined, viewerIn: Viewer): CrewNotes {
  const viewer: Viewer = viewerIn.role === "gm" ? { role: "player" } : viewerIn;
  const def = module?.arcs;
  const projected = projectCampaignForViewer(maps, module, viewer);
  const visibleName = (id: Id | undefined) => (id ? projected.entities[id]?.name : undefined);
  const kindOf = (id: Id) => findEntityType(module, projected.entities[id]?.type ?? "")?.kind;
  const linked = new Set<Id>();

  const threads: CrewNotesThread[] = [];
  for (const t of threadsInOrder(Object.values(maps.arcs ?? {}))) {
    const clues: CrewNotesClue[] = [];
    for (const { clue } of cluesOf(t)) {
      if (!clueVisibleTo(clue, viewer)) continue;
      const item: CrewNotesClue = { id: clue.id, kind: clue.kind, kindLabel: clueKindLabel(def, clue.kind), text: clue.playerText };
      const session = clue.found?.session ? maps.sessions[clue.found.session] : undefined;
      if (session) item.foundIn = `Session ${session.number}`;
      const job = visibleName(clue.found?.job ?? clue.seeded?.job);
      if (job) item.job = job;
      if (clue.players) item.personal = true;
      clues.push(item);
      for (const id of clue.links?.entities ?? []) linked.add(id);
    }
    if (clues.length === 0) continue;
    const entry: CrewNotesThread = { id: t.id, title: t.playerTitle.trim() || "A loose thread", clues };
    const sponsor = t.sponsorRevealed ? visibleName(t.sponsor) : undefined;
    if (sponsor) {
      entry.sponsor = sponsor;
      linked.add(t.sponsor!);
    }
    threads.push(entry);
  }

  const contacts: CrewNotesContact[] = [];
  for (const e of Object.values(projected.entities)) {
    const c = e.contact;
    if (!c) continue;
    const item: CrewNotesContact = { id: e.id, name: e.name, favours: { owedToCrew: c.favours.owedToCrew, owedByCrew: c.favours.owedByCrew }, favourLine: favourLine(c.favours) };
    if (c.foundAt) item.foundAt = c.foundAt;
    if (!canSee(e.visibility, { role: "player" })) item.personal = true;
    contacts.push(item);
    const place = maps.entities[e.id]?.contact?.place;
    if (place) linked.add(place);
  }
  contacts.sort(byName);

  const places = [...linked]
    .filter((id) => projected.entities[id] && kindOf(id) === "location")
    .map((id) => projected.entities[id]!)
    .map((e) => ({ id: e.id, name: e.name, ...(e.summary ? { summary: e.summary } : {}) }))
    .sort(byName);
  const factions = Object.values(projected.entities)
    .filter((e) => kindOf(e.id) === "faction")
    .map((e) => ({ id: e.id, name: e.name, ...(e.summary ? { summary: e.summary } : {}) }))
    .sort(byName);

  return { title: def?.crewNotes?.title ?? "Crew notes", threads, contacts, places, factions, empty: threads.length === 0 && contacts.length === 0 };
}

/** Crew notes as Markdown (shares, packets, copying). */
export function crewNotesMarkdown(notes: CrewNotes): string {
  const lines: string[] = [];
  for (const t of notes.threads) {
    lines.push(`## ${t.title}`, "");
    if (t.sponsor) lines.push(`Behind it: ${t.sponsor}.`, "");
    for (const c of t.clues) {
      const where = [c.foundIn, c.job].filter(Boolean).join(", ");
      lines.push(`- ${c.kindLabel}: ${c.text}${where ? ` (${where})` : ""}${c.personal ? " (only you know this)" : ""}`);
    }
    lines.push("");
  }
  if (notes.contacts.length) {
    lines.push("## Contacts", "");
    for (const c of notes.contacts) lines.push(`- **${c.name}**${c.foundAt ? `, ${c.foundAt}` : ""}. ${c.favourLine}`);
    lines.push("");
  }
  if (notes.places.length) {
    lines.push("## Places", "");
    for (const p of notes.places) lines.push(`- ${p.name}`);
    lines.push("");
  }
  if (notes.factions.length) {
    lines.push("## Factions", "");
    for (const f of notes.factions) lines.push(`- ${f.name}`);
    lines.push("");
  }
  return lines.join("\n").trim();
}
