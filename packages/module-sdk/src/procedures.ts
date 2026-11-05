/**
 * Procedure runner: seeded, multi-step generators over module tables.
 * Each step gets its own RNG derived from (stepSeed ?? seed, procedure id,
 * step id), so re-seeding one step never changes another.
 */
import { rollDice } from "./dice";
import { assertAllUsed, createEnteredRng, EnteredDiceError } from "./entered";
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
  RollTable,
  Rng,
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

/** How `ctx.part` draws: the running step and the run's part seeds, pins and record. */
interface PartScope {
  /** The step running now (parts are keyed "<step>/<key>"), or undefined outside a step. */
  step?: string;
  /** Seed of the running step (its own override or the run's). */
  seed: string;
  procedure: string;
  partSeeds: Record<string, string>;
  pinnedParts: Record<string, unknown>;
  parts: Record<string, unknown>;
}

/**
 * A procedure context over plain inputs and results (as `runProcedure` builds
 * it, or rebuilt from a stored run for `chain.inputs`). Without a part scope,
 * `part` returns its initial value or rolls on a fixed stream.
 */
export function procedureContext(inputs: Record<string, unknown>, results: Record<string, unknown>, rolls: RollRecord[], tables: TableRegistry, scope?: PartScope): ProcedureContext {
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
    part<T>(key: string, roll: (rng: Rng) => T, opts?: { initial?: T }): T {
      if (!scope) return opts && opts.initial !== undefined ? opts.initial : roll(createRng("part").fork(key));
      const full = scope.step === undefined ? key : `${scope.step}/${key}`;
      let value: T;
      if (Object.prototype.hasOwnProperty.call(scope.pinnedParts, full)) value = scope.pinnedParts[full] as T;
      else if (scope.partSeeds[full] !== undefined) value = roll(createRng(scope.partSeeds[full]!).fork(`${scope.procedure}/${full}`));
      else if (opts && opts.initial !== undefined) value = opts.initial;
      else value = roll(createRng(scope.seed).fork(`${scope.procedure}/${full}`));
      scope.parts[full] = value;
      return value;
    },
  };
}

/**
 * A `distinct` step's roll that repeats a result the step already has: the
 * next row of the table (in order, wrapping) that it has not, read as the
 * roll would have read it. No die is rolled for it, so a run with dice typed
 * at the table asks for the same dice. A row that rolls on other tables is
 * never taken this way; with no row left the repeat stands.
 */
function nextUnusedRow(table: RollTable, record: RollRecord, seen: ReadonlySet<string>): RollRecord {
  if (!seen.has(JSON.stringify(record.result))) return record;
  const rows = table.rows;
  const at = Math.max(0, rows.findIndex((r) => record.total >= r.range[0] && record.total <= r.range[1]));
  for (let k = 1; k < rows.length; k++) {
    const row = rows[(at + k) % rows.length]!;
    if (row.roll && row.roll.length > 0) continue;
    const result = row.result !== null && typeof row.result === "object" ? { ...row.result } : row.result;
    if (seen.has(JSON.stringify(result))) continue;
    const out: RollRecord = { ...record, result, rowLabel: `${row.label ?? "next row"} (next row: a repeat of ${record.rowLabel ?? "an earlier result"})` };
    const page = row.page ?? table.page;
    if (page !== undefined) out.page = page;
    return out;
  }
  return record;
}

function repeatCount(step: ProcedureStep, ctx: ProcedureContext, stepRng: Rng): number | undefined {
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
  const scope: PartScope = { seed: options.seed, procedure: procedure.id, partSeeds: options.partSeeds ?? {}, pinnedParts: options.pinnedParts ?? {}, parts: {} };
  const ctx = procedureContext(inputs, results, rolls, tables, scope);
  const pinned = options.pinned ?? {};
  const includeOptional = new Set(options.includeOptional ?? []);

  const entered: Record<string, number[]> = {};

  for (const step of procedure.steps) {
    const stepSeed = options.stepSeeds?.[step.id] ?? options.seed;
    const seeded = createRng(stepSeed).fork(`${procedure.id}/${step.id}`);
    // Dice rolled at the table for this step: its rolls take the typed faces in order.
    const custom = options.stepRng?.(step.id);
    const faces = custom ? undefined : options.stepDice?.[step.id];
    const enteredRng = faces ? createEnteredRng(faces, { fallback: seeded }) : undefined;
    const stepRng: Rng = custom ?? enteredRng ?? seeded;
    scope.step = step.id;
    scope.seed = stepSeed;

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

    const values: unknown[] = [];
    /** Table results this step rolled so far (a `distinct` step moves off these). */
    const rolledHere = new Set<string>();
    let repeat: number | undefined;
    try {
      repeat = repeatCount(step, ctx, stepRng);
      const iterations = repeat ?? 1;
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
          let record = rollTable(table, iterRng, tables, {
            context: ctx.data(),
            extraModifier,
            step: step.id,
            iteration: repeat === undefined ? undefined : i,
          });
          // a distinct step never repeats a result: a repeat takes the next row it has not had
          if (step.distinct && repeat !== undefined) record = nextUnusedRow(table, record, rolledHere);
          rolledHere.add(JSON.stringify(record.result));
          rolls.push(record);
          value = record.result;
        } else {
          throw new Error(`Procedure "${procedure.id}" step "${step.id}" has neither table nor compute`);
        }
        if (step.after) value = step.after(ctx, value, iterRng);
        values.push(value);
      }
      if (enteredRng && faces) {
        assertAllUsed(enteredRng);
        entered[step.id] = [...faces];
      }
    } catch (e) {
      if (e instanceof EnteredDiceError && enteredRng) throw new EnteredDiceError(e.code, `Step “${step.title ?? step.id}”: ${e.message}`, e.index, e.request);
      throw e;
    }
    results[step.id] = repeat === undefined ? values[0] : values;
  }
  delete scope.step;
  scope.seed = options.seed;

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
  if (Object.keys(entered).length > 0) graph.entered = entered;
  if (Object.keys(scope.parts).length > 0) graph.parts = scope.parts;
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
