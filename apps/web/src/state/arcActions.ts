/**
 * Campaign arcs in the app: thin wrappers over core's arcs.ts that read the
 * module's `arcs` definition (threads, clues, clocks, faction heat, crew
 * notes and contacts). Nothing here knows what game it is.
 */
import {
  arcsDefFor,
  arcsSnapshot,
  crewNotes,
  memberViewer,
  type ArcThread,
  type CampaignStore,
  type CrewNotes,
  type Id,
  type Session,
} from "@campaign-forge/core";
import type { ArcSnapshot, ArcsDef, LoadedModule, PlayModeId } from "@campaign-forge/module-sdk";
import type { CampaignContextValue } from "./CampaignProvider";

type Ctx = Pick<CampaignContextValue, "store" | "module">;

/** The module's arcs, when they apply in the campaign's play mode. */
export function arcsDefOf(module: Pick<LoadedModule, "module">, mode: PlayModeId): ArcsDef | undefined {
  return arcsDefFor(module.module, mode);
}

/** The GM's default choices for a board: seed a clue automatically when there is one to seed; let the arcs weight the board. */
export function defaultArcChoices(store: CampaignStore): { seedClue: string; influence: boolean } {
  const unseen = store.list("arcs").some((t) => t.status === "active" && t.stages.some((s) => s.clues.some((c) => c.state === "unseen")));
  return { seedClue: unseen ? "auto" : "none", influence: true };
}

/** The arcs as a procedure input (`x-arcs`), with the GM's choices. */
export function arcsInput(ctx: Ctx, choices: { seedClue?: string; influence?: boolean } = defaultArcChoices(ctx.store)): ArcSnapshot {
  return arcsSnapshot(ctx.store.toJSON(), ctx.module.module, choices);
}

/** The session clues found now belong to: the running one, else the latest. */
export function currentSession(store: CampaignStore): Session | undefined {
  const sessions = [...store.list("sessions")].sort((a, b) => b.number - a.number);
  return sessions.find((s) => s.status === "running") ?? sessions[0];
}

/** Sessions, newest first, for "found in". */
export function sessionsNewestFirst(store: CampaignStore): Session[] {
  return [...store.list("sessions")].sort((a, b) => b.number - a.number);
}

/** Crew notes for the group (no member) or one player. */
export function crewNotesFor(ctx: Ctx, memberId?: Id): CrewNotes {
  const maps = ctx.store.toJSON();
  return crewNotes(maps, ctx.module.module, memberId ? memberViewer(maps, memberId) : { role: "player" });
}

/** Jobs a wrap-up asks about: jobs with clues in them, else jobs accepted or under way, newest first. */
export function recentJobs(ctx: Ctx): Array<{ id: Id; name: string }> {
  const jobs = ctx.store
    .list("entities")
    .filter((e) => ctx.module.entityType(e.type)?.kind === "job" && ["accepted", "active", "done", "offered"].includes(String(e.fields.status ?? "")))
    .sort((a, b) => b.updated.localeCompare(a.updated));
  return jobs.map((j) => ({ id: j.id, name: j.name }));
}

/** "4/8". */
export const clockText = (t: Pick<ArcThread, "clock">) => `${t.clock.filled}/${t.clock.segments}`;
