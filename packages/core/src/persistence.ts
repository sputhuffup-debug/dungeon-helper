/**
 * IndexedDB persistence: the campaign document and each rich-text document
 * through y-indexeddb, binary assets in a plain IDB store, and a small
 * index of campaigns on this device.
 */
import { IndexeddbPersistence, clearDocument } from "y-indexeddb";
import type * as Y from "yjs";
import type { RichTextRegistry } from "./richtext";
import type { CampaignStore } from "./store";
import type { Asset, CampaignMeta, Id } from "./types";

export const CAMPAIGN_DB_PREFIX = "cf-campaign-";
export const DOC_DB_PREFIX = "cf-doc-";
export const ASSETS_DB_PREFIX = "cf-assets-";
export const INDEX_DB = "cf-index";

export function requireIndexedDB(): IDBFactory {
  const idb = (globalThis as { indexedDB?: IDBFactory }).indexedDB;
  if (!idb) {
    throw new Error("IndexedDB is not available in this environment; persistence needs a browser or fake-indexeddb.");
  }
  return idb;
}

export function campaignDbName(id: Id): string {
  return `${CAMPAIGN_DB_PREFIX}${id}`;
}
export function docDbName(id: Id): string {
  return `${DOC_DB_PREFIX}${id}`;
}
export function assetsDbName(id: Id): string {
  return `${ASSETS_DB_PREFIX}${id}`;
}

export interface PersistenceHandle {
  /** Resolves when the campaign document has loaded its stored updates. */
  whenSynced: Promise<void>;
  /** Resolves when the rich-text doc `id` has loaded (opens it if needed). */
  whenDocSynced(id: Id): Promise<void>;
  /** Stop persisting; data stays in IndexedDB. */
  destroy(): void;
}

export interface PersistenceOptions {
  /** Database name override for the campaign doc (default `cf-campaign-<id>`). */
  name?: string;
  /** Rich-text docs opened through this registry are persisted under `cf-doc-<id>`. */
  registry?: RichTextRegistry;
}

function synced(p: IndexeddbPersistence): Promise<void> {
  return p.whenSynced.then(() => undefined);
}

export function openPersistence(store: CampaignStore, opts: PersistenceOptions = {}): PersistenceHandle {
  requireIndexedDB();
  const name = opts.name ?? campaignDbName(store.id);
  const main = new IndexeddbPersistence(name, store.doc);
  const docs = new Map<Id, IndexeddbPersistence>();
  const unsub: Array<() => void> = [];

  const attach = (id: Id, doc: Y.Doc): Promise<void> => {
    let p = docs.get(id);
    if (!p) {
      p = new IndexeddbPersistence(docDbName(id), doc);
      docs.set(id, p);
    }
    return synced(p);
  };

  const registry = opts.registry;
  if (registry) {
    for (const id of registry.ids()) {
      const doc = registry.peek(id);
      if (doc) void attach(id, doc);
    }
    registry.setLoader((id, doc) => attach(id, doc));
    unsub.push(
      registry.onClose((id) => {
        const p = docs.get(id);
        if (p) {
          docs.delete(id);
          p.destroy();
        }
      }),
    );
  }

  return {
    whenSynced: synced(main),
    whenDocSynced(id: Id): Promise<void> {
      if (registry) return registry.whenReady(id);
      const p = docs.get(id);
      return p ? synced(p) : Promise.reject(new Error(`doc ${id} is not open through a registry`));
    },
    destroy() {
      for (const u of unsub) u();
      if (registry) registry.setLoader(undefined);
      for (const p of docs.values()) p.destroy();
      docs.clear();
      main.destroy();
    },
  };
}

// ---------------------------------------------------------------------------
// plain IDB helpers
// ---------------------------------------------------------------------------

function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("IndexedDB request failed"));
  });
}

function done(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("IndexedDB transaction failed"));
    tx.onabort = () => reject(tx.error ?? new Error("IndexedDB transaction aborted"));
  });
}

function openDb(name: string, store: string, options?: IDBObjectStoreParameters): Promise<IDBDatabase> {
  const idb = requireIndexedDB();
  const req = idb.open(name, 1);
  req.onupgradeneeded = () => {
    const db = req.result;
    if (!db.objectStoreNames.contains(store)) db.createObjectStore(store, options);
  };
  return request(req);
}

