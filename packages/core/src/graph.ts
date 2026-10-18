/**
 * The world-entity graph: relationships from both ends, containment, the
 * atlas tree, backlinks and appearances.
 */
import { CORE_RELATIONSHIP_TYPES, type GameModule, type RelationshipTypeDef } from "@campaign-forge/module-sdk";
import { extractRefs, RichTextRegistry, bodyOf } from "./richtext";
import { docIdsOf, type CampaignStore } from "./store";
import type { Entity, Id, Relationship } from "./types";

export type ModuleRelationships = Pick<GameModule, "relationshipTypes">;
export type ModuleGraphInfo = Partial<Pick<GameModule, "relationshipTypes" | "entityTypes">>;

export interface RelationshipView {
  rel: Relationship;
  other: Id;
  direction: "out" | "in";
  label: string;
}

/** Core relationship types plus the module's; module ids override core ids. */
export function relationshipTypes(module?: ModuleGraphInfo): RelationshipTypeDef[] {
  const byId = new Map<string, RelationshipTypeDef>();
  for (const t of CORE_RELATIONSHIP_TYPES) byId.set(t.id, t);
  for (const t of module?.relationshipTypes ?? []) byId.set(t.id, t);
  return [...byId.values()];
}

export function relationshipLabel(rel: Relationship, direction: "out" | "in", module?: ModuleGraphInfo): string {
  const def = relationshipTypes(module).find((t) => t.id === rel.type);
  if (!def) return direction === "out" ? rel.type : `${rel.type} (reverse)`;
  if (def.symmetric) return def.forward;
  return direction === "out" ? def.forward : def.reverse;
}

/** Every relationship touching `entityId`, read from that entity's end. */
export function relationshipsOf(store: CampaignStore, entityId: Id, module?: ModuleGraphInfo): RelationshipView[] {
  const out: RelationshipView[] = [];
  for (const rel of store.list("relationships")) {
    if (rel.from === entityId) {
      out.push({ rel, other: rel.to, direction: "out", label: relationshipLabel(rel, "out", module) });
    } else if (rel.to === entityId) {
      out.push({ rel, other: rel.from, direction: "in", label: relationshipLabel(rel, "in", module) });
    }
  }
  return out;
}

