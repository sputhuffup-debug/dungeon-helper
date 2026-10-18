import type { AlienPreset } from "./types";
import { subtypeTag, withinTag } from "./types";

/**
 * Charted space (Evolved Edition Chapter 9, p. 180-201, and the Tartarus
 * Sector, p. 260-277): regions, political blocs, sectors, star systems,
 * planets, colonies and sites.
 *
 * Containment is expressed with `within:<presetId>` tags; the importer turns
 * them into `within` relationships. Blocs use the `region` subtype with a
 * `bloc` tag because the field doc has no bloc subtype. All rows are from
 * general knowledge and flagged `unverified`.
 */

type Subtype = "region" | "sector" | "star-system" | "planet" | "colony" | "site";

interface LocationSpec {
  id: string;
  subtype: Subtype;
  name: string;
  summary: string;
  page: number | [number, number];
  within?: string;
  fields: Record<string, unknown>;
  tags?: string[];
}

const PREFIX = "alien.location.";

function location(spec: LocationSpec): AlienPreset {
  const tags = ["location", subtypeTag(spec.subtype), ...(spec.tags ?? [])];
  if (spec.within) tags.push(withinTag(`${PREFIX}${spec.within}`));
  return {
    id: `${PREFIX}${spec.id}`,
    entityType: "alien.location",
    subtype: spec.subtype,
    name: spec.name,
    summary: spec.summary,
    page: spec.page,
    tags,
    fields: spec.fields,
    unverified: true,
  };
}

// ---------------------------------------------------------------------------
// Regions (p. 180-183)
// ---------------------------------------------------------------------------

const regions: AlienPreset[] = [
  location({ id: "core", subtype: "region", name: "The Core", summary: "Earth and the oldest colonies; crowded, policed, expensive.", page: 180, fields: { regionId: "core", description: "Sol and the systems within a few parsecs. Law, money and the Company's headquarters." } }),
  location({ id: "outer-veil", subtype: "region", name: "The Outer Veil", summary: "Established colonies and trade routes beyond the Core.", page: 181, fields: { regionId: "outer-veil", description: "Mature colonies, shipyards and the arms' industrial worlds." } }),
  location({ id: "outer-rim", subtype: "region", name: "The Outer Rim", summary: "Mining worlds and company towns at the edge of regular traffic.", page: 182, fields: { regionId: "outer-rim", description: "Where the Colonial Administration's reach thins and the Company's thickens." } }),
  location({ id: "frontier", subtype: "region", name: "The Frontier", summary: "Start-up colonies, survey claims and long silences.", page: 182, fields: { regionId: "frontier", description: "Months from help. Colonies here go dark and nobody checks for a year." } }),
  location({ id: "far-reach", subtype: "region", name: "The Far Reach", summary: "Beyond charted space; derelicts, anomalies and rumors.", page: 183, fields: { regionId: "far-reach", description: "Unclaimed and unmapped. The Company sends survey ships; some return." } }),
];

// ---------------------------------------------------------------------------
// Political blocs (p. 184-189), stored as regions tagged `bloc`
// ---------------------------------------------------------------------------

const blocs: AlienPreset[] = [
  location({ id: "american-arm", subtype: "region", name: "The American Arm", summary: "United Americas colonial space.", page: 184, fields: { allegiance: "uas", description: "The UA's arm of colonized systems, policed by the USCMC and run by the Company." }, tags: ["bloc"] }),
  location({ id: "imperial-arm", subtype: "region", name: "The Imperial Arm", summary: "Three World Empire colonial space.", page: 186, fields: { allegiance: "3we", description: "Chartered corporate colonies under the Crown." }, tags: ["bloc"] }),
  location({ id: "upp-territories", subtype: "region", name: "UPP Territories", summary: "Union of Progressive Peoples space.", page: 187, fields: { allegiance: "upp", description: "Closed borders, state colonies and a fleet that watches the line." }, tags: ["bloc"] }),
  location({ id: "icsc-space", subtype: "region", name: "ICSC Space", summary: "Independent Core System Colonies.", page: 188, fields: { allegiance: "icsc", description: "Free ports and militia worlds wedged between the arms." }, tags: ["bloc"] }),
];

