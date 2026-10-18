import type { DicePool } from "@campaign-forge/module-sdk";
import { isRecord } from "../sheet/paths";
import type { WidgetProps } from "./types";

export function asDicePool(value: unknown): DicePool | undefined {
  if (!isRecord(value) || !isRecord(value.dice)) return undefined;
  return value as unknown as DicePool;
}

/** Read-only breakdown of a dice pool. */
export function DicePoolView({ pool }: { pool: DicePool }) {
  const total = Object.values(pool.dice).reduce((a, b) => a + (b ?? 0), 0);
  const parts = pool.breakdown && pool.breakdown.length > 0 ? pool.breakdown : Object.entries(pool.dice).map(([die, count]) => ({ label: die, die, count }));
  return (
    <div className="cf-dicepool" data-testid="dicepool">
      {parts
        .filter((p) => p.count !== 0)
        .map((p, i) => (
          <span key={`${p.label}-${i}`} className="cf-dicepool__part" title={p.die}>
            <span>{p.label}</span>
            <span>{p.count > 0 ? `+${p.count}` : p.count}</span>
          </span>
        ))}
      <span className="cf-dicepool__total">= {total}</span>
    </div>
  );
}

export function DicePoolField({ value, computed, field }: WidgetProps) {
  const key = typeof field.config?.computed === "string" ? field.config.computed : undefined;
  const pool = asDicePool(value) ?? (key ? asDicePool(computed[key]) : undefined);
  if (!pool) return <span className="cf-muted">No pool</span>;
  return <DicePoolView pool={pool} />;
}
