/**
 * Procedure runner: seeded, multi-step generators over module tables.
 * Each step gets its own RNG derived from (stepSeed ?? seed, procedure id,
 * step id), so re-seeding one step never changes another.
 */
import { rollDice } from "./dice";
import { getPath } from "./logic";
import { createRng } from "./rng";
import { createTableRegistry, rollTable } from "./tables";
import type {
  GameModule,
  GeneratedGraph,
  Procedure,
  ProcedureContext,
  ProcedureRunOptions,
  ProcedureStep,
  RollRecord,
  TableRegistry,
} from "./types";

export interface ProcedureStepInfo {
  id: string;
  title?: string;
  reads: string[];
  optional: boolean;
  hasSkip: boolean;
  hasRepeat: boolean;
  /** "table" | "compute" | "none" */
  kind: "table" | "compute" | "none";
}

function makeContext(inputs: Record<string, unknown>, results: Record<string, unknown>, rolls: RollRecord[], tables: TableRegistry): ProcedureContext {
  return {
    inputs,
    results,
    rolls,
    tables,
    get<T = unknown>(stepId: string): T | undefined {
      if (Object.prototype.hasOwnProperty.call(results, stepId)) return results[stepId] as T;
      return getPath(results, stepId) as T | undefined;
    },
    data(): Record<string, unknown> {
      return { ...inputs, ...results };
    },
  };
}

function repeatCount(step: ProcedureStep, ctx: ProcedureContext, stepRng: ReturnType<typeof createRng>): number | undefined {
  const r = step.repeat;
  if (r === undefined) return undefined;
  let n: number;
  if (typeof r === "number") n = r;
  else if (typeof r === "string") n = rollDice(r, stepRng.fork("repeat")).total;
  else n = Number(r(ctx));
  if (!Number.isFinite(n)) throw new Error(`Step "${step.id}": repeat did not yield a number`);
  return Math.max(0, Math.floor(n));
}

/** Run a procedure. Deterministic for (procedure, module version, options). */
export function runProcedure(
  procedure: Procedure,
  module: Pick<GameModule, "tables" | "manifest">,
  options: ProcedureRunOptions,
): GeneratedGraph {
  const tables = createTableRegistry(module.tables);
  const inputs: Record<string, unknown> = { ...(options.inputs ?? {}) };
  const results: Record<string, unknown> = {};
  const rolls: RollRecord[] = [];
  const skipped: GeneratedGraph["skipped"] = [];
  const ctx = makeContext(inputs, results, rolls, tables);
  const pinned = options.pinned ?? {};
  const includeOptional = new Set(options.includeOptional ?? []);

  for (const step of procedure.steps) {
    const stepSeed = options.stepSeeds?.[step.id] ?? options.seed;
    const stepRng = createRng(stepSeed).fork(`${procedure.id}/${step.id}`);

    if (step.optional && !includeOptional.has(step.id)) {
      skipped.push({ step: step.id, reason: "optional" });
      continue;
    }
    if (step.skipIf && step.skipIf(ctx)) {
      skipped.push({ step: step.id, reason: "skipIf" });
      continue;
    }
    if (Object.prototype.hasOwnProperty.call(pinned, step.id)) {
      results[step.id] = pinned[step.id];
      continue;
    }

    const repeat = repeatCount(step, ctx, stepRng);
    const iterations = repeat ?? 1;
    const values: unknown[] = [];
    for (let i = 0; i < iterations; i++) {
      const iterRng = stepRng.fork(String(i));
      let value: unknown;
      if (step.compute) {
        value = step.compute(ctx, iterRng);
      } else if (step.table !== undefined) {
        const tableId = typeof step.table === "function" ? step.table(ctx) : step.table;
        const table = tables.get(tableId);
        if (!table) throw new Error(`Procedure "${procedure.id}" step "${step.id}": unknown table "${tableId}"`);
        const extraModifier = step.modifier ? step.modifier(ctx) : 0;
        const record = rollTable(table, iterRng, tables, {
          context: ctx.data(),
          extraModifier,
          step: step.id,
          iteration: repeat === undefined ? undefined : i,
        });
        rolls.push(record);
        value = record.result;
      } else {
        throw new Error(`Procedure "${procedure.id}" step "${step.id}" has neither table nor compute`);
      }
      if (step.after) value = step.after(ctx, value, iterRng);
      values.push(value);
    }
    results[step.id] = repeat === undefined ? values[0] : values;
  }

  const produced = procedure.produce(ctx);
  const graph: GeneratedGraph = {
    procedure: procedure.id,
    moduleVersion: module.manifest.version,
    seed: options.seed,
    inputs,
    results,
    rolls,
    produced: { entities: [...produced.entities], relationships: [...produced.relationships] },
    skipped,
  };
  const supplements = module.manifest.supplements;
  if (supplements && supplements.length > 0) graph.supplements = supplements.map((s) => ({ id: s.id, version: s.version }));
  const display = stepDisplays(procedure, ctx);
  if (display) graph.display = display;
  return graph;
}

/** The `display` line of every step that declares one and has a result. */
function stepDisplays(procedure: Procedure, ctx: ProcedureContext): Record<string, string> | undefined {
  let out: Record<string, string> | undefined;
  for (const step of procedure.steps) {
    if (!step.display || !Object.prototype.hasOwnProperty.call(ctx.results, step.id)) continue;
    const line = step.display(ctx, ctx.results[step.id], ctx.rolls.filter((r) => r.step === step.id));
    if (typeof line === "string" && line.trim() !== "") (out ??= {})[step.id] = line;
  }
  return out;
}

/** Step graph summary for the workbench UI. */
export function procedureStepGraph(procedure: Procedure): ProcedureStepInfo[] {
  return procedure.steps.map((s) => {
    const info: ProcedureStepInfo = {
      id: s.id,
      reads: [...(s.reads ?? [])],
      optional: s.optional === true,
      hasSkip: typeof s.skipIf === "function",
      hasRepeat: s.repeat !== undefined,
      kind: s.compute ? "compute" : s.table !== undefined ? "table" : "none",
    };
    if (s.title !== undefined) info.title = s.title;
    return info;
  });
}

/** Steps that transitively read `stepId`, in procedure order. Re-rolling it invalidates them. */
export function dependentSteps(procedure: Procedure, stepId: string): string[] {
  const affected = new Set<string>([stepId]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const s of procedure.steps) {
      if (affected.has(s.id)) continue;
      if ((s.reads ?? []).some((r) => affected.has(r))) {
        affected.add(s.id);
        changed = true;
      }
    }
  }
  affected.delete(stepId);
  return procedure.steps.map((s) => s.id).filter((id) => affected.has(id));
}
