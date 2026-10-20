/**
 * Initial procedure inputs: JSON Schema defaults, then values the campaign
 * already knows (the frame from campaign settings, the number of player
 * characters, a characters array built from the PCs).
 */
import { clone, type CampaignStore, type Entity } from "@campaign-forge/core";
import { ENTITY_INPUT_HINT, type EntityInputHint, type EntitySnapshot, type JsonSchema, type LoadedModule, type Procedure } from "@campaign-forge/module-sdk";

export type Schema = JsonSchema & {
  type?: string | string[];
  enum?: unknown[];
  default?: unknown;
  description?: string;
  title?: string;
  minimum?: number;
  maximum?: number;
  properties?: Record<string, Schema>;
  items?: Schema;
  required?: string[];
};

export function inputProperties(procedure: Procedure | undefined): Record<string, Schema> {
  const schema = procedure?.inputs as Schema | undefined;
  return schema?.properties ?? {};
}

export function schemaTypeOf(s: Schema | undefined): string | undefined {
  if (!s) return undefined;
  if (Array.isArray(s.type)) return s.type.find((t) => t !== "null");
  if (typeof s.type === "string") return s.type;
  if (Array.isArray(s.enum)) return typeof s.enum[0] === "number" ? "number" : "string";
  return undefined;
}

/** Defaults declared by the schema (top level; array defaults are copied). */
export function schemaDefaultInputs(procedure: Procedure | undefined): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, s] of Object.entries(inputProperties(procedure))) {
    if (s.default !== undefined) out[key] = structuredCloneSafe(s.default);
  }
  return out;
}

function structuredCloneSafe<T>(v: T): T {
  return v === undefined ? v : (JSON.parse(JSON.stringify(v)) as T);
}

/** Player characters: character-kind entities flagged as PCs or owned by a member. */
export function playerCharacters(store: CampaignStore, module: Pick<LoadedModule, "entityType">): Entity[] {
  return store
    .list("entities")
    .filter((e) => module.entityType(e.type)?.kind === "character" && (e.fields.isPC === true || !!e.ownerMemberId))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** Per-item hints when building a characters array from PCs (module data the schema cannot express). */
const ITEM_HINTS: Record<string, (pc: Entity) => unknown> = {
  isMarine: (pc) => /marine/i.test(String(pc.fields.career ?? "")) || pc.tags.some((t) => /marine/i.test(t)),
};

/** Whether an array input is a per-character list (items carry `id` and `name`). */
export function isCharacterArray(s: Schema | undefined): boolean {
  const props = s?.items?.properties;
  return schemaTypeOf(s) === "array" && !!props && "id" in props && "name" in props;
}

/** One item of a per-character array for a PC: id, name, defaults and known hints. */
export function characterItem(itemSchema: Schema | undefined, pc: Entity): Record<string, unknown> {
  const item: Record<string, unknown> = { id: pc.id, name: pc.name };
  for (const [key, s] of Object.entries(itemSchema?.properties ?? {})) {
    if (key === "id" || key === "name") continue;
    const hint = ITEM_HINTS[key];
    const fromEntity = pc.fields[key];
    if (hint) item[key] = hint(pc);
    else if (fromEntity !== undefined && (typeof fromEntity !== "object" || fromEntity === null)) item[key] = fromEntity;
    else if (s.default !== undefined) item[key] = structuredCloneSafe(s.default);
    else if (Array.isArray(s.enum) && s.enum.length) item[key] = s.enum[0];
  }
  return item;
}

/** The entity-picker hint on an input schema (`"x-entity"`), if any. */
export function entityHint(s: Schema | undefined): EntityInputHint | undefined {
  const h = (s as Record<string, unknown> | undefined)?.[ENTITY_INPUT_HINT];
  if (!h || typeof h !== "object" || !Array.isArray((h as EntityInputHint).types)) return undefined;
  return h as EntityInputHint;
}

/** The value an entity input carries: a snapshot, so a run stays reproducible. */
export function entitySnapshot(e: Entity): EntitySnapshot {
  return { id: e.id, name: e.name, type: e.type, fields: clone(e.fields) };
}

/** Snapshot of `id` when it is an entity of one of the hint's types. */
export function snapshotFor(store: CampaignStore, hint: EntityInputHint, id: unknown): EntitySnapshot | undefined {
  if (typeof id !== "string") return undefined;
  const e = store.get("entities", id);
  return e && hint.types.includes(e.type) ? entitySnapshot(e) : undefined;
}

/** "job:ID,ship:ID" (the procedure page's `pick` search) as input overrides. */
export function pickedInputs(procedure: Procedure | undefined, store: CampaignStore, pick: string | undefined): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (!pick) return out;
  const props = inputProperties(procedure);
  for (const part of pick.split(",")) {
    const [key, id] = part.split(":");
    const hint = key ? entityHint(props[key]) : undefined;
    const snap = hint ? snapshotFor(store, hint, id) : undefined;
    if (key && snap) out[key] = snap;
  }
  return out;
}

/** Schema defaults plus what the campaign knows. */
export function initialInputs(procedure: Procedure | undefined, store: CampaignStore, module: Pick<LoadedModule, "entityType">): Record<string, unknown> {
  const inputs = schemaDefaultInputs(procedure);
  const props = inputProperties(procedure);
  const settings = store.meta().settings ?? {};
  const pcs = playerCharacters(store, module);
  for (const [key, s] of Object.entries(props)) {
    const hint = entityHint(s);
    if (hint) {
      const snap = hint.setting ? snapshotFor(store, hint, settings[hint.setting]) : undefined;
      if (snap) inputs[key] = snap;
      else delete inputs[key];
      continue;
    }
    // campaign settings with the same name (e.g. frame)
    const setting = settings[key];
    if (setting !== undefined && (!Array.isArray(s.enum) || s.enum.includes(setting))) inputs[key] = setting;
    if (key === "pcCount" && pcs.length > 0) inputs[key] = pcs.length;
    if (isCharacterArray(s) && pcs.length > 0) inputs[key] = pcs.map((pc) => characterItem(s.items, pc));
  }
  return inputs;
}
