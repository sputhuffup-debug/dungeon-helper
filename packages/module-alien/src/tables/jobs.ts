/**
 * Job Generator tables (p. 244-252), one pipeline per campaign frame:
 * employer (with nested sub-tables), bonus rewards, mission or cargo,
 * destination, complications, plus the shared plot twist table.
 * Rows are unverified paraphrases. Known data gap: the Expedition sponsors
 * corporation sub-table (p. 250) covers 11-43 only; 44-66 are filled here from
 * the Cargo Run corporation list as a module decision (see row notes).
 */
import type { RollTable, TableRow } from "@campaign-forge/module-sdk";
import { d6, d66, d66Grouped, defineTable, labelled, ranges, row } from "./_helpers";

const FAMILY = "jobs";

const corp = (name: string) => ({ label: name, result: { name, factionType: "corporation" } });
const gov = (name: string) => ({ label: name, result: { name, factionType: "government" } });
const mil = (name: string) => ({ label: name, result: { name, factionType: "military" } });
const other = (name: string) => ({ label: name, result: { name, factionType: "other" } });

// ---------------------------------------------------------------------------
// Space Truckers (p. 244-246)
// ---------------------------------------------------------------------------

export const truckersEmployerCorporation: RollTable = defineTable({
  id: "alien.jobs.truckers.employer.corporation",
  name: "Cargo Run employer: corporation",
  family: FAMILY,
  page: 245,
  dice: "d66",
  rows: d66Grouped(3, [
    corp("Weyland-Yutani"),
    corp("Weyland-Yutani (subsidiary)"),
    corp("Seegson"),
    corp("Hyperdyne Systems"),
    corp("Lasalle Bionational"),
    corp("Kelland Mining Company"),
    corp("Jingti Long Corporation"),
    corp("Lorenz SysTech"),
    corp("Chigusa Corporation"),
    corp("Farside Lunar Mining"),
    corp("Grant Corp"),
    corp("Gemini Exoplanetary"),
  ]),
});

export const truckersEmployerMinor: RollTable = defineTable({
  id: "alien.jobs.truckers.employer.minor-corporation",
  name: "Cargo Run employer: minor corporation",
  family: FAMILY,
  page: 245,
  dice: "1d6",
  rows: d6([
    corp("A struggling shipping line"),
    corp("A colony supply co-op"),
    corp("A pharmaceutical start-up"),
    corp("An independent mining outfit"),
    corp("A salvage brokerage"),
    corp("A frontier trading house"),
  ]),
});

export const truckersEmployerGovernment: RollTable = defineTable({
  id: "alien.jobs.truckers.employer.government",
  name: "Cargo Run employer: government",
  family: FAMILY,
  page: 245,
  dice: "1d6",
  rows: d6([
    gov("Colonial Administration"),
    gov("Interstellar Commerce Commission"),
    gov("Colonial Marshal's office"),
    mil("USCMC supply command"),
    gov("Three World Empire trade office"),
    gov("ICSC trade council"),
  ]),
});

export const truckersEmployerPrivate: RollTable = defineTable({
  id: "alien.jobs.truckers.employer.private",
  name: "Cargo Run employer: private client",
  family: FAMILY,
  page: 245,
  dice: "1d6",
  rows: d6([
    other("A wealthy colonist family"),
    other("A retired ship captain"),
    other("A scientist with a private grant"),
    other("A union organiser"),
    other("A preacher with a flock to move"),
    other("An anonymous broker"),
  ]),
});

export const truckersEmployerCriminal: RollTable = defineTable({
  id: "alien.jobs.truckers.employer.criminal",
  name: "Cargo Run employer: criminal",
  family: FAMILY,
  page: 245,
  dice: "1d6",
  rows: d6([
    other("A smuggling ring"),
    other("A black-market medical supplier"),
    other("A pirate fence"),
    other("A corporate insider selling secrets"),
    other("A rebel cell"),
    other("A loan shark collecting a debt"),
  ]),
});

