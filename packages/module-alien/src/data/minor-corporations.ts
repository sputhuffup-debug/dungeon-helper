import type { ReferenceList, ReferenceItem } from "@campaign-forge/module-sdk";

/**
 * Minor corporations: the ten companies of "The Company You Keep" list
 * (Evolved Edition p. 162). Checked against the book: names and allegiances
 * as stated there; summaries are short paraphrases. Allegiance is "unknown"
 * and headquarters is absent where the list says nothing.
 *
 * Lasalle Bionational is not here: the book gives it a full entry
 * (p. 175), so it is a major faction preset in ./factions.ts.
 *
 * Also materialized as `alien.faction` presets with `minor: true` in
 * ./factions.ts; keep the two lists in sync by importing from here.
 */

export interface MinorCorporation extends ReferenceItem {
  id: string;
  name: string;
  summary: string;
  sector: string;
  allegiance: "uas" | "3we" | "upp" | "icsc" | "independent" | "unknown";
  headquarters?: string;
}

export const MINOR_CORPORATIONS_PAGE = 162;

export const minorCorporationRows: MinorCorporation[] = [
  { id: "alphatech-hardware", name: "Alphatech Hardware", summary: "A major military contractor supplying the UA and other corporations.", sector: "military contracting", allegiance: "unknown" },
  { id: "chigusa-corporation", name: "Chigusa Corporation", summary: "A Weyland-Yutani rival in colonization, plasma harvesting and mining.", sector: "colonization, plasma harvesting, mining", allegiance: "unknown" },
  { id: "gemba-systec", name: "Gemba Systec", summary: "Makes electronics and handles freight.", sector: "electronics, freight handling", allegiance: "unknown" },
  { id: "hyperdyne-systems", name: "Hyperdyne Systems", summary: "An ICSC subsidiary of Weyland-Yutani building high-end synthetics and cybernetic prosthetics.", sector: "synthetics, cybernetic prosthetics", allegiance: "icsc" },
  { id: "jingti-long", name: "Jĭngtì Lóng Corporation", summary: "An ICSC rival of Weyland-Yutani and Seegson in colonization and weapons research.", sector: "colonization, weapons R&D", allegiance: "icsc" },
  { id: "kelland-mining", name: "Kelland Mining Company", summary: "A deep space mining company that builds huge orbital mining stations.", sector: "deep space mining", allegiance: "unknown" },
  { id: "koorlander-corp", name: "Koorlander Corp", summary: "Grows tobacco on several colonies; its cigarettes compete with Balaji Imperial.", sector: "tobacco", allegiance: "unknown" },
  { id: "souta-corp", name: "Souta Corp", summary: "Brews Souta Dry, the cheap alternative to Weyland-Yutani's Aspen Beer.", sector: "beer", allegiance: "unknown" },
  { id: "lockmart", name: "Lockmart", summary: "An ICSC company and the leading builder of commercial starships.", sector: "commercial starships", allegiance: "icsc" },
  { id: "steer-city-cattle-company", name: "Steer City Cattle Company", summary: "A small outfit supplying draft animals and quality meat to Frontier colonies.", sector: "livestock", allegiance: "unknown", headquarters: "Terraform 3" },
];

export const minorCorporations: ReferenceList = {
  id: "alien.minor-corporations",
  name: "Minor corporations",
  page: MINOR_CORPORATIONS_PAGE,
  itemSchema: {
    type: "object",
    properties: {
      id: { type: "string" },
      name: { type: "string" },
      summary: { type: "string" },
      sector: { type: "string" },
      allegiance: { type: "string" },
      headquarters: { type: "string" },
    },
  },
  items: minorCorporationRows.map((r) => ({ ...r, page: MINOR_CORPORATIONS_PAGE })),
};
