/**
 * Job Generator tables (p. 244-252), checked against the book. One pipeline
 * per campaign frame: employer or sponsor (with nested sub-tables where the
 * book has them), bonus rewards, cargo or mission, destination and
 * complications, plus the shared plot twist table. Colonial Marines have no
 * employer table: their orders come from Marine Corps HQ (p. 235).
 *
 * Labels are the book's; descriptions are paraphrased.
 *
 * Known data gap: the Expedition sponsors major corporation sub-table
 * (p. 250) lists 11-43 only. Rows 44-66 are a module decision, filled from
 * the Cargo Run major corporation list (p. 244), and stay `unverified`.
 */
import type { RollTable, TableRow } from "@campaign-forge/module-sdk";
import { d6, ranges, row, type RangeSpec, type TableSpec } from "./_helpers";

const FAMILY = "jobs";

/** A table checked against the book: no `unverified` flag. */
const table = (spec: TableSpec): RollTable => ({ ...spec });

type FactionType = "corporation" | "government" | "military" | "colonial" | "other";
const who = (name: string, factionType: FactionType, extra: Record<string, unknown> = {}) => ({ name, factionType, ...extra });

/** Rows of [lo, hi, label, description] stored under `key` (the label) plus `description`. */
function described(key: string, specs: Array<[number, number, string, string]>): TableRow[] {
  return ranges(specs.map(([lo, hi, label, description]): RangeSpec => [lo, hi, label, { [key]: label, description }]));
}

// ---------------------------------------------------------------------------
// Shared sub-tables
// ---------------------------------------------------------------------------

export const shipType: RollTable = table({
  id: "alien.jobs.ship-type",
  name: "Starship type",
  family: FAMILY,
  page: 246,
  dice: "1d6",
  notes: "Used by the Cargo Run Starship destination (p. 246) and the Expedition Wreckage destination (p. 251).",
  rows: ranges([
    [1, 1, "M-Class Starfreighter", { ship: "M-Class Starfreighter" }],
    [2, 2, "G-Class Deep Space Salvage Vessel", { ship: "G-Class Deep Space Salvage Vessel" }],
    [3, 3, "M-Class Commercial Towing Vehicle", { ship: "M-Class Commercial Towing Vehicle" }],
    [4, 4, "M-Class Commercial Transport Ship", { ship: "M-Class Commercial Transport Ship" }],
    [5, 6, "Other type of vessel", { ship: "Other type of vessel" }],
  ]),
});

// ---------------------------------------------------------------------------
// Space Truckers: Cargo Runs (p. 244-246)
// ---------------------------------------------------------------------------

export const truckersEmployerMining: RollTable = table({
  id: "alien.jobs.truckers.employer.mining",
  name: "Cargo Run employer: mining corporation",
  family: FAMILY,
  page: 244,
  dice: "1d6",
  rows: ranges([
    [1, 2, "Chigusa", who("Chigusa", "corporation")],
    [3, 3, "Weyland-Yutani", who("Weyland-Yutani", "corporation")],
    [4, 4, "Gorham", who("Gorham", "corporation")],
    [5, 5, "Kelland Mining", who("Kelland Mining", "corporation")],
    [6, 6, "Farside Mining", who("Farside Mining", "corporation")],
  ]),
});

/** The major corporation list of the Cargo Run employer table (p. 244). */
const MAJOR_CORPORATIONS: Array<[number, number, string]> = [
  [11, 13, "Alphatech"],
  [14, 16, "Chigusa"],
  [21, 23, "Gemba"],
  [24, 26, "Jĭngtì Lóng"],
  [31, 33, "Lorenz"],
  [34, 36, "Lockmart"],
  [41, 43, "Seegson"],
  [44, 46, "Lasalle Bionational"],
  [51, 53, "Gemini Exoplanet"],
  [54, 66, "Weyland-Yutani"],
];

