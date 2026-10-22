/**
 * Module registry. Each game module is a dynamic `import()` behind a small
 * static manifest (id, name, version, play modes), so the campaign list and
 * the "New campaign" dialog never download a module's data. A module loads
 * when a campaign that uses it opens, or when creating a campaign or loading
 * a demo needs it. The chunks are still precached by the PWA for offline use.
 *
 * Three kinds of entry, all loaded the same way (`loadModuleById`):
 * - built-in TypeScript modules (`format: "ts"`);
 * - built-in data packs shipped as JSON in a repo package (`format: "pack"`),
 *   loaded through a `PackSource` so each JSON file is its own lazy chunk;
 * - data packs the GM imported on this device (`source: "imported"`), read
 *   from IndexedDB (core `packStore`) and validated again on every load.
 *
 * Supplements the GM imported (additive data for one module) are applied
 * when that module loads: every installed supplement that extends it, checked
 * against it again, merged in supplement id order (SDK `applySupplements`).
 * One that no longer fits is left out and reported (`supplementProblems`);
 * the module still loads.
 *
 * The static manifests of built-in entries copy fields from each module's own
 * manifest; `registry.test.ts` fails if they drift.
 */
import {
  deleteInstalledPack,
  deleteInstalledSupplement,
  getInstalledPack,
  getInstalledSupplement,
  listInstalledPacks,
  listInstalledSupplements,
  type InstalledPackMeta,
  type InstalledSupplementMeta,
} from "@campaign-forge/core";
import type { GameModule, LoadedModule, ModuleLicense, ModuleManifest, ModuleSupplement, PackIssue, PackSource } from "@campaign-forge/module-sdk";
import { pf2eOrcManifest } from "@campaign-forge/module-pf2e-orc/manifest";

/** What the app knows about a module before loading it. */
export type StaticManifest = Pick<ModuleManifest, "id" | "name" | "version" | "modes" | "defaultMode" | "dataStatus">;

export interface ModuleEntry extends StaticManifest {
  load: () => Promise<GameModule>;
  /** Shipped with the app, or imported by the GM on this device. */
  source: "builtin" | "imported";
  /** A TypeScript module, or a declarative data pack. */
  format: "ts" | "pack";
  /** Only offered when the `?dev` flag is set. */
  dev?: boolean;
  /** Licence and required attribution, when known without loading the module. */
  license?: ModuleLicense;
  publisher?: string;
  ruleset?: string;
  /** Imported packs: when and from which files. */
  importedAt?: string;
  files?: string[];
  bytes?: number;
}

/** A built-in data pack: its static manifest plus where its JSON files come from. */
function builtinPack(manifest: StaticManifest & Pick<ModuleEntry, "dev" | "license" | "publisher" | "ruleset">, source: () => Promise<PackSource>): ModuleEntry {
  return {
    ...manifest,
    source: "builtin",
    format: "pack",
    load: () => Promise.all([source(), import("@campaign-forge/module-sdk")]).then(([src, sdk]) => sdk.moduleFromPackSource(src)),
  };
}