// ---------------------------------------------------------------------------
// Sectors
// ---------------------------------------------------------------------------

const sectors: AlienPreset[] = [
  location({ id: "sol-sector", subtype: "sector", name: "Sol Sector", summary: "Humanity's home sector.", page: 190, within: "core", fields: { region: "core", allegiance: "uas", description: "Sol, Alpha Centauri and the first-wave colonies." } }),
  location({ id: "zeta-reticuli-sector", subtype: "sector", name: "Zeta Reticuli Sector", summary: "Frontier sector on the Company's expansion route.", page: 196, within: "frontier", fields: { region: "frontier", allegiance: "uas", description: "Terraforming claims, a few shake-and-bake colonies, and the Zeta 2 Reticuli derelict." } }),
  location({ id: "tartarus-sector", subtype: "sector", name: "Tartarus Sector", summary: "The campaign sandbox: a contested frontier sector with a dozen systems.", page: [260, 263], within: "frontier", fields: { region: "frontier", allegiance: "unknown", description: "Claimed by the UA, the 3WE and the ICSC at once; home to Anchorpoint and a lot of empty cargo manifests." }, tags: ["sandbox"] }),
];

// ---------------------------------------------------------------------------
// Star systems (p. 190-199, 264-277)
// ---------------------------------------------------------------------------

