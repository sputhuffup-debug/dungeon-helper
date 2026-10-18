/**
 * Life Path tables (p. 282-289). Each row result carries
 * `{ label, attributes?, skills?, psych?, bonusRoll? }` so the life path
 * procedure can sum deltas. Rows are unverified paraphrases.
 */
import type { RollTable } from "@campaign-forge/module-sdk";
import { d6, d66, defineTable, ranges } from "./_helpers";

const FAMILY = "lifepath";
const PAGE: [number, number] = [282, 289];

type Attr = "strength" | "agility" | "wits" | "empathy";
type Skill =
  | "heavyMachinery" | "closeCombat" | "stamina" | "rangedCombat" | "mobility" | "piloting"
  | "observation" | "survival" | "comtech" | "manipulation" | "command" | "medicalAid";

function delta(attr: Attr | null, skill: Skill | null, psych: number, bonusRoll?: string): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (attr) out.attributes = { [attr]: 1 };
  if (skill) out.skills = { [skill]: 1 };
  if (psych !== 0) out.psych = psych;
  if (bonusRoll) out.bonusRoll = bonusRoll;
  return out;
}

export const humanOrAndroid: RollTable = defineTable({
  id: "alien.lifepath.human-or-android",
  name: "Human or android",
  family: FAMILY,
  page: PAGE,
  dice: "1d6",
  notes: "Androids follow the same path but never gain stress-related psych flags.",
  rows: ranges([
    [1, 5, "Human", { android: false }],
    [6, 6, "Android", { android: true }],
  ]),
});

export const origin: RollTable = defineTable({
  id: "alien.lifepath.origin",
  name: "Origin",
  family: FAMILY,
  page: PAGE,
  dice: "2d6",
  notes: "Three levels: core worlds, outer colonies, frontier. The level drives later modifiers.",
  rows: ranges([
    [2, 2, "Earth", { level: "core", region: "core", ...delta("empathy", null, 0) }],
    [3, 3, "Luna or Mars", { level: "core", region: "core", ...delta(null, "comtech", 0) }],
    [4, 4, "Core-system colony", { level: "core", region: "core", ...delta(null, "manipulation", 0) }],
    [5, 5, "Outer Veil station", { level: "outer", region: "outer-veil", ...delta(null, "comtech", 0) }],
    [6, 6, "Outer Veil colony", { level: "outer", region: "outer-veil", ...delta(null, "heavyMachinery", 0) }],
    [7, 7, "Born aboard a ship", { level: "outer", region: "outer-rim", ...delta(null, "piloting", 0) }],
    [8, 8, "Outer Rim colony", { level: "outer", region: "outer-rim", ...delta("strength", null, 0) }],
    [9, 9, "Frontier homestead", { level: "frontier", region: "frontier", ...delta(null, "survival", 1) }],
    [10, 10, "Frontier mining camp", { level: "frontier", region: "frontier", ...delta("strength", null, 1) }],
    [11, 11, "Far Reach outpost", { level: "frontier", region: "far-reach", ...delta(null, "survival", 1) }],
    [12, 12, "Unknown or orphaned", { level: "frontier", region: "far-reach", ...delta("wits", null, 2) }],
  ]),
});

