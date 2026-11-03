import "fake-indexeddb/auto";
import { draftIsOpen, exportBundle, generatorDraftOf, importBundle, playerPacketSnapshot, playerShareSnapshot, projectCampaignForViewer, saveGeneratorDraft, type GeneratorDraftInput } from "@campaign-forge/core";
import type { OfferDef } from "@campaign-forge/module-sdk";
import { afterEach, describe, expect, it } from "vitest";
import { initialInputs } from "../features/generate/prefill";
import { runGenerator } from "../features/generate/runner";
import { openCampaign, type CampaignContextValue } from "./CampaignProvider";
import { discardDraftOffer, draftEditsOf, draftHasWork, draftSourceKey, compactEdits, keepOpenOffers, takeDraftOffer, writeDraft } from "./draftActions";
import { offersOf } from "./offerActions";
import { loadDemoCampaign } from "./tableActions";

const opened: Array<() => void> = [];
afterEach(() => {
  while (opened.length) opened.pop()?.();
});

const BOARD = "alien.job-board";

async function skyfire(): Promise<CampaignContextValue> {
  const id = await loadDemoCampaign();
  const ctx = await openCampaign(id);
  opened.push(ctx.close);
  return ctx;
}

/** Deal the job board the way the workbench does, and save it as the board's draft. */
function dealBoard(ctx: CampaignContextValue, seed = "draft-test") {
  const procedure = ctx.module.procedure(BOARD)!;
  const inputs = initialInputs(procedure, ctx.store, ctx.module);
  const graph = runGenerator(ctx.module, { procedureId: BOARD, seed, inputs });
  const set = offersOf(graph)!;
  const input: GeneratorDraftInput = { procedure: BOARD, moduleId: ctx.module.manifest.id, moduleVersion: ctx.module.manifest.version, seed, inputs, offerKeys: set.offers.map((o) => o.key) };
  writeDraft(ctx, input, { fresh: true });
  return { graph, set, def: procedure.offers as OfferDef, input };
}

