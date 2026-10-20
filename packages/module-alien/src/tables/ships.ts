/**
 * Spaceship tables: minor component damage (D66, p. 145), major component
 * damage (2D6, p. 146) and Neurological Distortion Disorder for anyone awake
 * during FTL travel (D6, +1 per roll after the first, p. 109). Checked
 * against the book: ranges, names and repair rolls are exact; effects are
 * paraphrased.
 *
 * Each damage row's result carries `severity`, the damage `name`, a short
 * `effect`, the `repair` rolls as counts per skill (Heavy Machinery,
 * Comtech; none for damage that cannot be repaired) and, where it matters
 * for travel or the ship card, the `system` it hits.
 */
import type { RollTable } from "@campaign-forge/module-sdk";
import { ranges, type RangeSpec } from "./_helpers";

const FAMILY = "ship";

export const MINOR_DAMAGE_TABLE = "alien.ship.minor-damage";
export const MAJOR_DAMAGE_TABLE = "alien.ship.major-damage";
export const NDD_TABLE = "alien.travel.ndd";

/** Repair rolls for one component: how many of each skill roll, one per shift (p. 147). */
export interface RepairRolls {
  heavyMachinery: number;
  comtech: number;
}

const HM = (n = 1): RepairRolls => ({ heavyMachinery: n, comtech: 0 });
const CT = (n = 1): RepairRolls => ({ heavyMachinery: 0, comtech: n });
const BOTH = (hm: number, ct: number): RepairRolls => ({ heavyMachinery: hm, comtech: ct });

function damage(severity: "minor" | "major", lo: number, hi: number, name: string, effect: string, repair: RepairRolls | null, system?: string): RangeSpec {
  return [lo, hi, name, { severity, name, effect, repair, ...(system ? { system } : {}) }];
}

const m = (lo: number, hi: number, name: string, effect: string, repair: RepairRolls | null, system?: string) => damage("minor", lo, hi, name, effect, repair, system);
const M = (lo: number, hi: number, name: string, effect: string, repair: RepairRolls | null, system?: string) => damage("major", lo, hi, name, effect, repair, system);

export const minorComponentDamage: RollTable = {
  id: MINOR_DAMAGE_TABLE,
  name: "Minor component damage",
  page: 145,
  dice: "d66",
  family: FAMILY,
  notes: "A single hit of at least 1 but under half the Hull rating (rounded up). Re-roll results that do not apply to the ship. Each listed repair roll takes a shift and a spare part (p. 147).",
  rows: ranges([
    m(11, 11, "A.I. Malfunction", "Reaching the ship's AI takes a Comtech roll.", CT(), "ai"),
    m(12, 12, "Air Scrubbers Offline", "Stamina rolls at −2 dice for a shift, then the air runs out.", HM(), "air-scrubbers"),
    m(13, 13, "Airlock Malfunction", "The main airlock is out of use.", HM(), "airlock"),
    m(14, 15, "Armament Malfunction", "One random armament attacks at −2.", HM(), "armament"),
    m(16, 16, "Artificial Gravity Malfunction", "Zero gravity throughout the ship (p. 76).", BOTH(1, 1), "gravity"),
    m(21, 21, "AutoDoc Offline", "The medical facilities are unusable.", HM(), "medical"),
    m(22, 23, "Cargo Damage", "One random item in a cargo hold is lost.", null, "cargo"),
    m(24, 24, "Coffee Maker Malfunction", "No coffee from the galley.", HM(), "galley"),
    m(25, 25, "Comms Malfunction", "No external communications.", CT(), "comms"),
    m(26, 31, "Compartmental Decompression", "A random compartment loses pressure at once (p. 75).", HM(), "hull"),
    m(32, 33, "Crew Injury", "A random crew member takes an attack of six base dice at base damage 1.", null),
    m(34, 34, "Cryo Chambers Offline", "Nobody can use the cryo chambers.", BOTH(1, 1), "cryo"),
    m(35, 35, "Displacement Drive Malfunction", "The FTL rating is halved.", BOTH(1, 1), "ftl-drive"),
    m(36, 36, "Docking Station Damaged", "No docking with other vessels.", HM(), "docking"),
    m(41, 41, "Escape Pod Malfunction", "One EEV is out of action.", HM(), "eev"),
    m(42, 42, "Hangar Damage", "A random craft in the hangar is disabled.", HM(), "hangar"),
    m(43, 44, "Instrument Malfunction", "Piloting, Ranged Combat and Comtech rolls aboard at −1 die.", CT(), "instruments"),
    m(45, 45, "Intercoms Disabled", "No internal communications.", CT(), "intercom"),
    m(46, 46, "Ladderway Damaged", "Moving between decks takes a Mobility roll.", HM(), "ladderway"),
    m(51, 51, "Life Support Offline", "Anyone without a pressure suit rolls Stamina each shift or becomes fatigued by heat or cold.", HM(), "life-support"),
    m(52, 52, "Navigation System Offline", "Plotting FTL travel takes a Comtech roll at −2 dice.", CT(), "navigation"),
    m(53, 54, "Reactor Leak", "Weak radiation (1 rad per shift) around reactor control.", HM(), "reactor"),
    m(55, 55, "Refrigeration Unit Damaged", "Chilled food aboard spoils after a day.", HM(), "refrigeration"),
    m(56, 61, "Sensor Malfunction", "Comtech rolls with the ship's sensors at −2 dice.", CT(), "sensors"),
    m(62, 64, "Thruster Damage", "Thrusters rating −2.", HM(), "thrusters"),
    m(65, 65, "Transponder Offline", "The transponder goes silent.", CT(), "transponder"),
    m(66, 66, "Waste Disposal Malfunction", "The ship is about to smell very bad.", HM(), "waste"),
  ]),
};

