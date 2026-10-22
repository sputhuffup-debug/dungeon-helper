/**
 * Percentile roll-under engine (BRP / Call of Cthulhu style): roll d100 at
 * or under the target. Degrees are fractions of the target (extreme 1/5,
 * hard 1/2, regular). Bonus and penalty dice roll extra tens dice and keep
 * the best or worst. 01 (or `criticalAt`) is a critical, 100 (or from
 * `fumbleAt`) a fumble.
 */
import type { DiceGroup, DicePool, DiceSystem, RolledDie, RollResult, Rng } from "../types";
import { assertInteger, builtBy, num, numberRule, rollFree } from "./shared";
import type { D100EngineConfig, PercentileDegree } from "./types";

export const DEFAULT_DEGREES: PercentileDegree[] = [
  { id: "extreme", label: "Extreme success", fraction: 0.2, tone: "critical" },
  { id: "hard", label: "Hard success", fraction: 0.5, tone: "success" },
  { id: "regular", label: "Success", fraction: 1, tone: "success" },
];

export function createD100Engine(config: D100EngineConfig): DiceSystem {
  const degrees = [...(config.degrees && config.degrees.length > 0 ? config.degrees : DEFAULT_DEGREES)].sort((a, b) => a.fraction - b.fraction);
  for (const d of degrees) if (!(typeof d.fraction === "number" && d.fraction > 0 && d.fraction <= 1)) throw new Error(`dice engine: d100 degree "${d.id}" needs a fraction in (0, 1]`);
  assertInteger(config.criticalAt, "criticalAt", 0, 100);
  assertInteger(config.fumbleAt, "fumbleAt", 1, 101);
  const criticalAt = config.criticalAt ?? 1;
  const fumbleAt = config.fumbleAt ?? 100;
  const tensDice = config.tensDice !== false;
  const push = config.push ? { max: config.push.max ?? 1 } : undefined;
  if (push) assertInteger(push.max, "push.max", 1, 10);
  const failureLabel = config.labels?.failure ?? "Failure";
  const specs = [{ id: "d100", name: "d100", faces: 100 }];

  const fumbleFrom = (target: number) => (config.fumbleLowTarget && target < config.fumbleLowTarget.below ? config.fumbleLowTarget.at : fumbleAt);

  const finish = (pool: DicePool, dice: RolledDie[], pushes: number): RollResult => {
    const kept = dice.find((d) => !d.dropped) ?? dice[0];
    const value = kept?.value ?? 100;
    const target = Math.max(0, Math.floor(num(pool.meta?.target)));
    const critical = criticalAt > 0 && value <= criticalAt;
    const fumble = !critical && value >= fumbleFrom(target);
    let index = degrees.findIndex((d) => value <= Math.floor(target * d.fraction));
    if (critical) index = 0;
    if (fumble) index = -1;
    const degree = index === -1 ? undefined : degrees[index];
    const successes = degree ? degrees.length - index : 0;
    const result: RollResult = {
      pool,
      dice,
      successes,
      symbols: {},
      pushes,
      canPush: !!push && pushes < push.max,
      total: value,
      target,
      critical,
      fumble,
      outcome: degree
        ? { id: critical ? "critical" : degree.id, label: critical ? `Critical (${degree.label.toLowerCase()})` : degree.label, tone: critical ? "critical" : (degree.tone ?? "success") }
        : { id: fumble ? "fumble" : "failure", label: fumble ? "Fumble" : failureLabel, tone: fumble ? "fumble" : "failure" },
    };
    if (critical) result.symbols.critical = 1;
    if (fumble) result.symbols.fumble = 1;
    return result;
  };

  const rollDice = (pool: DicePool, rng: Rng): RolledDie[] => {
    const bonus = Math.max(-2, Math.min(2, Math.floor(num(pool.meta?.bonus))));
    // Without bonus dice the two d10 read as one percentile number (00 and 0 make 100).
    const group: DiceGroup | undefined =
      bonus === 0 ? { label: "d100", min: 1, max: 100, faces: (v) => (Number.isInteger(v) && v >= 1 && v <= 100 ? (v === 100 ? [0, 0] : [v % 10, Math.floor(v / 10)]) : undefined) } : undefined;
    const units = rng.int(0, 9, { label: "Units d10 (0–9)", die: "d100", ...(group ? { group } : {}) });
    const tens: number[] = [rng.int(0, 9, { label: "Tens d10 (00–90)", die: "d100", ...(group ? { group } : {}) })];
    for (let i = 0; i < Math.abs(bonus); i++) tens.push(rng.int(0, 9, { label: `${bonus > 0 ? "Bonus" : "Penalty"} tens d10 (00–90)`, die: "d100" }));
    const values = tens.map((t) => (t === 0 && units === 0 ? 100 : t * 10 + units));
    if (values.length === 1) return [{ die: "d100", value: values[0]! }];
    const best = bonus > 0 ? Math.min(...values) : Math.max(...values);
    let used = false;
    return values.map((v) => {
      if (!used && v === best) {
        used = true;
        return { die: "d100", value: v };
      }
      return { die: "d100", value: v, dropped: true };
    });
  };

  return {
    engine: "d100",
    dice: specs,
    resultStyle: "total",
    rollOptions: {
      type: "object",
      properties: {
        modifier: { type: "integer", title: "Target modifier", minimum: -100, maximum: 100, default: 0 },
        ...(tensDice ? { bonus: { type: "integer", title: "Bonus (+) / penalty (−) dice", minimum: -2, maximum: 2, default: 0 } } : {}),
      },
    },
    buildPool(input) {
      const base = config.target === undefined ? (num(input.skill) > 0 ? num(input.skill) : num(input.attribute)) : numberRule(config.target, input);
      const extra = Math.floor(num(input.modifier));
      const target = Math.max(0, Math.floor(base) + extra);
      const bonus = tensDice ? Math.max(-2, Math.min(2, Math.floor(num(input.bonus)))) : 0;
      const breakdown: NonNullable<DicePool["breakdown"]> = [{ label: "Target", die: "mod", count: Math.floor(base) }];
      if (extra) breakdown.push({ label: "Modifier", die: "mod", count: extra });
      const dice = bonus === 0 ? "" : bonus > 0 ? ` (${bonus} bonus ${bonus === 1 ? "die" : "dice"})` : ` (${-bonus} penalty ${bonus === -1 ? "die" : "dice"})`;
      return { dice: { d100: 1 }, breakdown, label: `d100 ≤ ${target}${dice}`, meta: { engine: "d100", target, bonus } };
    },
    roll(pool: DicePool, rng: Rng): RollResult {
      if (!builtBy(pool, "d100")) return rollFree(pool, specs, rng);
      return finish(pool, rollDice(pool, rng), 0);
    },
    ...(push
      ? {
          push(previous: RollResult, rng: Rng): RollResult {
            if (!previous.canPush) return previous;
            const next = finish(previous.pool, rollDice(previous.pool, rng), previous.pushes + 1);
            next.notes = ["pushed"];
            return next;
          },
        }
      : {}),
    describe(result) {
      if (result.target === undefined) return result.dice.map((d) => d.value).join(", ");
      return `${result.total} vs ${result.target}: ${result.outcome?.label ?? ""}${result.pushes ? " (pushed)" : ""}`;
    },
  };
}
