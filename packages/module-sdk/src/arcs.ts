/**
 * Campaign arcs: small pure helpers over a module's `ArcsDef` that both the
 * core engine and modules use (labels, the heat scale, the between-jobs tick
 * of a thread clock). Nothing here names a game.
 */
import { rollDice } from "./dice";
import { createRng } from "./rng";
import type { ArcsDef, ContactStance } from "./types";

/** The highest heat a faction can reach (one label per level from 0). */
export function heatMax(def: Pick<ArcsDef, "heat"> | undefined): number {
  return Math.max(0, (def?.heat?.labels.length ?? 1) - 1);
}

/** A heat value clamped to the module's scale. */
export function clampHeat(def: Pick<ArcsDef, "heat"> | undefined, value: number): number {
  return Math.max(0, Math.min(heatMax(def), Math.round(Number.isFinite(value) ? value : 0)));
}

/** The label of a heat level ("Unnoticed" ... "Hunted"). */
export function heatLabel(def: Pick<ArcsDef, "heat"> | undefined, value: number): string {
  const labels = def?.heat?.labels ?? [];
  return labels[clampHeat(def, value)] ?? String(value);
}

export function clueKindLabel(def: Pick<ArcsDef, "clueKinds"> | undefined, kind: string): string {
  return def?.clueKinds.find((k) => k.id === kind)?.label ?? kind;
}

export function slotLabel(def: Pick<ArcsDef, "slots"> | undefined, slot: string | undefined): string | undefined {
  if (!slot) return undefined;
  return def?.slots?.find((s) => s.id === slot)?.label ?? slot;
}

export function payoffLabel(def: Pick<ArcsDef, "payoffs"> | undefined, kind: string): string {
  return def?.payoffs?.find((p) => p.id === kind)?.label ?? kind;
}

export const STANCE_LABELS: Record<ContactStance, string> = { friendly: "Friendly", neutral: "Neutral", wary: "Wary", hostile: "Hostile" };

/** The result of rolling one thread clock between jobs. */
export interface ArcTickRoll {
  dice: string;
  faces: number[];
  total: number;
  /** Segments from the roll (the highest step reached). */
  ticks: number;
  /** Extra segments because the thread was ignored. */
  ignored: number;
  /** The step's label, when it has one. */
  label?: string;
  seed: string;
}

/** Segments a roll total gives: the step with the highest `min` the total reaches (0 below every step). */
export function ticksForTotal(def: Pick<ArcsDef, "tick">, total: number): { ticks: number; label?: string } {
  const steps = [...(def.tick?.steps ?? [])].sort((a, b) => b.min - a.min);
  const step = steps.find((s) => total >= s.min);
  return step ? { ticks: step.ticks, ...(step.label ? { label: step.label } : {}) } : { ticks: 0 };
}

/**
 * Roll one thread's clock tick: the module's dice from `seed`, the segments
 * the total gives, plus the module's extra for an ignored thread. Same seed,
 * same tick.
 */
export function rollArcTick(def: Pick<ArcsDef, "tick">, seed: string, ignored: boolean): ArcTickRoll | undefined {
  const tick = def.tick;
  if (!tick) return undefined;
  const { raw, total } = rollDice(tick.dice, createRng(seed));
  const t = ticksForTotal(def, total);
  return { dice: tick.dice, faces: raw, total, ticks: t.ticks, ignored: ignored ? tick.ignored : 0, ...(t.label ? { label: t.label } : {}), seed };
}
