import type { RuleCard } from "@campaign-forge/module-sdk";
import { card } from "./card";

export const spaceTravelRules: RuleCard[] = [
  card("space-travel", "Space travel", "Travel is split into in-system transits measured in hours or days and FTL jumps measured in days per parsec. The crew usually sleeps through the long stretches.", [121, 137], {
    tags: ["space", "travel"],
    links: { rules: ["alien.rule.ftl-travel", "alien.rule.hypersleep", "alien.rule.system-distance"] },
  }),
  card("ship-classes", "Ship classes", "Ships are classed by letter (C, G, J, M, R, U, X) from small craft to huge haulers and military vessels. Class sets crew, hull and what modules fit.", [121, 122], {
    tags: ["space", "ships"],
    links: { rules: ["alien.rule.ship-modules"] },
  }),
  card("ftl-travel", "FTL travel", "A ship's FTL rating is how many days it needs per parsec. Multiply by the distance in parsecs for the trip length; the crew enters hypersleep for anything long.", 131, {
    tags: ["space", "travel"],
    links: { rules: ["alien.rule.hypersleep", "alien.rule.system-distance"] },
  }),
  card("system-distance", "Distance between systems", "The job generator rates distance 0 to 5 systems away; the map gives parsecs. Longer trips mean more supply rolls, more encounters and more time for things to go wrong.", [131, 244], {
    tags: ["space", "travel", "campaign"],
    links: { rules: ["alien.rule.ftl-travel", "alien.rule.encounter-cadence", "alien.rule.jobs"] },
  }),
  card("hypersleep", "Hypersleep", "Cryo tubes keep the crew alive across months of travel. Waking is slow and unpleasant; an emergency wake-up costs stress, and a faulty tube is a classic disaster.", 132, {
    tags: ["space", "travel"],
    links: { rules: ["alien.rule.ftl-travel", "alien.rule.stress"] },
  }),
  card("ship-sensors", "Sensors and signature", "Detecting another ship is a Comtech roll modified by the target's signature and distance. A low signature ship is hard to see until it is close.", 138, {
    tags: ["space", "ships", "combat"],
    links: { rules: ["alien.rule.ship-combat"] },
  }),
  card("ship-crew-roles", "Crew roles", "During ship actions each character takes a station: pilot, sensor operator, gunner or engineer. Each role has its own actions and skill.", 138, {
    tags: ["space", "ships", "combat"],
    links: { rules: ["alien.rule.ship-combat", "alien.rule.ship-actions"] },
  }),
  card("ship-ai", "Ship AI", "Most ships carry an AI mainframe such as a MU/TH/UR model. It answers questions, runs systems and may hold orders the crew is not meant to see.", 133, {
    tags: ["space", "ships"],
    links: { rules: ["alien.rule.ship-modules"] },
  }),
  card("docking-landing", "Docking and landing", "Docking or landing in bad conditions calls for a Piloting roll modified by the ship's Maneuverability; failure damages the hull or strands the ship.", 126, {
    tags: ["space", "travel"],
    links: { rules: ["alien.rule.ship-damage"] },
  }),
  card("life-support", "Life support", "A ship's life support covers its crew and passengers; damage or overcrowding forces air supply rolls for everyone aboard.", 133, {
    tags: ["space", "ships", "supply"],
    links: { rules: ["alien.rule.air-supply", "alien.rule.ship-modules"] },
  }),
];
