import { describe, expect, it } from "vitest";
import {
  createDiceEngine,
  createEnteredRng,
  createRng,
  createTableRegistry,
  describeDiceToEnter,
  dieLabel,
  enteredReplayProblem,
  isDieRequest,
  EnteredDiceError,
  facesForTotal,
  missingText,
  planEntry,
  probeDice,
  recordDice,
  rollDice,
  rollEntered,
  rollTable,
  runProcedure,
  type DiceSystem,
  type Procedure,
  type Rng,
  type RollTable,
} from "../src";

/** Roll with a seed, keep the faces, roll again with them entered: same result. */
function replays<T>(run: (rng: Rng) => T, seed: string): { app: T; typed: T; faces: number[] } {
  const rec = recordDice(createRng(seed));
  const app = run(rec.rng);
  const typed = rollEntered(run, rec.faces);
  return { app, typed, faces: rec.faces };
}

describe("entered dice rng", () => {
  it("hands out the faces in order and checks each one", () => {
    const rng = createEnteredRng([3, 6, 1]);
    expect(rng.int(1, 6)).toBe(3);
    expect(rng.fork("child").int(1, 6)).toBe(6); // a fork shares the faces
    expect(rng.int(1, 6, { label: "Stress die" })).toBe(1);
    expect(rng.used).toBe(3);
    expect(rng.requests.map((r) => r.label)).toEqual(["d6", "d6", "Stress die"]);
    expect(() => rng.int(1, 6)).toThrow(EnteredDiceError);
  });

  it("explains a face out of range, a fraction, running out and faces left over", () => {
    const err = (fn: () => unknown) => {
      try {
        fn();
      } catch (e) {
        return e as EnteredDiceError;
      }
      throw new Error("did not throw");
    };
    const range = err(() => createEnteredRng([7]).int(1, 6));
    expect(range.code).toBe("range");
    expect(range.message).toMatch(/d6 shows 1–6, not 7/);
    expect(err(() => createEnteredRng([2.5]).int(1, 6)).code).toBe("integer");
    const missing = err(() => rollEntered((rng) => [rng.int(1, 20, { label: "d20" }), rng.int(1, 20, { label: "d20" })], [12]));
    expect(missing.code).toBe("missing");
    expect(missing.message).toMatch(/d20 is missing/);
    const extra = err(() => rollEntered((rng) => rng.int(1, 6), [2, 3]));
    expect(extra.code).toBe("extra");
    expect(extra.message).toMatch(/uses 1 die; 1 more was entered/);
    expect(err(() => createEnteredRng([1]).next()).code).toBe("random");
    expect(createEnteredRng([], { fallback: createRng("x") }).next()).toBe(createRng("x").next());
  });

  it("needs no face for a range of one value", () => {
    expect(rollEntered((rng) => [rng.int(4, 4), rng.int(1, 6)], [5])).toEqual([4, 5]);
  });

  it("tells dice from picks", () => {
    const probe = probeDice((rng) => [rng.int(1, 6), rng.int(0, 9), rng.int(0, 37), rng.int(100, 999), rng.int(1, 7, { label: "Weekday" })]);
    expect(probe.requests.map(isDieRequest)).toEqual([true, true, false, false, true]);
  });

  it("names dice from their range", () => {
    expect(dieLabel(1, 6)).toBe("d6");
    expect(dieLabel(1, 100)).toBe("d100");
    expect(dieLabel(0, 9)).toBe("d10 (0–9)");
    expect(dieLabel(0, 36)).toBe("0–36");
  });
});

describe("dice expressions", () => {
  it("finds faces for a total, or none when the dice cannot make it", () => {
    expect(facesForTotal("2d6", 7)).toEqual([6, 1]);
    expect(facesForTotal("2d6", 13)).toBeUndefined();
    expect(facesForTotal("2d6", 1)).toBeUndefined();
    expect(facesForTotal("d66", 35)).toEqual([3, 5]);
    expect(facesForTotal("d66", 37)).toBeUndefined();
    expect(facesForTotal("d66", 70)).toBeUndefined();
    expect(facesForTotal("3d6+2", 20)).toEqual([6, 6, 6]);
    expect(facesForTotal("1d6-1d4", -3)).toEqual([1, 4]);
    for (const expr of ["2d6", "3d6", "d66", "2d8+1d4-1", "4d10"]) {
      for (let total = -10; total < 80; total++) {
        const faces = facesForTotal(expr, total);
        if (faces) expect(rollEntered((rng) => rollDice(expr, rng).total, faces)).toBe(total);
      }
    }
  });

  it("asks for each die in roll order, grouped so the total can be typed", () => {
    expect(describeDiceToEnter((rng) => rollDice("d66", rng))).toBe("d66");
    expect(describeDiceToEnter((rng) => rollDice("d66", rng), { totals: false })).toBe("d66 tens d6, d66 ones d6");
    expect(describeDiceToEnter((rng) => rollDice("3d6", rng), { totals: false })).toBe("d6 ×3");
    expect(describeDiceToEnter((rng) => rollDice("1d20", rng))).toBe("d20");
  });
});

