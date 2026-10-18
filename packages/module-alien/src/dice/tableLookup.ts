import type { RollRecord, RollTable, Rng, TableRegistry, TableRow } from "@campaign-forge/module-sdk";

/**
 * Minimal table roller used by the dice operations.
 *
 * TODO(orchestrator): the sdk is growing a `rollTable(table, rng, options)` helper
 * (packages/module-sdk). When it lands, replace `rollOnTable` with it so modifiers and
 * nested rolls are handled by the shared code path. Until then this covers the plain
 * "d6"/"2d6"/"d66" + flat modifier shapes the character tables use.
 */
export function rollExpression(rng: Rng, expr: string): { raw: number[]; total: number } {
  const e = expr.trim().toLowerCase();
  if (e === "d66") {
    const tens = rng.int(1, 6);
    const units = rng.int(1, 6);
    return { raw: [tens, units], total: tens * 10 + units };
  }
  const m = /^(\d*)d(\d+)([+-]\d+)?$/.exec(e);
  if (!m) throw new Error(`Unsupported dice expression: ${expr}`);
  const count = m[1] ? Number(m[1]) : 1;
  const faces = Number(m[2]);
  const flat = m[3] ? Number(m[3]) : 0;
  const raw: number[] = [];
  for (let n = 0; n < count; n++) raw.push(rng.int(1, faces));
  return { raw, total: raw.reduce((a, b) => a + b, 0) + flat };
}

export function findRow(table: RollTable, total: number): TableRow | undefined {
  return table.rows.find((r) => total >= r.range[0] && total <= r.range[1]);
}

export function rowLabel(row: TableRow | undefined): string | undefined {
  if (!row) return undefined;
  if (row.label) return row.label;
  if (typeof row.result === "string") return row.result;
  const r = row.result as Record<string, unknown>;
  const l = r.label ?? r.name ?? r.title;
  return typeof l === "string" ? l : undefined;
}

export interface TableRollOutcome {
  record: RollRecord;
  row?: TableRow;
  table?: RollTable;
}

/**
 * Roll `dice` (or the table's own expression), add `modifier`, and look the total up in
 * the table. When the registry does not hold the table yet (the tables folder is written
 * by another agent) the roll is still made deterministically and the result is flagged.
 */
export function rollOnTable(
  tables: TableRegistry,
  tableId: string,
  rng: Rng,
  opts: { step: string; dice?: string; modifier?: number },
): TableRollOutcome {
  const table = tables.get(tableId);
  const expr = opts.dice ?? table?.dice ?? "d6";
  const { raw, total: rawTotal } = rollExpression(rng, expr);
  const modifier = opts.modifier ?? 0;
  const total = rawTotal + modifier;
  const row = table ? findRow(table, total) : undefined;
  const record: RollRecord = {
    step: opts.step,
    table: tableId,
    dice: expr,
    raw,
    modifier,
    total,
    rowLabel: rowLabel(row) ?? (table ? undefined : `table ${tableId} not loaded`),
    result: row?.result ?? null,
    ...(table?.page !== undefined ? { page: table.page } : {}),
  };
  return { record, row, table };
}
