/**
 * The character builder contract (`characterBuilders`) against a small d20
 * fixture: conformance (bad references, bad JSONLogic, ability methods),
 * grants and their sources, sub-choices from a pick's data, validation,
 * standard array / point buy / seeded and entered rolls, resolving choices
 * made at later steps, level-up with an upsert into a list of class levels,
 * and the combined caster level a multiclass character's slots come from.
 */
import { describe, expect, it } from "vitest";
import {
  autoDraft,
  builderChoices,
  canLevelUp,
  characterBuilderIssues,
  createEnteredRng,
  createRng,
  describeGrant,
  emptyDraft,
  planEntry,
  pointBuyCost,
  resolveCharacterBuilder,
  rollAbilityScores,
  togglePick,
  validatePack,
  type CharacterBuilderAbilityMethod,
  type CharacterBuilderDef,
  type CharacterBuilderDraft,
  type EntityTypeDef,
  type GameModule,
  type JsonLogicRule,
} from "../src";

const ABILITIES = ["str", "dex", "con", "int", "wis", "cha"];
const v = (path: string, d?: unknown): JsonLogicRule => (d === undefined ? { var: path } : { var: [path, d] });
const mod = (a: string): JsonLogicRule => ({ floor: { "/": [{ "-": [v(`fields.abilities.${a}`, 10), 10] }, 2] } });
/** Full-caster slots by caster level (levels 1-5), first to third level slots. */
const SLOTS = [
  [2, 0, 0],
  [3, 0, 0],
  [4, 2, 0],
  [4, 3, 0],
  [4, 3, 2],
];
const casterLevel: JsonLogicRule = {
  if: [
    { ">": [{ count: v("fields.classLevels", []) }, 1] },
    { reduce: [v("fields.classLevels", []), { "+": [v("accumulator"), { if: [{ "==": [v("current.class"), "wizard"] }, v("current.level"), 0] }] }, 0] },
    { if: [{ "==": [v("fields.class"), "wizard"] }, v("fields.level", 1), 0] },
  ],
};

const pc: EntityTypeDef = {
  id: "fx.pc",
  kind: "character",
  name: "PC",
  plural: "PCs",
  schema: {
    type: "object",
    properties: {
      isPC: { type: "boolean" },
      class: { type: "string" },
      level: { type: "integer", minimum: 1, maximum: 20, default: 1 },
      classLevels: { type: "array", items: { type: "object", properties: { class: { type: "string" }, level: { type: "integer" }, subclass: { type: "string" } }, required: ["class", "level"] }, default: [] },
      race: { type: "string" },
      abilities: { type: "object", properties: Object.fromEntries(ABILITIES.map((a) => [a, { type: "integer", minimum: 1, maximum: 30, default: 10 }])), required: ABILITIES, additionalProperties: false },
      skills: { type: "object", properties: { athletics: { type: "integer" }, arcana: { type: "integer" }, stealth: { type: "integer" }, history: { type: "integer" } }, additionalProperties: false, default: {} },
      languages: { type: "array", items: { type: "string" }, default: [] },
      proficiencies: { type: "string" },
      features: { type: "array", items: { type: "object", properties: { name: { type: "string" }, desc: { type: "string" } }, required: ["name"] }, default: [] },
      speed: { type: "integer", default: 30 },
      darkvision: { type: "integer" },
      hp: { type: "object", properties: { max: { type: "integer", minimum: 1 }, current: { type: "integer" } }, default: { max: 1, current: 1 } },
      notes: { type: "string" },
    },
    required: ["abilities"],
    additionalProperties: false,
  },
  computed: {
    conMod: mod("con"),
    casterLevel,
    slots1: { if: [{ ">": [v("computed.casterLevel"), 0] }, { lookup: [SLOTS.map((r) => r[0]), { "-": [v("computed.casterLevel"), 1] }, 0] }, 0] },
    slots2: { if: [{ ">": [v("computed.casterLevel"), 0] }, { lookup: [SLOTS.map((r) => r[1]), { "-": [v("computed.casterLevel"), 1] }, 0] }, 0] },
    slots3: { if: [{ ">": [v("computed.casterLevel"), 0] }, { lookup: [SLOTS.map((r) => r[2]), { "-": [v("computed.casterLevel"), 1] }, 0] }, 0] },
  },
  sheet: {
    sections: [
      { id: "main", title: "Main", fields: [{ path: "class", label: "Class" }, { path: "speed", label: "Speed" }, { path: "abilities.dex", label: "Dexterity" }, { path: "abilities.con", label: "Constitution" }, { path: "skills.*", widget: "skills", config: { ref: "fx.skills" } }] },
    ],
  },
};

