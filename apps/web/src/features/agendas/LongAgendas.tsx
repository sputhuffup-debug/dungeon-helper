/**
 * Long-term agendas (a procedure's `longAgendas`, results
 * `longAgendaDrafts`): the draft cards (goal, this job's beat, the slots the
 * GM re-rolls or pins, the reminders), the open friction lines, the accept,
 * the per-job flow (mark each goal, deal the next beats, apply) and the
 * character page's agenda tab. Game-agnostic: everything shown comes from
 * the module's procedure and its def.
 */
import { longAgendaHandoutsOf, longAgendaOverwrites, longAgendaRecordOf, longAgendaTension, longAgendaWrites, getPath, type Entity, type GeneratorDraftAccept, type Id, type LongAgendaEdit } from "@campaign-forge/core";
import type { GeneratedGraph, LongAgendaDef, LongAgendaDraftCharacter, LongAgendaDraftSet, Procedure } from "@campaign-forge/module-sdk";
import { Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Badge, Button, Card, Dialog, EmptyState, PageRef, pushToast } from "../../components/ui";
import { errorMessage, relativeTime } from "../../lib/format";
import { useCampaign, useList, useMeta } from "../../state/hooks";
import { acceptLongAgendaDrafts, charactersWithLongAgendas, longAgendaDraftsOf, longAgendaProcedureOf, nextJobLabel, runNextBeats, setTension } from "../../state/longAgendaActions";
import { SlotRow, type AgendaSlotControls } from "../generate/AgendaDrafts";
import { AcceptedActions } from "../generate/AcceptedActions";
import { newSeed } from "../generate/runner";

export type LongAgendaEdits = Record<Id, LongAgendaEdit>;
type LongProcedure = Procedure & { longAgendas: LongAgendaDef };

const NO_CONTROLS: AgendaSlotControls = { partSeeds: {}, pinnedParts: {}, onReroll: () => undefined, onPin: () => undefined, onUnpin: () => undefined };

/** The long-agenda procedure of the campaign's mode, if any. */
export function useLongAgendaProcedure(): LongProcedure | undefined {
  const ctx = useCampaign();
  const meta = useMeta();
  return useMemo(() => longAgendaProcedureOf(ctx.module, meta.mode), [ctx.module, meta.mode]);
}

function Reminders({ def, which }: { def: LongAgendaDef; which: number[] | undefined }) {
  const ctx = useCampaign();
  const list = (which ?? []).map((i) => def.reminders?.[i]).filter((r): r is NonNullable<LongAgendaDef["reminders"]>[number] => !!r);
  if (list.length === 0) return null;
  return (
    <ul className="long-agenda__reminders" aria-label="Reminders">
      {list.map((r) => (
        <li key={r.label}>
          <strong>{r.label}:</strong> {r.text} <PageRef page={r.page} />
          {r.procedure && ctx.module.procedure(r.procedure) && (
            <>
              {" "}
              <Link to="/c/$campaignId/generate/$procedureId" params={{ campaignId: ctx.campaignId, procedureId: r.procedure }} className="app-link-strong" data-testid="long-agenda-reminder-link">
                Open {ctx.module.procedure(r.procedure)!.name.toLowerCase()}
              </Link>
            </>
          )}
        </li>
      ))}
    </ul>
  );
}

