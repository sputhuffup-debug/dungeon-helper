/**
 * Static module registry. Modules are bundled JS (so they are precached by
 * the PWA) but loaded lazily so the campaign list does not pay for them.
 */
import { loadModule, type GameModule, type LoadedModule } from "@campaign-forge/module-sdk";

export interface ModuleEntry {
  id: string;
  name: string;
  load: () => Promise<GameModule>;
  /** Only offered when the `?dev` flag is set. */
  dev?: boolean;
}

const ENTRIES: ModuleEntry[] = [
  { id: "alien", name: "Alien RPG (Evolved Edition)", load: () => import("@campaign-forge/module-alien").then((m) => m.alienModule) },
  { id: "example", name: "Example Quest (fixture)", dev: true, load: () => import("@campaign-forge/module-example").then((m) => m.exampleModule) },
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
 * is not, so a retry after a fix is possible. The slow procedure termination
 * check is skipped in the browser (CI runs it in the module's own tests).
 */
export function loadModuleById(id: string): Promise<LoadedModule> {
  const cached = cache.get(id);
  if (cached) return cached;
  const entry = moduleEntry(id);
  if (!entry) return Promise.reject(new UnknownModuleError(id));
  const p = entry
    .load()
    .then((mod) => loadModule(mod, { skipProcedureRuns: true }))
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
