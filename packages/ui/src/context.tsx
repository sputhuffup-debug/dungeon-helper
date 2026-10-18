import { createContext, useContext } from "react";
import type { SheetField, PlayModeId } from "@campaign-forge/module-sdk";

/** Callbacks and services the sheet widgets can reach without prop drilling. */
export interface SheetContextValue {
  /** The active play mode; reference items carrying `mode` are filtered by it. */
  mode?: PlayModeId;
  /** Table mode: bigger touch targets and type. */
  tableMode: boolean;
  /** A skill row's roll button. `input` is what the module's `buildPool` expects. */
  onRoll?: (skillId: string, input: Record<string, unknown>) => void;
  onOpenRule?: (ruleId: string) => void;
  /** A ref widget's "pick" button. The app opens its entity picker and writes the id back. */
  onPickEntity?: (field: SheetField, current: unknown) => void;
  resolveEntityName?: (id: string) => string | undefined;
  /** Asset id or URL -> displayable URL. */
  resolveAssetUrl?: (idOrUrl: string) => string | undefined;
  /** Zone map widget's "open map" button. */
  onOpenMap?: (mapId: string | undefined, field: SheetField) => void;
}

export const SheetContext = createContext<SheetContextValue>({ tableMode: false });

export function useSheetContext(): SheetContextValue {
  return useContext(SheetContext);
}

export const SheetContextProvider = SheetContext.Provider;
