/**
 * Boards of offers (module-sdk `Procedure.offers`, e.g. the Alien job
 * board): read a run's `results.offers`, and accept one offer on its own.
 * Accepting creates the offer's entities and relationships with the run's
 * provenance (each entity at the visibility the procedure gave it), sets the
 * accept or keep fields on its first entity (e.g. a job's status), and adds
 * the offer's handout for the players, attached to that entity.
 */
import { applyOfferArcLinks, createThread, type AcceptResult, type ArcThread, type Handout, type Id } from "@campaign-forge/core";
import { slotLabel } from "@campaign-forge/module-sdk";
import type { GeneratedGraph, Offer, OfferDef, OfferSet } from "@campaign-forge/module-sdk";
import type { CampaignContextValue } from "./CampaignProvider";
import { acceptGenerated, writeMarkdownDoc } from "./prepActions";

type OfferCtx = Pick<CampaignContextValue, "store" | "registry" | "module"> & Partial<Pick<CampaignContextValue, "whenDocSynced">>;

/** The run's offer set, when its results carry a well-formed one. */
export function offersOf(graph: GeneratedGraph | undefined): OfferSet | undefined {
  const v = graph?.results.offers as OfferSet | undefined;
  return v && typeof v === "object" && Array.isArray(v.offers) ? v : undefined;
}

export interface AcceptOfferInput {
  graph: GeneratedGraph;
  offer: Offer;
  def: OfferDef;
  /** "accept" (the main action) or "keep" (keep it for later). */
  as: "accept" | "keep";
  stepSeeds?: Record<string, string>;
  pinned?: Record<string, unknown>;
  partSeeds?: Record<string, string>;
  pinnedParts?: Record<string, unknown>;
}

export interface AcceptOfferResult extends AcceptResult {
  handout?: Handout;
  /** The offer's own record (its first entity). */
  root?: Id;
  /** The thread the offer put on the arc board (`Offer.arc`). */
  thread?: ArcThread;
}

/** Accept one offer of a board: its entities, relationships and player handout. */
export async function acceptOffer(ctx: OfferCtx, input: AcceptOfferInput): Promise<AcceptOfferResult> {
  const action = input.as === "keep" ? (input.def.keep ?? input.def.accept) : input.def.accept;
  const entities = input.offer.produced.entities.map((e, i) => (i === 0 && action.fields ? { ...e, fields: { ...e.fields, ...structuredClone(action.fields) } } : e));
  const graph: GeneratedGraph = { ...input.graph, produced: { entities, relationships: input.offer.produced.relationships } };
  let docWrite: { docId: Id; markdown: string } | undefined;
  const result = ctx.store.transact(() => {
    const res = acceptGenerated(ctx, {
      graph,
      ...(input.stepSeeds ? { stepSeeds: input.stepSeeds } : {}),
      ...(input.pinned ? { pinned: input.pinned } : {}),
      ...(input.partSeeds ? { partSeeds: input.partSeeds } : {}),
      ...(input.pinnedParts ? { pinnedParts: input.pinnedParts } : {}),
    });
    const root = res.entities[0]?.id;
    let handout: Handout | undefined;
    const h = input.offer.handout;
    if (h && root) {
      handout = ctx.store.createHandout({ title: h.title, kind: "text", visibility: { level: "players" }, attachedTo: { kind: "entity", id: root }, ...(h.purpose ? { purpose: h.purpose } : {}), withBody: true });
      if (handout.bodyDoc) docWrite = { docId: handout.bodyDoc, markdown: h.body };
    }
    const out: AcceptOfferResult = { ...res };
    if (handout) out.handout = handout;
    if (root) out.root = root;
    // a drafted thread goes on the arc board; links to the arcs (a seeded clue, an agent, a payoff, a contact) are recorded
    const offer = input.offer;
    if (offer.arc) out.thread = createThread(ctx.store, offer.arc, { idMap: res.idMap, source: { module: ctx.module.manifest.id, procedure: input.graph.procedure, run: res.run.id, offer: offer.key } });
    if (offer.arcLinks?.length) {
      const session = ctx.store.list("sessions").find((s) => s.status === "running")?.id;
      applyOfferArcLinks(ctx.store, offer.arcLinks, { ...(root ? { job: root } : {}), posting: offer.key, run: res.run.id, idMap: res.idMap, ...(session ? { session } : {}), slotLabel: (id) => slotLabel(ctx.module.module.arcs, id) });
    }
    return out;
  });
  if (docWrite) await writeMarkdownDoc(ctx, docWrite.docId, docWrite.markdown);
  return result;
}

/** Part seeds and pins under an offer's key ("<key>/..."): a whole offer re-rolled starts its parts afresh, pins excepted. */
export function withoutPartsOf<T>(parts: Record<string, T>, key: string): Record<string, T> {
  const out: Record<string, T> = {};
  for (const [k, v] of Object.entries(parts)) if (!k.startsWith(`${key}/`)) out[k] = v;
  return out;
}
