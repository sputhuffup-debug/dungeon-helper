/**
 * seed-campaign CLI: build the "Skyfire Down" demo campaign and write it out.
 *
 *   node --experimental-strip-types --no-warnings --import ./register.mjs src/cli.ts \
 *     --out demo.cfbundle.zip [--seed s] [--name "Skyfire Down"] [--json demo.json]
 *
 * `--out` writes a Campaign Forge bundle (exportBundle); `--json` writes
 * `{ maps, docs }` (the same shape as demoCampaignJSON). At least one is needed.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { exportBundle } from "@campaign-forge/core";
import { alienModule } from "@campaign-forge/module-alien";
import { buildDemoCampaign, DEMO_SEED } from "./build";

interface Args {
  out?: string;
  json?: string;
  seed: string;
  name?: string;
  help: boolean;
}

const USAGE = "usage: seed-campaign --out demo.cfbundle.zip [--json demo.json] [--seed s] [--name \"Skyfire Down\"]";

function parseArgs(argv: string[]): Args {
  const args: Args = { seed: DEMO_SEED, help: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i] as string;
    const next = (): string => {
      const v = argv[++i];
      if (v === undefined) throw new Error(`${a} needs a value`);
      return v;
    };
    if (a === "--out") args.out = next();
    else if (a === "--json") args.json = next();
    else if (a === "--seed") args.seed = next();
    else if (a === "--name") args.name = next();
    else if (a === "-h" || a === "--help") args.help = true;
    else throw new Error(`unknown argument "${a}"`);
  }
  return args;
}

function write(path: string, data: string | Uint8Array): string {
  const full = resolve(path);
  mkdirSync(dirname(full), { recursive: true });
  writeFileSync(full, data);
  return full;
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
  if (!args.out && !args.json) {
    console.error("nothing to write: pass --out and/or --json");
    console.error(USAGE);
    return 2;
  }

  const demo = buildDemoCampaign({ seed: args.seed, ...(args.name ? { name: args.name } : {}) });
  const { store, registry, maps, docs } = demo;
  const meta = store.meta();
  const entities = Object.values(maps.entities);
  const byType = new Map<string, number>();
  for (const e of entities) {
    const key = e.subtype ? `${e.type}/${e.subtype}` : e.type;
    byType.set(key, (byType.get(key) ?? 0) + 1);
  }
  console.log(`Built "${meta.name}" (${meta.moduleId} ${meta.moduleVersion}, ${meta.mode} mode, seed "${args.seed}")`);
  console.log(`  entities ${entities.length}, relationships ${Object.keys(maps.relationships).length}, generator runs ${Object.keys(maps.generatorRuns).length}`);
  for (const [t, n] of [...byType.entries()].sort(([a], [b]) => a.localeCompare(b))) console.log(`    ${t.padEnd(30)} ${n}`);
  console.log(`  adventures ${Object.keys(maps.adventures).length}, acts ${Object.keys(maps.acts).length}, scenes ${Object.keys(maps.scenes).length}, handouts ${Object.keys(maps.handouts).length}`);
  console.log(`  sessions ${Object.keys(maps.sessions).length}, timeline events ${Object.keys(maps.timeline).length}, notes ${Object.keys(maps.notes).length}, rich-text docs ${Object.keys(docs).length}`);
  const pcs = entities.filter((e) => e.fields["isPC"] === true).map((e) => `${e.name} (${String(e.fields["career"])})`);
  console.log(`  crew: ${pcs.join(", ")}`);
  const job = entities.find((e) => e.type === "alien.job");
  if (job) console.log(`  job: ${job.name} [${job.summary ?? ""}]`);

  if (args.out) {
    const bytes = await exportBundle(store, registry, undefined, { id: alienModule.manifest.id, version: alienModule.manifest.version });
    console.log(`Wrote bundle (${bytes.byteLength} bytes) to ${write(args.out, bytes)}`);
  }
  if (args.json) {
    console.log(`Wrote JSON to ${write(args.json, JSON.stringify({ maps, docs }, null, 2))}`);
  }
  return 0;
}

main().then(
  (code) => {
    process.exitCode = code;
  },
  (err: unknown) => {
    console.error(err instanceof Error ? (err.stack ?? err.message) : String(err));
    process.exitCode = 1;
  },
);