const lists = [
  {
    id: "fx.races",
    name: "Races",
    items: [
      { id: "elfish", name: "Elfish", summary: "Quick and keen" },
      { id: "stout", name: "Stout", summary: "Hardy" },
      { id: "fx-supp.reedling", name: "Reedling", source: "Fixture Supplement", builder: { asi: { wis: 2 }, speed: 25, languages: ["Reed"] } },
    ],
  },
  { id: "fx.classes", name: "Classes", items: [{ id: "fighter", name: "Fighter" }, { id: "wizard", name: "Wizard" }] },
  { id: "fx.skills", name: "Skills", items: [{ id: "athletics", name: "Athletics" }, { id: "arcana", name: "Arcana" }, { id: "stealth", name: "Stealth" }, { id: "history", name: "History" }] },
  {
    id: "fx.features",
    name: "Features",
    items: [
      { id: "second-wind", name: "Second Wind", class: "fighter", level: 1, description: "Heal a little." },
      { id: "action-surge", name: "Action Surge", class: "fighter", level: 2, description: "Act twice." },
      { id: "arcane-recovery", name: "Arcane Recovery", class: "wizard", level: 1, description: "Get a slot back." },
      { id: "tradition", name: "Arcane Tradition", class: "wizard", level: 2, description: "Pick a school." },
    ],
  },
];

const ABILITY_STEP = {
  kind: "abilities" as const,
  id: "abilities",
  title: "Ability scores",
  path: "abilities",
  abilities: ABILITIES.map((a) => ({ id: a, name: a.toUpperCase(), abbr: a.toUpperCase() })),
  modifier: { floor: { "/": [{ "-": [v("score"), 10] }, 2] } },
  max: 20,
  methods: [
    { id: "standard", kind: "array" as const, name: "Standard array", values: [15, 14, 13, 12, 10, 8], original: true },
    { id: "points", kind: "pointBuy" as const, name: "Point buy", budget: 27, min: 8, max: 15, costs: { 8: 0, 9: 1, 10: 2, 11: 3, 12: 4, 13: 5, 14: 7, 15: 9 }, original: true },
    { id: "roll", kind: "roll" as const, name: "4d6 drop lowest", dice: "4d6", keep: 3, original: true },
    { id: "manual", kind: "manual" as const, name: "Typed in", min: 3, max: 18, original: true },
  ],
};

