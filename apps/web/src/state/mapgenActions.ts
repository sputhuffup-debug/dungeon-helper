/**
 * Site map generation for the map workbench: run a module's map generator
 * from a brief and a seed, re-run one stage with a new stage seed, prefill
 * the brief from an adventure, and save the result as a core SiteMap.
 *
 * Generation runs synchronously on the main thread; everything goes through
 * `runMapGenerator()` (or `runMapGeneratorAsync()`), so a Web Worker can be
 * dropped in behind it later without touching the UI.
 *
 * Stage seeding: `ctx.rng(stream)` belongs to the stage whose id is the
 * stream, or prefixes it ("layout", "layout/attempt-2", "layout.rooms",
 * "layout:split"). It is `createRng(stageSeeds[stage] ?? seed).fork(stream)`,
 * so re-running a stage changes only that stage's random draws; later stages
 * keep their own seeds and follow from the new upstream output.
 */
import { adventureReviewContext, mapGeneratorContext as coreMapGeneratorContext, stageOfStream, type CampaignStore, type Id, type RichTextRegistry, type SiteMap } from "@campaign-forge/core";
import {
  type GameModule,
  type LoadedModule,
  type MapCheck,
  type MapGeneratorContext,
  type MapGeneratorDef,
  type MapGeneratorResult,
  type PlayModeId,
  type SiteLayout,
} from "@campaign-forge/module-sdk";

type ModuleLike = Pick<LoadedModule, "module" | "tables">;
type StoreCtx = { store: CampaignStore };

export interface MapGeneratorRequest {
  seed: string;
  inputs?: Record<string, unknown>;
  /** Per-stage seed overrides (a stage re-run alone). */
  stageSeeds?: Record<string, string>;
}

/** The stored provenance of a generated map (core `SiteMap.generator`). */
export type MapGeneratorProvenance = NonNullable<SiteMap["generator"]>;

export class UnknownMapGeneratorError extends Error {
  constructor(id: string) {
    super(`The module has no map generator “${id}”.`);
    this.name = "UnknownMapGeneratorError";
  }
}

// ---------------------------------------------------------------------------
// generators of a module
// ---------------------------------------------------------------------------

function gameModule(module: ModuleLike | GameModule): GameModule {
  return "module" in module ? module.module : module;
}

/** The module's map generators, filtered by play mode when one is given (a generator without `mode` runs in every mode). */
export function mapGeneratorsFor(module: ModuleLike | GameModule, mode?: PlayModeId): MapGeneratorDef[] {
  const all = gameModule(module).mapGenerators ?? [];
  return mode === undefined ? all : all.filter((g) => !g.mode || g.mode.length === 0 || g.mode.includes(mode));
}

export function findMapGenerator(module: ModuleLike | GameModule, id: string | undefined): MapGeneratorDef | undefined {
  if (!id) return undefined;
  return (gameModule(module).mapGenerators ?? []).find((g) => g.id === id);
}

/** Generators that can build their brief from an adventure. */
export function adventureMapGenerators(module: ModuleLike | GameModule, mode?: PlayModeId): MapGeneratorDef[] {
  return mapGeneratorsFor(module, mode).filter((g) => typeof g.inputsFromAdventure === "function");
}

// ---------------------------------------------------------------------------
// running
// ---------------------------------------------------------------------------

/** The context a generator runs with: seed, stage seeds, per-stream RNGs and the module's tables (see core `mapGeneratorContext`). */
export function mapGeneratorContext(module: ModuleLike, generator: Pick<MapGeneratorDef, "stages">, req: MapGeneratorRequest): MapGeneratorContext {
  return coreMapGeneratorContext(module.tables, generator, req);
}

export { stageOfStream };

/** Run a map generator. Deterministic: same generator, inputs, seed and stage seeds => same layout. */
export function runMapGenerator(module: ModuleLike, generatorId: string, req: MapGeneratorRequest): MapGeneratorResult {
  const generator = findMapGenerator(module, generatorId);
  if (!generator) throw new UnknownMapGeneratorError(generatorId);
  return generator.generate(structuredCopy(req.inputs ?? {}), mapGeneratorContext(module, generator, req));
}

/** The same run behind a promise: the seam where a Web Worker can take over later. */
export function runMapGeneratorAsync(module: ModuleLike, generatorId: string, req: MapGeneratorRequest): Promise<MapGeneratorResult> {
  return new Promise((resolve, reject) => {
    try {
      resolve(runMapGenerator(module, generatorId, req));
    } catch (e) {
      reject(e);
    }
  });
}

