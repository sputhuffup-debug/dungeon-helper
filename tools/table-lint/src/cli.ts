/**
 * table-lint CLI.
 *
 *   node --experimental-strip-types --import ./register.mjs src/cli.ts \
 *     [--module alien|example] [--seeds N] [--spotcheck out.md] [--spotcheck-seed s] [--per-file N] [--json]
 *
 * Exit code 1 when the report has errors. `register.mjs` lets Node resolve the
 * workspace's extensionless TypeScript imports; `pnpm table-lint` wires it up.
 */
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import type { GameModule } from "@campaign-forge/module-sdk";
import { alienModule } from "@campaign-forge/module-alien";
import { exampleModule } from "@campaign-forge/module-example";
import { lintModule, type Issue, type LintReport } from "./lint";
import { renderSpotCheck, spotCheck } from "./spotcheck";

const MODULES: Record<string, GameModule> = { alien: alienModule, example: exampleModule };

interface Args {
  module: string;
  seeds: number;
  spotcheck?: string;
  spotcheckSeed: string;
  perFile: number;
  json: boolean;
  help: boolean;
}

function parseArgs(argv: string[]): Args {
  const args: Args = { module: "alien", seeds: 200, spotcheckSeed: "spot-check-2026-10", perFile: 10, json: false, help: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i] as string;
    const next = (): string => {
      const v = argv[++i];
      if (v === undefined) throw new Error(`${a} needs a value`);
      return v;
    };
    switch (a) {
      case "--module":
        args.module = next();
        break;
      case "--seeds":
        args.seeds = Number(next());
        break;
      case "--spotcheck":
        args.spotcheck = next();
        break;
      case "--spotcheck-seed":
        args.spotcheckSeed = next();
        break;
      case "--per-file":
        args.perFile = Number(next());
        break;
      case "--json":
        args.json = true;
        break;
      case "-h":
      case "--help":
        args.help = true;
        break;
      default:
        throw new Error(`unknown argument "${a}"`);
    }
  }
  if (!Number.isInteger(args.seeds) || args.seeds < 0) throw new Error("--seeds must be a non-negative integer");
  if (!Number.isInteger(args.perFile) || args.perFile < 1) throw new Error("--per-file must be a positive integer");
  return args;
}

const USAGE = `usage: table-lint [--module alien|example] [--seeds N] [--spotcheck out.md] [--spotcheck-seed s] [--per-file N] [--json]

  --module         module to lint (default alien)
  --seeds          seeds per procedure for the termination check (default 200; 0 skips it)
  --spotcheck      write a Markdown spot-check sheet to this file
  --spotcheck-seed seed for the spot-check picks (default spot-check-2026-10)
  --per-file       picks per table family / entity type / reference list (default 10)
  --json           print the lint report as JSON instead of the pretty summary`;

function groupByWhere(issues: Issue[]): Map<string, Issue[]> {
  const out = new Map<string, Issue[]>();
  for (const i of issues) out.set(i.where, [...(out.get(i.where) ?? []), i]);
  return out;
}

function printIssues(title: string, issues: Issue[]): void {
  console.log(`${title} (${issues.length})`);
  if (issues.length === 0) {
    console.log("  none");
    return;
  }
  for (const [where, list] of groupByWhere(issues)) {
    console.log(`  ${where}`);
    for (const i of list) console.log(`    - ${i.message}${i.source === "sdk" ? "  [sdk]" : ""}`);
  }
}

function printStats(report: LintReport): void {
  const s = report.stats;
  console.log("Stats");
  console.log(`  tables ${s.tables} (${s.unverifiedTables} unverified), rows ${s.rowsTotal} (${s.unverifiedRows} unverified)`);
  console.log(`  rules ${s.rulesTotal}, presets ${s.presetsTotal} (${s.unverifiedPresets} unverified), reference lists ${s.referenceLists} (${s.unverifiedReferenceLists} unverified), procedures ${s.procedures}`);
  console.log("  by family:");
  const fams = Object.entries(s.byFamily);
  const width = Math.max(6, ...fams.map(([f]) => f.length));
  for (const [fam, f] of fams) {
    console.log(`    ${fam.padEnd(width)}  tables ${String(f.tables).padStart(3)}  rows ${String(f.rows).padStart(4)}  unverified tables ${String(f.unverified).padStart(3)}  unverified rows ${String(f.unverifiedRows).padStart(4)}`);
  }
  const types = Object.entries(s.presetsByType);
  if (types.length > 0) {
    console.log("  presets by entity type:");
    const w = Math.max(6, ...types.map(([t]) => t.length));
    for (const [t, p] of types) console.log(`    ${t.padEnd(w)}  presets ${String(p.presets).padStart(3)}  unverified ${String(p.unverified).padStart(3)}`);
  }
}

function main(): number {
  let args: Args;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (e) {
    console.error((e as Error).message);
    console.error(USAGE);
    return 2;
  }
  if (args.help) {
    console.log(USAGE);
    return 0;
  }
  const module = MODULES[args.module];
  if (!module) {
    console.error(`unknown module "${args.module}"; known: ${Object.keys(MODULES).join(", ")}`);
    return 2;
  }

  const started = Date.now();
  const report = lintModule(module, args.seeds === 0 ? { skipProcedureRuns: true } : { seeds: args.seeds });
  const elapsed = Date.now() - started;

  if (args.json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(`table-lint: ${module.manifest.name} (${module.manifest.id} ${module.manifest.version}), ${args.seeds} seeds per procedure, ${elapsed} ms`);
    console.log("");
    printIssues("Errors", report.errors);
    console.log("");
    printIssues("Warnings", report.warnings);
    console.log("");
    printStats(report);
    console.log("");
    console.log(report.ok ? `OK: no errors, ${report.warnings.length} warning(s)` : `FAILED: ${report.errors.length} error(s), ${report.warnings.length} warning(s)`);
  }

  if (args.spotcheck) {
    const sheet = spotCheck(module, { perFile: args.perFile, seed: args.spotcheckSeed });
    const path = resolve(args.spotcheck);
    writeFileSync(path, renderSpotCheck(sheet), "utf8");
    if (!args.json) console.log(`Spot-check sheet: ${sheet.total} items written to ${path}`);
  }
  return report.ok ? 0 : 1;
}

process.exitCode = main();