const builder: CharacterBuilderDef = {
  id: "fx.builder",
  entityType: "fx.pc",
  name: "Build a hero",
  original: true,
  defaults: { isPC: true },
  data: { hitDie: { fighter: 10, wizard: 6 }, prereq: { fighter: "str", wizard: "int" } },
  itemData: {
    "fx.races": { elfish: { asi: { dex: 2 }, speed: 30, darkvision: 60, languages: ["Common", "Elfish"] }, stout: { asi: { con: 2 }, speed: 25, languages: ["Common"] } },
    "fx.classes": { fighter: { skills: ["athletics", "history"], choose: 1, armor: "All armor" }, wizard: { skills: ["arcana", "history", "stealth"], choose: 2, armor: "None" } },
  },
  steps: [
    {
      kind: "choice",
      id: "race",
      title: "Race",
      noun: "race",
      source: { list: "fx.races" },
      grants: [
        { path: "race", value: v("item.name") },
        { path: { cat: ["abilities.", v("entry")] }, op: "add", each: ABILITIES as unknown as JsonLogicRule, value: { lookup: [v("item.builder.asi"), v("entry"), 0] }, when: { "!=": [{ lookup: [v("item.builder.asi"), v("entry"), 0] }, 0] } },
        { path: "speed", value: v("item.builder.speed", 30) },
        { path: "darkvision", op: "max", value: v("item.builder.darkvision"), when: v("item.builder.darkvision") },
        { path: "languages", op: "append", value: v("item.builder.languages", []) },
      ],
    },
    {
      kind: "choice",
      id: "class",
      title: "Class",
      noun: "class",
      source: { list: "fx.classes" },
      grants: [
        { path: "class", value: v("item.id") },
        { path: "proficiencies", op: "append", value: v("item.builder.armor"), separator: "; " },
        // features up to the starting level, chosen at a later step
        { path: "features", op: "append", each: { list: "fx.features", where: { and: [{ "==": [v("entry.class"), v("item.id")] }, { "<=": [v("entry.level"), v("choices.level.value", 1)] }] } }, object: { name: v("entry.name"), desc: v("entry.description") } },
      ],
      subChoices: [
        {
          id: "skills",
          label: { cat: ["Choose ", v("item.builder.choose"), " skills"] },
          source: { values: v("item.builder.skills"), list: "fx.skills" },
          min: v("item.builder.choose"),
          max: v("item.builder.choose"),
          grants: [{ path: { cat: ["skills.", v("item.id")] }, value: 1 }],
        },
      ],
    },
    ABILITY_STEP,
    {
      kind: "choice",
      id: "level",
      title: "Starting level",
      source: { range: { min: 1, max: 5, label: "Level" } },
      grants: [{ path: "level", value: v("item.value") }],
      subChoices: [
        {
          id: "asi",
          label: { cat: ["Level ", v("entry"), ": +2 to one ability"] },
          each: { filter: [[4], { "<=": [v(""), 5] }] },
          when: { ">=": [v("choices.level.value", 1), v("entry")] },
          source: { options: ABILITIES.map((a) => ({ id: a, name: a.toUpperCase() })) },
          grants: [{ path: { cat: ["abilities.", v("item.id")] }, op: "add", value: 2 }],
          validate: [{ rule: { "<=": [{ var: [{ cat: ["fields.abilities.", v("item.id")] }, 0] }, 20] }, message: "No score above 20." }],
        },
      ],
    },
    { kind: "fields", id: "details", title: "Details", fields: [{ path: "core.name", label: "Name", required: true }, { path: "notes", widget: "textarea" }] },
    { kind: "review", id: "review", title: "Review" },
  ],
  finally: [
    { path: "$hitDie", value: { lookup: [v("data.hitDie"), v("fields.class"), 8] } },
    { path: "hp.max", value: { "+": [v("vars.hitDie"), { "*": [{ "-": [v("fields.level", 1), 1] }, { "+": [{ "/": [v("vars.hitDie"), 2] }, 1] }] }, { "*": [v("fields.level", 1), v("computed.conMod")] }] }, label: { cat: ["Hit points ", v("value")] } },
    { path: "hp.current", value: v("fields.hp.max"), hidden: true },
  ],
  preview: [
    { label: "HP", value: v("fields.hp.max") },
    { label: "Slots", value: { cat: [v("computed.slots1"), "/", v("computed.slots2"), "/", v("computed.slots3")] } },
  ],
  levelUp: {
    when: { "<": [v("fields.level", 1), 20] },
    steps: [
      {
        kind: "choice",
        id: "class",
        title: "Class",
        noun: "a level in",
        source: { list: "fx.classes" },
        available: { ">=": [{ var: [{ cat: ["fields.abilities.", { lookup: [v("data.prereq"), v("option.id"), "str"] }] }, 0] }, 13] },
        availableText: "Needs 13 in its ability.",
        grants: [
          // a single-class character's level goes into the list first
          { path: "classLevels", op: "upsert", key: "class", when: { and: [{ "==": [{ count: v("fields.classLevels", []) }, 0] }, { "!=": [v("item.id"), v("fields.class")] }] }, object: { class: v("fields.class"), level: v("fields.level") } },
          { path: "classLevels", op: "upsert", key: "class", when: { or: [{ ">": [{ count: v("fields.classLevels", []) }, 0] }, { "!=": [v("item.id"), v("fields.class")] }] }, object: { class: v("item.id"), level: { "+": [v("current.level", 0), 1] } } },
          { path: "level", op: "add", value: 1 },
        ],
      },
      {
        kind: "choice",
        id: "hp",
        title: "Hit points",
        source: {
          options: [
            { id: "average", name: "Average" },
            { id: "roll", name: "Roll", roll: { cat: ["1d", { lookup: [v("data.hitDie"), v("choices.class.id"), 8] }] } },
          ],
        },
        grants: [{ path: "hp.max", op: "add", value: { "+": [{ if: [{ "==": [v("item.id"), "roll"] }, v("item.rolled"), { "+": [{ "/": [{ lookup: [v("data.hitDie"), v("choices.class.id"), 8] }, 2] }, 1] }] }, v("computed.conMod")] } }],
      },
    ],
  },
};