export const truckersEmployerCorporation: RollTable = table({
  id: "alien.jobs.truckers.employer.corporation",
  name: "Cargo Run employer: major corporation",
  family: FAMILY,
  page: 244,
  dice: "d66",
  rows: ranges(MAJOR_CORPORATIONS.map(([lo, hi, name]): RangeSpec => [lo, hi, name, who(name, "corporation")])),
});

export const truckersEmployer: RollTable = table({
  id: "alien.jobs.truckers.employer",
  name: "Cargo Run employer",
  family: FAMILY,
  page: 244,
  dice: "d66",
  notes: "Mining representatives and major corporations roll a sub-table for the specific corporation.",
  rows: ranges([
    [11, 16, "Colony representative", who("Colony representative", "colonial")],
    [21, 24, "Colonial Administration", who("Colonial Administration", "government")],
    [25, 36, "Mining representative", who("Mining representative", "corporation"), { roll: [{ table: "alien.jobs.truckers.employer.mining", as: "detail" }] }],
    [41, 43, "Shipping Corporation", who("Shipping Corporation", "corporation")],
    [44, 46, "USCMC Colonel or other military officer", who("USCMC Colonel or other military officer", "military", { allegiance: "uas" })],
    [51, 52, "Wealthy Individual", who("Wealthy Individual", "other")],
    [53, 56, "Geofund (or other group of investors)", who("Geofund", "corporation")],
    [61, 66, "Major corporation", who("Major corporation", "corporation"), { roll: [{ table: "alien.jobs.truckers.employer.corporation", as: "detail" }] }],
  ]),
});

export const truckersBonus: RollTable = table({
  id: "alien.jobs.truckers.bonus",
  name: "Cargo Run bonus rewards",
  family: FAMILY,
  page: 244,
  dice: "d66",
  notes: "Roll once for each success spent on a bonus reward when negotiating the payment.",
  rows: ranges([
    [11, 13, "Discount on new cargo", { bonus: "Discount on new cargo" }],
    [14, 16, "New, guaranteed contract", { bonus: "New, guaranteed contract" }],
    [21, 46, "Additional financial bonus", { bonus: "Additional financial bonus" }],
    [51, 53, "Ship module/feature", { bonus: "Ship module/feature" }],
    [54, 56, "Faction contact", { bonus: "Faction contact" }],
    [61, 66, "Debt cancellation (or credit granted)", { bonus: "Debt cancellation (or credit granted)" }],
  ]),
});

export const truckersMission: RollTable = table({
  id: "alien.jobs.truckers.mission",
  name: "Cargo Run cargo",
  family: FAMILY,
  page: 245,
  dice: "d66",
  rows: described("cargo", [
    [11, 12, "Industrial Gases", "Bulk industrial gases such as propane, ammonia or sulfur dioxide."],
    [13, 14, "Metal Ingots Or Pellets", "Precious and industrial metals: gold, platinum, tungsten, copper, iron."],
    [15, 16, "Colonists", "Settlers in stasis, bound for a new colony."],
    [21, 21, "Timber", "Exotic alien wood bound for Earth."],
    [22, 22, "Ice/Water", "Water, water ice or some other rare frozen substance."],
    [23, 23, "Industrial Chemicals", "Bulk process chemicals: acids, chlorides, sulfates, hydroxides and the like."],
    [24, 24, "Fertilizer", "Nitrogen, potassium or phosphate fertilizer compounds."],
    [25, 26, "Oil", "Crude oil or liquid petroleum products."],
    [31, 32, "Foodstuff", "Bulk legumes and grains, raw or refined."],
    [33, 36, "Ore", "Unrefined ores of aluminum, lead, nickel, tin, copper, iron or tungsten."],
    [41, 41, "Medicinal Goods", "Vaccines, medicines, surgical gear and hospital equipment."],
    [42, 43, "Technical Parts", "Spares for suits, refineries, vehicles, power plants, life support and more."],
    [44, 45, "Starship Technical Parts", "Ship modules, features or parts from dismantled ships."],
    [46, 46, "Pressure Suits", "Space suits for the colonies."],
    [51, 51, "Single Oversized Item", "One huge item: a turbine, generator, hull frame or drilling rig."],
    [52, 52, "Vehicles", "Diggers, tractors, all-terrain vehicles, power loaders."],
    [53, 54, "Weapons & Armor", "Guns, ammunition and armor for colonies or remote stations."],
    [55, 56, "Radioactives", "Processed uranium or fusion fuel such as deuterium or helium-3."],
    [61, 62, "Colony Construction", "Beams, modules, airlocks, outer shells and roofing."],
    [63, 63, "Animal Feed", "Grain and protein feed concentrates."],
    [64, 65, "Livestock/Animals", "Cattle in stasis for an off-world ranch."],
    [66, 66, "Wreckage/Salvage", "A shuttle or escape or cargo pod that needs investigating."],
  ]),
});

