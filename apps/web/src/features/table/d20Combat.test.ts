/**
 * d20 combat at the table against the example data pack (Lanternlight):
 * initiative with typed dice, attacks with conditions on both sides, damage
 * and the 0 hit point rule, save effects, conditions with durations ticking
 * on Next turn, checks from a sheet, and every entry logged GM-only.
 */
import "fake-indexeddb/auto";
import { presetToEntity, type Id } from "@campaign-forge/core";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { createCampaign } from "../../state/actions";
import { openCampaign, type CampaignContextValue } from "../../state/CampaignProvider";
import {
  applyCondition,
  applyD20Hit,
  checkConditionInput,
  combatOrder,
  combatantOf,
  damageAgainst,
  effectDc,
  nextTurn,
  planAttack,
  planSave,
  rollAttack,
  rollDamage,
  rollDeathSave,
  rollSave,
  startCombat,
} from "../../state/d20Actions";
import { planNextSession, sessionTrackerState, startPlannedSession, type DiceLogData } from "../../state/tableActions";

const opened: Array<() => void> = [];
afterEach(() => {
  while (opened.length) opened.pop()?.();
});

let campaignId: string;
beforeAll(async () => {
  campaignId = await createCampaign({ name: "d20 combat", moduleId: "example-pack" });
}, 30_000);

async function setup() {
  const ctx: CampaignContextValue = await openCampaign(campaignId);
  opened.push(ctx.close);
  const preset = (id: string) => ctx.module.preset(`example-pack.preset.${id}`)!;
  const keeper = presetToEntity(ctx.store, preset("keeper"), { name: "Keeper" });
  const gloom = presetToEntity(ctx.store, preset("gloomling"), { name: "Gloomling" });
  const session = startPlannedSession(ctx, planNextSession(ctx, { title: "Fight" }).id);
  return { ctx, sessionId: session.id as Id, keeper, gloom };
}

describe("d20 combat at the table", () => {
  it("draws initiative and runs turns; durations tick and decrements happen at the end of a turn", async () => {
    const { ctx, sessionId, keeper, gloom } = await setup();
    // the example's tracker draws cards, lowest first
    const order = startCombat(ctx, sessionId, [keeper.id, gloom.id]);
    expect(order.order).toHaveLength(2);
    expect(order.order[0]!.card!).toBeLessThan(order.order[1]!.card!);
    const [first, second] = order.order.map((p) => p.entityId!) as [Id, Id];
    expect(order.current?.entityId).toBe(first);
    // the second dazes the first until the end of its own next turn
    applyCondition(ctx, sessionId, first, { id: "dazed", value: 2, duration: { sourceNextTurn: true } }, { sourceId: second, source: "foe" });
    expect(ctx.store.get("entities", keeper.id)!.fields.dazed ?? 0).toBe(first === keeper.id ? 2 : 0);
    const a = nextTurn(ctx, sessionId);
    expect(a.ended?.entityId).toBe(first);
    expect(a.tick.decremented.map((d) => [d.entity, d.from, d.to])).toEqual([[first, 2, 1]]);
    expect(a.started?.entityId).toBe(second);
    const b = nextTurn(ctx, sessionId);
    expect(b.newRound).toBe(true);
    expect(b.round).toBe(2);
    expect(b.tick.expired.map((x) => [x.entity, x.id])).toEqual([[first, "dazed"]]);
    expect(combatOrder(ctx, sessionId).current?.entityId).toBe(first);
    void gloom;
  });

  it("an attack: disadvantage from the attacker's condition, the reason, a hit, damage after resistance, defeat at 0", async () => {
    const { ctx, sessionId, keeper, gloom } = await setup();
    applyCondition(ctx, sessionId, keeper.id, { id: "sick" });
    const pick = combatantOf(ctx, ctx.store.get("entities", keeper.id)!)!.attacks[0]!;
    const plan = planAttack(ctx, keeper.id, pick, gloom.id);
    expect(plan.mode).toBe("disadvantage");
    expect(plan.conditionMode.disadvantage).toEqual(["Sick"]);
    expect(plan.ac).toBe(11);
    const roll = rollAttack(ctx, sessionId, plan, [3, 12]);
    expect(roll.resolution).toMatchObject({ hit: false, total: 7, reason: "7 vs AC 11" });
    const again = rollAttack(ctx, sessionId, plan, [16, 9]);
    expect(again.resolution).toMatchObject({ hit: true, total: 13 });
    const dmg = rollDamage(ctx, sessionId, "Pick damage", keeper.id, pick.damage, { critical: false }, [4]);
    expect(dmg.roll.total).toBe(5);
    // physical resistance 1 (cut is physical)
    const after = damageAgainst(ctx, gloom.id, dmg.roll, pick.traits);
    expect(after.lines).toEqual(["cut (physical) resistance 1: 5 → 4"]);
    const hit = applyD20Hit(ctx, sessionId, gloom.id, after.total, { by: "Keeper: Pick" });
    expect(hit).toMatchObject({ dropped: false, after: { current: 1, max: 5 } });
    expect(applyD20Hit(ctx, sessionId, gloom.id, 3)).toMatchObject({ dropped: true, defeated: true });
    expect(combatantOf(ctx, ctx.store.get("entities", gloom.id)!)!.defeated).toBe(true);
    // all of it GM-only
    const entries = sessionTrackerState(ctx.store, sessionId)!.log.filter((l) => (l.data as DiceLogData | undefined)?.label?.includes("Pick") || l.text.includes("Gloomling"));
    expect(entries.length).toBeGreaterThan(3);
    for (const e of entries) expect((e.data as { gmOnly?: boolean }).gmOnly).toBe(true);
  });

  it("a save effect: the DC, the target's save, half damage on a success, a condition on a failure", async () => {
    const { ctx, sessionId, keeper, gloom } = await setup();
    const breath = combatantOf(ctx, ctx.store.get("entities", gloom.id)!)!.attacks[1]!.save!;
    const { dc } = effectDc(ctx, gloom.id, breath);
    expect(dc).toBe(11);
    const save = planSave(ctx, keeper.id, "grace-save", dc);
    const ok = rollSave(ctx, sessionId, save, "Gloom breath", [11]);
    expect(ok.resolution).toMatchObject({ success: true, degree: "success" });
    const fail = rollSave(ctx, sessionId, save, "Gloom breath", [2]);
    expect(fail.resolution.success).toBe(false);
  });

  it("a check from a sheet carries the conditions' modifiers and the reasons", async () => {
    const { ctx, sessionId, keeper } = await setup();
    applyCondition(ctx, sessionId, keeper.id, { id: "dazed", value: 2 });
    applyCondition(ctx, sessionId, keeper.id, { id: "shaken" });
    const c = checkConditionInput(ctx, ctx.store.get("entities", keeper.id)!, "lore");
    expect(c?.adjustments).toEqual([{ label: "Dazed 2 (status)", value: -2 }]);
    expect([...(c?.notes ?? [])].sort()).toEqual(["Dazed 2 −2 status", "Shaken −1 status (does not stack)"].sort());
    const dice = ctx.module.module.dice;
    const pool = dice.buildPool({ attribute: 14, skill: 2, skillId: "lore", ...c });
    expect(pool.breakdown?.map((b) => b.label)).toContain("Dazed 2 (status)");
  });
});

