import "fake-indexeddb/auto";
import { cluesFor, cluesOf, playerShareSnapshot, plainText, playerSceneTitle, seedClue, type Entity, type Id } from "@campaign-forge/core";
import { runProcedure, templateGuidance, type TemplateAdventure } from "@campaign-forge/module-sdk";
import { afterEach, describe, expect, it } from "vitest";
import { createCampaign, createEntity } from "./actions";
import { openCampaign, type CampaignContextValue } from "./CampaignProvider";
import { alreadyPosted, applyRunEffects, effectsToApply, plainEffectsOf } from "./runEffects";
import { postPayout, postedPayout, undoPayout, payoutFor } from "./shipActions";
import { adventureForEntity, closeSource, runFromEntity, sessionSources, setAdventureDone } from "./sourceActions";
import { loadDemoCampaign, plannedScenesOf, sessionSceneOrder, startPlannedSession } from "./tableActions";

const opened: Array<() => void> = [];
afterEach(() => {
  while (opened.length) opened.pop()?.();
});

async function skyfire(): Promise<{ ctx: CampaignContextValue; job: Entity; session2: Id }> {
  const id = await loadDemoCampaign();
  const ctx = await openCampaign(id);
  opened.push(ctx.close);
  const job = ctx.store.list("entities").find((e) => e.type === "alien.job" && e.fields.status === "accepted")!;
  const session2 = ctx.store.list("sessions").find((s) => s.number === 2)!.id;
  return { ctx, job, session2 };
}

const text = (ctx: CampaignContextValue, id: Id | undefined) => (id ? plainText(ctx.registry.open(id)) : "");
const scenesOf = (ctx: CampaignContextValue, adventureId: Id) => ctx.store.get("adventures", adventureId)!.acts.flatMap((a) => ctx.store.get("acts", a)!.scenes.map((s) => ctx.store.get("scenes", s)!));

