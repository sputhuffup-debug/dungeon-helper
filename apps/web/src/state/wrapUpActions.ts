/**
 * The wrap-up as a draft on the session, and the summary drafted from what
 * the session logged.
 *
 * - Every wrap-up field the GM types (summary, rewards, timeline entries,
 *   loose ends, the award ticks, the step they were on) is saved on the
 *   session as `wrapUp.draft` while they type, so leaving and coming back
 *   keeps it. Answers and closing a job are saved when made. Finishing the
 *   session is still what commits (timeline events, rewards, the next
 *   session's plan) and clears the draft.
 * - `draftSessionSummary` writes a summary from the session's records in
 *   templated sentences (no AI, no book text): the scenes run, clues found,
 *   what was shown to the players, panic rolls, injuries and damage, rolls of
 *   note (pushed, critical, fumbled, other module operations) and hunt
 *   events (sweeps, threats seen), then the GM's own log lines. Same records,
 *   same summary. GM-only log entries stay out.
 *
 * The session record is GM-only, so the draft never reaches players.
 */
import { cluesOf, type Id, type Session, type TrackerState } from "@campaign-forge/core";
import { DEFAULT_TERMS, resolveTerms, type Effect, type LoadedModule, type RollResult } from "@campaign-forge/module-sdk";
import type { CampaignContextValue } from "./CampaignProvider";
import { DICE_LOG, REVEAL_LOG, TABLE_LOG, playedScenes, playerCharacters, summaryDraft, wrapUpOf, type DiceLogData, type TimelineDraft } from "./tableActions";

type Ctx = Pick<CampaignContextValue, "store" | "module">;

export interface RewardDraft {
  key: number;
  characterId: Id;
  kind: string;
  value: string;
  note: string;
}

/** What the wrap-up keeps on the session until "Finish session". */
export interface WrapUpDraft {
  summary?: string;
  /** The summary is still the one drafted from the log (the GM has not edited it). */
  summaryDrafted?: boolean;
  looseEnds?: string;
  rewards?: RewardDraft[];
  timeline?: TimelineDraft[];
  /** The step the GM was on. */
  step?: string;
  /** The award checklist's ticks per character, before awarding. */
  awardTicks?: Record<Id, string[]>;
  /** The end-of-act award ticks not awarded yet (see actTickKey in progressionActions.ts). */
  actTicks?: string[];
  at?: string;
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/** The session's wrap-up draft, read defensively. */
export function wrapUpDraftOf(session: Session | undefined): WrapUpDraft {
  const d = wrapUpOf(session).draft;
  if (!isRecord(d)) return {};
  const out: WrapUpDraft = {};
  if (typeof d.summary === "string") out.summary = d.summary;
  if (d.summaryDrafted === true) out.summaryDrafted = true;
  if (typeof d.looseEnds === "string") out.looseEnds = d.looseEnds;
  if (Array.isArray(d.rewards)) out.rewards = d.rewards.filter((r): r is RewardDraft => isRecord(r) && typeof r.characterId === "string").map((r) => ({ key: Number(r.key) || 0, characterId: r.characterId, kind: String(r.kind ?? ""), value: String(r.value ?? ""), note: String(r.note ?? "") }));
  if (Array.isArray(d.timeline))
    out.timeline = d.timeline
      .filter((t): t is TimelineDraft => isRecord(t) && typeof t.key === "string")
      .map((t) => ({ key: t.key, text: String(t.text ?? ""), entities: Array.isArray(t.entities) ? t.entities.filter((x): x is Id => typeof x === "string") : [], include: t.include !== false, ...(typeof t.inWorldDate === "string" ? { inWorldDate: t.inWorldDate } : {}) }));
  if (typeof d.step === "string") out.step = d.step;
  if (isRecord(d.awardTicks)) out.awardTicks = Object.fromEntries(Object.entries(d.awardTicks).filter((x): x is [string, string[]] => Array.isArray(x[1])).map(([k, v]) => [k, v.filter((q): q is string => typeof q === "string")]));
  if (Array.isArray(d.actTicks)) out.actTicks = d.actTicks.filter((k): k is string => typeof k === "string");
  if (typeof d.at === "string") out.at = d.at;
  return out;
}

/** Merge a patch into the session's wrap-up draft (`undefined` values drop a field). A finished session keeps no draft. */
export function saveWrapUpDraft(ctx: Pick<Ctx, "store">, sessionId: Id, patch: Partial<WrapUpDraft>): WrapUpDraft | undefined {
  const session = ctx.store.get("sessions", sessionId);
  if (!session || session.status === "done") return undefined;
  const next: Record<string, unknown> = { ...wrapUpDraftOf(session) };
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined) delete next[k];
    else next[k] = v;
  }
  next.at = new Date().toISOString();
  const wrapUp = { ...wrapUpOf(session), draft: next };
  ctx.store.update("sessions", sessionId, { wrapUp: wrapUp as Record<string, unknown> });
  return next as WrapUpDraft;
}

