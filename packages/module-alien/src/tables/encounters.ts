/**
 * Encounter tables (Campaign Play, p. 252-257). Checked against the book:
 * dice, ranges, modifiers and labels follow the printed tables (`entry`
 * holds the book's entry number when a modifier shifts it); longer
 * entries are paraphrased.
 *
 * - Star system encounters (p. 254, rules p. 252): D66; the tens digit drops
 *   by 3 in the Outer Rim or the Frontier and by 5 in uncharted space, and a
 *   tens digit of 0 or less means no encounter. Each modified reading is its
 *   own pure-D66 table built from the same printed rows (`-remote`,
 *   `-uncharted`), so every row bound stays a digit pair; the encounter
 *   procedure picks the table from the region. Vessel rows nest a Ship
 *   Reactions roll, since that table tells whether a passing ship makes contact.
 * - Ship reactions (p. 254): 2D6.
 * - Surface encounters (p. 255): 3D6 with two columns, uninhabited world and
 *   colonized world; "-" in a column means nothing happens there.
 * - General colony encounters (p. 255, rule p. 252): D66 with entries running
 *   to 76; an established colony adds 1 to the tens digit, modelled as the
 *   `general-established` reading of the same 42 entries.
 * - Area encounters (p. 256-257): public, habitation, operations, spaceport
 *   and industrial areas, D66 each.
 */
import type { RollTable, TableRow } from "@campaign-forge/module-sdk";
import { D66_VALUES, ranges, row, type RangeSpec } from "./_helpers";

const FAMILY = "encounters";

/** Book-checked table: no `unverified` flag on the table or its rows. */
function table(spec: Omit<RollTable, "family">): RollTable {
  return { ...spec, family: FAMILY };
}

// ---------------------------------------------------------------------------
// Star system encounters (p. 254)
// ---------------------------------------------------------------------------

/** Regions whose systems take the "Outer Rim or Frontier" modifier. The Far Reach sits on the Frontier (p. 181, 198). */
export const REMOTE_REGIONS = ["outer-rim", "frontier", "far-reach"];

/** [label, is a vessel that can react to the PCs' ship]. */
const STAR_SYSTEM: Array<[string, boolean]> = [
  ["Research vessel", true],
  ["Asteroid drill ship", true],
  ["Small survey ship", true],
  ["M-class commercial starfreighter", true],
  ["Military recon craft", true],
  ["Private executive transport", true],
  ["M-class commercial transport ship", true],
  ["Light shuttle", true],
  ["G-class deep space salvage vessel", true],
  ["Liquefied gas transport", true],
  ["M-class commercial towing vehicle (towing what?)", true],
  ["G-class deep space salvage vessel", true],
  ["M-class commercial starfreighter", true],
  ["Colony supply vessel", true],
  ["Refinery platform (automated)", false],
  ["G-class deep space salvage vessel", true],
  ["Conestoga frigate on patrol", true],
  ["G-class deep space emergency response vessel", true],
  ["Military heavy missile cruiser", true],
  ["M-class commercial towing vehicle (not towing anything)", true],
  ["Heavy shuttle", true],
  ["Fast courier vessel", true],
  ["M-class commercial transport ship", true],
  ["Large space-station", false],
  ["Light tugship", true],
  ["Starcub shuttle", true],
  ["M-class commercial transport ship", true],
  ["Communications relay station", false],
  ["UD-4 dropship in orbit", true],
  ["Starcub shuttle", true],
  ["Customs cutter", true],
  ["Heavy shuttle", true],
  ["Conestoga frigate on operations", true],
  ["Corporate space-station", false],
  ["Private security cutter", true],
  ["Mobile construction rig", false],
];

const SHIP_REACTION_NEST = [{ table: "alien.encounters.ship-reactions", as: "reaction" }];

const STAR_SYSTEM_CADENCE =
  "Roll before entering hyperspace and again after leaving it. While lingering in a system: once per day near a habitable planet, once per week further out, once per month in an unexplored system (p. 252). Vessel rows also roll Ship Reactions.";

/**
 * The star system table read with the tens digit lowered by `shift`: the
 * rolled D66 value v shows the book's entry at v - 10 * shift, and any tens
 * digit of 0 or less is no encounter (p. 254). shift 0 is the printed table.
 */
