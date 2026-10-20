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
 * - Duct events: a module table (homebrew, flagged `unverified`), D66 in pairs,
 *   for the GM to roll as the crew crawls a duct sheet. Rows are the module's
 *   own words; where a row applies a book rule it cites the page.
 */
import type { RollTable } from "@campaign-forge/module-sdk";
import { D66_VALUES, d66Grouped, defineTable, row, type RowSpec } from "./_helpers";

const FAMILY = "maps";

export const LOCATION_DETAIL_TABLE_ID = "alien.maps.location-detail";
export const ANOMALOUS_DETAIL_TABLE_ID = "alien.maps.anomalous-detail";
export const SALVAGE_TABLE_ID = "alien.maps.salvage";
export const DUCT_EVENTS_TABLE_ID = "alien.maps.duct-events";

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

type DuctEventKind = "encounter" | "danger" | "comfort";

const ev = (kind: DuctEventKind, label: string, effect: string, extra: Omit<RowSpec, "label" | "result"> = {}): RowSpec => ({ label, result: { kind, effect }, ...extra });

/**
 * Duct events (module table, not from the book): D66 read in pairs, 11-26
 * encounters, 31-46 dangers, 51-66 comforts. GM only.
 */
export const ductEventsTable: RollTable = defineTable({
  id: DUCT_EVENTS_TABLE_ID,
  name: "Duct events",
  page: 56,
  dice: "d66",
  family: FAMILY,
  tags: ["maps", "ducts", "gm"],
  notes:
    "Module table (homebrew, not from the book), for the GM only. Roll when a crewmember enters a new duct zone, or once per stretch spent in the ducts. 11-26 encounters, 31-46 dangers, 51-66 comforts. Rows that use a book rule cite its page.",
  rows: d66Grouped(2, [
    ev("encounter", "Scratching ahead", "Something shifts in the next zone along and goes still when the crew does. Unnerving: +1 stress to each crewmember who hears it.", { page: 72 }),
    ev("encounter", "Shape at a junction", "A threat crosses a nearby junction and keeps going. Roll passive Observation for both sides as it comes into line of sight.", { page: 56 }),
    ev("encounter", "Someone in the way", "A frightened survivor is wedged in the duct ahead. Nobody gets past until they are talked round with Manipulation or helped back out.", { page: [60, 61] }),
    ev("encounter", "Voices through the vents", "Talk, a radio or a scream carries up from a room this duct passes. The GM says one true thing about that room."),
    ev("encounter", "Something left behind", "A shed husk, a torn boot or a body is jammed in the duct. Unnerving: +1 stress for whoever crawls past it.", { page: 72 }),
    ev("encounter", "Tracker ping", "A motion tracker, if the crew carries one, shows movement in the ducts within four zones; the nearest threat moves one zone toward the crew.", { page: 58 }),
    ev("danger", "Fan spins up", "A fan in this zone starts turning and blocks the duct until it is stopped: Comtech at its panel or Heavy Machinery to jam it, a full action either way.", { page: 60 }),
    ev("danger", "Steam burst", "A seam in a pipe splits. Everyone in the zone faces an attack of 3 base dice, as from a fire, with armor counting as normal (module decision).", { page: 76 }),
    ev("danger", "Panel gives way", "The duct floor sags under the crawler. Mobility to catch hold; a failure drops them into the zone below for half the height in damage, rounded down. Only where there is gravity.", { page: [60, 75] }),
    ev("danger", "The duct narrows", "The way ahead squeezes down. Bulky gear such as a flamethrower or a tracker case has to be pushed ahead or left behind (module decision)."),
    ev("danger", "Something drips", "Warm coolant leaks onto the crew from a seam. A Survival roll for the heat; a failure leaves the crawler fatigued until they are out of it.", { page: 75 }),
    ev("danger", "A loud knock", "A knee or a tool bangs the duct wall and the sound carries. The GM moves the nearest threat one zone toward the noise (module decision)."),
    ev("comfort", "Dry pocket", "A quiet, dry bend with room to sit. A stretch of rest here takes 1 off stress and, if not fatigued, gives back 1 Health, unless the rest is broken.", { page: [68, 73] }),
    ev("comfort", "Maintenance cache", "A tool locker bolted inside the duct. Roll once on the salvage table, common column.", { page: 297, roll: [{ table: SALVAGE_TABLE_ID, as: "salvage" }] }),
    ev("comfort", "Grate with a view", "A grate looks into a room this duct passes. The GM tells the crew what is in it and whether anything there is moving."),
    ev("comfort", "Working light", "A maintenance lamp still works. This zone is not dark until the lamp is broken.", { page: 57 }),
    ev("comfort", "Stencilled schematic", "Faded arrows and room numbers on the duct wall. The GM tells the crew where one exit from this sheet comes out."),
    ev("comfort", "Watch point", "A spot with sight along two runs. Keeping guard here for a stretch gives +2 dice to Observation.", { page: 56 }),
  ]),
});

export const mapTables: RollTable[] = [locationDetailTable, anomalousDetailTable, salvageTable, ductEventsTable];