const OUTPOST = "A small, usually planetside complex with one corporate, military or scientific purpose.";

export const truckersDestination: RollTable = table({
  id: "alien.jobs.truckers.destination",
  name: "Cargo Run destination",
  family: FAMILY,
  page: 246,
  dice: "d66",
  rows: [
    ...described("destination", [
      [11, 13, "Only Coordinates", "A set of coordinates in deep space."],
      [14, 16, "Hostile Forest/Jungles/Desert", "Planetside wilderness far from people, or an uninhabited world."],
      [21, 26, "Mine", "A mining facility far from any colony or starport."],
      [31, 33, "Spaceport", "On an asteroid or moon, or a landing field near a larger settlement."],
      [34, 36, "Asteroid/Moon", "The surface of an asteroid or small moon; vacuum or a dangerous atmosphere."],
      [41, 43, "Space Station", "A station in orbit."],
      [44, 46, "Earth, Gateway Station", "The busy hub of interstellar traffic and trade."],
      [51, 53, "Young Colony", "A small colony of a few hundred people."],
      [54, 56, "Established Colony", "A busy colony of several thousand with local industry."],
    ]),
    row([61, 63], "Starship", { destination: "Starship", description: "A ship in orbit waiting for the PCs; roll its type." }, { roll: [{ table: "alien.jobs.ship-type", as: "ship" }] }),
    ...described("destination", [[64, 66, "Outpost", OUTPOST]]),
  ],
});

export const truckersComplications: RollTable = table({
  id: "alien.jobs.truckers.complications",
  name: "Cargo Run complications",
  family: FAMILY,
  page: 246,
  dice: "d66",
  notes: "Roll once per point of difficulty (1-3).",
  rows: described("complication", [
    [11, 13, "Embargo/Quarantine", "The ICC quarantines or embargoes the destination."],
    [14, 16, "Intermission", "MU/TH/UR drops out of hyperspace early and wakes the crew."],
    [21, 26, "Military", "A military ship sends a small search party aboard for a 'routine' check."],
    [31, 33, "Delay", "Departure is held up: fuel or coolant problems, a strike, red tape or broken loaders."],
    [34, 43, "Maintenance", "A critical part must be replaced before it fails; most of the crew is needed."],
    [44, 53, "Waiting Game", "The destination cannot take the cargo yet. Can the crew speed things up?"],
    [54, 56, "Cargo Mishap", "The cargo shifts, leaks, overheats or catches fire."],
    [61, 66, "Wreckage", "Sensors pick up a piece of wreckage: a container, EEV, frozen corpse or ship part."],
  ]),
});

// ---------------------------------------------------------------------------
// Colonial Marines: Military Missions (p. 247-249). No employer table.
// ---------------------------------------------------------------------------

