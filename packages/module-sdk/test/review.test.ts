import { describe, expect, it } from "vitest";
import { evaluateLogic, logicIssues } from "../src/logic";
import { checkModule, loadModule } from "../src/module";
import { computeNarrativeFields, fillReviewMessage, narrativeEntityType, reviewHeadline, runAdventureReview } from "../src/review";
import { CONTRACT_VERSION, type AdventureBuilderDef, type GameModule, type ReviewRule } from "../src/types";

describe("review JSONLogic ops", () => {
  it("len, words and trim", () => {
    expect(evaluateLogic({ len: { var: "s" } }, { s: "abc" })).toBe(3);
    expect(evaluateLogic({ len: { var: "a" } }, { a: [1, 2] })).toBe(2);
    expect(evaluateLogic({ len: { var: "missing" } }, {})).toBe(0);
    expect(evaluateLogic({ words: { var: "s" } }, { s: "  go to   the tower " })).toBe(4);
    expect(evaluateLogic({ words: { var: "s" } }, { s: "   " })).toBe(0);
    expect(evaluateLogic({ words: { var: "s" } }, {})).toBe(0);
    expect(evaluateLogic({ trim: { var: "s" } }, { s: "  x " })).toBe("x");
    expect(evaluateLogic({ "!": { len: { trim: { var: "s" } } } }, { s: "   " })).toBe(true);
  });

  it("matches is case-insensitive by default and takes flags", () => {
    expect(evaluateLogic({ matches: [{ var: "s" }, "\\b(kill|betray)"] }, { s: "I will BETRAY them" })).toBe(true);
    expect(evaluateLogic({ matches: [{ var: "s" }, "kill", ""] }, { s: "KILL" })).toBe(false);
    expect(evaluateLogic({ matches: [{ var: "s" }, "^a.b$", "s"] }, { s: "A\nb" })).toBe(false);
    expect(evaluateLogic({ matches: [{ var: "s" }, "^a.b$", "si"] }, { s: "A\nb" })).toBe(true);
    expect(evaluateLogic({ matches: [{ var: "missing" }, "x"] }, {})).toBe(false);
  });

  it("startsWith and endsWith", () => {
    expect(evaluateLogic({ endsWith: [{ var: "s" }, "What do you do?"] }, { s: "The lights fail. What do you do?" })).toBe(true);
    expect(evaluateLogic({ endsWith: [{ var: "s" }, "what do you do?"] }, { s: "What do you do?" })).toBe(false);
    expect(evaluateLogic({ endsWith: [{ var: "s" }, "what do you do?", "i"] }, { s: "What do you do?" })).toBe(true);
    expect(evaluateLogic({ startsWith: [{ var: "s" }, "Act"] }, { s: "Act 1" })).toBe(true);
  });

  it("finds unknown operators and bad patterns statically", () => {
    expect(logicIssues({ and: [{ len: { var: "x" } }, { words: "a b" }] })).toEqual([]);
    expect(logicIssues({ and: [{ nope: [1] }] })).toEqual(['unknown operator "nope"']);
    expect(logicIssues({ method: [{ var: "x" }, "toString"] })).toEqual(['unknown operator "method"']);
    expect(logicIssues({ matches: [{ var: "x" }, "(unclosed"] })[0]).toMatch(/invalid pattern/);
    // Objects with several keys are data, not operations.
    expect(logicIssues({ in: ["a", { a: 1, b: 2 }] })).toEqual([]);
  });
});

const STEPS = [
  { id: "basics", title: "Basics", panels: [] },
  { id: "cast", title: "Cast", panels: [] },
  { id: "acts", title: "Acts", panels: [] },
  { id: "empty", title: "No rules", panels: [] },
];

function builder(review: ReviewRule[]): Pick<AdventureBuilderDef, "steps" | "review"> {
  return { steps: STEPS, review };
}

const CTX = {
  adventure: { title: "Dead Air", fields: { hook: "" } },
  acts: [
    { number: 1, title: "Setup", fields: { twist: "" } },
    { number: 2, title: "Payoff", fields: { twist: "It was the mayor" } },
  ],
  scenes: [],
  cast: { heroes: [{ name: "Ada", fields: {} }, { name: "", fields: {} }] },
  heroes: [
    { name: "Ada", fields: {} },
    { name: "", fields: {} },
  ],
  handouts: [],
};

