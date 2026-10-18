import type { AlienPreset } from "./types";

/**
 * Vehicle stat blocks (Evolved Edition p. 100-105). Reference data only,
 * flagged `unverified`. `weapons` are free-text names; they may be linked to
 * `alien.item` weapon presets later.
 */

interface VehicleSpec {
  id: string;
  name: string;
  summary: string;
  page: number;
  length: string;
  passengers: number | string;
  maneuverability: number;
  speed: number;
  hull: number;
  armor: number;
  weapons: string[];
  cost: number;
  encountered: string;
  tags?: string[];
}

function vehicle(spec: VehicleSpec): AlienPreset {
  const { id, name, summary, page, tags = [], ...fields } = spec;
  return {
    id: `alien.vehicle.${id}`,
    entityType: "alien.vehicle",
    name,
    summary,
    page,
    tags: ["vehicle", ...tags],
    fields: { ...fields },
    unverified: true,
  };
}

export const vehiclePresets: AlienPreset[] = [
  vehicle({
    id: "m577-apc",
    name: "M577 Armored Personnel Carrier",
    summary: "USCMC eight-wheeled APC carried by the Cheyenne dropship.",
    page: 101,
    length: "9 m",
    passengers: 12,
    maneuverability: 0,
    speed: 2,
    hull: 8,
    armor: 10,
    weapons: ["Twin-linked phased plasma cannon turret", "Secondary gun turret"],
    cost: 500000,
    encountered: "Marine deployments, abandoned at overrun colonies.",
    tags: ["military"],
  }),
  vehicle({
    id: "daihotai-tractor",
    name: "Daihotai 8-Wheel Tractor",
    summary: "Colony workhorse: hauls cargo and prefabs across any terrain.",
    page: 102,
    length: "8 m",
    passengers: 6,
    maneuverability: -1,
    speed: 1,
    hull: 6,
    armor: 6,
    weapons: [],
    cost: 90000,
    encountered: "Every colony and most survey camps.",
    tags: ["civilian"],
  }),
  vehicle({
    id: "ud-4l-cheyenne-dropship",
    name: "UD-4L Cheyenne Dropship",
    summary: "USCMC VTOL dropship and gunship; carries one APC.",
    page: 103,
    length: "25 m",
    passengers: 14,
    maneuverability: 1,
    speed: 3,
    hull: 10,
    armor: 8,
    weapons: ["Rocket pods", "Missile launchers", "Chin-mounted gatling gun"],
    cost: 2000000,
    encountered: "Marine deployments; sometimes sold surplus to corporations.",
    tags: ["military", "aircraft"],
  }),
  vehicle({
    id: "nr-6-atv",
    name: "NR-6 All-Terrain Vehicle",
    summary: "Light four-wheeled scout and survey buggy.",
    page: 104,
    length: "4 m",
    passengers: 3,
    maneuverability: 2,
    speed: 2,
    hull: 3,
    armor: 3,
    weapons: [],
    cost: 25000,
    encountered: "Survey teams, colony patrols, marshals.",
    tags: ["civilian"],
  }),
  vehicle({
    id: "cargo-hovercraft",
    name: "Cargo Hovercraft",
    summary: "Fan-driven platform for swamps, ice and shallow seas.",
    page: 104,
    length: "12 m",
    passengers: 8,
    maneuverability: 0,
    speed: 2,
    hull: 5,
    armor: 4,
    weapons: [],
    cost: 120000,
    encountered: "Water, ice and marsh worlds.",
    tags: ["civilian"],
  }),
  vehicle({
    id: "p-5000-power-loader",
    name: "Caterpillar P-5000 Power Loader",
    summary: "Exoskeletal cargo loader; a Heavy Machinery weapon in a pinch.",
    page: 105,
    length: "3 m",
    passengers: 1,
    maneuverability: -1,
    speed: 1,
    hull: 4,
    armor: 4,
    weapons: ["Hydraulic claws (close combat, damage 3)"],
    cost: 50000,
    encountered: "Cargo bays, docks and warehouses everywhere.",
    tags: ["civilian", "industrial"],
  }),
];
