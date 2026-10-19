/**
 * The map generator's brief, generated from its `inputs` JSON Schema:
 * scalars (enum, number, boolean, text) as in the procedure workbench,
 * enum lists as checkbox groups, scalar lists as comma-separated text,
 * object lists as an editable table, and nested objects as fieldsets.
 * Fields filled from an adventure carry a "from adventure" badge.
 */
import type { ReactNode } from "react";
import { Badge, Button, IconButton, SchemaValueEditor } from "../../components/ui";
import { humanize } from "../../lib/format";
import { ScalarInput } from "../generate/InputForm";
import { schemaTypeOf, type Schema } from "../generate/prefill";

export interface BriefFormProps {
  schema: Schema;
  value: Record<string, unknown>;
  onChange: (next: Record<string, unknown>) => void;
  /** Top-level keys whose value came from the adventure. */
  fromAdventure?: string[];
}

export function BriefForm({ schema, value, onChange, fromAdventure = [] }: BriefFormProps) {
  const props = schema.properties ?? {};
  const keys = Object.keys(props);
  const set = (key: string, v: unknown) => {
    const next = { ...value };
    if (v === undefined) delete next[key];
    else next[key] = v;
    onChange(next);
  };
  if (keys.length === 0) return <p className="cf-muted">This generator takes no settings.</p>;
  const wide = (s: Schema) => isObjectList(s) || schemaTypeOf(s) === "object";
  return (
    <div className="mapgen-brief" data-testid="map-brief">
      {keys.map((key) => {
        const s = props[key] as Schema;
        const from = fromAdventure.includes(key);
        return (
          <div key={key} className={`mapgen-brief__field${wide(s) ? " is-wide" : ""}${from ? " is-from-adventure" : ""}`} data-field={key}>
            <SchemaField name={key} label={s.title ?? humanize(key)} schema={s} value={value[key]} onChange={(v) => set(key, v)} badge={from ? <Badge tone="accent">from adventure</Badge> : undefined} />
          </div>
        );
      })}
    </div>
  );
}

/** Display label for an enum value: the schema's `enumLabels` when given, else the value humanized. */
export function enumLabel(schema: Schema | undefined, value: unknown): string {
  const labels = (schema as { enumLabels?: unknown } | undefined)?.enumLabels;
  const i = schema?.enum?.findIndex((x) => x === value) ?? -1;
  if (Array.isArray(labels) && i >= 0 && typeof labels[i] === "string") return labels[i] as string;
  return humanize(String(value));
}

/** An enum as a select with the schema's labels; "Generator decides" when there is no default. */
function EnumSelect({ schema, label, value, onChange }: { schema: Schema; label: string; value: unknown; onChange: (v: unknown) => void }) {
  const options = schema.enum ?? [];
  const showEmpty = schema.default === undefined || value === undefined;
  return (
    <select
      className="cf-select"
      aria-label={label}
      value={value === undefined ? "" : String(value)}
      onChange={(e) => {
        const raw = e.target.value;
        if (raw === "") return onChange(undefined);
        onChange(options.find((x) => String(x) === raw) ?? raw);
      }}
    >
      {showEmpty && <option value="">{schema.default === undefined ? "Generator decides" : "Default"}</option>}
      {options.map((opt) => (
        <option key={String(opt)} value={String(opt)}>
          {enumLabel(schema, opt)}
        </option>
      ))}
    </select>
  );
}

function isEnumList(s: Schema): boolean {
  return schemaTypeOf(s) === "array" && Array.isArray(s.items?.enum);
}

function isScalarList(s: Schema): boolean {
  const t = schemaTypeOf(s.items);
  return schemaTypeOf(s) === "array" && !Array.isArray(s.items?.enum) && (t === "string" || t === "number" || t === "integer");
}

function isObjectList(s: Schema): boolean {
  return schemaTypeOf(s) === "array" && (schemaTypeOf(s.items) === "object" || !!s.items?.properties);
}

function FieldLabel({ label, badge, schema }: { label: string; badge?: ReactNode; schema: Schema }) {
  return (
    <span className="mapgen-brief__label">
      {label} {badge}
      {schema.description && <span className="cf-muted mapgen-brief__help">{schema.description}</span>}
    </span>
  );
}

