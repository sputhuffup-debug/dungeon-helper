import type { ReferenceList, ReferenceItem } from "@campaign-forge/module-sdk";

/**
 * Minor corporations (Evolved Edition p. 176-177). One short descriptor each.
 * Also materialized as `alien.faction` presets with `minor: true` in
 * ./factions.ts; keep the two lists in sync by importing from here.
 */

export interface MinorCorporation extends ReferenceItem {
  id: string;
  name: string;
  summary: string;
  sector: string;
  allegiance: "uas" | "3we" | "upp" | "icsc" | "independent" | "unknown";
  headquarters: string;
}

export const minorCorporationRows: MinorCorporation[] = [
  { id: "hyperdyne-systems", name: "Hyperdyne Systems", summary: "Synthetics and robotics; builds the androids Weyland-Yutani does not.", sector: "synthetics", allegiance: "uas", headquarters: "Earth" },
  { id: "lasalle-bionational", name: "Lasalle Bionational", summary: "Biotech and pharmaceuticals; rumored to run its own xenobiology program.", sector: "biotech", allegiance: "uas", headquarters: "Earth" },
  { id: "armat-battlefield-systems", name: "Armat Battlefield Systems", summary: "USCMC's main small-arms supplier: pulse rifles, smartguns, sentry guns.", sector: "arms", allegiance: "uas", headquarters: "Earth" },
  { id: "lockmart", name: "Lockmart Corporation", summary: "Aerospace manufacturer of freighters, tugs and military hulls.", sector: "aerospace", allegiance: "uas", headquarters: "Earth orbit" },
  { id: "kelland-mining", name: "Kelland Mining Company", summary: "Frontier mining concern that runs rough camps and rougher crews.", sector: "mining", allegiance: "independent", headquarters: "Outer Rim" },
  { id: "jingti-long", name: "Jingti Long Corporation", summary: "Three World Empire conglomerate in shipping and terraforming.", sector: "shipping", allegiance: "3we", headquarters: "Three World Empire" },
  { id: "geofund-investor", name: "GeoFund Investor", summary: "Colony finance and insurance; owns the debt of half the frontier.", sector: "finance", allegiance: "icsc", headquarters: "ICSC" },
  { id: "gemini-exoplanet-solutions", name: "Gemini Exoplanet Solutions", summary: "Survey and exploration contractor selling star charts and claims.", sector: "survey", allegiance: "independent", headquarters: "Outer Veil" },
  { id: "synthetech", name: "Synthetech", summary: "Budget synthetic parts and refurbished androids.", sector: "synthetics", allegiance: "3we", headquarters: "Three World Empire" },
  { id: "samani-communications", name: "Samani Communications", summary: "Comms hardware and relay networks across the arms.", sector: "communications", allegiance: "uas", headquarters: "Earth" },
];

export const minorCorporations: ReferenceList = {
  id: "alien.minor-corporations",
  name: "Minor corporations",
  page: [176, 177],
  unverified: true,
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
  items: minorCorporationRows.map((r) => ({ ...r, page: [176, 177] as [number, number] })),
};
