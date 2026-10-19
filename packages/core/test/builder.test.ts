import { runAdventureReview, type AdventureBuilderDef, type GameModule } from "@campaign-forge/module-sdk";
import { describe, expect, it } from "vitest";
import {
  RichTextRegistry,
  addToCast,
  adventureReviewContext,
  castMembers,
  createCastMember,
  ensureAgendas,
  fromMarkdown,
  moveInCast,
  narrativeComputed,
  narrativeDefaults,
  narrativeField,
  removeFromCast,
  reviewDocIds,
  setNarrativeField,
} from "../src";
import { fixtureModule, newStore } from "./fixtures";

const builder: AdventureBuilderDef = {
  id: "example.builder",
  name: "Builder",
  cast: [
    { id: "pcs", label: "PCs", entityType: "example.person", defaults: { role: "hero", "stats.grit": 3 }, fields: ["role"] },
    { id: "towns", label: "Towns", entityType: "example.place", subtype: "town" },
  ],
  steps: [
    { id: "basics", title: "Basics", panels: [{ kind: "adventure", fields: ["core.title", "hook"] }] },
    { id: "cast", title: "Cast", panels: [{ kind: "cast", role: "pcs" }] },
  ],
  review: [
    { id: "hook", step: "basics", level: "bad", when: { "!": { len: { trim: { var: "adventure.fields.hook" } } } }, message: "Write the hook", okMessage: "Hook set" },
    { id: "intro", step: "basics", level: "warn", when: { "!": { endsWith: [{ trim: { var: "adventure.playerIntro" } }, "What do you do?"] } }, message: "End the intro with a question" },
    { id: "agenda", step: "cast", level: "warn", each: "pcs", when: { "<": [{ words: { var: "item.agendaByAct.1" } }, 3] }, message: "{name}: write the act 1 agenda" },
  ],
};

const module: GameModule = {
  ...fixtureModule,
  narrativeFields: [
    {
      kind: "adventure",
      schema: { type: "object", properties: { hook: { type: "string" }, hours: { type: "integer", default: 4 } } },
      sheet: { sections: [{ id: "a", title: "A", fields: [{ path: "hook" }, { path: "hours" }] }] },
      computed: { minutes: { "*": [{ var: "fields.hours" }, 60] } },
    },
    { kind: "scene", schema: { type: "object", properties: { trigger: { type: "string" } } }, sheet: { sections: [] } },
  ],
  adventureBuilders: [builder],
};

/** A registry whose docs load their "stored" content asynchronously, like IndexedDB persistence. */
function slowRegistry(stored: Record<string, string>): RichTextRegistry {
  const registry = new RichTextRegistry();
  registry.setLoader(async (id, doc) => {
    await new Promise((r) => setTimeout(r, 5));
    if (stored[id] !== undefined) fromMarkdown(doc, stored[id]);
  });
  return registry;
}

function scaffold() {
  const store = newStore();
  const adventure = store.createAdventure({ title: "Dead Air", premise: "A station goes quiet.", withDocs: true });
  const act1 = store.createAct(adventure.id, { number: 1, title: "Setup", goal: "Arrive", withPacingDoc: true });
  const act2 = store.createAct(adventure.id, { number: 2, title: "Payoff" });
  const scene = store.createScene(act1.id, { title: "Docking", tags: ["mandatory"], events: [{ id: "e1", text: "Dock", mandatory: true }] });
  store.createScene(act2.id, { title: "Escape" });
  store.update("adventures", adventure.id, { builderId: builder.id, fields: { hook: "", hours: 4 } });
  return { store, adventureId: adventure.id, act1, act2, scene };
}

describe("cast helpers", () => {
  it("create, add, move and remove cast members", () => {
    const { store, adventureId } = scaffold();
    const ada = createCastMember(store, module, adventureId, builder.cast[0]!, "Ada");
    expect(ada.type).toBe("example.person");
    expect(ada.fields).toEqual({ role: "hero", stats: { grit: 3 } });
    const town = createCastMember(store, module, adventureId, builder.cast[1]!, "");
    expect(town.subtype).toBe("town");
    expect(town.name).toBe("New town");

    const bo = store.createEntity({ type: "example.person", name: "Bo" });
    addToCast(store, adventureId, "pcs", bo.id);
    addToCast(store, adventureId, "pcs", bo.id);
    expect(store.get("adventures", adventureId)?.cast).toEqual({ pcs: [ada.id, bo.id], towns: [town.id] });
    moveInCast(store, adventureId, "pcs", bo.id, -1);
    expect(castMembers(store, adventureId, "pcs").map((e) => e.name)).toEqual(["Bo", "Ada"]);

    removeFromCast(store, adventureId, "pcs", bo.id);
    expect(store.get("adventures", adventureId)?.cast?.pcs).toEqual([ada.id]);
    expect(store.has("entities", bo.id)).toBe(true);
    // A deleted entity drops out of the members list.
    store.remove("entities", ada.id);
    expect(castMembers(store, adventureId, "pcs")).toEqual([]);
  });

  it("ensures one agenda per act, claiming an unassigned slot first", () => {
    const { store, adventureId, act1, act2 } = scaffold();
    const slot = store.createHandout({ title: "Agenda slot", kind: "agenda", attachedTo: { kind: "act", id: act1.id } });
    store.update("acts", act1.id, { handouts: [slot.id] });
    const ada = createCastMember(store, module, adventureId, builder.cast[0]!, "Ada");
    const agendas = ensureAgendas(store, adventureId, ada.id);
    expect(agendas[act1.id]?.id).toBe(slot.id);
    expect(agendas[act1.id]?.character).toBe(ada.id);
    expect(agendas[act2.id]).toMatchObject({ kind: "agenda", character: ada.id, title: "Ada: Act 2 agenda", attachedTo: { kind: "act", id: act2.id } });
    expect(store.get("acts", act2.id)?.handouts).toEqual([agendas[act2.id]?.id]);
    // Idempotent.
    const again = ensureAgendas(store, adventureId, ada.id);
    expect(Object.values(again).map((h) => h.id)).toEqual(Object.values(agendas).map((h) => h.id));
    expect(store.list("handouts")).toHaveLength(2);
  });
});