/** Entities directly `within` `entityId`. */
export function childrenOf(store: CampaignStore, entityId: Id): Entity[] {
  const out: Entity[] = [];
  for (const rel of store.list("relationships")) {
    if (rel.type === "within" && rel.to === entityId) {
      const child = store.get("entities", rel.from);
      if (child) out.push(child);
    }
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

/** The direct parent via `within`, if any. */
export function parentOf(store: CampaignStore, entityId: Id): Entity | undefined {
  const rel = store.list("relationships").find((r) => r.type === "within" && r.from === entityId);
  return rel ? store.get("entities", rel.to) : undefined;
}

/** Ancestors via `within`, nearest first. Cycles are cut. */
export function ancestorsOf(store: CampaignStore, entityId: Id): Entity[] {
  const out: Entity[] = [];
  const seen = new Set<Id>([entityId]);
  let current = parentOf(store, entityId);
  while (current && !seen.has(current.id)) {
    seen.add(current.id);
    out.push(current);
    current = parentOf(store, current.id);
  }
  return out;
}

export interface TreeNode {
  entity: Entity;
  children: TreeNode[];
}

/**
 * The containment tree for the atlas. With a module, only entities whose
 * type is of kind `location` are included (a non-location parent still
 * groups its location children at the root); without one, every entity
 * takes part. Roots are entities with no included parent.
 */
export function locationTree(store: CampaignStore, module?: ModuleGraphInfo): TreeNode[] {
  const locationTypes = module?.entityTypes ? new Set(module.entityTypes.filter((t) => t.kind === "location").map((t) => t.id)) : undefined;
  const include = (e: Entity) => (locationTypes ? locationTypes.has(e.type) : true);
  const entities = store.list("entities").filter(include);
  const byId = new Map(entities.map((e) => [e.id, e]));
  const parent = new Map<Id, Id>();
  for (const rel of store.list("relationships")) {
    if (rel.type === "within" && byId.has(rel.from) && byId.has(rel.to) && !parent.has(rel.from)) parent.set(rel.from, rel.to);
  }
  // cut cycles: drop a parent link that leads back to itself
  for (const [child] of parent) {
    const seen = new Set<Id>([child]);
    let cur = parent.get(child);
    while (cur !== undefined) {
      if (seen.has(cur)) {
        parent.delete(child);
        break;
      }
      seen.add(cur);
      cur = parent.get(cur);
    }
  }
  const nodes = new Map<Id, TreeNode>();
  for (const e of entities) nodes.set(e.id, { entity: e, children: [] });
  const roots: TreeNode[] = [];
  for (const node of nodes.values()) {
    const p = parent.get(node.entity.id);
    const parentNode = p !== undefined ? nodes.get(p) : undefined;
    if (parentNode) parentNode.children.push(node);
    else roots.push(node);
  }
  const sortTree = (list: TreeNode[]) => {
    list.sort((a, b) => a.entity.name.localeCompare(b.entity.name));
    for (const n of list) sortTree(n.children);
  };
  sortTree(roots);
  return roots;
}

// ---------------------------------------------------------------------------
// rich-text reference index
// ---------------------------------------------------------------------------

/** Caches the entity ids referenced by each rich-text doc; updates on doc change. */
export class RefIndex {
  readonly registry: RichTextRegistry;
  readonly #refs = new Map<Id, Id[]>();
  readonly #observers = new Map<Id, () => void>();
  readonly #unsubClose: () => void;

  constructor(registry: RichTextRegistry) {
    this.registry = registry;
    this.#unsubClose = registry.onClose((id) => this.forget(id));
  }

  /** Referenced ids of one doc (opens it through the registry and watches it). */
  refsOf(docId: Id): Id[] {
    const cached = this.#refs.get(docId);
    if (cached) return cached;
    const doc = this.registry.open(docId);
    const refs = extractRefs(doc);
    this.#refs.set(docId, refs);
    if (!this.#observers.has(docId)) {
      const handler = () => {
        this.#refs.set(docId, extractRefs(doc));
      };
      const body = bodyOf(doc);
      body.observeDeep(handler);
      this.#observers.set(docId, () => body.unobserveDeep(handler));
    }
    return refs;
  }

  /** Index every doc the campaign references. */
  indexAll(store: CampaignStore): void {
    for (const id of docIdsOf(store.toJSON())) this.refsOf(id);
  }

  /** Docs (among those indexed) that reference `entityId`. */
  docsReferencing(entityId: Id): Id[] {
    const out: Id[] = [];
    for (const [docId, refs] of this.#refs) if (refs.includes(entityId)) out.push(docId);
    return out;
  }

  indexedDocs(): Id[] {
    return [...this.#refs.keys()];
  }

  forget(docId: Id): void {
    this.#refs.delete(docId);
    const un = this.#observers.get(docId);
    if (un) un();
    this.#observers.delete(docId);
  }

  dispose(): void {
    for (const id of [...this.#observers.keys()]) this.forget(id);
    this.#unsubClose();
  }
}

export interface Backlink {
  kind: "scene" | "note" | "handout" | "session" | "timeline" | "adventure";
  id: Id;
  title: string;
  /** How the record points at the entity. */
  via: string;
}

/**
 * Everything that points at `entityId`: scene participants/location/clues/
 * encounter, timeline entities, handouts, notes attached to it, session
 * rewards, and inline references in rich-text bodies.
 */
export function backlinks(store: CampaignStore, registry: RichTextRegistry | RefIndex, entityId: Id): Backlink[] {
  const index = registry instanceof RefIndex ? registry : new RefIndex(registry);
  const owned = !(registry instanceof RefIndex);
  const out: Backlink[] = [];
  const seen = new Set<string>();
  const push = (b: Backlink) => {
    const key = `${b.kind}:${b.id}:${b.via}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push(b);
  };
  const maps = store.toJSON();

  for (const s of Object.values(maps.scenes)) {
    if (s.participants.includes(entityId)) push({ kind: "scene", id: s.id, title: s.title, via: "participants" });
    if (s.location === entityId) push({ kind: "scene", id: s.id, title: s.title, via: "location" });
    if (s.clues.includes(entityId)) push({ kind: "scene", id: s.id, title: s.title, via: "clues" });
    if (s.encounter === entityId) push({ kind: "scene", id: s.id, title: s.title, via: "encounter" });
  }
  for (const t of Object.values(maps.timeline)) {
    if (t.entities.includes(entityId)) push({ kind: "timeline", id: t.id, title: t.text, via: "entities" });
  }
  for (const h of Object.values(maps.handouts)) {
    if (h.character === entityId) push({ kind: "handout", id: h.id, title: h.title, via: "character" });
  }
  for (const n of Object.values(maps.notes)) {
    if (n.attachedTo?.kind === "entity" && n.attachedTo.id === entityId) push({ kind: "note", id: n.id, title: n.title, via: "attachedTo" });
  }
  for (const s of Object.values(maps.sessions)) {
    if (s.rewards.some((r) => r.characterId === entityId)) push({ kind: "session", id: s.id, title: sessionTitle(s.number, s.title), via: "rewards" });
    if (s.reveals.some((r) => r.entity === entityId)) push({ kind: "session", id: s.id, title: sessionTitle(s.number, s.title), via: "reveals" });
  }

  // rich-text references: doc id -> owning record
  const docOwner = new Map<Id, Backlink>();
  for (const a of Object.values(maps.adventures)) {
    for (const d of [a.playerIntroDoc, a.gmSituationDoc, a.epilogueDoc]) if (d) docOwner.set(d, { kind: "adventure", id: a.id, title: a.title, via: "body" });
  }
  for (const a of Object.values(maps.acts)) {
    const adventure = maps.adventures[a.adventure];
    if (a.pacingDoc && adventure) docOwner.set(a.pacingDoc, { kind: "adventure", id: adventure.id, title: adventure.title, via: `act ${a.number} pacing` });
  }
  for (const s of Object.values(maps.scenes)) {
    docOwner.set(s.bodyDoc, { kind: "scene", id: s.id, title: s.title, via: "body" });
    if (s.readAloudDoc) docOwner.set(s.readAloudDoc, { kind: "scene", id: s.id, title: s.title, via: "readAloud" });
  }
  for (const s of Object.values(maps.sessions)) docOwner.set(s.logDoc, { kind: "session", id: s.id, title: sessionTitle(s.number, s.title), via: "log" });
  for (const h of Object.values(maps.handouts)) if (h.bodyDoc) docOwner.set(h.bodyDoc, { kind: "handout", id: h.id, title: h.title, via: "body" });
  for (const n of Object.values(maps.notes)) docOwner.set(n.bodyDoc, { kind: "note", id: n.id, title: n.title, via: "body" });

  for (const [docId, owner] of docOwner) {
    if (index.refsOf(docId).includes(entityId)) push(owner);
  }
  if (owned) index.dispose();
  return out;
}

function sessionTitle(number: number, title?: string): string {
  return title ? `Session ${number}: ${title}` : `Session ${number}`;
}

export interface Appearance {
  kind: "session" | "scene";
  id: Id;
  title: string;
  /** Session date (ISO) for sessions and for scenes run in a session. */
  date?: string;
  sessionId?: Id;
  via: string;
}

/** Sessions and scenes the entity appeared in, sessions by date then scenes by adventure order. */
export function appearancesTimeline(store: CampaignStore, entityId: Id): Appearance[] {
  const maps = store.toJSON();
  const out: Appearance[] = [];
  const sceneIds = new Set<Id>();
  for (const s of Object.values(maps.scenes)) {
    if (s.participants.includes(entityId) || s.location === entityId || s.clues.includes(entityId) || s.encounter === entityId) sceneIds.add(s.id);
  }
  const sessions = Object.values(maps.sessions).sort((a, b) => a.date.localeCompare(b.date) || a.number - b.number);
  const seenScenes = new Set<Id>();
  for (const session of sessions) {
    const title = sessionTitle(session.number, session.title);
    const ran = session.scenesRun.filter((id) => sceneIds.has(id));
    const direct = session.rewards.some((r) => r.characterId === entityId) || session.reveals.some((r) => r.entity === entityId);
    if (ran.length || direct) {
      out.push({ kind: "session", id: session.id, title, date: session.date, via: ran.length ? "scenesRun" : "session" });
    }
    for (const sceneId of ran) {
      const scene = maps.scenes[sceneId];
      if (!scene) continue;
      seenScenes.add(sceneId);
      out.push({ kind: "scene", id: sceneId, title: scene.title, date: session.date, sessionId: session.id, via: "scene" });
    }
  }
  // planned scenes not yet run, in adventure/act/scene order then the rest
  const ordered: Id[] = [];
  for (const adventure of Object.values(maps.adventures)) {
    for (const actId of adventure.acts) {
      const act = maps.acts[actId];
      if (act) ordered.push(...act.scenes);
    }
  }
  for (const id of [...ordered, ...sceneIds]) {
    if (!sceneIds.has(id) || seenScenes.has(id)) continue;
    const scene = maps.scenes[id];
    if (!scene) continue;
    seenScenes.add(id);
    out.push({ kind: "scene", id, title: scene.title, via: scene.status });
  }
  return out;
}
