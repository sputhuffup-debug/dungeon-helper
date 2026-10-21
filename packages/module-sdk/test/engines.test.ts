import { describe, expect, it } from "vitest";
import { abilityModifier, createDiceEngine, createRng, poolStrength, type DiceSystem, type RollResult } from "../src";

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

    it("offers extra free-roll dice and sums them", () => {
      expect(d20.dice.map((d) => d.id)).toEqual(["d20"]);
      const withDamage = createDiceEngine({ engine: "d20", freeDice: [6, 8, 20] });
      expect(withDamage.dice.map((d) => d.id)).toEqual(["d20", "d6", "d8"]);
      const r = withDamage.roll({ dice: { d6: 2, d8: 1 } }, createRng("free"));
      expect(r.dice.map((d) => d.die)).toEqual(["d6", "d6", "d8"]);
      expect(r.total).toBe(r.dice.reduce((a, d) => a + d.value, 0));
      expect(() => createDiceEngine({ engine: "d20", freeDice: [1] })).toThrow(/freeDice/);
    });

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

    it("keeps two degrees and the default roll modes unless configured", () => {
      const opts = d20.rollOptions!.properties as Record<string, { enum?: string[] }>;
      expect(opts.advantage!.enum).toEqual(["normal", "advantage", "disadvantage"]);
      expect(Object.keys(opts)).toEqual(["advantage", "dc", "modifier"]);
      for (const r of rollMany(d20, { attribute: 10, dc: 11 }, 200)) expect(["success", "failure"]).toContain(r.outcome!.id);
    });

    describe("four degrees of success (critMargin, naturalShift)", () => {
      const four = createDiceEngine({ engine: "d20", abilityModifier: false, critMargin: 10, naturalShift: true });
      /** Roll with a fixed natural result: find a seed that gives it. */
      const rollNatural = (natural: number, modifier: number, dc: number): RollResult => {
        const pool = four.buildPool({ attribute: modifier, dc });
        for (let i = 0; i < 2000; i++) {
          const r = four.roll(pool, createRng(`nat-${i}`));
          if (r.dice[0]!.value === natural) return r;
        }
        throw new Error(`no seed rolls a natural ${natural}`);
      };
      const degree = (natural: number, modifier: number, dc: number) => rollNatural(natural, modifier, dc).outcome!.id;

      it("reads totals against DC + 10 and DC − 10", () => {
        expect(degree(10, 10, 10)).toBe("critical-success"); // 20 = DC + 10
        expect(degree(9, 10, 10)).toBe("success"); // 19
        expect(degree(5, 5, 10)).toBe("success"); // 10 = DC
        expect(degree(4, 5, 10)).toBe("failure"); // 9
        expect(degree(5, -4, 10)).toBe("failure"); // 1, DC − 9
        expect(degree(4, -4, 10)).toBe("critical-failure"); // 0 = DC − 10
      });

      it("a natural 20 improves the degree one step and a natural 1 worsens it", () => {
        expect(degree(20, 0, 25)).toBe("success"); // 20 vs 25: failure → success
        expect(degree(20, 0, 31)).toBe("failure"); // 20 vs 31: critical failure → failure
        expect(degree(20, 0, 15)).toBe("critical-success"); // success → critical success
        expect(degree(20, 20, 10)).toBe("critical-success"); // already the best
        expect(degree(1, 20, 10)).toBe("success"); // 21 vs 10: critical success → success
        expect(degree(1, 10, 10)).toBe("failure"); // 11 vs 10: success → failure
        expect(degree(1, 0, 10)).toBe("critical-failure"); // already the worst
        const shifted = rollNatural(20, 0, 25).outcome!;
        expect(shifted.label).toBe("Success (natural 20)");
        expect(rollNatural(10, 10, 10).outcome).toEqual({ id: "critical-success", label: "Critical success", tone: "critical" });
        expect(rollNatural(4, -4, 10).outcome).toMatchObject({ label: "Critical failure", tone: "fumble" });
      });

      it("counts degrees as successes (2, 1, 0, 0) and matches a direct reading for every total", () => {
        for (const r of rollMany(four, { attribute: 7, dc: 18 }, 400)) {
          const natural = r.dice[0]!.value;
          let step = r.total! >= 28 ? 3 : r.total! >= 18 ? 2 : r.total! <= 8 ? 0 : 1;
          if (natural === 20) step = Math.min(3, step + 1);
          if (natural === 1) step = Math.max(0, step - 1);
          expect(r.outcome!.id).toBe(["critical-failure", "failure", "success", "critical-success"][step]);
          expect(r.successes).toBe([0, 0, 1, 2][step]);
        }
      });

      it("without naturalShift the natural result is only flagged", () => {
        const plain = createDiceEngine({ engine: "d20", abilityModifier: false, critMargin: 10 });
        const pool = plain.buildPool({ attribute: 0, dc: 25 });
        for (let i = 0; i < 400; i++) {
          const r = plain.roll(pool, createRng(`p-${i}`));
          expect(r.outcome!.id).toBe(r.total! <= 15 ? "critical-failure" : "failure");
        }
      });

      it("takes its own labels", () => {
        const named = createDiceEngine({ engine: "d20", abilityModifier: false, critMargin: 10, labels: { criticalSuccess: "Crit!", criticalFailure: "Botch" } });
        const rolls = [...rollMany(named, { attribute: 0, dc: 5 }, 200), ...rollMany(named, { attribute: 0, dc: 15 }, 200)];
        const labels = new Set(rolls.map((r) => r.outcome!.label));
        expect(labels).toEqual(new Set(["Crit!", "Success", "Failure", "Botch"]));
      });

      it("rejects a bad margin", () => {
        expect(() => createDiceEngine({ engine: "d20", critMargin: 0 })).toThrow(/critMargin/);
      });
    });

    it("names the roll modes (fortune / misfortune) without changing how they roll", () => {
      const named = createDiceEngine({ engine: "d20", advantageNames: { advantage: "fortune", disadvantage: "misfortune" } });
      expect((named.rollOptions!.properties as Record<string, { enum?: string[] }>).advantage!.enum).toEqual(["normal", "fortune", "misfortune"]);
      const pool = named.buildPool({ attribute: 10, advantage: "fortune" });
      expect(pool.label).toBe("1d20 + 0 (fortune)");
      for (let i = 0; i < 50; i++) {
        const r = named.roll(pool, createRng(`f-${i}`));
        expect(r.dice).toHaveLength(2);
        expect(r.total).toBe(Math.max(r.dice[0]!.value, r.dice[1]!.value));
        const m = named.roll(named.buildPool({ attribute: 10, advantage: "misfortune" }), createRng(`f-${i}`));
        expect(m.total).toBe(Math.min(m.dice[0]!.value, m.dice[1]!.value));
      }
      // the standard names still work
      expect(named.buildPool({ attribute: 10, advantage: "advantage" }).dice).toEqual({ d20: 2 });
      expect(() => createDiceEngine({ engine: "d20", advantageNames: { advantage: "normal" } })).toThrow(/advantageNames/);
    });

    it("offers situational modifier choices (a multiple attack penalty)", () => {
      const map = createDiceEngine({
        engine: "d20",
        abilityModifier: false,
        modifierChoices: [
          {
            id: "map",
            title: "Attack",
            choices: [
              { label: "1st attack", value: 0 },
              { label: "2nd attack (−5)", value: -5 },
              { label: "3rd attack (−10)", value: -10 },
              { label: "2nd attack, agile (−4)", value: -4 },
              { label: "3rd attack, agile (−8)", value: -8 },
            ],
          },
        ],
      });
      const opt = (map.rollOptions!.properties as Record<string, { enum?: string[]; default?: string; title?: string }>).map!;
      expect(opt).toMatchObject({ title: "Attack", default: "1st attack" });
      expect(opt.enum).toHaveLength(5);
      expect(map.buildPool({ attribute: 9 }).modifier).toBe(9);
      expect(map.buildPool({ attribute: 9, map: "2nd attack (−5)" }).modifier).toBe(4);
      const agile = map.buildPool({ attribute: 9, map: "3rd attack, agile (−8)", modifier: 1 });
      expect(agile.modifier).toBe(2);
      expect(agile.breakdown?.map((b) => [b.label, b.count])).toEqual([["Ability", 9], ["3rd attack, agile (−8)", -8], ["Modifier", 1]]);
      expect(() => createDiceEngine({ engine: "d20", modifierChoices: [{ id: "dc", title: "x", choices: [{ label: "a", value: 0 }, { label: "b", value: 1 }] }] })).toThrow(/modifierChoices/);
      expect(() => createDiceEngine({ engine: "d20", modifierChoices: [{ id: "x", title: "x", choices: [{ label: "a", value: 0 }] }] })).toThrow(/2 to 12/);
    });

    it("adds a rank-based proficiency as is with proficiencyMode add", () => {
      // untrained 0; trained/expert/master/legendary = level + 2/4/6/8
      const ranked = createDiceEngine({
        engine: "d20",
        abilityModifier: false,
        proficiencyMode: "add",
        proficiency: { if: [{ ">": [{ var: "skill" }, 0] }, { "+": [{ var: ["fields.level", 1] }, { "*": [2, { var: "skill" }] }] }, 0] },
      });
      const at = (level: number, rank: number) => ranked.buildPool({ attribute: 3, skill: rank, fields: { level } }).modifier;
      expect([at(1, 0), at(1, 1), at(5, 2), at(10, 3), at(20, 4)]).toEqual([3, 6, 12, 19, 31]);
      expect(ranked.buildPool({ attribute: 3, skill: 2, fields: { level: 5 }, attributeId: "dexterity" }).breakdown?.map((b) => b.label)).toEqual(["Dexterity", "Proficiency"]);
      expect(() => createDiceEngine({ engine: "d20", proficiencyMode: "double" as never })).toThrow(/proficiencyMode/);
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

  it("rates pools for ranking: d20 and 2d6 by modifier, d100 by target, pools by dice, or the system's own strength", () => {
    const d20 = createDiceEngine({ engine: "d20" });
    expect(poolStrength(d20, d20.buildPool({ attribute: 16, skill: 0 }))).toEqual({ score: 3, label: "+3" });
    expect(poolStrength(d20, d20.buildPool({ attribute: 8, skill: 0, advantage: "Advantage" }))).toEqual({ score: -1, label: "−1" });
    const twoD6 = createDiceEngine({ engine: "2d6" });
    expect(poolStrength(twoD6, twoD6.buildPool({ attribute: 2 }))).toEqual({ score: 2, label: "+2" });
    const d100 = createDiceEngine({ engine: "d100" });
    expect(poolStrength(d100, d100.buildPool({ skill: 65 }))).toEqual({ score: 65, label: "65%" });
    const pool = createDiceEngine({ engine: "pool" });
    expect(poolStrength(pool, pool.buildPool({ attribute: 3, skill: 2 }))).toEqual({ score: 5, label: "5", spoken: "5 dice" });
    const own: Pick<DiceSystem, "strength"> = { strength: () => ({ score: 9, label: "nine" }) };
    expect(poolStrength(own, { dice: { d6: 1 } })).toEqual({ score: 9, label: "nine" });
  });
});
