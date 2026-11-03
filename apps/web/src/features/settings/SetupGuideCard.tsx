/**
 * Settings, Setup guide: how far the campaign's "Set up your campaign"
 * checklist has got, and the switch that shows it on Home again after
 * "Hide this" (or for a campaign made before the guide existed).
 */
import { Link } from "@tanstack/react-router";
import { Button, Card } from "../../components/ui";
import { useCampaign } from "../../state/hooks";
import { setSetupGuideShown, useCampaignSetup } from "../../state/setupActions";

export function SetupGuideCard() {
  const ctx = useCampaign();
  const setup = useCampaignSetup();
  const on = setup.shown;
  return (
    <Card title="Setup guide" subtitle="The checklist on Home that walks a new campaign to its first session." id="settings-setup" data-testid="setup-guide-settings">
      <div className="app-row">
        <span data-testid="setup-guide-status">
          {setup.complete ? `All ${setup.total} steps done.` : `${setup.done} of ${setup.total} steps done.`} {on ? "Shown on Home." : ""}
        </span>
        {!setup.complete && !on && (
          <Button onClick={() => setSetupGuideShown(ctx, true)} data-testid="setup-show">
            Show the setup guide on Home
          </Button>
        )}
        {on && (
          <>
            <Link to="/c/$campaignId/home" params={{ campaignId: ctx.campaignId }} className="cf-btn">
              Open it
            </Link>
            <Button variant="ghost" onClick={() => setSetupGuideShown(ctx, false)}>
              Hide it
            </Button>
          </>
        )}
      </div>
    </Card>
  );
}
