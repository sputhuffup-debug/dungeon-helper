/**
 * The Alien module's setup guide against real campaign data: the demos (set
 * up already) and a blank campaign filled in step by step, plus the campaign
 * frame a new campaign starts with.
 */
import { describe, expect, it } from "vitest";
import { addPlayer, campaignSetup, CampaignStore, createThread, setCharacterOwner, type CampaignSetup } from "@campaign-forge/core";
import { alienModule, FRAME_SETTING, HOME_BASE_SETTING, RUN_JOB_ID } from "@campaign-forge/module-alien";
import { campaignSettingOptions, campaignSettingsFor, initialCampaignSettings } from "@campaign-forge/module-sdk";
import { buildCinematicDemo, buildDemoCampaign } from "../src";

const ticks = (s: CampaignSetup) => Object.fromEntries(s.steps.map((x) => [x.id, x.done]));

describe("Alien setup guide on the demos", () => {
  it("counts Skyfire Down (campaign play) as set up", () => {
    const { maps } = buildDemoCampaign();
    const setup = campaignSetup(maps, alienModule);
    expect(setup.steps.map((s) => s.id)).toEqual([
      "alien.setup.crew",
      "setup.players",
      "alien.setup.ship",
      "alien.setup.home-base",
      "alien.setup.agendas",
      "alien.setup.threads",
      "alien.setup.job",
      "alien.setup.run-job",
    ]);
    expect(setup.steps.filter((s) => !s.done)).toEqual([]);
    expect(setup.complete).toBe(true);
  });

  it("reads Cold Harbor Relay (cinematic) with the shorter list: everything but the players, which the demo has none of", () => {
    const { maps } = buildCinematicDemo();
    const setup = campaignSetup(maps, alienModule);
    expect(ticks(setup)).toEqual({ "setup.pcs": true, "setup.players": false, "alien.setup.adventure": true, "alien.setup.act-agendas": true, "setup.session": true });
  });
});

describe("Alien setup guide on a blank campaign", () => {
  it("ticks each step from the campaign's data", () => {
    const store = CampaignStore.create({ name: "Blank", moduleId: "alien", moduleVersion: alienModule.manifest.version, mode: "campaign", calendarId: alienModule.calendar.id });
    const setup = () => campaignSetup(store.toJSON(), alienModule);
    const step = (id: string) => setup().steps.find((s) => s.id === id)!;
    expect(setup()).toMatchObject({ done: 0, total: 8 });

    // the crew: four PCs before any player is added, then one per player
    const pcs = ["Ripley", "Hicks"].map((name) => store.createEntity({ type: "alien.character", name, fields: { isPC: true } }));
    expect(step("alien.setup.crew")).toMatchObject({ done: false, count: { value: 2, of: 4 } });
    expect(step("alien.setup.crew").links.map((l) => l.label)).toEqual(["Roll a Life Path", "+ Character"]);
    const players = ["Sam", "Priya"].map((name) => addPlayer(store, { name }));
    pcs.forEach((pc, i) => setCharacterOwner(store, pc.id, players[i]!.id));
    expect(step("alien.setup.crew")).toMatchObject({ done: true, count: { value: 2, of: 2 } });
    expect(step("setup.players").done).toBe(true);

    // the ship: a spaceship chosen in settings (a deleted one does not count)
    const ship = store.createEntity({ type: "alien.spaceship", name: "Montero" });
    store.updateMeta({ settings: { ...store.meta().settings, ship: ship.id } });
    expect(step("alien.setup.ship").done).toBe(true);
    store.remove("entities", ship.id);
    expect(step("alien.setup.ship").done).toBe(false);
    const second = store.createEntity({ type: "alien.spaceship", name: "Sulaco" });
    store.updateMeta({ settings: { ...store.meta().settings, ship: second.id } });

    const base = store.createEntity({ type: "alien.location", name: "Anchorpoint Station" });
    store.updateMeta({ settings: { ...store.meta().settings, [HOME_BASE_SETTING]: base.id } });
    expect(step("alien.setup.home-base").done).toBe(true);

    // agendas: every PC has a campaign agenda
    store.update("entities", pcs[0]!.id, { fields: { ...pcs[0]!.fields, campaignAgenda: { goal: "Get home" } } });
    expect(step("alien.setup.agendas").done).toBe(false);
    store.update("entities", pcs[1]!.id, { fields: { ...pcs[1]!.fields, campaignAgenda: { goal: "Pay the debt" } } });
    expect(step("alien.setup.agendas").done).toBe(true);

    expect(step("alien.setup.threads").done).toBe(false);
    createThread(store, { title: "Salt", goal: "", method: "", weakness: "", cost: "", stages: [{ title: "Hints", clues: [] }], clock: { segments: 6, milestones: [] } } as never);
    expect(step("alien.setup.threads").done).toBe(true);

    // a posting on the board is not a job taken; an accepted one is, and "Open the job" opens it
    const posting = store.createEntity({ type: "alien.job", name: "Ore run", fields: { status: "offered" } });
    expect(step("alien.setup.job").done).toBe(false);
    expect(step("alien.setup.run-job").links.map((l) => l.label)).toEqual(["Plan a session"]);
    store.update("entities", posting.id, { fields: { ...posting.fields, status: "accepted" } });
    expect(step("alien.setup.job").done).toBe(true);
    expect(step("alien.setup.run-job").links[0]).toMatchObject({ label: "Open the job", entityId: posting.id });

    // run the job: an adventure from it and the session it plans
    const adventure = store.createAdventure({ title: "Ore run" });
    store.update("adventures", adventure.id, { source: { entity: posting.id, def: RUN_JOB_ID } });
    expect(step("alien.setup.run-job").done).toBe(false);
    store.createSession({ status: "planned" });
    expect(setup()).toMatchObject({ done: 8, total: 8, complete: true });
  });
});

describe("Alien campaign frame", () => {
  it("is asked at creation in campaign play only, from the module's frames, with Space Truckers by default", () => {
    expect(campaignSettingsFor(alienModule, "campaign", { atCreation: true }).map((d) => d.key)).toEqual([FRAME_SETTING]);
    expect(campaignSettingsFor(alienModule, "cinematic", { atCreation: true })).toEqual([]);
    const frame = alienModule.campaignSettings!.find((d) => d.key === FRAME_SETTING)!;
    expect(campaignSettingOptions(frame, alienModule, "campaign").map((o) => o.value)).toEqual(["space-truckers", "colonial-marines", "frontier-colonists"]);
    expect(initialCampaignSettings(alienModule, "campaign")).toEqual({ frame: "space-truckers" });
    expect(initialCampaignSettings(alienModule, "campaign", { frame: "colonial-marines" })).toEqual({ frame: "colonial-marines" });
    expect(initialCampaignSettings(alienModule, "cinematic", { frame: "colonial-marines" })).toEqual({});
  });

  it("names the same values the procedures' frame inputs take", () => {
    const frame = alienModule.campaignSettings!.find((d) => d.key === FRAME_SETTING)!;
    const values = campaignSettingOptions(frame, alienModule, "campaign").map((o) => o.value);
    for (const id of ["alien.job.create", "alien.job-board", "alien.between-jobs"]) {
      const input = (alienModule.procedures.find((p) => p.id === id)?.inputs as { properties?: Record<string, { enum?: unknown[] }> } | undefined)?.properties?.frame;
      expect(input?.enum, id).toEqual(values);
    }
  });
});