const systems: AlienPreset[] = [
  location({ id: "sol", subtype: "star-system", name: "Sol", summary: "Earth's system.", page: 190, within: "sol-sector", fields: { starClass: "G", brightness: "V", region: "core", allegiance: "uas", bodies: [
    { type: "terrestrial", name: "Earth" }, { type: "terrestrial", name: "Mars" }, { type: "gas-giant", name: "Jupiter", features: ["Dozens of moons", "Helium-3 skimming"] }, { type: "gas-giant", name: "Saturn", features: ["Titan"] }, { type: "asteroid-belt", name: "Main Belt" },
  ] } }),
  location({ id: "alpha-centauri", subtype: "star-system", name: "Alpha Centauri", summary: "First interstellar colony system.", page: 191, within: "sol-sector", fields: { starClass: "G", brightness: "V", region: "core", allegiance: "uas", bodies: [{ type: "terrestrial", name: "Alpha Centauri Prime" }, { type: "asteroid-belt" }] } }),
  location({ id: "epsilon-eridani", subtype: "star-system", name: "Epsilon Eridani", summary: "Old Imperial Arm colony system.", page: 192, within: "imperial-arm", fields: { starClass: "K", brightness: "V", region: "outer-veil", allegiance: "3we", bodies: [{ type: "terrestrial" }, { type: "gas-giant" }, { type: "asteroid-belt" }] } }),
  location({ id: "zeta-2-reticuli", subtype: "star-system", name: "Zeta 2 Reticuli", summary: "The system of Acheron and the derelict.", page: 196, within: "zeta-reticuli-sector", fields: { starClass: "G", brightness: "V", region: "frontier", allegiance: "uas", bodies: [{ type: "gas-giant", name: "Calpamos", features: ["Ring system", "Three moons including LV-426"] }, { type: "terrestrial", name: "LV-223" }] } }),
  location({ id: "fiorina-system", subtype: "star-system", name: "Fiorina (Fury) System", summary: "Dim star, one prison.", page: 197, within: "outer-rim", fields: { starClass: "K", brightness: "V", region: "outer-rim", allegiance: "uas", bodies: [{ type: "terrestrial", name: "Fiorina 161" }, { type: "ice" }] } }),
  location({ id: "arcturus", subtype: "star-system", name: "Arcturus", summary: "Bright giant with company mining operations.", page: 198, within: "outer-veil", fields: { starClass: "K", brightness: "III", region: "outer-veil", allegiance: "uas", bodies: [{ type: "asteroid-belt", features: ["Rich metals"] }, { type: "gas-giant" }] } }),
  location({ id: "kruger-60", subtype: "star-system", name: "Kruger 60", summary: "Red dwarf binary on the UPP border.", page: 199, within: "upp-territories", fields: { starClass: "M", brightness: "V", region: "outer-veil", allegiance: "upp", bodies: [{ type: "terrestrial", name: "Rodina" }, { type: "ice" }] } }),
  location({ id: "solomons", subtype: "star-system", name: "Solomons", summary: "Hub system of the Tartarus Sector.", page: 264, within: "tartarus-sector", fields: { starClass: "G", brightness: "V", region: "frontier", allegiance: "uas", bodies: [{ type: "terrestrial", name: "Solomons Prime" }, { type: "gas-giant", features: ["Fuel skimming station"] }, { type: "asteroid-belt" }] } }),
  location({ id: "thedus", subtype: "star-system", name: "Thedus", summary: "Mining system on the long haul to Earth.", page: 266, within: "tartarus-sector", fields: { starClass: "K", brightness: "V", region: "frontier", allegiance: "uas", bodies: [{ type: "terrestrial", name: "Thedus" }, { type: "asteroid-belt", features: ["Ore refineries"] }] } }),
  location({ id: "tientsin", subtype: "star-system", name: "Tientsin", summary: "Imperial Arm foothold in Tartarus.", page: 268, within: "tartarus-sector", fields: { starClass: "F", brightness: "V", region: "frontier", allegiance: "3we", bodies: [{ type: "terrestrial", name: "Tientsin" }, { type: "gas-giant" }] } }),
  location({ id: "ariarcus", subtype: "star-system", name: "Ariarcus", summary: "Agricultural system with an ICSC-leaning colony.", page: 270, within: "tartarus-sector", fields: { starClass: "G", brightness: "V", region: "frontier", allegiance: "icsc", bodies: [{ type: "terrestrial", name: "Ariarcus" }, { type: "ice" }, { type: "gas-giant" }] } }),
  location({ id: "tanaka-5", subtype: "star-system", name: "Tanaka 5", summary: "Desert world system; home of the scorpionids.", page: 272, within: "tartarus-sector", fields: { starClass: "K", brightness: "IV", region: "frontier", allegiance: "independent", bodies: [{ type: "terrestrial", name: "Tanaka 5" }, { type: "asteroid-belt" }] } }),
  location({ id: "sutters-world-system", subtype: "star-system", name: "Sutter's World System", summary: "Terraforming claim at the edge of the sector.", page: 274, within: "tartarus-sector", fields: { starClass: "G", brightness: "V", region: "frontier", allegiance: "uas", bodies: [{ type: "terrestrial", name: "Sutter's World" }, { type: "gas-giant" }] } }),
];

// ---------------------------------------------------------------------------
// Planets and moons (p. 190-201, 264-277)
// ---------------------------------------------------------------------------

