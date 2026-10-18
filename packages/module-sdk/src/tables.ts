/**
 * Table registry and roller. Rolls the table's dice expression, applies
 * modifiers from the roll context, resolves the row and fires nested rolls.
 */
import { rollDice } from "./dice";
import { evaluateLogic, evaluateNumber } from "./logic";
import type { RollRecord, RollTable, TableRegistry, TableRollOptions, TableRow, Rng } from "./types";

export function createTableRegistry(tables: RollTable[]): TableRegistry {
  const map = new Map<string, RollTable>();
  for (const t of tables) map.set(t.id, t);
  return {
    get: (id) => map.get(id),
    all: () => [...map.values()],
  };
}

/** The row whose inclusive range contains `total`, or undefined. */
export function resolveRow(table: RollTable, total: number): TableRow | undefined {
  return table.rows.find((r) => total >= r.range[0] && total <= r.range[1]);
}

/** Nearest row by distance to its range; used when a total falls outside all rows. */
function nearestRow(table: RollTable, total: number): TableRow | undefined {
  let best: TableRow | undefined;
  let bestDist = Infinity;
  for (const r of table.rows) {
    const dist = total < r.range[0] ? r.range[0] - total : total > r.range[1] ? total - r.range[1] : 0;
    if (dist < bestDist) {
      best = r;
      bestDist = dist;
    }
  }
  return best;
}

/** Sum of the table's applicable modifiers for the given context. */
export function tableModifierTotal(table: RollTable, context: Record<string, unknown>): number {
  let sum = 0;
  for (const m of table.modifiers ?? []) {
    if (m.when !== undefined && !evaluateLogic(m.when, context)) continue;
    sum += typeof m.add === "number" ? m.add : evaluateNumber(m.add, context);
  }
  return sum;
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

/**
 * Roll on a table. Deterministic for a given (table, rng state, options).
 * Nested rolls use `rng.fork(table.id + ":" + as + ":" + i)` so they never
 * disturb the parent stream.
 */
export function rollTable(table: RollTable, rng: Rng, registry: TableRegistry, options: TableRollOptions = {}): RollRecord {
  if (table.rows.length === 0) throw new Error(`Table "${table.id}" has no rows`);
  const context = options.context ?? {};
  const step = options.step ?? table.id;
  const { raw, total: base } = rollDice(table.dice, rng);
  const modifier = tableModifierTotal(table, context) + (options.extraModifier ?? 0);
  const total = base + modifier;

  let row = resolveRow(table, total);
  let rowLabel = row?.label;
  if (!row) {
    row = nearestRow(table, total);
    if (!row) throw new Error(`Table "${table.id}" has no row for total ${total}`);
    rowLabel = row.label ? `${row.label} (clamped)` : "clamped";
  }

  const nested: RollRecord[] = [];
  let result: unknown = row.result;
  if (row.roll && row.roll.length > 0) {
    const merged: Record<string, unknown> = typeof row.result === "string" ? { value: row.result } : { ...row.result };
    for (const nr of row.roll) {
      const child = registry.get(nr.table);
      if (!child) throw new Error(`Table "${table.id}" nests unknown table "${nr.table}"`);
      let times = 1;
      if (typeof nr.times === "number") times = Math.max(0, Math.floor(nr.times));
      else if (typeof nr.times === "string") times = Math.max(0, rollDice(nr.times, rng.fork(`${table.id}:${nr.as}:times`)).total);
      const values: unknown[] = [];
      for (let i = 0; i < times; i++) {
        const rec = rollTable(child, rng.fork(`${table.id}:${nr.as}:${i}`), registry, {
          context,
          step: `${step}/${nr.as}`,
          iteration: nr.times === undefined ? undefined : i,
        });
        nested.push(rec);
        values.push(rec.result);
      }
      merged[nr.as] = nr.times === undefined ? values[0] : values;
    }
    result = merged;
  } else if (isPlainObject(row.result)) {
    result = { ...row.result };
  }

  const record: RollRecord = {
    step,
    table: table.id,
    dice: table.dice,
    raw,
    modifier,
    total,
    result,
  };
  if (options.iteration !== undefined) record.iteration = options.iteration;
  if (rowLabel !== undefined) record.rowLabel = rowLabel;
  if (nested.length > 0) record.nested = nested;
  const page = row.page ?? table.page;
  if (page !== undefined) record.page = page;
  return record;
}
