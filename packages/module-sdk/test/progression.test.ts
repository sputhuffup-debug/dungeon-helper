import { describe, expect, it } from "vitest";
import { checkModule } from "../src/module";
import { advances, awardQuestions, awardTotals, clampPool, evaluateAwards, fieldsAfterSpend, pickCount, poolValue, progressionPool, quoteSpend, quoteSpendTargets, spendTargetValue } from "../src/progression";
import { CONTRACT_VERSION, type GameModule, type ProgressionDef } from "../src/types";

const progression = (): ProgressionDef => ({
  entities: [{ type: "p.hero", when: { "==": [{ var: "fields.pc" }, true] } }],
  experience: { path: "xp", label: "XP", page: 3 },
  storyPoints: { path: "luck", label: "Luck", max: 2, page: 4, earn: [{ text: "Be bold.", page: 4 }], uses: [{ id: "p.reroll", label: "Re-roll", text: "Roll again.", page: 4, operation: "boost" }] },
  awards: [
    { id: "p.came", text: "Came?", page: 3, defaultYes: true },
    { id: "p.won", text: "Won?", page: 3, amount: 2 },
    { id: "p.bold", text: "Bold this act?", page: 4, pool: "story", timing: "act", mode: ["b"] },
  ],
  spends: [
    { id: "p.skill", label: "Skill", target: { kind: "level", path: "skills", keys: ["sword", "bow"], max: 3 }, cost: { "*": [{ var: "to" }, 2] }, page: 3 },
    { id: "p.feat", label: "Feat", target: { kind: "pick", path: "feats", ref: "p.feats" }, cost: 3, page: 3, checks: [{ level: "confirm", ok: false, message: "Had a mentor?" }] },
  ],
});

function moduleWith(def: ProgressionDef): GameModule {
  return {
    manifest: { id: "p", version: "1.0.0", name: "P", ruleset: "P", licenseNotice: "none", requiredCore: CONTRACT_VERSION, modes: [{ id: "a", name: "A" }, { id: "b", name: "B" }], defaultMode: "a", dataStatus: "verified" },
    dice: {
      dice: [{ id: "d6", name: "d6", faces: 6 }],
      buildPool: () => ({ dice: { d6: 1 } }),
      roll: (pool, rng) => ({ pool, dice: [{ die: "d6", value: rng.int(1, 6) }], successes: 0, symbols: {}, pushes: 0, canPush: false }),
      describe: () => "",
      operations: { boost: { id: "boost", name: "Boost", input: { type: "object" }, run: () => ({ rolls: [], result: null, label: "" }) } },
    },
    entityTypes: [
      {
        id: "p.hero",
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
      },
    ],
    relationshipTypes: [],
    referenceLists: [{ id: "p.feats", name: "Feats", items: [{ id: "tough", name: "Tough", maxStack: 2 } as never, { id: "quick", name: "Quick" }] }],
    presets: [],
    tables: [],
    procedures: [],
    templates: [],
    rules: [],
    trackers: [],
    calendar: { id: "p.cal", name: "Cal", defaultYear: 1, months: [{ name: "M", days: 30 }] },
    progression: def,
  };
}

const errors = (m: GameModule) => checkModule(m, { skipProcedureRuns: true }).issues.filter((i) => i.severity === "error").map((i) => `${i.where}: ${i.message}`);
const ctx = (m: GameModule) => ({ referenceList: (id: string) => m.referenceLists.find((l) => l.id === id) });

describe("progression conformance", () => {
  it("passes a valid progression", () => {
    expect(errors(moduleWith(progression()))).toEqual([]);
  });

  it("catches unknown paths, pools, lists, operations and bad logic", () => {
    const def = progression();
    def.experience!.path = "exp";
    def.storyPoints!.uses[0]!.operation = "nope";
    def.awards.push({ id: "p.came", text: "Again", page: 3 });
    def.awards.push({ id: "p.x", text: "X", page: 3, pool: "story", amount: 0 });
    def.spends.push({ id: "p.bad", label: "Bad", target: { kind: "pick", path: "talents", ref: "p.none" }, cost: { nope: [1] }, page: 3 });
    def.entities.push({ type: "p.ghost" });
    const errs = errors(moduleWith(def));
    expect(errs).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/pool path "exp"/),
        expect.stringMatching(/unknown dice operation "nope"/),
        expect.stringMatching(/duplicate award question id "p.came"/),
        expect.stringMatching(/amount must be a positive integer/),
        expect.stringMatching(/target path "talents"/),
        expect.stringMatching(/unknown reference list "p.none"/),
        expect.stringMatching(/cost:/),
        expect.stringMatching(/unknown entity type "p.ghost"/),
      ]),
    );
  });

  it("refuses an award into a pool the progression does not define", () => {
    const def = progression();
    delete def.storyPoints;
    expect(errors(moduleWith(def))).toEqual(expect.arrayContaining([expect.stringMatching(/pays into pool "story"/)]));
  });
});

