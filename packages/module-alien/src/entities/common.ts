import type { JsonSchema, SheetField } from "@campaign-forge/module-sdk";

/** Shared enums from docs/alien-field-names.md. */
export const ATTRIBUTE_IDS = ["strength", "agility", "wits", "empathy"] as const;
export type AttributeId = (typeof ATTRIBUTE_IDS)[number];

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
export const RANGE_IDS = ["engaged", "short", "medium", "long", "extreme"] as const;
export const SHIP_CLASS_IDS = ["C", "G", "J", "M", "R", "U", "X"] as const;

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

export const enumField = (values: readonly string[], def?: string, description?: string): Record<string, unknown> => ({
  type: "string",
  enum: [...values],
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
