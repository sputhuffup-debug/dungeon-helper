/** Small typed accessors shared by the Alien procedures. */
import type { ProcedureContext } from "@campaign-forge/module-sdk";

export type Obj = Record<string, unknown>;

export function isObj(v: unknown): v is Obj {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

/** A step's result as an object (empty object when missing or not an object). */
export function obj(ctx: ProcedureContext, stepId: string): Obj {
  const v = ctx.get(stepId);
  return isObj(v) ? v : {};
}

/** A repeated step's results as an array of objects. */
export function list(ctx: ProcedureContext, stepId: string): Obj[] {
  const v = ctx.get(stepId);
  if (Array.isArray(v)) return v.filter(isObj);
  return isObj(v) ? [v] : [];
}

export function str(v: unknown, fallback = ""): string {
  return typeof v === "string" ? v : typeof v === "number" ? String(v) : fallback;
}

export function num(v: unknown, fallback = 0): number {
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}

export function bool(v: unknown, fallback = false): boolean {
  return typeof v === "boolean" ? v : fallback;
}

export function input<T = unknown>(ctx: ProcedureContext, key: string): T | undefined {
  return ctx.inputs[key] as T | undefined;
}

export function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

/** Frame id (field doc) -> table family key. */
export const FRAME_KEY: Record<string, "truckers" | "marines" | "colonists"> = {
  "space-truckers": "truckers",
  "colonial-marines": "marines",
  "frontier-colonists": "colonists",
};

export function frameKey(ctx: ProcedureContext): "truckers" | "marines" | "colonists" {
  const frame = str(input(ctx, "frame"), "space-truckers");
  return FRAME_KEY[frame] ?? "truckers";
}