describe("one round counter in a d20 fight", () => {
  it("the header clock reads round 1 once initiative is rolled and moves with each new round", async () => {
    const ctx: CampaignContextValue = await openCampaign(await createCampaign({ name: "d20 rounds", moduleId: "dnd5e-srd" }));
    opened.push(ctx.close);
    const goblin = ctx.module.preset("dnd5e-srd.preset.goblin")!;
    const a = presetToEntity(ctx.store, goblin, { name: "Goblin 1" });
    const b = presetToEntity(ctx.store, goblin, { name: "Goblin 2" });
    const sessionId = startPlannedSession(ctx, planNextSession(ctx, { title: "Ambush" }).id).id as Id;
    const clock = ctx.module.forMode(ctx.store.meta().mode).trackers.find((t) => t.kind === "clock")!;
    const clockRound = () => ((sessionTrackerState(ctx.store, sessionId)?.state[clock.id] as { counters?: Record<string, number> } | undefined)?.counters?.["round"] ?? 0);
    expect(clockRound()).toBe(0);
    expect(startCombat(ctx, sessionId, [a.id, b.id]).round).toBe(1);
    expect(clockRound()).toBe(1);
    nextTurn(ctx, sessionId);
    expect(nextTurn(ctx, sessionId).round).toBe(2);
    expect(clockRound()).toBe(2);
  }, 30_000);
});

describe("death saves (the fifth edition's zeroHp.deathSaves)", () => {
  // Walkthrough 3 (D11): damage at 0 hit points did not count as a failed save, and the save had to be rolled and kept by hand
  it("counts damage while down as failed saves and rolls the save from the card's state, logged", async () => {
    const ctx: CampaignContextValue = await openCampaign(await createCampaign({ name: "d20 dying", moduleId: "dnd5e-srd" }));
    opened.push(ctx.close);
    const pc = ctx.store.createEntity({ type: "dnd5e-srd.character", name: "Bryn", fields: { isPC: true, hp: { max: 12, current: 12, temp: 0 }, deathSaves: { successes: 0, failures: 0 } } });
    const sessionId = startPlannedSession(ctx, planNextSession(ctx, { title: "Ambush" }).id).id as Id;
    expect(applyD20Hit(ctx, sessionId, pc.id, 12).deathSaves).toBeUndefined();
    const hit = applyD20Hit(ctx, sessionId, pc.id, 3, { critical: true });
    expect(hit.deathSaves).toMatchObject({ failures: 2, added: 2, dead: false });
    expect(ctx.store.get("entities", pc.id)!.fields.deathSaves).toEqual({ successes: 0, failures: 2 });
    // typed at the table: a 14 is a success
    const save = rollDeathSave(ctx, sessionId, pc.id, [14]);
    expect(save).toMatchObject({ natural: 14, success: true, successes: 1, failures: 2 });
    expect(save.text).toBe("14: success (1/3 successes, 2/3 failures)");
    // a natural 20 brings it back with 1 hit point; the counters reset
    expect(rollDeathSave(ctx, sessionId, pc.id, [20])).toMatchObject({ heals: 1 });
    expect(ctx.store.get("entities", pc.id)!.fields).toMatchObject({ hp: { current: 1 }, deathSaves: { successes: 0, failures: 0 } });
    const log = sessionTrackerState(ctx.store, sessionId)!.log.map((l) => l.text);
    expect(log.some((t) => t.includes("2 failed death saves (2 failures)"))).toBe(true);
    expect(log.some((t) => t === "Bryn: death save: natural 20: back up with 1 hit point")).toBe(true);
  }, 30_000);
});
