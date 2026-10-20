import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import type { EntityTypeDef, ProgressionDef } from "@campaign-forge/module-sdk";
import {
  RichTextRegistry,
  adjustPool,
  advancementLog,
  advancementTotals,
  applyEffects,
  applySpend,
  exportBundle,
  importBundle,
  lastSpendUndo,
  postAward,
  projectCampaignForViewer,
  quoteCharacterSpend,
  sessionAdvancement,
  spendPoints,
  undoLastSpend,
  type AdvancementModule,
} from "../src";
import { newStore } from "./fixtures";

const HERO: EntityTypeDef = {
  id: "x.hero",
  kind: "character",
  name: "Hero",
  plural: "Heroes",
  schema: {
    type: "object",
    properties: {
      pc: { type: "boolean" },
      xp: { type: "integer", minimum: 0 },
      luck: { type: "integer", minimum: 0, maximum: 2 },
      skills: { type: "object", properties: { sword: { type: "integer" }, bow: { type: "integer" } } },
      feats: { type: "array", items: { type: "object" } },
    },
  },
  sheet: { sections: [{ id: "s", title: "S", fields: [{ path: "xp" }] }] },
};

const progression: ProgressionDef = {
  entities: [{ type: "x.hero", when: { "==": [{ var: "fields.pc" }, true] } }],
  experience: { path: "xp", label: "XP" },
  storyPoints: { path: "luck", label: "Luck", max: 2, earn: [{ text: "Be bold." }], uses: [{ id: "x.reroll", label: "Re-roll", text: "Roll again." }], carryOver: { max: 1, text: "Keep one." } },
  awards: [
    { id: "x.came", text: "Came", page: 1 },
    { id: "x.won", text: "Won", amount: 2, page: 1 },
    { id: "x.bold", text: "Bold", pool: "story", timing: "act", page: 1 },
  ],
  spends: [
    { id: "x.skill", label: "Train", target: { kind: "level", path: "skills", keys: ["sword", "bow"], max: 3 }, cost: { "*": [{ var: "to" }, 2] }, page: 1 },
    { id: "x.feat", label: "Feat", target: { kind: "pick", path: "feats", ref: "x.feats" }, cost: 3, page: 1, checks: [{ level: "confirm", ok: { ">": [{ var: "count" }, 0] }, message: "Mentor?" }] },
  ],
};

const module: AdvancementModule = { entityTypes: [HERO], referenceLists: [{ id: "x.feats", name: "Feats", items: [{ id: "tough", name: "Tough", maxStack: 2 } as never] }], progression };

function setup() {
  const store = newStore();
  const hero = store.createEntity({ type: "x.hero", name: "Aud", fields: { pc: true, xp: 0, luck: 0, skills: { sword: 1, bow: 0 }, feats: [] } });
  const npc = store.createEntity({ type: "x.hero", name: "Guard", fields: { pc: false, xp: 0 } });
  const session = store.createSession({ title: "One" });
  return { store, hero, npc, session };
}

const fields = (store: ReturnType<typeof newStore>, id: string) => store.get("entities", id)!.fields;

