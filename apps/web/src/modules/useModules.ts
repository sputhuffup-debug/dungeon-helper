import { useEffect, useReducer } from "react";
import { listModules, subscribeModules, whenImportedModulesLoaded, type ModuleEntry } from "./registry";

/** The module list, re-rendering when imported packs are read, imported or removed. */
export function useModuleList(opts: { dev?: boolean } = {}): ModuleEntry[] {
  const [, bump] = useReducer((n: number) => n + 1, 0);
  useEffect(() => {
    const off = subscribeModules(bump);
    void whenImportedModulesLoaded().then(bump);
    return off;
  }, []);
  return listModules(opts);
}
