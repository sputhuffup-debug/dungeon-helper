/**
 * The setup guide on the campaign store: the snapshot its rules read, the
 * core's generic steps ticking from data, a module's own steps and layout
 * (the example data pack, read as JSON: the core never imports a real game
 * module), and whether Home shows the guide.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { CORE_SETUP_STEP_IDS, loadPack, setupIssues, type GameModule } from "@campaign-forge/module-sdk";
import { addPlayer, campaignSetup, campaignSetupSteps, createThread, DEFAULT_SETUP_STEPS, setCharacterOwner, setupGuideSettings, setupSnapshot, showsSetupGuide, withSetupGuide } from "../src";
import { fixtureModule, newStore } from "./fixtures";

const dir = new URL("../../module-example/packs/example-pack/", import.meta.url);
const read = (name: string) => JSON.parse(readFileSync(new URL(name, dir), "utf8")) as unknown;
const pack: GameModule = loadPack(read("pack.json"), { parts: [{ name: "rules.part.json", data: read("rules.part.json") }], skipProcedureRuns: true }).module!;

const pc = (store: ReturnType<typeof newStore>, name: string) => store.createEntity({ type: "example.person", name, fields: { isPC: true } });

describe("core setup steps", () => {
  it("are the ids the sdk names, valid, and not done on an empty campaign", () => {
    expect(DEFAULT_SETUP_STEPS.map((s) => s.id)).toEqual([...CORE_SETUP_STEP_IDS]);
    // checked like a module's steps (the "setup." prefix is the core's own, so only that error is expected)
    const found = setupIssues({ ...fixtureModule, setup: { steps: [...DEFAULT_SETUP_STEPS] } }).filter((i) => !i.message.includes("core's prefix"));
    expect(found).toEqual([]);
    const store = newStore();
    const setup = campaignSetup(store.toJSON(), fixtureModule);
    expect(setup).toMatchObject({ done: 0, total: 3, complete: false });
  });

  it("tick themselves as the campaign fills in: PCs, then players who play them, then a session", () => {
    const store = newStore();
    const done = () =>
      campaignSetup(store.toJSON(), fixtureModule)
        .steps.filter((s) => s.done)
        .map((s) => s.id);
    const ann = pc(store, "Ann");
    store.createEntity({ type: "example.person", name: "A guard" });
    expect(done()).toEqual(["setup.pcs"]);
    const player = addPlayer(store, { name: "Sam" });
    expect(done()).toEqual(["setup.pcs"]);
    setCharacterOwner(store, ann.id, player.id);
    expect(done()).toEqual(["setup.pcs", "setup.players"]);
    const bob = pc(store, "Bob");
    expect(done()).toEqual(["setup.pcs"]);
    setCharacterOwner(store, bob.id, player.id);
    store.createSession({ title: "One", status: "planned" });
    const setup = campaignSetup(store.toJSON(), fixtureModule);
    expect(setup).toMatchObject({ done: 3, total: 3, complete: true });
    expect(setup.steps.find((s) => s.id === "setup.pcs")?.count).toEqual({ value: 2, of: 2, label: "PCs, one per player" });
  });
});

describe("setupSnapshot", () => {
  it("reads PCs, owners, players, sessions, adventures and threads as plain sorted data", () => {
    const store = newStore();
    const zed = pc(store, "Zed");
    pc(store, "Amy");
    const place = store.createEntity({ type: "example.place", name: "Harbour", tags: ["b", "a"] });
    const sam = addPlayer(store, { name: "Sam" });
    setCharacterOwner(store, zed.id, sam.id);
    store.createSession({ number: 2, status: "done" });
    store.createSession({ number: 3, status: "planned" });
    store.createAdventure({ title: "The job" });
    createThread(store, { title: "Salt", goal: "", method: "", weakness: "", cost: "", stages: [{ title: "Hints", clues: [] }], clock: { segments: 6, milestones: [] } } as never);
    const snap = setupSnapshot(store.toJSON(), fixtureModule);
    expect(snap.pcs.map((p) => p.name)).toEqual(["Amy", "Zed"]);
    expect(snap.pcs.find((p) => p.name === "Zed")?.owner).toBe(sam.id);
    expect(snap.entities.find((e) => e.id === place.id)).toMatchObject({ kind: "location", pc: false, tags: ["a", "b"] });
    expect(snap.players).toEqual([{ id: sam.id, name: "Sam", characters: 1 }]);
    expect(snap.sessions.map((s) => [s.number, s.status])).toEqual([
      [2, "done"],
      [3, "planned"],
    ]);
    expect(snap.counts).toMatchObject({ entities: 3, pcs: 2, unownedPcs: 1, players: 1, sessions: 2, plannedSessions: 1, playedSessions: 1, adventures: 1, arcs: 1 });
    expect(snap.entityIds).toEqual([...snap.entityIds].sort());
    // the same campaign reads the same
    expect(setupSnapshot(store.toJSON(), fixtureModule)).toEqual(snap);
  });
});

describe("a module's steps (the example pack)", () => {
  it("adds its steps and follows its layout per mode", () => {
    expect(campaignSetupSteps(pack, "delve").map((s) => s.id)).toEqual(["example-pack.setup.site", "setup.pcs", "setup.players"]);
    expect(campaignSetupSteps(pack, "saga").map((s) => s.id)).toEqual(["setup.pcs", "setup.players", "setup.session", "example-pack.setup.site"]);
  });

  it("ticks the module's step from its data", () => {
    const store = newStore();
    store.updateMeta({ mode: "delve" });
    const site = () => campaignSetup(store.toJSON(), pack).steps.find((s) => s.id === "example-pack.setup.site")!;
    expect(site().done).toBe(false);
    expect(site().links.map((l) => l.label)).toEqual(["+ Site", "Roll a delve"]);
    store.createEntity({ type: "example-pack.site", name: "Old mine" });
    expect(site().done).toBe(true);
  });
});

describe("showing the guide", () => {
  it("shows only when switched on and not complete", () => {
    const store = newStore();
    expect(setupGuideSettings(store.meta())).toEqual({ show: false });
    expect(showsSetupGuide(store.meta(), { complete: false })).toBe(false);
    store.updateMeta({ settings: withSetupGuide(store.meta(), true) });
    expect(setupGuideSettings(store.meta())).toEqual({ show: true });
    expect(showsSetupGuide(store.meta(), { complete: false })).toBe(true);
    expect(showsSetupGuide(store.meta(), { complete: true })).toBe(false);
    store.updateMeta({ settings: { ...withSetupGuide(store.meta(), false), other: 1 } });
    expect(store.meta().settings).toMatchObject({ setupGuide: { show: false }, other: 1 });
    expect(showsSetupGuide(store.meta(), { complete: false })).toBe(false);
  });
});
