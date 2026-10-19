import { describe, expect, it } from "vitest";
import {
  checkModule,
  fieldSchemaAt as entityFieldSchemaAt,
  reviewHeadline,
  runAdventureReview,
  type EntityTypeDef,
  type JsonSchema,
  type ReviewItem,
} from "@campaign-forge/module-sdk";
import alienModule, {
  ACT_DEFAULTS,
  CINEMATIC_BUILDER_ID,
  STEP_IDS,
  THEME_IDS,
  agendaText,
  cinematicBuilder,
  cinematicBuilderScaffold,
  narrativeFields,
  pcCreationIssues,
  scenesOfAct,
} from "../src";
import { campaignTheme } from "../src/tables/character";

type Rec = Record<string, unknown>;
const fieldSchemaAt = (schema: JsonSchema, path: string) => entityFieldSchemaAt({ schema } as EntityTypeDef, path);
const review = (ctx: Rec) => runAdventureReview(cinematicBuilder, ctx);
/** The issues of a review (ok items left out). */
const issuesOf = (ctx: Rec): ReviewItem[] => review(ctx).items.filter((i) => i.level !== "ok");

// ---------------------------------------------------------------------------
// Hand-built review contexts
// ---------------------------------------------------------------------------
const member = (id: string, name: string, fields: Rec, type = "alien.character", subtype?: string): Rec => ({
  id,
  name,
  type,
  ...(subtype ? { subtype } : {}),
  fields,
  computed: {},
});

function context(parts: { adventure: Rec; acts: Rec[]; pcs: Rec[]; npcs: Rec[]; locations: Rec[]; handouts?: Rec[] }): Rec {
  const scenes = parts.acts.flatMap((a) => (a.scenes as Rec[]).map((s) => ({ ...s, act: a.number })));
  const acts = parts.acts.map((a) => ({ ...a, scenes: (a.scenes as Rec[]).map((s) => ({ ...s, act: a.number })) }));
  const cast = { pcs: parts.pcs, npcs: parts.npcs, locations: parts.locations };
  return structuredClone({ adventure: parts.adventure, acts, scenes, cast, ...cast, handouts: parts.handouts ?? [] });
}

/** What the builder template scaffolds, with one blank PC, two blank NPCs and three blank locations. */
function emptyDraft(): Rec {
  return context({
    adventure: { title: "", premise: "", status: "planned", fields: { ...cinematicBuilderScaffold.fields }, playerIntro: "", gmSituation: "", epilogue: "" },
    acts: cinematicBuilderScaffold.acts.map((a) => ({
      number: a.number,
      title: a.title,
      goal: a.goal,
      fields: { ...a.fields },
      pacing: "",
      scenes: (a.scenes ?? []).map((s) => ({ title: "Scene", purpose: s.purpose, status: "planned", mandatory: s.mandatory === true, fields: {}, body: "", readAloud: "" })),
    })),
    pcs: [member("pc1", "", { isPC: true })],
    npcs: [member("npc1", "", { isPC: false }), member("npc2", "", { isPC: false })],
    locations: [1, 2, 3].map((i) => member(`loc${i}`, "", {}, "alien.location", "site")),
  });
}

const event = (title: string, mandatory: boolean, aimedAt = "everyone"): Rec => ({
  title,
  purpose: "",
  status: "planned",
  mandatory,
  fields: { aimedAt, trigger: "When the crew splits up" },
  body: `${title}: something happens that the crew has to deal with.`,
  readAloud: "",
});

/** A roughneck built like the book's example on p. 28. */
const nat = member("pc1", "Nat", {
  isPC: true,
  career: "roughneck",
  attributes: { strength: 5, agility: 3, wits: 2, empathy: 4 },
  skills: { heavyMachinery: 3, stamina: 2, closeCombat: 2, comtech: 1, observation: 1, medicalAid: 1 },
  talents: [{ id: "true-grit", count: 1 }],
  agendas: [
    { act: 1, text: "Find out who signed off on the faulty reactor repairs last month." },
    { act: 2, text: "Keep the cargo manifest away from the company man at any cost." },
    { act: 3, text: "Get the shuttle launched with your partner aboard, even if others stay behind." },
  ],
});

const medic = member("pc2", "Hayes", {
  isPC: true,
  career: "medic",
  attributes: { strength: 2, agility: 3, wits: 4, empathy: 5 },
  skills: { medicalAid: 3, observation: 3, mobility: 2, comtech: 1, survival: 1 },
  talents: [{ id: "field-medic", count: 1 }],
});

