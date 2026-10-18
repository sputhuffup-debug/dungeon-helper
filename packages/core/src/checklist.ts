/**
 * The session checklist: generic GM guidance for before, during and after a
 * session. Game-agnostic: the defaults below name no rule from any game.
 *
 * The list a campaign sees is merged from three sources:
 *  - the core defaults (`DEFAULT_SESSION_CHECKLIST`), minus the ones the GM
 *    hid for this campaign;
 *  - items a module contributes through a `checklist` template with
 *    `appliesTo: "session"` (see `moduleChecklistItems`), filtered by mode
 *    and hideable like the defaults;
 *  - the GM's own campaign items.
 *
 * Items may declare `autoWhen`, a generic app event (see
 * `SessionChecklistEvent` in the sdk); the app ticks them when it happens.
 *
 * Campaign choices live in `meta.settings.sessionChecklist`; per-session
 * ticks live on the session record (`Session.checklist`). Both travel with
 * the export bundle like any other campaign data.
 */
import type { PageRef, SessionChecklistEvent, SessionChecklistPhase, Template, TemplateChecklist } from "@campaign-forge/module-sdk";
import type { CampaignStore } from "./store";
import type { CampaignMeta, Id, Session } from "./types";

export type ChecklistPhase = SessionChecklistPhase;

export const CHECKLIST_PHASES: readonly ChecklistPhase[] = ["prep", "play", "wrap"];

export const CHECKLIST_PHASE_TITLES: Record<ChecklistPhase, string> = {
  prep: "Before the session",
  play: "At the table",
  wrap: "After the session",
};

export interface ChecklistItem {
  /** Stable id; per-session ticks are keyed by it. Core ids never change once shipped. */
  id: string;
  phase: ChecklistPhase;
  /** The checkbox label. */
  text: string;
  /** One or two sentences shown when the item is expanded. */
  guidance?: string;
  source: "core" | "module" | "campaign";
  /** Play modes the item applies to (module items); all modes when absent. */
  mode?: string[];
  /** Module items: the module that contributed the item. */
  moduleId?: string;
  /** Module items: rulebook page. */
  page?: PageRef;
  /** The app ticks the item when this event happens (only ever to done). */
  autoWhen?: SessionChecklistEvent;
}

/** A GM-written item, stored in campaign settings. */
export interface CustomChecklistItem {
  id: string;
  phase: ChecklistPhase;
  text: string;
  guidance?: string;
}

/** `meta.settings.sessionChecklist`. */
export interface SessionChecklistSettings {
  /** Ids of default (or module) items the GM hid for this campaign. */
  hidden?: string[];
  /** The GM's own items. */
  custom?: CustomChecklistItem[];
}

export const SESSION_CHECKLIST_SETTING = "sessionChecklist";

const core = (id: string, phase: ChecklistPhase, text: string, guidance: string, autoWhen?: SessionChecklistEvent): ChecklistItem => ({
  id,
  phase,
  text,
  guidance,
  source: "core",
  ...(autoWhen ? { autoWhen } : {}),
});

