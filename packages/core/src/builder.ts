/**
 * Guided adventure builders, game-agnostic side: the plain-data context the
 * module's review rules read, the adventure cast (entities by role), narrative
 * field read/write and computed values, and per-character agenda handouts.
 * The module supplies the builder (steps, cast roles, rules); nothing here
 * knows a game.
 */
import {
  computeFields,
  computeNarrativeFields,
  defaultFieldsFor,
  filterByMode,
  schemaDefaults,
  type CastRoleDef,
  type EntityTypeDef,
  type GameModule,
  type LoadedModule,
  type NarrativeFieldsDef,
  type NarrativeKind,
  type PlayModeId,
} from "@campaign-forge/module-sdk";
import { clone, getPath, setPath } from "./paths";
import { plainText, type RichTextRegistry } from "./richtext";
import type { CampaignStore } from "./store";
import type { Act, Adventure, Entity, Handout, Id, Scene, Visibility } from "./types";

/** A loaded module or the bare module object. */
export type BuilderModule = GameModule | LoadedModule;

function gameModule(m: BuilderModule): GameModule {
  return "entityTypes" in m ? m : m.module;
}

// ---------------------------------------------------------------------------
// narrative fields
// ---------------------------------------------------------------------------

const NARRATIVE_MAP = { adventure: "adventures", act: "acts", scene: "scenes" } as const;

/** The module's fields for a narrative kind in a mode: the first def that applies. */
export function narrativeFieldsDef(module: BuilderModule, kind: NarrativeKind, mode?: PlayModeId): NarrativeFieldsDef | undefined {
  const defs = (gameModule(module).narrativeFields ?? []).filter((d) => d.kind === kind);
  return (mode === undefined ? defs : filterByMode(defs, mode))[0];
}

/** Module-defined fields of an adventure, act or scene (empty when none are stored). */
export function narrativeFieldsOf(record: { fields?: Record<string, unknown> } | undefined): Record<string, unknown> {
  return record?.fields ?? {};
}

/** Replace a narrative record's module fields. */
export function setNarrativeFields(store: CampaignStore, kind: NarrativeKind, id: Id, fields: Record<string, unknown>): void {
  store.update(NARRATIVE_MAP[kind], id, { fields: clone(fields) } as never);
}

/** Set one module field (dotted path) on an adventure, act or scene. */
export function setNarrativeField(store: CampaignStore, kind: NarrativeKind, id: Id, path: string, value: unknown): void {
  const rec = store.get(NARRATIVE_MAP[kind], id) as { fields?: Record<string, unknown> } | undefined;
  if (!rec) throw new Error(`${NARRATIVE_MAP[kind]}/${id} not found`);
  const next = clone(narrativeFieldsOf(rec));
  setPath(next, path, value);
  setNarrativeFields(store, kind, id, next);
}

/** Read one module field (dotted path) of a narrative record. */
export function narrativeField(record: { fields?: Record<string, unknown> } | undefined, path: string): unknown {
  return getPath(narrativeFieldsOf(record), path);
}

/** Computed values of a narrative record (JSONLogic, never stored). Rules that throw yield `{}`. */
export function narrativeComputed(module: BuilderModule, kind: NarrativeKind, mode: PlayModeId | undefined, fields: Record<string, unknown> | undefined): Record<string, unknown> {
  try {
    return computeNarrativeFields(narrativeFieldsDef(module, kind, mode), fields);
  } catch {
    return {};
  }
}

/** Schema defaults of a narrative kind's fields (for new records). */
export function narrativeDefaults(module: BuilderModule, kind: NarrativeKind, mode?: PlayModeId): Record<string, unknown> {
  const def = narrativeFieldsDef(module, kind, mode);
  return def ? schemaDefaults(def.schema) : {};
}

// ---------------------------------------------------------------------------
// cast
// ---------------------------------------------------------------------------

/** Entity ids of a cast role, in order. */
export function castIds(adventure: Pick<Adventure, "cast"> | undefined, role: string): Id[] {
  return adventure?.cast?.[role] ?? [];
}

/** The entities of a cast role that still exist, in order. */
export function castMembers(store: CampaignStore, adventureId: Id, role: string): Entity[] {
  const adventure = store.get("adventures", adventureId);
  return castIds(adventure, role)
    .map((id) => store.get("entities", id))
    .filter((e): e is Entity => !!e);
}

/** Add an existing entity to a cast role (no duplicates). */
export function addToCast(store: CampaignStore, adventureId: Id, role: string, entityId: Id): Adventure {
  const adventure = store.get("adventures", adventureId);
  if (!adventure) throw new Error(`adventures/${adventureId} not found`);
  const ids = castIds(adventure, role);
  if (ids.includes(entityId)) return adventure;
  return store.update("adventures", adventureId, { cast: { ...(adventure.cast ?? {}), [role]: [...ids, entityId] } });
}

