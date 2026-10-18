import type { RuleCard } from "@campaign-forge/module-sdk";
import { F, T, TR, card } from "./card";

/** Chapter 4: space and time, stealth, combat, damage and hazards (p. 54-79). */
export const combatRules: RuleCard[] = [
  card("time-units", "Measuring time", "Three units of time: the round (5 to 10 seconds) for combat, the stretch (5 to 10 minutes) for stealth, and the shift (5 to 10 hours) for recovery and repairs. Exact lengths vary with the situation.", 55, {
    tags: ["combat", "time"],
    links: { rules: ["alien.rule.countdowns"], trackers: [TR.clock, TR.countdown] },
  }),
  card("zones", "Zones and line of sight", "Maps are split into zones from a few steps up to about 25 meters across. A zone is cluttered (things to hide or take cover behind) or open, and each border is open or blocked, possibly with a door or hatch. Everyone in a zone sees each other except hidden characters, those in full cover and people in crawlspaces.", [54, 55], {
    tags: ["combat", "map"],
    links: { rules: ["alien.rule.range-bands", "alien.rule.cover", "alien.rule.stealth-mode"], trackers: [TR.stealth] },
  }),
  card("range-bands", "Range", "Five range bands: Adjacent (in your face), Short (same zone), Medium (the next zone), Long (up to four zones) and Extreme (farther). Weapons have a minimum and a maximum range.", 55, {
    tags: ["combat", "map"],
    links: { rules: ["alien.rule.zones", "alien.rule.attack-ranged", "alien.rule.weapons"] },
  }),
  card("stealth-mode", "Stealth mode", "Exploration with enemies about runs in stretches: each stretch PCs may move one zone, then the GM moves NPCs on a hidden map, with Xenomorphs moving one zone per point of Speed. Active enemies hunt or hide, passive ones wait until alerted. On coming into sight, both sides make a passive, open, opposed Observation roll.", [55, 56], {
    tags: ["combat", "stealth"],
    links: { rules: ["alien.rule.zones", "alien.rule.detection", "alien.rule.passive-rolls", "alien.rule.creature-speed"], trackers: [TR.stealth, TR.clock] },
  }),
  card("detection", "Detection and hiding", "Whoever wins the opposed Observation roll can reveal themselves, ambush, hide in the zone or back out; a tie means initiative. Hiding takes a stretch and needs a cluttered zone, and a hidden character is only found by a searching Observation roll. Standing guard for a stretch gives +2 dice to spot anything arriving.", [56, 58], {
    tags: ["combat", "stealth"],
    links: { rules: ["alien.rule.stealth-mode", "alien.rule.ambush", "alien.rule.darkness"], trackers: [TR.stealth] },
  }),
  card("crawlspaces", "Crawlspaces", "Air shafts are entered at marked access points and count as open zones, and inside them other characters block both movement and line of sight. Sealing an access point with a cutting torch stops even a Xenomorph, though acid blood can burn a new opening.", 56, {
    tags: ["combat", "stealth", "map"],
    links: { rules: ["alien.rule.zones", "alien.rule.stealth-mode"] },
  }),
  card("stealth-simplified", "Simplified stealth mode", "Without room for a hidden map, only the PCs follow the stealth movement rules, and NPCs and motion tracker pings appear wherever and whenever the GM decides.", 56, {
    tags: ["combat", "stealth", "gm"],
    links: { rules: ["alien.rule.stealth-mode"], trackers: [TR.stealth] },
  }),
  card("darkness", "Darkness", "In very dim zones humans and androids roll Observation with −2 dice; Xenomorphs are unaffected. A flashlight removes the penalty for that zone.", 57, {
    tags: ["combat", "stealth"],
    links: { rules: ["alien.rule.stealth-mode", "alien.rule.detection"] },
  }),
  card("motion-tracker", "Motion trackers", "A motion tracker can be used once per stretch after a power supply roll. It detects every NPC within range (Long, up to four zones, for the M314) even out of sight, but only those that moved in the previous stretch, and a ping is not the same as seeing them.", 58, {
    tags: ["combat", "stealth", "gear"],
    links: { rules: ["alien.rule.stealth-mode", "alien.rule.power-supply"], trackers: [TR.stealth] },
  }),
  card("social-mode", "Social mode", "Talking with NPCs, relieving stress or doing a long task pauses stealth mode; the GM estimates the stretches that pass and keeps moving NPCs on the hidden map.", 58, {
    tags: ["combat", "stealth"],
    links: { rules: ["alien.rule.stealth-mode", "alien.rule.stress-recovery"] },
  }),
  card("initiative", "Drawing initiative", "Each round every combatant draws one of ten cards numbered 1 to 10 and acts in that order, with the GM drawing for NPCs, a whole group possibly sharing one card. Xenomorphs draw one card per point of Speed. Groups may choose to draw only in the first round.", 59, {
    tags: ["combat", "initiative"],
    links: { rules: ["alien.rule.creature-speed", "alien.rule.actions", "alien.rule.holding-off"], trackers: [TR.initiative] },
  }),
  card("ambush", "Surprise and ambush", "A surprise attacker takes the #1 initiative card in the first round, several attackers the lowest cards. An ambush on unaware targets also gives the attacks +2 dice, and the targets cannot defend or dodge.", 59, {
    tags: ["combat", "stealth", "initiative"],
    links: { rules: ["alien.rule.initiative", "alien.rule.detection"], trackers: [TR.initiative] },
  }),
  card("holding-off", "Holding off", "On your turn you may swap initiative cards with anyone who has not yet acted, and they must act at once. Interrupt actions already spent stay spent; with a multi-card Xenomorph you choose which later card to take.", 59, {
    tags: ["combat", "initiative"],
    links: { rules: ["alien.rule.initiative"], trackers: [TR.initiative] },
  }),
  card("actions", "Full and quick actions", "Each round you get one full action and one quick action, or two quick actions instead. Full actions happen on your turn; some quick actions can be saved to interrupt others, and nothing carries over to the next round.", 60, {
    tags: ["combat", "actions"],
    links: { rules: ["alien.rule.fast-actions", "alien.rule.slow-actions", "alien.rule.initiative"], trackers: [TR.initiative] },
  }),
  card("fast-actions", "Quick actions", "Examples: move to an adjacent zone or between Short and Adjacent range, go to a door and peek, lock a door, take partial cover, defend, aim, dodge, reload, pick up an item, or rally a broken character.", 60, {
    tags: ["combat", "actions"],
    links: { rules: ["alien.rule.actions", "alien.rule.movement"] },
  }),
  card("slow-actions", "Full actions", "Examples: a close or ranged attack, a jump or climb, taking full cover, working a terminal or machinery, first aid, clearing a jam, persuading someone, giving orders or driving a vehicle. Most need a skill roll.", 60, {
    tags: ["combat", "actions"],
    links: { rules: ["alien.rule.actions"] },
  }),
  card("giving-orders", "Giving orders", "As a full action, bark orders to someone who can hear you, comms included, and roll Command. Each success gives them +1 die on one roll later in the round, if it carries out the order.", 60, {
    tags: ["combat", "actions"],
    links: { rules: ["alien.rule.slow-actions", "alien.rule.stopping-panic"] },
  }),
  card("movement", "Movement in combat", "Unlocked doors cost nothing to pass; locked ones take a +2 dice close combat attack against armor 2 and 10 damage, or a Comtech roll if electronic. You may block others from passing you, and dragging a helpless person needs a Stamina roll. To leave combat, get out of sight; enemies then need Observation to follow.", 61, {
    tags: ["combat", "actions", "map"],
    links: { rules: ["alien.rule.fast-actions", "alien.rule.zones"] },
  }),
  card("attack-close", "Close combat", "Any attack at Adjacent range is a full action rolled with Close Combat, firearms included (usually with a minimum-range penalty). A hit deals the weapon's damage plus 1 per extra success, unarmed 1. Aiming at a weak spot costs −2 dice but lowers armor by one; restrained or unaware targets give +2 dice and cannot defend.", [62, 64], {
    tags: ["combat", "attack"],
    links: { rules: ["alien.rule.block-dodge", "alien.rule.damage-armor", "alien.rule.special-attacks"] },
  }),
  card("special-attacks", "Special attacks", "Declared before rolling and made without weapon bonuses: Disarm, Pass a blocker, Shove to Short range (even through a door) or Grapple. A success achieves the effect instead of damage, and these can be defended against.", 62, {
    tags: ["combat", "attack"],
    links: { rules: ["alien.rule.attack-close", "alien.rule.grappling"] },
  }),
  card("grappling", "Grappling", "A grappled character can only try to break free, a full action and an opposed Close Combat roll (Xenomorphs use Mobility). The grappler can only make grapple attacks, unarmed attacks that cannot be defended against.", 62, {
    tags: ["combat", "attack"],
    links: { rules: ["alien.rule.special-attacks"] },
  }),
  card("block-dodge", "Defend and dodge", "Both are quick, interrupt actions declared before the attacker rolls, and each of your successes cancels one of theirs. Defend against close combat with Close Combat; dodge a ranged attack you are aware of with Mobility, but not from full cover.", [62, 65], {
    tags: ["combat", "defence"],
    links: { rules: ["alien.rule.attack-close", "alien.rule.attack-ranged", "alien.rule.fast-actions"] },
  }),
  card("attack-ranged", "Ranged combat", "Firing at Short range or more is a full action needing line of sight. Modifiers: aiming +2 (a quick action just before the shot), −2 per band below minimum range, partial cover −2, full cover −3, weak spot −2, large target +2, small target −2. A hit deals weapon damage plus 1 per extra success.", [64, 65], {
    tags: ["combat", "attack"],
    links: { rules: ["alien.rule.range-bands", "alien.rule.full-auto", "alien.rule.damage-armor", "alien.rule.ammo-supply"] },
  }),
  card("cover", "Cover", "Only cluttered zones, or a spot by a door, offer cover. Partial cover is a quick action that gives −2 dice to ranged attacks against you; full cover is a full action, breaks line of sight, gives −3 dice and forces shots to penetrate the barrier, but you cannot dodge.", 66, {
    tags: ["combat", "map"],
    links: { rules: ["alien.rule.zones", "alien.rule.attack-ranged", "alien.rule.barriers"] },
  }),
  card("friendly-fire", "Friendly fire", "Missing a target that is Adjacent to someone else risks hitting them: roll two base dice, dealing base damage on one success and one more on two. With several bystanders, pick one at random.", 66, {
    tags: ["combat", "attack"],
    links: { rules: ["alien.rule.attack-ranged"] },
  }),
  card("full-auto", "Full auto", "When a burst hits without a push you may roll another attack, at the same or a new target, and a third after that, up to three rolls. The burst ends on a miss or a push, each roll after the first gives +1 stress, every roll needs an ammo supply roll, and aiming helps only the first.", 67, {
    tags: ["combat", "attack", "gear"],
    links: { rules: ["alien.rule.attack-ranged", "alien.rule.ammo-supply", "alien.rule.stress"] },
  }),
  card("damage-armor", "Damage and armor", "A hit deals base damage plus 1 per extra success, and armor level is subtracted from damage from an external attack. Armor-piercing attacks count armor one step lower, and weak-spot hits lower it one step more. You can wear only one suit of armor.", 67, {
    tags: ["combat", "damage"],
    links: { rules: ["alien.rule.armor", "alien.rule.weapons", "alien.rule.broken", "alien.rule.barriers"] },
  }),
  card("barriers", "Barriers", "Bulkheads and furniture have armor levels that reduce shots through them. If a barrier's armor is higher than the weapon's base damage it cannot be breached at all, and by outer bulkheads or reactors a stray miss that could breach rolls a stress die, with a facehugger meaning a breach.", 68, {
    tags: ["combat", "damage", "map"],
    links: { rules: ["alien.rule.cover", "alien.rule.explosive-decompression"] },
  }),
  card("broken", "Broken", "At zero Health you are broken: roll a critical injury at once, and you can only make one move action per round. Further damage brings more critical injuries, but you gain no stress and make no panic rolls. You get up through first aid (Medical Aid, full action), a rally (Command, quick action) or on your own after a stretch, regaining Health per success or 1 Health.", 68, {
    tags: ["combat", "damage"],
    links: { fields: [F.criticalInjuries], rules: ["alien.rule.critical-injuries", "alien.rule.healing", "alien.rule.death"] },
  }),
  card("critical-injuries", "Critical injuries", "When broken, roll D66 on the critical injury table and re-roll an injury you already have. Each entry lists whether it is lethal, its time limit, its effect and its healing time; 64 to 66 kill outright.", [68, 70], {
    tags: ["combat", "damage"],
    links: { tables: [T.criticalInjury], fields: [F.criticalInjuries], rules: ["alien.rule.broken", "alien.rule.healing", "alien.rule.death"] },
  }),
  card("death", "Death rolls", "A lethal injury calls for a death roll after each time limit: Stamina, no push, no stress dice, and a failure kills. First aid stabilises you, but a failed attempt shortens the time limit one step; three successful death rolls on your own also save you. Damage of double your maximum Health in one hit kills outright.", [68, 71], {
    tags: ["combat", "damage"],
    links: { rules: ["alien.rule.critical-injuries", "alien.rule.broken"] },
  }),
  card("healing", "Recovery and healing", "Unless fatigued, you regain 1 Health per stretch resting in a safe place; first aid and rallies restore Health only while broken. Critical injuries take their healing time in days, doubled in effect by a carer with the Nurse talent, and some need surgery first: a shift and a Medical Aid roll.", [68, 71], {
    tags: ["combat", "damage", "recovery"],
    links: { rules: ["alien.rule.broken", "alien.rule.critical-injuries", "alien.rule.medical-equipment"] },
  }),
  card("damage-types", "Stun and explosive damage", "Stun damage leaves Health alone: make a Stamina roll with a penalty equal to the damage, and on a failure lose your next turn, re-rolling unmodified each turn until you succeed. Explosive (E) weapons hit everyone in the target's zone, each able to dodge. Fire is covered by its own rules.", [71, 76], {
    tags: ["combat", "damage"],
    links: { rules: ["alien.rule.damage-armor", "alien.rule.explosions", "alien.rule.fire"] },
  }),
  card("explosions", "Explosions", "An explosive hit damages everyone else in the zone too, and a miss hurts no one. Secondary targets in partial cover count as in full cover, and firing into a closed-off zone gives +2 dice. Placed charges roll their blast power in dice with base damage one third of it, rounded up, against everyone in the zone.", 76, {
    tags: ["combat", "attack", "hazard"],
    links: { rules: ["alien.rule.damage-types", "alien.rule.cover"] },
  }),
  card("android-damage", "Damaged androids", "An android at zero Health rolls D6 on the critical system damage table instead of a critical injury and keeps operating until System Shutdown. Androids do not heal: a shift and a Comtech roll repair all damage short of shutdown, and a shut-down android can only be revived to talk.", 78, {
    tags: ["combat", "damage", "android"],
    links: { tables: ["alien.character.android-critical-damage"], rules: ["alien.rule.androids", "alien.rule.broken"] },
  }),
  card("fatigue", "Fatigue", "Lack of air, water, food or sleep, or extreme cold or heat, calls for Survival rolls at intervals, and the first failure makes you fatigued. While fatigued you cannot recover Health and each further failure costs 1 damage and +1 stress; broken by fatigue, you make death rolls until the cause is removed. Androids are immune.", 75, {
    tags: ["hazard", "survival"],
    links: { rules: ["alien.rule.suffocation", "alien.rule.food-water", "alien.rule.sleep-deprivation", "alien.rule.heat-cold", "alien.rule.hypersleep"] },
  }),
  card("suffocation", "Suffocation", "When your air runs out, or under water, make a Survival roll every round (not an action in combat), with the usual fatigue effects on failure.", 75, {
    tags: ["hazard", "survival"],
    links: { rules: ["alien.rule.fatigue", "alien.rule.air-supply"], trackers: [TR.supply] },
  }),
  card("sleep-deprivation", "Sleep deprivation", "You need a shift of sleep each day. After 24 hours awake, roll Survival every shift; broken this way, you pass out for a shift instead of making death rolls. Some drugs help.", 75, {
    tags: ["hazard", "survival"],
    links: { rules: ["alien.rule.fatigue", "alien.rule.pharmaceuticals"] },
  }),
  card("heat-cold", "Heat and cold", "Extreme temperatures without protection call for Survival rolls as often as the adventure or GM sets: per day, shift, stretch or even round.", 75, {
    tags: ["hazard", "survival"],
    links: { rules: ["alien.rule.fatigue"] },
  }),
  card("vacuum", "Vacuum", "In vacuum you gain +1 stress each round and must pass a Survival roll before acting, at −1 die more each round. One failure drops you to zero Health; you make death rolls every round until out of the vacuum. Getting into a suit fast takes a full action and a Mobility roll.", 75, {
    tags: ["hazard", "space"],
    links: { rules: ["alien.rule.explosive-decompression", "alien.rule.death"] },
  }),
  card("explosive-decompression", "Explosive decompression", "A hull breach vents one zone per stretch, and the draft forces a Survival roll before acting; anyone left in a vented zone faces vacuum. Shooting a hole on purpose is a ranged attack with +2 dice, and most ships seal breached zones automatically.", 75, {
    tags: ["hazard", "space"],
    links: { rules: ["alien.rule.vacuum", "alien.rule.barriers"] },
  }),
  card("falling", "Falling", "A fall onto a hard surface deals damage equal to half the height in meters, rounded down, and armor does not help. In a controlled jump, each success on a Mobility roll cuts the damage by one.", 75, {
    tags: ["hazard"],
    links: { rules: ["alien.rule.damage-armor"] },
  }),
  card("zero-gravity", "Zero gravity", "Without gravity, Close Combat, Heavy Machinery, Mobility and Ranged Combat get −2 dice, and every move needs an unpenalised Mobility roll or you spin in place with +1 stress. The Zero-G Training talent removes all of this, and you never take falling damage.", 76, {
    tags: ["hazard", "space"],
    links: { rules: ["alien.rule.falling"] },
  }),
  card("fire", "Fire", "Entering or starting a round in a burning zone means rolling base dice equal to the fire's intensity (typically 6 to 9), taking 1 damage per success. Damage from fire sets you burning until a fire attack does nothing or someone puts it out with Mobility. Each round a D6 decides whether the fire goes out (1-2), keeps burning or spreads (5-6).", 76, {
    tags: ["hazard", "damage"],
    links: { rules: ["alien.rule.damage-types", "alien.rule.death"] },
  }),
  card("disease", "Disease", "Exposure calls for a passive Stamina roll modified by the contagion's virulence. Illness often brings fatigue with repeated Stamina rolls until one succeeds, and a carer can roll Medical Aid in your place.", [76, 77], {
    tags: ["hazard"],
    links: { rules: ["alien.rule.fatigue", "alien.rule.passive-rolls"] },
  }),
  card("radiation", "Radiation", "Radiation adds rads per shift (weak), stretch (strong) or round (extreme). Each new rad means rolling dice equal to your total rads and taking 1 damage per success; you cannot recover Health in the hotspot and lose one rad per shift after leaving.", 77, {
    tags: ["hazard"],
    links: { rules: ["alien.rule.damage-armor"] },
  }),
  card("vehicles", "Vehicle combat", "Vehicles have Maneuverability (a Piloting modifier), Speed in zones per drive action, Hull and Armor. Driving is a quick action, ramming is a Piloting attack with damage of half the Hull, and a vehicle is wrecked when damage reaches its Hull. A single hit of half the Hull or more rolls on the component damage table.", [78, 79], {
    tags: ["combat", "vehicles"],
    links: { rules: ["alien.rule.damage-armor", "alien.rule.barriers"] },
  }),
];
