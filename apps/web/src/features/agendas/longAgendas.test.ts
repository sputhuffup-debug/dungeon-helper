import "fake-indexeddb/auto";
import { LONG_AGENDA_FRICTION_PURPOSE, LONG_AGENDA_PURPOSE, longAgendaHandoutsOf, plainText, playerShareSnapshot, projectCampaignForViewer, type Id } from "@campaign-forge/core";
import { afterEach, describe, expect, it } from "vitest";
import { createCampaign } from "../../state/actions";
import { openCampaign, type CampaignContextValue } from "../../state/CampaignProvider";
import { acceptLongAgendaDrafts, charactersWithLongAgendas, longAgendaDraftsOf, longAgendaProcedureOf, nextJobLabel, runNextBeats, setTension } from "../../state/longAgendaActions";
import { initialInputs } from "../generate/prefill";
import { runGenerator } from "../generate/runner";

const opened: Array<() => void> = [];
afterEach(() => {
  while (opened.length) opened.pop()?.();
});

async function setup(mode = "campaign", count = 3) {
  const id = await createCampaign({ name: "Long haul", moduleId: "alien", mode });
  const ctx: CampaignContextValue = await openCampaign(id);
  opened.push(ctx.close);
  const s = ctx.store;
  const pcs = ["Ada Rook", "Bo Lantern", "Cy Varga"].slice(0, count).map((name) => s.createEntity({ type: "alien.character", name, fields: { isPC: true, personalAgenda: "" }, visibility: { level: "players" } }));
  if (pcs[1]) s.createRelationship("buddy_of", pcs[0]!.id, pcs[1].id);
  // the GM's secret NPC and secret employer; one NPC the players know
  s.createEntity({ type: "alien.character", name: "Vesna Kroll", fields: { isPC: false }, visibility: { level: "gm" } });
  s.createEntity({ type: "alien.character", name: "Tobin Ash", fields: { isPC: false }, visibility: { level: "players" } });
  const corp = s.createEntity({ type: "alien.faction", name: "Orrin Salvage", fields: { factionType: "corporation" }, visibility: { level: "gm" } });
  const job = s.createEntity({ type: "alien.job", name: "Tow the wreck", fields: { employer: "Orrin Salvage" }, visibility: { level: "players" } });
  s.createRelationship("employer_of", corp.id, job.id);
  return { ctx, pcs };
}

function deal(ctx: CampaignContextValue, seed = "deal") {
  const procedure = longAgendaProcedureOf(ctx.module, "campaign")!;
  const inputs = initialInputs(procedure, ctx.store, ctx.module);
  const graph = runGenerator(ctx.module, { procedureId: procedure.id, seed, inputs });
  return { procedure, graph, set: longAgendaDraftsOf(graph)! };
}

const recordOf = (ctx: CampaignContextValue, id: Id) => ctx.store.get("entities", id)!.fields.campaignAgenda as { goal: { text: string }; beat: { text: string; job?: string }; tension: number; history: unknown[] };

