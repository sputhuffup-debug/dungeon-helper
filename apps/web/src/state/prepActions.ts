/**
 * Mutations for the GM preparation surfaces: adventures (from module
 * templates), acts, scenes, handouts, site maps and accepting generator
 * output. Kept apart from actions.ts so the prep surfaces own their writes.
 */
import {
  acceptGeneratedGraph,
  applyEffects,
  clone,
  fromMarkdown,
  handoutsOfAct,
  newId,
  recordEdit,
  type AcceptResult,
  type Act,
  type Adventure,
  type ApplyEffectsResult,
  type CampaignStore,
  type Entity,
  type Handout,
  type Id,
  type RichTextRegistry,
  type Scene,
  type SiteMap,
  type Visibility,
} from "@campaign-forge/core";
import type { Effect, GeneratedGraph, LoadedModule, Template, TemplateAdventure, TemplateScene } from "@campaign-forge/module-sdk";
import type { CampaignContextValue } from "./CampaignProvider";
import { effectContext } from "./tableActions";

type StoreCtx = { store: CampaignStore };
type DocCtx = StoreCtx & { registry: RichTextRegistry; whenDocSynced?: (id: Id) => Promise<void> };

const GM: Visibility = { level: "gm" };

// ---------------------------------------------------------------------------
// rich text helpers
// ---------------------------------------------------------------------------

/**
 * `_emphasis_` as `*emphasis*`: the core Markdown reader only knows the
 * asterisk form, and module templates use underscores.
 */
export function normalizeEmphasis(markdown: string): string {
  return markdown.replace(/(^|[^\\\w])_([^_\n]+?)_(?=$|[^\w])/gm, "$1*$2*");
}

/** Template text shown as plain text (a premise): emphasis markers dropped. */
export function plainTemplateText(text: string): string {
  return text.replace(/(^|[^\\\w])[_*]([^_*\n]+?)[_*](?=$|[^\w])/gm, "$1$2").trim();
}

/** Open a body doc, wait for its stored content, then replace it with Markdown. */
export async function writeMarkdownDoc(ctx: DocCtx, docId: Id, markdown: string): Promise<void> {
  const doc = ctx.registry.open(docId);
  if (ctx.whenDocSynced) await ctx.whenDocSynced(docId).catch(() => undefined);
  fromMarkdown(doc, normalizeEmphasis(markdown));
}

// ---------------------------------------------------------------------------
// adventures from templates
// ---------------------------------------------------------------------------