const fixture = (b: CharacterBuilderDef = builder): GameModule => ({ entityTypes: [pc], referenceLists: lists, presets: [], characterBuilders: [b] }) as unknown as GameModule;
const M = fixture();

/** A draft with the standard array assigned in order and the given picks. */
function draft(picks: Record<string, string[]>, extra: Partial<CharacterBuilderDraft> = {}): CharacterBuilderDraft {
  return {
    ...emptyDraft(builder),
    picks,
    abilities: { abilities: { method: "standard", scores: { str: 15, dex: 14, con: 13, int: 12, wis: 10, cha: 8 } } },
    values: { details: { "core.name": "Ash" } },
    ...extra,
  };
}

describe("character builder conformance", () => {
  it("accepts the fixture and dry-runs it", () => {
    expect(characterBuilderIssues(M)).toEqual([]);
  });

  it("reports bad references, fields, JSONLogic and ability methods", () => {
    const bad: CharacterBuilderDef = JSON.parse(JSON.stringify(builder));
    (bad.steps[0] as { source: unknown }).source = { list: "fx.nope" };
    (bad.steps[1] as { grants: unknown[] }).grants.push({ path: "nonsense.field", value: 1 }, { path: "class", value: { method: ["x", "toString"] } });
    const abil = bad.steps[2] as typeof ABILITY_STEP;
    (abil.methods[0] as { values: number[] }).values = [15, 14];
    (abil.methods[1] as { costs: Record<string, number> }).costs = { 8: 0 };
    bad.itemData = { "fx.missing": {} };
    const messages = characterBuilderIssues(fixture(bad)).filter((i) => i.severity === "error").map((i) => i.message);
    expect(messages).toContain('unknown reference list "fx.nope"');
    expect(messages).toContain('"nonsense.field" is not a field of fx.pc');
    expect(messages.some((m) => /JSONLogic: unknown operator "method"/.test(m))).toBe(true);
    expect(messages).toContain("the array has 2 values for 6 abilities");
    expect(messages).toContain("point buy has no cost for 9");
    expect(messages).toContain('unknown reference list "fx.missing"');
  });

  it("checks a pack's builder rules with the pack validator", () => {
    const pack = {
      format: "campaign-forge-pack",
      formatVersion: 1,
      manifest: { id: "fxp", version: "1.0.0", name: "Fx", ruleset: "fx", licenseNotice: "x", requiredCore: "0.1.0", modes: [{ id: "c", name: "C" }], defaultMode: "c", dataStatus: "verified", license: { name: "MIT", attribution: "x" } },
      dice: { engine: "d20" },
      characterBuilders: [{ id: "fxp.b", entityType: "fxp.pc", name: "B", steps: [{ kind: "choice", id: "a", title: "A", source: { values: { nope: [1] } } }] }],
    };
    const res = validatePack(pack);
    expect(res.issues.some((i) => i.path === "$.characterBuilders[0].steps[0].source.values" && /unknown operator "nope"/.test(i.message))).toBe(true);
  });
});