describe("planning an entry", () => {
  const tables: RollTable[] = [
    {
      id: "t.main",
      name: "Main",
      dice: "2d6",
      original: true,
      rows: [
        { range: [2, 6], result: "quiet" },
        { range: [7, 12], result: { text: "trouble" }, roll: [{ table: "t.who", as: "who" }] },
      ],
    },
    {
      id: "t.who",
      name: "Who",
      dice: "d66",
      original: true,
      rows: [
        { range: [11, 36], result: "crew" },
        { range: [41, 66], result: "stranger" },
      ],
    },
  ];
  const registry = createTableRegistry(tables);
  const run = (rng: Rng) => rollTable(tables[0]!, rng, registry);

  it("lays out the dice as they come in: a nested table appears once its row is known", () => {
    const empty = planEntry(run, []);
    expect(empty.slots.map((s) => s.label)).toEqual(["2d6"]);
    expect(empty.missing).toBe(2);
    expect(missingText(empty)).toBe("Needs 2 more dice.");

    const quiet = planEntry(run, [5]);
    expect(quiet.faces).toBeDefined();
    expect(rollPlannedTotal(quiet.faces!)).toBe(5);

    const trouble = planEntry(run, [9]);
    expect(trouble.faces).toBeUndefined();
    expect(trouble.slots.map((s) => [s.label, s.settled])).toEqual([
      ["2d6", true],
      ["d66", true],
    ]);
    const done = planEntry(run, [9, 52]);
    expect(done.faces).toEqual([6, 3, 5, 2]);
    const rec = rollEntered(run, done.faces!);
    expect(rec.total).toBe(9);
    expect(rec.nested?.[0]?.total).toBe(52);
    expect(rec.result).toEqual({ text: "trouble", who: "stranger" });
  });

  it("checks each value inline", () => {
    const bad = planEntry(run, [13]);
    expect(bad.slots[0]!.error).toMatch(/2d6 can't make 13/);
    expect(missingText(bad)).toMatch(/2d6 can't make 13/);
    const each = planEntry(run, [7, 0], { totals: false });
    expect(each.slots.map((s) => s.label)).toEqual(["d6", "d6"]);
    expect(each.slots[1]!.error).toMatch(/d6 shows 1–6/);
  });

  it("reports a roll that asks for too many dice", () => {
    const probe = probeDice((rng) => {
      for (;;) rng.int(1, 6);
    });
    expect(probe.complete).toBe(false);
    expect(probe.error).toMatch(/more than 200 dice/);
  });

  function rollPlannedTotal(faces: number[]): number {
    return rollEntered(run, faces).total;
  }
});

describe("every built-in engine replays from the faces an app roll used", () => {
  const engines: Array<{ name: string; dice: DiceSystem; inputs: Array<Record<string, unknown>> }> = [
    {
      name: "d20",
      dice: createDiceEngine({ engine: "d20" }),
      inputs: [
        { attribute: 14, dc: 12 },
        { attribute: 14, advantage: "advantage", dc: 15 },
        { attribute: 8, advantage: "disadvantage" },
      ],
    },
    {
      name: "d20 four degrees",
      dice: createDiceEngine({ engine: "d20", abilityModifier: false, critMargin: 10, naturalShift: true, advantageNames: { advantage: "fortune", disadvantage: "misfortune" } }),
      inputs: [{ attribute: 5, dc: 15, advantage: "advantage" }],
    },
    {
      name: "pool",
      dice: createDiceEngine({
        engine: "pool",
        dice: [
          { id: "base", name: "Base" },
          { id: "gear", name: "Gear", count: 2, bane: [1] },
        ],
        push: { lockBanes: true },
      }),
      inputs: [{ attribute: 3, skill: 2 }],
    },
    { name: "2d6", dice: createDiceEngine({ engine: "2d6" }), inputs: [{ attribute: 1 }] },
    { name: "d100", dice: createDiceEngine({ engine: "d100", push: {} }), inputs: [{ skill: 45 }, { skill: 60, bonus: 2 }, { skill: 30, bonus: -1 }] },
  ];
  for (const { name, dice, inputs } of engines) {
    it(name, () => {
      for (const input of inputs) {
        const pool = dice.buildPool(input);
        for (let i = 0; i < 40; i++) {
          const { app, typed } = replays((rng) => dice.roll(pool, rng), `${name}-${i}`);
          expect(typed).toEqual(app);
          if (dice.push && app.canPush) {
            const pushed = replays((rng) => dice.push!(app, rng, input), `${name}-${i}/push`);
            expect(pushed.typed).toEqual(pushed.app);
          }
        }
        expect(enteredReplayProblem((rng) => dice.roll(pool, rng), createRng(name))).toBeUndefined();
      }
    });
  }

  it("d20 with advantage asks for two d20; pools name their dice; d100 reads as a percentile", () => {
    const d20 = createDiceEngine({ engine: "d20" });
    expect(describeDiceToEnter((rng) => d20.roll(d20.buildPool({ attribute: 12, advantage: "advantage" }), rng))).toBe("d20 ×2");
    const pool = createDiceEngine({
      engine: "pool",
      dice: [
        { id: "base", name: "Base" },
        { id: "stress", name: "Stress", count: { var: "stress" } },
      ],
    });
    expect(describeDiceToEnter((rng) => pool.roll(pool.buildPool({ attribute: 3, skill: 1, stress: 2 }), rng))).toBe("Base ×4, Stress ×2");
    const d100 = createDiceEngine({ engine: "d100" });
    const p = d100.buildPool({ skill: 50 });
    expect(describeDiceToEnter((rng) => d100.roll(p, rng))).toBe("d100");
    for (const [typedValue, total] of [
      [47, 47],
      [100, 100],
      [10, 10],
      [1, 1],
    ]) {
      const plan = planEntry((rng) => d100.roll(p, rng), [typedValue]);
      expect(rollEntered((rng) => d100.roll(p, rng), plan.faces!).total).toBe(total);
    }
    expect(describeDiceToEnter((rng) => d100.roll(d100.buildPool({ skill: 50, bonus: 1 }), rng))).toBe("Units d10 (0–9), Tens d10 (00–90), Bonus tens d10 (00–90)");
    const two = createDiceEngine({ engine: "2d6" });
    const plan = planEntry((rng) => two.roll(two.buildPool({ attribute: 1 }), rng), [10]);
    expect(rollEntered((rng) => two.roll(two.buildPool({ attribute: 1 }), rng), plan.faces!).total).toBe(11);
  });

  it("a d20 roll with advantage keeps the higher of the two faces typed", () => {
    const d20 = createDiceEngine({ engine: "d20" });
    const pool = d20.buildPool({ attribute: 10, advantage: "advantage", dc: 15 });
    const r = rollEntered((rng) => d20.roll(pool, rng), [4, 17]);
    expect(r.dice.map((d) => [d.value, !!d.dropped])).toEqual([
      [4, true],
      [17, false],
    ]);
    expect(r.total).toBe(17);
    expect(r.successes).toBeGreaterThan(0);
  });
});

describe("procedures with dice rolled at the table", () => {
  const tables: RollTable[] = [
    {
      id: "p.kind",
      name: "Kind",
      dice: "d6",
      original: true,
      rows: [
        { range: [1, 3], result: "small" },
        { range: [4, 6], result: "large" },
      ],
    },
    { id: "p.size", name: "Size", dice: "2d6", original: true, rows: [{ range: [2, 12], result: "n" }] },
  ];
  const procedure: Procedure = {
    id: "p.test",
    name: "Test",
    original: true,
    steps: [
      { id: "kind", table: "p.kind" },
      { id: "size", table: "p.size", reads: ["kind"], repeat: 2 },
      { id: "count", compute: (_ctx, rng) => rng.int(1, 6) + rng.int(1, 6) },
    ],
    produce: () => ({ entities: [], relationships: [] }),
  };
  const module = { tables, manifest: { version: "1.0.0" } } as never;

  it("a step takes its entered faces and records them; the others keep their seed", () => {
    const app = runProcedure(procedure, module, { seed: "s" });
    const typed = runProcedure(procedure, module, { seed: "s", stepDice: { kind: [5], size: [3, 4, 6, 6] } });
    expect(typed.results.kind).toBe("large");
    expect(typed.rolls.filter((r) => r.step === "size").map((r) => r.total)).toEqual([7, 12]);
    expect(typed.results.count).toBe(app.results.count);
    expect(typed.entered).toEqual({ kind: [5], size: [3, 4, 6, 6] });
    expect(app.entered).toBeUndefined();
    expect(() => runProcedure(procedure, module, { seed: "s", stepDice: { kind: [5, 5] } })).toThrow(/Step “kind”: This roll uses 1 die/);
  });

  it("probing a step finds the dice it asks for", () => {
    const plan = planEntry(
      (rng) =>
        runProcedure(procedure, module, {
          seed: "s",
          stepRng: (id) => (id === "size" ? rng : undefined),
        }),
      [],
    );
    expect(plan.slots.map((s) => s.label)).toEqual(["2d6", "2d6"]);
  });

  it("typing the faces of a seeded run back in gives the same run", () => {
    for (const seed of ["a", "b", "c"]) {
      const faces: Record<string, number[]> = {};
      const app = runProcedure(procedure, module, {
        seed,
        stepRng: (id) => {
          const rec = recordDice(createRng(seed).fork(`${procedure.id}/${id}`));
          faces[id] = rec.faces;
          return rec.rng;
        },
      });
      const { entered: _e, ...typed } = runProcedure(procedure, module, { seed, stepDice: faces });
      expect(typed).toEqual(app);
    }
  });
});
