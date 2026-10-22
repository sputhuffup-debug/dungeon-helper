/**
 * Demo primers: each demo's campaign primer, started from its module's
 * prompts and starter text, drafted from the demo's player-visible data, then
 * written over with the demo's own (original) text where it has some.
 */
import { draftPrimer, ensurePrimer, fromMarkdown, type CampaignStore, type RichTextRegistry } from "@campaign-forge/core";
import type { GameModule } from "@campaign-forge/module-sdk";

/** Section id -> Markdown; `null` keeps the drafted (or starter) text. */
export type DemoPrimerText = Record<string, string | null>;

export function writeDemoPrimer(store: CampaignStore, registry: RichTextRegistry, module: GameModule, text: DemoPrimerText): void {
  const { primer } = ensurePrimer(store, registry, module);
  const draft = draftPrimer({ maps: store.toJSON(), module, doc: (id) => (registry.has(id) ? registry.open(id) : undefined) });
  for (const s of primer.sections) {
    const own = text[s.id];
    const md = own ?? draft[s.id];
    if (md !== undefined) fromMarkdown(registry.open(s.doc), md);
  }
}
