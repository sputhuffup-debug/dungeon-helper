import type { ReferenceList } from "@campaign-forge/module-sdk";

/**
 * Spaceship reference lists (Evolved Edition p. 121-127): ship classes,
 * internal modules, upgrades and armaments, with the escape-vehicle details
 * from p. 124-125. Numbers, names and prices are copied from the book; the
 * summaries are paraphrased. Ids are the values that
 * `alien.spaceship.fields.modules / upgrades / armaments` refer to. A ship
 * lists a module or upgrade id once per copy fitted.
 *
 * A ship's printed price is its class price plus its modules, upgrades,
 * armaments and munitions, with the AI module priced as the mainframe it
 * names (p. 92). Every ship on p. 128-137 adds up that way (tested).
 */

export type ModuleSize = "I" | "II" | "III" | "IV" | "V";
export const MODULE_SIZES: ModuleSize[] = ["I", "II", "III", "IV", "V"];

type SizeCount = Partial<Record<ModuleSize, number>>;

interface ClassRow {
  id: string;
  length: string;
  crew: string;
  /** null where the table prints "—" (no FTL). */
  ftl: number | null;
  signature: number;
  thrusters: number;
  hull: number;
  armaments: SizeCount;
  modules: SizeCount;
  cost: number;
}

const classRows: ClassRow[] = [
  { id: "C", length: "15 m", crew: "1–2", ftl: null, signature: -1, thrusters: 2, hull: 2, armaments: {}, modules: { II: 2, I: 4 }, cost: 2000000 },
  { id: "G", length: "50 m", crew: "3–6", ftl: 20, signature: 0, thrusters: 1, hull: 5, armaments: { II: 1, I: 2 }, modules: { III: 3, II: 5, I: 7 }, cost: 9000000 },
  { id: "J", length: "150 m", crew: "4–10", ftl: 16, signature: 0, thrusters: 1, hull: 6, armaments: { II: 2, I: 3 }, modules: { III: 4, II: 6, I: 8 }, cost: 20000000 },
  { id: "M", length: "300 m", crew: "6–12", ftl: 12, signature: 1, thrusters: 0, hull: 9, armaments: { III: 1, II: 2 }, modules: { IV: 4, III: 6, II: 8 }, cost: 28000000 },
  { id: "R", length: "700 m", crew: "12–18", ftl: 8, signature: 2, thrusters: -1, hull: 12, armaments: { III: 2, II: 4 }, modules: { V: 5, IV: 7, III: 9 }, cost: 400000000 },
  { id: "U", length: "1,200 m", crew: "15–20/2,000", ftl: 20, signature: 3, thrusters: -2, hull: 15, armaments: { III: 3, II: 6 }, modules: { V: 6, IV: 9, III: 12 }, cost: 1000000000 },
  { id: "X", length: "2,500 m", crew: "36–72/10,000", ftl: 24, signature: 5, thrusters: -3, hull: 20, armaments: { III: 5, I: 10 }, modules: { V: 8, IV: 12, III: 16 }, cost: 4000000000 },
];

const sizeList = (c: SizeCount): string =>
  MODULE_SIZES.slice()
    .reverse()
    .filter((s) => c[s])
    .map((s) => `${c[s]} × size ${s}`)
    .join(", ") || "—";

export const shipClasses: ReferenceList = {
  id: "alien.ship-classes",
  name: "Ship classes",
  page: 121,
  itemSchema: {
    type: "object",
    properties: {
      id: { type: "string" },
      name: { type: "string" },
      length: { type: "string" },
      crew: { type: "string" },
      ftl: { type: ["integer", "null"] },
      signature: { type: "integer" },
      thrusters: { type: "integer" },
      hull: { type: "integer" },
      armaments: { type: "object" },
      modules: { type: "object" },
      cost: { type: "number" },
    },
  },
  items: classRows.map((r) => ({
    ...r,
    name: `Class ${r.id}`,
    page: 121,
    summary: `${r.length}, crew ${r.crew}, hull ${r.hull}. Hardpoints: ${sizeList(r.armaments)}. Modules: ${sizeList(r.modules)}.`,
  })),
};

interface ModuleRow {
  id: string;
  /** Module name as the table prints it (shared by every size). */
  module: string;
  size: ModuleSize;
  capacity?: string;
  cost: number;
  costText?: string;
  summary: string;
  /** Escape vehicles (p. 124-125): occupants and length. */
  occupants?: string;
  craftLength?: string;
}

