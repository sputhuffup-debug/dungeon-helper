/**
 * Session wrap-up, step by step: summary (drafted from what the session
 * logged when empty), the end-of-session questions (the module's prompts and
 * its award checklist, with the arcs' clues, heat and contacts; the step is
 * left out when it would be empty), rewards (free entries), timeline
 * entries, loose ends and, when the session ran one of the module's
 * adventure sources (a job), closing it.
 *
 * The session timer pauses while the wrap-up is open (wrap-up time is not
 * play time); going back to the table starts it again.
 *
 * Everything typed is saved on the session as a draft while the GM types
 * (see wrapUpActions.ts), so leaving and coming back keeps it. Finishing
 * commits: it marks the session done, archives its tracker state, plans the
 * next one and lands on the next step: the module's between-jobs procedure
 * for a record just closed, else the next session's page.
 */
import type { Entity, Id } from "@campaign-forge/core";
import type { Prompt } from "@campaign-forge/module-sdk";
import { useEffect, useMemo, useRef, useState } from "react";
import { AutoGrowText, Badge, Button, Card, PageRef, pushToast, useDiceRoller } from "../../components/ui";
import { errorMessage } from "../../lib/format";
import { useCampaign, useMeta, useRecord } from "../../state/hooks";
import {
  answerPrompt,
  answerRollOperation,
  finishSession,
  operationRun,
  operationTitle,
  plannedScenesOf,
  sessionEndPrompts,
  sessionLabel,
  sessionLogText,
  setTimer,
  suggestTimeline,
  wrapUpOf,
  type TimelineDraft,
  type WrapUpAnswer,
} from "../../state/tableActions";
import { SessionRollPanel, attributeIds, skillInput } from "../table/DicePanel";
import { WrapChecklistPanel } from "./SessionChecklist";
import { usePlayerCharacters, useTableState } from "../table/hooks";
import { BetweenJobsLink } from "../ship/BetweenJobsLink";
import { AwardsStep, useAwardsShown } from "../progression/AwardsStep";
import { LongAgendaWrapUp } from "../agendas/LongAgendas";
import { ArcsWrapUp } from "../arcs/ArcsWrapUp";
import { betweenJobsFor, closeStepLabel, CloseSourcesStep, useSessionSources } from "./CloseSources";
import type { WrapUpLanding } from "./afterWrapUp";
import { draftSessionSummary, mergeTimeline, saveWrapUpDraft, wrapUpDraftOf, type RewardDraft } from "../../state/wrapUpActions";
import { arcsDefOf } from "../../state/arcActions";

const BASE_STEPS = [
  { id: "summary", label: "Summary" },
  { id: "prompts", label: "End-of-session questions" },
  { id: "rewards", label: "Rewards" },
  { id: "timeline", label: "Timeline" },
  { id: "loose", label: "Loose ends" },
] as const;
type StepId = (typeof BASE_STEPS)[number]["id"] | "close";

export interface WrapUpWizardProps {
  sessionId: Id;
  onCancel?: () => void;
  /** Called after finishing, with where to go next. */
  onDone: (nextSessionId: Id | undefined, landing: WrapUpLanding) => void;
}

