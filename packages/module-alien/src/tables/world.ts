/**
 * Main World Creation tables (p. 237-242). Modifiers read earlier steps of
 * `alien.world.create` through the roll context (`size.diameterKm`,
 * `atmosphere.atmosphere`, `temperature.temperature`, `colonySize.colonySize`).
 * Rows are unverified paraphrases.
 */
import type { RollTable } from "@campaign-forge/module-sdk";
import { d6, d66, defineTable, labelled, ranges } from "./_helpers";

const FAMILY = "world";

export const size: RollTable = defineTable({
  id: "alien.world.size",
  name: "Planet size",
  family: FAMILY,
  page: 237,
  dice: "2d6",
  notes: "Diameter in km and surface gravity. A 12 is a gas giant: uninhabitable, but it may have moons.",
  rows: ranges([
    [2, 2, "Tiny (1,000 km)", { diameterKm: 1000, gravity: "0.1 G" }],
    [3, 3, "2,000 km", { diameterKm: 2000, gravity: "0.2 G" }],
    [4, 4, "3,000 km", { diameterKm: 3000, gravity: "0.3 G" }],
    [5, 5, "4,000 km", { diameterKm: 4000, gravity: "0.4 G" }],
    [6, 6, "5,000 km", { diameterKm: 5000, gravity: "0.5 G" }],
    [7, 7, "7,000 km", { diameterKm: 7000, gravity: "0.7 G" }],
    [8, 8, "9,000 km", { diameterKm: 9000, gravity: "0.9 G" }],
    [9, 9, "10,000 km", { diameterKm: 10000, gravity: "1.0 G" }],
    [10, 10, "12,500 km", { diameterKm: 12500, gravity: "1.25 G" }],
    [11, 11, "15,000 km", { diameterKm: 15000, gravity: "1.5 G" }],
    [12, 12, "Gas giant", { diameterKm: 120000, gravity: "crushing", uninhabitable: true, gasGiant: true }],
  ]),
});

export const atmosphere: RollTable = defineTable({
  id: "alien.world.atmosphere",
  name: "Atmosphere",
  family: FAMILY,
  page: 238,
  dice: "2d6",
  notes: "Small worlds hold thinner atmospheres: −4 at 4,000 km or less, −2 from 4,001 to 7,000 km (sign of the two modifiers to be checked against the book).",
  modifiers: [
    { when: { "<=": [{ var: "size.diameterKm" }, 4000] }, add: -4, label: "diameter 4,000 km or less" },
    { when: { and: [{ ">": [{ var: "size.diameterKm" }, 4000] }, { "<=": [{ var: "size.diameterKm" }, 7000] }] }, add: -2, label: "diameter 4,001 to 7,000 km" },
  ],
  rows: ranges([
    [-99, 3, "Thin", { atmosphere: "thin" }],
    [4, 6, "Breathable", { atmosphere: "breathable" }],
    [7, 8, "Toxic", { atmosphere: "toxic" }],
    [9, 9, "Dense", { atmosphere: "dense" }],
    [10, 10, "Corrosive", { atmosphere: "corrosive" }],
    [11, 11, "Infiltrating", { atmosphere: "infiltrating" }],
    [12, 99, "Special", { atmosphere: "special" }, { gmDecides: true }],
  ]),
});

export const temperature: RollTable = defineTable({
  id: "alien.world.temperature",
  name: "Temperature",
  family: FAMILY,
  page: 238,
  dice: "2d6",
  notes: "Modified by atmosphere: thin −4, dense +1, corrosive +2, infiltrating +6.",
  modifiers: [
    { when: { "==": [{ var: "atmosphere.atmosphere" }, "thin"] }, add: -4, label: "thin atmosphere" },
    { when: { "==": [{ var: "atmosphere.atmosphere" }, "dense"] }, add: 1, label: "dense atmosphere" },
    { when: { "==": [{ var: "atmosphere.atmosphere" }, "corrosive"] }, add: 2, label: "corrosive atmosphere" },
    { when: { "==": [{ var: "atmosphere.atmosphere" }, "infiltrating"] }, add: 6, label: "infiltrating atmosphere" },
  ],
  rows: ranges([
    [-99, 3, "Frozen", { temperature: "frozen" }],
    [4, 5, "Cold", { temperature: "cold" }],
    [6, 8, "Temperate", { temperature: "temperate" }],
    [9, 10, "Hot", { temperature: "hot" }],
    [11, 99, "Burning", { temperature: "burning" }],
  ]),
});