const AI = "Ship mainframe that can run the vessel while the crew sleeps; priced as the model fitted (p. 92).";
const SCRUB = "Life support that cleans the air and makes oxygen.";
const CARGO = "Internal hold with loading doors; bigger bays get H-frame cranes.";
const CRYO = "Cryo chambers for the crew.";
const GALLEY = "Kitchen, refrigeration and coffee maker.";
const HANGAR = "Lets smaller ships land inside, through airlocks.";
const VBAY = "Garage and loading ramp for ground vehicles.";

const moduleRows: ModuleRow[] = [
  { id: "artificial-intelligence-i", module: "Artificial Intelligence", size: "I", cost: 0, costText: "varies", summary: AI },
  { id: "air-scrubbers-i", module: "Air Scrubbers", size: "I", capacity: "Up to 10 people", cost: 50000, summary: SCRUB },
  { id: "air-scrubbers-ii", module: "Air Scrubbers", size: "II", capacity: "Up to 50 people", cost: 200000, summary: SCRUB },
  { id: "air-scrubbers-iii", module: "Air Scrubbers", size: "III", capacity: "Up to 500 people", cost: 1200000, summary: SCRUB },
  { id: "air-scrubbers-iv", module: "Air Scrubbers", size: "IV", capacity: "Up to 2,500 people", cost: 3000000, summary: SCRUB },
  { id: "cargo-bay-i", module: "Cargo Bay", size: "I", capacity: "500 kg", cost: 10000, summary: CARGO },
  { id: "cargo-bay-ii", module: "Cargo Bay", size: "II", capacity: "10 tons", cost: 25000, summary: CARGO },
  { id: "cargo-bay-iii", module: "Cargo Bay", size: "III", capacity: "250 tons", cost: 100000, summary: CARGO },
  { id: "cargo-bay-iv", module: "Cargo Bay", size: "IV", capacity: "5,000 tons", cost: 250000, summary: CARGO },
  { id: "cargo-bay-v", module: "Cargo Bay", size: "V", capacity: "100,000 tons", cost: 4000000, summary: CARGO },
  { id: "corporate-suite-ii", module: "Corporate Suite", size: "II", cost: 1000000, summary: "Luxury quarters for company brass; wet bar, safe, sometimes a private escape pod." },
  { id: "cryo-deck-i", module: "Cryo Deck", size: "I", capacity: "1 person", cost: 50000, summary: CRYO },
  { id: "cryo-deck-ii", module: "Cryo Deck", size: "II", capacity: "Up to 10 people", cost: 200000, summary: CRYO },
  { id: "cryo-deck-iii", module: "Cryo Deck", size: "III", capacity: "Up to 50 people", cost: 2000000, summary: CRYO },
  { id: "cryo-deck-iv", module: "Cryo Deck", size: "IV", capacity: "Up to 500 people", cost: 15000000, summary: CRYO },
  { id: "cryo-deck-v", module: "Cryo Deck", size: "V", capacity: "Up to 2,500 people", cost: 50000000, summary: CRYO },
  { id: "docking-umbilical-ii", module: "Docking Umbilical", size: "II", cost: 300000, summary: "Airlock and extending tunnel for docking with other ships; needed for the Dock action." },
  { id: "eev-i", module: "Emergency Escape Vehicle", size: "I", capacity: "Class A Ejection Pod", cost: 100000, occupants: "1", craftLength: "2 m", summary: "One-person space-only pod that holds its occupant in semi-stasis for up to a week." },
  { id: "eev-ii-type-20", module: "Emergency Escape Vehicle", size: "II", capacity: "Class B EEV Type 20 Series", cost: 250000, occupants: "2–4", craftLength: "6 m–8 m", summary: "Cramped box pod, no cryo, ten days of support; burns up on reentry." },
  { id: "eev-ii-type-337", module: "Emergency Escape Vehicle", size: "II", capacity: "Class C EEV Type 337 FTL", cost: 500000, occupants: "5", craftLength: "14 m", summary: "ICC-standard L-shaped EEV holding cryo capsules for decades; 1.4 parsec FTL and controlled landing." },
  { id: "eev-iii", module: "Emergency Escape Vehicle", size: "III", capacity: "Class D Lifeboat Module", cost: 1500000, occupants: "2–20", craftLength: "23 m", summary: "Configurable seven-room lifeboat that can land and fly in atmosphere; years of support." },
  { id: "galley-i", module: "Galley", size: "I", capacity: "1 person", cost: 20000, summary: GALLEY },
  { id: "galley-ii", module: "Galley", size: "II", capacity: "Up to 10 people", cost: 50000, summary: GALLEY },
  { id: "galley-iii", module: "Galley", size: "III", capacity: "Up to 50 people", cost: 125000, summary: GALLEY },
  { id: "galley-iv", module: "Galley", size: "IV", capacity: "Up to 500 people", cost: 500000, summary: GALLEY },
  { id: "galley-v", module: "Galley", size: "V", capacity: "Up to 2,500 people", cost: 3000000, summary: GALLEY },
  { id: "hangar-i", module: "Hangar", size: "I", capacity: "Class A Ship", cost: 100000, summary: HANGAR },
  { id: "hangar-ii", module: "Hangar", size: "II", capacity: "Class B Ship", cost: 250000, summary: HANGAR },
  { id: "hangar-iii", module: "Hangar", size: "III", capacity: "Class C–D Ship", cost: 400000, summary: HANGAR },
  { id: "hangar-iv", module: "Hangar", size: "IV", capacity: "Class E–G Ship", cost: 800000, summary: HANGAR },
  { id: "hangar-v", module: "Hangar", size: "V", capacity: "Class H–M Ship", cost: 1200000, summary: HANGAR },
  { id: "medlab-ii", module: "Medlab", size: "II", cost: 250000, summary: "Infirmary and lab with kits and drugs; where an AutoDoc or MedPod goes." },
  { id: "salvage-crane-iii", module: "Salvage Crane", size: "III", cost: 100000, summary: "Heavy crane for hauling wrecks and junk into the hold or onto the hitch." },
  { id: "science-lab-iii", module: "Science Lab", size: "III", cost: 750000, summary: "Advanced lab for specimens; +2 to OBSERVATION when using the Analysis talent." },
  { id: "tractor-hitch-iii", module: "Tractor Hitch", size: "III", cost: 600000, summary: "Tows external loads of over a million tons (refineries, processors); FTL rating doubles while towing." },
  { id: "vehicle-bay-i", module: "Vehicle Bay", size: "I", capacity: "ATV", cost: 75000, summary: VBAY },
  { id: "vehicle-bay-ii", module: "Vehicle Bay", size: "II", capacity: "VTOL Gyrocar", cost: 150000, summary: VBAY },
  { id: "vehicle-bay-iii", module: "Vehicle Bay", size: "III", capacity: "APC, Daihotai Tractor", cost: 250000, summary: VBAY },
  { id: "vehicle-bay-iv", module: "Vehicle Bay", size: "IV", capacity: "10 × APC", cost: 800000, summary: VBAY },
  { id: "vehicle-bay-v", module: "Vehicle Bay", size: "V", capacity: "100 × APC", cost: 5000000, summary: VBAY },
];

