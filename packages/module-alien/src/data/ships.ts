import type { AlienPreset } from "./types";

/**
 * Spaceships of the 2180s (Evolved Edition p. 128-137, summary table p. 138).
 * Stat lines are copied from the book; summaries are paraphrased.
 * `modules`, `upgrades` and `armaments` hold ids from ./ship-reference.ts,
 * repeated once per copy fitted ("Cargo Bay IV × 4" is four entries).
 *
 * Two readings rest on arithmetic rather than print, and are noted per ship:
 * - "EEV II" is the Class C Type 337 (the $500,000 size II EEV): only that
 *   price makes each printed ship cost add up.
 * - The Conestoga's class is printed only as "Conestoga" (p. 138); its hull,
 *   crew, price and base stats match an R-class hull with its upgrades, so it
 *   is stored as class R.
 */

type ShipClass = "C" | "G" | "J" | "M" | "R" | "U" | "X";

interface ShipSpec {
  id: string;
  name: string;
  summary: string;
  page: number;
  shipClass: ShipClass;
  designation: string;
  manufacturer: string;
  cost: number;
  crew: number;
  signature: number;
  ai: string;
  thrusters: number;
  length: string;
  hull: number;
  ftl: number;
  armor: number;
  passengers?: string;
  troops?: number;
  modules: string[];
  upgrades: string[];
  armaments: string[];
  munitions?: Record<string, number>;
  tags?: string[];
}

function ship(spec: ShipSpec): AlienPreset {
  const { id, name, summary, page, tags = [], ...fields } = spec;
  return {
    id: `alien.spaceship.${id}`,
    entityType: "alien.spaceship",
    name,
    summary,
    page,
    tags: ["spaceship", `class:${fields.shipClass}`, ...tags],
    fields: { munitions: {}, ...fields },
  };
}

/** `n` copies of an id, for "× n" in the stat lines. */
const times = (id: string, n: number): string[] => Array.from({ length: n }, () => id);

