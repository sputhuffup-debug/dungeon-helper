/** `/c/$campaignId/sessions`: running, planned and finished sessions; plan the next one or start one. */
import type { Id, Session } from "@campaign-forge/core";
import { Link, useNavigate } from "@tanstack/react-router";
import { useMemo } from "react";
import { Badge, Button, Card, EmptyState } from "../../components/ui";
import { formatDate } from "../../lib/format";
import { useCampaign, useList } from "../../state/hooks";
import { plannedScenesOf, planNextSession, sortSessions, startPlannedSession } from "../../state/tableActions";
import { ChecklistBadge, useCampaignChecklist } from "./SessionChecklist";

const TONE = { planned: "warning", running: "success", done: "muted" } as const;

export function SessionsPage() {
  const ctx = useCampaign();
  const navigate = useNavigate();
  const campaignId = ctx.campaignId;
  const sessions = useList("sessions");
  const checklist = useCampaignChecklist();
  const sorted = useMemo(() => sortSessions(sessions), [sessions]);
  const running = sorted.filter((s) => s.status === "running");
  const planned = sorted.filter((s) => s.status === "planned");
  const done = [...sorted.filter((s) => s.status === "done")].reverse();

  const openSession = (sessionId: Id) => void navigate({ to: "/c/$campaignId/sessions/$sessionId", params: { campaignId, sessionId } });
  const openTable = (sessionId: Id) => void navigate({ to: "/c/$campaignId/table/$sessionId", params: { campaignId, sessionId } });
  const onPlan = () => openSession(planNextSession(ctx).id);
  const onStart = (s: Session) => {
    startPlannedSession(ctx, s.id);
    openTable(s.id);
  };

  const row = (s: Session) => (
    <li key={s.id} className="app-list__row app-session-row" data-session={s.id} data-status={s.status}>
      <span className="app-session-row__num">{s.number}</span>
      <Link to="/c/$campaignId/sessions/$sessionId" params={{ campaignId, sessionId: s.id }} className="app-link-strong app-grow">
        {s.title || `Session ${s.number}`}
      </Link>
      <span className="cf-muted">{formatDate(s.date)}</span>
      <Badge tone={TONE[s.status]}>{s.status}</Badge>
      <ChecklistBadge session={s} items={checklist} />
      {s.status === "planned" && (
        <span className="cf-muted">
          {plannedScenesOf(s).length} scene{plannedScenesOf(s).length === 1 ? "" : "s"} · {s.nextPlan.length} plan item{s.nextPlan.length === 1 ? "" : "s"}
        </span>
      )}
      {s.status === "done" && <span className="cf-muted">{s.scenesRun.length} scenes run</span>}
      {s.status === "planned" && (
        <Button size="sm" variant="primary" onClick={() => onStart(s)} disabled={running.length > 0} title={running.length ? "Another session is running" : undefined} aria-label={`Start session ${s.number}`}>
          Start
        </Button>
      )}
      {s.status === "running" && (
        <Button size="sm" variant="primary" onClick={() => openTable(s.id)}>
          Table mode
        </Button>
      )}
    </li>
  );

  return (
    <div className="app-page" data-testid="sessions-page">
      <header className="app-page__header">
        <h1 className="app-title">Sessions</h1>
        <Button variant="primary" onClick={onPlan} data-testid="plan-next-session">
          Plan next session
        </Button>
      </header>
      {sorted.length === 0 ? (
        <EmptyState title="No sessions yet" text="Plan the first one: pick the scenes to run and what to remember." action={<Button variant="primary" onClick={onPlan}>Plan a session</Button>} />
      ) : (
        <div className="app-stack">
          {running.length > 0 && (
            <Card title="Running">
              <ul className="app-list">{running.map(row)}</ul>
            </Card>
          )}
          <Card title="Planned">{planned.length ? <ul className="app-list">{planned.map(row)}</ul> : <p className="cf-muted">Nothing planned.</p>}</Card>
          <Card title="Done">{done.length ? <ul className="app-list">{done.map(row)}</ul> : <p className="cf-muted">No finished sessions yet.</p>}</Card>
        </div>
      )}
    </div>
  );
}
