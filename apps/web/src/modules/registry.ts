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
 * The static manifests of built-in entries copy fields from each module's own
 * manifest; `registry.test.ts` fails if they drift.
 */
import { deleteInstalledPack, getInstalledPack, listInstalledPacks, type InstalledPackMeta } from "@campaign-forge/core";
import type { GameModule, LoadedModule, ModuleLicense, ModuleManifest, PackSource } from "@campaign-forge/module-sdk";

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
];

const BUILTIN_IDS = new Set(BUILTIN.map((e) => e.id));

// ---------------------------------------------------------------------------
// Imported packs (IndexedDB), kept in memory once read
// ---------------------------------------------------------------------------

let imported: ModuleEntry[] = [];
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

/** Re-read the imported packs from IndexedDB and tell subscribers. */
export function refreshImportedModules(): Promise<void> {
  const p = listInstalledPacks()
    .then((metas) => {
      // A stored pack can never shadow a built-in module.
      imported = metas.filter((m) => !BUILTIN_IDS.has(m.id)).map(importedEntry);
    })
    .catch(() => {
      imported = [];
    })
    .then(() => {
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
  const p = (moduleEntry(id) ? Promise.resolve() : whenImportedModulesLoaded())
    .then(() => {
      const entry = moduleEntry(id);
      if (!entry) throw new UnknownModuleError(id);
      return Promise.all([entry.load(), import("@campaign-forge/module-sdk")]);
    })
    .then(([mod, sdk]) => sdk.loadModule(mod, { skipProcedureRuns: true }))
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

/** Test hook. */
export function clearModuleCache(): void {
  cache.clear();
}
