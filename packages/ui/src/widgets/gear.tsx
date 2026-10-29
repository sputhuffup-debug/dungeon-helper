import { AutoGrowText } from "../primitives/AutoGrowText";
import { Button } from "../primitives/Button";
import { IconButton } from "../primitives/Button";
import { Pips } from "../primitives/Pips";
import { asNumber, cx, isRecord } from "../sheet/paths";
import type { WidgetProps } from "./types";
import { configNumber, configString } from "./types";

interface GearRow {
  name: string;
  qty?: number;
  weight?: number;
  supply?: number;
  [key: string]: unknown;
}

function rows(value: unknown): GearRow[] {
  if (!Array.isArray(value)) return [];
  return value.filter(isRecord).map((r) => ({ ...r, name: typeof r.name === "string" ? r.name : "" }));
}

export function gearTotalWeight(items: GearRow[]): number {
  return items.reduce((sum, r) => sum + asNumber(r.weight, 0) * Math.max(1, asNumber(r.qty, 1)), 0);
}

/**
 * Rows of name / qty / weight / supply with the total weight against a
 * computed limit (`limitComputed`); with `totalComputed` the total shown is
 * that computed value (everything carried, e.g. gear and weapons).
 */
export function GearField(props: WidgetProps) {
  const { value, onChange, readonly, field, computed, id } = props;
  const items = rows(value);
  const limitKey = configString(field, "limitComputed");
  const limit = limitKey ? asNumber(computed[limitKey], NaN) : NaN;
  const total = gearTotalWeight(items);
  // `totalComputed`: everything carried (e.g. gear and weapons), as the type computes it
  const totalKey = configString(field, "totalComputed");
  const carried = totalKey ? asNumber(computed[totalKey], NaN) : NaN;
  const over = Number.isFinite(limit) && (Number.isFinite(carried) ? carried : total) > limit;
  const supplyMax = configNumber(field, "supplyMax", 6) as number;
  const showSupply = field.config?.supply !== false;
  const showQty = field.config?.qty !== false;

  const update = (i: number, patch: Partial<GearRow>) => onChange(items.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const remove = (i: number) => onChange(items.filter((_, j) => j !== i));
  const add = () => onChange([...items, { name: "", weight: 1 }]);

  return (
    <div>
      <table className="cf-gear">
        <thead>
          <tr>
            <th scope="col">Item</th>
            {showQty && (
              <th scope="col" className="cf-gear__num">
                Qty
              </th>
            )}
            <th scope="col" className="cf-gear__num">
              Weight
            </th>
            {showSupply && <th scope="col">Supply</th>}
            {!readonly && <th scope="col" />}
          </tr>
        </thead>
        <tbody>
          {items.length === 0 && (
            <tr>
              <td colSpan={5} className="cf-muted">
                No gear
              </td>
            </tr>
          )}
          {items.map((r, i) => (
            <tr key={i}>
              <td>
                {readonly ? (
                  r.name
                ) : (
                  <AutoGrowText id={i === 0 ? id : undefined} aria-label={`Item ${i + 1} name`} value={r.name} onChange={(e) => update(i, { name: e.target.value })} />
                )}
              </td>
              {showQty && (
                <td className="cf-gear__num">
                  {readonly ? (
                    asNumber(r.qty, 1)
                  ) : (
                    <input className="cf-input" type="number" min={0} aria-label={`Item ${i + 1} quantity`} value={asNumber(r.qty, 1)} onChange={(e) => update(i, { qty: Number(e.target.value) })} />
                  )}
                </td>
              )}
              <td className="cf-gear__num">
                {readonly ? (
                  asNumber(r.weight, 0)
                ) : (
                  <input className="cf-input" type="number" min={0} step={0.5} aria-label={`Item ${i + 1} weight`} value={asNumber(r.weight, 0)} onChange={(e) => update(i, { weight: Number(e.target.value) })} />
                )}
              </td>
              {showSupply && (
                <td>
                  {typeof r.supply === "number" ? (
                    <Pips value={r.supply} max={supplyMax} readonly={readonly} onChange={(n) => update(i, { supply: n })} label={`${r.name || "item"} supply`} showValue={false} />
                  ) : readonly ? (
                    <span className="cf-muted">—</span>
                  ) : (
                    <Button size="sm" variant="ghost" onClick={() => update(i, { supply: supplyMax })}>
                      Track supply
                    </Button>
                  )}
                </td>
              )}
              {!readonly && (
                <td>
                  <IconButton size="sm" variant="ghost" label={`Remove ${r.name || "item"}`} icon="×" onClick={() => remove(i)} />
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
      <div className={cx("cf-gear__total", over && "cf-gear__total--over")} data-testid="gear-total">
        <span>{Number.isFinite(carried) ? `Encumbrance ${carried}` : `Total weight ${total}`}</span>
        {Number.isFinite(limit) && <span>/ {limit}</span>}
        {over && <span>(encumbered)</span>}
      </div>
      {!readonly && (
        <Button size="sm" onClick={add}>
          Add item
        </Button>
      )}
    </div>
  );
}
