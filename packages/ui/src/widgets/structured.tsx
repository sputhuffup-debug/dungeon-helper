import type { JsonSchema } from "@campaign-forge/module-sdk";
import { schemaDefaults } from "@campaign-forge/module-sdk";
import { Button, IconButton } from "../primitives/Button";
import { humanize, isRecord } from "../sheet/paths";
import { SchemaValueEditor } from "./SchemaValueEditor";
import type { WidgetProps } from "./types";

function itemSchemaOf(schema: JsonSchema | undefined): JsonSchema | undefined {
  const items = schema?.items;
  return isRecord(items) ? items : undefined;
}

function propertyEntries(schema: JsonSchema | undefined, sample?: unknown): Array<[string, JsonSchema | undefined]> {
  const props = isRecord(schema?.properties) ? schema.properties : undefined;
  if (props) return Object.entries(props).map(([k, v]) => [k, isRecord(v) ? v : undefined]);
  if (isRecord(sample)) return Object.keys(sample).map((k) => [k, undefined]);
  return [];
}

/** Generic array-of-objects editor driven by the item schema. */
export function ListField(props: WidgetProps) {
  const { value, onChange, readonly, schema, id } = props;
  const items = Array.isArray(value) ? value : [];
  const itemSchema = itemSchemaOf(schema);
  const update = (i: number, next: unknown) => onChange(items.map((it, j) => (j === i ? next : it)));
  const remove = (i: number) => onChange(items.filter((_, j) => j !== i));
  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= items.length) return;
    const copy = [...items];
    const a = copy[i];
    copy[i] = copy[j];
    copy[j] = a;
    onChange(copy);
  };
  const add = () => onChange([...items, itemSchema ? schemaDefaults(itemSchema) : {}]);
  return (
    <div className="cf-list">
      {items.length === 0 && <span className="cf-muted">Empty</span>}
      {items.map((it, i) => (
        <div key={i} className="cf-list__item">
          <div className="cf-list__fields">
            {isRecord(it) || itemSchema?.properties ? (
              propertyEntries(itemSchema, it).map(([key, sub]) => (
                <label key={key} className="cf-field">
                  <span className="cf-field__label">{typeof sub?.title === "string" ? sub.title : humanize(key)}</span>
                  <SchemaValueEditor
                    id={i === 0 && key === propertyEntries(itemSchema, it)[0]?.[0] ? id : undefined}
                    schema={sub}
                    label={`${humanize(key)} ${i + 1}`}
                    value={isRecord(it) ? it[key] : undefined}
                    readonly={readonly}
                    onChange={(v) => update(i, { ...(isRecord(it) ? it : {}), [key]: v })}
                  />
                </label>
              ))
            ) : (
              <SchemaValueEditor schema={itemSchema} label={`Item ${i + 1}`} value={it} readonly={readonly} onChange={(v) => update(i, v)} />
            )}
          </div>
          {!readonly && (
            <div className="cf-list__actions">
              <IconButton size="sm" variant="ghost" label={`Move item ${i + 1} up`} icon="↑" onClick={() => move(i, -1)} disabled={i === 0} />
              <IconButton size="sm" variant="ghost" label={`Move item ${i + 1} down`} icon="↓" onClick={() => move(i, 1)} disabled={i === items.length - 1} />
              <IconButton size="sm" variant="ghost" label={`Remove item ${i + 1}`} icon="×" onClick={() => remove(i)} />
            </div>
          )}
        </div>
      ))}
      {!readonly && (
        <div>
          <Button size="sm" onClick={add}>
            Add
          </Button>
        </div>
      )}
    </div>
  );
}

/** Nested object group: one primitive control per declared property. */
export function ObjectField(props: WidgetProps) {
  const { value, onChange, readonly, schema, id, errors } = props;
  const obj = isRecord(value) ? value : {};
  const entries = propertyEntries(schema, obj);
  if (entries.length === 0) return <span className="cf-muted">Empty</span>;
  return (
    <div className="cf-object" id={id}>
      {entries.map(([key, sub]) => (
        <div key={key} className="cf-field">
          <span className="cf-field__label">{typeof sub?.title === "string" ? sub.title : humanize(key)}</span>
          <SchemaValueEditor schema={sub} label={humanize(key)} value={obj[key]} readonly={readonly} onChange={(v) => onChange({ ...obj, [key]: v })} />
          {errors?.[key] && <span className="cf-field__error">{errors[key]}</span>}
        </div>
      ))}
    </div>
  );
}

