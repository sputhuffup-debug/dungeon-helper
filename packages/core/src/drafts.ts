/**
 * Generator drafts: the workbench's current deal for each procedure, kept in
 * the campaign so a job board, a dealt agenda set or a half-edited run is
 * still there after navigating away or reloading (see `GeneratorDraft`).
 *
 * - One draft per procedure per campaign: `saveGeneratorDraft` replaces it
 *   whole, `newGeneratorDraft`'s caller ("New deal") replaces it with a
 *   fresh one.
 * - Offers on a drafted board are marked one by one (`markDraftOffer`): a
 *   taken posting stays on the board, linked to the record it made.
 * - Accepting the whole run marks the draft (`markDraftAccepted`); changing
 *   the run again clears that mark.
 * - GM-only: the player projection holds no drafts, so shares, packets, the
 *   player screen and recaps never see them. Bundles carry them like every
 *   other map.
 *
 * Nothing here names a game.
 */
import { now } from "./ids";
import type { CampaignStore } from "./store";
import type { GeneratorDraft, GeneratorDraftAccept, GeneratorDraftOffer, Id } from "./types";

/** A draft as the workbench writes it (the record's id and timestamps are the store's). */
export type GeneratorDraftInput = Omit<GeneratorDraft, "id" | "created" | "updated">;

const DRAFT_KEYS: Array<keyof GeneratorDraftInput> = [
  "procedure",
  "moduleId",
  "moduleVersion",
  "seed",
  "inputs",
  "stepSeeds",
  "stepDice",
  "pinned",
  "pinnedRolls",
  "partSeeds",
  "pinnedParts",
  "includeOptional",
  "within",
  "edits",
  "source",
  "offerKeys",
  "offers",
  "accepted",
  "context",
];

/** The procedure's draft in this campaign (the latest, should there ever be two). */
export function generatorDraftOf(store: Pick<CampaignStore, "list">, procedure: string): GeneratorDraft | undefined {
  let best: GeneratorDraft | undefined;
  for (const d of store.list("generatorDrafts")) {
    if (d.procedure !== procedure) continue;
    if (!best || d.updated > best.updated || (d.updated === best.updated && d.id > best.id)) best = d;
  }
  return best;
}

/** Every draft in the campaign, the most recently changed first. */
export function generatorDrafts(store: Pick<CampaignStore, "list">): GeneratorDraft[] {
  return [...store.list("generatorDrafts")].sort((a, b) => (a.updated < b.updated ? 1 : a.updated > b.updated ? -1 : a.id < b.id ? 1 : -1));
}

/** Write the procedure's draft whole (fields left out are removed); creates it when there is none. */
export function saveGeneratorDraft(store: CampaignStore, input: GeneratorDraftInput): GeneratorDraft {
  return store.transact(() => {
    const existing = generatorDraftOf(store, input.procedure);
    // a second draft for the same procedure (two devices merging) is dropped: one deal per procedure
    for (const d of store.list("generatorDrafts")) if (d.procedure === input.procedure && d.id !== existing?.id) store.remove("generatorDrafts", d.id);
    if (!existing) {
      const rec: Record<string, unknown> = {};
      for (const k of DRAFT_KEYS) if (input[k] !== undefined) rec[k] = input[k];
      return store.insert("generatorDrafts", rec as GeneratorDraftInput);
    }
    const patch: Record<string, unknown> = {};
    for (const k of DRAFT_KEYS) patch[k] = input[k];
    return store.update("generatorDrafts", existing.id, patch as Partial<GeneratorDraft>);
  });
}

/** Drop the procedure's draft. Returns whether there was one. */
export function clearGeneratorDraft(store: CampaignStore, procedure: string): boolean {
  let removed = false;
  store.transact(() => {
    for (const d of store.list("generatorDrafts")) if (d.procedure === procedure) removed = store.remove("generatorDrafts", d.id) || removed;
  });
  return removed;
}

/** Record what was done with one offer of the drafted board (taken, kept, put on the arc board, discarded); `undefined` puts it back. */
export function markDraftOffer(store: CampaignStore, procedure: string, offerKey: string, mark: Omit<GeneratorDraftOffer, "at"> | undefined): GeneratorDraft | undefined {
  const draft = generatorDraftOf(store, procedure);
  if (!draft) return undefined;
  const offers = { ...(draft.offers ?? {}) };
  if (mark) offers[offerKey] = { ...mark, at: now() };
  else delete offers[offerKey];
  return store.update("generatorDrafts", draft.id, { offers: Object.keys(offers).length ? offers : undefined } as Partial<GeneratorDraft>);
}

/** Mark the whole run accepted (the run it recorded, and what the page shows about it). */
export function markDraftAccepted(store: CampaignStore, procedure: string, accepted: Omit<GeneratorDraftAccept, "at"> & { at?: string }): GeneratorDraft | undefined {
  const draft = generatorDraftOf(store, procedure);
  if (!draft) return undefined;
  return store.update("generatorDrafts", draft.id, { accepted: { ...accepted, at: accepted.at ?? now() } });
}

/** Offers on the draft's board that nothing was done with yet. */
export function openDraftOffers(draft: Pick<GeneratorDraft, "offers"> | undefined, keys: readonly string[]): string[] {
  const done = draft?.offers ?? {};
  return keys.filter((k) => !done[k]);
}

/**
 * Whether the draft still holds work the GM has not accepted: a run never
 * accepted, or a board with an offer nothing was done with (the draft's own
 * `offerKeys` unless given).
 */
export function draftIsOpen(draft: Pick<GeneratorDraft, "offers" | "accepted" | "offerKeys">, offerKeys: readonly string[] | undefined = draft.offerKeys): boolean {
  if (offerKeys && offerKeys.length > 0) return openDraftOffers(draft, offerKeys).length > 0;
  return !draft.accepted;
}

/** The records a draft's offers made (taken postings, kept leads, threads), in offer order. */
export function draftOfferRecords(draft: Pick<GeneratorDraft, "offers"> | undefined): Id[] {
  return Object.values(draft?.offers ?? {})
    .map((o) => o.record)
    .filter((x): x is Id => typeof x === "string");
}
