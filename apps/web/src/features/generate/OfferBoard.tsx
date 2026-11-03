/**
 * A board of offers in the generator workbench (module-sdk `Procedure.offers`,
 * e.g. the Alien job board): one card per offer with what the players will
 * read beside what only the GM knows, the offer's parts to re-roll or pin
 * one by one, the whole offer re-rolled or pinned, and its own accept
 * actions (take it, keep it as a lead) or discard.
 *
 * The board is the procedure's draft: what was done with each offer is
 * marked on it, so a taken posting stays on the board (pinned, linked to the
 * record it made, with the next step as its main button), the others can be
 * taken later or all kept as leads, and coming back shows the board as it was.
 */
import { generatorDraftOf, type GeneratorDraftOffer, type Id } from "@campaign-forge/core";
import type { GeneratedGraph, Offer, OfferDef, OfferSet } from "@campaign-forge/module-sdk";
import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { Badge, Button, IconButton, Markdown, pushToast } from "../../components/ui";
import { errorMessage } from "../../lib/format";
import { discardDraftOffer, keepOpenOffers, takeDraftOffer } from "../../state/draftActions";
import { useCampaign, useEntityType, useList, useRecord } from "../../state/hooks";
import { RunFromEntityButton } from "../adventures/RunFromEntity";
import { SlotRow, type AgendaSlotControls } from "./AgendaDrafts";

export interface OfferRun {
  stepSeeds: Record<string, string>;
  pinned: Record<string, unknown>;
  partSeeds: Record<string, string>;
  pinnedParts: Record<string, unknown>;
}

/** "Run this job" beside a taken offer, when the module runs its record as an adventure. */
function RunTaken({ id }: { id: Id }) {
  const entity = useRecord("entities", id);
  return entity ? <RunFromEntityButton entity={entity} size="sm" variant="default" /> : null;
}

