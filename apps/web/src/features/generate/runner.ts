/**
 * Generator runner for the workbench. v1 runs procedures synchronously on
 * the main thread (they are fast); everything goes through `runGenerator()`
 * so a Web Worker can be dropped in behind it later without touching the UI.
 */
import type { GeneratorRun } from "@campaign-forge/core";
import {
  dependentSteps,
  procedureContext,
  procedureStepGraph,
  runProcedure,
  type GeneratedGraph,
  type LoadedModule,
  type PageRef,
  type Procedure,
  type ProcedureContext,
  type RollRecord,
  type Rng,
} from "@campaign-forge/module-sdk";

export interface GeneratorRequest {
  procedureId: string;
  seed: string;
  inputs?: Record<string, unknown>;
  stepSeeds?: Record<string, string>;
  /** Step id -> faces of dice rolled at the table for it. */
  stepDice?: Record<string, number[]>;
  pinned?: Record<string, unknown>;
  includeOptional?: string[];
  /** Re-rolled parts of steps ("<step>/<key>" -> seed) and pinned part values. */
  partSeeds?: Record<string, string>;
  pinnedParts?: Record<string, unknown>;
}

/** The part options of a request, when it has any. */
function partOptions(req: GeneratorRequest): { partSeeds?: Record<string, string>; pinnedParts?: Record<string, unknown> } {
  const out: { partSeeds?: Record<string, string>; pinnedParts?: Record<string, unknown> } = {};
  if (req.partSeeds && Object.keys(req.partSeeds).length > 0) out.partSeeds = req.partSeeds;
  if (req.pinnedParts && Object.keys(req.pinnedParts).length > 0) out.pinnedParts = req.pinnedParts;
  return out;
}

export class UnknownProcedureError extends Error {
  constructor(id: string) {
    super(`The module has no procedure “${id}”.`);
    this.name = "UnknownProcedureError";
  }
}

/** Run one procedure. Deterministic: same request + module version => same graph. */
export function runGenerator(module: Pick<LoadedModule, "procedure" | "module">, req: GeneratorRequest): GeneratedGraph {
  const procedure = module.procedure(req.procedureId);
  if (!procedure) throw new UnknownProcedureError(req.procedureId);
  return runProcedure(procedure, module.module, {
    seed: req.seed,
    inputs: req.inputs ?? {},
    stepSeeds: req.stepSeeds ?? {},
    ...(req.stepDice && Object.keys(req.stepDice).length > 0 ? { stepDice: req.stepDice } : {}),
    pinned: req.pinned ?? {},
    includeOptional: req.includeOptional ?? [],
    ...partOptions(req),
  });
}

/**
 * One step of a run as a pure function of its Rng: the whole procedure runs
 * with that step's dice taken from `rng`, so the enter-dice form can ask for
 * exactly the dice the step rolls, given what the steps before it produced.
 */
export function stepRun(module: Pick<LoadedModule, "procedure" | "module">, req: GeneratorRequest, stepId: string): (rng: Rng) => unknown {
  const procedure = module.procedure(req.procedureId);
  if (!procedure) throw new UnknownProcedureError(req.procedureId);
  const { [stepId]: _own, ...stepDice } = req.stepDice ?? {};
  const pinned = { ...(req.pinned ?? {}) };
  delete pinned[stepId];
  return (rng) =>
    runProcedure(procedure, module.module, {
      seed: req.seed,
      inputs: req.inputs ?? {},
      stepSeeds: req.stepSeeds ?? {},
      stepDice,
      pinned,
      includeOptional: req.includeOptional ?? [],
      ...partOptions(req),
      stepRng: (id) => (id === stepId ? rng : undefined),
    });
}

/** Faces entered for steps that read `stepId` are dropped when it changes: their dice may no longer fit. */
export function withoutDependentDice(procedure: Procedure, stepDice: Record<string, number[]>, stepId: string, alsoSelf = false): Record<string, number[]> {
  const drop = new Set(dependentSteps(procedure, stepId));
  if (alsoSelf) drop.add(stepId);
  return Object.fromEntries(Object.entries(stepDice).filter(([id]) => !drop.has(id)));
}

