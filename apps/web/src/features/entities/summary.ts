import { getPath, sheetValueText, type Entity } from "@campaign-forge/core";
import { computeFields, type EntityTypeDef, type SheetField } from "@campaign-forge/module-sdk";
import { labelFromPath } from "../../components/ui";

/** A reference list item's name (a career, a talent), for readable summaries. */
export type ReferenceName = (listId: string, itemId: string) => string | undefined;

/** "Career Company Agent · Stress 2" from the type's sheet summary paths; reference ids by their item's name. */
export function summaryLine(def: EntityTypeDef | undefined, entity: Pick<Entity, "fields">, skip: string[] = [], referenceName?: ReferenceName): string {
  if (!def?.sheet.summary?.length) return "";
  let computed: Record<string, unknown> = {};
  try {
    computed = computeFields(def, entity.fields);
  } catch {
    computed = {};
  }
  const parts: string[] = [];
  for (const path of def.sheet.summary) {
    if (skip.includes(path)) continue;
    const v = path in computed ? computed[path] : getPath(entity.fields, path);
    if (v === undefined || v === null || v === "" || (Array.isArray(v) && v.length === 0)) continue;
    const label = labelOf(def, path);
    const field = sheetFieldOf(def, path);
    const shown = typeof v === "string" && referenceName && field ? sheetValueText(field, v, { referenceName, entityName: () => undefined }) || v : v;
    const text = typeof shown === "boolean" ? (shown ? label : "") : typeof shown === "object" ? "" : `${label} ${String(shown)}`;
    if (text) parts.push(text);
  }
  return parts.join(" · ");
}

/** The sheet field at a path (the first, subtype sheets included). */
export function sheetFieldOf(def: EntityTypeDef | undefined, path: string): SheetField | undefined {
  if (!def) return undefined;
  for (const sheet of [def.sheet, ...(def.subtypes ?? []).map((s) => s.sheet)]) {
    for (const s of sheet?.sections ?? []) {
      const f = s.fields.find((x) => x.path === path);
      if (f) return f;
    }
  }
  return undefined;
}

function labelOf(def: EntityTypeDef, path: string): string {
  return sheetFieldOf(def, path)?.label ?? labelFromPath(path);
}
