import { describe, expect, it } from "vitest";
import {
  CampaignStore,
  advanceWorldMinutes,
  applyEffects,
  exportJSON,
  getCampaignTrackerState,
  getTrackerState,
  getWorldMinutes,
  updateCampaignTrackerState,
  type CampaignMaps,
} from "../src";
import { fixtureModule, newStore } from "./fixtures";

const preset = (id: string) => fixtureModule.presets.find((p) => p.id === id);

describe("preset effects", () => {
  it("creates an entity from a preset with a chosen id, a link and a tempId later effects can use", () => {
    const store = newStore();
    const host = store.createEntity({ type: "example.person", name: "Kane" });
    const session = store.createSession();
    const r = applyEffects(
      store,
      [
        { kind: "createFromPreset", preset: "example.preset.guard", name: "Kane's guard", id: "spawn-1", tempId: "g", tags: ["spawned"], link: { type: "example.rival_of", to: host.id, note: "born of" } },
        { kind: "setField", entity: "g", path: "stats.wit", value: 5 },
        { kind: "createFromPreset", preset: "example.preset.guard", tempId: "g2", link: { type: "knows", to: "g" } },
      ],
      { sessionId: session.id, preset },
    );
    expect(r.skipped).toEqual([]);
    expect(r.created.g).toBe("spawn-1");
    const spawned = store.get("entities", "spawn-1")!;
    expect(spawned.name).toBe("Kane's guard");
    expect(spawned.fields).toEqual({ role: "guard", stats: { grit: 3, wit: 5 } });
    expect(spawned.tags).toEqual(["npc", "spawned"]);
    expect(spawned.provenance?.preset).toBe("example.preset.guard");
    expect(spawned.provenance?.presetHistory?.map((h) => h.preset)).toEqual(["example.preset.guard"]);
    const rels = store.list("relationships");
    expect(rels.find((x) => x.type === "example.rival_of")).toMatchObject({ from: "spawn-1", to: host.id, note: "born of" });
    expect(rels.find((x) => x.type === "knows")).toMatchObject({ from: r.created.g2, to: "spawn-1" });
    expect(getTrackerState(store, session.id).log.some((l) => l.text.includes("created from preset example.preset.guard"))).toBe(true);
  });

  it("applies a preset in place, keeping id, name, relationships, conditions and kept paths", () => {
    const store = newStore();
    const other = store.createEntity({ type: "example.person", name: "Other" });
    applyEffects(store, [{ kind: "createFromPreset", preset: "example.preset.guard", id: "g1", name: "Gate guard" }], { preset });
    store.update("entities", "g1", { fields: { ...store.get("entities", "g1")!.fields, plan: "desert" }, conditions: [{ id: "tired", label: "Tired" }] });
    store.createRelationship("knows", "g1", other.id);
    const r = applyEffects(store, [{ kind: "applyPreset", entity: "g1", preset: "example.preset.captain", keep: ["plan"] }], { preset });
    expect(r.skipped).toEqual([]);
    const e = store.get("entities", "g1")!;
    expect(e.name).toBe("Gate guard");
    expect(e.summary).toBe("A promoted guard");
    expect(e.fields).toEqual({ role: "captain", stats: { grit: 4, wit: 3 }, plan: "desert" });
    expect(e.tags).toEqual(["npc", "officer"]);
    expect(e.conditions?.map((c) => c.id)).toEqual(["tired"]);
    expect(e.provenance?.preset).toBe("example.preset.captain");
    expect(e.provenance?.presetHistory?.map((h) => h.preset)).toEqual(["example.preset.guard", "example.preset.captain"]);
    expect(store.list("relationships").some((x) => x.from === "g1" && x.to === other.id)).toBe(true);
  });

  it("skips unknown presets, missing resolvers, taken ids and type mismatches", () => {
    const store = newStore();
    const place = store.createEntity({ type: "example.place", name: "Bar" });
    const r1 = applyEffects(store, [{ kind: "createFromPreset", preset: "example.preset.guard" }]);
    expect(r1.skipped[0]?.reason).toBe("no preset resolver");
    const r2 = applyEffects(
      store,
      [
        { kind: "createFromPreset", preset: "nope" },
        { kind: "createFromPreset", preset: "example.preset.guard", id: place.id },
        { kind: "applyPreset", entity: place.id, preset: "example.preset.guard" },
        { kind: "applyPreset", entity: "missing", preset: "example.preset.guard" },
      ],
      { preset },
    );
    expect(r2.skipped.map((s) => s.reason)).toEqual([
      "preset nope not found",
      `entities/${place.id} already exists`,
      "preset example.preset.guard is for example.person, not example.place",
      "entities/missing not found",
    ]);
    expect(store.count("entities")).toBe(1);
  });
});

describe("campaign-scoped tracker state and world time", () => {
  it("merges state on the campaign, survives sessions and export/import", () => {
    const store = newStore();
    expect(getCampaignTrackerState(store, "cycle")).toBeUndefined();
    updateCampaignTrackerState(store, "cycle", { instances: [{ id: "a" }] });
    updateCampaignTrackerState(store, "cycle", { note: "x" });
    expect(getCampaignTrackerState(store, "cycle")).toEqual({ instances: [{ id: "a" }], note: "x" });
    expect(store.meta().settings["tracker:cycle"]).toEqual({ instances: [{ id: "a" }], note: "x" });

    expect(getWorldMinutes(store)).toBe(0);
    expect(advanceWorldMinutes(store, 450)).toBe(450);
    expect(advanceWorldMinutes(store, -100)).toBe(450);
    expect(advanceWorldMinutes(store, 7.5)).toBe(457.5);

    const copy = CampaignStore.fromJSON(JSON.parse(exportJSON(store)) as CampaignMaps);
    expect(getCampaignTrackerState(copy, "cycle")).toEqual({ instances: [{ id: "a" }], note: "x" });
    expect(getWorldMinutes(copy)).toBe(457.5);

    updateCampaignTrackerState(store, "cycle", undefined);
    expect(getCampaignTrackerState(store, "cycle")).toBeUndefined();
  });
});
