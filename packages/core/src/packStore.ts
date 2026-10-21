/**
 * Data packs the GM imported on this device: a plain IndexedDB database with
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

function openPacks(): Promise<IDBDatabase> {
  const req = requireIndexedDB().open(PACKS_DB, 1);
  req.onupgradeneeded = () => {
    const db = req.result;
    if (!db.objectStoreNames.contains(META)) db.createObjectStore(META, { keyPath: "id" });
    if (!db.objectStoreNames.contains(DATA)) db.createObjectStore(DATA);
  };
  return request(req);
}

export async function listInstalledPacks(): Promise<InstalledPackMeta[]> {
  const db = await openPacks();
  try {
    const rows = (await request(db.transaction(META, "readonly").objectStore(META).getAll())) as InstalledPackMeta[];
    return rows.sort((a, b) => a.name.localeCompare(b.name));
  } finally {
    db.close();
  }
}

/** The stored pack JSON (merged, self-contained), or undefined. */
export async function getInstalledPack(id: string): Promise<unknown> {
  const db = await openPacks();
  try {
    return (await request(db.transaction(DATA, "readonly").objectStore(DATA).get(id))) as unknown;
  } finally {
    db.close();
  }
}

/** Store (or replace) a pack and its metadata in one transaction. */
export async function putInstalledPack(meta: InstalledPackMeta, pack: unknown): Promise<void> {
  const db = await openPacks();
  try {
    const tx = db.transaction([META, DATA], "readwrite");
    tx.objectStore(META).put(meta);
    tx.objectStore(DATA).put(pack, meta.id);
    await done(tx);
  } finally {
    db.close();
  }
}

export async function deleteInstalledPack(id: string): Promise<void> {
  const db = await openPacks();
  try {
    const tx = db.transaction([META, DATA], "readwrite");
    tx.objectStore(META).delete(id);
    tx.objectStore(DATA).delete(id);
    await done(tx);
  } finally {
    db.close();
  }
}