function deleteDb(name: string): Promise<void> {
  const idb = requireIndexedDB();
  return request(idb.deleteDatabase(name)).then(() => undefined);
}

// ---------------------------------------------------------------------------
// assets
// ---------------------------------------------------------------------------

const BLOBS = "blobs";

/** Binary assets of one campaign, keyed by asset id. Metadata lives in the campaign's `assets` map. */
export class AssetStore {
  readonly campaignId: Id;
  #db: Promise<IDBDatabase> | undefined;

  constructor(campaignId: Id) {
    this.campaignId = campaignId;
    requireIndexedDB();
  }

  #open(): Promise<IDBDatabase> {
    if (!this.#db) this.#db = openDb(assetsDbName(this.campaignId), BLOBS);
    return this.#db;
  }

  async put(id: Id, blob: Blob): Promise<void> {
    const db = await this.#open();
    const tx = db.transaction(BLOBS, "readwrite");
    tx.objectStore(BLOBS).put(blob, id);
    await done(tx);
  }

  async get(id: Id): Promise<Blob | undefined> {
    const db = await this.#open();
    const tx = db.transaction(BLOBS, "readonly");
    const result = await request<unknown>(tx.objectStore(BLOBS).get(id));
    return result instanceof Blob ? result : undefined;
  }

  async delete(id: Id): Promise<void> {
    const db = await this.#open();
    const tx = db.transaction(BLOBS, "readwrite");
    tx.objectStore(BLOBS).delete(id);
    await done(tx);
  }

  async list(): Promise<Id[]> {
    const db = await this.#open();
    const tx = db.transaction(BLOBS, "readonly");
    const keys = await request(tx.objectStore(BLOBS).getAllKeys());
    return keys.map((k) => String(k));
  }

  async close(): Promise<void> {
    if (!this.#db) return;
    const db = await this.#db;
    db.close();
    this.#db = undefined;
  }
}

// ---------------------------------------------------------------------------
// campaign index
// ---------------------------------------------------------------------------

const CAMPAIGNS = "campaigns";

export interface CampaignIndexEntry {
  id: Id;
  name: string;
  moduleId: string;
  updated: string;
}

function openIndex(): Promise<IDBDatabase> {
  return openDb(INDEX_DB, CAMPAIGNS, { keyPath: "id" });
}

export async function listCampaigns(): Promise<CampaignIndexEntry[]> {
  const db = await openIndex();
  try {
    const tx = db.transaction(CAMPAIGNS, "readonly");
    const rows = await request(tx.objectStore(CAMPAIGNS).getAll());
    return (rows as CampaignIndexEntry[]).sort((a, b) => (a.updated < b.updated ? 1 : a.updated > b.updated ? -1 : 0));
  } finally {
    db.close();
  }
}

export async function registerCampaign(meta: Pick<CampaignMeta, "id" | "name" | "moduleId" | "updated">): Promise<void> {
  const db = await openIndex();
  try {
    const tx = db.transaction(CAMPAIGNS, "readwrite");
    const entry: CampaignIndexEntry = { id: meta.id, name: meta.name, moduleId: meta.moduleId, updated: meta.updated };
    tx.objectStore(CAMPAIGNS).put(entry);
    await done(tx);
  } finally {
    db.close();
  }
}

export async function unregisterCampaign(id: Id): Promise<void> {
  const db = await openIndex();
  try {
    const tx = db.transaction(CAMPAIGNS, "readwrite");
    tx.objectStore(CAMPAIGNS).delete(id);
    await done(tx);
  } finally {
    db.close();
  }
}

/**
 * Delete everything stored for a campaign: its document, its assets, the
 * given rich-text docs (IndexedDB cannot enumerate them per campaign; pass
 * `docIdsOf(store.toJSON())`), and its index entry.
 */
export async function deleteCampaignData(id: Id, docIds: Id[] = []): Promise<void> {
  await clearDocument(campaignDbName(id));
  for (const docId of docIds) await clearDocument(docDbName(docId));
  await deleteDb(assetsDbName(id));
  await unregisterCampaign(id);
}

/** Expose the asset metadata record shape for callers building `assets` entries. */
export type AssetMeta = Asset;
