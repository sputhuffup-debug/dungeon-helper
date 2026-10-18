/**
 * Main World Creation tables (p. 237-242), checked against the book.
 *
 * Modifiers read earlier steps of `alien.world.create` through the roll
 * context (`size.diameterKm`, `atmosphere.atmosphere`,
 * `temperature.temperature`, `colonySize.colonySize`) and two procedure
 * inputs: `planetType` ("ice" for an ice planet of the star system generator)
 * and `gasGiantMoon` (true for a moon of a gas giant). Labels are the book's;
 * effects and descriptions are paraphrased.
 */
import type { RollTable } from "@campaign-forge/module-sdk";
import { d66, d6, ranges, type TableSpec } from "./_helpers";

const FAMILY = "world";

/** A table checked against the book: no `unverified` flag. */
const table = (spec: TableSpec): RollTable => ({ ...spec });

const isAtmo = (...values: string[]) =>
  values.length === 1 ? { "==": [{ var: "atmosphere.atmosphere" }, values[0]] } : { in: [{ var: "atmosphere.atmosphere" }, values] };
const isTemp = (value: string) => ({ "==": [{ var: "temperature.temperature" }, value] });
const isColony = (value: string) => ({ "==": [{ var: "colonySize.colonySize" }, value] });

export const size: RollTable = table({
  id: "alien.world.size",
  name: "Planet size",
  family: FAMILY,
  page: 237,
  dice: "2d6",
  notes:
    "Diameter in km and surface gravity. Below 0.7 G is low gravity, 1.3 G or more is high gravity: −2 to AGILITY, CLOSE COMBAT and STAMINA until acclimatized. Ice planets −2, gas giant moons −4 (star system generator, p. 243).",
  modifiers: [
    { when: { "==": [{ var: "planetType" }, "ice"] }, add: -2, label: "ice planet" },
    { when: { "==": [{ var: "gasGiantMoon" }, true] }, add: -4, label: "gas giant moon" },
  ],
  rows: ranges([
    [-99, 2, "<1,000 km", { diameterKm: 1000, diameterText: "<1,000 km", gravity: "Almost 0-G", gravityClass: "low", examples: "Ceres and other asteroids" }],
    [3, 4, "2,000 km", { diameterKm: 2000, gravity: "0.1 G", gravityClass: "low", examples: "Iapetus" }],
    [5, 6, "4,000 km", { diameterKm: 4000, gravity: "0.2 G", gravityClass: "low", examples: "Luna, Europa" }],
    [7, 7, "7,000 km", { diameterKm: 7000, gravity: "0.5 G", gravityClass: "low", examples: "Mars" }],
    [8, 8, "10,000 km", { diameterKm: 10000, gravity: "0.7 G", gravityClass: "normal" }],
    [9, 10, "12,500 km", { diameterKm: 12500, gravity: "1.0 G", gravityClass: "normal", examples: "Earth, Venus" }],
    [11, 11, "15,000 km", { diameterKm: 15000, gravity: "1.3 G", gravityClass: "high" }],
    [12, 99, "20,000 km", { diameterKm: 20000, gravity: "2 G", gravityClass: "high", examples: "Super-Earth" }],
  ]),
});

