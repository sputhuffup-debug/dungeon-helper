import "fake-indexeddb/auto";
import { getTrackerState, listCampaigns, plainText, updateTrackerState, type Entity } from "@campaign-forge/core";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { createCampaign, createEntity } from "../../state/actions";
import { openCampaign, type CampaignContextValue } from "../../state/CampaignProvider";
import { awardRowsFor, postSessionAwards, sessionAwardsOf } from "../../state/progressionActions";
import {
  DICE_LOG,
  answerPrompt,
  appendLogLine,
  finishSession,
  loadDemoCampaign,
  markScene,
  operationInput,
  planNextSession,
  playerCharacters,
  revealHandout,
  rollOperation,
  sessionEndPrompts,
  sessionLogText,
  sessionTrackerState,
  startPlannedSession,
  suggestTimeline,
  summaryDraft,
} from "../../state/tableActions";

const opened: Array<() => void> = [];
afterEach(() => {
  while (opened.length) opened.pop()?.();
});

let alienCampaign: string;
beforeAll(async () => {
  alienCampaign = await createCampaign({ name: "Table fixture", moduleId: "alien", mode: "campaign" });
}, 30_000);

async function open(id: string): Promise<CampaignContextValue> {
  const ctx = await openCampaign(id);
  opened.push(ctx.close);
  return ctx;
}

function pc(ctx: CampaignContextValue, name: string, fields: Record<string, unknown> = {}): Entity {
  return createEntity(ctx, {
    type: "alien.character",
    name,
    fields: { isPC: true, attributes: { strength: 3, agility: 3, wits: 4, empathy: 2 }, stress: 3, ...fields },
  });
}

function runningSession(ctx: CampaignContextValue) {
  const planned = planNextSession(ctx, { title: "Test run" });
  return startPlannedSession(ctx, planned.id);
}

