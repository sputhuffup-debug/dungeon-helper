/**
 * CampaignStore: one Yjs document holding the campaign.
 *
 * Layout: a top-level `Y.Map` per map name in MAP_NAMES, plus `meta`. Each
 * record is a `Y.Map` of plain JSON values, so fields merge last-writer-wins
 * while nested objects and arrays are replaced whole on update. Rich-text
 * bodies live in separate documents (see richtext.ts), referenced by id.
 *
 * Records returned by `get`/`list`/`meta` are cached snapshots: treat them as
 * immutable and change data through `update`/`transact`.
 */
import * as Y from "yjs";
import { newId, now } from "./ids";
import { clone } from "./paths";
import {
  MAP_NAMES,
  type Act,
  type Adventure,
  type BaseRecord,
  type CampaignMaps,
  type CampaignMeta,
  type Entity,
  type Handout,
  type Id,
  type MapName,
  type Note,
  type RecordOf,
  type Relationship,
  type Scene,
  type Session,
  type SiteMap,
  type TimelineEvent,
  type Visibility,
} from "./types";

export interface StoreChange {
  map: MapName | "meta";
  /** Record ids added, changed or removed; for `meta`, the changed field names. */
  ids: string[];
}

export type StoreListener = (change: StoreChange) => void;

export type NewRecord<M extends MapName> = Omit<RecordOf<M>, keyof BaseRecord>;

export interface CreateCampaignOptions {
  name: string;
  moduleId: string;
  moduleVersion: string;
  mode: string;
  calendarId: string;
  settings?: Record<string, unknown>;
  currentDate?: string;
  /** Name of the GM member record created with the campaign. */
  gmName?: string;
}

const GM_VISIBILITY: Visibility = { level: "gm" };

/** Rich-text document ids referenced by every record in the maps. */
export function docIdsOf(maps: CampaignMaps): Id[] {
  const ids = new Set<Id>();
  const add = (id: Id | undefined) => {
    if (id) ids.add(id);
  };
  for (const a of Object.values(maps.adventures)) {
    add(a.playerIntroDoc);
    add(a.gmSituationDoc);
    add(a.epilogueDoc);
  }
  for (const a of Object.values(maps.acts)) add(a.pacingDoc);
  for (const s of Object.values(maps.scenes)) {
    add(s.bodyDoc);
    add(s.readAloudDoc);
  }
  for (const s of Object.values(maps.sessions)) add(s.logDoc);
  for (const h of Object.values(maps.handouts)) add(h.bodyDoc);
  for (const n of Object.values(maps.notes)) add(n.bodyDoc);
  for (const s of maps.meta.primer?.sections ?? []) add(s.doc);
  return [...ids];
}

export class CampaignStore {
  readonly #doc: Y.Doc;
  readonly #listeners = new Set<StoreListener>();
  readonly #cache = new WeakMap<object, unknown>();
  #pending = new Map<MapName | "meta", Set<string>>();
  #observing = false;
  #unobserve: Array<() => void> = [];

  private constructor(doc: Y.Doc) {
    this.#doc = doc;
    // Observers run from the start: they also invalidate the snapshot cache.
    this.#ensureObserving();
  }

  // -------------------------------------------------------------------------
  // construction
  // -------------------------------------------------------------------------

  static create(opts: CreateCampaignOptions): CampaignStore {
    const store = new CampaignStore(new Y.Doc());
    const ts = now();
    const meta: CampaignMeta = {
      id: newId(),
      created: ts,
      updated: ts,
      name: opts.name,
      moduleId: opts.moduleId,
      moduleVersion: opts.moduleVersion,
      mode: opts.mode,
      calendarId: opts.calendarId,
      settings: clone(opts.settings ?? {}),
      members: [{ id: newId(), name: opts.gmName ?? "GM", role: "gm" }],
    };
    if (opts.currentDate !== undefined) meta.currentDate = opts.currentDate;
    store.transact(() => {
      const m = store.#metaMap();
      for (const [k, v] of Object.entries(meta)) m.set(k, v);
    });
    return store;
  }

  /** Wrap an existing document (for example one loaded from persistence). */
  static fromDoc(doc: Y.Doc): CampaignStore {
    return new CampaignStore(doc);
  }

  /** Build a new store from exported maps (import). */
  static fromJSON(maps: CampaignMaps): CampaignStore {
    const store = new CampaignStore(new Y.Doc());
    store.loadJSON(maps);
    return store;
  }

  get doc(): Y.Doc {
    return this.#doc;
  }

