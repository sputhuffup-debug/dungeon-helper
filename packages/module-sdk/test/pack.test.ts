import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  checkModule,
  createRng,
  formatPackIssue,
  loadPack,
  mergePackParts,
  packToModule,
  parsePackJson,
  PACK_LIMITS,
  runProcedure,
  validatePack,
  type ModulePack,
} from "../src";

const dir = new URL("../../module-example/packs/example-pack/", import.meta.url);
const read = (name: string) => JSON.parse(readFileSync(new URL(name, dir), "utf8")) as Record<string, unknown>;
const mainFile = () => read("pack.json");
const partFile = () => read("rules.part.json");
const parts = () => [{ name: "rules.part.json", data: partFile() }];
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

function errorsOf(input: unknown, withParts = true): string[] {
  return loadPack(input, { parts: withParts ? parts() : [], skipProcedureRuns: true })
    .issues.filter((i) => i.severity === "error")
    .map(formatPackIssue);
}

describe("example data pack", () => {
  it("loads with no issues at all", () => {
    const res = loadPack(mainFile(), { parts: parts(), seeds: 50 });
    expect(res.issues.map(formatPackIssue)).toEqual([]);
    expect(res.ok).toBe(true);
    const m = res.module!;
    expect(m.manifest.id).toBe("example-pack");
    expect(m.manifest.license?.spdx).toBe("CC-BY-4.0");
    expect(m.dice.engine).toBe("d20");
    // the part's rule cards and table are merged in
    expect(m.rules.map((r) => r.id)).toContain("example-pack.rule.lantern");
    expect(m.tables.map((t) => t.id)).toContain("example-pack.weather.today");
    expect(checkModule(m, { seeds: 20 }).ok).toBe(true);
  });

  it("exercises every collection and step kind", () => {
    const pack = mainFile() as unknown as ModulePack;
    const merged = mergePackParts(pack, parts()).value!;
    for (const c of ["entityTypes", "relationshipTypes", "referenceLists", "presets", "tables", "procedures", "templates", "rules", "trackers", "playGuides"] as const) {
      expect(merged[c]?.length, c).toBeGreaterThan(0);
    }
    const steps = merged.procedures![0]!.steps;
    expect(steps.some((s) => typeof s.table === "string")).toBe(true);
    expect(steps.some((s) => s.table !== undefined && typeof s.table === "object")).toBe(true);
    expect(steps.some((s) => s.roll && s.value)).toBe(true);
    for (const k of ["skipIf", "modifier", "derive", "display", "optional", "reads"] as const) expect(steps.some((s) => s[k] !== undefined), k).toBe(true);
    expect(new Set(steps.map((s) => typeof s.repeat))).toEqual(new Set(["undefined", "object", "string", "number"]));
    const rules = merged.rules!;
    expect(rules.some((r) => r.page !== undefined) && rules.some((r) => r.cite !== undefined) && rules.some((r) => r.original)).toBe(true);
  });

  it("runs procedures deterministically, filling entities from the results", () => {
    const m = loadPack(mainFile(), { parts: parts(), skipProcedureRuns: true }).module!;
    const proc = m.procedures[0]!;
    for (const seed of ["a", "b", "c", "d"]) {
      const run = () => runProcedure(proc, m, { seed, inputs: { depth: 1, lucky: false }, includeOptional: ["omen"] });
      const a = run();
      expect(run()).toEqual(a);
      const site = a.produced.entities.find((e) => e.tempId === "site")!;
      const results = a.results as Record<string, { kind?: string; level?: string }>;
      expect(site.fields.kind).toBe(results.kind!.kind);
      expect(site.fields.danger).toBe(results.danger!.level);
      expect(typeof site.fields.coins).toBe("number");
      expect((a.results.omen as unknown[]).length).toBe(2);
      // derive added a flag
      expect(typeof (a.results.danger as { hostile?: unknown }).hostile).toBe("boolean");
      // every relationship points at a produced entity
      const ids = new Set(a.produced.entities.map((e) => e.tempId));
      for (const r of a.produced.relationships) expect(ids.has(r.from) && ids.has(r.to)).toBe(true);
      // the roll step is recorded
      expect(a.rolls.some((r) => r.step === "coins" && r.dice === "2d6")).toBe(true);
      // display: the danger row's label, plus a note read from the derived flag; steps without one have no line
      const dangerRoll = a.rolls.find((r) => r.step === "danger")!;
      const hostile = (a.results.danger as { hostile: boolean }).hostile;
      expect(a.display).toEqual({ danger: `${dangerRoll.rowLabel}${hostile ? " (hostile)" : ""}` });
    }
  });

  it("shows a step's display line, from its result alone when the step is pinned", () => {
    const m = loadPack(mainFile(), { parts: parts(), skipProcedureRuns: true }).module!;
    const proc = m.procedures[0]!;
    // a pinned step has no roll, so no row label: the line comes from the result, and an empty line is left out
    const hostile = runProcedure(proc, m, { seed: "p", inputs: { depth: 1, lucky: false }, pinned: { danger: { level: "deadly", hostile: true } } });
    expect(hostile.display).toEqual({ danger: " (hostile)" });
    const calm = runProcedure(proc, m, { seed: "p", inputs: { depth: 1, lucky: false }, pinned: { danger: { level: "calm", hostile: false } } });
    expect(calm.display).toBeUndefined();
    // a repeated step sees the list of its row labels
    const pack = clone(mainFile()) as { procedures: Array<{ steps: Array<Record<string, unknown>> }> };
    pack.procedures[0]!.steps[3]!.display = { cat: [{ len: [{ var: "label" }] }, " finds: ", { var: "label.0" }] };
    const m2 = loadPack(pack, { parts: parts(), skipProcedureRuns: true }).module!;
    const run = runProcedure(m2.procedures[0]!, m2, { seed: "q", inputs: { depth: 1, lucky: false } });
    const loot = run.rolls.filter((r) => r.step === "loot");
    expect(run.display?.loot).toBe(`${loot.length} finds: ${loot[0]!.rowLabel}`);
  });

  it("starts produced entities from a preset, with the entity's own fields on top", () => {
    const m = loadPack(mainFile(), { parts: parts(), skipProcedureRuns: true }).module!;
    const proc = m.procedures[0]!;
    const foes = ["a", "b", "c", "d", "e", "f", "g", "h"].flatMap((seed) => runProcedure(proc, m, { seed, inputs: { depth: 3, lucky: false } }).produced.entities.filter((e) => e.tempId.startsWith("foe")));
    expect(foes.length).toBeGreaterThan(0);
    for (const f of foes) {
      expect(f.preset).toBe("example-pack.preset.gloomling");
      // defense and attack from the preset; hp and lair from the produce fields
      expect(f.fields).toMatchObject({ defense: 11, attack: 2, lair: "Somewhere below" });
    }
    // an unknown preset fails the run, and the conformance suite reports it
    const bad = clone(mainFile()) as { procedures: Array<{ produce: { entities: Array<Record<string, unknown>> } }> };
    bad.procedures[0]!.produce.entities[1]!.preset = "example-pack.preset.nope";
    const res = loadPack(bad, { parts: parts(), seeds: 20 });
    expect(res.issues.some((i) => i.severity === "error" && /unknown preset "example-pack.preset.nope"/.test(i.message))).toBe(true);
    // a preset of another entity type is refused
    bad.procedures[0]!.produce.entities[1]!.preset = "example-pack.preset.keeper";
    expect(loadPack(bad, { parts: parts(), seeds: 20 }).issues.some((i) => /is a example-pack.adventurer, not a example-pack.monster/.test(i.message))).toBe(true);
  });

  it("chooses a table with JSONLogic and offers chains with computed inputs", () => {
    const m = loadPack(mainFile(), { parts: parts(), skipProcedureRuns: true }).module!;
    const proc = m.procedures[0]!;
    const lucky = runProcedure(proc, m, { seed: "x", inputs: { depth: 2, lucky: true } });
    expect(lucky.rolls.filter((r) => r.step === "loot").every((r) => r.table === "example-pack.loot.rare")).toBe(true);
    const chain = proc.chains![0]!;
    // the chain reads the inputs of the run
    const ctx = { inputs: { depth: 2 }, results: {}, rolls: [], tables: { get: () => undefined, all: () => [] }, get: () => undefined, data: () => ({ depth: 2 }) };
    expect(chain.inputs!(ctx)).toEqual({ depth: 3 });
  });
});