/** The draft's offer marks, live. */
function useOfferMarks(procedure: string): Record<string, GeneratorDraftOffer> {
  const ctx = useCampaign();
  useList("generatorDrafts");
  return generatorDraftOf(ctx.store, procedure)?.offers ?? {};
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export function OfferBoard({
  procedure,
  def,
  set,
  graph,
  controls,
  run,
  onMarked,
}: {
  procedure: string;
  def: OfferDef;
  set: OfferSet;
  graph: GeneratedGraph;
  controls: AgendaSlotControls & { onRerollOffer: (key: string) => void };
  run: OfferRun;
  /** An offer was taken or kept: the page pins it, so a new seed leaves it as it was. */
  onMarked: (keys: string[]) => void;
}) {
  const ctx = useCampaign();
  const marks = useOfferMarks(procedure);
  const [busy, setBusy] = useState<string | undefined>();
  const discarded = set.offers.filter((o) => marks[o.key]?.as === "discard");
  const shown = set.offers.filter((o) => marks[o.key]?.as !== "discard");
  const open = shown.filter((o) => !marks[o.key]);
  const acted = shown.length - open.length;

  const take = async (offer: Offer, as: "accept" | "keep") => {
    setBusy(offer.key);
    try {
      const res = await takeDraftOffer(ctx, { procedure, graph, offer, def, as, ...run });
      onMarked([offer.key]);
      if (res.thread) {
        pushToast(`Put “${res.thread.title}” on the arc board${res.entities.length ? ", with its sponsor added GM-only" : ""}.`, { tone: "success" });
        return;
      }
      pushToast(`${as === "keep" ? "Kept" : "Accepted"} the ${def.noun} with ${res.entities.length} entit${res.entities.length === 1 ? "y" : "ies"}${res.handout ? " and a handout for the players" : ""}. It stays on the board.`, { tone: "success" });
    } catch (e) {
      pushToast(`Accept failed: ${errorMessage(e)}`, { tone: "danger" });
    } finally {
      setBusy(undefined);
    }
  };

  const keepOthers = async () => {
    setBusy("*");
    try {
      const kept = await keepOpenOffers(ctx, { procedure, graph, def, offers: open, ...run });
      onMarked(open.map((o) => o.key));
      pushToast(`Kept ${kept.length} ${def.noun}${kept.length === 1 ? "" : "s"} as lead${kept.length === 1 ? "" : "s"}.`, { tone: "success" });
    } catch (e) {
      pushToast(`Could not keep them: ${errorMessage(e)}`, { tone: "danger" });
    } finally {
      setBusy(undefined);
    }
  };

  return (
    <section className="app-stack" aria-label="Offers" data-testid="offer-board">
      {set.note && <p className="cf-muted app-small">{set.note}</p>}
      {shown.map((offer) => {
        const i = set.offers.indexOf(offer);
        const pinned = Object.prototype.hasOwnProperty.call(controls.pinnedParts, offer.key);
        const done = marks[offer.key];
        return (
          <article key={offer.key} className={`offer-card${pinned ? " is-pinned" : ""}${done ? " is-done" : ""}`} data-testid="offer-card" data-offer={offer.key} data-state={done?.as ?? "open"} aria-label={offer.title}>
            <header className="offer-card__head">
              <div className="app-stack offer-card__title">
                <h3 className="offer-card__name">
                  <span className="cf-muted">
                    {cap(def.noun)} {i + 1}:
                  </span>{" "}
                  {offer.title}
                </h3>
                <span className="app-row offer-card__badges">
                  {done && (
                    <Badge tone={done.as === "keep" ? "accent" : "success"} data-testid="offer-state">
                      {done.as === "arc" ? "On the arc board" : done.as === "keep" ? "Kept as a lead" : "Taken"}
                    </Badge>
                  )}
                  {(offer.badges ?? []).map((b, k) => (
                    <Badge key={k} tone={b.tone ?? "muted"} title={b.gmOnly ? "GM only" : "On the posting"} data-gm-only={b.gmOnly ? "" : undefined}>
                      {b.gmOnly ? `GM: ${b.label}` : b.label}
                    </Badge>
                  ))}
                </span>
              </div>
              {!done && (
                <span className="app-row offer-card__tools">
                  <IconButton size="sm" variant="ghost" icon="↻" label={`Re-roll ${def.noun} ${i + 1}`} disabled={pinned} onClick={() => controls.onRerollOffer(offer.key)} />
                  <IconButton
                    size="sm"
                    variant="ghost"
                    icon={pinned ? "●" : "○"}
                    label={`${pinned ? "Unpin" : "Pin"} ${def.noun} ${i + 1}`}
                    active={pinned}
                    onClick={() => (pinned ? controls.onUnpin(offer.key) : controls.onPin(offer.key))}
                  />
                </span>
              )}
            </header>
            {offer.influences && offer.influences.length > 0 && (
              <p className="offer-card__influence app-small" data-testid="offer-influence" data-gm-only="">
                <strong>Influenced by:</strong> {offer.influences.join(" · ")}
              </p>
            )}
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
            {!done && (
              <details className="offer-card__parts">
                <summary>Parts to re-roll or pin ({offer.slots.length})</summary>
                <ul className="agenda-slots">
                  {offer.slots.map((s) => (
                    <SlotRow key={s.key} slot={{ ...s, label: s.gmOnly ? `${s.label} (GM)` : s.label }} who={offer.title} controls={controls} />
                  ))}
                </ul>
              </details>
            )}
            <footer className="app-row offer-card__actions">
              {done ? <OfferDone def={def} done={done} /> : (
                <>
                  <Button variant="primary" disabled={busy !== undefined} onClick={() => void take(offer, "accept")} data-testid="offer-accept">
                    {def.accept.label}
                  </Button>
                  {def.keep && (
                    <Button disabled={busy !== undefined} onClick={() => void take(offer, "keep")} data-testid="offer-keep">
                      {def.keep.label}
                    </Button>
                  )}
                  <Button variant="ghost" disabled={busy !== undefined} onClick={() => discardDraftOffer(ctx, procedure, offer.key)} data-testid="offer-discard">
                    Discard
                  </Button>
                </>
              )}
            </footer>
          </article>
        );
      })}
      {(acted > 0 || discarded.length > 0) && (
        <div className="app-row offer-board__foot" data-testid="offers-foot">
          {acted > 0 && (
            <span className="cf-muted" data-testid="offers-acted">
              {acted} of {shown.length} {def.noun}
              {shown.length === 1 ? "" : "s"} {def.keep ? "taken or kept" : "accepted"}.
            </span>
          )}
          {acted > 0 && def.keep && open.length > 0 && (
            <Button disabled={busy !== undefined} onClick={() => void keepOthers()} data-testid="offers-keep-others" title={`Keep each ${def.noun} still open as a lead (${def.keep.label}), to offer it again later`}>
              Keep the other{open.length === 1 ? "" : "s"} as lead{open.length === 1 ? "" : "s"} ({open.length})
            </Button>
          )}
          {discarded.length > 0 && (
            <span className="cf-muted app-row" data-testid="offers-discarded">
              {discarded.length} {def.noun}
              {discarded.length === 1 ? "" : "s"} discarded.
              <Button size="sm" variant="ghost" onClick={() => discarded.forEach((o) => discardDraftOffer(ctx, procedure, o.key, false))}>
                Show again
              </Button>
            </span>
          )}
        </div>
      )}
    </section>
  );
}

/** A taken (or kept) offer's footer: the next step as the main button, the record it made. */
function OfferDone({ def, done }: { def: OfferDef; done: GeneratorDraftOffer }) {
  const ctx = useCampaign();
  const record = useRecord("entities", done.as === "arc" ? undefined : done.record);
  const type = useEntityType(record?.type);
  const name = record?.name ?? done.name ?? def.noun;
  if (done.as === "arc") {
    return (
      <span className="app-row" data-testid="offer-accepted">
        <span>On the arc board: {done.name}</span>
        <Link to="/c/$campaignId/arcs" params={{ campaignId: ctx.campaignId }} className="cf-btn cf-btn--primary" data-testid="offer-next">
          Open the arc board
        </Link>
      </span>
    );
  }
  if (!done.record || !record) {
    return (
      <span className="cf-muted" data-testid="offer-accepted">
        {done.as === "keep" ? "Kept as a lead" : "Accepted"}: {name} (no longer in the campaign)
      </span>
    );
  }
  return (
    <span className="app-row" data-testid="offer-accepted">
      <span>{done.as === "keep" ? "Kept as a lead:" : "Accepted:"}</span>
      <Link to="/c/$campaignId/entities/$entityId" params={{ campaignId: ctx.campaignId, entityId: record.id }} className={`cf-btn${done.as === "keep" ? "" : " cf-btn--primary"}`} data-testid="offer-next">
        Open {done.as === "keep" ? "the lead" : `the ${(type?.name ?? def.noun).toLowerCase()}`}: {name}
      </Link>
      {done.as !== "keep" && <RunTaken id={record.id} />}
    </span>
  );
}