type Early = [label: string, attr: Attr | null, skill: Skill | null, psych: number];
const EARLY_LIFE: Early[] = [
  ["Corporate arcology childhood", "wits", "comtech", 0],
  ["Raised by a single working parent", "empathy", "manipulation", 1],
  ["Company school scholarship", "wits", "observation", 0],
  ["Boarding school on Luna", "wits", "manipulation", 0],
  ["Military family, moved every year", "strength", "command", 1],
  ["Grew up in a medical ward", "empathy", "medicalAid", 1],
  ["Dockside gang kid", "agility", "closeCombat", 1],
  ["Farm colony upbringing", "strength", "survival", 0],
  ["Child of colony administrators", "empathy", "command", 0],
  ["Spaceship-born, raised by the crew", "agility", "piloting", 0],
  ["Orphanage run by the Company", "wits", "manipulation", 2],
  ["Mining camp childhood", "strength", "heavyMachinery", 1],
  ["Religious frontier commune", "empathy", "survival", 1],
  ["Rich family, private tutors", "wits", "comtech", 0],
  ["Street kid on a station", "agility", "mobility", 2],
  ["Survived a colony disaster as a child", "strength", "stamina", 3],
  ["Scientist parents, lab playground", "wits", "observation", 0],
  ["Refugee from a border conflict", "agility", "survival", 2],
  ["Marine brat on a forward base", "strength", "rangedCombat", 1],
  ["Trucker family, always in transit", "agility", "piloting", 0],
  ["Raised by an android caretaker", "wits", "comtech", 1],
  ["Marshal's kid, saw the cells early", "empathy", "observation", 1],
  ["Terraforming crew family", "strength", "heavyMachinery", 0],
  ["Wealthy but neglected", "wits", "manipulation", 2],
  ["Athletic prodigy", "agility", "mobility", 0],
  ["Shipyard apprentice as a teen", "strength", "heavyMachinery", 0],
  ["Hospital volunteer as a teen", "empathy", "medicalAid", 0],
  ["Youth militia cadet", "agility", "rangedCombat", 1],
  ["Trading post childhood", "empathy", "manipulation", 0],
  ["Lost a sibling to an accident", "empathy", "stamina", 2],
  ["Grew up in a research outpost", "wits", "observation", 1],
  ["Pit fighter's apprentice", "strength", "closeCombat", 2],
  ["Station maintenance family", "wits", "comtech", 0],
  ["Hunter in frontier wilderness", "agility", "survival", 0],
  ["Child actor on the core-world feeds", "empathy", "manipulation", 1],
  ["Unknown: records sealed", "wits", null, 3],
];

export const earlyLife: RollTable = defineTable({
  id: "alien.lifepath.early-life",
  name: "Early life",
  family: FAMILY,
  page: PAGE,
  dice: "d66",
  notes: "Three columns: attribute increase, skill increase, psych modifier.",
  rows: d66(EARLY_LIFE.map(([label, attr, skill, psych]) => ({ label, result: delta(attr, skill, psych) }))),
});

type Event = [label: string, skill: Skill | null, psych: number, bonus?: "favor" | "disaster"];
const FAVOR = "alien.lifepath.favors";
const DISASTER = "alien.lifepath.disasters";
const LIFE_EVENTS: Event[] = [
  ["Saved a stranger's life", "medicalAid", 0, "favor"],
  ["Survived a hull breach", "stamina", 1],
  ["Won a shipboard poker ring", "manipulation", 0],
  ["Lost everything in a bad deal", null, 1, "disaster"],
  ["Crewed a long haul without incident", "piloting", 0],
  ["Was framed for a crime", null, 2, "disaster"],
  ["Mentored by a veteran", "command", 0, "favor"],
  ["Watched a friend die in an accident", null, 2],
  ["Got a corporate commendation", "manipulation", 0, "favor"],
  ["Wounded in a riot", "closeCombat", 1],
  ["Discovered a smuggling ring", "observation", 0],
  ["Lost a limb, replaced with a prosthetic", "stamina", 1, "disaster"],
  ["Married and divorced within a year", null, 1],
  ["Rescued from a drifting wreck", "survival", 1, "favor"],
  ["Took the blame for a superior", "command", 1, "favor"],
  ["Spent a year in a company brig", "closeCombat", 1, "disaster"],
  ["Ran a colony's comm relay", "comtech", 0],
  ["Became a parent", null, 0],
  ["Witnessed something the Company covered up", "observation", 2],
  ["Survived a mining collapse", "heavyMachinery", 1],
  ["Deserted a post and got away with it", "mobility", 1],
  ["Studied for a degree on a ship", "comtech", 0],
  ["Lost a fortune to a corporate takeover", null, 1, "disaster"],
  ["Crossed the frontier alone", "survival", 1],
  ["Caught in a station quarantine", "medicalAid", 1],
  ["Found a patron in a minor corporation", null, 0, "favor"],
  ["Fought off a raider boarding party", "rangedCombat", 1],
  ["Treated for radiation sickness", "stamina", 1, "disaster"],
  ["Smuggled refugees across a border", "piloting", 0, "favor"],
  ["Recognised by a marshal and let go", "manipulation", 0],
  ["Nearly died in cryosleep", null, 2],
  ["Promoted over an old friend", "command", 0],
  ["Fired for refusing an order", null, 1],
  ["Learned a dead colleague's secret", "observation", 1],
  ["Buried a crewmate on an alien world", "survival", 2],
  ["Woke with missing memories", null, 3, "disaster"],
];

