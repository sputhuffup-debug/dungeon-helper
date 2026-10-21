import { createContext, useContext } from "react";
import type { DiceSystem, SheetField, PlayModeId } from "@campaign-forge/module-sdk";

/** Callbacks and services the sheet widgets can reach without prop drilling. */
export interface SheetContextValue {
  /** The active play mode; reference items carrying `mode` are filtered by it. */
  mode?: PlayModeId;
  /** Table mode: bigger touch targets and type. */
  tableMode: boolean;
  /** A skill row's roll button. `input` is what the module's `buildPool` expects; `label` is the row's name. */
  onRoll?: (skillId: string, input: Record<string, unknown>, label?: string) => void;
  onOpenRule?: (ruleId: string) => void;
  /** A ref widget's "pick" button. The app opens its entity picker and writes the id back. */
  onPickEntity?: (field: SheetField, current: unknown) => void;
  resolveEntityName?: (id: string) => string | undefined;
  /** Asset id or URL -> displayable URL. */
  resolveAssetUrl?: (idOrUrl: string) => string | undefined;
  /** Zone map widget's "open map" button. */
  onOpenMap?: (mapId: string | undefined, field: SheetField) => void;
  /**
   * Members of a named group of entities the host supplies (e.g. an adventure
   * builder's cast roles). Widgets configured with `config.castRoles` (ref) or
   * `config.keyedByCast` (object) read it; without it they fall back to their
   * plain behaviour.
   */
  castMembers?: (role: string) => Array<{ id: string; name: string }>;
  /**
   * The module's dice system. With it, the skills widget shows each row's pool
   * as the dice system builds it (e.g. "1d20 + 5" for a d20 system) instead of
   * attribute + skill.
   */
  dice?: DiceSystem;
}

export const SheetContext = createContext<SheetContextValue>({ tableMode: false });

export function useSheetContext(): SheetContextValue {
  return useContext(SheetContext);
}

export const SheetContextProvider = SheetContext.Provider;