export const geosphere: RollTable = defineTable({
  id: "alien.world.geosphere",
  name: "Geosphere",
  family: FAMILY,
  page: 238,
  dice: "2d6",
  notes: "Modified by atmosphere (thin −4, dense +1) and temperature (frozen −2, hot −2, burning −4).",
  modifiers: [
    { when: { "==": [{ var: "atmosphere.atmosphere" }, "thin"] }, add: -4, label: "thin atmosphere" },
    { when: { "==": [{ var: "atmosphere.atmosphere" }, "dense"] }, add: 1, label: "dense atmosphere" },
    { when: { "==": [{ var: "temperature.temperature" }, "frozen"] }, add: -2, label: "frozen" },
    { when: { "==": [{ var: "temperature.temperature" }, "hot"] }, add: -2, label: "hot" },
    { when: { "==": [{ var: "temperature.temperature" }, "burning"] }, add: -4, label: "burning" },
  ],
  rows: ranges([
    [-99, 3, "Desert world", { geosphere: "desert" }],
    [4, 5, "Arid", { geosphere: "arid" }],
    [6, 8, "Temperate, wet", { geosphere: "temperate-wet" }],
    [9, 10, "Wet world", { geosphere: "wet" }],
    [11, 99, "Water world", { geosphere: "water" }],
  ]),
});

const TERRAIN = [
  "Rolling plains", "Grassland steppe", "Dense forest", "Rainforest canopy", "Swamp and marsh", "Salt flats",
  "Sand dunes", "Rocky badlands", "Canyon lands", "Volcanic fields", "Lava plains", "Basalt columns",
  "Highland plateau", "Mountain ranges", "Alpine valleys", "Glacial fjords", "Coastal cliffs", "Archipelago",
  "Shallow seas", "Deep ocean", "River delta", "Floodplain", "Tidal mudflats", "Mangrove coast",
  "Fungal forest", "Crystal formations", "Scrubland", "Savanna", "Karst caves", "Sinkhole fields",
  "Impact craters", "Dust bowl", "Ash wastes", "Geyser fields", "Petrified forest", "Ruined megastructure",
];

export const terrain: RollTable = defineTable({
  id: "alien.world.terrain",
  name: "Terrain (terrestrial)",
  family: FAMILY,
  page: 239,
  dice: "d66",
  rows: d66(labelled("terrain", TERRAIN)),
});

const TERRAIN_ICE = [
  "Ice sheet", "Pack ice", "Glacier field", "Frozen sea", "Ice caves", "Crevasse fields",
  "Snow plains", "Permafrost tundra", "Frozen forest", "Ice cliffs", "Nitrogen frost flats", "Methane lakes",
  "Cryovolcano field", "Sublimation plains", "Ice spires", "Drift dunes of snow", "Frozen waterfall", "Buried valley",
  "Rime-covered mountains", "Ice shelf edge", "Frozen river", "Hoarfrost badlands", "Ice canyon", "Blizzard plateau",
  "Frozen swamp", "Subglacial lake", "Ice volcano cone", "Shattered ice plain", "Frozen crater", "Snowbound ruins",
  "Icy archipelago", "Frozen geysers", "Ice bridge", "Slush fields", "Black ice flats", "Frozen derelict site",
];

export const terrainIce: RollTable = defineTable({
  id: "alien.world.terrain-ice",
  name: "Terrain (ice world)",
  family: FAMILY,
  page: 239,
  dice: "d66",
  rows: d66(labelled("terrain", TERRAIN_ICE)),
});

