import "fake-indexeddb/auto";
import { addContact, cluesOf, crewNotes, findClue, markClueFound, projectCampaignForViewer, setHeat } from "@campaign-forge/core";
import type { ArcSnapshot } from "@campaign-forge/module-sdk";
import { afterEach, describe, expect, it } from "vitest";
import { createCampaign } from "../../state/actions";
import { arcsDefOf, crewNotesFor, defaultArcChoices } from "../../state/arcActions";
import { openCampaign, type CampaignContextValue } from "../../state/CampaignProvider";
import { acceptOffer, offersOf } from "../../state/offerActions";
import { initialInputs } from "../generate/prefill";
import { runGenerator } from "../generate/runner";
import { tickStepsText } from "./ArcClockTicker";

describe("the thread clocks' tick table", () => {
  // Walkthrough 3 (A8): "1+ nothing, 3+ +1, 6+ +2" read badly
  it("reads as ranges of the roll with what each moves", () => {
    expect(tickStepsText({ dice: "1d6", steps: [{ min: 3, ticks: 1, label: "The sponsor moves" }, { min: 1, ticks: 0 }, { min: 6, ticks: 2, label: "GM pushes" }], ignored: 1 })).toBe(
      "1–2 no move, 3–5 one segment (the sponsor moves), 6 two segments (GM pushes)",
    );
    expect(tickStepsText({ dice: "not dice", steps: [{ min: 1, ticks: 0 }, { min: 4, ticks: 1 }], ignored: 0 })).toBe("1–3 no move, 4+ one segment");
  });
});

const opened: Array<() => void> = [];
afterEach(() => {
  while (opened.length) opened.pop()?.();
});

async function setup(mode = "campaign") {
  const id = await createCampaign({ name: "Arcs", moduleId: "alien", mode });
  const ctx: CampaignContextValue = await openCampaign(id);
  opened.push(ctx.close);
  for (const name of ["Ada Rook", "Bo Lantern"]) ctx.store.createEntity({ type: "alien.character", name, fields: { isPC: true }, visibility: { level: "players" } });
  ctx.store.createEntity({ type: "alien.location", name: "Anchorpoint", subtype: "colony", tags: ["home-base"], fields: {}, visibility: { level: "players" } });
  ctx.store.createEntity({ type: "alien.faction", name: "Geofund", fields: { factionType: "corporation" }, visibility: { level: "players" } });
  ctx.store.createEntity({ type: "alien.faction", name: "Kelland Mining", fields: { factionType: "corporation" }, visibility: { level: "gm" } });
  ctx.store.createSession({ title: "First", status: "running" });
  return ctx;
}

function run(ctx: CampaignContextValue, procedureId: string, seed: string, extra: Record<string, unknown> = {}) {
  const procedure = ctx.module.procedure(procedureId)!;
  const inputs = { ...initialInputs(procedure, ctx.store, ctx.module), ...extra };
  const graph = runGenerator(ctx.module, { procedureId, seed, inputs });
  return { procedure, graph, set: offersOf(graph)! };
}