export const truckersEmployer: RollTable = defineTable({
  id: "alien.jobs.truckers.employer",
  name: "Cargo Run employer",
  family: FAMILY,
  page: 245,
  dice: "d66",
  notes: "Roll the employer category, then the nested sub-table for the detail.",
  rows: ranges([
    [11, 26, "Major corporation", { category: "corporation" }, { roll: [{ table: "alien.jobs.truckers.employer.corporation", as: "detail" }] }],
    [31, 36, "Minor corporation", { category: "minor-corporation" }, { roll: [{ table: "alien.jobs.truckers.employer.minor-corporation", as: "detail" }] }],
    [41, 46, "Government", { category: "government" }, { roll: [{ table: "alien.jobs.truckers.employer.government", as: "detail" }] }],
    [51, 56, "Private client", { category: "private" }, { roll: [{ table: "alien.jobs.truckers.employer.private", as: "detail" }] }],
    [61, 66, "Criminal", { category: "criminal" }, { roll: [{ table: "alien.jobs.truckers.employer.criminal", as: "detail" }] }],
  ]),
});

export const truckersBonus: RollTable = defineTable({
  id: "alien.jobs.truckers.bonus",
  name: "Cargo Run bonus rewards",
  family: FAMILY,
  page: 245,
  dice: "1d6",
  rows: d6(labelled("bonus", [
    "Free fuel and docking at the destination",
    "A crate of good liquor",
    "Spare parts for the ship",
    "A favour from the employer",
    "Double pay if delivered early",
    "Salvage rights on anything found en route",
  ])),
});

const CARGO = [
  "Terraforming chemicals", "Mining explosives", "Prefab habitat modules", "Frozen livestock embryos",
  "Medical supplies", "Pharmaceutical samples", "Cryosleep passengers", "Corporate executives",
  "Colonist families", "Convict labour", "Military hardware, sealed", "Ammunition and spare parts",
  "Reactor fuel rods", "Heavy machinery", "Mail and data cores", "Luxury goods",
  "Seed stock and soil cultures", "Live animals", "Industrial androids, crated", "Scientific instruments",
  "Water ice", "Refined ore", "Scrap and salvage", "Food rations",
  "Unlabelled sealed containers", "A single locked crate", "Biological specimens in stasis", "Art and antiques",
  "Alcohol and narcotics", "Weapons for a militia", "Refugees", "A dignitary and retinue",
  "Hull plating", "Communication relay parts", "Hazardous waste", "An unregistered shuttle",
];

export const truckersMission: RollTable = defineTable({
  id: "alien.jobs.truckers.mission",
  name: "Cargo Run cargo",
  family: FAMILY,
  page: 245,
  dice: "d66",
  rows: d66(labelled("cargo", CARGO)),
});

export const truckersDestination: RollTable = defineTable({
  id: "alien.jobs.truckers.destination",
  name: "Cargo Run destination",
  family: FAMILY,
  page: 246,
  dice: "1d6",
  rows: d6(labelled("destination", [
    "An established colony",
    "A young colony",
    "A start-up colony",
    "A space station",
    "A ship in deep space",
    "An uncharted system",
  ])),
});

const TRUCKER_COMPLICATIONS = [
  "The cargo is not what the manifest says", "A stowaway is aboard", "The ship develops a fault en route",
  "Pirates track the ship", "The destination has gone silent", "Customs impound the cargo",
  "A crew member falls ill", "The employer has not paid the fuel bill", "A rival crew wants the same job",
  "The cargo is leaking", "A passenger is a wanted fugitive", "The route crosses a quarantine zone",
  "The destination refuses the delivery", "The ship's AI starts hiding data", "A distress call en route",
  "The cargo is alive", "A marshal boards for inspection", "A storm closes the landing site",
];

export const truckersComplications: RollTable = defineTable({
  id: "alien.jobs.truckers.complications",
  name: "Cargo Run complications",
  family: FAMILY,
  page: 246,
  dice: "d66",
  rows: d66Grouped(2, labelled("complication", TRUCKER_COMPLICATIONS)),
});

// ---------------------------------------------------------------------------
// Colonial Marines (p. 247-249)
// ---------------------------------------------------------------------------