export const marinesBonus: RollTable = table({
  id: "alien.jobs.marines.bonus",
  name: "Military mission bonus rewards",
  family: FAMILY,
  page: 247,
  dice: "1d6",
  notes: "For mercenary outfits only, not USCMC personnel. Roll once for each success spent on a bonus reward.",
  rows: ranges([
    [1, 1, "Faction contact", { bonus: "Faction contact" }],
    [2, 2, "Ship module", { bonus: "Ship module" }],
    [3, 4, "New gear", { bonus: "New gear" }],
    [5, 6, "New weapon", { bonus: "New weapon" }],
  ]),
});

export const marinesMission: RollTable = table({
  id: "alien.jobs.marines.mission",
  name: "Military missions",
  family: FAMILY,
  page: 248,
  dice: "d66",
  rows: described("mission", [
    [11, 13, "Recon", "Scout a location, gather intelligence and report back."],
    [14, 15, "Assault", "Take and hold an objective by force."],
    [16, 21, "Defense", "Hold a location, person or group against attack until relieved or a set time."],
    [22, 23, "Combat patrol", "Patrol an area for signs of the enemy, then attack."],
    [24, 26, "Sabotage", "Infiltrate and destroy a key enemy asset such as a bridge or uplink tower."],
    [31, 32, "Raid", "Hit targets of opportunity behind enemy lines."],
    [33, 35, "Search And Rescue", "Find a downed pilot, lost colonists or the like."],
    [36, 42, "Peacekeeping", "Quell a riot and protect communications and services until authority returns."],
    [43, 46, "Bug Hunt", "Wipe out local alien life that threatens colonists."],
    [51, 52, "Civil Evacuation", "Get a colony or station population out of a crisis or disaster."],
    [53, 54, "Space Assault", "Board and seize, or retake, a station, platform or starship."],
    [55, 55, "Space Traffic Security", "From a Conestoga frigate, search civilian ships for contraband and trafficking."],
    [56, 62, "Snatch And Grab", "Seize an item, person or group from behind enemy lines."],
    [63, 66, "Investigation", "A station, colony or installation has gone silent on the Network. Find out why."],
  ]),
});

export const marinesDestination: RollTable = table({
  id: "alien.jobs.marines.destination",
  name: "Military mission destinations",
  family: FAMILY,
  page: 248,
  dice: "d66",
  rows: described("destination", [
    [11, 23, "Colony", "An established or young colony."],
    [24, 26, "Isolated Outpost", "A research station or remote military post."],
    [31, 32, "Starship In Orbit", "An enemy ship, or an abandoned one."],
    [33, 34, "Orbital Space Station", "A transfer station, space colony or orbital survey platform."],
    [35, 36, "Wilderness Location", "A remote spot on a planet's surface."],
    [41, 43, "Planetary Warzone", "An active war zone of ruins, wrecks and fortifications."],
    [44, 46, "Isolated Spaceport", "A remote landing field owned by a corporation, individual or the military."],
    [51, 52, "Scattered Homesteads", "Remote colonial farmsteads spread across the surface."],
    [53, 55, "Mine And Refinery", "A huge mining and refining complex with hundreds of workers."],
    [56, 61, "Prison Complex", "A remote penal colony of violent inmates."],
    [62, 63, "Radar/Sensor Site", "An automated sensor site, perhaps with its own defenses."],
    [64, 66, "Impenetrable Area", "Harsh wilderness such as dense jungle, deep caverns or lava fields."],
  ]),
});

