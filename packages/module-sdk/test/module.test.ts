import { describe, expect, it } from "vitest";
import { checkModule, filterByMode, loadModule, ModuleConformanceError } from "../src/module";
import { CONTRACT_VERSION, type GameModule, type RollTable } from "../src/types";

function minimalModule(): GameModule {
  return {
    manifest: {
      id: "min",
      version: "1.0.0",
      name: "Min",
      ruleset: "Min",
      licenseNotice: "none",
      requiredCore: CONTRACT_VERSION,
      modes: [{ id: "a", name: "A" }, { id: "b", name: "B" }],
      defaultMode: "a",
      dataStatus: "verified",
    },
    dice: {
      dice: [{ id: "d6", name: "d6", faces: 6 }],
      buildPool: () => ({ dice: { d6: 1 } }),
      roll: (pool, rng) => ({ pool, dice: [{ die: "d6", value: rng.int(1, 6) }], successes: 0, symbols: {}, pushes: 0, canPush: false }),
      describe: () => "",
    },
    entityTypes: [
      {
        id: "min.thing",
        kind: "item",
        name: "Thing",
        plural: "Things",
        schema: { type: "object", properties: { weight: { type: "number", default: 1 }, color: { type: "string", enum: ["red", "blue"] } } },
        sheet: { sections: [{ id: "s", title: "S", fields: [{ path: "weight" }, { path: "color", widget: "select", options: ["red"] }] }] },
        computed: { heavy: { ">": [{ var: "fields.weight" }, 5] } },
      },
    ],
    relationshipTypes: [{ id: "min.likes", forward: "likes", reverse: "liked by" }],
    referenceLists: [{ id: "min.colors", name: "Colors", items: [{ id: "red", name: "Red" }] }],
    presets: [{ id: "min.preset", entityType: "min.thing", name: "P", fields: { weight: 2 } }],
    tables: [
      {
        id: "min.t1",
        name: "T1",
        page: 1,
        dice: "d6",
        rows: [
          { range: [1, 3], result: "low" },
          { range: [4, 6], result: "high" },
        ],
      },
    ],
    procedures: [
      {
        id: "min.proc",
        name: "Proc",
        steps: [{ id: "one", table: "min.t1" }],
        produce: (ctx) => ({ entities: [{ tempId: "x", type: "min.thing", name: String(ctx.get("one")), fields: {} }], relationships: [] }),
      },
    ],
    templates: [{ id: "min.tpl", kind: "scene", name: "Scene", scaffold: { purpose: "x" } }],
    rules: [{ id: "min.rule", title: "R", summary: "s", page: 2, links: { tables: ["min.t1"], fields: ["min.thing.weight"] } }],
    trackers: [{ id: "min.tracker", name: "Tr", kind: "counter", scope: "character", binds: ["min.thing.weight"], rules: ["min.rule"] }],
    calendar: { id: "min.cal", name: "Cal", defaultYear: 1, months: [{ name: "M", days: 30 }] },
  };
}

const errorsOf = (m: GameModule) => checkModule(m, { seeds: 20 }).issues.filter((i) => i.severity === "error");