export const marinesEmployerCommand: RollTable = defineTable({
  id: "alien.jobs.marines.employer.command",
  name: "Marine mission: chain of command",
  family: FAMILY,
  page: 248,
  dice: "1d6",
  rows: d6([
    mil("Platoon lieutenant"),
    mil("Company commander"),
    mil("Battalion HQ"),
    mil("Fleet command"),
    mil("Sector command"),
    mil("USCMC Special Operations"),
  ]),
});

export const marinesEmployerCivilian: RollTable = defineTable({
  id: "alien.jobs.marines.employer.civilian",
  name: "Marine mission: civilian authority",
  family: FAMILY,
  page: 248,
  dice: "1d6",
  rows: d6([
    gov("Colonial Administration"),
    gov("Colonial Marshal's office"),
    gov("Interstellar Commerce Commission"),
    gov("A colony governor"),
    gov("A planetary senate"),
    gov("A disaster relief agency"),
  ]),
});

export const marinesEmployerCovert: RollTable = defineTable({
  id: "alien.jobs.marines.employer.covert",
  name: "Marine mission: covert agency",
  family: FAMILY,
  page: 248,
  dice: "1d6",
  rows: d6([
    other("Military intelligence"),
    other("A corporate black-ops liaison"),
    other("An unnamed government agency"),
    other("Weyland-Yutani Special Projects"),
    other("A Three World Empire attache"),
    other("Orders with no visible source"),
  ]),
});

export const marinesEmployer: RollTable = defineTable({
  id: "alien.jobs.marines.employer",
  name: "Marine mission: who gives the orders",
  family: FAMILY,
  page: 248,
  dice: "d66",
  rows: ranges([
    [11, 36, "USCMC chain of command", { category: "military" }, { roll: [{ table: "alien.jobs.marines.employer.command", as: "detail" }] }],
    [41, 46, "Corporate request", { category: "corporation" }, { roll: [{ table: "alien.jobs.truckers.employer.corporation", as: "detail" }] }],
    [51, 56, "Civilian authority", { category: "government" }, { roll: [{ table: "alien.jobs.marines.employer.civilian", as: "detail" }] }],
    [61, 66, "Covert agency", { category: "covert" }, { roll: [{ table: "alien.jobs.marines.employer.covert", as: "detail" }] }],
  ]),
});

export const marinesBonus: RollTable = defineTable({
  id: "alien.jobs.marines.bonus",
  name: "Marine mission bonus rewards",
  family: FAMILY,
  page: 248,
  dice: "1d6",
  rows: d6(labelled("bonus", [
    "Extended shore leave",
    "A commendation and promotion points",
    "First pick of new equipment",
    "Hazard pay",
    "A favour from an officer",
    "Transfer to a posting of choice",
  ])),
});

const MARINE_MISSIONS = [
  "Garrison a colony", "Escort a convoy", "Search and rescue", "Recover a downed dropship",
  "Secure a derelict", "Evacuate colonists", "Suppress a riot", "Hunt a deserter",
  "Guard a research team", "Board a suspect vessel", "Destroy a rebel base", "Protect a corporate asset",
  "Investigate lost contact", "Quarantine a settlement", "Recon an uncharted moon", "Deliver a sealed package",
  "Train colonial militia", "Hold a bridge against raiders", "Retrieve a black box", "Arrest a corporate officer",
  "Clear a mine of squatters", "Escort a diplomat", "Recover stolen weapons", "Survey a crash site",
  "Defend a relay station", "Rescue hostages", "Sweep a station for sabotage", "Test new equipment in the field",
  "Secure a landing zone", "Hunt a dangerous animal", "Suppress a mutiny", "Observe a UPP border post",
  "Recover a lost patrol", "Escort a prisoner transfer", "Contain a lab accident", "Classified; sealed orders",
];

export const marinesMission: RollTable = defineTable({
  id: "alien.jobs.marines.mission",
  name: "Marine missions",
  family: FAMILY,
  page: 248,
  dice: "d66",
  rows: d66(labelled("mission", MARINE_MISSIONS)),
});