export const DEFAULT_SESSION_CHECKLIST: readonly ChecklistItem[] = [
  // Before the session
  core("prep.review-last", "prep", "Review the last session", "Reread the summary and loose ends. Pick the two or three threads most likely to come up."),
  core("prep.goal", "prep", "Set a goal for this session", "One sentence on what this session is about or what should change by the end. It keeps the night focused without scripting it."),
  core("prep.opening", "prep", "Plan a strong start", "Open in the middle of something: a threat, a discovery, a choice. Skip travel and shopping unless they matter."),
  core("prep.scenes", "prep", "Sketch a few scenes, not a script", "Three to five likely scenes, each with a purpose. Expect the players to skip some and invent others.", "scenes-planned"),
  core("prep.secrets", "prep", "Prepare secrets and clues", "A handful of things the players could learn, not tied to one place, so they can surface wherever the players go."),
  core("prep.people", "prep", "Know who might show up", "The NPCs likely to appear, what each wants, plus a few spare names for anyone you improvise."),
  core("prep.threat", "prep", "Decide what the opposition does", "What happens if the players do nothing. A countdown or clock makes pressure visible."),
  core("prep.spotlight", "prep", "Give each character a hook", "Check each player character's goals and make sure every one has a reason to be in at least one scene."),
  core("prep.materials", "prep", "Gather what you need at the table", "Maps, handouts, stat blocks, music, and anything you want to show rather than describe."),
  core("prep.logistics", "prep", "Confirm the basics", "Time, place or call link, who is coming, and how long you have."),
  // At the table
  core("play.recap", "play", "Start with a recap", "Ask a player to recap the last session. It shows you what they remember and care about."),
  core("play.check-in", "play", "Check in on tone and comfort", "A quick reminder of the tone and any lines or veils. Invite people to speak up during play."),
  core("play.spotlight", "play", "Share the spotlight", "Notice who has not had a moment yet and turn the next scene toward them."),
  core("play.notes", "play", "Note names and promises", "Write down every name you invent and every promise you make, so they stay consistent.", "log-written"),
  core("play.pacing", "play", "Watch the pace", "Cut scenes that drag, end scenes on tension, and take a short break around the midpoint."),
  core("play.reveals", "play", "Track what the players learn", "Mark secrets and clues as revealed when they come out, so you never repeat or contradict them.", "revealed"),
  core("play.ending", "play", "Leave time to land the ending", "About fifteen minutes before the end, steer toward a cliffhanger or a clean stopping point."),
  // After the session
  core("wrap.hook", "wrap", "End on a hook", "Close with a question, a threat or a choice that makes people want to come back."),
  core("wrap.rewards", "wrap", "Hand out rewards and advancement", "Follow your game's rules for experience, loot or other rewards before people leave.", "prompts-answered"),
  core("wrap.feedback", "wrap", "Ask what worked", "Ask each player one thing they enjoyed and one thing they want more of. Keep it short."),
  core("wrap.summary", "wrap", "Write a short summary", "A few lines while it is fresh: what happened, what changed, what is unresolved.", "summary-saved"),
  core("wrap.loose-ends", "wrap", "Record loose ends", "Unanswered questions, NPCs who changed, debts and promises. They become next session's plan.", "loose-ends-carried"),
  core("wrap.timeline", "wrap", "Update the timeline", "Add the in-world events that happened, so dates and consequences stay consistent.", "timeline-confirmed"),
  core("wrap.schedule", "wrap", "Schedule the next session", "Agree on a date before everyone leaves.", "next-session-planned"),
];

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

export function isChecklistPhase(v: unknown): v is ChecklistPhase {
  return v === "prep" || v === "play" || v === "wrap";
}

/** The campaign's checklist settings, tolerant of missing or malformed data. */
export function checklistSettings(meta: Pick<CampaignMeta, "settings">): Required<SessionChecklistSettings> {
  const raw = meta.settings?.[SESSION_CHECKLIST_SETTING];
  const s = isRecord(raw) ? raw : {};
  const hidden = Array.isArray(s.hidden) ? s.hidden.filter((x): x is string => typeof x === "string") : [];
  const custom = Array.isArray(s.custom)
    ? s.custom.filter((c): c is CustomChecklistItem => isRecord(c) && typeof c.id === "string" && typeof c.text === "string" && isChecklistPhase(c.phase))
    : [];
  return { hidden, custom };
}

/** `settings` with the checklist settings replaced (for `store.updateMeta`). */
export function withChecklistSettings(meta: Pick<CampaignMeta, "settings">, next: SessionChecklistSettings): Record<string, unknown> {
  const current = checklistSettings(meta);
  return { ...(meta.settings ?? {}), [SESSION_CHECKLIST_SETTING]: { hidden: next.hidden ?? current.hidden, custom: next.custom ?? current.custom } };
}

/**
 * Items a module contributes: every `checklist` template with
 * `appliesTo: "session"`. Ids are the module's own (namespaced with the
 * module id, which the conformance check enforces). An item's modes are its
 * own, else its template's. Items without a valid phase are skipped.
 */
export function moduleChecklistItems(templates: readonly Template[], moduleId?: string): ChecklistItem[] {
  const out: ChecklistItem[] = [];
  for (const t of templates) {
    if (t.kind !== "checklist" || t.appliesTo !== "session") continue;
    const scaffold = t.scaffold as Partial<TemplateChecklist>;
    for (const item of Array.isArray(scaffold.items) ? scaffold.items : []) {
      if (!isChecklistPhase(item.phase)) continue;
      const mode = item.mode ?? t.mode;
      out.push({
        id: item.id,
        phase: item.phase,
        text: item.text,
        ...(item.guidance ? { guidance: item.guidance } : {}),
        source: "module",
        ...(mode && mode.length ? { mode: [...mode] } : {}),
        ...(moduleId ? { moduleId } : {}),
        ...(item.page !== undefined ? { page: item.page } : {}),
        ...(item.autoWhen ? { autoWhen: item.autoWhen } : {}),
      });
    }
  }
  return out;
}

