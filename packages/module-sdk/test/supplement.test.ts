/**
 * Supplements: additive data for an existing module. Tested against the
 * example pack and its fixture supplement ("Deep Roads"), so nothing here
 * knows any real game.
 */
import { readFileSync } from "node:fs";
import Ajv from "ajv";
import { beforeAll, describe, expect, it } from "vitest";
import {
  applySupplements,
  checkModule,
  checkSupplement,
  checkSupplementAgainst,
  formatPackIssue,
  isValidVersionRange,
  loadPack,
  mergeSupplementParts,
  MODULE_SUPPLEMENT_PART_SCHEMA,
  PACK_LIMITS,
  runProcedure,
  satisfiesVersionRange,
  supplementCounts,
  supplementFromSource,
  supplementOf,
  validateSupplement,
  type GameModule,
  type ModuleSupplement,
} from "../src";

const packDir = new URL("../../module-example/packs/example-pack/", import.meta.url);
const readJson = (url: URL) => JSON.parse(readFileSync(url, "utf8")) as Record<string, any>;
const supplementUrl = new URL("../../module-example/packs/example-supplement/supplement.json", import.meta.url);
const fixture = () => readJson(supplementUrl);
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

let base: GameModule;
beforeAll(() => {
  const res = loadPack(readJson(new URL("pack.json", packDir)), { parts: [{ name: "rules.part.json", data: readJson(new URL("rules.part.json", packDir)) }], skipProcedureRuns: true });
  base = res.module!;
});

const errorsOf = (input: unknown) =>
  checkSupplement(input, base, { seeds: 5, determinismSeeds: 3 })
    .issues.filter((i) => i.severity === "error")
    .map(formatPackIssue);

/** A second, minimal supplement. */
function tiny(id: string, items: Array<{ id: string; name: string }> = []): Record<string, unknown> {
  return {
    format: "campaign-forge-supplement",
    formatVersion: 1,
    manifest: { id, name: id, version: "1.0.0", extends: { module: "example-pack" }, licenseNotice: "Private." },
    referenceItems: { "example-pack.backgrounds": items },
  };
}

describe("semver ranges", () => {
  it.each([
    ["0.1.0", "^0.1.0", true],
    ["0.1.9", "^0.1.0", true],
    ["0.2.0", "^0.1.0", false],
    ["1.4.2", "^1.2.0", true],
    ["2.0.0", "^1.2.0", false],
    ["1.2.9", "~1.2.3", true],
    ["1.3.0", "~1.2.3", false],
    ["1.0.0", ">=1.0.0 <2.0.0", true],
    ["2.0.0", ">=1.0.0 <2.0.0", false],
    ["0.1.5", "0.1.x", true],
    ["0.2.0", "0.1", false],
    ["3.1.4", "*", true],
    ["0.1.0", "0.1.0", true],
    ["0.1.1", "0.1.0", false],
    ["2.5.0", "^1.0.0 || ^2.0.0", true],
  ])("%s in %s: %s", (v, range, ok) => {
    expect(satisfiesVersionRange(v, range)).toBe(ok);
  });

  it("refuses ranges it cannot read", () => {
    for (const r of ["banana", "^x.1", "1.x.3", ">=", "1.2.3.4"]) expect(isValidVersionRange(r), r).toBe(false);
    expect(satisfiesVersionRange("1.0.0", "banana")).toBe(false);
  });
});

