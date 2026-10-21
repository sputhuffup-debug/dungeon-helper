/**
 * Importing a data pack or a supplement the GM picked: parse (with a size
 * cap), validate (limits, schema, namespacing, JSONLogic, conformance with a
 * few procedure runs, determinism; a supplement also against the module it
 * extends), then store it in IndexedDB and refresh the registry. Nothing in a
 * pack or supplement runs as code; see the SDK's `pack/validate.ts` and
 * `pack/supplement.ts`.
 */
import { getInstalledSupplement, putInstalledPack, putInstalledSupplement, type InstalledPackMeta, type InstalledSupplementMeta } from "@campaign-forge/core";
import type { ModuleSupplement, PackIssue } from "@campaign-forge/module-sdk";
import { forgetModule, isBuiltinModuleId, moduleEntry, refreshImportedModules, supplementMeta, supplementsFor, whenImportedModulesLoaded, type ModuleEntry } from "./registry";

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

export interface SupplementImportResult {
  supplement: InstalledSupplementMeta;
  /** The module it extends. */
  base: ModuleEntry;
  warnings: PackIssue[];
  /** The version this import replaced, when the supplement was already imported. */
  replaced?: string;
}

/** Load and validate the stored supplements a module already has (except `skip`), to check a new one alongside them. */
async function installedFor(moduleId: string, skip: string): Promise<ModuleSupplement[]> {
  const sdk = await import("@campaign-forge/module-sdk");
  const out: ModuleSupplement[] = [];
  for (const meta of supplementsFor(moduleId)) {
    if (meta.id === skip) continue;
    const v = sdk.validateSupplement(await getInstalledSupplement(meta.id));
    if (v.ok && v.value) out.push(v.value);
  }
  return out;
}

/**
 * Validate a supplement against the module it extends (with the module's
 * other supplements applied) and store it. The module reloads with it the
 * next time a campaign opens.
 */
export async function installSupplement(file: { name: string; data: unknown }): Promise<SupplementImportResult> {
  const sdk = await import("@campaign-forge/module-sdk");
  await whenImportedModulesLoaded();
  const rawId = (file.data as { manifest?: { id?: unknown } } | null)?.manifest?.id;
  if (typeof rawId === "string" && (isBuiltinModuleId(rawId) || moduleEntry(rawId))) fail(`The supplement id "${rawId}" is the id of a game module. Give the supplement its own id.`);
  const v = sdk.validateSupplement(file.data);
  if (!v.ok || !v.value) return fail("The supplement did not pass validation.", v.issues.map((i) => ({ ...i, file: file.name })));
  const m = v.value.manifest;
  const base = moduleEntry(m.extends.module);
  if (!base) fail(`This supplement extends "${m.extends.module}", which is not on this device. Import that module first, then the supplement.`);
  const baseModule = await base!.load();
  const res = sdk.checkSupplement(v.value, baseModule, { alongside: await installedFor(base!.id, m.id), seeds: 10, determinismSeeds: 5 });
  if (!res.ok || !res.supplement) fail(`The supplement does not fit ${base!.name} ${baseModule.manifest.version}.`, res.issues.map((i) => ({ ...i, file: file.name })));
  const json = JSON.stringify(res.supplement);
  const meta: InstalledSupplementMeta = {
    id: m.id,
    name: m.name,
    version: m.version,
    extends: { ...m.extends },
    licenseNotice: m.licenseNotice,
    counts: sdk.supplementCounts(res.supplement!),
    importedAt: new Date().toISOString(),
    files: [file.name],
    bytes: json.length,
  };
  if (m.license) meta.license = m.license;
  if (m.authors) meta.authors = m.authors;
  if (m.description) meta.description = m.description;
  const previous = supplementMeta(m.id);
  await putInstalledSupplement(meta, JSON.parse(json) as unknown);
  forgetModule(base!.id);
  if (previous && previous.extends.module !== base!.id) forgetModule(previous.extends.module);
  await refreshImportedModules();
  const out: SupplementImportResult = { supplement: meta, base: base!, warnings: res.issues.filter((i) => i.severity === "warning") };
  if (previous) out.replaced = previous.version;
  return out;
}

const formatOf = (d: unknown) => (d && typeof d === "object" ? (d as { format?: unknown }).format : undefined);

/** Parse the picked files (each capped in size) and install them: a data pack (main file plus parts) or one supplement. */
export async function importFiles(files: ReadonlyArray<PackFile>): Promise<PackImportResult | SupplementImportResult> {
  return installParsed(await parseFiles(files));
}

/** Parse and install a data pack (its main file plus parts). */
export async function importPackFiles(files: ReadonlyArray<PackFile>): Promise<PackImportResult> {
  return installPack(await parseFiles(files));
}

/** Parse and install one supplement file. */
export async function importSupplementFile(file: PackFile): Promise<SupplementImportResult> {
  const [parsed] = await parseFiles([file]);
  return installSupplement(parsed!);
}

async function parseFiles(files: ReadonlyArray<PackFile>): Promise<Array<{ name: string; data: unknown }>> {
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
  return parsed;
}

async function installParsed(parsed: Array<{ name: string; data: unknown }>): Promise<PackImportResult | SupplementImportResult> {
  const sdk = await import("@campaign-forge/module-sdk");
  const supplements = parsed.filter((f) => formatOf(f.data) === sdk.SUPPLEMENT_FORMAT);
  if (supplements.length > 0) {
    if (parsed.length > 1) fail("Choose one supplement at a time, on its own (a supplement is a single file).");
    return installSupplement(supplements[0]!);
  }
  return installPack(parsed);
}

/** Whether an import result is a supplement's. */
export function isSupplementResult(r: PackImportResult | SupplementImportResult): r is SupplementImportResult {
  return "supplement" in r;
}

/** Read browser File objects as text, refusing oversized ones before reading them. */
export async function readPackFiles(list: FileList | File[]): Promise<PackFile[]> {
  const { PACK_LIMITS } = await import("@campaign-forge/module-sdk");
  const files = [...list];
  for (const f of files) if (f.size > PACK_LIMITS.maxBytes) fail(`${f.name}: ${(f.size / 1024 / 1024).toFixed(1)} MB is over the ${PACK_LIMITS.maxBytes / 1024 / 1024} MB limit; split the pack into parts.`);
  return Promise.all(files.map(async (f) => ({ name: f.name, text: await f.text() })));
}
