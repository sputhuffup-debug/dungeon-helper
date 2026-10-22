/**
 * `/c/$campaignId/sessions/$sessionId`: plan a session (title, date,
 * attendees, scenes, plan), start it, wrap it up, or read what happened.
 */
import { type Id, type Scene, type Session } from "@campaign-forge/core";
import { Link, useNavigate, useParams } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { lazyView } from "../../components/lazyView";
import { useRecordLinks } from "../../components/EntityLinkContext";
import { Badge, Button, Card, EmptyState, IconButton } from "../../components/ui";
import { RichTextView } from "../../editor";
import { formatDate } from "../../lib/format";
import { useCampaign, useList, useMapVersion, useMeta, useRecord } from "../../state/hooks";
import {
  plannedScenesOf,
  scenesInAdventureOrder,
  sessionLabel,
  setPlannedScenes,
  startPlannedSession,
  tableStateOf,
  updateSession,
  wrapUpOf,
} from "../../state/tableActions";
import { useSessionTrackerState } from "../table/hooks";
import { ChecklistSummary, SessionChecklist } from "./SessionChecklist";

// The end-of-session wrap-up loads when the GM ends a session.
const WrapUpWizard = lazyView(() => import("./WrapUp").then((m) => m.WrapUpWizard), { what: "the wrap-up" });
// "Share with players" loads when the GM opens it.
const ShareDialog = lazyView(() => import("../share/ShareDialog").then((m) => m.ShareDialog), { what: "sharing", loading: () => null });

const TONE = { planned: "warning", running: "success", done: "muted" } as const;

export function SessionPage() {
  const { sessionId } = useParams({ from: "/c/$campaignId/sessions/$sessionId" });
  const ctx = useCampaign();
  const navigate = useNavigate();
  const campaignId = ctx.campaignId;
  const session = useRecord("sessions", sessionId);
  const [wrapping, setWrapping] = useState(false);
  const [sharing, setSharing] = useState(false);
  const shareScene = useShareScene(session);

  if (!session) {
    return (
      <div className="app-page">
        <EmptyState title="Session not found" action={<Link to="/c/$campaignId/sessions" params={{ campaignId }} className="cf-btn">All sessions</Link>} />
      </div>
    );
  }

  if (wrapping && session.status === "running") {
    return (
      <div className="app-page">
        <WrapUpWizard sessionId={sessionId} onCancel={() => setWrapping(false)} onDone={() => void navigate({ to: "/c/$campaignId/home", params: { campaignId } })} />
      </div>
    );
  }

  const openTable = () => void navigate({ to: "/c/$campaignId/table/$sessionId", params: { campaignId, sessionId } });

  return (
    <div className="app-page" data-testid="session-page" data-status={session.status}>
      <header className="app-page__header">
        <div className="app-stack app-grow">
          <Link to="/c/$campaignId/sessions" params={{ campaignId }} className="cf-muted">
            ← Sessions
          </Link>
          <div className="app-row">
            <span className="app-title">Session {session.number}</span>
            <Badge tone={TONE[session.status]} data-testid="session-status">
              {session.status}
            </Badge>
          </div>
        </div>
        <div className="app-row">
          <Button onClick={() => setSharing(true)} data-testid="share-players" title="Send the player view to the group chat: images or a PDF">
            Share with players
          </Button>
          {session.status === "planned" && (
            <Button
              variant="primary"
              size="lg"
              onClick={() => {
                startPlannedSession(ctx, sessionId);
                openTable();
              }}
              data-testid="start-planned"
            >
              Start session
            </Button>
          )}
          {session.status === "running" && (
            <>
              <Button variant="primary" onClick={openTable}>
                Table mode
              </Button>
              <Button variant="danger" onClick={() => setWrapping(true)}>
                Wrap up
              </Button>
            </>
          )}
        </div>
      </header>

      {session.status === "done" ? <DoneSession session={session} /> : <PlanSession session={session} />}
      {sharing && <ShareDialog open onClose={() => setSharing(false)} sessionId={sessionId} sceneId={shareScene} />}
    </div>
  );
}

