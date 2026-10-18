import type { RuleCard } from "@campaign-forge/module-sdk";
import { CAMPAIGN } from "../modes";
import { TR, card } from "./card";

export const creatureRules: RuleCard[] = [
  card("creature-attacks", "Creature attacks", "Creatures have no attributes. Each round they draw one initiative card per point of Speed, and on their turn the GM rolls a D6 on the creature's signature attack table; the row gives dice, damage and effect. Creatures never push and never dodge.", 208, {
    tags: ["creatures", "combat"],
    links: { rules: ["alien.rule.creature-speed", "alien.rule.creature-armor", "alien.rule.acid-splash"], trackers: [TR.initiative] },
  }),
  card("creature-speed", "Speed", "A creature's Speed is the number of initiative cards it draws each round; it acts on every one of them. It also sets how many zones it covers in stealth mode.", 208, {
    tags: ["creatures", "combat", "initiative"],
    links: { rules: ["alien.rule.initiative", "alien.rule.stealth-mode"], trackers: [TR.initiative, TR.stealth] },
  }),
  card("creature-armor", "Creature armor", "Creatures have an Armor Rating rolled like any armor, with notes for situations where it changes (such as fire). Some weapons bypass it.", 208, {
    tags: ["creatures", "combat", "damage"],
    links: { rules: ["alien.rule.damage-armor"] },
  }),
  card("acid-splash", "Acid splash", "When a xenomorph is damaged at engaged or short range, its acid blood sprays: everyone nearby suffers an attack with the creature's acid splash dice. Acid keeps burning through armor and decks.", 208, {
    tags: ["creatures", "combat", "damage"],
    links: { rules: ["alien.rule.creature-attacks", "alien.rule.damage-types"] },
  }),
  card("creature-abilities", "Special abilities", "Beyond attacks, each creature has named abilities: wall crawling, camouflage, a tail that pins, pheromone signals. They work as written on the stat block, no roll unless stated.", 208, {
    tags: ["creatures"],
    links: { rules: ["alien.rule.creature-attacks"] },
  }),
  card("lifecycle", "The xenomorph lifecycle", "Stages follow a path: egg, facehugger, chestburster, then adult forms that grow and specialise. Each stage lists a trigger (time, a host, a queen's presence) that moves it to the next.", [209, 221], {
    tags: ["creatures", "lifecycle"],
    links: { rules: ["alien.rule.facehugger", "alien.rule.chestburster", "alien.rule.xenomorph-stages", "alien.rule.queen", "alien.rule.containment"] },
  }),
  card("facehugger", "Facehugger", "Fast, small and almost impossible to remove without killing the host. A successful attack means implantation; the host wakes with no memory of it and a countdown has begun.", 211, {
    tags: ["creatures", "lifecycle"],
    links: { rules: ["alien.rule.lifecycle", "alien.rule.chestburster"] },
  }),
  card("chestburster", "Chestburster", "After a delay the embryo erupts, killing the host and forcing panic rolls for everyone watching. It then hides and grows within hours.", 212, {
    tags: ["creatures", "lifecycle"],
    links: { rules: ["alien.rule.lifecycle", "alien.rule.panic-triggers"] },
  }),
  card("xenomorph-stages", "Adult xenomorph forms", "Adults range from stalkers and drones to soldiers, sentries and praetorians, each with its own attack table, armor and Speed. Variants exist by host and environment.", [213, 218], {
    tags: ["creatures", "lifecycle"],
    links: { rules: ["alien.rule.lifecycle", "alien.rule.creature-attacks"] },
  }),
  card("queen", "The queen", "A hive's queen is a siege-class threat with high armor, multiple attacks and an egg-laying drive. Later stages beyond the queen are lore only, without stats.", [219, 221], {
    tags: ["creatures", "lifecycle"],
    links: { rules: ["alien.rule.lifecycle"] },
  }),
  card("broken-xenomorph", "Broken xenomorph", "When a xenomorph reaches zero Health, roll on the broken xenomorph table: it may die, flee, play dead or lash out one last time in a spray of acid.", 213, {
    tags: ["creatures", "combat"],
    links: { rules: ["alien.rule.acid-splash"] },
  }),
  card("facehugger-swarm", "Facehugger swarms", "Several facehuggers act as one swarm with a size rolled when encountered; damage reduces the size rather than Health.", 213, {
    tags: ["creatures", "combat"],
    links: { rules: ["alien.rule.facehugger"] },
  }),
  card("neomorph", "Neomorphs", "A second species with its own lifecycle via spores: the host grows a bloodburster or backburster, which matures into a pale, fast adult. Different triggers, different attack tables.", [222, 225], {
    tags: ["creatures", "lifecycle"],
    links: { rules: ["alien.rule.lifecycle"] },
  }),
  card("other-species", "Other species", "The book also covers a handful of other hostile lifeforms with simpler stat blocks: use them for variety when the xenomorph would be too familiar.", [226, 227], {
    tags: ["creatures"],
    links: { rules: ["alien.rule.creature-attacks"] },
  }),
  card("containment", "Containment protocols", "Guidelines for keeping a specimen: what the company wants, what holds each stage, and how long before it gets out. Useful as a countdown when the crew is told to bring one back alive.", [227, 231], {
    tags: ["creatures", "gm"],
    links: { rules: ["alien.rule.lifecycle", "alien.rule.xenomorphs-campaign"], trackers: [TR.countdown] },
  }),
  card("xenomorphs-campaign", "Xenomorphs in campaign play", "In a campaign the creature is rare and should stay rare: build toward it over several jobs, let rumours and company interest precede it, and treat an outbreak as a season finale rather than a weekly fight.", 159, {
    mode: [CAMPAIGN],
    tags: ["creatures", "campaign", "gm"],
    links: { rules: ["alien.rule.campaign-structure", "alien.rule.containment"] },
  }),
];
