/** Every tracker of the module's current mode, bound to its state (the session's, or the campaign's for campaign scope) and to the app's effect, log and roll handlers. */
import { getWorldMinutes, type Entity, type Id, type SiteMap } from "@campaign-forge/core";
import { createRng, lifecycleState, type Effect, type Prompt, type TrackerDef } from "@campaign-forge/module-sdk";
import { useMemo } from "react";
import { TrackerHost, type TrackerEntity } from "../../components/ui";
import { useCampaign, useList, useMeta } from "../../state/hooks";
import { playerCharacters, setClockState, setTrackerStateOf, trackerStateOf } from "../../state/tableActions";
import { useEntities, useSessionTrackerState, useTrackerEntities } from "./hooks";

export interface TrackerHandlers {
  onEffects: (effects: Effect[]) => void;
  onRollOperation: (operationId: string, entityId?: string, extra?: Record<string, unknown>) => void;
  onLog: (trackerId: string, text: string) => void;
  /** Prompts raised outside an effect batch (e.g. by in-world time moving on). */
  onPrompts?: (prompts: Prompt[]) => void;
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
  /** Witnesses for tracker events; defaults to the tracker's character entities. */
  witnesses?: Array<{ id: string; name: string }>;
}

export function BoundTracker({ sessionId, def, entities, map, readonly, className, witnesses, onEffects, onRollOperation, onLog, onPrompts }: BoundTrackerProps) {
  const ctx = useCampaign();
  useMeta(); // re-render when the campaign record (campaign-scoped state, world time) changes
  const ts = useSessionTrackerState(sessionId);
  const logLength = ts?.log.length ?? 0;
  const rng = useMemo(() => createRng(`${sessionId}:${def.id}:${logLength}`), [sessionId, def.id, logLength]);
  const campaignScope = def.scope === "campaign";
  const state = campaignScope ? trackerStateOf(ctx, sessionId, def) : ts?.state[def.id];
  const worldMinutes = getWorldMinutes(ctx.store);
  return (
    <TrackerHost
      def={def}
      state={state}
      onChange={(next) => {
        if (readonly) return;
        if (def.kind === "clock") {
          const prompts = setClockState(ctx, sessionId, def, next);
          if (prompts.length) onPrompts?.(prompts);
        } else setTrackerStateOf(ctx, sessionId, def, next);
      }}
      entities={entities}
      onEffects={onEffects}
      onLog={(text) => onLog(def.id, text)}
      onRollOperation={onRollOperation}
      rng={rng}
      worldMinutes={worldMinutes}
      {...(witnesses ? { witnesses } : {})}
      {...(map ? { zones: map.zones, borders: map.borders } : {})}
      readonly={readonly}
      className={className}
    />
  );
}

/** Ids of the subjects and spawned entities a life-cycle tracker's state refers to. */
function lifecycleEntityIds(state: unknown): Id[] {
  return lifecycleState(state).instances.flatMap((i) => [i.host, ...(i.creature ? [i.creature] : [])]);
}

function LifecycleBound(props: BoundTrackerProps & { everyone: Entity[] }) {
  const ctx = useCampaign();
  useMeta();
  const ids = lifecycleEntityIds(trackerStateOf(ctx, props.sessionId, props.def));
  const referenced = useEntities(ids);
  const merged = useMemo(() => {
    const seen = new Set(props.everyone.map((e) => e.id));
    return [...props.everyone, ...referenced.filter((e) => !seen.has(e.id))];
  }, [props.everyone, referenced]);
  const entities = useTrackerEntities(merged);
  // Same witnesses as the clock-driven path: the campaign's player characters.
  const pcs = useList("entities");
  const witnesses = useMemo(() => playerCharacters(ctx).map((e) => ({ id: e.id, name: e.name })), [ctx, pcs]);
  return <BoundTracker {...props} entities={entities} witnesses={witnesses} />;
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
      {trackers.map((def) =>
        def.kind === "lifecycle" ? (
          <LifecycleBound key={def.id} sessionId={sessionId} def={def} entities={allEntities} everyone={everyone} {...handlers} />
        ) : (
          <BoundTracker key={def.id} sessionId={sessionId} def={def} entities={def.scope === "encounter" ? allEntities : pcEntities} map={def.kind === "stealth" ? map : undefined} {...handlers} />
        ),
      )}
    </div>
  );
}
