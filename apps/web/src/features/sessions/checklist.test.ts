import "fake-indexeddb/auto";
import { checklistStateOf, setChecklistItem, withChecklistSettings, type Session } from "@campaign-forge/core";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { createCampaign, revealEntity, updateMeta } from "../../state/actions";
import { openCampaign, type CampaignContextValue } from "../../state/CampaignProvider";
import {
  answerPrompt,
  appendLogLine,
  campaignChecklist,
  finishSession,
  planNextSession,
  revealHandout,
  sessionEndPrompts,
  setPlannedScenes,
  startPlannedSession,
  tickLogNotes,
} from "../../state/tableActions";

const opened: Array<() => void> = [];
afterEach(() => {
  while (opened.length) opened.pop()?.();
});

let exampleCampaign: string;
let alienCinematic: string;
let alienCampaign: string;
beforeAll(async () => {
  exampleCampaign = await createCampaign({ name: "Checklist fixture", moduleId: "example", mode: "standard" });
  alienCinematic = await createCampaign({ name: "Alien cinematic", moduleId: "alien", mode: "cinematic" });
  alienCampaign = await createCampaign({ name: "Alien campaign", moduleId: "alien", mode: "campaign" });
}, 30_000);

async function open(id: string): Promise<CampaignContextValue> {
  const ctx = await openCampaign(id);
  opened.push(ctx.close);
  return ctx;
}

function sceneIn(ctx: CampaignContextValue, title: string) {
  const adv = ctx.store.createAdventure({ title: `${title} adventure` });
  const act = ctx.store.createAct(adv.id, { goal: "Go" });
  return ctx.store.createScene(act.id, { title });
}

const ticks = (ctx: CampaignContextValue, session: Pick<Session, "id">) => checklistStateOf(ctx.store.get("sessions", session.id));

describe("session checklist auto-ticks", () => {
  it("planning a scene ticks prep.scenes; an empty plan does not", async () => {
    const ctx = await open(exampleCampaign);
    const session = planNextSession(ctx, { title: "Prep" });
    setPlannedScenes(ctx, session.id, []);
    expect(ticks(ctx, session)["prep.scenes"]).toBeUndefined();
    const scene = sceneIn(ctx, "The gate");
    setPlannedScenes(ctx, session.id, [scene.id]);
    expect(ticks(ctx, session)["prep.scenes"]).toBe(true);
  });

  it("a reveal ticks play.reveals; a log line ticks play.notes", async () => {
    const ctx = await open(exampleCampaign);
    const session = startPlannedSession(ctx, planNextSession(ctx, { title: "Play" }).id);
    const handout = ctx.store.createHandout({ title: "Map scrap" });
    revealHandout(ctx, session.id, handout.id);
    expect(ticks(ctx, session)["play.reveals"]).toBe(true);

    expect(ticks(ctx, session)["play.notes"]).toBeUndefined();
    await tickLogNotes(ctx, session.id); // empty log: nothing
    expect(ticks(ctx, session)["play.notes"]).toBeUndefined();
    await appendLogLine(ctx, session.id, "Met Old Brannoc at the well.");
    expect(ticks(ctx, session)["play.notes"]).toBe(true);
  });

  it("revealing an entity from its page ticks play.reveals too", async () => {
    const ctx = await open(exampleCampaign);
    const session = startPlannedSession(ctx, planNextSession(ctx).id);
    const clue = ctx.store.createEntity({ type: "example.place", name: "Hidden shrine" });
    revealEntity(ctx, clue.id, session.id);
    expect(ticks(ctx, session)["play.reveals"]).toBe(true);
  });

  it("finishing the wrap-up ticks summary, loose ends, timeline, schedule and rewards (prompts answered)", async () => {
    const ctx = await open(exampleCampaign);
    const session = startPlannedSession(ctx, planNextSession(ctx, { title: "Wrap" }).id);
    const prompts = sessionEndPrompts(ctx, session.id);
    expect(prompts.map((p) => p.id)).toEqual(["example.prompt.rest"]);
    answerPrompt(ctx, session.id, prompts[0]!, { promptId: prompts[0]!.id, kind: "yesno", value: false, effects: [] });
    // answering the last prompt ticks the items waiting on it, core and module alike
    expect(ticks(ctx, session)).toMatchObject({ "wrap.rewards": true, "example.wrap.rest": true });

    const result = finishSession(ctx, session.id, {
      summary: "The heroes reached the gate.",
      looseEnds: ["Who rang the bell?"],
      timeline: [{ text: "The gate opened.", entities: [], include: true }],
    });
    expect(result.next).toBeDefined();
    expect(ticks(ctx, session)).toMatchObject({
      "wrap.summary": true,
      "wrap.loose-ends": true,
      "wrap.timeline": true,
      "wrap.schedule": true,
      "wrap.rewards": true,
    });
    // nothing it has no evidence for
    expect(ticks(ctx, session)["wrap.hook"]).toBeUndefined();
    expect(ticks(ctx, session)["wrap.feedback"]).toBeUndefined();
  });

  it("an empty summary, no loose ends and no timeline leave those items for the GM", async () => {
    const ctx = await open(exampleCampaign);
    const session = startPlannedSession(ctx, planNextSession(ctx).id);
    finishSession(ctx, session.id, { summary: "  ", looseEnds: [" "], timeline: [{ text: "x", entities: [], include: false }] });
    const t = ticks(ctx, session);
    expect(t["wrap.summary"]).toBeUndefined();
    expect(t["wrap.loose-ends"]).toBeUndefined();
    expect(t["wrap.timeline"]).toBeUndefined();
    expect(t["wrap.schedule"]).toBe(true);
    expect(t["wrap.rewards"]).toBeUndefined(); // the module asked a question nobody answered
  });

  it("planning the next session ticks wrap.schedule on the last finished one", async () => {
    const ctx = await open(exampleCampaign);
    const latest = startPlannedSession(ctx, planNextSession(ctx).id);
    ctx.store.update("sessions", latest.id, { status: "done" });
    planNextSession(ctx);
    expect(ticks(ctx, latest)["wrap.schedule"]).toBe(true);
  });

  it("the GM's untick is not undone by later actions", async () => {
    const ctx = await open(exampleCampaign);
    const session = planNextSession(ctx, { title: "Untick" });
    const scene = sceneIn(ctx, "The bridge");
    setPlannedScenes(ctx, session.id, [scene.id]);
    expect(ticks(ctx, session)["prep.scenes"]).toBe(true);
    setChecklistItem(ctx.store, session.id, "prep.scenes", false);
    setChecklistItem(ctx.store, session.id, "play.reveals", false);

    startPlannedSession(ctx, session.id);
    revealHandout(ctx, session.id, ctx.store.createHandout({ title: "Letter" }).id);
    await appendLogLine(ctx, session.id, "Crossed the bridge.");
    setPlannedScenes(ctx, session.id, [scene.id, sceneIn(ctx, "The far bank").id]);
    finishSession(ctx, session.id, { summary: "Done.", looseEnds: ["The toll"] });

    const t = ticks(ctx, session);
    expect(t["prep.scenes"]).toBe(false);
    expect(t["play.reveals"]).toBe(false);
    expect(t["play.notes"]).toBe(true);
    expect(t["wrap.summary"]).toBe(true);
  });

  it("hidden items are not auto-ticked", async () => {
    const ctx = await open(exampleCampaign);
    updateMeta(ctx, { settings: withChecklistSettings(ctx.store.meta(), { hidden: ["play.reveals"] }) });
    try {
      const session = startPlannedSession(ctx, planNextSession(ctx).id);
      revealHandout(ctx, session.id, ctx.store.createHandout({ title: "Note" }).id);
      expect(ticks(ctx, session)["play.reveals"]).toBeUndefined();
    } finally {
      updateMeta(ctx, { settings: withChecklistSettings(ctx.store.meta(), { hidden: [] }) });
    }
  });
});