/** Read-only key/value grid for quick stats. `config.keys` picks and orders the keys. */
export function StatBlockField({ value, computed, field }: WidgetProps) {
  const obj = isRecord(value) ? value : {};
  const keys = Array.isArray(field.config?.keys) ? (field.config.keys as unknown[]).map(String) : Object.keys(obj);
  const cells = keys.map((k) => {
    const v = obj[k] ?? computed[k];
    return { key: k, value: v };
  });
  if (cells.length === 0) return <span className="cf-muted">—</span>;
  return (
    <dl className="cf-statblock">
      {cells.map((c) => (
        <div key={c.key} className="cf-statblock__cell">
          <dt className="cf-statblock__key">{humanize(c.key)}</dt>
          <dd className="cf-statblock__value">{c.value === undefined || c.value === null ? "—" : isRecord(c.value) || Array.isArray(c.value) ? JSON.stringify(c.value) : String(c.value)}</dd>
        </div>
      ))}
    </dl>
  );
}

interface ColumnDef {
  key: string;
  label?: string;
  type?: string;
  readonly?: boolean;
}

function columnsOf(field: WidgetProps["field"], schema: JsonSchema | undefined, sample: unknown): ColumnDef[] {
  const cfg = field.config?.columns;
  if (Array.isArray(cfg)) {
    return (cfg as unknown[]).map((c) => (typeof c === "string" ? { key: c } : isRecord(c) ? { key: String(c.key), label: typeof c.label === "string" ? c.label : undefined, type: typeof c.type === "string" ? c.type : undefined, readonly: c.readonly === true } : { key: String(c) }));
  }
  return propertyEntries(itemSchemaOf(schema), sample).map(([key]) => ({ key }));
}

/** Array rendered as a table with one editable cell per configured column. */
export function TableField(props: WidgetProps) {
  const { value, onChange, readonly, schema, field, id } = props;
  const rows = Array.isArray(value) ? value : [];
  const cols = columnsOf(field, schema, rows[0]);
  const itemSchema = itemSchemaOf(schema);
  const subSchema = (key: string, col: ColumnDef): JsonSchema | undefined => {
    const p = isRecord(itemSchema?.properties) ? itemSchema.properties[key] : undefined;
    if (isRecord(p)) return p;
    return col.type ? { type: col.type } : undefined;
  };
  const update = (i: number, key: string, v: unknown) => onChange(rows.map((r, j) => (j === i ? { ...(isRecord(r) ? r : {}), [key]: v } : r)));
  return (
    <div>
      <table className="cf-table" id={id}>
        <thead>
          <tr>
            {cols.map((c) => (
              <th key={c.key} scope="col">
                {c.label ?? humanize(c.key)}
              </th>
            ))}
            {!readonly && <th scope="col" />}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr>
              <td colSpan={cols.length + 1} className="cf-muted">
                Empty
              </td>
            </tr>
          )}
          {rows.map((r, i) => (
            <tr key={i}>
              {cols.map((c) => (
                <td key={c.key}>
                  <SchemaValueEditor schema={subSchema(c.key, c)} label={`${c.label ?? humanize(c.key)} ${i + 1}`} value={isRecord(r) ? r[c.key] : undefined} readonly={readonly || c.readonly} onChange={(v) => update(i, c.key, v)} />
                </td>
              ))}
              {!readonly && (
                <td>
                  <IconButton size="sm" variant="ghost" label={`Remove row ${i + 1}`} icon="×" onClick={() => onChange(rows.filter((_, j) => j !== i))} />
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
      {!readonly && (
        <Button size="sm" onClick={() => onChange([...rows, itemSchema ? schemaDefaults(itemSchema) : {}])}>
          Add row
        </Button>
      )}
    </div>
  );
}