describe("checkModule", () => {
  it("passes a minimal valid module", () => {
    const report = checkModule(minimalModule(), { seeds: 50 });
    expect(report.issues.filter((i) => i.severity === "error")).toEqual([]);
    expect(report.ok).toBe(true);
  });

  it("catches a coverage gap", () => {
    const m = minimalModule();
    m.tables[0]!.rows = [
      { range: [1, 2], result: "a" },
      { range: [4, 6], result: "b" },
    ];
    const errs = errorsOf(m);
    expect(errs.some((e) => e.where === "table:min.t1" && /no row covers total 3/.test(e.message))).toBe(true);
  });

  it("catches an overlap", () => {
    const m = minimalModule();
    m.tables[0]!.rows = [
      { range: [1, 4], result: "a" },
      { range: [4, 6], result: "b" },
    ];
    const errs = errorsOf(m);
    expect(errs.some((e) => e.where === "table:min.t1" && /overlap/.test(e.message))).toBe(true);
  });

  it("accounts for modifiers when checking coverage", () => {
    const m = minimalModule();
    const t: RollTable = {
      id: "min.t2",
      name: "T2",
      dice: "2d6",
      modifiers: [{ when: { var: "x" }, add: -2 }, { add: 3 }],
      rows: [
        { range: [0, 6], result: "a" },
        { range: [7, 15], result: "b" },
      ],
    };
    m.tables.push(t);
    expect(errorsOf(m).filter((e) => e.where === "table:min.t2")).toEqual([]);
    t.rows = [
      { range: [2, 6], result: "a" },
      { range: [7, 12], result: "b" },
    ];
    const errs = errorsOf(m).filter((e) => e.where === "table:min.t2");
    expect(errs).toHaveLength(1);
    expect(errs[0]?.message).toMatch(/0, 1, 13, 14, 15/);
  });

  it("catches a d66 table that only covers the sums", () => {
    const m = minimalModule();
    m.tables.push({ id: "min.d66", name: "D66", dice: "d66", rows: [{ range: [11, 36], result: "a" }, { range: [37, 60], result: "b" }] });
    const errs = errorsOf(m).filter((e) => e.where === "table:min.d66");
    expect(errs.some((e) => /no row covers/.test(e.message) && /61/.test(e.message))).toBe(true);
  });

  it("checks session checklist templates: phases, namespaced unique ids, modes, pages, events, appliesTo", () => {
    const m = minimalModule();
    m.templates = [
      {
        id: "min.session-checklist",
        kind: "checklist",
        appliesTo: "session",
        name: "Session",
        scaffold: {
          title: "S",
          items: [
            { id: "min.prep.ok", phase: "prep", text: "Fine", guidance: "Fine indeed.", page: [2, 3], mode: ["a"], autoWhen: "revealed" },
            { id: "min.nophase", text: "No phase" },
            { id: "min.badmode", phase: "wrap", text: "Mode", mode: ["zzz"] },
            { id: "prep.goal", phase: "prep", text: "Not namespaced" },
            { id: "min.dup", phase: "play", text: "One" },
            { id: "min.dup", phase: "play", text: "Two" },
            { id: "min.event", phase: "play", text: "Event", autoWhen: "dinner" as never },
            { id: "min.page", phase: "play", text: "Page", page: -1 },
          ],
        },
      },
      { id: "min.empty", kind: "checklist", appliesTo: "session", name: "Empty", scaffold: { title: "E", items: [] } },
      { id: "min.adventure", kind: "adventure", appliesTo: "session", name: "A", scaffold: { title: "A", acts: [] } },
    ];
    const errors = checkModule(m).issues.filter((i) => i.severity === "error");
    const where = (suffix: string) => errors.filter((e) => e.where === `template:min.session-checklist:item:${suffix}`).map((e) => e.message);
    expect(where("min.prep.ok")).toEqual([]);
    expect(where("min.nophase")).toEqual([expect.stringMatching(/phase/)]);
    expect(where("min.badmode")).toEqual([expect.stringMatching(/undeclared mode/)]);
    expect(where("prep.goal")).toEqual([expect.stringMatching(/module id/)]);
    expect(where("min.dup")).toEqual([expect.stringMatching(/duplicate/)]);
    expect(where("min.event")).toEqual([expect.stringMatching(/autoWhen/)]);
    expect(where("min.page")).toEqual([expect.stringMatching(/page/)]);
    expect(errors.find((e) => e.where === "template:min.empty")?.message).toMatch(/no items/);
    expect(errors.find((e) => e.where === "template:min.adventure")?.message).toMatch(/appliesTo/);

    // a session-zero checklist needs no phases or namespacing
    m.templates = [{ id: "min.zero", kind: "checklist", name: "Zero", scaffold: { title: "Z", items: [{ id: "q", text: "Q?" }] } }];
    expect(checkModule(m).ok).toBe(true);
  });

  it("rejects a module whose id would clash with the core checklist ids", () => {
    const m = minimalModule();
    m.manifest.id = "prep";
    m.templates = [{ id: "prep.c", kind: "checklist", appliesTo: "session", name: "C", scaffold: { title: "C", items: [{ id: "prep.goal", phase: "prep", text: "Clash" }] } }];
    expect(checkModule(m).issues.some((i) => i.severity === "error" && /clashes with the core/.test(i.message))).toBe(true);
  });

  it("catches a missing rule page", () => {
    const m = minimalModule();
    (m.rules[0] as { page?: unknown }).page = undefined;
    expect(errorsOf(m).some((e) => e.where === "rule:min.rule" && /page/.test(e.message))).toBe(true);
  });

  it("catches dangling links", () => {
    const m = minimalModule();
    m.rules[0]!.links = { tables: ["min.nope"], rules: ["min.ghost"], trackers: ["min.tr2"], fields: ["min.thing.nope", "other.x"] };
    const errs = errorsOf(m).filter((e) => e.where === "rule:min.rule");
    expect(errs.map((e) => e.message)).toEqual(
      expect.arrayContaining([
        expect.stringContaining('unknown table "min.nope"'),
        expect.stringContaining('unknown rule "min.ghost"'),
        expect.stringContaining('unknown tracker "min.tr2"'),
        expect.stringContaining('unknown field "nope"'),
        expect.stringContaining('"other.x"'),
      ]),
    );
  });

  it("catches sheet, reference, mode, relationship, nested table and procedure problems", () => {
    const m = minimalModule();
    m.entityTypes[0]!.sheet.sections[0]!.fields.push({ path: "ghost" }, { path: "weight", options: { ref: "min.nolist" } }, { path: "color", options: ["green"] }, { path: "weight", mode: ["zzz"] });
    m.relationshipTypes.push({ id: "within", forward: "w", reverse: "c" });
    m.tables[0]!.rows[0]!.roll = [{ table: "min.missing", as: "x" }];
    m.procedures[0]!.steps.push({ id: "two", table: "min.nope", reads: ["nope"] });
    m.rules[0]!.mode = ["zzz"];
    m.trackers[0]!.binds = ["nothing.here"];
    m.trackers[0]!.rules = ["min.norule"];
    m.presets[0]!.entityType = "min.unknown";
    m.manifest.requiredCore = "7.0.0";
    const errs = errorsOf(m);
    const msgs = errs.map((e) => `${e.where}: ${e.message}`);
    expect(msgs).toEqual(
      expect.arrayContaining([
        expect.stringContaining('sheet field path "ghost"'),
        expect.stringContaining('unknown reference list "min.nolist"'),
        expect.stringContaining('select option "green"'),
        expect.stringContaining('undeclared mode "zzz"'),
        expect.stringContaining('clashes with core relationship type "within"'),
        expect.stringContaining('nests unknown table "min.missing"'),
        expect.stringContaining('unknown table "min.nope"'),
        expect.stringContaining('reads unknown step "nope"'),
        expect.stringContaining('binds path "nothing.here"'),
        expect.stringContaining('unknown rule "min.norule"'),
        expect.stringContaining('unknown entity type "min.unknown"'),
        expect.stringContaining("requiredCore"),
      ]),
    );
  });

  it("reports the seed when a procedure throws, and preset schema problems as warnings", () => {
    const m = minimalModule();
    m.procedures[0]!.produce = (ctx) => {
      if (ctx.rolls[0]?.total === 6) throw new Error("boom");
      return { entities: [], relationships: [] };
    };
    m.presets[0]!.fields = { weight: "heavy" };
    const report = checkModule(m, { seeds: 100 });
    expect(report.ok).toBe(false);
    expect(report.issues.some((i) => i.severity === "error" && i.where === "procedure:min.proc" && /threw for seed "conformance-\d+": boom/.test(i.message))).toBe(true);
    expect(report.issues.some((i) => i.severity === "warning" && i.where === "preset:min.preset")).toBe(true);
  });
});