describe("grants, sub-choices and validation", () => {
  it("writes a pick's grants on top of the base scores, each with its source", () => {
    const res = resolveCharacterBuilder(M, builder, draft({ race: ["elfish"], class: ["fighter"], "class/skills": ["athletics"], level: ["1"] }));
    expect(res.fields.abilities).toEqual({ str: 15, dex: 16, con: 13, int: 12, wis: 10, cha: 8 });
    expect(res.fields.race).toBe("Elfish");
    expect(res.fields.speed).toBe(30);
    expect(res.fields.darkvision).toBe(60);
    expect(res.fields.languages).toEqual(["Common", "Elfish"]);
    expect(res.fields.isPC).toBe(true);
    const dex = res.grants.find((g) => g.field === "abilities.dex" && g.op === "add")!;
    expect(dex.source).toBe("race Elfish");
    expect(describeGrant(M, pc, dex)).toBe("+2 Dexterity");
    expect(describeGrant(M, pc, res.grants.find((g) => g.field === "skills.athletics")!)).toBe("Athletics 1");
    expect(res.grants.find((g) => g.field === "abilities.str")!.source).toBe("base scores (standard array)");
    // hit points from the final Constitution, with the module's label
    expect(res.fields.hp).toEqual({ max: 11, current: 11 });
    expect(res.grants.find((g) => g.field === "hp.max")!.label).toBe("Hit points 11");
    expect(res.grants.find((g) => g.field === "hp.current")!.hidden).toBe(true);
    expect(res.name).toBe("Ash");
    expect(res.complete).toBe(true);
    expect(res.preview).toEqual([
      { label: "HP", value: "11" },
      { label: "Slots", value: "0/0/0" },
    ]);
  });

  it("gives a supplement item's own builder data, and badges it", () => {
    const res = resolveCharacterBuilder(M, builder, draft({ race: ["fx-supp.reedling"] }));
    const opt = res.steps[0]!.choice!.options.find((o) => o.id === "fx-supp.reedling")!;
    expect(opt.source).toBe("Fixture Supplement");
    expect((res.fields.abilities as Record<string, number>).wis).toBe(12);
    expect(res.fields.speed).toBe(25);
  });

  it("asks for the sub-choices a pick brings, counted from the pick's data", () => {
    let d = draft({ race: ["stout"], class: ["wizard"], level: ["1"] });
    let res = resolveCharacterBuilder(M, builder, d);
    const skills = builderChoices(res).find((c) => c.path === "class/skills")!;
    expect(skills.label).toBe("Choose 2 skills");
    expect(skills.options.map((o) => o.name)).toEqual(["Arcana", "History", "Stealth"]);
    expect(res.complete).toBe(false);
    expect(res.steps[1]!.status).toBe("incomplete");
    d = togglePick(d, skills, "arcana");
    d = togglePick(d, skills, "history");
    res = resolveCharacterBuilder(M, builder, d);
    expect(res.fields.skills).toEqual({ arcana: 1, history: 1 });
    expect(res.complete).toBe(true);
    // a third pick drops the oldest
    d = togglePick(d, skills, "stealth");
    expect(d.picks["class/skills"]).toEqual(["history", "stealth"]);
    // too many (typed into the draft) is an error
    res = resolveCharacterBuilder(M, builder, { ...d, picks: { ...d.picks, "class/skills": ["arcana", "history", "stealth"] } });
    expect(res.issues.some((i) => i.level === "error" && /choose at most 2/.test(i.message))).toBe(true);
    // switching class leaves the old sub-choice behind as a stale pick, ignored
    res = resolveCharacterBuilder(M, builder, { ...d, picks: { ...d.picks, class: ["fighter"], "class/skills": ["arcana", "athletics"] } });
    expect(res.fields.skills).toEqual({ athletics: 1 });
  });

  it("lets earlier grants read later choices (features up to the starting level)", () => {
    const res = resolveCharacterBuilder(M, builder, draft({ race: ["stout"], class: ["fighter"], "class/skills": ["history"], level: ["2"] }));
    expect((res.fields.features as Array<{ name: string }>).map((f) => f.name)).toEqual(["Second Wind", "Action Surge"]);
    expect(res.fields.proficiencies).toBe("All armor");
    expect(res.fields.level).toBe(2);
  });

  it("generates one sub-choice per element and runs its checks", () => {
    const base = draft({ race: ["elfish"], class: ["fighter"], "class/skills": ["history"], level: ["4"] });
    let res = resolveCharacterBuilder(M, builder, base);
    const asi = builderChoices(res).find((c) => c.path === "level/asi.0")!;
    expect(asi.label).toBe("Level 4: +2 to one ability");
    expect(res.complete).toBe(false);
    res = resolveCharacterBuilder(M, builder, { ...base, picks: { ...base.picks, "level/asi.0": ["dex"] } });
    expect((res.fields.abilities as Record<string, number>).dex).toBe(18);
    expect(res.complete).toBe(true);
    // pushing a score past 20 fails the sub-choice's check
    const high = { ...base, picks: { ...base.picks, "level/asi.0": ["dex"] }, abilities: { abilities: { method: "manual", scores: { str: 10, dex: 18, con: 10, int: 10, wis: 10, cha: 10 } } } };
    res = resolveCharacterBuilder(M, builder, high);
    expect(res.issues.some((i) => i.message === "No score above 20.")).toBe(true);
    // below the level, the sub-choice is not asked
    res = resolveCharacterBuilder(M, builder, { ...base, picks: { ...base.picks, level: ["3"] } });
    expect(builderChoices(res).some((c) => c.path.startsWith("level/asi"))).toBe(false);
  });

  it("requires typed fields and checks the result against the schema", () => {
    let res = resolveCharacterBuilder(M, builder, draft({ race: ["elfish"], class: ["fighter"], "class/skills": ["history"], level: ["1"] }, { values: {} }));
    expect(res.issues.some((i) => i.level === "incomplete" && i.message === "Name is required.")).toBe(true);
    res = resolveCharacterBuilder(M, builder, draft({ race: ["elfish"], class: ["fighter"], "class/skills": ["history"], level: ["1"] }, { abilities: { abilities: { method: "manual", scores: { str: 40, dex: 10, con: 10, int: 10, wis: 10, cha: 10 } } } }));
    expect(res.issues.some((i) => i.level === "error" && /must be from 3 to 18/.test(i.message))).toBe(true);
    expect(res.issues.some((i) => /sheet would not accept/.test(i.message))).toBe(true);
  });

  it("builds something with the first options everywhere", () => {
    const res = resolveCharacterBuilder(M, builder, autoDraft(M, builder));
    expect(res.issues.filter((i) => i.level === "error")).toEqual([]);
    expect(res.fields.race).toBe("Elfish");
  });
});

