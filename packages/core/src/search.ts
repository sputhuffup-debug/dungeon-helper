/**
 * Full-text search over the campaign with MiniSearch: prefix and fuzzy,
 * incremental updates from the store, viewer-aware filtering.
 */
import MiniSearch, { type SearchOptions } from "minisearch";
import { stringLeaves } from "./paths";
import type { CampaignStore, StoreChange } from "./store";
import type { Id, MapName, Visibility } from "./types";
import { canSee, type Viewer } from "./visibility";

export type SearchKind = "entity" | "scene" | "adventure" | "note" | "handout" | "session";

const KIND_TO_MAP: Record<SearchKind, MapName> = {
  entity: "entities",
  scene: "scenes",
  adventure: "adventures",
  note: "notes",
  handout: "handouts",
  session: "sessions",
};
const MAP_TO_KIND = new Map<MapName, SearchKind>(Object.entries(KIND_TO_MAP).map(([k, m]) => [m, k as SearchKind]));

interface SearchDoc {
  key: string;
  id: Id;
  kind: SearchKind;
  name: string;
  type?: string;
  summary?: string;
  tags?: string;
  text?: string;
  /** Record visibility; GM-only structures carry `{ level: "gm" }`. */
  visibility: Visibility;
}

export interface SearchHit {
  id: Id;
  kind: SearchKind;
  name: string;
  type?: string;
  score: number;
  /** Fields that matched. */
  matches: string[];
}

export interface SearchQueryOptions {
  /** Record kinds to include (default all). */
  kinds?: SearchKind[];
  /** Entity type ids to include (entities only). */
  types?: string[];
  limit?: number;
  viewer?: Viewer;
  prefix?: boolean;
  fuzzy?: number | boolean;
}

const GM_ONLY: Visibility = { level: "gm" };

export class SearchIndex {
  readonly #mini: MiniSearch<SearchDoc>;
  #unsubscribe: (() => void) | undefined;