export const colonySize: RollTable = defineTable({
  id: "alien.world.colony-size",
  name: "Colony size",
  family: FAMILY,
  page: 240,
  dice: "2d6",
  notes: "Modified by atmosphere (breathable +1, corrosive or infiltrating −2) and size (4,000 km or less −1, 12,500 km or more +1). Population is a dice expression; missionCount drives the mission step.",
  modifiers: [
    { when: { "==": [{ var: "atmosphere.atmosphere" }, "breathable"] }, add: 1, label: "breathable atmosphere" },
    { when: { in: [{ var: "atmosphere.atmosphere" }, ["corrosive", "infiltrating"]] }, add: -2, label: "hostile atmosphere" },
    { when: { "<=": [{ var: "size.diameterKm" }, 4000] }, add: -1, label: "small world" },
    { when: { ">=": [{ var: "size.diameterKm" }, 12500] }, add: 1, label: "large world" },
  ],
  rows: ranges([
    [-99, 4, "Start-up colony", { colonySize: "start-up", population: "3d6 x 10", missionCount: 1 }],
    [5, 8, "Young colony", { colonySize: "young", population: "2d6 x 100", missionCount: 2 }],
    [9, 99, "Established colony", { colonySize: "established", population: "3d6 x 1,000", missionCount: 3 }],
  ]),
});

export const colonyMission: RollTable = defineTable({
  id: "alien.world.colony-mission",
  name: "Colony mission",
  family: FAMILY,
  page: 240,
  dice: "2d6",
  notes: "Modified by atmosphere (breathable +1, toxic or worse −1) and colony size (established +2).",
  modifiers: [
    { when: { "==": [{ var: "atmosphere.atmosphere" }, "breathable"] }, add: 1, label: "breathable atmosphere" },
    { when: { in: [{ var: "atmosphere.atmosphere" }, ["toxic", "corrosive", "infiltrating"]] }, add: -1, label: "hostile atmosphere" },
    { when: { "==": [{ var: "colonySize.colonySize" }, "established"] }, add: 2, label: "established colony" },
  ],
  rows: ranges([
    [-99, 3, "Terraforming", { mission: "terraforming" }],
    [4, 4, "Research", { mission: "research" }],
    [5, 5, "Survey and prospecting", { mission: "survey" }],
    [6, 7, "Mining and refining", { mission: "mining" }],
    [8, 8, "Agriculture", { mission: "agriculture" }],
    [9, 9, "Military", { mission: "military" }],
    [10, 10, "Manufacturing", { mission: "manufacturing" }],
    [11, 11, "Mercantile hub", { mission: "mercantile" }],
    [12, 99, "Corporate headquarters", { mission: "corporate-hq" }],
  ]),
});

const ORBITAL_ROWS = (withMultiple: boolean) =>
  ranges([
    [-99, 7, "None", { component: "none" }],
    [8, 8, "Ring system", { component: "ring" }],
    [9, 9, "Natural moon", { component: "moon" }],
    [10, 10, "Survey satellite", { component: "survey-satellite" }],
    [11, 11, "Comms relay or orbital station", { component: "station" }],
    withMultiple
      ? [12, 99, "Multiple components", { component: "multiple" }, { roll: [{ table: "alien.world.orbital-components-extra", as: "extra", times: 2 }] }]
      : [12, 99, "Derelict or transit station", { component: "derelict" }],
  ]);

export const orbitalComponents: RollTable = defineTable({
  id: "alien.world.orbital-components",
  name: "Orbital components",
  family: FAMILY,
  page: 241,
  dice: "3d6",
  notes: "Modified by colony size (young +1, established +2). A 12+ rolls twice on the extra table instead of recursing.",
  modifiers: [
    { when: { "==": [{ var: "colonySize.colonySize" }, "young"] }, add: 1, label: "young colony" },
    { when: { "==": [{ var: "colonySize.colonySize" }, "established"] }, add: 2, label: "established colony" },
  ],
  rows: ORBITAL_ROWS(true),
});

export const orbitalComponentsExtra: RollTable = defineTable({
  id: "alien.world.orbital-components-extra",
  name: "Orbital components (extra rolls)",
  family: FAMILY,
  page: 241,
  dice: "3d6",
  notes: "Same table without the recursive row; used for the two extra rolls.",
  modifiers: [
    { when: { "==": [{ var: "colonySize.colonySize" }, "young"] }, add: 1, label: "young colony" },
    { when: { "==": [{ var: "colonySize.colonySize" }, "established"] }, add: 2, label: "established colony" },
  ],
  rows: ORBITAL_ROWS(false),
});

