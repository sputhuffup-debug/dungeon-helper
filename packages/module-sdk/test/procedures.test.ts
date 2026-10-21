import { describe, expect, it } from "vitest";
import { dependentSteps, procedureStepGraph, runProcedure } from "../src/procedures";
import type { GameModule, Procedure, RollTable } from "../src/types";

const sizeTable: RollTable = {
  id: "p.size",
  name: "Size",
  dice: "d6",
  rows: [
    { range: [1, 3], result: { size: "small", mod: -1 } },
    { range: [4, 6], result: { size: "large", mod: 1 } },
  ],
};
const climateTable: RollTable = {
  id: "p.climate",
  name: "Climate",
  dice: "2d6",
  modifiers: [{ when: { "==": [{ var: "size.size" }, "large"] }, add: 2 }],
  rows: [
    { range: [-99, 6], result: { climate: "cold" } },
    { range: [7, 99], result: { climate: "hot" } },
  ],
};
const featureTable: RollTable = {
  id: "p.feature",
  name: "Feature",
  dice: "d6",
  rows: [
    { range: [1, 3], result: "rock" },
    { range: [4, 6], result: "ice" },
  ],
};

const module: Pick<GameModule, "tables" | "manifest"> = {
  manifest: {
    id: "p",
    version: "9.9.9",
    name: "P",
    ruleset: "P",
    licenseNotice: "",
    requiredCore: "0.1.0",
    modes: [{ id: "m", name: "M" }],
    defaultMode: "m",
    dataStatus: "verified",
  },
  tables: [sizeTable, climateTable, featureTable],
};

const proc: Procedure = {
  id: "p.world",
  name: "World",
  steps: [
    { id: "size", table: "p.size" },
    { id: "climate", table: "p.climate", reads: ["size"], modifier: (ctx) => (ctx.get<{ mod: number }>("size")?.mod ?? 0) },
    { id: "features", table: () => "p.feature", reads: ["climate"], repeat: "d3", skipIf: (ctx) => ctx.get<{ climate: string }>("climate")?.climate === "cold" },
    { id: "count", compute: (ctx) => (ctx.get<unknown[]>("features") ?? []).length, reads: ["features"] },
    { id: "bonus", optional: true, compute: (_ctx, rng) => rng.int(1, 100) },
    { id: "label", compute: (ctx) => `${ctx.get<{ size: string }>("size")?.size}-${ctx.inputs.name}`, reads: ["size"], after: (_c, v) => String(v).toUpperCase() },
  ],
  produce: (ctx) => ({
    entities: [{ tempId: "w", type: "p.world", name: String(ctx.get("label")), fields: ctx.data() }],
    relationships: [],
  }),
};