describe("long-term agendas in the app", () => {
  it("is offered in campaign mode only", async () => {
    const { ctx } = await setup("cinematic");
    expect(longAgendaProcedureOf(ctx.module, "cinematic")).toBeUndefined();
    expect(longAgendaProcedureOf(ctx.module, "campaign")?.id).toBe("alien.campaign-agendas");
  });

  it("accept: writes the goal onto the sheet, a GM-only agenda handout and a players' friction handout per PC, and nothing GM-only reaches the players", async () => {
    const { ctx, pcs } = await setup();
    const { procedure, graph, set } = deal(ctx);
    expect(set.characters.map((c) => c.name).sort()).toEqual(["Ada Rook", "Bo Lantern", "Cy Varga"]);
    const ada = set.characters.find((c) => c.name === "Ada Rook")!;
    const res = await acceptLongAgendaDrafts(ctx, { def: procedure.longAgendas, set, graph, edits: { [ada.id]: { beat: "Fix the coffee machine before anyone notices." } } });
    expect(res.written).toHaveLength(3);
    expect(res.run?.procedure).toBe("alien.campaign-agendas");
    for (const pc of pcs) {
      const e = ctx.store.get("entities", pc.id)!;
      const r = recordOf(ctx, pc.id);
      expect(e.fields.personalAgenda).toBe(r.goal.text);
      const h = longAgendaHandoutsOf(ctx.store, pc.id);
      expect(h.agenda).toMatchObject({ kind: "agenda", purpose: LONG_AGENDA_PURPOSE, visibility: { level: "gm" }, character: pc.id });
      expect(h.friction).toMatchObject({ kind: "text", purpose: LONG_AGENDA_FRICTION_PURPOSE, visibility: { level: "players" }, character: pc.id });
      expect(plainText(ctx.registry.open(h.agenda!.bodyDoc!))).toContain(r.beat.text);
    }
    expect(recordOf(ctx, ada.id).beat.text).toBe("Fix the coffee machine before anyone notices.");

    const view = projectCampaignForViewer(ctx.store.toJSON(), ctx.module.module, { role: "player" });
    expect(Object.values(view.handouts).map((h) => h.purpose)).toEqual([LONG_AGENDA_FRICTION_PURPOSE, LONG_AGENDA_FRICTION_PURPOSE, LONG_AGENDA_FRICTION_PURPOSE]);
    for (const pc of pcs) {
      expect(view.entities[pc.id]!.fields.campaignAgenda).toBeUndefined();
      expect(view.entities[pc.id]!.fields.personalAgenda).toBeUndefined();
    }
  });

  it("friction handouts, the player view and a share never name the GM-only NPC or employer, for one PC or a crew", async () => {
    for (const count of [1, 3]) {
      for (const seed of ["a", "b", "c", "d", "e", "f"]) {
        const { ctx, pcs } = await setup("campaign", count);
        const { procedure, graph, set } = deal(ctx, `${seed}-${count}`);
        await acceptLongAgendaDrafts(ctx, { def: procedure.longAgendas, set, graph });
        const texts = pcs.map((pc) => plainText(ctx.registry.open(longAgendaHandoutsOf(ctx.store, pc.id).friction!.bodyDoc!)));
        for (const t of texts) {
          expect(t).not.toContain("Vesna Kroll");
          expect(t).not.toContain("Orrin Salvage");
        }
        const session = ctx.store.createSession({ number: 1, title: "One" });
        const share = playerShareSnapshot({ maps: ctx.store.toJSON(), module: ctx.module.module, sessionId: session.id, at: "2026-11-07T20:00:00Z", doc: (id) => ctx.registry.open(id) });
        const shared = JSON.stringify(share.handouts);
        expect(share.handouts).toHaveLength(count);
        expect(shared).not.toContain("Vesna Kroll");
        expect(shared).not.toContain("Orrin Salvage");
        const view = projectCampaignForViewer(ctx.store.toJSON(), ctx.module.module, { role: "player" });
        expect(Object.values(view.handouts).every((h) => h.purpose === LONG_AGENDA_FRICTION_PURPOSE)).toBe(true);
      }
    }
  });

  it("after a job: a stall deals the next beat and raises the tension; the handouts follow; unmarked PCs stay as they are", async () => {
    const { ctx, pcs } = await setup();
    const { procedure, graph, set } = deal(ctx);
    await acceptLongAgendaDrafts(ctx, { def: procedure.longAgendas, set, graph });
    const [ada, bo] = pcs as [(typeof pcs)[number], (typeof pcs)[number]];
    const before = recordOf(ctx, ada.id);
    const boBefore = recordOf(ctx, bo.id);
    expect(charactersWithLongAgendas(ctx, procedure.longAgendas)).toHaveLength(3);
    const job = nextJobLabel(procedure.longAgendas, charactersWithLongAgendas(ctx, procedure.longAgendas));
    const next = runNextBeats(ctx, procedure, { outcomes: { [ada.id]: "stalled" }, jobLabel: job, seed: "job" });
    const nextSet = longAgendaDraftsOf(next)!;
    expect(nextSet.stage).toBe("next");
    const changed = { ...nextSet, characters: nextSet.characters.filter((c) => c.id === ada.id) };
    await acceptLongAgendaDrafts(ctx, { def: procedure.longAgendas, set: changed, graph: next });
    const after = recordOf(ctx, ada.id);
    expect(after.tension).toBe(before.tension + 1);
    expect(after.beat.text).not.toBe(before.beat.text);
    expect(after.history).toHaveLength(1);
    expect(recordOf(ctx, bo.id)).toEqual(boBefore);
    const agenda = longAgendaHandoutsOf(ctx.store, ada.id).agenda!;
    expect(plainText(ctx.registry.open(agenda.bodyDoc!))).toContain("Quiet disagreement");

    // the GM cools it down by hand
    await setTension(ctx, procedure.longAgendas, ada.id, 0);
    expect(recordOf(ctx, ada.id).tension).toBe(0);
    expect(plainText(ctx.registry.open(agenda.bodyDoc!))).toContain("Calm");
  });
});
