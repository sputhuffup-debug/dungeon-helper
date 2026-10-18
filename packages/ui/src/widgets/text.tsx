import { cx } from "../sheet/paths";
import type { WidgetProps } from "./types";
import { configNumber, configString } from "./types";

export function TextField({ id, value, onChange, readonly, invalid, field, schema }: WidgetProps) {
  const str = value === undefined || value === null ? "" : String(value);
  if (readonly) return <div className="cf-field__readonly">{str || <span className="cf-muted">—</span>}</div>;
  const maxLength = configNumber(field, "maxLength") ?? (typeof schema?.maxLength === "number" ? schema.maxLength : undefined);
  return (
    <input
      id={id}
      className={cx("cf-input", invalid && "cf-input--invalid")}
      type="text"
      value={str}
      maxLength={maxLength}
      placeholder={configString(field, "placeholder")}
      aria-invalid={invalid || undefined}
      onChange={(e) => onChange(e.target.value === "" ? undefined : e.target.value)}
    />
  );
}

export function TextAreaField({ id, value, onChange, readonly, invalid, field }: WidgetProps) {
  const str = value === undefined || value === null ? "" : String(value);
  if (readonly) return <div className="cf-field__readonly" style={{ whiteSpace: "pre-wrap" }}>{str || <span className="cf-muted">—</span>}</div>;
  const rows = configNumber(field, "rows", 4);
  return (
    <textarea
      id={id}
      className={cx("cf-textarea", invalid && "cf-textarea--invalid")}
      value={str}
      rows={rows}
      placeholder={configString(field, "placeholder")}
      aria-invalid={invalid || undefined}
      onChange={(e) => onChange(e.target.value === "" ? undefined : e.target.value)}
    />
  );
}