const planets: AlienPreset[] = [
  location({ id: "earth", subtype: "planet", name: "Earth", summary: "Overcrowded, overbuilt, still the center of everything.", page: 190, within: "sol", fields: { planetType: "terrestrial", diameterKm: 12742, gravity: "1.0 G", atmosphere: "breathable", temperature: "temperate", geosphere: "oceans", terrain: "urban", inhabited: true, population: "billions", orbitalComponents: ["Gateway Station", "Luna", "shipyards"], affiliation: "United Americas / 3WE / UPP", classification: "homeworld", climate: "varied", keyResources: ["capital", "people"], colonies: [] } }),
  location({ id: "mars", subtype: "planet", name: "Mars", summary: "Terraformed in part; the Core's industrial backyard.", page: 190, within: "sol", fields: { planetType: "terrestrial", diameterKm: 6779, gravity: "0.38 G", atmosphere: "thin", temperature: "cold", geosphere: "arid", terrain: "desert", inhabited: true, population: "millions", orbitalComponents: ["Phobos naval yard"], affiliation: "United Americas", classification: "industrial", climate: "cold desert", keyResources: ["iron", "shipyards"], colonies: ["Olympia"] } }),
  location({ id: "luna", subtype: "planet", name: "Luna", summary: "Earth's moon; domed cities and the Company's shipyards.", page: 190, within: "sol", fields: { planetType: "terrestrial", diameterKm: 3474, gravity: "0.16 G", atmosphere: "none", temperature: "extreme", geosphere: "barren", terrain: "regolith", inhabited: true, population: "millions", orbitalComponents: [], affiliation: "United Americas", classification: "industrial", colonies: ["Luna City"] }, tags: ["moon"] }),
  location({ id: "calpamos", subtype: "planet", name: "Calpamos", summary: "Ringed gas giant orbited by LV-426.", page: 196, within: "zeta-2-reticuli", fields: { planetType: "gas-giant", diameterKm: 140000, gravity: "n/a", atmosphere: "hydrogen", temperature: "frozen", geosphere: "none", terrain: "none", inhabited: false, orbitalComponents: ["Ring system", "LV-426", "two other moons"], classification: "gas giant" } }),
  location({ id: "lv-426-acheron", subtype: "planet", name: "LV-426 (Acheron)", summary: "Storm-wracked moon; a derelict ship and the ruins of Hadley's Hope.", page: 196, within: "calpamos", fields: { planetType: "terrestrial", diameterKm: 1200, gravity: "0.86 G", atmosphere: "toxic (being terraformed)", temperature: "cold", geosphere: "rocky", terrain: "mountainous, storms", inhabited: true, population: "158 (before the blackout)", orbitalComponents: [], affiliation: "Weyland-Yutani / Colonial Administration", classification: "terraforming colony", climate: "constant storms", keyResources: ["terraforming claim", "the derelict"], colonies: ["Hadley's Hope"] }, tags: ["moon", "xenomorph"] }),
  location({ id: "lv-223", subtype: "planet", name: "LV-223", summary: "Moon with Engineer installations; quarantined.", page: 196, within: "zeta-2-reticuli", fields: { planetType: "terrestrial", diameterKm: 1100, gravity: "0.9 G", atmosphere: "toxic", temperature: "cold", geosphere: "rocky", terrain: "mountainous", inhabited: false, orbitalComponents: [], affiliation: "Weyland-Yutani (sealed)", classification: "quarantine", keyResources: ["Engineer technology", "black pathogen"] }, tags: ["moon", "engineer"] }),
  location({ id: "fiorina-161", subtype: "planet", name: "Fiorina 161 (Fury)", summary: "Windswept world of lead works and a prison.", page: 197, within: "fiorina-system", fields: { planetType: "terrestrial", diameterKm: 11000, gravity: "1.0 G", atmosphere: "breathable", temperature: "cold", geosphere: "oceans, rock", terrain: "coastal plains", inhabited: true, population: "a few dozen", orbitalComponents: [], affiliation: "Weyland-Yutani", classification: "work prison", climate: "cold and windy", keyResources: ["lead", "smelting"], colonies: ["Fury 161 Work Correctional Unit"] } }),
  location({ id: "rodina", subtype: "planet", name: "Rodina", summary: "UPP capital world beyond Earth.", page: 199, within: "kruger-60", fields: { planetType: "terrestrial", diameterKm: 10500, gravity: "0.9 G", atmosphere: "breathable", temperature: "cold", geosphere: "tundra", terrain: "steppe", inhabited: true, population: "tens of millions", orbitalComponents: ["Naval station"], affiliation: "UPP", classification: "capital", climate: "subarctic", keyResources: ["industry", "fleet"], colonies: ["Novgorod"] } }),
  location({ id: "solomons-prime", subtype: "planet", name: "Solomons Prime", summary: "Hub world of Tartarus with Anchorpoint in orbit.", page: 264, within: "solomons", fields: { planetType: "terrestrial", diameterKm: 9800, gravity: "0.95 G", atmosphere: "breathable", temperature: "temperate", geosphere: "oceans", terrain: "archipelagos", inhabited: true, population: "hundreds of thousands", orbitalComponents: ["Anchorpoint Station"], affiliation: "United Americas", classification: "established colony", climate: "maritime", keyResources: ["trade", "fishing", "shipyards"], colonies: ["Port Solomon"] } }),
  location({ id: "thedus-planet", subtype: "planet", name: "Thedus", summary: "Mining world, mostly underground.", page: 266, within: "thedus", fields: { planetType: "terrestrial", diameterKm: 7200, gravity: "0.7 G", atmosphere: "thin", temperature: "cold", geosphere: "rocky", terrain: "canyons", inhabited: true, population: "thousands", orbitalComponents: ["Refinery platform"], affiliation: "Kelland Mining / United Americas", classification: "mining colony", keyResources: ["ore", "rare metals"], colonies: ["Thedus Mining Colony"] } }),
  location({ id: "tientsin-planet", subtype: "planet", name: "Tientsin", summary: "3WE garden colony, orderly and watched.", page: 268, within: "tientsin", fields: { planetType: "terrestrial", diameterKm: 12000, gravity: "1.05 G", atmosphere: "breathable", temperature: "temperate", geosphere: "oceans", terrain: "plains and forest", inhabited: true, population: "hundreds of thousands", orbitalComponents: ["Customs station"], affiliation: "Three World Empire", classification: "established colony", climate: "temperate", keyResources: ["agriculture", "biotech"], colonies: ["New Osaka"] } }),
  location({ id: "ariarcus-planet", subtype: "planet", name: "Ariarcus", summary: "Farm world with an independent streak.", page: 270, within: "ariarcus", fields: { planetType: "terrestrial", diameterKm: 10200, gravity: "0.9 G", atmosphere: "breathable", temperature: "temperate", geosphere: "lakes", terrain: "grassland", inhabited: true, population: "tens of thousands", orbitalComponents: [], affiliation: "ICSC", classification: "young colony", climate: "continental", keyResources: ["grain", "livestock"], colonies: ["Ariarcus Landing"] } }),
  location({ id: "tanaka-5-planet", subtype: "planet", name: "Tanaka 5", summary: "Desert world; scorpionids under the sand.", page: 272, within: "tanaka-5", fields: { planetType: "terrestrial", diameterKm: 8400, gravity: "0.8 G", atmosphere: "thin", temperature: "hot", geosphere: "arid", terrain: "dunes and salt flats", inhabited: true, population: "a few hundred", orbitalComponents: [], affiliation: "independent", classification: "start-up colony", climate: "hot desert", keyResources: ["silicates", "xenofauna"], colonies: ["Tanaka Station"] }, tags: ["creature:tanakan-scorpionid"] }),
  location({ id: "sutters-world", subtype: "planet", name: "Sutter's World", summary: "Half-terraformed claim with a processor that keeps breaking.", page: 274, within: "sutters-world-system", fields: { planetType: "terrestrial", diameterKm: 9000, gravity: "0.85 G", atmosphere: "toxic (being terraformed)", temperature: "cold", geosphere: "rocky", terrain: "volcanic plains", inhabited: true, population: "about a hundred", orbitalComponents: [], affiliation: "Weyland-Yutani", classification: "start-up colony", climate: "cold and dusty", keyResources: ["terraforming claim"], colonies: ["Sutter's Landing"] } }),
];

