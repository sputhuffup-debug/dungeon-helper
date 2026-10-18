/**
 * Star System Generator tables (p. 243). The objects table is modified by the
 * star's brightness class, read from the roll context as `brightness`.
 * Rows are unverified paraphrases.
 */
import type { RollTable } from "@campaign-forge/module-sdk";
import { d6, defineTable, ranges } from "./_helpers";

const FAMILY = "system";

export const systemObjects: RollTable = defineTable({
  id: "alien.system.objects",
  name: "System objects",
  family: FAMILY,
  page: 243,
  dice: "1d6",
  notes: "Counts of bodies by brightness class: supergiants (Ia, Ib) −2, giants (II, III) −1, main sequence (V) +1, white dwarfs (D) −3.",
  modifiers: [
    { when: { in: [{ var: "brightness" }, ["Ia", "Ib"]] }, add: -2, label: "supergiant" },
    { when: { in: [{ var: "brightness" }, ["II", "III"]] }, add: -1, label: "giant" },
    { when: { "==": [{ var: "brightness" }, "V"] }, add: 1, label: "main sequence" },
    { when: { "==": [{ var: "brightness" }, "D"] }, add: -3, label: "white dwarf" },
  ],
  rows: ranges([
    [-99, 1, "Barren system", { gasGiants: 0, terrestrials: 0, icePlanets: 1, asteroidBelts: 1 }],
    [2, 2, "Sparse system", { gasGiants: 1, terrestrials: 0, icePlanets: 1, asteroidBelts: 0 }],
    [3, 3, "Outer-heavy system", { gasGiants: 1, terrestrials: 1, icePlanets: 2, asteroidBelts: 1 }],
    [4, 4, "Balanced system", { gasGiants: 1, terrestrials: 2, icePlanets: 1, asteroidBelts: 1 }],
    [5, 5, "Inner-heavy system", { gasGiants: 2, terrestrials: 2, icePlanets: 2, asteroidBelts: 0 }],
    [6, 99, "Crowded system", { gasGiants: 2, terrestrials: 3, icePlanets: 3, asteroidBelts: 2 }],
  ]),
});

export const gasGiantFeatures: RollTable = defineTable({
  id: "alien.system.gas-giant-features",
  name: "Gas giant features",
  family: FAMILY,
  page: 243,
  dice: "1d6",
  rows: d6([
    { label: "Extensive ring system", result: { feature: "rings" } },
    { label: "A habitable moon", result: { feature: "habitable-moon" } },
    { label: "Permanent super-storm", result: { feature: "storm" } },
    { label: "Automated fuel skimming station", result: { feature: "fuel-station" } },
    { label: "Derelict in a decaying orbit", result: { feature: "derelict" } },
    { label: "Mining outposts on the moons", result: { feature: "moon-mining" } },
  ]),
});

export const asteroidBeltFeatures: RollTable = defineTable({
  id: "alien.system.asteroid-belt-features",
  name: "Asteroid belt features",
  family: FAMILY,
  page: 243,
  dice: "1d6",
  rows: d6([
    { label: "Dense, hazardous to navigate", result: { feature: "dense" } },
    { label: "Rich in rare metals", result: { feature: "rich-metals" } },
    { label: "Mining claim markers everywhere", result: { feature: "claims" } },
    { label: "Abandoned mining station", result: { feature: "abandoned-station" } },
    { label: "Pirate or smuggler hideout", result: { feature: "hideout" } },
    { label: "Ice-rich, used for water and fuel", result: { feature: "ice" } },
  ]),
});

export const systemTables: RollTable[] = [systemObjects, gasGiantFeatures, asteroidBeltFeatures];