const BUILTIN: ModuleEntry[] = [
  {
    id: "alien",
    name: "Alien RPG (Evolved Edition)",
    version: "0.1.0",
    modes: [
      {
        id: "cinematic",
        name: "Cinematic",
        description:
          "A single-session adventure in three acts, like an Alien film: pregenerated PCs with a hidden agenda per act, Story Points, likely conflict between PCs and few survivors.",
        page: 18,
      },
      {
        id: "campaign",
        name: "Campaign",
        description:
          "Long-running play with player-made PCs in one of three frameworks (Space Truckers, Colonial Marines, Frontier Colonists): jobs, shore leave, experience and a home base.",
        page: 18,
      },
    ],
    defaultMode: "campaign",
    dataStatus: "verified",
    source: "builtin",
    format: "ts",
    load: () => import("@campaign-forge/module-alien").then((m) => m.alienModule),
  },
  {
    id: "example",
    name: "Example Quest",
    version: "0.1.0",
    modes: [
      { id: "standard", name: "Standard", description: "The default way to play." },
      { id: "hardcore", name: "Hardcore", description: "Doom accumulates.", page: 44 },
    ],
    defaultMode: "standard",
    dataStatus: "verified",
    source: "builtin",
    format: "ts",
    dev: true,
    load: () => import("@campaign-forge/module-example").then((m) => m.exampleModule),
  },
  builtinPack(
    {
      id: "example-pack",
      name: "Lanternlight (example pack)",
      version: "0.1.0",
      modes: [
        { id: "delve", name: "Delve", description: "Short trips into the dark with a lantern." },
        { id: "saga", name: "Saga", description: "A long campaign between villages.", cite: "LRD, Ways to play" },
      ],
      defaultMode: "delve",
      dataStatus: "verified",
      dev: true,
      ruleset: "Lanternlight",
      publisher: "Campaign Forge",
      license: {
        spdx: "CC-BY-4.0",
        name: "Creative Commons Attribution 4.0 International",
        url: "https://creativecommons.org/licenses/by/4.0/",
        attribution:
          "This work includes material from the Lanternlight Reference Document by the Campaign Forge contributors, available under the Creative Commons Attribution 4.0 International licence.",
      },
    },
    () => import("@campaign-forge/module-example").then((m) => m.examplePackSource),
  ),
  builtinPack(
    {
      id: "dnd5e-srd",
      name: "5th Edition SRD 5.1 & 5.2 (fantasy d20)",
      version: "0.1.0",
      modes: [
        { id: "campaign", name: "Campaign", description: "Long-running play: characters level up over many sessions, with factions, quests and a living world between adventures." },
        { id: "one-shot", name: "One-shot", description: "A single session: ready-made characters, one adventure in three acts, and a clear ending tonight." },
      ],
      defaultMode: "campaign",
      dataStatus: "partially-verified",
      ruleset: "SRD 5.1 / 5.2",
      publisher: "Wizards of the Coast LLC (SRD 5.1 and SRD 5.2, CC-BY-4.0)",
      license: {
        spdx: "CC-BY-4.0",
        name: "Creative Commons Attribution 4.0 International",
        url: "https://creativecommons.org/licenses/by/4.0/",
        attribution:
          'This work includes material taken from the System Reference Document 5.1 ("SRD 5.1") by Wizards of the Coast LLC and available at https://dnd.wizards.com/resources/systems-reference-document. The SRD 5.1 is licensed under the Creative Commons Attribution 4.0 International License available at https://creativecommons.org/licenses/by/4.0/legalcode.\n\nThis work includes material from the System Reference Document 5.2 (“SRD 5.2”) by Wizards of the Coast LLC, available at https://www.dndbeyond.com/srd. The SRD 5.2 is licensed under the Creative Commons Attribution 4.0 International License, available at https://creativecommons.org/licenses/by/4.0/legalcode.',
      },
    },
    () => import("@campaign-forge/module-dnd5e-srd").then((m) => m.dnd5eSrdSource),
  ),
  // The ORC core rules for the second edition remaster. Its static manifest (with the long ORC
  // attribution) is generated next to the pack, so it is imported rather than copied here.
  builtinPack(pf2eOrcManifest, () => import("@campaign-forge/module-pf2e-orc").then((m) => m.pf2eOrcSource)),
];

const BUILTIN_IDS = new Set(BUILTIN.map((e) => e.id));

// ---------------------------------------------------------------------------
// Imported packs (IndexedDB), kept in memory once read
// ---------------------------------------------------------------------------

let imported: ModuleEntry[] = [];
let supplements: InstalledSupplementMeta[] = [];
let importedLoaded: Promise<void> | undefined;
const listeners = new Set<() => void>();

