import { describe, expect, it } from "vitest";
import { SearchIndex } from "../src";
import { newStore } from "./fixtures";

describe("SearchIndex", () => {
  it("finds by name prefix, fuzzy, fields and tags, and stays in sync with the store", () => {
    const store = newStore();
    const okafor = store.createEntity({ type: "example.person", name: "Deputy Marshal Okafor", tags: ["npc", "skyfire"], fields: { role: "lawman", stats: { grit: 4 } } });
    const place = store.createEntity({ type: "example.place", name: "Okaba Station", visibility: { level: "players" } });
    const scene = store.createScene(undefined, { title: "Marshal confronts the crew", purpose: "pressure" });
    const index = new SearchIndex();
    const detach = index.attach(store);
    expect(index.size).toBe(3);

    expect(index.search("oka").map((h) => h.id).sort()).toEqual([okafor.id, place.id].sort());
    expect(index.search("Okafor").map((h) => h.id)).toEqual([okafor.id]);
    expect(index.search("Okafur")[0]?.id).toBe(okafor.id);
    expect(index.search("lawman").map((h) => h.id)).toEqual([okafor.id]);
    expect(index.search("skyfire").map((h) => h.id)).toEqual([okafor.id]);
    expect(index.search("marshal").map((h) => h.kind).sort()).toEqual(["entity", "scene"]);
    expect(index.search("marshal", { kinds: ["scene"] }).map((h) => h.id)).toEqual([scene.id]);
    expect(index.search("oka", { types: ["example.place"] }).map((h) => h.id)).toEqual([place.id]);
    expect(index.search("marshal", { limit: 1 })).toHaveLength(1);

    store.update("entities", okafor.id, { name: "Sheriff Okafor" });
    expect(index.search("deputy")).toEqual([]);
    expect(index.search("sheriff").map((h) => h.id)).toEqual([okafor.id]);
    const note = store.createNote({ title: "Supply ledger" });
    expect(index.search("ledger").map((h) => h.id)).toEqual([note.id]);
    store.remove("entities", place.id);
    expect(index.search("station")).toEqual([]);
    detach();
    store.createEntity({ type: "example.person", name: "Unindexed" });
    expect(index.search("unindexed")).toEqual([]);
    index.rebuild(store);
    expect(index.search("unindexed")).toHaveLength(1);
  });

  it("respects the viewer", () => {
    const store = newStore();
    const hidden = store.createEntity({ type: "example.person", name: "Okafor" });
    const shown = store.createEntity({ type: "example.person", name: "Okabe", visibility: { level: "players" } });
    const mine = store.createEntity({ type: "example.person", name: "Okara", visibility: { level: "some_players", players: ["p1"] } });
    store.createScene(undefined, { title: "Okaz plan" });
    store.createHandout({ title: "Oka handout", visibility: { level: "revealed", revealedIn: "s" } });
    const index = new SearchIndex();
    index.rebuild(store);
    expect(index.search("oka").map((h) => h.id)).toHaveLength(5);
    const p1 = index.search("oka", { viewer: { role: "player", memberId: "p1" } });
    expect(p1.map((h) => h.id).sort()).toEqual([shown.id, mine.id, store.list("handouts")[0]!.id].sort());
    const p2 = index.search("oka", { viewer: { role: "player", memberId: "p2" } });
    expect(p2.map((h) => h.id)).not.toContain(mine.id);
    expect(p2.map((h) => h.id)).not.toContain(hidden.id);
    expect(p2.some((h) => h.kind === "scene")).toBe(false);
  });
});
