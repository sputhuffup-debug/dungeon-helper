/**
 * Table trackers. Initiative is rolled (d20 + Perception, or the skill a
 * character uses; a creature's Perception; a complex hazard's Stealth),
 * highest first. `counter` trackers edit numbers on each sheet: Hit Points,
 * temporary Hit Points, dying / wounded / doomed, Hero Points, Focus
 * Points, valued conditions and spell slots.
 */
import type { TrackerDef } from "@campaign-forge/module-sdk";
import { CHARACTER, cite, CREATURE, HAZARD, id, rule } from "../ids.ts";
import { VALUED_CONDITIONS } from "./entityTypes.ts";

const slotBinds = Array.from({ length: 10 }, (_, i) => `${CHARACTER}.slots.r${i + 1}.used`);
const conditionBinds = VALUED_CONDITIONS.flatMap((c) => [`${CHARACTER}.conditions.${c}`, `${CREATURE}.conditions.${c}`]);
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export const trackers: TrackerDef[] = [
  {
    id: id("tracker.initiative"),
    name: "Initiative",
    kind: "initiative",
    scope: "encounter",
    cite: cite("Player Core", "Encounter Mode", "Initiative"),
    rules: [rule("advice.initiative"), rule("action.delay")],
    config: { method: "roll", dice: "1d20", modifier: { var: ["computed.initiative", 0] }, order: "desc", label: "Roll initiative" },
  },
  {
    id: id("tracker.hp"),
    name: "Hit Points",
    kind: "counter",
    scope: "encounter",
    binds: [`${CHARACTER}.hp.current`, `${CREATURE}.hp.current`, `${HAZARD}.hp.current`],
    rules: [rule("advice.hit-points"), rule("condition.dying")],
    cite: cite("Player Core", "Hit Points, Healing, and Dying"),
    config: {
      label: "HP",
      min: 0,
      maxes: { [`${CHARACTER}.hp.current`]: { var: ["computed.hpMax", 1] }, [`${CREATURE}.hp.current`]: { var: "fields.hp.max" }, [`${HAZARD}.hp.current`]: { var: "fields.hp.max" } },
      labels: { [`${CHARACTER}.hp.current`]: "HP", [`${CREATURE}.hp.current`]: "HP", [`${HAZARD}.hp.current`]: "HP" },
      style: "stepper",
    },
  },
  {
    id: id("tracker.temp-hp"),
    name: "Temporary Hit Points",
    kind: "counter",
    scope: "encounter",
    binds: ["hp.temp"],
    cite: cite("Player Core", "Hit Points, Healing, and Dying", "Temporary Hit Points"),
    config: { label: "Temp HP", min: 0, style: "stepper" },
  },
  {
    id: id("tracker.dying"),
    name: "Dying, wounded, doomed",
    kind: "counter",
    scope: "character",
    binds: [`${CHARACTER}.dying`, `${CHARACTER}.wounded`, `${CHARACTER}.doomed`],
    rules: [rule("condition.dying"), rule("condition.wounded"), rule("condition.doomed")],
    cite: cite("Player Core", "Conditions", "Dying"),
    config: {
      maxes: { [`${CHARACTER}.dying`]: { var: ["computed.dyingMax", 4] }, [`${CHARACTER}.wounded`]: 3, [`${CHARACTER}.doomed`]: 3 },
      labels: { [`${CHARACTER}.dying`]: "Dying", [`${CHARACTER}.wounded`]: "Wounded", [`${CHARACTER}.doomed`]: "Doomed" },
    },
  },
  {
    id: id("tracker.hero-points"),
    name: "Hero Points",
    kind: "counter",
    scope: "character",
    binds: [`${CHARACTER}.heroPoints`],
    rules: [rule("advice.hero-points")],
    cite: cite("Player Core", "Hero Points"),
    config: { label: "Hero Points", max: 3 },
  },
  {
    id: id("tracker.focus"),
    name: "Focus Points",
    kind: "counter",
    scope: "character",
    binds: [`${CHARACTER}.focus.current`],
    cite: cite("Player Core", "Spells", "Focus Spells"),
    config: { label: "Focus", max: { var: ["fields.focus.max", 0] }, hideWhenNoMax: true },
  },
  {
    id: id("tracker.conditions"),
    name: "Conditions",
    kind: "counter",
    scope: "encounter",
    binds: conditionBinds,
    rules: VALUED_CONDITIONS.map((c) => rule(`condition.${c}`)),
    cite: cite("Player Core", "Conditions"),
    config: { labels: Object.fromEntries(conditionBinds.map((b) => [b, cap(b.split(".").pop()!)])), max: 4, style: "pips" },
  },
  {
    id: id("tracker.spell-slots"),
    name: "Spell slots used",
    kind: "counter",
    scope: "character",
    binds: slotBinds,
    cite: cite("Player Core", "Spells", "Spell Slots"),
    config: {
      labels: Object.fromEntries(slotBinds.map((b, i) => [b, `Rank ${i + 1}`])),
      maxes: Object.fromEntries(slotBinds.map((b, i) => [b, { var: [`fields.slots.r${i + 1}.max`, 0] }])),
      hideWhenNoMax: true,
    },
  },
  {
    id: id("tracker.clock"),
    name: "Time",
    kind: "clock",
    scope: "session",
    cite: cite("Player Core", "Encounter Mode", "Rounds"),
    rules: [rule("advice.initiative")],
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
