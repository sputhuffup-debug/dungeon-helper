/**
 * A list of weapons with their stats as columns (config: WeaponListConfig).
 * "Add weapon" opens a searchable, grouped picker over the module's presets
 * (the host supplies them through the sheet context); picking one copies its
 * stats into a row and records the preset. "From campaign items" links an
 * item entity the same way, and "Custom weapon" adds a blank row. Rows are
 * edited and removed inline; a read-only sheet shows the table.
 */
import { Fragment, useMemo, useState } from "react";
import {
  blankWeaponRow,
  groupWeaponPresets,
  weaponColumnText,
  weaponListConfig,
  weaponPresets,
  weaponRowFrom,
  weaponRows,
  weaponsWeight,
  type EntityPreset,
  type JsonSchema,
  type WeaponColumn,
  type WeaponListConfig,
} from "@campaign-forge/module-sdk";
import { useSheetContext, type SheetEntityRef } from "../context";
import { AutoGrowText } from "../primitives/AutoGrowText";
import { Button, IconButton } from "../primitives/Button";
import { Dialog } from "../primitives/Dialog";
import { PageRef } from "../primitives/PageRef";
import { asNumber, cx, humanize, isRecord } from "../sheet/paths";
import { isShortText } from "./SchemaValueEditor";
import type { WidgetProps } from "./types";

type Row = Record<string, unknown>;

const round = (n: number) => Math.round(n * 100) / 100;

function rowSchemaOf(schema: JsonSchema | undefined): JsonSchema | undefined {
  return isRecord(schema?.items) ? (schema.items as JsonSchema) : undefined;
}

function propSchema(rowSchema: JsonSchema | undefined, key: string): JsonSchema | undefined {
  const props = rowSchema?.properties;
  return isRecord(props) && isRecord(props[key]) ? (props[key] as JsonSchema) : undefined;
}

function typesOf(s: JsonSchema | undefined): string[] {
  const t = s?.type;
  return Array.isArray(t) ? t.map(String) : typeof t === "string" ? [t] : [];
}

/** One labelled input for a row key, chosen from its schema. */
function RowInput({ rowSchema, keyName, value, onChange, label }: { rowSchema: JsonSchema | undefined; keyName: string; value: unknown; onChange: (v: unknown) => void; label: string }) {
  const s = propSchema(rowSchema, keyName);
  const types = typesOf(s);
  if (Array.isArray(s?.enum)) {
    return (
      <select className="cf-select" aria-label={label} value={typeof value === "string" ? value : ""} onChange={(e) => onChange(e.target.value || undefined)}>
        {s.default === undefined && <option value="">—</option>}
        {(s.enum as unknown[]).map((v) => (
          <option key={String(v)} value={String(v)}>
            {humanize(String(v))}
          </option>
        ))}
      </select>
    );
  }
  if (types.includes("boolean")) {
    return <input type="checkbox" className="cf-checkbox" aria-label={label} checked={value === true} onChange={(e) => onChange(e.target.checked)} />;
  }
  if (types.includes("array")) {
    const list = Array.isArray(value) ? value.map(String) : [];
    return (
      <input
        className="cf-input"
        aria-label={label}
        placeholder="Comma-separated"
        defaultValue={list.join(", ")}
        onBlur={(e) => onChange(e.target.value.split(",").map((x) => x.trim()).filter(Boolean))}
      />
    );
  }
  if ((types.includes("integer") || types.includes("number")) && !types.includes("string")) {
    return (
      <input
        className="cf-input"
        type="number"
        aria-label={label}
        step={types.includes("integer") ? 1 : 0.25}
        min={typeof s?.minimum === "number" ? s.minimum : undefined}
        value={typeof value === "number" ? value : ""}
        onChange={(e) => onChange(e.target.value === "" ? undefined : Number(e.target.value))}
      />
    );
  }
  // strings, and number-or-text values (a supply rating or "Single use")
  const numeric = types.includes("integer") || types.includes("number");
  if (!numeric && !isShortText(s, keyName)) {
    // free text (a name, special effects, notes) wraps and grows
    return (
      <AutoGrowText
        aria-label={label}
        value={value === undefined || value === null ? "" : String(value)}
        onChange={(e) => {
          const v = e.target.value;
          onChange(v === "" && keyName !== "name" ? undefined : v);
        }}
      />
    );
  }
  return (
    <input
      className="cf-input"
      aria-label={label}
      value={value === undefined || value === null ? "" : String(value)}
      onChange={(e) => {
        const v = e.target.value;
        if (v === "" && keyName !== "name") return onChange(undefined);
        onChange(numeric && /^-?\d+(\.\d+)?$/.test(v.trim()) ? Number(v) : v);
      }}
    />
  );
}

