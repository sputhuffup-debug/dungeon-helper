/**
 * The Xenomorph XX121 life cycle as data for the generic life-cycle tracker
 * (kind "lifecycle", see module-sdk `LifecycleConfig`). Timings are the
 * Evolved Edition's (p. 212-219); where the book gives no number the value is
 * a module default marked `unverified` with a note, and the GM can change the
 * pace of any infection or advance it by hand.
 *
 * Scope: from the facehug to Stage V (Soldier, Worker, Sentry), plus the
 * variants (Bambi Burster, Imp, Queen Burster) and ovomorphing (host to egg).
 * Stage VI needs royal jelly from a Queen and is not tracked.
 */
import type { Effect, LifecycleConfig, LifecycleStage, LifecycleVariant } from "@campaign-forge/module-sdk";
import { IMPLANTED_CONDITION } from "./dice/operations";

/** Host conditions the life cycle sets. */
export const LIFECYCLE_CONDITIONS = {
  facehugged: "xx121:facehugged",
  implanted: IMPLANTED_CONDITION,
  embryo: "xx121:embryo",
  killedByChestburster: "xx121:killed-by-chestburster",
  killedByRemoval: "xx121:killed-by-removal",
  diedInSurgery: "xx121:died-in-surgery",
  cocooned: "xx121:cocooned",
  ovomorphed: "xx121:ovomorphed",
} as const;

/** The relationship from a spawned xenomorph to the host it came from. */
export const EMERGED_FROM = "emerged_from";

const C = LIFECYCLE_CONDITIONS;
const P = (id: string) => `alien.creature.${id}`;

/** Clock units with the Alien clock tracker's minutes (midpoints of p. 55), plus a day for the Queen Burster. */
const UNITS = [
  { id: "round", name: "Round", minutes: 0.125 },
  { id: "stretch", name: "Stretch", plural: "Stretches", minutes: 7.5 },
  { id: "shift", name: "Shift", minutes: 450 },
  { id: "day", name: "Day", minutes: 1440 },
];

const condition = (id: string, label: string, page: number): Effect => ({ kind: "addCondition", entity: "$host", condition: { id, label, source: "alien.gestation", page } });
const uncondition = (id: string): Effect => ({ kind: "removeCondition", entity: "$host", conditionId: id });

// ---------------------------------------------------------------------------
// Stages shared by the variants
// ---------------------------------------------------------------------------

/** Stage II on the host: out cold until the facehugger drops off (p. 214). */
function facehugged(next: string): LifecycleStage {
  return {
    id: "facehugged",
    name: "Facehugged",
    label: "Stage II",
    page: 214,
    summary: "The host is unconscious and cannot be woken. Within a shift the facehugger dies and drops off.",
    duration: { amount: 1, unit: "shift" },
    next: [{ to: next }],
    check: {
      label: "Insemination check",
      operation: "inseminationCheck",
      every: { amount: 1, unit: "stretch" },
      stopCondition: C.implanted,
      page: 214,
      note: "One stress die per stretch after the facehug; the facehugger symbol means the embryo is in.",
    },
    removal: {
      label: "Remove the facehugger",
      page: 214,
      note: "Freeze it with extreme cold first: about a stretch with the right gear and a HEAVY MACHINERY roll. Pulled off unfrozen, it kills the host.",
      blockedByCondition: C.implanted,
      blockedNote: "The host is implanted: taking the facehugger off no longer saves them (p. 214).",
      effects: [
        uncondition(C.facehugged),
        {
          kind: "prompt",
          prompt: {
            id: "alien.gestation.removal",
            kind: "choice",
            text: "How did the removal of {host}'s facehugger go?",
            page: 214,
            options: [
              { id: "frozen", label: "Frozen first, HEAVY MACHINERY roll made: the host lives", effects: [{ kind: "log", text: "{host}: the frozen facehugger came off before implantation (p. 214)." }] },
              { id: "unfrozen", label: "Torn off without freezing: the host dies", effects: [condition(C.killedByRemoval, "Killed removing a facehugger", 214)] },
            ],
          },
        },
      ],
    },
    onEnter: [condition(C.facehugged, "Facehugged: unconscious, cannot be woken", 214)],
  };
}

/** The host is awake again while the embryo grows (p. 214, 216). */
function gestating(next: string, extra: Partial<LifecycleStage> = {}): LifecycleStage {
  return {
    id: "gestating",
    name: "Embryo growing",
    label: "Host awake",
    page: [214, 216],
    summary: "The facehugger has dropped off dead; the host wakes up, usually starving, with the embryo inside.",
    duration: { amount: 1, unit: "shift" },
    next: [{ to: next }],
    removal: {
      label: "Surgery",
      page: 216,
      note: "No surgery has yet removed an embryo without killing the patient; the further along it is, the likelier the embryo dies too.",
      effects: [condition(C.diedInSurgery, "Died in surgery to remove an embryo", 216), uncondition(C.embryo), { kind: "log", text: "{host}: the surgery killed the host; the GM decides whether the embryo survives (p. 216)." }],
    },
    onEnter: [uncondition(C.facehugged), condition(C.embryo, "Carrying a xenomorph embryo", 214), { kind: "log", text: "{host} wakes up, most likely ravenous (p. 214)." }],
    ...extra,
  };
}

