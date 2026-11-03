/**
 * Gear from the module's item presets: the `gear` widget's "From the gear
 * list…" picker (`GearCatalogConfig`), which presets it offers and how it
 * groups them, and where a picked preset lands on the sheet: a gear row, or
 * (through a route) a row of another list such as the weapons, built with
 * that field's own config. Modules use the same functions to place the gear
 * a generator hands out (a life path's career gear, a preset's kit), so a
 * weapon always reaches the weapons list. Nothing here knows a game.
 */
import { evaluateLogic, getPath, setPath } from "./logic";
import type { EntityPreset, EntityTypeDef, GearCatalogConfig, SheetField } from "./types";
import { weaponListConfig, weaponRowFrom } from "./weapons";

type Row = Record<string, unknown>;

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const clone = <T>(v: T): T => (v === undefined ? v : (JSON.parse(JSON.stringify(v)) as T));

/** The field's `config.catalog`, or undefined when it has none (or it names no preset type). */
export function gearCatalogConfig(field: SheetField | undefined): GearCatalogConfig | undefined {
  const cat = field?.config?.catalog;
  if (!isRecord(cat) || !isRecord(cat.presets) || typeof cat.presets.entityType !== "string") return undefined;
  return cat as unknown as GearCatalogConfig;
}

function sheetsOf(def: EntityTypeDef): Array<EntityTypeDef["sheet"]> {
  return [def.sheet, ...(def.subtypes ?? []).map((s) => s.sheet).filter((s): s is EntityTypeDef["sheet"] => !!s)];
}

/** The sheet field at `path` (subtype sheets included), if the type has one. */
export function sheetFieldAt(def: EntityTypeDef | undefined, path: string): SheetField | undefined {
  if (!def) return undefined;
  for (const sheet of sheetsOf(def)) for (const section of sheet.sections) for (const f of section.fields) if (f.path === path) return f;
  return undefined;
}

/** The first `gear` field with a catalog on a type's sheet. */
export function gearCatalogFieldOf(def: EntityTypeDef | undefined): SheetField | undefined {
  if (!def) return undefined;
  for (const sheet of sheetsOf(def)) for (const section of sheet.sections) for (const f of section.fields) if (f.widget === "gear" && gearCatalogConfig(f)) return f;
  return undefined;
}

/** The data a catalog's `where` rule reads for a preset. */
function presetData(p: EntityPreset): Record<string, unknown> {
  return { id: p.id, name: p.name, subtype: p.subtype ?? "", tags: p.tags ?? [], fields: p.fields };
}

/** Presets the picker offers, in the module's order. */
export function catalogPresets(cfg: GearCatalogConfig, presets: readonly EntityPreset[]): EntityPreset[] {
  const src = cfg.presets;
  return presets.filter((p) => {
    if (p.entityType !== src.entityType) return false;
    if (src.subtypes?.length && !src.subtypes.includes(p.subtype ?? "")) return false;
    const tags = p.tags ?? [];
    if (src.tags?.length && !src.tags.some((t) => tags.includes(t))) return false;
    if (src.excludeTags?.some((t) => tags.includes(t))) return false;
    if (src.where !== undefined) {
      try {
        if (!evaluateLogic(src.where, presetData(p))) return false;
      } catch {
        return false;
      }
    }
    return true;
  });
}

export interface PresetGroup {
  id: string;
  label: string;
  presets: EntityPreset[];
}

/**
 * Presets in groups, in the order given (a preset goes to the first group
 * whose tag it carries); the rest under "Other". Empty groups are left out.
 * `query` keeps presets whose name, summary or tags contain it.
 */
export function groupPresets(groups: ReadonlyArray<{ tag: string; label: string }> | undefined, presets: readonly EntityPreset[], query = ""): PresetGroup[] {
  const q = query.trim().toLowerCase();
  const shown = presets.filter((p) => !q || p.name.toLowerCase().includes(q) || (p.summary ?? "").toLowerCase().includes(q) || (p.tags ?? []).some((t) => t.toLowerCase().includes(q)));
  const out = (groups ?? []).map((g) => ({ id: g.tag, label: g.label, presets: [] as EntityPreset[] }));
  const other: PresetGroup = { id: "", label: "Other", presets: [] };
  for (const p of shown) {
    const g = out.find((x) => (p.tags ?? []).includes(x.id));
    (g ?? other).presets.push(p);
  }
  return [...out, other].filter((g) => g.presets.length > 0);
}

