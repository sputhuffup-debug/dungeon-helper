/**
 * Tracker state per session: clocks, initiative, countdowns, logs. The core
 * stores whatever the module's trackers hand it, keyed by tracker id.
 */
import { now } from "./ids";
import type { CampaignStore } from "./store";
import type { Id, TrackerState } from "./types";

export type TrackerLogEntry = TrackerState["log"][number];

function findActive(store: CampaignStore, sessionId: Id): TrackerState | undefined {
  return store.list("trackerState").find((t) => t.session === sessionId && !t.archived);
}

/** The session's live tracker state, created on demand. */
export function getTrackerState(store: CampaignStore, sessionId: Id): TrackerState {
  const existing = findActive(store, sessionId);
  if (existing) return existing;
  if (!store.has("sessions", sessionId)) throw new Error(`sessions/${sessionId} not found`);
  return store.insert("trackerState", { session: sessionId, state: {}, log: [] });
}

/**
 * Merge `patch` into `state[trackerId]`. Object states merge shallowly;
 * anything else is replaced. `undefined` resets the tracker.
 */
export function updateTrackerState(store: CampaignStore, sessionId: Id, trackerId: string, patch: unknown): TrackerState {
  return store.transact(() => {
    const ts = getTrackerState(store, sessionId);
    const state = { ...ts.state };
    const current = state[trackerId];
    if (patch === undefined) {
      delete state[trackerId];
    } else if (isPlainObject(patch) && isPlainObject(current)) {
      state[trackerId] = { ...current, ...patch };
    } else {
      state[trackerId] = patch;
    }
    return store.update("trackerState", ts.id, { state });
  });
}

export function appendTrackerLog(
  store: CampaignStore,
  sessionId: Id,
  entry: { tracker: string; text: string; entity?: Id; data?: unknown; at?: string },
): TrackerState {
  return store.transact(() => {
    const ts = getTrackerState(store, sessionId);
    const full: TrackerLogEntry = { at: entry.at ?? now(), tracker: entry.tracker, text: entry.text };
    if (entry.entity !== undefined) full.entity = entry.entity;
    if (entry.data !== undefined) full.data = entry.data;
    return store.update("trackerState", ts.id, { log: [...ts.log, full] });
  });
}

/** Mark the session's tracker state archived; the next access creates a fresh one. */
export function archiveTrackerState(store: CampaignStore, sessionId: Id): TrackerState | undefined {
  const ts = findActive(store, sessionId);
  if (!ts) return undefined;
  return store.update("trackerState", ts.id, { archived: true });
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}
