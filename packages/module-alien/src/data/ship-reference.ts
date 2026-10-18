import type { ReferenceList } from "@campaign-forge/module-sdk";

/**
 * Spaceship reference lists (Evolved Edition p. 121-137): hull classes,
 * internal modules, upgrades and armaments. Ids are kebab-case and are the
 * values `alien.spaceship.fields.modules / upgrades / armaments` refer to.
 * Costs are in dollars. All rows are from general knowledge and `unverified`.
 */

export const shipClasses: ReferenceList = {
  id: "alien.ship-classes",
  name: "Ship classes",
  page: 121,
  unverified: true,
  items: [
    { id: "C", name: "Class C: Commercial", summary: "Civilian freighters, haulers, tugs and transports; the backbone of frontier trade." },
    { id: "G", name: "Class G: Government", summary: "Colonial Administration and customs vessels: cutters, inspection ships, courier boats." },
    { id: "J", name: "Class J: Jump-capable long-haul", summary: "Deep-space vessels built for years-long voyages: colony ships, far-reach explorers." },
    { id: "M", name: "Class M: Military", summary: "Warships and troop transports of the USCMC, 3WE and UPP fleets." },
    { id: "R", name: "Class R: Research", summary: "Survey and science vessels, often company-owned with sealed orders." },
    { id: "U", name: "Class U: Utility", summary: "Tugs, tenders, salvage rigs and refuelling craft; slow and tough." },
    { id: "X", name: "Class X: Experimental", summary: "Prototypes and one-off hulls; unknown capabilities and no spare parts." },
  ],
};

interface ModuleRow {
  id: string;
  name: string;
  cost: number;
  summary: string;
}

const moduleRows: ModuleRow[] = [
  { id: "airlock", name: "Airlock", cost: 50000, summary: "Standard EVA airlock with suit storage." },
  { id: "armory", name: "Armory", cost: 100000, summary: "Secure weapons locker; required to store military ordnance legally." },
  { id: "bridge-backup", name: "Auxiliary Bridge", cost: 300000, summary: "Second control room; the ship can be flown if the bridge is lost." },
  { id: "brig", name: "Brig", cost: 50000, summary: "Holding cells and restraints." },
  { id: "cargo-bay", name: "Cargo Bay", cost: 100000, summary: "Holds one cargo unit per module; loader rails and clamps." },
  { id: "cargo-bay-refrigerated", name: "Refrigerated Cargo Bay", cost: 200000, summary: "Cold storage for perishables and specimens." },
  { id: "cryo-deck", name: "Cryo Deck", cost: 200000, summary: "Hypersleep pods for the crew; one deck holds up to ten." },
  { id: "crew-quarters", name: "Crew Quarters", cost: 80000, summary: "Bunks, lockers and a shared head for up to six." },
  { id: "docking-clamp", name: "Docking Clamp", cost: 150000, summary: "Hard-dock connector for towing or mating with another hull." },
  { id: "drop-pods", name: "Drop Pod Bay", cost: 400000, summary: "Single-use re-entry pods for a squad." },
  { id: "escape-pods", name: "Escape Pods", cost: 200000, summary: "Lifeboats for the whole crew; range of a few light-days." },
  { id: "galley", name: "Galley and Mess", cost: 60000, summary: "Kitchen and mess hall; a hot meal counts as rest." },
  { id: "hangar-bay", name: "Hangar Bay", cost: 500000, summary: "Houses a shuttle or dropship with maintenance space." },
  { id: "hydroponics", name: "Hydroponics", cost: 150000, summary: "Grows food and scrubs air for long voyages." },
  { id: "laboratory", name: "Laboratory", cost: 300000, summary: "General science lab; +2 to analysis rolls aboard." },
  { id: "bio-lab", name: "Bio-Containment Lab", cost: 800000, summary: "Sealed specimen lab with isolation cells." },
  { id: "medbay", name: "Medbay", cost: 250000, summary: "Surgery, automed and a few beds; required for treating critical injuries aboard." },
  { id: "mining-rig", name: "Mining Rig", cost: 600000, summary: "Drills, crushers and ore handling for asteroid work." },
  { id: "observation-deck", name: "Observation Deck", cost: 70000, summary: "Windows and lounge; reduces stress during rest." },
  { id: "passenger-cabins", name: "Passenger Cabins", cost: 120000, summary: "Private cabins for paying passengers." },
  { id: "passenger-seating", name: "Passenger Seating", cost: 40000, summary: "Acceleration couches for short hops; no privacy." },
  { id: "recreation-room", name: "Recreation Room", cost: 60000, summary: "Games, screens and a bar; socializing on board." },
  { id: "refinery", name: "Ore Refinery", cost: 1000000, summary: "Processes raw ore in transit; makes the ship a target." },
  { id: "science-sensors", name: "Science Sensor Array", cost: 400000, summary: "Survey-grade sensors for mapping worlds and scanning anomalies." },
  { id: "shuttle-bay", name: "Shuttle Bay", cost: 300000, summary: "Berth for a small shuttle or lifeboat." },
  { id: "stasis-pods", name: "Stasis Pods", cost: 350000, summary: "Medical stasis for injured crew or live specimens." },
  { id: "vehicle-bay", name: "Vehicle Bay", cost: 250000, summary: "Garage for ground vehicles with a ramp." },
  { id: "workshop", name: "Workshop", cost: 150000, summary: "Machine tools and spares; +2 to repair rolls aboard." },
  { id: "fuel-tanks", name: "Extended Fuel Tanks", cost: 200000, summary: "Doubles range between refuelling." },
  { id: "tow-rig", name: "Towing Rig", cost: 500000, summary: "Heavy tow cables and reinforced frame for hauling refineries and derelicts." },
];

