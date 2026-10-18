import { useState } from "react";
import { Badge } from "../primitives/Badge";
import { Button, IconButton } from "../primitives/Button";
import { asNumber, cx, isRecord, newId } from "../sheet/paths";
import { TrackerFrame } from "./TrackerFrame";
import { stateRecord, type TrackerProps } from "./types";

export interface Countdown {
  id: string;
  name: string;
  remaining: number;
  total: number;
  unit?: string;
}

export function countdowns(state: unknown): Countdown[] {
  const raw = stateRecord(state).countdowns;
  if (!Array.isArray(raw)) return [];
  return raw.filter(isRecord).map((c) => ({
    id: String(c.id ?? newId("cd")),
    name: String(c.name ?? "Countdown"),
    remaining: asNumber(c.remaining, 0),
    total: asNumber(c.total, asNumber(c.remaining, 0)),
    unit: typeof c.unit === "string" ? c.unit : undefined,
  }));
}

/** Named countdowns ticking toward zero, in a configurable unit. */
export function CountdownTracker({ def, state, onChange, onLog, readonly, className }: TrackerProps) {
  const list = countdowns(state);
  const unit = typeof def.config?.unit === "string" ? def.config.unit : "turns";
  const [name, setName] = useState("");
  const [count, setCount] = useState(typeof def.config?.default === "number" ? def.config.default : 6);
  const commit = (next: Countdown[]) => onChange({ ...stateRecord(state), countdowns: next });

  const add = () => {
    const n = name.trim() || `Countdown ${list.length + 1}`;
    commit([...list, { id: newId("cd"), name: n, remaining: count, total: count, unit }]);
    onLog?.(`Countdown "${n}" started: ${count} ${unit}`);
    setName("");
  };
  const tick = (id: string, by: number) => {
    const next = list.map((c) => (c.id === id ? { ...c, remaining: Math.max(0, Math.min(c.total, c.remaining + by)) } : c));
    commit(next);
    const c = next.find((x) => x.id === id);
    if (c) onLog?.(c.remaining === 0 ? `Countdown "${c.name}" reached zero` : `Countdown "${c.name}": ${c.remaining} ${c.unit ?? unit} left`);
  };
  const reset = (id: string) => commit(list.map((c) => (c.id === id ? { ...c, remaining: c.total } : c)));
  const remove = (id: string) => commit(list.filter((c) => c.id !== id));

  return (
    <TrackerFrame def={def} className={className}>
      {list.length === 0 && <span className="cf-muted">No countdowns</span>}
      {list.map((c) => (
        <div key={c.id} className={cx("cf-tracker__row", c.remaining === 0 && "cf-tracker__row--danger", c.remaining > 0 && c.remaining <= 2 && "cf-tracker__row--warn")} data-countdown={c.id}>
          <span className="cf-tracker__name">{c.name}</span>
          <span className="cf-tracker__num" data-testid={`countdown-${c.id}`}>
            {c.remaining}
          </span>
          <span className="cf-muted">
            / {c.total} {c.unit ?? unit}
          </span>
          {c.remaining === 0 && <Badge tone="danger">Triggered</Badge>}
          {!readonly && (
            <>
              <Button size="sm" variant="primary" onClick={() => tick(c.id, -1)} disabled={c.remaining === 0} aria-label={`Tick ${c.name}`}>
                Tick
              </Button>
              <Button size="sm" variant="ghost" onClick={() => tick(c.id, 1)} disabled={c.remaining >= c.total} aria-label={`Undo tick ${c.name}`}>
                +1
              </Button>
              <Button size="sm" variant="ghost" onClick={() => reset(c.id)}>
                Reset
              </Button>
              <IconButton size="sm" variant="ghost" label={`Remove ${c.name}`} icon="×" onClick={() => remove(c.id)} />
            </>
          )}
        </div>
      ))}
      {!readonly && (
        <div className="cf-tracker__add">
          <input className="cf-input" aria-label="Countdown name" placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} />
          <input className="cf-input" type="number" min={1} aria-label={`Count in ${unit}`} value={count} onChange={(e) => setCount(Math.max(1, Number(e.target.value)))} style={{ maxWidth: 90 }} />
          <Button size="sm" onClick={add}>
            Add
          </Button>
        </div>
      )}
    </TrackerFrame>
  );
}
