/**
 * Character tables: stress response (p. 44), panic (p. 73), mental trauma (p. 74),
 * critical injuries (p. 70) and campaign theme (p. 158). Checked against the
 * Evolved Edition: labels, ranges and dice are data; effects are short paraphrases.
 */
import type { RollTable, TableModifier } from "@campaign-forge/module-sdk";
import { criticalInjuryItems } from "../reference/criticalInjuries";
import { mentalTraumaItems } from "../reference/mentalTraumas";
import { d6, d66, defineTable, ranges } from "./_helpers";

const FAMILY = "character";

/** `defineTable` flags every table unverified; these were checked against the book. */
function verified(table: RollTable): RollTable {
  const { unverified: _t, ...rest } = table;
  return {
    ...rest,
    rows: rest.rows.map((r) => {
      const { unverified: _r, ...row } = r;
      return row;
    }),
  };
}

/** D6 + stress − Resolve. Both values are read from the roll context. */
const stressModifiers: TableModifier[] = [
  { add: { "-": [{ var: "stress" }, { var: "resolve" }] }, label: "+ stress level − Resolve" },
];

export const stressResponse: RollTable = verified(
  defineTable({
    id: "alien.character.stress-response",
    name: "Stress response",
    family: FAMILY,
    page: 44,
    dice: "1d6",
    modifiers: stressModifiers,
    notes:
      "Roll when a stress die shows a facehugger. D6 + stress level − Resolve. Rolling a response you already have gives +1 stress instead; responses are removed by relieving stress (p. 73).",
    tags: ["stress"],
    rows: ranges([
      [-99, 0, "Keeping Cool", { effect: "No effect." }],
      [1, 1, "Jumpy", { effect: "Pushing a roll costs +2 stress instead of +1." }],
      [2, 2, "Tunnel Vision", { effect: "−2 dice on Wits-based skill rolls." }],
      [3, 3, "Aggravated", { effect: "−2 dice on Empathy-based skill rolls." }],
      [4, 4, "Shakes", { effect: "−2 dice on Agility-based skill rolls." }],
      [5, 5, "Frantic", { effect: "−2 dice on Strength-based skill rolls." }],
      [6, 6, "Deflated", { effect: "No pushing skill rolls; removes Jumpy and ignores further Jumpy results while it lasts." }],
      [7, 99, "Mess Up", { effect: "The action fails whatever the successes, and stress +1." }],
    ]),
  }),
);

export const panic: RollTable = verified(
  defineTable({
    id: "alien.character.panic",
    name: "Panic roll",
    family: FAMILY,
    page: [72, 73],
    dice: "1d6",
    modifiers: stressModifiers,
    notes:
      "Roll on a panic trigger. D6 + stress level − Resolve. A second panic stacks both responses where possible; rolling one you already have moves one step up. A result of 9 or more calls for a trauma check after the session (p. 74).",
    tags: ["stress", "panic"],
    rows: ranges([
      [-99, 0, "Keeping Cool", { effect: "No effect.", traumaCheck: false }],
      [1, 1, "Spooked", { effect: "Stress +1.", traumaCheck: false }],
      [2, 2, "Noisy", { effect: "Enemies nearby (GM's call) are alerted to you.", traumaCheck: false }],
      [3, 3, "Twitchy", { effect: "Make a supply roll right away for air, ammo or power (GM's choice).", traumaCheck: false }],
      [4, 4, "Lose Item", { effect: "Drop a weapon or key item (GM picks); a quick action to grab it in combat, else Observation and a stretch.", traumaCheck: false }],
      [5, 5, "Paranoid", { effect: "You cannot give or get help on skill rolls until the panic ends.", traumaCheck: false }],
      [6, 6, "Hesitant", { effect: "You take initiative card #10 in combat until the panic ends.", traumaCheck: false }],
      [7, 7, "Freeze", { effect: "Lose your next turn and any interrupt actions before it.", traumaCheck: false }],
      [8, 8, "Seek Cover", { effect: "Dive into full cover if the zone is cluttered (else Scream); stress −1, lose your next turn.", traumaCheck: false }],
      [9, 9, "Scream", { effect: "Lose your next turn; stress −1, and every friendly PC in the zone makes a panic roll.", traumaCheck: true }],
      [10, 10, "Flee", { effect: "Flee to an adjacent zone at once, stress −1, friends left behind +1 stress; keep fleeing to safety. If trapped, Catatonic.", traumaCheck: true }],
      [11, 11, "Frenzy", { effect: "Attack the nearest person or creature, friend or foe, until someone is broken or the panic ends; zone allies roll panic.", traumaCheck: true }],
      [12, 99, "Catatonic", { effect: "Collapse, unable to move or act, until the panic ends.", traumaCheck: true }],
    ]),
  }),
);