export const atmosphere: RollTable = table({
  id: "alien.world.atmosphere",
  name: "Atmosphere",
  family: FAMILY,
  page: 238,
  dice: "2d6",
  notes:
    "Modifiers as printed: diameter 4,000 km or less −2, 4,001 to 7,000 km −4. Special: the GM decides (or re-rolls).",
  modifiers: [
    { when: { "<=": [{ var: "size.diameterKm" }, 4000] }, add: -2, label: "diameter 4,000 km or less" },
    { when: { and: [{ ">": [{ var: "size.diameterKm" }, 4000] }, { "<=": [{ var: "size.diameterKm" }, 7000] }] }, add: -4, label: "diameter 4,001 to 7,000 km" },
  ],
  rows: ranges([
    [-99, 3, "Thin", { atmosphere: "thin", effect: "Pressure suit needed. Without one: STAMINA rolls −2 dice and a fatigue roll every shift." }],
    [4, 6, "Breathable", { atmosphere: "breathable", effect: "Earth density with enough oxygen to live on." }],
    [7, 8, "Toxic", { atmosphere: "toxic", effect: "Earth density but unbreathable without a filter mask: a fatigue roll every stretch." }],
    [9, 9, "Dense", { atmosphere: "dense", effect: "Too thick to breathe except at altitude. Without a pressure suit: a fatigue roll every shift." }],
    [10, 10, "Corrosive", { atmosphere: "corrosive", effect: "As toxic; without a pressure suit, a five-dice attack each stretch that ignores normal armor." }],
    [11, 11, "Infiltrating", { atmosphere: "infiltrating", effect: "As corrosive, and each pressure suit takes a five-dice attack; a hit breaches it." }],
    [12, 99, "Special", { atmosphere: "special", effect: "Varies across the surface or has odd properties; the GM decides, or re-rolls." }, { gmDecides: true }],
  ]),
});

export const temperature: RollTable = table({
  id: "alien.world.temperature",
  name: "Temperature",
  family: FAMILY,
  page: 238,
  dice: "2d6",
  notes:
    "Modified by atmosphere: thin −4, dense −1, corrosive or infiltrating +6, special as the GM decides. Ice planets of the star system generator are always frozen (p. 243).",
  modifiers: [
    { when: isAtmo("thin"), add: -4, label: "thin atmosphere" },
    { when: isAtmo("dense"), add: -1, label: "dense atmosphere" },
    { when: isAtmo("corrosive", "infiltrating"), add: 6, label: "corrosive or infiltrating atmosphere" },
    { when: { "==": [{ var: "planetType" }, "ice"] }, add: -20, label: "ice planet: set to frozen (p. 243)" },
  ],
  rows: ranges([
    [-99, 3, "Frozen", { temperature: "frozen", range: "−50 °C or less", examples: "Titan, Pluto, Enceladus" }],
    [4, 5, "Cold", { temperature: "cold", range: "−50 to 0 °C", examples: "Alaska or Antarctica in winter" }],
    [6, 7, "Temperate", { temperature: "temperate", range: "0 to 30 °C", examples: "Boston or Paris" }],
    [8, 10, "Hot", { temperature: "hot", range: "31 to 80 °C", examples: "Mojave or Sahara Deserts" }],
    [11, 99, "Burning", { temperature: "burning", range: "80 °C or more", examples: "Mercury, Venus" }],
  ]),
});

export const geosphere: RollTable = table({
  id: "alien.world.geosphere",
  name: "Geosphere",
  family: FAMILY,
  page: 239,
  dice: "2d6",
  notes:
    "Ratio of dry land to ocean. Modified by thin, dense, corrosive or infiltrating atmosphere −4 (special: GM decides) and by temperature: hot −2, burning −4, frozen −2. No atmosphere at all means a desert world. Frozen worlds hold their seas as ice; burning worlds have boiled them off.",
  modifiers: [
    { when: isAtmo("thin", "dense", "corrosive", "infiltrating"), add: -4, label: "thin, dense, corrosive or infiltrating atmosphere" },
    { when: isTemp("hot"), add: -2, label: "hot temperature" },
    { when: isTemp("burning"), add: -4, label: "burning temperature" },
    { when: isTemp("frozen"), add: -2, label: "frozen" },
  ],
  rows: ranges([
    [-99, 4, "Desert World", { geosphere: "desert", description: "No surface water." }],
    [5, 6, "Arid World", { geosphere: "arid", description: "Deserts and dry steppes worldwide, a few lakes and small seas." }],
    [7, 8, "Dry Temperate", { geosphere: "dry-temperate", description: "Oceans cover 30–40% of the surface." }],
    [9, 10, "Wet Temperate", { geosphere: "wet-temperate", description: "Oceans cover 60–70% of the surface." }],
    [11, 11, "Wet World", { geosphere: "wet", description: "Global oceans with some islands and archipelagos." }],
    [12, 99, "Water World", { geosphere: "water", description: "No dry land." }],
  ]),
});