export function WrapUpWizard({ sessionId, onCancel, onDone }: WrapUpWizardProps) {
  const ctx = useCampaign();
  const meta = useMeta();
  const session = useRecord("sessions", sessionId);
  const pcs = usePlayerCharacters();
  // what the GM typed last time, kept on the session
  const saved = useMemo(() => wrapUpDraftOf(ctx.store.get("sessions", sessionId)), [ctx.store, sessionId]);
  const [step, setStep] = useState<StepId>(() => (saved.step as StepId | undefined) ?? "summary");
  const [summary, setSummary] = useState<string | undefined>(saved.summary ?? (session?.summary || undefined));
  /** The summary is the one drafted from the log, not yet the GM's words. */
  const [summaryDrafted, setSummaryDrafted] = useState(saved.summaryDrafted === true);
  const [rewards, setRewards] = useState<RewardDraft[]>(saved.rewards ?? []);
  const [timeline, setTimeline] = useState<TimelineDraft[]>(() => mergeTimeline(saved.timeline, suggestTimeline(ctx.store, sessionId)));
  const [looseEnds, setLooseEnds] = useState<string>(() => {
    if (saved.looseEnds !== undefined) return saved.looseEnds;
    const planned = plannedScenesOf(session).map((id) => ctx.store.get("scenes", id)).filter((s) => s && s.status === "planned");
    return planned.map((s) => `Not reached: ${s!.title}`).join("\n");
  });
  const [savedAt, setSavedAt] = useState<string | undefined>(saved.at);
  const [busy, setBusy] = useState(false);
  // the module's prompts are built once (from the tracker state at wrap-up time)
  const basePrompts = useMemo(() => sessionEndPrompts(ctx, sessionId), [ctx, sessionId]);
  const answers = wrapUpOf(session).answers ?? {};
  const prompts = useMemo(() => {
    const seen = new Set(basePrompts.map((p) => p.id));
    return [...basePrompts, ...(wrapUpOf(session).followUps ?? []).filter((p) => !seen.has(p.id))];
  }, [basePrompts, session]);

  // an empty summary is drafted from what the session logged (marked as a draft for the GM to edit)
  const redraft = () =>
    sessionLogText(ctx, sessionId)
      .catch(() => "")
      .then((text) => draftSessionSummary(ctx, sessionId, text));
  useEffect(() => {
    if (summary !== undefined) return;
    let alive = true;
    void redraft().then((text) => {
      if (!alive) return;
      setSummary(text);
      setSummaryDrafted(text.trim() !== "");
    });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ctx, sessionId, summary]);

  // every field is saved on the session as the GM types (a moment after the last key), and when the wrap-up closes
  const pendingSave = useRef<(() => void) | undefined>(undefined);
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    const write = () => {
      pendingSave.current = undefined;
      try {
        const out = saveWrapUpDraft(ctx, sessionId, { ...(summary !== undefined ? { summary } : {}), summaryDrafted: summaryDrafted || undefined, looseEnds, rewards, timeline, step });
        if (out?.at) setSavedAt(out.at);
      } catch {
        // the campaign closed under the wrap-up: nothing to keep
      }
    };
    pendingSave.current = write;
    const t = window.setTimeout(write, 400);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [summary, summaryDrafted, looseEnds, rewards, timeline, step]);
  useEffect(() => {
    const flush = () => pendingSave.current?.();
    window.addEventListener("pagehide", flush);
    return () => {
      window.removeEventListener("pagehide", flush);
      flush();
    };
  }, []);

  // wrap-up time is not play time: the timer pauses while the wrap-up is open, and starts again on going back to the table
  const table = useTableState(sessionId);
  const pausedTimer = useRef(false);
  useEffect(() => {
    if (!table.timer?.running || session?.status !== "running") return;
    setTimer(ctx, sessionId, "pause");
    pausedTimer.current = true;
    // only on opening
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const backToTable = onCancel
    ? () => {
        if (pausedTimer.current && ctx.store.get("sessions", sessionId)?.status === "running") setTimer(ctx, sessionId, "start");
        onCancel();
      }
    : undefined;

  const sources = useSessionSources(sessionId);
  const closeLabel = closeStepLabel(ctx, sources);
  // the questions step holds the module's prompts, its award checklist and the arcs; with none of them it is left out
  const awardsShown = useAwardsShown();
  const arcsShown = !!arcsDefOf(ctx.module, meta.mode);
  const askNothing = prompts.length === 0 && !awardsShown && !arcsShown;
  const STEPS: Array<{ id: StepId; label: string }> = [...BASE_STEPS.filter((s) => s.id !== "prompts" || !askNothing), ...(closeLabel ? [{ id: "close" as const, label: closeLabel }] : [])];

  if (!session) return null;
  const idx = Math.max(0, STEPS.findIndex((s) => s.id === step));
  const current = STEPS[idx]!.id;
  const answeredCount = prompts.filter((p) => answers[p.id]).length;

  const finish = () => {
    setBusy(true);
    // finishing commits what is typed: no draft write after it
    pendingSave.current = undefined;
    try {
      const result = finishSession(ctx, sessionId, {
        summary: summary ?? "",
        rewards: rewards.filter((r) => r.kind.trim() || r.value.trim()).map((r) => ({ characterId: r.characterId, kind: r.kind.trim() || "reward", value: r.value.trim(), ...(r.note.trim() ? { note: r.note.trim() } : {}) })),
        timeline,
        looseEnds: looseEnds.split("\n"),
      });
      pushToast(`${sessionLabel(result.session)} wrapped up${result.next ? `; ${sessionLabel(result.next)} is planned` : ""}.`, { tone: "success" });
      // a record just closed (a finished job) goes on to between jobs; otherwise the next session's page
      const closed = sources.find((s) => s.def.outcomes?.some((o) => o.id === s.outcome && o.closes));
      const between = closed ? betweenJobsFor(ctx, meta.mode, closed.entity) : undefined;
      const landing: WrapUpLanding = between ? { kind: "procedure", procedureId: between.procedureId, ...(between.pick ? { pick: between.pick } : {}) } : { kind: "session", sessionId: result.next?.id ?? sessionId };
      onDone(result.next?.id, landing);
    } catch (e) {
      pushToast(`Could not finish the session: ${errorMessage(e)}`, { tone: "danger" });
      setBusy(false);
    }
  };

  return (
    <section className="app-wrapup" aria-label="Session wrap-up" data-testid="wrapup">
      <header className="app-page__header">
        <div>
          <h1 className="app-title">Wrap up {sessionLabel(session)}</h1>
          <p className="cf-muted">Close the session: summary, questions, rewards, timeline, and what carries over.</p>
          <p className="cf-muted app-small" data-testid="wrapup-saved" data-saved={savedAt ? "" : undefined}>
            {savedAt ? "Everything you type is kept on the session until you finish." : "Everything you type is kept on the session as you go."}
            {table.timer && !table.timer.running && (table.timer.accumulatedMs ?? 0) > 0 ? " The session timer is paused while you wrap up." : ""}
          </p>
        </div>
        {backToTable && (
          <Button variant="ghost" onClick={backToTable} title={pausedTimer.current ? "Back to the table: the session timer starts again" : undefined}>
            Back to the table
          </Button>
        )}
      </header>
      <ol className="app-steps" aria-label="Wrap-up steps">
        {STEPS.map((s, i) => (
          <li key={s.id}>
            <button type="button" className={`app-steps__step${s.id === current ? " is-active" : ""}${i < idx ? " is-done" : ""}`} aria-current={s.id === current ? "step" : undefined} onClick={() => setStep(s.id)}>
              <span className="app-steps__num">{i + 1}</span>
              {s.label}
              {s.id === "prompts" && prompts.length > 0 && <span className="cf-muted"> {answeredCount}/{prompts.length}</span>}
            </button>
          </li>
        ))}
      </ol>

      <div className="app-wrapup__body">
        <div className="app-wrapup__main">
          {current === "summary" && (
            <Card
              title="Summary"
              subtitle={summaryDrafted ? "A draft from what the session logged: scenes, clues, what the players saw, panic, injuries, rolls of note and the hunt, then your own log lines. Edit it into your words." : "What happened this session, in your words. It opens next session's recap."}
              actions={
                <span className="app-row">
                  {summaryDrafted && (
                    <Badge tone="warning" data-testid="summary-drafted">
                      Draft
                    </Badge>
                  )}
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() =>
                      void redraft().then((text) => {
                        setSummary(text);
                        setSummaryDrafted(text.trim() !== "");
                      })
                    }
                    data-testid="summary-redraft"
                    title="Replace the summary with a new draft from the session's log"
                  >
                    {summary ? "Draft again from the log" : "Draft from the log"}
                  </Button>
                </span>
              }
            >
              <textarea
                className="cf-textarea app-wrapup__summary"
                aria-label="Session summary"
                rows={8}
                value={summary ?? ""}
                placeholder={summary === undefined ? "Reading the log…" : "Nothing was logged to draft from. What happened this session?"}
                onChange={(e) => {
                  setSummary(e.target.value);
                  setSummaryDrafted(false);
                }}
              />
            </Card>
          )}

          {current === "prompts" && (prompts.length > 0 || !awardsShown) && <PromptsStep sessionId={sessionId} prompts={prompts} answers={answers} pcs={pcs} />}
          {current === "prompts" && <AwardsStep sessionId={sessionId} />}
          {current === "prompts" && <ArcsWrapUp sessionId={sessionId} />}

          {current === "rewards" && <LongAgendaWrapUp />}
          {current === "rewards" && <RewardsStep pcs={pcs} rewards={rewards} setRewards={setRewards} />}
          {current === "rewards" && <BetweenJobsLink />}

          {current === "timeline" && (
            <Card
              title="Timeline entries"
              subtitle={meta.currentDate ? `Each is dated by the in-world date it happened on (the campaign's date when the scene was run); the rest by today's in-world date, ${meta.currentDate}.` : "No in-world date set: entries are kept undated."}
            >
              {timeline.length === 0 && <p className="cf-muted">No scenes were marked run and no handouts revealed. Add an entry by hand if something happened.</p>}
              <ul className="app-list" aria-label="Timeline entries">
                {timeline.map((t, i) => (
                  <li key={t.key} className="app-list__row">
                    <input type="checkbox" className="cf-checkbox" aria-label={`Include ${t.text}`} checked={t.include} onChange={(e) => setTimeline(timeline.map((x, j) => (j === i ? { ...x, include: e.target.checked } : x)))} />
                    <AutoGrowText className="cf-input app-grow" aria-label="Timeline text" value={t.text} onChange={(e) => setTimeline(timeline.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)))} />
                    {meta.currentDate && (
                      <input
                        className="cf-input cf-mono app-wrapup__date"
                        aria-label={`In-world date of ${t.text || "the entry"}`}
                        value={t.inWorldDate ?? meta.currentDate}
                        onChange={(e) => setTimeline(timeline.map((x, j) => (j === i ? { ...x, inWorldDate: e.target.value } : x)))}
                        data-testid="timeline-date"
                      />
                    )}
                    <EntityNames ids={t.entities} />
                  </li>
                ))}
              </ul>
              <div className="app-row">
                <Button onClick={() => setTimeline([...timeline, { key: `manual:${Date.now()}`, text: "", entities: [], include: true }])}>+ Entry</Button>
              </div>
            </Card>
          )}

          {current === "loose" && (
            <Card title="Loose ends" subtitle="One per line. They become the plan of the next session.">
              <textarea className="cf-textarea" aria-label="Loose ends" rows={6} value={looseEnds} placeholder="Who sent the signal?" onChange={(e) => setLooseEnds(e.target.value)} />
            </Card>
          )}

          {current === "close" && <CloseSourcesStep sessionId={sessionId} sources={sources} />}
        </div>
        <aside className="app-wrapup__aside" aria-label="After the session checklist">
          <WrapChecklistPanel session={session} />
        </aside>
      </div>

      <footer className="app-row app-wrapup__nav">
        <Button onClick={() => setStep(STEPS[idx - 1]!.id)} disabled={idx === 0}>
          Back
        </Button>
        <span className="app-grow" />
        {idx < STEPS.length - 1 ? (
          <Button variant="primary" onClick={() => setStep(STEPS[idx + 1]!.id)}>
            Next: {STEPS[idx + 1]!.label}
          </Button>
        ) : (
          <Button variant="primary" onClick={finish} disabled={busy} data-testid="finish-session">
            Finish session
          </Button>
        )}
      </footer>
    </section>
  );
}

