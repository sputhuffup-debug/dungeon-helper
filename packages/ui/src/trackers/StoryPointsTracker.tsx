import { Button } from "../primitives/Button";
import { Pips } from "../primitives/Pips";
import { asNumber, isRecord } from "../sheet/paths";
import { TrackerFrame } from "./TrackerFrame";
import { stateRecord, type TrackerProps } from "./types";

export function storyPoints(state: unknown): Record<string, number> {
  const raw = stateRecord(state).points;
  const out: Record<string, number> = {};
  if (isRecord(raw)) for (const [k, v] of Object.entries(raw)) out[k] = asNumber(v, 0);
  return out;
}

/** Per character story point counter 0..cap with award and spend. */
export function StoryPointsTracker({ def, state, onChange, entities = [], onLog, readonly, className }: TrackerProps) {
  const cap = typeof def.config?.cap === "number" ? def.config.cap : 3;
  const points = storyPoints(state);
  const set = (entityId: string, n: number) => {
    const v = Math.max(0, Math.min(cap, n));
    onChange({ ...stateRecord(state), points: { ...points, [entityId]: v } });
    const name = entities.find((e) => e.id === entityId)?.name ?? entityId;
    onLog?.(`${name}: ${v} story point${v === 1 ? "" : "s"}`);
  };
  const total = entities.reduce((s, e) => s + (points[e.id] ?? 0), 0);
  return (
    <TrackerFrame def={def} className={className} actions={<span className="cf-muted">Party total {total}</span>}>
      {entities.length === 0 && <span className="cf-muted">No characters</span>}
      {entities.map((e) => {
        const v = points[e.id] ?? 0;
        return (
          <div key={e.id} className="cf-tracker__row" data-entity={e.id}>
            <span className="cf-tracker__name">{e.name}</span>
            <Pips value={v} max={cap} label={`${e.name} story points`} readonly={readonly} onChange={(n) => set(e.id, n)} />
            {!readonly && (
              <span className="cf-toolbar__group">
                <Button size="sm" onClick={() => set(e.id, v - 1)} disabled={v <= 0} aria-label={`Spend ${e.name} story point`}>
                  Spend
                </Button>
                <Button size="sm" variant="primary" onClick={() => set(e.id, v + 1)} disabled={v >= cap} aria-label={`Award ${e.name} story point`}>
                  Award
                </Button>
              </span>
            )}
          </div>
        );
      })}
    </TrackerFrame>
  );
}