describe("pack validation", () => {
  it("rejects what is not a pack", () => {
    expect(validatePack(null).ok).toBe(false);
    expect(validatePack([]).ok).toBe(false);
    expect(validatePack({ format: "other" }).issues[0]!.message).toMatch(/not a Campaign Forge data pack/);
    expect(validatePack(partFile()).issues[0]!.message).toMatch(/part of a split pack/);
  });

  it("reports schema errors with JSON paths and item ids", () => {
    const bad = mainFile() as Record<string, any>;
    bad.tables[1].rows[0].range = [1];
    bad.procedures[0].steps[0].bogus = true;
    delete bad.manifest.license;
    const errors = errorsOf(bad);
    expect(errors).toContain("$.tables[1].rows[0].range (example-pack.site.danger): must NOT have fewer than 2 items");
    expect(errors).toContain('$.procedures[0].steps[0] (example-pack.proc.delve): unknown property "bogus"');
    expect(errors).toContain('$.manifest: missing required property "license"');
  });

  it("requires every id to be namespaced with the pack id", () => {
    const bad = mainFile() as Record<string, any>;
    bad.tables[0].id = "alien.world.size";
    bad.rules[0].id = "example.rule.push";
    bad.calendar.id = "calendar";
    const errors = errorsOf(bad);
    expect(errors).toContain('$.tables[0].id (alien.world.size): table id "alien.world.size" must start with "example-pack." (ids are namespaced by the pack id)');
    expect(errors.some((e) => e.startsWith("$.rules[0].id"))).toBe(true);
    expect(errors.some((e) => e.startsWith("$.calendar.id"))).toBe(true);
  });

  it("allows only known JSONLogic operators and the safe JSON Schema subset", () => {
    const bad = mainFile() as Record<string, any>;
    bad.entityTypes[0].computed.evil = { method: [{ var: "fields" }, "constructor"] };
    bad.procedures[0].steps[4].value = { eval: ["1+1"] };
    bad.entityTypes[0].schema.properties.notes.pattern = "(a+)+$";
    bad.referenceLists[0].itemSchema.$ref = "https://example.org/remote.json";
    bad.dice.proficiency = { method: ["x", "y"] };
    bad.procedures[0].steps[1].display = { method: ["x", "y"] };
    const errors = errorsOf(bad);
    expect(errors).toContain('$.entityTypes[0].computed.evil (example-pack.adventurer): JSONLogic: unknown operator "method"');
    expect(errors).toContain('$.procedures[0].steps[4].value (example-pack.proc.delve): JSONLogic: unknown operator "eval"');
    expect(errors).toContain('$.entityTypes[0].schema.properties.notes.pattern (example-pack.adventurer): JSON Schema keyword "pattern" is not allowed in a pack');
    expect(errors.some((e) => e.startsWith("$.referenceLists[0].itemSchema.$ref"))).toBe(true);
    expect(errors).toContain('$.dice.proficiency: JSONLogic: unknown operator "method"');
    expect(errors).toContain('$.procedures[0].steps[1].display (example-pack.proc.delve): JSONLogic: unknown operator "method"');
  });

  it("refuses prototype keys, deep nesting and oversized input", () => {
    const proto = JSON.parse('{"format":"campaign-forge-pack","formatVersion":1,"__proto__":{"polluted":true}}');
    expect(validatePack(proto).issues[0]!.message).toMatch(/__proto__/);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    let deep: unknown = 1;
    for (let i = 0; i < PACK_LIMITS.maxDepth + 5; i++) deep = [deep];
    expect(validatePack({ ...mainFile(), styleNotes: deep }).issues[0]!.message).toMatch(/nested deeper/);
    expect(() => parsePackJson(" ".repeat(PACK_LIMITS.maxBytes + 1))).toThrow(/limit/);
    expect(() => parsePackJson("{nope")).toThrow(/not valid JSON/);
  });

  it("reports conformance problems at the item's path", () => {
    const bad = mainFile() as Record<string, any>;
    bad.tables[0].rows.pop();
    delete bad.rules[0].cite;
    bad.entityTypes[0].sheet.sections[0].fields[0].path = "abilities.strength";
    const errors = errorsOf(bad);
    expect(errors).toContain("$.tables[0] (example-pack.site.kind): no row covers total 6 (dice 1d6)");
    expect(errors).toContain("$.rules[0] (example-pack.rule.checks): rule card cites no source: give it a page, a cite, or mark it original");
    expect(errors.some((e) => e.startsWith("$.entityTypes[0] (example-pack.adventurer): sheet field path \"abilities.strength\""))).toBe(true);
  });

  it("checks step shapes the schema allows but the runner cannot use", () => {
    const bad = mainFile() as Record<string, any>;
    bad.procedures[0].steps[0] = { id: "kind" };
    bad.procedures[0].steps[1].value = 1;
    const errors = errorsOf(bad);
    expect(errors).toContain("$.procedures[0].steps[0] (example-pack.proc.delve): step needs one of table, roll or value");
    expect(errors).toContain("$.procedures[0].steps[1] (example-pack.proc.delve): a table step cannot also have roll or value");
  });

  it("reports a bad dice engine config", () => {
    const bad = mainFile() as Record<string, any>;
    bad.dice = { engine: "2d6", bands: [{ min: 7, id: "hit", label: "Hit" }] };
    expect(errorsOf(bad)).toEqual([expect.stringMatching(/^\$\.dice: dice engine: the lowest 2d6 band/)]);
  });
});

