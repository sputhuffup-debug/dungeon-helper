import "fake-indexeddb/auto";
import { adventureActs, agendaFor, ensureAgendas, fromMarkdown, plainText, type Id } from "@campaign-forge/core";
import type { AgendaDraftSet, CampaignSnapshot, AdventureSnapshot } from "@campaign-forge/module-sdk";
import { afterEach, describe, expect, it } from "vitest";
import { createCampaign } from "../../state/actions";
import { acceptAgendaDrafts, agendaOverwrites, agendaRows } from "../../state/agendaActions";
import { openCampaign, type CampaignContextValue } from "../../state/CampaignProvider";
import { agendaCards } from "../adventures/booklet";
import { agendaDraftsOf, agendaWrites, editKey } from "./AgendaDrafts";
import { initialInputs, pickedInputs } from "./prefill";
import { runGenerator } from "./runner";

const opened: Array<() => void> = [];
afterEach(() => {
  while (opened.length) opened.pop()?.();
});

async function setup() {
  const id = await createCampaign({ name: "Agendas", moduleId: "alien", mode: "cinematic" });
  const ctx: CampaignContextValue = await openCampaign(id);
  opened.push(ctx.close);
  const s = ctx.store;
  const ada = s.createEntity({ type: "alien.character", name: "Ada Rook", fields: { isPC: true, career: "officer" } });
  const bo = s.createEntity({ type: "alien.character", name: "Bo Lantern", fields: { isPC: true, career: "medic" } });
  const extra = s.createEntity({ type: "alien.character", name: "Cy Elsewhere", fields: { isPC: true } });
  const npc = s.createEntity({ type: "alien.character", name: "Dr. Imre Vas", fields: { isPC: false } });
  s.createRelationship("rival_of", ada.id, bo.id);
  const adv = s.createAdventure({ title: "Long Night", premise: "A prototype sample is missing.", withDocs: true });
  for (const n of [1, 2, 3]) s.createAct(adv.id, { number: n });
  s.update("adventures", adv.id, { cast: { pcs: [ada.id, bo.id], npcs: [npc.id] } });
  fromMarkdown(ctx.registry.open(s.get("adventures", adv.id)!.gmSituationDoc!), "Dr. Imre Vas took the sample.");
  return { ctx, ada, bo, extra, npc, adventureId: adv.id };
}

function draftsFor(ctx: CampaignContextValue, adventureId: Id, seed = "s1") {
  const procedure = ctx.module.procedure("alien.agendas")!;
  const docText = (id: Id) => plainText(ctx.registry.open(id));
  const inputs = initialInputs(procedure, ctx.store, ctx.module, { docText, picked: pickedInputs(procedure, ctx.store, `adventure:${adventureId}`, docText) });
  const graph = runGenerator(ctx.module, { procedureId: procedure.id, seed, inputs });
  return { inputs, graph, drafts: agendaDraftsOf(graph)! };
}