function SchemaField({ name, label, schema, value, onChange, badge, compact }: { name: string; label: string; schema: Schema; value: unknown; onChange: (v: unknown) => void; badge?: ReactNode; compact?: boolean }) {
  if (Array.isArray(schema.enum)) {
    const select = <EnumSelect schema={schema} label={label} value={value} onChange={onChange} />;
    if (compact) return select;
    return (
      <label className="app-label">
        <FieldLabel label={label} badge={badge} schema={schema} />
        {select}
      </label>
    );
  }
  if (compact && !isEnumList(schema) && !isObjectList(schema) && !isScalarList(schema) && schemaTypeOf(schema) !== "object" && schemaTypeOf(schema) !== "array") {
    return <ScalarInput name={name} schema={{ ...schema, title: label }} value={value} onChange={onChange} />;
  }
  if (isEnumList(schema)) {
    const options = schema.items?.enum ?? [];
    const list = Array.isArray(value) ? value : [];
    return (
      <fieldset className="app-fieldset mapgen-brief__group">
        <legend className="app-label">
          <FieldLabel label={label} badge={badge} schema={schema} />
        </legend>
        <div className="mapgen-brief__checks">
          {options.map((opt) => (
            <label key={String(opt)} className="mapgen-brief__check">
              <input
                type="checkbox"
                className="cf-checkbox"
                checked={list.some((x) => x === opt)}
                onChange={(e) => onChange(e.target.checked ? [...list.filter((x) => x !== opt), opt] : list.filter((x) => x !== opt))}
              />
              <span>{enumLabel(schema.items, opt)}</span>
            </label>
          ))}
        </div>
      </fieldset>
    );
  }
  if (isScalarList(schema)) {
    const numeric = schemaTypeOf(schema.items) !== "string";
    const list = Array.isArray(value) ? value : [];
    return (
      <label className="app-label">
        <FieldLabel label={label} badge={badge} schema={schema} />
        <input
          key={JSON.stringify(list)}
          className="cf-input"
          aria-label={label}
          placeholder="Comma-separated"
          defaultValue={list.join(", ")}
          onBlur={(e) => {
            const parts = e.target.value
              .split(",")
              .map((p) => p.trim())
              .filter(Boolean);
            const next = numeric ? parts.map(Number).filter((n) => Number.isFinite(n)) : parts;
            onChange(next.length ? next : undefined);
          }}
        />
      </label>
    );
  }
  if (isObjectList(schema)) return <ObjectList name={name} label={label} schema={schema} value={value} onChange={onChange} badge={badge} />;
  if (schemaTypeOf(schema) === "object" && schema.properties) {
    const obj = value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
    return (
      <fieldset className="app-fieldset mapgen-brief__group">
        <legend className="app-label">
          <FieldLabel label={label} badge={badge} schema={schema} />
        </legend>
        <div className="mapgen-brief">
          {Object.entries(schema.properties).map(([k, s]) => (
            <div key={k} className="mapgen-brief__field">
              <SchemaField
                name={`${name}.${k}`}
                label={s.title ?? humanize(k)}
                schema={s}
                value={obj[k]}
                onChange={(v) => {
                  const next = { ...obj };
                  if (v === undefined) delete next[k];
                  else next[k] = v;
                  onChange(Object.keys(next).length ? next : undefined);
                }}
              />
            </div>
          ))}
        </div>
      </fieldset>
    );
  }
  const t = schemaTypeOf(schema);
  if (t === "array" || t === "object") {
    return (
      <label className="app-label">
        <FieldLabel label={label} badge={badge} schema={schema} />
        <SchemaValueEditor schema={schema} value={value} onChange={onChange} label={label} />
      </label>
    );
  }
  return (
    <label className="app-label">
      <FieldLabel label={label} badge={badge} schema={schema} />
      <ScalarInput name={name} schema={{ ...schema, title: label }} value={value} onChange={onChange} />
    </label>
  );
}

/** A list of objects (key rooms, puzzles, threats...) as a table with one row per item. */
function ObjectList({ name, label, schema, value, onChange, badge }: { name: string; label: string; schema: Schema; value: unknown; onChange: (v: unknown) => void; badge?: ReactNode }) {
  const items = Array.isArray(value) ? (value as Array<Record<string, unknown>>) : [];
  const cols = Object.entries(schema.items?.properties ?? {});
  const setItem = (i: number, key: string, v: unknown) =>
    onChange(
      items.map((it, j) => {
        if (j !== i) return it;
        const next = { ...it };
        if (v === undefined) delete next[key];
        else next[key] = v;
        return next;
      }),
    );
  const blank = (): Record<string, unknown> => {
    const out: Record<string, unknown> = {};
    for (const [k, s] of cols) if (s.default !== undefined) out[k] = JSON.parse(JSON.stringify(s.default));
    return out;
  };
  return (
    <fieldset className="app-fieldset mapgen-brief__group" data-testid={`brief-list-${name}`}>
      <legend className="app-label">
        <FieldLabel label={label} badge={badge} schema={schema} />
      </legend>
      {items.length === 0 ? (
        <p className="cf-muted">None. The generator fills this in.</p>
      ) : (
        <div className="mapgen-table-wrap">
          <table className="cf-table mapgen-brief__table">
            <thead>
              <tr>
                {cols.map(([k, s]) => (
                  <th key={k}>{s.title ?? humanize(k)}</th>
                ))}
                <th />
              </tr>
            </thead>
            <tbody>
              {items.map((it, i) => (
                <tr key={i}>
                  {cols.map(([k, s]) => (
                    <td key={k}>
                      <SchemaField compact name={`${name}.${i}.${k}`} label={`${label} ${i + 1} ${s.title ?? humanize(k)}`} schema={s} value={it[k]} onChange={(v) => setItem(i, k, v)} />
                    </td>
                  ))}
                  <td>
                    <IconButton size="sm" variant="ghost" label={`Remove ${label} ${i + 1}`} icon="×" onClick={() => onChange(items.filter((_, j) => j !== i))} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="app-row">
        <Button size="sm" onClick={() => onChange([...items, blank()])}>
          + Add
        </Button>
      </div>
    </fieldset>
  );
}
