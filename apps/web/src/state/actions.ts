/**
 * Mutations. Every write the UI makes goes through one of these so
 * provenance, cascade and index bookkeeping happen in one place.
 */
import {
  AssetStore,
  CampaignStore,
  RichTextRegistry,
  applyImportedAssets,
  applyImportedDocs,
  campaignDbName,
  clone,
  deleteCampaignData,
  docIdsOf,
  exportBundle,
  exportJSON,
  importBundle,
  openPersistence,
  presetToEntity,
  recordEdit,
  registerCampaign,
  reveal,
  setPath,
  unregisterCampaign,
  type Asset,
  type CampaignMaps,
  type CampaignMeta,
  type Entity,
  type Id,
  type MapName,
  type Note,
  type Relationship,
  type Session,
  type Visibility,
  MAP_NAMES,
} from "@campaign-forge/core";
import { defaultFieldsFor, type EntityPreset, type LoadedModule } from "@campaign-forge/module-sdk";
import * as Y from "yjs";
import { defaultCampaignDate } from "../lib/calendar";
import { downloadFile, slug } from "../lib/download";
import { imageDimensions } from "../lib/image";
import { loadModuleById } from "../modules/registry";
import type { CampaignContextValue } from "./CampaignProvider";
import { checklistEvent } from "./tableActions";

type Ctx = Pick<CampaignContextValue, "store" | "module"> & Partial<Pick<CampaignContextValue, "registry" | "assets" | "refIndex" | "search">>;

const GM: Visibility = { level: "gm" };

// ---------------------------------------------------------------------------
// campaigns
// ---------------------------------------------------------------------------

export interface CreateCampaignInput {
  name: string;
  moduleId: string;
  mode?: string;
  gmName?: string;
}

/** Create a campaign on this device and return its id. */
export async function createCampaign(input: CreateCampaignInput): Promise<Id> {
  const module = await loadModuleById(input.moduleId);
  const store = CampaignStore.create({
    name: input.name.trim() || "Untitled campaign",
    moduleId: module.manifest.id,
    moduleVersion: module.manifest.version,
    mode: input.mode ?? module.manifest.defaultMode,
    calendarId: module.module.calendar.id,
    currentDate: defaultCampaignDate(module.module.calendar),
    gmName: input.gmName?.trim() || "GM",
  });
  const persistence = openPersistence(store);
  await persistence.whenSynced;
  await settle();
  const meta = store.meta();
  await registerCampaign({ id: meta.id, name: meta.name, moduleId: meta.moduleId, updated: meta.updated });
  persistence.destroy();
  store.destroy();
  return meta.id;
}

/** Delete a campaign's document, rich-text docs, assets and index entry. */
export async function deleteCampaign(id: Id): Promise<void> {
  let docIds: Id[] = [];
  try {
    const store = CampaignStore.fromDoc(new Y.Doc());
    const persistence = openPersistence(store, { name: campaignDbName(id) });
    await persistence.whenSynced;
    docIds = docIdsOf(store.toJSON());
    persistence.destroy();
    store.destroy();
  } catch {
    /* unreadable document: still remove what we can */
  }
  await deleteCampaignData(id, docIds);
  await unregisterCampaign(id);
}

/** Import a bundle (zip bytes) as a new campaign with fresh ids. Returns the new id. */
export async function importCampaignBundle(bytes: Uint8Array): Promise<Id> {
  const imported = await importBundle(bytes, { onConflict: "new-id" });
  const store = imported.store;
  const meta = store.meta();
  const registry = new RichTextRegistry();
  const persistence = openPersistence(store, { name: campaignDbName(meta.id), registry });
  await persistence.whenSynced;
  await applyImportedDocs(registry, imported.docs);
  const assets = new AssetStore(meta.id);
  await applyImportedAssets(assets, imported.assets);
  await settle();
  await registerCampaign({ id: meta.id, name: meta.name, moduleId: meta.moduleId, updated: meta.updated });
  persistence.destroy();
  registry.closeAll();
  store.destroy();
  await assets.close();
  return meta.id;
}

/** Merge a bundle's records (with new ids) into the open campaign. Meta is left alone. */
export async function importBundleIntoCampaign(ctx: CampaignContextValue, bytes: Uint8Array): Promise<{ records: number }> {
  const imported = await importBundle(bytes, { onConflict: "new-id" });
  const maps = imported.store.toJSON();
  const count = mergeMaps(ctx.store, maps);
  await applyImportedDocs(ctx.registry, imported.docs);
  await applyImportedAssets(ctx.assets, imported.assets);
  ctx.refIndex.indexAll(ctx.store);
  imported.store.destroy();
  return { records: count };
}

/** Insert every record of `maps` (except meta) keeping the ids they carry. */
export function mergeMaps(store: CampaignStore, maps: CampaignMaps): number {
  let count = 0;
  store.transact(() => {
    for (const name of MAP_NAMES) {
      const top = store.doc.getMap<Y.Map<unknown>>(name);
      const records = (maps[name] ?? {}) as unknown as Record<string, Record<string, unknown>>;
      for (const [id, record] of Object.entries(records)) {
        const rec = new Y.Map<unknown>();
        for (const [k, v] of Object.entries(record)) if (v !== undefined) rec.set(k, clone(v));
        top.set(id, rec);
        count++;
      }
    }
  });
  return count;
}

