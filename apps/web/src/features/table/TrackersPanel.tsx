/** Every tracker of the module's current mode, bound to the session's tracker state and to the app's effect, log and roll handlers. */
import { updateTrackerState, type Entity, type Id, type SiteMap } from "@campaign-forge/core";
import { createRng, type Effect, type TrackerDef } from "@campaign-forge/module-sdk";
import { useMemo } from "react";
import { TrackerHost, type TrackerEntity } from "../../components/ui";
import { useCampaign, useMeta } from "../../state/hooks";
import { useSessionTrackerState, useTrackerEntities } from "./hooks";

export interface TrackerHandlers {
  onEffects: (effects: Effect[]) => void;
  onRollOperation: (operationId: string, entityId?: string, extra?: Record<string, unknown>) => void;
  onLog: (trackerId: string, text: string) => void;
}

/** The module's trackers for the campaign's play mode. */
export function useModeTrackers(): TrackerDef[] {
  const { module } = useCampaign();
  const meta = useMeta();
  return useMemo(() => module.forMode(meta.mode).trackers, [module, meta.mode]);
}

export interface BoundTrackerProps extends TrackerHandlers {
  sessionId: Id;
  def: TrackerDef;
  entities: TrackerEntity[];
  map?: SiteMap;
  readonly?: boolean;
  className?: string;
}

export function BoundTracker({ sessionId, def, entities, map, readonly, className, onEffects, onRollOperation, onLog }: BoundTrackerProps) {
  const ctx = useCampaign();
  const ts = useSessionTrackerState(sessionId);
  const logLength = ts?.log.length ?? 0;
  const rng = useMemo(() => createRng(`${sessionId}:${def.id}:${logLength}`), [sessionId, def.id, logLength]);
  return (
    <TrackerHost
      def={def}
      state={ts?.state[def.id]}
      onChange={(next) => {
        if (readonly) return;
        updateTrackerState(ctx.store, sessionId, def.id, next);
      }}
      entities={entities}
      onEffects={onEffects}
      onLog={(text) => onLog(def.id, text)}
      onRollOperation={onRollOperation}
      rng={rng}
      {...(map ? { zones: map.zones, borders: map.borders } : {})}
      readonly={readonly}
      className={className}
    />
  );
}

export function TrackersPanel({ sessionId, trackers, pcs, participants, map, handlers }: { sessionId: Id; trackers: TrackerDef[]; pcs: Entity[]; participants: Entity[]; map?: SiteMap; handlers: TrackerHandlers }) {
  const pcEntities = useTrackerEntities(pcs);
  const everyone = useMemo(() => {
    const seen = new Set(pcs.map((p) => p.id));
    return [...pcs, ...participants.filter((p) => !seen.has(p.id))];
  }, [pcs, participants]);
  const allEntities = useTrackerEntities(everyone);
  return (
    <div className="app-stack app-table__trackers" data-testid="trackers">
      {trackers.map((def) => (
        <BoundTracker key={def.id} sessionId={sessionId} def={def} entities={def.scope === "encounter" ? allEntities : pcEntities} map={def.kind === "stealth" ? map : undefined} {...handlers} />
      ))}
    </div>
  );
}