describe("split packs", () => {
  it("needs every declared part, once, from the same pack", () => {
    expect(errorsOf(mainFile(), false)).toEqual(['$.parts: part "rules.part.json" is missing']);
    const other = { ...partFile(), pack: "other-pack" };
    expect(mergePackParts(mainFile(), [{ name: "x.json", data: other }]).issues.map(formatPackIssue)).toContain('x.json: $.pack: part belongs to pack "other-pack", not "example-pack"');
    const undeclared = { ...partFile(), name: "extra.json" };
    expect(mergePackParts(mainFile(), [...parts(), { name: "extra.json", data: undeclared }]).ok).toBe(false);
    expect(mergePackParts(mainFile(), [...parts(), ...parts()]).ok).toBe(false);
  });

  it("joins parts in the declared order, whatever order the files come in", () => {
    const main = mainFile() as Record<string, any>;
    main.parts = ["a.json", "b.json"];
    const a = { format: "campaign-forge-pack-part", formatVersion: 1, pack: "example-pack", name: "a.json", rules: [{ id: "example-pack.rule.a", title: "A", summary: "a", original: true }] };
    const b = { format: "campaign-forge-pack-part", formatVersion: 1, pack: "example-pack", name: "b.json", rules: [{ id: "example-pack.rule.b", title: "B", summary: "b", original: true }] };
    const one = mergePackParts(main, [{ data: a }, { data: b }]).value!;
    const two = mergePackParts(main, [{ data: b }, { data: a }]).value!;
    expect(one).toEqual(two);
    expect(one.parts).toBeUndefined();
    expect(one.rules!.slice(-2).map((r) => r.id)).toEqual(["example-pack.rule.a", "example-pack.rule.b"]);
  });

  it("validates each part on its own, naming the file", () => {
    const part = partFile() as Record<string, any>;
    part.tables[0].id = "weather";
    const issues = mergePackParts(mainFile(), [{ name: "rules.part.json", data: part }]).issues.map(formatPackIssue);
    expect(issues.some((i) => i.startsWith("rules.part.json: $.tables[0].id (weather): table id"))).toBe(true);
  });
});

