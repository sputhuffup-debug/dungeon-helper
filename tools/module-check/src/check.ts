/**
 * module-check: everything that has to hold before a game module ships, in
 * one report.
 *
 * 1. pack: for a data pack, size limits, the published JSON Schema, ids
 *    namespaced by the pack id, JSONLogic operators, the safe JSON Schema
 *    subset, the dice engine config and the parts of a split pack;
 * 2. conformance: the SDK suite (`checkModule`), with every procedure run
 *    against many seeds;
 * 3. lint: table-lint's data-entry checks (citations, id conventions, d66
 *    bounds, preset fields, rule card length);
 * 4. determinism: every procedure run twice per seed, every dice roll made
 *    twice, must give identical output (rule 3).
 *
 * Targets: a built-in module id, a pack's main JSON file (its parts are read
 * from the same folder), a folder holding `pack.json`, a TypeScript module
 * package folder, or a TypeScript file exporting a GameModule or PackSource.
 */
import { existsSync, readFileSync, statSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import {
  checkDeterminism,
  conformanceToPackIssues,
  mergePackParts,
  packFromSource,
  packToModule,
  parsePackJson,
  PACK_FORMAT,
  PACK_PART_FORMAT,
  PackLoadError,
  type ConformanceIssue,
  type GameModule,
  type ModulePack,
  type PackIssue,
  type PackSource,
} from "@campaign-forge/module-sdk";
import { lintModule } from "@campaign-forge/table-lint";

export type CheckStage = "pack" | "conformance" | "lint" | "determinism";

export interface CheckIssue {
  severity: "error" | "warning";
  stage: CheckStage;
  /** JSON path for packs ("$.tables[3]"), the conformance location for TypeScript modules ("table:alien.x"). */
  where: string;
  /** The collection item's id, when known. */
  item?: string;
  /** Part file of a split pack. */
  file?: string;
  message: string;
}

export interface ModuleCheckReport {
  target: string;
  kind: "pack" | "ts";
  moduleId?: string;
  name?: string;
  version?: string;
  ok: boolean;
  issues: CheckIssue[];
  /** Stages that ran, in order. A failing pack stage stops the rest. */
  stages: CheckStage[];
  ms: number;
}

export interface ModuleCheckOptions {
  /** Seeds per procedure for the conformance run (default 100). */
  seeds?: number;
  /** Seeds per procedure for the determinism check (default 20). */
  determinismSeeds?: number;
  /** Directory relative targets resolve against (default the process cwd). */
  cwd?: string;
}

/** Built-in modules by id. */
export const BUILTIN_TARGETS: Record<string, () => Promise<{ module?: GameModule; source?: PackSource }>> = {
  alien: async () => ({ module: (await import("@campaign-forge/module-alien")).alienModule }),
  example: async () => ({ module: (await import("@campaign-forge/module-example")).exampleModule }),
  "example-pack": async () => ({ source: (await import("@campaign-forge/module-example")).examplePackSource }),
};

function fromPackIssue(i: PackIssue, stage: CheckStage): CheckIssue {
  const out: CheckIssue = { severity: i.severity, stage, where: i.path, message: i.message };
  if (i.item) out.item = i.item;
  if (i.file) out.file = i.file;
  return out;
}

function fromConformance(i: ConformanceIssue, stage: CheckStage, pack?: ModulePack): CheckIssue {
  if (pack) return fromPackIssue(conformanceToPackIssues(pack, [i])[0]!, stage);
  return { severity: i.severity, stage, where: i.where, message: i.message };
}

function looksLikeModule(v: unknown): v is GameModule {
  const m = v as Partial<GameModule> | null;
  return !!m && typeof m === "object" && !!m.manifest && !!m.dice && Array.isArray(m.tables) && Array.isArray(m.entityTypes);
}

function looksLikeSource(v: unknown): v is PackSource {
  return !!v && typeof v === "object" && typeof (v as PackSource).main === "function";
}

/** Read a pack's main file and the parts it lists from the same folder. */
export function readPackFiles(file: string): { main: unknown; parts: Array<{ name: string; data: unknown }>; missing: string[] } {
  const main = parsePackJson(readFileSync(file, "utf8"), basename(file));
  const declared = (main as { parts?: unknown }).parts;
  const parts: Array<{ name: string; data: unknown }> = [];
  const missing: string[] = [];
  for (const name of Array.isArray(declared) ? declared : []) {
    if (typeof name !== "string" || name.includes("/") || name.includes("\\") || name.startsWith(".")) continue;
    const path = join(dirname(file), name);
    if (!existsSync(path)) missing.push(name);
    else parts.push({ name, data: parsePackJson(readFileSync(path, "utf8"), name) });
  }
  return { main, parts, missing };
}

interface Resolved {
  kind: "pack" | "ts";
  module?: GameModule;
  pack?: ModulePack;
  issues: CheckIssue[];
}

async function resolveTarget(target: string, cwd: string): Promise<Resolved> {
  const builtin = BUILTIN_TARGETS[target];
  if (builtin && !existsSync(resolve(cwd, target))) {
    const got = await builtin();
    if (got.module) return { kind: "ts", module: got.module, issues: [] };
    return fromSource(got.source!);
  }
  const path = resolve(cwd, target);
  if (!existsSync(path)) throw new Error(`no such module id or file: "${target}" (built-in ids: ${Object.keys(BUILTIN_TARGETS).join(", ")})`);
  if (statSync(path).isDirectory()) {
    if (existsSync(join(path, "pack.json"))) return fromPackFile(join(path, "pack.json"));
    const pkg = join(path, "package.json");
    if (existsSync(pkg)) {
      const main = (JSON.parse(readFileSync(pkg, "utf8")) as { main?: string }).main ?? "./src/index.ts";
      return fromTsFile(resolve(path, main));
    }
    throw new Error(`${target}: a folder needs a pack.json or a package.json`);
  }
  if (path.endsWith(".json")) return fromPackFile(path);
  if (/\.(m?ts|m?js)$/.test(path)) return fromTsFile(path);
  throw new Error(`${target}: expected a .json pack, a .ts module file or a folder`);
}

function fromPackFile(file: string): Resolved {
  const read = readPackFiles(file);
  const format = (read.main as { format?: unknown } | null)?.format;
  if (format === PACK_PART_FORMAT) throw new Error(`${basename(file)} is a part of a split pack; check the pack's main file`);
  if (format !== PACK_FORMAT) throw new Error(`${basename(file)} is not a data pack ("format" must be "${PACK_FORMAT}")`);
  const merged = mergePackParts(read.main, read.parts);
  const issues = merged.issues.map((i) => fromPackIssue(i, "pack"));
  for (const name of read.missing) {
    const i = issues.find((x) => x.message === `part "${name}" is missing`);
    if (i) i.message += ` (no file ${name} next to ${basename(file)})`;
  }
  if (!merged.ok || !merged.value) return { kind: "pack", issues };
  return { kind: "pack", pack: merged.value, module: packToModule(merged.value), issues };
}

async function fromSource(source: PackSource): Promise<Resolved> {
  try {
    const pack = await packFromSource(source);
    return { kind: "pack", pack, module: packToModule(pack), issues: [] };
  } catch (e) {
    if (e instanceof PackLoadError) return { kind: "pack", issues: e.issues.map((i) => fromPackIssue(i, "pack")) };
    throw e;
  }
}

async function fromTsFile(file: string): Promise<Resolved> {
  const mod = (await import(pathToFileURL(file).href)) as Record<string, unknown>;
  const candidates = [mod.default, ...Object.values(mod)];
  const module = candidates.find(looksLikeModule);
  if (module) return { kind: "ts", module, issues: [] };
  const source = candidates.find(looksLikeSource);
  if (source) return fromSource(source);
  throw new Error(`${basename(file)} exports no GameModule (an object with manifest, dice, tables, entityTypes) and no PackSource`);
}

/** Check one target. Throws only for targets it cannot find or read; everything else is in the report. */
export async function checkTarget(target: string, options: ModuleCheckOptions = {}): Promise<ModuleCheckReport> {
  const started = Date.now();
  const cwd = options.cwd ?? process.cwd();
  const resolved = await resolveTarget(target, cwd);
  const issues = [...resolved.issues];
  const stages: CheckStage[] = resolved.kind === "pack" ? ["pack"] : [];
  const module = resolved.module;
  if (module && !issues.some((i) => i.severity === "error")) {
    // table-lint wraps the conformance suite: split its issues back into the two stages.
    const lint = lintModule(module, { seeds: options.seeds ?? 100 });
    stages.push("conformance", "lint");
    for (const i of [...lint.errors, ...lint.warnings]) issues.push(fromConformance(i, i.source === "sdk" ? "conformance" : "lint", resolved.pack));
    stages.push("determinism");
    for (const i of checkDeterminism(module, { seeds: options.determinismSeeds ?? 20 })) issues.push(fromConformance(i, "determinism", resolved.pack));
  }
  const report: ModuleCheckReport = {
    target,
    kind: resolved.kind,
    ok: !issues.some((i) => i.severity === "error"),
    issues,
    stages,
    ms: Date.now() - started,
  };
  const manifest = module?.manifest ?? resolved.pack?.manifest;
  if (manifest) {
    report.moduleId = manifest.id;
    report.name = manifest.name;
    report.version = manifest.version;
  }
  return report;
}

/** One issue as a line: "error  [lint] $.tables[3] (mypack.x.y): message". */
export function formatCheckIssue(i: CheckIssue): string {
  const where = `${i.file ? `${i.file}: ` : ""}${i.where}${i.item ? ` (${i.item})` : ""}`;
  return `${i.severity === "error" ? "error  " : "warning"} [${i.stage}] ${where}: ${i.message}`;
}

/** The report as text, errors first. */
export function formatReport(r: ModuleCheckReport, opts: { quiet?: boolean } = {}): string {
  const lines: string[] = [];
  const title = r.name ? `${r.name} (${r.moduleId} ${r.version})` : r.target;
  lines.push(`module-check: ${title}, ${r.kind === "pack" ? "data pack" : "TypeScript module"}, ${r.ms} ms`);
  const errors = r.issues.filter((i) => i.severity === "error");
  const warnings = r.issues.filter((i) => i.severity === "warning");
  for (const i of errors) lines.push(`  ${formatCheckIssue(i)}`);
  if (!opts.quiet) for (const i of warnings) lines.push(`  ${formatCheckIssue(i)}`);
  const skipped = (["pack", "conformance", "lint", "determinism"] as const).filter((s) => !r.stages.includes(s) && !(s === "pack" && r.kind === "ts"));
  if (skipped.length > 0) lines.push(`  (not run: ${skipped.join(", ")}; fix the errors above first)`);
  lines.push(r.ok ? `  OK: no errors, ${warnings.length} warning(s)` : `  FAILED: ${errors.length} error(s), ${warnings.length} warning(s)`);
  return lines.join("\n");
}