export const marinesComplications: RollTable = table({
  id: "alien.jobs.marines.complications",
  name: "Military mission complications",
  family: FAMILY,
  page: 249,
  dice: "d66",
  notes: "Roll once per point of difficulty (1-3).",
  rows: described("complication", [
    [11, 12, "Role Reversal", "The supposed bad guys turn out to be the good guys."],
    [13, 15, "Passengers", "The squad must now guard prisoners or civilians."],
    [16, 16, "Observer", "A senior officer or a Colonial Times reporter tags along and gets in the way."],
    [21, 23, "Company Meddling", "A corporate representative joins to protect company interests."],
    [24, 25, "Civilian Advisor", "A civilian expert with no military experience comes along and may panic."],
    [26, 32, "Captured", "An NPC, or even a PC, is captured by hostile forces."],
    [33, 36, "Gear Problems", "Faulty gear: ammo, weapons, sensors or vehicles."],
    [41, 44, "Tough Resistance", "The enemy is tougher and more ruthless than expected."],
    [45, 46, "Trapped", "The team finds itself trapped, physically or tactically."],
    [51, 53, "Under Fire!", "Airstrike, mines or heavy weapons hit the site, from the enemy or friendly forces."],
    [54, 55, "Glory Hound", "A medal-hungry new lieutenant pushes the squad into deadly danger."],
    [56, 62, "Traps", "Hidden hazards across the site: mines, IEDs, carnivorous plants, booby traps."],
    [63, 64, "Restrictions", "Tactical limits on how the squad acts, where it goes or what it may use."],
    [65, 66, "Green Commander", "An untested new lieutenant who will fall apart once the shooting starts."],
  ]),
});

// ---------------------------------------------------------------------------
// Frontier Colonists: Expeditions (p. 250-251)
// ---------------------------------------------------------------------------

const GAP_NOTE = "Module decision: the book lists 11-43 only; 44-66 are filled from the Cargo Run major corporation list (p. 244).";

export const colonistsEmployerCorporation: RollTable = table({
  id: "alien.jobs.colonists.employer.corporation",
  name: "Expedition sponsor: major corporation",
  family: FAMILY,
  page: 250,
  dice: "d66",
  notes:
    "Known data gap: the book's list stops at 41-43 (Seegson). Rows 44-66 are a module decision copied from the Cargo Run major corporation list (p. 244) and stay unverified.",
  rows: MAJOR_CORPORATIONS.map(([lo, hi, name]) =>
    lo >= 44
      ? row([lo, hi], name, { ...who(name, "corporation"), note: GAP_NOTE }, { page: 250, unverified: true })
      : row([lo, hi], name, who(name, "corporation")),
  ),
});

export const colonistsEmployerMining: RollTable = table({
  id: "alien.jobs.colonists.employer.mining",
  name: "Expedition sponsor: mining corporation",
  family: FAMILY,
  page: 250,
  dice: "1d6",
  rows: ranges([
    [1, 1, "Chigusa", who("Chigusa", "corporation")],
    [2, 3, "Weyland-Yutani", who("Weyland-Yutani", "corporation")],
    [4, 4, "Gorham Mining", who("Gorham Mining", "corporation")],
    [5, 5, "Kelland Mining", who("Kelland Mining", "corporation")],
    [6, 6, "Farside Mining", who("Farside Mining", "corporation")],
  ]),
});

export const colonistsEmployerGovernment: RollTable = table({
  id: "alien.jobs.colonists.employer.government",
  name: "Expedition sponsor: government",
  family: FAMILY,
  page: 250,
  dice: "1d6",
  rows: ranges([
    [1, 2, "Three World Empire", who("Three World Empire", "government", { allegiance: "3we" })],
    [3, 5, "United Americas", who("United Americas", "government", { allegiance: "uas" })],
    [6, 6, "Independent Core Systems Colonies (ICSC)", who("Independent Core Systems Colonies (ICSC)", "government", { allegiance: "icsc" })],
  ]),
});

export const colonistsEmployer: RollTable = table({
  id: "alien.jobs.colonists.employer",
  name: "Expedition sponsors",
  family: FAMILY,
  page: 250,
  dice: "d66",
  notes: "Major corporations, mining corporations and government representatives roll a sub-table.",
  rows: ranges([
    [11, 16, "Colonial Administration", who("Colonial Administration", "government")],
    [21, 26, "Scientist", who("Scientist", "other")],
    [31, 36, "Geofund (or other group of investors)", who("Geofund", "corporation")],
    [41, 46, "Major corporation", who("Major corporation", "corporation"), { roll: [{ table: "alien.jobs.colonists.employer.corporation", as: "detail" }] }],
    [51, 56, "Mining corporation", who("Mining corporation", "corporation"), { roll: [{ table: "alien.jobs.colonists.employer.mining", as: "detail" }] }],
    [61, 66, "Government representative", who("Government representative", "government"), { roll: [{ table: "alien.jobs.colonists.employer.government", as: "detail" }] }],
  ]),
});

