import { getPath } from "@campaign-forge/module-sdk";
import { Button } from "../primitives/Button";
import { Pips } from "../primitives/Pips";
import { asNumber, isRecord } from "../sheet/paths";
import { TrackerFrame } from "./TrackerFrame";
import { resolveBindPath, type TrackerProps } from "./types";

/** Per character consumables with supply ratings and a "roll supply" button. */
export function SupplyTracker({ def, entities = [], onEffects, onRollOperation, onLog, readonly, className }: TrackerProps) {
  const cfg = def.config ?? {};
  const itemsBind = typeof cfg.itemsPath === "string" ? cfg.itemsPath : def.binds?.[0] ?? "gear";
  const max = typeof cfg.max === "number" ? cfg.max : 6;
  const op = typeof cfg.operation === "string" ? cfg.operation : "supplyRoll";
  const rows = entities.flatMap((e) => {
    const path = resolveBindPath(itemsBind, e);
    const items = getPath(e.fields, path);
    if (!Array.isArray(items)) return [];
    return items.flatMap((it, index) => (isRecord(it) && typeof it.supply === "number" ? [{ entity: e, path, index, name: String(it.name ?? `Item ${index + 1}`), supply: asNumber(it.supply, 0) }] : []));
  });
  const set = (row: (typeof rows)[number], n: number) => {
    onEffects?.([{ kind: "setField", entity: row.entity.id, path: `${row.path}.${row.index}.supply`, value: Math.max(0, Math.min(max, n)) }]);
    onLog?.(`${row.entity.name} ${row.name} supply ${row.supply} → ${n}`);
  };
  return (
    <TrackerFrame def={def} className={className}>
      {rows.length === 0 && <span className="cf-muted">No consumables tracked</span>}
      {rows.map((r) => (
        <div key={`${r.entity.id}-${r.index}`} className={r.supply === 0 ? "cf-tracker__row cf-tracker__row--danger" : "cf-tracker__row"} data-entity={r.entity.id} data-item={r.index}>
          <span className="cf-tracker__name">
            {r.name} <span className="cf-muted">· {r.entity.name}</span>
          </span>
          <Pips value={r.supply} max={max} label={`${r.entity.name} ${r.name} supply`} readonly={readonly} onChange={(n) => set(r, n)} />
          {!readonly && onRollOperation && (
            <Button size="sm" onClick={() => onRollOperation(op, r.entity.id, { itemIndex: r.index, path: r.path, supply: r.supply })} disabled={r.supply === 0}>
              Roll supply
            </Button>
          )}
        </div>
      ))}
    </TrackerFrame>
  );
}
