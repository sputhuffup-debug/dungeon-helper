/** 2d6 engine (Powered by the Apocalypse style): 2d6 + stat + modifier, read as bands (10+ / 7-9 / 6-). */
import type { DicePool, DiceSystem, RolledDie, RollResult, Rng } from "../types";
import { facesGroup } from "../dice";
import { builtBy, num, numberRule, rollFree, signed } from "./shared";
import type { RollBand, TwoD6EngineConfig } from "./types";

export const DEFAULT_BANDS: RollBand[] = [
  { min: 10, id: "strong-hit", label: "Strong hit", tone: "success" },
  { min: 7, id: "weak-hit", label: "Weak hit", tone: "partial" },
  { min: -99, id: "miss", label: "Miss", tone: "failure" },
];

export function createTwoD6Engine(config: TwoD6EngineConfig): DiceSystem {
  const bands = [...(config.bands && config.bands.length > 0 ? config.bands : DEFAULT_BANDS)].sort((a, b) => b.min - a.min);
  const ids = new Set(bands.map((b) => b.id));
  if (ids.size !== bands.length) throw new Error("dice engine: 2d6 band ids must be unique");
  for (const b of bands) if (typeof b.min !== "number" || !Number.isInteger(b.min)) throw new Error(`dice engine: 2d6 band "${b.id}" needs an integer min`);
  const lowest = bands[bands.length - 1]!;
  if (lowest.min > -10) throw new Error(`dice engine: the lowest 2d6 band ("${lowest.id}") must cover every total: use min -99`);
  const specs = [{ id: "d6", name: "d6", faces: 6 }];

  const finish = (pool: DicePool, dice: RolledDie[]): RollResult => {
    const total = dice.reduce((a, d) => a + d.value, 0) + num(pool.modifier);
    const index = bands.findIndex((b) => total >= b.min);
    const band = bands[index] ?? lowest;
    // Degree: the miss band is 0, each band above it one more.
    const successes = bands.length - 1 - (index === -1 ? bands.length - 1 : index);
    const result: RollResult = { pool, dice, successes, symbols: {}, pushes: 0, canPush: false, total, outcome: { id: band.id, label: band.label, ...(band.tone ? { tone: band.tone } : {}) } };
    if (dice.length === 2 && dice.every((d) => d.value === 6)) result.critical = true;
    if (dice.length === 2 && dice.every((d) => d.value === 1)) result.fumble = true;
    return result;
  };

  return {
    engine: "2d6",
    dice: specs,
    resultStyle: "total",
    rollOptions: { type: "object", properties: { modifier: { type: "integer", title: "Forward / ongoing", minimum: -6, maximum: 6, default: 0 } } },
    buildPool(input) {
      const stat = Math.floor(config.stat === undefined ? num(input.attribute) + num(input.skill) : numberRule(config.stat, input));
      const extra = Math.floor(num(input.modifier));
      const breakdown: NonNullable<DicePool["breakdown"]> = [{ label: "Stat", die: "mod", count: stat }];
      if (extra) breakdown.push({ label: "Modifier", die: "mod", count: extra });
      const modifier = stat + extra;
      return { dice: { d6: 2 }, breakdown, modifier, label: `2d6 ${signed(modifier)}`, meta: { engine: "2d6" } };
    },
    roll(pool: DicePool, rng: Rng): RollResult {
      if (!builtBy(pool, "2d6")) return rollFree(pool, specs, rng);
      const group = facesGroup("2d6");
      return finish(pool, [
        { die: "d6", value: rng.int(1, 6, { label: "d6", die: "d6", group }) },
        { die: "d6", value: rng.int(1, 6, { label: "d6", die: "d6", group }) },
      ]);
    },
    describe(result) {
      if (result.total === undefined) return result.dice.map((d) => d.value).join(", ");
      const sum = result.dice.reduce((a, d) => a + d.value, 0);
      return `${sum} ${signed(num(result.pool.modifier))} = ${result.total}: ${result.outcome?.label ?? ""}`;
    },
  };
}