describe("agenda drafts in the app", () => {
  it("fills the inputs from the campaign and the adventure, and its PCs only", async () => {
    const { ctx, ada, bo, adventureId } = await setup();
    const { inputs, drafts } = draftsFor(ctx, adventureId);
    const campaign = inputs.campaign as CampaignSnapshot;
    expect(campaign.entities.map((e) => e.name)).toEqual(expect.arrayContaining(["Ada Rook", "Bo Lantern", "Dr. Imre Vas"]));
    expect(campaign.relationships).toEqual([{ type: "rival_of", from: ada.id, to: bo.id }]);
    const adventure = inputs.adventure as AdventureSnapshot;
    expect(adventure).toMatchObject({ id: adventureId, title: "Long Night", premise: "A prototype sample is missing.", situation: "Dr. Imre Vas took the sample." });
    expect((inputs.pcs as Array<{ id: string; arc: string }>).map((p) => [p.id, p.arc])).toEqual([
      [ada.id, "random"],
      [bo.id, "random"],
    ]);
    expect(drafts.characters.map((c) => c.name)).toEqual(["Ada Rook", "Bo Lantern"]);
    expect(drafts.characters.every((c) => c.acts.length === 3 && c.acts.every((a) => a.text.includes("Story Point:")))).toBe(true);
  });

  it("asks before replacing text the GM wrote, then writes the sheets and the agenda cards", async () => {
    const { ctx, ada, bo, adventureId } = await setup();
    const { graph, drafts } = draftsFor(ctx, adventureId);
    // the GM already wrote Ada's Act 1 card and Bo's Act 2 on his sheet
    const adventure = ctx.store.get("adventures", adventureId)!;
    const act1 = adventureActs(ctx.store, adventure)[0]!;
    const byAct = ensureAgendas(ctx.store, adventureId, ada.id);
    fromMarkdown(ctx.registry.open(byAct[act1.id]!.bodyDoc!), "Mine: open the inner lock.");
    ctx.store.update("entities", bo.id, { fields: { ...ctx.store.get("entities", bo.id)!.fields, agendas: [{ act: 2, text: "Mine: keep Ada talking." }] } });

    // the GM's edit wins over the draft
    const edits = { [editKey(bo.id, 3)]: "Bo's own last act." };
    const writes = agendaWrites(drafts, edits);
    expect(writes.find((w) => w.characterId === bo.id)!.acts.find((a) => a.act === 3)!.text).toBe("Bo's own last act.");

    const overwrites = await agendaOverwrites(ctx, { adventureId, field: drafts.field, writes });
    expect(overwrites.map((o) => [o.name, o.act, o.where, o.current])).toEqual([
      ["Ada Rook", 1, "card", "Mine: open the inner lock."],
      ["Bo Lantern", 2, "sheet", "Mine: keep Ada talking."],
    ]);

    // fill only the empty ones: the GM's text stays
    const kept = await acceptAgendaDrafts(ctx, { adventureId, field: drafts.field, writes, keepExisting: true, graph, partSeeds: { "slots/x/allegiance": "r" } });
    expect(kept.kept).toBe(2);
    expect(plainText(ctx.registry.open(agendaFor(ctx.store, act1, ada.id)!.bodyDoc!))).toBe("Mine: open the inner lock.");
    const boRows = agendaRows(ctx.store.get("entities", bo.id), "agendas");
    expect(boRows.map((r) => r.act)).toEqual([1, 2, 3]);
    expect(boRows[1]!.text).toBe("Mine: keep Ada talking.");
    expect(boRows[2]!.text).toBe("Bo's own last act.");
    expect(agendaRows(ctx.store.get("entities", ada.id), "agendas").map((r) => r.text)).toEqual(drafts.characters[0]!.acts.map((a) => a.text));
    // the run is recorded with its re-rolled slots
    expect(ctx.store.get("generatorRuns", kept.run!.id)).toMatchObject({ procedure: "alien.agendas", produced: [], partSeeds: { "slots/x/allegiance": "r" } });

    // replace: the drafts win everywhere, and the agenda cards print them
    const replaced = await acceptAgendaDrafts(ctx, { adventureId, field: drafts.field, writes, keepExisting: false });
    expect(replaced.kept).toBe(0);
    expect(agendaRows(ctx.store.get("entities", bo.id), "agendas")[1]!.text).toBe(writes[1]!.acts[1]!.text);
    const cards = await agendaCards(ctx, adventureId);
    const adaAct1 = cards.find((c) => c.character === "Ada Rook" && c.actNumber === 1)!;
    expect(adaAct1.body.replace(/\\/g, "")).toBe(drafts.characters[0]!.acts[0]!.text);
    expect(cards.filter((c) => c.character === "Bo Lantern")).toHaveLength(3);
    expect(await agendaOverwrites(ctx, { adventureId, field: drafts.field, writes })).toEqual([]);
  });

  it("skips placeholder characters and works without an adventure", async () => {
    const id = await createCampaign({ name: "Empty", moduleId: "alien", mode: "cinematic" });
    const ctx = await openCampaign(id);
    opened.push(ctx.close);
    const procedure = ctx.module.procedure("alien.agendas")!;
    const graph = runGenerator(ctx.module, { procedureId: procedure.id, seed: "x", inputs: initialInputs(procedure, ctx.store, ctx.module) });
    const drafts = agendaDraftsOf(graph) as AgendaDraftSet;
    expect(drafts.characters.map((c) => c.name)).toEqual(["PC 1", "PC 2", "PC 3", "PC 4"]);
    expect(agendaWrites(drafts, {})).toEqual([]);
  });
});
