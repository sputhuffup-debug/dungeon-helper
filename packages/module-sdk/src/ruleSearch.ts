/**
 * Search over a module's rule cards and its Reference page (reference list
 * items, entity presets, roll tables), for the app's global search: an entry
 * whose title holds the query ranks first, then one whose tags do, then one
 * whose summary does. Each word of the query must match somewhere in the
 * entry; a title that starts with the query ranks above one that only
 * holds it. Pure and game-agnostic.
 */
import type { EntityPreset, PlayModeId, ReferenceItem, ReferenceList, RollTable, RuleCard } from "./types";

export interface RuleSearchHit {
  card: RuleCard;
  /** Higher is better. */
  score: number;
}

const norm = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "");

/** Rule cards matching `query`, best first (cards of other play modes left out when `mode` is given). */
export function searchRuleCards(rules: readonly RuleCard[], query: string, opts: { mode?: PlayModeId; limit?: number } = {}): RuleSearchHit[] {
  const words = norm(query).split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];
  const hits: RuleSearchHit[] = [];
  for (const card of rules) {
    if (opts.mode && card.mode && card.mode.length > 0 && !card.mode.includes(opts.mode)) continue;
    const title = norm(card.title);
    const tags = norm((card.tags ?? []).join(" "));
    const summary = norm(card.summary);
    let score = 0;
    let all = true;
    for (const w of words) {
      const s = title.split(/\W+/).some((t) => t.startsWith(w)) ? 10 : title.includes(w) ? 6 : tags.includes(w) ? 4 : summary.includes(w) ? 1 : 0;
      if (s === 0) {
        all = false;
        break;
      }
      score += s;
    }
    // a title that starts with the query reads as the card asked for
    if (all) hits.push({ card, score: score + (title.startsWith(words.join(" ")) ? 5 : 0) });
  }
  hits.sort((a, b) => b.score - a.score || a.card.title.localeCompare(b.card.title));
  return opts.limit !== undefined ? hits.slice(0, opts.limit) : hits;
}

/** One entry of a module's Reference page: a reference list item, an entity preset or a roll table. */
export type ReferenceEntry =
  | { kind: "item"; id: string; name: string; list: ReferenceList; item: ReferenceItem }
  | { kind: "preset"; id: string; name: string; preset: EntityPreset }
  | { kind: "table"; id: string; name: string; table: RollTable };

export interface ReferenceSearchHit {
  entry: ReferenceEntry;
  /** Higher is better. */
  score: number;
}

interface IndexedEntry {
  entry: ReferenceEntry;
  name: string;
  /** The name split into words, for prefix matches. */
  words: string[];
  /** Tags, the list's name, a table's family. */
  tags: string;
  summary: string;
  mode?: readonly PlayModeId[];
}

/** A search index over a module's Reference page; build it once per module and pass it to `searchReference`. */
export interface ReferenceIndex {
  entries: IndexedEntry[];
}

/** Everything the Reference page lists: every reference list's items, the entity presets and the roll tables. */
export function referenceIndex(mod: { referenceLists: readonly ReferenceList[]; presets: readonly EntityPreset[]; tables: readonly RollTable[] }): ReferenceIndex {
  const entries: IndexedEntry[] = [];
  const add = (entry: ReferenceEntry, tags: string, summary: string, mode?: readonly PlayModeId[]) => {
    const name = norm(entry.name);
    entries.push({ entry, name, words: name.split(/\W+/).filter(Boolean), tags: norm(tags), summary: norm(summary), mode });
  };
  for (const list of mod.referenceLists) for (const item of list.items) add({ kind: "item", id: item.id, name: item.name, list, item }, list.name, item.summary ?? "", item.mode);
  for (const preset of mod.presets) add({ kind: "preset", id: preset.id, name: preset.name, preset }, (preset.tags ?? []).join(" "), preset.summary ?? "");
  for (const table of mod.tables) add({ kind: "table", id: table.id, name: table.name, table }, table.family ?? "", "", table.mode);
  return { entries };
}

/**
 * Reference entries matching `query`, best first, ranked like `searchRuleCards`:
 * every word must match the name (a word starting with it ranks highest), the
 * tags (a preset's tags, the item's list, a table's family) or the summary.
 * Entries of other play modes are left out when `mode` is given.
 */
export function searchReference(index: ReferenceIndex, query: string, opts: { mode?: PlayModeId; limit?: number } = {}): ReferenceSearchHit[] {
  const words = norm(query).split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];
  const phrase = words.join(" ");
  const hits: ReferenceSearchHit[] = [];
  for (const e of index.entries) {
    if (opts.mode && e.mode && e.mode.length > 0 && !e.mode.includes(opts.mode)) continue;
    let score = 0;
    let all = true;
    for (const w of words) {
      const s = e.words.some((t) => t.startsWith(w)) ? 10 : e.name.includes(w) ? 6 : e.tags.includes(w) ? 4 : e.summary.includes(w) ? 1 : 0;
      if (s === 0) {
        all = false;
        break;
      }
      score += s;
    }
    if (all) hits.push({ entry: e.entry, score: score + (e.name === phrase ? 8 : e.name.startsWith(phrase) ? 5 : 0) });
  }
  hits.sort((a, b) => b.score - a.score || a.entry.name.localeCompare(b.entry.name));
  return opts.limit !== undefined ? hits.slice(0, opts.limit) : hits;
}

/**
 * How well a title matches a query, for ranking hits of different kinds
 * (records, rule cards, reference entries) against each other: 5 the title
 * is the query, 4 it starts with it, 3 every word of the query starts a word
 * of the title, 2 the title holds every word, 0 it matched elsewhere (a
 * description, a tag). Accents and case are ignored.
 */
export function titleMatchQuality(title: string, query: string): number {
  const t = norm(title).trim();
  const words = norm(query).split(/\s+/).filter(Boolean);
  if (words.length === 0 || !t) return 0;
  const phrase = words.join(" ");
  if (t === phrase) return 5;
  if (t.startsWith(phrase)) return 4;
  const titleWords = t.split(/\W+/).filter(Boolean);
  if (words.every((w) => titleWords.some((tw) => tw.startsWith(w)))) return 3;
  if (words.every((w) => t.includes(w))) return 2;
  return 0;
}
