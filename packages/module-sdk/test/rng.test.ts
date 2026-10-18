import { describe, expect, it } from "vitest";
import { createRng } from "../src/rng";

describe("createRng", () => {
  it("is deterministic for a seed", () => {
    const a = createRng("seed-1");
    const b = createRng("seed-1");
    const sa = Array.from({ length: 20 }, () => a.next());
    const sb = Array.from({ length: 20 }, () => b.next());
    expect(sa).toEqual(sb);
    expect(sa.every((v) => v >= 0 && v < 1)).toBe(true);
  });

  it("differs across seeds", () => {
    const a = Array.from({ length: 10 }, () => createRng("seed-1").next());
    const b = Array.from({ length: 10 }, () => createRng("seed-2").next());
    expect(a).not.toEqual(b);
  });

  it("int is inclusive and roughly uniform", () => {
    const rng = createRng("uniform");
    const counts = new Map<number, number>();
    for (let i = 0; i < 6000; i++) {
      const v = rng.int(1, 6);
      counts.set(v, (counts.get(v) ?? 0) + 1);
    }
    expect([...counts.keys()].sort()).toEqual([1, 2, 3, 4, 5, 6]);
    for (const n of counts.values()) expect(n).toBeGreaterThan(800);
    expect(rng.int(3, 3)).toBe(3);
  });

  it("fork is independent of parent consumption and stable", () => {
    const a = createRng("s");
    const b = createRng("s");
    for (let i = 0; i < 50; i++) a.next();
    const fa = a.fork("child");
    const fb = b.fork("child");
    expect(Array.from({ length: 5 }, () => fa.next())).toEqual(Array.from({ length: 5 }, () => fb.next()));
    const other = createRng("s").fork("other");
    expect(Array.from({ length: 5 }, () => other.next())).not.toEqual(Array.from({ length: 5 }, () => createRng("s").fork("child").next()));
    // Forking does not consume the parent stream.
    const c = createRng("s");
    const d = createRng("s");
    c.fork("x");
    expect(c.next()).toBe(d.next());
  });
});