/** Escape vehicles appear on p. 124-125, every other module on p. 122-124. */
const modulePage = (r: ModuleRow): [number, number] => (r.module === "Emergency Escape Vehicle" ? [122, 125] : [122, 124]);

export const shipModules: ReferenceList = {
  id: "alien.ship-modules",
  name: "Ship modules",
  page: [122, 125],
  itemSchema: {
    type: "object",
    properties: {
      id: { type: "string" },
      name: { type: "string" },
      module: { type: "string" },
      size: { type: "string", enum: MODULE_SIZES },
      capacity: { type: "string" },
      cost: { type: "number" },
      costText: { type: "string" },
      summary: { type: "string" },
      occupants: { type: "string" },
      craftLength: { type: "string" },
    },
  },
  items: moduleRows.map((r) => ({ ...r, name: `${r.module} ${r.size}${r.id.startsWith("eev-ii-") ? ` (${r.capacity})` : ""}`, page: modulePage(r) })),
};

interface UpgradeRow {
  id: string;
  name: string;
  cost: number;
  /** How many times the upgrade may be bought; omitted when the book sets no limit. */
  maxPurchases?: number;
  summary: string;
}

const upgradeRows: UpgradeRow[] = [
  { id: "added-hardpoint-i", name: "Added Hardpoint, size I", cost: 1000000, maxPurchases: 2, summary: "One extra hardpoint, no bigger than the ship's largest. Two purchases at most." },
  { id: "added-hardpoint-ii", name: "Added Hardpoint, size II", cost: 4000000, maxPurchases: 2, summary: "One extra hardpoint, no bigger than the ship's largest. Two purchases at most." },
  { id: "added-hardpoint-iii", name: "Added Hardpoint, size III", cost: 10000000, maxPurchases: 2, summary: "One extra hardpoint, no bigger than the ship's largest. Two purchases at most." },
  { id: "armored-bulkheads", name: "Armored Bulkheads", cost: 2000000, maxPurchases: 3, summary: "Each purchase adds 1 armor level, to a maximum of 3. Unupgraded ships count as armor 1 against personal weapons." },
  { id: "boosted-displacement-drives", name: "Boosted Displacement Drives", cost: 1400000, maxPurchases: 6, summary: "FTL rating one step lower (faster) per purchase." },
  { id: "enhanced-sensors", name: "Enhanced Sensors", cost: 2200000, maxPurchases: 2, summary: "+1 die to the target lock action per purchase." },
  { id: "external-module-i", name: "External Module, size I", cost: 100000, maxPurchases: 2, summary: "Outside fittings for one more module (bought separately), no bigger than the largest aboard; -1 Thrusters each." },
  { id: "external-module-ii", name: "External Module, size II", cost: 500000, maxPurchases: 2, summary: "Outside fittings for one more module (bought separately), no bigger than the largest aboard; -1 Thrusters each." },
  { id: "external-module-iii", name: "External Module, size III", cost: 1000000, maxPurchases: 2, summary: "Outside fittings for one more module (bought separately), no bigger than the largest aboard; -1 Thrusters each." },
  { id: "external-module-iv", name: "External Module, size IV", cost: 4000000, maxPurchases: 2, summary: "Outside fittings for one more module (bought separately), no bigger than the largest aboard; -1 Thrusters each." },
  { id: "external-module-v", name: "External Module, size V", cost: 10000000, maxPurchases: 2, summary: "Outside fittings for one more module (bought separately), no bigger than the largest aboard; -1 Thrusters each." },
  { id: "overpowered-thrusters", name: "Overpowered Thrusters", cost: 1500000, maxPurchases: 2, summary: "+1 Thrusters per purchase." },
  { id: "planetfall-capacity", name: "Planetfall Capacity", cost: 1800000, summary: "The ship can enter atmosphere and land (p. 109)." },
  { id: "reinforced-frame", name: "Reinforced Frame", cost: 1200000, maxPurchases: 3, summary: "+1 Hull per purchase." },
  { id: "stealth-technology", name: "Stealth Technology", cost: 50000000, summary: "Run dark without shutting down engines or sensors (p. 141); Signature -2." },
];