function filledDraft(): Rec {
  const actText = (n: number) => ({
    number: n,
    title: ["Arrival", "The Tilt", "Run"][n - 1],
    goal: `Act ${n} in one line.`,
    fields: { ...ACT_DEFAULTS[n - 1], pressure: "Lights fail deck by deck.", relief: "A meal in the galley until the alarm goes.", actEnd: "The distress call is answered." },
    pacing: "",
    scenes: [event(`Event ${n}a`, true), event(`Event ${n}b`, false, "pc1"), event(`Event ${n}c`, false)],
  });
  return context({
    adventure: {
      title: "Cold Iron",
      premise: "",
      status: "planned",
      playerIntro: "Your crew answers a mining station's request for a reactor technician.",
      gmSituation: "The station's research wing bred something in the ore, and the company wants it back.",
      epilogue: "",
      fields: {
        year: 2184,
        theme: "killing-greed",
        targetHours: 4,
        truthTie: "Nat's partner signed the research wing's safety waiver.",
        countdown: "The reactor overloads 20 minutes after the core is pulled.",
        openingNarration: "The docking clamps bang shut and the lights on the station flicker. What do you do?",
        signOffs: { pc1: "This is Nat, last survivor of the station...", pc2: "Medical log, final entry..." },
      },
    },
    acts: [1, 2, 3].map(actText),
    pcs: [nat, medic],
    npcs: [
      member("npc1", "Reed", { goal: "Get paid and get home.", secret: "Plans to betray the crew for a bonus.", sampleLines: "\"Not my shift, not my problem.\"", arc: "Helps, hesitates, then runs." }),
      member("npc2", "Ash", {
        goal: "Bring the specimen back intact.",
        secret: "A synthetic under company orders.",
        sampleLines: "\"Fascinating. Please, go on.\"",
        android: true,
        secretAndroid: true,
        coverAttributes: { strength: 3, agility: 3, wits: 4, empathy: 3 },
        fairClues: ["Never eats", "Milky fluid on a cut"],
        secretOrders: "Bring back the organism; the crew is expendable.",
      }),
    ],
    locations: [
      member("loc1", "Docking ring", { description: "Frosted airlocks.", puzzle: "Jammed airlock", puzzleClue: "Manual release in the log", puzzleSolution: "Pull the release", puzzleFallback: "Cut through, loudly" }, "alien.location", "site"),
      member("loc2", "Research wing", { description: "Sealed labs.", puzzle: "Lab door code", puzzleClue: "Code on a photo", puzzleSolution: "Enter 1979", puzzleFallback: "Wait for the lockdown cycle" }, "alien.location", "site"),
      member("loc3", "Reactor", { description: "Heat and noise." }, "alien.location", "site"),
    ],
    handouts: [1, 2, 3].map((act) => ({ title: `Agenda Act ${act}`, kind: "agenda", character: "pc2", act, body: `Act ${act}: make sure every wounded crew member is treated before anyone else.` })),
  });
}

