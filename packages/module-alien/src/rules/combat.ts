import type { RuleCard } from "@campaign-forge/module-sdk";
import { F, T, TR, card } from "./card";

export const combatRules: RuleCard[] = [
  card("time-units", "Rounds, Stretches and Shifts", "Time is measured in Rounds (5 to 10 seconds, used in combat), Stretches (5 to 10 minutes, used in stealth and exploration) and Shifts (5 to 10 hours, used for travel, rest and healing).", 55, {
    tags: ["combat", "time"],
    links: { trackers: [TR.clock, TR.countdown] },
  }),
  card("zones", "Zones", "Maps are divided into zones. A cluttered zone has cover and things to hide behind; an open zone has none. Borders between zones are open, blocked or doors.", [54, 56], {
    tags: ["combat", "map"],
    links: { rules: ["alien.rule.range-bands", "alien.rule.cover", "alien.rule.stealth-mode"], trackers: [TR.stealth] },
  }),
  card("range-bands", "Range bands", "Five ranges: Engaged (arm's reach), Short (same zone), Medium (adjacent zone), Long (a few zones) and Extreme (far beyond). Weapons list a maximum range and sometimes a minimum.", 55, {
    tags: ["combat", "map"],
    links: { rules: ["alien.rule.zones", "alien.rule.attack-ranged"] },
  }),
  card("cover", "Cover", "Shooting at a target behind cover in a cluttered zone costs a success or gives the target an armor-like protection from the obstacle, depending on what they hide behind.", 56, {
    tags: ["combat", "map"],
    links: { rules: ["alien.rule.zones", "alien.rule.attack-ranged"] },
  }),
  card("darkness", "Darkness", "Rolls that depend on sight suffer a penalty in darkness; a light source gives you away in stealth mode.", 57, {
    tags: ["combat", "stealth"],
    links: { rules: ["alien.rule.stealth-mode"] },
  }),
  card("stealth-mode", "Stealth mode", "When something is hunting the crew, play moves in Stretches. Hidden figures start unseen; each Stretch they may move one zone, and sneaking (Mobility) is opposed by spotting (Observation). Active hunters seek, passive ones wait.", [55, 58], {
    tags: ["combat", "stealth"],
    links: { rules: ["alien.rule.zones", "alien.rule.ambush", "alien.rule.darkness"], trackers: [TR.stealth, TR.clock] },
  }),
  card("stealth-simplified", "Simplified stealth", "The GM may skip hidden movement and instead roll once for the hunter to decide whether it reaches the crew this Stretch.", 58, {
    tags: ["combat", "stealth", "gm"],
    links: { rules: ["alien.rule.stealth-mode"], trackers: [TR.stealth] },
  }),
  card("ambush", "Ambush and surprise", "A hidden attacker who reaches engaged range unnoticed acts first and the victims roll for panic; otherwise initiative is drawn as usual.", 58, {
    tags: ["combat", "stealth"],
    links: { rules: ["alien.rule.initiative", "alien.rule.panic-triggers"] },
  }),
  card("initiative", "Initiative cards", "At the start of combat each combatant draws one card numbered 1 to 10 and acts in that order; creatures draw one card per point of Speed and act on each. Cards can be swapped with a willing ally or stolen by talents.", 59, {
    tags: ["combat", "initiative"],
    links: { rules: ["alien.rule.creature-speed", "alien.rule.actions"], trackers: [TR.initiative] },
  }),
  card("actions", "Actions in a round", "Each round you get one slow action and one fast action, or two fast actions. Slow actions are the big moves (attack, aim-and-shoot, first aid); fast actions are quick (move, draw, block, aim).", [59, 61], {
    tags: ["combat", "actions"],
    links: { rules: ["alien.rule.fast-actions", "alien.rule.slow-actions", "alien.rule.initiative"] },
  }),
  card("fast-actions", "Fast actions", "Move one zone, run within a zone, take cover, draw a weapon, aim, block, dodge, grab an item, say a few words, overwatch and the like.", 60, {
    tags: ["combat", "actions"],
    links: { rules: ["alien.rule.actions"] },
  }),
  card("slow-actions", "Slow actions", "Attack in close combat, shoot, reload, give first aid, manipulate or command, use heavy machinery, climb, pilot through danger and similar efforts that take the whole round.", 61, {
    tags: ["combat", "actions"],
    links: { rules: ["alien.rule.actions"] },
  }),
  card("attack-close", "Close combat attacks", "At engaged range roll Close Combat; the defender may block with Close Combat or dodge with Mobility as a reaction. Extra successes add damage or special effects like disarm or knockdown.", 61, {
    tags: ["combat", "attack"],
    links: { rules: ["alien.rule.block-dodge", "alien.rule.damage-armor", "alien.rule.grappling"] },
  }),
  card("grappling", "Grappling", "A close combat success can pin an opponent instead of hurting them; the victim breaks free with an opposed Close Combat roll.", 61, {
    tags: ["combat", "attack"],
    links: { rules: ["alien.rule.attack-close"] },
  }),
  card("block-dodge", "Block and dodge", "A reaction that costs your fast action: block an engaged attack with Close Combat, or dodge with Mobility. You cannot dodge bullets at short range.", [61, 62], {
    tags: ["combat", "defence"],
    links: { rules: ["alien.rule.attack-close", "alien.rule.fast-actions"] },
  }),
  card("attack-ranged", "Ranged attacks", "Roll Ranged Combat with the weapon's bonus, adjusted for range: easier when aiming, harder at long and extreme range or at a moving target. Engaged-range shooting is penalised.", 62, {
    tags: ["combat", "attack"],
    links: { rules: ["alien.rule.range-bands", "alien.rule.full-auto", "alien.rule.damage-armor"] },
  }),
  card("full-auto", "Full auto", "Weapons with the full auto tag can spray: more dice, but every shot drains ammo and raises stress. A burst may hit several targets in a zone.", 62, {
    tags: ["combat", "attack", "gear"],
    links: { rules: ["alien.rule.attack-ranged", "alien.rule.ammo-supply", "alien.rule.stress"] },
  }),
  card("explosions", "Explosions and blast", "Grenades and blasts roll a fixed number of dice against everyone in the zone; cover reduces the dice. Blast damage ignores dodging.", 63, {
    tags: ["combat", "attack", "gear"],
    links: { rules: ["alien.rule.damage-armor", "alien.rule.cover"] },
  }),
  card("damage-armor", "Damage and armor", "A hit deals the weapon's damage plus one per extra success spent. Roll armor dice equal to the Armor Rating; each 6 stops a point. Armor piercing weapons halve the armor dice.", [62, 66], {
    tags: ["combat", "damage"],
    links: { rules: ["alien.rule.armor", "alien.rule.weapons", "alien.rule.broken", "alien.rule.critical-injuries"] },
  }),
  card("damage-types", "Stun, fire and energy damage", "Stun damage knocks out instead of killing. Fire keeps burning each round until put out. Energy weapons ignore some armor and start fires.", 63, {
    tags: ["combat", "damage"],
    links: { rules: ["alien.rule.damage-armor"] },
  }),
  card("weapons", "Weapons", "A weapon lists a bonus (dice added), damage, range, special tags (armor piercing, full auto, single shot, stun, fire) and supply ratings for ammo or power.", [82, 93], {
    tags: ["combat", "gear"],
    links: { rules: ["alien.rule.damage-armor", "alien.rule.ammo-supply", "alien.rule.range-bands"] },
  }),
  card("armor", "Armor", "Armor has an Armor Rating rolled as dice against each hit; heavy suits also carry an air supply and weigh more. Damaged armor can lose rating.", 66, {
    tags: ["combat", "gear", "damage"],
    links: { rules: ["alien.rule.damage-armor", "alien.rule.air-supply"] },
  }),
  card("broken", "Broken", "At zero Health you are Broken: you roll a critical injury, cannot act beyond crawling and speaking, and may die if the injury is fatal and untreated.", 67, {
    tags: ["combat", "damage"],
    links: { fields: [F.criticalInjuries], rules: ["alien.rule.critical-injuries", "alien.rule.healing", "alien.rule.death"] },
  }),
  card("critical-injuries", "Critical injuries", "When Broken, roll D66 on the critical injury table. Each entry says whether it is fatal, how long you have, what it does and how it heals. Some injuries also force a panic roll.", [69, 70], {
    tags: ["combat", "damage"],
    links: { tables: [T.criticalInjury], fields: [F.criticalInjuries], rules: ["alien.rule.broken", "alien.rule.healing"] },
  }),
  card("death", "Death", "A fatal critical injury kills when its time limit runs out unless a Medical Aid roll succeeds; a second fatal injury while Broken kills outright. Some results are instantly fatal.", 70, {
    tags: ["combat", "damage"],
    links: { rules: ["alien.rule.critical-injuries"] },
  }),
  card("healing", "Healing", "A Broken character regains one Health from a successful Medical Aid roll or after a Shift of rest. Lost Health otherwise returns over Shifts; critical injuries heal on their own timetable, faster with care.", 67, {
    tags: ["combat", "damage", "recovery"],
    links: { rules: ["alien.rule.broken", "alien.rule.critical-injuries", "alien.rule.medical-equipment"] },
  }),
  card("vehicles", "Vehicles", "Vehicles have Maneuverability (a Piloting modifier), Speed, Hull (their health), Armor and passengers. Hits roll armor like a character; at zero Hull the vehicle is wrecked.", [100, 105], {
    tags: ["combat", "vehicles"],
    links: { rules: ["alien.rule.damage-armor"] },
  }),
];
