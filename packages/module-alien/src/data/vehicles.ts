import type { AlienPreset } from "./types";

/**
 * Vehicle stat blocks (Evolved Edition p. 100-105, table on p. 313).
 * Stat lines are copied from the book; summaries are paraphrased.
 * `weapons` use the book's names; the weapons' stats are the `weapon:vehicle`
 * item presets in ./items.ts (p. 313).
 */

interface VehicleSpec {
  id: string;
  name: string;
  summary: string;
  page: number;
  encountered: string;
  length: string;
  passengers: number;
  maneuverability: number;
  speed: number;
  hull: number;
  armor: number;
  armorNote?: string;
  weapons: string[];
  cost: number;
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
  };
}

export const vehiclePresets: AlienPreset[] = [
  vehicle({
    id: "weyland-nr-9-atv",
    name: "Weyland NR-9 Series All Terrain Vehicle",
    summary: "Century-old two-seat tracked ATV under a roll cage; tough and reliable.",
    page: 100,
    encountered: "Frontier colonies",
    length: "3.2 m",
    passengers: 1,
    maneuverability: 2,
    speed: 2,
    hull: 2,
    armor: 1,
    armorNote: "Driver and passenger are exposed: they can be targeted separately and get no protection from the armor.",
    weapons: [],
    cost: 3000,
    tags: ["civilian", "ground"],
  }),
  vehicle({
    id: "daihotai-tractor",
    name: "Daihotai Series 8×8 Tractor",
    summary: "Pressurized eight-wheel colony workhorse; takes dozer blades, drills, cranes and trailers.",
    page: 101,
    encountered: "Frontier colonies",
    length: "6.6 m",
    passengers: 4,
    maneuverability: 0,
    speed: 2,
    hull: 6,
    armor: 3,
    weapons: [],
    cost: 17000,
    tags: ["civilian", "ground"],
  }),
  vehicle({
    id: "m577-apc",
    name: "M570 Series Armored Personnel Carrier",
    summary: "USCMC squad carrier with a tactical command center; the M577 is the standard model (the p. 313 table calls it the M577 APC).",
    page: 102,
    encountered: "USCMC battlefields and military bases across the Frontier and Outer Rim",
    length: "9.2 m",
    passengers: 13,
    maneuverability: 1,
    speed: 3,
    hull: 8,
    armor: 5,
    weapons: ["Phased Plasma Pulse Cannon Turret", "20 mm Gatling Gun Turret"],
    cost: 500000,
    tags: ["military", "ground"],
  }),
  vehicle({
    id: "aerodyne-gyrocar",
    name: "Aerodyne Light VTOL Automotive Gyrocar",
    summary: "Fusion-powered car that drives or hovers; high upkeep, so rare outside civilized worlds.",
    page: 103,
    encountered: "Densely populated Core and Outer Veil colonies",
    length: "5.2 m",
    passengers: 5,
    maneuverability: 3,
    speed: 3,
    hull: 4,
    armor: 1,
    weapons: [],
    cost: 40000,
    tags: ["civilian", "aircraft"],
  }),
  vehicle({
    id: "ud-4l-cheyenne-dropship",
    name: "UD-4 Cheyenne Series VTOL Tactical Dropship",
    summary: "USCMC orbital dropship and gunship that delivers an APC and its squad. The p. 313 table calls it the UD-4L.",
    page: 104,
    encountered: "USCMC battlefields and military bases across the Frontier and Outer Rim; some are in mercenary hands",
    length: "25.2 m",
    passengers: 15,
    maneuverability: 2,
    speed: 4,
    hull: 10,
    armor: 4,
    weapons: [
      "25 mm Gatling Gun",
      "Mk.16 150 mm Banshee 70 Unguided Rocket Launcher",
      "7 × AGM-220C Hellhound II Tactical Missiles",
      "3 × AIM-90E Headlock Air-to-Air Missiles",
    ],
    cost: 3100000,
    tags: ["military", "aircraft"],
  }),
  vehicle({
    id: "wy-37b-cargo-lifter",
    name: "Weyland-Yutani WY-37B Cargo Lifter Transport Sled",
    summary: "Flatbed flying sled with a crane and vacuum-rated cab; can make low-orbit cargo transfers.",
    page: 105,
    encountered: "Frontier colonies, starfreighters, and large space stations",
    length: "34.2 m",
    passengers: 3,
    maneuverability: -1,
    speed: 3,
    hull: 12,
    armor: 2,
    weapons: [],
    cost: 800000,
    tags: ["civilian", "aircraft"],
  }),
];
