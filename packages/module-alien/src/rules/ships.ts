import type { RuleCard } from "@campaign-forge/module-sdk";
import { card } from "./card";

export const shipRules: RuleCard[] = [
  card("ship-combat", "Ship combat basics", "Ship fights run in rounds at ranges measured in zones of space. Each round the crew acts in their roles: the pilot manoeuvres, sensors lock on, gunners fire, engineers patch. Thrusters set how many manoeuvres a ship can afford.", [138, 146], {
    tags: ["space", "ships", "combat"],
    links: { rules: ["alien.rule.ship-combat-round", "alien.rule.ship-actions", "alien.rule.ship-damage", "alien.rule.ship-crew-roles"] },
  }),
  card("ship-combat-round", "The ship combat round", "Each round: compare initiative, resolve manoeuvres with opposed Piloting, then fire weapons that have a lock, then apply damage and repairs.", 139, {
    tags: ["space", "ships", "combat"],
    links: { rules: ["alien.rule.ship-combat"] },
  }),
  card("ship-actions", "Ship actions", "Pilot: accelerate, evade, ram, flee. Sensor operator: target lock, jam, scan. Gunner: fire a weapon. Engineer: reroute power, repair, overload. Each is one roll by one crew member.", 140, {
    tags: ["space", "ships", "combat"],
    links: { rules: ["alien.rule.ship-combat", "alien.rule.ship-crew-roles"] },
  }),
  card("ship-armaments", "Ship armaments", "Ship weapons list a bonus, damage against hulls, a range and special tags; missiles and railguns differ in ammo, range and what they do to armor.", [136, 137], {
    tags: ["space", "ships", "combat", "gear"],
    links: { rules: ["alien.rule.ship-damage"] },
  }),
  card("ship-damage", "Ship damage", "A hit rolls the ship's Armor Rating; what gets through reduces Hull. At zero Hull the ship is crippled or destroyed. Large hits also roll on the component damage table.", 143, {
    tags: ["space", "ships", "combat", "damage"],
    links: { rules: ["alien.rule.ship-critical-damage", "alien.rule.ship-repairs"] },
  }),
  card("ship-critical-damage", "Component damage", "Hits that get through may knock out a specific system: thrusters, sensors, life support, a weapon, the reactor. Each has its own consequences and repair difficulty.", 144, {
    tags: ["space", "ships", "combat", "damage"],
    links: { rules: ["alien.rule.ship-damage", "alien.rule.ship-repairs"] },
  }),
  card("ship-repairs", "Ship repairs", "Patching a damaged component is a Heavy Machinery roll that takes a Round in combat or a Shift at rest; a full refit needs a dock and money.", 146, {
    tags: ["space", "ships"],
    links: { rules: ["alien.rule.ship-damage"] },
  }),
  card("ship-modules", "Spaceship modules", "A ship's interior is a set of modules: bridge, quarters, cryo deck, medlab, cargo, workshop, reactor and more. Each gives an ability or a bonus and some can be bought or lost.", [128, 133], {
    tags: ["space", "ships"],
    links: { rules: ["alien.rule.ship-classes", "alien.rule.ship-upgrades"] },
  }),
  card("ship-upgrades", "Ship upgrades", "Upgrades improve a stat or add a capability: better sensors, armor plating, extra thrusters, stealth coatings. Each has a cost and sometimes a class limit.", [134, 135], {
    tags: ["space", "ships"],
    links: { rules: ["alien.rule.ship-modules"] },
  }),
  card("ship-ownership", "Owning a ship", "Campaign crews rarely own their ship outright; a loan, a corporate lease or a military charter sets who can tell them where to go and what the running costs are.", 123, {
    tags: ["space", "ships", "campaign"],
    links: { rules: ["alien.rule.job-frames", "alien.rule.campaign-structure"] },
  }),
];
