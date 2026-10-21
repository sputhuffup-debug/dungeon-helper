/**
 * seed-campaign CLI: build a demo campaign and write it out. `--demo campaign`
 * (default) is "Skyfire Down"; `--demo cinematic` is the "Cold Harbor" one-shot;
 * `--demo dnd5e` is "Thornwick Crossing", the fifth edition (SRD 5.1) one-shot.
 *
 *   node --experimental-strip-types --no-warnings --import ./register.mjs src/cli.ts \
 *     --out demo.cfbundle.zip [--demo campaign|cinematic|dnd5e] [--seed s] [--name "Skyfire Down"] [--json demo.json]
 *
 * `--out` writes a Campaign Forge bundle (exportBundle); `--json` writes
 * `{ maps, docs }` (the same shape as demoCampaignJSON). At least one is needed.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { exportBundle } from "@campaign-forge/core";
import { buildDemoCampaign, DEMO_SEED } from "./build";
import { buildCinematicDemo, CINEMATIC_DEMO_SEED } from "./cinematic";
import { buildDnd5eDemo, DND5E_DEMO_SEED } from "./dnd5e";

interface Args {
  out?: string;
  json?: string;
  seed?: string;
  demo: "campaign" | "cinematic" | "dnd5e";
  name?: string;
  help: boolean;
}

const USAGE = "usage: seed-campaign --out demo.cfbundle.zip [--json demo.json] [--demo campaign|cinematic|dnd5e] [--seed s] [--name \"Skyfire Down\"]";

function parseArgs(argv: string[]): Args {
  const args: Args = { demo: "campaign", help: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i] as string;
    const next = (): string => {
      const v = argv[++i];
      if (v === undefined) throw new Error(`${a} needs a value`);
      return v;
    };
    if (a === "--") continue; // pnpm forwards the separator
    if (a === "--out") args.out = next();
    else if (a === "--json") args.json = next();
    else if (a === "--seed") args.seed = next();
    else if (a === "--demo") {
      const d = next();
      if (d !== "campaign" && d !== "cinematic" && d !== "dnd5e") throw new Error(`--demo must be campaign, cinematic or dnd5e, not "${d}"`);
      args.demo = d;
    }
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

  const seed = args.seed ?? (args.demo === "cinematic" ? CINEMATIC_DEMO_SEED : args.demo === "dnd5e" ? DND5E_DEMO_SEED : DEMO_SEED);
  const opts = { seed, ...(args.name ? { name: args.name } : {}) };
  const cinematic = args.demo === "cinematic" ? buildCinematicDemo(opts) : undefined;
  const dnd5e = args.demo === "dnd5e" ? await buildDnd5eDemo(opts) : undefined;
  const demo = cinematic ?? dnd5e ?? buildDemoCampaign(opts);
  const { store, registry, maps, docs } = demo;
  const meta = store.meta();
  const entities = Object.values(maps.entities);
  const byType = new Map<string, number>();
  for (const e of entities) {
    const key = e.subtype ? `${e.type}/${e.subtype}` : e.type;
    byType.set(key, (byType.get(key) ?? 0) + 1);
  }
  console.log(`Built "${meta.name}" (${meta.moduleId} ${meta.moduleVersion}, ${meta.mode} mode, seed "${seed}")`);
  console.log(`  entities ${entities.length}, relationships ${Object.keys(maps.relationships).length}, generator runs ${Object.keys(maps.generatorRuns).length}`);
  for (const [t, n] of [...byType.entries()].sort(([a], [b]) => a.localeCompare(b))) console.log(`    ${t.padEnd(30)} ${n}`);
  console.log(`  adventures ${Object.keys(maps.adventures).length}, acts ${Object.keys(maps.acts).length}, scenes ${Object.keys(maps.scenes).length}, handouts ${Object.keys(maps.handouts).length}`);
  console.log(`  sessions ${Object.keys(maps.sessions).length}, timeline events ${Object.keys(maps.timeline).length}, notes ${Object.keys(maps.notes).length}, rich-text docs ${Object.keys(docs).length}`);
  const pcs = entities.filter((e) => e.fields["isPC"] === true).map((e) => `${e.name} (${String(e.fields["career"] ?? e.fields["class"])})`);
  console.log(`  ${dnd5e ? "party" : "crew"}: ${pcs.join(", ")}`);
  const job = entities.find((e) => e.type === "alien.job");
  if (job) console.log(`  job: ${job.name} [${job.summary ?? ""}]`);
  if (cinematic) {
    const r = cinematic.review.summary;
    console.log(`  builder review: ${r.bad} to fix, ${r.warn} warnings, ${r.ok} passed`);
    for (const m of Object.values(maps.maps)) {
      const checks = m.layout?.checks ?? [];
      console.log(`  map "${m.name}" (seed ${m.generator?.seed}): ${checks.filter((c) => c.ok).length}/${checks.length} checks pass; ${m.layout?.decks.filter((d) => d.layer === "duct").length ?? 0} duct sheets`);
    }
  }

  if (args.out) {
    const bytes = await exportBundle(store, registry, undefined, { id: meta.moduleId, version: meta.moduleVersion });
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