/** Take an entity out of a cast role. The entity itself is kept. */
export function removeFromCast(store: CampaignStore, adventureId: Id, role: string, entityId: Id): Adventure {
  const adventure = store.get("adventures", adventureId);
  if (!adventure) throw new Error(`adventures/${adventureId} not found`);
  const ids = castIds(adventure, role);
  if (!ids.includes(entityId)) return adventure;
  return store.update("adventures", adventureId, { cast: { ...(adventure.cast ?? {}), [role]: ids.filter((id) => id !== entityId) } });
}

/** Move a cast member up (-1) or down (+1) within its role. */
export function moveInCast(store: CampaignStore, adventureId: Id, role: string, entityId: Id, delta: number): Adventure {
  const adventure = store.get("adventures", adventureId);
  if (!adventure) throw new Error(`adventures/${adventureId} not found`);
  const ids = [...castIds(adventure, role)];
  const idx = ids.indexOf(entityId);
  const to = Math.max(0, Math.min(ids.length - 1, idx + delta));
  if (idx < 0 || to === idx) return adventure;
  ids.splice(idx, 1);
  ids.splice(to, 0, entityId);
  return store.update("adventures", adventureId, { cast: { ...(adventure.cast ?? {}), [role]: ids } });
}

/** Fields for a new member of a role: the entity type's schema defaults with the role's defaults on top. */
export function castMemberFields(def: EntityTypeDef | undefined, role: Pick<CastRoleDef, "defaults">): Record<string, unknown> {
  const fields = def ? defaultFieldsFor(def) : {};
  for (const [path, value] of Object.entries(role.defaults ?? {})) setPath(fields, path, clone(value));
  return fields;
}

/** Create an entity with the role's type, subtype and defaults, and add it to the cast. */
export function createCastMember(store: CampaignStore, module: BuilderModule, adventureId: Id, role: CastRoleDef, name: string): Entity {
  const def = gameModule(module).entityTypes.find((t) => t.id === role.entityType);
  if (!def) throw new Error(`unknown entity type "${role.entityType}"`);
  if (!store.has("adventures", adventureId)) throw new Error(`adventures/${adventureId} not found`);
  return store.transact(() => {
    const input: Parameters<CampaignStore["createEntity"]>[0] = { type: role.entityType, name: name.trim() || `New ${role.label.replace(/s$/, "").toLowerCase()}`, fields: castMemberFields(def, role) };
    if (role.subtype !== undefined) input.subtype = role.subtype;
    const entity = store.createEntity(input);
    addToCast(store, adventureId, role.id, entity.id);
    return entity;
  });
}

// ---------------------------------------------------------------------------
// agendas: one per character per act
// ---------------------------------------------------------------------------

/** Acts of an adventure in order (missing ones skipped). */
export function adventureActs(store: CampaignStore, adventure: Adventure): Act[] {
  return adventure.acts.map((id) => store.get("acts", id)).filter((a): a is Act => !!a);
}

/** Handouts that belong to an act: its ordered list plus those attached to it, de-duplicated. */
export function handoutsOfAct(store: CampaignStore, act: Act): Handout[] {
  const seen = new Set<Id>();
  const out: Handout[] = [];
  const push = (h: Handout | undefined) => {
    if (h && !seen.has(h.id)) {
      seen.add(h.id);
      out.push(h);
    }
  };
  for (const id of act.handouts) push(store.get("handouts", id));
  for (const h of store.list("handouts")) if (h.attachedTo?.kind === "act" && h.attachedTo.id === act.id) push(h);
  return out;
}

/** The character's agenda handout for an act, if any. */
export function agendaFor(store: CampaignStore, act: Act, characterId: Id): Handout | undefined {
  return handoutsOfAct(store, act).find((h) => h.kind === "agenda" && h.character === characterId);
}

/**
 * Make sure the character has one agenda handout per act of the adventure.
 * An unassigned agenda handout of the act (a template's per-character slot)
 * is claimed first; otherwise a new one is created. Returns them by act id.
 */
