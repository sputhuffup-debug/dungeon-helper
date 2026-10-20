import type { RuleCard } from "@campaign-forge/module-sdk";
import { CAMPAIGN } from "../modes";
import { F, TR, card } from "./card";

/** Chapter 10: alien species (p. 204-231) and Xenomorphs in campaign play (p. 159). */
export const creatureRules: RuleCard[] = [
  card("creature-attacks", "Xenomorph combat", "Xenomorphs have no attributes: they roll base dice equal to a skill level, often far above human levels, and never push. Each turn one either moves or makes a signature attack picked with a D6 on its table, rolling again if it repeats the previous attack, though the GM may simply choose; attacks reach Adjacent range unless stated, and closing in from Short range comes free with them. They never defend or dodge, but their attacks can be defended against, and a grappled Xenomorph spends its turns breaking free with Mobility.", 208, {
    tags: ["creatures", "combat"],
    links: { tables: ["alien.creatures.attack.drone", "alien.creatures.broken-xenomorph"], fields: [F.creatureAttacks, F.creatureSpeed, F.creatureDamage], rules: ["alien.rule.creature-speed", "alien.rule.creature-armor", "alien.rule.acid-splash", "alien.rule.broken-xenomorph", "alien.rule.grappling"], trackers: [TR.initiative] },
  }),
  card("creature-speed", "Speed", "A Xenomorph gets one full turn and one initiative card per point of Speed. Moving instead of attacking covers two zones, or a zone then Short to Adjacent range, and in stealth mode it moves one zone per point of Speed each stretch. An ambushing Xenomorph takes card #1 only for its first turn.", [55, 208], {
    tags: ["creatures", "combat", "initiative"],
    links: { rules: ["alien.rule.initiative", "alien.rule.stealth-mode", "alien.rule.ambush"], trackers: [TR.initiative, TR.stealth] },
  }),
  card("creature-armor", "Armor, stun and recovery", "Many Xenomorphs have a natural armor level, often lower against fire. They are immune to stun damage unless noted, resisting with Mobility when they are not, and a stretch spent immobile restores all lost Health.", 209, {
    tags: ["creatures", "combat", "damage"],
    links: { fields: [F.creatureArmor, F.creatureArmorVsFire], rules: ["alien.rule.damage-armor", "alien.rule.damage-types"] },
  }),
  card("acid-splash", "Acid splash", "When a Xenomorph XX121 takes damage other than fire, everyone Adjacent and the floor suffer an attack with base dice equal to its Acid Splash rating plus the damage taken (counting no more than its maximum Health), base damage 1. Armor reduces the damage but loses a point per point of damage. Anyone the first splash damaged, even if armor soaked it all, is attacked again at the start of each round with half the dice (rounded up) until a roll deals none.", 210, {
    tags: ["creatures", "combat", "damage"],
    links: { fields: [F.acidSplash, F.creatureDamage], rules: ["alien.rule.creature-attacks", "alien.rule.armor", "alien.rule.barriers"] },
  }),
  card("creature-abilities", "Special abilities", "Some creatures have special actions besides their signature attacks, given in their entries. Every XX121 also shrugs off cold and vacuum, treats radiation as two levels weaker, and ignores darkness.", [209, 210], {
    tags: ["creatures"],
    links: { rules: ["alien.rule.creature-attacks", "alien.rule.darkness", "alien.rule.radiation"] },
  }),
  card("lifecycle", "The XX121 life cycle", "Xenomorph XX121 passes from egg to Facehugger to Chestburster to adult: Stage IV drone, scout or stalker, Stage V soldier, worker or sentry, and Stage VI praetorian, charger or queen. Stages beyond that are rumor.", [209, 221], {
    tags: ["creatures", "lifecycle"],
    links: { rules: ["alien.rule.facehugger", "alien.rule.chestburster", "alien.rule.xenomorph-stages", "alien.rule.queen", "alien.rule.containment", "alien.rule.variable-gestation", "alien.rule.stage-iv-molting"], trackers: [TR.gestation] },
  }),
  card("variable-gestation", "Variable gestation", "Each strain has a usual gestation time, but it can change: a host with a weak immune system or a tendency to cancer may carry it faster or slower, catching it in hypersleep slows it once revived, and stasis stops it until the host wakes. In the end the GM sets the speed the story needs.", 216, {
    tags: ["creatures", "lifecycle", "gm"],
    links: { rules: ["alien.rule.lifecycle", "alien.rule.chestburster"], trackers: [TR.gestation] },
  }),
  card("burster-variants", "Burster variants", "A Bambi Burster grows inside a four-legged animal, which matures faster than a human, and is born running on spindly legs. A Praetomorph Imp grows up much faster than a Chestburster and may mimic whoever is nearest, and a Queen Burster takes days instead of hours to gestate.", [215, 216], {
    tags: ["creatures", "lifecycle"],
    links: { tables: ["alien.creatures.attack.chestburster"], rules: ["alien.rule.chestburster", "alien.rule.variable-gestation"], trackers: [TR.gestation] },
  }),
  card("stage-iv-molting", "From Stage IV to Stage V", "A Drone stays at Stage IV until a Queen's pheromones make it molt into a Soldier or Worker, as the hive requires; a Scout becomes a Sentry once a Queen is born and the hive is safe. A Stalker, the adult Praetomorph, never molts again.", [217, 219], {
    tags: ["creatures", "lifecycle"],
    links: { rules: ["alien.rule.hive-mind", "alien.rule.xenomorph-stages", "alien.rule.lifecycle"], trackers: [TR.gestation] },
  }),
  card("hive-mind", "Hive mind", "Six or more Stage IV XX121 together start acting in concert, and with a Queen among them they molt to Stage V. Larger hives seem to grow cleverer.", 219, {
    tags: ["creatures", "lifecycle"],
    links: { rules: ["alien.rule.stage-iv-molting", "alien.rule.queen"], trackers: [TR.gestation] },
  }),
  card("ovomorph", "The egg", "With a potential host (not an android) within Short range, roll a stress die each round, and a facehugger releases the parasite. A host at Adjacent range must pass a Mobility roll, no action, each turn to avoid disturbing it. A lone drone can also turn cocooned hosts into eggs over 24 to 36 hours.", 212, {
    tags: ["creatures", "lifecycle"],
    links: { rules: ["alien.rule.facehugger", "alien.rule.lifecycle"], trackers: [TR.gestation] },
  }),
  card("facehugger", "Facehugger", "Its D6 attacks escalate from a menacing scuttle through tail grapples to a face leap and the Final Embrace, eight dice that only an APEsuit's armor resists. A facehugged victim is broken and unconscious; within a shift it falls off, and a shift later a Chestburster emerges. Removing it kills the host unless it is frozen first, and each stretch a stress die may show the host is already implanted.", [212, 214], {
    tags: ["creatures", "lifecycle"],
    links: { tables: ["alien.creatures.attack.facehugger"], rules: ["alien.rule.lifecycle", "alien.rule.chestburster", "alien.rule.facehugger-swarm"], trackers: [TR.gestation] },
  }),
  card("facehugger-swarm", "Facehugger swarms", "Several facehuggers in one zone can act as a swarm whose Speed depends on how many there are, from 2 for one or two up to 6 for 21 or more. Each one must still be killed separately.", 213, {
    tags: ["creatures", "combat"],
    links: { rules: ["alien.rule.facehugger", "alien.rule.creature-speed"] },
  }),
  card("chestburster", "Chestburster", "The birth kills the host outright. The Stage III creature, including the Bambi Burster and Imp variants, attacks or flees to hide, feed and grow into Stage IV; facehuggers and chestbursters at zero Health are simply destroyed.", [215, 216], {
    tags: ["creatures", "lifecycle"],
    links: { tables: ["alien.creatures.attack.chestburster"], rules: ["alien.rule.lifecycle", "alien.rule.panic-triggers", "alien.rule.burster-variants"], trackers: [TR.gestation] },
  }),
  card("xenomorph-stages", "Adult xenomorph forms", "Stage IV drones, scouts and stalkers and Stage V soldiers, workers and sentries each have their own Speed, Health, skills, armor, acid splash and attack table. Workers avoid fights, soldiers attack in groups, and sentries guard the queen.", [217, 221], {
    tags: ["creatures", "lifecycle"],
    links: { tables: ["alien.creatures.attack.drone", "alien.creatures.attack.soldier"], rules: ["alien.rule.lifecycle", "alien.rule.creature-attacks"] },
  }),
  card("queen", "Stage VI and the hive", "Royal jelly turns soldiers and sentries into praetorians and chargers, and only a queen lays eggs in quantity. Their shared attack table includes calling guards, a frenzy, a charge and a lethal headbite. The hive is a hot resin maze where hosts are cocooned, and the queen sits at its guarded heart.", [219, 221], {
    tags: ["creatures", "lifecycle"],
    links: { tables: ["alien.creatures.attack.queen"], rules: ["alien.rule.lifecycle"] },
  }),
  card("broken-xenomorph", "Broken xenomorph", "A Xenomorph at zero Health is not broken like a human but rolls D6: it may rise again, fight on wounded, flee, make one last attack, or (5-6) die. Facehuggers and Chestbursters are simply destroyed. In \"Aliens mode\" the GM may rule that Xenomorphs at zero Health simply die.", [208, 209], {
    tags: ["creatures", "combat"],
    links: { tables: ["alien.creatures.broken-xenomorph"], fields: [F.creatureDamage], rules: ["alien.rule.creature-attacks", "alien.rule.broken"] },
  }),
  card("neomorph", "Neomorphs", "A separate strain with its own cycle: disturbed egg sacs release a cloud of motes, and infection works as a disease (virulence −2). A failed Stamina roll means a bloodburster erupts within a shift, killing the host, then grows into a neophyte and finally an adult neomorph, each stage with its own stats and attacks.", [223, 225], {
    tags: ["creatures", "lifecycle"],
    links: { tables: ["alien.creatures.attack.neomorph-bloodburster", "alien.creatures.attack.neomorph-adult"], rules: ["alien.rule.lifecycle"] },
  }),
  card("other-species", "Other extrasolar species", "Harvesters, lion worms, Tanakan scorpionids and the Swarm are other hostile lifeforms, each with stats and a signature attack table.", [227, 231], {
    tags: ["creatures"],
    links: {
      tables: ["alien.creatures.attack.harvester", "alien.creatures.attack.lion-worm", "alien.creatures.attack.tanakan-scorpionid", "alien.creatures.attack.swarm"],
      rules: ["alien.rule.creature-attacks"],
    },
  }),
  card("containment", "Containment and termination", "Each creature entry ends with known ways to keep or kill it: fire works on most stages, extreme cold makes eggs dormant and loosens facehuggers, and blind facehuggers can be avoided by keeping still. Best advice for a hive: stay out.", [212, 231], {
    tags: ["creatures", "gm"],
    links: { rules: ["alien.rule.lifecycle", "alien.rule.xenomorphs-campaign"] },
  }),
  card("xenomorphs-campaign", "Xenomorphs in campaign play", "Unlike cinematic play, a campaign should not meet a Xenomorph on every job. Use other threats such as corporate agents, soldiers, rival crews, rogue androids and critters, and save the Xenomorph for special occasions.", 159, {
    mode: [CAMPAIGN],
    tags: ["creatures", "campaign", "gm"],
    links: { rules: ["alien.rule.campaign-structure", "alien.rule.containment"] },
  }),
];