export const marinesDestination: RollTable = defineTable({
  id: "alien.jobs.marines.destination",
  name: "Marine mission destination",
  family: FAMILY,
  page: 249,
  dice: "d66",
  rows: d66Grouped(3, labelled("destination", [
    "An established colony", "A young colony", "A start-up colony", "A forward operating base",
    "A space station", "A derelict ship", "A corporate facility", "An uncharted world",
    "A ship under way", "A UPP border zone", "A research outpost", "A mining platform",
  ])),
});

const MARINE_COMPLICATIONS = [
  "The intel is wrong", "The LZ is hot", "The locals are hostile", "A corporate observer tags along",
  "Orders change mid-mission", "The dropship is grounded", "Comms are jammed", "A squad member is a plant",
  "Civilians are in the line of fire", "The objective has already been taken", "A sergeant cracks under pressure",
  "The enemy is not what was briefed", "Ammo resupply never comes", "An officer has a private agenda",
  "The weather turns deadly", "A UPP unit is already there", "The colony is under quarantine", "Something is in the walls",
];

export const marinesComplications: RollTable = defineTable({
  id: "alien.jobs.marines.complications",
  name: "Marine mission complications",
  family: FAMILY,
  page: 249,
  dice: "d66",
  rows: d66Grouped(2, labelled("complication", MARINE_COMPLICATIONS)),
});

// ---------------------------------------------------------------------------
// Frontier Colonists (p. 250-251)
// ---------------------------------------------------------------------------

const GAP_NOTE = "Module decision: the book's sponsor list covers 11-43 only; this row is filled from the Cargo Run corporation list (p. 245).";
function gapRow(lo: number, hi: number, name: string): TableRow {
  return row([lo, hi], name, { name, factionType: "corporation", note: GAP_NOTE }, { page: 250, unverified: true });
}

export const colonistsEmployerCorporation: RollTable = defineTable({
  id: "alien.jobs.colonists.employer.corporation",
  name: "Expedition sponsor: corporation",
  family: FAMILY,
  page: 250,
  dice: "d66",
  notes: "Known data gap: the book defines 11-43 only. Rows 44-66 are a module decision, filled from the Cargo Run corporation list (p. 245), and are marked unverified.",
  rows: [
    ...ranges([
      [11, 13, "Weyland-Yutani", { name: "Weyland-Yutani", factionType: "corporation" }],
      [14, 16, "Weyland-Yutani Exploration Division", { name: "Weyland-Yutani Exploration Division", factionType: "corporation" }],
      [21, 23, "Seegson", { name: "Seegson", factionType: "corporation" }],
      [24, 26, "Lasalle Bionational", { name: "Lasalle Bionational", factionType: "corporation" }],
      [31, 33, "Hyperdyne Systems", { name: "Hyperdyne Systems", factionType: "corporation" }],
      [34, 36, "Kelland Mining Company", { name: "Kelland Mining Company", factionType: "corporation" }],
      [41, 43, "Jingti Long Corporation", { name: "Jingti Long Corporation", factionType: "corporation" }],
    ]),
    gapRow(44, 46, "Lorenz SysTech"),
    gapRow(51, 53, "Chigusa Corporation"),
    gapRow(54, 56, "Farside Lunar Mining"),
    gapRow(61, 63, "Grant Corp"),
    gapRow(64, 66, "Gemini Exoplanetary"),
  ],
});

export const colonistsEmployerGovernment: RollTable = defineTable({
  id: "alien.jobs.colonists.employer.government",
  name: "Expedition sponsor: government",
  family: FAMILY,
  page: 250,
  dice: "1d6",
  rows: d6([
    gov("Colonial Administration"),
    gov("Interstellar Commerce Commission"),
    gov("United Americas colonial office"),
    gov("Three World Empire survey office"),
    gov("ICSC settlement council"),
    mil("USCMC survey detachment"),
  ]),
});