describe("loadModule", () => {
  it("builds lookups", () => {
    const loaded = loadModule(minimalModule(), { seeds: 10 });
    expect(loaded.entityType("min.thing")?.name).toBe("Thing");
    expect(loaded.table("min.t1")?.name).toBe("T1");
    expect(loaded.tables.all()).toHaveLength(1);
    expect(loaded.procedure("min.proc")?.name).toBe("Proc");
    expect(loaded.rule("min.rule")?.title).toBe("R");
    expect(loaded.rulesForField("min.thing", "weight").map((r) => r.id)).toEqual(["min.rule"]);
    expect(loaded.rulesForTable("min.t1").map((r) => r.id)).toEqual(["min.rule"]);
    expect(loaded.rulesForTable("none")).toEqual([]);
    expect(loaded.referenceList("min.colors")?.items).toHaveLength(1);
    expect(loaded.referenceItem("min.colors", "red")?.name).toBe("Red");
    expect(loaded.preset("min.preset")?.name).toBe("P");
    expect(loaded.presetsFor("min.thing")).toHaveLength(1);
    expect(loaded.template("min.tpl")?.kind).toBe("scene");
    expect(loaded.templatesFor("scene")).toHaveLength(1);
    expect(loaded.templatesFor("adventure")).toHaveLength(0);
    expect(loaded.tracker("min.tracker")?.kind).toBe("counter");
    expect(loaded.relationshipTypes.map((r) => r.id)).toContain("within");
    expect(loaded.relationshipTypes.map((r) => r.id)).toContain("min.likes");
    expect(loaded.forMode("a").rules).toHaveLength(1);
    expect(loaded.module.manifest.id).toBe("min");
  });

  it("throws on conformance errors", () => {
    const m = minimalModule();
    m.tables[0]!.rows = [{ range: [1, 5], result: "a" }];
    expect(() => loadModule(m, { seeds: 5 })).toThrow(ModuleConformanceError);
  });
});