export async function exportCampaignBundle(ctx: CampaignContextValue): Promise<void> {
  const bytes = await exportBundle(ctx.store, ctx.registry, ctx.assets, { id: ctx.module.manifest.id, version: ctx.module.manifest.version });
  downloadFile(bytes, `${slug(ctx.store.meta().name)}.cfbundle.zip`, "application/zip");
}

export function exportCampaignJSON(ctx: Pick<CampaignContextValue, "store">): void {
  downloadFile(exportJSON(ctx.store), `${slug(ctx.store.meta().name)}.json`, "application/json");
}

export function updateMeta(ctx: Pick<CampaignContextValue, "store">, patch: Partial<Omit<CampaignMeta, "id" | "created">>): CampaignMeta {
  return ctx.store.updateMeta(patch);
}

// ---------------------------------------------------------------------------
// entities
// ---------------------------------------------------------------------------

export interface CreateEntityInput {
  type: string;
  name: string;
  subtype?: string;
  fields?: Record<string, unknown>;
  summary?: string;
  tags?: string[];
  visibility?: Visibility;
}

/** Create a blank entity of a type, starting from the schema's defaults. */
export function createEntity(ctx: Ctx, input: CreateEntityInput): Entity {
  const def = ctx.module.entityType(input.type);
  const defaults = def ? defaultFieldsFor(def) : {};
  return ctx.store.createEntity({
    type: input.type,
    name: input.name.trim() || (def?.name ?? "Unnamed"),
    subtype: input.subtype,
    fields: { ...defaults, ...(input.fields ?? {}) },
    summary: input.summary,
    tags: input.tags ?? [],
    visibility: input.visibility ?? GM,
  });
}

export interface PresetOverrides {
  name?: string;
  subtype?: string;
  summary?: string;
  tags?: string[];
  visibility?: Visibility;
  fields?: Record<string, unknown>;
}

/** Create an entity from a module preset (records the preset in provenance). */
export function createEntityFromPreset(ctx: Ctx, preset: EntityPreset | string, overrides: PresetOverrides = {}): Entity {
  const p = typeof preset === "string" ? ctx.module.preset(preset) : preset;
  if (!p) throw new Error(`Unknown preset ${String(preset)}`);
  const def = ctx.module.entityType(p.entityType);
  const defaults = def ? defaultFieldsFor(def) : {};
  return presetToEntity(ctx.store, p, { ...overrides, fields: { ...defaults, ...clone(p.fields), ...(overrides.fields ?? {}) } });
}

export function updateEntity(ctx: Ctx, id: Id, patch: Partial<Entity>): Entity {
  return ctx.store.update("entities", id, patch);
}

/** Set one dotted field path. Records the edit on the generator run when the entity was generated. */
export function updateEntityField(ctx: Ctx, id: Id, path: string, value: unknown): Entity {
  const entity = ctx.store.get("entities", id);
  if (!entity) throw new Error(`entities/${id} not found`);
  return ctx.store.transact(() => {
    const fields = clone(entity.fields);
    if (value === undefined) {
      // delete at path: set parent without the key
      const segs = path.split(".");
      const last = segs.pop() as string;
      const parentPath = segs.join(".");
      const parent = parentPath ? (getIn(fields, parentPath) as Record<string, unknown> | undefined) : fields;
      if (parent && typeof parent === "object") delete parent[last];
    } else {
      setPath(fields, path, value);
    }
    const updated = ctx.store.update("entities", id, { fields });
    const run = entity.provenance?.generatorRun;
    if (run) recordEdit(ctx.store, run, id, path);
    return updated;
  });
}

/** Replace the whole fields object (sheet renderers that hand back the full object). */
export function updateEntityFields(ctx: Ctx, id: Id, fields: Record<string, unknown>, changedPaths: string[] = []): Entity {
  const entity = ctx.store.get("entities", id);
  if (!entity) throw new Error(`entities/${id} not found`);
  return ctx.store.transact(() => {
    const updated = ctx.store.update("entities", id, { fields: clone(fields) });
    const run = entity.provenance?.generatorRun;
    if (run) for (const p of changedPaths) recordEdit(ctx.store, run, id, p);
    return updated;
  });
}