describe("narrative fields", () => {
  it("reads, writes, defaults and computes", () => {
    const { store, adventureId, scene } = scaffold();
    setNarrativeField(store, "adventure", adventureId, "hours", 2);
    setNarrativeField(store, "scene", scene.id, "trigger", "The lights fail");
    expect(narrativeField(store.get("adventures", adventureId), "hours")).toBe(2);
    expect(store.get("scenes", scene.id)?.fields).toEqual({ trigger: "The lights fail" });
    expect(narrativeComputed(module, "adventure", "default", store.get("adventures", adventureId)?.fields)).toEqual({ minutes: 120 });
    expect(narrativeComputed(module, "act", "default", {})).toEqual({});
    expect(narrativeDefaults(module, "adventure")).toEqual({ hours: 4 });
  });
});

describe("adventureReviewContext", () => {
  it("waits for docs and exposes plain text, acts, scenes, cast and handouts", async () => {
    const { store, adventureId, act1, scene } = scaffold();
    const ada = createCastMember(store, module, adventureId, builder.cast[0]!, "Ada");
    const agendas = ensureAgendas(store, adventureId, ada.id);
    const adv = store.get("adventures", adventureId)!;
    const registry = slowRegistry({
      [adv.playerIntroDoc!]: "You wake to **alarms**. What do you do?",
      [adv.gmSituationDoc!]: "The android did it.",
      [act1.pacingDoc!]: "Slow burn.",
      [scene.bodyDoc]: "The airlock cycles.",
      [agendas[act1.id]!.bodyDoc!]: "Find the black box first",
    });
    expect(registry.ids()).toEqual([]);

    const ctx = await adventureReviewContext(store, registry, module, adventureId, { roles: builder.cast.map((r) => r.id) });
    expect(reviewDocIds(store, adventureId).every((id) => registry.has(id))).toBe(true);
    const adventure = ctx.adventure as Record<string, unknown>;
    expect(adventure).toMatchObject({ title: "Dead Air", premise: "A station goes quiet.", status: "planned", builderId: "example.builder", playerIntro: "You wake to alarms. What do you do?", gmSituation: "The android did it.", epilogue: "", fields: { hook: "", hours: 4 }, computed: { minutes: 240 } });

    const acts = ctx.acts as Array<Record<string, unknown>>;
    expect(acts.map((a) => [a.number, a.title, a.goal, a.pacing, a.sceneCount, a.mandatoryCount])).toEqual([
      [1, "Setup", "Arrive", "Slow burn.", 1, 1],
      [2, "Payoff", "", "", 1, 0],
    ]);
    const scenes = ctx.scenes as Array<Record<string, unknown>>;
    expect(scenes.map((s) => [s.title, s.mandatory, s.act, s.body])).toEqual([
      ["Docking", true, 1, "The airlock cycles."],
      ["Escape", false, 2, ""],
    ]);
    expect((acts[0]!.scenes as unknown[])[0]).toEqual(scenes[0]);

    const pcs = ctx.pcs as Array<Record<string, unknown>>;
    expect(ctx.cast).toEqual({ pcs, towns: [] });
    expect(pcs[0]).toMatchObject({ id: ada.id, name: "Ada", type: "example.person", fields: { role: "hero" }, agendaByAct: { "1": "Find the black box first", "2": "" } });
    expect((pcs[0]!.agendas as unknown[]).length).toBe(2);
    const handouts = ctx.handouts as Array<Record<string, unknown>>;
    expect(handouts.map((h) => [h.kind, h.characterName, h.act])).toEqual([
      ["agenda", "Ada", 1],
      ["agenda", "Ada", 2],
    ]);

    const result = runAdventureReview(builder, ctx);
    expect(result.items.map((i) => [i.level, i.message])).toEqual([["bad", "Write the hook"]]);
    expect(result.byStep).toEqual({ basics: "bad", cast: "ok" });

    setNarrativeField(store, "adventure", adventureId, "hook", "Someone jammed the beacon");
    const again = runAdventureReview(builder, await adventureReviewContext(store, registry, module, adventureId));
    expect(again.items.map((i) => [i.level, i.message])).toEqual([["ok", "Hook set"]]);
  });
});