describe("filterByMode", () => {
  it("keeps untagged and matching items", () => {
    const items = [{ id: 1 }, { id: 2, mode: ["a"] }, { id: 3, mode: ["b"] }, { id: 4, mode: [] }];
    expect(filterByMode(items, "a").map((i) => i.id)).toEqual([1, 2, 4]);
  });
});

describe("checkModule: ledger, crew ship and travel", () => {
  function withEconomy(): GameModule {
    const m = minimalModule();
    m.ledger = {
      currency: { name: "coin", symbol: "c" },
      defaultAccount: "Purse",
      categories: [
        { id: "pay", label: "Pay", direction: "in", page: 3 },
        { id: "other", label: "Other", direction: "either" },
      ],
      payouts: [{ entityType: "min.thing", amountPath: "weight", category: "pay", label: "Sell" }],
    };
    m.crewShip = { entityTypes: ["min.thing"], setting: "thing", stats: [{ label: "Weight", path: "weight" }, { label: "Heavy", path: "heavy", format: "flag" }], lists: [], betweenJobs: "min.proc" };
    m.travel = {
      distance: { unit: "mile", plural: "miles" },
      destinations: [{ entityType: "min.thing" }],
      plan: () => ({ days: 1, summary: "", checks: [], notes: [] }),
      arrive: () => ({ rolls: [], log: [], effects: [] }),
    };
    return m;
  }

  it("accepts a well-formed definition", () => {
    const report = checkModule(withEconomy(), { skipProcedureRuns: true });
    expect(report.issues.filter((i) => i.severity === "error")).toEqual([]);
  });

  it("reports bad categories, payouts, stats, procedures and destinations", () => {
    const m = withEconomy();
    m.ledger!.categories.push({ id: "pay", label: "Again", direction: "in" }, { id: "odd", label: "", direction: "sideways" as "in", page: 0 });
    m.ledger!.payouts!.push({ entityType: "min.nothing", amountPath: "x", category: "nope", label: "X" });
    m.crewShip!.stats!.push({ label: "Ghost", path: "ghost" });
    m.crewShip!.betweenJobs = "min.missing";
    m.travel!.destinations.push({ entityType: "min.thing", subtypes: ["cave"] }, { entityType: "min.place" });
    const errors = checkModule(m, { skipProcedureRuns: true }).issues.filter((i) => i.severity === "error").map((i) => `${i.where}: ${i.message}`);
    for (const expected of [
      'ledger:category:pay: duplicate ledger category id "pay"',
      "ledger:category:odd: category has no label",
      'ledger:category:odd: invalid direction "sideways"',
      "ledger:category:odd: invalid page reference",
      'ledger:payout:min.nothing: unknown entity type "min.nothing"',
      'ledger:payout:min.nothing: unknown ledger category "nope"',
      'crewShip: stat "Ghost" reads unknown field or computed key "ghost"',
      'crewShip: betweenJobs references unknown procedure "min.missing"',
      'travel: unknown subtype "cave" of "min.thing"',
      'travel: unknown destination entity type "min.place"',
    ]) {
      expect(errors).toContain(expected);
    }
  });
});

