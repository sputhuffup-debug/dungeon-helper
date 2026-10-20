/**
 * Session wrap-up, step by step: summary, the module's end-of-session
 * prompts, rewards, timeline entries and loose ends. Finishing marks the
 * session done, archives its tracker state and plans the next one.
 */
import type { Entity, Id } from "@campaign-forge/core";
import type { Prompt } from "@campaign-forge/module-sdk";
import { useEffect, useMemo, useState } from "react";
import { Badge, Button, Card, PageRef, pushToast } from "../../components/ui";
import { errorMessage } from "../../lib/format";
import { useCampaign, useMeta, useRecord } from "../../state/hooks";
import {
  answerPrompt,
  finishSession,
  plannedScenesOf,
  sessionEndPrompts,
  sessionLabel,
  sessionLogText,
  suggestTimeline,
  summaryDraft,
  wrapUpOf,
  type TimelineDraft,
  type WrapUpAnswer,
} from "../../state/tableActions";
import { SessionRollPanel, attributeIds, skillInput } from "../table/DicePanel";
import { WrapChecklistPanel } from "./SessionChecklist";
import { usePlayerCharacters } from "../table/hooks";
import { BetweenJobsLink } from "../ship/BetweenJobsLink";

const STEPS = [
  { id: "summary", label: "Summary" },
  { id: "prompts", label: "End-of-session questions" },
  { id: "rewards", label: "Rewards" },
  { id: "timeline", label: "Timeline" },
  { id: "loose", label: "Loose ends" },
] as const;
type StepId = (typeof STEPS)[number]["id"];

interface RewardDraft {
  key: number;
  characterId: Id;
  kind: string;
  value: string;
  note: string;
}

export interface WrapUpWizardProps {
  sessionId: Id;
  onCancel?: () => void;
  onDone: (nextSessionId: Id | undefined) => void;
}

