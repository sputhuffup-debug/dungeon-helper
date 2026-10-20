import type { RuleCard } from "@campaign-forge/module-sdk";
import { card } from "./card";

/** Spaceship parts (p. 121-127) and space combat (p. 140-149). */
export const shipRules: RuleCard[] = [
  card("ship-combat", "Space combat", "Ship fights are short duels between two fleets, played in stretches on a one-dimensional track of segments. Each crew member takes one action per stretch according to their post, with no full or quick actions. The engagement ends when the ships are more than 8 segments apart.", [140, 149], {
    tags: ["space", "ships", "combat"],
    links: { rules: ["alien.rule.ship-combat-round", "alien.rule.ship-actions", "alien.rule.ship-damage", "alien.rule.ship-crew-roles", "alien.rule.ship-sensors"] },
  }),
  card("ship-combat-round", "Initiative and phases", "After detection the executive officers make an open, opposed Command roll; the winner picks whether their side acts first or last in every phase for the whole fight. Each stretch runs five phases (command, sensors, movement, attack, engineering) and ships move by their approach velocity at the end of the movement phase.", 142, {
    tags: ["space", "ships", "combat"],
    links: { rules: ["alien.rule.ship-combat", "alien.rule.ship-actions"] },
  }),
  card("ship-actions", "Ship actions by phase", "The executive officer rolls Command to hand out bonus dice. The science officer target-locks with Comtech, evades locks, or switches sensors; the navigation officer speeds up, slows down, rams or docks with Piloting plus Thrusters. One gunner fires a locked target or launches countermeasures, and one engineer patches damage, toggles the engines, opens a docked airlock or overloads the reactor.", [143, 144], {
    tags: ["space", "ships", "combat"],
    links: { rules: ["alien.rule.ship-combat", "alien.rule.ship-crew-roles", "alien.rule.ship-sensors"] },
  }),
  card("ship-space-panic", "Stress and panic in space combat", "In a space fight stress rises only from pushing, stress effects and minor component damage, and stress cannot be relieved. Major damage, a disabled ship or a crewmate bailing out triggers panic on a short table: Spooked, Freeze, Bail Out for an escape pod, or Catatonic.", 144, {
    tags: ["space", "ships", "combat", "stress"],
    links: { rules: ["alien.rule.ship-combat", "alien.rule.panic-roll"] },
  }),
  card("ship-armaments", "Ship armaments", "Armaments sit on external hardpoints by size: offensive missiles, railguns, particle beams, mines and nukes, and defensive decoys, drones and CIWS lasers. Particle beams ignore countermeasures, weaken with range and cause only component damage, and armaments cannot target individuals.", [124, 126], {
    tags: ["space", "ships", "combat", "gear"],
    links: { rules: ["alien.rule.ship-damage", "alien.rule.ship-classes"] },
  }),
  card("ship-damage", "Ship damage", "Armor reduces each hit just as for people. A hit below half the Hull rating (rounded up) causes minor component damage, half or more causes major component damage, and a single hit of the full Hull destroys the ship. Once total damage reaches Hull, the ship is disabled and decompresses but can be repaired.", [144, 146], {
    tags: ["space", "ships", "combat", "damage"],
    links: { fields: ["alien.spaceship.hullDamage"], rules: ["alien.rule.ship-critical-damage", "alien.rule.ship-repairs"] },
  }),
  card("ship-critical-damage", "Component damage", "Minor damage rolls D66 on one table (from a broken coffee maker to decompression or a reactor leak); major damage rolls 2D6 on another (from AI failure to reactor detonation). Each entry names the repair rolls it needs, and any component damage gives the crew +1 stress.", [145, 146], {
    tags: ["space", "ships", "combat", "damage"],
    links: { tables: ["alien.ship.minor-damage", "alien.ship.major-damage"], fields: ["alien.spaceship.componentDamage"], rules: ["alien.rule.ship-damage", "alien.rule.ship-repairs"] },
  }),
  card("ship-repairs", "Ship repairs", "Hull repair is one Heavy Machinery roll per shift, each success restoring a point. Component repairs need the listed rolls plus a mechanical or electronic spare part per roll; in combat, emergency repairs take a stretch, need no parts and hold for one shift.", [146, 147], {
    tags: ["space", "ships"],
    links: { fields: ["alien.spaceship.hullDamage", "alien.spaceship.componentDamage"], rules: ["alien.rule.ship-damage", "alien.rule.ship-critical-damage", "alien.rule.spare-parts"] },
  }),
  card("spare-parts", "Spare parts", "Parts come mechanical or electronic: each Heavy Machinery repair roll needs a mechanical part and each Comtech roll an electronic one, used up on a success. A mechanical part costs about $100,000 in port and an electronic one about twice that. A shift and the matching skill roll salvages one part from a derelict, up to its full Hull score in all, half of each kind.", 147, {
    tags: ["space", "ships", "gear"],
    links: { fields: ["alien.spaceship.spareParts"], rules: ["alien.rule.ship-repairs"] },
  }),
  card("ship-modules", "Internal modules", "Modules are optional, replaceable rooms sized I to V, such as AI, air scrubbers, cargo bay, cryo deck, docking umbilical, escape vehicles, galley, hangar, medlab, science lab or vehicle bay. A smaller module fits a bigger slot but not the reverse.", [122, 124], {
    tags: ["space", "ships"],
    links: { rules: ["alien.rule.ship-classes", "alien.rule.ship-upgrades"] },
  }),
  card("ship-upgrades", "Ship upgrades", "Upgrades buy extra hardpoints, armored bulkheads, boosted drives, enhanced sensors, external modules, stronger thrusters, stealth technology and similar improvements. Refits need a dry dock and take a week or more.", [126, 127], {
    tags: ["space", "ships"],
    links: { rules: ["alien.rule.ship-modules"] },
  }),
  card("ship-ownership", "Owning a ship", "Ships are hugely expensive, so most belong to corporations or the military and their crews are employees or hired hands. A company may lease a ship to a proven crew for about 2% of its price a year, with an option to buy.", 121, {
    tags: ["space", "ships", "campaign"],
    links: { fields: ["alien.spaceship.ownership"], rules: ["alien.rule.job-frames", "alien.rule.campaign-structure", "alien.rule.starting-ship"] },
  }),
  card("starting-ship", "Starting spaceship", "Give the PCs a ship from the start so they can roam the star map. Employees are assigned one and must look after it; freelancers may lease or own theirs and spend what they earn on repairs and upgrades, which can become a game of its own.", 234, {
    tags: ["space", "ships", "campaign"],
    links: { rules: ["alien.rule.ship-ownership", "alien.rule.job-frames"] },
  }),
];
