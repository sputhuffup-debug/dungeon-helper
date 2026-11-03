/**
 * "Set up your campaign": the checklist a new campaign's Home page leads
 * with until every step is done. Steps come from the core and the module;
 * each ticks itself from campaign data (core setup.ts), never from a click,
 * and links straight to where it is done. "Hide this" turns it off; Settings
 * turns it back on.
 */
import type { CampaignSetup } from "@campaign-forge/core";
import { Link } from "@tanstack/react-router";
import { Button, Card, PageRef, pushToast } from "../../components/ui";
import { useCampaign } from "../../state/hooks";
import { setSetupGuideShown, setupLinkTarget } from "../../state/setupActions";
import "./setup.css";

export function SetupGuide({ setup }: { setup: CampaignSetup }) {
  const ctx = useCampaign();
  const next = setup.steps.find((s) => !s.done);
  const percent = setup.total ? Math.round((setup.done / setup.total) * 100) : 0;
  const hide = () => {
    setSetupGuideShown(ctx, false);
    pushToast("Setup guide hidden. Settings can show it again.", { action: { label: "Undo", onClick: () => setSetupGuideShown(ctx, true) } });
  };
  return (
    <Card
      title="Set up your campaign"
      subtitle="Each step ticks itself as the campaign fills in."
      className="setup-guide"
      aria-label="Set up your campaign"
      data-testid="setup-guide"
      actions={
        <Button variant="ghost" size="sm" onClick={hide} data-testid="setup-hide">
          Hide this
        </Button>
      }
    >
      <div className="setup-guide__progress">
        <span className="setup-guide__count" data-testid="setup-progress">
          {setup.done} of {setup.total} done
        </span>
        <span className="setup-guide__bar" role="progressbar" aria-label="Setup progress" aria-valuemin={0} aria-valuemax={setup.total} aria-valuenow={setup.done}>
          <span style={{ width: `${percent}%` }} />
        </span>
      </div>
      <ol className="setup-guide__steps" aria-label="Setup steps">
        {setup.steps.map((step, i) => {
          const isNext = step === next;
          const primary = step.links.find((l) => l.primary) ?? step.links[0];
          return (
            <li key={step.id} className={`setup-step${step.done ? " is-done" : ""}${isNext ? " is-next" : ""}`} data-step={step.id} data-done={step.done ? "true" : "false"} aria-current={isNext ? "step" : undefined}>
              <span className="setup-step__mark" aria-hidden="true">
                {step.done ? "✓" : i + 1}
              </span>
              <div className="setup-step__body">
                <div className="setup-step__line">
                  <span className="setup-step__label">{step.label}</span>
                  {step.count && !step.done && (
                    <span className="cf-muted setup-step__count">
                      {step.count.value} of {step.count.of}
                    </span>
                  )}
                  <span className="cf-sr-only">{step.done ? " (done)" : " (to do)"}</span>
                  {!step.done && <PageRef page={step.page} />}
                </div>
                {!step.done && step.hint && <p className="cf-muted setup-step__hint">{step.hint}</p>}
                {!step.done && step.links.length > 0 && (
                  <div className="setup-step__links">
                    {step.links.map((link) => {
                      const target = setupLinkTarget(link, ctx.campaignId);
                      if (!target) return null;
                      const main = isNext && link === primary;
                      return (
                        <Link key={link.label} to={target.to} params={target.params as never} search={target.search as never} className={`cf-btn cf-btn--sm${main ? " cf-btn--primary" : ""}`}>
                          {link.label}
                        </Link>
                      );
                    })}
                  </div>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </Card>
  );
}