export const mentalTrauma: RollTable = verified(
  defineTable({
    id: "alien.character.mental-trauma",
    name: "Mental trauma",
    family: FAMILY,
    page: 74,
    dice: "d66",
    notes:
      "After a session with a panic result of 9+, roll Empathy alone (no push); on a failure roll here. Healed only on shore leave in campaign play (p. 257).",
    tags: ["stress", "trauma"],
    rows: ranges(mentalTraumaItems.map((m) => [m.range[0], m.range[1], m.name, { id: m.id, effect: m.effects }])),
  }),
);

export const criticalInjury: RollTable = verified(
  defineTable({
    id: "alien.character.critical-injury",
    name: "Critical injuries",
    family: FAMILY,
    page: 70,
    dice: "d66",
    notes:
      "Roll when broken (Health 0) or when hurt again while broken. Re-roll an injury you already have (14+). Lethal injuries call for a Stamina death roll (no push, no stress dice) each time limit; 64-66 kill outright. Healing times are in days.",
    tags: ["combat", "injury"],
    rows: d66(
      criticalInjuryItems.map((c) => ({
        label: c.name,
        page: 70,
        result: {
          id: c.name.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
          name: c.name,
          fatal: c.fatal,
          timeLimit: c.timeLimit,
          instantDeath: c.instantDeath,
          healingTime: c.healingTime,
          surgery: c.surgery,
          effect: c.effects,
        },
        // Traumatized: roll once on the mental trauma table.
        ...(c.roll === 43 ? { roll: [{ table: "alien.character.mental-trauma", as: "trauma" }] } : {}),
      })),
    ),
  }),
);

/**
 * Android critical system damage (p. 78). Rolled instead of a critical injury when a
 * synthetic reaches zero Health, and again for each further hit while at zero; a result
 * the android already has moves one step down the table. `step` orders the rows.
 */
export const androidCriticalDamage: RollTable = verified(
  defineTable({
    id: "alien.character.android-critical-damage",
    name: "Android critical system damage",
    family: FAMILY,
    page: 78,
    dice: "1d6",
    notes:
      "Androids at zero Health roll here, not on the critical injury table, and keep acting with the effect until result 6. A repeated result moves one step up the table. A shift of work and a COMTECH roll repairs all lost Health and every result short of a system shutdown.",
    tags: ["combat", "injury", "android"],
    rows: d6([
      { label: "Ruptured Fluid Pump", result: { id: "ruptured-fluid-pump", step: 1, effect: "Out of action for its next turn, with no interrupt actions before then." } },
      { label: "Destroyed Leg Servos", result: { id: "destroyed-leg-servos", step: 2, effect: "Neither leg works; moving takes a full action." } },
      { label: "Destroyed Arm Servos", result: { id: "destroyed-arm-servos", step: 3, effect: "One arm is out; only one-handed gear can be used." } },
      { label: "Head Dislocation", result: { id: "head-dislocation", step: 4, effect: "Neck badly fractured; every quick action becomes a full action." } },
      { label: "Severe Chassis Breach", result: { id: "severe-chassis-breach", step: 5, effect: "Internal parts spill out; the android cannot move at all." } },
      { label: "System Shutdown", result: { id: "system-shutdown", step: 6, shutdown: true, effect: "Wrecked beyond repair; talking to it needs a COMTECH roll, a power source and a stretch of work." } },
    ]),
  }),
);

export const campaignTheme: RollTable = verified(
  defineTable({
    id: "alien.character.campaign-theme",
    name: "Campaign theme",
    family: FAMILY,
    page: 158,
    dice: "1d6",
    mode: ["campaign"],
    notes: "An overarching focus for a new campaign; choose, roll or invent one.",
    rows: d6([
      { label: "Killing Greed", result: { theme: "killing-greed" } },
      { label: "Corporate Intrigue", result: { theme: "corporate-intrigue" } },
      { label: "Tidings of War", result: { theme: "tidings-of-war" } },
      { label: "New Opportunities", result: { theme: "new-opportunities" } },
      { label: "Secret Research", result: { theme: "secret-research" } },
      { label: "Echoes from the Past", result: { theme: "echoes-from-the-past" } },
    ]),
  }),
);

export const characterTables: RollTable[] = [stressResponse, panic, mentalTrauma, criticalInjury, androidCriticalDamage, campaignTheme];
