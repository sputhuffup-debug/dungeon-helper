/**
 * Importing a data pack the GM picked: parse (with a size cap), validate
 * (limits, schema, namespacing, JSONLogic, conformance with a few procedure
 * runs, determinism), then store it in IndexedDB and refresh the registry.
 * Nothing in a pack runs as code; see the SDK's `pack/validate.ts`.
 */
import { putInstalledPack, type InstalledPackMeta } from "@campaign-forge/core";
import type { PackIssue } from "@campaign-forge/module-sdk";
import { forgetModule, isBuiltinModuleId, moduleEntry, refreshImportedModules, type ModuleEntry } from "./registry";

export interface PackFile {
  name: string;
  text: string;
}

export class PackImportError extends Error {
  readonly issues: PackIssue[];
  constructor(message: string, issues: PackIssue[]) {
    super(message);
    this.name = "PackImportError";
    this.issues = issues;
  }
}

export interface PackImportResult {
  entry: ModuleEntry;
  /** Warnings the checks found (the pack imported anyway). */
  warnings: PackIssue[];
  /** The version this import replaced, when the pack was already imported. */
  replaced?: string;
}

const fail = (message: string, issues: PackIssue[] = []): never => {
  throw new PackImportError(message, issues);
};

/** Validate and store already-parsed pack files (a main file plus any parts). */
export async function installPack(files: ReadonlyArray<{ name: string; data: unknown }>): Promise<PackImportResult> {
  const sdk = await import("@campaign-forge/module-sdk");
  const isMain = (d: unknown) => !!d && typeof d === "object" && (d as { format?: unknown }).format === sdk.PACK_FORMAT;
  const mains = files.filter((f) => isMain(f.data));
  if (mains.length === 0) {
    const parts = files.filter((f) => (f.data as { format?: unknown } | null)?.format === sdk.PACK_PART_FORMAT);
    fail(parts.length > 0 ? "These are parts of a split pack. Choose the pack's main file together with its parts." : `Not a Campaign Forge data pack: the main file has "format": "${sdk.PACK_FORMAT}".`);
  }
  if (mains.length > 1) fail(`Choose one pack at a time (${mains.map((m) => m.name).join(", ")} are all main files).`);
  const main = mains[0]!;
  const id = (main.data as { manifest?: { id?: unknown } }).manifest?.id;
  if (typeof id === "string" && isBuiltinModuleId(id)) fail(`The pack id "${id}" is the id of a module built into the app. Give the pack its own id.`);

  const parts = files.filter((f) => f !== main);
  const res = sdk.loadPack(main.data, { parts, seeds: 10 });
  const tag = (issues: PackIssue[]) => issues.map((i) => (i.file || parts.length === 0 ? i : { ...i, file: i.file ?? main.name }));
  if (!res.ok || !res.module || !res.pack) fail("The pack did not pass validation.", tag(res.issues));
  const pack = res.pack!;
  const module = res.module!;
  const determinism = sdk.conformanceToPackIssues(pack, sdk.checkDeterminism(module, { seeds: 5 })).map((i) => ({ ...i, source: "determinism" as const }));
  if (determinism.some((i) => i.severity === "error")) fail("The pack's generators are not deterministic.", determinism);

  const json = JSON.stringify(pack);
  const m = pack.manifest;
  const meta: InstalledPackMeta = {
    id: m.id,
    name: m.name,
    version: m.version,
    ruleset: m.ruleset,
    modes: m.modes,
    defaultMode: m.defaultMode,
    dataStatus: m.dataStatus,
    license: m.license,
    licenseNotice: m.licenseNotice,
    importedAt: new Date().toISOString(),
    files: files.map((f) => f.name),
    bytes: json.length,
  };
  if (m.publisher) meta.publisher = m.publisher;
  const previous = moduleEntry(m.id);
  await putInstalledPack(meta, JSON.parse(json) as unknown);
  forgetModule(m.id);
  await refreshImportedModules();
  const entry = moduleEntry(m.id);
  if (!entry) fail("The pack was stored but could not be listed.");
  const out: PackImportResult = { entry: entry!, warnings: res.issues.filter((i) => i.severity === "warning") };
  if (previous?.source === "imported") out.replaced = previous.version;
  return out;
}

/** Parse the picked files (each capped in size) and install them. */
export async function importPackFiles(files: ReadonlyArray<PackFile>): Promise<PackImportResult> {
  if (files.length === 0) fail("No file chosen.");
  const sdk = await import("@campaign-forge/module-sdk");
  if (files.length > sdk.PACK_LIMITS.maxParts + 1) fail(`Too many files (${files.length}); a pack has at most ${sdk.PACK_LIMITS.maxParts} parts.`);
  const parsed = files.map((f) => {
    try {
      return { name: f.name, data: sdk.parsePackJson(f.text, f.name) };
    } catch (e) {
      return fail((e as Error).message);
    }
  });
  return installPack(parsed);
}

/** Read browser File objects as text, refusing oversized ones before reading them. */
export async function readPackFiles(list: FileList | File[]): Promise<PackFile[]> {
  const { PACK_LIMITS } = await import("@campaign-forge/module-sdk");
  const files = [...list];
  for (const f of files) if (f.size > PACK_LIMITS.maxBytes) fail(`${f.name}: ${(f.size / 1024 / 1024).toFixed(1)} MB is over the ${PACK_LIMITS.maxBytes / 1024 / 1024} MB limit; split the pack into parts.`);
  return Promise.all(files.map(async (f) => ({ name: f.name, text: await f.text() })));
}