function LongCard({
  def,
  character: c,
  job,
  controls,
  edit,
  onEdit,
  onLock,
}: {
  def: LongAgendaDef;
  character: LongAgendaDraftCharacter;
  job?: string | undefined;
  controls: AgendaSlotControls;
  edit: LongAgendaEdit;
  onEdit: (id: Id, patch: LongAgendaEdit | undefined) => void;
  onLock?: ((c: LongAgendaDraftCharacter) => void) | undefined;
}) {
  const summary = edit.summary ?? c.summary;
  const beat = edit.beat ?? c.beat.text;
  const edited = edit.summary !== undefined || edit.beat !== undefined;
  return (
    <section className="agenda-card long-agenda-card" aria-label={`${c.name} long-term agenda`} data-testid="long-agenda-character" data-character={c.name}>
      <header className="agenda-card__head">
        <div>
          <h3 className="agenda-card__name">{c.name}</h3>
          <p className="agenda-card__arc">
            <strong>{c.title}</strong>
            {c.status ? <span className="cf-muted"> · {c.status}</span> : null}
          </p>
        </div>
        <span className="app-row">
          {!c.inCampaign && <Badge tone="warning">not in the campaign</Badge>}
          {onLock && c.lock && (
            <Button size="sm" variant={c.lock.locked ? "primary" : "ghost"} active={c.lock.locked} onClick={() => onLock(c)} data-testid="long-agenda-lock-goal">
              {c.lock.locked ? "Goal locked" : "Lock goal"}
            </Button>
          )}
        </span>
      </header>
      {c.change && (
        <p className="app-note long-agenda__change" data-testid="long-agenda-change">
          {c.change}
        </p>
      )}
      {c.slots.length > 0 && (
        <ul className="agenda-slots">
          {c.slots.map((s) => (
            <SlotRow key={s.key} slot={s} who={c.name} controls={controls} />
          ))}
        </ul>
      )}
      <label className="app-label long-agenda__field">
        <span>Goal (the sheet&apos;s {def.summaryField ? "personal agenda" : "summary"})</span>
        <textarea className="cf-input agenda-act__text long-agenda__summary" aria-label={`${c.name}, goal`} rows={2} value={summary} onChange={(e) => onEdit(c.id, { ...edit, summary: e.target.value })} />
      </label>
      <div className="agenda-act">
        <div className="agenda-act__head">
          <span className="agenda-act__label">{job ? `Beat for ${job}` : "This job's beat"} —</span>
          {c.beat.hint && !c.reminders?.some((i) => def.reminders?.[i]?.label === c.beat.hint!.label) && (
            <span className="agenda-act__hint" title={c.beat.hint.text}>
              {c.beat.hint.label}: {c.beat.hint.text} <PageRef page={c.beat.hint.page} />
            </span>
          )}
          {edited && (
            <Button size="sm" variant="ghost" onClick={() => onEdit(c.id, undefined)}>
              Use the draft again
            </Button>
          )}
        </div>
        <textarea className="cf-input agenda-act__text" aria-label={`${c.name}, beat`} rows={3} value={beat} onChange={(e) => onEdit(c.id, { ...edit, beat: e.target.value })} />
        {c.beat.slots.length > 0 && (
          <ul className="agenda-slots agenda-slots--act long-agenda__beat-slots" aria-label="Beat slots">
            {c.beat.slots.map((s) => (
              <SlotRow key={s.key} slot={s} who={`${c.name}, beat`} controls={controls} chip />
            ))}
          </ul>
        )}
      </div>
      <Reminders def={def} which={c.reminders} />
    </section>
  );
}

