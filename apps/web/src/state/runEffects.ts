/**
 * Accepting a run that creates nothing but carries effects (shore leave,
 * between jobs) applies them in the same step: the effects the GM left
 * ticked, never one the ledger already holds (a job's pay collected from its
 * page), and, for the arcs' between-jobs procedure, the thread clocks.
 * Nothing here knows what game it is.
 */
import { applyArcTicks, applyEffects, ledgerEntryByKey, planArcTicks, type ApplyEffectsResult, type CampaignStore, type ClockMove, type Id } from "@campaign-forge/core";
import type { ArcsDef, Effect } from "@campaign-forge/module-sdk";
import type { CampaignContextValue } from "./CampaignProvider";
import { effectContext } from "./tableActions";

type Ctx = Pick<CampaignContextValue, "store" | "module">;

const EFFECT_KINDS = ["setField", "incrementField", "addCondition", "removeCondition", "log", "prompt", "ledger"];

export function isEffect(v: unknown): v is Effect {
  return typeof v === "object" && v !== null && typeof (v as { kind?: unknown }).kind === "string" && EFFECT_KINDS.includes((v as { kind: string }).kind);
}

/** Effects found in a run's results (`results.effects`). */
export function effectsOf(results: Record<string, unknown>): Effect[] {
  const raw = results.effects;
  return Array.isArray(raw) ? raw.filter(isEffect) : [];
}

/** The effects a run would apply (prompts aside), each with its index in `results.effects`. */
export function plainEffectsOf(results: Record<string, unknown>): Array<{ e: Effect; i: number }> {
  return effectsOf(results)
    .map((e, i) => ({ e, i }))
    .filter((x) => x.e.kind !== "prompt");
}

/** A ledger posting the ledger already holds (same key, e.g. a job's pay collected from its page): applying it again would be skipped. */
export function alreadyPosted(store: CampaignStore, e: Effect): boolean {
  return e.kind === "ledger" && !!e.key && !!ledgerEntryByKey(store, e.key);
}

/** The effects accepting would apply: ticked, and not already on the ledger. */
export function effectsToApply(store: CampaignStore, results: Record<string, unknown>, unticked: Iterable<number> = []): Array<{ e: Effect; i: number }> {
  const off = new Set(unticked);
  return plainEffectsOf(results).filter((x) => !off.has(x.i) && !alreadyPosted(store, x.e));
}

export interface RunEffectsResult {
  /** Indices (in `results.effects`) of the effects applied. */
  applied: number[];
  result?: ApplyEffectsResult;
  /** Thread clocks moved with the run. */
  moved?: ClockMove[];
}

/** One step after accepting a run: its ticked effects applied (logged against the run) and, when given, the thread clocks moved. */
export function applyRunEffects(ctx: Ctx, run: { id: Id; results: Record<string, unknown> }, opts: { unticked?: Iterable<number>; clocks?: { def: ArcsDef; seed: string } } = {}): RunEffectsResult {
  return ctx.store.transact(() => {
    const chosen = effectsToApply(ctx.store, run.results, opts.unticked);
    const sessions = [...ctx.store.list("sessions")].sort((a, b) => b.number - a.number);
    const session = sessions.find((s) => s.status === "running") ?? sessions[0];
    const out: RunEffectsResult = { applied: chosen.map((x) => x.i) };
    if (chosen.length) out.result = applyEffects(ctx.store, chosen.map((x) => x.e), { ...effectContext(ctx, undefined), ledgerSource: { kind: "procedure" as const, id: run.id } });
    if (opts.clocks?.def.tick) {
      const plan = planArcTicks({ arcs: Object.fromEntries(ctx.store.list("arcs").map((t) => [t.id, t])) }, opts.clocks.def, opts.clocks.seed);
      out.moved = plan.length ? applyArcTicks(ctx.store, plan, { ...(session ? { session: session.id } : {}), note: "Between jobs" }) : [];
    }
    return out;
  });
}
