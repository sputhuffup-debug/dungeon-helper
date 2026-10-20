/**
 * Character progression in the app: thin wrappers over core's advancement
 * log that read the module's `progression` definition (award checklist,
 * spend options, pools). Nothing here knows what game it is.
 */
import {
  adjustPool,
  advancementLog,
  applySpend,
  lastSpendUndo,
  postAward,
  spendContext,
  spendPoints,
  undoLastSpend,
  type AdvancementEntry,
  type Entity,
  type Id,
  type Session,
} from "@campaign-forge/core";
import {
  advances,
  awardQuestions,
  evaluateAwards,
  progressionFor,
  poolValue,
  progressionPool,
  quoteSpendTargets,
  spendOptions,
  type AwardContext,
  type AwardQuestionDef,
  type AwardRow,
  type LoadedModule,
  type PlayModeId,
  type ProgressionDef,
  type ProgressionPoolDef,
  type ProgressionPoolId,
  type SpendOptionDef,
  type SpendQuote,
  type StoryPointUseDef,
} from "@campaign-forge/module-sdk";
import type { CampaignContextValue } from "./CampaignProvider";
import { checklistEvent, computedOf, playerCharacters, sessionTrackerState } from "./tableActions";

type Ctx = Pick<CampaignContextValue, "store" | "module">;

/** The module's progression when it applies in the campaign's mode. */
export function progressionOf(module: Pick<LoadedModule, "module">, mode: PlayModeId): ProgressionDef | undefined {
  return progressionFor(module.module.progression, mode);
}

/** A pool of the progression that applies in this mode. */
export function poolOf(module: Pick<LoadedModule, "module">, mode: PlayModeId, pool: ProgressionPoolId): ProgressionPoolDef | undefined {
  const def = progressionOf(module, mode);
  return def ? progressionPool(def, pool, mode) : undefined;
}

/** Whether an entity advances under the module's rules in this mode. */
export function entityAdvances(module: Pick<LoadedModule, "module">, mode: PlayModeId, entity: Pick<Entity, "type" | "fields">): boolean {
  return advances(progressionOf(module, mode), entity);
}

/** The campaign's player characters who advance. */
export function advancingCharacters(ctx: Ctx): Entity[] {
  const mode = ctx.store.meta().mode;
  return playerCharacters(ctx).filter((e) => entityAdvances(ctx.module, mode, e));
}

/** Relationship counts by type for a character (either direction). */
function relationshipCounts(ctx: Ctx, id: Id): Record<string, number> {
  const out: Record<string, number> = {};
  for (const r of ctx.store.list("relationships")) if (r.from === id || r.to === id) out[r.type] = (out[r.type] ?? 0) + 1;
  return out;
}

export function awardContextFor(ctx: Ctx, entity: Entity, sessionId?: Id): AwardContext {
  return {
    mode: ctx.store.meta().mode,
    character: { id: entity.id, name: entity.name, type: entity.type, fields: entity.fields },
    computed: computedOf(ctx.module, entity),
    relationships: relationshipCounts(ctx, entity.id),
    trackerState: sessionId ? (sessionTrackerState(ctx.store, sessionId)?.state ?? {}) : {},
  };
}

/** The award questions of a timing ("session", "act", "downtime") for this campaign's mode. */
export function awardQuestionsOf(ctx: Ctx, timing: NonNullable<AwardQuestionDef["timing"]> = "session"): AwardQuestionDef[] {
  const mode = ctx.store.meta().mode;
  return awardQuestions(progressionOf(ctx.module, mode), mode, timing);
}

/** One character's award checklist, with what applies and what the session suggests. */
export function awardRowsFor(ctx: Ctx, entity: Entity, sessionId: Id | undefined, timing: NonNullable<AwardQuestionDef["timing"]> = "session"): AwardRow[] {
  return evaluateAwards(awardQuestionsOf(ctx, timing), awardContextFor(ctx, entity, sessionId));
}

const sessionAwardKey = (sessionId: Id, characterId: Id) => `session:${sessionId}:${characterId}`;
const actAwardKey = (adventureId: Id | undefined, act: number, characterId: Id, question: string) => `act:${adventureId ?? "-"}:${act}:${characterId}:${question}`;

/** The wrap-up awards already posted for a character this session. */
export function sessionAwardsOf(ctx: Ctx, sessionId: Id, characterId: Id): AdvancementEntry[] {
  const key = sessionAwardKey(sessionId, characterId);
  return ctx.store.list("advancement").filter((e) => e.key?.startsWith(`${key}:`));
}