describe("table actions", () => {
  it("rolls an android's critical injury on the system damage table, moving past damage it already has", async () => {
    const ctx = await open(alienCampaign);
    const bishop = pc(ctx, "Bishop", { android: true });
    const session = runningSession(ctx);
    const op = ctx.module.module.dice.operations!.criticalInjury!;

    const input = operationInput(ctx.module, op, bishop);
    expect(input).toMatchObject({ entity: bishop.id, android: true, conditions: [] });

    const first = rollOperation(ctx, session.id, "criticalInjury", bishop.id);
    const afterFirst = ctx.store.get("entities", bishop.id)!.conditions ?? [];
    expect(afterFirst).toHaveLength(1);
    expect(afterFirst[0]!.id).toMatch(/^android-critical:/);
    expect(afterFirst[0]!.page).toBe(78);
    expect(first.result.label).toBe(afterFirst[0]!.label);

    // The second roll sees the first result and can never repeat it.
    rollOperation(ctx, session.id, "criticalInjury", bishop.id);
    const ids = (ctx.store.get("entities", bishop.id)!.conditions ?? []).map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.every((id) => id.startsWith("android-critical:"))).toBe(true);
  });

  it("rolls a panic operation with a seeded rng, applies its effects and appends to the stress tracker's panicLog", async () => {
    const ctx = await open(alienCampaign);
    const ripley = pc(ctx, "Ripley");
    const session = runningSession(ctx);

    const roll = rollOperation(ctx, session.id, "panicRoll", ripley.id);
    expect(roll.input).toMatchObject({ entity: ripley.id, stress: 3, resolve: 3 });
    expect(roll.seed).toBe(`${session.id}:0`);
    expect(roll.result.label).toBeTruthy();
    expect(typeof roll.result.total).toBe("number");

    const state = getTrackerState(ctx.store, session.id);
    const panicLog = (state.state["alien.stress"] as { panicLog: Array<{ entity: string; total: number; label: string }> }).panicLog;
    expect(panicLog).toHaveLength(1);
    expect(panicLog[0]).toMatchObject({ entity: ripley.id, total: roll.result.total, label: roll.result.label });
    // the module's addCondition effect landed on the character
    expect(ctx.store.get("entities", ripley.id)?.conditions?.some((c) => c.id === `panic:${roll.result.total}`)).toBe(true);
    // logged on the dice channel with its seed; the next roll gets the next seed
    const diceLog = state.log.filter((l) => l.tracker === DICE_LOG);
    expect(diceLog).toHaveLength(1);
    expect((diceLog[0]?.data as { seed: string }).seed).toBe(roll.seed);
    expect(rollOperation(ctx, session.id, "stressResponse", ripley.id).seed).toBe(`${session.id}:1`);
  });

  it("builds supply-roll input from a gear item", async () => {
    const ctx = await open(alienCampaign);
    const dallas = pc(ctx, "Dallas", { gear: [{ name: "Knife", weight: 0.5, qty: 1 }, { name: "Air tank", weight: 1, qty: 1, supply: 4 }] });
    const op = ctx.module.module.dice.operations!["supplyRoll"]!;
    expect(operationInput(ctx.module, op, dallas, { itemIndex: 1, path: "gear", supply: 4 })).toEqual({ entity: dallas.id, rating: 4, path: "gear.1.supply", label: "Air tank" });
  });

  it("reveals a handout and logs the reveal with its scene on the session", async () => {
    const ctx = await open(alienCampaign);
    const session = runningSession(ctx);
    const adventure = ctx.store.createAdventure({ title: "A", status: "active" });
    const act = ctx.store.createAct(adventure.id);
    const scene = ctx.store.createScene(act.id, { title: "Docking bay" });
    const handout = ctx.store.createHandout({ title: "Distress call", attachedTo: { kind: "scene", id: scene.id } });

    revealHandout(ctx, session.id, handout.id, scene.id);
    expect(ctx.store.get("handouts", handout.id)?.visibility).toMatchObject({ level: "revealed", revealedIn: session.id });
    const reveals = ctx.store.get("sessions", session.id)?.reveals ?? [];
    expect(reveals).toHaveLength(1);
    expect(reveals[0]).toMatchObject({ handout: handout.id, scene: scene.id });
    expect(getTrackerState(ctx.store, session.id).log.some((l) => l.tracker === "reveal" && l.text.includes("Distress call"))).toBe(true);

    markScene(ctx, session.id, scene.id, "run");
    expect(ctx.store.get("sessions", session.id)?.scenesRun).toEqual([scene.id]);
    const drafts = suggestTimeline(ctx.store, session.id);
    expect(drafts.map((d) => d.key)).toEqual([`scene:${scene.id}`, `handout:${handout.id}`]);
  });

  it("builds the wrap-up award checklist from the Alien progression; posting adds XP once and ticks the XP checklist item", async () => {
    const ctx = await open(alienCampaign);
    const session = runningSession(ctx);
    const pcs = playerCharacters(ctx);
    const hicks = pcs.find((p) => p.name === "Ripley") ?? pc(ctx, "Ripley");
    // XP no longer comes from end-of-session prompts
    expect(sessionEndPrompts(ctx, session.id).some((p) => p.id.startsWith("alien.xp."))).toBe(false);
    const rows = awardRowsFor(ctx, hicks, session.id);
    expect(rows).toHaveLength(9);
    expect(rows.filter((r) => r.ticked).map((r) => r.question.id)).toEqual(["alien.award.participated"]);
    const before = Number(ctx.store.get("entities", hicks.id)?.fields.xp ?? 0);
    postSessionAwards(ctx, session.id, { [hicks.id]: ["alien.award.participated", "alien.award.danger"] });
    postSessionAwards(ctx, session.id, { [hicks.id]: ["alien.award.participated"] });
    expect(ctx.store.get("entities", hicks.id)?.fields.xp).toBe(before + 2);
    expect(sessionAwardsOf(ctx, session.id, hicks.id)).toHaveLength(1);
    expect(ctx.store.get("sessions", session.id)?.checklist?.["alien.wrap.xp"]).toBe(true);
  });

  it("asks for the trauma check after a panic result of 9+, and the failure option chains into a mental trauma roll", async () => {
    const ctx = await open(alienCampaign);
    const lambert = pc(ctx, "Lambert");
    const session = runningSession(ctx);
    updateTrackerState(ctx.store, session.id, "alien.stress", { panicLog: [{ at: new Date().toISOString(), entity: lambert.id, total: 11, label: "Scream" }] });
    const trauma = sessionEndPrompts(ctx, session.id).find((p) => p.id === `alien.trauma-check:${lambert.id}`);
    expect(trauma?.kind).toBe("roll");
    const failed = trauma!.options!.find((o) => o.id === "failed")!;
    const outcome = answerPrompt(ctx, session.id, trauma!, { promptId: trauma!.id, kind: "roll", value: "failed", optionId: "failed", effects: failed.effects ?? [] });
    expect(outcome.prompts).toHaveLength(1);
    const follow = outcome.prompts[0]!;
    expect(follow.roll?.operation).toBe("mentalTrauma");
    const rolled = answerPrompt(ctx, session.id, follow, { promptId: follow.id, kind: "roll", value: undefined, effects: [], roll: follow.roll, entity: follow.entity });
    expect(rolled.roll?.result.label).toBeTruthy();
    expect(ctx.store.get("entities", lambert.id)?.conditions?.some((c) => c.id.startsWith("mental-trauma:"))).toBe(true);
  });

  it("finishing archives tracker state, writes timeline entries on the in-world date and plans the next session with the loose ends", async () => {
    const ctx = await open(alienCampaign);
    const session = runningSession(ctx);
    await appendLogLine(ctx, session.id, "The crew boards the derelict.", new Date(2026, 9, 18, 21, 5));
    const text = await sessionLogText(ctx, session.id);
    expect(text).toContain("[21:05] The crew boards the derelict.");
    expect(summaryDraft(`\n${text}\n`)).toBe(text.trim());

    const ripley = playerCharacters(ctx)[0]!;
    const result = finishSession(ctx, session.id, {
      summary: "They boarded the derelict.",
      rewards: [{ characterId: ripley.id, kind: "cash", value: 500 }],
      timeline: [
        { text: "Boarded the derelict.", entities: [ripley.id], include: true },
        { text: "Skipped entry", entities: [], include: false },
      ],
      looseEnds: ["Who sent the signal?", " "],
    });
    const done = ctx.store.get("sessions", session.id)!;
    expect(done.status).toBe("done");
    expect(done.summary).toBe("They boarded the derelict.");
    expect(done.rewards).toHaveLength(1);
    expect(sessionTrackerState(ctx.store, session.id)?.archived).toBe(true);
    expect(ctx.store.list("trackerState").filter((t) => t.session === session.id && !t.archived)).toHaveLength(0);
    expect(result.timeline).toHaveLength(1);
    expect(result.timeline[0]).toMatchObject({ inWorldDate: ctx.store.meta().currentDate, session: session.id, entities: [ripley.id] });
    expect(result.next?.status).toBe("planned");
    expect(result.next?.nextPlan).toContain("Who sent the signal?");
    expect((done.wrapUp as { nextSession: string }).nextSession).toBe(result.next?.id);
    // planning by hand carries the last finished session's loose ends too
    expect(planNextSession(ctx).nextPlan).toEqual(["Who sent the signal?"]);
  });
});

