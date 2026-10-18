import type { ComponentType } from "react";
import type { EntityTypeDef, JsonSchema, PlayModeId, ReferenceItem, ReferenceList, SheetField } from "@campaign-forge/module-sdk";
import { isRecord } from "../sheet/paths";

/** Props every sheet widget receives from the renderer. */
export interface WidgetProps {
  field: SheetField;
  /** Dotted path of the value this widget edits ("skills.*" -> "skills"). */
  path: string;
  value: unknown;
  onChange: (value: unknown) => void;
  /** Sub-schema at `path`, when the entity schema declares one. */
  schema?: JsonSchema;
  def?: EntityTypeDef;
  /** The whole fields object, for widgets that read siblings (skills read attributes). */
  fields: Record<string, unknown>;
  computed: Record<string, unknown>;
  readonly: boolean;
  referenceLists: Record<string, ReferenceList>;
  /** Validation errors under this path (relative sub-path -> message). */
  errors?: Record<string, string>;
  /** Id for the primary control so the renderer's label can point at it. */
  id: string;
  invalid?: boolean;
}

export type WidgetComponent = ComponentType<WidgetProps>;

export interface Option {
  value: string;
  label: string;
  item?: ReferenceItem;
}

function inMode(item: { mode?: PlayModeId[] }, mode?: PlayModeId): boolean {
  return !mode || !item.mode || item.mode.length === 0 || item.mode.includes(mode);
}

/** Reference list items filtered by play mode. */
export function referenceItems(lists: Record<string, ReferenceList>, ref: string | undefined, mode?: PlayModeId): ReferenceItem[] {
  if (!ref) return [];
  const list = lists[ref];
  if (!list) return [];
  return list.items.filter((i) => inMode(i, mode));
}

/** Options for select-like widgets: field.options (array or {ref}), then schema enum. */
export function resolveOptions(field: SheetField, schema: JsonSchema | undefined, lists: Record<string, ReferenceList>, mode?: PlayModeId): Option[] {
  const opts = field.options;
  if (Array.isArray(opts)) return opts.map((v) => ({ value: v, label: v }));
  if (isRecord(opts) && typeof opts.ref === "string") {
    return referenceItems(lists, opts.ref, mode).map((i) => ({ value: i.id, label: i.name, item: i }));
  }
  const cfgRef = field.config?.ref;
  if (typeof cfgRef === "string" && lists[cfgRef]) {
    return referenceItems(lists, cfgRef, mode).map((i) => ({ value: i.id, label: i.name, item: i }));
  }
  const en = schema?.enum ?? (isRecord(schema?.items) ? (schema?.items as JsonSchema).enum : undefined);
  if (Array.isArray(en)) return en.map((v) => ({ value: String(v), label: String(v) }));
  return [];
}

export function configNumber(field: SheetField, key: string, fallback?: number): number | undefined {
  const v = field.config?.[key];
  return typeof v === "number" ? v : fallback;
}

export function configString(field: SheetField, key: string, fallback?: string): string | undefined {
  const v = field.config?.[key];
  return typeof v === "string" ? v : fallback;
}