/**
 * Post the end-of-session award checklist: one award per character (and per
 * pool) from the questions ticked, keyed to the session so it is posted once.
 * Ticks the "awards-given" checklist items.
 */
export function postSessionAwards(ctx: Ctx, sessionId: Id, ticks: Record<Id, string[]>): AdvancementEntry[] {
  const out: AdvancementEntry[] = [];
  ctx.store.transact(() => {
    for (const [characterId, questions] of Object.entries(ticks)) {
      if (questions.length === 0 || sessionAwardsOf(ctx, sessionId, characterId).length > 0) continue;
      out.push(...postAward(ctx.store, ctx.module.module, { character: characterId, questions, session: sessionId, key: sessionAwardKey(sessionId, characterId), source: { kind: "wrap-up" } }));
    }
    if (ctx.store.has("sessions", sessionId)) checklistEvent(ctx, sessionId, "awards-given");
  });
  return out;
}

export interface SessionAct {
  adventure?: Id;
  number: number;
  title?: string;
}

/** The acts a session plays, from its planned and run scenes, in order (acts 1-3 of no adventure when it has none). */
export function sessionActs(ctx: Ctx, session: Session | undefined): SessionAct[] {
  const scenes = [...((session as (Session & { plannedScenes?: Id[] }) | undefined)?.plannedScenes ?? []), ...(session?.scenesRun ?? [])];
  const seen = new Map<Id, SessionAct>();
  for (const sid of scenes) {
    const scene = ctx.store.get("scenes", sid);
    const act = scene?.act ? ctx.store.get("acts", scene.act) : undefined;
    if (act && !seen.has(act.id)) seen.set(act.id, { adventure: act.adventure, number: act.number, ...(act.title ? { title: act.title } : {}) });
  }
  const acts = [...seen.values()].sort((a, b) => a.number - b.number);
  return acts.length ? acts : [1, 2, 3].map((number) => ({ number }));
}

/** The end-of-act award already posted for a character, if any. */
export function actAwardOf(ctx: Ctx, act: SessionAct, characterId: Id, question: string): AdvancementEntry | undefined {
  const key = actAwardKey(act.adventure, act.number, characterId, question);
  return ctx.store.list("advancement").find((e) => e.key?.startsWith(`${key}:`));
}

/** Award an end-of-act question (e.g. a Story Point for the act's agenda) once per act and character. */
export function postActAward(ctx: Ctx, input: { character: Id; act: SessionAct; question: string; sessionId?: Id; source?: AdvancementEntry["source"] }): AdvancementEntry[] {
  return postAward(ctx.store, ctx.module.module, {
    character: input.character,
    questions: [input.question],
    act: input.act.number,
    ...(input.act.adventure ? { adventure: input.act.adventure } : {}),
    ...(input.sessionId ? { session: input.sessionId } : {}),
    key: actAwardKey(input.act.adventure, input.act.number, input.character, input.question),
    reason: `Act ${input.act.number}: ${awardQuestionsOf(ctx, "act").find((q) => q.id === input.question)?.text ?? "award"}`,
    source: input.source ?? { kind: "wrap-up" },
  });
}

// ---------------------------------------------------------------------------
// story points
// ---------------------------------------------------------------------------

/** Story point uses for the mode (empty when the module has no story pool in this mode). */
export function storyUses(ctx: Ctx): StoryPointUseDef[] {
  const def = progressionOf(ctx.module, ctx.store.meta().mode);
  return def?.storyPoints && progressionPool(def, "story", ctx.store.meta().mode) ? def.storyPoints.uses : [];
}

/** Spend story points at the table (or anywhere), logged with the reason and the session. */
export function spendStoryPoint(ctx: Ctx, input: { character: Id; use?: string; reason?: string; sessionId?: Id; amount?: number }): AdvancementEntry {
  return spendPoints(ctx.store, ctx.module.module, {
    character: input.character,
    pool: "story",
    ...(input.use ? { use: input.use } : {}),
    ...(input.reason?.trim() ? { reason: input.reason.trim() } : {}),
    ...(input.amount ? { amount: input.amount } : {}),
    ...(input.sessionId ? { session: input.sessionId } : {}),
    source: { kind: input.sessionId ? "table" : "sheet" },
  });
}