describe("arcs in the app", () => {
  it("are declared for campaign play only", async () => {
    const ctx = await setup();
    expect(arcsDefOf(ctx.module, "campaign")?.generator).toBe("alien.campaign-thread");
    expect(arcsDefOf(ctx.module, "cinematic")).toBeUndefined();
  });

  it("accept a dealt thread onto the board, seed its clue into an accepted posting, and find it", async () => {
    const ctx = await setup();
    const threads = run(ctx, "alien.campaign-thread", "threads-1", { threads: 2, sponsors: "campaign" });
    expect(threads.set.offers).toHaveLength(2);
    const res = await acceptOffer(ctx, { graph: threads.graph, offer: threads.set.offers[0]!, def: threads.procedure.offers!, as: "accept" });
    expect(res.thread).toBeDefined();
    const thread = ctx.store.get("arcs", res.thread!.id)!;
    expect(thread.visibility.level).toBe("gm");
    expect(thread.source).toMatchObject({ procedure: "alien.campaign-thread", run: res.run.id, offer: "offers/thread-1" });
    expect(cluesOf(thread).every((x) => x.clue.state === "unseen")).toBe(true);

    // the board's arcs input reads the thread and seeds its next clue by default
    expect(defaultArcChoices(ctx.store)).toEqual({ seedClue: "auto", influence: true });
    const board = run(ctx, "alien.job-board", "board-1");
    const arcs = board.graph.inputs.arcs as ArcSnapshot;
    expect(arcs.threads.map((t) => t.id)).toEqual([thread.id]);
    const offer = board.set.offers.find((o) => o.arcLinks?.some((l) => l.kind === "clue"))!;
    expect(offer).toBeDefined();
    const link = offer.arcLinks!.find((l) => l.kind === "clue")!;
    const accepted = await acceptOffer(ctx, { graph: board.graph, offer, def: board.procedure.offers!, as: "accept" });
    const seeded = findClue(ctx.store.get("arcs", thread.id)!, link.clue!)!.clue;
    expect(seeded.state).toBe("seeded");
    expect(seeded.seeded).toMatchObject({ job: accepted.root, posting: offer.key, run: accepted.run.id, slot: link.slot });
    expect(seeded.seeded?.slotLabel).toBeTruthy();

    // nothing reaches the players until it is found
    expect(crewNotesFor(ctx).threads).toEqual([]);
    const session = ctx.store.list("sessions")[0]!;
    markClueFound(ctx.store, thread.id, seeded.id, { session: session.id, job: accepted.root!, via: "job" });
    const notes = crewNotesFor(ctx);
    expect(notes.threads[0]!.title).toBe(thread.playerTitle);
    expect(notes.threads[0]!.clues[0]!.text).toBe(seeded.playerText);
    const json = JSON.stringify(notes);
    expect(json).not.toContain(thread.title);
    expect(json).not.toContain(thread.goal);
    expect(json).not.toContain(seeded.text);
    expect(projectCampaignForViewer(ctx.store.toJSON(), ctx.module.module, { role: "player" }).arcs).toEqual({});
  });

  it("a new sponsor is added GM-only with the thread", async () => {
    const ctx = await setup();
    const threads = run(ctx, "alien.campaign-thread", "threads-new", { threads: 1, sponsors: "new" });
    const res = await acceptOffer(ctx, { graph: threads.graph, offer: threads.set.offers[0]!, def: threads.procedure.offers!, as: "accept" });
    const sponsor = ctx.store.get("entities", res.thread!.sponsor!)!;
    expect(sponsor.type).toBe("alien.faction");
    expect(sponsor.visibility.level).toBe("gm");
    expect(sponsor.provenance?.generatorRun).toBe(res.run.id);
  });

  it("a contact who posts a job is linked, last seen on it, and listed in the crew notes with their favours", async () => {
    const ctx = await setup();
    const mara = ctx.store.createEntity({ type: "alien.character", name: "Mara Quill", fields: {}, visibility: { level: "players" } });
    addContact(ctx.store, mara.id, { stance: "friendly", owedToCrew: 2, owedByCrew: 2, foundAt: "The concourse bar", grudges: ["Still angry about the dock"] });
    setHeat(ctx.store, ctx.module.module.arcs!, ctx.store.list("entities").find((e) => e.name === "Geofund")!.id, 3);
    let found: ReturnType<typeof run> | undefined;
    let offer;
    for (let i = 0; i < 60 && !offer; i++) {
      found = run(ctx, "alien.job-board", `contact-${i}`);
      offer = found.set.offers.find((o) => o.arcLinks?.some((l) => l.kind === "contact" && l.entity === mara.id));
    }
    expect(offer).toBeDefined();
    const res = await acceptOffer(ctx, { graph: found!.graph, offer: offer!, def: found!.procedure.offers!, as: "accept" });
    expect(res.entities.some((e) => e.name === "Mara Quill")).toBe(false);
    expect(ctx.store.get("entities", mara.id)!.contact!.lastSeen?.job).toBe(res.root);
    const notes = crewNotes(ctx.store.toJSON(), ctx.module.module, { role: "player" });
    expect(notes.contacts).toEqual([expect.objectContaining({ name: "Mara Quill", foundAt: "The concourse bar", favourLine: "Owes the crew 2 favours; the crew owes them 2 favours." })]);
    expect(JSON.stringify(notes)).not.toMatch(/friendly|Still angry/);
  });
});