const ids = (issues: ReviewItem[], level?: "bad" | "warn") => [...new Set(issues.filter((i) => !level || i.level === level).map((i) => i.ruleId))].sort();

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe("cinematic adventure builder: structure", () => {
  const builder = cinematicBuilder;
  const narrative = (kind: string) => narrativeFields.find((n) => n.kind === kind)!;
  const hasNarrativeField = (kind: string, path: string) => fieldSchemaAt(narrative(kind).schema, path) !== undefined;
  const entitySchema = (typeId: string): JsonSchema => alienModule.entityTypes.find((t) => t.id === typeId)!.schema;

  it("is wired into the module with a template that exists", () => {
    expect(alienModule.adventureBuilders).toEqual([builder]);
    expect(alienModule.narrativeFields).toBe(narrativeFields);
    expect(builder.id).toBe(CINEMATIC_BUILDER_ID);
    expect(builder.mode).toEqual(["cinematic"]);
    expect(alienModule.templates.map((t) => t.id)).toContain(builder.templateId);
  });

  it("has the ten steps in order, each with 3-4 short tips", () => {
    expect(builder.steps.map((s) => s.id)).toEqual([...STEP_IDS]);
    for (const step of builder.steps) {
      expect(step.guide?.length, step.id).toBeGreaterThanOrEqual(3);
      expect(step.guide?.length, step.id).toBeLessThanOrEqual(4);
      for (const tip of step.guide ?? []) expect(tip.length, tip).toBeLessThan(260);
    }
  });

  it("panels name fields that exist in core or the module", () => {
    const coreFields = new Set(["core.title", "core.playerIntro", "core.gmSituation", "core.goal", "core.body", "core.mandatory"]);
    const roles = new Set(builder.cast.map((c) => c.id));
    const acts = new Set<number>();
    for (const step of builder.steps) {
      for (const panel of step.panels) {
        if (panel.kind === "adventure") {
          for (const f of panel.fields) expect(coreFields.has(f) || hasNarrativeField("adventure", f), `${step.id}: ${f}`).toBe(true);
        } else if (panel.kind === "act") {
          acts.add(panel.act);
          for (const f of panel.fields) expect(coreFields.has(f) || hasNarrativeField("act", f), `${step.id}: ${f}`).toBe(true);
          for (const f of panel.sceneFields ?? []) expect(coreFields.has(f) || hasNarrativeField("scene", f), `${step.id}: ${f}`).toBe(true);
        } else if (panel.kind === "cast" || panel.kind === "agendas") {
          expect(roles.has(panel.role), panel.role).toBe(true);
        }
      }
    }
    expect([...acts].sort()).toEqual([1, 2, 3]);
    expect(builder.steps.find((s) => s.id === "act3")!.panels[0]).not.toHaveProperty("fields", expect.arrayContaining(["actEnd"]));
  });

  it("casts PCs, crew NPCs and site locations with fields from the entity schemas", () => {
    expect(builder.cast.map((c) => [c.id, c.entityType, c.subtype ?? null])).toEqual([
      ["pcs", "alien.character", null],
      ["npcs", "alien.character", null],
      ["locations", "alien.location", "site"],
    ]);
    expect(builder.cast[0]!.defaults).toEqual({ isPC: true });
    for (const role of builder.cast) {
      for (const f of role.fields ?? []) expect(fieldSchemaAt(entitySchema(role.entityType), f), `${role.id}: ${f}`).toBeDefined();
    }
  });

  it("review rules have unique ids, known steps and collections, and one test each", () => {
    const stepIds = new Set<string>(STEP_IDS);
    const collections = new Set(["pcs", "npcs", "locations", "acts", "scenes"]);
    expect(new Set(builder.review.map((r) => r.id)).size).toBe(builder.review.length);
    for (const r of builder.review) {
      expect(stepIds.has(r.step), r.id).toBe(true);
      if (r.each) expect(collections.has(r.each), r.id).toBe(true);
      expect((r.when === undefined) !== (r.check === undefined), r.id).toBe(true);
      expect(["bad", "warn"]).toContain(r.level);
      expect(r.message.length, r.id).toBeGreaterThan(0);
    }
    // Every step with fields to fill has at least one rule; review has none of its own.
    for (const s of STEP_IDS.filter((s) => s !== "review")) expect(builder.review.some((r) => r.step === s), s).toBe(true);
  });
});

describe("narrative fields and the builder template", () => {
  it("defines adventure, act and scene fields, cinematic only, with sheet paths in the schema", () => {
    expect(narrativeFields.map((n) => n.kind)).toEqual(["adventure", "act", "scene"]);
    for (const n of narrativeFields) {
      expect(n.mode).toEqual(["cinematic"]);
      for (const section of n.sheet.sections) for (const f of section.fields) expect(fieldSchemaAt(n.schema, f.path), `${n.kind}: ${f.path}`).toBeDefined();
    }
  });

  it("keeps the theme ids of the campaign-theme table and the book defaults", () => {
    const tableThemes = campaignTheme.rows.map((r) => (r.result as { theme: string }).theme);
    expect([...THEME_IDS]).toEqual(tableThemes);
    const adv = narrativeFields[0]!.schema as { properties: Record<string, { default?: unknown }> };
    expect(adv.properties.year!.default).toBe(2184);
    expect(adv.properties.targetHours!.default).toBe(4);
    expect(adv.properties.theme!.default).toBe("killing-greed");
    for (const ref of ["alien.campaign-themes", "alien.fear-stages"]) expect(alienModule.referenceLists.some((l) => l.id === ref), ref).toBe(true);
  });

  it("scaffolds three empty acts of 75, 100 and 65 minutes at dread, terror and horror", () => {
    expect(cinematicBuilderScaffold.title).toBe("");
    expect(cinematicBuilderScaffold.acts.map((a) => [a.number, a.fields.minutes, a.fields.fearStage, a.goal, a.scenes?.length])).toEqual([
      [1, 75, "dread", "", 1],
      [2, 100, "terror", "", 1],
      [3, 65, "horror", "", 1],
    ]);
    expect(cinematicBuilderScaffold.playerIntro).toBeUndefined();
    expect(cinematicBuilderScaffold.gmSituation).toBeUndefined();
  });
});

