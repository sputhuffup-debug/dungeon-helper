/**
 * Conformance for map generators: the static checks every module gets (ids,
 * modes, references from an engine config to the module's tables, presets
 * and lists) and an optional dry run (each site type generated from a few
 * seeds, twice: deterministic and passing its block checks).
 */
import type { GameModule, MapGeneratorDef, PlayModeId } from "../types";
import { createRng } from "../rng";
import { createTableRegistry } from "../tables";
import type { DungeonConfig, DungeonPick } from "./types";
import { mapEnginesLoaded, packMapGeneratorOf } from "./registry";

export interface MapGeneratorIssue {
  severity: "error" | "warning";
  where: string;
  message: string;
}

export interface MapGeneratorCheckOptions {
  /** Seeds per site type for the dry run (0, the default, skips it; it needs `loadMapEngines()`). */
  runs?: number;
}

/** A run context like the core's: per-stage seeds, streams forked by name. */
function runContext(module: Pick<GameModule, "tables">, seed: string) {
  return { seed, rng: (stream: string) => createRng(seed).fork(stream), tables: createTableRegistry(module.tables) };
}

export function mapGeneratorIssues(module: GameModule, options: MapGeneratorCheckOptions = {}): MapGeneratorIssue[] {
  const out: MapGeneratorIssue[] = [];
  const gens = module.mapGenerators ?? [];
  const modes = new Set<PlayModeId>((module.manifest?.modes ?? []).map((m) => m.id));
  const seen = new Set<string>();
  for (const g of gens) {
    const where = `mapGenerator:${g.id}`;
    if (seen.has(g.id)) out.push({ severity: "error", where, message: `duplicate map generator id "${g.id}"` });
    seen.add(g.id);
    for (const m of g.mode ?? []) if (!modes.has(m)) out.push({ severity: "error", where, message: `mode "${m}" is not declared by the module` });
    const src = packMapGeneratorOf(g);
    if (src) out.push(...configIssues(module, src.config, where));
  }
  if ((options.runs ?? 0) > 0 && mapEnginesLoaded() && !out.some((i) => i.severity === "error")) {
    for (const g of gens) if (packMapGeneratorOf(g)) out.push(...runIssues(module, g, options.runs!));
  }
  return out;
}

function configIssues(module: GameModule, config: DungeonConfig, where: string): MapGeneratorIssue[] {
  const out: MapGeneratorIssue[] = [];
  const err = (at: string, message: string) => out.push({ severity: "error", where: `${where}#${at}`, message });
  const tables = new Set(module.tables.map((t) => t.id));
  const types = new Set(module.entityTypes.map((t) => t.id));
  const lists = new Set(module.referenceLists.map((l) => l.id));
  const table = (id: unknown, at: string) => {
    if (typeof id === "string" && !tables.has(id)) err(at, `no table "${id}" in the module`);
  };
  const pickRefs = (p: Partial<DungeonPick> | undefined, at: string) => {
    if (!p) return;
    table(p.table, `${at}.table`);
    if (p.presets !== undefined && !types.has(p.presets)) err(`${at}.presets`, `no entity type "${p.presets}"`);
    for (const l of p.lists ?? []) if (!lists.has(l)) err(`${at}.lists`, `no reference list "${l}"`);
  };
  const unique = (ids: string[], what: string, at: string) => {
    const s = new Set<string>();
    for (const id of ids) {
      if (s.has(id)) err(at, `duplicate ${what} id "${id}"`);
      s.add(id);
    }
  };
  unique(config.siteTypes.map((s) => s.id), "site type", "siteTypes");
  unique(config.sizes.map((s) => s.id), "size", "sizes");
  unique(config.threats.map((s) => s.id), "threat", "threats");
  unique((config.themes ?? []).map((s) => s.id), "theme", "themes");
  config.siteTypes.forEach((s, i) => {
    table(s.rooms, `siteTypes.${i}.rooms`);
    table(s.lair, `siteTypes.${i}.lair`);
    table(s.entrance, `siteTypes.${i}.entrance`);
    table(s.hall, `siteTypes.${i}.hall`);
  });
  config.sizes.forEach((s, i) => {
    if (s.rooms[0] > s.rooms[1]) err(`sizes.${i}.rooms`, `size "${s.id}": fewest rooms (${s.rooms[0]}) is more than most (${s.rooms[1]})`);
  });
  if (config.defaultThreat !== undefined && !config.threats.some((t) => t.id === config.defaultThreat)) err("defaultThreat", `"${config.defaultThreat}" is not a threat`);
  for (const r of [config.partyLevel, config.partySize]) if (r && (r.min > r.max || r.default < r.min || r.default > r.max)) err("range", `range ${r.min}–${r.max} with default ${r.default} is not consistent`);
  (config.themes ?? []).forEach((t, i) => (t.dressing ?? []).forEach((d) => table(d, `themes.${i}.dressing`)));
  for (const d of [...(config.dressing?.rooms ?? []), ...(config.dressing?.passages ?? [])]) table(d, "dressing");
  const enc = config.encounters;
  if (enc) {
    table(enc.table, "encounters.table");
    table(enc.activity, "encounters.activity");
    if (!types.has(enc.creatureType)) err("encounters.creatureType", `no entity type "${enc.creatureType}"`);
    enc.groups.forEach((g, i) => pickRefs(g, `encounters.groups.${i}`));
  }
  if (config.traps) pickRefs(config.traps.pick, "traps.pick");
  if (config.treasure?.items) pickRefs(config.treasure.items, "treasure.items");
  if (config.doors?.lock) pickRefs(config.doors.lock, "doors.lock");
  for (const z of config.zoneTables ?? []) table(z.table, "zoneTables");
  for (const k of ["site", "room", "encounter"] as const) {
    const e = config.accept?.[k];
    if (!e) continue;
    const def = module.entityTypes.find((t) => t.id === e.type);
    if (!def) err(`accept.${k}.type`, `no entity type "${e.type}"`);
    else if (e.subtype !== undefined && !(def.subtypes ?? []).some((s) => s.id === e.subtype)) err(`accept.${k}.subtype`, `entity type "${e.type}" has no subtype "${e.subtype}"`);
  }
  return out;
}

function runIssues(module: GameModule, g: MapGeneratorDef, runs: number): MapGeneratorIssue[] {
  const out: MapGeneratorIssue[] = [];
  const src = packMapGeneratorOf(g)!;
  for (const site of src.config.siteTypes) {
    for (let i = 0; i < runs; i++) {
      const where = `mapGenerator:${g.id}#siteTypes.${site.id}`;
      const seed = `conformance-${site.id}-${i}`;
      const inputs = { siteType: site.id };
      let a: string;
      let b: string;
      let failed: string | undefined;
      try {
        const r = g.generate(inputs, runContext(module, seed));
        a = JSON.stringify(r.layout);
        failed = r.failedCheck;
        b = JSON.stringify(g.generate(inputs, runContext(module, seed)).layout);
      } catch (e) {
        out.push({ severity: "error", where, message: `generating threw: ${(e as Error).message}` });
        continue;
      }
      if (a !== b) out.push({ severity: "error", where, message: `not deterministic: seed "${seed}" gave two different maps` });
      if (failed) out.push({ severity: "error", where, message: `seed "${seed}": no attempt passed the block check "${failed}"` });
    }
  }
  return out;
}