function EntityNames({ ids }: { ids: Id[] }) {
  const { store } = useCampaign();
  if (ids.length === 0) return null;
  return <span className="cf-muted">{ids.map((id) => store.get("entities", id)?.name ?? "?").join(", ")}</span>;
}

/** Prompts grouped by character, answered inline. */
function PromptsStep({ sessionId, prompts, answers, pcs }: { sessionId: Id; prompts: Prompt[]; answers: Record<string, WrapUpAnswer>; pcs: Entity[] }) {
  const ctx = useCampaign();
  const groups = useMemo(() => {
    const out: Array<{ key: string; title: string; entity?: Entity; prompts: Prompt[] }> = [];
    const byKey = new Map<string, (typeof out)[number]>();
    for (const p of prompts) {
      const key = p.entity ?? "";
      let g = byKey.get(key);
      if (!g) {
        const entity = p.entity ? (pcs.find((x) => x.id === p.entity) ?? ctx.store.get("entities", p.entity)) : undefined;
        g = { key, title: entity?.name ?? "Everyone", ...(entity ? { entity } : {}), prompts: [] };
        byKey.set(key, g);
        out.push(g);
      }
      g.prompts.push(p);
    }
    return out;
  }, [prompts, pcs, ctx.store]);

  if (prompts.length === 0) {
    return (
      <Card title="End-of-session questions">
        <p className="cf-muted">The module asks nothing at the end of this session.</p>
      </Card>
    );
  }
  const answerNo = (list: Prompt[]) => {
    for (const p of list) if (p.kind === "yesno" && !answers[p.id]) answerPrompt(ctx, sessionId, p, { promptId: p.id, kind: p.kind, value: false, effects: [] });
  };
  return (
    <div className="app-stack">
      {groups.map((g) => (
        <Card
          key={g.key}
          title={g.title}
          actions={
            g.prompts.some((p) => p.kind === "yesno" && !answers[p.id]) && (
              <Button size="sm" variant="ghost" onClick={() => answerNo(g.prompts)}>
                Remaining: No
              </Button>
            )
          }
        >
          <ul className="app-prompts">
            {g.prompts.map((p) => (
              <PromptRow key={p.id} sessionId={sessionId} prompt={p} answer={answers[p.id]} entity={g.entity} />
            ))}
          </ul>
        </Card>
      ))}
    </div>
  );
}

