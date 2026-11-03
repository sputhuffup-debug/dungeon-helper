import "fake-indexeddb/auto";
import { cluesOf, markClueFound, type Id } from "@campaign-forge/core";
import type { RollResult } from "@campaign-forge/module-sdk";
import { afterEach, describe, expect, it } from "vitest";
import { openCampaign, type CampaignContextValue } from "./CampaignProvider";
import { finishSession, loadDemoCampaign, logTable, markScene, playerCharacters, recordPoolRoll, revealHandout, rollOperation, startPlannedSession, wrapUpOf } from "./tableActions";
import { draftSessionSummary, mergeTimeline, saveWrapUpDraft, sessionFacts, summaryFromFacts, wrapUpDraftOf } from "./wrapUpActions";

const opened: Array<() => void> = [];
afterEach(() => {
  while (opened.length) opened.pop()?.();
});

async function session2(): Promise<{ ctx: CampaignContextValue; sessionId: Id }> {
  const id = await loadDemoCampaign();
  const ctx = await openCampaign(id);
  opened.push(ctx.close);
  const sessionId = ctx.store.list("sessions").find((s) => s.number === 2)!.id;
  startPlannedSession(ctx, sessionId);
  return { ctx, sessionId };
}

const pushedRoll = (successes: number): RollResult => ({ pool: { base: 4, stress: 1 } as unknown as RollResult["pool"], dice: [], successes, symbols: {}, pushes: 1, canPush: false });

describe("the wrap-up draft", () => {
  it("saves what the GM typed on the session, merges patches, survives reopening, and finishing commits it and drops it", async () => {
    const { ctx, sessionId } = await session2();
    const pc = playerCharacters(ctx)[0]!;
    saveWrapUpDraft(ctx, sessionId, { summary: "The crew reached the mine.", step: "timeline" });
    saveWrapUpDraft(ctx, sessionId, { looseEnds: "Who sent the signal?", rewards: [{ key: 1, characterId: pc.id, kind: "cash", value: "500", note: "a tip" }], timeline: [{ key: "manual:1", text: "The mine went dark.", entities: [], include: true }] });
    const reopened = await openCampaign(ctx.campaignId);
    opened.push(reopened.close);
    const draft = wrapUpDraftOf(reopened.store.get("sessions", sessionId));
    expect(draft).toMatchObject({ summary: "The crew reached the mine.", step: "timeline", looseEnds: "Who sent the signal?", rewards: [{ characterId: pc.id, kind: "cash", value: "500", note: "a tip" }], timeline: [{ key: "manual:1", text: "The mine went dark." }] });
    expect(typeof draft.at).toBe("string");
    // a field set to undefined is dropped
    saveWrapUpDraft(ctx, sessionId, { step: undefined });
    expect(wrapUpDraftOf(ctx.store.get("sessions", sessionId)).step).toBeUndefined();

    const res = finishSession(ctx, sessionId, { summary: draft.summary!, looseEnds: draft.looseEnds!.split("\n"), timeline: draft.timeline!, rewards: draft.rewards!.map((r) => ({ characterId: r.characterId, kind: r.kind, value: r.value, note: r.note })) });
    expect(res.session.summary).toBe("The crew reached the mine.");
    expect(wrapUpOf(res.session).draft).toBeUndefined();
    expect(wrapUpOf(res.session).looseEnds).toEqual(["Who sent the signal?"]);
    expect(res.timeline.map((t) => t.text)).toEqual(["The mine went dark."]);
    // a finished session takes no draft
    expect(saveWrapUpDraft(ctx, sessionId, { summary: "late" })).toBeUndefined();
    expect(wrapUpOf(ctx.store.get("sessions", sessionId)).draft).toBeUndefined();
  });

  it("keeps the GM's timeline entries and adds what happened since", () => {
    const saved = [{ key: "scene:a", text: "Edited.", entities: [], include: false }];
    const suggested = [
      { key: "scene:a", text: "Arrival.", entities: [], include: true },
      { key: "scene:b", text: "Transit.", entities: [], include: true },
    ];
    expect(mergeTimeline(saved, suggested)).toEqual([saved[0], suggested[1]]);
    expect(mergeTimeline(undefined, suggested)).toEqual(suggested);
  });
});

