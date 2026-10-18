/**
 * Encounter tables (p. 252-257): star system, ship reactions, surface
 * (two columns), general colony and five colony area tables. The book
 * shifts the tens digit of the d66 tables as time passes; this is modelled
 * as a flat `add` of 10 per unit of `timeElapsed` read from the roll context.
 * Rows are unverified paraphrases.
 */
import type { RollTable, TableModifier } from "@campaign-forge/module-sdk";
import { d66, d66Grouped, defineTable, labelled, ranges } from "./_helpers";

const FAMILY = "encounters";

/** Tens-digit shift: +10 per unit of elapsed time (weeks in space, days on the surface). */
const timeShift: TableModifier[] = [
  { add: { "*": [10, { var: ["timeElapsed", 0] }] }, label: "+10 per unit of time elapsed (tens-digit shift)" },
];

const STAR_SYSTEM = [
  "Nothing on the scope", "Nothing on the scope", "Distant navigation beacon", "Automated weather buoy",
  "A freighter on a routine run", "A freighter asking for a trade", "A survey probe, dormant", "Micrometeorite shower",
  "A derelict shuttle", "A distress beacon, faint", "A mining tug hauling ore", "A corporate courier, silent",
  "A colony transport, cryo-sleeping", "Marine patrol requesting identification", "A ship running dark", "A debris field",
  "Pirates shadowing the ship", "A smuggler offering a deal", "A damaged ship begging for parts", "A quarantine warning broadcast",
  "A derelict freighter, cold", "A UPP vessel on the edge of sensors", "A ship with a dead crew", "A rescue pod, occupied",
  "A Company science vessel", "A ghost signal from an old wreck", "A marshal's cutter on a manhunt", "A solar flare warning",
  "A military convoy under way", "A refugee ship, overloaded", "An unidentified contact closing fast", "A ship broadcasting a loop",
  "A derelict of unknown make", "A boarding party already inbound", "Something large and silent", "A signal that answers in your own voice",
];

export const starSystem: RollTable = defineTable({
  id: "alien.encounters.star-system",
  name: "Star system encounters",
  family: FAMILY,
  page: [252, 253],
  dice: "d66",
  modifiers: timeShift,
  notes: "Roll once per week in a system. The tens digit shifts up with time elapsed; results above 66 read as the last row.",
  rows: [
    ...d66(labelled("encounter", STAR_SYSTEM)).map((r, i, all) => (i === all.length - 1 ? { ...r, range: [r.range[0], 99] as [number, number] } : r)),
  ],
});

export const shipReactions: RollTable = defineTable({
  id: "alien.encounters.ship-reactions",
  name: "Ship reactions",
  family: FAMILY,
  page: 253,
  dice: "2d6",
  notes: "How an encountered ship responds to hails.",
  rows: ranges([
    [2, 2, "Opens fire", { reaction: "hostile", attacks: true }],
    [3, 4, "Threatens and warns off", { reaction: "hostile" }],
    [5, 6, "Runs silent, breaks contact", { reaction: "evasive" }],
    [7, 7, "Ignores the hail", { reaction: "indifferent" }],
    [8, 9, "Answers, wary", { reaction: "wary" }],
    [10, 11, "Friendly, offers trade or news", { reaction: "friendly" }],
    [12, 12, "Asks for help", { reaction: "needy" }],
  ]),
});

type Surface = [terrestrial: string, ice: string];
const SURFACE: Surface[] = [
  ["Nothing but the wind", "Nothing but the wind"],
  ["Animal tracks", "Tracks in the snow"],
  ["A herd of grazing animals", "A pack of hunting animals"],
  ["A sudden storm", "A whiteout"],
  ["An old survey marker", "A frozen survey drone"],
  ["A crashed probe", "A crashed shuttle under the ice"],
  ["A lone prospector", "A lost prospector, half frozen"],
  ["Toxic bloom in the water", "Thin ice over a chasm"],
  ["A predator stalks the party", "Something moves under the ice"],
  ["A colonist's abandoned camp", "A sealed hab module, lights on"],
  ["A corporate survey team", "A corporate drilling rig"],
  ["Earth tremor", "Ice quake"],
  ["Ruins of an earlier settlement", "A buried structure"],
  ["A downed dropship", "A dropship frozen in the ice"],
  ["Hostile squatters", "Desperate survivors"],
  ["A nest of something", "Eggs in a warm cave"],
  ["An unmarked landing site", "A landing site, recently used"],
  ["Something watches from the ridge", "Something watches from the ice"],
];

export const surface: RollTable = defineTable({
  id: "alien.encounters.surface",
  name: "Surface encounters",
  family: FAMILY,
  page: [254, 255],
  dice: "d66",
  modifiers: timeShift,
  notes: "Two columns: terrestrial and ice worlds. Roll once per day on the surface; the tens digit shifts with time elapsed.",
  rows: d66Grouped(2, SURFACE.map(([terrestrial, ice]) => ({ label: terrestrial, result: { terrestrial, ice } }))).map((r, i, all) =>
    i === all.length - 1 ? { ...r, range: [r.range[0], 99] as [number, number] } : r,
  ),
});

