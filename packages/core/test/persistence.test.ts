import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import * as Y from "yjs";
import {
  AssetStore,
  CampaignStore,
  RichTextRegistry,
  deleteCampaignData,
  fromMarkdown,
  listCampaigns,
  openPersistence,
  plainText,
  registerCampaign,
  unregisterCampaign,
} from "../src";
import { newStore } from "./fixtures";

describe("persistence", () => {
  it("round-trips the campaign doc and rich-text docs through IndexedDB", async () => {
    const store = newStore("Persisted");
    const registry = new RichTextRegistry();
    const p = openPersistence(store, { registry });
    await p.whenSynced;
    const e = store.createEntity({ type: "example.person", name: "Okafor" });
    const note = store.createNote({ title: "N" });
    fromMarkdown(registry.open(note.bodyDoc), "Hello **world**");
    await p.whenDocSynced(note.bodyDoc);
    // y-indexeddb writes updates asynchronously; give the IDB transaction a tick
    await new Promise((r) => setTimeout(r, 50));
    p.destroy();
    registry.closeAll();

    const doc = new Y.Doc();
    const reopened = CampaignStore.fromDoc(doc);
    const registry2 = new RichTextRegistry();
    const p2 = openPersistence(reopened, { name: `cf-campaign-${store.id}`, registry: registry2 });
    await p2.whenSynced;
    expect(reopened.id).toBe(store.id);
    expect(reopened.meta().name).toBe("Persisted");
    expect(reopened.get("entities", e.id)?.name).toBe("Okafor");
    expect(reopened.get("notes", note.id)?.bodyDoc).toBe(note.bodyDoc);
    const body = registry2.open(note.bodyDoc);
    await p2.whenDocSynced(note.bodyDoc);
    expect(plainText(body)).toBe("Hello world");
    p2.destroy();
    registry2.closeAll();
  });

  it("stores and lists asset blobs", async () => {
    const assets = new AssetStore("campaign-x");
    const blob = new Blob([new Uint8Array([1, 2, 3])], { type: "image/png" });
    await assets.put("asset-1", blob);
    const got = await assets.get("asset-1");
    expect(got).toBeInstanceOf(Blob);
    expect(new Uint8Array(await got!.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3]));
    expect(got!.type).toBe("image/png");
    expect(await assets.list()).toEqual(["asset-1"]);
    expect(await assets.get("missing")).toBeUndefined();
    await assets.delete("asset-1");
    expect(await assets.list()).toEqual([]);
    await assets.close();
  });

  it("keeps a campaign index and deletes campaign data", async () => {
    const a = newStore("Alpha");
    const b = newStore("Beta");
    await registerCampaign(a.meta());
    await registerCampaign({ ...b.meta(), updated: "2999-01-01T00:00:00.000Z" });
    const list = await listCampaigns();
    expect(list.map((c) => c.name)).toEqual(["Beta", "Alpha"]);
    expect(list[1]).toEqual({ id: a.id, name: "Alpha", moduleId: "example", updated: a.meta().updated });
    await unregisterCampaign(b.id);
    expect((await listCampaigns()).map((c) => c.id)).toEqual([a.id]);

    const p = openPersistence(a);
    await p.whenSynced;
    a.createEntity({ type: "example.person", name: "x" });
    await new Promise((r) => setTimeout(r, 50));
    p.destroy();
    const assets = new AssetStore(a.id);
    await assets.put("blob", new Blob(["x"]));
    await assets.close();
    await deleteCampaignData(a.id);
    expect(await listCampaigns()).toEqual([]);
    const fresh = CampaignStore.fromDoc(new Y.Doc());
    const p2 = openPersistence(fresh, { name: `cf-campaign-${a.id}` });
    await p2.whenSynced;
    expect(fresh.count("entities")).toBe(0);
    p2.destroy();
  });
});

describe("persistence without indexedDB", () => {
  it("throws a clear error", () => {
    const saved = (globalThis as { indexedDB?: unknown }).indexedDB;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (globalThis as any).indexedDB;
    try {
      expect(() => new AssetStore("x")).toThrow(/IndexedDB is not available/);
      expect(() => openPersistence(newStore())).toThrow(/IndexedDB is not available/);
    } finally {
      (globalThis as { indexedDB?: unknown }).indexedDB = saved;
    }
  });
});