/** Award story points by hand (not from the act checklist), logged. */
export function awardStoryPoint(ctx: Ctx, input: { character: Id; reason: string; sessionId?: Id; amount?: number }): AdvancementEntry[] {
  return postAward(ctx.store, ctx.module.module, {
    character: input.character,
    amount: input.amount ?? 1,
    pool: "story",
    reason: input.reason,
    ...(input.sessionId ? { session: input.sessionId } : {}),
    source: { kind: input.sessionId ? "table" : "sheet" },
  });
}

/** End of an adventure: keep at most the carry-over allowance. */
export function carryOverStoryPoints(ctx: Ctx, character: Id): AdvancementEntry | undefined {
  const carry = progressionOf(ctx.module, ctx.store.meta().mode)?.storyPoints?.carryOver;
  if (!carry) return undefined;
  const entity = ctx.store.get("entities", character);
  const pool = poolOf(ctx.module, ctx.store.meta().mode, "story");
  if (!entity || !pool) return undefined;
  const have = poolValue(pool, entity.fields);
  if (have <= carry.max) return undefined;
  return adjustPool(ctx.store, ctx.module.module, { character, pool: "story", to: carry.max, reason: `Carried over to the next adventure (at most ${carry.max})`, source: { kind: "sheet" } });
}

/**
 * Story point changes made by a tracker widget (a setField on the pool path)
 * go through the log instead: up is an award, down a spend.
 */
export function routeStoryPointEffects<E extends { kind: string; entity?: string; path?: string; value?: unknown }>(ctx: Ctx, effects: E[], sessionId?: Id): E[] {
  const pool = poolOf(ctx.module, ctx.store.meta().mode, "story");
  if (!pool) return effects;
  const rest: E[] = [];
  for (const e of effects) {
    if (e.kind !== "setField" || e.path !== pool.path || !e.entity || typeof e.value !== "number") {
      rest.push(e);
      continue;
    }
    const entity = ctx.store.get("entities", e.entity);
    if (!entity || !entityAdvances(ctx.module, ctx.store.meta().mode, entity)) {
      rest.push(e);
      continue;
    }
    const have = poolValue(pool, entity.fields);
    const delta = e.value - have;
    if (delta > 0) awardStoryPoint(ctx, { character: entity.id, amount: delta, reason: "Awarded at the table", ...(sessionId ? { sessionId } : {}) });
    else if (delta < 0) spendStoryPoint(ctx, { character: entity.id, amount: -delta, reason: "Spent at the table", ...(sessionId ? { sessionId } : {}) });
  }
  return rest;
}

// ---------------------------------------------------------------------------
// spending on the sheet
// ---------------------------------------------------------------------------

export function spendOptionsOf(ctx: Ctx): SpendOptionDef[] {
  const mode = ctx.store.meta().mode;
  return spendOptions(progressionOf(ctx.module, mode), mode);
}

/** Every target of a spend option for this character, with costs, caps and preconditions. */
export function spendQuotes(ctx: Ctx, entity: Entity, option: SpendOptionDef): SpendQuote[] {
  const mode = ctx.store.meta().mode;
  const def = progressionOf(ctx.module, mode);
  if (!def) return [];
  return quoteSpendTargets(def, option, entity.fields, spendContext(ctx.module.module, entity, mode));
}

/** Buy a skill step or a talent: change the sheet, pay, log. */
export function spendOnSheet(ctx: Ctx, input: { character: Id; option: string; target: string; confirmed?: boolean }): AdvancementEntry {
  const running = ctx.store.list("sessions").find((s) => s.status === "running");
  return applySpend(ctx.store, ctx.module.module, { ...input, mode: ctx.store.meta().mode, ...(running ? { session: running.id } : {}), source: { kind: "sheet" } }).entry;
}

export function lastSpendUndoOf(ctx: Ctx, character: Id) {
  return lastSpendUndo(ctx.store, ctx.module.module, character);
}

export function undoSpend(ctx: Ctx, character: Id): AdvancementEntry {
  return undoLastSpend(ctx.store, ctx.module.module, character);
}

/** A character's log, newest first. */
export function historyOf(ctx: Ctx, character: Id): AdvancementEntry[] {
  return advancementLog(ctx.store, character).reverse();
}

/** Whether a session is being played now (XP spends warn when the rules want them between sessions). */
export function sessionRunning(ctx: Ctx): boolean {
  return ctx.store.list("sessions").some((s) => s.status === "running");
}