describe("module checklist items", () => {
  const moduleIds = (ctx: CampaignContextValue) => campaignChecklist(ctx).filter((i) => i.source === "module").map((i) => i.id);

  it("Example Quest items follow the mode and come after the core items of their phase", async () => {
    const ctx = await open(exampleCampaign);
    expect(moduleIds(ctx)).toEqual(["example.prep.omens", "example.wrap.rest"]);
    const prep = campaignChecklist(ctx).filter((i) => i.phase === "prep");
    expect(prep.at(-1)).toMatchObject({ id: "example.prep.omens", source: "module", moduleId: "example" });
    updateMeta(ctx, { mode: "hardcore" });
    try {
      expect(moduleIds(ctx)).toEqual(["example.prep.omens", "example.wrap.rest", "example.wrap.doom"]);
    } finally {
      updateMeta(ctx, { mode: "standard" });
    }
  });

  it("Alien items differ between cinematic and campaign play", async () => {
    const cinematic = await open(alienCinematic);
    expect(moduleIds(cinematic)).toEqual(["alien.prep.agendas", "alien.prep.infections", "alien.play.supply", "alien.play.story-points", "alien.wrap.trauma"]);
    const campaign = await open(alienCampaign);
    expect(moduleIds(campaign)).toEqual(["alien.prep.job", "alien.prep.infections", "alien.play.supply", "alien.wrap.xp", "alien.wrap.trauma"]);
    const xp = campaignChecklist(campaign).find((i) => i.id === "alien.wrap.xp");
    expect(xp).toMatchObject({ phase: "wrap", page: 30, moduleId: "alien", autoWhen: "prompts-answered" });
    // every phase lists the core items first
    for (const phase of ["prep", "play", "wrap"] as const) {
      const sources = campaignChecklist(campaign).filter((i) => i.phase === phase).map((i) => i.source);
      expect(sources.indexOf("module")).toBeGreaterThan(sources.lastIndexOf("core"));
    }
  });
});
