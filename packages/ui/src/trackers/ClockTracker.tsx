import { Button } from "../primitives/Button";
import { pushToast } from "../primitives/Toast";
import { asNumber, isRecord } from "../sheet/paths";
import { TrackerFrame } from "./TrackerFrame";
import { stateRecord, type TrackerProps } from "./types";

export interface ClockUnit {
  id: string;
  name: string;
  /** Human duration, e.g. "5–10 seconds". */
  duration?: string;
  /** Approximate minutes per unit, for the elapsed display. */
  minutes?: number;
  /** How many of the previous (smaller) unit make one of these; rolls the smaller counter over when set. */
  per?: number;
}

export interface ClockState {
  counters: Record<string, number>;
}

const DEFAULT_UNITS: ClockUnit[] = [
  { id: "round", name: "Round", duration: "5–10 s", minutes: 0.1 },
  { id: "stretch", name: "Stretch", duration: "5–10 min", minutes: 7.5 },
  { id: "shift", name: "Shift", duration: "5–10 h", minutes: 450 },
];

export function clockUnits(config: Record<string, unknown> | undefined): ClockUnit[] {
  const raw = config?.units;
  if (!Array.isArray(raw)) return DEFAULT_UNITS;
  const units = raw.filter(isRecord).map((u) => {
    const unit: ClockUnit = { id: String(u.id), name: typeof u.name === "string" ? u.name : String(u.id) };
    if (typeof u.duration === "string") unit.duration = u.duration;
    if (typeof u.minutes === "number") unit.minutes = u.minutes;
    if (typeof u.per === "number") unit.per = u.per;
    return unit;
  });
  return units.length ? units : DEFAULT_UNITS;
}

export function clockState(state: unknown, units: ClockUnit[]): ClockState {
  const s = stateRecord(state);
  const counters: Record<string, number> = {};
  const raw = isRecord(s.counters) ? s.counters : {};
  for (const u of units) counters[u.id] = asNumber(raw[u.id], 0);
  return { counters };
}

export function formatElapsed(minutes: number): string {
  if (minutes < 1) return `${Math.round(minutes * 60)} s`;
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  if (h === 0) return `${m} min`;
  const d = Math.floor(h / 24);
  if (d === 0) return `${h} h ${m} min`;
  return `${d} d ${h % 24} h`;
}

/**
 * The clock's counters after advancing (or reverting) one unit: a bigger
 * unit resets the smaller ones (a new shift starts at round 0), and a unit
 * rolls over into the next when that one's `per` is reached. Undefined for
 * an unknown unit.
 */
export function advanceClockCounters(units: ClockUnit[], counters: Record<string, number>, unitId: string, by: number): Record<string, number> | undefined {
  const next = { ...counters };
  const idx = units.findIndex((u) => u.id === unitId);
  if (idx < 0) return undefined;
  next[unitId] = Math.max(0, (next[unitId] ?? 0) + by);
  if (by > 0) for (let i = 0; i < idx; i++) next[units[i]!.id] = 0;
  const bigger = units[idx + 1];
  if (bigger?.per && by > 0 && (next[unitId] ?? 0) >= bigger.per) {
    next[unitId] = 0;
    next[bigger.id] = (next[bigger.id] ?? 0) + 1;
  }
  return next;
}

/** "Round advanced: Round 2, Stretch 0, Shift 0". */
export function clockLogText(units: ClockUnit[], counters: Record<string, number>, unitId: string, by: number): string {
  const unit = units.find((u) => u.id === unitId);
  return `${unit?.name ?? unitId} ${by > 0 ? "advanced" : "reverted"}: ${units.map((u) => `${u.name} ${counters[u.id] ?? 0}`).join(", ")}`;
}

/** Rounds / stretches / shifts counters with advance buttons and an elapsed display. */
export function ClockTracker({ def, state, onChange, onLog, readonly, className }: TrackerProps) {
  const units = clockUnits(def.config);
  const clock = clockState(state, units);
  const commit = (counters: Record<string, number>) => onChange({ ...stateRecord(state), counters });

  const advance = (unitId: string, by: number) => {
    const counters = advanceClockCounters(units, clock.counters, unitId, by);
    if (!counters) return;
    commit(counters);
    onLog?.(clockLogText(units, counters, unitId, by));
  };
  const atZero = units.every((u) => (clock.counters[u.id] ?? 0) === 0);
  // a reset wipes the clock in one tap, so it can be taken back for a few seconds
  const reset = () => {
    const before = stateRecord(state);
    const counters: Record<string, number> = {};
    for (const u of units) counters[u.id] = 0;
    commit(counters);
    onLog?.("Clock reset");
    pushToast(`Clock reset (it was ${units.map((u) => `${u.name} ${clock.counters[u.id] ?? 0}`).join(", ")}).`, {
      action: {
        label: "Undo",
        onClick: () => {
          onChange(before);
          onLog?.("Clock reset undone");
        },
      },
    });
  };

  const elapsedMinutes = units.reduce((sum, u) => sum + (u.minutes ?? 0) * (clock.counters[u.id] ?? 0), 0);
  const hasMinutes = units.some((u) => typeof u.minutes === "number");

  return (
    <TrackerFrame
      def={def}
      className={className}
      actions={
        !readonly && (
          <Button size="sm" variant="ghost" className="cf-clock__reset" onClick={reset} disabled={atZero} aria-label="Reset the clock" title="Set every counter back to 0 (you can undo it)">
            <span aria-hidden="true">↺</span>
            <span className="cf-clock__reset-label"> Reset</span>
          </Button>
        )
      }
    >
      <div className="cf-clock__units">
        {units.map((u) => (
          <div key={u.id} className="cf-clock__unit" data-unit={u.id}>
            <span className="cf-clock__unit-name">{u.name}</span>
            <span className="cf-tracker__num" data-testid={`clock-${u.id}`}>
              {clock.counters[u.id] ?? 0}
            </span>
            {u.duration && <span className="cf-clock__unit-duration">{u.duration}</span>}
            {!readonly && (
              <div className="cf-toolbar__group cf-clock__steps">
                <Button size="sm" onClick={() => advance(u.id, -1)} aria-label={`Back one ${u.name}`} disabled={(clock.counters[u.id] ?? 0) <= 0}>
                  −
                </Button>
                <Button size="sm" variant="primary" onClick={() => advance(u.id, 1)} aria-label={`Advance one ${u.name}`}>
                  +<span className="cf-clock__step-unit"> {u.name}</span>
                </Button>
              </div>
            )}
          </div>
        ))}
      </div>
      <div className="cf-clock__elapsed" aria-live="polite">
        {units.map((u) => `${u.name} ${clock.counters[u.id] ?? 0}`).join(" · ")}
        {hasMinutes && <span className="cf-muted"> · about {formatElapsed(elapsedMinutes)} elapsed</span>}
      </div>
    </TrackerFrame>
  );
}