const TERRAIN = [
  "Huge impact crater", "Plains of silicon glass", "Disturbing wind-cut rock formations", "Permanent global dust-storm", "Eerily colored dust plains", "Active volcanic lava fields",
  "Extensive salt flats", "Dust-laden, permanent sunset sky", "Ancient, blackened lava plains", "Thermal springs and steam vents", "Tall, gravel-strewn mountains", "Howling winds that never stop",
  "Daily fog banks roll in", "Deep and wide rift valleys", "Bizarrely eroded, wind-cut badlands", "Steep-sided river gorges cut into soft rocks", "Huge moon dominates day/night sky", "World-spanning super canyon",
  "Impressive river of great length", "Oddly colored forests of alien vegetation", "Mountains cut by sky-blue lakes", "Sweeping plains of elephant grass", "Highly toxic, but beautiful, plant-life", "Small, bright, incredibly fast moons in orbit",
  "Vast and complex river delta", "Immense series of waterfalls", "Endless mudflats with twisting waterways", "Impressive coastline of fjords and cliffs", "Volcanoes, active & widespread", "Impenetrable jungle",
  "Dangerous tides – fast and loud", "Vast, permanent super storm", "Toxic sea creatures floating with the currents", "Volcanic island chains", "Permanently overcast with unrelenting rainfall", "Mildly acidic oceans and rainfall",
];

export const terrain: RollTable = table({
  id: "alien.world.terrain",
  name: "Terrestrial planet terrain",
  family: FAMILY,
  page: 239,
  dice: "d66",
  notes: "One distinctive terrain feature. For ice planets of the star system generator use the ice planet terrain table.",
  rows: d66(TERRAIN.map((t) => ({ label: t, result: { terrain: t } }))),
});

export const terrainIce: RollTable = table({
  id: "alien.world.terrain-ice",
  name: "Ice planet terrain",
  family: FAMILY,
  page: 240,
  dice: "2d6",
  rows: ranges(
    (
      [
        [2, "Huge impact crater"],
        [3, "Geysers spew water into low orbit from long fissures"],
        [4, "Deep fissures leading to a subsurface ocean"],
        [5, "Dramatically colored blue-green ice fissures"],
        [6, "Huge and active cryovolcano"],
        [7, "Vast range of ice mountains"],
        [8, "World-spanning super canyon"],
        [9, "Disturbing, wind-cut ice formations"],
        [10, "Black, dust-covered ice plains"],
        [11, "Impressive ice escarpment of great length"],
        [12, "Extensive dune-fields of methane sand grains"],
      ] as const
    ).map(([v, t]) => [v, v, t, { terrain: t }] as [number, number, string, Record<string, unknown>]),
  ),
});

export const colonySize: RollTable = table({
  id: "alien.world.colony-size",
  name: "Colony size",
  family: FAMILY,
  page: 240,
  dice: "2d6",
  notes:
    "Only for a colonized world. Modified by breathable atmosphere +1, corrosive or infiltrating −2, size 4,000 km or less −3. Population and the number of missions are rolled from the row's dice.",
  modifiers: [
    { when: isAtmo("breathable"), add: 1, label: "breathable atmosphere" },
    { when: isAtmo("corrosive", "infiltrating"), add: -2, label: "corrosive or infiltrating atmosphere" },
    { when: { "<=": [{ var: "size.diameterKm" }, 4000] }, add: -3, label: "size 4,000 km or less" },
  ],
  rows: ranges([
    [-99, 7, "Start-Up", { colonySize: "start-up", population: "3D6 x 10", populationDice: "3d6", populationMultiplier: 10, missions: "1", missionsDice: "1" }],
    [8, 10, "Young", { colonySize: "young", population: "3D6 x 100", populationDice: "3d6", populationMultiplier: 100, missions: "D3–1", missionsDice: "d3-1" }],
    [11, 99, "Established", { colonySize: "established", population: "2D6 x 1000", populationDice: "2d6", populationMultiplier: 1000, missions: "D3", missionsDice: "d3" }],
  ]),
});

