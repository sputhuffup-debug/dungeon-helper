/**
 * `/build?draft=&step=`: the character builder wizard. A stepper with each
 * step's status and progress, the step's choices (cards, sub-choices, ability
 * methods, typed fields, the review), Back and Next, and a running summary of
 * the character (scores, hit points, AC and what the module previews). The
 * draft is saved in the campaign as the player goes, so it can be left and
 * resumed; finishing creates the character (or applies the level-up).
 */
import { builderSteps, evaluateLogic, signed, type CharacterBuilderAbilityStep, type CharacterBuilderDef, type CharacterBuilderStep, type StepState } from "@campaign-forge/module-sdk";
import { Link, useNavigate, useSearch } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { Badge, Button, EmptyState, PageRef, pushToast } from "../../components/ui";
import { errorMessage } from "../../lib/format";
import { useCampaign, useMeta, useRecord } from "../../state/hooks";
import { AbilitiesView } from "./AbilitiesView";
import { ChoiceView } from "./ChoiceView";
import { discardDraft, draftLabel, finishDraft, readDraft, resolveDraft, saveDraft, type StoredDraft } from "./drafts";
import { FieldsView } from "./FieldsView";
import { ReviewView } from "./ReviewView";
import "./builder.css";

const STATUS_LABEL: Record<StepState["status"], string> = { ok: "Done", incomplete: "To do", error: "Needs a fix" };

export function CharacterBuilderPage() {
  const ctx = useCampaign();
  const meta = useMeta();
  const search = useSearch({ from: "/c/$campaignId/build" });
  const stored = useMemo(() => readDraft(meta.settings, search.draft), [meta.settings, search.draft]);
  const builder = stored ? ctx.module.characterBuilder(stored.builder) : undefined;
  if (!stored || !builder) {
    return (
      <div className="app-page">
        <EmptyState
          title={stored ? "This module has no such builder" : "No such draft"}
          text={stored ? "The campaign's module no longer offers the builder this draft was made with." : "It may have been finished or discarded."}
          action={
            <Link to="/c/$campaignId/atlas" params={{ campaignId: ctx.campaignId }} search={{ tab: "pcs" }} className="cf-btn">
              Back to the PCs
            </Link>
          }
        />
        {stored && (
          <Button variant="ghost" onClick={() => discardDraft(ctx, stored.id)}>
            Discard the draft
          </Button>
        )}
      </div>
    );
  }
  return <Wizard key={stored.id} initial={stored} builder={builder} stepParam={search.step} />;
}

