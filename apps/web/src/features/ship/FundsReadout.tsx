/** Table mode: the group's funds and the crew vehicle's state at a glance (read only; edit on the Ship page). */
import { ledgerBalance } from "@campaign-forge/core";
import { getPath } from "@campaign-forge/module-sdk";
import { Link } from "@tanstack/react-router";
import { useMemo } from "react";
import { Badge } from "../../components/ui";
import { useCampaign, useComputed, useList, useMeta } from "../../state/hooks";
import { crewShipDefOf, ledgerDefOf, money, theCrewShip } from "../../state/shipActions";

export function FundsReadout() {
  const ctx = useCampaign();
  const meta = useMeta();
  const entries = useList("ledger");
  const entities = useList("entities");
  const ledger = ledgerDefOf(ctx.module, meta.mode);
  const shipDef = crewShipDefOf(ctx.module, meta.mode);
  const ship = useMemo(() => (shipDef ? theCrewShip(ctx) : undefined), [ctx, shipDef, entities, meta]);
  const computed = useComputed(ship);
  const balance = useMemo(() => ledgerBalance(ctx.store, { account: null }), [ctx.store, entries]);
  if (!ledger && !ship) return null;
  const read = (path: string) => (ship ? (getPath(ship.fields, path) ?? computed[path]) : undefined);
  return (
    <div className="ship-readout" data-testid="funds-readout" aria-label="Funds and ship">
      {ledger && (
        <span className="app-stat">
          <span className="app-stat__label">{ledger.defaultAccount}</span>
          <span className="app-stat__value">{money(ctx, balance)}</span>
        </span>
      )}
      {ship &&
        (shipDef?.stats ?? [])
          .filter((s) => s.format !== "text" && s.format !== "money")
          .map((s) => {
            const v = read(s.path);
            if (s.format === "flag") return v === true ? <Badge key={s.path} tone="danger">{s.label}</Badge> : null;
            const max = s.max ? read(s.max) : undefined;
            return (
              <span key={s.path} className="app-stat">
                <span className="app-stat__label">{s.label}</span>
                <span className="app-stat__value">
                  {typeof v === "number" ? v : "—"}
                  {max !== undefined ? `/${String(max)}` : ""}
                </span>
              </span>
            );
          })}
      <Link to="/c/$campaignId/ship" params={{ campaignId: ctx.campaignId }} className="app-link-strong cf-small">
        {ship ? ship.name : "Ledger"}
      </Link>
    </div>
  );
}
