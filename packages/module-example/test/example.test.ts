import { describe, expect, it } from "vitest";
import {
  checkModule,
  computeFields,
  createRng,
  dependentSteps,
  defaultFieldsFor,
  loadModule,
  runProcedure,
  sheetFieldsForMode,
  validateEntityFields,
} from "@campaign-forge/module-sdk";
import { exampleModule } from "../src/index";

describe("exampleModule conformance", () => {
  it("passes checkModule with zero errors", () => {
    const report = checkModule(exampleModule);
    expect(report.issues.filter((i) => i.severity === "error")).toEqual([]);
    expect(report.ok).toBe(true);
  });

  it("loads with lookups", () => {
    const loaded = loadModule(exampleModule, { seeds: 20 });
    expect(loaded.entityType("example.hero")?.kind).toBe("character");
    expect(loaded.presetsFor("example.hero").map((p) => p.id)).toEqual(["example.preset.veteran"]);
    expect(loaded.rulesForField("example.hero", "wounds").map((r) => r.id)).toEqual(["example.rule.wounds"]);
    expect(loaded.forMode("standard").rules.map((r) => r.id)).toEqual(["example.rule.push", "example.rule.wounds"]);
    expect(loaded.forMode("hardcore").rules).toHaveLength(3);
    expect(loaded.templatesFor("session", "standard")).toHaveLength(0);
    expect(loaded.templatesFor("session", "hardcore")).toHaveLength(1);
    expect(loaded.templatesFor("checklist", "standard").map((t) => t.appliesTo)).toEqual(["session"]);
    expect(loaded.relationshipTypes.some((r) => r.id === "example.guards")).toBe(true);
    expect(loaded.referenceItem("example.origins", "coast")?.name).toBe("Coast folk");
  });
});

describe("dice system", () => {
  it("rolls and pushes deterministically", () => {
    const pool = exampleModule.dice.buildPool({ attribute: 3, skill: 1 });
    expect(pool.dice.d6).toBe(4);
    const r1 = exampleModule.dice.roll(pool, createRng("dice"));
    const r2 = exampleModule.dice.roll(pool, createRng("dice"));
    expect(r1).toEqual(r2);
    expect(r1.successes).toBe(r1.dice.filter((d) => d.value >= 5).length);
    const pushed = exampleModule.dice.push!(r1, createRng("push"));
    expect(pushed.pushes).toBe(1);
    expect(pushed.canPush).toBe(false);
    for (const [i, d] of pushed.dice.entries()) {
      if (r1.dice[i]!.value >= 5) expect(d).toEqual({ ...r1.dice[i], kept: true });
    }
    expect(exampleModule.dice.describe(pushed)).toMatch(/pushed/);
    expect(exampleModule.dice.push!(pushed, createRng("again"))).toBe(pushed);
  });
});

describe("hero entity", () => {
  const hero = exampleModule.entityTypes.find((t) => t.id === "example.hero")!;

  it("has defaults, validation and computed values", () => {
    const fields = defaultFieldsFor(hero);
    expect(fields).toEqual({ attributes: { might: 2, wits: 2 }, skills: { fight: 0, lore: 0, sneak: 0 }, wounds: 0, doom: 0, gear: [] });
    expect(validateEntityFields(hero, fields).valid).toBe(true);
    expect(validateEntityFields(hero, { attributes: { might: 9, wits: 1 } }).errors[0]?.path).toBe("attributes.might");
    const computed = computeFields(hero, { ...fields, attributes: { might: 3, wits: 2 }, wounds: 2, gear: [{ name: "Axe", weight: 4 }, { name: "Rope", weight: 3 }] });
    expect(computed).toEqual({ health: 6, healthLeft: 4, carry: 7, burdened: true });
  });

  it("filters sheet sections by mode", () => {
    expect(sheetFieldsForMode(hero, "standard").map((s) => s.id)).toEqual(["core", "gear", "notes"]);
    expect(sheetFieldsForMode(hero, "hardcore").map((s) => s.id)).toEqual(["core", "gear", "hardcore", "notes"]);
  });

  it("validates presets", () => {
    for (const preset of exampleModule.presets) {
      const def = exampleModule.entityTypes.find((t) => t.id === preset.entityType)!;
      expect(validateEntityFields(def, preset.fields)).toEqual({ valid: true, errors: [] });
    }
  });
});

