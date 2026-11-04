/**
 * Wrap-up step "Close the job" (a module's adventure sources, e.g. jobs):
 * for each record the session ran, or one still open, its outcome (done,
 * failed, carried over), its payout (with undo), its adventure marked done,
 * the in-world days its trip took (the module's `trip`), and the way into
 * the module's between-jobs procedure with the record picked. Nothing here
 * knows what a job is: labels come from the module.
 */
import type { Entity, Id } from "@campaign-forge/core";
import { addDaysToDate, type PlayModeId } from "@campaign-forge/module-sdk";
import { Link } from "@tanstack/react-router";
import { useMemo } from "react";
import { Badge, Button, Card, PageRef } from "../../components/ui";
import { useCampaign, useList, useMeta, useRecord } from "../../state/hooks";
import { crewShipDefOf } from "../../state/shipActions";
import { closeSource, moveDateForTrip, sessionSources, sessionTravelDays, setAdventureDone, sourceNoun, sourceTrip, undoTripMove, type ClosedRecord, type SessionSource } from "../../state/sourceActions";
import { wrapUpOf } from "../../state/tableActions";
import { PayoutButton } from "../ship/PayoutButton";
import type { CampaignContextValue } from "../../state/CampaignProvider";

type Ctx = Pick<CampaignContextValue, "store" | "module">;

/** The step's label: "Close the job", "Close the jobs", or undefined when the session ran none. */
export function closeStepLabel(ctx: Ctx, sources: SessionSource[]): string | undefined {
  if (sources.length === 0) return undefined;
  const nouns = [...new Set(sources.map((s) => sourceNoun(ctx, s.def)))];
  return nouns.length === 1 ? `Close the ${nouns[0]}${sources.length > 1 ? "s" : ""}` : "Close what you ran";
}

/** The between-jobs procedure with this record picked (its input that takes the record's type), when the module has one. */
export function betweenJobsFor(ctx: Ctx, mode: PlayModeId, entity: Pick<Entity, "id" | "type">): { procedureId: string; name: string; pick?: string } | undefined {
  const id = crewShipDefOf(ctx.module, mode)?.betweenJobs ?? ctx.module.module.arcs?.betweenJobs;
  const procedure = id ? ctx.module.procedure(id) : undefined;
  if (!procedure) return undefined;
  const props = ((procedure.inputs as { properties?: Record<string, { "x-entity"?: { types?: string[] } }> } | undefined)?.properties ?? {}) as Record<string, { "x-entity"?: { types?: string[] } }>;
  const key = Object.keys(props).find((k) => props[k]?.["x-entity"]?.types?.includes(entity.type));
  return { procedureId: procedure.id, name: procedure.name, ...(key ? { pick: `${key}:${entity.id}` } : {}) };
}

/** The records this session ran, fixed when the wrap-up opens (closing one keeps it listed). */
export function useSessionSources(sessionId: Id): SessionSource[] {
  const ctx = useCampaign();
  const meta = useMeta();
  const entities = useList("entities");
  const adventures = useList("adventures");
  const session = useRecord("sessions", sessionId);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const ids = useMemo(() => sessionSources(ctx, sessionId, meta.mode).map((s) => s.entity.id), [ctx, sessionId, meta.mode]);
  return useMemo(() => {
    const live = sessionSources(ctx, sessionId, meta.mode);
    return ids.map((id) => live.find((s) => s.entity.id === id)).filter((s): s is SessionSource => !!s);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ids, entities, adventures, session]);
}

export function CloseSourcesStep({ sessionId, sources }: { sessionId: Id; sources: SessionSource[] }) {
  return (
    <div className="app-stack" data-testid="close-sources">
      {sources.map((s) => (
        <CloseSourceCard key={s.entity.id} sessionId={sessionId} source={s} />
      ))}
    </div>
  );
}