describe("runAdventureReview", () => {
  it("sorts bad, warn, ok and fills placeholders", () => {
    const result = runAdventureReview(
      builder([
        { id: "ok1", step: "basics", level: "bad", when: { "!": { len: { var: "adventure.title" } } }, message: "Give it a title", okMessage: "Title set: {name}" },
        { id: "warn1", step: "acts", level: "warn", each: "acts", when: { "!": { len: { var: "item.fields.twist" } } }, message: "Act {act} ({name}, #{n}): add a twist" },
        { id: "bad1", step: "basics", level: "bad", when: { "!": { len: { trim: { var: "adventure.fields.hook" } } } }, message: "Write the hook" },
        { id: "bad2", step: "cast", level: "bad", each: "heroes", when: { "!": { len: { var: "item.name" } } }, message: "Hero {n}: needs a name" },
        { id: "count", step: "cast", level: "warn", when: { "<": [{ len: { var: "heroes" } }, 1] }, value: { len: { var: "heroes" } }, message: "No heroes", okMessage: "{value} heroes" },
      ]),
      CTX,
    );
    expect(result.items.map((i) => [i.level, i.message])).toEqual([
      ["bad", "Write the hook"],
      ["bad", "Hero 2: needs a name"],
      ["warn", "Act 1 (Setup, #1): add a twist"],
      ["ok", "Title set: Dead Air"],
      ["ok", "2 heroes"],
    ]);
    expect(result.summary).toEqual({ bad: 2, warn: 1, ok: 2 });
    expect(result.byStep).toEqual({ basics: "bad", cast: "bad", acts: "warn", empty: "none" });
    expect(reviewHeadline(result)).toBe("2 items to fix");
  });

  it("runs check() rules, alone or gated by when", () => {
    const check: ReviewRule["check"] = (_item, ctx) =>
      (ctx.acts as Array<{ number: number; fields: { twist: string } }>).filter((a) => !a.fields.twist).map((a) => `Act ${a.number}: add a twist`);
    const result = runAdventureReview(
      builder([
        { id: "c1", step: "acts", level: "warn", check, message: "Twists", okMessage: "All twists" },
        { id: "c2", step: "cast", level: "bad", each: "heroes", when: { "!": { len: { var: "item.name" } } }, check: (item) => [`unnamed hero at {n} (${String(item.name)})`], message: "x" },
        { id: "c3", step: "basics", level: "warn", check: () => [], message: "never", okMessage: "{name} is fine" },
      ]),
      CTX,
    );
    expect(result.items.map((i) => [i.ruleId, i.level, i.message])).toEqual([
      ["c2", "bad", "unnamed hero at 2 ()"],
      ["c1", "warn", "Act 1: add a twist"],
      ["c3", "ok", "Dead Air is fine"],
    ]);
    expect(result.byStep.basics).toBe("ok");
    expect(reviewHeadline(runAdventureReview(builder([]), CTX))).toBe("Ready");
  });

  it("turns a throwing rule into one warning naming the rule", () => {
    const result = runAdventureReview(
      builder([
        {
          id: "boom",
          step: "acts",
          level: "bad",
          check: () => {
            throw new Error("kaput");
          },
          message: "x",
        },
        { id: "fine", step: "basics", level: "bad", when: false, message: "x", okMessage: "fine" },
      ]),
      CTX,
    );
    expect(result.items).toEqual([
      { ruleId: "boom", step: "acts", level: "warn", message: 'Review rule "boom" could not run: kaput' },
      { ruleId: "fine", step: "basics", level: "ok", message: "fine" },
    ]);
    expect(result.byStep.acts).toBe("warn");
  });

  it("treats a missing each collection as empty", () => {
    const result = runAdventureReview(builder([{ id: "e", step: "cast", level: "bad", each: "npcs", when: true, message: "x", okMessage: "no npcs to check" }]), CTX);
    expect(result.items.map((i) => i.message)).toEqual(["no npcs to check"]);
  });

  it("fills messages", () => {
    expect(fillReviewMessage("{name} in act {act}, {n}: {value} {other}", { item: { title: "Scene", act: 2 }, index: 0, value: 7 })).toBe("Scene in act 2, 1: 7 {other}");
  });

  it("computes narrative fields like entity fields", () => {
    const def = { kind: "adventure" as const, schema: { type: "object", properties: { hours: { type: "integer" } } }, sheet: { sections: [] }, computed: { minutes: { "*": [{ var: "fields.hours" }, 60] } } };
    expect(computeNarrativeFields(def, { hours: 4 })).toEqual({ minutes: 240 });
    expect(narrativeEntityType(def)).toBe(narrativeEntityType(def));
  });
});