describe("demo campaign loader", () => {
  it("creates the Skyfire Down campaign with its records and rich-text bodies", async () => {
    const id = await loadDemoCampaign("skyfire-down");
    expect((await listCampaigns()).some((c) => c.id === id && c.name === "Skyfire Down")).toBe(true);
    const ctx = await open(id);
    expect(ctx.store.meta().moduleId).toBe("alien");
    expect(playerCharacters(ctx)).toHaveLength(4);
    expect(ctx.store.list("scenes").length).toBeGreaterThan(0);
    const planned = ctx.store.list("sessions").find((s) => s.status === "planned");
    expect(planned?.nextPlan.length).toBeGreaterThan(0);
    const scene = ctx.store.list("scenes")[0]!;
    await ctx.whenDocSynced(scene.bodyDoc);
    expect(plainText(ctx.registry.open(scene.bodyDoc)).length).toBeGreaterThan(0);
  }, 60_000);

  it("creates the Hollowmere campaign with the ORC core rules module loaded through the registry", async () => {
    const id = await loadDemoCampaign(undefined, "pf2e");
    expect((await listCampaigns()).some((c) => c.id === id && c.name === "Hollowmere" && c.moduleId === "pf2e-orc")).toBe(true);
    const ctx = await open(id);
    expect(ctx.store.meta().mode).toBe("one-shot");
    expect(playerCharacters(ctx)).toHaveLength(4);
    expect(ctx.store.list("sessions").find((s) => s.status === "planned")?.nextPlan.length).toBeGreaterThan(0);
  }, 60_000);

  it("creates the Thornwick Crossing campaign with the SRD 5.1 module loaded through the registry", async () => {
    const id = await loadDemoCampaign(undefined, "dnd5e");
    expect((await listCampaigns()).some((c) => c.id === id && c.name === "Thornwick Crossing" && c.moduleId === "dnd5e-srd")).toBe(true);
    const ctx = await open(id);
    expect(ctx.store.meta().mode).toBe("one-shot");
    expect(playerCharacters(ctx)).toHaveLength(4);
    expect(ctx.store.list("sessions").find((s) => s.status === "planned")?.nextPlan.length).toBeGreaterThan(0);
  }, 60_000);
});
