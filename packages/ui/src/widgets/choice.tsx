import { useMemo, useState } from "react";
import { useSheetContext } from "../context";
import { Button } from "../primitives/Button";
import { cx } from "../sheet/paths";
import { schemaType } from "./SchemaValueEditor";
import type { WidgetProps } from "./types";
import { filterOptions, resolveOptions } from "./types";

export function SelectField({ id, value, onChange, readonly, invalid, field, schema, referenceLists }: WidgetProps) {
  const { mode } = useSheetContext();
  const options = resolveOptions(field, schema, referenceLists, mode);
  const str = value === undefined || value === null ? "" : String(value);
  const current = options.find((o) => o.value === str);
  // a number field with labelled values (a proficiency rank) stores the number
  const numeric = schemaType(schema) === "integer" || schemaType(schema) === "number";
  if (readonly) return <div className="cf-field__readonly">{(current?.label ?? str) || <span className="cf-muted">—</span>}</div>;
  return (
    <select
      id={id}
      className={cx("cf-select", invalid && "cf-select--invalid")}
      value={str}
      aria-invalid={invalid || undefined}
      onChange={(e) => onChange(e.target.value === "" ? undefined : numeric ? Number(e.target.value) : e.target.value)}
    >
      <option value="">—</option>
      {!current && str !== "" && <option value={str}>{str}</option>}
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.item?.source ? `${o.label} (${o.item.source})` : o.label}
        </option>
      ))}
    </select>
  );
}

export function MultiSelectField({ id, value, onChange, readonly, field, schema, referenceLists }: WidgetProps) {
  const { mode } = useSheetContext();
  const options = resolveOptions(field, schema, referenceLists, mode);
  const selected = Array.isArray(value) ? value.map(String) : [];
  const toggle = (v: string, on: boolean) => {
    const next = on ? [...selected.filter((s) => s !== v), v] : selected.filter((s) => s !== v);
    onChange(next);
  };
  return (
    <div className="cf-multiselect" role="group" id={id}>
      {options.map((o) => (
        <label key={o.value} className="cf-check">
          <input className="cf-checkbox" type="checkbox" checked={selected.includes(o.value)} disabled={readonly} onChange={(e) => toggle(o.value, e.target.checked)} />
          <span>{o.label}</span>
        </label>
      ))}
      {options.length === 0 && <span className="cf-muted">No options</span>}
    </div>
  );
}

/**
 * A list of short strings. With `options` (`{ ref }` to a reference list) it
 * suggests the items' names as you type (narrowed by `config.optionsFilter`,
 * e.g. spells of the character's class), still taking any text, and a chip
 * that names an item shows its summary as a tooltip.
 */
export function TagsField({ id, value, onChange, readonly, field, schema, referenceLists, fields }: WidgetProps) {
  const { mode } = useSheetContext();
  const tags = Array.isArray(value) ? value.map(String) : [];
  const [draft, setDraft] = useState("");
  const options = useMemo(() => (field.options && !Array.isArray(field.options) ? filterOptions(resolveOptions(field, schema, referenceLists, mode), field, fields) : []), [field, schema, referenceLists, mode, fields]);
  const byName = useMemo(() => new Map(options.filter((o) => o.item).map((o) => [o.item!.name.toLowerCase(), o.item!])), [options]);
  const listId = options.length > 0 ? `${id}-options` : undefined;
  const add = () => {
    const t = draft.trim();
    if (!t) return;
    if (!tags.includes(t)) onChange([...tags, t]);
    setDraft("");
  };
  const remove = (t: string) => onChange(tags.filter((x) => x !== t));
  return (
    <div className="cf-tags">
      <div className="cf-chips">
        {tags.length === 0 && readonly && <span className="cf-muted">—</span>}
        {tags.map((t) => (
          <span key={t} className="cf-chip" title={typeof byName.get(t.toLowerCase())?.summary === "string" ? String(byName.get(t.toLowerCase())!.summary) : undefined}>
            {t}
            {!readonly && (
              <button type="button" className="cf-chip__remove" aria-label={`Remove ${t}`} onClick={() => remove(t)}>
                ×
              </button>
            )}
          </span>
        ))}
      </div>
      {!readonly && (
        <div className="cf-tags__input">
          <input
            id={id}
            className="cf-input"
            type="text"
            value={draft}
            placeholder={typeof field.config?.placeholder === "string" ? field.config.placeholder : "Add…"}
            list={listId}
            autoComplete={listId ? "off" : undefined}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === ",") {
                e.preventDefault();
                add();
              } else if (e.key === "Backspace" && draft === "" && tags.length > 0) {
                remove(tags[tags.length - 1] as string);
              }
            }}
          />
          <Button onClick={add} disabled={!draft.trim()}>
            Add
          </Button>
          {listId && (
            <datalist id={listId} data-testid={`options-${field.path}`}>
              {options
                .filter((o) => o.item && !tags.includes(o.item.name))
                .map((o) => (
                  <option key={o.value} value={o.item!.name} />
                ))}
            </datalist>
          )}
        </div>
      )}
    </div>
  );
}
