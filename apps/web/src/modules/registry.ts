/**
 * Module registry. Each game module is a dynamic `import()` behind a small
 * static manifest (id, name, version, play modes), so the campaign list and
 * the "New campaign" dialog never download a module's data. A module loads
 * when a campaign that uses it opens, or when creating a campaign or loading
 * a demo needs it. The chunks are still precached by the PWA for offline use.
 *
 * The static manifests copy fields from each module's own manifest;
 * `registry.test.ts` fails if they drift.
 */
import type { GameModule, LoadedModule, ModuleManifest } from "@campaign-forge/module-sdk";

/** What the app knows about a module before loading it. */
export type StaticManifest = Pick<ModuleManifest, "id" | "name" | "version" | "modes" | "defaultMode" | "dataStatus">;

export interface ModuleEntry extends StaticManifest {
  load: () => Promise<GameModule>;
  /** Only offered when the `?dev` flag is set. */
  dev?: boolean;
}

const ENTRIES: ModuleEntry[] = [
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
    dev: true,
    load: () => import("@campaign-forge/module-example").then((m) => m.exampleModule),
  },
];

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

export function listModules(opts: { dev?: boolean } = {}): ModuleEntry[] {
  const dev = opts.dev ?? isDevFlag();
  return ENTRIES.filter((e) => !e.dev || dev);
}

export function moduleEntry(id: string): ModuleEntry | undefined {
  return ENTRIES.find((e) => e.id === id);
}

const cache = new Map<string, Promise<LoadedModule>>();

export class UnknownModuleError extends Error {
  constructor(id: string) {
    super(`Unknown module "${id}". Known modules: ${ENTRIES.map((e) => e.id).join(", ")}.`);
    this.name = "UnknownModuleError";
  }
}

/**
 * Load, check and index a module by id. The result is cached; a failed load
 * (a missing chunk, a conformance error) is not, so a retry is possible. The
 * slow procedure termination check is skipped in the browser (CI runs it in
 * the module's own tests). The SDK's checker is imported here too, so pages
 * that only list modules do not pay for it.
 */
export function loadModuleById(id: string): Promise<LoadedModule> {
  const cached = cache.get(id);
  if (cached) return cached;
  const entry = moduleEntry(id);
  if (!entry) return Promise.reject(new UnknownModuleError(id));
  const p = Promise.all([entry.load(), import("@campaign-forge/module-sdk")])
    .then(([mod, sdk]) => sdk.loadModule(mod, { skipProcedureRuns: true }))
    .catch((err: unknown) => {
      cache.delete(id);
      throw err;
    });
  cache.set(id, p);
  return p;
}

/** Test hook. */
export function clearModuleCache(): void {
  cache.clear();
}