export const shipPresets: AlienPreset[] = [
  ship({
    id: "lockmart-starcub-shuttle",
    name: "Starcub Shuttle",
    summary: "Aging auxiliary shuttle carried by freighters; short FTL hops, 13 parsecs before refuelling. The Narcissus was one.",
    page: 128,
    shipClass: "C",
    designation: "Intrasystem Vessel",
    manufacturer: "Lockmart",
    cost: 2260000,
    crew: 1,
    signature: -1,
    ai: "None",
    thrusters: 2,
    length: "16 m",
    hull: 2,
    ftl: 15,
    armor: 0,
    passengers: "3 (in cryosleep)",
    modules: ["air-scrubbers-i", "cargo-bay-i", "cryo-deck-ii"],
    upgrades: [],
    armaments: [],
    tags: ["civilian", "shuttle"],
  }),
  ship({
    id: "weyland-yutani-cm-93d-mule",
    name: "Model CM-93D Mule",
    summary: "Small, sturdy ore carrier with a clamped-on ore pod; the D model adds an interstellar hyperdrive.",
    page: 130,
    shipClass: "G",
    designation: "Commercial Ore Transport Vessel",
    manufacturer: "Weyland-Yutani",
    cost: 13325000,
    crew: 3,
    signature: 0,
    ai: "None",
    thrusters: 1,
    length: "30 m",
    hull: 5,
    ftl: 20,
    armor: 1,
    modules: ["air-scrubbers-i", "cargo-bay-iii", "cargo-bay-ii", "docking-umbilical-ii", "galley-ii"],
    upgrades: ["armored-bulkheads", "planetfall-capacity"],
    armaments: [],
    tags: ["civilian", "mining"],
  }),
  ship({
    id: "lockmart-cm-90s-corvus",
    name: "Model CM-90S Corvus",
    summary: "Small, overpowered salvage tug with a tow crane and a dorsal lifeboat. The p. 138 table prices it at $16,550,000; the stat block's $18,350,000 is the one that adds up.",
    page: 133,
    shipClass: "G",
    designation: "Commercial Deep Space Salvage Vessel",
    manufacturer: "Lockmart",
    cost: 18350000,
    crew: 6,
    signature: 0,
    ai: "MU/TH/UR 6000",
    thrusters: 1,
    length: "54 m",
    hull: 6,
    ftl: 20,
    armor: 1,
    modules: [
      "artificial-intelligence-i",
      "air-scrubbers-ii",
      "cargo-bay-iii",
      "cryo-deck-ii",
      "docking-umbilical-ii",
      "eev-ii-type-337",
      "galley-ii",
      "hangar-iii",
      "salvage-crane-iii",
    ],
    upgrades: ["armored-bulkheads", "planetfall-capacity", "reinforced-frame"],
    armaments: [],
    tags: ["civilian", "salvage", "frame:space-truckers"],
  }),
  ship({
    id: "bison-m-class-hauler",
    name: "Model CM-88G Bison",
    summary: "Long-serving Lockmart starfreighter carrying cargo in big internal bays; the G has better FTL and comms than the B and D.",
    page: 134,
    shipClass: "M",
    designation: "Commercial Starfreighter",
    manufacturer: "Lockmart",
    cost: 38300000,
    crew: 7,
    signature: 1,
    ai: "MU/TH/UR 6500",
    thrusters: 0,
    length: "334 m",
    hull: 9,
    ftl: 12,
    armor: 1,
    modules: [
      "artificial-intelligence-i",
      "air-scrubbers-ii",
      ...times("cargo-bay-iv", 4),
      "cryo-deck-ii",
      "docking-umbilical-ii",
      ...times("eev-ii-type-337", 2),
      "galley-ii",
      "medlab-ii",
    ],
    upgrades: ["armored-bulkheads", "planetfall-capacity"],
    armaments: [],
    tags: ["civilian", "freighter", "frame:space-truckers"],
  }),
  ship({
    id: "lockmart-cm-88h-bison",
    name: "Model CM-88H Bison",
    summary: "Bison refitted as a tug with swappable engine cores, for hauling refineries and processors. The Nostromo was an 88B in a similar towing fit; its EEVs are Starcub shuttles.",
    page: 135,
    shipClass: "M",
    designation: "Commercial Starfreighter",
    manufacturer: "Lockmart",
    cost: 45500000,
    crew: 7,
    signature: 1,
    ai: "MU/TH/UR 7000",
    thrusters: 0,
    length: "334 m",
    hull: 9,
    ftl: 8,
    armor: 1,
    modules: [
      "artificial-intelligence-i",
      "air-scrubbers-ii",
      ...times("cargo-bay-iv", 2),
      "cryo-deck-ii",
      "docking-umbilical-ii",
      ...times("eev-ii-type-337", 2),
      "galley-ii",
      "medlab-ii",
      "tractor-hitch-iii",
    ],
    upgrades: ["armored-bulkheads", ...times("boosted-displacement-drives", 4), "planetfall-capacity"],
    armaments: [],
    tags: ["civilian", "tug", "frame:space-truckers"],
  }),
  ship({
    id: "lockmart-cyg-ns3-star-clipper",
    name: "Model CYG-NS3 Star Clipper",
    summary: "Retired Lockmart transport for crews, passengers and light cargo, with racks for extra stasis pods; often independently owned.",
    page: 136,
    shipClass: "M",
    designation: "Commercial Transport Ship",
    manufacturer: "Lockmart",
    cost: 62475000,
    crew: 6,
    signature: 1,
    ai: "MU/TH/UR 6500",
    thrusters: 1,
    length: "300 m",
    hull: 9,
    ftl: 6,
    armor: 0,
    passengers: "200 (in cryosleep)",
    modules: [
      "artificial-intelligence-i",
      "air-scrubbers-iii",
      ...times("cargo-bay-iii", 4),
      "cryo-deck-iv",
      "docking-umbilical-ii",
      ...times("eev-ii-type-337", 4),
      "galley-iii",
      "medlab-ii",
    ],
    upgrades: [...times("boosted-displacement-drives", 6), "planetfall-capacity", "overpowered-thrusters"],
    armaments: [],
    tags: ["civilian", "transport"],
  }),
  ship({
    id: "conestoga-class-troop-transport",
    name: "Conestoga-Class Frigate",
    summary: "The USCMC and Colonial Marshals' workhorse frigate with a modular interior and many hardpoints. Printed class: Conestoga; stored as R (see notes).",
    page: 137,
    shipClass: "R",
    designation: "Rapid Response Troop Transport (Frigate RRTT-3)",
    manufacturer: "Weyland-Yutani",
    cost: 738150000,
    crew: 12,
    signature: 0,
    ai: "MU/TH/UR 9000",
    thrusters: 1,
    length: "731 m",
    hull: 12,
    ftl: 2,
    armor: 2,
    troops: 90,
    modules: [
      "artificial-intelligence-i",
      "air-scrubbers-iv",
      "cargo-bay-iii",
      "cryo-deck-iv",
      "docking-umbilical-ii",
      ...times("eev-i", 20),
      "galley-iv",
      "hangar-iv",
      "medlab-ii",
    ],
    upgrades: [
      ...times("armored-bulkheads", 2),
      ...times("boosted-displacement-drives", 6),
      "enhanced-sensors",
      ...times("overpowered-thrusters", 2),
      "stealth-technology",
    ],
    armaments: [
      "long-lance-asat-missile",
      "heavy-railgun-turret",
      "particle-beam-800mev",
      "orbital-mines",
      "tactical-nuke",
      "ciws-laser-array",
      "sensor-drones",
      "sensor-decoys",
    ],
    munitions: { "long-lance-asat-missile": 8, "orbital-mines": 60, "tactical-nuke": 20 },
    tags: ["military", "frame:colonial-marines"],
  }),
];
