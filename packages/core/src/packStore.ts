/**
 * Data packs (and supplements) the GM imported on this device: a plain IndexedDB database with
 * two stores, so the module list reads the small metadata records without
 * loading any pack (`meta`), and a pack's JSON loads only when a campaign
 * needs it (`data`). The core never interprets a pack: it stores the JSON the
 * app validated with the SDK, and the app validates it again on load.
 */
import type { ModuleLicense, ModuleManifest } from "@campaign-forge/module-sdk";
import { done, request, requireIndexedDB } from "./idb";

export const PACKS_DB = "cf-packs";
const META = "meta";
const DATA = "data";

/** What the module list shows about an imported pack. */
export interface InstalledPackMeta extends Pick<ModuleManifest, "id" | "name" | "version" | "ruleset" | "modes" | "defaultMode" | "dataStatus"> {
  license?: ModuleLicense;
  publisher?: string;
  licenseNotice?: string;
  /** ISO time of the import. */
  importedAt: string;
  /** File names it was imported from. */
  files: string[];
  /** Size of the merged pack JSON in bytes. */
  bytes: number;
}

/**
 * A two-store IndexedDB database of JSON documents: small metadata records
 * (`meta`, listed without loading any document) and the documents (`data`),
 * keyed by id. Imported packs and supplements each have one.
 */
function jsonDocumentStore<M extends { id: string; name: string }>(dbName: string) {
  const open = (): Promise<IDBDatabase> => {
    const req = requireIndexedDB().open(dbName, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(META)) db.createObjectStore(META, { keyPath: "id" });
      if (!db.objectStoreNames.contains(DATA)) db.createObjectStore(DATA);
    };
    return request(req);
  };
  return {
    async list(): Promise<M[]> {
      const db = await open();
      try {
        const rows = (await request(db.transaction(META, "readonly").objectStore(META).getAll())) as M[];
        return rows.sort((a, b) => a.name.localeCompare(b.name) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
      } finally {
        db.close();
      }
    },
    async get(id: string): Promise<unknown> {
      const db = await open();
      try {
        return (await request(db.transaction(DATA, "readonly").objectStore(DATA).get(id))) as unknown;
      } finally {
        db.close();
      }
    },
    async put(meta: M, doc: unknown): Promise<void> {
      const db = await open();
      try {
        const tx = db.transaction([META, DATA], "readwrite");
        tx.objectStore(META).put(meta);
        tx.objectStore(DATA).put(doc, meta.id);
        await done(tx);
      } finally {
        db.close();
      }
    },
    async remove(id: string): Promise<void> {
      const db = await open();
      try {
        const tx = db.transaction([META, DATA], "readwrite");
        tx.objectStore(META).delete(id);
        tx.objectStore(DATA).delete(id);
        await done(tx);
      } finally {
        db.close();
      }
    },
  };
}

const packs = jsonDocumentStore<InstalledPackMeta>(PACKS_DB);

export function listInstalledPacks(): Promise<InstalledPackMeta[]> {
  return packs.list();
}

/** The stored pack JSON (merged, self-contained), or undefined. */
export function getInstalledPack(id: string): Promise<unknown> {
  return packs.get(id);
}

/** Store (or replace) a pack and its metadata in one transaction. */
export function putInstalledPack(meta: InstalledPackMeta, pack: unknown): Promise<void> {
  return packs.put(meta, pack);
}

export function deleteInstalledPack(id: string): Promise<void> {
  return packs.remove(id);
}

// ---------------------------------------------------------------------------
// Supplements
// ---------------------------------------------------------------------------

/**
 * Supplements the GM imported on this device: additive data for one module,
 * stored like packs (their own database, so a supplement id never collides
 * with a pack id). The core stores the JSON the app validated; the app
 * validates it again, against the module it extends, whenever that module loads.
 */
export const SUPPLEMENTS_DB = "cf-supplements";

/** What the module list shows about an imported supplement. */
export interface InstalledSupplementMeta {
  id: string;
  name: string;
  version: string;
  /** The module it extends, and the module versions it accepts (a semver range), if it says. */
  extends: { module: string; version?: string };
  licenseNotice: string;
  license?: ModuleLicense;
  authors?: string[];
  description?: string;
  /** Entries it adds, per collection ("referenceItems", "rules", ...). */
  counts: Record<string, number>;
  importedAt: string;
  files: string[];
  bytes: number;
}

const supplements = jsonDocumentStore<InstalledSupplementMeta>(SUPPLEMENTS_DB);

/** Every imported supplement, by name. */
export function listInstalledSupplements(): Promise<InstalledSupplementMeta[]> {
  return supplements.list();
}

/** The stored supplement JSON, or undefined. */
export function getInstalledSupplement(id: string): Promise<unknown> {
  return supplements.get(id);
}

/** Store (or replace) a supplement and its metadata in one transaction. */
export function putInstalledSupplement(meta: InstalledSupplementMeta, supplement: unknown): Promise<void> {
  return supplements.put(meta, supplement);
}

export function deleteInstalledSupplement(id: string): Promise<void> {
  return supplements.remove(id);
}