export const shipModules: ReferenceList = {
  id: "alien.ship-modules",
  name: "Ship modules",
  page: [128, 131],
  unverified: true,
  itemSchema: {
    type: "object",
    properties: { id: { type: "string" }, name: { type: "string" }, cost: { type: "number" }, summary: { type: "string" } },
  },
  items: moduleRows.map((r) => ({ ...r, page: [128, 131] as [number, number] })),
};

const upgradeRows: ModuleRow[] = [
  { id: "advanced-ai", name: "Advanced AI (MU/TH/UR class)", cost: 2000000, summary: "Ship's computer can run the vessel unattended and advise the crew." },
  { id: "armor-plating", name: "Armor Plating", cost: 500000, summary: "+2 armor; -1 maneuverability." },
  { id: "reinforced-hull", name: "Reinforced Hull", cost: 800000, summary: "+2 hull." },
  { id: "improved-thrusters", name: "Improved Thrusters", cost: 600000, summary: "+1 thrusters." },
  { id: "backup-reactor", name: "Backup Reactor", cost: 400000, summary: "Power is restored a round after a reactor hit." },
  { id: "long-range-sensors", name: "Long-Range Sensors", cost: 300000, summary: "+2 to detect ships and bodies at long range." },
  { id: "ecm-suite", name: "ECM Suite", cost: 500000, summary: "Jams enemy sensors and guided weapons; -2 to lock on." },
  { id: "stealth-coating", name: "Stealth Coating", cost: 1500000, summary: "-2 signature." },
  { id: "emergency-bulkheads", name: "Emergency Bulkheads", cost: 200000, summary: "Seals a breached module automatically." },
  { id: "autopilot", name: "Autopilot", cost: 150000, summary: "Flies a plotted course without a pilot; cannot evade." },
  { id: "comms-array", name: "Comms Array", cost: 250000, summary: "Long-range communications; days faster than a standard set." },
  { id: "docking-tube", name: "Docking Tube", cost: 100000, summary: "Flexible boarding tube for ship-to-ship transfer." },
  { id: "cargo-lift", name: "Cargo Lift", cost: 120000, summary: "Loads and unloads cargo without a dock." },
  { id: "point-defense-controls", name: "Point Defense Controls", cost: 300000, summary: "Allows point-defense fire against missiles each round." },
  { id: "hardened-electronics", name: "Hardened Electronics", cost: 350000, summary: "Immune to EMP and radiation storms." },
];

