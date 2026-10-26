/**
 * Weapons on a sheet: the `weapons` widget's config (WeaponListConfig) read
 * from a sheet field, the presets its "Add weapon" picker offers and how it
 * groups them, a row copied from a preset or a campaign item, the text of a
 * column, and an attack with a row (skill, pool numbers, damage and the hit's
 * armor options), all from the module's data. Nothing here knows a game.
 */
import { schemaDefaults } from "./entities";
import { evaluateLogic, getPath } from "./logic";
import type { EntityPreset, EntityTypeDef, JsonLogicRule, JsonSchema, SheetField, WeaponAttackConfig, WeaponColumn, WeaponListConfig } from "./types";

type Row = Record<string, unknown>;

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/** The field's config as a WeaponListConfig, or undefined when it is not one (no `copy` or `columns` list). */
export function weaponListConfig(field: SheetField | undefined): WeaponListConfig | undefined {
  const cfg = field?.config;
  if (!isRecord(cfg) || !Array.isArray(cfg.copy) || !Array.isArray(cfg.columns)) return undefined;
  return cfg as unknown as WeaponListConfig;
}

/** The first `weapons` field on a type's sheet (subtype sheets included). */
export function weaponsFieldOf(def: EntityTypeDef | undefined): SheetField | undefined {
  if (!def) return undefined;
  const sheets = [def.sheet, ...(def.subtypes ?? []).map((s) => s.sheet).filter((s) => !!s)];
  for (const sheet of sheets) for (const section of sheet!.sections) for (const f of section.fields) if (f.widget === "weapons") return f;
  return undefined;
}

