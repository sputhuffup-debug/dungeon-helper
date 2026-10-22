import { describe, expect, it } from "vitest";
import { checkDeterminism, createRng, createTableRegistry, describeDiceToEnter, enteredReplayProblem, planEntry, recordDice, rollEntered, type RollResult } from "@campaign-forge/module-sdk";
import { alienModule } from "../src";
import { diceSystem, operations } from "../src/dice";
import { tables } from "../src/tables";

const registry = createTableRegistry(tables);

describe("Alien dice rolled at the table", () => {
  it("asks for base dice, then stress dice, and a push for the re-rolled dice and one new stress die", () => {
    const pool = diceSystem.buildPool({ attribute: 3, skill: 1, stress: 2 });
    expect(describeDiceToEnter((rng) => diceSystem.roll(pool, rng))).toBe("Base die ×4, Stress die ×2");
    const first = rollEntered((rng) => diceSystem.roll(pool, rng), [6, 2, 3, 4, 5, 6]);
    expect(first.successes).toBe(2);
    expect(first.canPush).toBe(true);
    // the two sixes stay; three base dice and one stress die are re-rolled, then the push adds a stress die
    const plan = planEntry((rng) => diceSystem.push!(first, rng, {}), []);
    expect(plan.slots.map((s) => s.label)).toEqual(["Base die (re-roll)", "Base die (re-roll)", "Base die (re-roll)", "Stress die (re-roll)", "New stress die (push)"]);
    const pushed = rollEntered((rng) => diceSystem.push!(first, rng, {}), [6, 1, 1, 1, 1]);
    expect(pushed.successes).toBe(3);
    expect(pushed.symbols.facehugger).toBe(2);
    expect(pushed.meta?.stressAfter).toBe(3);
  });

  it("a facehugger on an entered stress die blocks the push, as an app roll does", () => {
    const pool = diceSystem.buildPool({ attribute: 2, skill: 0, stress: 1 });
    const r: RollResult = rollEntered((rng) => diceSystem.roll(pool, rng), [3, 4, 1]);
    expect(r.symbols.facehugger).toBe(1);
    expect(r.canPush).toBe(false);
  });

  it("rolls and pushes replay from the faces an app roll used", () => {
    for (let i = 0; i < 60; i++) {
      const pool = diceSystem.buildPool({ attribute: 1 + (i % 5), skill: i % 4, stress: i % 3 });
      const rec = recordDice(createRng(`alien-${i}`));
      const app = diceSystem.roll(pool, rec.rng);
      expect(rollEntered((rng) => diceSystem.roll(pool, rng), rec.faces)).toEqual(app);
      if (app.canPush) expect(enteredReplayProblem((rng) => diceSystem.push!(app, rng, {}), createRng(`alien-${i}/push`))).toBeUndefined();
    }
  });

  it("dice operations (stress response, panic, supply, critical injury) replay from their faces", () => {
    const inputs: Array<[string, Record<string, unknown>]> = [
      ["stressResponse", { entity: "e1", stress: 3, resolve: 1 }],
      ["panicRoll", { entity: "e1", stress: 6, resolve: 2 }],
      ["supplyRoll", { entity: "e1", rating: 4, path: "gear.0.supply", label: "Air" }],
      ["criticalInjury", { entity: "e1" }],
      ["mentalTrauma", { entity: "e1" }],
      ["inseminationCheck", { entity: "e1" }],
    ];
    for (const [id, input] of inputs) {
      const op = operations[id]!;
      expect(op, id).toBeDefined();
      for (let i = 0; i < 25; i++)
        expect(
          enteredReplayProblem((rng) => op.run(input, rng, registry), createRng(`${id}-${i}`)),
          id,
        ).toBeUndefined();
    }
    expect(describeDiceToEnter((rng) => operations.supplyRoll!.run({ rating: 3 }, rng, registry))).toBe("Stress die ×3");
  });

  it("generators replay step by step from entered dice (determinism check)", () => {
    const issues = checkDeterminism(alienModule, { seeds: 3 }).filter((i) => i.message.includes("typing") || i.message.includes("entered"));
    expect(issues).toEqual([]);
  }, 60_000);
});
