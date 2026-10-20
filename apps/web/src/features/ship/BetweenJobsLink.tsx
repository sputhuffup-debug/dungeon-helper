/** Session wrap-up: a way into the module's between-jobs procedure and the ledger, when the module has them. */
import { Link } from "@tanstack/react-router";
import { Card, PageRef } from "../../components/ui";
import { useCampaign, useMeta } from "../../state/hooks";
import { crewShipDefOf, ledgerDefOf } from "../../state/shipActions";

export function BetweenJobsLink() {
  const ctx = useCampaign();
  const meta = useMeta();
  const ship = crewShipDefOf(ctx.module, meta.mode);
  const ledger = ledgerDefOf(ctx.module, meta.mode);
  const procedure = ship?.betweenJobs ? ctx.module.procedure(ship.betweenJobs) : undefined;
  if (!procedure && !ledger) return null;
  return (
    <Card title="Money and the ship" subtitle="Pay-outs, bills and repairs go on the ledger, not on the session." data-testid="wrapup-between-jobs">
      <div className="app-row">
        {procedure && (
          <Link to="/c/$campaignId/generate/$procedureId" params={{ campaignId: ctx.campaignId, procedureId: procedure.id }} className="cf-btn cf-btn--primary" data-testid="wrapup-between-jobs-link">
            Run {procedure.name.toLowerCase()}
          </Link>
        )}
        <Link to="/c/$campaignId/ship" params={{ campaignId: ctx.campaignId }} className="cf-btn">
          Open the {ship?.label?.toLowerCase() ?? "ledger"} page
        </Link>
        {procedure && <PageRef page={procedure.page} />}
      </div>
    </Card>
  );
}
