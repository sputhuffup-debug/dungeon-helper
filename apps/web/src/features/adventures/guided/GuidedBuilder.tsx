/**
 * The guided adventure builder: a step rail with a status dot per step, the
 * step's form, and a field guide with the step's tips. The steps, fields,
 * tips and review rules come from the module's builder; the review grades
 * the draft as the GM edits and never blocks saving or leaving.
 */
import type { Adventure } from "@campaign-forge/core";
import type { AdventureBuilderDef, BuilderPanel, ReviewResult, ReviewStepStatus } from "@campaign-forge/module-sdk";
import { Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef } from "react";
import { Badge, Button, PageRef } from "../../../components/ui";
import { adventureTitle } from "../../../lib/format";
import { useCampaign, useMeta } from "../../../state/hooks";
import { SiteMapCard, siteMapSteps } from "../../mapgen/SiteMapCard";
import { statusTone } from "../AdventuresPage";
import { ActPanel, AdventurePanel, AgendasPanel, CastPanel, ReviewPanel, reviewSummaryLine } from "./panels";
import { useAdventureReview } from "./useAdventureReview";

const STATUS_LABELS: Record<ReviewStepStatus | "pending", string> = {
  bad: "Has items to fix",
  warn: "Has warnings",
  ok: "No issues",
  none: "Nothing to check",
  pending: "Checking",
};

export function stepStatus(result: ReviewResult | undefined, stepId: string): ReviewStepStatus | "pending" {
  return result ? (result.byStep[stepId] ?? "none") : "pending";
}

export function ViewToggle({ adventureId, current }: { adventureId: string; current: "guided" | "outline" }) {
  const ctx = useCampaign();
  return (
    <div className="guided-toggle" role="group" aria-label="View">
      <Link
        to="/c/$campaignId/adventures/$adventureId"
        params={{ campaignId: ctx.campaignId, adventureId }}
        search={{}}
        className={`cf-btn cf-btn--sm${current === "guided" ? " is-active" : ""}`}
        aria-current={current === "guided" ? "page" : undefined}
        data-testid="view-guided"
      >
        Guided
      </Link>
      <Link
        to="/c/$campaignId/adventures/$adventureId"
        params={{ campaignId: ctx.campaignId, adventureId }}
        search={{ view: "outline" }}
        className={`cf-btn cf-btn--sm${current === "outline" ? " is-active" : ""}`}
        aria-current={current === "outline" ? "page" : undefined}
        data-testid="view-outline"
      >
        Outline
      </Link>
    </div>
  );
}

function Panel({ adventure, builder, panel, review, onJump }: { adventure: Adventure; builder: AdventureBuilderDef; panel: BuilderPanel; review: ReviewResult | undefined; onJump: (id: string) => void }) {
  switch (panel.kind) {
    case "adventure":
      return <AdventurePanel adventure={adventure} fields={panel.fields} />;
    case "cast": {
      const role = builder.cast.find((r) => r.id === panel.role);
      return role ? <CastPanel adventure={adventure} role={role} /> : null;
    }
    case "agendas": {
      const role = builder.cast.find((r) => r.id === panel.role);
      return role ? <AgendasPanel adventure={adventure} role={role} /> : null;
    }
    case "act":
      return <ActPanel adventure={adventure} panel={panel} />;
    case "review":
      return <ReviewPanel result={review} builder={builder} onJump={onJump} />;
    default:
      return null;
  }
}

