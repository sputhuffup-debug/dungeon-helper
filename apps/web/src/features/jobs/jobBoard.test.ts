import "fake-indexeddb/auto";
import { plainText, playerShareSnapshot, projectCampaignForViewer, type Entity } from "@campaign-forge/core";
import type { OfferSet } from "@campaign-forge/module-sdk";
import { afterEach, describe, expect, it } from "vitest";
import { createCampaign } from "../../state/actions";
import { openCampaign, type CampaignContextValue } from "../../state/CampaignProvider";
import { ensureEntitySite, mapGeneratorsFor, prefillFromEntityBrief, runMapGenerator, saveGeneratedMap } from "../../state/mapgenActions";
import { acceptOffer, offersOf, withoutPartsOf } from "../../state/offerActions";
import { initialInputs } from "../generate/prefill";
import { runGenerator } from "../generate/runner";
import { briefChanged, entityBrief, sitesOf } from "./JobPanel";

const opened: Array<() => void> = [];
afterEach(() => {
  while (opened.length) opened.pop()?.();
});

async function setup() {
  const id = await createCampaign({ name: "Board", moduleId: "alien", mode: "campaign" });
  const ctx: CampaignContextValue = await openCampaign(id);
  opened.push(ctx.close);
  for (const name of ["Ada Rook", "Bo Lantern", "Cy Varga", "Di Moss"]) ctx.store.createEntity({ type: "alien.character", name, fields: { isPC: true }, visibility: { level: "players" } });
  ctx.store.createEntity({ type: "alien.location", name: "Anchorpoint", subtype: "colony", tags: ["home-base"], fields: {}, visibility: { level: "players" } });
  return ctx;
}

function deal(ctx: CampaignContextValue, seed: string, extra: Record<string, unknown> = {}) {
  const procedure = ctx.module.procedure("alien.job-board")!;
  const inputs = { ...initialInputs(procedure, ctx.store, ctx.module), ...extra };
  const graph = runGenerator(ctx.module, { procedureId: procedure.id, seed, inputs });
  return { procedure, graph, set: offersOf(graph)! };
}

/** A seed whose board holds a difficulty-3 posting with rogue humans in its brief. */
function hardBoard(ctx: CampaignContextValue) {
  for (let i = 0; i < 300; i++) {
    const d = deal(ctx, `hard-${i}`, { treachery: "common" });
    const offer = d.set.offers.find((o) => o.produced.entities[0]!.fields.difficulty === 3 && ((o.produced.entities[0]!.fields.siteBrief as { inputs: { hostiles: unknown[] } }).inputs.hostiles.length ?? 0) > 0);
    if (offer) return { ...d, offer };
  }
  throw new Error("no hard posting");
}