function starSystemRows(shift: number): TableRow[] {
  const rows: TableRow[] = [];
  const noneUpTo = D66_VALUES[shift * 6 - 1];
  if (noneUpTo !== undefined) rows.push(row([11, noneUpTo], "No encounter", { encounter: null, none: true }));
  for (let i = shift * 6; i < 36; i++) {
    const v = D66_VALUES[i]!;
    const entry = D66_VALUES[i - shift * 6]!;
    const [label, vessel] = STAR_SYSTEM[i - shift * 6]!;
    rows.push(row([v, v], label, { encounter: label, vessel, entry }, vessel ? { roll: SHIP_REACTION_NEST } : {}));
  }
  return rows;
}

export const starSystem: RollTable = table({
  id: "alien.encounters.star-system",
  name: "Star system encounters",
  page: 254,
  dice: "d66",
  notes: `Core Systems and Outer Veil, no modifier. ${STAR_SYSTEM_CADENCE}`,
  rows: starSystemRows(0),
});

export const starSystemRemote: RollTable = table({
  id: "alien.encounters.star-system-remote",
  name: "Star system encounters (Outer Rim or Frontier, -3)",
  page: 254,
  dice: "d66",
  tags: ["tens-digit-modifier"],
  notes: `The printed table with the tens digit lowered by 3 for the Outer Rim or Frontier: 11-36 is no encounter, 41 reads entry 11, and so on. ${STAR_SYSTEM_CADENCE}`,
  rows: starSystemRows(3),
});

export const starSystemUncharted: RollTable = table({
  id: "alien.encounters.star-system-uncharted",
  name: "Star system encounters (uncharted space, -5)",
  page: 254,
  dice: "d66",
  tags: ["tens-digit-modifier"],
  notes: `The printed table with the tens digit lowered by 5 for uncharted space: 11-56 is no encounter, 61-66 read entries 11-16. ${STAR_SYSTEM_CADENCE}`,
  rows: starSystemRows(5),
});

// ---------------------------------------------------------------------------
// Ship reactions (p. 254)
// ---------------------------------------------------------------------------

export const shipReactions: RollTable = table({
  id: "alien.encounters.ship-reactions",
  name: "Ship reactions",
  page: 254,
  dice: "2d6",
  notes: "Most ships keep to their schedule; roll to see whether an encountered ship makes contact (p. 252).",
  rows: ranges([
    [2, 2, "Unusual", { reaction: "unusual", detail: "Odd trajectory, a missing ship's registration, or it will not answer the PCs' signals." }],
    [3, 4, "Dismissive", { reaction: "dismissive", detail: "Declines any request for information or help." }],
    [5, 8, "Radio Silence", { reaction: "radio-silence", detail: "Ignores the PCs' ship, but is polite if hailed." }],
    [9, 10, "Friendly", { reaction: "friendly", detail: "May share information or advice where relevant." }],
    [11, 11, "Assistance", { reaction: "assistance", detail: "May ask for information, help or a spare part." }],
    [12, 12, "Familiar Vessel", { reaction: "familiar", detail: "A ship the PCs know; they may even know the crew." }],
  ]),
});

// ---------------------------------------------------------------------------
// Surface encounters (p. 255)
// ---------------------------------------------------------------------------

const NONE = "No encounter";

/** [lo, hi, uninhabited world, colonized world, extra result fields]. */
const SURFACE: Array<[number, number, string, string, Record<string, unknown>?]> = [
  [3, 5, "Temperature Swing", "Temperature Swing", { detail: "A cold world gets dramatically colder, a hot one hotter." }],
  [6, 7, "Unstable Ground", "Unstable Ground", { detail: "Ice, soft sand, swamp or similar treacherous footing." }],
  [8, 8, "Diversion", "Diversion", { detail: "An escarpment, canyon or similar forces the PCs off course for a shift." }],
  [9, 9, "Cross A Ravine/River", "Cross A Ravine/River", { detail: "Crossable with great care; takes D6 hours and some tense moments.", hours: "1d6" }],
  [10, 10, "Rough Terrain", "Rough Terrain", { detail: "Rocks or dense vegetation halve travel speed for a shift." }],
  [11, 11, NONE, NONE],
  [12, 12, NONE, "Wildcatters", { colonizedDetail: "Prospectors in a single tractor." }],
  [13, 13, NONE, "Mining Operation", { colonizedDetail: "A temporary drilling or mining operation." }],
  [14, 14, NONE, "Lone Colonist", { colonizedDetail: "On foot or in a vehicle." }],
  [15, 15, NONE, "Scientists", { colonizedDetail: "In a vehicle, studying a natural phenomenon, plant life or geology." }],
  [16, 16, NONE, "Abandoned Kit", { colonizedDetail: "Useless, valuable or wrecked." }],
  [17, 18, NONE, "Explorers", { colonizedDetail: "In a vehicle, mapping the area and cataloguing finds." }],
];