/** "Arrival: the crew reaches..." -> "Arrival"; long purposes are cut to a few words. */
export function sceneTitleFromPurpose(purpose: string, fallback = "Scene"): string {
  const text = purpose.replace(/[_*`]/g, "").trim();
  if (!text) return fallback;
  const colon = text.indexOf(":");
  if (colon > 0 && colon <= 40) return text.slice(0, colon).trim();
  const firstSentence = text.split(/(?<=[.!?])\s/)[0]?.replace(/[.!?]$/, "") ?? text;
  if (firstSentence.length <= 40) return firstSentence;
  const words = firstSentence.split(/\s+/).slice(0, 5).join(" ");
  return `${words}…`;
}

export function isTemplateAdventure(scaffold: Template["scaffold"]): scaffold is TemplateAdventure {
  return typeof scaffold === "object" && scaffold !== null && Array.isArray((scaffold as TemplateAdventure).acts);
}

export interface InstantiateOptions {
  /** Overrides the template's title. */
  title?: string;
  /** Keep an empty title (no template title, nothing typed) instead of "New adventure"; guided builders review it. */
  allowEmptyTitle?: boolean;
  status?: Adventure["status"];
}

/**
 * Create an adventure from a module adventure template (or blank when
 * `template` is undefined): acts with goal and pacing notes, scenes with
 * their Markdown body and a mandatory/optional event, per-act handout
 * scaffolds, and the player intro / GM situation / epilogue bodies.
 */
export async function instantiateAdventureTemplate(ctx: DocCtx, template: Template | undefined, opts: InstantiateOptions = {}): Promise<Adventure> {
  const scaffold = template && isTemplateAdventure(template.scaffold) ? template.scaffold : undefined;
  const writes: Array<[Id, string]> = [];
  const adventure = ctx.store.transact(() => {
    const input: Parameters<CampaignStore["createAdventure"]>[0] = {
      title: opts.title?.trim() || scaffold?.title || (opts.allowEmptyTitle ? "" : "New adventure"),
      status: opts.status ?? "planned",
      withDocs: true,
    };
    if (scaffold?.premise) input.premise = plainTemplateText(scaffold.premise);
    if (template) input.templateId = template.id;
    const adv = ctx.store.createAdventure(input);
    if (scaffold?.fields) ctx.store.update("adventures", adv.id, { fields: clone(scaffold.fields) });
    if (scaffold?.playerIntro && adv.playerIntroDoc) writes.push([adv.playerIntroDoc, scaffold.playerIntro]);
    if (scaffold?.gmSituation && adv.gmSituationDoc) writes.push([adv.gmSituationDoc, scaffold.gmSituation]);
    if (scaffold?.epilogue && adv.epilogueDoc) writes.push([adv.epilogueDoc, scaffold.epilogue]);

    for (const ta of scaffold?.acts ?? []) {
      const actInput: Parameters<CampaignStore["createAct"]>[1] = { number: ta.number, goal: ta.goal, withPacingDoc: true };
      if (ta.title) actInput.title = ta.title;
      const act = ctx.store.createAct(adv.id, actInput);
      if (ta.fields) ctx.store.update("acts", act.id, { fields: clone(ta.fields) });
      if (ta.pacing && act.pacingDoc) writes.push([act.pacingDoc, ta.pacing]);
      for (const ts of ta.scenes ?? []) {
        const scene = createSceneFromTemplate(ctx.store, act.id, ts);
        if (ts.body) writes.push([scene.bodyDoc, ts.body]);
      }
      const handoutIds: Id[] = [];
      for (const th of ta.handouts ?? []) {
        const level = th.visibility ?? "some_players";
        const visibility: Visibility = level === "some_players" ? { level, players: [] } : { level };
        const handout = ctx.store.createHandout({
          title: th.title,
          kind: level === "some_players" ? "agenda" : "text",
          visibility,
          attachedTo: { kind: "act", id: act.id },
          withBody: true,
        });
        handoutIds.push(handout.id);
        if (th.body && handout.bodyDoc) writes.push([handout.bodyDoc, th.body]);
      }
      if (handoutIds.length) ctx.store.update("acts", act.id, { handouts: handoutIds });
    }
    return ctx.store.get("adventures", adv.id) as Adventure;
  });
  await Promise.all(writes.map(([id, md]) => writeMarkdownDoc(ctx, id, md)));
  return adventure;
}

function createSceneFromTemplate(store: CampaignStore, actId: Id, ts: TemplateScene): Scene {
  const mandatory = ts.mandatory === true;
  const scene = store.createScene(actId, {
    title: sceneTitleFromPurpose(ts.purpose),
    tags: [mandatory ? "mandatory" : "optional"],
    events: [{ id: newId(), text: ts.purpose, mandatory }],
    withReadAloudDoc: true,
    ...(ts.purpose ? { purpose: ts.purpose } : {}),
  });
  return ts.fields ? store.update("scenes", scene.id, { fields: clone(ts.fields) }) : scene;
}

// ---------------------------------------------------------------------------
// adventures, acts, scenes
// ---------------------------------------------------------------------------

export function updateAdventure(ctx: StoreCtx, id: Id, patch: Partial<Adventure>): Adventure {
  return ctx.store.update("adventures", id, patch);
}

/** Delete an adventure with its acts, scenes and act/scene handouts. */
export function deleteAdventure(ctx: StoreCtx & Partial<Pick<DocCtx, "registry">>, id: Id): boolean {
  return ctx.store.transact(() => {
    const adventure = ctx.store.get("adventures", id);
    if (!adventure) return false;
    const actIds = new Set(ctx.store.list("acts").filter((a) => a.adventure === id).map((a) => a.id));
    for (const a of adventure.acts) actIds.add(a);
    const sceneIds = new Set<Id>();
    for (const actId of actIds) for (const s of ctx.store.get("acts", actId)?.scenes ?? []) sceneIds.add(s);
    for (const h of ctx.store.list("handouts")) {
      const at = h.attachedTo;
      if (!at) continue;
      if ((at.kind === "adventure" && at.id === id) || (at.kind === "act" && actIds.has(at.id)) || (at.kind === "scene" && sceneIds.has(at.id))) {
        ctx.store.remove("handouts", h.id);
      }
    }
    return ctx.store.remove("adventures", id);
  });
}

export function addAct(ctx: StoreCtx, adventureId: Id, input: { title?: string; goal?: string } = {}): Act {
  const adventure = ctx.store.get("adventures", adventureId);
  if (!adventure) throw new Error(`adventures/${adventureId} not found`);
  const numbers = adventure.acts.map((a) => ctx.store.get("acts", a)?.number ?? 0);
  const next = numbers.length ? Math.max(...numbers) + 1 : 1;
  const actInput: Parameters<CampaignStore["createAct"]>[1] = { number: next, withPacingDoc: true, title: input.title ?? `Act ${next}` };
  if (input.goal) actInput.goal = input.goal;
  return ctx.store.createAct(adventureId, actInput);
}

/** Remove an act, its scenes and its handouts. */
export function deleteAct(ctx: StoreCtx, actId: Id): boolean {
  return ctx.store.transact(() => {
    const act = ctx.store.get("acts", actId);
    if (!act) return false;
    for (const h of ctx.store.list("handouts")) {
      const at = h.attachedTo;
      if (at && ((at.kind === "act" && at.id === actId) || (at.kind === "scene" && act.scenes.includes(at.id)))) ctx.store.remove("handouts", h.id);
    }
    return ctx.store.remove("acts", actId);
  });
}

/** Move an act up (-1) or down (+1) within its adventure and renumber the acts in order. */
export function moveAct(ctx: StoreCtx, actId: Id, delta: number): void {
  ctx.store.transact(() => {
    const act = ctx.store.get("acts", actId);
    if (!act) return;
    const adventure = ctx.store.get("adventures", act.adventure);
    if (!adventure) return;
    const idx = adventure.acts.indexOf(actId);
    if (idx < 0) return;
    const order = ctx.store.moveInList("adventures", adventure.id, "acts", actId, idx + delta);
    order.forEach((id, i) => {
      const a = ctx.store.get("acts", id);
      if (a && a.number !== i + 1) ctx.store.update("acts", id, { number: i + 1 });
    });
  });
}

export function addScene(ctx: StoreCtx, actId: Id, input: { title?: string; purpose?: string } = {}): Scene {
  const sceneInput: Parameters<CampaignStore["createScene"]>[1] = { title: input.title?.trim() || "New scene", withReadAloudDoc: true };
  if (input.purpose) sceneInput.purpose = input.purpose;
  return ctx.store.createScene(actId, sceneInput);
}

export function updateScene(ctx: StoreCtx, id: Id, patch: Partial<Scene>): Scene {
  return ctx.store.update("scenes", id, patch);
}

export function deleteScene(ctx: StoreCtx, sceneId: Id): boolean {
  return ctx.store.transact(() => {
    for (const h of ctx.store.list("handouts")) {
      if (h.attachedTo?.kind === "scene" && h.attachedTo.id === sceneId) ctx.store.remove("handouts", h.id);
    }
    return ctx.store.remove("scenes", sceneId);
  });
}

/** Move a scene up (-1) or down (+1) within its act. */
export function moveScene(ctx: StoreCtx, sceneId: Id, delta: number): void {
  const scene = ctx.store.get("scenes", sceneId);
  if (!scene?.act) return;
  const act = ctx.store.get("acts", scene.act);
  if (!act) return;
  const idx = act.scenes.indexOf(sceneId);
  if (idx < 0) return;
  ctx.store.moveInList("acts", act.id, "scenes", sceneId, idx + delta);
}

/** Give a record a fresh rich-text doc id for an optional body (pacing notes, read-aloud). */
export function ensureDoc<M extends "acts" | "scenes">(ctx: StoreCtx, map: M, id: Id, field: M extends "acts" ? "pacingDoc" : "readAloudDoc"): Id {
  const rec = ctx.store.get(map, id) as unknown as Record<string, unknown> | undefined;
  if (!rec) throw new Error(`${map}/${id} not found`);
  const existing = rec[field];
  if (typeof existing === "string" && existing) return existing;
  const docId = newId();
  ctx.store.update(map, id, { [field]: docId } as never);
  return docId;
}

export function ensureAdventureDocs(ctx: StoreCtx, id: Id): Adventure {
  const a = ctx.store.get("adventures", id);
  if (!a) throw new Error(`adventures/${id} not found`);
  const patch: Partial<Adventure> = {};
  if (!a.playerIntroDoc) patch.playerIntroDoc = newId();
  if (!a.gmSituationDoc) patch.gmSituationDoc = newId();
  if (!a.epilogueDoc) patch.epilogueDoc = newId();
  return Object.keys(patch).length ? ctx.store.update("adventures", id, patch) : a;
}

// ---------------------------------------------------------------------------
// handouts
// ---------------------------------------------------------------------------

export function addHandout(ctx: StoreCtx, actId: Id, input: { title?: string; kind?: Handout["kind"]; character?: Id } = {}): Handout {
  return ctx.store.transact(() => {
    const act = ctx.store.get("acts", actId);
    if (!act) throw new Error(`acts/${actId} not found`);
    const kind = input.kind ?? "text";
    const h = ctx.store.createHandout({
      title: input.title?.trim() || (kind === "agenda" ? `Agenda (Act ${act.number})` : "New handout"),
      kind,
      visibility: kind === "agenda" ? { level: "some_players", players: [] } : GM,
      attachedTo: { kind: "act", id: actId },
      ...(input.character ? { character: input.character } : {}),
      withBody: true,
    });
    ctx.store.update("acts", actId, { handouts: [...act.handouts, h.id] });
    return h;
  });
}

export function updateHandout(ctx: StoreCtx, id: Id, patch: Partial<Handout>): Handout {
  return ctx.store.update("handouts", id, patch);
}

export function deleteHandout(ctx: StoreCtx, id: Id): boolean {
  return ctx.store.transact(() => {
    for (const act of ctx.store.list("acts")) {
      if (act.handouts.includes(id)) ctx.store.update("acts", act.id, { handouts: act.handouts.filter((h) => h !== id) });
    }
    return ctx.store.remove("handouts", id);
  });
}

/** Handouts that belong to an act: those attached to it plus its ordered list, de-duplicated. */
export function actHandouts(store: CampaignStore, act: Act): Handout[] {
  return handoutsOfAct(store, act);
}

// ---------------------------------------------------------------------------
// maps
// ---------------------------------------------------------------------------

export function createSiteMap(ctx: StoreCtx, input: { name?: string; location?: Id } = {}): SiteMap {
  const mapInput: Parameters<CampaignStore["createMap"]>[0] = { name: input.name?.trim() || "New map" };
  if (input.location) mapInput.location = input.location;
  return ctx.store.createMap(mapInput);
}

/** Create a map for a scene (named after it, at the scene's location) and attach it. */
export function createMapForScene(ctx: StoreCtx, sceneId: Id): SiteMap {
  return ctx.store.transact(() => {
    const scene = ctx.store.get("scenes", sceneId);
    if (!scene) throw new Error(`scenes/${sceneId} not found`);
    const opts: { name: string; location?: Id } = { name: `${scene.title} map` };
    if (scene.location) opts.location = scene.location;
    const map = createSiteMap(ctx, opts);
    ctx.store.update("scenes", sceneId, { map: map.id });
    return map;
  });
}

export function updateSiteMap(ctx: StoreCtx, id: Id, patch: Partial<SiteMap>): SiteMap {
  return ctx.store.update("maps", id, patch);
}

/** Delete a map and detach it from scenes. The image asset is left in place. */
export function deleteSiteMap(ctx: StoreCtx, id: Id): boolean {
  return ctx.store.transact(() => {
    for (const s of ctx.store.list("scenes")) if (s.map === id) ctx.store.update("scenes", s.id, { map: undefined });
    return ctx.store.remove("maps", id);
  });
}

// ---------------------------------------------------------------------------
// generator output
// ---------------------------------------------------------------------------

export interface AcceptGeneratedInput {
  graph: GeneratedGraph;
  stepSeeds?: Record<string, string>;
  pinned?: Record<string, unknown>;
  /** tempId -> name the GM typed before accepting. */
  names?: Record<string, string>;
  /** Parent for the graph's root entities (chained generation). */
  within?: Id;
}

/**
 * Accept a generated graph: entities, relationships and a generator-run
 * record with every roll. Names the GM changed before accepting are
 * recorded as edits on the run.
 */
export function acceptGenerated(ctx: StoreCtx & { module: Pick<LoadedModule, "manifest"> }, input: AcceptGeneratedInput): AcceptResult {
  return ctx.store.transact(() => {
    const names = input.names ?? {};
    const renamed = new Set<string>();
    const entities = input.graph.produced.entities.map((e) => {
      const n = names[e.tempId]?.trim();
      if (n && n !== e.name) {
        renamed.add(e.tempId);
        return { ...e, name: n };
      }
      return e;
    });
    const graph: GeneratedGraph = { ...input.graph, produced: { ...input.graph.produced, entities } };
    const opts: Parameters<typeof acceptGeneratedGraph>[2] = { moduleId: ctx.module.manifest.id };
    if (input.stepSeeds && Object.keys(input.stepSeeds).length) opts.stepSeeds = input.stepSeeds;
    if (input.pinned && Object.keys(input.pinned).length) opts.pinned = input.pinned;
    if (input.within && ctx.store.has("entities", input.within)) opts.within = input.within;
    const result = acceptGeneratedGraph(ctx.store, graph, opts);
    for (const tempId of renamed) {
      const id = result.idMap[tempId];
      if (id) recordEdit(ctx.store, result.run.id, id, "name");
    }
    const run = ctx.store.get("generatorRuns", result.run.id) ?? result.run;
    const created = result.entities.map((e) => ctx.store.get("entities", e.id) ?? e) as Entity[];
    return { ...result, run, entities: created };
  });
}

/** Apply module effects (for example shore-leave outcomes) to campaign data. */
export function applyGeneratorEffects(ctx: Pick<CampaignContextValue, "store" | "module">, effects: Effect[], sessionId?: Id): ApplyEffectsResult {
  return applyEffects(ctx.store, effects, effectContext(ctx, sessionId));
}

export type PrepCtx = Pick<CampaignContextValue, "store" | "module" | "registry" | "whenDocSynced">;