export function WrapUpWizard({ sessionId, onCancel, onDone }: WrapUpWizardProps) {
  const ctx = useCampaign();
  const meta = useMeta();
  const session = useRecord("sessions", sessionId);
  const pcs = usePlayerCharacters();
  const [step, setStep] = useState<StepId>("summary");
  const [summary, setSummary] = useState<string | undefined>(session?.summary || undefined);
  const [rewards, setRewards] = useState<RewardDraft[]>([]);
  const [timeline, setTimeline] = useState<TimelineDraft[]>(() => suggestTimeline(ctx.store, sessionId));
  const [looseEnds, setLooseEnds] = useState<string>(() => {
    const planned = plannedScenesOf(session).map((id) => ctx.store.get("scenes", id)).filter((s) => s && s.status === "planned");
    return planned.map((s) => `Not reached: ${s!.title}`).join("\n");
  });
  const [busy, setBusy] = useState(false);
  // the module's prompts are built once (from the tracker state at wrap-up time)
  const basePrompts = useMemo(() => sessionEndPrompts(ctx, sessionId), [ctx, sessionId]);
  const answers = wrapUpOf(session).answers ?? {};
  const prompts = useMemo(() => {
    const seen = new Set(basePrompts.map((p) => p.id));
    return [...basePrompts, ...(wrapUpOf(session).followUps ?? []).filter((p) => !seen.has(p.id))];
  }, [basePrompts, session]);

  useEffect(() => {
    if (summary !== undefined) return;
    let alive = true;
    sessionLogText(ctx, sessionId)
      .then((text) => alive && setSummary(summaryDraft(text)))
      .catch(() => alive && setSummary(""));
    return () => {
      alive = false;
    };
  }, [ctx, sessionId, summary]);

  if (!session) return null;
  const idx = STEPS.findIndex((s) => s.id === step);
  const answeredCount = prompts.filter((p) => answers[p.id]).length;

  const finish = () => {
    setBusy(true);
    try {
      const result = finishSession(ctx, sessionId, {
        summary: summary ?? "",
        rewards: rewards.filter((r) => r.kind.trim() || r.value.trim()).map((r) => ({ characterId: r.characterId, kind: r.kind.trim() || "reward", value: r.value.trim(), ...(r.note.trim() ? { note: r.note.trim() } : {}) })),
        timeline,
        looseEnds: looseEnds.split("\n"),
      });
      pushToast(`${sessionLabel(result.session)} wrapped up${result.next ? `; ${sessionLabel(result.next)} is planned` : ""}.`, { tone: "success" });
      onDone(result.next?.id);
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
        </div>
        {onCancel && (
          <Button variant="ghost" onClick={onCancel}>
            Back to the table
          </Button>
        )}
      </header>
      <ol className="app-steps" aria-label="Wrap-up steps">
        {STEPS.map((s, i) => (
          <li key={s.id}>
            <button type="button" className={`app-steps__step${s.id === step ? " is-active" : ""}${i < idx ? " is-done" : ""}`} aria-current={s.id === step ? "step" : undefined} onClick={() => setStep(s.id)}>
              <span className="app-steps__num">{i + 1}</span>
              {s.label}
              {s.id === "prompts" && prompts.length > 0 && <span className="cf-muted"> {answeredCount}/{prompts.length}</span>}
            </button>
          </li>
        ))}
      </ol>

      <div className="app-wrapup__body">
        <div className="app-wrapup__main">
          {step === "summary" && (
            <Card title="Summary" subtitle="Drafted from the first lines of the session log. Edit freely.">
              <textarea className="cf-textarea app-wrapup__summary" aria-label="Session summary" rows={8} value={summary ?? ""} placeholder={summary === undefined ? "Reading the log…" : "What happened this session?"} onChange={(e) => setSummary(e.target.value)} />
            </Card>
          )}

          {step === "prompts" && <PromptsStep sessionId={sessionId} prompts={prompts} answers={answers} pcs={pcs} />}

          {step === "rewards" && <RewardsStep pcs={pcs} rewards={rewards} setRewards={setRewards} />}
          {step === "rewards" && <BetweenJobsLink />}

          {step === "timeline" && (
            <Card title="Timeline entries" subtitle={`Dated ${meta.currentDate ?? "(no in-world date set)"}, the campaign's current in-world date.`}>
              {timeline.length === 0 && <p className="cf-muted">No scenes were marked run and no handouts revealed. Add an entry by hand if something happened.</p>}
              <ul className="app-list" aria-label="Timeline entries">
                {timeline.map((t, i) => (
                  <li key={t.key} className="app-list__row">
                    <input type="checkbox" className="cf-checkbox" aria-label={`Include ${t.text}`} checked={t.include} onChange={(e) => setTimeline(timeline.map((x, j) => (j === i ? { ...x, include: e.target.checked } : x)))} />
                    <input className="cf-input app-grow" aria-label="Timeline text" value={t.text} onChange={(e) => setTimeline(timeline.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)))} />
                    <EntityNames ids={t.entities} />
                  </li>
                ))}
              </ul>
              <div className="app-row">
                <Button onClick={() => setTimeline([...timeline, { key: `manual:${Date.now()}`, text: "", entities: [], include: true }])}>+ Entry</Button>
              </div>
            </Card>
          )}

          {step === "loose" && (
            <Card title="Loose ends" subtitle="One per line. They become the plan of the next session.">
              <textarea className="cf-textarea" aria-label="Loose ends" rows={6} value={looseEnds} placeholder="Who sent the signal?" onChange={(e) => setLooseEnds(e.target.value)} />
            </Card>
          )}
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
  const [text, setText] = useState("");
  const [rolling, setRolling] = useState(false);
  const run = (a: Parameters<typeof answerPrompt>[3]) => {
    try {
      answerPrompt(ctx, sessionId, prompt, a);
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
          <SessionRollPanel sessionId={sessionId} entity={entity} {...skillInput(ctx.module, entity, `attr:${check}`)} />
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
                <input className="cf-input app-grow" aria-label="Reward note" placeholder="Note" value={r.note} onChange={(e) => update(r.key, { note: e.target.value })} />
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
