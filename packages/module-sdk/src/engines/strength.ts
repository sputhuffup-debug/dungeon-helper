/**
 * Ranking pools across characters ("who is best at this roll"): the dice
 * system's own `strength` if it has one, else a roll-under target (d100),
 * else the flat modifier (d20, 2d6), else the number of dice (pools).
 */
import type { DicePool, DiceSystem, PoolStrength } from "../types";

export function poolStrength(system: Pick<DiceSystem, "strength">, pool: DicePool): PoolStrength {
  if (system.strength) return system.strength(pool);
  const target = pool.meta?.target;
  if (typeof target === "number" && Number.isFinite(target)) return { score: target, label: `${target}%` };
  if (typeof pool.modifier === "number" && Number.isFinite(pool.modifier)) return { score: pool.modifier, label: pool.modifier < 0 ? `−${-pool.modifier}` : `+${pool.modifier}` };
  const dice = Object.values(pool.dice).reduce((a, b) => a + (b > 0 ? b : 0), 0);
  return { score: dice, label: String(dice), spoken: `${dice} ${dice === 1 ? "die" : "dice"}` };
}
