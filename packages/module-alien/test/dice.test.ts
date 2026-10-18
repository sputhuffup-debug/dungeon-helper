import { describe, expect, it } from "vitest";
import { createRng, createTableRegistry } from "@campaign-forge/module-sdk";
import type { Effect, RollResult } from "@campaign-forge/module-sdk";
import { diceSystem, BASE_DIE, STRESS_DIE, FACEHUGGER, PANIC_TABLE, STRESS_RESPONSE_TABLE } from "../src/dice";
import { tables } from "../src/tables";

const registry = createTableRegistry(tables);

function rollWith(seed: string, input: Record<string, unknown>): RollResult {
  return diceSystem.roll(diceSystem.buildPool(input), createRng(seed));
}

/** Find a seed for which the first roll satisfies `pred` (keeps tests deterministic yet honest). */
function findSeed(input: Record<string, unknown>, pred: (r: RollResult) => boolean, prefix = "s"): string {
  for (let i = 0; i < 5000; i++) {
    const seed = `${prefix}-${i}`;
    if (pred(rollWith(seed, input))) return seed;
  }
  throw new Error("no seed found");
}

describe("buildPool", () => {
  it("adds attribute, skill, gear, modifiers and capped helpers; stress dice equal stress", () => {
    const pool = diceSystem.buildPool({ attribute: 4, skill: 2, gear: 1, modifier: -1, helpers: 5, stress: 3 });
    expect(pool.dice[BASE_DIE]).toBe(4 + 2 + 1 - 1 + 3);
    expect(pool.dice[STRESS_DIE]).toBe(3);
    expect(pool.breakdown?.some((b) => b.label.startsWith("Helpers (3"))).toBe(true);
  });
  it("never drops below one base die", () => {
    const pool = diceSystem.buildPool({ attribute: 1, skill: 0, difficulty: -3 });
    expect(pool.dice[BASE_DIE]).toBe(1);
    expect(pool.breakdown?.some((b) => b.label === "Minimum one base die")).toBe(true);
  });
});

describe("roll", () => {
  it("is deterministic for the same seed", () => {
    const a = rollWith("alpha", { attribute: 3, skill: 2, stress: 2 });
    const b = rollWith("alpha", { attribute: 3, skill: 2, stress: 2 });
    expect(a).toEqual(b);
    expect(a.dice).toHaveLength(7);
  });
  it("counts every 6 as a success and 1s on stress dice as facehuggers", () => {
    const r = rollWith("beta", { attribute: 5, skill: 5, stress: 5 });
    const sixes = r.dice.filter((d) => d.value === 6).length;
    const ones = r.dice.filter((d) => d.die === STRESS_DIE && d.value === 1).length;
    expect(r.successes).toBe(sixes);
    expect(r.symbols[FACEHUGGER] ?? 0).toBe(ones);
  });
  it("forbids pushing when a stress die shows 1", () => {
    const input = { attribute: 3, skill: 1, stress: 4 };
    const seed = findSeed(input, (r) => (r.symbols[FACEHUGGER] ?? 0) > 0);
    const r = rollWith(seed, input);
    expect(r.canPush).toBe(false);
    expect(r.notes?.some((n) => n.includes("facehugger"))).toBe(true);
  });
  it("allows pushing when no stress die shows 1", () => {
    const input = { attribute: 3, skill: 1, stress: 2 };
    const seed = findSeed(input, (r) => (r.symbols[FACEHUGGER] ?? 0) === 0 && r.successes < 3);
    expect(rollWith(seed, input).canPush).toBe(true);
  });
  it("androids and NPCs cannot push", () => {
    const seedA = findSeed({ attribute: 3, skill: 1, stress: 0, android: true }, () => true, "a");
    expect(rollWith(seedA, { attribute: 3, skill: 1, stress: 0, android: true }).canPush).toBe(false);
    expect(rollWith(seedA, { attribute: 3, skill: 1, stress: 0, npc: true }).canPush).toBe(false);
  });
});

describe("push", () => {
  const input = { attribute: 3, skill: 2, stress: 1 };
  const seed = findSeed(input, (r) => r.canPush && r.successes >= 1 && r.successes < 5, "p");

  it("keeps sixes, re-rolls the rest, adds one stress die and raises stress", () => {
    const first = rollWith(seed, input);
    const pushed = diceSystem.push!(first, createRng(`${seed}-push`));
    expect(pushed.pushes).toBe(1);
    expect(pushed.dice).toHaveLength(first.dice.length + 1);
    expect(pushed.dice.filter((d) => d.die === STRESS_DIE)).toHaveLength(2);
    expect(pushed.pool.dice[STRESS_DIE]).toBe(2);
    expect(pushed.meta?.stressAfter).toBe(2);
    const keptSixes = pushed.dice.filter((d) => d.kept);
    expect(keptSixes).toHaveLength(first.successes);
    expect(keptSixes.every((d) => d.value === 6)).toBe(true);
    expect(pushed.successes).toBeGreaterThanOrEqual(first.successes);
    expect(pushed.canPush).toBe(false);
  });
  it("is deterministic", () => {
    const first = rollWith(seed, input);
    const a = diceSystem.push!(first, createRng("x"));
    const b = diceSystem.push!(first, createRng("x"));
    expect(a).toEqual(b);
  });
  it("refuses to push a result that cannot be pushed", () => {
    const first = rollWith(seed, { ...input, android: true });
    const same = diceSystem.push!(first, createRng("y"));
    expect(same.pushes).toBe(0);
    expect(same.notes?.at(-1)).toContain("not allowed");
  });
  it("allowSecondPush leaves canPush open after the first push when no facehugger shows", () => {
    const first = rollWith(seed, input);
    for (let i = 0; i < 200; i++) {
      const pushed = diceSystem.push!(first, createRng(`z-${i}`), { allowSecondPush: true });
      if ((pushed.symbols[FACEHUGGER] ?? 0) === 0) {
        expect(pushed.canPush).toBe(true);
        return;
      }
    }
    throw new Error("no push without a facehugger in 200 tries");
  });
  it("describe mentions successes and pushes", () => {
    const first = rollWith(seed, input);
    const text = diceSystem.describe(diceSystem.push!(first, createRng("d")));
    expect(text).toMatch(/success/);
    expect(text).toContain("pushed x1");
  });
});

