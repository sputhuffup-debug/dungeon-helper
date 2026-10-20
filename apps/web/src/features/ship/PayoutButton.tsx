/** One-click payout on an entity page (e.g. a job's payment into crew funds), posted once per entity. */
import { ledgerEntryByKey, type Entity } from "@campaign-forge/core";
import { Badge, Button, PageRef, pushToast } from "../../components/ui";
import { useCampaign, useList, useMeta } from "../../state/hooks";
import { ledgerDefOf, money, payoutAmount, payoutFor, payoutKey, postPayout } from "../../state/shipActions";

export function PayoutButton({ entity }: { entity: Entity }) {
  const ctx = useCampaign();
  const meta = useMeta();
  useList("ledger"); // re-render when the ledger changes
  const def = ledgerDefOf(ctx.module, meta.mode);
  const payout = def ? payoutFor(ctx, entity) : undefined;
  if (!def || !payout) return null;
  const posted = ledgerEntryByKey(ctx.store, payoutKey(payout, entity.id));
  const amount = payoutAmount(ctx, entity, payout);
  if (posted) {
    return (
      <Badge tone="success" title={`Posted ${posted.inWorldDate ?? posted.realDate}`} data-testid="payout-posted">
        Paid {money(ctx, posted.amount)}
      </Badge>
    );
  }
  return (
    <span className="app-row">
      <Button
        variant="primary"
        disabled={!(amount > 0)}
        onClick={() => {
          const res = postPayout(ctx, entity, payout);
          pushToast(res.duplicate ? "Already posted." : `${money(ctx, res.entry.amount, { sign: true })} posted to ${def.defaultAccount}.`, { tone: res.duplicate ? "warning" : "success" });
        }}
        data-testid="payout"
      >
        {payout.label} ({money(ctx, amount)})
      </Button>
      <PageRef page={payout.page} />
    </span>
  );
}
