import type { TrackerDef } from "@campaign-forge/module-sdk";
import { CAMPAIGN, CINEMATIC } from "./modes";

export const STRESS_TRACKER = "alien.stress";
export const STORY_POINTS_TRACKER = "alien.story-points";
export const CLOCK_TRACKER = "alien.clock";
export const COUNTDOWN_TRACKER = "alien.countdown";
export const SUPPLY_TRACKER = "alien.supply";
export const INITIATIVE_TRACKER = "alien.initiative";
export const STEALTH_TRACKER = "alien.stealth";

/** Seven live table widgets (architecture seed, Trackers table). */
export const trackers: TrackerDef[] = [
  {
    id: STRESS_TRACKER,
    name: "Stress & panic",
    kind: "stress",
    scope: "character",
    page: [44, 74],
    binds: ["alien.character.stress", "alien.character.resolve", "alien.character.criticalInjuries", "alien.character.mentalTraumas"],
    rules: ["alien.rule.stress", "alien.rule.stress-response", "alien.rule.panic-roll", "alien.rule.mental-trauma"],
    config: {
      min: 0,
      operations: { stressResponse: "stressResponse", panic: "panicRoll", mentalTrauma: "mentalTrauma" },
      /** Every panic result is logged as { entity, total, label } so the session-end hook can find totals >= 9. */
      log: "panicLog",
      traumaThreshold: 9,
    },
  },
  {
    id: STORY_POINTS_TRACKER,
    name: "Story Points",
    kind: "story-points",
    scope: "character",
    mode: [CINEMATIC],
    page: [27, 44],
    binds: ["alien.character.storyPoints"],
    rules: ["alien.rule.story-points", "alien.rule.story-point-award"],
    config: { min: 0, max: 3, awardPerAct: 1, operation: "storyPoint" },
  },
  {
    id: CLOCK_TRACKER,
    name: "Clock",
    kind: "clock",
    scope: "session",
    page: 55,
    rules: ["alien.rule.time-units"],
    config: {
      units: [
        { id: "round", name: "Round", seconds: [5, 10] },
        { id: "stretch", name: "Stretch", minutes: [5, 10] },
        { id: "shift", name: "Shift", hours: [5, 10] },
      ],
      calendar: "alien.gregorian",
    },
  },
  {
    id: COUNTDOWN_TRACKER,
    name: "Countdown",
    kind: "countdown",
    scope: "scene",
    page: 55,
    rules: ["alien.rule.countdowns", "alien.rule.supply-rolls"],
    config: { unit: "minutes", consumable: true, supplyRollPerRound: true, operation: "supplyRoll", visibleToPlayers: true },
  },
  {
    id: SUPPLY_TRACKER,
    name: "Supply",
    kind: "supply",
    scope: "character",
    page: [28, 29],
    binds: ["alien.character.gear"],
    rules: ["alien.rule.supply-rolls", "alien.rule.consumables", "alien.rule.air-supply", "alien.rule.ammo-supply", "alien.rule.power-supply"],
    config: {
      kinds: ["air", "ammo", "power", "food", "water"],
      ratingPath: "supply",
      operation: "supplyRoll",
      cadence: { air: "per shift, per round under exertion", ammo: "after a fight or a full-auto burst", power: "per shift", food: "per day", water: "per day" },
    },
  },
  {
    id: INITIATIVE_TRACKER,
    name: "Initiative",
    kind: "initiative",
    scope: "encounter",
    page: [59, 208],
    rules: ["alien.rule.initiative", "alien.rule.creature-speed", "alien.rule.actions"],
    config: { cards: { min: 1, max: 10 }, creatureDrawsPerSpeed: true, speedPath: "fields.speed", allowSwap: true, actionsPerTurn: { slow: 1, fast: 1 } },
  },
  {
    id: STEALTH_TRACKER,
    name: "Stealth mode",
    kind: "stealth",
    scope: "scene",
    page: [55, 58],
    rules: ["alien.rule.stealth-mode", "alien.rule.stealth-simplified", "alien.rule.zones"],
    config: {
      zonesPerStretch: 1,
      hunterStates: ["active", "passive"],
      hiddenPositions: true,
      simplifiedMode: false,
      opposed: { sneak: "mobility", spot: "observation" },
      creatureSpeedPath: "fields.speed",
    },
  },
];

export const trackerIds = trackers.map((t) => t.id);