/** The catalog's presets grouped for the picker. */
export function groupCatalogPresets(cfg: GearCatalogConfig, presets: readonly EntityPreset[], query = ""): PresetGroup[] {
  return groupPresets(cfg.presets.groups, catalogPresets(cfg, presets), query);
}

/** The first route a preset matches, if any. */
export function catalogRoute(cfg: GearCatalogConfig, preset: EntityPreset): NonNullable<GearCatalogConfig["routes"]>[number] | undefined {
  return (cfg.routes ?? []).find((r) => (r.subtypes?.length ? r.subtypes.includes(preset.subtype ?? "") : false) || (r.tags?.length ? r.tags.some((t) => (preset.tags ?? []).includes(t)) : false));
}

/** Where a picked preset lands: the list's path, its row, and the target field (the gear field itself, or a route's). */
export interface CatalogPlacement {
  path: string;
  row: Row;
  field: SheetField;
  /** True when the row went to a routed list (e.g. the weapons), not the gear. */
  routed: boolean;
}

/**
 * The row a preset makes and the list it goes to. `name` keeps a source's
 * own wording for the row (e.g. "Pump-action shotgun" from an NPC's kit);
 * the stats and the preset link come from the preset.
 */
export function catalogPlacement(def: EntityTypeDef, gearField: SheetField, preset: EntityPreset, opts: { name?: string } = {}): CatalogPlacement {
  const cfg = gearCatalogConfig(gearField);
  const name = opts.name ?? preset.name;
  const route = cfg ? catalogRoute(cfg, preset) : undefined;
  const target = route ? sheetFieldAt(def, route.path) : undefined;
  if (route && target) {
    const wcfg = weaponListConfig(target);
    const row: Row = wcfg ? weaponRowFrom(wcfg, { name, fields: preset.fields }, { presetId: preset.id }) : { name, presetId: preset.id };
    return { path: target.path, row, field: target, routed: true };
  }
  const row: Row = { name };
  for (const [key, from] of Object.entries(cfg?.copy ?? {})) {
    const v = getPath(preset.fields, from);
    if (v !== undefined) row[key] = clone(v);
  }
  row[cfg?.qtyKey ?? "qty"] = 1;
  row[cfg?.presetKey ?? "presetId"] = preset.id;
  return { path: gearField.path, row, field: gearField, routed: false };
}

/**
 * Add a preset to the character's fields: a weapon (any routed preset) as
 * `qty` rows of its list, any other item as a gear row, or, when a row of
 * the same preset and name is already there, by raising its quantity.
 * Returns the new fields (the input is not changed) and where it went.
 */
export function addCatalogItem(
  def: EntityTypeDef,
  gearField: SheetField,
  fields: Record<string, unknown>,
  preset: EntityPreset,
  opts: { name?: string; qty?: number } = {},
): { fields: Record<string, unknown>; placement: CatalogPlacement } {
  const cfg = gearCatalogConfig(gearField);
  const qty = Math.max(1, Math.floor(opts.qty ?? 1));
  const placement = catalogPlacement(def, gearField, preset, opts);
  const current = getPath(fields, placement.path);
  const rows: Row[] = Array.isArray(current) ? current.filter(isRecord).map((r) => ({ ...r })) : [];
  if (placement.routed) {
    for (let i = 0; i < qty; i++) rows.push(clone(placement.row));
  } else {
    const presetKey = cfg?.presetKey ?? "presetId";
    const qtyKey = cfg?.qtyKey ?? "qty";
    const same = rows.find((r) => r[presetKey] === preset.id && r.name === placement.row.name);
    if (same) same[qtyKey] = (typeof same[qtyKey] === "number" ? (same[qtyKey] as number) : 1) + qty;
    else rows.push({ ...placement.row, [qtyKey]: qty });
  }
  return { fields: setPath({ ...fields }, placement.path, rows), placement };
}