export const lifeEvent: RollTable = defineTable({
  id: "alien.lifepath.life-event",
  name: "Life event",
  family: FAMILY,
  page: PAGE,
  dice: "d66",
  notes: "Some rows call for a bonus roll on favors or disasters (bonusRoll holds the table id).",
  rows: d66(
    LIFE_EVENTS.map(([label, skill, psych, bonus]) => ({
      label,
      result: delta(null, skill, psych, bonus === "favor" ? FAVOR : bonus === "disaster" ? DISASTER : undefined),
    })),
  ),
});

export const careerEntry: RollTable = defineTable({
  id: "alien.lifepath.career-entry",
  name: "Career entry",
  family: FAMILY,
  page: PAGE,
  dice: "2d6",
  notes: "Which career the character fell into. Result carries the career id.",
  rows: ranges([
    [2, 2, "Kid", { career: "kid" }],
    [3, 3, "Company Agent", { career: "company-agent" }],
    [4, 4, "Scientist", { career: "scientist" }],
    [5, 5, "Medic", { career: "medic" }],
    [6, 6, "Pilot", { career: "pilot" }],
    [7, 7, "Roughneck", { career: "roughneck" }],
    [8, 8, "Colonial Marine", { career: "colonial-marine" }],
    [9, 9, "Officer", { career: "officer" }],
    [10, 10, "Colonial Marshal", { career: "colonial-marshal" }],
    [11, 11, "Scientist (specialist)", { career: "scientist" }],
    [12, 12, "Company Agent (senior)", { career: "company-agent" }],
  ]),
});

export const favors: RollTable = defineTable({
  id: "alien.lifepath.favors",
  name: "Favors",
  family: FAMILY,
  page: PAGE,
  dice: "1d6",
  notes: "Someone owes the character; the GM can cash it in as a contact.",
  rows: d6([
    { label: "A corporate executive owes you", result: { contact: "corporate", ...delta(null, "manipulation", 0) } },
    { label: "A marshal looks the other way", result: { contact: "marshal", ...delta(null, "observation", 0) } },
    { label: "A ship captain will give you passage", result: { contact: "captain", ...delta(null, "piloting", 0) } },
    { label: "A medic will treat you off the books", result: { contact: "medic", ...delta(null, "medicalAid", 0) } },
    { label: "A union boss has your back", result: { contact: "union", ...delta(null, "heavyMachinery", 0) } },
    { label: "A marine sergeant remembers you", result: { contact: "military", ...delta(null, "rangedCombat", 0) } },
  ]),
});

export const disasters: RollTable = defineTable({
  id: "alien.lifepath.disasters",
  name: "Disasters",
  family: FAMILY,
  page: PAGE,
  dice: "1d6",
  notes: "Something went badly wrong; usually adds a psych modifier or a lasting mark.",
  rows: d6([
    { label: "Blacklisted by a corporation", result: { ...delta(null, null, 1) } },
    { label: "Deep in debt", result: { debt: true, ...delta(null, null, 1) } },
    { label: "Wanted by the authorities", result: { wanted: true, ...delta(null, null, 1) } },
    { label: "Lasting injury", result: { ...delta(null, "stamina", 1) } },
    { label: "Lost someone you loved", result: { ...delta(null, null, 2) } },
    { label: "Saw something you cannot explain", result: { ...delta(null, "observation", 3) } },
  ]),
});