describe("progression evaluation", () => {
  const def = progression();
  const m = moduleWith(def);

  it("knows who advances and reads and bounds pools", () => {
    expect(advances(def, { type: "p.hero", fields: { pc: true } })).toBe(true);
    expect(advances(def, { type: "p.hero", fields: {} })).toBe(false);
    const luck = progressionPool(def, "story")!;
    expect(poolValue(luck, {})).toBe(0);
    expect(clampPool(luck, 5)).toBe(2);
    expect(clampPool(luck, -1)).toBe(0);
  });

  it("lists award questions by mode and timing and totals them per pool", () => {
    expect(awardQuestions(def, "a").map((q) => q.id)).toEqual(["p.came", "p.won"]);
    expect(awardQuestions(def, "a", "act")).toEqual([]);
    expect(awardQuestions(def, "b", "act").map((q) => q.id)).toEqual(["p.bold"]);
    expect(awardTotals(def.awards, ["p.came", "p.won", "p.bold"])).toEqual({ experience: 3, story: 1 });
    const rows = evaluateAwards(awardQuestions(def, "a"), { mode: "a", character: { id: "h", name: "H", type: "p.hero", fields: {} }, computed: {}, relationships: {}, trackerState: {} });
    expect(rows.map((r) => r.ticked)).toEqual([true, false]);
  });

  it("quotes level and pick spends with caps, costs and confirmations", () => {
    const fields = { pc: true, xp: 10, skills: { sword: 2, bow: 3 }, feats: [{ id: "tough" }] };
    const skill = def.spends[0]!;
    expect(quoteSpend(def, skill, fields, "sword", ctx(m))).toMatchObject({ from: 2, to: 3, cost: 6, balanceAfter: 4, blocked: [] });
    expect(quoteSpend(def, skill, fields, "bow", ctx(m)).blocked).toEqual(["Already at the maximum (3)"]);
    expect(quoteSpendTargets(def, skill, fields, ctx(m)).map((q) => q.target)).toEqual(["sword", "bow"]);
    const feat = def.spends[1]!;
    const tough = quoteSpend(def, feat, fields, "tough", ctx(m));
    expect(tough).toMatchObject({ from: 1, to: 2, cost: 3, confirm: ["Had a mentor?"], blocked: [] });
    expect(quoteSpend(def, feat, { ...fields, feats: [{ id: "quick" }] }, "quick", ctx(m)).blocked).toEqual(["Already taken"]);
    expect(quoteSpend(def, feat, fields, "ghost", ctx(m)).blocked[0]).toMatch(/Unknown/);
    expect(quoteSpend(def, feat, { ...fields, xp: 2 }, "quick", ctx(m)).blocked).toEqual(["Needs 3 XP; has 2"]);
  });

  it("applies and reverts the sheet change of a spend", () => {
    const feat = def.spends[1]!;
    const fields = { feats: [{ id: "tough" }] };
    const twice = fieldsAfterSpend(feat, fields, "tough", 2);
    expect(twice.feats).toEqual([{ id: "tough", count: 2 }]);
    expect(pickCount(feat.target as Extract<typeof feat.target, { kind: "pick" }>, twice, "tough")).toBe(2);
    expect(fieldsAfterSpend(feat, twice, "tough", 1).feats).toEqual([{ id: "tough" }]);
    expect(fieldsAfterSpend(feat, fields, "tough", 0).feats).toEqual([]);
    const skill = def.spends[0]!;
    expect(spendTargetValue(skill, fieldsAfterSpend(skill, { skills: { sword: 1 } }, "bow", 1), "bow")).toBe(1);
    expect(fields.feats).toEqual([{ id: "tough" }]);
  });
});