/** A short random seed (base36), e.g. "k3f9x2qa". */
export function newSeed(): string {
  const g = globalThis as { crypto?: { getRandomValues?: (a: Uint32Array) => Uint32Array } };
  const words = new Uint32Array(2);
  if (g.crypto?.getRandomValues) g.crypto.getRandomValues(words);
  else {
    words[0] = Math.floor(Math.random() * 2 ** 32);
    words[1] = Math.floor(Math.random() * 2 ** 32);
  }
  return ((words[0] ?? 0).toString(36) + (words[1] ?? 0).toString(36)).slice(0, 10);
}

// ---------------------------------------------------------------------------
// step views
// ---------------------------------------------------------------------------

export type StepState = "rolled" | "pinned" | "skipped" | "optional-off";

export interface StepView {
  id: string;
  title: string;
  page?: PageRef;
  /** Table id when fixed on the step or seen on its rolls. */
  table?: string;
  kind: "table" | "compute" | "none";
  optional: boolean;
  repeat: boolean;
  state: StepState;
  skipReason?: string;
  rolls: RollRecord[];
  result: unknown;
  hasResult: boolean;
  /** The step's own line for the GM (its `display`), shown instead of the result object. */
  display?: string;
  /** Steps that read this one, transitively (re-rolling it changes them). */
  dependents: string[];
  reads: string[];
  customSeed: boolean;
  /** Faces typed for the step when its dice were rolled at the table. */
  entered?: number[];
}

/** One view per procedure step, in order, joined with the graph's rolls, results and skips. */
export function stepViews(procedure: Procedure, graph: GeneratedGraph | undefined, opts: { stepSeeds?: Record<string, string>; pinned?: Record<string, unknown> } = {}): StepView[] {
  const entered = graph?.entered ?? {};
  const info = procedureStepGraph(procedure);
  return info.map((s, i) => {
    const step = procedure.steps[i];
    const rolls = graph ? graph.rolls.filter((r) => r.step === s.id) : [];
    const skipped = graph?.skipped.find((k) => k.step === s.id);
    const pinned = opts.pinned !== undefined && Object.prototype.hasOwnProperty.call(opts.pinned, s.id);
    let state: StepState = "rolled";
    if (skipped) state = skipped.reason === "optional" ? "optional-off" : "skipped";
    else if (pinned) state = "pinned";
    const table = typeof step?.table === "string" ? step.table : rolls.find((r) => r.table)?.table;
    const page = step?.page ?? procedure.steps[i]?.page ?? rolls.find((r) => r.page !== undefined)?.page;
    const hasResult = !!graph && Object.prototype.hasOwnProperty.call(graph.results, s.id);
    const view: StepView = {
      id: s.id,
      title: s.title ?? s.id,
      kind: s.kind,
      optional: s.optional,
      repeat: s.hasRepeat,
      state,
      rolls,
      result: hasResult ? graph?.results[s.id] : undefined,
      hasResult,
      dependents: dependentSteps(procedure, s.id),
      reads: s.reads,
      customSeed: !!opts.stepSeeds?.[s.id],
    };
    if (table !== undefined) view.table = table;
    if (page !== undefined) view.page = page;
    if (entered[s.id] && !pinned) view.entered = entered[s.id];
    if (skipped) view.skipReason = skipReasonText(skipped.reason);
    const display = hasResult ? graph?.display?.[s.id] : undefined;
    if (display !== undefined) view.display = display;
    return view;
  });
}

export function skipReasonText(reason: string): string {
  if (reason === "optional") return "Optional step, not included";
  if (reason === "skipIf") return "Skipped: its condition says it does not apply";
  return reason;
}

/** Ids of steps whose result differs between two graphs. */
export function changedSteps(before: GeneratedGraph | undefined, after: GeneratedGraph | undefined): Set<string> {
  const out = new Set<string>();
  if (!before || !after) return out;
  const keys = new Set([...Object.keys(before.results), ...Object.keys(after.results)]);
  for (const k of keys) {
    if (JSON.stringify(before.results[k]) !== JSON.stringify(after.results[k])) out.add(k);
  }
  return out;
}