describe("runProcedure", () => {
  it("is deterministic for a seed", () => {
    const a = runProcedure(proc, module, { seed: "abc", inputs: { name: "x" } });
    const b = runProcedure(proc, module, { seed: "abc", inputs: { name: "x" } });
    expect(a).toEqual(b);
    expect(a.moduleVersion).toBe("9.9.9");
    expect(a.procedure).toBe("p.world");
    expect(a.seed).toBe("abc");
    expect(a.produced.entities[0]?.name).toMatch(/^(SMALL|LARGE)-X$/);
    expect(a.skipped.some((s) => s.step === "bonus" && s.reason === "optional")).toBe(true);
    expect(a.rolls[0]?.step).toBe("size");
    const c = runProcedure(proc, module, { seed: "abd", inputs: { name: "x" } });
    expect(c.rolls.map((r) => r.raw)).not.toEqual(a.rolls.map((r) => r.raw));
  });

  it("re-seeding one step only changes that step and its dependents", () => {
    // Find a seed where features ran, so the full chain is visible.
    let seed = "";
    for (let i = 0; i < 100; i++) {
      const g = runProcedure(proc, module, { seed: `s${i}`, inputs: { name: "n" } });
      if (!g.skipped.some((s) => s.step === "features")) {
        seed = `s${i}`;
        break;
      }
    }
    expect(seed).not.toBe("");
    const base = runProcedure(proc, module, { seed, inputs: { name: "n" } });
    const reseeded = runProcedure(proc, module, { seed, inputs: { name: "n" }, stepSeeds: { features: "other" } });
    const sizeRoll = (g: typeof base) => g.rolls.find((r) => r.step === "size");
    const climateRoll = (g: typeof base) => g.rolls.find((r) => r.step === "climate");
    expect(sizeRoll(reseeded)).toEqual(sizeRoll(base));
    expect(climateRoll(reseeded)).toEqual(climateRoll(base));
    expect(reseeded.results.label).toEqual(base.results.label);
    const featureRaw = (g: typeof base) => g.rolls.filter((r) => r.step === "features").map((r) => r.raw);
    expect(featureRaw(reseeded)).not.toEqual(featureRaw(base));
    // Re-seeding size changes size (and may change dependents) but never the step rng of label's independent inputs.
    const reseedSize = runProcedure(proc, module, { seed, inputs: { name: "n" }, stepSeeds: { size: "zzz" } });
    const unchangedFeatureRaw = featureRaw(reseedSize);
    if (!reseedSize.skipped.some((s) => s.step === "features")) expect(unchangedFeatureRaw).toEqual(featureRaw(base));
  });

  it("pinned values short-circuit the roll", () => {
    const g = runProcedure(proc, module, { seed: "pin", inputs: { name: "n" }, pinned: { size: { size: "large", mod: 1 }, climate: { climate: "hot" } } });
    expect(g.results.size).toEqual({ size: "large", mod: 1 });
    expect(g.rolls.some((r) => r.step === "size")).toBe(false);
    expect(g.rolls.some((r) => r.step === "climate")).toBe(false);
    expect(g.rolls.some((r) => r.step === "features")).toBe(true);
    expect(g.results.label).toBe("LARGE-N");
  });

  it("repeat stores arrays with per-iteration records; skipIf records a reason", () => {
    const hot = runProcedure(proc, module, { seed: "pin", inputs: { name: "n" }, pinned: { climate: { climate: "hot" } } });
    const features = hot.results.features as unknown[];
    expect(Array.isArray(features)).toBe(true);
    expect(features.length).toBeGreaterThanOrEqual(1);
    expect(features.length).toBeLessThanOrEqual(3);
    const recs = hot.rolls.filter((r) => r.step === "features");
    expect(recs.map((r) => r.iteration)).toEqual(features.map((_, i) => i));
    expect(hot.results.count).toBe(features.length);

    const cold = runProcedure(proc, module, { seed: "pin", inputs: { name: "n" }, pinned: { climate: { climate: "cold" } } });
    expect(cold.skipped).toContainEqual({ step: "features", reason: "skipIf" });
    expect(cold.results.features).toBeUndefined();
    expect(cold.results.count).toBe(0);
  });

  it("runs optional steps when included and passes a step rng to compute", () => {
    const a = runProcedure(proc, module, { seed: "opt", inputs: { name: "n" }, includeOptional: ["bonus"] });
    const b = runProcedure(proc, module, { seed: "opt", inputs: { name: "n" }, includeOptional: ["bonus"] });
    expect(typeof a.results.bonus).toBe("number");
    expect(a.results.bonus).toBe(b.results.bonus);
    expect(a.skipped.some((s) => s.step === "bonus")).toBe(false);
  });

  it("records each step's display line after the run, with the step's own rolls, and none when no step has one", () => {
    expect(runProcedure(proc, module, { seed: "d", inputs: { name: "n" } }).display).toBeUndefined();
    const shown: Procedure = {
      ...proc,
      steps: proc.steps.map((s) => {
        if (s.id === "size") return { ...s, display: (_ctx, result) => `a ${(result as { size: string }).size} world` };
        if (s.id === "features") return { ...s, display: (_ctx, result, rolls) => `${(result as unknown[]).length} features from ${rolls.length} rolls` };
        if (s.id === "count") return { ...s, display: () => "  " };
        return s;
      }),
    };
    const g = runProcedure(shown, module, { seed: "d", inputs: { name: "n" }, pinned: { size: { size: "large", mod: 1 }, climate: { climate: "hot" } } });
    const n = (g.results.features as unknown[]).length;
    // the pinned step still gets its line; a blank line is left out
    expect(g.display).toEqual({ size: "a large world", features: `${n} features from ${n} rolls` });
    // display never changes results
    expect(g.results).toEqual(runProcedure(proc, module, { seed: "d", inputs: { name: "n" }, pinned: { size: { size: "large", mod: 1 }, climate: { climate: "hot" } } }).results);
  });

  it("throws on unknown tables and steps without table or compute", () => {
    const bad: Procedure = { id: "bad", name: "bad", steps: [{ id: "x", table: "nope" }], produce: () => ({ entities: [], relationships: [] }) };
    expect(() => runProcedure(bad, module, { seed: "s" })).toThrow(/unknown table/);
    const empty: Procedure = { id: "bad2", name: "bad", steps: [{ id: "x" }], produce: () => ({ entities: [], relationships: [] }) };
    expect(() => runProcedure(empty, module, { seed: "s" })).toThrow(/neither table nor compute/);
  });
});

describe("step graph helpers", () => {
  it("summarises steps", () => {
    const graph = procedureStepGraph(proc);
    expect(graph.map((g) => g.id)).toEqual(["size", "climate", "features", "count", "bonus", "label"]);
    expect(graph[2]).toMatchObject({ id: "features", reads: ["climate"], optional: false, hasSkip: true, hasRepeat: true, kind: "table" });
    expect(graph[4]).toMatchObject({ id: "bonus", optional: true, hasSkip: false, hasRepeat: false, kind: "compute" });
  });

  it("finds transitive dependents in procedure order", () => {
    expect(dependentSteps(proc, "size")).toEqual(["climate", "features", "count", "label"]);
    expect(dependentSteps(proc, "climate")).toEqual(["features", "count"]);
    expect(dependentSteps(proc, "label")).toEqual([]);
  });
});