type Posting = [label: string, skill: Skill, psych: number];
const POSTINGS: Record<string, Posting[]> = {
  "colonial-marine": [
    ["Garrison duty on a quiet colony", "rangedCombat", 0],
    ["Border patrol in the Outer Veil", "observation", 1],
    ["Boarding team on a corvette", "closeCombat", 1],
    ["Riot control on a company world", "command", 1],
    ["Search and rescue flight", "mobility", 0],
    ["Black-ops deployment, classified", "stamina", 2],
  ],
  "colonial-marshal": [
    ["Deputy at a mining camp", "observation", 0],
    ["Riding circuit on frontier homesteads", "survival", 0],
    ["Station security chief", "command", 1],
    ["Corporate liaison desk", "manipulation", 0],
    ["Manhunt across three systems", "rangedCombat", 1],
    ["Quarantine enforcement", "medicalAid", 2],
  ],
  "company-agent": [
    ["Colony administration office", "manipulation", 0],
    ["Cargo audit on freighters", "observation", 0],
    ["Labour negotiations", "command", 1],
    ["Special projects, need to know", "comtech", 2],
    ["Asset recovery team", "closeCombat", 1],
    ["Executive assistant to a director", "manipulation", 1],
  ],
  kid: [
    ["Stowaway on a freighter", "mobility", 1],
    ["Colony school dropout", "comtech", 0],
    ["Scavenger in the maintenance decks", "observation", 0],
    ["Runner for a gang", "mobility", 1],
    ["Helped in the colony clinic", "medicalAid", 0],
    ["Hid during an attack", "survival", 2],
  ],
  medic: [
    ["Colony clinic", "medicalAid", 0],
    ["Ship's medic on a long haul", "comtech", 0],
    ["Field hospital in a war zone", "stamina", 2],
    ["Corporate research ward", "observation", 1],
    ["Quarantine station", "medicalAid", 1],
    ["Mining camp doctor", "heavyMachinery", 0],
  ],
  officer: [
    ["First officer on a hauler", "command", 0],
    ["Navigation on a survey vessel", "piloting", 0],
    ["Commanded a station security detail", "rangedCombat", 1],
    ["Corporate liaison officer", "manipulation", 0],
    ["Rescue coordinator after a disaster", "command", 2],
    ["Court martial, acquitted", "manipulation", 1],
  ],
  pilot: [
    ["Shuttle runs between stations", "piloting", 0],
    ["Dropship pilot for the marines", "piloting", 1],
    ["Long-haul tug", "comtech", 0],
    ["Atmospheric survey flights", "observation", 0],
    ["Smuggling runs, never caught", "manipulation", 1],
    ["Crash survivor", "survival", 2],
  ],
  roughneck: [
    ["Deep-core mining rig", "heavyMachinery", 0],
    ["Cargo loader on a freighter", "stamina", 0],
    ["Terraforming plant maintenance", "comtech", 0],
    ["Salvage crew on a derelict", "observation", 1],
    ["Fuel refinery accident survivor", "stamina", 2],
    ["Bar bouncer between contracts", "closeCombat", 1],
  ],
  scientist: [
    ["Corporate lab on a core world", "comtech", 0],
    ["Xenobiology survey", "observation", 1],
    ["Terraforming research station", "survival", 0],
    ["Medical research ward", "medicalAid", 0],
    ["Expedition to a derelict", "observation", 2],
    ["Classified weapons project", "comtech", 1],
  ],
};

export const postingTables: RollTable[] = Object.entries(POSTINGS).map(([career, rows]) =>
  defineTable({
    id: `alien.lifepath.posting.${career}`,
    name: `Posting: ${career.replace(/-/g, " ")}`,
    family: FAMILY,
    page: PAGE,
    dice: "1d6",
    tags: ["posting", career],
    rows: d6(rows.map(([label, skill, psych]) => ({ label, result: { career, ...delta(null, skill, psych) } }))),
  }),
);

export const psychEvaluation: RollTable = defineTable({
  id: "alien.lifepath.psych-evaluation",
  name: "Psych evaluation",
  family: FAMILY,
  page: PAGE,
  dice: "2d6",
  notes: "The procedure adds the accumulated psych modifier to this roll. Higher is worse.",
  rows: ranges([
    [-99, 4, "Cleared for duty", { rating: "cleared", startingStress: 0 }],
    [5, 7, "Stable", { rating: "stable", startingStress: 0 }],
    [8, 10, "Flagged for monitoring", { rating: "flagged", startingStress: 1 }],
    [11, 13, "Borderline", { rating: "borderline", startingStress: 1, suggestedTrauma: true }],
    [14, 99, "Unfit for duty", { rating: "unfit", startingStress: 2, suggestedTrauma: true }],
  ]),
});

export const lifepathTables: RollTable[] = [
  humanOrAndroid,
  origin,
  earlyLife,
  lifeEvent,
  careerEntry,
  favors,
  disasters,
  ...postingTables,
  psychEvaluation,
];