export function ensureAgendas(store: CampaignStore, adventureId: Id, characterId: Id): Record<Id, Handout> {
  const adventure = store.get("adventures", adventureId);
  if (!adventure) throw new Error(`adventures/${adventureId} not found`);
  const name = store.get("entities", characterId)?.name ?? "Character";
  return store.transact(() => {
    const out: Record<Id, Handout> = {};
    for (const act of adventureActs(store, adventure)) {
      let h = agendaFor(store, act, characterId);
      if (!h) {
        const slot = handoutsOfAct(store, act).find((x) => x.kind === "agenda" && !x.character);
        if (slot) h = store.update("handouts", slot.id, { character: characterId, title: `${name}: Act ${act.number} agenda` });
      }
      if (!h) {
        const visibility: Visibility = { level: "some_players", players: [] };
        h = store.createHandout({ title: `${name}: Act ${act.number} agenda`, kind: "agenda", visibility, attachedTo: { kind: "act", id: act.id }, character: characterId, withBody: true });
        const fresh = store.get("acts", act.id);
        if (fresh) store.update("acts", act.id, { handouts: [...fresh.handouts, h.id] });
      }
      out[act.id] = h;
    }
    return out;
  });
}

// ---------------------------------------------------------------------------
// review context
// ---------------------------------------------------------------------------

/** Every rich-text doc the review context reads for an adventure. */
export function reviewDocIds(store: CampaignStore, adventureId: Id): Id[] {
  const adventure = store.get("adventures", adventureId);
  if (!adventure) return [];
  const ids: Array<Id | undefined> = [adventure.playerIntroDoc, adventure.gmSituationDoc, adventure.epilogueDoc];
  for (const act of adventureActs(store, adventure)) {
    ids.push(act.pacingDoc);
    for (const h of handoutsOfAct(store, act)) ids.push(h.bodyDoc);
    for (const sid of act.scenes) {
      const s = store.get("scenes", sid);
      if (s) ids.push(s.bodyDoc, s.readAloudDoc);
    }
  }
  for (const h of store.list("handouts")) if (h.attachedTo?.kind === "adventure" && h.attachedTo.id === adventureId) ids.push(h.bodyDoc);
  return [...new Set(ids.filter((x): x is Id => !!x))];
}

export interface ReviewContextOptions {
  /** The play mode for narrative fields; the campaign's mode when absent. */
  mode?: PlayModeId;
  /** Cast role ids to expose (the builder's roles); every role stored on the adventure when absent. */
  roles?: string[];
  /** Waits for a doc's stored content (persistence); `registry.whenReady` when absent. */
  whenDocSynced?: (id: Id) => Promise<void>;
}

/**
 * The plain data a builder's review rules read:
 *
 *   adventure  { id, title, premise, status, hooksIn, hooksOut, tags, builderId, fields, computed,
 *                playerIntro, gmSituation, epilogue }  (rich text as plain text)
 *   acts       [{ id, number, title, goal, pacing, fields, computed, scenes: [scene...], sceneCount, mandatoryCount }]
 *   scenes     [{ id, title, purpose, status, mandatory, events, fields, computed, body, readAloud, act, actId }]
 *   cast       { role: [member...] } and each role id at the top level too
 *              member: { id, name, type, subtype, summary, tags, fields, computed, agendas: [{ act, actId, handoutId, title, text }], agendaByAct: { "1": text } }
 *   handouts   [{ id, title, kind, character, characterName, act, actId, scene, body }]
 *
 * Opens every rich-text doc it reads through the registry and waits for its
 * stored content first, so text is never read from a doc that has not loaded.
 */
export async function adventureReviewContext(store: CampaignStore, registry: RichTextRegistry, module: BuilderModule, adventureId: Id, opts: ReviewContextOptions = {}): Promise<Record<string, unknown>> {
  const ids = reviewDocIds(store, adventureId);
  await Promise.all(
    ids.map((id) => {
      registry.open(id);
      return (opts.whenDocSynced ? opts.whenDocSynced(id) : registry.whenReady(id)).catch(() => undefined);
    }),
  );
  return buildAdventureReviewContext(store, (id) => (id && registry.has(id) ? plainText(registry.open(id)) : ""), module, adventureId, opts);
}

/**
 * Synchronous variant of `adventureReviewContext` over already-loaded docs:
 * `docText` returns a doc's plain text ("" for a missing or unloaded doc).
 */