/**
 * The campaign's session checklist in phase order (prep, play, wrap). Within
 * a phase: core defaults, then module items, then the GM's own items.
 * Hidden ids are dropped (core and module items); module items outside the
 * campaign's mode are dropped.
 */
export function sessionChecklist(meta: Pick<CampaignMeta, "settings" | "mode">, moduleItems: readonly ChecklistItem[] = []): ChecklistItem[] {
  const { hidden, custom } = checklistSettings(meta);
  const hide = new Set(hidden);
  const defaults = DEFAULT_SESSION_CHECKLIST.filter((i) => !hide.has(i.id));
  const fromModule = moduleItems.filter((i) => !hide.has(i.id) && (!i.mode || i.mode.length === 0 || i.mode.includes(meta.mode)));
  const own: ChecklistItem[] = custom.map((c) => ({ id: c.id, phase: c.phase, text: c.text, ...(c.guidance ? { guidance: c.guidance } : {}), source: "campaign" }));
  return CHECKLIST_PHASES.flatMap((phase) => [...defaults, ...fromModule, ...own].filter((i) => i.phase === phase).map((i) => ({ ...i })));
}

/** Ids of the items an app event ticks. */
export function checklistItemsFor(items: readonly ChecklistItem[], event: SessionChecklistEvent): string[] {
  return items.filter((i) => i.autoWhen === event).map((i) => i.id);
}

/** The ticks on a session (item id -> done). */
export function checklistStateOf(session: Pick<Session, "checklist"> | undefined): Record<string, boolean> {
  const raw = session?.checklist;
  if (!isRecord(raw)) return {};
  const out: Record<string, boolean> = {};
  for (const [k, v] of Object.entries(raw)) if (typeof v === "boolean") out[k] = v;
  return out;
}

export function isChecklistItemDone(session: Pick<Session, "checklist"> | undefined, itemId: string): boolean {
  return checklistStateOf(session)[itemId] === true;
}

/** Tick or untick an item on a session. An untick is stored as `false` so auto-ticks respect it. */
export function setChecklistItem(store: CampaignStore, sessionId: Id, itemId: string, done: boolean): Session {
  return store.transact(() => {
    const session = store.get("sessions", sessionId);
    if (!session) throw new Error(`sessions/${sessionId} not found`);
    return store.update("sessions", sessionId, { checklist: { ...checklistStateOf(session), [itemId]: done } });
  });
}

/**
 * Auto-tick items because the related action happened. Only ever sets an
 * item to done, and never one the GM explicitly unticked (stored `false`).
 * Returns the ids it ticked.
 */
export function autoTickChecklist(store: CampaignStore, sessionId: Id, itemIds: readonly string[]): string[] {
  return store.transact(() => {
    const session = store.get("sessions", sessionId);
    if (!session) return [];
    const state = checklistStateOf(session);
    const ticked = itemIds.filter((id) => state[id] === undefined);
    if (ticked.length === 0) return [];
    store.update("sessions", sessionId, { checklist: { ...state, ...Object.fromEntries(ticked.map((id) => [id, true])) } });
    return ticked;
  });
}

export type ChecklistProgress = Record<ChecklistPhase, { done: number; total: number }>;

/** Done and total items per phase for a session. */
export function checklistProgress(items: readonly ChecklistItem[], session: Pick<Session, "checklist"> | undefined): ChecklistProgress {
  const state = checklistStateOf(session);
  const out: ChecklistProgress = { prep: { done: 0, total: 0 }, play: { done: 0, total: 0 }, wrap: { done: 0, total: 0 } };
  for (const item of items) {
    const p = out[item.phase];
    p.total++;
    if (state[item.id] === true) p.done++;
  }
  return out;
}

/** Done and total over every phase. */
export function checklistTotals(progress: ChecklistProgress): { done: number; total: number } {
  return CHECKLIST_PHASES.reduce((acc, p) => ({ done: acc.done + progress[p].done, total: acc.total + progress[p].total }), { done: 0, total: 0 });
}