/**
 * The request after re-running one stage alone: that stage gets `stageSeed`;
 * the main seed and every other stage seed stay, so earlier stages are
 * unchanged and later stages follow from the new output.
 */
export function rerunStage(req: MapGeneratorRequest, stageId: string, stageSeed: string): MapGeneratorRequest {
  return { ...req, stageSeeds: { ...(req.stageSeeds ?? {}), [stageId]: stageSeed } };
}

/** The request with one stage back on the main seed. */
export function resetStage(req: MapGeneratorRequest, stageId: string): MapGeneratorRequest {
  const stageSeeds = { ...(req.stageSeeds ?? {}) };
  delete stageSeeds[stageId];
  return { ...req, stageSeeds };
}

/** Stages at or after `stageId` (the ones a re-run of it can change). */
export function stagesFrom(generator: Pick<MapGeneratorDef, "stages">, stageId: string): string[] {
  const i = generator.stages.findIndex((s) => s.id === stageId);
  return i < 0 ? [] : generator.stages.slice(i).map((s) => s.id);
}

// ---------------------------------------------------------------------------
// the brief
// ---------------------------------------------------------------------------

type SchemaLike = { properties?: Record<string, { default?: unknown }> };

/** Top-level defaults declared by the generator's inputs schema. */
export function mapInputDefaults(generator: Pick<MapGeneratorDef, "inputs">): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, s] of Object.entries((generator.inputs as SchemaLike).properties ?? {})) {
    if (s && s.default !== undefined) out[key] = structuredCopy(s.default);
  }
  return out;
}

export interface AdventurePrefill {
  /** Schema defaults overlaid with what the adventure supplies. */
  inputs: Record<string, unknown>;
  /** Input keys whose value came from the adventure. */
  fromAdventure: string[];
}

/** Brief from an adventure review context: schema defaults, then the generator's `inputsFromAdventure`. */
export function prefillFromReviewContext(generator: MapGeneratorDef, reviewContext: Record<string, unknown>): AdventurePrefill {
  const inputs = mapInputDefaults(generator);
  const fromAdventure: string[] = [];
  if (!generator.inputsFromAdventure) return { inputs, fromAdventure };
  const supplied = generator.inputsFromAdventure(reviewContext) ?? {};
  for (const [k, v] of Object.entries(supplied)) {
    if (v === undefined) continue;
    inputs[k] = structuredCopy(v);
    fromAdventure.push(k);
  }
  return { inputs, fromAdventure };
}

/** Build the adventure's review context (core) and the generator's brief from it. */
export async function adventurePrefill(
  ctx: StoreCtx & { module: LoadedModule; registry: RichTextRegistry; whenDocSynced?: (id: Id) => Promise<void> },
  generator: MapGeneratorDef,
  adventureId: Id,
): Promise<AdventurePrefill> {
  const adventure = ctx.store.get("adventures", adventureId);
  if (!adventure) throw new Error(`adventures/${adventureId} not found`);
  const builder = adventure.builderId ? ctx.module.builder(adventure.builderId) : undefined;
  const opts: Parameters<typeof adventureReviewContext>[4] = {};
  if (builder) opts.roles = builder.cast.map((r) => r.id);
  if (ctx.whenDocSynced) opts.whenDocSynced = ctx.whenDocSynced;
  const review = await adventureReviewContext(ctx.store, ctx.registry, ctx.module, adventureId, opts);
  return prefillFromReviewContext(generator, review);
}

// ---------------------------------------------------------------------------
// checks
// ---------------------------------------------------------------------------

export interface CheckSummary {
  total: number;
  blockFailed: number;
  warnFailed: number;
  passed: number;
}

export function checkSummary(layout: Pick<SiteLayout, "checks"> | undefined): CheckSummary {
  const checks = layout?.checks ?? [];
  return {
    total: checks.length,
    blockFailed: checks.filter((c) => c.level === "block" && !c.ok).length,
    warnFailed: checks.filter((c) => c.level === "warn" && !c.ok).length,
    passed: checks.filter((c) => c.ok).length,
  };
}

