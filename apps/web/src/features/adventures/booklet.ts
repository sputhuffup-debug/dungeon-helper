/** Booklet export: wait for every body doc of an adventure, then render it with core `exportMarkdown`. */
import { exportMarkdown, toMarkdown, type CampaignStore, type Handout, type Id, type RichTextRegistry } from "@campaign-forge/core";
import type { GameModule } from "@campaign-forge/module-sdk";
import { actHandouts } from "../../state/prepActions";

export type BookletCtx = { store: CampaignStore; registry: RichTextRegistry; whenDocSynced: (id: Id) => Promise<void>; module: { module: GameModule } };

/** Every rich-text doc the adventure's booklet reads. */
export function adventureDocIds(store: CampaignStore, adventureId: Id): Id[] {
  const a = store.get("adventures", adventureId);
  if (!a) return [];
  const ids: Array<Id | undefined> = [a.playerIntroDoc, a.gmSituationDoc, a.epilogueDoc];
  for (const h of store.list("handouts")) if (h.attachedTo?.kind === "adventure" && h.attachedTo.id === a.id) ids.push(h.bodyDoc);
  for (const actId of a.acts) {
    const act = store.get("acts", actId);
    if (!act) continue;
    ids.push(act.pacingDoc);
    for (const h of actHandouts(store, act)) ids.push(h.bodyDoc);
    for (const sceneId of act.scenes) {
      const s = store.get("scenes", sceneId);
      if (!s) continue;
      ids.push(s.bodyDoc, s.readAloudDoc);
      for (const h of store.list("handouts")) if (h.attachedTo?.kind === "scene" && h.attachedTo.id === s.id) ids.push(h.bodyDoc);
    }
  }
  return [...new Set(ids.filter((x): x is Id => !!x))];
}

export async function syncDocs(ctx: Pick<BookletCtx, "registry" | "whenDocSynced">, ids: Id[]): Promise<void> {
  await Promise.all(
    ids.map((id) => {
      ctx.registry.open(id);
      return ctx.whenDocSynced(id).catch(() => undefined);
    }),
  );
}

/** `[[id|name]]` references become plain names for a reader-facing booklet. */
export function plainRefs(markdown: string): string {
  return markdown
    .replace(/\[\[[^|\]]+\|([^\]]+)\]\]/g, "$1")
    .replace(/\[\[([^\]]+)\]\]/g, "$1")
    .replace(/\\([_\\[\]])/g, "$1");
}

/** The adventure booklet as Markdown, with every body loaded. */
export async function bookletMarkdown(ctx: BookletCtx, adventureId: Id): Promise<string> {
  await syncDocs(ctx, adventureDocIds(ctx.store, adventureId));
  return plainRefs(exportMarkdown(ctx.store, ctx.registry, { kind: "adventure", id: adventureId }, ctx.module.module));
}

export interface AgendaCard {
  handout: Handout;
  actNumber: number;
  actTitle?: string;
  character?: string;
  body: string;
}

/** One card per agenda handout of the adventure, in act order. */
export async function agendaCards(ctx: BookletCtx, adventureId: Id): Promise<AgendaCard[]> {
  const a = ctx.store.get("adventures", adventureId);
  if (!a) return [];
  const cards: Array<Omit<AgendaCard, "body">> = [];
  for (const actId of a.acts) {
    const act = ctx.store.get("acts", actId);
    if (!act) continue;
    for (const h of actHandouts(ctx.store, act)) {
      if (h.kind !== "agenda") continue;
      const card: Omit<AgendaCard, "body"> = { handout: h, actNumber: act.number };
      if (act.title) card.actTitle = act.title;
      const who = h.character ? ctx.store.get("entities", h.character)?.name : undefined;
      if (who) card.character = who;
      cards.push(card);
    }
  }
  const docIds = cards.map((c) => c.handout.bodyDoc).filter((x): x is Id => !!x);
  await syncDocs(ctx, docIds);
  const resolve = (id: Id) => ctx.store.get("entities", id)?.name ?? id;
  return cards.map((c) => ({ ...c, body: c.handout.bodyDoc ? plainRefs(toMarkdown(ctx.registry.open(c.handout.bodyDoc), resolve)) : "" }));
}
