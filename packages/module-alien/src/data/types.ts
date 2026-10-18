import type { EntityPreset } from "@campaign-forge/module-sdk";

/**
 * Preset shape used by every data file in this folder.
 *
 * `EntityPreset` (module-sdk) has no `subtype` property yet. Core stores the
 * subtype at `entity.subtype`, not inside `fields` (see
 * docs/alien-field-names.md), so each preset carries it twice until the SDK
 * gains `subtype?: string`:
 *  - as a top-level `subtype` property on the preset object, and
 *  - as a `subtype:<id>` tag, so an importer that only reads `EntityPreset`
 *    can still recover it.
 */
export type AlienPreset = EntityPreset & { subtype?: string };

/** Containment tag convention: `within:<presetId>` on a preset points at its parent preset. */
export const WITHIN_TAG = "within:";
export const SUBTYPE_TAG = "subtype:";

export function subtypeTag(subtype: string): string {
  return `${SUBTYPE_TAG}${subtype}`;
}

export function withinTag(parentPresetId: string): string {
  return `${WITHIN_TAG}${parentPresetId}`;
}

/** Read the subtype back from a preset (top-level property first, then the tag). */
export function presetSubtype(preset: EntityPreset): string | undefined {
  const direct = (preset as AlienPreset).subtype;
  if (direct) return direct;
  const tag = preset.tags?.find((t) => t.startsWith(SUBTYPE_TAG));
  return tag ? tag.slice(SUBTYPE_TAG.length) : undefined;
}