describe("generator drafts in the app", () => {
  it("name what a search asks for, so the same request reopens its draft", () => {
    expect(draftSourceKey({})).toBeUndefined();
    expect(draftSourceKey({ within: "E1" })).toBeUndefined();
    expect(draftSourceKey({ run: "R1" })).toBe("run:R1");
    expect(draftSourceKey({ chainFrom: "R1", chain: 0, within: "E1" })).toBe("chain:R1:0:E1");
    expect(draftSourceKey({ pick: "job:J1" })).toBe("pick:job:J1");
    // a fresh deal is not a source: it only replaces the draft once
    expect(draftSourceKey({ deal: "x" })).toBeUndefined();
  });

  it("keep the GM's edits and leave empty ones out", () => {
    const e = compactEdits({ agenda: { "a/1": "Mine" }, names: {}, unticked: [], moveClocks: true, longAgenda: {} });
    expect(e).toEqual({ agenda: { "a/1": "Mine" } });
    expect(draftEditsOf({ edits: { ...e, unticked: [2, "x"], moveClocks: false, junk: 1 } })).toEqual({ agenda: { "a/1": "Mine" }, unticked: [2], moveClocks: false });
    expect(compactEdits({})).toBeUndefined();
  });

  it("taking a posting marks it on the board and keeps the others; keeping the rest as leads; the board survives reopening the campaign", async () => {
    const ctx = await skyfire();
    const { graph, set, def, input } = dealBoard(ctx);
    expect(set.offers.length).toBe(3);
    const [first, second, third] = set.offers;

    const res = await takeDraftOffer(ctx, { procedure: BOARD, graph, offer: first!, def, as: "accept" });
    const job = ctx.store.get("entities", res.root!)!;
    expect(job.fields.status).toBe("accepted");
    let draft = generatorDraftOf(ctx.store, BOARD)!;
    expect(draft.offers?.[first!.key]).toMatchObject({ as: "accept", record: job.id, name: job.name, run: res.run.id });
    expect(draftIsOpen(draft)).toBe(true);
    expect(draftHasWork(draft)).toBe(true);

    // the page saving its state again keeps the marks; a fresh deal starts with none
    writeDraft(ctx, { ...input, pinnedParts: { [first!.key]: graph.parts?.[first!.key] } });
    expect(generatorDraftOf(ctx.store, BOARD)!.offers?.[first!.key]?.as).toBe("accept");

    discardDraftOffer(ctx, BOARD, third!.key);
    expect(generatorDraftOf(ctx.store, BOARD)!.offers?.[third!.key]?.as).toBe("discard");
    discardDraftOffer(ctx, BOARD, third!.key, false);
    expect(generatorDraftOf(ctx.store, BOARD)!.offers?.[third!.key]).toBeUndefined();
    // a taken posting is never "un-discarded" away
    discardDraftOffer(ctx, BOARD, first!.key, false);
    expect(generatorDraftOf(ctx.store, BOARD)!.offers?.[first!.key]?.as).toBe("accept");

    const kept = await keepOpenOffers(ctx, { procedure: BOARD, graph, def, offers: set.offers });
    expect(kept).toHaveLength(2);
    draft = generatorDraftOf(ctx.store, BOARD)!;
    expect(draft.offers?.[second!.key]?.as).toBe("keep");
    expect(draft.offers?.[third!.key]?.as).toBe("keep");
    for (const id of kept) expect(ctx.store.get("entities", id)!.fields.status).toBe("offered");
    expect(draftIsOpen(draft)).toBe(false);

    // the campaign reopened from its saved state: the same board, marks and all
    const reopened = await openCampaign(ctx.campaignId);
    opened.push(reopened.close);
    const again = generatorDraftOf(reopened.store, BOARD)!;
    expect(again.seed).toBe("draft-test");
    expect(Object.fromEntries(Object.entries(again.offers ?? {}).map(([k, v]) => [k, v.as]))).toEqual({ [first!.key]: "accept", [second!.key]: "keep", [third!.key]: "keep" });

    writeDraft(ctx, { ...input, seed: "new-deal" }, { fresh: true });
    expect(generatorDraftOf(ctx.store, BOARD)!.offers).toBeUndefined();
  });

  it("are per procedure and per campaign, never in the player projection, shares or packets, and round-trip in bundles", async () => {
    const ctx = await skyfire();
    dealBoard(ctx, "SECRETSEED-board");
    saveGeneratorDraft(ctx.store, { procedure: "alien.campaign-agendas", moduleId: "alien", moduleVersion: "1", seed: "SECRETSEED-agendas", inputs: {}, edits: { longAgenda: { x: { beat: "SECRET-GM-BEAT" } } } });
    expect(generatorDraftOf(ctx.store, BOARD)!.seed).toBe("SECRETSEED-board");
    expect(generatorDraftOf(ctx.store, "alien.campaign-agendas")!.seed).toBe("SECRETSEED-agendas");
    const other = await skyfire();
    expect(generatorDraftOf(other.store, BOARD)).toBeUndefined();

    const maps = ctx.store.toJSON();
    const player = maps.meta.members.find((m) => m.role === "player")!;
    const projected = projectCampaignForViewer(maps, ctx.module.module, { role: "player", memberId: player.id });
    expect(projected.generatorDrafts).toEqual({});
    const session = ctx.store.list("sessions")[0]!;
    const doc = (id: string) => ctx.registry.open(id);
    const share = JSON.stringify(playerShareSnapshot({ maps, module: ctx.module.module, sessionId: session.id, doc, at: "t" }));
    const packet = JSON.stringify(playerPacketSnapshot({ maps, module: ctx.module.module, memberId: player.id, sessionId: session.id, doc, at: "t" }));
    for (const out of [JSON.stringify(projected), share, packet]) {
      expect(out).not.toContain("SECRETSEED");
      expect(out).not.toContain("SECRET-GM-BEAT");
    }

    const bytes = await exportBundle(ctx.store, ctx.registry, undefined, { id: ctx.module.manifest.id, version: ctx.module.manifest.version });
    const imported = await importBundle(bytes);
    expect(generatorDraftOf(imported.store, BOARD)!.seed).toBe("SECRETSEED-board");
  });
});