/** The scene a share from the session page briefs: the table's current scene, else the first planned or run scene. */
function useShareScene(session: Session | undefined): Id | undefined {
  const ts = useSessionTrackerState(session?.id ?? "");
  if (!session) return undefined;
  return tableStateOf(ts?.state).sceneId ?? plannedScenesOf(session)[0] ?? session.scenesRun[0];
}

// ---------------------------------------------------------------------------
// planning
// ---------------------------------------------------------------------------

function PlanSession({ session }: { session: Session }) {
  const ctx = useCampaign();
  const meta = useMeta();
  const [newItem, setNewItem] = useState("");
  const set = (patch: Partial<Session>) => updateSession(ctx, session.id, patch);
  return (
    <div className="app-stack">
      <SessionChecklist session={session} focus={session.status === "running" ? "play" : "prep"} />

      <Card title="Details">
        <div className="app-form__row">
          <label className="app-label">
            Title
            <input className="cf-input" value={session.title ?? ""} placeholder={`Session ${session.number}`} onChange={(e) => set({ title: e.target.value || undefined })} data-testid="session-title" />
          </label>
          <label className="app-label">
            Date
            <input className="cf-input" type="date" value={session.date} onChange={(e) => e.target.value && set({ date: e.target.value })} />
          </label>
        </div>
        <fieldset className="app-fieldset">
          <legend className="app-label">Attendees</legend>
          <div className="app-row">
            {meta.members.map((m) => (
              <label key={m.id} className="app-toggle">
                <input
                  type="checkbox"
                  className="cf-checkbox"
                  checked={session.attendees.includes(m.id)}
                  onChange={(e) => set({ attendees: e.target.checked ? [...session.attendees, m.id] : session.attendees.filter((a) => a !== m.id) })}
                />
                {m.name} <span className="cf-muted">({m.role === "gm" ? "GM" : "player"})</span>
              </label>
            ))}
          </div>
        </fieldset>
      </Card>

      <ScenePlanner session={session} />

      <Card title="Plan" subtitle="Loose ends carried from the last session, and anything to remember.">
        {session.nextPlan.length === 0 && <p className="cf-muted">Nothing on the plan yet.</p>}
        <ol className="app-plan" aria-label="Plan">
          {session.nextPlan.map((item, i) => (
            <li key={i} className="app-row">
              <input className="cf-input app-grow" aria-label={`Plan item ${i + 1}`} value={item} onChange={(e) => set({ nextPlan: session.nextPlan.map((x, j) => (j === i ? e.target.value : x)) })} />
              <IconButton variant="ghost" label="Remove plan item" icon="×" onClick={() => set({ nextPlan: session.nextPlan.filter((_, j) => j !== i) })} />
            </li>
          ))}
        </ol>
        <form
          className="app-row"
          onSubmit={(e) => {
            e.preventDefault();
            if (!newItem.trim()) return;
            set({ nextPlan: [...session.nextPlan, newItem.trim()] });
            setNewItem("");
          }}
        >
          <input className="cf-input app-grow" aria-label="New plan item" placeholder="Add to the plan…" value={newItem} onChange={(e) => setNewItem(e.target.value)} />
          <Button type="submit" disabled={!newItem.trim()}>
            Add
          </Button>
        </form>
      </Card>
    </div>
  );
}