function ColumnCells({ columns, row }: { columns: WeaponColumn[]; row: Row }) {
  return (
    <>
      {columns.map((c, i) => (
        <td key={i} className={cx(c.numeric && "cf-weapons__num")} data-column={c.label}>
          {weaponColumnText(c, row) || <span className="cf-muted">—</span>}
        </td>
      ))}
    </>
  );
}

type PickerSource = "presets" | "items";

function WeaponPicker({
  cfg,
  source,
  presets,
  items,
  onPick,
  onClose,
}: {
  cfg: WeaponListConfig;
  source: PickerSource | undefined;
  presets: EntityPreset[];
  items: SheetEntityRef[];
  onPick: (row: Row) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const columns = cfg.pickerColumns ?? cfg.columns;
  const groups = useMemo(() => groupWeaponPresets(cfg, presets, query), [cfg, presets, query]);
  const q = query.trim().toLowerCase();
  const shownItems = items.filter((e) => !q || e.name.toLowerCase().includes(q));
  const head = (
    <thead>
      <tr>
        <th scope="col">Name</th>
        {columns.map((c, i) => (
          <th key={i} scope="col" className={cx(c.numeric && "cf-weapons__num")}>
            {c.label}
          </th>
        ))}
        {source === "presets" && <th scope="col">Page</th>}
        <th scope="col" />
      </tr>
    </thead>
  );
  return (
    <Dialog open={!!source} onClose={onClose} title={source === "items" ? "From campaign items" : "Add weapon"} className="cf-weapons__dialog" footer={<Button onClick={onClose}>Cancel</Button>}>
      <div className="cf-weapons__picker" data-testid="weapon-picker">
        <div className="cf-weapons__search">
          <input
            className="cf-input"
            type="search"
            aria-label="Search weapons"
            placeholder={source === "items" ? `Search ${items.length} items` : `Search ${presets.length} weapons`}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") e.preventDefault();
            }}
          />
        </div>
        {source === "presets" &&
          groups.map((g) => (
            <section key={g.id || "other"} className="cf-weapons__group" aria-label={g.label} data-group={g.id}>
              <h3 className="cf-weapons__group-title">{g.label}</h3>
              <table className="cf-weapons cf-weapons--picker">
                {head}
                <tbody>
                  {g.presets.map((p) => (
                    <tr key={p.id} data-preset={p.id}>
                      <th scope="row">
                        <span className="cf-weapons__name">{p.name}</span>
                        {p.summary && <span className="cf-weapons__summary cf-muted">{p.summary}</span>}
                      </th>
                      <ColumnCells columns={columns} row={p.fields} />
                      <td>
                        <PageRef page={p.page} cite={p.cite} original={p.original} />
                      </td>
                      <td>
                        <Button size="sm" variant="primary" aria-label={`Add ${p.name}`} onClick={() => onPick(weaponRowFrom(cfg, p, { presetId: p.id }))}>
                          Add
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          ))}
        {source === "presets" && groups.length === 0 && <p className="cf-muted">No weapon matches.</p>}
        {source === "items" &&
          (shownItems.length > 0 ? (
            <table className="cf-weapons cf-weapons--picker">
              {head}
              <tbody>
                {shownItems.map((e) => (
                  <tr key={e.id} data-item={e.id}>
                    <th scope="row">
                      <span className="cf-weapons__name">{e.name}</span>
                    </th>
                    <ColumnCells columns={columns} row={e.fields} />
                    <td>
                      <Button size="sm" variant="primary" aria-label={`Add ${e.name}`} onClick={() => onPick(weaponRowFrom(cfg, e, { itemId: e.id }))}>
                        Add
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="cf-muted">{items.length === 0 ? "The campaign has no weapon items yet." : "No item matches."}</p>
          ))}
      </div>
    </Dialog>
  );
}

export function WeaponsField(props: WidgetProps) {
  const { value, onChange, readonly, field, computed, schema } = props;
  const cfg = weaponListConfig(field);
  const ctx = useSheetContext();
  const rows = weaponRows(value);
  const rowSchema = rowSchemaOf(schema);
  const [editing, setEditing] = useState<number | undefined>();
  const [source, setSource] = useState<PickerSource | undefined>();

  const presets = useMemo(() => (cfg?.presets && ctx.presetsFor ? weaponPresets(cfg, ctx.presetsFor(cfg.presets.entityType)) : []), [cfg, ctx]);
  const items = useMemo(() => {
    if (!source || !cfg?.items || !ctx.entitiesOf) return [];
    const sub = cfg.items.subtype;
    return ctx.entitiesOf(cfg.items.entityType).filter((e) => !sub || e.subtype === sub);
  }, [cfg, ctx, source]);

  if (!cfg) return <span className="cf-muted">This weapons field has no config.</span>;

  const keyLabel = (k: string) => {
    const t = propSchema(rowSchema, k)?.title;
    return typeof t === "string" ? t : humanize(k);
  };
  const editKeys = cfg.edit ?? cfg.copy;
  const update = (i: number, patch: Row) =>
    onChange(
      rows.map((r, j) => {
        if (j !== i) return r;
        const next = { ...r, ...patch };
        for (const [k, v] of Object.entries(patch)) if (v === undefined) delete next[k];
        return next;
      }),
    );
  const remove = (i: number) => {
    onChange(rows.filter((_, j) => j !== i));
    setEditing(undefined);
  };
  const add = (row: Row, edit = false) => {
    onChange([...rows, row]);
    setSource(undefined);
    if (edit) setEditing(rows.length);
  };

  const weight = round(weaponsWeight(cfg, rows));
  const total = cfg.totalComputed ? asNumber(computed[cfg.totalComputed], NaN) : NaN;
  const limit = cfg.limitComputed ? asNumber(computed[cfg.limitComputed], NaN) : NaN;
  const over = Number.isFinite(total) && Number.isFinite(limit) && total > limit;
  const span = cfg.columns.length + (readonly ? 1 : 2);

  return (
    <div className="cf-weapons-field">
      <div className="cf-weapons__scroll">
        <table className="cf-weapons" data-testid="weapons-table">
          <thead>
            <tr>
              <th scope="col">Weapon</th>
              {cfg.columns.map((c, i) => (
                <th key={i} scope="col" className={cx(c.numeric && "cf-weapons__num")}>
                  {c.label}
                </th>
              ))}
              {!readonly && <th scope="col" />}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={span} className="cf-muted">
                  No weapons
                </td>
              </tr>
            )}
            {rows.map((r, i) => {
              const name = typeof r.name === "string" && r.name ? r.name : "Unnamed weapon";
              return (
                <Fragment key={i}>
                  <tr data-weapon={i} className={cx(editing === i && "is-editing")}>
                    <th scope="row" className="cf-weapons__name">
                      {name}
                    </th>
                    <ColumnCells columns={cfg.columns} row={r} />
                    {!readonly && (
                      <td className="cf-weapons__actions">
                        <Button size="sm" variant="ghost" aria-expanded={editing === i} aria-label={`Edit ${name}`} onClick={() => setEditing(editing === i ? undefined : i)}>
                          {editing === i ? "Done" : "Edit"}
                        </Button>
                        <IconButton size="sm" variant="ghost" label={`Remove ${name}`} icon="×" onClick={() => remove(i)} />
                      </td>
                    )}
                  </tr>
                  {!readonly && editing === i && (
                    <tr className="cf-weapons__editor">
                      <td colSpan={span}>
                        <div className="cf-weapons__form" role="group" aria-label={`${name} stats`}>
                          <label className="cf-weapons__input cf-weapons__input--wide">
                            <span>{keyLabel("name")}</span>
                            <RowInput rowSchema={rowSchema} keyName="name" label={`Weapon ${i + 1} name`} value={r.name} onChange={(v) => update(i, { name: v })} />
                          </label>
                          {editKeys.map((k) => (
                            <label key={k} className={cx("cf-weapons__input", (k === "notes" || typesOf(propSchema(rowSchema, k)).includes("array")) && "cf-weapons__input--wide")}>
                              <span>{keyLabel(k)}</span>
                              <RowInput rowSchema={rowSchema} keyName={k} label={`${name} ${keyLabel(k).toLowerCase()}`} value={r[k]} onChange={(v) => update(i, { [k]: v })} />
                            </label>
                          ))}
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className={cx("cf-gear__total", over && "cf-gear__total--over")} data-testid="weapons-total">
        <span>Weapons weight {weight}</span>
        {Number.isFinite(total) && (
          <span>
            Encumbrance {round(total)}
            {Number.isFinite(limit) ? ` / ${limit}` : ""}
          </span>
        )}
        {over && <span>(encumbered)</span>}
      </div>
      {!readonly && (
        <div className="cf-weapons__add">
          {presets.length > 0 && (
            <Button size="sm" variant="primary" onClick={() => setSource("presets")}>
              Add weapon
            </Button>
          )}
          {cfg.items && ctx.entitiesOf && (
            <Button size="sm" onClick={() => setSource("items")}>
              From campaign items
            </Button>
          )}
          <Button size="sm" onClick={() => add(blankWeaponRow(rowSchema), true)}>
            Custom weapon
          </Button>
        </div>
      )}
      {!readonly && <WeaponPicker cfg={cfg} source={source} presets={presets} items={items} onPick={(row) => add(row)} onClose={() => setSource(undefined)} />}
    </div>
  );
}
