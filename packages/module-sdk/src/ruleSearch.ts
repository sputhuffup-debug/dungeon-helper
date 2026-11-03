/**
 * Search over a module's rule cards, for the app's global search: a card
 * whose title holds the query ranks first, then one whose tags do, then one
 * whose summary does. Each word of the query must match somewhere in the
 * card. Pure and game-agnostic.
 */
import type { PlayModeId, RuleCard } from "./types";

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
    if (all) hits.push({ card, score });
  }
  hits.sort((a, b) => b.score - a.score || a.card.title.localeCompare(b.card.title));
  return opts.limit !== undefined ? hits.slice(0, opts.limit) : hits;
}