// ---------------------------------------------------------------------------
// value formatting
// ---------------------------------------------------------------------------

const HIDDEN_KEYS = new Set(["cumulative"]);

/** Compact one-line rendering of a step result: strings as is, objects as "k: v, ...". */
export function summarizeValue(value: unknown, max = 220): string {
  const text = summarize(value, 0);
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function summarize(value: unknown, depth: number): string {
  if (value === undefined || value === null) return "—";
  if (typeof value === "string") return value;
  if (typeof value === "number") return Number.isInteger(value) ? String(value) : value.toFixed(2);
  if (typeof value === "boolean") return value ? "yes" : "no";
  if (Array.isArray(value)) {
    if (value.length === 0) return "none";
    return value.map((v) => summarize(v, depth + 1)).join(depth === 0 ? "; " : ", ");
  }
  if (typeof value === "object") {
    const obj = value as Record<string, unknown>;
    if (depth > 2) return "{…}";
    const label = obj.label ?? obj.name;
    const rest = Object.entries(obj).filter(([k, v]) => !HIDDEN_KEYS.has(k) && k !== "label" && k !== "name" && v !== undefined && v !== "" && v !== label);
    const inner = rest.map(([k, v]) => `${k}: ${summarize(v, depth + 1)}`).join(", ");
    if (typeof label === "string" && label) return inner ? `${label} (${inner})` : label;
    return depth === 0 ? inner : `{${inner}}`;
  }
  return String(value);
}

// ---------------------------------------------------------------------------
// runs and chains
// ---------------------------------------------------------------------------

/** Optional steps a stored run included (they left a result). */
export function includedOptional(procedure: Procedure, results: Record<string, unknown>): string[] {
  return procedure.steps.filter((s) => s.optional && Object.prototype.hasOwnProperty.call(results, s.id)).map((s) => s.id);
}

/** The request that reproduces a stored run. */
export function requestFromRun(procedure: Procedure, run: GeneratorRun): GeneratorRequest {
  return {
    procedureId: run.procedure,
    seed: run.seed,
    inputs: { ...run.inputs },
    stepSeeds: { ...(run.stepSeeds ?? {}) },
    ...(run.stepDice ? { stepDice: { ...run.stepDice } } : {}),
    pinned: { ...(run.pinned ?? {}) },
    includeOptional: includedOptional(procedure, run.results),
    ...(run.partSeeds ? { partSeeds: { ...run.partSeeds } } : {}),
    ...(run.pinnedParts ? { pinnedParts: { ...run.pinnedParts } } : {}),
  };
}

/** A procedure context rebuilt from a stored run, for `chain.inputs(ctx)`. */
export function contextFromRun(module: Pick<LoadedModule, "tables">, run: Pick<GeneratorRun, "inputs" | "results" | "rolls">): ProcedureContext {
  return procedureContext({ ...run.inputs }, { ...run.results }, [...run.rolls], module.tables);
}

export interface ChainOption {
  index: number;
  procedure: string;
  label: string;
  inputs: Record<string, unknown>;
}

/**
 * The chains a run offers, with their inputs. A chain whose inputs throw
 * or come back with an undefined value (for example "body 5" of a system
 * with three bodies) does not apply and is left out.
 */
export function chainOptions(module: Pick<LoadedModule, "tables" | "procedure">, procedure: Procedure, run: Pick<GeneratorRun, "inputs" | "results" | "rolls">): ChainOption[] {
  const out: ChainOption[] = [];
  const ctx = contextFromRun(module, run);
  (procedure.chains ?? []).forEach((chain, index) => {
    if (!module.procedure(chain.procedure)) return;
    let inputs: Record<string, unknown> = {};
    try {
      inputs = chain.inputs ? chain.inputs(ctx) : {};
    } catch {
      return;
    }
    if (Object.values(inputs).some((v) => v === undefined)) return;
    out.push({ index, procedure: chain.procedure, label: chain.label, inputs });
  });
  return out;
}
