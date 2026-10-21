/**
 * Table trackers. `counter` trackers edit a number on each character's sheet
 * (hit points, death saves, exhaustion, hit dice, spell slots, inspiration);
 * initiative is rolled (d20 + the sheet's computed initiative), highest first.
 */
import type { TrackerDef } from "@campaign-forge/module-sdk";
import { CHARACTER, cite, id, rule } from "../ids.ts";

const ORD = ["1st", "2nd", "3rd", "4th", "5th", "6th", "7th", "8th", "9th"];
const slotBinds = ORD.map((_, i) => `${CHARACTER}.spellSlotsUsed.level${i + 1}`);

export const trackers: TrackerDef[] = [
  {
    id: id("tracker.initiative"),
    name: "Initiative",
    kind: "initiative",
    scope: "encounter",
    cite: cite("Combat", "The Order of Combat, Initiative"),
    rules: [rule("the-order-of-combat.initiative"), rule("the-order-of-combat.surprise")],
    config: { method: "roll", dice: "1d20", modifier: { var: ["computed.initiative", 0] }, order: "desc", label: "Roll initiative" },
  },
  {
    id: id("tracker.hp"),
    name: "Hit points",
    kind: "counter",
    scope: "encounter",
    cite: cite("Combat", "Damage and Healing, Hit Points"),
    binds: ["hp.current"],
    rules: [rule("damage-and-healing.hit-points"), rule("damage-and-healing.dropping-to-0-hit-points")],
    config: { label: "HP", min: 0, max: { var: "fields.hp.max" }, style: "stepper" },
  },
  {
    id: id("tracker.temp-hp"),
    name: "Temporary hit points",
    kind: "counter",
    scope: "encounter",
    cite: cite("Combat", "Damage and Healing, Temporary Hit Points"),
    binds: ["hp.temp"],
    rules: [rule("damage-and-healing.temporary-hit-points")],
    config: { label: "Temp HP", min: 0, style: "stepper" },
  },
  {
    id: id("tracker.death-saves"),
    name: "Death saving throws",
    kind: "counter",
    scope: "character",
    cite: cite("Combat", "Damage and Healing, Dropping to 0 Hit Points"),
    binds: [`${CHARACTER}.deathSaves.successes`, `${CHARACTER}.deathSaves.failures`],
    rules: [rule("damage-and-healing.dropping-to-0-hit-points")],
    config: { max: 3, labels: { [`${CHARACTER}.deathSaves.successes`]: "Successes", [`${CHARACTER}.deathSaves.failures`]: "Failures" } },
  },
  {
    id: id("tracker.exhaustion"),
    name: "Exhaustion",
    kind: "counter",
    scope: "character",
    cite: cite("Conditions", "Exhaustion"),
    binds: [`${CHARACTER}.exhaustion`],
    rules: [rule("conditions.exhaustion")],
    config: { label: "Level", max: 6 },
  },
  {
    id: id("tracker.spell-slots"),
    name: "Spell slots used",
    kind: "counter",
    scope: "character",
    cite: cite("Spellcasting", "What Is a Spell?, Spell Slots"),
    binds: slotBinds,
    rules: [rule("what-is-a-spell.spell-slots"), rule("resting.long-rest")],
    config: {
      labels: Object.fromEntries(slotBinds.map((b, i) => [b, ORD[i]])),
      maxes: Object.fromEntries(slotBinds.map((b, i) => [b, { var: [`computed.slotMax${i + 1}`, 0] }])),
      hideWhenNoMax: true,
    },
  },
  {
    id: id("tracker.hit-dice"),
    name: "Hit dice spent",
    kind: "counter",
    scope: "character",
    cite: cite("Adventuring", "Resting, Short Rest"),
    binds: [`${CHARACTER}.hitDiceSpent`],
    rules: [rule("resting.short-rest"), rule("resting.long-rest")],
    config: { label: "Spent", max: { var: ["fields.level", 1] } },
  },
  {
    id: id("tracker.inspiration"),
    name: "Inspiration",
    kind: "counter",
    scope: "character",
    binds: [`${CHARACTER}.inspiration`],
    rules: [id("rule.advice.inspiration")],
    config: { label: "Inspired" },
  },
  {
    id: id("tracker.clock"),
    name: "Time",
    kind: "clock",
    scope: "session",
    cite: cite("Adventuring", "Time"),
    rules: [rule("time")],
    config: {
      units: [
        { id: "round", name: "Round", duration: "6 seconds", minutes: 0.1 },
        { id: "minute", name: "Minute", duration: "10 rounds", minutes: 1, per: 10 },
        { id: "hour", name: "Hour", duration: "60 minutes", minutes: 60, per: 60 },
      ],
      calendar: id("calendar"),
    },
  },
  {
    id: id("tracker.countdown"),
    name: "Countdown",
    kind: "countdown",
    scope: "scene",
    config: { unit: "rounds", default: 10 },
  },
];