/** The open friction lines, one row per line, read from its first character's side. */
export function LongAgendaFrictionCard({ set, controls = NO_CONTROLS }: { set: LongAgendaDraftSet; controls?: AgendaSlotControls }) {
  const names = new Map(set.characters.map((c) => [c.id, c.name]));
  return (
    <Card title="Open friction" subtitle="Everyone at the table may know these: one players' handout per character." data-testid="long-agenda-friction" className="long-agenda-friction">
      {set.friction.length === 0 ? (
        <p className="cf-muted">No friction lines.</p>
      ) : (
        <ul className="agenda-slots long-agenda-friction__lines">
          {set.friction.map((l, i) => {
            const first = l.between[0] ?? "";
            const who = l.between.map((id) => names.get(id) ?? id).join(" and ");
            const slot = { key: l.key ?? `carried/${i}`, label: l.kindLabel, text: `${names.get(first) ?? ""}: ${l.text[first] ?? ""}` };
            return l.key ? (
              <SlotRow key={slot.key} slot={slot} who={who} controls={controls} />
            ) : (
              <li key={slot.key} className="agenda-slot" data-slot={slot.key}>
                <span className="agenda-slot__label">{slot.label}</span>
                <span className="agenda-slot__text">{slot.text}</span>
                <span />
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

/** The draft cards: one per character, then the open friction. */
export function LongAgendaDraftCards({
  def,
  set,
  controls,
  edits,
  onEdit,
  onLock,
}: {
  def: LongAgendaDef;
  set: LongAgendaDraftSet;
  controls: AgendaSlotControls;
  edits: LongAgendaEdits;
  onEdit: (id: Id, patch: LongAgendaEdit | undefined) => void;
  onLock?: (c: LongAgendaDraftCharacter) => void;
}) {
  return (
    <section className="agenda-drafts long-agendas" aria-label="Long-term agenda drafts" data-testid="long-agenda-drafts">
      <div className="agenda-drafts__banner">
        <Badge tone="warning">Draft</Badge>
        <span>{set.note ?? "Drafts: revise them to fit your campaign."}</span>
      </div>
      <div className="agenda-drafts__grid">
        {set.characters.map((c) => (
          <LongCard key={c.id} def={def} character={c} job={set.job} controls={controls} edit={edits[c.id] ?? {}} onEdit={onEdit} onLock={onLock} />
        ))}
      </div>
      <LongAgendaFrictionCard set={set} controls={controls} />
    </section>
  );
}

/** Accept in the workbench: asks before replacing personal agendas the GM wrote, then writes the agendas and handouts. */
export function LongAgendaAccept({
  def,
  set,
  edits,
  graph,
  run,
  accepted,
  onAccepted,
}: {
  def: LongAgendaDef;
  set: LongAgendaDraftSet;
  edits: LongAgendaEdits;
  graph: GeneratedGraph;
  run: { stepSeeds: Record<string, string>; pinned: Record<string, unknown>; partSeeds: Record<string, string>; pinnedParts: Record<string, unknown> };
  /** The draft's last accept, when this deal was already accepted. */
  accepted?: GeneratorDraftAccept | undefined;
  /** Accepting recorded a run: the page marks its draft accepted. */
  onAccepted?: (runId: Id | undefined, detail: { written: Id[] }) => void;
}) {
  const ctx = useCampaign();
  useList("entities");
  const [busy, setBusy] = useState(false);
  const [asking, setAsking] = useState<ReturnType<typeof longAgendaOverwrites> | undefined>();
  const done = accepted ? (Array.isArray(accepted.detail?.written) ? (accepted.detail.written as unknown[]).filter((x): x is Id => typeof x === "string") : []) : undefined;
  const writes = longAgendaWrites(def, set, edits);
  const skipped = set.characters.filter((c) => !c.inCampaign).length;
  const firstDone = done?.map((id) => ctx.store.get("entities", id)).find((e) => e !== undefined);

  const write = async (skip: Id[]) => {
    setAsking(undefined);
    setBusy(true);
    try {
      const res = await acceptLongAgendaDrafts(ctx, { def, set, edits, skip, graph, ...run });
      onAccepted?.(res.run?.id, { written: res.written });
      pushToast(`Wrote ${res.written.length} long-term agenda${res.written.length === 1 ? "" : "s"} and their handouts.`, { tone: "success" });
    } catch (e) {
      pushToast(`Accept failed: ${errorMessage(e)}`, { tone: "danger" });
    } finally {
      setBusy(false);
    }
  };
  const start = () => {
    const found = longAgendaOverwrites(ctx.store, def, writes);
    if (found.length > 0) setAsking(found);
    else void write([]);
  };
  return (
    <div className="app-stack agenda-accept">
      <p className="cf-muted">
        Writes each character&apos;s goal into their sheet, a GM-only agenda handout (goal and beat) and a players&apos; friction handout, linked to the character.
        {skipped > 0 ? ` ${skipped} placeholder character${skipped === 1 ? " is" : "s are"} not in the campaign and skipped.` : ""}
      </p>
      {done ? (
        <AcceptedActions
          note={
            <div data-testid="long-agenda-accepted">
              <p>
                Wrote {done.length} long-term agenda{done.length === 1 ? "" : "s"}. Accepted{accepted ? ` ${relativeTime(accepted.at)}` : ""}.
              </p>
              <ul className="app-list">
                {done.map((id) => (
                  <li key={id}>
                    <Link to="/c/$campaignId/entities/$entityId" params={{ campaignId: ctx.campaignId, entityId: id }} search={{ tab: "agenda" }} className="app-link-strong">
                      {ctx.store.get("entities", id)?.name ?? id}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          }
          onward={
            firstDone && (
              <Link to="/c/$campaignId/entities/$entityId" params={{ campaignId: ctx.campaignId, entityId: firstDone.id }} search={{ tab: "agenda" }} className="cf-btn cf-btn--primary cf-btn--lg" data-testid="long-agenda-open-first">
                Open {firstDone.name}&apos;s agenda
              </Link>
            )
          }
          again="Accepting again writes this deal's goals and beats over each character's agenda and handouts once more, and records a second run. To deal new beats after a job, use the job flow on a character's agenda instead."
          onAgain={start}
          busy={busy}
        />
      ) : (
        <Button variant="primary" size="lg" disabled={busy || writes.length === 0} onClick={start} data-testid="long-agenda-accept">
          Accept agendas
        </Button>
      )}
      <Dialog
        open={asking !== undefined}
        onClose={() => setAsking(undefined)}
        title={`Replace ${asking?.length ?? 0} personal agenda${asking?.length === 1 ? "" : "s"} you wrote?`}
        footer={
          <>
            <Button variant="ghost" onClick={() => setAsking(undefined)}>
              Cancel
            </Button>
            <Button onClick={() => void write((asking ?? []).map((o) => o.characterId))} data-testid="long-agenda-keep-mine">
              Keep theirs, write the rest
            </Button>
            <Button variant="danger" onClick={() => void write([])} data-testid="long-agenda-replace">
              Replace them
            </Button>
          </>
        }
      >
        <div data-testid="long-agenda-overwrite">
          <p>These characters already have a personal agenda that differs from the draft:</p>
          <ul className="agenda-overwrite__list">
            {(asking ?? []).map((o) => (
              <li key={o.characterId}>
                <strong>{o.name}</strong>: {o.current.length > 140 ? `${o.current.slice(0, 139)}…` : o.current}
              </li>
            ))}
          </ul>
        </div>
      </Dialog>
    </div>
  );
}

// ---------------------------------------------------------------------------
// after a job
// ---------------------------------------------------------------------------

const textAt = (record: Record<string, unknown> | undefined, path: string | undefined): string => {
  const v = record && path ? getPath(record, path) : undefined;
  return typeof v === "string" ? v : "";
};

/**
 * After a job: mark each goal, deal the next beats, revise them, apply. The
 * reminders (the agenda's XP, shore leave) show with each new beat.
 */
export function LongAgendaJobFlow({ procedure, onApplied }: { procedure: LongProcedure; onApplied?: () => void }) {
  const ctx = useCampaign();
  const def = procedure.longAgendas;
  useList("entities");
  const characters = charactersWithLongAgendas(ctx, def);
  const [outcomes, setOutcomes] = useState<Record<Id, string | undefined>>({});
  const [jobLabel, setJobLabel] = useState(() => nextJobLabel(def, characters));
  const [seed, setSeed] = useState<string | undefined>();
  const [partSeeds, setPartSeeds] = useState<Record<string, string>>({});
  const [pinnedParts, setPinnedParts] = useState<Record<string, unknown>>({});
  const [edits, setEdits] = useState<LongAgendaEdits>({});
  const [busy, setBusy] = useState(false);
  const [applied, setApplied] = useState<string | undefined>();

  const outcome = useMemo((): { graph?: GeneratedGraph; error?: string } => {
    if (!seed) return {};
    try {
      return { graph: runNextBeats(ctx, procedure, { outcomes, jobLabel, seed, partSeeds, pinnedParts }) };
    } catch (e) {
      return { error: errorMessage(e) };
    }
    // the records are read when the beats are dealt
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seed, partSeeds, pinnedParts]);
  const set = longAgendaDraftsOf(outcome.graph);

  if (characters.length === 0) {
    return (
      <EmptyState
        title="No long-term agendas yet"
        text="Deal them first: a goal per PC, a beat per job and the open friction between them."
        action={
          <Link to="/c/$campaignId/generate/$procedureId" params={{ campaignId: ctx.campaignId, procedureId: procedure.id }} className="cf-btn cf-btn--primary" data-testid="long-agenda-open-generator">
            {procedure.name}
          </Link>
        }
      />
    );
  }

  const marked = Object.values(outcomes).filter(Boolean).length;
  const controls: AgendaSlotControls = {
    partSeeds,
    pinnedParts,
    onReroll: (key) => setPartSeeds((p) => ({ ...p, [key]: newSeed() })),
    onPin: (key) => {
      const parts = outcome.graph?.parts;
      if (parts && Object.prototype.hasOwnProperty.call(parts, key)) setPinnedParts((p) => ({ ...p, [key]: parts[key] }));
    },
    onUnpin: (key) =>
      setPinnedParts((p) => {
        const n = { ...p };
        delete n[key];
        return n;
      }),
  };
  const deal = () => {
    setApplied(undefined);
    setEdits({});
    setPartSeeds({});
    setPinnedParts({});
    setSeed(newSeed());
  };
  const apply = async () => {
    if (!set || !outcome.graph) return;
    setBusy(true);
    try {
      // characters with no outcome stay as they are
      const changed: LongAgendaDraftSet = { ...set, characters: set.characters.filter((c) => !!outcomes[c.id]) };
      await acceptLongAgendaDrafts(ctx, { def, set: changed, edits, graph: outcome.graph, partSeeds, pinnedParts });
      pushToast(`Dealt the beats for ${set.job ?? jobLabel}.`, { tone: "success" });
      setApplied(set.job ?? jobLabel);
      setSeed(undefined);
      setOutcomes({});
      setJobLabel(nextJobLabel(def, charactersWithLongAgendas(ctx, def)));
      onApplied?.();
    } catch (e) {
      pushToast(`Could not apply the beats: ${errorMessage(e)}`, { tone: "danger" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="app-stack long-agenda-flow" data-testid="long-agenda-flow">
      <table className="cf-table long-agenda-flow__table" aria-label="Goals after the job">
        <thead>
          <tr>
            <th scope="col">Character</th>
            <th scope="col">Goal and beat</th>
            <th scope="col">After the job</th>
          </tr>
        </thead>
        <tbody>
          {characters.map((e) => {
            const r = longAgendaRecordOf(def, e);
            const t = longAgendaTension(def, r);
            return (
              <tr key={e.id} data-character={e.name}>
                <th scope="row">{e.name}</th>
                <td>
                  <strong>{textAt(r, def.paths.title)}</strong>
                  {t !== undefined && def.tension && <Badge tone={t >= def.tension.levels.length - 1 ? "danger" : t > 0 ? "warning" : "muted"}>{def.tension.levels[t]!.label}</Badge>}
                  <br />
                  <span className="cf-muted">{textAt(r, def.paths.beat)}</span>
                </td>
                <td>
                  <span className="app-row" role="radiogroup" aria-label={`${e.name}: after the job`}>
                    {def.outcomes.map((o) => (
                      <Button
                        key={o.id}
                        size="sm"
                        role="radio"
                        aria-checked={outcomes[e.id] === o.id}
                        active={outcomes[e.id] === o.id}
                        title={o.text}
                        onClick={() => setOutcomes((cur) => ({ ...cur, [e.id]: cur[e.id] === o.id ? undefined : o.id }))}
                        aria-label={`${e.name}: ${o.label}`}
                      >
                        {o.label}
                      </Button>
                    ))}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div className="app-row">
        <label className="app-label">
          <span>Next job</span>
          <input className="cf-input" aria-label="Next job" value={jobLabel} onChange={(e) => setJobLabel(e.target.value)} />
        </label>
        <Button variant="primary" onClick={deal} disabled={marked === 0} data-testid="deal-next-beats">
          {seed ? "Deal again" : "Deal next beats"}
        </Button>
        <span className="cf-muted">
          {marked} of {characters.length} marked; the others stay as they are.
        </span>
      </div>
      {applied && (
        <p className="app-note" data-testid="next-beats-applied">
          Beats for {applied} are on the agenda handouts.
        </p>
      )}
      {outcome.error && <p className="app-note app-note--warning">The procedure could not run: {outcome.error}</p>}
      {set && (
        <>
          <LongAgendaDraftCards
            def={def}
            set={{ ...set, characters: set.characters.filter((c) => !!outcomes[c.id]) }}
            controls={controls}
            edits={edits}
            onEdit={(id, patch) =>
              setEdits((cur) => {
                const n = { ...cur };
                if (patch) n[id] = patch;
                else delete n[id];
                return n;
              })
            }
          />
          <div className="app-row">
            <Button variant="primary" size="lg" onClick={() => void apply()} disabled={busy} data-testid="apply-next-beats">
              Apply: update goals, beats and handouts
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

/** The session wrap-up's card: the per-job flow, when the module keeps long-term agendas in this mode. */
export function LongAgendaWrapUp() {
  const procedure = useLongAgendaProcedure();
  if (!procedure) return null;
  return (
    <Card title="Long-term agendas" subtitle="If a job ended this session, mark each goal and deal the next beats." data-testid="wrapup-long-agendas">
      <LongAgendaJobFlow procedure={procedure} />
    </Card>
  );
}

// ---------------------------------------------------------------------------
// the character's agenda tab
// ---------------------------------------------------------------------------

export function LongAgendaTab({ entity }: { entity: Entity }) {
  const ctx = useCampaign();
  const procedure = useLongAgendaProcedure();
  const [flow, setFlow] = useState(false);
  useList("handouts");
  if (!procedure) return <EmptyState title="No long-term agendas in this mode" />;
  const def = procedure.longAgendas;
  const record = longAgendaRecordOf(def, entity);
  if (!record) {
    return (
      <EmptyState
        title="No long-term agenda yet"
        text="Deal one for the crew: a goal that lasts several jobs, a beat per job and open friction lines."
        action={
          <Link to="/c/$campaignId/generate/$procedureId" params={{ campaignId: ctx.campaignId, procedureId: procedure.id }} className="cf-btn cf-btn--primary" data-testid="long-agenda-open-generator">
            {procedure.name}
          </Link>
        }
      />
    );
  }
  const t = longAgendaTension(def, record);
  const top = (def.tension?.levels.length ?? 1) - 1;
  const history = def.paths.history ? getPath(record, def.paths.history) : undefined;
  const friction = def.paths.friction ? getPath(record, def.paths.friction) : undefined;
  const handouts = longAgendaHandoutsOf(ctx.store, entity.id);
  const job = textAt(record, def.paths.beatJob);
  const change = (level: number) => void setTension(ctx, def, entity.id, level).catch((e) => pushToast(errorMessage(e), { tone: "danger" }));
  return (
    <div className="app-stack long-agenda-tab" data-testid="long-agenda-tab">
      <div className="app-row">
        <span className="app-grow" />
        <Button variant="primary" onClick={() => setFlow(true)} data-testid="open-next-beats">
          Deal next beats
        </Button>
        <Link to="/c/$campaignId/generate/$procedureId" params={{ campaignId: ctx.campaignId, procedureId: procedure.id }} className="cf-btn">
          Re-deal agendas
        </Link>
      </div>
      <div className="long-agenda-tab__grid">
        <Card
          title={
            <>
              {textAt(record, def.paths.title)} <Badge tone="danger">GM only</Badge>
            </>
          }
          subtitle={textAt(record, def.paths.summary)}
          data-testid="long-agenda-goal"
        >
          <p className="long-agenda__beat">
            <strong>{job ? `Beat for ${job}` : "This job"}:</strong> <span data-testid="long-agenda-beat">{textAt(record, def.paths.beat)}</span>
          </p>
          {t !== undefined && def.tension && (
            <div className="long-agenda__tension">
              <div className="app-row">
                <strong>Tension</strong>
                <ol className="long-agenda__ladder" aria-label="Tension">
                  {def.tension.levels.map((l, i) => (
                    <li key={l.id} className={i === t ? "is-current" : i < t ? "is-past" : undefined} aria-current={i === t ? "step" : undefined} title={l.text}>
                      {l.label}
                    </li>
                  ))}
                </ol>
              </div>
              <div className="app-row">
                <p className="cf-muted long-agenda__tension-text app-grow">{def.tension.levels[t]!.text}</p>
                <Button size="sm" variant="ghost" onClick={() => change(t - 1)} disabled={t <= 0} aria-label="Cool down one step">
                  Cool down
                </Button>
                <Button size="sm" variant="ghost" onClick={() => change(t + 1)} disabled={t >= top} aria-label="Heat up one step">
                  Heat up
                </Button>
              </div>
            </div>
          )}
          <dl className="long-agenda__details">
            {(def.details ?? []).map((d) => (
              <div key={d.path}>
                <dt>{d.label}</dt>
                <dd>{textAt(record, d.path)}</dd>
              </div>
            ))}
          </dl>
          {Array.isArray(history) && history.length > 0 && (
            <>
              <h4 className="long-agenda__subhead">Beats so far</h4>
              <ul className="long-agenda__history" aria-label="Beats so far">
                {(history as Array<Record<string, unknown>>).map((h, i) => (
                  <li key={i}>
                    {typeof h.job === "string" ? <strong>{h.job}: </strong> : null}
                    {String(h.text ?? "")} <Badge tone={h.outcome === "stalled" ? "warning" : h.outcome === "resolved" ? "accent" : "muted"}>{def.outcomes.find((o) => o.id === h.outcome)?.label ?? String(h.outcome ?? "")}</Badge>
                  </li>
                ))}
              </ul>
            </>
          )}
          {handouts.agenda && <p className="cf-muted long-agenda__handout">Handout: {handouts.agenda.title}, GM only, for you to hand to the player.</p>}
        </Card>
        <Card
          title={
            <>
              Open friction <Badge tone="accent">Players see this</Badge>
            </>
          }
          subtitle={handouts.friction ? `Handout: ${handouts.friction.title}` : undefined}
          data-testid="long-agenda-tab-friction"
        >
          <ul className="long-agenda__friction">
            {(Array.isArray(friction) ? (friction as Array<Record<string, unknown>>) : []).map((f, i) => (
              <li key={i}>{String(f.text ?? "")}</li>
            ))}
          </ul>
        </Card>
      </div>
      <Dialog open={flow} onClose={() => setFlow(false)} title="After the job: deal the next beats" className="long-agenda-dialog">
        {flow && <LongAgendaJobFlow procedure={procedure} onApplied={() => setFlow(false)} />}
      </Dialog>
    </div>
  );
}
