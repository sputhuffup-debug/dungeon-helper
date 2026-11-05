/**
 * Where a roll's dice came from, for result lines: "in-app roll" (its seed
 * kept in the tooltip, for whoever wants to replay it), or "entered" with the
 * faces typed at the table.
 */
import { Badge } from "../../components/ui";

export function RollSource({ seed, entered }: { seed?: string; entered?: number[] }) {
  if (entered) {
    return (
      <span className="cf-muted" data-testid="roll-source-entered">
        <Badge tone="accent">entered</Badge> {entered.join(" ")}
      </span>
    );
  }
  return seed ? (
    <span className="cf-muted" title={`Seed ${seed}`} data-testid="roll-source-seed">
      in-app roll
    </span>
  ) : null;
}