export const factionCount: RollTable = defineTable({
  id: "alien.world.faction-count",
  name: "Number of factions",
  family: FAMILY,
  page: 241,
  dice: "1d3",
  rows: ranges([
    [1, 1, "One faction", { count: 1 }],
    [2, 2, "Two factions", { count: 2 }],
    [3, 3, "Three factions", { count: 3 }],
  ]),
});

export const factionType: RollTable = defineTable({
  id: "alien.world.faction-type",
  name: "Faction type",
  family: FAMILY,
  page: 241,
  dice: "1d6",
  rows: d6([
    { label: "Colonial administration", result: { factionType: "government" } },
    { label: "Corporate office", result: { factionType: "corporation" } },
    { label: "Military garrison", result: { factionType: "military" } },
    { label: "Scientific team", result: { factionType: "other" } },
    { label: "Workers' union", result: { factionType: "colonial" } },
    { label: "Criminal network", result: { factionType: "other" } },
  ]),
});

export const allegianceArms: RollTable = defineTable({
  id: "alien.world.allegiance-arms",
  name: "Allegiance (American and British arms)",
  family: FAMILY,
  page: 242,
  dice: "1d6",
  rows: ranges([
    [1, 3, "United Americas", { allegiance: "uas" }],
    [4, 5, "Three World Empire", { allegiance: "3we" }],
    [6, 6, "Independent", { allegiance: "independent" }],
  ]),
});

export const allegianceIcsc: RollTable = defineTable({
  id: "alien.world.allegiance-icsc",
  name: "Allegiance (ICSC space)",
  family: FAMILY,
  page: 242,
  dice: "1d6",
  rows: ranges([
    [1, 3, "Independent Core System Colonies", { allegiance: "icsc" }],
    [4, 4, "Independent", { allegiance: "independent" }],
    [5, 5, "United Americas", { allegiance: "uas" }],
    [6, 6, "Union of Progressive Peoples", { allegiance: "upp" }],
  ]),
});

const HOOKS = [
  "Comms went silent a week ago", "A survey team never came back", "Corporate auditors arrive unannounced",
  "Strikers have seized the refinery", "A derelict was found in orbit", "The administrator is missing",
  "Strange lights over the ridge", "Livestock found mutilated", "A cult recruits in the dorms",
  "The medic is hiding an outbreak", "Smugglers use the old landing pad", "Marines are coming, nobody knows why",
  "Terraformer output is falling", "A child draws things from her dreams", "Mining hit a hollow chamber",
  "A rival corporation lands a claim", "The colony android acts strangely", "Rations are being poisoned",
  "A shuttle crashed in the wastes", "A sealed lab under the admin block", "Old colonists speak of an earlier colony",
  "The reactor is leaking", "Scavengers found a crashed probe", "A marshal arrives with a warrant",
  "The water supply tastes wrong", "An executive wants a quiet favour", "Rebels hide among the workers",
  "A storm season has trapped everyone", "A specimen escaped from the lab", "Workers vanish on night shift",
  "A ship in orbit will not identify itself", "The colony's founder has returned", "A signal repeats from the ice",
  "Food stores are short by half", "A UPP agent defects to the colony", "Someone is sabotaging the airlocks",
];

export const campaignHook: RollTable = defineTable({
  id: "alien.world.campaign-hook",
  name: "Campaign hooks",
  family: FAMILY,
  page: 242,
  dice: "d66",
  rows: d66(labelled("hook", HOOKS)),
});

export const worldTables: RollTable[] = [
  size,
  atmosphere,
  temperature,
  geosphere,
  terrain,
  terrainIce,
  colonySize,
  colonyMission,
  orbitalComponents,
  orbitalComponentsExtra,
  factionCount,
  factionType,
  allegianceArms,
  allegianceIcsc,
  campaignHook,
];
