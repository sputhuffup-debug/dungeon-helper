import type { Template, TemplateAdventure } from "@campaign-forge/module-sdk";
import { CINEMATIC } from "../modes";

const agendaHandouts = (act: number) =>
  Array.from({ length: 6 }, (_, i) => ({
    title: `Agenda for <PC ${i + 1}> (Act ${act})`,
    body: "_Write the character's secret goal for this act. One or two sentences, in second person._",
    visibility: "some_players" as const,
  }));

/** Three-act cinematic scenario scaffold (p. 157). Empty until the GM writes into it. */
export const cinematicAdventureScaffold: TemplateAdventure = {
  title: "<Scenario title>",
  premise: "_One paragraph: who the crew are, where they are and what is about to go wrong._",
  playerIntro: "What's the story, Mother?\n\n_Player-facing briefing read aloud at the start. Keep the threat out of it._",
  gmSituation: "_GM-only: what is really happening, who knows, what the company wants, where the creature is and the countdown that will end the scenario._",
  acts: [
    {
      number: 1,
      title: "Setup",
      goal: "Establish the crew, the place and the routine; seed the clues; hand out the first agendas.",
      pacing: "Slow burn. Let the players explore and talk. No creature on screen yet; signs only. End the act on the first hard reveal.",
      scenes: [
        { purpose: "Arrival: the crew reaches the location and meets the people there.", mandatory: true, body: "_Location, NPCs present, what looks normal._" },
        { purpose: "Something is off: a clue that cannot be explained away.", mandatory: true, body: "_The clue, who finds it, what it points to._" },
        { purpose: "A side errand that reveals an NPC's secret.", mandatory: false, body: "_Optional. Use if the table is dawdling._" },
      ],
      handouts: agendaHandouts(1),
    },
    {
      number: 2,
      title: "Tilt",
      goal: "Reverse the situation: the threat is revealed, the plan fails or an ally turns. New agendas pull the crew apart.",
      pacing: "Pressure rising. First blood. Move into stealth mode when the creature hunts. Give the GM permission to call PvP (p. 158).",
      scenes: [
        { purpose: "The reveal: the threat is seen and someone is hurt or taken.", mandatory: true, body: "_Where, who, panic rolls for witnesses._" },
        { purpose: "The plan: the crew tries to fix, flee or fight and it goes wrong.", mandatory: true, body: "_The obstacle; what the company agent or android does._" },
        { purpose: "The betrayal: an agenda forces a hard choice.", mandatory: false, body: "_Optional. Tie to a specific handout._" },
      ],
      handouts: agendaHandouts(2),
    },
    {
      number: 3,
      title: "Showdown",
      goal: "A deadline forces the ending: countdown, last shuttle, self-destruct. Agendas resolve, few survive.",
      pacing: "Fast. Run the countdown tracker in the open. Every scene costs something.",
      scenes: [
        { purpose: "The countdown starts and everyone knows it.", mandatory: true, body: "_What starts it, how long, what the number is._" },
        { purpose: "The last stand or the escape.", mandatory: true, body: "_The final zone map, the creature's position, the exit._" },
        { purpose: "A final temptation for one agenda.", mandatory: false, body: "_Optional. Who gets to leave with what._" },
      ],
      handouts: agendaHandouts(3),
    },
  ],
  epilogue: "_For each survivor: where they end up and what the company does about it. For the dead: what is found._",
};

export const cinematicAdventureTemplate: Template = {
  id: "alien.template.cinematic-adventure",
  kind: "adventure",
  name: "Cinematic adventure",
  description: "Three acts (Setup, Tilt, Showdown) with per-act agenda handouts, mandatory and optional scenes, player intro and GM situation.",
  mode: [CINEMATIC],
  page: 157,
  scaffold: cinematicAdventureScaffold,
};
