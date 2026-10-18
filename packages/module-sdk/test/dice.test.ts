import { describe, expect, it } from "vitest";
import { diceOutcomes, diceRange, isD66, isDiceExpression, parseDiceExpression, rollDice } from "../src/dice";
import { createRng } from "../src/rng";

describe("parseDiceExpression", () => {
  it("parses NdX, dX, constants and joined terms", () => {
    expect(parseDiceExpression("2d6").terms).toEqual([{ kind: "dice", count: 2, faces: 6, sign: 1 }]);
    expect(parseDiceExpression("d3").terms).toEqual([{ kind: "dice", count: 1, faces: 3, sign: 1 }]);
    expect(parseDiceExpression("1D6 + 2").terms).toEqual([
      { kind: "dice", count: 1, faces: 6, sign: 1 },
      { kind: "const", value: 2 },
    ]);
    expect(parseDiceExpression("2d6+1d3-1").terms).toEqual([
      { kind: "dice", count: 2, faces: 6, sign: 1 },
      { kind: "dice", count: 1, faces: 3, sign: 1 },
      { kind: "const", value: -1 },
    ]);
    expect(parseDiceExpression("d66").terms).toEqual([{ kind: "d66", sign: 1 }]);
  });

  it("rejects garbage", () => {
    expect(() => parseDiceExpression("")).toThrow();
    expect(() => parseDiceExpression("abc")).toThrow();
    expect(() => parseDiceExpression("2")).toThrow();
    expect(() => parseDiceExpression("d0")).toThrow();
    expect(() => parseDiceExpression("2d6++1")).toThrow();
    expect(isDiceExpression("2d6")).toBe(true);
    expect(isDiceExpression("nope")).toBe(false);
  });
});

describe("outcomes and ranges", () => {
  it("d66 yields 36 digit-pair outcomes", () => {
    const out = diceOutcomes("d66");
    expect(out).toHaveLength(36);
    expect(out[0]).toBe(11);
    expect(out[35]).toBe(66);
    expect(out).not.toContain(17);
    expect(out).toContain(26);
    expect(isD66("d66")).toBe(true);
    expect(isD66("2d6")).toBe(false);
    expect(diceRange("d66")).toEqual([11, 66]);
  });

  it("computes totals for combined terms", () => {
    expect(diceOutcomes("2d6")).toEqual([2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    expect(diceOutcomes("d6+2")).toEqual([3, 4, 5, 6, 7, 8]);
    expect(diceRange("2d6+1d3-1")).toEqual([2, 14]);
    expect(diceOutcomes("2d6+1d3-1")).toEqual(Array.from({ length: 13 }, (_, i) => i + 2));
    expect(diceRange("d2")).toEqual([1, 2]);
  });
});

describe("rollDice", () => {
  it("is deterministic and within range", () => {
    const a = rollDice("3d6+1", createRng("roll"));
    const b = rollDice("3d6+1", createRng("roll"));
    expect(a).toEqual(b);
    expect(a.raw).toHaveLength(3);
    expect(a.total).toBe(a.raw.reduce((s, v) => s + v, 1));
  });

  it("d66 rolls tens then units", () => {
    const rng = createRng("d66");
    for (let i = 0; i < 100; i++) {
      const r = rollDice("d66", rng);
      expect(r.raw).toHaveLength(2);
      expect(r.total).toBe((r.raw[0] ?? 0) * 10 + (r.raw[1] ?? 0));
      expect(diceOutcomes("d66")).toContain(r.total);
    }
  });
});
