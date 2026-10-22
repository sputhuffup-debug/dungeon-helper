/** Where a roll's dice came from, for result lines: "seed …", or "entered" with the faces typed at the table. */
import { Badge } from "../../components/ui";

export function RollSource({ seed, entered }: { seed?: string; entered?: number[] }) {
  if (entered) {
    return (
      <span className="cf-muted" data-testid="roll-source-entered">
        <Badge tone="accent">entered</Badge> {entered.join(" ")}
      </span>
    );
  }
  return seed ? <span className="cf-muted">seed {seed}</span> : null;
}
