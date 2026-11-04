/**
 * Paired entity references (`SheetField.reciprocal`): a field such as a
 * buddy that names another entity of the same type, kept the same on both
 * ends. Pure: given an entity's fields before and after an edit, it says
 * which other entities to change, and which it left alone because they
 * already name someone else (the app offers to repoint those). Generic: the
 * module marks the fields, nothing here knows what they mean.
 */
import type { EntityTypeDef, SheetField } from "@campaign-forge/module-sdk";
import { getPath } from "./paths";
import type { Entity, Id } from "./types";

/** The paired fields of a type (its own sheet and its subtypes'), by path. */
export function reciprocalFields(def: EntityTypeDef | undefined): SheetField[] {
  if (!def) return [];
  const out = new Map<string, SheetField>();
  for (const sheet of [def.sheet, ...(def.subtypes ?? []).map((s) => s.sheet)]) {
    for (const section of sheet?.sections ?? []) for (const f of section.fields) if (f.reciprocal && f.widget === "ref" && !out.has(f.path)) out.set(f.path, f);
  }
  return [...out.values()];
}

/** One change to another entity's paired field. */
export interface ReciprocalEdit {
  entityId: Id;
  path: string;
  /** The id it now names, or undefined: cleared. */
  value: Id | undefined;
}

/** A paired field left alone: the other end names someone else. */
export interface ReciprocalConflict {
  entityId: Id;
  path: string;
  /** Whom it names now. */
  current: Id;
  /** Whom the edit would have it name. */
  wanted: Id;
}

export interface ReciprocalChanges {
  edits: ReciprocalEdit[];
  conflicts: ReciprocalConflict[];
}

const idOf = (v: unknown): Id | undefined => (typeof v === "string" && v.trim() ? v : undefined);

/**
 * What an edit of entity `selfId` (fields `before` -> `after`) means for the
 * other ends of its paired fields:
 * - the entity it named before is cleared when it named `selfId` back;
 * - the entity it names now is set to `selfId` when its field is empty, is
 *   text typed by hand (no entity's id), or already names `selfId`; when it
 *   names another entity it is left alone and reported as a conflict;
 * - nothing is set that would have the other end name `selfId` in two paired
 *   fields (a buddy who is also a rival).
 */
export function reciprocalChanges(
  def: EntityTypeDef | undefined,
  selfId: Id,
  before: Record<string, unknown>,
  after: Record<string, unknown>,
  entity: (id: Id) => Pick<Entity, "id" | "type" | "fields"> | undefined,
): ReciprocalChanges {
  const fields = reciprocalFields(def);
  const edits: ReciprocalEdit[] = [];
  const conflicts: ReciprocalConflict[] = [];
  if (!def) return { edits, conflicts };
  const pairedType = (e: Pick<Entity, "type"> | undefined): boolean => !!e && e.type === def.id;
  for (const f of fields) {
    const was = idOf(getPath(before, f.path));
    const now = idOf(getPath(after, f.path));
    if (was === now) continue;
    const old = was && was !== selfId ? entity(was) : undefined;
    if (old && pairedType(old) && getPath(old.fields, f.path) === selfId) edits.push({ entityId: old.id, path: f.path, value: undefined });
    const next = now && now !== selfId ? entity(now) : undefined;
    if (!next || !pairedType(next)) continue;
    const theirs = idOf(getPath(next.fields, f.path));
    if (theirs === selfId) continue;
    // B already names A in another paired field (A's buddy is B's rival): leave B as it is
    if (fields.some((g) => g.path !== f.path && getPath(next.fields, g.path) === selfId)) continue;
    if (theirs === undefined || !entity(theirs)) edits.push({ entityId: next.id, path: f.path, value: selfId });
    else conflicts.push({ entityId: next.id, path: f.path, current: theirs, wanted: selfId });
  }
  return { edits, conflicts };
}

/**
 * For each paired field of the type: how many other entities name `id` in
 * it (e.g. the PCs whose buddy this one is), for links set one way before
 * the field was paired.
 */
export function reciprocalReferences(def: EntityTypeDef | undefined, id: Id, entities: Iterable<Pick<Entity, "id" | "type" | "fields">>): Record<string, number> {
  const fields = reciprocalFields(def);
  const out: Record<string, number> = {};
  if (!def || fields.length === 0) return out;
  for (const e of entities) {
    if (e.id === id || e.type !== def.id) continue;
    for (const f of fields) if (getPath(e.fields, f.path) === id) out[f.path] = (out[f.path] ?? 0) + 1;
  }
  return out;
}
