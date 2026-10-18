/**
 * Character tables: stress response, panic, mental trauma, critical injuries,
 * campaign theme (p. 30, 44, 69-74, 158). Rows are paraphrased labels from
 * general knowledge of the game and are unverified against the book.
 */
import type { RollTable, TableModifier } from "@campaign-forge/module-sdk";
import { d6, d66, defineTable, ranges } from "./_helpers";

const FAMILY = "character";

/** D6 + stress − Resolve. Both values are read from the roll context. */
const stressModifiers: TableModifier[] = [
  { add: { "-": [{ var: "stress" }, { var: "resolve" }] }, label: "+ stress level − Resolve" },
];

export const stressResponse: RollTable = defineTable({
  id: "alien.character.stress-response",
  name: "Stress response",
  family: FAMILY,
  page: 44,
  dice: "1d6",
  modifiers: stressModifiers,
  notes: "Roll when a stress die shows a 1. D6 + stress level − Resolve.",
  tags: ["stress"],
  rows: ranges([
    [-99, 3, "Keeping Cool", { effect: "No effect; the character holds it together." }],
    [4, 4, "Jumpy", { effect: "Startled; −1 to the next skill roll this round." }],
    [5, 5, "Distracted", { effect: "Loses track of the task; the action takes an extra round." }],
    [6, 6, "Shouting", { effect: "Yells or curses loudly; the noise may attract attention." }],
    [7, 7, "Fumble", { effect: "Drops or jams the item in hand; a stretch to recover it." }],
    [8, 8, "Lose Focus", { effect: "Stress +1 and the action gets no bonus effects." }],
    [9, 9, "Freeze Up", { effect: "Loses the action this round; stress +1." }],
    [10, 99, "Mess Up", { effect: "The action fails outright and a Panic Roll is triggered." }],
  ]),
});

export const panic: RollTable = defineTable({
  id: "alien.character.panic",
  name: "Panic roll",
  family: FAMILY,
  page: [72, 73],
  dice: "1d6",
  modifiers: stressModifiers,
  notes: "Roll on a panic trigger. D6 + stress level − Resolve. Results of 9 or more count toward the session-end trauma check (p. 74).",
  tags: ["stress", "panic"],
  rows: ranges([
    [-99, 6, "Keeping Cool", { effect: "Keeps a steady hand; no further effect.", traumaCheck: false }],
    [7, 7, "Spooked", { effect: "Stress +1; nearby friends also take stress +1.", traumaCheck: false }],
    [8, 8, "Noisy", { effect: "Makes a loud noise; stress +1 for friends nearby.", traumaCheck: false }],
    [9, 9, "Twitchy", { effect: "Shakes; −2 to the next roll this round.", traumaCheck: true }],
    [10, 10, "Lose Item", { effect: "Drops a held or ready item; recover it later.", traumaCheck: true }],
    [11, 11, "Paranoid", { effect: "Turns on the others; may not help or be helped this stretch.", traumaCheck: true }],
    [12, 12, "Hesitant", { effect: "Loses the next action; acts last in the next round.", traumaCheck: true }],
    [13, 13, "Freeze", { effect: "Frozen for one round; others nearby make a Panic Roll.", traumaCheck: true }],
    [14, 14, "Seek Cover", { effect: "Must move to cover or away from the threat this round.", traumaCheck: true }],
    [15, 15, "Scream", { effect: "Screams for a round; everyone nearby takes stress +1.", traumaCheck: true }],
    [16, 16, "Flee", { effect: "Runs from the threat and will not stop until safe.", traumaCheck: true }],
    [17, 17, "Frenzy", { effect: "Attacks the nearest person or thing; keeps going until no one is in reach.", traumaCheck: true }],
    [18, 99, "Catatonic", { effect: "Collapses, unresponsive for a full shift.", traumaCheck: true }],
  ]),
});

export const mentalTrauma: RollTable = defineTable({
  id: "alien.character.mental-trauma",
  name: "Mental trauma",
  family: FAMILY,
  page: 74,
  dice: "1d6",
  notes: "Rolled at session end on a failed Empathy roll after a panic result of 9+. Healed only on shore leave (campaign play).",
  tags: ["stress", "trauma"],
  mode: ["campaign"],
  rows: d6([
    { label: "Phobia", result: { id: "phobia", effect: "A specific fear; stress +1 when exposed to it." } },
    { label: "Alcoholism", result: { id: "alcoholism", effect: "Needs a drink each shift or suffers −1 to rolls." } },
    { label: "Nightmares", result: { id: "nightmares", effect: "Roll Stamina after each shift of rest or lose the rest." } },
    { label: "Depression", result: { id: "depression", effect: "Starts each session with stress +1." } },
    { label: "Drug Abuse", result: { id: "drug-abuse", effect: "Dependent on a pharmaceutical; −1 without a dose." } },
    { label: "Amnesia", result: { id: "amnesia", effect: "Loses memory of the traumatic events; may lose an XP question." } },
  ]),
});

