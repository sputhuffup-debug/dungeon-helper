import { describe, expect, it } from "vitest";
import { RefIndex, RichTextRegistry, ancestorsOf, appearancesTimeline, backlinks, childrenOf, fromMarkdown, locationTree, relationshipsOf } from "../src";
import { PLACE, fixtureModule, newStore } from "./fixtures";

describe("graph", () => {
  it("reads relationships from both ends with module labels", () => {
    const store = newStore();
    const a = store.createEntity({ type: "example.person", name: "A" });
    const b = store.createEntity({ type: "example.person", name: "B" });
    const town = store.createEntity({ type: PLACE.id, name: "Town" });
    store.createRelationship("within", a.id, town.id);
    store.createRelationship("example.rival_of", a.id, b.id);
    store.createRelationship("custom.unknown", b.id, a.id);
    const fromA = relationshipsOf(store, a.id, fixtureModule);
    expect(fromA.map((r) => [r.direction, r.other, r.label])).toEqual([
      ["out", town.id, "within"],
      ["out", b.id, "rival of"],
      ["in", b.id, "custom.unknown (reverse)"],
    ]);
    expect(relationshipsOf(store, town.id)[0]?.label).toBe("contains");
    expect(relationshipsOf(store, b.id, fixtureModule).find((r) => r.rel.type === "example.rival_of")?.label).toBe("rival of");
  });

  it("builds containment: children, ancestors and the location tree", () => {
    const store = newStore();
    const region = store.createEntity({ type: PLACE.id, name: "Region", subtype: "region" });
    const town = store.createEntity({ type: PLACE.id, name: "Town", subtype: "town" });
    const bar = store.createEntity({ type: PLACE.id, name: "Bar" });
    const annex = store.createEntity({ type: PLACE.id, name: "Annex" });
    const person = store.createEntity({ type: "example.person", name: "P" });
    store.createRelationship("within", town.id, region.id);
    store.createRelationship("within", bar.id, town.id);
    store.createRelationship("within", annex.id, town.id);
    store.createRelationship("within", person.id, bar.id);
    expect(childrenOf(store, town.id).map((e) => e.name)).toEqual(["Annex", "Bar"]);
    expect(ancestorsOf(store, person.id).map((e) => e.name)).toEqual(["Bar", "Town", "Region"]);
    const tree = locationTree(store, fixtureModule);
    expect(tree.map((n) => n.entity.name)).toEqual(["Region"]);
    expect(tree[0]?.children[0]?.children.map((n) => n.entity.name)).toEqual(["Annex", "Bar"]);
    expect(tree[0]?.children[0]?.children[1]?.children).toEqual([]);
    const all = locationTree(store);
    expect(all.map((n) => n.entity.name)).toEqual(["Region"]);
    expect(JSON.stringify(all).includes('"name":"P"')).toBe(true);
  });

  it("computes backlinks from scene fields and rich-text refs, updating on doc change", () => {
    const store = newStore();
    const registry = new RichTextRegistry();
    const okafor = store.createEntity({ type: "example.person", name: "Okafor" });
    const bar = store.createEntity({ type: PLACE.id, name: "Bar" });
    const adv = store.createAdventure({ title: "Adv" });
    const act = store.createAct(adv.id);
    const scene = store.createScene(act.id, { title: "Meet", participants: [okafor.id], location: bar.id });
    const note = store.createNote({ title: "Plans" });
    fromMarkdown(registry.open(note.bodyDoc), `Talk to [[${okafor.id}|Okafor]] tonight.`);
    const session = store.createSession({ title: "S1" });
    fromMarkdown(registry.open(session.logDoc), "nothing yet");
    store.createTimelineEvent({ inWorldDate: "2200", text: "Okafor arrives", entities: [okafor.id] });

    const index = new RefIndex(registry);
    const links = backlinks(store, index, okafor.id);
    expect(links.map((l) => `${l.kind}:${l.via}`).sort()).toEqual(["note:body", "scene:participants", "timeline:entities"].sort());
    expect(links.find((l) => l.kind === "note")).toMatchObject({ id: note.id, title: "Plans" });
    expect(backlinks(store, registry, bar.id).map((l) => [l.kind, l.id, l.via])).toEqual([["scene", scene.id, "location"]]);

    fromMarkdown(registry.open(session.logDoc), `[[${bar.id}|Bar]] was quiet`);
    expect(backlinks(store, index, bar.id).map((l) => l.kind).sort()).toEqual(["scene", "session"]);
    fromMarkdown(registry.open(note.bodyDoc), "no refs now");
    expect(backlinks(store, index, okafor.id).some((l) => l.kind === "note")).toBe(false);
    expect(index.docsReferencing(bar.id)).toEqual([session.logDoc]);
    index.dispose();
  });

  it("lists appearances in sessions and scenes", () => {
    const store = newStore();
    const okafor = store.createEntity({ type: "example.person", name: "Okafor" });
    const adv = store.createAdventure({ title: "Adv" });
    const act = store.createAct(adv.id);
    const s1 = store.createScene(act.id, { title: "One", participants: [okafor.id] });
    const s2 = store.createScene(act.id, { title: "Two", participants: [okafor.id] });
    store.createScene(act.id, { title: "Three" });
    const session = store.createSession({ date: "2026-10-01", title: "Night" });
    store.update("sessions", session.id, { scenesRun: [s1.id] });
    const app = appearancesTimeline(store, okafor.id);
    expect(app.map((a) => [a.kind, a.id])).toEqual([
      ["session", session.id],
      ["scene", s1.id],
      ["scene", s2.id],
    ]);
    expect(app[1]?.date).toBe("2026-10-01");
    expect(app[2]?.via).toBe("planned");
  });
});
