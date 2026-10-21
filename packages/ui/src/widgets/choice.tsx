import { useState } from "react";
import { useSheetContext } from "../context";
import { Button } from "../primitives/Button";
import { cx } from "../sheet/paths";
import type { WidgetProps } from "./types";
import { resolveOptions } from "./types";

export function SelectField({ id, value, onChange, readonly, invalid, field, schema, referenceLists }: WidgetProps) {
  const { mode } = useSheetContext();
  const options = resolveOptions(field, schema, referenceLists, mode);
  const str = value === undefined || value === null ? "" : String(value);
  const current = options.find((o) => o.value === str);
  if (readonly) return <div className="cf-field__readonly">{(current?.label ?? str) || <span className="cf-muted">—</span>}</div>;
  return (
    <select
      id={id}
      className={cx("cf-select", invalid && "cf-select--invalid")}
      value={str}
      aria-invalid={invalid || undefined}
      onChange={(e) => onChange(e.target.value === "" ? undefined : e.target.value)}
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

export function TagsField({ id, value, onChange, readonly, field }: WidgetProps) {
  const tags = Array.isArray(value) ? value.map(String) : [];
  const [draft, setDraft] = useState("");
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
          <span key={t} className="cf-chip">
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
        </div>
      )}
    </div>
  );
}
