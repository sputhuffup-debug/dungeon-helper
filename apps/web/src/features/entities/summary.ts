import { getPath, type Entity } from "@campaign-forge/core";
import { computeFields, type EntityTypeDef } from "@campaign-forge/module-sdk";
import { labelFromPath } from "../../components/ui";

/** "Career: Marine · Stress 2" from the type's sheet summary paths. */
export function summaryLine(def: EntityTypeDef | undefined, entity: Pick<Entity, "fields">, skip: string[] = []): string {
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
    const text = typeof v === "boolean" ? (v ? label : "") : typeof v === "object" ? "" : `${label} ${String(v)}`;
    if (text) parts.push(text);
  }
  return parts.join(" · ");
}

function labelOf(def: EntityTypeDef, path: string): string {
  for (const s of def.sheet.sections) {
    const f = s.fields.find((x) => x.path === path);
    if (f?.label) return f.label;
  }
  return labelFromPath(path);
}
