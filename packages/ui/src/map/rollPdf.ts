/** Roll print to PDF bytes: the planner and page drawing from `rollPrint.ts`, written by the PDF writer. */
import type { SiteLayout } from "@campaign-forge/module-sdk";
import { deckOf, planRollPrint, rollPrintPages, type RollPrintOptions, type RollPrintPlan } from "./rollPrint";
import { svgPagesToPdf } from "./sitePdf";
import { VIEW_NAMES } from "./titleBlock";

/** Plan and render a roll print to PDF bytes. */
export function renderRollPdf(layout: SiteLayout, o: RollPrintOptions): { bytes: Uint8Array; plan: RollPrintPlan } {
  const plan = planRollPrint(layout, o);
  const pages = rollPrintPages(layout, o, plan);
  const deck = deckOf(layout, o.deck)?.name;
  const bytes = svgPagesToPdf(pages, { title: [o.title ?? "Site map", deck, VIEW_NAMES[o.view]].filter(Boolean).join(" · "), subject: plan.summary, creator: "Campaign Forge" });
  return { bytes, plan };
}