export const colonistsEmployerInstitution: RollTable = defineTable({
  id: "alien.jobs.colonists.employer.institution",
  name: "Expedition sponsor: scientific institution",
  family: FAMILY,
  page: 250,
  dice: "1d6",
  rows: d6([
    other("A core-world university"),
    other("A xenobiology institute"),
    other("A terraforming research foundation"),
    other("A medical research trust"),
    other("An astronomical survey"),
    other("An archaeological society"),
  ]),
});

export const colonistsEmployerPrivate: RollTable = defineTable({
  id: "alien.jobs.colonists.employer.private",
  name: "Expedition sponsor: private backer",
  family: FAMILY,
  page: 250,
  dice: "1d6",
  rows: d6([
    other("A wealthy eccentric"),
    other("A religious movement"),
    other("A colonists' co-operative"),
    other("A retired executive"),
    other("A media network"),
    other("An anonymous trust"),
  ]),
});

export const colonistsEmployer: RollTable = defineTable({
  id: "alien.jobs.colonists.employer",
  name: "Expedition sponsor",
  family: FAMILY,
  page: 250,
  dice: "d66",
  rows: ranges([
    [11, 36, "Major corporation", { category: "corporation" }, { roll: [{ table: "alien.jobs.colonists.employer.corporation", as: "detail" }] }],
    [41, 46, "Government agency", { category: "government" }, { roll: [{ table: "alien.jobs.colonists.employer.government", as: "detail" }] }],
    [51, 56, "Scientific institution", { category: "institution" }, { roll: [{ table: "alien.jobs.colonists.employer.institution", as: "detail" }] }],
    [61, 66, "Private backer", { category: "private" }, { roll: [{ table: "alien.jobs.colonists.employer.private", as: "detail" }] }],
  ]),
});

export const colonistsBonus: RollTable = defineTable({
  id: "alien.jobs.colonists.bonus",
  name: "Expedition bonus rewards",
  family: FAMILY,
  page: 250,
  dice: "1d6",
  rows: d6(labelled("bonus", [
    "A share of any claim",
    "New equipment for the colony",
    "A seat on the colony council",
    "Medical supplies for a year",
    "A favour from the sponsor",
    "Passage home for anyone who wants it",
  ])),
});

const EXPEDITIONS = [
  "Survey a new claim", "Prospect for ore", "Map a cave system", "Recover a lost survey team",
  "Catalogue local wildlife", "Sample the atmosphere at altitude", "Scout a site for a new settlement", "Investigate a signal",
  "Salvage a crashed shuttle", "Study a geological anomaly", "Test terraforming soil", "Find a missing colonist",
  "Repair a remote relay", "Retrieve seed stock from an old outpost", "Escort a scientist to a dig", "Hunt a predator threatening livestock",
  "Chart a river to the sea", "Inspect an abandoned mine", "Record weather data in the storm belt", "Negotiate with squatters",
  "Recover a crashed probe", "Collect ice from the polar cap", "Search for water", "Mark a road to the next settlement",
  "Trace a chemical leak to its source", "Investigate animal deaths", "Deliver supplies to a far homestead", "Dig for fossils",
  "Scout a volcanic vent", "Survey a derelict found on the surface", "Build a relay on a high ridge", "Collect plant samples",
  "Track a tremor's epicentre", "Find the source of a glow in the night", "Rescue a stranded truck crew", "Explore ruins nobody built",
];

export const colonistsMission: RollTable = defineTable({
  id: "alien.jobs.colonists.mission",
  name: "Expeditions",
  family: FAMILY,
  page: 250,
  dice: "d66",
  rows: d66(labelled("mission", EXPEDITIONS)),
});

const EXPEDITION_DESTINATIONS = [
  "A nearby valley", "A mountain pass", "A river delta", "A cave system",
  "A distant homestead", "An abandoned outpost", "A crash site", "A frozen plateau",
  "A storm belt", "A coastline", "WRECKAGE", "A site with no name",
];