describe("advancement log", () => {
  it("posts an award per pool, moves the pool and logs the questions", () => {
    const { store, hero, session } = setup();
    const entries = postAward(store, module, { character: hero.id, questions: ["x.came", "x.won", "x.bold"], session: session.id, source: { kind: "wrap-up" } });
    expect(entries.map((e) => [e.pool, e.amount, e.questions])).toEqual([
      ["experience", 3, ["x.came", "x.won"]],
      ["story", 1, ["x.bold"]],
    ]);
    expect(entries[0]!.reason).toBe("Came / Won");
    expect(fields(store, hero.id).xp).toBe(3);
    expect(fields(store, hero.id).luck).toBe(1);
    expect(sessionAdvancement(store, session.id)).toHaveLength(2);
  });

  it("caps a pool at its maximum and records what was lost to the cap", () => {
    const { store, hero } = setup();
    postAward(store, module, { character: hero.id, amount: 2, pool: "story" });
    const [e] = postAward(store, module, { character: hero.id, amount: 1, pool: "story" });
    expect(e).toMatchObject({ amount: 0, capped: 1 });
    expect(fields(store, hero.id).luck).toBe(2);
  });

  it("is idempotent per key and refuses characters who do not advance", () => {
    const { store, hero, npc } = setup();
    postAward(store, module, { character: hero.id, questions: ["x.bold"], key: "act:1:aud" });
    postAward(store, module, { character: hero.id, questions: ["x.bold"], key: "act:1:aud" });
    expect(fields(store, hero.id).luck).toBe(1);
    expect(advancementLog(store, hero.id)).toHaveLength(1);
    expect(() => postAward(store, module, { character: npc.id, amount: 1 })).toThrow(/does not advance/);
    expect(() => postAward(store, module, { character: hero.id, questions: ["nope"] })).toThrow(/unknown award/);
  });

  it("spends points at the table and refuses to go below zero", () => {
    const { store, hero, session } = setup();
    postAward(store, module, { character: hero.id, amount: 1, pool: "story" });
    const spent = spendPoints(store, module, { character: hero.id, pool: "story", use: "x.reroll", session: session.id, source: { kind: "table" } });
    expect(spent).toMatchObject({ kind: "spend", amount: -1, reason: "Re-roll", use: "x.reroll" });
    expect(fields(store, hero.id).luck).toBe(0);
    expect(() => spendPoints(store, module, { character: hero.id, pool: "story" })).toThrow(/has 0 Luck/);
  });

  it("buys a skill step: sheet, pool and log in one go; then undoes it", () => {
    const { store, hero } = setup();
    postAward(store, module, { character: hero.id, amount: 10 });
    expect(quoteCharacterSpend(store, module, { character: hero.id, option: "x.skill", target: "sword" })).toMatchObject({ from: 1, to: 2, cost: 4, balanceAfter: 6 });
    const { entry } = applySpend(store, module, { character: hero.id, option: "x.skill", target: "sword" });
    expect(entry).toMatchObject({ kind: "spend", amount: -4, spend: { option: "x.skill", target: "sword", from: 1, to: 2, cost: 4 } });
    expect(fields(store, hero.id)).toMatchObject({ xp: 6, skills: { sword: 2, bow: 0 } });
    expect(advancementTotals(store, hero.id).experience).toEqual({ earned: 10, spent: 4, adjusted: 0 });
    expect(lastSpendUndo(store, module, hero.id).ok).toBe(true);
    undoLastSpend(store, module, hero.id);
    expect(fields(store, hero.id)).toMatchObject({ xp: 10, skills: { sword: 1 } });
    expect(advancementTotals(store, hero.id).experience).toEqual({ earned: 10, spent: 0, adjusted: 0 });
    expect(lastSpendUndo(store, module, hero.id)).toMatchObject({ ok: false, reason: "No spend to undo" });
  });

  it("blocks spends past the cap or the pool, and needs confirmation where the rules ask for it", () => {
    const { store, hero } = setup();
    postAward(store, module, { character: hero.id, amount: 4 });
    expect(() => applySpend(store, module, { character: hero.id, option: "x.skill", target: "bow" })).not.toThrow();
    expect(() => applySpend(store, module, { character: hero.id, option: "x.skill", target: "sword" })).toThrow(/Needs 4 XP; has 2/);
    postAward(store, module, { character: hero.id, amount: 10 });
    expect(() => applySpend(store, module, { character: hero.id, option: "x.feat", target: "tough" })).toThrow(/confirm first: Mentor\?/);
    applySpend(store, module, { character: hero.id, option: "x.feat", target: "tough", confirmed: true });
    applySpend(store, module, { character: hero.id, option: "x.feat", target: "tough" });
    expect(fields(store, hero.id).feats).toEqual([{ id: "tough", count: 2 }]);
    expect(() => applySpend(store, module, { character: hero.id, option: "x.feat", target: "tough" })).toThrow(/Already taken 2 times/);
  });

  it("will not undo a spend whose target changed since", () => {
    const { store, hero } = setup();
    postAward(store, module, { character: hero.id, amount: 10 });
    applySpend(store, module, { character: hero.id, option: "x.skill", target: "sword" });
    store.update("entities", hero.id, { fields: { ...fields(store, hero.id), skills: { sword: 3, bow: 0 } } });
    expect(lastSpendUndo(store, module, hero.id)).toMatchObject({ ok: false });
    expect(() => undoLastSpend(store, module, hero.id)).toThrow(/has changed/);
  });

  it("logs adjustments such as carrying story points over", () => {
    const { store, hero } = setup();
    postAward(store, module, { character: hero.id, amount: 2, pool: "story" });
    const e = adjustPool(store, module, { character: hero.id, pool: "story", to: 1, reason: "Carry over" });
    expect(e).toMatchObject({ kind: "adjust", amount: -1 });
    expect(adjustPool(store, module, { character: hero.id, pool: "story", to: 1, reason: "again" })).toBeUndefined();
    expect(advancementTotals(store, hero.id).story).toEqual({ earned: 2, spent: 0, adjusted: -1 });
  });

  it("posts award effects from procedures and skips them without progression rules", () => {
    const { store, hero, session } = setup();
    const res = applyEffects(store, [{ kind: "award", entity: hero.id, question: "x.won", key: "k1" }, { kind: "award", entity: hero.id, question: "x.won", key: "k1" }], { advancement: module, sessionId: session.id });
    expect(res.skipped.map((s) => s.reason)).toEqual(["already awarded (k1)"]);
    expect(fields(store, hero.id).xp).toBe(2);
    expect(advancementLog(store, hero.id)[0]).toMatchObject({ session: session.id, source: { kind: "effect" } });
    expect(applyEffects(store, [{ kind: "award", entity: hero.id, amount: 1 }]).skipped[0]?.reason).toMatch(/no progression/);
  });

  it("travels in the export bundle and is projected with the entities a viewer can see", async () => {
    const { store, hero } = setup();
    postAward(store, module, { character: hero.id, amount: 5 });
    applySpend(store, module, { character: hero.id, option: "x.skill", target: "bow" });
    const bytes = await exportBundle(store, new RichTextRegistry(), undefined, { id: "x", version: "1.0.0" });
    const imported = await importBundle(bytes, { onConflict: "new-id" });
    const log = imported.store.list("advancement");
    expect(log).toHaveLength(2);
    const newHero = imported.idMap[hero.id]!;
    expect(log.every((e) => e.character === newHero)).toBe(true);
    expect(projectCampaignForViewer(store.toJSON(), module, { role: "player", memberId: "m" }).advancement).toEqual({});
  });
});