describe("expedition procedure", () => {
  const proc = exampleModule.procedures[0]!;

  it("is deterministic and produces a place", () => {
    const a = runProcedure(proc, exampleModule, { seed: "quest-1", inputs: { days: 3 } });
    const b = runProcedure(proc, exampleModule, { seed: "quest-1", inputs: { days: 3 } });
    expect(a).toEqual(b);
    expect(a.produced.entities[0]?.type).toBe("example.place");
    expect(a.skipped.some((s) => s.step === "omen")).toBe(true);
    const danger = a.results.danger as { level: string; hostile: boolean };
    expect(typeof danger.hostile).toBe("boolean");
    if (!a.skipped.some((s) => s.step === "encounters")) expect(a.results.encounters as unknown[]).toHaveLength(3);
  });

  it("re-seeding terrain changes dependents but pinned and optional steps behave", () => {
    expect(dependentSteps(proc, "terrain")).toEqual(["danger", "encounters", "omen"]);
    const g = runProcedure(proc, exampleModule, {
      seed: "quest-2",
      inputs: { days: 2, cursed: true },
      pinned: { danger: { level: "deadly", hostile: true } },
      includeOptional: ["omen"],
    });
    expect(g.rolls.some((r) => r.step === "danger")).toBe(false);
    expect(g.results.encounters as unknown[]).toHaveLength(2);
    expect((g.results.omen as { sign: number }).sign).toBeGreaterThanOrEqual(1);
    const nestedRecs = g.rolls.filter((r) => r.step === "encounters" && r.nested);
    for (const rec of nestedRecs) {
      const res = rec.result as { kind: string; rumor?: string; lairs?: unknown[] };
      if (res.kind === "traveller") expect(typeof res.rumor).toBe("string");
      if (res.kind === "bandits") expect(res.lairs!.length).toBeGreaterThanOrEqual(1);
    }
  });

  it("applies the cursed modifier from inputs", () => {
    for (let i = 0; i < 30; i++) {
      const plain = runProcedure(proc, exampleModule, { seed: `curse-${i}`, inputs: { days: 1, cursed: false } });
      const cursed = runProcedure(proc, exampleModule, { seed: `curse-${i}`, inputs: { days: 1, cursed: true } });
      const dp = plain.rolls.find((r) => r.step === "danger")!;
      const dc = cursed.rolls.find((r) => r.step === "danger")!;
      expect(dc.raw).toEqual(dp.raw);
      expect(dc.modifier).toBe(dp.modifier + 2);
    }
  });
});

describe("hooks", () => {
  it("asks one yes/no prompt at session end", () => {
    const prompts = exampleModule.hooks!.onSessionEnd!({ mode: "standard", characters: [{ id: "c1", name: "A", fields: {} }], trackerState: {} });
    expect(prompts).toHaveLength(1);
    expect(prompts[0]?.kind).toBe("yesno");
    expect(prompts[0]?.onYes).toEqual([{ kind: "incrementField", entity: "c1", path: "wounds", by: -1, min: 0 }]);
  });
});

describe("omen operation", () => {
  it("returns its effects, marking the entity on a 1", async () => {
    const { exampleModule } = await import("../src/index");
    const { createRng, createTableRegistry } = await import("@campaign-forge/module-sdk");
    const op = exampleModule.dice.operations!.omen!;
    const registry = createTableRegistry(exampleModule.tables);
    let markedSeen = false;
    for (let i = 0; i < 60 && !markedSeen; i++) {
      const res = op.run({ entity: "h1" }, createRng(`omen-${i}`), registry);
      expect(res.effects?.[0]).toMatchObject({ kind: "log" });
      if (res.total === 1) {
        expect(res.effects).toContainEqual({ kind: "addCondition", entity: "h1", condition: { id: "example.marked", label: "Marked" } });
        markedSeen = true;
      }
    }
    expect(markedSeen).toBe(true);
  });
});

describe("guided quest builder", () => {
  it("is declared with narrative fields and passes conformance without warnings", () => {
    const report = checkModule(exampleModule, { skipProcedureRuns: true });
    expect(report.issues.filter((i) => i.where.startsWith("builder:") || i.where.startsWith("narrativeFields:"))).toEqual([]);
    const loaded = loadModule(exampleModule, { skipProcedureRuns: true });
    const builder = loaded.builder("example.builder.quest");
    expect(builder?.cast.map((r) => r.id)).toEqual(["heroes", "places"]);
    expect(builder?.review.filter((r) => r.check)).toHaveLength(1);
    expect(builder?.review.filter((r) => r.each)).toHaveLength(1);
    expect(loaded.buildersFor("hardcore")).toHaveLength(1);
    for (const kind of ["adventure", "act", "scene"] as const) expect(loaded.narrativeFieldsFor(kind, "standard")?.kind).toBe(kind);
  });
});
