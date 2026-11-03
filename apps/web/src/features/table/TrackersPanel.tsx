/** Every tracker of the module's current mode, bound to its state (the session's, or the campaign's for campaign scope) and to the app's effect, log and roll handlers. */
import { getWorldMinutes, type Entity, type Id, type SiteMap } from "@campaign-forge/core";
import { createRng, lifecycleState, type Effect, type Prompt, type TrackerDef } from "@campaign-forge/module-sdk";
import { useMemo } from "react";
import { TrackerHost, clockState, clockUnits, pushToast, type ClockUnit, type TrackerEntity } from "../../components/ui";
import { errorMessage } from "../../lib/format";
import { useCampaign, useList, useMeta } from "../../state/hooks";
import { advanceTableClock, playerCharacters, setClockState, setTrackerStateOf, trackerStateOf } from "../../state/tableActions";
import { useEntities, useSessionTrackerState, useTrackerEntities } from "./hooks";
import { FundsReadout } from "../ship/FundsReadout";
import "../ship/ship.css";

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

export interface TableClock {
  def: TrackerDef;
  units: ClockUnit[];
  counters: Record<string, number>;
  /** The smallest unit: the table's one round counter. */
  round: ClockUnit;
  /** A unit's counter, or undefined when the clock has no such unit. */
  value: (unitId: string) => number | undefined;
  /** Advance one unit (logged); prompts raised by in-world time go to `onPrompts`. */
  advance: (unitId: string, onPrompts?: (prompts: Prompt[]) => void) => void;
}

/**
 * The mode's clock tracker in this session: the single source of the round
 * (its smallest unit) and the stretch. The hunt and the initiative tracker
 * read it and advance it; none keeps a round of its own.
 */
export function useTableClock(sessionId: Id): TableClock | undefined {
  const ctx = useCampaign();
  const def = useModeTrackers().find((t) => t.kind === "clock");
  const ts = useSessionTrackerState(sessionId);
  const raw = def ? ts?.state[def.id] : undefined;
  return useMemo(() => {
    if (!def) return undefined;
    const units = clockUnits(def.config);
    const counters = clockState(raw, units).counters;
    return {
      def,
      units,
      counters,
      round: units[0]!,
      value: (id) => (units.some((u) => u.id === id) ? (counters[id] ?? 0) : undefined),
      advance: (unitId, onPrompts) => {
        try {
          const prompts = advanceTableClock(ctx, sessionId, def, unitId);
          if (prompts.length) onPrompts?.(prompts);
        } catch (e) {
          pushToast(errorMessage(e), { tone: "danger" });
        }
      },
    };
  }, [ctx, sessionId, def, raw]);
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
  // the initiative tracker reads and advances the table clock's round (one round counter)
  const clock = useTableClock(sessionId);
  const round = def.kind === "initiative" && clock ? { value: clock.counters[clock.round.id] ?? 0, label: clock.round.name, advance: () => clock.advance(clock.round.id, onPrompts) } : undefined;
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
      {...(round ? { round } : {})}
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
      <FundsReadout />
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