export const shipUpgrades: ReferenceList = {
  id: "alien.ship-upgrades",
  name: "Ship upgrades",
  page: 127,
  itemSchema: {
    type: "object",
    properties: {
      id: { type: "string" },
      name: { type: "string" },
      cost: { type: "number" },
      maxPurchases: { type: "integer", minimum: 1 },
      summary: { type: "string" },
    },
  },
  items: upgradeRows.map((r) => ({ ...r, page: 127 })),
};

export type ShipRange = "contact" | "short" | "medium" | "long" | "extreme" | "surface";
/** Space combat range categories (p. 140); tactical nukes list "Surface" (p. 125). */
export const SHIP_RANGES: ShipRange[] = ["contact", "short", "medium", "long", "extreme", "surface"];

interface ArmamentRow {
  id: string;
  name: string;
  kind: "offensive" | "defensive";
  /** Modifier; omitted where the table prints "N/A" (tactical nuke). "–" is 0. */
  bonus?: number;
  damage?: number;
  range?: ShipRange;
  hardpoint: ModuleSize;
  cost: number;
  /** Price of one missile or mine, bought separately. */
  munitionCost?: number;
  /** Munitions one battery typically holds (p. 124, 126). */
  magazine?: number;
  /** True when the listed price is per munition (orbital mines; the Conestoga's total only adds up that way). */
  costPerMunition?: boolean;
  special?: string[];
  summary: string;
}

