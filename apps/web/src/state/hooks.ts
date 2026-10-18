/**
 * React hooks over the campaign store. Snapshots are the store's cached
 * record objects, so `useSyncExternalStore` sees a stable reference until
 * the record changes and never tears.
 */
import type { CampaignMeta, Entity, Id, MapName, RecordOf } from "@campaign-forge/core";
import { computeFields, type EntityTypeDef } from "@campaign-forge/module-sdk";
import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { useCampaign } from "./CampaignProvider";

export { useCampaign, useOptionalCampaign } from "./CampaignProvider";

/** A counter that changes whenever `map` changes ("*" for any map). */
export function useMapVersion(map: MapName | "meta" | "*"): number {
  const { versions } = useCampaign();
  const subscribe = useCallback((cb: () => void) => versions.subscribe(cb), [versions]);
  const get = useCallback(() => versions.get(map), [versions, map]);
  return useSyncExternalStore(subscribe, get, get);
}

export function useRecord<M extends MapName>(map: M, id: Id | undefined): RecordOf<M> | undefined {
  const { store } = useCampaign();
  const subscribe = useCallback(
    (cb: () => void) => (id === undefined ? () => undefined : store.subscribeRecord(map, id, () => cb())),
    [store, map, id],
  );
  const get = useCallback(() => (id === undefined ? undefined : store.get(map, id)), [store, map, id]);
  return useSyncExternalStore(subscribe, get, get);
}

/**
 * Every record of `map`, optionally filtered. The list is recomputed only
 * when the map changes (or the filter identity changes).
 */
export function useList<M extends MapName>(map: M, filter?: (record: RecordOf<M>) => boolean): RecordOf<M>[] {
  const { store } = useCampaign();
  const version = useMapVersion(map);
  return useMemo(() => {
    const list = store.list(map);
    return filter ? list.filter(filter) : list;
    // version drives recomputation
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store, map, filter, version]);
}

export function useMeta(): CampaignMeta {
  const { store } = useCampaign();
  const subscribe = useCallback(
    (cb: () => void) =>
      store.subscribe((change) => {
        if (change.map === "meta") cb();
      }),
    [store],
  );
  const get = useCallback(() => store.meta(), [store]);
  return useSyncExternalStore(subscribe, get, get);
}

export function useEntityType(typeId: string | undefined): EntityTypeDef | undefined {
  const { module } = useCampaign();
  return typeId === undefined ? undefined : module.entityType(typeId);
}

/** Computed fields of an entity (JSONLogic over its fields); never stored. */
export function useComputed(entity: Pick<Entity, "type" | "fields"> | undefined): Record<string, unknown> {
  const def = useEntityType(entity?.type);
  return useMemo(() => {
    if (!def || !entity) return {};
    try {
      return computeFields(def, entity.fields);
    } catch {
      return {};
    }
  }, [def, entity]);
}

function subscribeOnline(cb: () => void): () => void {
  window.addEventListener("online", cb);
  window.addEventListener("offline", cb);
  return () => {
    window.removeEventListener("online", cb);
    window.removeEventListener("offline", cb);
  };
}
const getOnline = () => (typeof navigator === "undefined" ? true : navigator.onLine);

/** True when the browser reports no network. */
export function useOfflineStatus(): { offline: boolean; online: boolean } {
  const online = useSyncExternalStore(subscribeOnline, getOnline, () => true);
  return { offline: !online, online };
}

/** An object URL for a stored asset, revoked when the component unmounts or the id changes. */
export function useAssetUrl(assetId: Id | undefined): string | undefined {
  const { assets } = useCampaign();
  const [url, setUrl] = useState<string | undefined>(undefined);
  useEffect(() => {
    if (!assetId) {
      setUrl(undefined);
      return;
    }
    let active = true;
    let created: string | undefined;
    assets
      .get(assetId)
      .then((blob) => {
        if (!active || !blob) return;
        created = URL.createObjectURL(blob);
        setUrl(created);
      })
      .catch(() => undefined);
    return () => {
      active = false;
      if (created) URL.revokeObjectURL(created);
      setUrl(undefined);
    };
  }, [assets, assetId]);
  return url;
}

/** Entity name by id, live. */
export function useEntityName(id: Id | undefined): string | undefined {
  const entity = useRecord("entities", id);
  return entity?.name;
}

/** A stable name resolver that reads the store directly (for renderers). */
export function useNameResolver(): (id: Id) => string {
  const { store } = useCampaign();
  return useCallback((id: Id) => store.get("entities", id)?.name ?? id, [store]);
}