export const surface: RollTable = table({
  id: "alien.encounters.surface",
  name: "Surface encounters",
  page: 255,
  dice: "3d6",
  notes: "Roll each day on a planet's surface (p. 252). Two columns: uninhabited world and colonized world; a dash in the book means no encounter in that column.",
  rows: SURFACE.map(([lo, hi, uninhabited, colonized, extra]) =>
    row([lo, hi], uninhabited === colonized ? uninhabited : `${uninhabited} / ${colonized}`, { uninhabited, colonized, ...(extra ?? {}) }),
  ),
});

// ---------------------------------------------------------------------------
// General colony encounters (p. 255)
// ---------------------------------------------------------------------------

const COLONY_GENERAL: string[] = [
  // 11-16
  "Rowdy miners", "Technicians making repairs", "Exhausted workers arriving", "Workers preparing to leave", "Supplies being delivered", "Colony workers off-duty",
  // 21-26
  "Family off-duty together", "Medical crisis", "Colony manager and deputy", "Loud argument", "Drunken revelers", "Kids playing",
  // 31-36
  "Administrator making the rounds", "Colonial Marshal conducting an investigation", "Cocky shuttle pilot", "Unhappy off-world official", "Sly corporate representative", "Harassed chief engineer",
  // 41-46
  "Scientists debating", "Drug deal in progress", "Overhear gossip", "Colonist threatening another", "Corporate investigator", "Miners relaxing",
  // 51-56
  "Colony damage needing repair", "Operations team having a discussion", "Computer engineers at work", "Unattended supplies", "Maintenance crew", "Marshal searching or arresting a suspect",
  // 61-66
  "Visitors from another colony", "Security cordon", "Mysterious scientist", "Management meeting", "Helpful android", "Cleaning crew",
  // 71-76
  "Starship crew off-duty", "Thugs", "Security patrol", "Colonial official with entourage", "Accident in progress", "Colonists on strike or protesting",
];

/** The book's entry numbers 11-76: D66 values plus a seventh tens row reached only in established colonies. */
const D66_TO_76: number[] = [...D66_VALUES, 71, 72, 73, 74, 75, 76];

const COLONY_CADENCE = "Daily encounters inside a settlement, usually a meeting or conversation (p. 252).";

/** General colony rows read with the tens digit raised by `shift` (p. 252): rolled v shows entry v + 10 * shift. */
function colonyGeneralRows(shift: number): TableRow[] {
  return D66_VALUES.map((v, i) => {
    const label = COLONY_GENERAL[i + shift * 6]!;
    return row([v, v], label, { encounter: label, entry: D66_TO_76[i + shift * 6]! });
  });
}

export const colonyGeneral: RollTable = table({
  id: "alien.encounters.colony.general",
  name: "General colony encounters",
  page: 255,
  dice: "d66",
  notes: `${COLONY_CADENCE} Start-up and young colonies read entries 11-66 as rolled.`,
  rows: colonyGeneralRows(0),
});

export const colonyGeneralEstablished: RollTable = table({
  id: "alien.encounters.colony.general-established",
  name: "General colony encounters (established colony, +1)",
  page: 255,
  dice: "d66",
  tags: ["tens-digit-modifier"],
  notes: `${COLONY_CADENCE} An established colony (p. 240) adds 1 to the tens digit: a rolled 11 reads entry 21, up to 66 reading entry 76.`,
  rows: colonyGeneralRows(1),
});

// ---------------------------------------------------------------------------
// Colony area encounters (p. 256-257)
// ---------------------------------------------------------------------------

/** Rows in the 11-13, 14-16, 21-23 ... 64-66 pattern used by four of the five area tables. */
function thirds(labels: string[]): RangeSpec[] {
  if (labels.length !== 12) throw new Error(`area table needs 12 rows, got ${labels.length}`);
  return labels.map((label, i): RangeSpec => {
    const tens = Math.floor(i / 2) + 1;
    const lo = tens * 10 + (i % 2 === 0 ? 1 : 4);
    return [lo, lo + 2, label, { encounter: label }];
  });
}

