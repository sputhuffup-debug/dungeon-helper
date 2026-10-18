import "fake-indexeddb/auto";
import { getCampaignTrackerState, getTrackerState, getWorldMinutes, type Entity } from "@campaign-forge/core";
import { forceAdvance, lifecycleConfig, lifecycleState, type TrackerDef } from "@campaign-forge/module-sdk";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { createCampaign, createEntity } from "../../state/actions";
import { openCampaign, type CampaignContextValue } from "../../state/CampaignProvider";
import {
  DICE_LOG,
  activeLifecycles,
  answerPrompt,
  applySessionEffects,
  clockAdvanceMinutes,
  lifecycleStartOptions,
  planNextSession,
  setClockState,
  setTrackerStateOf,
  startLifecycleFor,
  startPlannedSession,
  trackerStateOf,
} from "../../state/tableActions";
import { clockUnits } from "@campaign-forge/ui";

const opened: Array<() => void> = [];
afterEach(() => {
  while (opened.length) opened.pop()?.();
});

let campaignId: string;
beforeAll(async () => {
  campaignId = await createCampaign({ name: "Gestation fixture", moduleId: "alien", mode: "campaign" });
}, 30_000);

async function open(): Promise<CampaignContextValue> {
  const ctx = await openCampaign(campaignId);
  opened.push(ctx.close);
  return ctx;
}

function pc(ctx: CampaignContextValue, name: string): Entity {
  return createEntity(ctx, { type: "alien.character", name, fields: { isPC: true, attributes: { strength: 3, agility: 3, wits: 4, empathy: 2 }, stress: 1 } });
}

const GESTATION = "alien.gestation";
const SHIFT = 450;

function clock(ctx: CampaignContextValue): TrackerDef {
  return ctx.module.module.trackers.find((t) => t.kind === "clock")!;
}

/** Advance the session clock by one shift through the same path as the clock tracker's button. */
function advanceShift(ctx: CampaignContextValue, sessionId: string) {
  const def = clock(ctx);
  const prev = getTrackerState(ctx.store, sessionId).state[def.id] as { counters?: Record<string, number> } | undefined;
  const counters = { round: 0, stretch: 0, shift: (prev?.counters?.shift ?? 0) + 1 };
  return setClockState(ctx, sessionId, def, { counters });
}

const instances = (ctx: CampaignContextValue) => lifecycleState(getCampaignTrackerState(ctx.store, GESTATION)).instances;