describe("PC creation check (p. 25-26)", () => {
  it("accepts the book's example roughneck", () => {
    expect(pcCreationIssues(nat)).toEqual([]);
  });

  it("flags totals, ranges, skill caps and a talent from another career", () => {
    const bad = member("x", "Vic", {
      career: "pilot",
      attributes: { strength: 2, agility: 4, wits: 6, empathy: 3 },
      skills: { piloting: 3, comtech: 2, closeCombat: 2, mobility: 1, observation: 1 },
      talents: [{ id: "true-grit" }],
    });
    expect(pcCreationIssues(bad)).toEqual([
      "Vic: attributes total 15 (should be 14)",
      "Vic: Wits 6 (allowed 2-4)",
      "Vic: skill points 9 (should be 10)",
      "Vic: Close Combat 2 (max 1 for this career)",
      "Vic: the starting talent should be one of the Pilot's: Full Throttle, Like the Back of Your Hand, Reckless",
    ]);
  });

  it("allows 5 in the key attribute only, and the android bonus for synthetic PCs", () => {
    const keyFive = (key: string) =>
      pcCreationIssues(member("x", "K", { career: "scientist", attributes: { strength: 2, agility: 3, wits: 4, empathy: 4, [key]: 5 }, skills: { observation: 3, survival: 3, comtech: 3, medicalAid: 1 } }));
    expect(keyFive("wits").filter((m) => m.includes("allowed"))).toEqual([]);
    expect(keyFive("empathy")).toContain("K: Empathy 5 (allowed 2-4)");
    const android = member("a", "Bishop", { android: true, career: "pilot", attributes: { strength: 5, agility: 8, wits: 4, empathy: 3 }, skills: { piloting: 3, rangedCombat: 3, comtech: 3, observation: 1 } });
    expect(pcCreationIssues(android)).toEqual([]);
  });

  it("asks for a career before judging attribute ranges", () => {
    expect(pcCreationIssues(member("x", "", {}))[0]).toBe("PC {n}: pick a career so the stats can be checked");
  });
});

