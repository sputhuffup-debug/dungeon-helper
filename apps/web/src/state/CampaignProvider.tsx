/**
 * CampaignProvider opens one campaign: its Yjs store through IndexedDB
 * persistence, the rich-text registry, the asset store, the reference index,
 * the search index and the game module. Children reach all of it through
 * `useCampaign()`.
 */
import {
  AssetStore,
  CampaignStore,
  RefIndex,
  RichTextRegistry,
  SearchIndex,
  campaignDbName,
  openPersistence,
  registerCampaign,
  type Id,
  type MapName,
  type PersistenceHandle,
  type StoreChange,
} from "@campaign-forge/core";
import type { LoadedModule } from "@campaign-forge/module-sdk";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import * as Y from "yjs";
import { loadModuleById } from "../modules/registry";

/** Per-map change counters so list hooks can hand React a stable snapshot. */
export type VersionKey = MapName | "meta" | "*" | "docs";

export class StoreVersions {
  readonly #versions = new Map<VersionKey, number>();
  readonly #listeners = new Set<() => void>();
  readonly #unsubscribe: () => void;

  constructor(store: CampaignStore) {
    this.#unsubscribe = store.subscribe((change: StoreChange) => {
      this.#versions.set(change.map, (this.#versions.get(change.map) ?? 0) + 1);
      this.#versions.set("*", (this.#versions.get("*") ?? 0) + 1);
      this.#emit();
    });
  }

  /** Rich-text bodies changed (loaded from storage or edited). */
  bumpDocs(): void {
    this.#versions.set("docs", (this.#versions.get("docs") ?? 0) + 1);
    this.#emit();
  }

  #emit(): void {
    for (const l of [...this.#listeners]) l();
  }

  get(map: VersionKey): number {
    return this.#versions.get(map) ?? 0;
  }

  subscribe(listener: () => void): () => void {
    this.#listeners.add(listener);
    return () => {
      this.#listeners.delete(listener);
    };
  }

  dispose(): void {
    this.#unsubscribe();
    this.#listeners.clear();
  }
}

export interface CampaignContextValue {
  campaignId: Id;
  store: CampaignStore;
  module: LoadedModule;
  registry: RichTextRegistry;
  assets: AssetStore;
  refIndex: RefIndex;
  search: SearchIndex;
  persistence: PersistenceHandle;
  versions: StoreVersions;
  /** Resolves once the rich-text doc has loaded its stored content. */
  whenDocSynced(docId: Id): Promise<void>;
  close(): void;
}

export class CampaignNotFoundError extends Error {
  constructor(id: string) {
    super(`No campaign with id ${id} is stored on this device.`);
    this.name = "CampaignNotFoundError";
  }
}

/** Open everything for one campaign. The caller owns the result and must `close()` it. */
export async function openCampaign(campaignId: Id): Promise<CampaignContextValue> {
  const doc = new Y.Doc();
  const store = CampaignStore.fromDoc(doc);
  const registry = new RichTextRegistry();
  const persistence = openPersistence(store, { name: campaignDbName(campaignId), registry });
  let module: LoadedModule;
  let assets: AssetStore | undefined;
  let refIndex: RefIndex | undefined;
  let search: SearchIndex | undefined;
  let versions: StoreVersions | undefined;
  let unsubIndex: (() => void) | undefined;
  let unsubDocs: (() => void) | undefined;
  const close = () => {
    if (unsubIndex) unsubIndex();
    if (unsubDocs) unsubDocs();
    search?.detach();
    refIndex?.dispose();
    versions?.dispose();
    persistence.destroy();
    registry.closeAll();
    store.destroy();
    void assets?.close();
    doc.destroy();
  };
  try {
    await persistence.whenSynced;
    const meta = store.meta();
    if (!meta.id || meta.id !== campaignId) throw new CampaignNotFoundError(campaignId);
    module = await loadModuleById(meta.moduleId);
    assets = new AssetStore(campaignId);
    refIndex = new RefIndex(registry);
    search = new SearchIndex();
    search.attach(store);
    const v = new StoreVersions(store);
    versions = v;
    unsubDocs = watchDocs(registry, () => v.bumpDocs());
    refIndex.indexAll(store);
    // keep the device's campaign index fresh (name and last-updated)
    let timer: ReturnType<typeof setTimeout> | undefined;
    unsubIndex = store.subscribe(() => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        const m = store.meta();
        if (m.id) void registerCampaign({ id: m.id, name: m.name, moduleId: m.moduleId, updated: new Date().toISOString() });
      }, 500);
    });
  } catch (err) {
    close();
    throw err;
  }
  return {
    campaignId,
    store,
    module,
    registry,
    assets,
    refIndex,
    search,
    persistence,
    versions,
    whenDocSynced: (id) => persistence.whenDocSynced(id),
    close,
  };
}

/** Call `onChange` (debounced) whenever any rich-text doc opened through the registry changes. */
function watchDocs(registry: RichTextRegistry, onChange: () => void): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const bump = () => {
    if (timer) return;
    timer = setTimeout(() => {
      timer = undefined;
      onChange();
    }, 150);
  };
  const attached = new Map<Id, { doc: Y.Doc; handler: () => void }>();
  const attach = (id: Id, doc: Y.Doc) => {
    if (attached.has(id)) return;
    const handler = () => bump();
    doc.on("update", handler);
    attached.set(id, { doc, handler });
  };
  for (const id of registry.ids()) {
    const doc = registry.peek(id);
    if (doc) attach(id, doc);
  }
  const offOpen = registry.onOpen(attach);
  const offClose = registry.onClose((id) => {
    const a = attached.get(id);
    if (a) a.doc.off("update", a.handler);
    attached.delete(id);
  });
  return () => {
    offOpen();
    offClose();
    if (timer) clearTimeout(timer);
    for (const a of attached.values()) a.doc.off("update", a.handler);
    attached.clear();
  };
}

export const CampaignContext = createContext<CampaignContextValue | undefined>(undefined);

export type CampaignLoadState = { status: "loading" } | { status: "error"; error: unknown } | { status: "ready"; value: CampaignContextValue };

export interface CampaignProviderProps {
  campaignId: Id;
  children: ReactNode;
  /** Rendered while the campaign opens. */
  loading?: ReactNode;
  /** Rendered when opening fails (campaign missing, module conformance error...). */
  renderError?: (error: unknown, retry: () => void) => ReactNode;
}

export function CampaignProvider({ campaignId, children, loading, renderError }: CampaignProviderProps) {
  const [state, setState] = useState<CampaignLoadState>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    let opened: CampaignContextValue | undefined;
    setState({ status: "loading" });
    openCampaign(campaignId)
      .then((value) => {
        if (cancelled) {
          value.close();
          return;
        }
        opened = value;
        setState({ status: "ready", value });
      })
      .catch((error: unknown) => {
        if (!cancelled) setState({ status: "error", error });
      });
    return () => {
      cancelled = true;
      opened?.close();
    };
  }, [campaignId, attempt]);

  if (state.status === "loading") return <>{loading ?? null}</>;
  if (state.status === "error") return <>{renderError ? renderError(state.error, () => setAttempt((a) => a + 1)) : String(state.error)}</>;
  return <CampaignContext.Provider value={state.value}>{children}</CampaignContext.Provider>;
}

export function useCampaign(): CampaignContextValue {
  const ctx = useContext(CampaignContext);
  if (!ctx) throw new Error("useCampaign must be used inside a CampaignProvider");
  return ctx;
}

export function useOptionalCampaign(): CampaignContextValue | undefined {
  return useContext(CampaignContext);
}
