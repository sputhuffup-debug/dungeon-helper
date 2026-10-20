import { describe, expect, it } from "vitest";
import {
  advances,
  awardQuestions,
  awardTotals,
  evaluateAwards,
  fieldsAfterSpend,
  progressionFor,
  progressionPool,
  quoteSpend,
  quoteSpendTargets,
  spendOptions,
  type AwardContext,
  type SpendOptionDef,
} from "@campaign-forge/module-sdk";
import alienModule, { ACT_AGENDA_AWARD, SKILL_SPEND, STORY_POINT_SUCCESS, TALENT_SPEND, XP_QUESTIONS, progression } from "../src";

const ctx = { referenceList: (id: string) => alienModule.referenceLists.find((l) => l.id === id), mode: "campaign" };
const option = (id: string): SpendOptionDef => progression.spends.find((o) => o.id === id)!;
const skills = (over: Record<string, number> = {}) => ({ heavyMachinery: 0, closeCombat: 0, stamina: 0, rangedCombat: 0, mobility: 0, piloting: 0, observation: 0, survival: 0, comtech: 0, manipulation: 0, command: 0, medicalAid: 0, ...over });
const pc = (over: Record<string, unknown> = {}) => ({ isPC: true, career: "roughneck", xp: 40, skills: skills({ heavyMachinery: 2, stamina: 3 }), talents: [{ id: "true-grit" }], ...over });

function awardCtx(fields: Record<string, unknown>, extra: Partial<AwardContext> = {}): AwardContext {
  return { mode: "campaign", character: { id: "pc1", name: "Nat", type: "alien.character", fields }, computed: {}, relationships: {}, trackerState: {}, ...extra };
}

describe("pools (p. 30, 44, 158)", () => {
  it("keeps XP for campaign play and Story Points (max 3) for cinematic play", () => {
    expect(progressionPool(progression, "experience", "campaign")).toMatchObject({ path: "xp", label: "XP", page: 30, spendWhen: "between-sessions" });
    expect(progressionPool(progression, "experience", "cinematic")).toBeUndefined();
    expect(progressionPool(progression, "story", "cinematic")).toMatchObject({ path: "storyPoints", max: 3, page: 44 });
    expect(progressionPool(progression, "story", "campaign")).toBeUndefined();
    expect(progressionFor(alienModule.progression, "campaign")).toBe(progression);
  });

  it("advances PCs only", () => {
    expect(advances(progression, { type: "alien.character", fields: { isPC: true } })).toBe(true);
    expect(advances(progression, { type: "alien.character", fields: { isPC: false } })).toBe(false);
    expect(advances(progression, { type: "alien.creature", fields: {} })).toBe(false);
  });

  it("spends a Story Point on one base die, before or after a push (p. 44), and carries one over (p. 158)", () => {
    const sp = progression.storyPoints!;
    expect(sp.uses).toEqual([expect.objectContaining({ id: STORY_POINT_SUCCESS, cost: 1, operation: "storyPoint", push: "any", page: 44 })]);
    expect(alienModule.dice.operations?.storyPoint).toBeDefined();
    expect(sp.carryOver).toMatchObject({ max: 1, page: 158 });
  });
});

describe("award checklist", () => {
  it("asks the nine campaign questions at session end, one XP each (p. 30)", () => {
    const qs = awardQuestions(progression, "campaign", "session");
    expect(qs.map((q) => q.id.replace("alien.award.", ""))).toEqual(["participated", "agenda", "buddy", "rival", "panic", "danger", "discovery", "extraordinary", "money"]);
    expect(qs.every((q) => (q.amount ?? 1) === 1 && (q.pool ?? "experience") === "experience")).toBe(true);
    expect(XP_QUESTIONS).toHaveLength(9);
    expect(awardTotals(qs, qs.map((q) => q.id))).toEqual({ experience: 9, story: 0 });
    expect(awardTotals(qs, ["alien.award.participated", "alien.award.money", "nope"])).toEqual({ experience: 2, story: 0 });
    expect(awardQuestions(progression, "cinematic", "session")).toEqual([]);
  });

  it("ticks attendance, suggests the panic question from the session's panic log, and marks questions that do not apply", () => {
    const qs = awardQuestions(progression, "campaign");
    const rows = evaluateAwards(qs, awardCtx({ isPC: true, personalAgenda: "" }, { trackerState: { "alien.stress": { panicLog: [{ entity: "pc1", total: 6 }] } } }));
    const row = (id: string) => rows.find((r) => r.question.id === `alien.award.${id}`)!;
    expect(row("participated")).toMatchObject({ ticked: true, suggested: false });
    expect(row("panic")).toMatchObject({ ticked: true, suggested: true });
    expect(row("agenda")).toMatchObject({ applies: false, reason: "No personal agenda on the sheet", ticked: false });
    expect(row("buddy").applies).toBe(false);
    expect(row("danger")).toMatchObject({ applies: true, ticked: false });
    const withBuddy = evaluateAwards(qs, awardCtx({ isPC: true, personalAgenda: "Pay off the debt" }, { relationships: { buddy_of: 1 } }));
    expect(withBuddy.find((r) => r.question.id === "alien.award.buddy")?.applies).toBe(true);
    expect(withBuddy.find((r) => r.question.id === "alien.award.agenda")?.applies).toBe(true);
    expect(withBuddy.find((r) => r.question.id === "alien.award.panic")?.ticked).toBe(false);
  });

  it("awards one Story Point per act in cinematic play (p. 158) and one XP for a week of shore leave on the agenda (p. 257)", () => {
    const act = awardQuestions(progression, "cinematic", "act");
    expect(act.map((q) => q.id)).toEqual([ACT_AGENDA_AWARD]);
    expect(awardTotals(act, [ACT_AGENDA_AWARD])).toEqual({ experience: 0, story: 1 });
    const downtime = awardQuestions(progression, "campaign", "downtime");
    expect(downtime.map((q) => [q.id, q.page])).toEqual([["alien.award.shore-leave-agenda", 257]]);
  });
});

