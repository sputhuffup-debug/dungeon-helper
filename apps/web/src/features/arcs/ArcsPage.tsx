/**
 * `/arcs`: the arc board (the module's `arcs`). Threads are columns, stages
 * rows, clues cards marked unseen, seeded or found, each linking to the job,
 * NPC, places and session it is tied to. The top row shows faction heat and
 * the thread clocks; "What the crew knows" filters the board down to found
 * clues under the players' titles. Everything is editable: titles, stage
 * order, clues, clocks by hand or by the between-jobs roll. The Crew notes
 * tab is the players' view (the group's, or one player's); Contacts lists
 * the crew's contacts. GM-only throughout, except crew notes.
 */
import {
  addClue,
  addStage,
  adjustHeat,
  advanceClock,
  cluesOf,
  contactsOf,
  currentStageIndex,
  factionHeat,
  markClueFound,
  moveClue,
  moveStage,
  moveThread,
  removeClue,
  removeStage,
  removeThread,
  threadCounts,
  threadsInOrder,
  unmarkClueFound,
  unseedClue,
  updateClue,
  updateStage,
  updateThread,
  type ArcClue,
  type ArcStage,
  type ArcThread,
  type Entity,
  type Id,
} from "@campaign-forge/core";
import { clueKindLabel, heatMax, STANCE_LABELS, type ArcsDef } from "@campaign-forge/module-sdk";
import { Link, useNavigate, useSearch } from "@tanstack/react-router";
import { useMemo, useState, type ReactNode } from "react";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { AutoGrowText, Badge, Button, Card, EmptyState, IconButton, Tabs, pushToast } from "../../components/ui";
import { errorMessage } from "../../lib/format";
import { arcsDefOf, clockText, crewNotesFor, currentSession } from "../../state/arcActions";
import { useCampaign, useList, useMapVersion, useMeta } from "../../state/hooks";
import { ArcClockTicker, Milestone } from "./ArcClockTicker";
import { ClockBar } from "./ClockBar";
import { CrewNotesView } from "./CrewNotesView";
import "./arcs.css";