const destinationSpecs = (wreckageAsNested: boolean) =>
  EXPEDITION_DESTINATIONS.map((d) => {
    if (d !== "WRECKAGE") return { label: d, result: { destination: d } };
    if (wreckageAsNested) {
      return {
        label: "Wreckage",
        result: { destination: "Wreckage", wreckage: true },
        roll: [{ table: "alien.jobs.colonists.destination-reroll", as: "near" }],
      };
    }
    return { label: "A deep canyon", result: { destination: "A deep canyon" } };
  });

export const colonistsDestination: RollTable = defineTable({
  id: "alien.jobs.colonists.destination",
  name: "Expedition destination",
  family: FAMILY,
  page: 251,
  dice: "d66",
  notes: "Wreckage re-rolls the destination on the reroll table to place the wreck somewhere.",
  rows: d66Grouped(3, destinationSpecs(true)),
});

export const colonistsDestinationReroll: RollTable = defineTable({
  id: "alien.jobs.colonists.destination-reroll",
  name: "Expedition destination (re-roll, no wreckage)",
  family: FAMILY,
  page: 251,
  dice: "d66",
  rows: d66Grouped(3, destinationSpecs(false)),
});

const COLONIST_COMPLICATIONS = [
  "The vehicle breaks down", "A storm rolls in", "A member is injured", "Supplies run short",
  "The map is wrong", "Someone else got there first", "Wildlife stalks the party", "A sponsor's observer interferes",
  "The find is bigger than expected", "The colony recalls the team", "Radio contact is lost", "A member has a secret agenda",
  "Ground gives way", "The site is contaminated", "Squatters claim the site", "Night falls early and cold",
  "The find should not exist", "Something follows the team home",
];

export const colonistsComplications: RollTable = defineTable({
  id: "alien.jobs.colonists.complications",
  name: "Expedition complications",
  family: FAMILY,
  page: 251,
  dice: "d66",
  rows: d66Grouped(2, labelled("complication", COLONIST_COMPLICATIONS)),
});

// ---------------------------------------------------------------------------
// Plot twists (p. 252)
// ---------------------------------------------------------------------------

const PLOT_TWISTS = [
  "The employer is a front", "The cargo is the mission", "A crew member is a corporate spy", "The destination no longer exists",
  "A rival crew has the same orders", "The payment is counterfeit", "An old enemy is waiting", "The job is a test",
  "The ship is being tracked", "A passenger is not human", "The employer dies before payday", "The real client is the Company",
  "Somebody wants the crew dead", "The mission was already done", "The crew is the bait", "A distress call changes everything",
  "The job is legal, the cargo is not", "A crew member's past catches up", "A debt comes due at the worst moment", "The destination is under quarantine",
  "The employer wants a witness silenced", "The specimen is awake", "An android has secret orders", "The route is a trap",
  "A storm strands the crew with the problem", "The locals know more than they say", "Two factions want the same thing", "The job pays in information",
  "A relative of a crew member is involved", "The derelict has a survivor", "A bounty is posted on the crew", "The contract has a hidden clause",
  "Rescue arrives with its own agenda", "The colony is already lost", "A marshal is building a case", "Nothing is what it seems",
];

export const plotTwist: RollTable = defineTable({
  id: "alien.jobs.plot-twist",
  name: "Plot twists",
  family: FAMILY,
  page: 252,
  dice: "d66",
  rows: d66(labelled("twist", PLOT_TWISTS)),
});

export const jobTables: RollTable[] = [
  truckersEmployer,
  truckersEmployerCorporation,
  truckersEmployerMinor,
  truckersEmployerGovernment,
  truckersEmployerPrivate,
  truckersEmployerCriminal,
  truckersBonus,
  truckersMission,
  truckersDestination,
  truckersComplications,
  marinesEmployer,
  marinesEmployerCommand,
  marinesEmployerCivilian,
  marinesEmployerCovert,
  marinesBonus,
  marinesMission,
  marinesDestination,
  marinesComplications,
  colonistsEmployer,
  colonistsEmployerCorporation,
  colonistsEmployerGovernment,
  colonistsEmployerInstitution,
  colonistsEmployerPrivate,
  colonistsBonus,
  colonistsMission,
  colonistsDestination,
  colonistsDestinationReroll,
  colonistsComplications,
  plotTwist,
];