export function buildAdventureReviewContext(
  store: CampaignStore,
  docText: (id: Id | undefined) => string,
  module: BuilderModule,
  adventureId: Id,
  opts: Pick<ReviewContextOptions, "mode" | "roles"> = {},
): Record<string, unknown> {
  const adventure = store.get("adventures", adventureId);
  if (!adventure) throw new Error(`adventures/${adventureId} not found`);
  const gm = gameModule(module);
  const mode = opts.mode ?? store.meta().mode;
  const text = (id: Id | undefined) => (id ? docText(id) : "");
  const acts = adventureActs(store, adventure);
  const actById = new Map(acts.map((a) => [a.id, a]));

  const sceneCtx = (s: Scene): Record<string, unknown> => {
    const fields = narrativeFieldsOf(s);
    const act = s.act ? actById.get(s.act) : undefined;
    return {
      id: s.id,
      title: s.title,
      purpose: s.purpose ?? "",
      status: s.status,
      mandatory: s.events.some((e) => e.mandatory) || s.tags.includes("mandatory"),
      events: s.events.map((e) => ({ text: e.text, mandatory: e.mandatory, done: e.done === true })),
      tags: s.tags,
      fields,
      computed: narrativeComputed(gm, "scene", mode, fields),
      body: text(s.bodyDoc),
      readAloud: text(s.readAloudDoc),
      act: act?.number ?? null,
      actId: act?.id ?? null,
    };
  };

  const scenes: Array<Record<string, unknown>> = [];
  const actsCtx = acts.map((a) => {
    const own = a.scenes
      .map((id) => store.get("scenes", id))
      .filter((s): s is Scene => !!s)
      .map(sceneCtx);
    scenes.push(...own);
    const fields = narrativeFieldsOf(a);
    return {
      id: a.id,
      number: a.number,
      title: a.title ?? "",
      goal: a.goal ?? "",
      pacing: text(a.pacingDoc),
      fields,
      computed: narrativeComputed(gm, "act", mode, fields),
      scenes: own,
      sceneCount: own.length,
      mandatoryCount: own.filter((s) => s.mandatory).length,
    };
  });

  // Handouts of the adventure, its acts and its scenes.
  const sceneAct = new Map<Id, Act>();
  for (const a of acts) for (const sid of a.scenes) sceneAct.set(sid, a);
  const handouts: Array<{ h: Handout; act?: Act }> = [];
  const seen = new Set<Id>();
  const pushHandout = (h: Handout, act?: Act) => {
    if (seen.has(h.id)) return;
    seen.add(h.id);
    handouts.push(act ? { h, act } : { h });
  };
  for (const a of acts) for (const h of handoutsOfAct(store, a)) pushHandout(h, a);
  for (const h of store.list("handouts")) {
    if (h.attachedTo?.kind === "scene" && sceneAct.has(h.attachedTo.id)) pushHandout(h, sceneAct.get(h.attachedTo.id));
    else if (h.attachedTo?.kind === "adventure" && h.attachedTo.id === adventureId) pushHandout(h);
  }
  const handoutsCtx = handouts.map(({ h, act }) => ({
    id: h.id,
    title: h.title,
    kind: h.kind,
    character: h.character ?? null,
    characterName: h.character ? (store.get("entities", h.character)?.name ?? null) : null,
    act: act?.number ?? null,
    actId: act?.id ?? null,
    scene: h.attachedTo?.kind === "scene" ? h.attachedTo.id : null,
    body: text(h.bodyDoc),
  }));

  const memberCtx = (e: Entity): Record<string, unknown> => {
    const def = gm.entityTypes.find((t) => t.id === e.type);
    let computed: Record<string, unknown> = {};
    try {
      computed = def ? computeFields(def, e.fields) : {};
    } catch {
      computed = {};
    }
    const agendas = handoutsCtx
      .filter((h) => h.kind === "agenda" && h.character === e.id)
      .sort((x, y) => (x.act ?? 0) - (y.act ?? 0))
      .map((h) => ({ act: h.act, actId: h.actId, handoutId: h.id, title: h.title, text: h.body }));
    const agendaByAct: Record<string, string> = {};
    for (const a of agendas) if (a.act !== null && agendaByAct[String(a.act)] === undefined) agendaByAct[String(a.act)] = a.text;
    return { id: e.id, name: e.name, type: e.type, subtype: e.subtype ?? null, summary: e.summary ?? "", tags: e.tags, fields: e.fields, computed, agendas, agendaByAct };
  };

  const roles = opts.roles ?? Object.keys(adventure.cast ?? {});
  const cast: Record<string, Array<Record<string, unknown>>> = {};
  for (const role of roles) cast[role] = castMembers(store, adventureId, role).map(memberCtx);

  const fields = narrativeFieldsOf(adventure);
  const ctx: Record<string, unknown> = {};
  // Roles first, so a role can never shadow the core keys.
  for (const role of roles) ctx[role] = cast[role];
  Object.assign(ctx, {
    adventure: {
      id: adventure.id,
      title: adventure.title,
      premise: adventure.premise ?? "",
      status: adventure.status,
      hooksIn: adventure.hooksIn,
      hooksOut: adventure.hooksOut,
      tags: adventure.tags,
      builderId: adventure.builderId ?? null,
      fields,
      computed: narrativeComputed(gm, "adventure", mode, fields),
      playerIntro: text(adventure.playerIntroDoc),
      gmSituation: text(adventure.gmSituationDoc),
      epilogue: text(adventure.epilogueDoc),
    },
    acts: actsCtx,
    scenes,
    cast,
    handouts: handoutsCtx,
  });
  return ctx;
}