export const colonistsBonus: RollTable = table({
  id: "alien.jobs.colonists.bonus",
  name: "Expedition bonus rewards",
  family: FAMILY,
  page: 250,
  dice: "1d6",
  notes: "Roll once for each success spent on a bonus reward when negotiating the payment.",
  rows: ranges([
    [1, 2, "Ship module", { bonus: "Ship module" }],
    [3, 4, "Gear", { bonus: "Gear" }],
    [5, 6, "Knowledge to use or sell", { bonus: "Knowledge to use or sell" }],
  ]),
});

export const colonistsMission: RollTable = table({
  id: "alien.jobs.colonists.mission",
  name: "Expedition missions",
  family: FAMILY,
  page: 250,
  dice: "d66",
  rows: described("mission", [
    [11, 16, "Salvage", "Find an abandoned or destroyed ship, station or facility and recover valuables without sharing its fate."],
    [21, 24, "Survey", "Map a location or area for the employer and bring back sensor data."],
    [25, 32, "Mining", "Test-mine to judge viability for investors: cobalt, gold, tungsten, oil, gas or other."],
    [33, 36, "Colony Assistance", "Help a start-up colony with gear, information or expertise."],
    [41, 45, "Prospecting", "Lead a prospecting expedition or secure a claim: mining, asteroids, logging or gas trawling."],
    [46, 52, "Data Collection", "Obtain a specific piece of information; its purpose may be kept from the PCs."],
    [53, 55, "Courier", "Deliver sensitive information, resources or goods safely and without delay."],
    [56, 62, "Anomaly Exploration", "Quickly investigate a unique phenomenon such as a wormhole, gravity lens or radiation source."],
    [63, 66, "Rescue Expedition", "Rescue a group, colony or expedition from an attack or other peril."],
  ]),
});

const COLONIST_DESTINATIONS_BEFORE: Array<[number, number, string, string]> = [
  [11, 14, "Abandoned Orbital Station", "Forgotten, abandoned, barely working and drifting."],
  [15, 21, "Rogue Asteroid", "A fast interstellar asteroid or planet passing through the system."],
  [22, 24, "Abandoned Mine", "A failed Kelland mining project, its tunnels and buildings decaying."],
  [25, 31, "Moon", "A rocky moon of a gas giant or planet."],
  [32, 35, "Asteroid Belt", "An asteroid deep inside a dense, complex belt."],
  [36, 36, "Colonized World", "Wilderness on a world that already has colonists."],
  [41, 43, "Terrestrial Planet", "Somewhere on an uninhabited terrestrial planet."],
  [44, 44, "Abandoned Colony", "A failed colony, its structures abandoned and decaying."],
  [45, 51, "Ice Planet", "Somewhere on an uninhabited ice planet."],
];
const WRECKAGE_TEXT = "The smashed wreck of a spacecraft: roll its type, then roll on this table again for where it lies.";

export const colonistsDestination: RollTable = table({
  id: "alien.jobs.colonists.destination",
  name: "Expedition destination",
  family: FAMILY,
  page: 251,
  dice: "d66",
  notes: "Wreckage rolls the ship type and re-rolls the destination (on the re-roll table) for where the wreck lies.",
  rows: [
    ...described("destination", COLONIST_DESTINATIONS_BEFORE),
    row([52, 63], "Wreckage", { destination: "Wreckage", wreckage: true, description: WRECKAGE_TEXT }, {
      roll: [
        { table: "alien.jobs.ship-type", as: "ship" },
        { table: "alien.jobs.colonists.destination-reroll", as: "near" },
      ],
    }),
    ...described("destination", [[64, 66, "Outpost", OUTPOST]]),
  ],
});