// ---------------------------------------------------------------------------
// Colonies and stations (p. 190-201, 264-277)
// ---------------------------------------------------------------------------

const colonies: AlienPreset[] = [
  location({ id: "gateway-station", subtype: "colony", name: "Gateway Station", summary: "Earth-orbit transit hub and Colonial Administration seat.", page: 190, within: "earth", fields: { colonySize: "established", population: "tens of thousands", missions: ["transit hub", "administration", "shipyard"], factions: [{ type: "government", name: "Colonial Administration" }, { type: "corporation", name: "Weyland-Yutani" }], allegiance: "uas", affiliation: "United Americas", classification: "orbital station", resources: "trade, bureaucracy" }, tags: ["station"] }),
  location({ id: "olympia", subtype: "colony", name: "Olympia", summary: "Martian capital under the dome.", page: 190, within: "mars", fields: { colonySize: "established", population: "millions", missions: ["industry", "shipyards", "research"], factions: [{ type: "government", name: "United Americas" }, { type: "corporation", name: "Lockmart" }], allegiance: "uas", affiliation: "United Americas", classification: "city", resources: "heavy industry" } }),
  location({ id: "luna-city", subtype: "colony", name: "Luna City", summary: "Domed lunar city and Company yards.", page: 190, within: "luna", fields: { colonySize: "established", population: "millions", missions: ["shipyards", "finance"], factions: [{ type: "corporation", name: "Weyland-Yutani" }], allegiance: "uas", affiliation: "United Americas", classification: "city", resources: "shipbuilding" } }),
  location({ id: "hadleys-hope", subtype: "colony", name: "Hadley's Hope", summary: "Shake-and-bake terraforming colony on Acheron; went dark.", page: 196, within: "lv-426-acheron", fields: { colonySize: "young", population: 158, missions: ["terraforming", "survey"], factions: [{ type: "corporation", name: "Weyland-Yutani" }, { type: "colonial", name: "Colonial Administration" }], allegiance: "uas", affiliation: "Weyland-Yutani", classification: "terraforming colony", resources: "atmosphere processor", campaignHook: "Contact lost; the Company is very interested in why." }, tags: ["xenomorph"] }),
  location({ id: "fury-161-work-prison", subtype: "colony", name: "Fury 161 Work Correctional Unit", summary: "Double-Y chromosome prison and lead works, winding down.", page: 197, within: "fiorina-161", fields: { colonySize: "young", population: "about 25", missions: ["penal", "smelting"], factions: [{ type: "corporation", name: "Weyland-Yutani" }], allegiance: "uas", affiliation: "Weyland-Yutani", classification: "work prison", resources: "lead", campaignHook: "No weapons, no women, one escape pod crashing in the bay." }, tags: ["prison"] }),
  location({ id: "novgorod", subtype: "colony", name: "Novgorod", summary: "UPP capital city on Rodina.", page: 199, within: "rodina", fields: { colonySize: "established", population: "millions", missions: ["government", "industry", "military"], factions: [{ type: "government", name: "UPP Central Committee" }], allegiance: "upp", affiliation: "UPP", classification: "capital", resources: "state industry" } }),
  location({ id: "anchorpoint-station", subtype: "colony", name: "Anchorpoint Station", summary: "Deep-space station over Solomons Prime; the sector's crossroads.", page: 264, within: "solomons-prime", fields: { colonySize: "established", population: "thousands", missions: ["transit hub", "customs", "research"], factions: [{ type: "government", name: "Colonial Administration" }, { type: "corporation", name: "Weyland-Yutani" }, { type: "military", name: "USCMC detachment" }], allegiance: "uas", affiliation: "United Americas", classification: "orbital station", resources: "docking, fuel, information", campaignHook: "Every job in Tartarus starts or ends here." }, tags: ["station", "home-base"] }),
  location({ id: "port-solomon", subtype: "colony", name: "Port Solomon", summary: "Surface capital of Solomons Prime.", page: 265, within: "solomons-prime", fields: { colonySize: "established", population: "hundreds of thousands", missions: ["trade", "fishing", "shipyards"], factions: [{ type: "colonial", name: "Colonial Administration" }, { type: "corporation", name: "Seegson" }], allegiance: "uas", affiliation: "United Americas", classification: "city", resources: "trade" } }),
  location({ id: "thedus-mining-colony", subtype: "colony", name: "Thedus Mining Colony", summary: "Kelland company town, deep in the canyons.", page: 266, within: "thedus-planet", fields: { colonySize: "established", population: "thousands", missions: ["mining", "refining"], factions: [{ type: "corporation", name: "Kelland Mining Company" }, { type: "other", name: "Miners' union" }], allegiance: "uas", affiliation: "Kelland Mining Company", classification: "mining colony", resources: "ore", campaignHook: "The union is organizing and the company has hired marshals." } }),
  location({ id: "new-osaka", subtype: "colony", name: "New Osaka", summary: "3WE colonial capital on Tientsin.", page: 268, within: "tientsin-planet", fields: { colonySize: "established", population: "hundreds of thousands", missions: ["agriculture", "biotech", "administration"], factions: [{ type: "government", name: "Three World Empire" }, { type: "corporation", name: "Jingti Long Corporation" }], allegiance: "3we", affiliation: "Three World Empire", classification: "city", resources: "biotech" } }),
  location({ id: "ariarcus-landing", subtype: "colony", name: "Ariarcus Landing", summary: "Farm town and grain port.", page: 270, within: "ariarcus-planet", fields: { colonySize: "young", population: "tens of thousands", missions: ["agriculture", "livestock"], factions: [{ type: "colonial", name: "Colony council" }, { type: "corporation", name: "GeoFund Investor" }], allegiance: "icsc", affiliation: "ICSC", classification: "farm colony", resources: "grain", campaignHook: "GeoFund is calling in the colony's debt." } }),
  location({ id: "tanaka-station", subtype: "colony", name: "Tanaka Station", summary: "Survey outpost on the desert world.", page: 272, within: "tanaka-5-planet", fields: { colonySize: "start-up", population: "a few hundred", missions: ["survey", "xenobiology"], factions: [{ type: "corporation", name: "Gemini Exoplanet Solutions" }], allegiance: "independent", affiliation: "independent", classification: "outpost", resources: "xenofauna samples", campaignHook: "Something keeps digging under the perimeter." } }),
  location({ id: "sutters-landing", subtype: "colony", name: "Sutter's Landing", summary: "Terraforming start-up with a failing processor.", page: 274, within: "sutters-world", fields: { colonySize: "start-up", population: "about a hundred", missions: ["terraforming"], factions: [{ type: "corporation", name: "Weyland-Yutani" }], allegiance: "uas", affiliation: "Weyland-Yutani", classification: "terraforming colony", resources: "atmosphere processor", campaignHook: "The last supply run never arrived." } }),
];