describe("validating a supplement", () => {
  it("passes the fixture with no issues, and the published schema accepts it", () => {
    const res = checkSupplement(fixture(), base, { seeds: 20, determinismSeeds: 5 });
    expect(res.issues.map(formatPackIssue)).toEqual([]);
    expect(res.ok).toBe(true);
    const ajv = new Ajv({ allErrors: true, strict: false });
    const validate = ajv.compile(readJson(new URL("../schema/module-supplement.schema.json", import.meta.url)));
    expect(validate(fixture()), JSON.stringify(validate.errors)).toBe(true);
    expect(supplementCounts(res.supplement!)).toEqual({ referenceItems: 2, referenceLists: 1, presets: 1, tables: 1, procedures: 1, rules: 1 });
  });

  it("names the wrong base module and a base version outside its range", () => {
    const other = { ...base, manifest: { ...base.manifest, id: "another-game" } };
    const v = validateSupplement(fixture()).value!;
    expect(checkSupplementAgainst(v, other).map(formatPackIssue)).toEqual(['$.manifest.extends.module: this supplement extends "example-pack", not "another-game"']);
    const newer = { ...base, manifest: { ...base.manifest, version: "0.2.0" } };
    expect(checkSupplementAgainst(v, newer).map(formatPackIssue)).toEqual(["$.manifest.extends.version: this supplement needs example-pack ^0.1.0, but the module is version 0.2.0"]);
    const s = fixture();
    s.manifest.extends.version = "soon";
    expect(errorsOf(s)).toEqual(['$.manifest.extends.version: "soon" is not a semver range (try "^0.1.0", ">=0.1.0 <0.2.0" or "*")']);
  });

  it("checks that every list it adds to exists, and items fit the list's item schema", () => {
    const s = fixture();
    s.referenceItems["example-pack.spells"] = [{ id: "deep-roads.glow", name: "Glow" }];
    s.referenceItems["example-pack.skills"][0].attribute = "luck";
    const errors = errorsOf(s);
    expect(errors.some((e) => e.startsWith('$.referenceItems["example-pack.spells"]: "example-pack" has no reference list "example-pack.spells" (it has: example-pack.skills, example-pack.backgrounds)'))).toBe(true);
    expect(errors.some((e) => e.startsWith('$.referenceItems["example-pack.skills"][0] (deep-roads.echo): does not fit the list\'s item schema'))).toBe(true);
    const p = fixture();
    p.presets[0].entityType = "example-pack.dragon";
    expect(errorsOf(p)).toContain('$.presets[0].entityType (deep-roads.preset.blind-eel): "example-pack" has no entity type "example-pack.dragon" (it has: example-pack.adventurer, example-pack.site, example-pack.monster)');
  });

  it("namespaces every id with the supplement id", () => {
    const s = fixture();
    s.referenceItems["example-pack.backgrounds"][0].id = "tunnel-cartographer";
    s.rules[0].id = "example-pack.rule.echo";
    s.tables[0].id = "waystone.found";
    expect(errorsOf(s)).toEqual(
      expect.arrayContaining([
        '$.referenceItems["example-pack.backgrounds"][0].id (tunnel-cartographer): reference item id "tunnel-cartographer" must start with "deep-roads." (ids are namespaced by the supplement id)',
        '$.rules[0].id (example-pack.rule.echo): rule card id "example-pack.rule.echo" must start with "deep-roads." (ids are namespaced by the pack id)',
        '$.tables[0].id (waystone.found): table id "waystone.found" must start with "deep-roads." (ids are namespaced by the pack id)',
      ]),
    );
    const same = fixture();
    same.manifest.id = "example-pack";
    expect(errorsOf(same).some((e) => e.includes("cannot be the id of the module it extends"))).toBe(true);
  });

  it("stays additive: no sheets, trackers, dice or code; JSONLogic only", () => {
    const s = fixture();
    s.entityTypes = [];
    s.dice = { engine: "d20" };
    expect(errorsOf(s)).toEqual(["$.entityTypes: a supplement cannot add or change entity types (sheets); it adds data only", "$.dice: a supplement cannot change the dice; it uses the base module's"]);
    const logic = fixture();
    logic.procedures[0].produce.entities[0].summary = { method: ["x", "toUpperCase"] };
    expect(errorsOf(logic)).toEqual(['$.procedures[0].produce.entities[0].summary (deep-roads.proc.waystone): JSONLogic: unknown operator "method"']);
    const proto = JSON.parse(JSON.stringify(fixture()).replace('"summary": "Marks a safe camp."', '"__proto__": 1').replace('"summary":"Marks a safe camp."', '"__proto__":1'));
    expect(errorsOf(proto).some((e) => e.includes('the key "__proto__" is not allowed'))).toBe(true);
  });

  it("refuses oversized content, data packs and junk with a clear message", () => {
    const s = fixture();
    s.rules[0].summary = "x".repeat(PACK_LIMITS.maxStringLength + 1);
    expect(errorsOf(s)).toEqual([`$.rules[0].summary: text longer than ${PACK_LIMITS.maxStringLength} characters`]);
    const many = fixture();
    many.referenceItems["example-pack.backgrounds"] = Array.from({ length: PACK_LIMITS.maxArrayLength + 1 }, (_, i) => ({ id: `deep-roads.b${i}`, name: `B${i}` }));
    expect(errorsOf(many)).toEqual([`$.referenceItems["example-pack.backgrounds"]: list longer than ${PACK_LIMITS.maxArrayLength} items`]);
    expect(errorsOf(readJson(new URL("pack.json", packDir)))[0]).toMatch(/this is a data pack, not a supplement/);
    expect(errorsOf([1, 2])).toEqual(["$: a supplement is a JSON object"]);
  });

  it("asks rule cards and tables to cite their source or be original", () => {
    const s = fixture();
    delete s.rules[0].original;
    delete s.tables[0].cite;
    s.tables[0].page = 4;
    const res = checkSupplement(s, base, { seeds: 5 });
    expect(res.issues.filter((i) => i.severity === "error").map(formatPackIssue)).toEqual(['$.rules[0] (deep-roads.rule.echo): needs "cite" (the book or document it comes from) or "original": true']);
    expect(res.issues.filter((i) => i.severity === "warning").map((i) => i.path)).toEqual(["$.tables[0]"]);
  });
});