function areaTable(area: string, name: string, page: number, specs: RangeSpec[]): RollTable {
  return table({
    id: `alien.encounters.colony.${area}`,
    name,
    page,
    dice: "d66",
    tags: ["colony", area],
    notes: "Use in place of the general colony table when the PCs are in this part of a colony.",
    rows: ranges(specs),
  });
}

export const colonyPublic = areaTable("public", "Public area encounters", 256, thirds([
  "Riot or civil disturbance, with security responding",
  "Workers are relaxing outside a bar or cafe",
  "Drug deal in progress",
  "Security team is moving colonists on, keeping the area clear",
  "Workers at a cafe or bar, laughing and joking",
  "Taxi driver or guide offering to show you the best food/hotel/entertainment",
  "Overhear gossip",
  "Food vendor with a queue of customers",
  "Colonial Marshal is arresting a suspect",
  "A fight breaks out",
  "Sanitation robot is moving through the area",
  "Bored teens are looking for trouble",
]));

export const colonyHabitation = areaTable("habitation", "Habitation area encounters", 256, thirds([
  "Bored teens are hanging out",
  "Workers are chilling outside their accommodation",
  "Drug deal in progress",
  "Colonial Marshal conducting an investigation",
  "Colony official is scolding children",
  "Young kids are playing",
  "Sanitation robot is moving through the area",
  "Work crew arriving off shift, joking and laughing",
  "Repair crew is fixing part of a building or corridor",
  "Overhear gossip",
  "Argument between two inhabitants",
  "Security patrol talking to locals",
]));

/** Rows given as [lo, hi, label]; the label doubles as the `encounter` result. */
const spans = (specs: Array<[number, number, string]>): RangeSpec[] => specs.map(([lo, hi, label]) => [lo, hi, label, { encounter: label }]);

/** The operations table is the one area table that breaks the 3-wide pattern (64, 65-66). */
export const colonyOperations = areaTable("operations", "Operations area encounters", 256, spans([
  [11, 13, "Unhappy off-world official"],
  [14, 16, "Sly corporate representative"],
  [21, 23, "Harassed chief engineer"],
  [24, 26, "Scientists debating"],
  [31, 33, "Colony manager and deputy"],
  [34, 36, "High alert. Everyone is too busy to talk."],
  [41, 43, "Helpful android"],
  [44, 46, "Three members of the operations staff discuss a serious problem"],
  [51, 53, "Security cordon"],
  [54, 56, "Queue of colonists with pay or work disputes"],
  [61, 63, "Management meeting"],
  [64, 64, "Nervous colonist waiting to see the colony manager"],
  [65, 66, "Colonial Marshal processing a suspect in cuffs"],
]));

export const colonySpaceport = areaTable("spaceport", "Spaceport encounters", 256, thirds([
  "Two pilots relaxing after a flight",
  "Starship crew in heated debate with port supervisor",
  "Cargo handlers in powerloaders",
  "Maintenance crew struggling with a problem",
  "Emergency. The area is cleared as a precaution.",
  "ICC customs representative checking consignments",
  "Starship crew eager to get a beer and then some sleep",
  "Irate port supervisor shouting at workers",
  "Problem unloading a cargo",
  "Fueling crew frustrated at having to wait",
  "Corporate passenger",
  "Cargo is piling up ready to be loaded on board",
]));

export const colonyIndustrial = areaTable("industrial", "Industrial area encounters", 257, thirds([
  "Auditor checking procedures",
  "Huge argument between two managers",
  "Android carrying out routine work",
  "Workers rushing to a shift",
  "Power loader coming through!",
  "Repair team fixing crucial infrastructure",
  "Manager touring with his assistant",
  "Workers responding to an emergency",
  "Incident. First aid is being carried out.",
  "Workers waiting to go on shift",
  "Security guard checking passes and IDs",
  "Lone worker waiting for their manager",
]));

export const COLONY_AREAS = ["public", "habitation", "operations", "spaceport", "industrial"] as const;

export const encounterTables: RollTable[] = [
  starSystem,
  starSystemRemote,
  starSystemUncharted,
  shipReactions,
  surface,
  colonyGeneral,
  colonyGeneralEstablished,
  colonyPublic,
  colonyHabitation,
  colonyOperations,
  colonySpaceport,
  colonyIndustrial,
];