describe("Run this job (an adventure source)", () => {
  it("makes the Job card adventure from the demo's accepted job: posting for the players, the rest for the GM, the site, its map and the NPCs on the arrival; planned into session 2; idempotent", async () => {
    const { ctx, job, session2 } = await skyfire();
    const before = plannedScenesOf(ctx.store.get("sessions", session2));
    const res = await runFromEntity(ctx, job.id, "campaign");
    expect(res.created).toBe(true);
    const adv = res.adventure;
    expect(adv).toMatchObject({ title: job.name, templateId: "alien.template.job-card", source: { entity: job.id, def: "alien.run-job" } });
    expect(adventureForEntity(ctx, job.id)?.id).toBe(adv.id);

    const posting = job.fields.posting as { pitch: string; pay: string };
    expect(text(ctx, adv.playerIntroDoc)).toContain(posting.pitch);
    expect(text(ctx, adv.playerIntroDoc)).toContain(posting.pay);
    const gm = text(ctx, adv.gmSituationDoc);
    for (const c of job.fields.complications as string[]) expect(gm).toContain(c);
    expect(gm).toContain(String(job.fields.employerIntent));

    // the arrival: at the job's site, on its saved map, with the job's NPCs
    const site = ctx.store.list("relationships").find((r) => r.type === "site_of" && r.to === job.id)!.from;
    const map = ctx.store.list("maps").find((m) => m.location === site && m.layout)!;
    const npcs = ctx.store.list("relationships").filter((r) => r.type === "involved_in" && r.to === job.id).map((r) => r.from);
    const scenes = scenesOf(ctx, adv.id);
    const arrival = scenes.find((s) => s.location === site)!;
    expect(arrival.map).toBe(map.id);
    expect([...arrival.participants].sort()).toEqual([...npcs].sort());
    expect(scenes.map((s) => s.title)).toContain("Transit");

    // planned into the next planned session (session 2), after what it had
    const planned = plannedScenesOf(ctx.store.get("sessions", session2));
    expect(res.session?.id).toBe(session2);
    expect(planned.slice(0, before.length)).toEqual(before);
    expect(planned.slice(before.length)).toEqual(res.planned);
    expect(res.planned).toHaveLength(4);
    expect(res.planned).toContain(arrival.id);

    // a second run opens the same adventure and plans nothing more
    const again = await runFromEntity(ctx, job.id, "campaign");
    expect(again).toMatchObject({ created: false, planned: [] });
    expect(again.adventure.id).toBe(adv.id);
    expect(ctx.store.list("adventures").filter((a) => a.source?.entity === job.id)).toHaveLength(1);
    expect(plannedScenesOf(ctx.store.get("sessions", session2))).toEqual(planned);
  });

  it("lists the arc clue seeded with the job on the arrival scene: a GM-only Clue record linked to the arc clue, made once", async () => {
    const { ctx, job } = await skyfire();
    const thread = ctx.store.list("arcs").find((t) => cluesOf(t).some((c) => c.clue.state === "unseen"))!;
    const clue = cluesOf(thread).find((c) => c.clue.state === "unseen")!.clue;
    seedClue(ctx.store, thread.id, clue.id, { job: job.id, slotLabel: "A key room of the site brief" });
    const res = await runFromEntity(ctx, job.id, "campaign");
    const arrival = scenesOf(ctx, res.adventure.id).find((s) => s.title.startsWith("Arrival"))!;
    const records = arrival.clues.map((id) => ctx.store.get("entities", id)!);
    const record = records.find((e) => e.fields.pointsTo === thread.title)!;
    expect(record).toMatchObject({ type: "alien.clue", visibility: { level: "gm" } });
    expect(record.fields).toMatchObject({ text: clue.playerText, foundBy: "A key room of the site brief", revealed: false });
    // the arc clue now leads to the record and the scene, and the record back to the clue
    const linked = cluesOf(ctx.store.get("arcs", thread.id)!).find((c) => c.clue.id === clue.id)!.clue;
    expect(linked.links?.entities).toContain(record.id);
    expect(linked.links?.scenes).toContain(arrival.id);
    expect(cluesFor(ctx.store.toJSON(), record.id).map((c) => c.clue.id)).toContain(clue.id);
  });

  it("never lets template guidance or the GM's side reach the players: scene titles, the player intro, every scene's share", async () => {
    const { ctx, job, session2 } = await skyfire();
    const { adventure } = await runFromEntity(ctx, job.id, "campaign");
    const scaffold = ctx.module.template("alien.template.job-card")!.scaffold as TemplateAdventure;
    const guidance = templateGuidance(scaffold).filter((g) => g.split(/\s+/).length >= 3);
    const secrets = [...(job.fields.complications as string[]), String(job.fields.employerIntent), String(job.fields.plotTwist ?? "")].filter((s) => s.split(/\s+/).length >= 3);
    // the adventure's own record keeps the guidance as placeholders only
    expect(adventure.guide?.playerIntro).toContain("The offer as the employer makes it");
    const docs = [adventure.playerIntroDoc, adventure.gmSituationDoc, adventure.epilogueDoc].map((id) => text(ctx, id)).join("\n");
    for (const g of guidance) expect(docs, g).not.toContain(g);
    for (const scene of scenesOf(ctx, adventure.id)) {
      expect(scene.title).not.toMatch(/\(|link|alien\./);
      expect(playerSceneTitle(scene.title)).toBe(scene.title);
      await Promise.all([scene.readAloudDoc, adventure.playerIntroDoc].filter((x): x is Id => !!x).map((id) => ctx.registry.whenReady(id)));
      const snap = playerShareSnapshot({ maps: ctx.store.toJSON(), module: ctx.module.module, sessionId: session2, sceneId: scene.id, doc: (id) => ctx.registry.peek(id), at: "t" });
      const json = JSON.stringify(snap);
      expect(snap.briefing?.intro).toContain((job.fields.posting as { pitch: string }).pitch);
      for (const g of guidance) expect(json, `${scene.title}: ${g}`).not.toContain(g);
      for (const s of secrets) expect(json, `${scene.title}: ${s}`).not.toContain(s);
      expect(json).not.toContain("alien.job");
    }
  });

  it("runs a record of another module the same way (the fixture module's quest at a place), planning into a new session when none is planned", async () => {
    const id = await createCampaign({ name: "Quests", moduleId: "example" });
    const ctx = await openCampaign(id);
    opened.push(ctx.close);
    const quiet = createEntity(ctx, { type: "example.place", name: "Millford", fields: { danger: "quiet" } });
    const lair = createEntity(ctx, { type: "example.place", name: "Old Tower", fields: { danger: "dangerous" } });
    const map = ctx.store.createMap({ name: "Tower map", location: lair.id });
    await expect(runFromEntity(ctx, "nope", "standard")).rejects.toThrow(/not found/);
    expect(ctx.store.list("sessions")).toHaveLength(0);
    const res = await runFromEntity(ctx, lair.id, "standard");
    expect(res.adventure.title).toBe("Trouble at Old Tower");
    expect(res.sessionCreated).toBe(true);
    const climax = scenesOf(ctx, res.adventure.id).find((s) => s.title === "The climax at Old Tower")!;
    expect(climax).toMatchObject({ location: lair.id, map: map.id });
    expect(plannedScenesOf(ctx.store.get("sessions", res.session!.id))).toEqual(res.planned);
    expect(res.planned).toContain(climax.id);
    void quiet;
  });
});

describe("closing the job after the session", () => {
  it("lists the job the session ran, closes it with an outcome, marks the adventure done, and the next session skips it", async () => {
    const { ctx, job, session2 } = await skyfire();
    const { adventure } = await runFromEntity(ctx, job.id, "campaign");
    const sources = sessionSources(ctx, session2, "campaign");
    const mine = sources.find((s) => s.entity.id === job.id)!;
    expect(mine).toMatchObject({ open: true, adventure: { id: adventure.id } });
    expect(mine.def.outcomes?.map((o) => o.id)).toEqual(["done", "failed", "carried"]);

    // carried over: nothing changes on the job
    closeSource(ctx, session2, job.id, mine.def.outcomes![2]!);
    expect(ctx.store.get("entities", job.id)!.fields.status).toBe("accepted");
    // failed, then done: the status follows, the session remembers the last pick, the job stays listed
    closeSource(ctx, session2, job.id, mine.def.outcomes![1]!);
    expect(ctx.store.get("entities", job.id)!.fields.status).toBe("failed");
    closeSource(ctx, session2, job.id, mine.def.outcomes![0]!);
    expect(ctx.store.get("entities", job.id)!.fields.status).toBe("done");
    const after = sessionSources(ctx, session2, "campaign").find((s) => s.entity.id === job.id)!;
    expect(after).toMatchObject({ outcome: "done", open: false });
    setAdventureDone(ctx, adventure.id, true);
    expect(ctx.store.get("adventures", adventure.id)!.status).toBe("done");

    // a session with nothing planned starts on a scene that is not the finished job's
    const next = ctx.store.createSession({ number: 9, date: "2026-12-01", status: "planned" });
    const order = sessionSceneOrder(ctx.store, ctx.store.get("sessions", next.id)!, ctx.module);
    const jobScenes = new Set(scenesOf(ctx, adventure.id).map((s) => s.id));
    expect(order.some((s) => jobScenes.has(s.id))).toBe(false);
    startPlannedSession(ctx, next.id);
    const table = ctx.store.list("trackerState").find((t) => t.session === next.id)!.state.table as { sceneId?: Id };
    expect(table.sceneId === undefined || !jobScenes.has(table.sceneId)).toBe(true);
    // even with the job's scenes planned, the first scene picked is not one of them
    const planned = ctx.store.createSession({ number: 10, date: "2026-12-08", status: "planned" });
    ctx.store.update("sessions", planned.id, { plannedScenes: [...jobScenes] } as never);
    startPlannedSession(ctx, planned.id);
    const t2 = ctx.store.list("trackerState").find((t) => t.session === planned.id)!.state.table as { sceneId?: Id };
    expect(t2.sceneId).toBeUndefined();
  });

  it("collects the payment with an undo that puts the job back as it was", async () => {
    const { ctx, job } = await skyfire();
    const payout = payoutFor(ctx, job)!;
    const res = postPayout(ctx, ctx.store.get("entities", job.id)!, payout);
    expect(res.duplicate).toBe(false);
    expect(ctx.store.get("entities", job.id)!.fields.status).toBe("done");
    expect(postedPayout(ctx, job, payout)?.amount).toBe(job.fields.payment);
    expect(undoPayout(ctx, job, payout)).toBe(true);
    expect(postedPayout(ctx, job, payout)).toBeUndefined();
    expect(ctx.store.get("entities", job.id)!.fields.status).toBe("accepted");
    expect(undoPayout(ctx, job, payout)).toBe(false);
  });
});

describe("between jobs in one step", () => {
  it("applies the ticked effects and moves the clocks when the run is accepted; leaves out the pay the ledger already holds", async () => {
    const { ctx, job } = await skyfire();
    const proc = ctx.module.procedure("alien.between-jobs")!;
    const ship = ctx.store.get("entities", String(ctx.store.meta().settings.ship))!;
    const snap = (e: Entity) => ({ id: e.id, name: e.name, type: e.type, fields: e.fields });
    const graph = runProcedure(proc, ctx.module.module, { seed: "between-1", inputs: { job: snap(job), ship: snap(ship), weeks: 1, repairShifts: 10, heavyMachineryDice: 5, comtechDice: 5, buyParts: true, provisionsTarget: 120, dockingFees: 500, fuel: 0, frame: "space-truckers", pcCount: 4, livingStandard: "normal" } });
    const plain = plainEffectsOf(graph.results);
    const pay = plain.find((x) => x.e.kind === "ledger" && x.e.key === `job-payment:${job.id}`)!;
    expect(pay).toBeDefined();
    // the pay was collected from the job page: the list leaves it out
    postPayout(ctx, ctx.store.get("entities", job.id)!, payoutFor(ctx, job)!);
    expect(alreadyPosted(ctx.store, pay.e)).toBe(true);
    const fees = plain.find((x) => x.e.kind === "ledger" && x.e.note.startsWith("Docking"))!;
    const unticked = [fees.i];
    const chosen = effectsToApply(ctx.store, graph.results, unticked);
    expect(chosen.map((x) => x.i)).not.toContain(pay.i);
    expect(chosen.map((x) => x.i)).not.toContain(fees.i);

    const ledger = ctx.store.count("ledger");
    const before = ctx.store.list("arcs").map((t) => [t.id, t.clock.filled] as const);
    const run = { id: "run-1", results: graph.results };
    const out = applyRunEffects(ctx, run, { unticked, clocks: { def: ctx.module.module.arcs!, seed: "clocks-1" } });
    expect(out.applied).toEqual(chosen.map((x) => x.i));
    expect(out.result?.skipped ?? []).toEqual([]);
    expect(ctx.store.count("ledger")).toBe(ledger + chosen.filter((x) => x.e.kind === "ledger").length);
    expect(ctx.store.list("ledger").filter((e) => e.key === `job-payment:${job.id}`)).toHaveLength(1);
    expect(ctx.store.list("ledger").some((e) => e.note?.startsWith("Docking"))).toBe(false);
    // the clocks moved with the run (every active thread rolled)
    expect(out.moved?.length).toBe(ctx.store.list("arcs").filter((t) => t.status === "active").length);
    const after = new Map(ctx.store.list("arcs").map((t) => [t.id, t.clock.filled]));
    for (const [id, filled] of before) expect(after.get(id)!).toBeGreaterThanOrEqual(filled);
    expect(ctx.store.list("arcs").some((t) => t.clock.log.some((l) => l.note === "Between jobs" && l.roll?.seed))).toBe(true);
  });
});