export const colonyGeneral: RollTable = defineTable({
  id: "alien.encounters.colony.general",
  name: "Colony encounters (general)",
  family: FAMILY,
  page: 255,
  dice: "3d6",
  notes: "Roll once per shift while moving around a colony.",
  rows: ranges([
    [3, 3, "A body in a corridor", { encounter: "A body in a corridor" }],
    [4, 4, "Power failure", { encounter: "Power failure" }],
    [5, 5, "A fight breaks out", { encounter: "A fight breaks out" }],
    [6, 6, "Security sweep", { encounter: "Security sweep" }],
    [7, 7, "A worker asks for help", { encounter: "A worker asks for help" }],
    [8, 8, "Rumours in the mess hall", { encounter: "Rumours in the mess hall" }],
    [9, 9, "Shift change crowds", { encounter: "Shift change crowds" }],
    [10, 10, "Routine, nothing of note", { encounter: "Routine, nothing of note" }],
    [11, 11, "Routine, nothing of note", { encounter: "Routine, nothing of note" }],
    [12, 12, "A maintenance android at work", { encounter: "A maintenance android at work" }],
    [13, 13, "A marshal asking questions", { encounter: "A marshal asking questions" }],
    [14, 14, "Corporate inspection", { encounter: "Corporate inspection" }],
    [15, 15, "Alarm drill, or not a drill", { encounter: "Alarm drill, or not a drill" }],
    [16, 16, "A sealed-off section", { encounter: "A sealed-off section" }],
    [17, 17, "Someone is being dragged away", { encounter: "Someone is being dragged away" }],
    [18, 18, "Screams from the vents", { encounter: "Screams from the vents" }],
  ]),
});

function areaTable(area: string, name: string, labels: string[]): RollTable {
  return defineTable({
    id: `alien.encounters.colony.${area}`,
    name,
    family: FAMILY,
    page: [256, 257],
    dice: "2d6",
    tags: ["colony", area],
    rows: ranges([
      [2, 2, labels[0]!, { encounter: labels[0] }],
      [3, 3, labels[1]!, { encounter: labels[1] }],
      [4, 4, labels[2]!, { encounter: labels[2] }],
      [5, 5, labels[3]!, { encounter: labels[3] }],
      [6, 6, labels[4]!, { encounter: labels[4] }],
      [7, 7, labels[5]!, { encounter: labels[5] }],
      [8, 8, labels[6]!, { encounter: labels[6] }],
      [9, 9, labels[7]!, { encounter: labels[7] }],
      [10, 10, labels[8]!, { encounter: labels[8] }],
      [11, 11, labels[9]!, { encounter: labels[9] }],
      [12, 12, labels[10]!, { encounter: labels[10] }],
    ]),
  });
}

export const colonyAdmin = areaTable("admin", "Colony encounters: administration", [
  "The administrator is being blackmailed", "Records are being shredded", "A Company auditor demands files",
  "A dispute over work permits", "A clerk offers a favour for cash", "A queue of complaints", "A routine briefing",
  "A sealed memo on a desk", "Security escorts someone out", "A council meeting turns ugly", "An emergency broadcast cuts in",
]);

export const colonyResidential = areaTable("residential", "Colony encounters: residential", [
  "A murder in the dorms", "A family hiding a stowaway", "A domestic dispute", "Kids playing in the corridors",
  "A card game with the off shift", "A neighbour spreading rumours", "Quiet, people sleeping", "A preacher gathering a crowd",
  "A sick child nobody will report", "Someone selling contraband", "A dorm sealed with warning tape",
]);

export const colonyIndustrial = areaTable("industrial", "Colony encounters: industrial", [
  "An explosion in the refinery", "A worker crushed by machinery", "Sabotage discovered", "A union meeting in the dark",
  "Foreman shouting over the noise", "A loader needs a hand", "Routine shift, deafening noise", "A tool missing from the rack",
  "A sealed container nobody signed for", "Toxic leak alarms", "Something nesting in the pipes",
]);

export const colonyMedical = areaTable("medical", "Colony encounters: medical", [
  "A patient dies screaming", "A locked isolation ward", "The medic is drunk", "Supplies have been stolen",
  "A worker with a strange rash", "A nurse asks for discretion", "Routine check-ups", "A corporate doctor takes samples",
  "A patient who will not wake", "An android running the ward alone", "Something in the morgue is not dead",
]);

export const colonySpaceport = areaTable("spaceport", "Colony encounters: spaceport", [
  "A ship crashes on landing", "Customs seize a cargo", "A fight between crews", "A stowaway caught in the hold",
  "A pilot looking for a crew", "Cargo handlers on strike", "Routine traffic", "A ship refuses inspection",
  "Marines offload in a hurry", "A ship lands with no crew", "Quarantine seals the port",
]);

export const encounterTables: RollTable[] = [
  starSystem,
  shipReactions,
  surface,
  colonyGeneral,
  colonyAdmin,
  colonyResidential,
  colonyIndustrial,
  colonyMedical,
  colonySpaceport,
];
