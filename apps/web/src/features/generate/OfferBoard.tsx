/**
 * A board of offers in the generator workbench (module-sdk `Procedure.offers`,
 * e.g. the Alien job board): one card per offer with what the players will
 * read beside what only the GM knows, the offer's parts to re-roll or pin
 * one by one, the whole offer re-rolled or pinned, and its own accept
 * actions (take it, keep it as a lead) or discard. Accepted offers link to
 * the record they created.
 */
import type { Id } from "@campaign-forge/core";
import type { GeneratedGraph, Offer, OfferDef, OfferSet } from "@campaign-forge/module-sdk";
import { Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Badge, Button, IconButton, Markdown, pushToast } from "../../components/ui";
import { errorMessage } from "../../lib/format";
import { acceptOffer } from "../../state/offerActions";
import { useCampaign } from "../../state/hooks";
import { SlotRow, type AgendaSlotControls } from "./AgendaDrafts";

export interface OfferRun {
  stepSeeds: Record<string, string>;
  pinned: Record<string, unknown>;
  partSeeds: Record<string, string>;
  pinnedParts: Record<string, unknown>;
}

export function OfferBoard({ def, set, graph, controls, run }: { def: OfferDef; set: OfferSet; graph: GeneratedGraph; controls: AgendaSlotControls & { onRerollOffer: (key: string) => void }; run: OfferRun }) {
  const ctx = useCampaign();
  const navigate = useNavigate();
  const [accepted, setAccepted] = useState<Record<string, { id: Id; name: string; kept: boolean }>>({});
  const [discarded, setDiscarded] = useState<string[]>([]);
  const [busy, setBusy] = useState<string | undefined>();
  const shown = set.offers.filter((o) => !discarded.includes(o.key));

  const take = async (offer: Offer, as: "accept" | "keep") => {
    setBusy(offer.key);
    try {
      const res = await acceptOffer(ctx, { graph, offer, def, as, ...run });
      const root = res.root ? ctx.store.get("entities", res.root) : undefined;
      if (root) setAccepted((a) => ({ ...a, [offer.key]: { id: root.id, name: root.name, kept: as === "keep" } }));
      pushToast(`${as === "keep" ? "Kept" : "Accepted"} the ${def.noun} with ${res.entities.length} entit${res.entities.length === 1 ? "y" : "ies"}${res.handout ? " and a handout for the players" : ""}.`, { tone: "success" });
      if (as === "accept" && root) void navigate({ to: "/c/$campaignId/entities/$entityId", params: { campaignId: ctx.campaignId, entityId: root.id } });
    } catch (e) {
      pushToast(`Accept failed: ${errorMessage(e)}`, { tone: "danger" });
    } finally {
      setBusy(undefined);
    }
  };

  return (
    <section className="app-stack" aria-label="Offers" data-testid="offer-board">
      {set.note && <p className="cf-muted app-small">{set.note}</p>}
      {shown.map((offer, i) => {
        const pinned = Object.prototype.hasOwnProperty.call(controls.pinnedParts, offer.key);
        const done = accepted[offer.key];
        return (
          <article key={offer.key} className={`offer-card${pinned ? " is-pinned" : ""}`} data-testid="offer-card" data-offer={offer.key} aria-label={offer.title}>
            <header className="offer-card__head">
              <div className="app-stack offer-card__title">
                <h3 className="offer-card__name">
                  <span className="cf-muted">{def.noun.charAt(0).toUpperCase() + def.noun.slice(1)} {i + 1}:</span> {offer.title}
                </h3>
                <span className="app-row offer-card__badges">
                  {(offer.badges ?? []).map((b, k) => (
                    <Badge key={k} tone={b.tone ?? "muted"} title={b.gmOnly ? "GM only" : "On the posting"} data-gm-only={b.gmOnly ? "" : undefined}>
                      {b.gmOnly ? `GM: ${b.label}` : b.label}
                    </Badge>
                  ))}
                </span>
              </div>
              <span className="app-row offer-card__tools">
                <IconButton size="sm" variant="ghost" icon="↻" label={`Re-roll ${def.noun} ${i + 1}`} disabled={pinned || !!done} onClick={() => controls.onRerollOffer(offer.key)} />
                <IconButton
                  size="sm"
                  variant="ghost"
                  icon={pinned ? "●" : "○"}
                  label={`${pinned ? "Unpin" : "Pin"} ${def.noun} ${i + 1}`}
                  active={pinned}
                  onClick={() => (pinned ? controls.onUnpin(offer.key) : controls.onPin(offer.key))}
                />
              </span>
            </header>
            <div className="offer-card__body">
              <section className="offer-card__players" aria-label="What the players read" data-testid="offer-player-text">
                <h4 className="offer-card__label">Players read</h4>
                <Markdown text={offer.playerText} />
              </section>
              <section className="offer-card__gm" aria-label="GM only" data-testid="offer-gm-text">
                <h4 className="offer-card__label">GM only</h4>
                <Markdown text={offer.gmText} />
              </section>
            </div>
            <details className="offer-card__parts">
              <summary>Parts to re-roll or pin ({offer.slots.length})</summary>
              <ul className="agenda-slots">
                {offer.slots.map((s) => (
                  <SlotRow key={s.key} slot={{ ...s, label: s.gmOnly ? `${s.label} (GM)` : s.label }} who={offer.title} controls={controls} />
                ))}
              </ul>
            </details>
            <footer className="app-row offer-card__actions">
              {done ? (
                <span data-testid="offer-accepted">
                  {done.kept ? "Kept as a lead:" : "Accepted:"}{" "}
                  <Link to="/c/$campaignId/entities/$entityId" params={{ campaignId: ctx.campaignId, entityId: done.id }} className="app-link-strong">
                    {done.name}
                  </Link>
                </span>
              ) : (
                <>
                  <Button variant="primary" disabled={busy !== undefined} onClick={() => void take(offer, "accept")} data-testid="offer-accept">
                    {def.accept.label}
                  </Button>
                  {def.keep && (
                    <Button disabled={busy !== undefined} onClick={() => void take(offer, "keep")} data-testid="offer-keep">
                      {def.keep.label}
                    </Button>
                  )}
                  <Button variant="ghost" onClick={() => setDiscarded((d) => [...d, offer.key])} data-testid="offer-discard">
                    Discard
                  </Button>
                </>
              )}
            </footer>
          </article>
        );
      })}
      {discarded.length > 0 && (
        <p className="cf-muted app-row" data-testid="offers-discarded">
          {discarded.length} {def.noun}
          {discarded.length === 1 ? "" : "s"} discarded.
          <Button size="sm" variant="ghost" onClick={() => setDiscarded([])}>
            Show again
          </Button>
        </p>
      )}
    </section>
  );
}