export const colonyMission: RollTable = table({
  id: "alien.world.colony-mission",
  name: "Colony mission",
  family: FAMILY,
  page: 240,
  dice: "2d6",
  notes: "Modified by toxic, corrosive or infiltrating atmosphere +1, breathable atmosphere +1, start-up colony −1, established colony +4.",
  modifiers: [
    { when: isAtmo("toxic", "corrosive", "infiltrating"), add: 1, label: "toxic, corrosive or infiltrating atmosphere" },
    { when: isColony("start-up"), add: -1, label: "start-up colony" },
    { when: isAtmo("breathable"), add: 1, label: "breathable atmosphere" },
    { when: isColony("established"), add: 4, label: "established colony" },
  ],
  rows: ranges([
    [-99, 2, "Terraforming", { mission: "terraforming" }],
    [3, 3, "Research", { mission: "research" }],
    [4, 4, "Surveying and prospecting", { mission: "surveying-prospecting" }],
    [5, 5, "Prison or exile", { mission: "prison-exile" }],
    [6, 6, "Mining and refining", { mission: "mining-refining" }],
    [7, 7, "Mineral drilling", { mission: "mineral-drilling" }],
    [8, 8, "Communications relay", { mission: "communications-relay" }],
    [9, 9, "Military", { mission: "military" }],
    [10, 10, "Cattle ranching/logging", { mission: "ranching-logging" }],
    [11, 11, "Corporate HQ", { mission: "corporate-hq" }],
    [12, 99, "Government HQ", { mission: "government-hq" }],
  ]),
});

export const moons: RollTable = table({
  id: "alien.world.moons",
  name: "Moons (D3)",
  family: FAMILY,
  page: 240,
  dice: "1d3",
  notes: "Rolled by the orbital components result \"D3 moons\".",
  rows: ranges([
    [1, 1, "1 moon", { moons: 1 }],
    [2, 2, "2 moons", { moons: 2 }],
    [3, 3, "3 moons", { moons: 3 }],
  ]),
});

export const moonsUninhabited: RollTable = table({
  id: "alien.world.moons-uninhabited",
  name: "Moons of an uninhabited planet (D3−1)",
  family: FAMILY,
  page: 240,
  dice: "1d3-1",
  notes: "For an unexplored, uninhabited planet roll this instead of the orbital components table.",
  rows: ranges([
    [0, 0, "No moons", { moons: 0 }],
    [1, 1, "1 moon", { moons: 1 }],
    [2, 2, "2 moons", { moons: 2 }],
  ]),
});

/** Orbital component rows 2-11; the 12+ row differs between the first roll and the extra rolls. */
const ORBITAL_BASE = () =>
  ranges([
    [-99, 4, "Nothing", { component: "none" }],
    [5, 5, "Ring", { component: "ring" }],
    [6, 6, "Abandoned or repurposed satellite or space station", { component: "abandoned-station" }],
    [7, 8, "D3 moons", { component: "moons" }, { roll: [{ table: "alien.world.moons", as: "moons" }] }],
    [9, 9, "Survey station", { component: "survey-station" }],
    [10, 10, "Communications satellites", { component: "communications-satellites" }],
    [11, 11, "Transfer station", { component: "transfer-station" }],
  ]);

const ORBITAL_MODIFIERS = [
  { when: isColony("young"), add: 1, label: "young colony" },
  { when: isColony("established"), add: 2, label: "established colony" },
];