export const majorComponentDamage: RollTable = {
  id: MAJOR_DAMAGE_TABLE,
  name: "Major component damage",
  page: 146,
  dice: "2d6",
  family: FAMILY,
  notes: "A single hit of half the Hull rating (rounded up) or more, but under the full Hull rating. A hit of the full Hull destroys the ship. Chain Reaction: roll twice more on this table.",
  rows: ranges([
    M(2, 2, "A.I. Offline", "The ship's AI is down.", CT(3), "ai"),
    M(3, 3, "Escape Pods Heavily Damaged", "None of the EEVs can launch.", BOTH(1, 1), "eev"),
    M(4, 4, "Sensor Failure", "The sensors are dead.", CT(2), "sensors"),
    M(5, 5, "Displacement Drive Failure", "FTL travel is impossible.", BOTH(1, 2), "ftl-drive"),
    M(6, 6, "Armament Damaged", "One random armament is unusable.", BOTH(1, 1), "armament"),
    M(7, 7, "Engine Failure", "Dead in space: no movement-phase actions.", BOTH(2, 1), "engine"),
    M(8, 8, "Critical Crew Injury", "A random crew member is broken.", null),
    M(9, 9, "Bridge Exposed To Vacuum", "The ship cannot be steered and everyone on the bridge suffers explosive decompression.", BOTH(2, 1), "bridge"),
    M(10, 10, "Reactor Breach", "All propulsion lost; strong radiation (1 rad per stretch) at reactor control, weak radiation everywhere else.", BOTH(2, 1), "reactor"),
    [11, 11, "Chain Reaction", { severity: "major", name: "Chain Reaction", effect: "Roll twice more on this table.", repair: null, rollTwice: true }],
    M(12, 12, "Reactor Detonation", "The ship and everyone aboard are lost.", null, "reactor"),
  ]),
};

export const nddTable: RollTable = {
  id: NDD_TABLE,
  name: "Neurological Distortion Disorder",
  page: 109,
  dice: "1d6",
  family: "travel",
  modifiers: [{ add: { var: ["previousRolls", 0] }, label: "+1 for each earlier roll this trip" }],
  notes: "Anyone awake during FTL travel rolls D6 after each period of days equal to the ship's FTL rating; each roll after the first adds +1 more than the last. Hypersleep gives full protection (p. 110).",
  rows: ranges([
    [-99, 5, "No Effect", { ndd: "none", effect: "Nothing, for now." }],
    [6, 7, "Paranoia", { ndd: "paranoia", effect: "Sure that someone or something aboard means them harm, until the FTL trip ends." }],
    [8, 9, "Epilepsy", { ndd: "epilepsy", effect: "Seizures disable them for a stretch; roll a stress die each shift and a facehugger means a seizure." }],
    [10, 11, "Dementia", { ndd: "dementia", effect: "Cannot recall who they or the others are, until D6 days after the trip ends." }],
    [12, 99, "Psychosis", { ndd: "psychosis", effect: "Attacks the nearest person or creature until one of them is broken; friendly PCs who see it make a panic roll." }],
  ]),
};

export const shipTables: RollTable[] = [minorComponentDamage, majorComponentDamage];
export const travelTables: RollTable[] = [nddTable];
