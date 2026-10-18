import { getPath } from "@campaign-forge/module-sdk";
import { Badge } from "../primitives/Badge";
import { Button } from "../primitives/Button";
import { Pips } from "../primitives/Pips";
import { asNumber, cx, isRecord } from "../sheet/paths";
import { TrackerFrame, TrackerLog } from "./TrackerFrame";
import { nowIso, resolveBindPath, stateRecord, type TrackerProps } from "./types";

export interface PanicLogEntry {
  at: string;
  entity: string;
  total: number;
  label: string;
}

export function panicLog(state: unknown): PanicLogEntry[] {
  const raw = stateRecord(state).panicLog;
  if (!Array.isArray(raw)) return [];
  return raw.filter(isRecord).map((e) => ({ at: String(e.at ?? ""), entity: String(e.entity ?? ""), total: asNumber(e.total, 0), label: String(e.label ?? "") }));
}

/**
 * One row per character: stress pips bound to `def.binds[0]`, the computed
 * resolve value, and buttons that ask the app to run the module's stress
 * response and panic operations. `state.panicLog` lists past panic results.
 */
export function StressTracker({ def, state, onChange, entities = [], onEffects, onRollOperation, onLog, readonly, className }: TrackerProps) {
  const bind = def.binds?.[0] ?? "stress";
  const cfg = def.config ?? {};
  const max = typeof cfg.max === "number" ? cfg.max : 10;
  const warnAt = typeof cfg.warnAt === "number" ? cfg.warnAt : 5;
  const resolveKey = typeof cfg.resolveComputed === "string" ? cfg.resolveComputed : "resolve";
  const responseOp = typeof cfg.stressResponseOperation === "string" ? cfg.stressResponseOperation : "stressResponse";
  const panicOp = typeof cfg.panicOperation === "string" ? cfg.panicOperation : "panicRoll";
  const panicThreshold = typeof cfg.panicThreshold === "number" ? cfg.panicThreshold : 9;
  /** Optional field that, when truthy on a character, exempts it from stress and panic rolls. */
  const exemptField = typeof cfg.exemptField === "string" ? cfg.exemptField : undefined;
  const exemptLabel = typeof cfg.exemptLabel === "string" ? cfg.exemptLabel : "Exempt";
  const log = panicLog(state);
  const anyPanic = log.some((e) => e.total >= panicThreshold);

  const setStress = (entityId: string, path: string, from: number, to: number) => {
    if (to === from) return;
    onEffects?.([{ kind: "incrementField", entity: entityId, path, by: to - from, min: 0, max }]);
    const name = entities.find((e) => e.id === entityId)?.name ?? entityId;
    onLog?.(`${name} stress ${from} → ${to}`);
  };
  const clearLog = () => onChange({ ...stateRecord(state), panicLog: [] });

  return (
    <TrackerFrame
      def={def}
      className={className}
      actions={
        <>
          {anyPanic && <Badge tone="danger">Panic</Badge>}
          {log.length > 0 && !readonly && (
            <Button size="sm" variant="ghost" onClick={clearLog}>
              Clear log
            </Button>
          )}
        </>
      }
    >
      {entities.length === 0 && <span className="cf-muted">No characters</span>}
      {entities.map((e) => {
        const path = resolveBindPath(bind, e);
        const stress = asNumber(getPath(e.fields, path), 0);
        const resolve = e.computed?.[resolveKey];
        const exempt = exemptField !== undefined && Boolean(getPath(e.fields, exemptField));
        return (
          <div key={e.id} className={cx("cf-tracker__row", stress >= max && "cf-tracker__row--danger", stress >= warnAt && stress < max && "cf-tracker__row--warn")} data-entity={e.id}>
            <span className="cf-tracker__name">{e.name}</span>
            <Pips value={stress} max={max} warnAt={warnAt} dangerAt={max} label={`${e.name} stress`} readonly={readonly} onChange={(n) => setStress(e.id, path, stress, n)} />
            {!readonly && (
              <span className="cf-toolbar__group">
                <Button size="sm" onClick={() => setStress(e.id, path, stress, Math.max(0, stress - 1))} aria-label={`Lower ${e.name} stress`} disabled={stress <= 0}>
                  −
                </Button>
                <Button size="sm" onClick={() => setStress(e.id, path, stress, Math.min(max, stress + 1))} aria-label={`Raise ${e.name} stress`} disabled={stress >= max}>
                  +
                </Button>
              </span>
            )}
            {resolve !== undefined && (
              <Badge tone="accent" title="Resolve">
                Resolve {String(resolve)}
              </Badge>
            )}
            {exempt && <Badge title="Does not roll for stress or panic">{exemptLabel}</Badge>}
            {!readonly && onRollOperation && !exempt && (
              <span className="cf-toolbar__group">
                <Button size="sm" onClick={() => onRollOperation(responseOp, e.id)}>
                  Stress response
                </Button>
                <Button size="sm" variant="danger" onClick={() => onRollOperation(panicOp, e.id)}>
                  Panic roll
                </Button>
              </span>
            )}
          </div>
        );
      })}
      {log.length > 0 && (
        <TrackerLog
          entries={log.map((l) => ({
            at: l.at,
            text: `${entities.find((e) => e.id === l.entity)?.name ?? l.entity}: ${l.total} ${l.label}${l.total >= panicThreshold ? " ‼" : ""}`,
          }))}
        />
      )}
    </TrackerFrame>
  );
}

/** Helper for the app: append a panic result to the tracker state. */
export function appendPanic(state: unknown, entry: Omit<PanicLogEntry, "at"> & { at?: string }): Record<string, unknown> {
  const s = stateRecord(state);
  return { ...s, panicLog: [...panicLog(s), { at: entry.at ?? nowIso(), entity: entry.entity, total: entry.total, label: entry.label }] };
}
