import type { Template, TemplateChecklist } from "@campaign-forge/module-sdk";
import { CAMPAIGN, CINEMATIC } from "../modes";

/**
 * Alien additions to the generic session checklist. Each item is a short
 * paraphrase checked against the page it cites; the core adds them after its
 * own items of the same phase, filtered by play mode.
 */
export const sessionChecklistScaffold: TemplateChecklist = {
  title: "Alien session checklist",
  items: [
    {
      id: "alien.prep.agendas",
      phase: "prep",
      mode: [CINEMATIC],
      page: [27, 158],
      text: "Prepare this act's personal agendas",
      guidance: "Each PC gets a new, hidden agenda as a handout at the start of every act. Keep them secret from the other players.",
    },
    {
      id: "alien.prep.job",
      phase: "prep",
      mode: [CAMPAIGN],
      page: 244,
      text: "Have a job on offer",
      guidance: "Pick or roll up the next job: destination, difficulty, pay and employer, then the frame's details.",
    },
    {
      id: "alien.prep.infections",
      phase: "prep",
      page: 214,
      text: "Check running infections",
      guidance: "A Chestburster is born about two shifts after a facehug. Look at the life-cycle tracker so nothing hatches unnoticed.",
    },
    {
      id: "alien.play.supply",
      phase: "play",
      page: [28, 29],
      text: "Call for supply rolls",
      guidance: "Air after each stretch and after hard exertion, ammo after firing, power after each use. Each stress die that shows a 1 lowers the rating by one.",
    },
    {
      id: "alien.play.story-points",
      phase: "play",
      mode: [CINEMATIC],
      page: 158,
      text: "Award Story Points at the end of each act",
      guidance: "One Story Point to each player whose PC pushed their agenda despite risk or sacrifice. Do not say why.",
    },
    {
      id: "alien.wrap.xp",
      phase: "wrap",
      mode: [CAMPAIGN],
      page: 30,
      text: "Go through the XP questions",
      guidance: "One XP per question a player can answer yes to. The group talks it through; the GM has the final say. XP is spent between sessions.",
      autoWhen: "prompts-answered",
    },
    {
      id: "alien.wrap.trauma",
      phase: "wrap",
      page: 74,
      text: "Check for mental trauma",
      guidance: "Anyone who rolled 9 or more on a panic roll this session makes an Empathy roll (attribute only, no push). Agree as a group before using these rules.",
      autoWhen: "prompts-answered",
    },
  ],
};

export const sessionChecklistTemplate: Template = {
  id: "alien.template.session-checklist",
  kind: "checklist",
  appliesTo: "session",
  name: "Alien session checklist",
  mode: [CINEMATIC, CAMPAIGN],
  // The items cite their own pages; this is the chapter on running the game.
  page: 157,
  description: "Alien-specific reminders added to the generic session checklist: agendas, jobs, infections, supplies, Story Points, XP and trauma.",
  scaffold: sessionChecklistScaffold,
};