/** The trip the record took, as days for the in-world date: move it on (with undo), unless travel this session already did. */
function TripRow({ sessionId, source }: { sessionId: Id; source: SessionSource }) {
  const ctx = useCampaign();
  const meta = useMeta();
  useList("travel");
  const session = useRecord("sessions", sessionId);
  const trip = sourceTrip(ctx, source.def, source.entity);
  if (!trip || !meta.currentDate) return null;
  const moved = (wrapUpOf(session) as ClosedRecord).trips?.[source.entity.id];
  const travelled = sessionTravelDays(ctx, sessionId);
  return (
    <div className="app-row app-wrapup__trip" data-testid="close-trip">
      {moved ? (
        <>
          <span>
            In-world date moved {moved.days} day{moved.days === 1 ? "" : "s"}: {moved.from} → <strong>{moved.to}</strong>.
          </span>
          <Button size="sm" variant="ghost" onClick={() => undoTripMove(ctx, sessionId, source.entity.id)} data-testid="close-trip-undo">
            Undo
          </Button>
        </>
      ) : (
        <>
          <span className="app-grow">
            The trip: {trip.text} <PageRef page={trip.page} />
            {travelled > 0 ? ` The travel planner already moved the date ${travelled} day${travelled === 1 ? "" : "s"} this session.` : ""}
          </span>
          <Button size="sm" variant={travelled > 0 ? "ghost" : "default"} onClick={() => moveDateForTrip(ctx, sessionId, source.entity.id, trip.days)} data-testid="close-trip-move">
            Move the date {trip.days} days ({meta.currentDate} → {addDays(ctx, meta.currentDate, trip.days)})
          </Button>
        </>
      )}
    </div>
  );
}

function addDays(ctx: Ctx, date: string, days: number): string {
  return addDaysToDate(ctx.module.module.calendar, date, days);
}

function CloseSourceCard({ sessionId, source }: { sessionId: Id; source: SessionSource }) {
  const ctx = useCampaign();
  const meta = useMeta();
  const { entity, def, adventure, outcome } = source;
  const noun = sourceNoun(ctx, def);
  const between = betweenJobsFor(ctx, meta.mode, entity);
  const status = (def.outcomes ?? []).find((o) => o.id === outcome);
  return (
    <Card
      title={
        <span className="app-row">
          <Link to="/c/$campaignId/entities/$entityId" params={{ campaignId: ctx.campaignId, entityId: entity.id }} className="app-link-strong">
            {entity.name}
          </Link>
          {status ? <Badge tone={status.tone ?? "accent"}>{status.label}</Badge> : source.open ? <Badge tone="warning">open</Badge> : null}
        </span>
      }
      subtitle={`How did the ${noun} end? Pick one; it is saved on the ${noun} now.`}
      data-testid="close-source"
      data-entity={entity.id}
    >
      <div className="app-stack">
        <div className="app-row" role="group" aria-label={`Outcome of ${entity.name}`}>
          {(def.outcomes ?? []).map((o) => (
            <Button
              key={o.id}
              aria-pressed={outcome === o.id}
              variant={outcome === o.id ? "primary" : "default"}
              onClick={() => {
                closeSource(ctx, sessionId, entity.id, o);
                if (adventure) setAdventureDone(ctx, adventure.id, !!o.closes);
              }}
              data-testid={`close-outcome-${o.id}`}
            >
              {o.label}
            </Button>
          ))}
        </div>
        <PayoutButton entity={entity} />
        {status?.closes && <TripRow sessionId={sessionId} source={source} />}
        {adventure && (
          <label className="app-toggle" data-testid="close-adventure">
            <input type="checkbox" className="cf-checkbox" checked={adventure.status === "done"} onChange={(e) => setAdventureDone(ctx, adventure.id, e.target.checked)} />
            <span>
              Adventure{" "}
              <Link to="/c/$campaignId/adventures/$adventureId" params={{ campaignId: ctx.campaignId, adventureId: adventure.id }} search={{}} className="app-link-strong">
                {adventure.title}
              </Link>{" "}
              is done (the table stops offering its scenes)
            </span>
          </label>
        )}
        {between && (
          <div className="app-row">
            <Link
              to="/c/$campaignId/generate/$procedureId"
              params={{ campaignId: ctx.campaignId, procedureId: between.procedureId }}
              search={between.pick ? { pick: between.pick } : {}}
              className="cf-btn"
              data-testid="close-between-jobs"
            >
              Run {between.name.toLowerCase()} for {entity.name}
            </Link>
            <PageRef page={ctx.module.procedure(between.procedureId)?.page} />
            <span className="cf-muted app-small">Finishing the session takes you there too.</span>
          </div>
        )}
      </div>
    </Card>
  );
}