/** The rows of a weapons list (anything that is not an object is dropped). */
export function weaponRows(value: unknown): Row[] {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

/** Presets the picker offers: of the source's type and subtype, with one of its tags, none of its excluded tags. */
export function weaponPresets(cfg: WeaponListConfig, presets: readonly EntityPreset[]): EntityPreset[] {
  const src = cfg.presets;
  if (!src) return [];
  return presets.filter((p) => {
    if (p.entityType !== src.entityType) return false;
    if (src.subtype && p.subtype !== src.subtype) return false;
    const tags = p.tags ?? [];
    if (src.tags?.length && !src.tags.some((t) => tags.includes(t))) return false;
    if (src.excludeTags?.some((t) => tags.includes(t))) return false;
    return true;
  });
}

export interface WeaponPresetGroup {
  id: string;
  label: string;
  presets: EntityPreset[];
}

/**
 * Presets in the config's groups, in its order (a preset goes to the first
 * group whose tag it carries); the rest under "Other". Empty groups are left
 * out. `query` keeps presets whose name, summary or tags contain it.
 */
export function groupWeaponPresets(cfg: WeaponListConfig, presets: readonly EntityPreset[], query = ""): WeaponPresetGroup[] {
  const q = query.trim().toLowerCase();
  const shown = presets.filter((p) => !q || p.name.toLowerCase().includes(q) || (p.summary ?? "").toLowerCase().includes(q) || (p.tags ?? []).some((t) => t.toLowerCase().includes(q)));
  const groups = (cfg.presets?.groups ?? []).map((g) => ({ id: g.tag, label: g.label, presets: [] as EntityPreset[] }));
  const other: WeaponPresetGroup = { id: "", label: "Other", presets: [] };
  for (const p of shown) {
    const g = groups.find((x) => (p.tags ?? []).includes(x.id));
    (g ?? other).presets.push(p);
  }
  return [...groups, other].filter((g) => g.presets.length > 0);
}

const clone = <T>(v: T): T => (v === undefined ? v : (JSON.parse(JSON.stringify(v)) as T));

/**
 * A row copied from a preset or a campaign item: its name, the config's
 * `copy` keys that are set, and the link (preset id under `presetKey`, item
 * id under `itemKey`).
 */
export function weaponRowFrom(cfg: WeaponListConfig, source: { name: string; fields: Record<string, unknown> }, link: { presetId?: string; itemId?: string } = {}): Row {
  const row: Row = { name: source.name };
  for (const k of cfg.copy) if (source.fields[k] !== undefined) row[k] = clone(source.fields[k]);
  if (link.presetId) row[cfg.presetKey ?? "presetId"] = link.presetId;
  if (link.itemId) row[cfg.itemKey ?? "itemId"] = link.itemId;
  return row;
}

/** A blank row: an empty name and the row schema's defaults. */
export function blankWeaponRow(rowSchema: JsonSchema | undefined): Row {
  return { ...(rowSchema ? schemaDefaults(rowSchema) : {}), name: "" };
}

/** Total weight of the rows (`weightKey`, default `weight`). */
export function weaponsWeight(cfg: WeaponListConfig, rows: readonly Row[]): number {
  const key = cfg.weightKey ?? "weight";
  return rows.reduce((sum, r) => sum + (typeof r[key] === "number" && Number.isFinite(r[key]) ? (r[key] as number) : 0), 0);
}

function text(v: unknown): string {
  if (v === undefined || v === null) return "";
  if (Array.isArray(v)) return v.map(text).filter(Boolean).join(", ");
  if (typeof v === "boolean") return v ? "Yes" : "";
  if (typeof v === "number") return Number.isFinite(v) ? String(v) : "";
  if (typeof v === "object") return "";
  return String(v);
}

/** The text a column shows for a row (its `display` rule over the row, else the value at `key`). */
export function weaponColumnText(column: WeaponColumn, row: Row): string {
  if (column.display !== undefined) {
    try {
      return text(evaluateLogic(column.display, row));
    } catch {
      return "";
    }
  }
  return column.key ? text(getPath(row, column.key)) : "";
}

// ---------------------------------------------------------------------------
// attacks
// ---------------------------------------------------------------------------

export interface WeaponAttackPlan {
  /** The band picked. */
  range: { id: string; label: string };
  /** The skill id rolled. */
  skillId: string;
  /** Extra pool input numbers (the config's `pool`). */
  pool: Record<string, number>;
  /** Base damage of a hit. */
  damage: number;
  extraSuccessesAddDamage: boolean;
  armorPiercing: boolean;
  source?: string;
  /** False when the band is beyond the weapon's maximum range. */
  inRange: boolean;
  /** The config's notes that apply. */
  notes: string[];
}

const bandIndex = (cfg: WeaponAttackConfig, id: unknown, fallback: number): number => {
  const i = cfg.ranges.findIndex((r) => r.id === id);
  return i >= 0 ? i : fallback;
};

/** The data every attack rule reads. */
export function weaponAttackData(cfg: WeaponAttackConfig, weapon: Row, rangeId: string): Record<string, unknown> {
  const last = Math.max(0, cfg.ranges.length - 1);
  const minIndex = bandIndex(cfg, weapon[cfg.minRangeKey ?? "rangeMin"], 0);
  const maxIndex = Math.max(minIndex, bandIndex(cfg, weapon[cfg.maxRangeKey ?? "range"], last));
  const rangeIndex = bandIndex(cfg, rangeId, minIndex);
  return { weapon, range: cfg.ranges[rangeIndex]?.id ?? rangeId, rangeIndex, minIndex, maxIndex, closer: Math.max(0, minIndex - rangeIndex), beyond: rangeIndex > maxIndex };
}

/** The band an attack starts at: the weapon's minimum range (else the nearest band). */
export function defaultAttackRange(cfg: WeaponAttackConfig, weapon: Row): string {
  const min = weapon[cfg.minRangeKey ?? "rangeMin"];
  return cfg.ranges.some((r) => r.id === min) ? String(min) : (cfg.ranges[0]?.id ?? "");
}

/** The bands a weapon can reach (nearest band up to its maximum). */
export function attackRanges(cfg: WeaponAttackConfig, weapon: Row): Array<{ id: string; label: string }> {
  const { maxIndex } = weaponAttackData(cfg, weapon, defaultAttackRange(cfg, weapon)) as { maxIndex: number };
  return cfg.ranges.slice(0, maxIndex + 1);
}

const num = (v: unknown): number => {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : typeof v === "boolean" ? (v ? 1 : 0) : 0;
  return Number.isFinite(n) ? n : 0;
};

const evalSafe = (rule: JsonLogicRule | undefined, data: unknown): unknown => {
  if (rule === undefined) return undefined;
  try {
    return evaluateLogic(rule, data);
  } catch {
    return undefined;
  }
};

/** What an attack with `weapon` at `rangeId` rolls and deals, from the config's rules. */
export function planWeaponAttack(cfg: WeaponAttackConfig, weapon: Row, rangeId?: string): WeaponAttackPlan {
  const data = weaponAttackData(cfg, weapon, rangeId ?? defaultAttackRange(cfg, weapon));
  const rangeIdx = data.rangeIndex as number;
  const pool: Record<string, number> = {};
  for (const [k, rule] of Object.entries(cfg.pool ?? {})) pool[k] = num(evalSafe(rule, data)) || 0;
  const source = evalSafe(cfg.source, data);
  return {
    range: cfg.ranges[rangeIdx] ?? { id: String(data.range), label: String(data.range) },
    skillId: String(evalSafe(cfg.skill, data) ?? ""),
    pool,
    damage: Math.max(0, num(evalSafe(cfg.damage, data))),
    extraSuccessesAddDamage: cfg.extraSuccessesAddDamage === true,
    armorPiercing: evalSafe(cfg.armorPiercing, data) === true,
    ...(typeof source === "string" && source ? { source } : {}),
    inRange: data.beyond !== true,
    notes: (cfg.notes ?? []).filter((n) => !!evalSafe(n.when, data)).map((n) => n.text),
  };
}

/** Damage a hit deals before armor: base, plus one per extra success when the config says so; 0 on no success. */
export function weaponHitDamage(plan: Pick<WeaponAttackPlan, "damage" | "extraSuccessesAddDamage">, successes: number): number {
  if (successes < 1) return 0;
  return plan.damage + (plan.extraSuccessesAddDamage ? successes - 1 : 0);
}
