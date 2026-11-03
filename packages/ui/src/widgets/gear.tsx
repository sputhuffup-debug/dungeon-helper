import { useMemo, useState } from "react";
import { addCatalogItem, catalogPresets, catalogRoute, gearCatalogConfig, getPath, groupCatalogPresets, sheetFieldAt, weaponColumnText, type EntityPreset, type EntityTypeDef, type GearCatalogConfig, type SheetField } from "@campaign-forge/module-sdk";
import { useSheetContext } from "../context";
import { AutoGrowText } from "../primitives/AutoGrowText";
import { Button } from "../primitives/Button";
import { IconButton } from "../primitives/Button";
import { Dialog } from "../primitives/Dialog";
import { PageRef } from "../primitives/PageRef";
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
 * "From the gear list…" (`config.catalog`): the module's item presets,
 * searchable and grouped, each with the catalog's columns and its page.
 * "Add" places the item where it belongs (a weapon on the weapons list, the
 * rest as a gear row, or one more of a row already there) and leaves the
 * list open, saying where it went, so several items can be added in a row.
 */
function GearCatalogPicker({
  open,
  cfg,
  def,
  field,
  presets,
  onAdd,
  onClose,
}: {
  open: boolean;
  cfg: GearCatalogConfig;
  def: EntityTypeDef;
  field: SheetField;
  presets: EntityPreset[];
  onAdd: (preset: EntityPreset) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const [added, setAdded] = useState<string | undefined>();
  const groups = useMemo(() => groupCatalogPresets(cfg, presets, query), [cfg, presets, query]);
  const columns = cfg.columns ?? [];
  const destination = (p: EntityPreset): string => {
    const route = catalogRoute(cfg, p);
    if (!route) return field.label ?? "Gear";
    return route.label ?? sheetFieldAt(def, route.path)?.label ?? route.path;
  };
  const close = () => {
    setAdded(undefined);
    setQuery("");
    onClose();
  };
  return (
    <Dialog open={open} onClose={close} title="From the gear list" className="cf-weapons__dialog" footer={<Button onClick={close}>Done</Button>}>
      <div className="cf-weapons__picker" data-testid="gear-picker">
        <div className="cf-weapons__search">
          <input
            className="cf-input"
            type="search"
            aria-label="Search the gear list"
            placeholder={`Search ${presets.length} items`}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") e.preventDefault();
            }}
          />
          <p className="cf-gear__added cf-muted" role="status" data-testid="gear-picker-status">
            {added ?? "Weapons go to the weapons list; everything else to the gear."}
          </p>
        </div>
        {groups.map((g) => (
          <section key={g.id || "other"} className="cf-weapons__group" aria-label={g.label} data-group={g.id}>
            <h3 className="cf-weapons__group-title">{g.label}</h3>
            <table className="cf-weapons cf-weapons--picker cf-weapons--catalog">
              <thead>
                <tr>
                  <th scope="col">Item</th>
                  {columns.map((c, i) => (
                    <th key={i} scope="col" className={cx(c.numeric && "cf-weapons__num")}>
                      {c.label}
                    </th>
                  ))}
                  <th scope="col" className="cf-weapons__page">
                    Page
                  </th>
                  <th scope="col" className="cf-weapons__act" />
                </tr>
              </thead>
              <tbody>
                {g.presets.map((p) => (
                  <tr key={p.id} data-preset={p.id}>
                    <th scope="row">
                      <span className="cf-weapons__name">{p.name}</span>
                      {p.summary && <span className="cf-weapons__summary cf-muted">{p.summary}</span>}
                    </th>
                    {columns.map((c, i) => (
                      <td key={i} className={cx(c.numeric && "cf-weapons__num")} data-column={c.label}>
                        {weaponColumnText(c, p.fields) || <span className="cf-muted">—</span>}
                      </td>
                    ))}
                    <td className="cf-weapons__page">
                      <PageRef page={p.page} cite={p.cite} original={p.original} />
                    </td>
                    <td className="cf-weapons__act">
                      <Button
                        size="sm"
                        variant="primary"
                        aria-label={`Add ${p.name}`}
                        onClick={() => {
                          onAdd(p);
                          setAdded(`Added ${p.name} to ${destination(p)}.`);
                        }}
                      >
                        Add
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        ))}
        {groups.length === 0 && <p className="cf-muted">No item matches.</p>}
      </div>
    </Dialog>
  );
}

/**
 * Rows of name / qty / weight / supply with the total weight against a
 * computed limit (`limitComputed`); with `totalComputed` the total shown is
 * that computed value (everything carried, e.g. gear and weapons). With
 * `config.catalog`, "From the gear list…" adds items from the module's
 * presets (see `GearCatalogConfig`).
 */
export function GearField(props: WidgetProps) {
  const { value, onChange, readonly, field, computed, id, def, fields, onChangeFields } = props;
  const ctx = useSheetContext();
  const catalog = gearCatalogConfig(field);
  const [picking, setPicking] = useState(false);
  const catalogItems = useMemo(() => (catalog && ctx.presetsFor ? catalogPresets(catalog, ctx.presetsFor(catalog.presets.entityType)) : []), [catalog, ctx]);
  const canPick = !readonly && !!catalog && !!def && catalogItems.length > 0;
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
      <div className="cf-gear__wrap">
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
      </div>
      <div className={cx("cf-gear__total", over && "cf-gear__total--over")} data-testid="gear-total">
        <span>{Number.isFinite(carried) ? `Encumbrance ${carried}` : `Total weight ${total}`}</span>
        {Number.isFinite(limit) && <span>/ {limit}</span>}
        {over && <span>(encumbered)</span>}
      </div>
      {!readonly && (
        <div className="cf-weapons__add">
          {canPick && (
            <Button size="sm" variant="primary" onClick={() => setPicking(true)} data-testid="gear-from-list">
              From the gear list…
            </Button>
          )}
          <Button size="sm" onClick={add}>
            Add item
          </Button>
        </div>
      )}
      {canPick && def && (
        <GearCatalogPicker
          open={picking}
          cfg={catalog}
          def={def}
          field={field}
          presets={catalogItems}
          onClose={() => setPicking(false)}
          onAdd={(preset) => {
            // the picker may write another field (a weapon goes to the weapons list): place it in the whole sheet
            const next = addCatalogItem(def, field, fields, preset).fields;
            if (onChangeFields) onChangeFields(next);
            else if (!catalogRoute(catalog, preset)) onChange(getPath(next, props.path));
          }}
        />
      )}
    </div>
  );
}
