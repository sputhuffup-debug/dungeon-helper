/** Campaign home: next session, active adventures, open hooks, job board, recent edits, quick create. */
import { fieldSchemaAt, type EntityTypeDef } from "@campaign-forge/module-sdk";
import type { Entity, Id, MapName } from "@campaign-forge/core";
import { Link, useNavigate } from "@tanstack/react-router";
import { useMemo } from "react";
import { EntityIcon } from "../../components/EntityIcon";
import { useRecordLinks } from "../../components/EntityLinkContext";
import { Badge, Button, Card, EmptyState } from "../../components/ui";
import { adventureTitle, formatDate, humanize, relativeTime } from "../../lib/format";
import { createNote, startSession } from "../../state/actions";
import { useCampaign, useList, useMapVersion, useMeta } from "../../state/hooks";
import { summaryLine } from "../entities/summary";

export function HomePage() {
  const ctx = useCampaign();
  const meta = useMeta();
  const navigate = useNavigate();
  const campaignId = ctx.campaignId;
  const sessions = useList("sessions");
  const adventures = useList("adventures");
  const acts = useList("acts");

  const running = sessions.find((s) => s.status === "running");
  const nextPlanned = useMemo(
    () => sessions.filter((s) => s.status === "planned").sort((a, b) => a.date.localeCompare(b.date) || a.number - b.number)[0],
    [sessions],
  );
  const activeAdventures = adventures.filter((a) => a.status === "active");
  const shownAdventures = activeAdventures.length ? activeAdventures : adventures.filter((a) => a.status === "planned").slice(0, 3);
  const hooks = adventures.flatMap((a) => a.hooksOut.map((h, i) => ({ key: `${a.id}:${i}`, text: h, adventure: a })));

  const characterType = ctx.module.module.entityTypes.find((t) => t.kind === "character");
  const locationType = ctx.module.module.entityTypes.find((t) => t.kind === "location");
  const jobType = ctx.module.module.entityTypes.find((t) => t.kind === "job");

  const openTable = (sessionId: Id) => void navigate({ to: "/c/$campaignId/table/$sessionId", params: { campaignId, sessionId } });

  const onStart = () => {
    if (running) return openTable(running.id);
    if (nextPlanned) {
      ctx.store.update("sessions", nextPlanned.id, { status: "running" });
      return openTable(nextPlanned.id);
    }
    const s = startSession(ctx);
    openTable(s.id);
  };

  const onNewNote = () => {
    const note = createNote(ctx, { title: "New note" });
    void navigate({ to: "/c/$campaignId/notes/$noteId", params: { campaignId, noteId: note.id } });
  };

  return (
    <div className="app-page">
      <header className="app-page__header">
        <div>
          <h1 className="app-title">{meta.name}</h1>
          <p className="cf-muted">
            {ctx.module.manifest.name}
            {meta.currentDate ? ` · In-world date ${meta.currentDate}` : ""}
          </p>
        </div>
        <div className="app-row" aria-label="Quick create">
          {characterType && (
            <Link to="/c/$campaignId/entities/new" params={{ campaignId }} search={{ type: characterType.id }} className="cf-btn" data-testid="quick-npc">
              + NPC from preset
            </Link>
          )}
          {locationType && (
            <Link to="/c/$campaignId/entities/new" params={{ campaignId }} search={{ type: locationType.id }} className="cf-btn">
              + Location
            </Link>
          )}
          <Button onClick={onNewNote} data-testid="quick-note">
            + Note
          </Button>
        </div>
      </header>

      <div className="app-grid">
        <Card title="Next session">
          {running ? (
            <div className="app-stack">
              <p>
                <strong>Session {running.number}</strong> {running.title ? `· ${running.title}` : ""} is running.
              </p>
              <Button variant="primary" onClick={() => openTable(running.id)}>
                Resume table mode
              </Button>
            </div>
          ) : nextPlanned ? (
            <div className="app-stack">
              <p>
                <strong>Session {nextPlanned.number}</strong> {nextPlanned.title ? `· ${nextPlanned.title}` : ""} on {formatDate(nextPlanned.date)}
              </p>
              {nextPlanned.nextPlan.length > 0 && (
                <ul className="app-bullets">
                  {nextPlanned.nextPlan.map((p, i) => (
                    <li key={i}>{p}</li>
                  ))}
                </ul>
              )}
              <Button variant="primary" onClick={onStart}>
                Start this session
              </Button>
            </div>
          ) : (
            <div className="app-stack">
              <p className="cf-muted">No session planned.</p>
              <Button variant="primary" onClick={onStart} data-testid="start-session">
                Start a session
              </Button>
            </div>
          )}
        </Card>

        <Card title={activeAdventures.length ? "Active adventures" : "Adventures"} actions={<Link to="/c/$campaignId/adventures" params={{ campaignId }} className="cf-btn cf-btn--sm cf-btn--ghost">All</Link>}>
          {shownAdventures.length === 0 ? (
            <p className="cf-muted">No adventures yet.</p>
          ) : (
            <ul className="app-list">
              {shownAdventures.map((a) => {
                const actCount = a.acts.length;
                const sceneCount = acts.filter((x) => x.adventure === a.id).reduce((n, x) => n + x.scenes.length, 0);
                return (
                  <li key={a.id} className="app-list__row">
                    <Link to="/c/$campaignId/adventures/$adventureId" params={{ campaignId, adventureId: a.id }} className="app-link-strong">
                      {adventureTitle(a)}
                    </Link>
                    <span className="cf-muted">
                      {actCount} act{actCount === 1 ? "" : "s"} · {sceneCount} scene{sceneCount === 1 ? "" : "s"}
                    </span>
                    <Badge tone={a.status === "active" ? "accent" : "muted"}>{a.status}</Badge>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        <Card title="Open hooks">
          {hooks.length === 0 ? (
            <p className="cf-muted">Hooks out of adventures land here.</p>
          ) : (
            <ul className="app-list">
              {hooks.map((h) => (
                <li key={h.key} className="app-list__row">
                  <span>{h.text}</span>
                  <span className="cf-muted">{adventureTitle(h.adventure)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <RecentEdits />
      </div>

      {jobType && <JobBoard def={jobType} />}
    </div>
  );
}

function JobBoard({ def }: { def: EntityTypeDef }) {
  const ctx = useCampaign();
  const campaignId = ctx.campaignId;
  const filter = useMemo(() => (e: Entity) => e.type === def.id, [def.id]);
  const jobs = useList("entities", filter);
  const columns = useMemo(() => {
    let statuses: string[] = [];
    try {
      const s = fieldSchemaAt(def, "status");
      if (Array.isArray(s?.enum)) statuses = s.enum.map(String);
    } catch {
      /* no status field */
    }
    for (const j of jobs) {
      const st = typeof j.fields.status === "string" ? j.fields.status : "";
      if (st && !statuses.includes(st)) statuses.push(st);
    }
    if (jobs.some((j) => typeof j.fields.status !== "string")) statuses.push("");
    return statuses.map((st) => ({ status: st, jobs: jobs.filter((j) => (typeof j.fields.status === "string" ? j.fields.status : "") === st) }));
  }, [def, jobs]);
  return (
    <section className="app-section" aria-label="Job board">
      <header className="app-section__header">
        <h2 className="app-subtitle">Job board</h2>
        <div className="app-row">
          <Link to="/c/$campaignId/generate" params={{ campaignId }} className="cf-btn cf-btn--sm">
            Generate a {def.name.toLowerCase()}
          </Link>
          <Link to="/c/$campaignId/entities/new" params={{ campaignId }} search={{ type: def.id }} className="cf-btn cf-btn--sm cf-btn--ghost">
            + {def.name}
          </Link>
        </div>
      </header>
      {jobs.length === 0 ? (
        <EmptyState title={`No ${def.plural.toLowerCase()} yet`} text="Generate one or add it by hand; it lands here grouped by status." />
      ) : (
        <div className="app-board">
          {columns.map((col) => (
            <div key={col.status || "none"} className="app-board__col">
              <h3 className="app-board__title">
                {col.status ? humanize(col.status) : "No status"} <span className="cf-muted">{col.jobs.length}</span>
              </h3>
              {col.jobs.map((j) => (
                <Link key={j.id} to="/c/$campaignId/entities/$entityId" params={{ campaignId, entityId: j.id }} className="app-board__card">
                  <strong>{j.name}</strong>
                  <span className="cf-muted">{summaryLine(def, j, ["status"])}</span>
                </Link>
              ))}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

const RECENT_MAPS: MapName[] = ["entities", "notes", "adventures", "scenes", "sessions", "handouts", "maps"];

function RecentEdits() {
  const ctx = useCampaign();
  const links = useRecordLinks();
  const version = useMapVersion("*");
  const recent = useMemo(() => {
    const rows: Array<{ map: MapName; id: Id; title: string; updated: string; type?: string }> = [];
    for (const map of RECENT_MAPS) {
      for (const r of ctx.store.list(map)) {
        const rec = r as unknown as Record<string, unknown>;
        const title = String(rec.name ?? rec.title ?? (map === "sessions" ? `Session ${String(rec.number)}` : rec.id));
        rows.push({ map, id: r.id, title, updated: r.updated, type: typeof rec.type === "string" ? rec.type : undefined });
      }
    }
    return rows.sort((a, b) => (a.updated < b.updated ? 1 : -1)).slice(0, 10);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ctx.store, version]);
  const open = (map: MapName, id: Id) => {
    if (map === "entities") links.openEntity(id);
    else if (map === "notes") links.openNote(id);
    else if (map === "adventures") links.openAdventure(id);
    else if (map === "sessions") links.openSession(id);
  };
  return (
    <Card title="Recent edits">
      {recent.length === 0 ? (
        <p className="cf-muted">Nothing edited yet.</p>
      ) : (
        <ul className="app-list" data-testid="recent-edits">
          {recent.map((r) => {
            const def = r.type ? ctx.module.entityType(r.type) : undefined;
            const clickable = ["entities", "notes", "adventures", "sessions"].includes(r.map);
            return (
              <li key={`${r.map}:${r.id}`} className="app-list__row">
                <EntityIcon icon={def?.icon ?? (r.map === "notes" ? "note" : undefined)} kind={def?.kind} size={14} />
                {clickable ? (
                  <button type="button" className="app-linkbtn" onClick={() => open(r.map, r.id)}>
                    {r.title}
                  </button>
                ) : (
                  <span>{r.title}</span>
                )}
                <span className="cf-muted">{def?.name ?? humanize(r.map.replace(/s$/, ""))}</span>
                <span className="cf-muted app-list__end">{relativeTime(r.updated)}</span>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
