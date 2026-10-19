import { useId, useMemo, type CSSProperties } from "react";
import {
  computeFields,
  fieldSchemaAt,
  getPath,
  schemaAt,
  setPath,
  sheetFieldsForMode,
  type EntityTypeDef,
  type FieldValidationError,
  type JsonSchema,
  type PlayModeId,
  type ReferenceList,
  type SheetField,
  type SheetSection,
} from "@campaign-forge/module-sdk";
import { SheetContextProvider, type SheetContextValue } from "../context";
import { getWidget } from "../widgets/registry";
import { schemaType } from "../widgets/SchemaValueEditor";
import type { WidgetProps } from "../widgets/types";
import "../widgets/defaults";
import { cx, isRecord, labelFromPath, valuePathOf } from "./paths";

export type SheetErrors = Record<string, string> | FieldValidationError[];

export interface SheetRendererProps extends Omit<SheetContextValue, "tableMode" | "mode"> {
  def: EntityTypeDef;
  subtype?: string;
  mode: PlayModeId;
  fields: Record<string, unknown>;
  onChange: (fields: Record<string, unknown>) => void;
  /** Derived values; computed from `def.computed` when omitted. */
  computed?: Record<string, unknown>;
  readonly?: boolean;
  referenceLists?: Record<string, ReferenceList>;
  /** Validation errors: path -> message, or the sdk's error list. */
  errors?: SheetErrors;
  tableMode?: boolean;
  className?: string;
  /** Only render these section ids (e.g. a quick-stats card). */
  sections?: string[];
  /**
   * Only render these field paths, in this order, as one untitled grid (e.g.
   * the fields a builder step asks for). A path missing from the sheet is
   * rendered with the widget its schema (or computed value) suggests.
   */
  paths?: string[];
}

export function normalizeErrors(errors: SheetErrors | undefined): Record<string, string> {
  if (!errors) return {};
  if (Array.isArray(errors)) {
    const out: Record<string, string> = {};
    for (const e of errors) out[e.path] = out[e.path] ? `${out[e.path]}; ${e.message}` : e.message;
    return out;
  }
  return errors;
}

/** Pick a widget kind from the schema (and the current value) when the field declares none. */
export function defaultWidgetFor(field: SheetField, schema: JsonSchema | undefined, value: unknown, computed: Record<string, unknown>, path: string): string {
  if (field.widget) return field.widget;
  if (!schema && path in computed) return "computed";
  const type = schemaType(schema) ?? (Array.isArray(value) ? "array" : isRecord(value) ? "object" : typeof value === "number" ? "number" : typeof value === "boolean" ? "boolean" : "string");
  switch (type) {
    case "string": {
      if (Array.isArray(schema?.enum)) return "select";
      const maxLength = typeof schema?.maxLength === "number" ? schema.maxLength : undefined;
      if (schema?.format === "markdown" || (maxLength !== undefined && maxLength > 200)) return "textarea";
      return "text";
    }
    case "number":
    case "integer":
      return "number";
    case "boolean":
      return "checkbox";
    case "array": {
      const items = isRecord(schema?.items) ? (schema.items as JsonSchema) : undefined;
      const itemType = schemaType(items);
      if (items && Array.isArray(items.enum)) return "multiselect";
      if (itemType === "string" || (!items && Array.isArray(value) && value.every((v) => typeof v === "string"))) return "tags";
      return "list";
    }
    case "object":
      return "object";
    default:
      return "text";
  }
}

export function SheetRenderer(props: SheetRendererProps) {
  const {
    def,
    subtype,
    mode,
    fields,
    onChange,
    computed: computedProp,
    readonly = false,
    referenceLists = {},
    errors,
    tableMode = false,
    className,
    sections: onlySections,
    paths: onlyPaths,
    onRoll,
    onOpenRule,
    onPickEntity,
    resolveEntityName,
    resolveAssetUrl,
    onOpenMap,
    castMembers,
  } = props;

  const computed = useMemo(() => computedProp ?? computeFields(def, fields), [computedProp, def, fields]);
  const errorMap = useMemo(() => normalizeErrors(errors), [errors]);
  const sub = subtype ? def.subtypes?.find((s) => s.id === subtype) : undefined;

  const sections = useMemo(() => {
    const base = sheetFieldsForMode(def, mode);
    const extra = sub?.sheet ? sheetFieldsForMode({ ...def, sheet: sub.sheet }, mode) : [];
    const all = [...base, ...extra];
    if (onlyPaths) {
      const byPath = new Map<string, SheetField>();
      for (const section of all) for (const f of section.fields) if (!byPath.has(f.path)) byPath.set(f.path, f);
      const fields = onlyPaths.map((p) => byPath.get(p) ?? { path: p });
      return [{ id: "_paths", title: "", fields } satisfies SheetSection];
    }
    return onlySections ? all.filter((s) => onlySections.includes(s.id)) : all;
  }, [def, mode, sub, onlySections, onlyPaths]);

  const ctx = useMemo<SheetContextValue>(
    () => ({ mode, tableMode, onRoll, onOpenRule, onPickEntity, resolveEntityName, resolveAssetUrl, onOpenMap, castMembers }),
    [mode, tableMode, onRoll, onOpenRule, onPickEntity, resolveEntityName, resolveAssetUrl, onOpenMap, castMembers],
  );

  const schemaFor = (path: string): JsonSchema | undefined => {
    const own = fieldSchemaAt(def, path);
    if (own) return own;
    return sub?.schema ? schemaAt(sub.schema, path) : undefined;
  };

  return (
    <SheetContextProvider value={ctx}>
      <div className={cx("cf-sheet", tableMode && "cf-table-mode", className)} data-entity-type={def.id}>
        {sections.map((section) => (
          <SheetSectionView
            key={section.id}
            section={section}
            def={def}
            fields={fields}
            computed={computed}
            readonly={readonly}
            referenceLists={referenceLists}
            errorMap={errorMap}
            schemaFor={schemaFor}
            onChange={onChange}
            onOpenRule={onOpenRule}
          />
        ))}
      </div>
    </SheetContextProvider>
  );
}