function ScenePlanner({ session }: { session: Session }) {
  const ctx = useCampaign();
  const v = useMapVersion("scenes") + useMapVersion("acts") + useMapVersion("adventures");
  const order = useMemo(
    () => scenesInAdventureOrder(ctx.store),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ctx.store, v],
  );
  const planned = plannedScenesOf(session);
  const byId = new Map(order.map((s) => [s.id, s]));
  const groups = useMemo(() => {
    const out: Array<{ key: string; title: string; scenes: Scene[] }> = [];
    for (const s of order) {
      const act = s.act ? ctx.store.get("acts", s.act) : undefined;
      const adv = act ? ctx.store.get("adventures", act.adventure) : undefined;
      const key = act?.id ?? "none";
      let g = out.find((x) => x.key === key);
      if (!g) {
        g = { key, title: act ? `${adv?.title ?? "Adventure"} · Act ${act.number}${act.title ? `: ${act.title}` : ""}` : "Other scenes", scenes: [] };
        out.push(g);
      }
      g.scenes.push(s);
    }
    return out;
  }, [order, ctx.store]);
  const save = (ids: Id[]) => setPlannedScenes(ctx, session.id, ids);
  const move = (i: number, d: -1 | 1) => {
    const next = [...planned];
    const [x] = next.splice(i, 1);
    next.splice(i + d, 0, x!);
    save(next);
  };

  return (
    <Card title="Scenes planned" subtitle="Table mode steps through these in order; without any it follows the adventures' scene order.">
      {planned.length === 0 ? (
        <p className="cf-muted">No scenes picked.</p>
      ) : (
        <ol className="app-plan" aria-label="Planned scenes">
          {planned.map((id, i) => (
            <li key={id} className="app-row">
              <span className="app-grow">{byId.get(id)?.title ?? "(deleted scene)"}</span>
              {byId.get(id) && byId.get(id)!.status !== "planned" && <Badge>{byId.get(id)!.status}</Badge>}
              <IconButton size="sm" variant="ghost" label="Move up" icon="↑" disabled={i === 0} onClick={() => move(i, -1)} />
              <IconButton size="sm" variant="ghost" label="Move down" icon="↓" disabled={i === planned.length - 1} onClick={() => move(i, 1)} />
              <IconButton size="sm" variant="ghost" label="Remove scene" icon="×" onClick={() => save(planned.filter((x) => x !== id))} />
            </li>
          ))}
        </ol>
      )}
      {groups.length === 0 ? (
        <p className="cf-muted">
          No scenes in this campaign yet. <Link to="/c/$campaignId/adventures" params={{ campaignId: ctx.campaignId }}>Build an adventure</Link>.
        </p>
      ) : (
        <details className="app-table__body">
          <summary>Add scenes</summary>
          {groups.map((g) => {
            const free = g.scenes.filter((s) => !planned.includes(s.id));
            return (
              <section key={g.key} className="app-stack" aria-label={g.title}>
                <div className="app-row">
                  <strong className="app-grow">{g.title}</strong>
                  {free.length > 1 && (
                    <Button size="sm" variant="ghost" onClick={() => save([...planned, ...free.map((s) => s.id)])}>
                      Add all
                    </Button>
                  )}
                </div>
                <ul className="app-list">
                  {g.scenes.map((s) => (
                    <li key={s.id} className="app-list__row">
                      <span className="app-grow">{s.title}</span>
                      {s.status !== "planned" && <Badge>{s.status}</Badge>}
                      <Button size="sm" onClick={() => save([...planned, s.id])} disabled={planned.includes(s.id)} aria-label={`Plan ${s.title}`}>
                        {planned.includes(s.id) ? "Planned" : "+ Plan"}
                      </Button>
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </details>
      )}
    </Card>
  );
}

// ---------------------------------------------------------------------------
// done
// ---------------------------------------------------------------------------

function DoneSession({ session }: { session: Session }) {
  const ctx = useCampaign();
  const links = useRecordLinks();
  const name = (id: Id) => ctx.store.get("entities", id)?.name ?? "?";
  const wrapUp = wrapUpOf(session);
  const timelineAll = useList("timeline");
  const timeline = useMemo(() => timelineAll.filter((t) => t.session === session.id), [timelineAll, session.id]);
  const trackerStates = useList("trackerState");
  const log = useMemo(
    () =>
      trackerStates
        .filter((t) => t.session === session.id)
        .flatMap((t) => t.log)
        .sort((a, b) => a.at.localeCompare(b.at)),
    [trackerStates, session.id],
  );
  const answers = Object.entries(wrapUp.answers ?? {});
  const next = wrapUp.nextSession ? ctx.store.get("sessions", wrapUp.nextSession) : undefined;

  return (
    <div className="app-grid app-session-done">
      <Card title="Summary" subtitle={formatDate(session.date)}>
        {session.summary ? <p className="app-pre" data-testid="session-summary">{session.summary}</p> : <p className="cf-muted">No summary.</p>}
        {next && (
          <p>
            Next:{" "}
            <Link to="/c/$campaignId/sessions/$sessionId" params={{ campaignId: ctx.campaignId, sessionId: next.id }}>
              {sessionLabel(next)}
            </Link>
          </p>
        )}
      </Card>
      <ChecklistSummary session={session} />
      <Card title="Scenes run">
        {session.scenesRun.length === 0 ? (
          <p className="cf-muted">None marked run.</p>
        ) : (
          <ol className="app-bullets">
            {session.scenesRun.map((id) => (
              <li key={id}>{ctx.store.get("scenes", id)?.title ?? "(deleted scene)"}</li>
            ))}
          </ol>
        )}
      </Card>
      <Card title="Reveals">
        {session.reveals.length === 0 ? (
          <p className="cf-muted">Nothing revealed.</p>
        ) : (
          <ul className="app-list">
            {session.reveals.map((r, i) => (
              <li key={i} className="app-list__row">
                <span className="app-grow">
                  {r.handout ? ctx.store.get("handouts", r.handout)?.title ?? "(handout)" : r.entity ? (
                    <button type="button" className="app-linkbtn" onClick={() => links.openEntity(r.entity!)}>
                      {name(r.entity)}
                    </button>
                  ) : (
                    "?"
                  )}
                  {r.field ? ` · ${r.field}` : ""}
                </span>
                {r.scene && <span className="cf-muted">{ctx.store.get("scenes", r.scene)?.title}</span>}
                <span className="cf-muted">{new Date(r.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
      <Card title="Rewards">
        {session.rewards.length === 0 ? (
          <p className="cf-muted">No rewards recorded.</p>
        ) : (
          <ul className="app-list">
            {session.rewards.map((r, i) => (
              <li key={i} className="app-list__row">
                <strong>{name(r.characterId)}</strong>
                <span>
                  {r.kind}
                  {r.value !== "" && r.value !== undefined ? `: ${String(r.value)}` : ""}
                </span>
                {r.note && <span className="cf-muted">{r.note}</span>}
              </li>
            ))}
          </ul>
        )}
      </Card>
      <Card title="Wrap-up answers">
        {answers.length === 0 ? (
          <p className="cf-muted">No module questions answered.</p>
        ) : (
          <ul className="app-list">
            {answers.map(([id, a]) => (
              <li key={id} className="app-list__row">
                <span className="app-grow cf-mono app-small">{id}</span>
                <Badge tone={a.value === true || a.optionId ? "accent" : "muted"}>{a.label ?? String(a.value)}</Badge>
              </li>
            ))}
          </ul>
        )}
        {wrapUp.looseEnds && wrapUp.looseEnds.length > 0 && (
          <>
            <h4 className="app-table__group-title">Loose ends</h4>
            <ul className="app-bullets">
              {wrapUp.looseEnds.map((l, i) => (
                <li key={i}>{l}</li>
              ))}
            </ul>
          </>
        )}
      </Card>
      <Card title="Timeline entries">
        {timeline.length === 0 ? (
          <p className="cf-muted">None created.</p>
        ) : (
          <ul className="app-list" data-testid="session-timeline">
            {timeline.map((t) => (
              <li key={t.id} className="app-list__row">
                <span className="cf-mono">{t.inWorldDate}</span>
                <span className="app-grow">{t.text}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
      <Card title="Session log">
        <RichTextView docId={session.logDoc} placeholder="The log is empty." />
      </Card>
      <Card title="Tracker log" subtitle="Archived with the session.">
        {log.length === 0 ? (
          <p className="cf-muted">No tracker events.</p>
        ) : (
          <ul className="cf-tracker__log app-table__feed">
            {log.map((e, i) => (
              <li key={i}>
                <span className="cf-tracker__log-time">{new Date(e.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                <span>{e.text}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
