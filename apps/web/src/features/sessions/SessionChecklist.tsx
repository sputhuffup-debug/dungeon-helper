/**
 * The session checklist UI: per-phase lists with a checkbox, an expandable
 * guidance line and progress ("6 of 10"), a compact completion summary for
 * finished sessions, and a small progress badge for the sessions list.
 * Game-agnostic: module items carry a badge naming the module and a page.
 */
import {
  CHECKLIST_PHASES,
  CHECKLIST_PHASE_TITLES,
  checklistProgress,
  checklistStateOf,
  checklistTotals,
  setChecklistItem,
  type ChecklistItem,
  type ChecklistPhase,
  type Id,
  type Session,
} from "@campaign-forge/core";
import { useEffect, useId, useMemo, useState } from "react";
import { Badge, Card, PageRef } from "../../components/ui";
import { useCampaign, useMeta } from "../../state/hooks";
import { campaignChecklist, tickLogNotes } from "../../state/tableActions";

/** The campaign's merged checklist (core, module by mode, the GM's own), recomputed when meta changes. */
export function useCampaignChecklist(): ChecklistItem[] {
  const ctx = useCampaign();
  const meta = useMeta();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => campaignChecklist(ctx), [ctx, meta]);
}

/** The module's name for badges, without a parenthetical edition note. */
export function useModuleShortName(): string {
  const { module } = useCampaign();
  return module.manifest.name.replace(/\s*\(.*\)\s*$/, "") || module.manifest.id;
}

function ProgressText({ done, total }: { done: number; total: number }) {
  return (
    <span className={`app-checklist__count${total > 0 && done === total ? " is-complete" : ""}`}>
      {done} of {total}
    </span>
  );
}

function ProgressBar({ done, total, label }: { done: number; total: number; label: string }) {
  return <progress className="app-checklist__bar" max={Math.max(1, total)} value={done} aria-label={label} />;
}

// ---------------------------------------------------------------------------
// items
// ---------------------------------------------------------------------------

function ChecklistRow({ item, done, onToggle, moduleName }: { item: ChecklistItem; done: boolean; onToggle: (done: boolean) => void; moduleName: string }) {
  const [open, setOpen] = useState(false);
  const base = useId();
  const guidanceId = `${base}-guidance`;
  return (
    <li className={`app-checklist__item${done ? " is-done" : ""}`} data-item={item.id} data-done={done}>
      <div className="app-checklist__line">
        <label className="app-checklist__label">
          <input type="checkbox" className="cf-checkbox" checked={done} onChange={(e) => onToggle(e.target.checked)} />
          <span className="app-checklist__text">{item.text}</span>
        </label>
        {item.source === "module" && (
          <Badge tone="accent" className="app-checklist__source" title={`Added by the ${moduleName} module`}>
            {moduleName}
          </Badge>
        )}
        {item.source === "campaign" && (
          <Badge className="app-checklist__source" title="Your own item for this campaign">
            Yours
          </Badge>
        )}
        {item.page !== undefined && <PageRef page={item.page} />}
        {item.guidance && (
          <button
            type="button"
            className="app-checklist__more"
            aria-expanded={open}
            aria-controls={guidanceId}
            aria-label={`${open ? "Hide" : "Show"} guidance: ${item.text}`}
            onClick={() => setOpen(!open)}
          >
            <span aria-hidden="true">{open ? "−" : "?"}</span>
          </button>
        )}
      </div>
      {item.guidance && (
        <p id={guidanceId} className="app-checklist__guidance" hidden={!open}>
          {item.guidance}
        </p>
      )}
    </li>
  );
}

export interface ChecklistPhaseListProps {
  session: Session;
  phase: ChecklistPhase;
  items: ChecklistItem[];
  /** Only the items not yet done. */
  remainingOnly?: boolean;
}

export function ChecklistPhaseList({ session, phase, items, remainingOnly }: ChecklistPhaseListProps) {
  const ctx = useCampaign();
  const moduleName = useModuleShortName();
  const state = checklistStateOf(session);
  const list = items.filter((i) => i.phase === phase && (!remainingOnly || state[i.id] !== true));
  if (list.length === 0) return <p className="cf-muted">{remainingOnly ? "All done." : "No items in this phase."}</p>;
  return (
    <ul className="app-checklist__items" aria-label={CHECKLIST_PHASE_TITLES[phase]}>
      {list.map((item) => (
        <ChecklistRow key={item.id} item={item} done={state[item.id] === true} moduleName={moduleName} onToggle={(done) => setChecklistItem(ctx.store, session.id, item.id, done)} />
      ))}
    </ul>
  );
}

// ---------------------------------------------------------------------------
// the full checklist: one phase open, the others collapsed
// ---------------------------------------------------------------------------

export interface SessionChecklistProps {
  session: Session;
  /** The phase shown open and first; the others are collapsed below it. */
  focus: ChecklistPhase;
  title?: string;
  className?: string;
}

