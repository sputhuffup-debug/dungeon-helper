import { describe, expect, it } from "vitest";
import * as Y from "yjs";
import { CampaignStore, docIdsOf, type StoreChange } from "../src";
import { newStore } from "./fixtures";

describe("CampaignStore", () => {
  it("creates meta and reads it back", () => {
    const store = newStore("Skyfire Down");
    const meta = store.meta();
    expect(meta.name).toBe("Skyfire Down");
    expect(meta.moduleId).toBe("example");
    expect(meta.members[0]?.role).toBe("gm");
    expect(store.id).toBe(meta.id);
    store.updateMeta({ currentDate: "2200-01-01", settings: { frame: "colony" } });
    expect(store.meta().currentDate).toBe("2200-01-01");
    expect(store.meta().settings).toEqual({ frame: "colony" });
    expect(store.meta().id).toBe(meta.id);
  });

  it("does generic CRUD with timestamps and field deletes", () => {
    const store = newStore();
    const e = store.createEntity({ type: "example.person", name: "Okafor", fields: { role: "marshal" }, summary: "tired" });
    expect(e.id).toHaveLength(26);
    expect(store.get("entities", e.id)).toEqual(e);
    const updated = store.update("entities", e.id, { name: "Marshal Okafor", summary: undefined });
    expect(updated.name).toBe("Marshal Okafor");
    expect(updated.summary).toBeUndefined();
    expect(updated.created).toBe(e.created);
    expect(store.list("entities")).toHaveLength(1);
    expect(store.remove("entities", e.id)).toBe(true);
    expect(store.remove("entities", e.id)).toBe(false);
    expect(store.get("entities", e.id)).toBeUndefined();
    expect(() => store.update("entities", e.id, { name: "x" })).toThrow();
  });

  it("stores nested values by copy and returns independent snapshots", () => {
    const store = newStore();
    const fields = { stats: { grit: 1 } };
    const e = store.createEntity({ type: "example.person", name: "A", fields });
    fields.stats.grit = 99;
    expect(store.get("entities", e.id)?.fields).toEqual({ stats: { grit: 1 } });
    store.update("entities", e.id, { fields: { stats: { grit: 2 } } });
    expect(store.get("entities", e.id)?.fields).toEqual({ stats: { grit: 2 } });
  });

  it("cascades removals: entity -> relationships, adventure -> acts -> scenes", () => {
    const store = newStore();
    const a = store.createEntity({ type: "example.person", name: "A" });
    const b = store.createEntity({ type: "example.person", name: "B" });
    const c = store.createEntity({ type: "example.person", name: "C" });
    store.createRelationship("knows", a.id, b.id);
    store.createRelationship("knows", b.id, c.id);
    store.remove("entities", b.id);
    expect(store.list("relationships")).toHaveLength(0);
    expect(store.count("entities")).toBe(2);

    const adv = store.createAdventure({ title: "Adv" });
    const act1 = store.createAct(adv.id, { goal: "one" });
    const act2 = store.createAct(adv.id);
    const s1 = store.createScene(act1.id, { title: "S1" });
    const s2 = store.createScene(act1.id, { title: "S2" });
    const s3 = store.createScene(act2.id, { title: "S3" });
    const loose = store.createScene(undefined, { title: "loose" });
    expect(store.get("adventures", adv.id)?.acts).toEqual([act1.id, act2.id]);
    expect(store.get("acts", act1.id)?.scenes).toEqual([s1.id, s2.id]);
    expect(act2.number).toBe(2);

    store.remove("scenes", s2.id);
    expect(store.get("acts", act1.id)?.scenes).toEqual([s1.id]);
    store.remove("acts", act2.id);
    expect(store.get("scenes", s3.id)).toBeUndefined();
    expect(store.get("adventures", adv.id)?.acts).toEqual([act1.id]);
    store.remove("adventures", adv.id);
    expect(store.count("acts")).toBe(0);
    expect(store.list("scenes").map((s) => s.id)).toEqual([loose.id]);
  });

  it("orders children with moveInList", () => {
    const store = newStore();
    const adv = store.createAdventure({ title: "Adv" });
    const act = store.createAct(adv.id);
    const ids = ["a", "b", "c"].map((t) => store.createScene(act.id, { title: t }).id);
    expect(store.moveInList("acts", act.id, "scenes", ids[2] as string, 0)).toEqual([ids[2], ids[0], ids[1]]);
    expect(store.moveInList("acts", act.id, "scenes", ids[2] as string, 99)).toEqual([ids[0], ids[1], ids[2]]);
    expect(store.get("acts", act.id)?.scenes).toEqual(ids);
    const acts = [act.id, store.createAct(adv.id).id, store.createAct(adv.id).id];
    store.moveInList("adventures", adv.id, "acts", acts[0] as string, 1);
    expect(store.get("adventures", adv.id)?.acts).toEqual([acts[1], acts[0], acts[2]]);
  });

  it("batches subscription changes per transaction and per map", () => {
    const store = newStore();
    const changes: StoreChange[] = [];
    const unsubscribe = store.subscribe((c) => changes.push(c));
    const a = store.createEntity({ type: "example.person", name: "A" });
    expect(changes).toEqual([{ map: "entities", ids: [a.id] }]);
    changes.length = 0;
    let b!: { id: string };
    store.transact(() => {
      b = store.createEntity({ type: "example.person", name: "B" });
      store.update("entities", a.id, { name: "A2" });
      store.createRelationship("knows", a.id, b.id);
    });
    expect(changes).toHaveLength(2);
    const ent = changes.find((c) => c.map === "entities");
    expect(ent && [...ent.ids].sort()).toEqual([a.id, b.id].sort());
    expect(changes.find((c) => c.map === "relationships")?.ids).toHaveLength(1);
    changes.length = 0;
    store.updateMeta({ name: "renamed" });
    expect(changes[0]?.map).toBe("meta");
    expect(changes[0]?.ids).toContain("name");
    unsubscribe();
    store.createEntity({ type: "example.person", name: "C" });
    expect(changes).toHaveLength(1);
  });

  it("notifies record subscribers, including on removal", () => {
    const store = newStore();
    const a = store.createEntity({ type: "example.person", name: "A" });
    const seen: Array<string | undefined> = [];
    store.subscribeRecord("entities", a.id, (rec) => seen.push(rec?.name));
    store.update("entities", a.id, { name: "A1" });
    store.createEntity({ type: "example.person", name: "other" });
    store.remove("entities", a.id);
    expect(seen).toEqual(["A1", undefined]);
  });

  it("round-trips toJSON/loadJSON and survives a Yjs update exchange", () => {
    const store = newStore();
    const e = store.createEntity({ type: "example.person", name: "A", tags: ["x"] });
    const adv = store.createAdventure({ title: "Adv", withDocs: true });
    const act = store.createAct(adv.id, { withPacingDoc: true });
    const scene = store.createScene(act.id, { title: "S", withReadAloudDoc: true });
    const note = store.createNote({ title: "N", attachedTo: { kind: "entity", id: e.id } });
    const session = store.createSession({ title: "one" });
    const handout = store.createHandout({ title: "H" });
    store.createMap({ name: "M" });
    store.createTimelineEvent({ inWorldDate: "2200-01-01", text: "boom", entities: [e.id] });
    const json = store.toJSON();
    expect(Object.keys(json.entities)).toEqual([e.id]);
    expect(json.meta.id).toBe(store.id);
    expect(new Set(docIdsOf(json))).toEqual(
      new Set([adv.playerIntroDoc, adv.gmSituationDoc, adv.epilogueDoc, act.pacingDoc, scene.bodyDoc, scene.readAloudDoc, note.bodyDoc, session.logDoc, handout.bodyDoc]),
    );

    const copy = CampaignStore.fromJSON(json);
    expect(copy.toJSON()).toEqual(json);
    expect(copy.id).toBe(store.id);

    const doc2 = new Y.Doc();
    Y.applyUpdate(doc2, Y.encodeStateAsUpdate(store.doc));
    const viaDoc = CampaignStore.fromDoc(doc2);
    expect(viaDoc.toJSON()).toEqual(json);
    viaDoc.update("entities", e.id, { name: "B" });
    Y.applyUpdate(store.doc, Y.encodeStateAsUpdate(doc2));
    expect(store.get("entities", e.id)?.name).toBe("B");
  });
});