/**
 * Timeline entries for the wrap-up: the saved ones as the GM left them, then
 * suggestions for what happened since (a scene run after the GM left).
 */
export function mergeTimeline(saved: TimelineDraft[] | undefined, suggested: TimelineDraft[]): TimelineDraft[] {
  if (!saved) return suggested;
  const keys = new Set(saved.map((t) => t.key));
  return [...saved, ...suggested.filter((t) => !keys.has(t.key))];
}

// ---------------------------------------------------------------------------
// the summary, drafted from the log
// ---------------------------------------------------------------------------

/** What the session recorded, as the summary draft reads it (in the order it happened). */
export interface SessionFacts {
  scenes: string[];
  clues: string[];
  shown: string[];
  panics: Array<{ who: string; label: string }>;
  injuries: Array<{ who: string; what: string }>;
  /** Stress responses (the stress tracker's other operations): not injuries. */
  stress: Array<{ who: string; what: string }>;
  /** Damage the player characters took, and whether it broke them. */
  damage: Array<{ who: string; amount: number; broken?: boolean }>;
  rolls: string[];
  sweeps: { count: number; withContacts: number };
  seen: string[];
  /** The GM's own lines from the log document. */
  notes: string[];
}

const uniq = <T>(xs: T[]): T[] => [...new Set(xs)];
const list = (parts: string[]): string => (parts.length <= 1 ? (parts[0] ?? "") : `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`);
const stop = (s: string) => s.trim().replace(/[.!?…]+$/, "");
const times = (n: number) => (n === 1 ? "once" : n === 2 ? "twice" : `${n} times`);
/** A place's name without a trailing note in brackets ("Gateway Station (job site)" -> "Gateway Station"). */
const placeName = (s: string) => s.replace(/\s*\([^)]*\)\s*$/, "").trim();

/** The module's panic operations (a stress tracker's `panicOperation`). */
function panicOperations(module: Pick<LoadedModule, "module">): Set<string> {
  const out = new Set<string>();
  for (const def of module.module.trackers) {
    if (def.kind !== "stress") continue;
    const cfg = def.config ?? {};
    const ops = isRecord(cfg.operations) ? cfg.operations : {};
    const op = typeof cfg.panicOperation === "string" ? cfg.panicOperation : typeof ops.panic === "string" ? ops.panic : "panicRoll";
    out.add(op);
  }
  return out;
}

/** The stress tracker's other operations (a stress response, a mental trauma roll): what they leave is not an injury. */
function stressOperations(module: Pick<LoadedModule, "module">): Set<string> {
  const out = new Set<string>();
  for (const def of module.module.trackers) {
    if (def.kind !== "stress") continue;
    const cfg = def.config ?? {};
    const ops = isRecord(cfg.operations) ? cfg.operations : {};
    for (const v of [...Object.values(ops), cfg.stressResponseOperation]) if (typeof v === "string") out.add(v);
  }
  for (const op of panicOperations(module)) out.delete(op);
  return out;
}

