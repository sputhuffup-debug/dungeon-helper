import { evaluateLogic, getPath, type JsonLogicRule } from "@campaign-forge/module-sdk";
import { Pips } from "../primitives/Pips";
import { Stepper } from "../primitives/Stepper";
import { asNumber, isRecord, labelFromPath } from "../sheet/paths";
import { TrackerFrame } from "./TrackerFrame";
import { stateRecord, type TrackerEntity, type TrackerProps } from "./types";

/**
 * Where a counter's bind lives on an entity: "type.path" applies to entities
 * of that type only; a plain "path" to every entity that has the field.
 */
export function counterPath(bind: string, entity: TrackerEntity): string | undefined {
  if (entity.type && bind.startsWith(`${entity.type}.`)) return bind.slice(entity.type.length + 1);
  if (getPath(entity.fields, bind) !== undefined) return bind;
  return undefined;
}

function numberOrRule(rule: unknown, entity: TrackerEntity): number | undefined {
  if (rule === undefined || rule === null) return undefined;
  if (typeof rule === "number") return Number.isFinite(rule) ? rule : undefined;
  try {
    const v = evaluateLogic(rule as JsonLogicRule, { fields: entity.fields, computed: entity.computed ?? {} });
    const n = typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : NaN;
    return Number.isFinite(n) ? n : undefined;
  } catch {
    return undefined;
  }
}

export interface CounterSpec {
  bind: string;
  path: string;
  label: string;
  value: number | boolean;
  min: number;
  max?: number;
  style: "pips" | "stepper" | "toggle";
}

/**
 * The counters a `counter` tracker shows for one entity. Config (all optional):
 * `min` (default 0), `max` (a number or JSONLogic over `{ fields, computed }`),
 * `maxes` / `labels` (per bind), `label` (for a single bind), `style`
 * ("pips" or "stepper"; pips by default when the max is 10 or less) and
 * `hideWhenNoMax` (skip counters whose max is 0 or missing).
 */
export function countersFor(def: TrackerProps["def"], entity: TrackerEntity, stored: Record<string, unknown> = {}): CounterSpec[] {
  const cfg = def.config ?? {};
  const binds = def.binds ?? [];
  const labels = isRecord(cfg.labels) ? cfg.labels : {};
  const maxes = isRecord(cfg.maxes) ? cfg.maxes : {};
  const out: CounterSpec[] = [];
  for (const bind of binds) {
    const path = counterPath(bind, entity);
    if (path === undefined) continue;
    const raw = getPath(entity.fields, path) ?? stored[path];
    const max = numberOrRule(maxes[bind] ?? cfg.max, entity);
    if (cfg.hideWhenNoMax === true && !(max !== undefined && max > 0)) continue;
    const label = typeof labels[bind] === "string" ? (labels[bind] as string) : binds.length === 1 && typeof cfg.label === "string" ? cfg.label : labelFromPath(path);
    const min = typeof cfg.min === "number" ? cfg.min : 0;
    const style = typeof raw === "boolean" ? "toggle" : cfg.style === "stepper" || cfg.style === "pips" ? cfg.style : max !== undefined && max <= 10 ? "pips" : "stepper";
    out.push({ bind, path, label, value: typeof raw === "boolean" ? raw : asNumber(raw, 0), min, ...(max !== undefined ? { max } : {}), style: style === "pips" && max === undefined ? "stepper" : style });
  }
  return out;
}

/**
 * Numbers on each entity's sheet, edited at the table: hit points, death
 * saves, exhaustion, spell slots, inspiration... With an effects handler the
 * entity's own field is the source of truth; without one the values live in
 * the tracker state.
 */
export function CounterTracker({ def, state, onChange, entities = [], onEffects, onLog, readonly, className }: TrackerProps) {
  const stored = stateRecord(state);
  const values = isRecord(stored.values) ? stored.values : {};
  const rows = entities
    .map((e) => ({ e, counters: countersFor(def, e, isRecord(values[e.id]) ? (values[e.id] as Record<string, unknown>) : {}) }))
    .filter((r) => r.counters.length > 0);
  const set = (entity: TrackerEntity, c: CounterSpec, next: number | boolean) => {
    const value = typeof next === "boolean" ? next : Math.max(c.min, c.max !== undefined ? Math.min(c.max, next) : next);
    if (onEffects) onEffects([{ kind: "setField", entity: entity.id, path: c.path, value }]);
    else {
      const own = isRecord(values[entity.id]) ? (values[entity.id] as Record<string, unknown>) : {};
      onChange({ ...stored, values: { ...values, [entity.id]: { ...own, [c.path]: value } } });
    }
    const shown = typeof value === "boolean" ? (value ? "yes" : "no") : `${value}${c.max !== undefined ? `/${c.max}` : ""}`;
    onLog?.(`${entity.name}: ${def.name}${c.label && c.label !== def.name ? ` (${c.label})` : ""} ${shown}`);
  };
  return (
    <TrackerFrame def={def} className={className}>
      {rows.length === 0 && <span className="cf-muted">No one to track</span>}
      {rows.map(({ e, counters }) => (
        <div key={e.id} className="cf-tracker__row cf-counter__row" data-entity={e.id}>
          <span className="cf-tracker__name">{e.name}</span>
          <span className="cf-counter__items">
            {counters.map((c) => (
              <span key={c.bind} className="cf-counter" data-testid={`counter-${e.id}-${c.path}`}>
                <span className="cf-counter__label">{c.label}</span>
                {c.style === "toggle" ? (
                  <input type="checkbox" className="cf-checkbox" checked={c.value === true} disabled={readonly} onChange={(ev) => set(e, c, ev.target.checked)} aria-label={`${e.name} ${c.label}`} />
                ) : c.style === "pips" && c.max !== undefined ? (
                  <Pips value={Number(c.value)} min={c.min} max={c.max} readonly={readonly} label={`${e.name} ${c.label}`} onChange={(n) => set(e, c, n)} />
                ) : (
                  <>
                    {readonly ? <span className="cf-tracker__num">{Number(c.value)}</span> : <Stepper value={Number(c.value)} min={c.min} max={c.max} label={`${e.name} ${c.label}`} onChange={(n) => set(e, c, n)} />}
                    {c.max !== undefined && <span className="cf-muted">/ {c.max}</span>}
                  </>
                )}
              </span>
            ))}
          </span>
        </div>
      ))}
    </TrackerFrame>
  );
}
