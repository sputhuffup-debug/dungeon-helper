/** Live reads for the table surfaces (session, tracker state, PCs, scene order). */
import type { Entity, Id, Scene, TrackerState } from "@campaign-forge/core";
import type { TrackerEntity } from "@campaign-forge/ui";
import { useEffect, useMemo, useState } from "react";
import { useCampaign, useList, useMapVersion, useRecord } from "../../state/hooks";
import { computedOf, sessionSceneOrder, tableStateOf, type TableState } from "../../state/tableActions";
import { attachCrossTabSync } from "./crossTab";

/** The session's tracker state: the live record, else the latest archived one. */
export function useSessionTrackerState(sessionId: Id): TrackerState | undefined {
  const all = useList("trackerState");
  return useMemo(() => {
    const mine = all.filter((t) => t.session === sessionId);
    return mine.find((t) => !t.archived) ?? [...mine].sort((a, b) => b.updated.localeCompare(a.updated))[0];
  }, [all, sessionId]);
}

export function useTableState(sessionId: Id): TableState {
  const ts = useSessionTrackerState(sessionId);
  return useMemo(() => tableStateOf(ts?.state), [ts]);
}

/** Player characters of the campaign, by name. */
export function usePlayerCharacters(): Entity[] {
  const { module } = useCampaign();
  const filter = useMemo(() => (e: Entity) => module.entityType(e.type)?.kind === "character" && (e.fields.isPC === true || !!e.ownerMemberId), [module]);
  const list = useList("entities", filter);
  return useMemo(() => [...list].sort((a, b) => a.name.localeCompare(b.name)), [list]);
}

/** Entities in the shape trackers take (fields plus computed values). */
export function useTrackerEntities(entities: Entity[]): TrackerEntity[] {
  const { module } = useCampaign();
  return useMemo(
    () =>
      entities.map((e) => {
        const t: TrackerEntity = { id: e.id, name: e.name, type: e.type, fields: e.fields, computed: computedOf(module, e), conditions: (e.conditions ?? []).map((c) => c.id) };
        const kind = module.entityType(e.type)?.kind;
        if (kind) t.kind = kind;
        if (e.provenance?.preset) t.preset = e.provenance.preset;
        return t;
      }),
    [entities, module],
  );
}

/** Scenes table mode steps through (planned scenes, else adventure order), live. */
export function useSessionScenes(sessionId: Id): Scene[] {
  const { store } = useCampaign();
  const session = useRecord("sessions", sessionId);
  const v1 = useMapVersion("scenes");
  const v2 = useMapVersion("acts");
  const v3 = useMapVersion("adventures");
  return useMemo(
    () => (session ? sessionSceneOrder(store, session) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [store, session, v1, v2, v3],
  );
}

/** Entities by id, live (missing ids are dropped). */
export function useEntities(ids: Id[]): Entity[] {
  const all = useList("entities");
  const key = ids.join(",");
  return useMemo(() => {
    const byId = new Map(all.map((e) => [e.id, e]));
    return ids.map((id) => byId.get(id)).filter((e): e is Entity => !!e);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [all, key]);
}

/** Keep this tab's campaign in step with other tabs of the same browser (the player screen). */
export function useCrossTabSync(): void {
  const { campaignId, store, registry } = useCampaign();
  useEffect(() => attachCrossTabSync(campaignId, store.doc, registry), [campaignId, store, registry]);
}

/** Re-render every `ms` milliseconds (for the real-time timer). */
export function useTick(ms: number, active = true): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(t);
  }, [ms, active]);
  return now;
}

export function formatDuration(ms: number): string {
  const total = Math.floor(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}