export const shipUpgrades: ReferenceList = {
  id: "alien.ship-upgrades",
  name: "Ship upgrades",
  page: [131, 133],
  unverified: true,
  items: upgradeRows.map((r) => ({ ...r, page: [131, 133] as [number, number] })),
};

interface ArmamentRow {
  id: string;
  name: string;
  damage: number;
  range: "short" | "medium" | "long" | "extreme";
  cost: number;
  summary: string;
}

const armamentRows: ArmamentRow[] = [
  { id: "point-defense-cannon", name: "Point Defense Cannon", damage: 1, range: "short", cost: 400000, summary: "Rapid-fire autocannon; shoots down missiles and small craft." },
  { id: "flak-battery", name: "Flak Battery", damage: 1, range: "medium", cost: 500000, summary: "Burst-fire shells against fighters and boarding pods." },
  { id: "autocannon-turret", name: "Autocannon Turret", damage: 2, range: "medium", cost: 700000, summary: "Standard corporate security armament." },
  { id: "railgun", name: "Railgun", damage: 3, range: "long", cost: 1500000, summary: "Kinetic slug; armor piercing." },
  { id: "laser-cannon", name: "Laser Cannon", damage: 2, range: "long", cost: 1200000, summary: "Energy weapon with no ammunition." },
  { id: "gauss-cannon", name: "Gauss Cannon", damage: 4, range: "long", cost: 3000000, summary: "Heavy kinetic weapon mounted on warships." },
  { id: "missile-battery", name: "Missile Battery", damage: 3, range: "extreme", cost: 2000000, summary: "Guided missiles; limited supply." },
  { id: "torpedo-tubes", name: "Torpedo Tubes", damage: 5, range: "extreme", cost: 4000000, summary: "Ship-killers; two per salvo." },
  { id: "nuclear-missile", name: "Nuclear Missile", damage: 10, range: "extreme", cost: 10000000, summary: "Destroys anything short of a capital ship; a war crime in civilian hands." },
  { id: "plasma-cannon", name: "Plasma Cannon", damage: 4, range: "medium", cost: 3500000, summary: "Military energy cannon; burns through armor." },
  { id: "mining-laser", name: "Mining Laser (weaponized)", damage: 2, range: "short", cost: 300000, summary: "Industrial cutter aimed at a hull." },
  { id: "mass-driver", name: "Mass Driver", damage: 3, range: "medium", cost: 900000, summary: "Throws ore or scrap; an improvised weapon on haulers and tugs." },
];

export const shipArmaments: ReferenceList = {
  id: "alien.ship-armaments",
  name: "Ship armaments",
  page: [134, 135],
  unverified: true,
  itemSchema: {
    type: "object",
    properties: {
      id: { type: "string" },
      name: { type: "string" },
      damage: { type: "number" },
      range: { type: "string", enum: ["short", "medium", "long", "extreme"] },
      cost: { type: "number" },
    },
  },
  items: armamentRows.map((r) => ({ ...r, page: [134, 135] as [number, number] })),
};

export const shipReferenceLists: ReferenceList[] = [shipClasses, shipModules, shipUpgrades, shipArmaments];

export const SHIP_MODULE_IDS: string[] = moduleRows.map((r) => r.id);
export const SHIP_UPGRADE_IDS: string[] = upgradeRows.map((r) => r.id);
export const SHIP_ARMAMENT_IDS: string[] = armamentRows.map((r) => r.id);
