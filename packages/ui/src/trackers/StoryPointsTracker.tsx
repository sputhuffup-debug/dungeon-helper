import { Button } from "../primitives/Button";
import { Pips } from "../primitives/Pips";
import { getPath } from "@campaign-forge/module-sdk";
import { asNumber, isRecord } from "../sheet/paths";
import { TrackerFrame } from "./TrackerFrame";
import { resolveBindPath, stateRecord, type TrackerProps } from "./types";

export function storyPoints(state: unknown): Record<string, number> {
  const raw = stateRecord(state).points;
  const out: Record<string, number> = {};
  if (isRecord(raw)) for (const [k, v] of Object.entries(raw)) out[k] = asNumber(v, 0);
  return out;
}

/** Per character story point counter 0..cap with award and spend. */
export function StoryPointsTracker({ def, state, onChange, entities = [], onLog, onEffects, readonly, className }: TrackerProps) {
  const cfg = def.config ?? {};
  const cap = typeof cfg.cap === "number" ? cfg.cap : typeof cfg.max === "number" ? cfg.max : 3;
  const stored = storyPoints(state);
  // With a bound entity field and an effects handler, the character's own field is the source of truth.
  const bind = onEffects ? def.binds?.[0] : undefined;
  const points: Record<string, number> = { ...stored };
  if (bind) for (const e of entities) points[e.id] = asNumber(getPath(e.fields, resolveBindPath(bind, e)), 0);
  const set = (entityId: string, n: number) => {
    const v = Math.max(0, Math.min(cap, n));
    const entity = entities.find((e) => e.id === entityId);
    if (bind && entity && onEffects) onEffects([{ kind: "setField", entity: entityId, path: resolveBindPath(bind, entity), value: v }]);
    else onChange({ ...stateRecord(state), points: { ...stored, [entityId]: v } });
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