function PromptRow({ sessionId, prompt, answer, entity }: { sessionId: Id; prompt: Prompt; answer: WrapUpAnswer | undefined; entity?: Entity }) {
  const ctx = useCampaign();
  const roller = useDiceRoller();
  const [text, setText] = useState("");
  const [rolling, setRolling] = useState(false);
  const run = (a: Parameters<typeof answerPrompt>[3]) => {
    try {
      // an answer that rolls (a panic roll, say) can take dice rolled at the table
      const op = answerRollOperation(prompt, a);
      if (op) roller.roll({ title: operationTitle(ctx, op, prompt.entity), run: operationRun(ctx, op, prompt.entity), perform: (entered) => void answerPrompt(ctx, sessionId, prompt, a, entered ? { entered } : {}) });
      else answerPrompt(ctx, sessionId, prompt, a);
    } catch (e) {
      pushToast(errorMessage(e), { tone: "danger" });
    }
  };
  const base = { promptId: prompt.id, kind: prompt.kind, ...(prompt.entity ? { entity: prompt.entity } : {}) };
  // a check before the options (e.g. "Roll Empathy"): the attribute named in the prompt text, if the entity has one
  const check = useMemo(() => {
    if (!entity || prompt.kind !== "roll" || !prompt.options?.length) return undefined;
    const attrs = attributeIds(ctx.module, entity);
    const named = attrs.find((a) => new RegExp(`\\b${a}\\b`, "i").test(prompt.text));
    return named;
  }, [entity, prompt, ctx.module]);

  let controls: React.ReactNode;
  if (answer) {
    controls = (
      <Badge tone={answer.value === true || answer.optionId ? "accent" : "muted"} data-testid="prompt-answer">
        {answer.label ?? String(answer.value ?? "answered")}
      </Badge>
    );
  } else {
    switch (prompt.kind) {
      case "yesno":
        controls = (
          <span className="app-row">
            <Button onClick={() => run({ ...base, value: false, effects: [] })}>No</Button>
            <Button variant="primary" onClick={() => run({ ...base, value: true, effects: prompt.onYes ?? [] })}>
              Yes
            </Button>
          </span>
        );
        break;
      case "choice":
        controls = (
          <span className="app-row">
            {(prompt.options ?? []).map((o) => (
              <Button key={o.id} onClick={() => run({ ...base, value: o.id, optionId: o.id, effects: o.effects ?? [] })}>
                {o.label}
              </Button>
            ))}
          </span>
        );
        break;
      case "number":
      case "text":
        controls = (
          <span className="app-row">
            <input className="cf-input" type={prompt.kind === "number" ? "number" : "text"} aria-label="Answer" value={text} onChange={(e) => setText(e.target.value)} />
            <Button variant="primary" onClick={() => run({ ...base, value: prompt.kind === "number" ? Number(text) : text, effects: prompt.onYes ?? [] })}>
              OK
            </Button>
          </span>
        );
        break;
      case "roll":
        controls = prompt.options?.length ? (
          <span className="app-row">
            {check && (
              <Button onClick={() => setRolling(!rolling)} active={rolling}>
                Roll {check}
              </Button>
            )}
            {prompt.options.map((o) => (
              <Button key={o.id} onClick={() => run({ ...base, value: o.id, optionId: o.id, effects: o.effects ?? [] })}>
                {o.label}
              </Button>
            ))}
          </span>
        ) : (
          <Button variant="primary" onClick={() => run({ ...base, value: undefined, effects: prompt.onYes ?? [], ...(prompt.roll ? { roll: prompt.roll } : {}) })}>
            Roll{prompt.roll?.operation ? `: ${ctx.module.module.dice.operations?.[prompt.roll.operation]?.name ?? prompt.roll.operation}` : ""}
          </Button>
        );
        break;
    }
  }
  return (
    <li className="app-prompt" data-prompt={prompt.id}>
      <span className="app-prompt__text">
        {entity && prompt.text.startsWith(`${entity.name}: `) ? prompt.text.slice(entity.name.length + 2) : prompt.text} <PageRef page={prompt.page} />
      </span>
      {controls}
      {rolling && entity && check && !answer && (
        <div className="app-prompt__roll">
          <SessionRollPanel sessionId={sessionId} entity={entity} {...skillInput(ctx.module, entity, `attr:${check}`)} modeSwitch />
        </div>
      )}
    </li>
  );
}

