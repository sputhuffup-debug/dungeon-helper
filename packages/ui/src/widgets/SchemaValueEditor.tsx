import type { JsonSchema } from "@campaign-forge/module-sdk";
import { asNumber, isRecord } from "../sheet/paths";

export interface SchemaValueEditorProps {
  schema?: JsonSchema;
  value: unknown;
  onChange: (value: unknown) => void;
  readonly?: boolean;
  label: string;
  id?: string;
}

export function schemaType(schema: JsonSchema | undefined): string | undefined {
  if (!schema) return undefined;
  const t = schema.type;
  if (Array.isArray(t)) return (t as unknown[]).find((x) => x !== "null") as string | undefined;
  if (typeof t === "string") return t;
  if (schema.enum) return "string";
  if (schema.properties) return "object";
  if (schema.items) return "array";
  return undefined;
}

/** A primitive control chosen from a JSON Schema: enum -> select, number, boolean, else text. */
export function SchemaValueEditor({ schema, value, onChange, readonly, label, id }: SchemaValueEditorProps) {
  const type = schemaType(schema);
  const en = schema?.enum;
  if (Array.isArray(en)) {
    const str = value === undefined || value === null ? "" : String(value);
    if (readonly) return <span>{str || "—"}</span>;
    return (
      <select id={id} className="cf-select" aria-label={label} value={str} onChange={(e) => onChange(e.target.value === "" ? undefined : e.target.value)}>
        <option value="">—</option>
        {en.map((v) => (
          <option key={String(v)} value={String(v)}>
            {String(v)}
          </option>
        ))}
      </select>
    );
  }
  if (type === "number" || type === "integer") {
    const n = asNumber(value, NaN);
    if (readonly) return <span className="cf-mono">{Number.isFinite(n) ? n : "—"}</span>;
    return (
      <input
        id={id}
        className="cf-input"
        type="number"
        aria-label={label}
        value={Number.isFinite(n) ? n : ""}
        min={typeof schema?.minimum === "number" ? schema.minimum : undefined}
        max={typeof schema?.maximum === "number" ? schema.maximum : undefined}
        step={type === "integer" ? 1 : "any"}
        onChange={(e) => onChange(e.target.value === "" ? undefined : Number(e.target.value))}
      />
    );
  }
  if (type === "boolean") {
    return <input id={id} className="cf-checkbox" type="checkbox" aria-label={label} checked={value === true} disabled={readonly} onChange={(e) => onChange(e.target.checked)} />;
  }
  if (type === "array" || type === "object" || isRecord(value) || Array.isArray(value)) {
    const text = value === undefined ? "" : JSON.stringify(value);
    if (readonly) return <span className="cf-mono">{text || "—"}</span>;
    return (
      <input
        id={id}
        className="cf-input cf-mono"
        aria-label={label}
        defaultValue={text}
        onBlur={(e) => {
          const raw = e.target.value.trim();
          if (raw === "") return onChange(undefined);
          try {
            onChange(JSON.parse(raw));
          } catch {
            /* keep previous value on malformed JSON */
          }
        }}
      />
    );
  }
  const str = value === undefined || value === null ? "" : String(value);
  if (readonly) return <span style={{ whiteSpace: "pre-wrap" }}>{str || "—"}</span>;
  // Long text (a schema allowing more than 200 characters, or markdown) gets a text area, as the sheet's own default widget does.
  const long = schema?.format === "markdown" || (typeof schema?.maxLength === "number" && schema.maxLength > 200);
  if (long) return <textarea id={id} className="cf-textarea" rows={Math.min(8, Math.max(2, Math.ceil(str.length / 80)))} aria-label={label} value={str} onChange={(e) => onChange(e.target.value === "" ? undefined : e.target.value)} />;
  return <input id={id} className="cf-input" type="text" aria-label={label} value={str} onChange={(e) => onChange(e.target.value === "" ? undefined : e.target.value)} />;
}
