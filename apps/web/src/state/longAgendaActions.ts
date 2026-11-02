/**
 * Long-term agendas (a procedure's `longAgendas`, results
 * `longAgendaDrafts`): accepting drafts into the characters and their
 * handouts, dealing the next beats after a job, and the GM's hand on the
 * tension. Game-agnostic: the module's procedure decides what a goal, a beat
 * or a friction line is; core (`longAgendas.ts`) stores the record and
 * renders the handouts; this file runs the procedure and writes the docs.
 */
import {
  applyLongAgendaWrites,
  getPath,
  longAgendaProgress,
  longAgendaRecordOf,
  longAgendaWrites,
  setLongAgendaTension,
  type Entity,
  type GeneratorRun,
  type Id,
  type LongAgendaEdit,
  type LongAgendaWrite,
} from "@campaign-forge/core";
import type { GeneratedGraph, LoadedModule, LongAgendaDef, LongAgendaDraftSet, PlayModeId, Procedure } from "@campaign-forge/module-sdk";
import { initialInputs, playerCharacters } from "../features/generate/prefill";
import { runGenerator } from "../features/generate/runner";
import type { CampaignContextValue } from "./CampaignProvider";
import { acceptGenerated, writeMarkdownDoc } from "./prepActions";

export type LongAgendaCtx = Pick<CampaignContextValue, "store" | "registry" | "module"> & Partial<Pick<CampaignContextValue, "whenDocSynced">>;

/** The procedure that keeps long-term agendas in this play mode, if the module has one. */
export function longAgendaProcedureOf(module: Pick<LoadedModule, "forMode">, mode: PlayModeId): (Procedure & { longAgendas: LongAgendaDef }) | undefined {
  return module.forMode(mode).procedures.find((p): p is Procedure & { longAgendas: LongAgendaDef } => !!p.longAgendas);
}

/** The run's long-agenda drafts, when its results carry a well-formed set. */
export function longAgendaDraftsOf(graph: GeneratedGraph | undefined): LongAgendaDraftSet | undefined {
  const v = graph?.results.longAgendaDrafts as LongAgendaDraftSet | undefined;
  return v && typeof v === "object" && Array.isArray(v.characters) && Array.isArray(v.friction) ? v : undefined;
}

/** Player characters that hold a long-agenda record. */
export function charactersWithLongAgendas(ctx: Pick<LongAgendaCtx, "store" | "module">, def: LongAgendaDef): Entity[] {
  return playerCharacters(ctx.store, ctx.module).filter((e) => !!longAgendaRecordOf(def, e));
}

export interface AcceptLongAgendasInput {
  def: LongAgendaDef;
  set: LongAgendaDraftSet;
  edits?: Record<Id, LongAgendaEdit>;
  /** Characters left as they are (the GM kept their own agenda). */
  skip?: Id[];
  /** The run, recorded for provenance (seed, re-rolls, pins). */
  graph?: GeneratedGraph;
  stepSeeds?: Record<string, string>;
  pinned?: Record<string, unknown>;
  partSeeds?: Record<string, string>;
  pinnedParts?: Record<string, unknown>;
}

export interface AcceptLongAgendasResult {
  written: Id[];
  run?: GeneratorRun;
}

/** Write the drafts: each character's record and summary, its GM-only agenda handout and its players' friction handout. */
export async function acceptLongAgendaDrafts(ctx: LongAgendaCtx, input: AcceptLongAgendasInput): Promise<AcceptLongAgendasResult> {
  const writes: LongAgendaWrite[] = longAgendaWrites(input.def, input.set, input.edits ?? {});
  const res = applyLongAgendaWrites(ctx.store, input.def, writes, input.skip ? { skip: input.skip } : {});
  for (const d of res.docs) await writeMarkdownDoc(ctx, d.docId, d.markdown);
  const out: AcceptLongAgendasResult = { written: res.written };
  if (input.graph) {
    const run = acceptGenerated(ctx, {
      graph: input.graph,
      ...(input.stepSeeds ? { stepSeeds: input.stepSeeds } : {}),
      ...(input.pinned ? { pinned: input.pinned } : {}),
      ...(input.partSeeds ? { partSeeds: input.partSeeds } : {}),
      ...(input.pinnedParts ? { pinnedParts: input.pinnedParts } : {}),
    });
    out.run = run.run;
  }
  return out;
}

export interface NextBeatsRequest {
  /** Character id -> the outcome the GM marked (an id of the def's outcomes). */
  outcomes: Record<Id, string | undefined>;
  jobLabel?: string;
  seed: string;
  partSeeds?: Record<string, string>;
  pinnedParts?: Record<string, unknown>;
}

/** The procedure's inputs for the next beats: what the campaign knows, plus each character's record and outcome. */
export function nextBeatsInputs(ctx: Pick<LongAgendaCtx, "store" | "module">, procedure: Procedure & { longAgendas: LongAgendaDef }, req: Pick<NextBeatsRequest, "outcomes" | "jobLabel">): Record<string, unknown> {
  const def = procedure.longAgendas;
  const inputs = initialInputs(procedure, ctx.store, ctx.module);
  inputs[def.progressInput] = longAgendaProgress(def, charactersWithLongAgendas(ctx, def), req.outcomes);
  if (def.jobInput && req.jobLabel?.trim()) inputs[def.jobInput] = req.jobLabel.trim();
  return inputs;
}

/** Run the procedure for the next beats (not stored until the GM applies them). */
export function runNextBeats(ctx: Pick<LongAgendaCtx, "store" | "module">, procedure: Procedure & { longAgendas: LongAgendaDef }, req: NextBeatsRequest): GeneratedGraph {
  return runGenerator(ctx.module, {
    procedureId: procedure.id,
    seed: req.seed,
    inputs: nextBeatsInputs(ctx, procedure, req),
    ...(req.partSeeds ? { partSeeds: req.partSeeds } : {}),
    ...(req.pinnedParts ? { pinnedParts: req.pinnedParts } : {}),
  });
}

/** The GM sets a character's tension by hand; the agenda handout follows. */
export async function setTension(ctx: LongAgendaCtx, def: LongAgendaDef, characterId: Id, level: number): Promise<void> {
  const doc = setLongAgendaTension(ctx.store, def, characterId, level);
  if (doc) await writeMarkdownDoc(ctx, doc.docId, doc.markdown);
}

/** A label for the next job: "Job <n>" after the highest one the records name. */
export function nextJobLabel(def: LongAgendaDef, characters: Array<Pick<Entity, "fields">>): string {
  let top = 0;
  for (const c of characters) {
    const r = longAgendaRecordOf(def, c);
    const job = r && def.paths.beatJob ? getPath(r, def.paths.beatJob) : undefined;
    const m = typeof job === "string" ? /(\d+)\s*$/.exec(job) : null;
    if (m) top = Math.max(top, Number(m[1]));
  }
  return `Job ${top + 1}`;
}