describe("applying supplements", () => {
  it("adds items to the module's lists with their source, without touching the base module", () => {
    const before = JSON.stringify({ lists: base.referenceLists, rules: base.rules, manifest: base.manifest });
    const supplement = validateSupplement(fixture()).value!;
    const merged = applySupplements(base, [supplement]);
    expect(JSON.stringify({ lists: base.referenceLists, rules: base.rules, manifest: base.manifest })).toBe(before);
    const backgrounds = merged.referenceLists.find((l) => l.id === "example-pack.backgrounds")!;
    expect(backgrounds.items.map((i) => [i.id, i.source])).toEqual([
      ["miner", undefined],
      ["scribe", undefined],
      ["wanderer", undefined],
      ["deep-roads.tunnel-cartographer", "Deep Roads (example supplement)"],
    ]);
    expect(backgrounds.items.at(-1)?.edition).toBe("Deep Roads");
    expect(merged.referenceLists.at(-1)?.id).toBe("deep-roads.waystones");
    expect(merged.manifest.supplements).toEqual([{ id: "deep-roads", name: "Deep Roads (example supplement)", version: "0.1.0", licenseNotice: "Fixture for Campaign Forge tests. Private: for personal use only." }]);
    expect(supplementOf(merged.manifest, "deep-roads.rule.echo")?.name).toBe("Deep Roads (example supplement)");
    expect(supplementOf(merged.manifest, "example-pack.rule.lantern")).toBeUndefined();
    expect(checkModule(merged, { seeds: 10 }).ok).toBe(true);
    expect(applySupplements(base, [])).toBe(base);
  });

  it("merges in supplement id order, whatever order they were installed in", () => {
    const a = validateSupplement(tiny("aa-extra", [{ id: "aa-extra.x", name: "X" }])).value!;
    const z = validateSupplement(tiny("zz-extra", [{ id: "zz-extra.y", name: "Y" }])).value!;
    const d = validateSupplement(fixture()).value!;
    const one = applySupplements(base, [z, d, a]);
    const two = applySupplements(base, [a, z, d]);
    const ids = (m: GameModule) => m.referenceLists.find((l) => l.id === "example-pack.backgrounds")!.items.map((i) => i.id);
    expect(ids(one)).toEqual(ids(two));
    expect(ids(one).slice(3)).toEqual(["aa-extra.x", "deep-roads.tunnel-cartographer", "zz-extra.y"]);
    expect(one.manifest.supplements?.map((s) => s.id)).toEqual(["aa-extra", "deep-roads", "zz-extra"]);
  });

  it("runs a supplement's generator deterministically and records the supplements in the run", () => {
    const merged = applySupplements(base, [validateSupplement(fixture()).value!]);
    const proc = merged.procedures.find((p) => p.id === "deep-roads.proc.waystone")!;
    const run = (seed: string) => runProcedure(proc, merged, { seed });
    expect(run("camp-1")).toEqual(run("camp-1"));
    expect(run("camp-1").supplements).toEqual([{ id: "deep-roads", version: "0.1.0" }]);
    expect(run("camp-1").produced.entities[0]!.name).toMatch(/^Waystone camp \((grey|red)\)$/);
    expect(runProcedure(base.procedures[0]!, base, { seed: "x" }).supplements).toBeUndefined();
  });

  it("checks a supplement alongside the ones already installed", () => {
    const other = validateSupplement(tiny("aa-extra", [{ id: "aa-extra.x", name: "X" }])).value!;
    const res = checkSupplement(fixture(), base, { alongside: [other], seeds: 5 });
    expect(res.ok).toBe(true);
    expect(res.module!.manifest.supplements?.map((s) => s.id)).toEqual(["aa-extra", "deep-roads"]);
  });
});