/** Birth of a Stage III burster: the host dies, witnesses panic (p. 216). */
function burster(id: string, name: string, preset: string, page: LifecycleStage["page"], extra: Partial<LifecycleStage>): LifecycleStage {
  return {
    id,
    name,
    label: "Stage III",
    page,
    creaturePreset: P(preset),
    onEnter: [
      uncondition(C.embryo),
      condition(C.killedByChestburster, "Killed by a chestburster", 216),
      { kind: "log", text: "{host} dies as the {stage} bursts out (p. 216)." },
    ],
    witnessPrompt: {
      text: "Does {witness} see the {stage} burst out of {host} for the first time? If so, an immediate panic roll (p. 216); close this if not.",
      operation: "panicRoll",
      page: 216,
    },
    ...extra,
  };
}

const STAGE_IV_TO_V = "With a Queen present, a group of six or more Stage IV molts to Stage V (p. 219).";

const drone: LifecycleStage = {
  id: "drone",
  name: "Drone",
  label: "Stage IV",
  page: 217,
  creaturePreset: P("xx121-drone"),
  waitNote: `Stays at Stage IV until a Queen's pheromones make it molt into a Soldier or a Worker, whichever the hive lacks (p. 217). ${STAGE_IV_TO_V}`,
  next: [
    { to: "soldier", label: "Soldier", condition: "A Queen's hive needs soldiers.", page: 217 },
    { to: "worker", label: "Worker", condition: "A Queen's hive needs builders.", page: 217 },
  ],
};

const scout: LifecycleStage = {
  id: "scout",
  name: "Scout",
  label: "Stage IV",
  page: [217, 218],
  creaturePreset: P("xx121-scout"),
  waitNote: `Changes only after a Queen is born and the hive's location is safe (p. 218). ${STAGE_IV_TO_V}`,
  next: [{ to: "sentry", label: "Sentry", condition: "A Queen is born and the hive is secure.", page: [218, 219] }],
};

const STAGE_VI = "Stage VI needs royal jelly from a Queen and is not tracked here (p. 219).";

const soldier: LifecycleStage = { id: "soldier", name: "Soldier", label: "Stage V", page: [218, 219], creaturePreset: P("xx121-soldier"), finalNote: `The adult form of a Drone. ${STAGE_VI}` };
const worker: LifecycleStage = { id: "worker", name: "Worker", label: "Stage V", page: 219, creaturePreset: P("xx121-worker"), finalNote: "Builds and tends the hive; it does not change further." };
const sentry: LifecycleStage = { id: "sentry", name: "Sentry", label: "Stage V", page: 219, creaturePreset: P("xx121-sentry"), finalNote: `The matured Scout. ${STAGE_VI}` };

const STAGE_IV_CHOICE_NOTE =
  "The book does not say which Stage IV form a burster becomes. When the shift runs out this tracker takes the first option; use Advance to pick the other.";

// ---------------------------------------------------------------------------
// Variants
// ---------------------------------------------------------------------------

const standard: LifecycleVariant = {
  id: "standard",
  name: "Facehugger (standard XX121)",
  summary: "Facehugger, Chestburster, then a Drone or Scout that waits for a Queen to become Stage V.",
  page: [212, 219],
  sourcePresets: [P("xx121-facehugger")],
  stages: [
    facehugged("gestating"),
    gestating("chestburster"),
    burster("chestburster", "Chestburster", "xx121-chestburster", [215, 216], {
      summary: "It flees to hide and feed on metal and food, then molts within a shift.",
      duration: { amount: 1, unit: "shift" },
      next: [
        { to: "drone", label: "Drone" },
        { to: "scout", label: "Scout" },
      ],
      unverified: true,
      note: `${STAGE_IV_CHOICE_NOTE} Drone is the default (the lone creature outside a hive, p. 217).`,
    }),
    drone,
    scout,
    soldier,
    worker,
    sentry,
  ],
};

const bambi: LifecycleVariant = {
  id: "bambi",
  name: "Bambi Burster (four-legged host)",
  summary: "The embryo grows in a quadrupedal animal, which matures faster; the burster is born on four legs.",
  page: [215, 216],
  sourcePresets: [P("xx121-facehugger")],
  stages: [
    facehugged("gestating"),
    gestating("bambi-burster", {
      duration: { amount: 0.5, unit: "shift" },
      unverified: true,
      note: "The book says animal hosts mature faster but gives no time (p. 215); half a shift is this tracker's default.",
    }),
    burster("bambi-burster", "Bambi Burster", "xx121-bambi-burster", [215, 216], {
      summary: "A fawn-like burster on spindly legs; it hides and feeds, then molts within a shift.",
      duration: { amount: 1, unit: "shift" },
      next: [
        { to: "scout", label: "Scout" },
        { to: "drone", label: "Drone" },
      ],
      unverified: true,
      note: `${STAGE_IV_CHOICE_NOTE} Scout, the four-legged runner (p. 218), is the default here.`,
    }),
    drone,
    scout,
    soldier,
    worker,
    sentry,
  ],
};

