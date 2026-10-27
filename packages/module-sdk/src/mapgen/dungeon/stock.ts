/**
 * Dressing and stocking a dungeon from the module's own content: room
 * purposes and dressing from its tables, encounters from its encounter
 * tables and creature presets, traps from its tables or hazard presets,
 * treasure from its reference lists. Every rule is the pack's JSONLogic.
 */
import { rollDice } from "../../dice";
import { evaluateLogic, getPath } from "../../logic";
import { rollTable } from "../../tables";
import type { EntityPreset, GameModule, JsonLogicRule, ReferenceItem, Rng, TableRegistry } from "../../types";
import type { DungeonPick } from "../types";

export type Ctx = Record<string, unknown>;

/** What the engine reads from the module (bound when the generator is made). */
export interface ModuleContent {
  presets: GameModule["presets"];
  referenceLists: GameModule["referenceLists"];
}

export interface Picked {
  result?: unknown;
  /** The row label the table rolled. */
  label?: string | undefined;
  preset?: EntityPreset | undefined;
  item?: (ReferenceItem & { list: string }) | undefined;
}

/** Evaluate a rule; undefined, null and errors give `fallback`. */
export function rule<T = unknown>(r: JsonLogicRule | undefined, data: Ctx, fallback?: T): T | undefined {
  if (r === undefined) return fallback;
  try {
    const v = evaluateLogic<T>(r, data);
    return v === undefined || v === null ? fallback : v;
  } catch {
    return fallback;
  }
}

export function text(v: unknown): string {
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  return "";
}

export function num(v: unknown, fallback = 0): number {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : NaN;
  return Number.isFinite(n) ? n : fallback;
}

const truthy = (v: unknown) => (Array.isArray(v) ? v.length > 0 : !!v);

/** Roll a table by id (string or JSONLogic); undefined when it does not exist. */
export function rollById(tables: TableRegistry, id: JsonLogicRule | undefined, data: Ctx, rng: Rng): { result: unknown; label: string | undefined; table: string } | undefined {
  if (id === undefined) return undefined;
  const tid = typeof id === "string" ? id : text(rule(id, data));
  const table = tid ? tables.get(tid) : undefined;
  if (!table) return undefined;
  const rec = rollTable(table, rng, tables, { context: data });
  return { result: rec.result, label: rec.rowLabel, table: tid };
}

/** The text a dressing row reads as: its `text`, else its `name`, else the row label. */
export function rowText(r: { result: unknown; label: string | undefined } | undefined): string {
  if (!r) return "";
  const res = r.result as Record<string, unknown> | string | undefined;
  if (typeof res === "string") return res;
  return text(res?.text) || text(res?.name) || text(r.label);
}

/**
 * Candidates for a pick: presets of a type or items of lists, cached per
 * source. The cache lives with the generator (one module).
 */
export class Content {
  private presetsByType = new Map<string, EntityPreset[]>();
  private items = new Map<string, Array<ReferenceItem & { list: string }>>();
  private presetIndex: Map<string, EntityPreset>;
  constructor(private readonly m: ModuleContent) {
    this.presetIndex = new Map(m.presets.map((p) => [p.id, p]));
  }
  preset(id: string): EntityPreset | undefined {
    return this.presetIndex.get(id);
  }
  presetsOf(type: string): EntityPreset[] {
    let list = this.presetsByType.get(type);
    if (!list) this.presetsByType.set(type, (list = this.m.presets.filter((p) => p.entityType === type)));
    return list;
  }
  itemsOf(lists: string[]): Array<ReferenceItem & { list: string }> {
    const key = lists.join("|");
    let out = this.items.get(key);
    if (!out) {
      out = [];
      for (const id of lists) for (const it of this.m.referenceLists.find((l) => l.id === id)?.items ?? []) out.push({ ...it, list: id });
      this.items.set(key, out);
    }
    return out;
  }
  item(lists: string[] | undefined, id: string): (ReferenceItem & { list: string }) | undefined {
    if (lists?.length) return this.itemsOf(lists).find((i) => i.id === id);
    for (const l of this.m.referenceLists) {
      const it = l.items.find((i) => i.id === id);
      if (it) return { ...it, list: l.id };
    }
    return undefined;
  }
}

/** Pick one thing as a `DungeonPick` says: roll its table, then take or choose a preset or list item. */
export function pick(spec: DungeonPick, ctx: Ctx, rng: Rng, tables: TableRegistry, content: Content, extra: Ctx = {}): Picked | undefined {
  const out: Picked = {};
  let data: Ctx = { ...ctx, ...extra };
  if (spec.table !== undefined) {
    const r = rollById(tables, spec.table, data, rng.fork("table"));
    if (!r) return undefined;
    out.result = r.result;
    out.label = r.label;
    data = { ...data, result: r.result, label: r.label };
  }
  if (spec.id !== undefined) {
    const id = text(rule(spec.id, data));
    if (id) {
      if (spec.lists) out.item = content.item(spec.lists, id);
      else out.preset = content.preset(id) ?? undefined;
      if (!out.preset && !out.item && !spec.presets) out.item = content.item(undefined, id);
      if (out.preset || out.item) return out;
    }
  }
  if (spec.presets === undefined && spec.lists === undefined) return out.result !== undefined ? out : undefined;
  const match = Object.entries(spec.match ?? {}).map(([path, r]) => [path, rule(r, data)] as const);
  const asPreset = spec.presets !== undefined;
  const pool: Array<EntityPreset | (ReferenceItem & { list: string })> = asPreset ? content.presetsOf(spec.presets!) : content.itemsOf(spec.lists!);
  const key = asPreset ? "preset" : "item";
  const ok = pool.filter((c) => {
    for (const [path, want] of match) if (getPath(c, path) !== want) return false;
    return spec.where === undefined || truthy(rule(spec.where, { ...data, [key]: c }));
  });
  if (ok.length === 0) return undefined;
  const fit = spec.fits === undefined ? [] : ok.filter((c) => truthy(rule(spec.fits, { ...data, [key]: c })));
  const from = fit.length > 0 ? fit : ok;
  const chosen = from[rng.int(0, from.length - 1)]!;
  if (asPreset) out.preset = chosen as EntityPreset;
  else out.item = chosen as ReferenceItem & { list: string };
  return out;
}

/** Roll a dice expression (or take a number) for coins; 0 when it is neither. */
export function rollAmount(v: unknown, rng: Rng): number {
  if (typeof v === "number") return Math.max(0, Math.round(v));
  if (typeof v !== "string" || !v.trim()) return 0;
  try {
    return Math.max(0, rollDice(v.trim(), rng).total);
  } catch {
    return 0;
  }
}

/** A share of a list, at least `min`, chosen at random (order kept). */
export function chooseShare<T>(rng: Rng, items: T[], share: number, min = 0): T[] {
  const n = Math.min(items.length, Math.max(min, Math.round(items.length * Math.max(0, Math.min(1, share)))));
  const idx = items.map((_, i) => i);
  for (let i = idx.length - 1; i > 0; i--) {
    const j = rng.int(0, i);
    [idx[i], idx[j]] = [idx[j]!, idx[i]!];
  }
  const keep = new Set(idx.slice(0, n));
  return items.filter((_, i) => keep.has(i));
}
