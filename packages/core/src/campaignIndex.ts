/**
 * The index of campaigns on this device: a plain IndexedDB store, kept apart
 * from the Yjs persistence so the campaign list can read it without loading
 * Yjs.
 */
import { done, openDb, request } from "./idb";
import type { CampaignMeta, Id } from "./types";

export const INDEX_DB = "cf-index";

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