  constructor() {
    this.#mini = new MiniSearch<SearchDoc>({
      idField: "key",
      fields: ["name", "summary", "tags", "type", "text"],
      storeFields: ["id", "kind", "name", "type", "visibility"],
      searchOptions: { boost: { name: 3, tags: 2 }, prefix: true, fuzzy: 0.2 },
    });
  }

  get size(): number {
    return this.#mini.documentCount;
  }

  /** Drop everything and index the store. */
  rebuild(store: CampaignStore): void {
    this.#mini.removeAll();
    const docs: SearchDoc[] = [];
    for (const kind of Object.keys(KIND_TO_MAP) as SearchKind[]) {
      for (const record of store.list(KIND_TO_MAP[kind])) {
        const doc = this.#toDoc(kind, record as unknown as Record<string, unknown>);
        if (doc) docs.push(doc);
      }
    }
    this.#mini.addAll(docs);
  }

  /** Index (or re-index) one record. */
  upsert(store: CampaignStore, map: MapName, id: Id): void {
    const kind = MAP_TO_KIND.get(map);
    if (!kind) return;
    const record = store.get(map, id);
    const key = `${kind}:${id}`;
    if (!record) {
      this.remove(map, id);
      return;
    }
    const doc = this.#toDoc(kind, record as unknown as Record<string, unknown>);
    if (!doc) return;
    if (this.#mini.has(key)) this.#mini.replace(doc);
    else this.#mini.add(doc);
  }

  remove(map: MapName, id: Id): void {
    const kind = MAP_TO_KIND.get(map);
    if (!kind) return;
    const key = `${kind}:${id}`;
    if (this.#mini.has(key)) this.#mini.discard(key);
  }

  /** Rebuild from the store and keep the index in sync with it. */
  attach(store: CampaignStore): () => void {
    this.detach();
    this.rebuild(store);
    const listener = (change: StoreChange) => {
      if (change.map === "meta") return;
      if (!MAP_TO_KIND.has(change.map)) return;
      for (const id of change.ids) this.upsert(store, change.map, id);
    };
    this.#unsubscribe = store.subscribe(listener);
    return () => this.detach();
  }

  detach(): void {
    if (this.#unsubscribe) this.#unsubscribe();
    this.#unsubscribe = undefined;
  }

  search(query: string, opts: SearchQueryOptions = {}): SearchHit[] {
    const q = query.trim();
    if (!q) return [];
    const kinds = opts.kinds ? new Set(opts.kinds) : undefined;
    const types = opts.types ? new Set(opts.types) : undefined;
    const viewer = opts.viewer ?? { role: "gm" };
    const searchOptions: SearchOptions = {
      prefix: opts.prefix ?? true,
      fuzzy: opts.fuzzy ?? 0.2,
      filter: (result) => {
        const kind = result["kind"] as SearchKind;
        if (kinds && !kinds.has(kind)) return false;
        if (types && (kind !== "entity" || !types.has(result["type"] as string))) return false;
        if (viewer.role !== "gm" && !canSee(result["visibility"] as Visibility, viewer)) return false;
        return true;
      },
    };
    const results = this.#mini.search(q, searchOptions);
    const limit = opts.limit ?? 50;
    return results.slice(0, limit).map((r) => {
      const hit: SearchHit = {
        id: r["id"] as Id,
        kind: r["kind"] as SearchKind,
        name: r["name"] as string,
        score: r.score,
        matches: [...new Set(Object.values(r.match).flat())],
      };
      if (typeof r["type"] === "string") hit.type = r["type"];
      return hit;
    });
  }

  /** Suggest completions for a partial query. */
  suggest(query: string, limit = 10): string[] {
    return this.#mini.autoSuggest(query, { prefix: true, fuzzy: 0.2 }).slice(0, limit).map((s) => s.suggestion);
  }

  #toDoc(kind: SearchKind, r: Record<string, unknown>): SearchDoc | undefined {
    const id = r["id"];
    if (typeof id !== "string") return undefined;
    const base: SearchDoc = { key: `${kind}:${id}`, id, kind, name: "", visibility: GM_ONLY };
    switch (kind) {
      case "entity": {
        base.name = String(r["name"] ?? "");
        base.type = String(r["type"] ?? "");
        if (typeof r["summary"] === "string") base.summary = r["summary"];
        base.tags = (Array.isArray(r["tags"]) ? (r["tags"] as unknown[]) : []).map(String).join(" ");
        base.text = stringLeaves(r["fields"]).join(" ");
        base.visibility = (r["visibility"] as Visibility | undefined) ?? GM_ONLY;
        break;
      }
      case "scene": {
        base.name = String(r["title"] ?? "");
        if (typeof r["purpose"] === "string") base.summary = r["purpose"];
        base.tags = (Array.isArray(r["tags"]) ? (r["tags"] as unknown[]) : []).map(String).join(" ");
        break;
      }
      case "adventure": {
        base.name = String(r["title"] ?? "");
        if (typeof r["premise"] === "string") base.summary = r["premise"];
        base.tags = (Array.isArray(r["tags"]) ? (r["tags"] as unknown[]) : []).map(String).join(" ");
        break;
      }
      case "note": {
        base.name = String(r["title"] ?? "");
        base.tags = (Array.isArray(r["tags"]) ? (r["tags"] as unknown[]) : []).map(String).join(" ");
        break;
      }
      case "handout": {
        base.name = String(r["title"] ?? "");
        base.type = String(r["kind"] ?? "");
        base.visibility = (r["visibility"] as Visibility | undefined) ?? GM_ONLY;
        break;
      }
      case "session": {
        const number = r["number"];
        const title = typeof r["title"] === "string" ? r["title"] : "";
        base.name = title ? `Session ${String(number)}: ${title}` : `Session ${String(number)}`;
        if (typeof r["summary"] === "string") base.summary = r["summary"];
        break;
      }
    }
    return base;
  }
}
