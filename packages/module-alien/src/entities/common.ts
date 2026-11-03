import type { JsonSchema, SheetField } from "@campaign-forge/module-sdk";

/** Shared enums from docs/alien-field-names.md. */
/** Four attributes (p. 25). */
export const ATTRIBUTE_IDS = ["strength", "agility", "wits", "empathy"] as const;
export type AttributeId = (typeof ATTRIBUTE_IDS)[number];

/** Twelve skills and their attributes (p. 42). */
export const SKILL_BINDINGS: Array<{ id: string; attribute: AttributeId }> = [
  { id: "heavyMachinery", attribute: "strength" },
  { id: "closeCombat", attribute: "strength" },
  { id: "stamina", attribute: "strength" },
  { id: "rangedCombat", attribute: "agility" },
  { id: "mobility", attribute: "agility" },
  { id: "piloting", attribute: "agility" },
  { id: "observation", attribute: "wits" },
  { id: "survival", attribute: "wits" },
  { id: "comtech", attribute: "wits" },
  { id: "manipulation", attribute: "empathy" },
  { id: "command", attribute: "empathy" },
  { id: "medicalAid", attribute: "empathy" },
];
export const SKILL_IDS = SKILL_BINDINGS.map((s) => s.id);

export const CAREER_IDS = [
  "colonial-marine",
  "colonial-marshal",
  "company-agent",
  "kid",
  "medic",
  "officer",
  "pilot",
  "roughneck",
  "scientist",
] as const;

export const FRAME_IDS = ["space-truckers", "colonial-marines", "frontier-colonists"] as const;
export const REGION_IDS = ["core", "outer-veil", "outer-rim", "frontier", "far-reach"] as const;
export const ALLEGIANCE_IDS = ["uas", "3we", "upp", "icsc", "independent", "unknown"] as const;
/** The five range bands of the Evolved Edition (p. 55); the closest is "Adjacent", not "Engaged". */
export const RANGE_IDS = ["adjacent", "short", "medium", "long", "extreme"] as const;
export type RangeId = (typeof RANGE_IDS)[number];
export const RANGE_LABELS: Record<RangeId, string> = {
  adjacent: "Adjacent",
  short: "Short",
  medium: "Medium",
  long: "Long",
  extreme: "Extreme",
};
/** What each band means on the zone map (p. 55). */
export const RANGE_DESCRIPTIONS: Record<RangeId, string> = {
  adjacent: "In your face",
  short: "Same zone",
  medium: "Adjacent zone",
  long: "Up to four zones away",
  extreme: "Farther away",
};
export const SHIP_CLASS_IDS = ["C", "G", "J", "M", "R", "U", "X"] as const;

/** Display labels for the shared enums (the app shows these, never the ids). */
export const FRAME_LABELS: Record<(typeof FRAME_IDS)[number], string> = {
  "space-truckers": "Space Truckers",
  "colonial-marines": "Colonial Marines",
  "frontier-colonists": "Frontier Colonists",
};
/** Regions of charted space (pp. 112, 201); "uncharted" is the encounter tables' own column. */
export const REGION_LABELS: Record<string, string> = {
  core: "Core Systems",
  "outer-veil": "Outer Veil",
  "outer-rim": "Outer Rim",
  frontier: "Frontier",
  "far-reach": "Far Reach",
  uncharted: "Uncharted space",
};
/** Allegiances (pp. 162-171). */
export const ALLEGIANCE_LABELS: Record<(typeof ALLEGIANCE_IDS)[number], string> = {
  uas: "United Americas",
  "3we": "Three World Empire",
  upp: "Union of Progressive Peoples",
  icsc: "Independent Core System Colonies",
  independent: "Independent",
  unknown: "Unknown",
};
export const CAREER_LABELS: Record<(typeof CAREER_IDS)[number], string> = {
  "colonial-marine": "Colonial Marine",
  "colonial-marshal": "Colonial Marshal",
  "company-agent": "Company Agent",
  kid: "Kid",
  medic: "Medic",
  officer: "Officer",
  pilot: "Pilot",
  roughneck: "Roughneck",
  scientist: "Scientist",
};
export const SHIP_CLASS_LABELS: Record<string, string> = Object.fromEntries(SHIP_CLASS_IDS.map((c) => [c, `${c} class`]));
export const LIVING_STANDARD_LABELS: Record<string, string> = { minimum: "Minimum", basic: "Basic", normal: "Normal", luxurious: "Luxurious" };

