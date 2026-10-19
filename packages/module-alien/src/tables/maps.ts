/**
 * Location detail tables for site maps (Last Survivor, p. 296-298). Checked
 * against the book: dice, ranges and entries are the printed ones. Entries are
 * one- to four-word names and item names, kept exact as data.
 *
 * - Location detail (the Environment Matrix, p. 297): D66, one word per entry;
 *   66 means roll twice. The site map generator rolls it once per playable zone.
 * - Anomalous detail (p. 298): D66, for alien derelicts, ruins and places
 *   changed by xenomorphs. The generator uses it for alien ruins and, half the
 *   time, for derelicts.
 * - Salvage (p. 297): D66 with a common and a rare column. The book does not
 *   say when to read the rare column; the generator reads it for key rooms and
 *   dead ends (a module decision, noted on the table).
 */
import type { RollTable } from "@campaign-forge/module-sdk";
import { D66_VALUES, row } from "./_helpers";

const FAMILY = "maps";

export const LOCATION_DETAIL_TABLE_ID = "alien.maps.location-detail";
export const ANOMALOUS_DETAIL_TABLE_ID = "alien.maps.anomalous-detail";
export const SALVAGE_TABLE_ID = "alien.maps.salvage";

/** Environment Matrix entries 11-65 in D66 order (p. 297); 66 is "roll twice". */
export const ENVIRONMENT_DETAILS = [
  "Anomalous",
  "Abandoned",
  "Acid-scarred",
  "Airless",
  "Barricaded",
  "Bloodied",
  "Breached",
  "Bullet-riddled",
  "Claustrophobic",
  "Collapsing",
  "Contaminated",
  "Corpse-strewn",
  "Darkened",
  "Dripping",
  "Echoing",
  "Empty",
  "Expansive",
  "Flickering",
  "Flooded",
  "Illuminated",
  "Inhabited",
  "Radioactive",
  "Ransacked",
  "Sealed",
  "Secure",
  "Silent",
  "Smoke-filled",
  "Sparking",
  "Stinking",
  "Stockpiled",
  "Strobe-lit",
  "Toxic",
  "Trapped",
  "Weightless",
  "Wrecked",
] as const;

/** Anomalous Environment Matrix entries 11-66 in D66 order (p. 298). */
export const ANOMALOUS_DETAILS = [
  "Abandoned gear",
  "Alien vegetation",
  "Altered gravity",
  "Ancient remains",
  "Biological growths",
  "Blood trail",
  "Chitinous surfaces",
  "Cocooned victims",
  "Confounding device",
  "Creeping mist",
  "Dark pit",
  "Discordant noise",
  "Dismantled technology",
  "Dripping ichor",
  "Eerie light",
  "Egg fragments",
  "Empty vessels",
  "Energy field",
  "Enigmatic machine",
  "Etched glyphs",
  "Extreme temperatures",
  "Flickering hologram",
  "Leathery eggs",
  "Mirrored surfaces",
  "Moving architecture",
  "Mutated remains",
  "Organism fused with machinery",
  "Ornate carvings",
  "Pooled liquids",
  "Radioactive hot spot",
  "Remains of intruders",
  "Rotting matter",
  "Sealed cylinders",
  "Strange altar",
  "Unknown tracks",
  "Unnerving shadows",
] as const;

/** Salvage Matrix rows in D66 order (p. 297): [common, rare]. */
export const SALVAGE_ROWS: ReadonlyArray<readonly [string, string]> = [
  ["Ammo", "Weapon scope"],
  ["Bloody jumpsuit", "Vintage watch"],
  ["Bolt gun", "Survival suit"],
  ["Bottled water", "Surgical kit"],
  ["Compression suit", "Stun baton"],
  ["Cutting torch", "Stash of recreational drugs"],
  ["Data disc", "Stash of hard liquor"],
  ["Data tablet", "Rifle"],
  ["Dog tags", "Radiation detection kit"],
  ["E-series watch", "Pressure suit"],
  ["Emergency respirator", "Neuro visor"],
  ["Faded photograph", "Muzzle suppressor"],
  ["Fire axe", "Motion tracker"],
  ["Flares", "Maintenance jack"],
  ["Flashlight", "Incinerator unit"],
  ["Folded map", "Hidden surveillance device"],
  ["Handwritten journal", "Hidden corpse"],
  ["Hastily scrawled message", "Hidden access hatch"],
  ["Improvised weapon", "Heavy weapon"],
  ["Keycard", "Hazmat suit"],
  ["Machine parts", "Handwritten access code"],
  ["Magnetic tape recorder", "Handheld x-ray"],
  ["Magnetic tape cassette", "Grenade"],
  ["Medkit", "Grappling gun"],
  ["Personal communicator", "Geiger counter"],
  ["Personal data transmitter", "Folding winch"],
  ["Pharmaceuticals", "Folder of sensitive documents"],
  ["Pistol", "Flare pistol"],
  ["Power cell", "Explosive charges"],
  ["Prefab meal", "Diagnostic device"],
  ["Religious symbol", "Coolant canister"],
  ["Rope", "Combat knife"],
  ["Stash of cigarettes", "Body armor"],
  ["Toolkit", "Biological specimen"],
  ["Utility knife", "Binoculars"],
  ["Voice recorder", "Alien artifact"],
];

const single = (n: number): [number, number] => [n, n];

export const locationDetailTable: RollTable = {
  id: LOCATION_DETAIL_TABLE_ID,
  name: "Location detail (environment)",
  page: 297,
  dice: "d66",
  family: FAMILY,
  tags: ["maps", "solo", "location"],
  notes: "Roll for a zone's look and feel in a human ship, station or colony. On 66 roll twice.",
  rows: [
    ...ENVIRONMENT_DETAILS.map((label, i) => row(single(D66_VALUES[i]!), label, { detail: label })),
    row([66, 66], "Roll twice", { rollTwice: true }),
  ],
};

export const anomalousDetailTable: RollTable = {
  id: ANOMALOUS_DETAIL_TABLE_ID,
  name: "Anomalous detail",
  page: 298,
  dice: "d66",
  family: FAMILY,
  tags: ["maps", "solo", "location"],
  notes: "For alien derelicts and ruins, or places changed by xenomorphs or biological corruption.",
  rows: ANOMALOUS_DETAILS.map((label, i) => row(single(D66_VALUES[i]!), label, { detail: label })),
};

export const salvageTable: RollTable = {
  id: SALVAGE_TABLE_ID,
  name: "Salvage",
  page: 297,
  dice: "d66",
  family: FAMILY,
  tags: ["maps", "solo", "gear"],
  notes:
    "Roll when scrounging in a human ship, station or colony. The book gives a common and a rare column without saying when to use which; the map generator reads the rare column for key rooms and dead ends (module decision).",
  rows: SALVAGE_ROWS.map(([common, rare], i) => row(single(D66_VALUES[i]!), `${common} / ${rare}`, { common, rare })),
};

export const mapTables: RollTable[] = [locationDetailTable, anomalousDetailTable, salvageTable];
