import { describe, expect, it } from "vitest";
import type { GeneratedGraph } from "@campaign-forge/module-sdk";
import { acceptGeneratedGraph, childrenOf, presetToEntity, recordEdit } from "../src";
import { fixtureModule, newStore } from "./fixtures";

const graph: GeneratedGraph = {
  procedure: "example.colony",
  moduleVersion: "0.1.0",
  seed: "seed-1",
  inputs: { size: "small" },
  results: { name: "Hope's End" },
  rolls: [{ step: "name", dice: "d6", raw: [4], modifier: 0, total: 4, result: "Hope's End" }],
  produced: {
    entities: [
      { tempId: "colony", type: "example.place", name: "Hope's End", fields: { climate: "cold", subtype: "colony" }, tags: ["colony"] },
      { tempId: "mayor", type: "example.person", subtype: "official", name: "Mayor Dunn", fields: { role: "mayor" }, within: "colony" },
      { tempId: "guard", type: "example.person", name: "Guard", fields: {}, within: "colony" },
    ],
    relationships: [
      { type: "example.rival_of", from: "mayor", to: "guard", note: "old feud" },
      { type: "knows", from: "mayor", to: "nope" },
    ],
  },
  skipped: [{ step: "optional", reason: "not included" }],
};

describe("acceptGeneratedGraph", () => {
  it("maps tempIds, records the run, applies within and opts.within", () => {
    const store = newStore();
    const planet = store.createEntity({ type: "example.place", name: "Planet" });
    const { run, entities, relationships, idMap } = acceptGeneratedGraph(store, graph, {
      moduleId: "example",
      within: planet.id,
      tags: ["generated"],
      stepSeeds: { name: "s2" },
      pinned: { size: "small" },
      visibility: { level: "players" },
    });
    expect(entities).toHaveLength(3);
    expect(Object.keys(idMap).sort()).toEqual(["colony", "guard", "mayor"]);
    expect(entities.every((e) => e.id === idMap[graph.produced.entities[entities.indexOf(e)]!.tempId])).toBe(true);
    expect(entities.every((e) => e.provenance?.generatorRun === run.id)).toBe(true);
    expect(entities.every((e) => e.visibility.level === "players")).toBe(true);
    expect(entities[0]?.tags).toEqual(["colony", "generated"]);
    expect(entities.map((e) => e.subtype)).toEqual(["colony", "official", undefined]);

    const stored = store.get("generatorRuns", run.id)!;
    expect(stored.produced).toEqual(entities.map((e) => e.id));
    expect(stored).toMatchObject({ procedure: "example.colony", moduleId: "example", moduleVersion: "0.1.0", seed: "seed-1", stepSeeds: { name: "s2" }, pinned: { size: "small" } });
    expect(stored.rolls).toEqual(graph.rolls);

    const colony = idMap["colony"]!;
    expect(childrenOf(store, planet.id).map((e) => e.id)).toEqual([colony]);
    expect(childrenOf(store, colony).map((e) => e.name).sort()).toEqual(["Guard", "Mayor Dunn"]);
    const rival = relationships.find((r) => r.type === "example.rival_of")!;
    expect([rival.from, rival.to, rival.note]).toEqual([idMap["mayor"], idMap["guard"], "old feud"]);
    expect(store.list("relationships").some((r) => r.type === "knows")).toBe(false);
    expect(store.count("relationships")).toBe(4);
  });

  it("records edits and creates entities from presets", () => {
    const store = newStore();
    const { run, entities } = acceptGeneratedGraph(store, graph, { moduleId: "example" });
    const mayor = entities[1]!;
    recordEdit(store, run.id, mayor.id, "fields.role");
    recordEdit(store, run.id, mayor.id, "fields.role");
    expect(store.get("generatorRuns", run.id)?.editedFields).toEqual([{ entity: mayor.id, path: "fields.role" }]);
    expect(store.get("entities", mayor.id)?.provenance).toEqual({ generatorRun: run.id, editedFields: ["fields.role"] });

    const preset = fixtureModule.presets[0]!;
    const guard = presetToEntity(store, preset, { name: "Gate guard", fields: { stats: { grit: 5 } } });
    expect(guard).toMatchObject({ type: "example.person", name: "Gate guard", summary: "A bored guard", tags: ["npc"], provenance: { preset: preset.id } });
    expect(guard.fields).toEqual({ role: "guard", stats: { grit: 5 } });
    expect(preset.fields["stats"]).toEqual({ grit: 3, wit: 2 });
  });
});