const praetomorph: LifecycleVariant = {
  id: "praetomorph",
  name: "Praeto-Facehugger (Imp, Stalker)",
  summary: "A Praetomorph: the Imp grows much faster than a Chestburster into a Stalker, which never molts again.",
  page: [212, 218],
  sourcePresets: [P("xx121-praeto-facehugger")],
  stages: [
    facehugged("gestating"),
    gestating("imp"),
    burster("imp", "Imp", "xx121-imp", 216, {
      summary: "If not threatened as it emerges, it may copy what the nearest creature does.",
      duration: { amount: 0.5, unit: "shift" },
      next: [{ to: "stalker", label: "Stalker" }],
      unverified: true,
      note: "The book says Imps mature substantially faster than Chestbursters but gives no time (p. 216); half a shift is this tracker's default.",
    }),
    {
      id: "stalker",
      name: "Stalker",
      label: "Stage IV",
      page: [217, 218],
      creaturePreset: P("xx121-stalker"),
      finalNote: "An evolutionary dead end: no Stalker has been seen to molt further (p. 218).",
    },
  ],
};

const queen: LifecycleVariant = {
  id: "queen",
  name: "Royal Facehugger (Queen Burster)",
  summary: "The royal facehugger seeds a Queen, whose embryo takes days rather than hours.",
  page: [213, 216],
  sourcePresets: [P("xx121-royal-facehugger")],
  stages: [
    facehugged("gestating"),
    gestating("queen-burster", {
      duration: { amount: 3, unit: "day" },
      unverified: true,
      note: "The book says the Queen Burster gestates over days instead of hours but gives no count (p. 216); three days is this tracker's default.",
    }),
    burster("queen-burster", "Queen Burster", "xx121-queen-burster", 216, {
      summary: "Born with a partial crest, both pairs of arms and full legs.",
      finalNote: "It grows into a Queen (Stage VI), which this tracker does not cover (p. 216, 220).",
    }),
  ],
};

const ovomorphing: LifecycleVariant = {
  id: "ovomorphing",
  name: "Ovomorphing (host into egg)",
  summary: "A Drone cut off from a hive cocoons a captured host, who turns into an egg holding a new facehugger.",
  page: 212,
  sourcePresets: [P("xx121-drone"), P("xx121-scout")],
  stages: [
    {
      id: "cocooned",
      name: "Cocooned",
      label: "Ovomorphing",
      page: 212,
      summary: "Resin-wrapped and dosed with enzymes and hormones, the host slowly becomes an Ovomorph.",
      duration: { amount: [4, 6], unit: "shift" },
      next: [{ to: "egg" }],
      onEnter: [condition(C.cocooned, "Cocooned for ovomorphing", 212)],
      note: "24 to 36 hours, four to six shifts (p. 212); the length is rolled when the stage starts.",
    },
    {
      id: "egg",
      name: "Egg",
      label: "Stage I",
      page: 212,
      creaturePreset: P("xx121-ovomorph"),
      onEnter: [uncondition(C.cocooned), condition(C.ovomorphed, "Turned into an Ovomorph", 212), { kind: "log", text: "{host} is now an egg with a facehugger inside (p. 212)." }],
      finalNote: "When its facehugger takes a host, start a new infection for that host (p. 212).",
    },
  ],
};

export const gestationVariants: LifecycleVariant[] = [standard, bambi, praetomorph, queen, ovomorphing];

/** Config of the `alien.gestation` tracker. */
export const gestationConfig: LifecycleConfig = {
  units: UNITS,
  paces: [
    { id: "much-slower", label: "Much slower (×¼)", factor: 0.25 },
    { id: "slower", label: "Slower (×½)", factor: 0.5 },
    { id: "normal", label: "Normal", factor: 1 },
    { id: "faster", label: "Faster (×2)", factor: 2 },
    { id: "much-faster", label: "Much faster (×4)", factor: 4 },
  ],
  defaultPace: "normal",
  variants: gestationVariants,
  defaultVariant: "standard",
  spawn: { name: "Xenomorph from {host}", link: { type: EMERGED_FROM } },
  // Androids are not potential hosts (p. 212).
  start: { label: "Start infection", entityKinds: ["character"], sourceKinds: ["creature"], exemptField: "android" },
  labels: { instance: "Infection", subject: "Host", creature: "Creature" },
  pauseNote: "Stasis halts an infection until the host is woken (p. 216).",
  paceNote: "Illness or a weak immune system can quicken or slow it, and infection in hypersleep slows it after revival; the GM decides (p. 216).",
};