export const orbitalComponents: RollTable = table({
  id: "alien.world.orbital-components",
  name: "Orbital components",
  family: FAMILY,
  page: 240,
  dice: "2d6",
  notes: "Colonized worlds only (uninhabited planets roll D3−1 moons instead). Young colony +1, established colony +2. On 12+ roll D6 times on the extra-rolls table.",
  modifiers: ORBITAL_MODIFIERS,
  rows: [
    ...ORBITAL_BASE(),
    ...ranges([[12, 99, "Roll D6 times", { component: "multiple" }, { roll: [{ table: "alien.world.orbital-components-extra", as: "extra", times: "1d6" }] }]]),
  ],
});

export const orbitalComponentsExtra: RollTable = table({
  id: "alien.world.orbital-components-extra",
  name: "Orbital components (extra rolls)",
  family: FAMILY,
  page: 240,
  dice: "2d6",
  notes:
    "The same table, used for the D6 extra rolls. Module decision: a further 12+ here is left to the GM (add more components or ignore) instead of recursing.",
  modifiers: ORBITAL_MODIFIERS,
  rows: [...ORBITAL_BASE(), ...ranges([[12, 99, "Roll D6 times (GM adds more)", { component: "more" }, { gmDecides: true }]])],
});

export const factionCount: RollTable = table({
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

export const factionType: RollTable = table({
  id: "alien.world.faction-type",
  name: "Faction type",
  family: FAMILY,
  page: 241,
  dice: "1d6",
  notes: "`factionType` maps the book's faction to the faction entity's type.",
  rows: d6([
    { label: "Newcomers", result: { faction: "newcomers", factionType: "colonial" } },
    { label: "Corporate representatives", result: { faction: "corporate-representatives", factionType: "corporation" } },
    { label: "Scientists", result: { faction: "scientists", factionType: "other" } },
    { label: "Workers", result: { faction: "workers", factionType: "colonial" } },
    { label: "Security/military", result: { faction: "security-military", factionType: "military" } },
    { label: "Colonial leadership", result: { faction: "colonial-leadership", factionType: "government" } },
  ]),
});

const corp = (name: string) => ({ affiliation: name, affiliationType: "corporation" });

export const allegianceIcsc: RollTable = table({
  id: "alien.world.allegiance-icsc",
  name: "Colony allegiance (Independent Core System Colonies)",
  family: FAMILY,
  page: 241,
  dice: "3d6",
  notes: "UPP colonies always owe allegiance to the UPP and do not roll.",
  rows: ranges([
    [3, 4, "Kelland Mining", corp("Kelland Mining")],
    [5, 5, "GeoFund Investor", corp("GeoFund Investor")],
    [6, 6, "Gustafsson Enterprise", corp("Gustafsson Enterprise")],
    [7, 8, "Seegson", corp("Seegson")],
    [9, 9, "No allegiance (independent)", { affiliation: "No allegiance (independent)", affiliationType: "independent" }],
    [10, 12, "Jĭngtì Lóng Corporation", corp("Jĭngtì Lóng Corporation")],
    [13, 13, "Chigusa Corporation", corp("Chigusa Corporation")],
    [14, 14, "Lasalle Bionational", corp("Lasalle Bionational")],
    [15, 15, "Lorenz SysTech", corp("Lorenz SysTech")],
    [16, 16, "Gemini Exoplanet", corp("Gemini Exoplanet")],
    [17, 18, "Farside Mining", corp("Farside Mining")],
  ]),
});

export const allegianceArms: RollTable = table({
  id: "alien.world.allegiance-arms",
  name: "Colony allegiance (American or Anglo-Japanese Arm)",
  family: FAMILY,
  page: 241,
  dice: "3d6",
  notes: "A government representative means allegiance to the governing power of that Arm (United Americas or Three World Empire).",
  rows: ranges([
    [3, 4, "Kelland Mining", corp("Kelland Mining")],
    [5, 5, "GeoFund Investor", corp("GeoFund Investor")],
    [6, 6, "Gustafsson Enterprise", corp("Gustafsson Enterprise")],
    [7, 8, "Weyland-Yutani", corp("Weyland-Yutani")],
    [9, 9, "Seegson", corp("Seegson")],
    [10, 12, "Government representative", { affiliation: "Government representative", affiliationType: "government" }],
    [13, 13, "Chigusa Corporation", corp("Chigusa Corporation")],
    [14, 14, "Lasalle Bionational", corp("Lasalle Bionational")],
    [15, 15, "Jĭngtì Lóng Corporation", corp("Jĭngtì Lóng Corporation")],
    [16, 16, "Gemini Exoplanet", corp("Gemini Exoplanet")],
    [17, 18, "Farside Mining", corp("Farside Mining")],
  ]),
});

/** Campaign hooks (p. 242), paraphrased. */
const HOOKS = [
  "Thefts lead security to search quarters and lockers.",
  "Sabotage is on the rise; security suspects a coordinated effort.",
  "The Colonial Administration is probing the colony for illegal activity.",
  "Colonists back from the surface claim they saw a 'monster'.",
  "Petty crime, theft and sabotage are everywhere.",
  "Broken equipment has forced rationing; nerves are raw.",
  "A recently arrived ship brought a parasite that is about to spread.",
  "Cheap stolen goods are for sale.",
  "An old friend or flame is at the colony, unknown to the PCs.",
  "An old enemy or rival is at the colony, unknown to the PCs.",
  "A minor dignitary is visiting with aides or guards.",
  "Part of the colony is closed off for now, with no reason given.",
  "Free movement is suddenly restricted, unless the PCs find a way around it.",
  "An emergency has parts and vital supplies rushed in from a nearby colony.",
  "A local crisis is about to hit: storm, quake, riot, fire or similar.",
  "Solar flares cut communications for 2D6 hours (2D6 days around an MV star).",
  "Spies from a neighboring colony have been caught and arrested.",
  "The operations manager and the deputy are feuding; everyone picks a side.",
  "An invitation arrives: a formal dinner, meeting or party.",
  "The local colonists are not what they appear to be.",
  "A military ship is in orbit; its landing party hunts for someone or something.",
  "A rival colony or corporation is about to commit sabotage.",
  "The spaceport is under quarantine.",
  "The colony has a security situation.",
  "Asteroid miners on leave are causing trouble.",
  "A mystery ship has set down at the spaceport.",
  "Civil unrest is about to break out.",
  "Colonists stranded far from the settlement need rescue.",
  "The authorities have locked the colony down after a riot.",
  "A religious leader is stirring up discontent.",
  "Angry locals harass the PCs. Why, and why at off-worlders?",
  "An overland expedition is being put together, and the PCs are invited.",
  "A senior colonial official is murdered an hour after the PCs arrive.",
  "Several colonists are missing and a search is under way.",
  "A lifeboat crashed on the planet carrying an interesting passenger.",
  "The colony's backer keeps sending teams to search remote areas, without saying for what.",
];

export const campaignHook: RollTable = table({
  id: "alien.world.campaign-hook",
  name: "Campaign hooks",
  family: FAMILY,
  page: 242,
  dice: "d66",
  rows: d66(HOOKS.map((h) => ({ label: h, result: { hook: h } }))),
});

/** Suggested planet names (p. 236). Unsurveyed bodies stay unnamed; surveyed ones get an LV-### designation. */
export const PLANET_NAMES: readonly string[] = [
  "Hannibal", "Hephaestus", "Monos", "Damnation", "Requiem", "Cerberus", "Nakaya", "Doramin", "Phaeton", "Solitude", "Nocturne",
  "Euphrates", "Prospero", "Nemesis", "Magdala", "Moab", "Hamilton", "Gorgon", "Tracatus", "Napier", "Aurora", "Medea",
];

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
  moons,
  moonsUninhabited,
  factionCount,
  factionType,
  allegianceArms,
  allegianceIcsc,
  campaignHook,
];
