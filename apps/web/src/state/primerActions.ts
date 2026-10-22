/** The campaign primer: start it, draft it from the campaign, and pick the session its shares are recorded in. */
import { draftPrimer, ensurePrimer, fromMarkdown, now, toMarkdown, type CampaignPrimer, type Id, type PrimerDraft, type Session } from "@campaign-forge/core";
import type { CampaignContextValue } from "./CampaignProvider";
import { sortSessions } from "./tableActions";

export { isSessionZero } from "../lib/sessionZero";

type Ctx = Pick<CampaignContextValue, "store" | "registry" | "whenDocSynced" | "module">;

async function synced(ctx: Pick<Ctx, "registry" | "whenDocSynced">, ids: Array<Id | undefined>): Promise<void> {
  await Promise.all(
    [...new Set(ids.filter((x): x is Id => !!x))].map((id) => {
      ctx.registry.open(id);
      return ctx.whenDocSynced(id).catch(() => undefined);
    }),
  );
}

/** Create the primer (with the module's starter text), or add sections the module gained since. */
export async function startPrimer(ctx: Ctx): Promise<CampaignPrimer> {
  // a section body may already hold text on this device: load before writing starter text
  await synced(ctx, (ctx.store.meta().primer?.sections ?? []).map((s) => s.doc));
  return ensurePrimer(ctx.store, ctx.registry, ctx.module.module).primer;
}

/** What "Draft from campaign" would write, from the player projection only. */
export async function primerDraft(ctx: Ctx): Promise<PrimerDraft> {
  await synced(ctx, ctx.store.list("adventures").map((a) => a.playerIntroDoc));
  return draftPrimer({
    maps: ctx.store.toJSON(),
    module: ctx.module.module,
    doc: (id) => ctx.registry.peek(id),
    supplements: (ctx.module.manifest.supplements ?? []).map((s) => s.name),
  });
}

/** Sections a draft would overwrite that hold other text now (the GM is asked first). */
export async function draftConflicts(ctx: Ctx, draft: PrimerDraft): Promise<Array<{ id: string; title: string }>> {
  const primer = await startPrimer(ctx);
  await synced(ctx, primer.sections.map((s) => s.doc));
  return primer.sections.filter((s) => {
    const next = draft[s.id];
    if (next === undefined) return false;
    const current = toMarkdown(ctx.registry.open(s.doc)).trim();
    return current !== "" && current !== next.trim();
  });
}

/** Write a draft into the primer's sections; sections the draft does not cover are left as they are. */
export async function applyPrimerDraft(ctx: Ctx, draft: PrimerDraft): Promise<string[]> {
  const primer = await startPrimer(ctx);
  await synced(ctx, primer.sections.map((s) => s.doc));
  const written: string[] = [];
  for (const s of primer.sections) {
    const md = draft[s.id];
    if (md === undefined) continue;
    fromMarkdown(ctx.registry.open(s.doc), md);
    written.push(s.id);
  }
  ctx.store.updateMeta({ primer: { ...primer, drafted: now() } });
  return written;
}

/** The session a primer share is recorded in: session 0, else the running one, else the next planned, else the latest. */
export function primerSession(sessions: readonly Session[]): Session | undefined {
  const sorted = sortSessions(sessions);
  return (
    sorted.find((s) => s.number === 0) ??
    sorted.find((s) => s.status === "running") ??
    [...sorted].filter((s) => s.status === "planned").sort((a, b) => a.date.localeCompare(b.date) || a.number - b.number)[0] ??
    sorted[sorted.length - 1]
  );
}

/** Plan a session 0 (for a campaign with no sessions yet). */
export function planSessionZero(ctx: Pick<Ctx, "store">): Session {
  return ctx.store.createSession({ number: 0, title: "Session zero", status: "planned" });
}