// ---------------------------------------------------------------------------
// Sites
// ---------------------------------------------------------------------------

const sites: AlienPreset[] = [
  location({ id: "derelict-lv-426", subtype: "site", name: "The Derelict", summary: "Crashed Engineer ship on LV-426 with a cargo of eggs.", page: 196, within: "lv-426-acheron", fields: { description: "Horseshoe-shaped alien vessel; a fossilized pilot in the chair and a cargo hold full of ovomorphs." }, tags: ["xenomorph", "engineer"] }),
  location({ id: "hadleys-hope-atmosphere-processor", subtype: "site", name: "Atmosphere Processor, Hadley's Hope", summary: "Fusion-powered terraforming plant; hive underneath.", page: 196, within: "hadleys-hope", fields: { description: "Multi-level industrial structure with a reactor core. Unstable if damaged." }, tags: ["xenomorph"] }),
  location({ id: "anchorpoint-docks", subtype: "site", name: "Anchorpoint Docks", summary: "Cargo ring of Anchorpoint Station.", page: 264, within: "anchorpoint-station", fields: { description: "Loaders, customs cages, union halls and the bars where crews get hired." } }),
  location({ id: "lv-223-temple", subtype: "site", name: "LV-223 Installation", summary: "Engineer temple complex under a mountain.", page: 196, within: "lv-223", fields: { description: "Domed chambers, urns of black pathogen and a sleeping crew." }, tags: ["engineer"] }),
];

export const locationPresets: AlienPreset[] = [...regions, ...blocs, ...sectors, ...systems, ...planets, ...colonies, ...sites];
