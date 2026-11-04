/** One-click payout on an entity page (e.g. a job's payment into crew funds), posted once per entity, with an undo. */
import { getPath, type Entity } from "@campaign-forge/core";
import { Badge, Button, PageRef, pushToast } from "../../components/ui";
import { useCampaign, useList, useMeta } from "../../state/hooks";
import { ledgerDefOf, money, payoutAmount, payoutFor, postPayout, postedPayout, undoPayout } from "../../state/shipActions";

export function PayoutButton({ entity }: { entity: Entity }) {
  const ctx = useCampaign();
  const meta = useMeta();
  useList("ledger"); // re-render when the ledger changes
  const def = ledgerDefOf(ctx.module, meta.mode);
  const payout = def ? payoutFor(ctx, entity) : undefined;
  if (!def || !payout) return null;
  const posted = postedPayout(ctx, entity, payout);
  const amount = payoutAmount(ctx, entity, payout);
  if (posted) {
    return (
      <span className="app-row" data-testid="payout-done">
        <Badge tone="success" title={`Posted ${posted.inWorldDate ?? posted.realDate}`} data-testid="payout-posted">
          Paid {money(ctx, posted.amount)}
        </Badge>
        <Button
          size="sm"
          variant="ghost"
          title={`Take the ${money(ctx, posted.amount)} back off the ledger`}
          onClick={() => {
            if (undoPayout(ctx, entity, payout)) pushToast(`${payout.label} undone: ${money(ctx, -posted.amount, { sign: true })} back off ${def.defaultAccount}.`, { tone: "warning" });
          }}
          data-testid="payout-undo"
        >
          Undo
        </Button>
      </span>
    );
  }
  // the payout is the next step only once the job is done (its setOnPost value): before that it is a quiet button
  const due = !payout.setOnPost || getPath(entity.fields, payout.setOnPost.path) === payout.setOnPost.value;
  return (
    <span className="app-row">
      <Button
        variant={due ? "primary" : "default"}
        disabled={!(amount > 0)}
        title={due ? undefined : "Collect it once the job is done; this also marks it done."}
        onClick={() => {
          const res = postPayout(ctx, entity, payout);
          pushToast(res.duplicate ? "Already posted." : `${money(ctx, res.entry.amount, { sign: true })} posted to ${def.defaultAccount}. Undo is next to the payment.`, { tone: res.duplicate ? "warning" : "success" });
        }}
        data-testid="payout"
      >
        {payout.label} ({money(ctx, amount)})
      </Button>
      <PageRef page={payout.page} />
    </span>
  );
}
