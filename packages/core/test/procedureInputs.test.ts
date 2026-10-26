import { describe, expect, it } from "vitest";
import { RichTextRegistry, adventureSnapshot, campaignSnapshot, fromMarkdown, loadAdventureSnapshot, plainText } from "../src";
import { fixtureModule, newStore } from "./fixtures";

const kindOf = (type: string) => fixtureModule.entityTypes.find((t) => t.id === type)?.kind;

function setup() {
  const store = newStore();
  const hero = store.createEntity({ type: "example.person", name: "Wren", fields: { role: "scout", isPC: true, stats: { grit: 3 } }, tags: ["b", "a"] });
  const ally = store.createEntity({ type: "example.person", name: "Ash", fields: { role: "smith", isPC: true } });
  const npc = store.createEntity({ type: "example.person", name: "Mayor Tull", fields: { role: "mayor", secret: "owes the guild" } });
  const town = store.createEntity({ type: "example.place", subtype: "town", name: "Fennick", fields: {} });
  store.createRelationship("example.rival_of", hero.id, ally.id);
  store.createRelationship("located_in", npc.id, town.id);
  return { store, hero, ally, npc, town };
}

describe("campaign snapshot (x-campaign inputs)", () => {
  it("summarises entities by name with kind, PC flag, tags and the scalar fields asked for, never text fields", () => {
    const { store, hero, npc } = setup();
    const snap = campaignSnapshot(store, { fields: ["role", "stats.grit"] }, kindOf);
    expect(snap.entities.map((e) => e.name)).toEqual(["Ash", "Fennick", "Mayor Tull", "Wren"]);
    expect(snap.entities.find((e) => e.id === hero.id)).toEqual({
      id: hero.id,
      name: "Wren",
      type: "example.person",
      kind: "character",
      pc: true,
      tags: ["a", "b"],
      fields: { role: "scout", "stats.grit": 3 },
    });
    const mayor = snap.entities.find((e) => e.id === npc.id)!;
    expect(mayor.pc).toBeUndefined();
    expect(JSON.stringify(mayor)).not.toContain("guild");
  });

  it("filters by kind, type and relationship type, keeping only links between included entities", () => {
    const { store, hero, ally } = setup();
    const people = campaignSnapshot(store, { kinds: ["character"], relationships: ["example.rival_of"] }, kindOf);
    expect(people.entities.every((e) => e.kind === "character")).toBe(true);
    expect(people.relationships).toEqual([{ type: "example.rival_of", from: hero.id, to: ally.id }]);
    expect(campaignSnapshot(store, { types: ["example.place"] }, kindOf).entities.map((e) => e.name)).toEqual(["Fennick"]);
    // located_in links to a place the kinds filter dropped
    expect(campaignSnapshot(store, { kinds: ["character"] }, kindOf).relationships.map((r) => r.type)).toEqual(["example.rival_of"]);
  });
});

describe("adventure snapshot (x-adventure inputs)", () => {
  it("reads the premise, the hidden situation, string fields, acts, cast and named site map rooms", async () => {
    const { store, hero, town } = setup();
    const registry = new RichTextRegistry();
    const adv = store.createAdventure({ title: "Bell Night", premise: "The bell stopped ringing.", withDocs: true });
    store.update("adventures", adv.id, { fields: { hook: "A stranger rings it", targetHours: 3 }, cast: { pcs: [hero.id, "gone"], towns: [town.id] } });
    const act = store.createAct(adv.id, { number: 3, title: "Showdown", goal: "Ring it at dawn" });
    store.update("acts", act.id, { fields: { pressure: "The mob gathers" } });
    fromMarkdown(registry.open(adv.gmSituationDoc!), "The mayor *cut* the rope.");
    const map = store.createMap({ name: "Belfry" });
    store.update("maps", map.id, {
      adventure: adv.id,
      layout: {
        decks: [],
        borders: [],
        markers: [],
        checks: [],
        zones: [
          { id: "z1", deck: "d", name: "Bell Loft", kind: "room", key: true, poly: [], cluttered: false },
          { id: "z2", deck: "d", name: "Stair", kind: "corridor", poly: [], cluttered: false },
          { id: "z3", deck: "d", name: "Crawl", kind: "crawlspace", layer: "duct", poly: [], cluttered: false },
        ],
      },
    });
    const snap = adventureSnapshot(store, adv.id, (id) => plainText(registry.open(id)))!;
    expect(snap).toEqual({
      id: adv.id,
      title: "Bell Night",
      premise: "The bell stopped ringing.",
      situation: "The mayor cut the rope.",
      fields: { hook: "A stranger rings it" },
      acts: [{ number: 3, title: "Showdown", goal: "Ring it at dawn", fields: { pressure: "The mob gathers" } }],
      cast: { pcs: [hero.id], towns: [town.id] },
      rooms: ["Bell Loft"],
    });
    expect((await loadAdventureSnapshot(store, registry, adv.id))?.situation).toBe("The mayor cut the rope.");
    expect(adventureSnapshot(store, "nope", () => "")).toBeUndefined();
  });
});
