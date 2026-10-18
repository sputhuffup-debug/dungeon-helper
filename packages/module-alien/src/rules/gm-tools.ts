import type { RuleCard } from "@campaign-forge/module-sdk";
import { CAMPAIGN } from "../modes";
import { TR, card } from "./card";

export const gmToolsRules: RuleCard[] = [
  card("gm-principles", "The eight GM principles", "Eight short guidelines for running the game: keep horror personal, build dread before the reveal, show the working-class setting, isolate the crew, let nobody be safe, drive play with secrets, make technology fallible, and reward desperate ingenuity.", 152, {
    tags: ["gm"],
    links: { rules: ["alien.rule.themes"] },
  }),
  card("themes", "The three themes", "Alien scenarios mix three moods: Space Horror (the unknown in the dark), Sci-Fi Action (firefights and squads) and Sense of Wonder (strange worlds and old things). Lean on one per act.", 153, {
    tags: ["gm"],
    links: { rules: ["alien.rule.gm-principles", "alien.rule.campaign-theme"] },
  }),
  card("encounter-cadence", "Encounter cadence", "How often to roll for an encounter depends on where the crew is: once per jump in deep space, once per day in orbit or on the surface, once per Shift in a colony or a derelict. Pick the matching table.", [252, 257], {
    tags: ["gm", "encounters"],
    links: { tables: ["alien.encounters.colony.general"], rules: ["alien.rule.encounter-tables"] },
  }),
  card("encounter-tables", "Encounter tables", "Nine tables: star system, ship reactions, two surface columns, general colony and five colony areas. Most are D66 with modifiers to the tens digit for danger or remoteness.", [252, 257], {
    tags: ["gm", "encounters", "generator"],
    links: { rules: ["alien.rule.encounter-cadence"] },
  }),
  card("world-creation", "Main world creation", "Roll size, atmosphere, temperature, geosphere and terrain for the planet, then for an inhabited world the colony size, missions, factions, orbital components, allegiance and a campaign hook. Later rolls are modified by earlier ones.", [237, 242], {
    tags: ["gm", "generator", "world"],
    links: { tables: ["alien.world.atmosphere"], rules: ["alien.rule.star-systems", "alien.rule.colonies", "alien.rule.campaign-hooks"] },
  }),
  card("star-systems", "Star system generator", "Given a star's spectral and brightness class, roll how many gas giants, terrestrial planets, ice worlds and asteroid belts it holds, then detail each body; ice worlds are frozen and gas giants gain moons.", 243, {
    tags: ["gm", "generator", "world"],
    links: { rules: ["alien.rule.world-creation"] },
  }),
  card("colonies", "Colonies", "A colony is Start-Up, Young or Established, with a population, one or more missions (mining, research, terraforming, military...) and a few factions pulling at it.", [240, 242], {
    tags: ["gm", "generator", "world"],
    links: { rules: ["alien.rule.world-creation", "alien.rule.factions"] },
  }),
  card("campaign-hooks", "Campaign hooks", "The last world creation step offers a hook: something wrong at the colony that can carry a session or a whole arc.", 242, {
    tags: ["gm", "generator", "world"],
    links: { rules: ["alien.rule.world-creation"] },
  }),
  card("regions", "Regions of charted space", "Charted space is layered: the Core, the Outer Veil, the Outer Rim, the Frontier and the Far Reach, each more remote, poorer and less policed than the last.", [180, 181], {
    tags: ["gm", "setting"],
    links: { rules: ["alien.rule.allegiance"] },
  }),
  card("allegiance", "Allegiance", "Systems belong to the United Americas, the Three World Empire, the Union of Progressive Peoples, the Independent Core System Colonies, or no one. Allegiance shapes law, employers and who shows up when things go wrong.", 182, {
    tags: ["gm", "setting"],
    links: { rules: ["alien.rule.regions", "alien.rule.factions"] },
  }),
  card("factions", "Factions", "Each major faction entry covers history, products or military, leaders, locations, relations, current activities and a named contact. Use them as employers, rivals and the hand behind the twist.", [162, 177], {
    tags: ["gm", "setting"],
    links: { rules: ["alien.rule.minor-corporations", "alien.rule.allegiance"] },
  }),
  card("minor-corporations", "Minor corporations", "A short list of smaller companies to drop in as employers, cargo owners or scapegoats when the big names would be too obvious.", [176, 177], {
    tags: ["gm", "setting"],
    links: { rules: ["alien.rule.factions"] },
  }),
  card("npc-presets", "Typical NPCs", "Ready stat blocks from covert androids to thugs, each with attributes, Health, a few skills, gear and a trait, for when the crew meets someone the GM did not plan.", [258, 259], {
    tags: ["gm", "npc"],
    links: { rules: ["alien.rule.npcs"] },
  }),
  card("countdowns", "Countdowns", "When the clock matters (air, a reactor, a departing shuttle), track it as a countdown in minutes with a supply roll each round of hard use, and tell the players the number.", 55, {
    tags: ["gm", "time"],
    links: { rules: ["alien.rule.time-units", "alien.rule.supply-rolls"], trackers: [TR.countdown, TR.clock] },
  }),
  card("handouts", "Handouts and secrets", "Agendas, company orders and clues work best as physical or private handouts. Keep a visibility note on each so you know who has seen what.", 157, {
    tags: ["gm"],
    links: { rules: ["alien.rule.cinematic-agendas", "alien.rule.session-zero"] },
  }),
  card("derelicts", "Derelicts and dark sites", "A derelict ship or dead colony is a stealth-mode set piece: map it in zones, decide what is still powered, and let supply rolls for light and air drive the pace.", [55, 254], {
    mode: [CAMPAIGN],
    tags: ["gm", "encounters"],
    links: { rules: ["alien.rule.stealth-mode", "alien.rule.zones", "alien.rule.consumables"] },
  }),
];
