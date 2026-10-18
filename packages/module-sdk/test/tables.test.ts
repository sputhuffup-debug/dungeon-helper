import { describe, expect, it } from "vitest";
import { createRng } from "../src/rng";
import { createTableRegistry, resolveRow, rollTable } from "../src/tables";
import type { RollTable } from "../src/types";

const inner: RollTable = {
  id: "t.inner",
  name: "Inner",
  dice: "d6",
  rows: [
    { range: [1, 3], label: "low", result: "low" },
    { range: [4, 6], label: "high", result: "high" },
  ],
};

const outer: RollTable = {
  id: "t.outer",
  name: "Outer",
  page: 10,
  dice: "2d6",
  modifiers: [
    { when: { "==": [{ var: "biome" }, "swamp"] }, add: 2, label: "swamp" },
    { add: { if: [{ var: "cursed" }, 3, 0] } },
  ],
  rows: [
    { range: [-99, 6], label: "calm", result: { mood: "calm" } },
    { range: [7, 9], label: "tense", result: { mood: "tense" }, roll: [{ table: "t.inner", as: "detail" }] },
    { range: [10, 99], label: "wild", result: "wild", roll: [{ table: "t.inner", as: "details", times: "d3" }], page: 11 },
  ],
};

const narrow: RollTable = {
  id: "t.narrow",
  name: "Narrow",
  dice: "d6",
  rows: [
    { range: [2, 3], label: "a", result: "a" },
    { range: [4, 5], label: "b", result: "b" },
  ],
};

const registry = createTableRegistry([inner, outer, narrow]);

describe("resolveRow", () => {
  it("finds the row by inclusive range", () => {
    expect(resolveRow(outer, 7)?.label).toBe("tense");
    expect(resolveRow(outer, 9)?.label).toBe("tense");
    expect(resolveRow(outer, -5)?.label).toBe("calm");
    expect(resolveRow(narrow, 6)).toBeUndefined();
  });
});

describe("rollTable", () => {
  it("is deterministic for a seed", () => {
    const a = rollTable(outer, createRng("x"), registry, { context: { biome: "swamp" } });
    const b = rollTable(outer, createRng("x"), registry, { context: { biome: "swamp" } });
    expect(a).toEqual(b);
    expect(a.raw).toHaveLength(2);
    expect(a.table).toBe("t.outer");
    expect(a.step).toBe("t.outer");
  });

  it("applies modifiers from context and extraModifier", () => {
    const plain = rollTable(outer, createRng("mods"), registry, { context: {} });
    const swamp = rollTable(outer, createRng("mods"), registry, { context: { biome: "swamp" } });
    const cursed = rollTable(outer, createRng("mods"), registry, { context: { biome: "swamp", cursed: true }, extraModifier: 1 });
    expect(plain.modifier).toBe(0);
    expect(swamp.modifier).toBe(2);
    expect(cursed.modifier).toBe(6);
    expect(swamp.raw).toEqual(plain.raw);
    expect(cursed.total).toBe(plain.total + 6);
  });

  it("merges nested rolls under their keys", () => {
    // Find seeds hitting the tense and wild rows.
    let tense: ReturnType<typeof rollTable> | undefined;
    let wild: ReturnType<typeof rollTable> | undefined;
    let wildSeed = "";
    for (let i = 0; i < 200 && (!tense || !wild); i++) {
      const rec = rollTable(outer, createRng(`n${i}`), registry, { step: "s" });
      if (rec.rowLabel === "tense") tense ??= rec;
      if (rec.rowLabel === "wild" && !wild) {
        wild = rec;
        wildSeed = `n${i}`;
      }
    }
    expect(tense).toBeDefined();
    expect(wild).toBeDefined();
    const t = tense!;
    expect(t.nested).toHaveLength(1);
    expect(t.nested?.[0]?.step).toBe("s/detail");
    expect(t.nested?.[0]?.iteration).toBeUndefined();
    expect(t.result).toEqual({ mood: "tense", detail: t.nested?.[0]?.result });
    const w = wild!;
    const details = (w.result as { details: unknown[] }).details;
    expect(Array.isArray(details)).toBe(true);
    expect(details.length).toBeGreaterThanOrEqual(1);
    expect(details.length).toBeLessThanOrEqual(3);
    expect(w.nested).toHaveLength(details.length);
    expect((w.result as { value: string }).value).toBe("wild");
    expect(w.nested?.[0]?.iteration).toBe(0);
    expect(w.page).toBe(11);
    // Nested rolls are deterministic too.
    expect(rollTable(outer, createRng(wildSeed), registry, { step: "s" })).toEqual(w);
  });

  it("clamps to the nearest row when the total falls outside all rows", () => {
    let seen = 0;
    for (let i = 0; i < 100; i++) {
      const rec = rollTable(narrow, createRng(`c${i}`), registry);
      if (rec.total === 1 || rec.total === 6) {
        seen++;
        expect(rec.rowLabel).toMatch(/clamped/);
        expect(rec.result).toBe(rec.total === 1 ? "a" : "b");
      } else {
        expect(rec.rowLabel).not.toMatch(/clamped/);
      }
    }
    expect(seen).toBeGreaterThan(0);
  });

  it("records step and iteration", () => {
    const rec = rollTable(inner, createRng("si"), registry, { step: "mystep", iteration: 2 });
    expect(rec.step).toBe("mystep");
    expect(rec.iteration).toBe(2);
    expect(rec.dice).toBe("d6");
  });
});