/** "All checks pass", "1 block check fails · 2 warnings", ... */
export function checkSummaryLine(summary: CheckSummary): string {
  if (summary.total === 0) return "No checks";
  const parts: string[] = [];
  if (summary.blockFailed) parts.push(`${summary.blockFailed} block check${summary.blockFailed === 1 ? "" : "s"} fail${summary.blockFailed === 1 ? "s" : ""}`);
  if (summary.warnFailed) parts.push(`${summary.warnFailed} warning${summary.warnFailed === 1 ? "" : "s"}`);
  return parts.length ? parts.join(" · ") : `All ${summary.total} checks pass`;
}

/** Whether a check is the one `failedCheck` names (by id, or by message for generators that report the message). */
export function isFailedCheck(check: Pick<MapCheck, "id" | "message">, failedCheck: string | undefined): boolean {
  return !!failedCheck && (check.id === failedCheck || check.message === failedCheck);
}

export interface LayoutDiff {
  zones: number;
  borders: number;
  markers: number;
}

/** How many zones, borders and markers differ between two layouts (added, removed or changed). */
export function layoutDiff(before: Pick<SiteLayout, "zones" | "borders" | "markers"> | undefined, after: Pick<SiteLayout, "zones" | "borders" | "markers"> | undefined): LayoutDiff {
  const count = <T extends { id: string }>(a: T[] = [], b: T[] = []): number => {
    const left = new Map(a.map((x) => [x.id, JSON.stringify(x)]));
    const right = new Map(b.map((x) => [x.id, JSON.stringify(x)]));
    let n = 0;
    for (const [id, v] of left) if (right.get(id) !== v) n++;
    for (const id of right.keys()) if (!left.has(id)) n++;
    return n;
  };
  return { zones: count(before?.zones, after?.zones), borders: count(before?.borders, after?.borders), markers: count(before?.markers, after?.markers) };
}

// ---------------------------------------------------------------------------
// saving and re-opening
// ---------------------------------------------------------------------------

export interface SaveGeneratedMapInput {
  name: string;
  adventureId?: Id;
  locationId?: Id;
  generator: Omit<MapGeneratorProvenance, "attempts"> & { attempts?: number };
  /** Update this map instead of creating a new one. */
  mapId?: Id;
}

/**
 * Save a generated layout as a core SiteMap with its layout, how it was
 * generated (generator id, seed, inputs, stage seeds, attempts) and its
 * adventure. Updating an existing map replaces its layout and clears its
 * live table state, which pointed at the old zones.
 */
export function saveGeneratedMap(ctx: StoreCtx, result: MapGeneratorResult, input: SaveGeneratedMapInput): SiteMap {
  const generator: MapGeneratorProvenance = {
    id: input.generator.id,
    seed: input.generator.seed,
    inputs: structuredCopy(input.generator.inputs ?? {}),
    attempts: result.attempts,
  };
  const stageSeeds = input.generator.stageSeeds ?? {};
  if (Object.keys(stageSeeds).length > 0) generator.stageSeeds = { ...stageSeeds };
  const layout = structuredCopy(result.layout);
  const name = input.name.trim() || "Site map";
  return ctx.store.transact(() => {
    const existing = input.mapId ? ctx.store.get("maps", input.mapId) : undefined;
    const patch: Partial<SiteMap> = { name, layout, generator, live: undefined };
    if (input.adventureId !== undefined) patch.adventure = input.adventureId;
    if (input.locationId !== undefined) patch.location = input.locationId;
    if (existing) return ctx.store.update("maps", existing.id, patch);
    const created = ctx.store.createMap(input.locationId ? { name, location: input.locationId } : { name });
    const createPatch: Partial<SiteMap> = { layout, generator };
    if (input.adventureId !== undefined) createPatch.adventure = input.adventureId;
    return ctx.store.update("maps", created.id, createPatch);
  });
}

/** The request that reproduces a saved generated map. */
export function requestFromMap(map: Pick<SiteMap, "generator">): (MapGeneratorRequest & { generatorId: string }) | undefined {
  const g = map.generator;
  if (!g) return undefined;
  return { generatorId: g.id, seed: g.seed, inputs: structuredCopy(g.inputs ?? {}), stageSeeds: { ...(g.stageSeeds ?? {}) } };
}

/** Generated maps of an adventure, newest first. */
export function generatedMapsOf(store: CampaignStore, adventureId: Id): SiteMap[] {
  return store
    .list("maps")
    .filter((m) => m.adventure === adventureId && !!m.layout)
    .sort((a, b) => (a.updated < b.updated ? 1 : a.updated > b.updated ? -1 : 0));
}

function structuredCopy<T>(v: T): T {
  return v === undefined ? v : (JSON.parse(JSON.stringify(v)) as T);
}
