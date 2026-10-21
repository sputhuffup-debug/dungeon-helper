/**
 * Rule 3 as a check: the same seed and module version give the same output.
 * Every procedure runs twice per seed (with its optional steps) and every
 * dice roll and push is made twice from the same seed; any difference is an
 * error. Catches module code that reads the clock, `Math.random` or shared
 * mutable state.
 */
import { schemaDefaults } from "./entities";
import type { ConformanceIssue } from "./module";
import { runProcedure } from "./procedures";
import { createRng } from "./rng";
import type { GameModule } from "./types";

export interface DeterminismOptions {
  /** Seeds per procedure (default 25). */
  seeds?: number;
  /** Per-procedure inputs; defaults come from the procedure's input schema. */
  procedureInputs?: Record<string, Record<string, unknown>>;
}

/** Roll inputs used to exercise a dice system: plain numbers plus each roll option at its extremes. */
function diceInputs(module: GameModule): Array<Record<string, unknown>> {
  const base: Array<Record<string, unknown>> = [{}, { attribute: 3, skill: 2 }, { attribute: 14, skill: 1, modifier: 1 }, { attribute: 1, skill: 60 }];
  const props = (module.dice.rollOptions?.properties ?? {}) as Record<string, Record<string, unknown>>;
  for (const [key, s] of Object.entries(props)) {
    if (Array.isArray(s.enum)) for (const v of s.enum) base.push({ attribute: 12, skill: 1, [key]: v });
    if (typeof s.minimum === "number") base.push({ attribute: 12, skill: 1, [key]: s.minimum });
    if (typeof s.maximum === "number") base.push({ attribute: 12, skill: 1, [key]: s.maximum });
  }
  return base;
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

export function checkDeterminism(module: GameModule, options: DeterminismOptions = {}): ConformanceIssue[] {
  const issues: ConformanceIssue[] = [];
  const seeds = options.seeds ?? 25;
  for (const proc of module.procedures) {
    const where = `procedure:${proc.id}`;
    const inputs = options.procedureInputs?.[proc.id] ?? (proc.inputs ? schemaDefaults(proc.inputs) : {});
    const includeOptional = proc.steps.filter((s) => s.optional).map((s) => s.id);
    for (let i = 0; i < seeds; i++) {
      const seed = `determinism-${i}`;
      try {
        const a = runProcedure(proc, module, { seed, inputs, includeOptional });
        const b = runProcedure(proc, module, { seed, inputs, includeOptional });
        if (!same(a, b)) {
          issues.push({ severity: "error", where, message: `two runs with seed "${seed}" gave different results (rule 3: same seed, same output)` });
          break;
        }
      } catch (e) {
        issues.push({ severity: "error", where, message: `threw for seed "${seed}": ${(e as Error).message}` });
        break;
      }
    }
  }
  const dice = module.dice;
  for (const [n, input] of diceInputs(module).entries()) {
    const seed = `determinism-dice-${n}`;
    try {
      const pool = dice.buildPool(input);
      if (!same(pool, dice.buildPool(input))) {
        issues.push({ severity: "error", where: "dice", message: `buildPool(${JSON.stringify(input)}) is not stable` });
        continue;
      }
      const a = dice.roll(pool, createRng(seed));
      const b = dice.roll(pool, createRng(seed));
      if (!same(a, b)) issues.push({ severity: "error", where: "dice", message: `two rolls with seed "${seed}" differ for input ${JSON.stringify(input)}` });
      if (dice.push && a.canPush && !same(dice.push(a, createRng(`${seed}/push`), input), dice.push(b, createRng(`${seed}/push`), input))) {
        issues.push({ severity: "error", where: "dice", message: `two pushes with seed "${seed}" differ` });
      }
    } catch (e) {
      issues.push({ severity: "error", where: "dice", message: `rolling ${JSON.stringify(input)} threw: ${(e as Error).message}` });
    }
  }
  return issues;
}
