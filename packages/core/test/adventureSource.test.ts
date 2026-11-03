import { describe, expect, it } from "vitest";
import type { AdventureSourceDef, GameModule, Template } from "@campaign-forge/module-sdk";
import * as Y from "yjs";
import {
  adventureClosed,
  adventureOfSource,
  adventureSourceFor,
  adventureSourceInput,
  docFromMarkdown,
  isTemplateGuidance,
  playerSceneTitle,
  playerShareSnapshot,
  projectCampaignForViewer,
  sourceDefOf,
  type Id,
} from "../src";
import { fixtureModule, newStore } from "./fixtures";

/** A generic quest template and a source that runs a place as that quest: nothing game-specific. */
const quest: Template = {
  id: "example.template.errand",
  kind: "adventure",
  name: "Errand",
  scaffold: {
    title: "Errand",
    playerIntro: "_What the patron tells the heroes. Leave out the trap._",
    acts: [{ number: 1, goal: "Go there", scenes: [{ id: "arrive", title: "Arrival", purpose: "Arrival: the heroes reach the place (link the place)." }] }],
  },
};
const runPlace: AdventureSourceDef = {
  id: "example.run-place",
  entityType: "example.place",
  template: quest.id,
  label: "Run this place",
  open: { "==": [{ var: "fields.climate" }, "stormy"] },
  outcomes: [{ id: "calm", label: "Calmed", set: { path: "climate", value: "calm" }, closes: true }],
  prefill: (input) => ({ title: `Errand at ${input.entity.name}`, scenes: { arrive: { location: input.entity.id, ...(input.maps[0] ? { map: input.maps[0].id } : {}), participants: input.links.filter((l) => l.entity.kind === "character").map((l) => l.entity.id) } }, plan: ["arrive"] }),
};
const module: GameModule = { ...fixtureModule, templates: [...fixtureModule.templates, quest], adventureSources: [runPlace] };

function seeded() {
  const store = newStore();
  const place = store.createEntity({ type: "example.place", name: "Old Mill", fields: { climate: "stormy" } });
  const miller = store.createEntity({ type: "example.person", name: "Miller", fields: { role: "miller", secret: "He set the fire" } });
  const stranger = store.createEntity({ type: "example.person", name: "Stranger", fields: {} });
  store.createRelationship("knows", miller.id, place.id);
  store.createRelationship("knows", place.id, stranger.id, "met on the road");
  const map = store.createMap({ name: "Mill map", location: place.id });
  const other = store.createMap({ name: "Elsewhere" });
  return { store, place, miller, stranger, map, other };
}

