/**
 * Star System Generator tables (p. 243), checked against the book.
 *
 * System objects: one roll per body type, each with its own dice and
 * modifiers by star type. The modifiers read `starType` from the roll
 * context (a step of `alien.system.create` derived from the star's spectral
 * and brightness class): "giant" (III), "subgiant" (IV), "main-sequence" (V),
 * "red-dwarf" (MV), "white-main-sequence" (AV) or "white-dwarf" (D).
 * A negative result means none of that type.
 */
import type { RollTable, TableRow } from "@campaign-forge/module-sdk";
import { d6, ranges, type TableSpec } from "./_helpers";

const FAMILY = "system";

/** A table checked against the book: no `unverified` flag. */
const table = (spec: TableSpec): RollTable => ({ ...spec });

const star = (type: string) => ({ "==": [{ var: "starType" }, type] });

/** Count rows: [-99..0] none, then one row per count up to `max`. */
function countRows(noun: string, max: number): TableRow[] {
  const rows: Array<[number, number, string, Record<string, unknown>]> = [[-99, 0, `No ${noun}`, { count: 0 }]];
  for (let n = 1; n <= max; n++) rows.push([n, n === max ? 99 : n, `${n} ${noun}`, { count: n }]);
  return ranges(rows);
}

export const gasGiants: RollTable = table({
  id: "alien.system.gas-giants",
  name: "Number of gas giants",
  family: FAMILY,
  page: 243,
  dice: "1d6-1",
  notes: "D6−1; −1 if subgiant, −4 if white dwarf. Each gas giant has D6+4 significant moons.",
  modifiers: [
    { when: star("subgiant"), add: -1, label: "subgiant" },
    { when: star("white-dwarf"), add: -4, label: "white dwarf" },
  ],
  rows: countRows("gas giants", 5),
});

export const terrestrialPlanets: RollTable = table({
  id: "alien.system.terrestrial-planets",
  name: "Number of terrestrial planets",
  family: FAMILY,
  page: 243,
  dice: "1d6",
  notes: "D6; −3 if red dwarf, −3 if white dwarf. Detail each with Main World Creation, stopping at colony size.",
  modifiers: [
    { when: star("red-dwarf"), add: -3, label: "red dwarf" },
    { when: star("white-dwarf"), add: -3, label: "white dwarf" },
  ],
  rows: countRows("terrestrial planets", 6),
});

export const icePlanets: RollTable = table({
  id: "alien.system.ice-planets",
  name: "Number of ice planets",
  family: FAMILY,
  page: 243,
  dice: "1d6+1",
  notes: "D6+1; −1 if subgiant, −1 if giant, −1 if white main sequence. Detail each with Main World Creation at frozen temperature, stopping at colony size.",
  modifiers: [
    { when: star("subgiant"), add: -1, label: "subgiant" },
    { when: star("giant"), add: -1, label: "giant" },
    { when: star("white-main-sequence"), add: -1, label: "white main sequence" },
  ],
  rows: countRows("ice planets", 7),
});

export const asteroidBelts: RollTable = table({
  id: "alien.system.asteroid-belts",
  name: "Number of asteroid belts",
  family: FAMILY,
  page: 243,
  dice: "1d6-3",
  notes: "D6−3; −2 if white dwarf, −2 if subgiant.",
  modifiers: [
    { when: star("white-dwarf"), add: -2, label: "white dwarf" },
    { when: star("subgiant"), add: -2, label: "subgiant" },
  ],
  rows: countRows("asteroid belts", 3),
});

export const gasGiantFeatures: RollTable = table({
  id: "alien.system.gas-giant-features",
  name: "Gas giant features",
  family: FAMILY,
  page: 243,
  dice: "1d6",
  rows: d6([
    { label: "Storms", result: { feature: "storms" } },
    { label: "Single super storm", result: { feature: "super-storm" } },
    { label: "Rings", result: { feature: "rings" } },
    { label: "High winds", result: { feature: "high-winds" } },
    { label: "Intense radiation fields", result: { feature: "radiation" } },
    { label: "Small gas giant", result: { feature: "small" } },
  ]),
});

export const asteroidBeltFeatures: RollTable = table({
  id: "alien.system.asteroid-belt-features",
  name: "Asteroid belt features",
  family: FAMILY,
  page: 243,
  dice: "1d6",
  rows: d6([
    { label: "Bright and highly visible", result: { feature: "bright" } },
    { label: "High orbital inclination", result: { feature: "high-inclination" } },
    { label: "Dust belt", result: { feature: "dust" } },
    { label: "Contains several large dwarf planets", result: { feature: "dwarf-planets" } },
    { label: "Very wide – covering several orbits", result: { feature: "very-wide" } },
    { label: "Intensely mineral rich asteroids", result: { feature: "mineral-rich" } },
  ]),
});

export const systemTables: RollTable[] = [gasGiants, terrestrialPlanets, icePlanets, asteroidBelts, gasGiantFeatures, asteroidBeltFeatures];