const TABS = ["board", "notes", "contacts"] as const;
const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? "" : "s"}`;

export function ArcsPage() {
  const ctx = useCampaign();
  const meta = useMeta();
  const def = arcsDefOf(ctx.module, meta.mode);
  const search = useSearch({ from: "/c/$campaignId/arcs" });
  const navigate = useNavigate();
  if (!def) {
    return (
      <div className="app-page">
        <EmptyState title="No arc board in this mode" text={`The ${ctx.module.manifest.name} module keeps no campaign arcs for this play mode.`} />
      </div>
    );
  }
  const tab = (TABS as readonly string[]).includes(search.view ?? "") ? (search.view as (typeof TABS)[number]) : "board";
  const generator = ctx.module.procedure(def.generator);
  const board = def.boards?.[0] ? ctx.module.procedure(def.boards[0]) : undefined;
  return (
    <div className="app-page arcs-page" data-testid="arcs-page">
      <header className="app-page__header">
        <div>
          <h1 className="app-title">{def.label ?? "Arcs"}</h1>
          <p className="cf-muted">The campaign's threads, the clues seeded into jobs, the clocks that tick between them. GM only: the players see {def.crewNotes?.title?.toLowerCase() ?? "crew notes"}.</p>
        </div>
        <div className="app-row">
          {generator && (
            <Link to="/c/$campaignId/generate/$procedureId" params={{ campaignId: ctx.campaignId, procedureId: generator.id }} className="cf-btn cf-btn--primary" data-testid="arcs-generate">
              Deal threads
            </Link>
          )}
          {board && (
            <Link to="/c/$campaignId/generate/$procedureId" params={{ campaignId: ctx.campaignId, procedureId: board.id }} className="cf-btn" data-testid="arcs-board-link">
              Deal a {board.name.toLowerCase()}
            </Link>
          )}
        </div>
      </header>
      <Tabs
        value={tab}
        onChange={(id) => void navigate({ to: "/c/$campaignId/arcs", params: { campaignId: ctx.campaignId }, search: id === "board" ? {} : { view: id }, replace: true })}
        tabs={[
          { id: "board", label: "Board", content: <BoardTab def={def} /> },
          { id: "notes", label: def.crewNotes?.title ?? "Crew notes", content: <CrewNotesTab member={search.member} /> },
          { id: "contacts", label: "Contacts", content: <ContactsTab /> },
        ]}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// the board
// ---------------------------------------------------------------------------

function BoardTab({ def }: { def: ArcsDef }) {
  const all = useList("arcs");
  const threads = useMemo(() => threadsInOrder(all), [all]);
  const [crewView, setCrewView] = useState(false);
  const [showResolved, setShowResolved] = useState(false);
  const shown = threads.filter((t) => showResolved || t.status !== "resolved");
  return (
    <div className="app-stack">
      <div className="arcs-top" aria-label="Heat and clocks" data-testid="arcs-top">
        <HeatStrip def={def} />
        <ClockStrip threads={shown} />
      </div>
      <div className="app-row arcs-filters">
        <label className="app-toggle">
          <input type="checkbox" className="cf-checkbox" checked={crewView} onChange={(e) => setCrewView(e.target.checked)} data-testid="arcs-crew-filter" />
          What the crew knows
        </label>
        {threads.some((t) => t.status === "resolved") && (
          <label className="app-toggle">
            <input type="checkbox" className="cf-checkbox" checked={showResolved} onChange={(e) => setShowResolved(e.target.checked)} />
            Show resolved threads
          </label>
        )}
        <span className="cf-muted app-small">
          {plural(threads.length, "thread")} · {plural(threads.reduce((n, t) => n + threadCounts(t).found, 0), "clue")} found · {threads.reduce((n, t) => n + threadCounts(t).seeded, 0)} seeded
        </span>
      </div>
      {shown.length === 0 ? (
        <EmptyState title="No threads yet" text="Deal threads from the generator: each is a sponsor's scheme told across jobs, with clues to seed into postings and a clock that ticks between them." />
      ) : (
        <ArcBoard threads={shown} def={def} crewView={crewView} />
      )}
      {!crewView && shown.length > 0 && (
        <details className="arcs-ticker-details">
          <summary>Tick the clocks between jobs</summary>
          <ArcClockTicker def={def} />
        </details>
      )}
    </div>
  );
}

function HeatStrip({ def }: { def: ArcsDef }) {
  const ctx = useCampaign();
  const entities = useList("entities");
  const heat = useMemo(() => factionHeat({ entities: Object.fromEntries(entities.map((e) => [e.id, e])) }, def), [entities, def]);
  const [adding, setAdding] = useState("");
  if (!def.heat) return null;
  const max = heatMax(def);
  const hot = heat.filter((h) => h.heat > 0);
  const cold = heat.filter((h) => h.heat === 0);
  const bump = (id: Id, by: number) => {
    try {
      adjustHeat(ctx.store, def, id, by);
    } catch (e) {
      pushToast(errorMessage(e), { tone: "danger" });
    }
  };
  return (
    <Card title="Faction heat" className="arcs-heat" data-testid="arcs-heat">
      {hot.length === 0 && <p className="cf-muted app-small">Nobody has noticed the crew yet.</p>}
      <ul className="arcs-heat__list">
        {hot.map((h) => (
          <li key={h.entity.id} className="arcs-heat__row" data-testid="arcs-heat-row" data-faction={h.entity.name}>
            <Link to="/c/$campaignId/entities/$entityId" params={{ campaignId: ctx.campaignId, entityId: h.entity.id }} className="app-link-strong">
              {h.entity.name}
            </Link>
            <Badge tone={h.heat >= max - 1 ? "danger" : h.heat >= max / 2 ? "warning" : "muted"}>
              {h.heat} · {h.label}
            </Badge>
            <ClockBar segments={max} filled={h.heat} label={`Heat ${h.heat} of ${max}`} />
            <span className="app-row arcs-heat__tools">
              <IconButton size="sm" variant="ghost" icon="−" label={`Cool ${h.entity.name}`} onClick={() => bump(h.entity.id, -1)} />
              <IconButton size="sm" variant="ghost" icon="+" label={`Heat up ${h.entity.name}`} onClick={() => bump(h.entity.id, 1)} disabled={h.heat >= max} />
            </span>
          </li>
        ))}
      </ul>
      {cold.length > 0 && (
        <label className="app-row arcs-heat__add">
          <select className="cf-select" aria-label="Raise heat on a faction" value={adding} onChange={(e) => setAdding(e.target.value)} data-testid="arcs-heat-add">
            <option value="">Raise heat on…</option>
            {cold.map((h) => (
              <option key={h.entity.id} value={h.entity.id}>
                {h.entity.name}
              </option>
            ))}
          </select>
          <Button
            size="sm"
            disabled={!adding}
            onClick={() => {
              bump(adding, 1);
              setAdding("");
            }}
          >
            +1
          </Button>
        </label>
      )}
    </Card>
  );
}

function ClockStrip({ threads }: { threads: ArcThread[] }) {
  const ctx = useCampaign();
  if (threads.length === 0) return null;
  return (
    <Card title="Thread clocks" className="arcs-clocks" data-testid="arcs-clocks">
      <ul className="arcs-heat__list">
        {threads.map((t) => (
          <li key={t.id} className="arcs-heat__row" data-testid="arcs-clock-row">
            <span className="arcs-clocks__title">{t.title}</span>
            <Badge tone={t.clock.filled >= t.clock.segments ? "danger" : "accent"}>{clockText(t)}</Badge>
            <ClockBar segments={t.clock.segments} filled={t.clock.filled} milestones={t.clock.milestones.map((m) => m.at)} />
            <span className="app-row arcs-heat__tools">
              <IconButton size="sm" variant="ghost" icon="−" label={`Wind back ${t.title}`} disabled={t.clock.filled === 0} onClick={() => advanceClock(ctx.store, t.id, -1, { how: "hand" })} />
              <IconButton
                size="sm"
                variant="ghost"
                icon="+"
                label={`Advance ${t.title}`}
                disabled={t.clock.filled >= t.clock.segments}
                onClick={() => {
                  const session = currentSession(ctx.store);
                  const move = advanceClock(ctx.store, t.id, 1, { how: "hand", ...(session ? { session: session.id } : {}) });
                  for (const m of move.reached) pushToast(`${t.title}: ${m.text}`, { tone: "warning", timeout: 6000 });
                }}
                data-testid="arcs-clock-advance"
              />
            </span>
          </li>
        ))}
      </ul>
    </Card>
  );
}

/** Threads as columns, stages as rows (aligned across threads), clues as cards. On a phone each thread stacks. */
function ArcBoard({ threads, def, crewView }: { threads: ArcThread[]; def: ArcsDef; crewView: boolean }) {
  const rows = Math.max(...threads.map((t) => t.stages.length));
  return (
    <div className="arc-board" style={{ gridTemplateColumns: `repeat(${threads.length}, minmax(17rem, 1fr))`, gridTemplateRows: `auto repeat(${rows}, auto)` }} data-testid="arc-board">
      {threads.map((t, i) => (
        <ThreadColumn key={t.id} thread={t} index={i} count={threads.length} def={def} crewView={crewView} />
      ))}
    </div>
  );
}

function ThreadColumn({ thread: t, index, count, def, crewView }: { thread: ArcThread; index: number; count: number; def: ArcsDef; crewView: boolean }) {
  const ctx = useCampaign();
  const cell = (row: number) => ({ gridColumn: index + 1, gridRow: row + 1 });
  const known = cluesOf(t).some((x) => x.clue.state === "found");
  const current = currentStageIndex(t);
  if (crewView) {
    return (
      <>
        <header className="arc-col__head" style={cell(0)} data-testid="arc-thread" data-thread={t.id}>
          <h3 className="arc-col__title">{known ? t.playerTitle : <span className="cf-muted">Unknown to the crew</span>}</h3>
          <p className="cf-muted app-small">GM: {t.title}</p>
        </header>
        {t.stages.map((s, k) => (
          <div key={s.id} className="arc-col__stage" style={cell(k + 1)} data-stage={s.id}>
            {s.clues
              .filter((c) => c.state === "found")
              .map((c) => (
                <article key={c.id} className="arc-clue arc-clue--found" data-testid="arc-clue" data-state="found">
                  <Badge tone="success">{clueKindLabel(def, c.kind)}</Badge> {c.playerText}
                  {c.players && <Badge tone="warning">{c.players.length ? "one player" : "nobody now"}</Badge>}
                </article>
              ))}
          </div>
        ))}
      </>
    );
  }
  return (
    <>
      <ThreadHead thread={t} index={index} count={count} style={cell(0)} def={def} />
      {t.stages.map((s, k) => (
        <StageCell key={s.id} thread={t} stage={s} index={k} current={k === current} def={def} style={cell(k + 1)} />
      ))}
      {t.stages.length === 0 && (
        <div style={cell(1)}>
          <Button size="sm" onClick={() => addStage(ctx.store, t.id, { title: "First hints" })}>
            + Stage
          </Button>
        </div>
      )}
    </>
  );
}

function ThreadHead({ thread: t, index, count, style, def }: { thread: ArcThread; index: number; count: number; style: React.CSSProperties; def: ArcsDef }) {
  const ctx = useCampaign();
  const entities = useList("entities");
  const factions = useMemo(() => entities.filter((e) => def.heat?.entityTypes.includes(e.type) || ctx.module.entityType(e.type)?.kind === "faction").sort((a, b) => a.name.localeCompare(b.name)), [entities, def, ctx.module]);
  const sponsor = t.sponsor ? entities.find((e) => e.id === t.sponsor) : undefined;
  const [confirm, setConfirm] = useState(false);
  const counts = threadCounts(t);
  return (
    <header className={`arc-col__head arc-col__head--${t.status}`} style={style} data-testid="arc-thread" data-thread={t.id}>
      <div className="app-row arc-col__tools">
        <Badge tone={t.status === "active" ? "accent" : "muted"}>{t.status}</Badge>
        <span className="app-grow" />
        <IconButton size="sm" variant="ghost" icon="←" label={`Move ${t.title} left`} disabled={index === 0} onClick={() => moveThread(ctx.store, t.id, index - 1)} />
        <IconButton size="sm" variant="ghost" icon="→" label={`Move ${t.title} right`} disabled={index === count - 1} onClick={() => moveThread(ctx.store, t.id, index + 1)} />
      </div>
      <InlineText label="Thread title (GM)" value={t.title} className="arc-col__title-input" onCommit={(v) => updateThread(ctx.store, t.id, { title: v })} testId="arc-thread-title" />
      <InlineText label="Crew notes title" value={t.playerTitle} onCommit={(v) => updateThread(ctx.store, t.id, { playerTitle: v })} prefix="Players:" testId="arc-thread-player-title" />
      <div className="app-row app-small">
        <span className="cf-muted">Sponsor</span>
        <select className="cf-select arc-select-sm" aria-label="Sponsor" value={t.sponsor ?? ""} onChange={(e) => updateThread(ctx.store, t.id, { sponsor: e.target.value })}>
          <option value="">None</option>
          {factions.map((f) => (
            <option key={f.id} value={f.id}>
              {f.name}
            </option>
          ))}
        </select>
        {sponsor && (
          <Link to="/c/$campaignId/entities/$entityId" params={{ campaignId: ctx.campaignId, entityId: sponsor.id }} className="app-link-strong" aria-label={`Open ${sponsor.name}`}>
            ↗
          </Link>
        )}
        <label className="app-toggle" title="Crew notes name the sponsor (when the players may see the faction)">
          <input type="checkbox" className="cf-checkbox" checked={!!t.sponsorRevealed} onChange={(e) => updateThread(ctx.store, t.id, { sponsorRevealed: e.target.checked })} />
          revealed
        </label>
      </div>
      <div className="app-row">
        <ClockBar segments={t.clock.segments} filled={t.clock.filled} milestones={t.clock.milestones.map((m) => m.at)} />
        <span className="cf-mono app-small">{clockText(t)}</span>
        <span className="cf-muted app-small">
          {counts.found}/{counts.total} found
        </span>
      </div>
      <details className="arc-col__scheme">
        <summary>Scheme and clock</summary>
        <div className="app-stack">
          {(["goal", "method", "weakness", "cost"] as const).map((k) => (
            <label key={k} className="app-label">
              <span>{k === "cost" ? "If ignored" : k.charAt(0).toUpperCase() + k.slice(1)}</span>
              <InlineText label={k} value={t[k]} multiline onCommit={(v) => updateThread(ctx.store, t.id, { [k]: v })} />
            </label>
          ))}
          {t.clock.milestones.map((m) => (
            <Milestone key={m.at} m={m} def={def} />
          ))}
          <div className="app-row">
            <select className="cf-select arc-select-sm" aria-label="Status" value={t.status} onChange={(e) => updateThread(ctx.store, t.id, { status: e.target.value as ArcThread["status"] })}>
              <option value="active">Active</option>
              <option value="dormant">Dormant</option>
              <option value="resolved">Resolved</option>
            </select>
            <Button size="sm" onClick={() => addStage(ctx.store, t.id, { title: `Stage ${t.stages.length + 1}` })}>
              + Stage
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setConfirm(true)}>
              Remove thread
            </Button>
          </div>
        </div>
      </details>
      <ConfirmDialog
        open={confirm}
        title="Remove this thread?"
        confirmLabel="Remove"
        danger
        onCancel={() => setConfirm(false)}
        onConfirm={() => {
          setConfirm(false);
          removeThread(ctx.store, t.id);
        }}
      >
        <p>“{t.title}” and its clues leave the arc board. Jobs and NPCs stay.</p>
      </ConfirmDialog>
    </header>
  );
}

function StageCell({ thread: t, stage: s, index, current, def, style }: { thread: ArcThread; stage: ArcStage; index: number; current: boolean; def: ArcsDef; style: React.CSSProperties }) {
  const ctx = useCampaign();
  const [adding, setAdding] = useState(false);
  return (
    <section className={`arc-col__stage${current ? " is-current" : ""}`} style={style} aria-label={`${t.title}: ${s.title}`} data-testid="arc-stage" data-stage={s.id}>
      <div className="app-row arc-stage__head">
        <span className="cf-muted app-small">{index + 1}.</span>
        <InlineText label="Stage title" value={s.title} className="arc-stage__title" onCommit={(v) => updateStage(ctx.store, t.id, s.id, { title: v })} />
        <IconButton size="sm" variant="ghost" icon="↑" label={`Move ${s.title} up`} disabled={index === 0} onClick={() => moveStage(ctx.store, t.id, s.id, index - 1)} data-testid="arc-stage-up" />
        <IconButton size="sm" variant="ghost" icon="↓" label={`Move ${s.title} down`} disabled={index === t.stages.length - 1} onClick={() => moveStage(ctx.store, t.id, s.id, index + 1)} />
      </div>
      {s.summary && <p className="cf-muted app-small">{s.summary}</p>}
      {s.clues.map((c) => (
        <ClueCard key={c.id} thread={t} clue={c} def={def} />
      ))}
      {adding ? (
        <ClueEditor
          thread={t}
          def={def}
          onDone={(input) => {
            if (input) addClue(ctx.store, t.id, s.id, input);
            setAdding(false);
          }}
        />
      ) : (
        <div className="app-row">
          <Button size="sm" variant="ghost" onClick={() => setAdding(true)} data-testid="arc-add-clue">
            + Clue
          </Button>
          {s.clues.length === 0 && (
            <Button size="sm" variant="ghost" onClick={() => removeStage(ctx.store, t.id, s.id)}>
              Remove stage
            </Button>
          )}
        </div>
      )}
    </section>
  );
}

const STATE_TONE = { unseen: "muted", seeded: "warning", found: "success" } as const;

function ClueCard({ thread: t, clue: c, def }: { thread: ArcThread; clue: ArcClue; def: ArcsDef }) {
  const ctx = useCampaign();
  const meta = useMeta();
  const [editing, setEditing] = useState(false);
  const name = (id: Id | undefined) => (id ? ctx.store.get("entities", id)?.name : undefined);
  const sessionOf = (id: Id | undefined) => (id ? ctx.store.get("sessions", id) : undefined);
  const links: ReactNode[] = [];
  const entityLink = (id: Id, label?: string) => {
    const n = name(id);
    if (!n) return;
    links.push(
      <Link key={`e-${id}-${label ?? ""}`} to="/c/$campaignId/entities/$entityId" params={{ campaignId: ctx.campaignId, entityId: id }} className="arc-clue__link">
        {label ? `${label} ${n}` : n}
      </Link>,
    );
  };
  if (c.seeded?.job) entityLink(c.seeded.job, "in");
  if (c.seeded?.entity) entityLink(c.seeded.entity, "with");
  for (const id of c.links?.entities ?? []) if (id !== c.seeded?.entity && id !== c.found?.entity) entityLink(id);
  const found = sessionOf(c.found?.session);
  if (found)
    links.push(
      <Link key="s" to="/c/$campaignId/sessions/$sessionId" params={{ campaignId: ctx.campaignId, sessionId: found.id }} className="arc-clue__link">
        found in Session {found.number}
      </Link>,
    );
  if (editing) {
    return (
      <ClueEditor
        thread={t}
        clue={c}
        def={def}
        onDone={(input, stage) => {
          if (input) updateClue(ctx.store, t.id, c.id, { kind: input.kind, text: input.text, playerText: input.playerText ?? input.text, unlocks: input.unlocks ?? "", ...(input.players !== undefined ? { players: input.players ?? undefined } : {}) });
          if (stage) moveClue(ctx.store, t.id, c.id, stage);
          setEditing(false);
        }}
        onDelete={() => {
          removeClue(ctx.store, t.id, c.id);
          setEditing(false);
        }}
      />
    );
  }
  const players = c.players?.map((p) => meta.members.find((m) => m.id === p)?.name).filter(Boolean);
  return (
    <article className={`arc-clue arc-clue--${c.state}`} data-testid="arc-clue" data-state={c.state} data-clue={c.id}>
      <div className="app-row arc-clue__head">
        <Badge tone="accent">{clueKindLabel(def, c.kind)}</Badge>
        <Badge tone={STATE_TONE[c.state]} data-testid="arc-clue-state">
          {c.state}
        </Badge>
        {c.seeded?.slotLabel && <span className="cf-muted app-small">{c.seeded.slotLabel}</span>}
        <span className="app-grow" />
        <IconButton size="sm" variant="ghost" icon="✎" label="Edit clue" onClick={() => setEditing(true)} />
      </div>
      <p className="arc-clue__text">{c.text}</p>
      <p className="arc-clue__player app-small">
        <span className="cf-muted">Crew notes:</span> {c.playerText}
        {players && players.length > 0 && <span className="cf-muted"> (learnt by {players.join(", ")})</span>}
      </p>
      {c.unlocks && <p className="cf-muted app-small">Unlocks: {c.unlocks}</p>}
      {links.length > 0 && <p className="arc-clue__links app-small">{links}</p>}
      <div className="app-row arc-clue__actions">
        {c.state !== "found" ? (
          <Button
            size="sm"
            onClick={() => {
              const session = currentSession(ctx.store);
              markClueFound(ctx.store, t.id, c.id, { via: "board", ...(session ? { session: session.id } : {}), ...(c.seeded?.job ? { job: c.seeded.job } : {}), ...(c.seeded?.entity ? { entity: c.seeded.entity } : {}) });
              pushToast(`Found${session ? ` in Session ${session.number}` : ""}: it is in the crew notes now.`, { tone: "success" });
            }}
            data-testid="arc-clue-found"
          >
            Mark found
          </Button>
        ) : (
          <Button size="sm" variant="ghost" onClick={() => unmarkClueFound(ctx.store, t.id, c.id)}>
            Mark not found
          </Button>
        )}
        {c.state === "seeded" && (
          <Button size="sm" variant="ghost" onClick={() => unseedClue(ctx.store, t.id, c.id)}>
            Unseed
          </Button>
        )}
      </div>
    </article>
  );
}

interface ClueDraft {
  kind: string;
  text: string;
  playerText?: string;
  unlocks?: string;
  /** null: the whole crew. */
  players?: Id[] | null;
}

function ClueEditor({ thread: t, clue, def, onDone, onDelete }: { thread: ArcThread; clue?: ArcClue; def: ArcsDef; onDone: (input: ClueDraft | undefined, stage?: Id) => void; onDelete?: () => void }) {
  const meta = useMeta();
  const players = meta.members.filter((m) => m.role === "player");
  const [kind, setKind] = useState(clue?.kind ?? def.clueKinds[0]?.id ?? "fact");
  const [text, setText] = useState(clue?.text ?? "");
  const [playerText, setPlayerText] = useState(clue?.playerText ?? "");
  const [unlocks, setUnlocks] = useState(clue?.unlocks ?? "");
  const stageOf = clue ? t.stages.find((s) => s.clues.some((c) => c.id === clue.id))?.id : undefined;
  const [stage, setStage] = useState(stageOf ?? "");
  const [learnt, setLearnt] = useState(clue?.players?.[0] ?? "");
  return (
    <form
      className="arc-clue arc-clue--editing app-stack"
      onSubmit={(e) => {
        e.preventDefault();
        if (!text.trim()) return;
        onDone({ kind, text, playerText: playerText.trim() || text, unlocks, players: learnt ? [learnt] : clue?.players ? null : undefined }, clue && stage && stage !== stageOf ? stage : undefined);
      }}
      data-testid="arc-clue-editor"
    >
      <div className="app-row">
        <select className="cf-select arc-select-sm" aria-label="Clue kind" value={kind} onChange={(e) => setKind(e.target.value)}>
          {def.clueKinds.map((k) => (
            <option key={k.id} value={k.id}>
              {k.label}
            </option>
          ))}
        </select>
        {clue && (
          <select className="cf-select arc-select-sm" aria-label="Stage" value={stage} onChange={(e) => setStage(e.target.value)}>
            {t.stages.map((s, i) => (
              <option key={s.id} value={s.id}>
                {i + 1}. {s.title}
              </option>
            ))}
          </select>
        )}
      </div>
      <AutoGrowText multiline className="cf-input" aria-label="What it is (GM)" placeholder="What it is (GM)" value={text} onChange={(e) => setText(e.target.value)} data-testid="arc-clue-text" />
      <AutoGrowText multiline className="cf-input" aria-label="Crew notes text" placeholder="How the crew notes put it once found" value={playerText} onChange={(e) => setPlayerText(e.target.value)} data-testid="arc-clue-player-text" />
      <AutoGrowText className="cf-input" aria-label="Unlocks" placeholder="What learning it unlocks" value={unlocks} onChange={(e) => setUnlocks(e.target.value)} />
      {players.length > 0 && (
        <label className="app-row app-small">
          <span className="cf-muted">Learnt by</span>
          <select className="cf-select arc-select-sm" aria-label="Learnt by" value={learnt} onChange={(e) => setLearnt(e.target.value)}>
            <option value="">The whole crew</option>
            {players.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} alone
              </option>
            ))}
          </select>
        </label>
      )}
      <div className="app-row">
        <Button size="sm" variant="primary" type="submit" disabled={!text.trim()} data-testid="arc-clue-save">
          Save
        </Button>
        <Button size="sm" variant="ghost" onClick={() => onDone(undefined)}>
          Cancel
        </Button>
        {onDelete && (
          <Button size="sm" variant="danger" onClick={onDelete}>
            Delete
          </Button>
        )}
      </div>
    </form>
  );
}

/** Text that commits on blur or Enter (multi-line: on blur). */
function InlineText({ value, onCommit, label, className, prefix, multiline, testId }: { value: string; onCommit: (v: string) => void; label: string; className?: string; prefix?: string; multiline?: boolean; testId?: string }) {
  const [draft, setDraft] = useState(value);
  const [last, setLast] = useState(value);
  if (last !== value) {
    setLast(value);
    setDraft(value);
  }
  const commit = () => {
    const v = draft.trim();
    if (v && v !== value) onCommit(v);
    else setDraft(value);
  };
  return (
    <span className={`arc-inline${className ? ` ${className}` : ""}`}>
      {prefix && <span className="cf-muted app-small">{prefix}</span>}
      <AutoGrowText
        multiline={!!multiline}
        className="cf-input arc-inline__input"
        aria-label={label}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (!multiline && e.key === "Enter") {
            e.preventDefault();
            (e.target as HTMLElement).blur();
          }
        }}
        {...(testId ? { "data-testid": testId } : {})}
      />
    </span>
  );
}

// ---------------------------------------------------------------------------
// crew notes (the players' view) and contacts
// ---------------------------------------------------------------------------

function CrewNotesTab({ member }: { member: string | undefined }) {
  const ctx = useCampaign();
  const meta = useMeta();
  const navigate = useNavigate();
  const version = useMapVersion("*");
  const players = meta.members.filter((m) => m.role === "player");
  const who = players.find((p) => p.id === member);
  const notes = useMemo(() => crewNotesFor(ctx, who?.id), [ctx, who, version]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="app-stack">
      <div className="app-row">
        <label className="app-row">
          <span className="cf-muted">As</span>
          <select
            className="cf-select"
            aria-label="Crew notes for"
            value={who?.id ?? ""}
            onChange={(e) => void navigate({ to: "/c/$campaignId/arcs", params: { campaignId: ctx.campaignId }, search: { view: "notes", ...(e.target.value ? { member: e.target.value } : {}) }, replace: true })}
            data-testid="crew-notes-member"
          >
            <option value="">The whole crew</option>
            {players.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <span className="cf-muted app-small">What the players read: found clues under each thread's crew notes title, met contacts, known places and factions. Never the GM's side.</span>
      </div>
      <CrewNotesView notes={notes} />
    </div>
  );
}

function ContactsTab() {
  const ctx = useCampaign();
  const entities = useList("entities");
  const contacts = useMemo(() => contactsOf({ entities: Object.fromEntries(entities.map((e) => [e.id, e])) }), [entities]);
  if (contacts.length === 0) return <EmptyState title="No contacts yet" text="When a job ends, add its surviving NPCs to the crew's contacts from the job page or the session wrap-up." />;
  return (
    <ul className="arcs-contacts" data-testid="arcs-contacts">
      {contacts.map((e) => (
        <ContactRow key={e.id} entity={e} campaignId={ctx.campaignId} />
      ))}
    </ul>
  );
}

function ContactRow({ entity: e, campaignId }: { entity: Entity; campaignId: string }) {
  const c = e.contact!;
  return (
    <li className="arcs-contacts__row" data-testid="arcs-contact">
      <Link to="/c/$campaignId/entities/$entityId" params={{ campaignId, entityId: e.id }} className="app-link-strong">
        {e.name}
      </Link>
      <Badge tone={c.stance === "friendly" ? "success" : c.stance === "hostile" ? "danger" : c.stance === "wary" ? "warning" : "muted"}>{STANCE_LABELS[c.stance]}</Badge>
      <span className="app-small">
        owes the crew {c.favours.owedToCrew} · owed {c.favours.owedByCrew}
      </span>
      {c.foundAt && <span className="cf-muted app-small">{c.foundAt}</span>}
      {c.grudges.length > 0 && <span className="app-small">Grudge: {c.grudges.join("; ")}</span>}
      {c.knows.length > 0 && <span className="app-small">Knows {c.knows.length} clue{c.knows.length === 1 ? "" : "s"}</span>}
      {e.visibility.level === "gm" && <Badge tone="warning">GM-only</Badge>}
    </li>
  );
}