  /** The campaign id (from meta). Empty string when meta is not loaded yet. */
  get id(): Id {
    const id = this.#metaMap().get("id");
    return typeof id === "string" ? id : "";
  }

  /** Release observers. Does not destroy the Y.Doc. */
  destroy(): void {
    for (const u of this.#unobserve) u();
    this.#unobserve = [];
    this.#observing = false;
    this.#listeners.clear();
  }

  // -------------------------------------------------------------------------
  // meta
  // -------------------------------------------------------------------------

  meta(): CampaignMeta {
    return this.#snapshot(this.#metaMap()) as CampaignMeta;
  }

  updateMeta(patch: Partial<Omit<CampaignMeta, "id" | "created">>): CampaignMeta {
    this.transact(() => {
      const m = this.#metaMap();
      this.#applyPatch(m, patch as Record<string, unknown>);
      m.set("updated", now());
      this.#cache.delete(m);
    });
    return this.meta();
  }

  // -------------------------------------------------------------------------
  // generic CRUD
  // -------------------------------------------------------------------------

  get<M extends MapName>(map: M, id: Id): RecordOf<M> | undefined {
    const rec = this.#top(map).get(id);
    if (!rec) return undefined;
    return this.#snapshot(rec) as RecordOf<M>;
  }

  has(map: MapName, id: Id): boolean {
    return this.#top(map).has(id);
  }

  list<M extends MapName>(map: M): RecordOf<M>[] {
    const out: RecordOf<M>[] = [];
    this.#top(map).forEach((rec) => {
      out.push(this.#snapshot(rec) as RecordOf<M>);
    });
    return out;
  }

  count(map: MapName): number {
    return this.#top(map).size;
  }