/** The session's tracker log, oldest first (the live state; an archived one once the session is done). */
function sessionLog(ctx: Ctx, sessionId: Id): TrackerState["log"] {
  const states = ctx.store.list("trackerState").filter((t) => t.session === sessionId);
  const live = states.find((t) => !t.archived) ?? states[0];
  return [...(live?.log ?? [])].sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0));
}

/** Collect what the session recorded. `logText` is the plain text of the session's log document. */
export function sessionFacts(ctx: Ctx, sessionId: Id, logText = ""): SessionFacts {
  const store = ctx.store;
  const session = store.get("sessions", sessionId);
  const facts: SessionFacts = { scenes: [], clues: [], shown: [], panics: [], injuries: [], stress: [], damage: [], rolls: [], sweeps: { count: 0, withContacts: 0 }, seen: [], notes: [] };
  if (!session) return facts;
  const name = (id: Id | undefined) => (id ? store.get("entities", id)?.name : undefined);

  // scenes: the ones played (marked run, or moved into at the table), as the loose ends and timeline read them
  const log = sessionLog(ctx, sessionId);
  for (const id of playedScenes(store, sessionId)) {
    const scene = store.get("scenes", id);
    if (!scene) continue;
    // "Arrival at Gateway Station", not "Arrival at Gateway Station at Gateway Station (job site)"
    const at = placeName(name(scene.location) ?? "");
    facts.scenes.push(at && !scene.title.includes(at) ? `${stop(scene.title)} at ${at}` : stop(scene.title));
  }
  facts.scenes = uniq(facts.scenes);

  // clues the crew found this session
  for (const t of store.list("arcs")) {
    for (const { clue } of cluesOf(t)) if (clue.found?.session === sessionId) facts.clues.push(stop(clue.playerText || clue.text));
  }

  // what the players were shown
  const shown: string[] = [];
  for (const r of session.reveals) {
    const label = r.handout ? store.get("handouts", r.handout)?.title : r.entity ? name(r.entity) : undefined;
    if (label) shown.push(stop(label));
  }
  facts.shown = uniq(shown);

  const panicOps = panicOperations(ctx.module);
  const stressOps = stressOperations(ctx.module);
  const damage = new Map<string, number>();
  const broken = new Set<string>();
  // the hits a player character took are logged GM-only (armor dice and all), but the table saw them land
  const pcs = new Set(playerCharacters(ctx).map((e) => e.id));
  for (const l of log) {
    const data = isRecord(l.data) ? l.data : undefined;
    const entityId = l.entity ?? (typeof data?.entity === "string" ? data.entity : undefined);
    if (entityId && pcs.has(entityId) && data) {
      const who = name(entityId)!;
      const amount = l.tracker === DICE_LOG && data.kind === "damage" && typeof data.total === "number" ? data.total : l.tracker === TABLE_LOG && typeof data.damage === "number" ? data.damage : 0;
      if (amount > 0) damage.set(who, (damage.get(who) ?? 0) + amount);
      if (data.broken === true) broken.add(who);
      if (amount > 0 || data.kind === "damage") continue;
    }
    if (data?.gmOnly === true) continue;
    const who = name(l.entity) ?? (typeof data?.entity === "string" ? name(data.entity) : undefined);
    if (l.tracker === DICE_LOG && data) {
      const d = data as unknown as DiceLogData;
      if (d.kind === "operation" && d.operation) {
        const label = d.label ?? "";
        if (panicOps.has(d.operation)) {
          if (who) facts.panics.push({ who, label: stop(label) });
          continue;
        }
        const opName = ctx.module.module.dice.operations?.[d.operation]?.name ?? d.operation;
        // a stress response is not an injury, even when it leaves a condition
        if (stressOps.has(d.operation)) {
          if (who) facts.stress.push({ who, what: `${opName}, ${stop(label)}` });
          continue;
        }
        const hurt = (d.effects ?? []).some((e: Effect) => e.kind === "addCondition");
        if (hurt && who) facts.injuries.push({ who, what: `${opName}, ${stop(label)}` });
        else facts.rolls.push(`${who ? `${who}: ` : ""}${opName}, ${stop(label)}`);
        continue;
      }
      const result = d.result as RollResult | undefined;
      if ((d.kind === "pool" || d.kind === "free") && result && (result.pushes > 0 || result.critical || result.fumble)) {
        const how = [result.pushes > 0 ? "pushed" : "", result.critical ? "a critical" : "", result.fumble ? "a fumble" : ""].filter(Boolean).join(", ");
        // the roll's own label may already say "(pushed)": said once
        const label = stop(d.label ?? l.text).replace(/\s*\(pushed\)/g, "");
        facts.rolls.push(`${label} (${how}): ${result.successes > 0 ? "made it" : "failed"}`);
      }
      continue;
    }
    if (l.tracker === TABLE_LOG && data?.kind === "sweep") {
      facts.sweeps.count++;
      if (Array.isArray(data.blips) && data.blips.length > 0) facts.sweeps.withContacts++;
      continue;
    }
    // a hunt threat revealed on the map (the hunt logs "Revealed: <label> (blip …)")
    if (l.tracker === TABLE_LOG && !data && l.text.startsWith("Revealed: ")) facts.seen.push(stop(l.text.slice("Revealed: ".length).replace(/\s*\(blip [^)]*\)\s*$/, "")));
    if (l.tracker === REVEAL_LOG) continue;
  }
  facts.damage = [...damage.entries()].map(([who, amount]) => ({ who, amount, ...(broken.has(who) ? { broken: true } : {}) }));
  facts.seen = uniq(facts.seen);
  facts.notes = summaryDraft(logText)
    .split("\n")
    .filter(Boolean);
  return facts;
}

