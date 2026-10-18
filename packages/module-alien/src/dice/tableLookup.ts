import { resolveRow, rollDice, rollTable } from "@campaign-forge/module-sdk";
import type { RollRecord, RollTable, Rng, TableRegistry, TableRow } from "@campaign-forge/module-sdk";

export { resolveRow as findRow };

/** Roll a plain dice expression (delegates to the sdk parser/roller). */
export function rollExpression(rng: Rng, expr: string): { raw: number[]; total: number } {
  return rollDice(expr, rng);
}

export interface TableRollOutcome {
  record: RollRecord;
  row?: TableRow;
  table?: RollTable;
}

export interface RollOnTableOptions {
  step: string;
  /** Roll context the table's modifiers read (e.g. { stress, resolve }). */
  context?: Record<string, unknown>;
  /** Extra flat modifier chosen by the GM. */
  extraModifier?: number;
  /** Used only when the table is not in the registry: dice expression and flat modifier. */
  fallbackDice?: string;
  fallbackModifier?: number;
}

/**
 * Roll on a registered table through the sdk's `rollTable` (modifiers, nested rolls,
 * clamping). When the registry does not hold the table (the `tables/` folder belongs to
 * another agent and may lag behind), the roll is still made deterministically with the
 * fallback dice and the record says the table was not loaded.
 */
export function rollOnTable(tables: TableRegistry, tableId: string, rng: Rng, opts: RollOnTableOptions): TableRollOutcome {
  const table = tables.get(tableId);
  if (table) {
    const record = rollTable(table, rng, tables, {
      step: opts.step,
      context: opts.context ?? {},
      extraModifier: opts.extraModifier ?? 0,
    });
    return { record, row: resolveRow(table, record.total), table };
  }
  const expr = opts.fallbackDice ?? "1d6";
  const { raw, total: rawTotal } = rollDice(expr, rng);
  const modifier = (opts.fallbackModifier ?? 0) + (opts.extraModifier ?? 0);
  const total = rawTotal + modifier;
  const record: RollRecord = {
    step: opts.step,
    table: tableId,
    dice: expr,
    raw,
    modifier,
    total,
    rowLabel: `table ${tableId} not loaded`,
    result: null,
  };
  return { record };
}