  /** Insert a record under a new id, or under `id` when given (it must be unused). */
  insert<M extends MapName>(map: M, record: NewRecord<M>, id: Id = newId()): RecordOf<M> {
    if (this.#top(map).has(id)) throw new Error(`${map}/${id} already exists`);
    const ts = now();
    const full = { ...(record as Record<string, unknown>), id, created: ts, updated: ts };
    this.transact(() => {
      const rec = new Y.Map<unknown>();
      for (const [k, v] of Object.entries(full)) {
        if (v !== undefined) rec.set(k, clone(v));
      }
      this.#top(map).set(id, rec);
    });
    return full as unknown as RecordOf<M>;
  }

  /** Patch a record; `undefined` values delete the field. Sets `updated`. */
  update<M extends MapName>(map: M, id: Id, patch: Partial<RecordOf<M>>): RecordOf<M> {
    const rec = this.#top(map).get(id);
    if (!rec) throw new Error(`${map}/${id} not found`);
    this.transact(() => {
      const p = { ...(patch as Record<string, unknown>) };
      delete p["id"];
      delete p["created"];
      this.#applyPatch(rec, p);
      rec.set("updated", now());
      this.#cache.delete(rec);
    });
    return this.#snapshot(rec) as RecordOf<M>;
  }

  /** Remove a record and its dependants. Returns false when it did not exist. */
  remove(map: MapName, id: Id): boolean {
    const top = this.#top(map);
    if (!top.has(id)) return false;
    this.transact(() => {
      this.#cascade(map, id);
      top.delete(id);
    });
    return true;
  }

  transact<T>(fn: () => T): T {
    let result!: T;
    this.#doc.transact(() => {
      result = fn();
    }, this);
    return result;
  }

  // -------------------------------------------------------------------------
  // convenience creators
  // -------------------------------------------------------------------------

  createEntity(input: {
    /** Use this id (must be unused); a new id otherwise. */
    id?: Id;
    type: string;
    name: string;
    fields?: Record<string, unknown>;
    subtype?: string;
    summary?: string;
    tags?: string[];
    visibility?: Visibility;
    image?: Id;
    ownerMemberId?: Id;
    provenance?: Entity["provenance"];
    conditions?: Entity["conditions"];
  }): Entity {
    const rec: NewRecord<"entities"> = {
      type: input.type,
      name: input.name,
      tags: input.tags ?? [],
      visibility: input.visibility ?? GM_VISIBILITY,
      fields: input.fields ?? {},
    };
    if (input.subtype !== undefined) rec.subtype = input.subtype;
    if (input.summary !== undefined) rec.summary = input.summary;
    if (input.image !== undefined) rec.image = input.image;
    if (input.ownerMemberId !== undefined) rec.ownerMemberId = input.ownerMemberId;
    if (input.provenance !== undefined) rec.provenance = input.provenance;
    if (input.conditions !== undefined) rec.conditions = input.conditions;
    return input.id !== undefined ? this.insert("entities", rec, input.id) : this.insert("entities", rec);
  }

  createRelationship(type: string, from: Id, to: Id, note?: string, visibility?: Visibility): Relationship {
    const rec: NewRecord<"relationships"> = { type, from, to, visibility: visibility ?? GM_VISIBILITY };
    if (note !== undefined) rec.note = note;
    return this.insert("relationships", rec);
  }

  createAdventure(input: {
    title: string;
    premise?: string;
    status?: Adventure["status"];
    templateId?: string;
    tags?: string[];
    hooksIn?: string[];
    hooksOut?: string[];
    /** Allocate rich-text docs for the template sections. */
    withDocs?: boolean;
  }): Adventure {
    const rec: NewRecord<"adventures"> = {
      title: input.title,
      status: input.status ?? "planned",
      hooksIn: input.hooksIn ?? [],
      hooksOut: input.hooksOut ?? [],
      acts: [],
      tags: input.tags ?? [],
    };
    if (input.premise !== undefined) rec.premise = input.premise;
    if (input.templateId !== undefined) rec.templateId = input.templateId;
    if (input.withDocs) {
      rec.playerIntroDoc = newId();
      rec.gmSituationDoc = newId();
      rec.epilogueDoc = newId();
    }
    return this.insert("adventures", rec);
  }

  createAct(adventureId: Id, input: { number?: number; goal?: string; title?: string; withPacingDoc?: boolean } = {}): Act {
    const adventure = this.get("adventures", adventureId);
    if (!adventure) throw new Error(`adventures/${adventureId} not found`);
    return this.transact(() => {
      const rec: NewRecord<"acts"> = {
        adventure: adventureId,
        number: input.number ?? adventure.acts.length + 1,
        handouts: [],
        scenes: [],
      };
      if (input.goal !== undefined) rec.goal = input.goal;
      if (input.title !== undefined) rec.title = input.title;
      if (input.withPacingDoc) rec.pacingDoc = newId();
      const act = this.insert("acts", rec);
      this.update("adventures", adventureId, { acts: [...adventure.acts, act.id] });
      return act;
    });
  }

  createScene(
    actId: Id | undefined,
    input: {
      title: string;
      purpose?: string;
      location?: Id;
      participants?: Id[];
      clues?: Id[];
      encounter?: Id;
      map?: Id;
      status?: Scene["status"];
      tags?: string[];
      events?: Scene["events"];
      withReadAloudDoc?: boolean;
    },
  ): Scene {
    const act = actId !== undefined ? this.get("acts", actId) : undefined;
    if (actId !== undefined && !act) throw new Error(`acts/${actId} not found`);
    return this.transact(() => {
      const rec: NewRecord<"scenes"> = {
        title: input.title,
        participants: input.participants ?? [],
        bodyDoc: newId(),
        clues: input.clues ?? [],
        status: input.status ?? "planned",
        events: input.events ?? [],
        tags: input.tags ?? [],
      };
      if (actId !== undefined) rec.act = actId;
      if (input.purpose !== undefined) rec.purpose = input.purpose;
      if (input.location !== undefined) rec.location = input.location;
      if (input.encounter !== undefined) rec.encounter = input.encounter;
      if (input.map !== undefined) rec.map = input.map;
      if (input.withReadAloudDoc) rec.readAloudDoc = newId();
      const scene = this.insert("scenes", rec);
      if (act) this.update("acts", act.id, { scenes: [...act.scenes, scene.id] });
      return scene;
    });
  }

  createSession(input: { date?: string; title?: string; number?: number; attendees?: Id[]; status?: Session["status"] } = {}): Session {
    const rec: NewRecord<"sessions"> = {
      number: input.number ?? this.count("sessions") + 1,
      date: input.date ?? now().slice(0, 10),
      attendees: input.attendees ?? [],
      scenesRun: [],
      logDoc: newId(),
      rewards: [],
      nextPlan: [],
      status: input.status ?? "planned",
      reveals: [],
    };
    if (input.title !== undefined) rec.title = input.title;
    return this.insert("sessions", rec);
  }

  createHandout(input: {
    title: string;
    kind?: Handout["kind"];
    asset?: Id;
    visibility?: Visibility;
    attachedTo?: Handout["attachedTo"];
    character?: Id;
    /** Allocate a body doc (default: yes unless the handout is an image with an asset). */
    withBody?: boolean;
  }): Handout {
    const kind = input.kind ?? (input.asset ? "image" : "text");
    const rec: NewRecord<"handouts"> = { kind, title: input.title, visibility: input.visibility ?? GM_VISIBILITY };
    const withBody = input.withBody ?? !(kind === "image" && input.asset);
    if (withBody) rec.bodyDoc = newId();
    if (input.asset !== undefined) rec.asset = input.asset;
    if (input.attachedTo !== undefined) rec.attachedTo = input.attachedTo;
    if (input.character !== undefined) rec.character = input.character;
    return this.insert("handouts", rec);
  }

  createNote(input: { title: string; attachedTo?: Note["attachedTo"]; tags?: string[] }): Note {
    const rec: NewRecord<"notes"> = { title: input.title, bodyDoc: newId(), tags: input.tags ?? [] };
    if (input.attachedTo !== undefined) rec.attachedTo = input.attachedTo;
    return this.insert("notes", rec);
  }

  createMap(input: {
    name: string;
    asset?: Id;
    width?: number;
    height?: number;
    location?: Id;
    zones?: SiteMap["zones"];
    borders?: SiteMap["borders"];
    accessPoints?: SiteMap["accessPoints"];
    visibility?: Visibility;
  }): SiteMap {
    const rec: NewRecord<"maps"> = {
      name: input.name,
      zones: input.zones ?? [],
      borders: input.borders ?? [],
      accessPoints: input.accessPoints ?? [],
      visibility: input.visibility ?? GM_VISIBILITY,
    };
    if (input.asset !== undefined) rec.asset = input.asset;
    if (input.width !== undefined) rec.width = input.width;
    if (input.height !== undefined) rec.height = input.height;
    if (input.location !== undefined) rec.location = input.location;
    return this.insert("maps", rec);
  }

  createTimelineEvent(input: { inWorldDate: string; text: string; entities?: Id[]; session?: Id; visibility?: Visibility }): TimelineEvent {
    const rec: NewRecord<"timeline"> = {
      inWorldDate: input.inWorldDate,
      text: input.text,
      entities: input.entities ?? [],
      visibility: input.visibility ?? GM_VISIBILITY,
    };
    if (input.session !== undefined) rec.session = input.session;
    return this.insert("timeline", rec);
  }

  // -------------------------------------------------------------------------
  // ordering
  // -------------------------------------------------------------------------

  /**
   * Move `childId` inside the ordered id list `listField` of `map/id` to
   * `newIndex` (clamped). Returns the new order.
   */
  moveInList<M extends MapName>(map: M, id: Id, listField: keyof RecordOf<M> & string, childId: Id, newIndex: number): Id[] {
    const rec = this.get(map, id);
    if (!rec) throw new Error(`${map}/${id} not found`);
    const current = (rec as unknown as Record<string, unknown>)[listField];
    if (!Array.isArray(current)) throw new Error(`${map}/${id}.${listField} is not a list`);
    const list = (current as Id[]).filter((x) => x !== childId);
    const idx = Math.max(0, Math.min(newIndex, list.length));
    list.splice(idx, 0, childId);
    this.update(map, id, { [listField]: list } as unknown as Partial<RecordOf<M>>);
    return list;
  }

  // -------------------------------------------------------------------------
  // subscriptions
  // -------------------------------------------------------------------------

  subscribe(listener: StoreListener): () => void {
    if (!this.#observing) this.#ensureObserving();
    this.#listeners.add(listener);
    return () => {
      this.#listeners.delete(listener);
    };
  }

  subscribeRecord<M extends MapName>(map: M, id: Id, listener: (record: RecordOf<M> | undefined) => void): () => void {
    return this.subscribe((change) => {
      if (change.map === map && change.ids.includes(id)) listener(this.get(map, id));
    });
  }

  // -------------------------------------------------------------------------
  // JSON
  // -------------------------------------------------------------------------

  toJSON(): CampaignMaps {
    const out: Record<string, unknown> = { meta: this.meta() };
    for (const name of MAP_NAMES) {
      const m: Record<string, unknown> = {};
      this.#top(name).forEach((rec, id) => {
        m[id] = this.#snapshot(rec);
      });
      out[name] = m;
    }
    return out as unknown as CampaignMaps;
  }

  /** Replace the whole document content with `maps` (import). */
  loadJSON(maps: CampaignMaps): void {
    this.transact(() => {
      const meta = this.#metaMap();
      for (const key of [...meta.keys()]) meta.delete(key);
      for (const [k, v] of Object.entries(maps.meta)) {
        if (v !== undefined) meta.set(k, clone(v));
      }
      this.#cache.delete(meta);
      for (const name of MAP_NAMES) {
        const top = this.#top(name);
        for (const key of [...top.keys()]) top.delete(key);
        const records = (maps[name] ?? {}) as unknown as Record<string, Record<string, unknown>>;
        for (const [id, record] of Object.entries(records)) {
          const rec = new Y.Map<unknown>();
          for (const [k, v] of Object.entries(record)) {
            if (v !== undefined) rec.set(k, clone(v));
          }
          top.set(id, rec);
        }
      }
    });
  }

  // -------------------------------------------------------------------------
  // internals
  // -------------------------------------------------------------------------

  #metaMap(): Y.Map<unknown> {
    return this.#doc.getMap<unknown>("meta");
  }

  #top(map: MapName): Y.Map<Y.Map<unknown>> {
    return this.#doc.getMap<Y.Map<unknown>>(map);
  }

  #snapshot(rec: Y.Map<unknown>): unknown {
    const cached = this.#cache.get(rec);
    if (cached !== undefined) return cached;
    const value = clone(rec.toJSON());
    this.#cache.set(rec, value);
    return value;
  }

  #applyPatch(rec: Y.Map<unknown>, patch: Record<string, unknown>): void {
    for (const [k, v] of Object.entries(patch)) {
      if (v === undefined) rec.delete(k);
      else rec.set(k, clone(v));
    }
    // Observers only run when the transaction ends; reads inside a
    // transaction must see local writes, so drop the snapshot now.
    this.#cache.delete(rec);
  }

  #cascade(map: MapName, id: Id): void {
    switch (map) {
      case "entities": {
        for (const rel of this.list("relationships")) {
          if (rel.from === id || rel.to === id) this.#top("relationships").delete(rel.id);
        }
        break;
      }
      case "adventures": {
        const adventure = this.get("adventures", id);
        for (const actId of adventure?.acts ?? []) {
          if (this.has("acts", actId)) {
            this.#cascade("acts", actId);
            this.#top("acts").delete(actId);
          }
        }
        for (const act of this.list("acts")) {
          if (act.adventure === id) {
            this.#cascade("acts", act.id);
            this.#top("acts").delete(act.id);
          }
        }
        break;
      }
      case "acts": {
        const act = this.get("acts", id);
        if (!act) break;
        for (const sceneId of act.scenes) this.#top("scenes").delete(sceneId);
        for (const scene of this.list("scenes")) {
          if (scene.act === id) this.#top("scenes").delete(scene.id);
        }
        const adventure = this.get("adventures", act.adventure);
        if (adventure && adventure.acts.includes(id)) {
          this.update("adventures", adventure.id, { acts: adventure.acts.filter((a) => a !== id) });
        }
        break;
      }
      case "scenes": {
        const scene = this.get("scenes", id);
        if (!scene?.act) break;
        const act = this.get("acts", scene.act);
        if (act && act.scenes.includes(id)) {
          this.update("acts", act.id, { scenes: act.scenes.filter((s) => s !== id) });
        }
        break;
      }
      case "sessions": {
        for (const ts of this.list("trackerState")) {
          if (ts.session === id) this.#top("trackerState").delete(ts.id);
        }
        break;
      }
      default:
        break;
    }
  }

  #ensureObserving(): void {
    if (this.#observing) return;
    this.#observing = true;
    const watch = (name: MapName | "meta", type: Y.AbstractType<unknown>) => {
      const handler = (events: Array<Y.YEvent<Y.AbstractType<unknown>>>) => {
        let ids = this.#pending.get(name);
        if (!ids) {
          ids = new Set();
          this.#pending.set(name, ids);
        }
        for (const ev of events) {
          this.#cache.delete(ev.target);
          if (name === "meta") {
            for (const key of ev.changes.keys.keys()) ids.add(key);
            continue;
          }
          if (ev.target === type) {
            for (const key of ev.changes.keys.keys()) ids.add(key);
          } else {
            const first = ev.path[0];
            if (typeof first === "string") ids.add(first);
          }
        }
      };
      type.observeDeep(handler);
      this.#unobserve.push(() => type.unobserveDeep(handler));
    };
    watch("meta", this.#metaMap() as unknown as Y.AbstractType<unknown>);
    for (const name of MAP_NAMES) watch(name, this.#top(name) as unknown as Y.AbstractType<unknown>);
    const flush = () => {
      if (this.#pending.size === 0) return;
      const pending = this.#pending;
      this.#pending = new Map();
      for (const [map, ids] of pending) {
        const change: StoreChange = { map, ids: [...ids] };
        for (const l of [...this.#listeners]) l(change);
      }
    };
    this.#doc.on("afterTransaction", flush);
    this.#unobserve.push(() => this.#doc.off("afterTransaction", flush));
  }
}