describe("spending XP (p. 30)", () => {
  it("costs the new skill level × 5, one step at a time", () => {
    const opt = option(SKILL_SPEND);
    const fields = pc();
    expect(quoteSpend(progression, opt, fields, "heavyMachinery", ctx)).toMatchObject({ from: 2, to: 3, cost: 15, balance: 40, balanceAfter: 25, blocked: [], confirm: [], page: 30, label: "Heavy Machinery" });
    expect(quoteSpend(progression, opt, fields, "stamina", ctx)).toMatchObject({ from: 3, to: 4, cost: 20 });
    expect(quoteSpend(progression, opt, pc({ skills: skills({ stamina: 4 }) }), "stamina", ctx)).toMatchObject({ to: 5, cost: 25 });
  });

  it("caps skills at level 5 (p. 26) and refuses a spend the pool cannot cover", () => {
    const opt = option(SKILL_SPEND);
    expect(quoteSpend(progression, opt, pc({ skills: skills({ comtech: 5 }) }), "comtech", ctx).blocked).toEqual(["Already at the maximum (5)"]);
    expect(quoteSpend(progression, opt, pc({ xp: 14 }), "heavyMachinery", ctx).blocked).toEqual(["Needs 15 XP; has 14"]);
  });

  it("asks the GM to confirm the success or the teacher behind a new skill (5 XP)", () => {
    const q = quoteSpend(progression, option(SKILL_SPEND), pc(), "comtech", ctx);
    expect(q).toMatchObject({ from: 0, to: 1, cost: 5, blocked: [] });
    expect(q.confirm).toHaveLength(1);
    expect(q.confirm[0]).toMatch(/teacher/);
  });

  it("lists every skill once", () => {
    const quotes = quoteSpendTargets(progression, option(SKILL_SPEND), pc(), ctx);
    expect(quotes).toHaveLength(12);
  });

  it("sells any general talent or one of your career's for 5 XP", () => {
    const opt = option(TALENT_SPEND);
    const fields = pc();
    expect(quoteSpend(progression, opt, fields, "resilient", ctx)).toMatchObject({ cost: 5, available: true, blocked: [], from: 0, to: 1 });
    expect(quoteSpend(progression, opt, fields, "seen-it-all", ctx)).toMatchObject({ cost: 5, available: true, blocked: [] });
    const other = quoteSpend(progression, opt, fields, "banter", ctx);
    expect(other.available).toBe(false);
    expect(other.blocked[0]).toBe("A career talent of another career");
    expect(quoteSpend(progression, opt, fields, "true-grit", ctx).blocked).toEqual(["Already taken"]);
  });

  it("stacks Hardened and Seen It All up to three times (p. 51)", () => {
    const opt = option(TALENT_SPEND);
    const twice = pc({ talents: [{ id: "hardened", count: 2 }] });
    const q = quoteSpend(progression, opt, twice, "hardened", ctx);
    expect(q).toMatchObject({ from: 2, to: 3, blocked: [] });
    expect(fieldsAfterSpend(opt, twice, "hardened", 3).talents).toEqual([{ id: "hardened", count: 3 }]);
    expect(quoteSpend(progression, opt, pc({ talents: [{ id: "hardened", count: 3 }] }), "hardened", ctx).blocked).toEqual(["Already taken 3 times (the most allowed)"]);
  });

  it("changes only the skill or the talents list on the sheet", () => {
    const fields = pc();
    const raised = fieldsAfterSpend(option(SKILL_SPEND), fields, "heavyMachinery", 3);
    expect((raised.skills as Record<string, number>).heavyMachinery).toBe(3);
    expect(raised.xp).toBe(40);
    expect((fields.skills as Record<string, number>).heavyMachinery).toBe(2);
    const learned = fieldsAfterSpend(option(TALENT_SPEND), fields, "resilient", 1);
    expect(learned.talents).toEqual([{ id: "true-grit" }, { id: "resilient" }]);
  });

  it("offers the spend options in campaign play only", () => {
    expect(spendOptions(progression, "campaign").map((o) => o.id)).toEqual([SKILL_SPEND, TALENT_SPEND]);
    expect(spendOptions(progression, "cinematic")).toEqual([]);
  });
});
