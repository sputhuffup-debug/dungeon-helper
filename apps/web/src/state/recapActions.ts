/**
 * "Previously on…" in the app: thin wrappers over core's recap.ts. Building
 * waits for the covered sessions' logs to load (a line or two of each goes in
 * the GM's recap); showing the read-aloud on the player screen ticks the
 * checklist's "Start with a recap". Nothing here knows what game it is.
 */
import {
  addRecapLine,
  generateSessionRecap,
  playerRecap,
  recapSessions,
  removeRecapLine,
  showSessionRecap,
  updateRecapLine,
  type Id,
  type PlayerRecap,
  type RecapLineRef,
  type RecapSpan,
  type SessionRecap,
} from "@campaign-forge/core";
import type { RecapAudience } from "@campaign-forge/module-sdk";
import type { CampaignContextValue } from "./CampaignProvider";
import { checklistEvent } from "./tableActions";

type Ctx = Pick<CampaignContextValue, "store" | "module">;
type DocCtx = Ctx & Pick<CampaignContextValue, "registry">;

/** The span choices the recap card offers. */
export const RECAP_SPANS: ReadonlyArray<{ id: string; label: string; span: RecapSpan }> = [
  { id: "last", label: "Since last session", span: { kind: "last" } },
  { id: "last-2", label: "Last 2 sessions", span: { kind: "last-n", n: 2 } },
  { id: "last-3", label: "Last 3 sessions", span: { kind: "last-n", n: 3 } },
  { id: "all", label: "The story so far", span: { kind: "all" } },
];

export function spanId(span: RecapSpan | undefined): string {
  if (!span || span.kind === "last") return "last";
  if (span.kind === "all") return "all";
  return span.n <= 1 ? "last" : `last-${Math.min(3, span.n)}`;
}

/** Build (or rebuild) the session's recap from the campaign, keeping the GM's switches, edits and own lines. */
export async function buildRecap(ctx: DocCtx, sessionId: Id, span?: RecapSpan): Promise<SessionRecap> {
  const current = ctx.store.get("sessions", sessionId)?.recap;
  const covered = recapSessions(ctx.store.toJSON(), sessionId, span ?? current?.span);
  await Promise.all(covered.map((s) => ctx.registry.whenReady(s.logDoc)));
  return generateSessionRecap(ctx.store, ctx.module.module, sessionId, { ...(span ? { span } : {}), doc: (id) => ctx.registry.peek(id) });
}

export function setRecapLineOn(ctx: Ctx, sessionId: Id, at: RecapLineRef, on: boolean): SessionRecap {
  return updateRecapLine(ctx.store, sessionId, at, { off: !on });
}

export function rewriteRecapLine(ctx: Ctx, sessionId: Id, at: RecapLineRef, text: string): SessionRecap {
  return updateRecapLine(ctx.store, sessionId, at, { text });
}

export function addOwnRecapLine(ctx: Ctx, sessionId: Id, audience: RecapAudience, text: string): SessionRecap {
  return addRecapLine(ctx.store, sessionId, audience, text);
}

export function removeOwnRecapLine(ctx: Ctx, sessionId: Id, at: RecapLineRef): SessionRecap {
  return removeRecapLine(ctx.store, sessionId, at);
}

/** Put the read-aloud on the player screen (ticks "Start with a recap"), or take it off. */
export function showRecapOnPlayerScreen(ctx: Ctx, sessionId: Id, shown: boolean): SessionRecap {
  return ctx.store.transact(() => {
    const r = showSessionRecap(ctx.store, sessionId, shown);
    if (shown) checklistEvent(ctx, sessionId, "recap-shown");
    return r;
  });
}

/** The read-aloud as players get it: on the player screen only once shown; in a share whenever the GM picks it. */
export function playerRecapFor(ctx: Ctx, sessionId: Id, opts: { requireShown?: boolean } = {}): PlayerRecap | undefined {
  return playerRecap(ctx.store.toJSON(), ctx.module.module, sessionId, opts);
}