function importedEntry(meta: InstalledPackMeta): ModuleEntry {
  const entry: ModuleEntry = {
    id: meta.id,
    name: meta.name,
    version: meta.version,
    modes: meta.modes,
    defaultMode: meta.defaultMode,
    dataStatus: meta.dataStatus,
    source: "imported",
    format: "pack",
    ruleset: meta.ruleset,
    importedAt: meta.importedAt,
    files: meta.files,
    bytes: meta.bytes,
    // Stored packs were validated on import; they are validated again here, so a damaged record cannot load.
    load: () =>
      Promise.all([getInstalledPack(meta.id), import("@campaign-forge/module-sdk")]).then(([pack, sdk]) => {
        if (pack === undefined) throw new UnknownModuleError(meta.id);
        return sdk.moduleFromPackSource({ main: () => Promise.resolve(pack) });
      }),
  };
  if (meta.license) entry.license = meta.license;
  if (meta.publisher) entry.publisher = meta.publisher;
  return entry;
}

/** Re-read the imported packs and supplements from IndexedDB and tell subscribers. */
export function refreshImportedModules(): Promise<void> {
  const p = Promise.all([
    listInstalledPacks()
      .then((metas) => {
        // A stored pack can never shadow a built-in module.
        imported = metas.filter((m) => !BUILTIN_IDS.has(m.id)).map(importedEntry);
      })
      .catch(() => {
        imported = [];
      }),
    listInstalledSupplements()
      .then((metas) => {
        supplements = metas;
      })
      .catch(() => {
        supplements = [];
      }),
  ]).then(() => {
    for (const l of [...listeners]) l();
  });
  importedLoaded = p;
  return p;
}

/** Imported packs are read once per page load; later calls reuse it. */
export function whenImportedModulesLoaded(): Promise<void> {
  return importedLoaded ?? refreshImportedModules();
}