describe("ability methods", () => {
  const step = ABILITY_STEP;
  const pointBuy = step.methods[1] as Extract<CharacterBuilderAbilityMethod, { kind: "pointBuy" }>;
  const roll = step.methods[2] as Extract<CharacterBuilderAbilityMethod, { kind: "roll" }>;

  it("standard array: each value once", () => {
    const ok = resolveCharacterBuilder(M, builder, draft({}));
    expect(ok.steps[2]!.issues).toEqual([]);
    expect(ok.steps[2]!.abilities!.abilities[0]).toMatchObject({ id: "str", base: 15, score: 15, modifier: 2 });
    const twice = resolveCharacterBuilder(M, builder, draft({}, { abilities: { abilities: { method: "standard", scores: { str: 15, dex: 15, con: 13, int: 12, wis: 10, cha: 8 } } } }));
    expect(twice.steps[2]!.issues.map((i) => i.message)).toEqual(["Use each value once: 15, 14, 13, 12, 10, 8."]);
    const partial = resolveCharacterBuilder(M, builder, draft({}, { abilities: { abilities: { method: "standard", scores: { str: 15 } } } }));
    expect(partial.steps[2]!.abilities!.pool).toEqual([14, 13, 12, 10, 8]);
    expect(partial.steps[2]!.status).toBe("incomplete");
  });

  it("point buy: the cost table and the budget", () => {
    expect(pointBuyCost(pointBuy, { str: 15, dex: 15, con: 15, int: 8, wis: 8, cha: 8 }, ABILITIES)).toBe(27);
    expect(pointBuyCost(pointBuy, { str: 16 }, ABILITIES)).toBeUndefined();
    const at = (scores: Record<string, number>) => resolveCharacterBuilder(M, builder, draft({}, { abilities: { abilities: { method: "points", scores } } }));
    const full = at({ str: 15, dex: 15, con: 15, int: 8, wis: 8, cha: 8 });
    expect(full.steps[2]!.issues).toEqual([]);
    expect(full.steps[2]!.abilities).toMatchObject({ spent: 27, budget: 27 });
    expect(at({ str: 15, dex: 15, con: 15, int: 10, wis: 8, cha: 8 }).steps[2]!.issues.map((i) => i.message)).toEqual(["29 points spent; the budget is 27."]);
    expect(at({ str: 14 }).steps[2]!.issues.map((i) => i.level)).toEqual(["warning"]);
    // unset scores count as the minimum
    expect(at({}).steps[2]!.abilities!.abilities.every((a) => a.base === 8)).toBe(true);
  });

  it("4d6 drop lowest: seeded rolls replay, entered dice give the same scores", () => {
    const a = rollAbilityScores(roll, 6, createRng("hero"));
    const b = rollAbilityScores(roll, 6, createRng("hero"));
    expect(a).toEqual(b);
    for (const set of a) {
      expect(set.faces).toHaveLength(4);
      expect(set.total).toBe([...set.faces].sort((x, y) => y - x).slice(0, 3).reduce((s, f) => s + f, 0));
    }
    const faces = [6, 1, 5, 4, 3, 3, 3, 3, 1, 1, 1, 2, 6, 6, 6, 6, 2, 5, 2, 5, 1, 4, 6, 3];
    const entered = rollAbilityScores(roll, 6, createEnteredRng(faces));
    expect(entered.map((s) => s.total)).toEqual([15, 9, 4, 18, 12, 13]);
    // the app asks for 24 dice, labelled by score
    const plan = planEntry((rng) => rollAbilityScores(roll, 6, rng), []);
    expect(plan.slots).toHaveLength(24);
    expect(plan.slots[4]!.label).toBe("Score 2: d6");
    // a rolled draft assigns the totals
    const scores = { str: 18, dex: 15, con: 13, int: 12, wis: 9, cha: 4 };
    const res = resolveCharacterBuilder(M, builder, draft({}, { abilities: { abilities: { method: "roll", scores, rolled: entered } } }));
    expect(res.steps[2]!.issues).toEqual([]);
    const unrolled = resolveCharacterBuilder(M, builder, draft({}, { abilities: { abilities: { method: "roll", scores: {} } } }));
    expect(unrolled.steps[2]!.issues.map((i) => i.message)).toEqual(["Roll 4d6 (keep the highest 3) for each score."]);
  });
});