/**
 * `enumLabels` for a list of enum values: each value's label from `labels`,
 * else the value itself with its first letter capitalised. Every enum the
 * module declares carries labels (tested), so the app never shows an id.
 */
export function enumLabelsFor(values: readonly string[], labels: Record<string, string> = {}): string[] {
  return values.map((v) => labels[v] ?? `${v.charAt(0).toUpperCase()}${v.slice(1).replace(/-/g, " ")}`);
}

/** `{ enum, enumLabels }` for a schema property. */
export const labelledEnum = (values: readonly string[], labels: Record<string, string> = {}): { enum: string[]; enumLabels: string[] } => ({ enum: [...values], enumLabels: enumLabelsFor(values, labels) });

export const DRAFT07 = "http://json-schema.org/draft-07/schema#";

/** Helper for the common schema prelude. */
export function objectSchema(properties: Record<string, unknown>, extra: Record<string, unknown> = {}): JsonSchema {
  return {
    $schema: DRAFT07,
    type: "object",
    additionalProperties: true,
    properties,
    ...extra,
  };
}

export const stringField = (description?: string, extra: Record<string, unknown> = {}): Record<string, unknown> => ({
  type: "string",
  ...(description ? { description } : {}),
  ...extra,
});

export const numberField = (
  extra: Record<string, unknown> = {},
  description?: string,
): Record<string, unknown> => ({
  type: "number",
  ...(description ? { description } : {}),
  ...extra,
});

export const intField = (min?: number, max?: number, def?: number, description?: string): Record<string, unknown> => ({
  type: "integer",
  ...(min !== undefined ? { minimum: min } : {}),
  ...(max !== undefined ? { maximum: max } : {}),
  ...(def !== undefined ? { default: def } : {}),
  ...(description ? { description } : {}),
});

export const stringArray = (description?: string): Record<string, unknown> => ({
  type: "array",
  items: { type: "string" },
  default: [],
  ...(description ? { description } : {}),
});

export const enumField = (values: readonly string[], def?: string, description?: string, labels: Record<string, string> = {}): Record<string, unknown> => ({
  type: "string",
  ...labelledEnum(values, labels),
  ...(def !== undefined ? { default: def } : {}),
  ...(description ? { description } : {}),
});

/** A few sheet-field shorthands. */
export const text = (path: string, label: string, extra: Partial<SheetField> = {}): SheetField => ({
  path,
  label,
  widget: "text",
  ...extra,
});
export const textarea = (path: string, label: string, extra: Partial<SheetField> = {}): SheetField => ({
  path,
  label,
  widget: "textarea",
  span: 12,
  ...extra,
});
export const number = (path: string, label: string, extra: Partial<SheetField> = {}): SheetField => ({
  path,
  label,
  widget: "number",
  span: 3,
  ...extra,
});
export const select = (path: string, label: string, options: SheetField["options"], extra: Partial<SheetField> = {}): SheetField => ({
  path,
  label,
  widget: "select",
  options,
  ...extra,
});
export const checkbox = (path: string, label: string, extra: Partial<SheetField> = {}): SheetField => ({
  path,
  label,
  widget: "checkbox",
  span: 3,
  ...extra,
});
export const tags = (path: string, label: string, extra: Partial<SheetField> = {}): SheetField => ({
  path,
  label,
  widget: "tags",
  span: 12,
  ...extra,
});
export const list = (path: string, label: string, extra: Partial<SheetField> = {}): SheetField => ({
  path,
  label,
  widget: "list",
  span: 12,
  ...extra,
});