/** Subscribe to changes of the module list (imports and removals). */
export function subscribeModules(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Whether `id` is a module shipped with the app (imported packs may not use it). */
export function isBuiltinModuleId(id: string): boolean {
  return BUILTIN_IDS.has(id);
}

// ---------------------------------------------------------------------------
// Listing and loading
// ---------------------------------------------------------------------------

const DEV_KEY = "cf-dev";

/** `?dev` in the URL turns the dev flag on for the session; `?dev=0` turns it off. */
export function isDevFlag(): boolean {
  try {
    if (typeof location !== "undefined") {
      const params = new URLSearchParams(location.search);
      if (params.has("dev")) {
        const v = params.get("dev");
        const on = v !== "0" && v !== "false" && v !== "off";
        sessionStorage.setItem(DEV_KEY, on ? "1" : "0");
        return on;
      }
    }
    return sessionStorage.getItem(DEV_KEY) === "1";
  } catch {
    return false;
  }
}

/** Built-in modules (dev fixtures only with the dev flag), then the imported packs read so far. */
export function listModules(opts: { dev?: boolean } = {}): ModuleEntry[] {
  const dev = opts.dev ?? isDevFlag();
  return [...BUILTIN.filter((e) => !e.dev || dev), ...imported];
}

export function moduleEntry(id: string): ModuleEntry | undefined {
  return BUILTIN.find((e) => e.id === id) ?? imported.find((e) => e.id === id);
}

// ---------------------------------------------------------------------------
// Supplements
// ---------------------------------------------------------------------------

/** Imported supplements, by name. */
export function listSupplements(): InstalledSupplementMeta[] {
  return [...supplements];
}

/** Imported supplements that extend a module, in the order they are applied (by id). */
export function supplementsFor(moduleId: string): InstalledSupplementMeta[] {
  return supplements.filter((s) => s.extends.module === moduleId).sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

export function supplementMeta(id: string): InstalledSupplementMeta | undefined {
  return supplements.find((s) => s.id === id);
}

/** Supplements left out the last time a module loaded, with the reason (module id -> supplement id -> problems). */
const problems = new Map<string, Map<string, PackIssue[]>>();

/** Why installed supplements were left out of a module when it last loaded. */
export function supplementProblems(moduleId: string): Array<{ id: string; issues: PackIssue[] }> {
  return [...(problems.get(moduleId)?.entries() ?? [])].map(([id, issues]) => ({ id, issues }));
}

/** The module with every installed supplement that still fits it merged in; the others are recorded in `supplementProblems`. */
async function withSupplements(base: GameModule): Promise<GameModule> {
  const id = base.manifest.id;
  const metas = supplementsFor(id);
  const left = new Map<string, PackIssue[]>();
  problems.set(id, left);
  if (metas.length === 0) return base;
  const sdk = await import("@campaign-forge/module-sdk");
  const ok: ModuleSupplement[] = [];
  for (const meta of metas) {
    const data = await getInstalledSupplement(meta.id).catch(() => undefined);
    if (data === undefined) {
      left.set(meta.id, [{ severity: "error", path: "$", message: "the stored supplement could not be read", source: "json" }]);
      continue;
    }
    // Stored supplements were checked on import; they are checked again here (the module may have changed since).
    const v = sdk.validateSupplement(data);
    const issues = v.ok && v.value ? sdk.checkSupplementAgainst(v.value, base) : v.issues;
    if (!v.ok || !v.value || issues.some((i) => i.severity === "error")) left.set(meta.id, issues.filter((i) => i.severity === "error"));
    else ok.push(v.value);
  }
  return sdk.applySupplements(base, ok);
}

const cache = new Map<string, Promise<LoadedModule>>();

export class UnknownModuleError extends Error {
  constructor(id: string) {
    super(`Unknown module "${id}". Known modules: ${[...BUILTIN, ...imported].map((e) => e.id).join(", ")}. If it was an imported data pack, import it again under Game modules.`);
    this.name = "UnknownModuleError";
  }
}

/**
 * Load, check and index a module by id. The result is cached; a failed load
 * (a missing chunk, a conformance error) is not, so a retry is possible. The
 * slow procedure termination check is skipped in the browser (CI runs it in
 * the module's own tests; imported packs ran it when they were imported). The
 * SDK's checker is imported here too, so pages that only list modules do not
 * pay for it.
 */
export function loadModuleById(id: string): Promise<LoadedModule> {
  const cached = cache.get(id);
  if (cached) return cached;
  // Imported packs and supplements are read first: a built-in module needs the supplements that extend it.
  const p = whenImportedModulesLoaded()
    .then(() => {
      const entry = moduleEntry(id);
      if (!entry) throw new UnknownModuleError(id);
      return Promise.all([entry.load(), import("@campaign-forge/module-sdk")]);
    })
    .then(async ([base, sdk]) => {
      const mod = await withSupplements(base);
      if (mod === base) return sdk.loadModule(base, { skipProcedureRuns: true });
      try {
        return sdk.loadModule(mod, { skipProcedureRuns: true });
      } catch (e) {
        // Supplements were checked one by one; if together they still break the module, load it without them.
        const left = problems.get(id) ?? new Map<string, PackIssue[]>();
        for (const s of mod.manifest.supplements ?? []) left.set(s.id, [{ severity: "error", path: "$", message: `left out: with it the module failed its checks (${(e as Error).message.split("\n")[0]})`, source: "conformance" }]);
        problems.set(id, left);
        return sdk.loadModule(base, { skipProcedureRuns: true });
      }
    })
    .catch((err: unknown) => {
      cache.delete(id);
      throw err;
    });
  cache.set(id, p);
  return p;
}

/** Forget a loaded module (after an imported pack is replaced or removed). */
export function forgetModule(id: string): void {
  cache.delete(id);
}

/** Remove an imported pack from this device. Built-in modules cannot be removed. */
export async function removeImportedModule(id: string): Promise<void> {
  if (BUILTIN_IDS.has(id)) throw new Error(`"${id}" is built in and cannot be removed`);
  await deleteInstalledPack(id);
  forgetModule(id);
  await refreshImportedModules();
}

/** Remove an imported supplement from this device; the module it extends loads without it from now on. */
export async function removeSupplement(id: string): Promise<void> {
  const meta = supplementMeta(id);
  await deleteInstalledSupplement(id);
  if (meta) forgetModule(meta.extends.module);
  await refreshImportedModules();
}

/** Test hook. */
export function clearModuleCache(): void {
  cache.clear();
}
