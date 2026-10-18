import type { AlienPreset } from "./types";

/**
 * Spaceship records (Evolved Edition p. 121-137). Reference data only,
 * flagged `unverified`. `modules`, `upgrades` and `armaments` hold ids from
 * the lists in ./ship-reference.ts.
 */

interface ShipSpec {
  id: string;
  name: string;
  summary: string;
  page: number;
  shipClass: "C" | "G" | "J" | "M" | "R" | "U" | "X";
  manufacturer: string;
  cost: number;
  crew: number | string;
  signature: number;
  ai: string;
  thrusters: number;
  length: string;
  hull: number;
  ftl: number;
  armor: number;
  passengers: number | string;
  modules: string[];
  upgrades: string[];
  armaments: string[];
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
    fields: { ...fields },
    unverified: true,
  };
}

export const shipPresets: AlienPreset[] = [
  ship({
    id: "lockmart-cm-90s-corvus",
    name: "Lockmart CM-90S Corvus",
    summary: "Mid-size commercial freighter favored by independent truckers.",
    page: 122,
    shipClass: "C",
    manufacturer: "Lockmart",
    cost: 30000000,
    crew: 5,
    signature: 0,
    ai: "MU/TH/UR 2000",
    thrusters: 1,
    length: "180 m",
    hull: 6,
    ftl: 10,
    armor: 4,
    passengers: 4,
    modules: ["airlock", "cargo-bay", "cargo-bay", "cryo-deck", "crew-quarters", "galley", "medbay", "workshop", "escape-pods"],
    upgrades: ["autopilot"],
    armaments: [],
    tags: ["frame:space-truckers"],
  }),
  ship({
    id: "conestoga-class-troop-transport",
    name: "Conestoga-class Troop Transport",
    summary: "USCMC warship and troop carrier; two dropships and a company of marines.",
    page: 124,
    shipClass: "M",
    manufacturer: "Weyland-Yutani / Lockmart",
    cost: 300000000,
    crew: 20,
    signature: 1,
    ai: "MU/TH/UR 6000",
    thrusters: 2,
    length: "385 m",
    hull: 12,
    ftl: 10,
    armor: 10,
    passengers: 90,
    modules: ["airlock", "armory", "bridge-backup", "brig", "cargo-bay", "cryo-deck", "cryo-deck", "crew-quarters", "drop-pods", "escape-pods", "galley", "hangar-bay", "hangar-bay", "medbay", "vehicle-bay", "workshop"],
    upgrades: ["armor-plating", "ecm-suite", "long-range-sensors", "point-defense-controls", "hardened-electronics"],
    armaments: ["railgun", "missile-battery", "point-defense-cannon", "nuclear-missile"],
    tags: ["frame:colonial-marines", "military"],
  }),
  ship({
    id: "bison-m-class-hauler",
    name: "Bison M-Class Hauler",
    summary: "Heavy commercial hauler built to tow refinery platforms and cargo.",
    page: 126,
    shipClass: "C",
    manufacturer: "Weyland-Yutani",
    cost: 42000000,
    crew: 5,
    signature: 1,
    ai: "MU/TH/UR 2500",
    thrusters: 1,
    length: "245 m",
    hull: 8,
    ftl: 8,
    armor: 5,
    passengers: 2,
    modules: ["airlock", "cargo-bay", "cargo-bay", "cargo-bay", "cryo-deck", "crew-quarters", "galley", "medbay", "workshop", "tow-rig", "shuttle-bay"],
    upgrades: ["autopilot", "cargo-lift"],
    armaments: [],
    tags: ["frame:space-truckers"],
  }),
  ship({
    id: "lockmart-cm-88b-bison-tug",
    name: "Lockmart CM-88B Bison Commercial Towing Vehicle",
    summary: "Older starfreighter and refinery tug; seven crew, one cat.",
    page: 127,
    shipClass: "U",
    manufacturer: "Lockmart",
    cost: 42000000,
    crew: 7,
    signature: 1,
    ai: "MU/TH/UR 6000",
    thrusters: 1,
    length: "334 m",
    hull: 9,
    ftl: 8,
    armor: 5,
    passengers: 0,
    modules: ["airlock", "cargo-bay", "cryo-deck", "crew-quarters", "galley", "medbay", "workshop", "tow-rig", "shuttle-bay", "escape-pods"],
    upgrades: ["autopilot"],
    armaments: [],
    tags: ["frame:space-truckers"],
  }),
  ship({
    id: "armadillo-class-tug",
    name: "Armadillo-class Tug",
    summary: "Compact, heavily armored utility tug for salvage and station work.",
    page: 130,
    shipClass: "U",
    manufacturer: "Seegson",
    cost: 15000000,
    crew: 3,
    signature: 0,
    ai: "APOLLO-lite",
    thrusters: 2,
    length: "60 m",
    hull: 5,
    ftl: 6,
    armor: 7,
    passengers: 2,
    modules: ["airlock", "cargo-bay", "crew-quarters", "docking-clamp", "workshop"],
    upgrades: ["reinforced-hull", "docking-tube"],
    armaments: ["mining-laser"],
  }),
  ship({
    id: "starcub-class-corvette",
    name: "Starcub-class Corvette",
    summary: "Light corporate and government patrol corvette; fast and lightly armed.",
    page: 133,
    shipClass: "G",
    manufacturer: "Weyland-Yutani",
    cost: 60000000,
    crew: 8,
    signature: -1,
    ai: "MU/TH/UR 4000",
    thrusters: 3,
    length: "120 m",
    hull: 6,
    ftl: 12,
    armor: 6,
    passengers: 6,
    modules: ["airlock", "armory", "brig", "cryo-deck", "crew-quarters", "galley", "medbay", "shuttle-bay", "escape-pods"],
    upgrades: ["improved-thrusters", "long-range-sensors", "ecm-suite", "comms-array"],
    armaments: ["autocannon-turret", "missile-battery", "point-defense-cannon"],
  }),
  ship({
    id: "weyland-yutani-heliades-survey-vessel",
    name: "Weyland-Yutani Heliades-class Survey Vessel",
    summary: "Company science and survey ship with sealed orders and a bio-containment lab.",
    page: 136,
    shipClass: "R",
    manufacturer: "Weyland-Yutani",
    cost: 90000000,
    crew: 12,
    signature: 0,
    ai: "MU/TH/UR 7000",
    thrusters: 2,
    length: "210 m",
    hull: 7,
    ftl: 12,
    armor: 5,
    passengers: 10,
    modules: ["airlock", "bio-lab", "cargo-bay", "cryo-deck", "crew-quarters", "galley", "laboratory", "medbay", "observation-deck", "science-sensors", "shuttle-bay", "stasis-pods", "workshop", "escape-pods"],
    upgrades: ["advanced-ai", "long-range-sensors", "comms-array", "emergency-bulkheads"],
    armaments: ["point-defense-cannon"],
  }),
];