describe("level up and multiclass", () => {
  /** A wizard 3 with 16 Int and 14 Con, as the create steps would leave it. */
  const wizard3 = (): Record<string, unknown> =>
    resolveCharacterBuilder(M, builder, draft({ race: ["elfish"], class: ["wizard"], "class/skills": ["arcana", "history"], level: ["3"] }, { abilities: { abilities: { method: "standard", scores: { str: 13, dex: 12, con: 14, int: 15, wis: 10, cha: 8 } } } })).fields;

  it("adds a level in the same class, with average or rolled hit points", () => {
    const base = wizard3();
    expect(base.level).toBe(3);
    expect(canLevelUp(M, builder, base)).toBe(true);
    expect(canLevelUp(M, builder, { ...base, level: 20 })).toBe(false);
    const up = { ...emptyDraft(builder, "levelUp"), picks: { class: ["wizard"], hp: ["average"] } };
    let res = resolveCharacterBuilder(M, builder, up, { base });
    expect(res.fields.level).toBe(4);
    expect(res.fields.classLevels).toEqual([]);
    expect((res.fields.hp as { max: number }).max).toBe((base.hp as { max: number }).max + 4 + 2);
    // rolling asks for the roll, then uses it
    res = resolveCharacterBuilder(M, builder, { ...up, picks: { ...up.picks, hp: ["roll"] } }, { base });
    expect(builderChoices(res).find((c) => c.path === "hp")!.options.find((o) => o.id === "roll")!.roll).toBe("1d6");
    expect(res.issues.map((i) => i.message)).toContain("Roll 1d6 for Roll.");
    res = resolveCharacterBuilder(M, builder, { ...up, picks: { ...up.picks, hp: ["roll"] }, rolls: { "hp#roll": { faces: [5], total: 5 } } }, { base });
    expect((res.fields.hp as { max: number }).max).toBe((base.hp as { max: number }).max + 5 + 2);
  });

  it("checks the new class's prerequisite from data", () => {
    const base = { ...wizard3(), abilities: { str: 10, dex: 12, con: 14, int: 15, wis: 10, cha: 8 } };
    const res = resolveCharacterBuilder(M, builder, { ...emptyDraft(builder, "levelUp"), picks: { class: ["fighter"], hp: ["average"] } }, { base });
    const fighter = res.steps[0]!.choice!.options.find((o) => o.id === "fighter")!;
    expect(fighter).toMatchObject({ available: false, reason: "Needs 13 in its ability." });
    expect(res.issues.some((i) => i.level === "error" && /Fighter cannot be picked/.test(i.message))).toBe(true);
  });

  it("multiclass: class levels are upserted and slots come from the combined caster level", () => {
    // wizard 3 takes two fighter levels: fighter 2 / wizard 3
    let fields = wizard3();
    expect(resolveCharacterBuilder(M, builder, emptyDraft(builder, "levelUp"), { base: fields }).computed.slots2).toBe(2);
    for (let i = 0; i < 2; i++) {
      const res = resolveCharacterBuilder(M, builder, { ...emptyDraft(builder, "levelUp"), picks: { class: ["fighter"], hp: ["average"] } }, { base: fields });
      expect(res.issues.filter((x) => x.level !== "warning")).toEqual([]);
      fields = res.fields;
    }
    expect(fields.level).toBe(5);
    expect(fields.classLevels).toEqual([
      { class: "wizard", level: 3 },
      { class: "fighter", level: 2 },
    ]);
    const res = resolveCharacterBuilder(M, builder, emptyDraft(builder, "levelUp"), { base: fields });
    // a single-class wizard 5 would have third-level slots; fighter 2 / wizard 3 casts as a third-level caster
    expect([res.computed.slots1, res.computed.slots2, res.computed.slots3]).toEqual([4, 2, 0]);
    expect(res.computed.casterLevel).toBe(3);
  });
});