function Wizard({ initial, builder, stepParam }: { initial: StoredDraft; builder: CharacterBuilderDef; stepParam: string | undefined }) {
  const ctx = useCampaign();
  const meta = useMeta();
  const navigate = useNavigate();
  const entity = useRecord("entities", initial.entity);
  const [draft, setDraftState] = useState(initial);
  const dirty = useRef(false);
  const setDraft = useCallback((next: StoredDraft | ((d: StoredDraft) => StoredDraft)) => {
    dirty.current = true;
    setDraftState(next);
  }, []);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const module = ctx.module.module;
  const def = ctx.module.entityType(builder.entityType);
  const result = useMemo(() => resolveDraft(module, builder, draft, entity), [module, builder, draft, entity]);
  const steps = useMemo(() => builderSteps(builder, draft.mode), [builder, draft.mode]);
  const visible = result.steps.filter((s) => !s.skipped);

  // save as the player goes (a little after the last change), and when leaving
  const pending = useRef<StoredDraft | undefined>(undefined);
  const closed = useRef(false);
  useEffect(() => {
    if (!dirty.current) return;
    pending.current = draft;
    const t = setTimeout(() => {
      if (!closed.current && pending.current) saveDraft(ctx, pending.current);
      pending.current = undefined;
    }, 350);
    return () => clearTimeout(t);
  }, [draft, ctx]);
  useEffect(
    () => () => {
      if (!closed.current && pending.current) saveDraft(ctx, pending.current);
    },
    [ctx],
  );

  const stepId = visible.some((s) => s.id === stepParam) ? stepParam! : visible.some((s) => s.id === draft.step) ? draft.step! : visible[0]?.id;
  const index = visible.findIndex((s) => s.id === stepId);
  const state = visible[index];
  const step = steps.find((s) => s.id === stepId);
  const go = useCallback(
    (id: string) => {
      setDraft((d) => ({ ...d, step: id, visited: [...new Set([...(d.visited ?? []), ...(d.step ? [d.step] : []), id])] }));
      void navigate({ to: "/c/$campaignId/build", params: { campaignId: ctx.campaignId }, search: { draft: initial.id, step: id }, replace: true });
    },
    [navigate, ctx.campaignId, initial.id],
  );
  const mainRef = useRef<HTMLElement>(null);
  useEffect(() => {
    mainRef.current?.scrollIntoView?.({ block: "nearest" });
  }, [stepId]);

  const seen = new Set([...(draft.visited ?? []), ...(stepId ? [stepId] : [])]);
  /** A step the player has not opened yet reads "to do", even when nothing in it is missing. */
  const statusOf = (s: StepState): StepState["status"] => (s.status === "ok" && !seen.has(s.id) ? "incomplete" : s.status);
  const done = visible.filter((s) => statusOf(s) === "ok").length;
  const finish = () => {
    try {
      closed.current = true;
      const id = finishDraft(ctx, builder, draft, result);
      pushToast(draft.mode === "levelUp" ? `${entity?.name ?? "The character"} is now level ${String(result.fields.level ?? "")}.` : `${result.name ?? "The character"} is ready.`, { tone: "success" });
      void navigate({ to: "/c/$campaignId/entities/$entityId", params: { campaignId: ctx.campaignId, entityId: id } });
    } catch (e) {
      closed.current = false;
      pushToast(errorMessage(e), { tone: "danger" });
    }
  };
  const leave = () => {
    if (!closed.current && pending.current) saveDraft(ctx, pending.current);
    pending.current = undefined;
    if (draft.mode === "levelUp" && draft.entity) void navigate({ to: "/c/$campaignId/entities/$entityId", params: { campaignId: ctx.campaignId, entityId: draft.entity } });
    else void navigate({ to: "/c/$campaignId/atlas", params: { campaignId: ctx.campaignId }, search: { tab: "pcs" } });
  };

  const title = draft.mode === "levelUp" ? `${builder.levelUp?.title ?? "Level up"}: ${entity?.name ?? "character"}` : builder.name;
  const prev = visible[index - 1];
  const next = visible[index + 1];

  return (
    <div className="app-page cb" data-testid="character-builder" data-mode={draft.mode}>
      <header className="cb__header">
        <div className="app-stack">
          <p className="cf-muted cb__crumbs">
            <Link to="/c/$campaignId/atlas" params={{ campaignId: ctx.campaignId }} search={{ tab: "pcs" }} className="app-link-strong">
              PCs
            </Link>{" "}
            · {ctx.module.manifest.name}
          </p>
          <h1 className="app-title" data-testid="builder-title">
            {title}
          </h1>
        </div>
        <div className="app-row cb__header-end">
          <span className="cb__progress" aria-label={`${done} of ${visible.length} steps done`}>
            <progress max={visible.length} value={done} /> <span className="cf-muted">{done} of {visible.length} done</span>
          </span>
          <Button onClick={leave} data-testid="builder-keep">
            Keep for later
          </Button>
          <Button variant="ghost" onClick={() => setConfirmDiscard(true)} data-testid="builder-discard">
            Discard
          </Button>
        </div>
      </header>

      <div className="cb__body">
        <nav className="cb__rail" aria-label="Builder steps">
          <ol>
            {visible.map((s, i) => (
              <li key={s.id}>
                <button type="button" className={`cb__step${i === index ? " is-active" : ""}`} aria-current={i === index ? "step" : undefined} onClick={() => go(s.id)} data-testid={`step-${s.id}`} data-status={statusOf(s)}>
                  <span className={`cb__dot is-${statusOf(s)}`} aria-hidden="true" title={STATUS_LABEL[statusOf(s)]} />
                  <span className="cb__step-n">{i + 1}</span>
                  <span className="cb__step-text">
                    <span className="cb__step-title">{s.title}</span>
                    {s.summary && <span className="cb__step-summary">{s.summary}</span>}
                  </span>
                  <span className="cf-sr-only">({STATUS_LABEL[statusOf(s)]})</span>
                </button>
              </li>
            ))}
          </ol>
        </nav>

        <section className="cb__main" aria-labelledby="cb-step-title" ref={mainRef} data-step={stepId}>
          {step && state && (
            <>
              <h2 className="cb__step-heading" id="cb-step-title">
                {index + 1}. {step.title} <PageRef page={step.page} cite={step.cite} original={step.original} />
              </h2>
              {step.intro && <p className="cf-muted cb__intro">{step.intro}</p>}
              <StepBody step={step} state={state} draft={draft} onDraft={setDraft} builder={builder} result={result} steps={steps} onJump={go} mode={meta.mode} />
              {state.issues.filter((i) => !i.path && i.level === "error").length > 0 && (
                <ul className="cb-issues" role="alert">
                  {state.issues
                    .filter((i) => !i.path && i.level === "error")
                    .map((i, n) => (
                      <li key={n} className="cb-issue is-error">
                        {i.message}
                      </li>
                    ))}
                </ul>
              )}
            </>
          )}
          <footer className="cb__nav">
            {prev ? (
              <Button onClick={() => go(prev.id)} data-testid="builder-back">
                ← {prev.title}
              </Button>
            ) : (
              <span />
            )}
            {next ? (
              <Button variant="primary" onClick={() => go(next.id)} data-testid="builder-next">
                {next.title} →
              </Button>
            ) : (
              <Button variant="primary" disabled={!result.complete} onClick={finish} data-testid="builder-finish" title={result.complete ? undefined : "Some choices are still missing"}>
                {draft.mode === "levelUp" ? "Apply the new level" : "Create character"}
              </Button>
            )}
          </footer>
        </section>

        <SideSummary builder={builder} result={result} draft={draft} stepCount={visible.length} done={done} />
      </div>

      <ConfirmDialog
        open={confirmDiscard}
        title="Discard this draft?"
        confirmLabel="Discard"
        danger
        onCancel={() => setConfirmDiscard(false)}
        onConfirm={() => {
          setConfirmDiscard(false);
          closed.current = true;
          discardDraft(ctx, draft.id);
          leave();
        }}
      >
        <p>Every choice made so far is lost.</p>
      </ConfirmDialog>
    </div>
  );
}