/** The summary drafted from the facts, one sentence a line; empty when the session recorded nothing. `party` is the module's word for the group ("crew"). */
export function summaryFromFacts(f: SessionFacts, party: string = DEFAULT_TERMS.party): string {
  const lines: string[] = [];
  if (f.scenes.length) lines.push(`The ${party} played ${f.scenes.length === 1 ? "one scene" : `${f.scenes.length} scenes`}: ${list(f.scenes)}.`);
  if (f.clues.length === 1) lines.push(`They found a clue: ${f.clues[0]}.`);
  else if (f.clues.length > 1) lines.push(`They found ${f.clues.length} clues: ${f.clues.join("; ")}.`);
  if (f.shown.length) lines.push(`The players were shown ${list(f.shown)}.`);
  for (const p of f.panics) lines.push(`${p.who} panicked: ${p.label}.`);
  for (const s of f.stress) lines.push(`${s.who} reacted to the stress (${s.what}).`);
  if (f.damage.length) lines.push(`Damage taken: ${list(f.damage.map((d) => `${d.who} ${d.amount}${d.broken ? ", broken" : ""}`))}.`);
  for (const i of f.injuries) lines.push(`${i.who} was hurt (${i.what}).`);
  if (f.sweeps.count) lines.push(`The ${party} swept for movement ${times(f.sweeps.count)}${f.sweeps.withContacts ? ` and picked something up ${times(f.sweeps.withContacts)}` : " and picked up nothing"}.`);
  if (f.seen.length) lines.push(`${list(f.seen)} came into view.`);
  if (f.rolls.length) lines.push(`Rolls of note: ${f.rolls.slice(0, 5).join("; ")}${f.rolls.length > 5 ? `; and ${f.rolls.length - 5} more` : ""}.`);
  lines.push(...f.notes);
  return lines.join("\n");
}

/** Draft the session's summary from what it recorded (`logText`: the log document's plain text). Deterministic. */
export function draftSessionSummary(ctx: Ctx, sessionId: Id, logText = ""): string {
  return summaryFromFacts(sessionFacts(ctx, sessionId, logText), resolveTerms(ctx.module.module).party);
}
