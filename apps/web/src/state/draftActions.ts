/**
 * The generator workbench's drafts (core `GeneratorDraft`): what a page's
 * search asks for, the GM's edits as the draft keeps them, and the offers of
 * a drafted board taken, kept or discarded one by one (each marked on the
 * draft, so the board stays as it was).
 */
import { generatorDraftOf, markDraftOffer, saveGeneratorDraft, type GeneratorDraft, type GeneratorDraftInput, type Id } from "@campaign-forge/core";
import type { GeneratedGraph, Offer, OfferDef } from "@campaign-forge/module-sdk";
import type { CampaignContextValue } from "./CampaignProvider";
import { acceptOffer, type AcceptOfferResult } from "./offerActions";

type DraftCtx = Pick<CampaignContextValue, "store" | "registry" | "module"> & Partial<Pick<CampaignContextValue, "whenDocSynced">>;

/** The workbench's search, as far as drafts care. */
export interface DraftSearch {
  run?: string;
  chainFrom?: string;
  chain?: number;
  within?: string;
  pick?: string;
  /** A fresh deal was asked for (a nonce): the page deals one and drops this from the address. */
  deal?: string;
}

/** What a search asks the page to start from, when it is not a plain visit: the same request reopens the draft it made. */
export function draftSourceKey(search: DraftSearch): string | undefined {
  if (search.run) return `run:${search.run}`;
  if (search.chainFrom !== undefined && search.chain !== undefined) return `chain:${search.chainFrom}:${search.chain}${search.within ? `:${search.within}` : ""}`;
  if (search.pick) return `pick:${search.pick}`;
  return undefined;
}

/** The GM's own text and choices kept with a draft. */
export interface DraftEdits {
  /** Agenda drafts' text by slot key. */
  agenda?: Record<string, string>;
  /** Long-term agendas: goal summary and beat per character. */
  longAgenda?: Record<string, unknown>;
  /** Names given to entities in the preview, by temp id. */
  names?: Record<string, string>;
  /** Effects unticked before accepting, by index. */
  unticked?: number[];
  /** Between jobs: whether the thread clocks move with the run, and their seed. */
  moveClocks?: boolean;
  clockSeed?: string;
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/** The edits a draft holds, read defensively (a draft from another app version may carry other keys). */
export function draftEditsOf(draft: Pick<GeneratorDraft, "edits"> | undefined): DraftEdits {
  const e = draft?.edits;
  if (!isRecord(e)) return {};
  const out: DraftEdits = {};
  if (isRecord(e.agenda)) out.agenda = Object.fromEntries(Object.entries(e.agenda).filter((x): x is [string, string] => typeof x[1] === "string"));
  if (isRecord(e.longAgenda)) out.longAgenda = e.longAgenda;
  if (isRecord(e.names)) out.names = Object.fromEntries(Object.entries(e.names).filter((x): x is [string, string] => typeof x[1] === "string"));
  if (Array.isArray(e.unticked)) out.unticked = e.unticked.filter((x): x is number => typeof x === "number");
  if (typeof e.moveClocks === "boolean") out.moveClocks = e.moveClocks;
  if (typeof e.clockSeed === "string") out.clockSeed = e.clockSeed;
  return out;
}

/** Edits worth keeping (empty ones left out). */
export function compactEdits(e: DraftEdits): Record<string, unknown> | undefined {
  const out: Record<string, unknown> = {};
  if (e.agenda && Object.keys(e.agenda).length) out.agenda = e.agenda;
  if (e.longAgenda && Object.keys(e.longAgenda).length) out.longAgenda = e.longAgenda;
  if (e.names && Object.keys(e.names).length) out.names = e.names;
  if (e.unticked && e.unticked.length) out.unticked = e.unticked;
  if (e.moveClocks === false) out.moveClocks = false;
  if (e.clockSeed) out.clockSeed = e.clockSeed;
  return Object.keys(out).length ? out : undefined;
}

/**
 * Save the page's draft whole. The board's offer marks are written apart
 * (`takeDraftOffer`), so they are kept unless `fresh` (a new deal starts
 * with none).
 */
export function writeDraft(ctx: Pick<CampaignContextValue, "store">, input: GeneratorDraftInput, opts: { fresh?: boolean } = {}): GeneratorDraft {
  const offers = opts.fresh ? undefined : generatorDraftOf(ctx.store, input.procedure)?.offers;
  return saveGeneratorDraft(ctx.store, { ...input, ...(offers ? { offers } : {}) });
}

/** Whether the GM has done work on a draft that a new deal would throw away (re-rolls, pins, entered dice, edits, offers marked). */
export function draftHasWork(draft: GeneratorDraft | undefined): boolean {
  if (!draft) return false;
  const n = (v: Record<string, unknown> | undefined) => Object.keys(v ?? {}).length;
  return n(draft.stepSeeds) + n(draft.stepDice) + n(draft.pinned) + n(draft.partSeeds) + n(draft.pinnedParts) + n(draft.edits) + n(draft.offers) > 0;
}

export interface TakeDraftOfferInput {
  procedure: string;
  graph: GeneratedGraph;
  offer: Offer;
  def: OfferDef;
  as: "accept" | "keep";
  stepSeeds?: Record<string, string>;
  pinned?: Record<string, unknown>;
  partSeeds?: Record<string, string>;
  pinnedParts?: Record<string, unknown>;
}

/** Accept one offer of the drafted board (take it, keep it as a lead, put it on the arc board) and mark it on the draft. */
export async function takeDraftOffer(ctx: DraftCtx, input: TakeDraftOfferInput): Promise<AcceptOfferResult> {
  const { procedure, ...rest } = input;
  const res = await acceptOffer(ctx, rest);
  const root = res.root ? ctx.store.get("entities", res.root) : undefined;
  if (res.thread) markDraftOffer(ctx.store, procedure, input.offer.key, { as: "arc", record: res.thread.id, name: res.thread.title, run: res.run.id });
  else markDraftOffer(ctx.store, procedure, input.offer.key, { as: input.as, ...(root ? { record: root.id, name: root.name } : {}), run: res.run.id });
  return res;
}

/** Keep every offer nothing was done with yet as a lead (the board's keep action), marking each on the draft. Returns the records made. */
export async function keepOpenOffers(ctx: DraftCtx, input: Omit<TakeDraftOfferInput, "offer" | "as"> & { offers: Offer[] }): Promise<Id[]> {
  const out: Id[] = [];
  const done = generatorDraftOf(ctx.store, input.procedure)?.offers ?? {};
  for (const offer of input.offers) {
    if (done[offer.key]) continue;
    const res = await takeDraftOffer(ctx, { ...input, offer, as: "keep" });
    if (res.root) out.push(res.root);
  }
  return out;
}

/** Discard an offer on the drafted board, or put it back (`false`). */
export function discardDraftOffer(ctx: Pick<CampaignContextValue, "store">, procedure: string, offerKey: string, discard = true): void {
  const mark = generatorDraftOf(ctx.store, procedure)?.offers?.[offerKey];
  if (discard) {
    if (!mark) markDraftOffer(ctx.store, procedure, offerKey, { as: "discard" });
  } else if (mark?.as === "discard") markDraftOffer(ctx.store, procedure, offerKey, undefined);
}