function StepBody({
  step,
  state,
  draft,
  onDraft,
  builder,
  result,
  steps,
  onJump,
  mode,
}: {
  step: CharacterBuilderStep;
  state: StepState;
  draft: StoredDraft;
  onDraft: (d: StoredDraft) => void;
  builder: CharacterBuilderDef;
  result: ReturnType<typeof resolveDraft>;
  steps: CharacterBuilderStep[];
  onJump: (id: string) => void;
  mode: string;
}) {
  const ctx = useCampaign();
  const def = ctx.module.entityType(builder.entityType);
  switch (step.kind) {
    case "choice":
      return state.choice ? <ChoiceView choice={state.choice} draft={draft} onDraft={onDraft} /> : null;
    case "abilities":
      return <AbilitiesView step={step} state={state.abilities} draft={draft} onDraft={onDraft} />;
    case "fields":
      return <FieldsView module={ctx.module.module} def={def} step={step} draft={draft} onDraft={onDraft} />;
    case "review":
      return <ReviewView module={ctx.module.module} builder={builder} def={def} steps={steps} result={result} mode={mode} onJump={onJump} />;
    default:
      return null;
  }
}

/** The character so far: name, scores with modifiers, and the module's preview lines. */
function SideSummary({ builder, result, draft, stepCount, done }: { builder: CharacterBuilderDef; result: ReturnType<typeof resolveDraft>; draft: StoredDraft; stepCount: number; done: number }) {
  const abilityStep = builder.steps.find((s): s is CharacterBuilderAbilityStep => s.kind === "abilities");
  const scores = abilityStep
    ? abilityStep.abilities.map((a) => {
        const score = Number((result.fields[abilityStep.path] as Record<string, unknown> | undefined)?.[a.id] ?? 0);
        let mod: number | undefined;
        try {
          const m = abilityStep.modifier !== undefined ? evaluateLogic(abilityStep.modifier, { score }) : undefined;
          if (typeof m === "number") mod = m;
        } catch {
          mod = undefined;
        }
        return { id: a.id, label: a.abbr ?? a.name, score, mod };
      })
    : [];
  const missing = result.issues.filter((i) => i.level !== "warning").length;
  return (
    <aside className="cb__summary" aria-label="The character so far" data-testid="builder-summary">
      <h2 className="cb__summary-name">{draftLabel(draft, result)}</h2>
      {result.summary && result.summary !== draftLabel(draft, result) && <p className="cf-muted cb__summary-line">{result.summary}</p>}
      {scores.length > 0 && (
        <dl className="cb-stats" aria-label="Ability scores">
          {scores.map((s) => (
            <div key={s.id} className="cb-stat" data-testid={`summary-${s.id}`}>
              <dt>{s.label}</dt>
              <dd>
                <span className="cb-stat__score">{s.score}</span>
                {s.mod !== undefined && <span className="cb-stat__mod">{signed(s.mod)}</span>}
              </dd>
            </div>
          ))}
        </dl>
      )}
      {result.preview.length > 0 && (
        <dl className="cb-preview">
          {result.preview.map((p) => (
            <div key={p.label} className="cb-preview__row" data-testid={`preview-${p.label}`}>
              <dt>{p.label}</dt>
              <dd>{p.value}</dd>
            </div>
          ))}
        </dl>
      )}
      <p className="cb__summary-status">
        {missing === 0 ? (
          <Badge tone="success">Ready to finish</Badge>
        ) : (
          <Badge tone="warning">
            {missing} thing{missing === 1 ? "" : "s"} to choose
          </Badge>
        )}{" "}
        <span className="cf-muted">
          {done}/{stepCount} steps
        </span>
      </p>
    </aside>
  );
}