function RewardsStep({ pcs, rewards, setRewards }: { pcs: Entity[]; rewards: RewardDraft[]; setRewards: (r: RewardDraft[]) => void }) {
  if (pcs.length === 0) {
    return (
      <Card title="Rewards">
        <p className="cf-muted">No player characters in this campaign.</p>
      </Card>
    );
  }
  const update = (key: number, patch: Partial<RewardDraft>) => setRewards(rewards.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  return (
    <Card title="Rewards" subtitle="Free entries per character: cash, gear, favours, a new contact. Recorded on the session.">
      {pcs.map((pc) => {
        const mine = rewards.filter((r) => r.characterId === pc.id);
        return (
          <section key={pc.id} className="app-stack" aria-label={`Rewards for ${pc.name}`}>
            <div className="app-row">
              <strong className="app-grow">{pc.name}</strong>
              <Button size="sm" onClick={() => setRewards([...rewards, { key: Date.now() + Math.random(), characterId: pc.id, kind: "", value: "", note: "" }])}>
                + Reward
              </Button>
            </div>
            {mine.map((r) => (
              <div key={r.key} className="app-row">
                <input className="cf-input" aria-label="Reward kind" placeholder="Kind (cash, gear…)" value={r.kind} onChange={(e) => update(r.key, { kind: e.target.value })} />
                <input className="cf-input" aria-label="Reward value" placeholder="Value" value={r.value} onChange={(e) => update(r.key, { value: e.target.value })} />
                <AutoGrowText className="cf-input app-grow" aria-label="Reward note" placeholder="Note" value={r.note} onChange={(e) => update(r.key, { note: e.target.value })} />
                <Button size="sm" variant="ghost" onClick={() => setRewards(rewards.filter((x) => x.key !== r.key))} aria-label="Remove reward">
                  ×
                </Button>
              </div>
            ))}
          </section>
        );
      })}
    </Card>
  );
}