describe("review of a hand-built draft (sdk review engine)", () => {
  it("passes the module conformance checks for builders and narrative fields", () => {
    const report = checkModule(alienModule, { skipProcedureRuns: true });
    const mine = report.issues.filter((i) => i.where.startsWith("builder:") || i.where.startsWith("narrativeFields") || i.where.startsWith("template:alien.template.cinematic-builder"));
    expect(mine.map((i) => `${i.severity} ${i.where}: ${i.message}`)).toEqual([]);
  });

  it("an empty draft lists the bad items to fix", () => {
    const result = review(emptyDraft());
    const issues = result.items.filter((i) => i.level !== "ok");
    expect(reviewHeadline(result)).toBe(`${result.summary.bad} items to fix`);
    expect(ids(issues, "bad")).toEqual(
      [
        "basics.title",
        "situation.mission",
        "situation.truth",
        "pcs.name",
        "pcs.agenda",
        "npcs.name",
        "locations.name",
        "act1.summary",
        "act2.summary",
        "act3.summary",
        "finale.opening",
      ].sort(),
    );
    const messages = issues.map((i) => i.message);
    expect(messages).toContain("PC 1: needs a name");
    expect(messages).toContain("NPC 2: needs a name");
    expect(messages).toContain("Location 3: needs a name");
    expect(messages.filter((m) => /write the Act \d agenda/.test(m))).toEqual(["PC 1: write the Act 1 agenda", "PC 1: write the Act 2 agenda", "PC 1: write the Act 3 agenda"]);
    expect(result.byStep.basics).toBe("bad");
    expect(result.byStep.review).toBe("none");
    expect(issues.filter((i) => /could not run/.test(i.message))).toEqual([]);
    // The default act lengths (240 min) match the default 4-hour target.
    expect(ids(issues)).not.toContain("basics.length");
    expect(ids(issues, "warn")).toEqual(
      expect.arrayContaining(["situation.tie", "pcs.creation", "pcs.talent", "npcs.want-secret", "npcs.lines", "npcs.betrayal", "locations.puzzles", "act1.events", "act3.timer", "finale.question", "finale.signoff"]),
    );
  });

  it("a filled draft is ready, with no bad items and no warnings", () => {
    const result = review(filledDraft());
    expect(result.items.filter((i) => i.level !== "ok")).toEqual([]);
    expect(reviewHeadline(result)).toBe("Ready");
    expect(Object.values(result.byStep).filter((s) => s !== "ok" && s !== "none")).toEqual([]);
    expect(result.items.map((i) => i.message)).toEqual(expect.arrayContaining(["Title set", "PC stats follow the creation rules", "The opening ends with \"What do you do?\""]));
  });

  it("reads agendas from the cast member's agendaByAct, its agendas field or agenda handouts", () => {
    const ctx = filledDraft();
    expect(agendaText(nat, 2, ctx)).toMatch(/cargo manifest/);
    expect(agendaText(medic, 3, ctx)).toMatch(/wounded/);
    expect(agendaText(medic, 3, { ...ctx, handouts: [] })).toBe("");
    expect(agendaText({ ...medic, agendaByAct: { "1": "Patch up the pilot first." } }, 1, {})).toBe("Patch up the pilot first.");
  });

  it("finds an act's events whether the act holds scene records or the scenes point at the act", () => {
    const ctx = filledDraft();
    const act = (ctx.acts as Rec[])[1]!;
    expect(scenesOfAct(act, ctx)).toHaveLength(3);
    expect(scenesOfAct({ ...act, scenes: ["s1"] }, ctx)).toHaveLength(3);
  });

  it("flags the spec's warnings on a draft that breaks them", () => {
    const ctx = filledDraft();
    const adventure = ctx.adventure as Rec;
    const fields = adventure.fields as Rec;
    fields.targetHours = 2;
    fields.openingNarration = "The lights flicker.";
    fields.countdown = "";
    fields.signOffs = { pc1: "Nat signing off." };
    const acts = ctx.acts as Rec[];
    (acts[0]!.fields as Rec).relief = "";
    (acts[0]!.scenes as Rec[]).forEach((s) => (s.mandatory = true));
    (acts[1]!.scenes as Rec[]).splice(1);
    const pcs = ctx.pcs as Rec[];
    (pcs[0]!.fields as Rec).agendas = [
      { act: 1, text: "Shoot the company man." },
      { act: 2, text: "Make sure the company man never reaches the shuttle, quietly and alone." },
      { act: 3, text: "Get the shuttle launched with your partner aboard, even if others stay behind." },
    ];
    const npcs = ctx.npcs as Rec[];
    Object.assign(npcs[1]!.fields as Rec, { android: false, fairClues: ["Never eats", " "], secretOrders: "" });
    (npcs[0]!.fields as Rec).secret = "Owes money.";
    (ctx.locations as Rec[])[0]!.fields = { puzzle: "Jammed airlock" };

    const issues = issuesOf(ctx);
    expect(ids(issues, "bad")).toEqual([]);
    expect(ids(issues)).toEqual(
      [
        "basics.length",
        "pcs.agenda-short",
        "pcs.agenda-conflict",
        "npcs.synthetic-android",
        "npcs.clues",
        "npcs.orders",
        "npcs.betrayal",
        "locations.fallback",
        "locations.clue",
        "act1.relief",
        "act1.mandatory",
        "act2.events",
        "act3.timer",
        "finale.question",
        "finale.signoff",
      ].sort(),
    );
    const messages = issues.map((i) => i.message);
    expect(messages).toContain("Acts total 240 min against a 120-minute target; bring them within 30 minutes of it");
    expect(messages).toContain("Nat: the Act 1 agenda is very short; make it a concrete action");
    expect(messages).toContain("Nat: the Act 1 agenda invites open conflict; save that for Act 3");
    expect(messages).toContain("Act 1: 3 mandatory events; more than 2 starts to feel railroaded");
    expect(messages).toContain("Act 2: 1 events (3-7 per act works well)");
    expect(messages).toContain("Write a sign-off for Hayes");
    expect(messages).toContain("Docking ring: the puzzle needs a loud or slow fallback");
  });

  it("counts a timer word in Act 3's pressure as a countdown", () => {
    const ctx = filledDraft();
    ((ctx.adventure as Rec).fields as Rec).countdown = "";
    ((ctx.acts as Rec[])[2]!.fields as Rec).pressure = "Ten minutes of air left in the suits.";
    expect(ids(issuesOf(ctx))).toEqual([]);
  });
});