describe("operations", () => {
  const ops = diceSystem.operations!;

  it("stressResponse rolls D6 + stress - resolve against the stress response table", () => {
    const res = ops.stressResponse!.run({ entity: "pc1", stress: 5, resolve: 2 }, createRng("sr"), registry);
    const rec = res.rolls[0]!;
    expect(rec.table).toBe(STRESS_RESPONSE_TABLE);
    expect(rec.modifier).toBe(3);
    expect(rec.total).toBe(rec.raw[0]! + 3);
    expect(res.effects?.some((e) => e.kind === "addCondition")).toBe(registry.get(STRESS_RESPONSE_TABLE) !== undefined);
  });

  it("panicRoll flags traumaCheck at 9+ and returns the total", () => {
    const res = ops.panicRoll!.run({ entity: "pc1", stress: 10, resolve: 0 }, createRng("panic"), registry);
    const result = res.result as { total: number; traumaCheck: boolean };
    expect(res.rolls[0]!.table).toBe(PANIC_TABLE);
    expect(res.total).toBe(result.total);
    expect(result.traumaCheck).toBe(result.total >= 9);
    expect(result.traumaCheck).toBe(true);
    const low = ops.panicRoll!.run({ stress: 0, resolve: 3 }, createRng("calm"), registry).result as { traumaCheck: boolean };
    expect(low.traumaCheck).toBe(false);
  });

  it("storyPoint converts one base die to a success and spends a point", () => {
    const first = rollWith("sp", { attribute: 2, skill: 0, stress: 0 });
    const res = ops.storyPoint!.run({ entity: "pc1", result: first }, createRng("n/a"), registry);
    const after = res.result as RollResult;
    if (first.successes < first.dice.length) {
      expect(after.successes).toBe(first.successes + 1);
      const inc = res.effects?.find((e): e is Extract<Effect, { kind: "incrementField" }> => e.kind === "incrementField");
      expect(inc?.path).toBe("storyPoints");
      expect(inc?.by).toBe(-1);
    }
  });

  it("supplyRoll reduces the rating by the number of ones", () => {
    const res = ops.supplyRoll!.run({ entity: "pc1", rating: 6, path: "gear.0.supply", label: "air" }, createRng("air"), registry);
    const rec = res.rolls[0]!;
    const ones = rec.raw.filter((v) => v === 1).length;
    expect(rec.raw).toHaveLength(6);
    expect((res.result as { after: number }).after).toBe(6 - ones);
    if (ones > 0) expect(res.effects?.some((e) => e.kind === "incrementField" && e.by === -ones)).toBe(true);
  });

  it("mentalTrauma and criticalInjury roll d6 / d66 against their tables", () => {
    const mt = ops.mentalTrauma!.run({ entity: "pc1" }, createRng("mt"), registry);
    expect(mt.rolls[0]!.raw).toHaveLength(1);
    expect(mt.total).toBeGreaterThanOrEqual(1);
    expect(mt.total).toBeLessThanOrEqual(6);
    const ci = ops.criticalInjury!.run({ entity: "pc1" }, createRng("ci"), registry);
    expect(ci.rolls[0]!.raw).toHaveLength(2);
    expect(ci.total).toBeGreaterThanOrEqual(11);
    expect(ci.total).toBeLessThanOrEqual(66);
  });

  it("every operation id matches its key and cites a page", () => {
    for (const [key, op] of Object.entries(ops)) {
      expect(op.id).toBe(key);
      expect(op.page).toBeDefined();
    }
  });
});

describe("android exemption (p. 25)", () => {
  const registry = createTableRegistry(tables);
  for (const op of ["panicRoll", "stressResponse"] as const) {
    it(`${op} makes no roll and adds no condition for an android`, () => {
      const res = diceSystem.operations![op]!.run({ entity: "e1", stress: 5, resolve: 1, android: true }, createRng("a"), registry);
      expect(res.total).toBeUndefined();
      expect(res.rolls).toHaveLength(0);
      expect(res.effects?.every((e: Effect) => e.kind === "log")).toBe(true);
    });
  }
  it("still rolls for a human", () => {
    const res = diceSystem.operations!.panicRoll!.run({ entity: "e1", stress: 5, resolve: 1 }, createRng("a"), registry);
    expect(typeof res.total).toBe("number");
  });
});
