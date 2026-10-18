import type { TrackerDef } from "@campaign-forge/module-sdk";
import { CAMPAIGN, CINEMATIC } from "./modes";

export const STRESS_TRACKER = "alien.stress";
export const STORY_POINTS_TRACKER = "alien.story-points";
export const CLOCK_TRACKER = "alien.clock";
export const COUNTDOWN_TRACKER = "alien.countdown";
export const SUPPLY_TRACKER = "alien.supply";
export const INITIATIVE_TRACKER = "alien.initiative";
export const STEALTH_TRACKER = "alien.stealth";

/** Seven live table widgets (architecture seed, Trackers table), with numbers checked against the Evolved Edition. */
export const trackers: TrackerDef[] = [
  {
    id: STRESS_TRACKER,
    name: "Stress & panic",
    kind: "stress",
    scope: "character",
    page: [44, 74],
    binds: ["alien.character.stress", "alien.character.resolve", "alien.character.criticalInjuries", "alien.character.mentalTraumas"],
    rules: ["alien.rule.stress", "alien.rule.stress-response", "alien.rule.panic-roll", "alien.rule.stopping-panic", "alien.rule.stress-recovery", "alien.rule.mental-trauma"],
    config: {
      min: 0,
      operations: { stressResponse: "stressResponse", panic: "panicRoll", mentalTrauma: "mentalTrauma" },
      // Keys read by the ui StressTracker.
      stressResponseOperation: "stressResponse",
      panicOperation: "panicRoll",
      panicThreshold: 9,
      // Androids have no stress level and never panic (p. 25).
      exemptField: "android",
      exemptLabel: "Android",
      /** Every panic result is logged as { entity, total, label } so the session-end hook can find totals >= 9. */
      log: "panicLog",
      // A panic roll of 9+ during the session calls for the Empathy roll against mental trauma (p. 74).
      traumaThreshold: 9,
      // Each stretch of rest in a safe area: stress −1 and one stress response removed per level (p. 73).
      reliefPerStretch: 1,
    },
  },
  {
    id: STORY_POINTS_TRACKER,
    name: "Story Points",
    kind: "story-points",
    scope: "character",
    mode: [CINEMATIC],
    page: [44, 158],
    binds: ["alien.character.storyPoints"],
    rules: ["alien.rule.story-points", "alien.rule.story-point-award"],
    // Max 3; one per act for an agenda followed at risk; one may carry to the next adventure (p. 44, 158).
    config: { min: 0, max: 3, cap: 3, awardPerAct: 1, carryOver: 1, operation: "storyPoint" },
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
        // `duration` and `minutes` (the midpoint, used for elapsed time) are read by the ui ClockTracker.
        { id: "round", name: "Round", seconds: [5, 10], duration: "5–10 seconds", minutes: 0.125 },
        { id: "stretch", name: "Stretch", minutes: 7.5, range: [5, 10], duration: "5–10 minutes" },
        { id: "shift", name: "Shift", hours: [5, 10], duration: "5–10 hours", minutes: 450 },
        // Round: combat; stretch: stealth; shift: recovery and repairs (p. 20, 55).
      ],
      calendar: "alien.gregorian",
    },
  },
  {
    id: COUNTDOWN_TRACKER,
    name: "Countdown",
    kind: "countdown",
    scope: "scene",
    page: [28, 55],
    rules: ["alien.rule.countdowns", "alien.rule.supply-rolls"],
    // Minutes remaining are a supply rating: a supply roll after each combat round, −1 minute per facehugger (p. 28, 55).
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
      // Supply ratings exist for air, ammo and power only; food and water are daily needs (p. 28, 75).
      kinds: ["air", "ammo", "power"],
      ratingPath: "supply",
      operation: "supplyRoll",
      // Stress dice equal to the rating, at most six; each facehugger lowers it by one (p. 28).
      max: 6,
      cadence: {
        air: "after every stretch, and after strenuous activity such as combat or a Mobility roll",
        ammo: "after each attack, unless an extra success conserves ammo; after every roll of a full-auto burst",
        power: "after each use, or as the item says",
      },
      // NPC ratings simply drop one step instead of rolling (p. 29).
      npcStepDown: true,
    },
  },
  {
    id: INITIATIVE_TRACKER,
    name: "Initiative",
    kind: "initiative",
    scope: "encounter",
    page: [59, 60],
    rules: ["alien.rule.initiative", "alien.rule.creature-speed", "alien.rule.actions", "alien.rule.holding-off", "alien.rule.ambush"],
    // `cards` is the deck size and `drawsField` the field giving draws per participant (creature Speed), as the ui InitiativeTracker reads them.
    // Ten cards, redrawn each round; Xenomorphs draw one per point of Speed (p. 59, 208); holding off swaps cards;
    // surprise or ambush gives the attacker the lowest cards; one full and one quick action, or two quick (p. 60).
    config: {
      cards: 10,
      drawsField: "speed",
      creatureDrawsPerSpeed: true,
      speedPath: "fields.speed",
      allowSwap: true,
      redrawEachRound: true,
      surpriseCard: 1,
      actionsPerTurn: { full: 1, quick: 1, alternative: { quick: 2 } },
    },
  },
  {
    id: STEALTH_TRACKER,
    name: "Stealth mode",
    kind: "stealth",
    scope: "scene",
    page: [55, 58],
    rules: ["alien.rule.stealth-mode", "alien.rule.detection", "alien.rule.stealth-simplified", "alien.rule.zones", "alien.rule.motion-tracker"],
    // PCs move one zone per stretch, then NPCs on a hidden map; Xenomorphs one zone per point of Speed (p. 55).
    // Coming into sight: a passive, open, opposed Observation roll for both sides (p. 56); darkness −2 (p. 57);
    // keeping guard +2 (p. 56); an M314 motion tracker reaches four zones (p. 58).
    config: {
      zonesPerStretch: 1,
      hunterStates: ["active", "passive"],
      hiddenPositions: true,
      simplifiedMode: false,
      opposed: { spot: "observation", against: "observation", passive: true, open: true },
      darknessPenalty: -2,
      keepingGuardBonus: 2,
      motionTrackerZones: 4,
      creatureSpeedPath: "fields.speed",
    },
  },
];

export const trackerIds = trackers.map((t) => t.id);
