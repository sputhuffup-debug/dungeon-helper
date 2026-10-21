/**
 * create-module CLI.
 *
 *   pnpm create-module <name> --engine d20|pool|2d6|d100 [--ts] [--id id] [--out dir] [--author name] [--force]
 *
 * Without --ts it writes a data pack, `<out>/pack.json` (default out:
 * `./<id>-pack`), ready to check with `pnpm module-check` and to import in
 * the app. With --ts it writes a TypeScript module package (default out:
 * `packages/module-<id>` in this repository). Relative paths resolve against
 * the folder pnpm was started in. Existing files are kept unless --force.
 */
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import type { DiceEngineId } from "@campaign-forge/module-sdk";
import { ENGINES, scaffoldPack, scaffoldTsModule, slugify } from "./scaffold";

const USAGE = `usage: create-module <name> --engine ${ENGINES.join("|")} [--ts] [--id id] [--out dir] [--author name] [--force]

  name       the game's display name, e.g. "Sky Pirates"
  --engine   built-in dice engine: d20 (d20 + modifiers vs DC), pool (d6 pools), 2d6 (PbtA bands), d100 (roll-under percentile)
  --ts       write a TypeScript module package instead of a data pack
  --id       module id (default: the name as lower-case-with-hyphens)
  --out      folder to write to (pack: ./<id>-pack, TypeScript: packages/module-<id>)
  --author   author name for the manifest and licence line
  --force    overwrite existing files`;

interface Args {
  name?: string;
  engine?: DiceEngineId;
  ts: boolean;
  id?: string;
  out?: string;
  author?: string;
  force: boolean;
  help: boolean;
}

function parseArgs(argv: string[]): Args {
  const args: Args = { ts: false, force: false, help: false };
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
      case "--engine": {
        const e = next();
        if (!(ENGINES as readonly string[]).includes(e)) throw new Error(`unknown engine "${e}" (${ENGINES.join(", ")})`);
        args.engine = e as DiceEngineId;
        break;
      }
      case "--ts":
        args.ts = true;
        break;
      case "--id":
        args.id = next();
        break;
      case "--out":
        args.out = next();
        break;
      case "--author":
        args.author = next();
        break;
      case "--force":
        args.force = true;
        break;
      case "-h":
      case "--help":
        args.help = true;
        break;
      default:
        if (a.startsWith("--")) throw new Error(`unknown option "${a}"`);
        if (args.name !== undefined) throw new Error(`one name only (got "${args.name}" and "${a}"); quote a name with spaces`);
        args.name = a;
    }
  }
  if (!args.help && !args.name) throw new Error("a module name is required");
  if (!args.help && !args.engine) throw new Error("--engine is required");
  return args;
}

/** The repository root (the folder with pnpm-workspace.yaml) above `from`, if any. */
function repoRoot(from: string): string | undefined {
  let dir = from;
  for (;;) {
    if (existsSync(join(dir, "pnpm-workspace.yaml"))) return dir;
    const up = dirname(dir);
    if (up === dir) return undefined;
    dir = up;
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
  const cwd = process.env.INIT_CWD ?? process.cwd();
  const id = args.id ?? slugify(args.name!);
  const opts = { name: args.name!, engine: args.engine!, id, ...(args.author ? { author: args.author } : {}), year: new Date().getFullYear() };
  let files: Record<string, string>;
  let out: string;
  try {
    if (args.ts) {
      const root = repoRoot(cwd);
      out = resolve(cwd, args.out ?? (root ? join(root, "packages", `module-${id}`) : `module-${id}`));
      const base = root && existsSync(join(root, "tsconfig.base.json")) ? relative(out, join(root, "tsconfig.base.json")).split("\\").join("/") : undefined;
      files = scaffoldTsModule({ ...opts, ...(base ? { tsconfigBase: base } : {}) });
    } else {
      out = resolve(cwd, args.out ?? `${id}-pack`);
      files = { "pack.json": `${JSON.stringify(scaffoldPack(opts), null, 2)}\n` };
    }
  } catch (e) {
    console.error((e as Error).message);
    return 2;
  }
  const clashes = Object.keys(files).filter((f) => existsSync(join(out, f)));
  if (clashes.length > 0 && !args.force) {
    console.error(`not overwriting ${clashes.map((f) => join(out, f)).join(", ")} (use --force)`);
    return 1;
  }
  for (const [file, text] of Object.entries(files)) {
    const path = join(out, file);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, text, "utf8");
    console.log(`wrote ${path}`);
  }
  const shown = relative(cwd, out) || ".";
  console.log("");
  if (args.ts) {
    console.log("Next:");
    console.log("  pnpm install                      # link the new package");
    console.log(`  pnpm module-check ${shown}`);
    console.log("  add it to apps/web/src/modules/registry.ts (see docs/modules/typescript-modules.md)");
  } else {
    console.log("Next:");
    console.log(`  pnpm module-check ${join(shown, "pack.json")}`);
    console.log("  then import it in the app: campaign list → Game modules… → Import data pack…");
  }
  return 0;
}

process.exitCode = main();