// ---------------------------------------------------------------------------
// conformance
// ---------------------------------------------------------------------------

function moduleWithBuilder(): GameModule {
  return {
    manifest: {
      id: "nb",
      version: "1.0.0",
      name: "NB",
      ruleset: "NB",
      licenseNotice: "none",
      requiredCore: CONTRACT_VERSION,
      modes: [{ id: "a", name: "A" }],
      defaultMode: "a",
      dataStatus: "verified",
    },
    dice: { dice: [{ id: "d6", name: "d6", faces: 6 }], buildPool: () => ({ dice: { d6: 1 } }), roll: (pool) => ({ pool, dice: [], successes: 0, symbols: {}, pushes: 0, canPush: false }), describe: () => "" },
    entityTypes: [
      {
        id: "nb.person",
        kind: "character",
        name: "Person",
        plural: "People",
        schema: { type: "object", properties: { str: { type: "integer", default: 2 }, isPC: { type: "boolean" } } },
        sheet: { sections: [{ id: "s", title: "S", fields: [{ path: "str" }, { path: "isPC", widget: "checkbox" }] }] },
        computed: { health: { var: "fields.str" } },
      },
    ],
    relationshipTypes: [],
    referenceLists: [],
    presets: [],
    tables: [],
    procedures: [],
    templates: [{ id: "nb.tpl", kind: "adventure", name: "Tpl", scaffold: { title: "T", acts: [{ number: 1, goal: "g" }, { number: 2, goal: "h" }] } }],
    rules: [],
    trackers: [],
    calendar: { id: "nb.cal", name: "Cal", defaultYear: 1, months: [{ name: "M", days: 30 }] },
    narrativeFields: [
      { kind: "adventure", schema: { type: "object", properties: { hook: { type: "string" } } }, sheet: { sections: [{ id: "a", title: "A", fields: [{ path: "hook" }] }] } },
      { kind: "act", schema: { type: "object", properties: { twist: { type: "string" } } }, sheet: { sections: [{ id: "a", title: "A", fields: [{ path: "twist" }] }] } },
      { kind: "scene", schema: { type: "object", properties: { trigger: { type: "string" } } }, sheet: { sections: [] } },
    ],
    adventureBuilders: [
      {
        id: "nb.builder",
        name: "Builder",
        templateId: "nb.tpl",
        cast: [{ id: "pcs", label: "PCs", entityType: "nb.person", defaults: { isPC: true }, fields: ["str", "health"] }],
        steps: [
          { id: "one", title: "One", panels: [{ kind: "adventure", fields: ["core.title", "hook"] }, { kind: "cast", role: "pcs" }] },
          { id: "two", title: "Two", panels: [{ kind: "act", act: 2, fields: ["core.goal", "twist"], scenes: true, sceneFields: ["core.mandatory", "trigger"] }, { kind: "agendas", role: "pcs" }] },
          { id: "review", title: "Review", panels: [{ kind: "review" }] },
        ],
        review: [
          { id: "r1", step: "one", level: "bad", when: { "!": { var: "adventure.fields.hook" } }, message: "hook" },
          { id: "r2", step: "two", level: "warn", each: "pcs", when: { "<": [{ words: { var: "item.name" } }, 1] }, message: "{name}" },
        ],
      },
    ],
  };
}

const builderErrors = (m: GameModule) => checkModule(m, { skipProcedureRuns: true }).issues.filter((i) => i.severity === "error");

