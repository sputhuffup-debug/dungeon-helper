/**
 * module-check CLI.
 *
 *   pnpm module-check <target...> [--all] [--seeds N] [--determinism-seeds N] [--quiet] [--json]
 *
 * A target is a built-in module id (alien, example, example-pack, dnd5e-srd), a pack's
 * main JSON file, a folder with a pack.json, a TypeScript module package
 * folder, or a .ts file. Relative paths resolve against the folder pnpm was
 * started in. Exit code 1 when any target has errors, 2 for usage errors.
 */
import { BUILTIN_TARGETS, checkTarget, formatReport, type ModuleCheckReport } from "./check";

interface Args {
  targets: string[];
  all: boolean;
  seeds: number;
  determinismSeeds: number;
  quiet: boolean;
  json: boolean;
  help: boolean;
}

const USAGE = `usage: module-check <target...> [--all] [--seeds N] [--determinism-seeds N] [--quiet] [--json]

  target               a built-in module id (${Object.keys(BUILTIN_TARGETS).join(", ")}), a pack's main .json file,
                       a folder with pack.json, a TypeScript module package folder, or a .ts file
  --all                check every built-in module
  --seeds              seeds per procedure for the conformance run (default 100)
  --determinism-seeds  seeds per procedure for the determinism check (default 20)
  --quiet              print errors only
  --json               print the reports as JSON`;

function parseArgs(argv: string[]): Args {
  const args: Args = { targets: [], all: false, seeds: 100, determinismSeeds: 20, quiet: false, json: false, help: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i] as string;
    const next = (): string => {
      const v = argv[++i];
      if (v === undefined) throw new Error(`${a} needs a value`);
      return v;
    };
    switch (a) {
      case "--":
        break;
      case "--all":
        args.all = true;
        break;
      case "--seeds":
        args.seeds = Number(next());
        break;
      case "--determinism-seeds":
        args.determinismSeeds = Number(next());
        break;
      case "--quiet":
        args.quiet = true;
        break;
      case "--json":
        args.json = true;
        break;
      case "-h":
      case "--help":
        args.help = true;
        break;
      default:
        if (a.startsWith("--")) throw new Error(`unknown option "${a}"`);
        args.targets.push(a);
    }
  }
  for (const [k, v] of [["--seeds", args.seeds], ["--determinism-seeds", args.determinismSeeds]] as const) {
    if (!Number.isInteger(v) || v < 1) throw new Error(`${k} must be a positive integer`);
  }
  if (args.all) args.targets.push(...Object.keys(BUILTIN_TARGETS).filter((t) => !args.targets.includes(t)));
  if (!args.help && args.targets.length === 0) throw new Error("no target given");
  return args;
}

async function main(): Promise<number> {
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
  // pnpm runs the script in this package's folder; paths are meant from where the user ran it.
  const cwd = process.env.INIT_CWD ?? process.cwd();
  const reports: ModuleCheckReport[] = [];
  let failed = false;
  for (const target of args.targets) {
    try {
      const report = await checkTarget(target, { cwd, seeds: args.seeds, determinismSeeds: args.determinismSeeds });
      reports.push(report);
      if (!report.ok) failed = true;
      if (!args.json) console.log(formatReport(report, { quiet: args.quiet }));
    } catch (e) {
      failed = true;
      if (args.json) reports.push({ target, kind: "pack", ok: false, issues: [{ severity: "error", stage: "pack", where: "$", message: (e as Error).message }], stages: [], ms: 0 });
      else console.error(`module-check: ${target}: ${(e as Error).message}`);
    }
  }
  if (args.json) console.log(JSON.stringify(reports, null, 2));
  return failed ? 1 : 0;
}

process.exitCode = await main();