describe("xenomorph life cycle at the table", () => {
  it("measures clock advances in minutes from the clock units, forward only", async () => {
    const ctx = await open();
    const units = clockUnits(clock(ctx).config);
    expect(clockAdvanceMinutes(units, undefined, { counters: { round: 0, stretch: 0, shift: 1 } })).toBe(450);
    expect(clockAdvanceMinutes(units, { counters: { round: 3 } }, { counters: { round: 0, stretch: 1 } })).toBe(7.5);
    expect(clockAdvanceMinutes(units, { counters: { round: 3 } }, { counters: { round: 4 } })).toBe(0.125);
    expect(clockAdvanceMinutes(units, { counters: { shift: 2 } }, { counters: { shift: 1 } })).toBe(0);
    expect(clockAdvanceMinutes(units, { counters: { shift: 2 } }, { counters: { round: 0, stretch: 0, shift: 0 } })).toBe(0);
  });

  it("offers a start on characters and on facehugger creatures", async () => {
    const ctx = await open();
    const kane = pc(ctx, "Kane");
    expect(lifecycleStartOptions(ctx, kane).map((o) => [o.def.id, o.role, o.variant])).toEqual([[GESTATION, "host", "standard"]]);
    expect(lifecycleStartOptions(ctx, { type: "alien.creature", provenance: { preset: "alien.creature.xx121-praeto-facehugger" } }).map((o) => [o.role, o.variant])).toEqual([["source", "praetomorph"]]);
    expect(lifecycleStartOptions(ctx, { type: "alien.creature", provenance: { preset: "alien.creature.xx121-soldier" } })).toEqual([]);
  });

  it("start infection, advance shifts: chestburster spawned from its preset, Stage IV after a shift, waits for the GM, molts to Soldier", async () => {
    const ctx = await open();
    const kane = pc(ctx, "Kane Lifecycle");
    const ripley = pc(ctx, "Ripley Lifecycle");
    const session = startPlannedSession(ctx, planNextSession(ctx, { title: "Derelict" }).id);
    const t0 = getWorldMinutes(ctx.store);

    const started = startLifecycleFor(ctx, session.id, GESTATION, { host: kane.id });
    expect(started.instance).toMatchObject({ variant: "standard", host: kane.id, hostName: "Kane Lifecycle", stage: "facehugged", started: t0 });
    expect(ctx.store.get("entities", kane.id)!.conditions?.map((c) => c.id)).toContain("xx121:facehugged");
    expect(activeLifecycles(ctx, kane.id).map((a) => a.instance.stage)).toEqual(["facehugged"]);

    // one shift: insemination checks roll each stretch (seeded, logged) until the facehugger symbol; the host wakes
    advanceShift(ctx, session.id);
    expect(getWorldMinutes(ctx.store)).toBe(t0 + SHIFT);
    const inst1 = instances(ctx).find((i) => i.id === started.instance.id)!;
    expect(inst1.stage).toBe("gestating");
    const checks = getTrackerState(ctx.store, session.id).log.filter((l) => l.tracker === DICE_LOG && l.text.includes("Insemination check"));
    expect(checks.length).toBeGreaterThan(0);
    expect((checks[0]!.data as { seed: string }).seed).toMatch(new RegExp(`^${session.id}:`));
    const kaneConds = () => ctx.store.get("entities", kane.id)!.conditions?.map((c) => c.id) ?? [];
    expect(kaneConds()).toContain("xx121:implanted");
    expect(kaneConds()).toContain("xx121:embryo");
    expect(kaneConds()).not.toContain("xx121:facehugged");

    // another shift: the chestburster bursts out of Kane
    const prompts = advanceShift(ctx, session.id);
    const inst2 = instances(ctx).find((i) => i.id === started.instance.id)!;
    expect(inst2.stage).toBe("chestburster");
    const xeno = ctx.store.get("entities", inst2.creature!)!;
    expect(xeno).toMatchObject({ type: "alien.creature", name: "Xenomorph from Kane Lifecycle" });
    expect(xeno.provenance?.preset).toBe("alien.creature.xx121-chestburster");
    const preset = ctx.module.preset("alien.creature.xx121-chestburster")!;
    expect(xeno.fields).toEqual(preset.fields);
    expect(ctx.store.list("relationships").find((r) => r.type === "emerged_from" && r.from === xeno.id)?.to).toBe(kane.id);
    expect(kaneConds()).toContain("xx121:killed-by-chestburster");
    // witnesses: every PC but the host gets a panic roll prompt
    const witness = prompts.find((p) => p.entity === ripley.id)!;
    expect(witness).toMatchObject({ kind: "roll", roll: { operation: "panicRoll" }, page: 216 });
    expect(prompts.some((p) => p.entity === kane.id)).toBe(false);
    const answered = answerPrompt(ctx, session.id, witness, { promptId: witness.id, kind: "roll", value: undefined, effects: [], roll: witness.roll! }, { record: false });
    expect(answered.roll?.operation.id).toBe("panicRoll");
    expect(answered.roll?.entity?.id).toBe(ripley.id);

    // a further shift: Stage IV (Drone by default), the same entity with the Drone's fields
    advanceShift(ctx, session.id);
    const inst3 = instances(ctx).find((i) => i.id === started.instance.id)!;
    expect(inst3.stage).toBe("drone");
    const drone = ctx.store.get("entities", xeno.id)!;
    expect(drone.name).toBe("Xenomorph from Kane Lifecycle");
    expect(drone.fields).toEqual(ctx.module.preset("alien.creature.xx121-drone")!.fields);
    expect(drone.provenance?.presetHistory?.map((h) => h.preset)).toEqual(["alien.creature.xx121-chestburster", "alien.creature.xx121-drone"]);

    // Stage IV waits for the GM: more shifts change nothing
    advanceShift(ctx, session.id);
    advanceShift(ctx, session.id);
    expect(instances(ctx).find((i) => i.id === started.instance.id)!.stage).toBe("drone");

    // the GM molts it to a Soldier (the tracker's "Advance to Soldier" button: effects, then state)
    const def = ctx.module.tracker(GESTATION)!;
    const r = forceAdvance(lifecycleConfig(def.config), lifecycleState(trackerStateOf(ctx, session.id, def)), started.instance.id, "soldier", { at: getWorldMinutes(ctx.store) });
    applySessionEffects(ctx, session.id, r.effects);
    setTrackerStateOf(ctx, session.id, def, { instances: r.state.instances });
    const soldier = ctx.store.get("entities", xeno.id)!;
    expect(soldier.fields).toEqual(ctx.module.preset("alien.creature.xx121-soldier")!.fields);
    expect(soldier.fields.stage).toBe("V");
    expect(soldier.summary).toBe(ctx.module.preset("alien.creature.xx121-soldier")!.summary);
    expect(ctx.store.list("relationships").some((x) => x.type === "emerged_from" && x.from === xeno.id && x.to === kane.id)).toBe(true);
    expect(instances(ctx).find((i) => i.id === started.instance.id)!.stage).toBe("soldier");
  });

  it("paused infections do not move; state persists on the campaign across sessions", async () => {
    const ctx = await open();
    const dallas = pc(ctx, "Dallas Lifecycle");
    const s1 = startPlannedSession(ctx, planNextSession(ctx).id);
    const { instance } = startLifecycleFor(ctx, s1.id, GESTATION, { host: dallas.id, variant: "queen" });
    const def = ctx.module.tracker(GESTATION)!;
    const paused = lifecycleState(trackerStateOf(ctx, s1.id, def)).instances.map((i) => (i.id === instance.id ? { ...i, paused: true } : i));
    setTrackerStateOf(ctx, s1.id, def, { instances: paused });
    advanceShift(ctx, s1.id);
    expect(instances(ctx).find((i) => i.id === instance.id)).toMatchObject({ stage: "facehugged", progress: 0 });

    const s2 = startPlannedSession(ctx, planNextSession(ctx).id);
    expect(instances(ctx).find((i) => i.id === instance.id)?.paused).toBe(true);
    const resumed = lifecycleState(trackerStateOf(ctx, s2.id, def)).instances.map((i) => (i.id === instance.id ? { ...i, paused: false } : i));
    setTrackerStateOf(ctx, s2.id, def, { instances: resumed });
    advanceShift(ctx, s2.id);
    // the Queen Burster's embryo takes days (module default 3), so a shift later it is still growing
    expect(instances(ctx).find((i) => i.id === instance.id)?.stage).toBe("gestating");
    advanceShift(ctx, s2.id);
    expect(instances(ctx).find((i) => i.id === instance.id)?.stage).toBe("gestating");
  });
});
