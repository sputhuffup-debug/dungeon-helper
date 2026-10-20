import type { RuleCard } from "@campaign-forge/module-sdk";
import { card } from "./card";

/** Chapter 6: space travel and spacecraft basics (p. 108-127). */
export const spaceTravelRules: RuleCard[] = [
  card("space-travel", "Space travel", "Faster-than-light drives, hypersleep and terraforming carried humanity to the stars, but trips still take weeks or years. Travel covers FTL journeys, overcharging engines, planetfall, hypersleep and the disorders of staying awake at FTL speed.", [108, 110], {
    tags: ["space", "travel"],
    links: { rules: ["alien.rule.ftl-travel", "alien.rule.hypersleep", "alien.rule.ndd", "alien.rule.docking-landing"] },
  }),
  card("ftl-travel", "FTL travel", "A ship's FTL rating is the number of days it needs to cross one parsec, and no ship is rated below 1. Multiply it by the distance in parsecs: rating 6 over 9 parsecs takes 54 days.", 108, {
    tags: ["space", "travel"],
    links: { rules: ["alien.rule.hypersleep", "alien.rule.system-distance", "alien.rule.overcharging-engines"] },
  }),
  card("overcharging-engines", "Overcharging engines", "Once a week an engineer may spend a shift and roll Heavy Machinery to cut the FTL rating by 1 for a week. A failure causes a reactor leak and another roll; failing that causes a reactor breach and a third roll, and a third failure destroys the ship.", [108, 109], {
    tags: ["space", "travel"],
    links: { rules: ["alien.rule.ftl-travel", "alien.rule.ship-critical-damage"] },
  }),
  card("docking-landing", "Planetfall", "Landing a ship with planetfall capacity takes about a shift and a Piloting roll. A failure means minor component damage and a choice to abort or try again; a second failure means major component damage, and a third crashes the ship with all aboard. Docking with another ship is a combat-phase action that needs a docking module.", 109, {
    tags: ["space", "travel"],
    links: { rules: ["alien.rule.ship-critical-damage", "alien.rule.ship-actions"] },
  }),
  card("hypersleep", "Hypersleep", "Stasis protects travellers from neurological distortion and slows ageing. Any time in hypersleep leaves you fatigued until you have been awake a shift and eaten well, or taken Hydr8tion, and a rude awakening is an attack of six base dice at base damage 1 that armor does not stop.", [109, 110], {
    tags: ["space", "travel"],
    links: { rules: ["alien.rule.ftl-travel", "alien.rule.fatigue", "alien.rule.ndd", "alien.rule.pharmaceuticals"] },
  }),
  card("ndd", "Neurological distortion disorder", "Anyone awake during FTL travel rolls D6 after each period of days equal to the ship's FTL rating, adding +1 per roll after the first. Results run from no effect (1-5) through paranoia, epileptic seizures and dementia to psychosis (12+), which sends you into a violent rampage that triggers panic rolls.", 109, {
    tags: ["space", "travel", "stress"],
    links: { tables: ["alien.travel.ndd"], rules: ["alien.rule.hypersleep", "alien.rule.ftl-travel"] },
  }),
  card("arrival", "Arriving after FTL travel", "Travel time is the FTL rating times the parsecs. On arrival, sleepers come out of hypersleep fatigued, those who stayed awake have made their distortion rolls, and every day awake used a day of food and water each. Crew in cryo eat nothing.", [108, 110], {
    tags: ["space", "travel", "supply"],
    links: { tables: ["alien.travel.ndd"], fields: ["alien.spaceship.provisions"], rules: ["alien.rule.ftl-travel", "alien.rule.hypersleep", "alien.rule.ndd", "alien.rule.food-water", "alien.rule.fatigue"] },
  }),
  card("system-distance", "Distance to the job", "The job generator rolls D6−1 for how many systems away the destination lies, and 0 means the same system. Pick a matching system on the star map and work out travel time from the FTL rating.", 244, {
    tags: ["space", "travel", "campaign"],
    links: { rules: ["alien.rule.ftl-travel", "alien.rule.jobs"] },
  }),
  card("ship-classes", "Ship classes", "Commercial craft are classed by size: C, G, J, M, R, U and X. Each class gives typical length, crew, FTL rating, Signature, Thrusters, Hull, armament and module slots by size, and price; individual ships vary.", 121, {
    tags: ["space", "ships"],
    links: { rules: ["alien.rule.ship-modules", "alien.rule.ship-armaments"] },
  }),
  card("ship-sensors", "Sensors and transponders", "All ship sensors reach Extreme range (8 segments), and ships in range detect each other automatically unless one runs dark. Civilian ships must broadcast a transponder, which makes them targetable at once; a ship running silent must be target-locked first.", 141, {
    tags: ["space", "ships", "combat"],
    links: { rules: ["alien.rule.running-dark", "alien.rule.ship-combat", "alien.rule.ship-actions"] },
  }),
  card("running-dark", "Running dark", "Powering down sensors (−1 Signature) and engines (−2) before entering sensor range lets a ship avoid detection, unless it has stealth technology. The other ship's science officer then makes a passive Comtech roll each stretch, modified by that Signature, to spot it.", 141, {
    tags: ["space", "ships", "combat"],
    links: { rules: ["alien.rule.ship-sensors", "alien.rule.passive-rolls"] },
  }),
  card("ship-crew-roles", "Crew positions", "Space combat uses crew positions: one executive officer (Command, initiative), one navigation officer (Piloting plus Thrusters), one science officer (Comtech for sensors), and any number of engineers (Heavy Machinery or Comtech) and gunners (Ranged Combat). One person can fill several posts, and a ship's AI can fill any of them.", 140, {
    tags: ["space", "ships", "combat"],
    links: { rules: ["alien.rule.ship-combat", "alien.rule.ship-actions"] },
  }),
  card("ship-ai", "Ship computers", "Mainframes such as MU/TH/UR or Seegson's A.P.O.L.L.O. run a ship while the crew sleeps and roll their own skills, such as Comtech, Piloting and Observation. Direct access to the core is usually limited to the commanding officer.", [92, 122], {
    tags: ["space", "ships"],
    links: { rules: ["alien.rule.ship-modules", "alien.rule.ship-crew-roles"] },
  }),
  card("life-support", "Air scrubbers", "Air scrubber modules keep the crew breathing and are sized by how many people they serve. If they go offline from damage, Stamina rolls get −2 dice for a shift before the air gives out completely.", [122, 145], {
    tags: ["space", "ships", "supply"],
    links: { rules: ["alien.rule.ship-modules", "alien.rule.ship-critical-damage", "alien.rule.suffocation"] },
  }),
];