describe("the summary drafted from the log", () => {
  it("is empty for a session that recorded nothing, and keeps the GM's own log lines", async () => {
    const { ctx, sessionId } = await session2();
    expect(draftSessionSummary(ctx, sessionId, "")).toBe("");
    expect(draftSessionSummary(ctx, sessionId, "[19:02] The crew takes the job.\n\n[19:30] Mara lies.")).toBe("[19:02] The crew takes the job.\n[19:30] Mara lies.");
  });

  it("writes templated sentences from scenes, clues, reveals, panic, injuries, rolls of note and the hunt; the same log gives the same summary", async () => {
    const { ctx, sessionId } = await session2();
    const [ana, ben] = playerCharacters(ctx);
    const scene = ctx.store.list("scenes").find((s) => s.title)!;
    markScene(ctx, sessionId, scene.id, "run");
    const thread = ctx.store.list("arcs").find((t) => cluesOf(t).some((c) => c.clue.state === "seeded"))!;
    const clue = cluesOf(thread).find((c) => c.clue.state === "seeded")!.clue;
    markClueFound(ctx.store, thread.id, clue.id, { session: sessionId, via: "wrap-up" });
    const handout = ctx.store.createHandout({ title: "The station's manifest", kind: "text", visibility: { level: "gm" } });
    revealHandout(ctx, sessionId, handout.id);
    rollOperation(ctx, sessionId, "panicRoll", ana!.id);
    rollOperation(ctx, sessionId, "criticalInjury", ben!.id);
    recordPoolRoll(ctx, sessionId, { label: `${ana!.name}: Mobility`, seed: "s1", result: pushedRoll(1), entityId: ana!.id });
    recordPoolRoll(ctx, sessionId, { label: "GM secret roll", seed: "s2", result: pushedRoll(0), gmOnly: true });
    logTable(ctx, sessionId, "Sweep by Ana: no movement", { kind: "sweep", map: "M", sensor: "tracker", blips: [] });
    logTable(ctx, sessionId, "Sweep by Ana: blip A", { kind: "sweep", map: "M", sensor: "tracker", blips: ["A"] });
    logTable(ctx, sessionId, "Revealed: Xenomorph drone (blip A, letter retired)");
    logTable(ctx, sessionId, `${ben!.name}: damage +2 (Health 1/3)`, { entity: ben!.id, damage: 2 });

    const facts = sessionFacts(ctx, sessionId, "[20:10] The crew takes the job.");
    expect(facts.scenes).toHaveLength(1);
    expect(facts.clues).toEqual([clue.playerText.replace(/[.!?…]+$/, "")]);
    expect(facts.shown).toContain(handout.title.replace(/[.!?…]+$/, ""));
    expect(facts.panics.map((p) => p.who)).toEqual([ana!.name]);
    expect(facts.injuries.map((i) => i.who)).toEqual([ben!.name]);
    expect(facts.damage).toEqual([{ who: ben!.name, amount: 2 }]);
    expect(facts.rolls).toEqual([`${ana!.name}: Mobility (pushed): made it`]);
    expect(facts.sweeps).toEqual({ count: 2, withContacts: 1 });
    expect(facts.seen).toEqual(["Xenomorph drone"]);

    const text = summaryFromFacts(facts);
    expect(text).toContain("The crew played one scene: ");
    expect(text).toContain("They found a clue: ");
    expect(text).toContain("The players were shown ");
    expect(text).toContain(`${ana!.name} panicked: `);
    expect(text).toContain(`${ben!.name} was hurt (Critical injury, `);
    expect(text).toContain(`Damage taken: ${ben!.name} 2.`);
    expect(text).toContain("The crew swept for movement twice and picked something up once.");
    expect(text).toContain("Xenomorph drone came into view.");
    expect(text).toContain(`Rolls of note: ${ana!.name}: Mobility (pushed): made it.`);
    expect(text.split("\n").at(-1)).toBe("[20:10] The crew takes the job.");
    expect(text).not.toContain("GM secret roll");
    // deterministic
    expect(draftSessionSummary(ctx, sessionId, "[20:10] The crew takes the job.")).toBe(text);
  });
});