describe("no code paths", () => {
  it("treats code-like strings as plain data everywhere", () => {
    const g = globalThis as Record<string, unknown>;
    delete g.__packPwned;
    const payload = 'x"); globalThis.__packPwned = 1; ("';
    const pack = mainFile() as Record<string, any>;
    pack.manifest.name = `${payload} function() { globalThis.__packPwned = 2 }`;
    pack.entityTypes[0].schema.properties.notes.default = payload;
    pack.entityTypes[0].schema.properties.background.enum.push(payload);
    pack.entityTypes[0].computed.text = { cat: [payload, "${globalThis.__packPwned = 3}"] };
    pack.tables[0].rows[0].label = "`${globalThis.__packPwned = 4}`";
    pack.procedures[0].produce.entities[0].name = { cat: ["globalThis.__packPwned = 5;", payload] };
    pack.procedures[0].steps[4].roll = "2d6";
    const res = loadPack(pack, { parts: parts(), seeds: 10 });
    expect(res.ok).toBe(true);
    const m = res.module!;
    runProcedure(m.procedures[0]!, m, { seed: "pwn" });
    m.dice.roll(m.dice.buildPool({ attribute: 12 }), createRng("pwn"));
    expect(g.__packPwned).toBeUndefined();
    // a non-dice roll expression is refused, not evaluated
    pack.procedures[0].steps[4].roll = "globalThis.__packPwned = 6";
    const refused = loadPack(pack, { parts: parts(), seeds: 2 });
    expect(refused.ok).toBe(false);
    expect(g.__packPwned).toBeUndefined();
  });

  it("copies the pack so later edits to the input do not reach the module", () => {
    const merged = mergePackParts(mainFile(), parts()).value!;
    const input = clone(merged);
    const m = packToModule(input);
    input.tables![0]!.name = "changed";
    expect(m.tables[0]!.name).toBe("Site kind");
  });
});

describe("determinism check", () => {
  it("passes the example pack and catches a module that is not seeded", async () => {
    const { checkDeterminism } = await import("../src");
    const m = loadPack(mainFile(), { parts: parts(), skipProcedureRuns: true }).module!;
    expect(checkDeterminism(m, { seeds: 10 })).toEqual([]);
    let calls = 0;
    const leaky = { ...m, procedures: [{ ...m.procedures[0]!, steps: [{ id: "clock", compute: () => ++calls }], produce: () => ({ entities: [], relationships: [] }) }] };
    expect(checkDeterminism(leaky, { seeds: 2 }).map((i) => i.message)).toEqual(['two runs with seed "determinism-0" gave different results (rule 3: same seed, same output)']);
    const leakyDice = { ...m, procedures: [], dice: { ...m.dice, roll: m.dice.roll.bind(m.dice), buildPool: (input: Record<string, unknown>) => ({ ...m.dice.buildPool(input), meta: { at: ++calls } }) } };
    expect(checkDeterminism(leakyDice).some((i) => i.where === "dice" && /not stable/.test(i.message))).toBe(true);
  });
});
