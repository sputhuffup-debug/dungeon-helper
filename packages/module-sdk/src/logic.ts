/**
 * JSONLogic evaluation (json-logic-js) with a few extra numeric and array
 * operations, plus dotted-path helpers. No eval anywhere.
 */
import jsonLogic from "json-logic-js";
import type { JsonLogicRule } from "./types";

type Apply = (rule: unknown, data?: unknown) => unknown;
type AddOperation = (name: string, fn: (...args: never[]) => unknown) => void;

const apply = (jsonLogic as unknown as { apply: Apply }).apply.bind(jsonLogic);
const addOperation = (jsonLogic as unknown as { add_operation: AddOperation }).add_operation.bind(jsonLogic);

function toNumber(v: unknown): number {
  if (typeof v === "number") return v;
  if (typeof v === "string" && v.trim() !== "") return Number(v);
  if (typeof v === "boolean") return v ? 1 : 0;
  if (v === null || v === undefined) return 0;
  return Number(v);
}

function flatten(args: unknown[]): unknown[] {
  if (args.length === 1 && Array.isArray(args[0])) return args[0] as unknown[];
  return args;
}

/** Read a dotted path (e.g. "a.b.0.c") from an object. Returns undefined when any segment is missing. */
export function getPath(obj: unknown, path: string): unknown {
  if (path === "" || path === undefined || path === null) return obj;
  let cur: unknown = obj;
  for (const seg of String(path).split(".")) {
    if (cur === null || cur === undefined) return undefined;
    if (typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[seg];
  }
  return cur;
}

/**
 * Immutable set: returns a new object with `value` placed at the dotted path.
 * Intermediate containers are created (arrays when the next segment is numeric).
 */
export function setPath<T extends Record<string, unknown>>(obj: T, path: string, value: unknown): T {
  const segs = String(path).split(".");
  const walk = (cur: unknown, i: number): unknown => {
    const seg = segs[i];
    if (seg === undefined) return value;
    const nextSeg = segs[i + 1];
    if (Array.isArray(cur)) {
      const copy = [...cur];
      const idx = Number(seg);
      copy[idx] = walk(cur[idx], i + 1);
      return copy;
    }
    const base: Record<string, unknown> = cur && typeof cur === "object" ? { ...(cur as Record<string, unknown>) } : {};
    const existing = base[seg];
    const child = existing === undefined && nextSeg !== undefined && /^\d+$/.test(nextSeg) ? [] : existing;
    base[seg] = walk(child, i + 1);
    return base;
  };
  return walk(obj, 0) as T;
}

let registered = false;
function registerOps(): void {
  if (registered) return;
  registered = true;
  addOperation("ceil", (v: unknown) => Math.ceil(toNumber(v)));
  addOperation("floor", (v: unknown) => Math.floor(toNumber(v)));
  addOperation("round", (v: unknown, digits?: unknown) => {
    const d = digits === undefined ? 0 : toNumber(digits);
    const f = 10 ** d;
    return Math.round(toNumber(v) * f) / f;
  });
  addOperation("sum", (...args: unknown[]) => flatten(args).reduce<number>((acc, v) => acc + toNumber(v), 0));
  addOperation("count", (...args: unknown[]) => {
    const list = flatten(args);
    if (args.length === 1 && args[0] !== null && typeof args[0] === "object" && !Array.isArray(args[0])) {
      return Object.keys(args[0] as object).length;
    }
    return list.length;
  });
  addOperation("has", (list: unknown, item: unknown) => {
    if (Array.isArray(list)) return list.includes(item);
    if (typeof list === "string") return list.includes(String(item));
    if (list && typeof list === "object") return Object.prototype.hasOwnProperty.call(list, String(item));
    return false;
  });
  addOperation("lookup", (obj: unknown, path: unknown, fallback?: unknown) => {
    const v = getPath(obj, String(path ?? ""));
    return v === undefined ? fallback : v;
  });
  addOperation("max", (...args: unknown[]) => {
    const list = flatten(args).map(toNumber);
    return list.length === 0 ? undefined : Math.max(...list);
  });
  addOperation("min", (...args: unknown[]) => {
    const list = flatten(args).map(toNumber);
    return list.length === 0 ? undefined : Math.min(...list);
  });
}
registerOps();

/** Evaluate a JSONLogic rule against a data context. Primitive rules evaluate to themselves. */
export function evaluateLogic<T = unknown>(rule: JsonLogicRule, data: unknown = {}): T {
  if (rule === null || typeof rule !== "object") return rule as unknown as T;
  return apply(rule, data) as T;
}

/** Evaluate a rule and coerce the result to a finite number (0 when not numeric). */
export function evaluateNumber(rule: JsonLogicRule, data: unknown = {}): number {
  const v = toNumber(evaluateLogic(rule, data));
  return Number.isFinite(v) ? v : 0;
}