export function GuidedBuilder({ adventure, builder, stepId }: { adventure: Adventure; builder: AdventureBuilderDef; stepId: string | undefined }) {
  const ctx = useCampaign();
  const navigate = useNavigate({ from: "/c/$campaignId/adventures/$adventureId" });
  const review = useAdventureReview(adventure.id, builder);
  const found = builder.steps.findIndex((s) => s.id === stepId);
  const index = found < 0 ? 0 : found;
  const step = builder.steps[index];
  const formRef = useRef<HTMLElement>(null);
  const mode = useMeta().mode;
  const mapSteps = useMemo(() => siteMapSteps(builder, ctx.module, mode), [builder, ctx.module, mode]);

  const go = (id: string) => void navigate({ search: { step: id }, replace: true });
  const railRef = useRef<HTMLElement>(null);
  // A new step starts at the top of the form, with its rail button in view (the rail scrolls sideways on phones).
  useEffect(() => {
    formRef.current?.scrollIntoView?.({ block: "nearest" });
    const rail = railRef.current;
    const active = rail?.querySelector<HTMLElement>(".guided__step.is-active");
    if (rail && active && rail.scrollWidth > rail.clientWidth) {
      const r = rail.getBoundingClientRect();
      const a = active.getBoundingClientRect();
      rail.scrollLeft += a.left - r.left - (r.width - a.width) / 2;
    }
  }, [index]);

  if (!step) return null;
  const prev = builder.steps[index - 1];
  const next = builder.steps[index + 1];

  return (
    <div className="app-page guided" data-testid="guided-builder" data-builder={builder.id}>
      <header className="guided__header">
        <div className="app-stack guided__titles">
          <p className="cf-muted">
            <Link to="/c/$campaignId/adventures" params={{ campaignId: ctx.campaignId }} search={{}} className="app-link-strong">
              Adventures
            </Link>{" "}
            <Badge tone={statusTone(adventure.status)}>{adventure.status}</Badge> · {builder.name} <PageRef page={builder.page} />
          </p>
          <h1 className="app-title" data-testid="guided-heading">
            {adventureTitle(adventure)}
          </h1>
        </div>
        <div className="app-row guided__header-end">
          {review && (
            <Badge tone={review.summary.bad ? "danger" : review.summary.warn ? "warning" : "success"} data-testid="guided-summary">
              {reviewSummaryLine(review)}
            </Badge>
          )}
          <ViewToggle adventureId={adventure.id} current="guided" />
        </div>
      </header>

      <div className="guided__body">
        <nav className="guided__rail" aria-label="Builder steps" ref={railRef}>
          <ol>
            {builder.steps.map((s, i) => {
              const status = stepStatus(review, s.id);
              return (
                <li key={s.id}>
                  <button
                    type="button"
                    className={`guided__step${i === index ? " is-active" : ""}`}
                    aria-current={i === index ? "step" : undefined}
                    onClick={() => go(s.id)}
                    data-testid={`step-${s.id}`}
                    data-status={status}
                  >
                    <span className={`guided__dot is-${status}`} aria-hidden="true" title={STATUS_LABELS[status]} />
                    <span className="guided__step-n">{i + 1}</span>
                    <span className="guided__step-title">{s.title}</span>
                    <span className="cf-sr-only">({STATUS_LABELS[status]})</span>
                  </button>
                </li>
              );
            })}
          </ol>
        </nav>

        <section className="guided__form" aria-labelledby="guided-step-title" ref={formRef} data-step={step.id}>
          <h2 className="guided__step-heading" id="guided-step-title">
            {index + 1}. {step.title} <PageRef page={step.page} />
          </h2>
          <div className="app-stack">
            {step.panels.map((panel, i) => (
              <Panel key={`${step.id}-${i}`} adventure={adventure} builder={builder} panel={panel} review={review} onJump={go} />
            ))}
            {mapSteps.includes(step.id) && <SiteMapCard adventure={adventure} />}
          </div>
          <footer className="guided__nav">
            {prev ? (
              <Button onClick={() => go(prev.id)} data-testid="step-prev">
                ← {prev.title}
              </Button>
            ) : (
              <span />
            )}
            {next && (
              <Button variant="primary" onClick={() => go(next.id)} data-testid="step-next">
                {next.title} →
              </Button>
            )}
          </footer>
        </section>

        <aside className="guided__guide" aria-label="Field guide">
          <h3 className="guided__guide-title">Field guide</h3>
          {step.guide && step.guide.length > 0 ? (
            <ul className="guided__tips">
              {step.guide.map((tip, i) => (
                <li key={i}>{tip}</li>
              ))}
            </ul>
          ) : (
            <p className="cf-muted">No tips for this step.</p>
          )}
          {step.page !== undefined && (
            <p className="cf-muted app-small">
              See the rulebook, <PageRef page={step.page} />.
            </p>
          )}
          {review && (
            <StepIssues review={review} stepId={step.id} />
          )}
        </aside>
      </div>
    </div>
  );
}

/** The current step's open review items, in the guide column. */
function StepIssues({ review, stepId }: { review: ReviewResult; stepId: string }) {
  const items = review.items.filter((i) => i.step === stepId && i.level !== "ok");
  if (items.length === 0) return null;
  return (
    <div className="guided__issues" data-testid="step-issues">
      <h4 className="prep-h4">For this step</h4>
      <ul className="guided-review">
        {items.map((item, i) => (
          <li key={`${item.ruleId}-${i}`} className={`guided-review__item is-${item.level}`}>
            <span className="guided-review__icon" aria-hidden="true">
              {item.level === "bad" ? "✕" : "!"}
            </span>
            <span className="guided-review__message">{item.message}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
