/**
 * Built-in map generator engines for data packs. A pack's `mapGenerators`
 * entry names an engine and gives it data; `createPackMapGenerator` makes a
 * contract `MapGeneratorDef` from it, bound to the module's content (so a
 * supplement's presets and lists count once it is applied).
 *
 * The engines' code is loaded lazily: the definition (brief, legend,
 * passability, stages) is available at once, but generating needs
 * `loadMapEngines()` to have resolved. `moduleFromPackSource` awaits it for
 * packs that declare generators; other callers await it themselves.
 */
import type { GameModule, MapGeneratorDef } from "../types";
import { DUNGEON_STAGES, dungeonInputSchema, dungeonInputsFromAdventure, dungeonLegend, dungeonPassable } from "./dungeon/inputs";
import type { PackMapGenerator } from "./types";

type DungeonEngine = typeof import("./dungeon/engine");
let dungeon: DungeonEngine | undefined;
let loading: Promise<void> | undefined;

/** Load the built-in map engines (a lazy chunk in the app). Safe to call more than once. */
export function loadMapEngines(): Promise<void> {
  loading ??= import("./dungeon/engine").then((m) => {
    dungeon = m;
  });
  return loading;
}

/** True once `loadMapEngines()` has resolved. */
export function mapEnginesLoaded(): boolean {
  return dungeon !== undefined;
}

export class MapEngineNotLoadedError extends Error {
  constructor(engine: string) {
    super(`The "${engine}" map engine is not loaded yet: await loadMapEngines() before generating.`);
    this.name = "MapEngineNotLoadedError";
  }
}

function engine(): DungeonEngine {
  if (!dungeon) throw new MapEngineNotLoadedError("dungeon");
  return dungeon;
}

/** True when a pack (or any JSON) declares map generators, so its loader should load the engines. */
export function declaresMapGenerators(pack: unknown): boolean {
  const list = pack && typeof pack === "object" ? (pack as { mapGenerators?: unknown }).mapGenerators : undefined;
  return Array.isArray(list) && list.length > 0;
}

/** A contract map generator from a pack's declaration, reading `module`'s presets and reference lists. */
export function createPackMapGenerator(gen: PackMapGenerator, module: Pick<GameModule, "presets" | "referenceLists">): MapGeneratorDef {
  const config = gen.config;
  // one candidate cache per generator: the module's content does not change under it
  let content: InstanceType<DungeonEngine["Content"]> | undefined;
  const contentOf = () => (content ??= new (engine().Content)(module));
  const def: MapGeneratorDef = {
    id: gen.id,
    name: gen.name,
    inputs: dungeonInputSchema(config),
    stages: DUNGEON_STAGES.map((s) => ({ id: s.id, title: s.title })),
    generate: (inputs, ctx) => engine().generateDungeon(gen, module, inputs, ctx, contentOf()),
    inputsFromAdventure: (ctx) => dungeonInputsFromAdventure(gen, ctx),
    passable: dungeonPassable,
    legend: dungeonLegend(config),
    produce: (layout, inputs) => engine().produceDungeon(gen, module, layout, inputs, contentOf()),
    source: { engine: gen.engine, generator: gen },
  };
  if (gen.description !== undefined) def.description = gen.description;
  if (gen.page !== undefined) def.page = gen.page;
  if (gen.mode !== undefined) def.mode = [...gen.mode];
  if (config.zoneTables?.length) def.zoneTables = config.zoneTables;
  return def;
}

/** The pack declaration a generator was made from, when a built-in engine made it. */
export function packMapGeneratorOf(def: MapGeneratorDef): PackMapGenerator | undefined {
  const src = def.source;
  return src && src.engine === "dungeon" && src.generator && typeof src.generator === "object" ? (src.generator as PackMapGenerator) : undefined;
}

/** Rebuild a module's engine-made generators against (new) module content, e.g. after supplements are applied. */
export function rebindMapGenerators(generators: MapGeneratorDef[] | undefined, module: Pick<GameModule, "presets" | "referenceLists">): MapGeneratorDef[] | undefined {
  if (!generators) return undefined;
  return generators.map((g) => {
    const src = packMapGeneratorOf(g);
    return src ? createPackMapGenerator(src, module) : g;
  });
}