describe("adventure sources", () => {
  it("hands the prefill the record, its links both ways, the maps of linked places and the GM-only field paths", () => {
    const s = seeded();
    s.store.update("entities", s.miller.id, { fieldVisibility: { role: { level: "gm" } } });
    const input = adventureSourceInput(s.store.toJSON(), module, s.place.id, "default");
    expect(input.entity).toMatchObject({ id: s.place.id, name: "Old Mill", type: "example.place", fields: { climate: "stormy" } });
    expect(input.links.map((l) => [l.relationship, l.direction, l.entity.name, l.entity.kind])).toEqual([
      ["knows", "in", "Miller", "character"],
      ["knows", "out", "Stranger", "character"],
    ]);
    expect(input.links[1]!.note).toBe("met on the road");
    expect(input.maps).toEqual([{ id: s.map.id, name: "Mill map", location: s.place.id }]);
    expect(input.clues).toEqual([]);
    // pure: the same campaign gives the same input
    expect(adventureSourceInput(s.store.toJSON(), module, s.place.id, "default")).toEqual(input);
    // the miller's GM-only fields are named on his own input
    expect(adventureSourceInput(s.store.toJSON(), module, s.miller.id, "default").entity.gmFields).toEqual(["plan", "role", "secret"]);
  });

  it("finds the source definition, the adventure made from a record, and when it is closed", () => {
    const s = seeded();
    expect(adventureSourceFor(module, s.place)).toBe(runPlace);
    expect(adventureSourceFor(module, s.miller)).toBeUndefined();
    const adv = s.store.createAdventure({ title: "Errand at Old Mill" });
    s.store.update("adventures", adv.id, { source: { entity: s.place.id, def: runPlace.id } });
    const linked = s.store.get("adventures", adv.id)!;
    expect(adventureOfSource(s.store.list("adventures"), s.place.id)?.id).toBe(adv.id);
    expect(adventureOfSource(s.store.toJSON().adventures, s.miller.id)).toBeUndefined();
    expect(sourceDefOf(module, linked)).toBe(runPlace);
    const entities = () => s.store.toJSON().entities;
    expect(adventureClosed({ entities: entities() }, module, linked)).toBe(false);
    // the record closes: the adventure is skipped from then on
    s.store.update("entities", s.place.id, { fields: { climate: "calm" } });
    expect(adventureClosed({ entities: entities() }, module, linked)).toBe(true);
    // a plain adventure only closes when marked done
    const plain = s.store.createAdventure({ title: "Plain" });
    expect(adventureClosed({ entities: entities() }, module, plain)).toBe(false);
    expect(adventureClosed({ entities: entities() }, module, { ...plain, status: "done" })).toBe(true);
  });
});

describe("template guidance never reaches the players", () => {
  it("drops a bracketed aside from scene titles the players read", () => {
    expect(playerSceneTitle("Arrival at the destination (link…")).toBe("Arrival at the destination");
    expect(playerSceneTitle("Briefing (link the alien.job entity)")).toBe("Briefing");
    expect(playerSceneTitle("Docking (night)")).toBe("Docking (night)");
  });

  it("recognises guidance an older version wrote into an adventure, and keeps it out of a share; handout guidance stays out of the projection", () => {
    const s = seeded();
    expect(isTemplateGuidance("What the patron tells the heroes. Leave out the trap.", module, quest.id)).toBe(true);
    expect(isTemplateGuidance("*What the patron tells the heroes. Leave out the trap.*", module, quest.id)).toBe(true);
    expect(isTemplateGuidance("The mill burns.", module, quest.id)).toBe(false);
    expect(isTemplateGuidance("What the patron tells the heroes. Leave out the trap.", module, undefined)).toBe(false);

    const docs = new Map<Id, Y.Doc>();
    const adv = s.store.createAdventure({ title: "Errand", templateId: quest.id, withDocs: true });
    docs.set(adv.playerIntroDoc!, docFromMarkdown("_What the patron tells the heroes. Leave out the trap._"));
    const act = s.store.createAct(adv.id, { number: 1 });
    const scene = s.store.createScene(act.id, { title: "Arrival at the place (link…", purpose: "Arrival: the heroes reach the place (link the place)." });
    const session = s.store.createSession({ number: 1, date: "2026-01-01" });
    const h = s.store.createHandout({ title: "Note", visibility: { level: "players" }, withBody: true });
    s.store.update("handouts", h.id, { guide: { body: "GUIDE-ONLY: write the note here." } });
    const snap = playerShareSnapshot({ maps: s.store.toJSON(), module, sessionId: session.id, sceneId: scene.id, doc: (id) => docs.get(id), at: "t" });
    const json = JSON.stringify(snap);
    expect(snap.briefing?.scene).toBe("Arrival at the place");
    expect(snap.briefing?.intro).toBeUndefined();
    for (const bad of ["Leave out the trap", "(link", "GUIDE-ONLY"]) expect(json).not.toContain(bad);
    const projected = projectCampaignForViewer(s.store.toJSON(), module, { role: "player" });
    expect(projected.handouts[h.id]).toBeDefined();
    expect(JSON.stringify(projected)).not.toContain("GUIDE-ONLY");
  });
});