const PB = "Damage reduced over range";
const armamentRows: ArmamentRow[] = [
  { id: "short-lance-asat-missile", name: "Short Lance ASAT Missile", kind: "offensive", bonus: 1, damage: 3, range: "long", hardpoint: "II", cost: 12000000, munitionCost: 100000, magazine: 8, special: ["Missile cost: $100,000"], summary: "Guided anti-ship missile; slow enough to be shot down or decoyed. Missiles sold separately." },
  { id: "long-lance-asat-missile", name: "Long Lance ASAT Missile", kind: "offensive", bonus: 1, damage: 4, range: "extreme", hardpoint: "III", cost: 25000000, munitionCost: 400000, magazine: 8, special: ["Missile cost: $400,000"], summary: "Main armament of military frigates. Missiles sold separately." },
  { id: "light-railgun-turret", name: "Light Railgun Turret", kind: "offensive", bonus: 0, damage: 3, range: "short", hardpoint: "I", cost: 1500000, special: ["Armor piercing"], summary: "Close-defense gun firing heavy rounds; inaccurate but deadly up close." },
  { id: "medium-railgun-turret", name: "Medium Railgun Turret", kind: "offensive", bonus: 0, damage: 4, range: "short", hardpoint: "II", cost: 8500000, special: ["Armor piercing"], summary: "Close-defense gun firing heavy rounds; inaccurate but deadly up close." },
  { id: "heavy-railgun-turret", name: "Heavy Railgun Turret", kind: "offensive", bonus: 0, damage: 5, range: "short", hardpoint: "III", cost: 20000000, special: ["Armor piercing"], summary: "Close-defense gun firing heavy rounds; inaccurate but deadly up close." },
  { id: "particle-beam-400mev", name: "400MeV Particle Beam Weapon", kind: "offensive", bonus: 2, damage: 4, range: "long", hardpoint: "II", cost: 12000000, special: [PB], summary: "Ignores countermeasures; -1 damage per range category past Contact; component damage only, no Hull damage." },
  { id: "particle-beam-800mev", name: "800MeV Particle Beam Weapon", kind: "offensive", bonus: 2, damage: 5, range: "extreme", hardpoint: "III", cost: 30000000, special: [PB], summary: "Ignores countermeasures; -1 damage per range category past Contact; component damage only, no Hull damage." },
  { id: "orbital-mines", name: "Orbital Mines", kind: "offensive", bonus: 2, damage: 2, range: "contact", hardpoint: "II", cost: 10000, munitionCost: 10000, costPerMunition: true, summary: "Cheap short-range defense against boarders; mines bought individually." },
  { id: "tactical-nuke", name: "Tactical Nuke", kind: "offensive", range: "surface", hardpoint: "III", cost: 50000000, munitionCost: 1000000, magazine: 5, special: ["Missile cost: $1,000,000"], summary: "Orbit-to-surface warhead that flattens a colony; its high burst also causes EMP. Missiles sold separately." },
  { id: "sensor-decoys", name: "Sensor Decoys", kind: "defensive", bonus: 0, hardpoint: "I", cost: 1200000, summary: "False radar returns that confuse weapons." },
  { id: "sensor-drones", name: "Sensor Drones", kind: "defensive", bonus: 1, hardpoint: "II", cost: 3600000, summary: "Fast decoy drones that draw off missiles and railgun targeting." },
  { id: "ciws-laser-array", name: "CIWS Laser Array", kind: "defensive", bonus: 2, hardpoint: "III", cost: 45000000, summary: "Close-in laser array that shoots down missiles and even railgun rounds." },
];

export const shipArmaments: ReferenceList = {
  id: "alien.ship-armaments",
  name: "Ship armaments",
  page: [124, 126],
  itemSchema: {
    type: "object",
    properties: {
      id: { type: "string" },
      name: { type: "string" },
      kind: { type: "string", enum: ["offensive", "defensive"] },
      bonus: { type: "integer" },
      damage: { type: "integer" },
      range: { type: "string", enum: SHIP_RANGES },
      hardpoint: { type: "string", enum: MODULE_SIZES },
      cost: { type: "number" },
      munitionCost: { type: "number" },
      magazine: { type: "integer" },
      costPerMunition: { type: "boolean" },
      special: { type: "array", items: { type: "string" } },
    },
  },
  items: armamentRows.map((r) => ({ ...r, page: 125 })),
};

export const shipReferenceLists: ReferenceList[] = [shipClasses, shipModules, shipUpgrades, shipArmaments];

export const SHIP_MODULE_IDS: string[] = moduleRows.map((r) => r.id);
export const SHIP_UPGRADE_IDS: string[] = upgradeRows.map((r) => r.id);
export const SHIP_ARMAMENT_IDS: string[] = armamentRows.map((r) => r.id);