interface SectionProps {
  section: SheetSection;
  def: EntityTypeDef;
  fields: Record<string, unknown>;
  computed: Record<string, unknown>;
  readonly: boolean;
  referenceLists: Record<string, ReferenceList>;
  errorMap: Record<string, string>;
  schemaFor: (path: string) => JsonSchema | undefined;
  onChange: (fields: Record<string, unknown>) => void;
  onOpenRule?: (ruleId: string) => void;
}

function SheetSectionView({ section, def, fields, computed, readonly, referenceLists, errorMap, schemaFor, onChange, onOpenRule }: SectionProps) {
  const defaultSpan = section.columns && section.columns > 0 ? Math.max(1, Math.floor(12 / section.columns)) : 12;
  const grid = (
    <div className="cf-sheet__grid">
      {section.fields.map((field) => (
        <SheetFieldView
          key={field.path}
          field={field}
          span={Math.min(12, Math.max(1, field.span ?? defaultSpan))}
          def={def}
          fields={fields}
          computed={computed}
          readonly={readonly}
          referenceLists={referenceLists}
          errorMap={errorMap}
          schemaFor={schemaFor}
          onChange={onChange}
          onOpenRule={onOpenRule}
        />
      ))}
    </div>
  );
  // An untitled section (the `paths` view) is a plain grid, not a collapsible block.
  if (!section.title) {
    return (
      <div className="cf-sheet__section cf-sheet__section--plain" data-section={section.id}>
        {grid}
      </div>
    );
  }
  return (
    <details className="cf-sheet__section" open={!section.collapsed} data-section={section.id}>
      <summary className="cf-sheet__section-title">{section.title}</summary>
      {grid}
    </details>
  );
}

interface FieldViewProps extends Omit<SectionProps, "section"> {
  field: SheetField;
  span: number;
}

function SheetFieldView({ field, span, def, fields, computed, readonly, referenceLists, errorMap, schemaFor, onChange, onOpenRule }: FieldViewProps) {
  const id = useId();
  const path = valuePathOf(field.path);
  // Widgets edit the value at `path`, so prefer its schema over the wildcard one.
  const schema = path ? schemaFor(path) ?? schemaFor(field.path) : undefined;
  const value = path ? getPath(fields, path) : fields;
  const kind = defaultWidgetFor(field, schema, value, computed, path);
  const Widget = getWidget(kind) ?? getWidget(defaultWidgetFor({ ...field, widget: undefined }, schema, value, computed, path)) ?? getWidget("text");
  const isReadonly = readonly || field.readonly === true || kind === "computed";
  const label = field.label ?? labelFromPath(field.path);

  const ownError = errorMap[path];
  const nested: Record<string, string> = {};
  const prefix = path ? `${path}.` : "";
  for (const [p, msg] of Object.entries(errorMap)) {
    if (p !== path && p.startsWith(prefix)) nested[p.slice(prefix.length)] = msg;
  }
  const messages = [ownError, ...Object.entries(nested).map(([p, m]) => `${p}: ${m}`)].filter((m): m is string => !!m);

  const widgetProps: WidgetProps = {
    field,
    path,
    value,
    schema,
    def,
    fields,
    computed,
    readonly: isReadonly,
    referenceLists,
    errors: Object.keys(nested).length ? nested : undefined,
    id,
    invalid: messages.length > 0,
    onChange: (next) => {
      if (isReadonly) return;
      if (!path) {
        if (isRecord(next)) onChange(next);
        return;
      }
      onChange(setPath(fields, path, next));
    },
  };

  const style = { "--cf-span": span } as CSSProperties;
  const labelFor = kind === "checkbox" ? undefined : id;
  return (
    <div className={cx("cf-sheet__field", `cf-field`, `cf-field--${kind}`, isReadonly && "cf-field--readonly")} style={style} data-path={field.path}>
      <div className="cf-field__head">
        <label className="cf-field__label" htmlFor={labelFor} id={`${id}-label`}>
          {label}
        </label>
        {field.rule && (
          <button type="button" className="cf-field__rule" aria-label={`Rule for ${label}`} title={field.rule} onClick={() => onOpenRule?.(field.rule as string)} disabled={!onOpenRule}>
            ?
          </button>
        )}
      </div>
      <div className="cf-field__control" aria-labelledby={`${id}-label`}>
        {Widget ? <Widget {...widgetProps} /> : <span className="cf-muted">No widget for {kind}</span>}
      </div>
      {messages.map((m, i) => (
        <div key={i} className="cf-field__error" role="alert">
          {m}
        </div>
      ))}
    </div>
  );
}
