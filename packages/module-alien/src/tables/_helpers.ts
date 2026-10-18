/**
 * Small builders shared by the Alien table families. Every table built here
 * is flagged `unverified: true` (rows come from general knowledge of the game,
 * not from the book) and carries its family for the reference browser.
 */
import type { NestedRoll, PageRef, RollTable, TableRow } from "@campaign-forge/module-sdk";

/** The 36 d66 values in order: 11..16, 21..26, ..., 61..66. */
export const D66_VALUES: readonly number[] = (() => {
  const out: number[] = [];
  for (let t = 1; t <= 6; t++) for (let u = 1; u <= 6; u++) out.push(t * 10 + u);
  return out;
})();

export const D6_VALUES: readonly number[] = [1, 2, 3, 4, 5, 6];

export interface RowSpec {
  label: string;
  /** Extra structured result fields; `label` is always included in the result. */
  result?: Record<string, unknown>;
  roll?: NestedRoll[];
  gmDecides?: boolean;
  page?: PageRef;
  unverified?: boolean;
}

/** Build one row. The structured result always carries the label. */
export function row(range: [number, number], label: string, result: Record<string, unknown> = {}, extra: Omit<RowSpec, "label" | "result"> = {}): TableRow {
  const r: TableRow = { range, label, result: { label, ...result } };
  if (extra.roll) r.roll = extra.roll;
  if (extra.gmDecides) r.gmDecides = true;
  if (extra.page !== undefined) r.page = extra.page;
  if (extra.unverified) r.unverified = true;
  return r;
}

/** One row per value, in order. Throws when the spec count does not match the die. */
export function sequence(values: readonly number[], specs: readonly RowSpec[]): TableRow[] {
  if (specs.length !== values.length) {
    throw new Error(`Expected ${values.length} row specs, got ${specs.length} (first: "${specs[0]?.label ?? "?"}")`);
  }
  return specs.map((s, i) => {
    const v = values[i]!;
    const { label, result, ...extra } = s;
    return row([v, v], label, result ?? {}, extra);
  });
}

/** Rows that each span `span` consecutive d66 values (span must divide 36). */
export function d66Grouped(span: number, specs: readonly RowSpec[]): TableRow[] {
  if (36 % span !== 0) throw new Error(`d66 span ${span} does not divide 36`);
  const expected = 36 / span;
  if (specs.length !== expected) throw new Error(`Expected ${expected} row specs for d66 span ${span}, got ${specs.length}`);
  return specs.map((s, i) => {
    const lo = D66_VALUES[i * span]!;
    const hi = D66_VALUES[i * span + span - 1]!;
    const { label, result, ...extra } = s;
    return row([lo, hi], label, result ?? {}, extra);
  });
}

export const d6 = (specs: readonly RowSpec[]): TableRow[] => sequence(D6_VALUES, specs);
export const d66 = (specs: readonly RowSpec[]): TableRow[] => sequence(D66_VALUES, specs);

/** Row specs whose result stores the label under `key`. */
export function labelled(key: string, labels: readonly string[]): RowSpec[] {
  return labels.map((l) => ({ label: l, result: { [key]: l } }));
}

/** Inclusive 2d6-style rows: [[lo, hi, label, result?], ...]. */
export type RangeSpec = [number, number, string, Record<string, unknown>?, Omit<RowSpec, "label" | "result">?];
export function ranges(specs: readonly RangeSpec[]): TableRow[] {
  return specs.map(([lo, hi, label, result, extra]) => row([lo, hi], label, result ?? {}, extra ?? {}));
}

export interface TableSpec extends Omit<RollTable, "unverified" | "family"> {
  family: string;
}

/** Define a table: sets `unverified: true` on the table and on every row. */
export function defineTable(spec: TableSpec): RollTable {
  return { ...spec, rows: spec.rows.map((r) => ({ ...r, unverified: true })), unverified: true };
}