describe("checkModule: narrative fields and builders", () => {
  it("passes a valid builder and exposes lookups", () => {
    expect(builderErrors(moduleWithBuilder())).toEqual([]);
    const loaded = loadModule(moduleWithBuilder(), { skipProcedureRuns: true });
    expect(loaded.builder("nb.builder")?.name).toBe("Builder");
    expect(loaded.buildersFor("a")).toHaveLength(1);
    expect(loaded.narrativeFieldsFor("act", "a")?.kind).toBe("act");
    expect(loaded.narrativeFieldsFor("act")?.kind).toBe("act");
  });

  it("catches a review rule with an unknown step", () => {
    const m = moduleWithBuilder();
    m.adventureBuilders![0]!.review[0]!.step = "nowhere";
    expect(builderErrors(m)).toEqual([expect.objectContaining({ where: "builder:nb.builder:review:r1", message: 'references unknown step "nowhere"' })]);
  });

  it("catches an unknown cast entity type", () => {
    const m = moduleWithBuilder();
    m.adventureBuilders![0]!.cast[0]!.entityType = "nb.ghost";
    expect(builderErrors(m)).toEqual([expect.objectContaining({ where: "builder:nb.builder:cast:pcs", message: 'unknown entity type "nb.ghost"' })]);
  });

  it("catches bad references across the builder", () => {
    const m = moduleWithBuilder();
    const b = m.adventureBuilders![0]!;
    b.templateId = "nb.tpl";
    b.cast[0]!.fields = ["str", "nope"];
    b.cast.push({ id: "acts", label: "Clash", entityType: "nb.person" });
    b.steps[0]!.panels = [{ kind: "adventure", fields: ["core.nothing", "missing"] }, { kind: "cast", role: "ghosts" }];
    b.steps[1]!.panels = [{ kind: "act", act: 3, fields: ["core.goal", "nope"], scenes: true, sceneFields: ["zzz"] }];
    b.review.push({ id: "r3", step: "one", level: "warn", each: "dragons", when: { bogus: [1] }, value: { matches: ["x", "("] }, message: "m" });
    b.review.push({ id: "r1", step: "one", level: "warn", message: "no when" } as ReviewRule);
    const messages = builderErrors(m).map((e) => `${e.where} ${e.message}`);
    expect(messages).toEqual(
      expect.arrayContaining([
        'builder:nb.builder:cast:pcs field "nope" does not exist on "nb.person"',
        expect.stringMatching(/cast:acts cast role id "acts" clashes/),
        'builder:nb.builder:step:one:panel:0 adventure field "core.nothing" is neither a core field nor in the adventure narrative fields',
        'builder:nb.builder:step:one:panel:0 adventure field "missing" is neither a core field nor in the adventure narrative fields',
        'builder:nb.builder:step:one:panel:1 cast panel references unknown cast role "ghosts"',
        "builder:nb.builder:step:two:panel:0 act 3 is not one of the template's acts (1, 2)",
        'builder:nb.builder:step:two:panel:0 act field "nope" is neither a core field nor in the act narrative fields',
        'builder:nb.builder:step:two:panel:0 scene field "zzz" is neither a core field nor in the scene narrative fields',
        expect.stringMatching(/review:r3 each names unknown collection "dragons"/),
        'builder:nb.builder:review:r3 when: unknown operator "bogus"',
        expect.stringMatching(/review:r3 value: invalid pattern/),
        'builder:nb.builder:review:r1 duplicate review rule id "r1"',
        "builder:nb.builder:review:r1 rule has neither when nor check",
      ]),
    );
  });

  it("checks narrative field defs and the template", () => {
    const m = moduleWithBuilder();
    m.narrativeFields![0]!.sheet.sections[0]!.fields.push({ path: "ghost" });
    m.narrativeFields!.push({ kind: "chapter" as never, schema: {}, sheet: { sections: [] } });
    m.narrativeFields![1]!.mode = ["zzz"];
    m.narrativeFields![2]!.schema = { type: "nonsense" };
    m.adventureBuilders![0]!.templateId = "nb.missing";
    const messages = builderErrors(m).map((e) => `${e.where} ${e.message}`);
    expect(messages).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/^narrativeFields:adventure.*sheet field path "ghost" does not exist/),
        'narrativeFields:chapter unknown narrative kind "chapter" (adventure, act or scene)',
        'narrativeFields:act references undeclared mode "zzz"',
        expect.stringMatching(/^narrativeFields:scene schema does not compile/),
        'builder:nb.builder unknown template "nb.missing"',
      ]),
    );
  });
});