export const colonistsDestinationReroll: RollTable = table({
  id: "alien.jobs.colonists.destination-reroll",
  name: "Expedition destination (re-roll for a wreck's location)",
  family: FAMILY,
  page: 251,
  dice: "d66",
  notes: "The same table, used for where a wreck lies. Module decision: Wreckage again is left to the GM (roll again or choose) instead of recursing.",
  rows: [
    ...described("destination", COLONIST_DESTINATIONS_BEFORE),
    row([52, 63], "Wreckage (roll again or choose)", { destination: "Wreckage", description: "Roll again or choose where the wreck lies." }, { gmDecides: true }),
    ...described("destination", [[64, 66, "Outpost", OUTPOST]]),
  ],
});

export const colonistsComplications: RollTable = table({
  id: "alien.jobs.colonists.complications",
  name: "Expedition complications",
  family: FAMILY,
  page: 251,
  dice: "d66",
  notes: "Roll once per point of difficulty (1-3).",
  rows: described("complication", [
    [11, 21, "Natural Phenomenon", "A severe natural event: sudden temperature swing, fire, hurricane, tsunami, quake or mudslide."],
    [22, 32, "Survey Blues", "The target area is hard to find, or hard to survey safely or efficiently."],
    [33, 35, "Presumed Missing", "The PCs' permit may come from an earlier expedition that vanished without a trace."],
    [36, 44, "Rival Expedition", "A similarly equipped rival party races the PCs or tries to stop them."],
    [45, 52, "Quarantine", "The area is quarantined or off-limits; going in without a permit breaks the law."],
    [53, 62, "Deadly Treasure", "Something lethal waits there unknown to the PCs: nuclear waste, bioweapons, xenomorph eggs or worse."],
    [63, 66, "Surveillance", "The military, a government or someone else is watching the expedition. Why?"],
  ]),
});

// ---------------------------------------------------------------------------
// Plot twists (p. 252), any frame
// ---------------------------------------------------------------------------

export const plotTwist: RollTable = table({
  id: "alien.jobs.plot-twist",
  name: "Plot twists",
  family: FAMILY,
  page: 252,
  dice: "d66",
  rows: described("twist", [
    [11, 15, "Mayday", "A distress call, in space or on-planet, that the crew is legally bound to answer."],
    [16, 22, "Bad Intel", "Key mission information proves false or misleading."],
    [23, 25, "Sabotage", "MU/TH/UR fails, causing a fire or decompression. It was sabotage, but by whom?"],
    [26, 35, "Secret Plot", "NPCs or PCs are secretly working on an agenda against the group's."],
    [36, 43, "Murder", "An NPC is suddenly murdered. Who did it, and why?"],
    [44, 46, "Flare Event", "A burst of stellar radiation causes power interruptions or a total comms blackout."],
    [51, 55, "Malfunction", "A key piece of equipment fails exactly when needed."],
    [56, 64, "Time Limit", "The mission has a deadline, and lives depend on it."],
    [65, 66, "Xenomorph Outbreak", "Xenomorph XX121 is at the heart of the job: eggs, a warrior, or the remains of its victims."],
  ]),
});

export const jobTables: RollTable[] = [
  shipType,
  truckersEmployer,
  truckersEmployerMining,
  truckersEmployerCorporation,
  truckersBonus,
  truckersMission,
  truckersDestination,
  truckersComplications,
  marinesBonus,
  marinesMission,
  marinesDestination,
  marinesComplications,
  colonistsEmployer,
  colonistsEmployerCorporation,
  colonistsEmployerMining,
  colonistsEmployerGovernment,
  colonistsBonus,
  colonistsMission,
  colonistsDestination,
  colonistsDestinationReroll,
  colonistsComplications,
  plotTwist,
];