function getIn(obj: unknown, path: string): unknown {
  let cur: unknown = obj;
  for (const seg of path.split(".")) {
    if (cur === null || typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[seg];
  }
  return cur;
}

export function deleteEntity(ctx: Ctx, id: Id): boolean {
  return ctx.store.transact(() => {
    const entity = ctx.store.get("entities", id);
    if (!entity) return false;
    // notes attached to the entity go with it
    for (const n of ctx.store.list("notes")) {
      if (n.attachedTo?.kind === "entity" && n.attachedTo.id === id) ctx.store.remove("notes", n.id);
    }
    return ctx.store.remove("entities", id);
  });
}

export function setEntityVisibility(ctx: Ctx, id: Id, visibility: Visibility): Entity {
  return ctx.store.update("entities", id, { visibility });
}

export function setFieldVisibility(ctx: Ctx, id: Id, path: string, visibility: Visibility | undefined): Entity {
  const entity = ctx.store.get("entities", id);
  if (!entity) throw new Error(`entities/${id} not found`);
  const fieldVisibility = { ...(entity.fieldVisibility ?? {}) };
  if (visibility) fieldVisibility[path] = visibility;
  else delete fieldVisibility[path];
  return ctx.store.update("entities", id, { fieldVisibility });
}

/** Flip an entity (or one field) to `revealed` in a session. */
export function revealEntity(ctx: Ctx, entityId: Id, sessionId: Id, field?: string): void {
  ctx.store.transact(() => {
    reveal(ctx.store, { kind: "entity", id: entityId, field }, sessionId);
    checklistEvent(ctx, sessionId, "revealed");
  });
}

// ---------------------------------------------------------------------------
// relationships
// ---------------------------------------------------------------------------

export function linkEntities(ctx: Ctx, type: string, from: Id, to: Id, note?: string): Relationship {
  const existing = ctx.store.list("relationships").find((r) => r.type === type && r.from === from && r.to === to);
  if (existing) return existing;
  return ctx.store.createRelationship(type, from, to, note);
}

export function unlinkEntities(ctx: Ctx, relationshipId: Id): boolean {
  return ctx.store.remove("relationships", relationshipId);
}

/** Put `entityId` within `parentId` (replacing any earlier `within`). */
export function setParent(ctx: Ctx, entityId: Id, parentId: Id | undefined): void {
  ctx.store.transact(() => {
    for (const r of ctx.store.list("relationships")) {
      if (r.type === "within" && r.from === entityId) ctx.store.remove("relationships", r.id);
    }
    if (parentId && parentId !== entityId) ctx.store.createRelationship("within", entityId, parentId);
  });
}

// ---------------------------------------------------------------------------
// assets
// ---------------------------------------------------------------------------

export async function uploadAsset(ctx: Pick<CampaignContextValue, "store" | "assets">, file: Blob, name?: string, visibility: Visibility = GM): Promise<Asset> {
  const mime = file.type || "application/octet-stream";
  const kind: Asset["kind"] = mime.startsWith("image/") ? "image" : mime === "application/pdf" ? "pdf" : "other";
  const dims = kind === "image" ? await imageDimensions(file) : undefined;
  const record: Omit<Asset, "id" | "created" | "updated"> = {
    kind,
    name: name ?? (file instanceof File ? file.name : "asset"),
    mime,
    size: file.size,
    visibility,
  };
  if (dims) {
    record.width = dims.width;
    record.height = dims.height;
  }
  const asset = ctx.store.insert("assets", record);
  await ctx.assets.put(asset.id, file);
  return asset;
}

export async function setEntityImage(ctx: Pick<CampaignContextValue, "store" | "assets">, entityId: Id, file: Blob | undefined): Promise<Entity> {
  const entity = ctx.store.get("entities", entityId);
  if (!entity) throw new Error(`entities/${entityId} not found`);
  if (!file) {
    if (entity.image) {
      await ctx.assets.delete(entity.image).catch(() => undefined);
      ctx.store.remove("assets", entity.image);
    }
    return ctx.store.update("entities", entityId, { image: undefined });
  }
  const asset = await uploadAsset(ctx, file, undefined, entity.visibility);
  return ctx.store.update("entities", entityId, { image: asset.id });
}

// ---------------------------------------------------------------------------
// notes, sessions
// ---------------------------------------------------------------------------

export function createNote(ctx: Ctx, input: { title: string; attachedTo?: Note["attachedTo"]; tags?: string[] }): Note {
  return ctx.store.createNote({ title: input.title.trim() || "Untitled note", attachedTo: input.attachedTo, tags: input.tags });
}

export function deleteNote(ctx: Ctx, id: Id): boolean {
  const note = ctx.store.get("notes", id);
  const removed = ctx.store.remove("notes", id);
  if (note) ctx.registry?.close(note.bodyDoc);
  return removed;
}

/** Create a session and mark it running. */
export function startSession(ctx: Ctx, input: { title?: string; attendees?: Id[] } = {}): Session {
  const members = ctx.store.meta().members;
  return ctx.store.createSession({
    title: input.title,
    attendees: input.attendees ?? members.map((m) => m.id),
    status: "running",
  });
}

export function planSession(ctx: Ctx, input: { title?: string; date?: string } = {}): Session {
  return ctx.store.createSession({ title: input.title, date: input.date, status: "planned" });
}

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

/** y-indexeddb writes updates asynchronously; give the IDB transaction a tick. */
function settle(ms = 60): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export type { LoadedModule, MapName };
