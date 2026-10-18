/**
 * How components outside the router's typed world (the editor's ref chips,
 * search results) open a record. The campaign shell provides it.
 */
import type { Id } from "@campaign-forge/core";
import { createContext, useContext } from "react";

export interface RecordLinks {
  openEntity(id: Id, tab?: string): void;
  openNote(id: Id): void;
  openAdventure(id: Id): void;
  openSession(id: Id): void;
}

const noop: RecordLinks = { openEntity: () => undefined, openNote: () => undefined, openAdventure: () => undefined, openSession: () => undefined };

export const RecordLinksContext = createContext<RecordLinks>(noop);

export function useRecordLinks(): RecordLinks {
  return useContext(RecordLinksContext);
}
