import { describe, expect, it } from "vitest";
import { evaluateLogic, evaluateNumber, getPath, setPath } from "../src/logic";

describe("lookup", () => {
  it("finds a key, and gives the fallback for a missing or empty key", () => {
    const table = { elf: 6, dwarf: 10 };
    expect(evaluateLogic({ lookup: [table, "elf", 0] })).toBe(6);
    expect(evaluateLogic({ lookup: [table, "orc", 0] })).toBe(0);
    expect(evaluateLogic({ lookup: [table, "", 0] })).toBe(0);
  });
});

describe("evaluateLogic", () => {
  it("evaluates standard json-logic", () => {
    expect(evaluateLogic({ "+": [{ var: "a" }, 2] }, { a: 3 })).toBe(5);
    expect(evaluateLogic({ "==": [{ var: "x.y" }, "z"] }, { x: { y: "z" } })).toBe(true);
    expect(evaluateLogic(7)).toBe(7);
    expect(evaluateLogic("str")).toBe("str");
  });

  it("supports custom numeric ops", () => {
    expect(evaluateLogic({ ceil: [{ "/": [5, 2] }] })).toBe(3);
    expect(evaluateLogic({ floor: [2.7] })).toBe(2);
    expect(evaluateLogic({ round: [2.5] })).toBe(3);
    expect(evaluateLogic({ round: [2.345, 2] })).toBe(2.35);
  });

  it("supports array ops", () => {
    const data = { list: [1, 2, 3], tags: ["a", "b"], obj: { k: { v: 9 } } };
    expect(evaluateLogic({ sum: [{ var: "list" }] }, data)).toBe(6);
    expect(evaluateLogic({ count: [{ var: "list" }] }, data)).toBe(3);
    expect(evaluateLogic({ has: [{ var: "tags" }, "a"] }, data)).toBe(true);
    expect(evaluateLogic({ has: [{ var: "tags" }, "zz"] }, data)).toBe(false);
    expect(evaluateLogic({ lookup: [{ var: "obj" }, "k.v"] }, data)).toBe(9);
    expect(evaluateLogic({ lookup: [{ var: "obj" }, "nope", "fallback"] }, data)).toBe("fallback");
    expect(evaluateLogic({ max: [{ var: "list" }] }, data)).toBe(3);
    expect(evaluateLogic({ min: [{ var: "list" }] }, data)).toBe(1);
    expect(evaluateLogic({ max: [1, 5, 2] })).toBe(5);
    expect(evaluateLogic({ sum: [{ map: [{ var: "list" }, { "*": [{ var: "" }, 2] }] }] }, data)).toBe(12);
    expect(evaluateNumber({ var: "missing" }, data)).toBe(0);
  });
});

describe("paths", () => {
  it("getPath reads nested values", () => {
    expect(getPath({ a: { b: [{ c: 1 }] } }, "a.b.0.c")).toBe(1);
    expect(getPath({ a: 1 }, "a.b")).toBeUndefined();
    expect(getPath({ a: 1 }, "")).toEqual({ a: 1 });
  });

  it("setPath is immutable", () => {
    const original = { a: { b: 1 }, c: [1, 2] };
    const updated = setPath(original, "a.b", 2);
    expect(updated).toEqual({ a: { b: 2 }, c: [1, 2] });
    expect(original.a.b).toBe(1);
    expect(updated.c).toBe(original.c);
    const withArray = setPath(original, "c.1", 9);
    expect(withArray.c).toEqual([1, 9]);
    expect(original.c).toEqual([1, 2]);
    const created = setPath({} as Record<string, unknown>, "x.0.y", true);
    expect(created).toEqual({ x: [{ y: true }] });
  });
});