export function SessionChecklist({ session, focus, title = "Session checklist", className }: SessionChecklistProps) {
  const items = useCampaignChecklist();
  const progress = checklistProgress(items, session);
  const order = [focus, ...CHECKLIST_PHASES.filter((p) => p !== focus)];
  return (
    <Card title={title} subtitle="General guidance so each session feels complete. Ticks are saved with the session." className={`app-checklist${className ? ` ${className}` : ""}`} data-testid="session-checklist" data-focus={focus}>
      {order.map((phase) => (
        <PhaseSection key={phase} session={session} phase={phase} items={items} done={progress[phase].done} total={progress[phase].total} defaultOpen={phase === focus} />
      ))}
    </Card>
  );
}

function PhaseSection({ session, phase, items, done, total, defaultOpen }: { session: Session; phase: ChecklistPhase; items: ChecklistItem[]; done: number; total: number; defaultOpen: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <details className="app-checklist__phase" data-phase={phase} open={open} onToggle={(e) => setOpen((e.currentTarget as HTMLDetailsElement).open)}>
      <summary className="app-checklist__summary">
        <span className="app-checklist__phase-title">{CHECKLIST_PHASE_TITLES[phase]}</span>
        <ProgressText done={done} total={total} />
      </summary>
      {open && <ChecklistPhaseList session={session} phase={phase} items={items} />}
    </details>
  );
}

// ---------------------------------------------------------------------------
// wrap-up panel, done summary, list badge
// ---------------------------------------------------------------------------

/** "After the session" next to the wrap-up steps: what is left, with what finishing will tick. */
export function WrapChecklistPanel({ session }: { session: Session }) {
  const items = useCampaignChecklist();
  const progress = checklistProgress(items, session).wrap;
  const [showAll, setShowAll] = useState(false);
  return (
    <Card
      title={CHECKLIST_PHASE_TITLES.wrap}
      subtitle={
        <>
          <ProgressText done={progress.done} total={progress.total} /> done. Finishing never waits on these.
        </>
      }
      className="app-checklist app-checklist--panel"
      data-testid="wrap-checklist"
    >
      <ChecklistPhaseList session={session} phase="wrap" items={items} remainingOnly={!showAll} />
      <button type="button" className="app-linkbtn app-small" onClick={() => setShowAll(!showAll)} aria-pressed={showAll}>
        {showAll ? "Show only what's left" : "Show all items"}
      </button>
      <p className="cf-muted app-small">Saving the summary, loose ends and timeline entries, and planning the next session tick their items when you finish.</p>
    </Card>
  );
}

/** Finished session: done / total per phase, with what was left undone. */
export function ChecklistSummary({ session }: { session: Session }) {
  const items = useCampaignChecklist();
  const progress = checklistProgress(items, session);
  const state = checklistStateOf(session);
  const totals = checklistTotals(progress);
  return (
    <Card title="Checklist" subtitle={`${totals.done} of ${totals.total} done`} className="app-checklist" data-testid="checklist-summary">
      <ul className="app-checklist__phases">
        {CHECKLIST_PHASES.map((phase) => {
          const left = items.filter((i) => i.phase === phase && state[i.id] !== true);
          return (
            <li key={phase} className="app-checklist__phase-row" data-phase={phase}>
              <div className="app-row">
                <span className="app-grow app-checklist__phase-title">{CHECKLIST_PHASE_TITLES[phase]}</span>
                <ProgressText done={progress[phase].done} total={progress[phase].total} />
              </div>
              <ProgressBar done={progress[phase].done} total={progress[phase].total} label={`${CHECKLIST_PHASE_TITLES[phase]}: ${progress[phase].done} of ${progress[phase].total}`} />
              {left.length > 0 && (
                <details className="app-checklist__left">
                  <summary className="cf-muted app-small">{left.length} not ticked</summary>
                  <ChecklistPhaseList session={session} phase={phase} items={items} remainingOnly />
                </details>
              )}
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

/** Small progress badge for the sessions list: the phase that matters for the session's status. */
export function ChecklistBadge({ session, items }: { session: Session; items: ChecklistItem[] }) {
  const progress = checklistProgress(items, session);
  const phase: ChecklistPhase | undefined = session.status === "planned" ? "prep" : session.status === "running" ? "play" : undefined;
  const { done, total } = phase ? progress[phase] : checklistTotals(progress);
  const label = phase ? `${CHECKLIST_PHASE_TITLES[phase]}: ${done} of ${total}` : `Checklist: ${done} of ${total}`;
  return (
    <Badge tone={total > 0 && done === total ? "success" : "muted"} title={label} aria-label={label} data-testid="checklist-badge">
      ✓ {done}/{total}
    </Badge>
  );
}

// ---------------------------------------------------------------------------
// auto-tick: the session log has text
// ---------------------------------------------------------------------------

/** Watch the session's log doc (however it is edited) and tick "Note names and promises" once it has text. */
export function useLogNotesAutoTick(sessionId: Id, logDoc: Id | undefined, enabled: boolean): void {
  const ctx = useCampaign();
  useEffect(() => {
    if (!enabled || !logDoc) return;
    const doc = ctx.registry.open(logDoc);
    let timer: ReturnType<typeof setTimeout> | undefined;
    const onUpdate = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => void tickLogNotes(ctx, sessionId).catch(() => undefined), 400);
    };
    doc.on("update", onUpdate);
    return () => {
      if (timer) clearTimeout(timer);
      doc.off("update", onUpdate);
    };
  }, [ctx, sessionId, logDoc, enabled]);
}
