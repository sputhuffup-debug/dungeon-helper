import { useMemo } from "react";
import { useSheetContext } from "../context";
import { cx } from "../sheet/paths";
import type { Option, WidgetProps } from "./types";
import { configNumber, configString, filterOptions, resolveOptions } from "./types";

/** What a suggestion shows next to its name: the supplement it comes from, its edition, or the list item's parent (class, race). */
function suggestionLabel(o: Option): string {
  const item = o.item;
  if (!item) return "";
  const bits = [item.edition, item.source].filter((x): x is string => typeof x === "string" && x !== "");
  return bits.join(" · ");
}

/** The reference item a text field's value names (exactly, ignoring case and outer spaces), if it has one. */
function namedItem(options: Option[], value: string): Option["item"] {
  const want = value.trim().toLowerCase();
  if (!want) return undefined;
  return options.find((o) => o.item && o.item.name.trim().toLowerCase() === want)?.item;
}

/**
 * A free-text field. With `options` (a list, or `{ ref }` to a reference
 * list) it suggests values as you type (a native datalist of item names,
 * supplement items included) but still takes any text; `config.optionsFilter`
 * narrows the suggestions by a sibling field (see `filterOptions`). When the
 * value names a list item that has a `summary`, the summary shows under the
 * field as a hint (e.g. a background's ability scores and feat); nothing is
 * applied to the sheet.
 */
export function TextField({ id, value, onChange, readonly, invalid, field, schema, referenceLists, fields }: WidgetProps) {
  const { mode } = useSheetContext();
  const str = value === undefined || value === null ? "" : String(value);
  const all = useMemo(() => (field.options ? resolveOptions(field, schema, referenceLists, mode) : []), [field, schema, referenceLists, mode]);
  const suggestions = useMemo(() => {
    // a text field stores the name, not the item id
    const seen = new Set<string>();
    return filterOptions(all, field, fields)
      .map((o) => ({ value: o.item ? o.item.name : o.value, label: suggestionLabel(o) }))
      .filter((o) => (seen.has(o.value) ? false : (seen.add(o.value), true)));
  }, [all, field, fields]);
  const picked = useMemo(() => namedItem(all, str), [all, str]);
  const hint = typeof picked?.summary === "string" && picked.summary !== "" ? (
    <p className="cf-field__help" data-testid={`hint-${field.path}`}>
      {picked.summary}
    </p>
  ) : null;
  if (readonly)
    return (
      <>
        <div className="cf-field__readonly">{str || <span className="cf-muted">—</span>}</div>
        {hint}
      </>
    );
  const maxLength = configNumber(field, "maxLength") ?? (typeof schema?.maxLength === "number" ? schema.maxLength : undefined);
  const listId = suggestions.length > 0 ? `${id}-options` : undefined;
  return (
    <>
      <input
        id={id}
        className={cx("cf-input", invalid && "cf-input--invalid")}
        type="text"
        value={str}
        maxLength={maxLength}
        placeholder={configString(field, "placeholder")}
        aria-invalid={invalid || undefined}
        list={listId}
        autoComplete={listId ? "off" : undefined}
        onChange={(e) => onChange(e.target.value === "" ? undefined : e.target.value)}
      />
      {listId && (
        <datalist id={listId} data-testid={`options-${field.path}`}>
          {suggestions.map((o) => (
            <option key={o.value} value={o.value} label={o.label || undefined} />
          ))}
        </datalist>
      )}
      {hint}
    </>
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