describe("the job board in the app", () => {
  it("is offered in campaign mode, reads the campaign's PCs and home base, and deals a board of postings", async () => {
    const ctx = await setup();
    expect(ctx.module.forMode("campaign").procedures.some((p) => p.id === "alien.job-board")).toBe(true);
    expect(ctx.module.forMode("cinematic").procedures.some((p) => p.id === "alien.job-board")).toBe(false);
    const { set, graph } = deal(ctx, "board");
    expect(set.offers).toHaveLength(3);
    expect((graph.results.cast as { pcCount: number; home: string }).pcCount).toBe(4);
    expect((graph.results.cast as { home: string }).home).toBe("Anchorpoint");
    // a whole posting re-rolled starts its parts afresh
    expect(withoutPartsOf({ "offers/posting-1": "a", "offers/posting-1/title": "b", "offers/posting-2/title": "c" }, "offers/posting-1")).toEqual({ "offers/posting-1": "a", "offers/posting-2/title": "c" });
  });

  it("accept: the job, its employer, its NPCs (the contact for the players, the rest GM-only) and the players' posting handout", async () => {
    const ctx = await setup();
    const { procedure, graph, offer } = hardBoard(ctx);
    const res = await acceptOffer(ctx, { graph, offer, def: procedure.offers!, as: "accept" });
    const job = ctx.store.get("entities", res.root!)!;
    expect(job.type).toBe("alien.job");
    expect(job.fields.status).toBe("accepted");
    expect(job.visibility.level).toBe("players");
    expect(job.provenance?.generatorRun).toBe(res.run.id);
    const rels = ctx.store.list("relationships");
    const involved = rels.filter((r) => r.type === "involved_in" && r.to === job.id);
    expect(involved).toHaveLength(3);
    const npcs = involved.map((r) => ctx.store.get("entities", r.from)!);
    expect(npcs[0]!.visibility.level).toBe("players");
    for (const n of npcs.slice(1)) expect(n.visibility.level).toBe("gm");
    expect(involved[0]!.visibility.level).toBe("players");
    expect(rels.some((r) => (r.type === "employer_of" || r.type === "sponsor_of") && r.to === job.id)).toBe(true);
    // the handout: player-visible, attached to the job, the posting text only
    expect(res.handout).toMatchObject({ visibility: { level: "players" }, attachedTo: { kind: "entity", id: job.id }, purpose: "job-posting" });
    const body = plainText(ctx.registry.open(res.handout!.bodyDoc!));
    expect(body).toContain((job.fields.posting as { title: string }).title);
    expect(body).not.toMatch(/betray|synthetic|agenda|plays as/i);

    // the players' view: the posting, the contact; nothing behind it
    const view = projectCampaignForViewer(ctx.store.toJSON(), ctx.module.module, { role: "player" });
    const pj = view.entities[job.id]!;
    for (const f of ["difficulty", "effectiveDifficulty", "betrayers", "employerIntent", "siteBrief", "complications"]) expect(pj.fields[f], f).toBeUndefined();
    expect(view.entities[npcs[0]!.id]).toBeDefined();
    for (const n of npcs.slice(1)) expect(view.entities[n.id]).toBeUndefined();
    const contact = view.entities[npcs[0]!.id] as Entity;
    for (const f of ["personalAgenda", "secret", "goal", "background", "secretOrders", "secretAndroid"]) expect(contact.fields[f], f).toBeUndefined();
    expect(Object.values(view.handouts).map((h) => h.id)).toContain(res.handout!.id);
  });

  it("keep as lead: the posting stays offered", async () => {
    const ctx = await setup();
    const { procedure, graph, set } = deal(ctx, "lead");
    const res = await acceptOffer(ctx, { graph, offer: set.offers[1]!, def: procedure.offers!, as: "keep" });
    expect(ctx.store.get("entities", res.root!)!.fields.status).toBe("offered");
    const again = await acceptOffer(ctx, { graph, offer: set.offers[2]!, def: procedure.offers!, as: "keep" });
    expect(again.root).not.toBe(res.root);
    expect(ctx.store.list("entities").filter((e) => e.type === "alien.job")).toHaveLength(2);
  });

  it("generate site map: the brief prefills the generator, the map is saved with the job's site, rogue humans stay on the GM map", async () => {
    const ctx = await setup();
    const { procedure, graph, offer } = hardBoard(ctx);
    const res = await acceptOffer(ctx, { graph, offer, def: procedure.offers!, as: "accept" });
    const job = ctx.store.get("entities", res.root!)!;
    const found = entityBrief(mapGeneratorsFor(ctx.module, "campaign"), job)!;
    expect(found.generator.id).toBe("alien.map.site");
    const prefill = prefillFromEntityBrief(found.generator, found.brief);
    expect(prefill.inputs.hostiles).toEqual((job.fields.siteBrief as { inputs: { hostiles: unknown } }).inputs.hostiles);
    const result = runMapGenerator(ctx.module, found.generator.id, { seed: "site", inputs: prefill.inputs });
    const siteId = ensureEntitySite(ctx, job.id, found.brief.site!);
    expect(ensureEntitySite(ctx, job.id, found.brief.site!)).toBe(siteId);
    const map = saveGeneratedMap(ctx, result, { name: found.brief.name!, locationId: siteId, generator: { id: found.generator.id, seed: "site", inputs: prefill.inputs } });
    expect(map.location).toBe(siteId);
    expect(sitesOf((id) => ctx.store.get("entities", id), ctx.store.list("relationships"), job.id, "site_of").map((e) => e.id)).toEqual([siteId]);
    expect(map.layout!.markers.some((m) => m.kind === "hostile")).toBe(true);
    expect(briefChanged(map, found.brief.inputs)).toBe(false);
    // the GM re-rolls the job's brief (or edits it): the saved map now reads as built from an earlier brief
    const edited = { ...(job.fields.siteBrief as Record<string, unknown>), inputs: { ...found.brief.inputs, darkness: 99 } };
    ctx.store.update("entities", job.id, { fields: { ...job.fields, siteBrief: edited } });
    const again = entityBrief(mapGeneratorsFor(ctx.module, "campaign"), ctx.store.get("entities", job.id)!)!;
    expect(briefChanged(ctx.store.get("maps", map.id)!, again.brief.inputs)).toBe(true);
    // the players see the map only when the GM shares it, and then without the rogue humans
    ctx.store.update("maps", map.id, { visibility: { level: "players" } });
    const view = projectCampaignForViewer(ctx.store.toJSON(), ctx.module.module, { role: "player" });
    const pm = view.maps[map.id]!;
    expect(pm.layout!.markers.some((m) => m.kind === "hostile" || m.kind === "waypoint" || m.kind === "npc" || m.gmOnly)).toBe(false);
    expect(pm.generator).toBeUndefined();
    const session = ctx.store.createSession({ number: 1, date: "2026-11-07", title: "One", status: "planned" });
    const share = JSON.stringify(playerShareSnapshot({ maps: ctx.store.toJSON(), module: ctx.module.module, sessionId: session.id, at: "2026-11-07T20:00:00Z", doc: (id) => ctx.registry.open(id), referenceName: () => undefined }));
    for (const m of map.layout!.markers.filter((x) => x.kind === "hostile")) expect(share).not.toContain(m.label);
    expect(share).not.toContain(String(job.fields.employerIntent));
  });

  it("a board run with the procedure's own accept button produces nothing: offers are accepted one by one", async () => {
    const ctx = await setup();
    const { graph } = deal(ctx, "nothing");
    expect(graph.produced.entities).toHaveLength(0);
    expect((graph.results.offers as OfferSet).offers.every((o) => o.produced.entities[0]!.type === "alien.job")).toBe(true);
  });
});
