import { describe, expect, it } from "vitest";
import { abilityModifier, createDiceEngine, createRng, type DiceSystem, type RollResult } from "../src";

function rollMany(dice: DiceSystem, input: Record<string, unknown>, n: number, prefix = "s"): RollResult[] {
  const pool = dice.buildPool(input);
  return Array.from({ length: n }, (_, i) => dice.roll(pool, createRng(`${prefix}-${i}`)));
}

describe("dice engines", () => {
  it("rejects unknown engines and bad configs", () => {
    expect(() => createDiceEngine({ engine: "d12" } as never)).toThrow(/unknown dice engine/);
    expect(() => createDiceEngine({ engine: "d20", critOn: 25 })).toThrow(/critOn/);
    expect(() => createDiceEngine({ engine: "2d6", bands: [{ min: 7, id: "hit", label: "Hit" }] })).toThrow(/cover every total/);
    expect(() => createDiceEngine({ engine: "pool", dice: [{ id: "a", name: "A" }, { id: "a", name: "B" }] })).toThrow(/unique/);
    expect(() => createDiceEngine({ engine: "d100", degrees: [{ id: "x", label: "X", fraction: 2 }] })).toThrow(/fraction/);
  });

  it("every engine is deterministic for a seed", () => {
    const configs = [{ engine: "d20" as const }, { engine: "pool" as const }, { engine: "2d6" as const }, { engine: "d100" as const }];
    for (const config of configs) {
      const dice = createDiceEngine(config);
      const input = { attribute: 3, skill: 40, modifier: 1, advantage: "advantage", dc: 12, bonus: 1 };
      expect(rollMany(dice, input, 20, "a")).toEqual(rollMany(createDiceEngine(config), input, 20, "a"));
      expect(rollMany(dice, input, 20, "a")).not.toEqual(rollMany(dice, input, 20, "b"));
    }
  });

  describe("d20", () => {
    const d20 = createDiceEngine({ engine: "d20", proficiency: { var: "computed.proficiencyBonus" } });

    it("computes the ability modifier from the score", () => {
      expect([1, 8, 9, 10, 11, 12, 15, 20, 30].map(abilityModifier)).toEqual([-5, -1, -1, 0, 0, 1, 2, 5, 10]);
    });

    it("adds ability modifier, proficiency × skill and a modifier", () => {
      const pool = d20.buildPool({ attribute: 16, skill: 2, modifier: -1, computed: { proficiencyBonus: 3 }, attributeId: "might" });
      expect(pool.modifier).toBe(3 + 6 - 1);
      expect(pool.dice).toEqual({ d20: 1 });
      expect(pool.label).toBe("1d20 + 8");
      expect(pool.breakdown?.map((b) => b.label)).toEqual(["Might 16", "Proficiency ×2", "Modifier"]);
      const r = d20.roll(pool, createRng("x"));
      expect(r.total).toBe(r.dice[0]!.value + 8);
      expect(r.outcome).toBeUndefined();
      expect(d20.resultStyle).toBe("total");
    });

    it("half proficiency rounds down", () => {
      expect(d20.buildPool({ attribute: 10, skill: 0.5, computed: { proficiencyBonus: 3 } }).modifier).toBe(1);
    });

    it("keeps the higher die with advantage and the lower with disadvantage", () => {
      for (const [advantage, pick] of [["advantage", Math.max], ["disadvantage", Math.min]] as const) {
        for (const r of rollMany(d20, { attribute: 10, advantage }, 50)) {
          expect(r.dice).toHaveLength(2);
          const kept = r.dice.filter((d) => !d.dropped);
          expect(kept).toHaveLength(1);
          expect(kept[0]!.value).toBe(pick(r.dice[0]!.value, r.dice[1]!.value));
          expect(r.total).toBe(kept[0]!.value);
        }
      }
    });

    it("succeeds against a DC and flags natural crits and fumbles", () => {
      const results = rollMany(d20, { attribute: 10, dc: 11 }, 400);
      for (const r of results) {
        expect(r.target).toBe(11);
        expect(r.successes).toBe(r.total! >= 11 ? 1 : 0);
        expect(r.outcome?.id).toBe(r.successes ? "success" : "failure");
        expect(r.critical).toBe(r.dice[0]!.value === 20);
        expect(r.fumble).toBe(r.dice[0]!.value === 1);
      }
      expect(results.some((r) => r.critical)).toBe(true);
      expect(results.some((r) => r.fumble)).toBe(true);
    });

    it("can make natural results decide the roll", () => {
      const strict = createDiceEngine({ engine: "d20", critSucceeds: true, fumbleFails: true, critOn: 19 });
      for (const r of rollMany(strict, { attribute: 30, dc: 40 }, 300)) expect(r.successes).toBe(r.dice[0]!.value >= 19 ? 1 : 0);
      for (const r of rollMany(strict, { attribute: 30, dc: 2 }, 300)) if (r.dice[0]!.value === 1) expect(r.successes).toBe(0);
    });

    it("rolls a free pool as a plain sum", () => {
      const r = d20.roll({ dice: { d20: 2 } }, createRng("free"));
      expect(r.total).toBe(r.dice[0]!.value + r.dice[1]!.value);
      expect(r.outcome).toBeUndefined();
    });
  });

  describe("pool", () => {
    it("defaults to a d6 pool succeeding on 6 with one push", () => {
      const pool = createDiceEngine({ engine: "pool" });
      const built = pool.buildPool({ attribute: 3, skill: 2 });
      expect(built.dice).toEqual({ d6: 5 });
      for (const r of rollMany(pool, { attribute: 3, skill: 2 }, 50)) {
        expect(r.successes).toBe(r.dice.filter((d) => d.value === 6).length);
        expect(r.canPush).toBe(true);
        const pushed = pool.push!(r, createRng("p"));
        expect(pushed.pushes).toBe(1);
        expect(pushed.canPush).toBe(false);
        r.dice.forEach((d, i) => {
          if (d.value === 6) expect(pushed.dice[i]).toEqual({ ...d, kept: true });
        });
        expect(pool.push!(pushed, createRng("q"))).toBe(pushed);
      }
    });

    it("keeps a minimum of dice", () => {
      const pool = createDiceEngine({ engine: "pool", minDice: 1 });
      expect(pool.buildPool({ attribute: 0, skill: 0, modifier: -3 }).dice.d6).toBe(1);
    });

    it("supports several die kinds, thresholds, banes and locked banes", () => {
      const pool = createDiceEngine({
        engine: "pool",
        dice: [
          { id: "base", name: "Base", success: [5, 6], bane: [1] },
          { id: "gear", name: "Gear", faces: 8, success: [7, 8], count: { var: "gear" } },
        ],
        push: { max: 2, lockBanes: true },
      });
      const built = pool.buildPool({ attribute: 2, skill: 1, gear: 2 });
      expect(built.dice).toEqual({ base: 3, gear: 2 });
      for (const r of rollMany(pool, { attribute: 2, skill: 1, gear: 2 }, 50)) {
        const expected = r.dice.filter((d) => (d.die === "base" ? d.value >= 5 : d.value >= 7)).length;
        expect(r.successes).toBe(expected);
        expect(r.symbols.bane ?? 0).toBe(r.dice.filter((d) => d.die === "base" && d.value === 1).length);
        const pushed = pool.push!(r, createRng("p"));
        r.dice.forEach((d, i) => {
          if (d.die === "base" && d.value === 1) expect(pushed.dice[i]!.value).toBe(1);
        });
        expect(pushed.canPush).toBe(true);
        expect(pool.push!(pushed, createRng("p2")).canPush).toBe(false);
      }
    });

    it("can turn pushing off", () => {
      expect(createDiceEngine({ engine: "pool", push: false }).push).toBeUndefined();
    });
  });

  describe("2d6", () => {
    const pbta = createDiceEngine({ engine: "2d6" });

    it("reads the total as bands", () => {
      for (const r of rollMany(pbta, { attribute: 1, modifier: 1 }, 200)) {
        const total = r.dice[0]!.value + r.dice[1]!.value + 2;
        expect(r.total).toBe(total);
        const id = total >= 10 ? "strong-hit" : total >= 7 ? "weak-hit" : "miss";
        expect(r.outcome?.id).toBe(id);
        expect(r.successes).toBe(id === "strong-hit" ? 2 : id === "weak-hit" ? 1 : 0);
      }
    });

    it("takes custom bands and a stat rule", () => {
      const custom = createDiceEngine({
        engine: "2d6",
        stat: { var: "fields.stats.cool" },
        bands: [
          { min: -99, id: "miss", label: "Miss" },
          { min: 12, id: "critical", label: "Critical", tone: "critical" },
          { min: 7, id: "hit", label: "Hit" },
        ],
      });
      const pool = custom.buildPool({ fields: { stats: { cool: 2 } } });
      expect(pool.modifier).toBe(2);
      for (const r of rollMany(custom, { fields: { stats: { cool: 2 } } }, 200)) {
        expect(r.outcome?.id).toBe(r.total! >= 12 ? "critical" : r.total! >= 7 ? "hit" : "miss");
      }
    });
  });

  describe("d100", () => {
    const coc = createDiceEngine({ engine: "d100", fumbleLowTarget: { below: 50, at: 96 }, push: { max: 1 } });

    it("rolls under the target with extreme, hard and regular degrees", () => {
      const results = rollMany(coc, { skill: 60 }, 600);
      for (const r of results) {
        const v = r.total!;
        expect(r.target).toBe(60);
        const expected = v === 1 ? "critical" : v <= 12 ? "extreme" : v <= 30 ? "hard" : v <= 60 ? "regular" : v >= 100 ? "fumble" : "failure";
        expect(r.outcome?.id).toBe(expected);
        expect(r.successes).toBe({ critical: 3, extreme: 3, hard: 2, regular: 1, failure: 0, fumble: 0 }[expected]);
      }
      expect(new Set(results.map((r) => r.outcome?.id))).toEqual(new Set(["critical", "extreme", "hard", "regular", "failure", "fumble"]));
    });

    it("fumbles from 96 when the target is low", () => {
      for (const r of rollMany(coc, { skill: 30 }, 600)) expect(r.fumble).toBe(r.total! >= 96);
    });

    it("uses the attribute when no skill is given, plus a modifier", () => {
      expect(coc.buildPool({ attribute: 45, modifier: -5 }).meta?.target).toBe(40);
    });

    it("bonus dice keep the lowest tens, penalty dice the highest", () => {
      for (const [bonus, pick] of [[1, Math.min], [2, Math.min], [-1, Math.max]] as const) {
        for (const r of rollMany(coc, { skill: 50, bonus }, 100)) {
          expect(r.dice).toHaveLength(1 + Math.abs(bonus));
          const units = new Set(r.dice.map((d) => d.value % 10));
          expect(units.size).toBe(1);
          expect(r.total).toBe(pick(...r.dice.map((d) => d.value)));
          expect(r.dice.filter((d) => !d.dropped)).toHaveLength(1);
        }
      }
    });

    it("pushes once by re-rolling everything", () => {
      const [r] = rollMany(coc, { skill: 50 }, 1);
      const pushed = coc.push!(r!, createRng("push"));
      expect(pushed.pushes).toBe(1);
      expect(pushed.canPush).toBe(false);
      expect(pushed.notes).toEqual(["pushed"]);
    });
  });
});