describe("citations and licences", () => {
  const where = (m: GameModule) => checkModule(m, { skipProcedureRuns: true }).issues.filter((i) => i.severity === "error").map((i) => `${i.where}: ${i.message}`);

  it("accepts a page, a section cite or original content on rule cards", () => {
    const m = minimalModule();
    m.rules = [
      { id: "min.rule.page", title: "Page", summary: "s", page: 3 },
      { id: "min.rule.cite", title: "Cite", summary: "s", cite: "SRD 5.1, Conditions" },
      { id: "min.rule.own", title: "Own", summary: "s", original: true },
      { id: "min.rule.none", title: "None", summary: "s" },
      { id: "min.rule.blank", title: "Blank", summary: "s", cite: " " },
    ];
    const errors = where(m);
    expect(errors).toContain("rule:min.rule.none: rule card cites no source: give it a page, a cite, or mark it original");
    expect(errors).toContain("rule:min.rule.blank: cite must be one line of text (1-200 characters)");
    expect(errors.filter((e) => /min\.rule\.(page|cite|own)/.test(e))).toEqual([]);
  });

  it("checks the licence and its links", () => {
    const m = minimalModule();
    m.manifest.license = { name: "CC BY 4.0", attribution: "", url: "javascript:alert(1)" };
    m.manifest.sourceBook = { title: "Book", url: "ftp://x" };
    const errors = where(m);
    expect(errors).toContain("manifest:min: license needs the attribution text it requires");
    expect(errors).toContain("manifest:min: license url must be an http(s) link");
    expect(errors).toContain("manifest:min: sourceBook url must be an http(s) link");
    m.manifest.license = { spdx: "CC-BY-4.0", name: "CC BY 4.0", attribution: "Includes material from X.", url: "https://creativecommons.org/licenses/by/4.0/" };
    m.manifest.sourceBook = { title: "Book" };
    expect(where(m).filter((e) => e.startsWith("manifest"))).toEqual([]);
  });
});

describe("checkModule: weapons fields and create paths", () => {
  const withWeapons = (config: Record<string, unknown>, create: string[] = ["arms"]): GameModule => {
    const m = minimalModule();
    m.presets.push({ id: "min.club", entityType: "min.thing", name: "Club", tags: ["hand"], fields: { weight: 1 } });
    m.entityTypes.push({
      id: "min.hero",
      kind: "character",
      name: "Hero",
      plural: "Heroes",
      schema: {
        type: "object",
        properties: {
          skills: { type: "object", properties: { fight: { type: "integer" }, shoot: { type: "integer" } } },
          arms: { type: "array", items: { type: "object", properties: { name: { type: "string" }, weight: { type: "number" }, reach: { type: "string" } } } },
        },
      },
      computed: { load: { sum: [{ map: [{ var: "fields.arms" }, { var: "weight" }] }] } },
      sheet: {
        sections: [
          { id: "s", title: "S", fields: [{ path: "skills", widget: "skills", config: { skills: [{ id: "fight" }, { id: "shoot" }] } }] },
          { id: "w", title: "W", fields: [{ path: "arms", widget: "weapons", config }] },
        ],
        create,
      },
    });
    return m;
  };
  const good = {
    presets: { entityType: "min.thing", tags: ["hand"] },
    copy: ["weight"],
    columns: [{ key: "weight", label: "Weight" }],
    totalComputed: "load",
    attack: { ranges: [{ id: "near", label: "Near" }, { id: "far", label: "Far" }], minRangeKey: "reach", maxRangeKey: "reach", skill: { if: [{ "==": [{ var: "range" }, "near"] }, "fight", "shoot"] }, damage: 1 },
  };

  it("passes a sound config", () => {
    expect(errorsOf(withWeapons(good))).toEqual([]);
  });

  it("catches a missing config, unknown keys and sources, a bad create path, and an attack rolling a skill the sheet lacks", () => {
    expect(errorsOf(withWeapons({})).map((e) => e.message)).toContain("weapons widget needs config.copy and config.columns lists");
    const msgs = errorsOf(
      withWeapons(
        { ...good, copy: ["weight", "colour"], edit: ["size"], columns: [{ key: "heft", label: "Heft" }], items: { entityType: "min.nope" }, limitComputed: "cap", attack: { ...good.attack, skill: "dance" } },
        ["arms", "nothing"],
      ),
    ).map((e) => e.message);
    expect(msgs).toEqual(
      expect.arrayContaining([
        'copy key "colour" is not a property of the weapon rows',
        'edit key "size" is not a property of the weapon rows',
        'column key "heft" is not a property of the weapon rows',
        'weapons source references unknown entity type "min.nope"',
        'limitComputed "cap" is not a computed value',
        'create path "nothing" does not exist',
        `an attack at Near rolls "dance", which the sheet's skills widget does not offer`,
      ]),
    );
  });
});
