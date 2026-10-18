import type { RuleCard } from "@campaign-forge/module-sdk";
import { CAMPAIGN } from "../modes";
import { TR, card } from "./card";

const C = { mode: [CAMPAIGN] };

/** Chapter 7 GM advice (p. 152-159), setting chapters 6, 8-9 and the chapter 11 generators. */
export const gmToolsRules: RuleCard[] = [
  card("gm-principles", "The eight game principles", "Use the films, limit resources, stay in the shadows, increase the pressure, let them breathe, fuel their agendas, bring horrible death, and reveal the universe. Together they set the tone and guide tricky moments.", 152, {
    tags: ["gm"],
    links: { rules: ["alien.rule.themes", "alien.rule.stages-of-fear"] },
  }),
  card("themes", "Key themes", "Every game mixes three themes, usually stressing one: Space Horror (survival and fear, with the sub-themes Space Is Hell and Killing Greed), Sci-Fi Action (big set pieces, with Someone Else's War and Expendable Assets) and Sense of Wonder (ancient mysteries, with The Origin of Life and Old and New Gods).", [19, 153], {
    tags: ["gm"],
    links: { rules: ["alien.rule.gm-principles", "alien.rule.campaign-theme"] },
  }),
  card("stress-and-horror", "Stress and horror", "Stress and panic are the GM's main horror tools, and most stress comes from the PCs' own choices. Three levers help: fear of the unknown, loss of control over resources and machines, and horrible choices.", 154, {
    tags: ["gm", "stress"],
    links: { rules: ["alien.rule.stress", "alien.rule.stages-of-fear"] },
  }),
  card("stages-of-fear", "The three stages of fear", "Dread (something is wrong but nobody knows what) should be used often; terror (it is about to happen) is the scariest and best used sparingly; horror (the threat revealed, initiative drawn) is the payoff, best kept late. Give the PCs calm moments to relieve stress, then strike again.", 155, {
    tags: ["gm", "stress"],
    links: { rules: ["alien.rule.stress-and-horror", "alien.rule.stress-recovery"] },
  }),
  card("splitting-the-team", "Splitting the team", "Let the players split up, cut back and forth between groups so no one waits too long, keep everyone at the table, and use the separation and the available communications to create scary situations.", 155, {
    tags: ["gm"],
    links: { rules: ["alien.rule.stages-of-fear"] },
  }),
  card("encounter-cadence", "When to roll encounters", "Roll a star system encounter before entering and after leaving hyperspace; a ship staying in a system rolls daily near a habitable planet, weekly further out, and monthly in unexplored systems. Surface and colony encounters are rolled each day. Use the tables only when they add something to the game.", 252, {
    ...C,
    tags: ["gm", "encounters"],
    links: { tables: ["alien.encounters.star-system", "alien.encounters.surface", "alien.encounters.colony.general"], rules: ["alien.rule.encounter-tables"] },
  }),
  card("encounter-tables", "Encounter tables", "Star system encounters are D66 with the tens digit lowered for the Outer Rim or Frontier (−3) or uncharted space (−5), and 0 or less means nothing happens; ship reactions are 2D6. Surface encounters are 3D6 with uninhabited and colonized columns, and colonies use a D66 general table (with a tens bonus once established) plus public, habitation, operations, spaceport and industrial area tables.", [252, 257], {
    ...C,
    tags: ["gm", "encounters", "generator"],
    links: { tables: ["alien.encounters.star-system", "alien.encounters.ship-reactions", "alien.encounters.surface", "alien.encounters.colony.general"], rules: ["alien.rule.encounter-cadence"] },
  }),
  card("world-creation", "Main world creation", "Colonies sit on the most profitable world in a system, which is rarely the most Earth-like. Roll size, atmosphere, temperature and geosphere, each roll modified by earlier ones, and a terrain feature; for an inhabited world add colony size and missions, orbital components, factions, allegiance and a campaign hook.", [237, 242], {
    ...C,
    tags: ["gm", "generator", "world"],
    links: { tables: ["alien.world.size", "alien.world.atmosphere"], rules: ["alien.rule.star-systems", "alien.rule.colonies", "alien.rule.campaign-hooks"] },
  }),
  card("star-systems", "Star system generator", "Stars combine a spectral class with a brightness class. Roll once per body type for gas giants (D6−1), terrestrial planets (D6), ice planets (D6+1) and asteroid belts (D6−3), with modifiers for the star type; gas giants get D6+4 moons and features, and other planets use main world creation up to colony size.", [236, 243], {
    ...C,
    tags: ["gm", "generator", "world"],
    links: { tables: ["alien.system.gas-giants", "alien.system.terrestrial-planets", "alien.system.ice-planets", "alien.system.asteroid-belts"], rules: ["alien.rule.world-creation"] },
  }),
  card("colonies", "Colonies", "Frontier colonies are small and depend on sponsors. Size on 2D6 is start-up (7 or less), young (8-10) or established (11+), each with a population roll and one or more missions; orbital components are 2D6, with 12+ rolling D6 more times.", 240, {
    ...C,
    tags: ["gm", "generator", "world"],
    links: { tables: ["alien.world.colony-size", "alien.world.colony-mission", "alien.world.orbital-components"], rules: ["alien.rule.world-creation", "alien.rule.factions"] },
  }),
  card("campaign-hooks", "Factions, allegiance and hooks", "Roll D3 factions and a D6 type for each. UPP colonies always owe allegiance to the UPP, while others roll on the ICSC or the American and Anglo-Japanese Arm table; a D66 campaign hook shows what is already happening when the PCs arrive.", [241, 242], {
    ...C,
    tags: ["gm", "generator", "world"],
    links: { tables: ["alien.world.faction-count", "alien.world.campaign-hook"], rules: ["alien.rule.world-creation", "alien.rule.allegiance"] },
  }),
  card("regions", "Regions of charted space", "From Earth outward lie the prosperous Core Systems, the resource-rich Outer Veil, and the Outer Rim at the edge of civilized space. The Far Reach stretches out from the American Arm, and the ever-expanding Frontier runs along the edge of explored space.", [112, 201], {
    tags: ["gm", "setting"],
    links: { rules: ["alien.rule.allegiance"] },
  }),
  card("allegiance", "Allegiance", "Charted space is split between the United Americas, the Three World Empire and the Union of Progressive Peoples, with the Independent Core System Colonies dominated by corporations. A colony's allegiance shapes its law and masters.", [162, 171], {
    tags: ["gm", "setting"],
    links: { tables: ["alien.world.allegiance-arms", "alien.world.allegiance-icsc"], rules: ["alien.rule.regions", "alien.rule.factions"] },
  }),
  card("factions", "Governments and corporations", "Entries for the 3WE, UA, UPP, ICSC, the ICC, Weyland-Yutani, Lasalle Bionational and Seegson cover history, government or products, military, leaders, locations, relations and current activities.", [162, 177], {
    tags: ["gm", "setting"],
    links: { rules: ["alien.rule.minor-corporations", "alien.rule.allegiance"] },
  }),
  card("minor-corporations", "Other corporations", "A short list of other companies on the Frontier, from Alphatech and Chigusa to Kelland Mining and Lockmart; those not allied with Weyland-Yutani are on its list of targets.", 162, {
    tags: ["gm", "setting"],
    links: { rules: ["alien.rule.factions"] },
  }),
  card("npc-presets", "Typical NPCs", "A list of ready NPCs, from androids and asteroid miners to marshals, executives, smugglers and thugs, each with attributes, for whenever the crew meets someone unplanned.", [258, 259], {
    ...C,
    tags: ["gm", "npc"],
    links: { rules: ["alien.rule.npcs"] },
  }),
  card("countdowns", "Countdowns", "During a countdown to disaster, time becomes a consumable: the GM or adventure sets a number of minutes, and after each combat round a supply roll lowers it by one per facehugger rolled.", [28, 55], {
    tags: ["gm", "time"],
    links: { rules: ["alien.rule.time-units", "alien.rule.supply-rolls"], trackers: [TR.countdown, TR.clock] },
  }),
  card("handouts", "Secret agendas at the table", "Agendas are handed out in secret, but private notes between GM and player slow play and tip off the others. Write early agendas so they do not demand suspicious behaviour, and if a player insists on secrecy, keep it short and remind them of the group.", 158, {
    tags: ["gm"],
    links: { rules: ["alien.rule.cinematic-agendas", "alien.rule.session-zero"] },
  }),
  card("solo-mode", "Last Survivor (solo play)", "An optional solo mode with no Game Mother, for brief and brutal one-off scenarios. You create a PC as usual (android or an extra general talent improves the odds), start from a mission starter, and use response matrices, danger, survivor and objective timers and encounter checks to fill in what a GM would decide.", [291, 307], {
    tags: ["gm", "solo"],
    links: { rules: ["alien.rule.character-creation"] },
  }),
];
