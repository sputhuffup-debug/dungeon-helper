/**
 * Accepting agenda drafts (a procedure's `results.agendaDrafts`): each
 * character's per-act agenda goes into the character field the drafts name
 * (one `{ act, text }` row per act) and, with an adventure, into that
 * adventure's agenda handouts, which the agenda cards print. Text the GM
 * already wrote is never replaced silently: `agendaOverwrites` lists it so
 * the page can ask first, and `keepExisting` fills only the empty ones.
 */
import { adventureActs, agendaFor, clone, ensureAgendas, newId, plainText, type Entity, type GeneratorRun, type Id } from "@campaign-forge/core";
import type { GeneratedGraph, LoadedModule } from "@campaign-forge/module-sdk";
import type { CampaignContextValue } from "./CampaignProvider";
import { acceptGenerated, writeMarkdownDoc } from "./prepActions";

export type AgendaCtx = Pick<CampaignContextValue, "store" | "registry"> & Partial<Pick<CampaignContextValue, "whenDocSynced">> & { module: Pick<LoadedModule, "manifest"> };

export interface AgendaWrite {
  characterId: Id;
  name: string;
  acts: Array<{ act: number; text: string }>;
}

export interface AgendaOverwrite {
  characterId: Id;
  name: string;
  act: number;
  /** "sheet": the character's agendas field; "card": the adventure's agenda handout. */
  where: "sheet" | "card";
  current: string;
  next: string;
}

const norm = (t: string) => t.replace(/\s+/g, " ").trim();

/** The character's per-act rows in `field` ([{ act, text }]). */
export function agendaRows(e: Entity | undefined, field: string): Array<{ act: number; text: string }> {
  const raw = e?.fields[field];
  return (Array.isArray(raw) ? raw : [])
    .filter((r): r is { act: number; text: string } => typeof r === "object" && r !== null && typeof (r as { act?: unknown }).act === "number")
    .map((r) => ({ act: r.act, text: typeof r.text === "string" ? r.text : "" }));
}

async function handoutText(ctx: AgendaCtx, docId: Id | undefined): Promise<string> {
  if (!docId) return "";
  const doc = ctx.registry.open(docId);
  if (ctx.whenDocSynced) await ctx.whenDocSynced(docId).catch(() => undefined);
  else await ctx.registry.whenReady(docId).catch(() => undefined);
  return plainText(doc);
}

/** Text the accept would replace: non-empty agendas (on the sheet or the adventure's cards) that differ from the drafts. */
export async function agendaOverwrites(ctx: AgendaCtx, input: { adventureId?: Id | undefined; field: string; writes: AgendaWrite[] }): Promise<AgendaOverwrite[]> {
  const out: AgendaOverwrite[] = [];
  const adventure = input.adventureId ? ctx.store.get("adventures", input.adventureId) : undefined;
  const acts = adventure ? adventureActs(ctx.store, adventure) : [];
  for (const w of input.writes) {
    const rows = agendaRows(ctx.store.get("entities", w.characterId), input.field);
    for (const a of w.acts) {
      const current = rows.find((r) => r.act === a.act)?.text ?? "";
      if (norm(current) && norm(current) !== norm(a.text)) out.push({ characterId: w.characterId, name: w.name, act: a.act, where: "sheet", current, next: a.text });
      const act = acts.find((x) => x.number === a.act);
      const h = act ? agendaFor(ctx.store, act, w.characterId) : undefined;
      const card = await handoutText(ctx, h?.bodyDoc);
      if (norm(card) && norm(card) !== norm(a.text)) out.push({ characterId: w.characterId, name: w.name, act: a.act, where: "card", current: card, next: a.text });
    }
  }
  return out;
}

export interface AcceptAgendasInput {
  adventureId?: Id | undefined;
  field: string;
  writes: AgendaWrite[];
  /** Leave agendas that already have text as they are (fill only the empty ones). */
  keepExisting: boolean;
  /** The run, recorded for provenance (seed, re-rolls, pins). */
  graph?: GeneratedGraph;
  stepSeeds?: Record<string, string>;
  pinned?: Record<string, unknown>;
  partSeeds?: Record<string, string>;
  pinnedParts?: Record<string, unknown>;
}

export interface AcceptAgendasResult {
  /** Agendas written (sheet rows plus cards). */
  written: number;
  /** Agendas left as the GM wrote them. */
  kept: number;
  run?: GeneratorRun;
}

/** Write the drafts into the characters (and the adventure's agenda cards). */
export async function acceptAgendaDrafts(ctx: AgendaCtx, input: AcceptAgendasInput): Promise<AcceptAgendasResult> {
  let written = 0;
  let kept = 0;
  const adventure = input.adventureId ? ctx.store.get("adventures", input.adventureId) : undefined;
  const docWrites: Array<[Id, string]> = [];
  const cardChecks: Array<{ docId: Id; text: string }> = [];
  ctx.store.transact(() => {
    for (const w of input.writes) {
      const e = ctx.store.get("entities", w.characterId);
      if (!e) continue;
      const rows = agendaRows(e, input.field);
      for (const a of w.acts) {
        const i = rows.findIndex((r) => r.act === a.act);
        const current = i >= 0 ? rows[i]!.text : "";
        if (input.keepExisting && norm(current) && norm(current) !== norm(a.text)) {
          kept++;
          continue;
        }
        if (i >= 0) rows[i] = { act: a.act, text: a.text };
        else rows.push({ act: a.act, text: a.text });
        written++;
      }
      rows.sort((x, y) => x.act - y.act);
      ctx.store.update("entities", e.id, { fields: { ...clone(e.fields), [input.field]: rows } });
      if (!adventure) continue;
      const byAct = ensureAgendas(ctx.store, adventure.id, e.id);
      for (const act of adventureActs(ctx.store, adventure)) {
        const draft = w.acts.find((a) => a.act === act.number);
        let h = byAct[act.id];
        if (!draft || !h) continue;
        if (!h.bodyDoc) h = ctx.store.update("handouts", h.id, { bodyDoc: newId() });
        if (h.bodyDoc) cardChecks.push({ docId: h.bodyDoc, text: draft.text });
      }
    }
  });
  for (const c of cardChecks) {
    const current = await handoutText(ctx, c.docId);
    if (input.keepExisting && norm(current) && norm(current) !== norm(c.text)) {
      kept++;
      continue;
    }
    docWrites.push([c.docId, c.text]);
  }
  for (const [docId, text] of docWrites) {
    await writeMarkdownDoc(ctx, docId, text);
    written++;
  }
  const result: AcceptAgendasResult = { written, kept };
  if (input.graph) {
    const res = acceptGenerated(ctx, {
      graph: input.graph,
      ...(input.stepSeeds ? { stepSeeds: input.stepSeeds } : {}),
      ...(input.pinned ? { pinned: input.pinned } : {}),
      ...(input.partSeeds ? { partSeeds: input.partSeeds } : {}),
      ...(input.pinnedParts ? { pinnedParts: input.pinnedParts } : {}),
    });
    result.run = res.run;
  }
  return result;
}