describe("split supplements", () => {
  /** The fixture split in two: its list items and presets in one part, its rule card in another. */
  function split(): { main: Record<string, any>; parts: Array<{ name: string; data: Record<string, any> }> } {
    const whole = fixture();
    const { referenceItems, presets, rules, ...main } = whole;
    const part = (name: string, body: Record<string, unknown>) => ({ name, data: { format: "campaign-forge-supplement-part", formatVersion: 1, supplement: "deep-roads", name, ...body } });
    const a = part("a.json", { referenceItems: { "example-pack.backgrounds": referenceItems["example-pack.backgrounds"] }, presets });
    const b = part("b.json", { referenceItems: { "example-pack.skills": referenceItems["example-pack.skills"] }, rules });
    return { main: { ...main, parts: ["a.json", "b.json"] }, parts: [b, a] };
  }

  it("joins the parts in the order the main file lists them, into the same supplement as one file", async () => {
    const { main, parts } = split();
    const merged = mergeSupplementParts(main, parts);
    expect(merged.ok, JSON.stringify(merged.issues)).toBe(true);
    const one = validateSupplement(fixture()).value!;
    const joined = validateSupplement(merged.value).value!;
    expect(joined.parts).toBeUndefined();
    expect(supplementCounts(joined)).toEqual(supplementCounts(one));
    expect(Object.keys(joined.referenceItems!)).toEqual(["example-pack.backgrounds", "example-pack.skills"]);
    expect(joined.rules).toEqual(one.rules);
    // the published part schema accepts a part
    const ajv = new Ajv({ allErrors: true, strict: false });
    expect(ajv.validate(MODULE_SUPPLEMENT_PART_SCHEMA, parts[0]!.data), JSON.stringify(ajv.errors)).toBe(true);
    // a source loads its files lazily and validates the joined supplement
    const fromSource = await supplementFromSource({ main: async () => main, parts: Object.fromEntries(parts.map((p) => [p.name, async () => p.data])) });
    expect(supplementCounts(fromSource)).toEqual(supplementCounts(one));
    expect(checkSupplement(fromSource, base, { seeds: 5 }).ok).toBe(true);
  });

  it("names missing, unlisted and foreign parts, and refuses a main file checked without its parts", async () => {
    const { main, parts } = split();
    const issues = (ps: Array<{ name: string; data: unknown }>) => mergeSupplementParts(main, ps).issues.map(formatPackIssue);
    expect(issues([parts[0]!])).toEqual(['$.parts: part "a.json" is missing']);
    const stray = clone(parts[0]!);
    stray.name = "c.json";
    stray.data.name = "c.json";
    expect(issues([...parts, stray])).toEqual(['c.json: $.name: part "c.json" is not listed in the supplement\'s parts (a.json, b.json)']);
    const foreign = clone(parts[1]!);
    foreign.data.supplement = "other";
    expect(issues([foreign, parts[0]!])).toEqual(['a.json: $.supplement: part belongs to supplement "other", not "deep-roads"']);
    expect(validateSupplement(main).issues.map(formatPackIssue)).toEqual(["$.parts: this supplement is split into parts (a.json, b.json); join them first (choose the main file together with its parts)"]);
    expect(validateSupplement(parts[0]!.data).issues[0]!.message).toMatch(/part of a split supplement/);
    await expect(supplementFromSource({ main: async () => main })).rejects.toThrow(/part "a.json" is missing/);
  });
});

export type { ModuleSupplement };