type Crit = [name: string, fatal: boolean, timeLimit: string | null, effect: string];
const CRITS: Crit[] = [
  ["Winded", false, null, "Stunned for one round."],
  ["Stunned", false, null, "Loses the next action."],
  ["Sprained Ankle", false, null, "−1 Mobility until healed."],
  ["Sprained Wrist", false, null, "−1 Close Combat and Ranged Combat until healed."],
  ["Concussion", false, null, "−1 Wits-based skills until healed."],
  ["Broken Nose", false, null, "−1 Manipulation and Observation until healed."],
  ["Knocked Teeth", false, null, "−1 Manipulation until healed."],
  ["Broken Fingers", false, null, "−1 to actions needing fine motor skills."],
  ["Broken Toes", false, null, "−1 Mobility until healed."],
  ["Dislocated Shoulder", false, null, "−2 Close Combat and Heavy Machinery until healed."],
  ["Broken Ribs", false, null, "−1 Agility-based skills until healed."],
  ["Deep Cut", false, null, "Bleeding; −1 until bandaged."],
  ["Broken Arm", false, null, "Cannot use the arm until healed."],
  ["Broken Leg", false, null, "Cannot move farther than a short range per round."],
  ["Crushed Foot", false, null, "−2 Mobility until healed."],
  ["Torn Ear", false, null, "−1 Observation until healed; scars."],
  ["Gouged Eye", false, null, "−2 Observation and Ranged Combat until healed."],
  ["Severe Burns", false, null, "−1 to everything until healed; scars."],
  ["Punctured Lung", true, "1 shift", "Cannot shout or run; collapses if untreated."],
  ["Ruptured Spleen", true, "1 shift", "Internal bleeding; −2 to everything."],
  ["Crushed Elbow", false, null, "Arm unusable until surgery."],
  ["Crushed Knee", false, null, "Leg unusable until surgery."],
  ["Severed Hand", true, "1 shift", "Loses the hand; bleeding out."],
  ["Severed Foot", true, "1 shift", "Loses the foot; bleeding out."],
  ["Severed Arm", true, "1 stretch", "Loses the arm; bleeding out fast."],
  ["Severed Leg", true, "1 stretch", "Loses the leg; bleeding out fast."],
  ["Crushed Groin", true, "1 shift", "Agony; −3 to everything."],
  ["Broken Jaw", false, null, "Cannot speak clearly; −2 Manipulation and Command."],
  ["Internal Bleeding", true, "1 shift", "−2 to everything; needs surgery."],
  ["Shattered Pelvis", true, "1 shift", "Cannot move; needs surgery."],
  ["Crushed Chest", true, "1 stretch", "Cannot act; needs immediate surgery."],
  ["Ruptured Intestines", true, "1 shift", "−3 to everything; needs surgery."],
  ["Broken Back", true, "1 stretch", "Paralysed; needs immediate surgery."],
  ["Crushed Skull", true, "1 round", "Unconscious; dies without immediate care."],
  ["Impaled", true, "1 round", "Pinned and bleeding out."],
  ["Instant Death", true, "immediate", "Dead. No roll to save."],
];

export const criticalInjury: RollTable = defineTable({
  id: "alien.character.critical-injury",
  name: "Critical injuries",
  family: FAMILY,
  page: [69, 70],
  dice: "d66",
  notes: "Roll when a character is Broken by damage. Fatal injuries kill at the end of the time limit unless treated.",
  tags: ["combat", "injury"],
  rows: d66(
    CRITS.map(([name, fatal, timeLimit, effect]) => ({
      label: name,
      result: { name, id: name.toLowerCase().replace(/[^a-z0-9]+/g, "-"), fatal, timeLimit, effect },
    })),
  ),
});

export const campaignTheme: RollTable = defineTable({
  id: "alien.character.campaign-theme",
  name: "Campaign theme",
  family: FAMILY,
  page: 158,
  dice: "1d6",
  mode: ["campaign"],
  notes: "A starting theme for a campaign; roll or choose during session zero.",
  rows: d6([
    { label: "Corporate Intrigue", result: { theme: "corporate-intrigue" } },
    { label: "Infestation", result: { theme: "infestation" } },
    { label: "Frontier War", result: { theme: "frontier-war" } },
    { label: "Lost Expedition", result: { theme: "lost-expedition" } },
    { label: "Salvage and Smuggling", result: { theme: "salvage-and-smuggling" } },
    { label: "Colony Survival", result: { theme: "colony-survival" } },
  ]),
});

export const characterTables: RollTable[] = [stressResponse, panic, mentalTrauma, criticalInjury, campaignTheme];
