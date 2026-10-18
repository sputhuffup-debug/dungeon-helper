import type { Template, TemplateChecklist } from "@campaign-forge/module-sdk";
import { CAMPAIGN } from "../modes";

/** Session zero checklist (p. 158). Items write into campaign settings paths. */
export const sessionZeroScaffold: TemplateChecklist = {
  title: "Session zero",
  items: [
    { id: "frame", text: "Choose the campaign frame.", page: 234, kind: "choice", options: ["space-truckers", "colonial-marines", "frontier-colonists"], writesTo: "settings.frame" },
    { id: "how-met", text: "How did the crew meet, and how long have they worked together?", page: 158, kind: "text", writesTo: "settings.crewOrigin" },
    { id: "buddies-rivals", text: "Each player names a buddy and a rival among the other PCs (create buddy_of / rival_of links).", page: 158, kind: "text", writesTo: "settings.buddiesAndRivals" },
    { id: "agendas", text: "Each PC chooses a personal agenda.", page: 27, kind: "text", writesTo: "settings.agendasNoted" },
    { id: "goals", text: "What does the crew as a whole want?", page: 158, kind: "text", writesTo: "settings.crewGoal" },
    { id: "employer", text: "Who employs or sponsors the crew?", page: 234, kind: "entity", writesTo: "settings.employer" },
    { id: "ship", text: "Which ship do they fly, and who owns it?", page: 121, kind: "entity", writesTo: "settings.ship" },
    { id: "home-base", text: "Where is home base?", page: 159, kind: "entity", writesTo: "settings.homeBase" },
    { id: "location", text: "Where is the crew right now, and what is the date?", page: 158, kind: "entity", writesTo: "settings.currentLocation" },
    { id: "theme", text: "Pick or roll the campaign theme.", page: 158, kind: "text", writesTo: "settings.theme" },
    { id: "tone", text: "Tone, lines and veils: what the table wants and what stays off screen.", page: 158, kind: "text", writesTo: "settings.linesAndVeils" },
    { id: "lethality", text: "Agree how lethal the campaign is and what happens when a PC dies.", page: 157, kind: "text", writesTo: "settings.lethality" },
    { id: "xp-reminder", text: "Remind players of the nine XP questions.", page: 30, kind: "boolean", writesTo: "settings.xpExplained" },
  ],
};

export const sessionZeroTemplate: Template = {
  id: "alien.template.session-zero",
  kind: "checklist",
  name: "Session zero checklist",
  description: "Questions to settle before the first campaign session; answers are stored in campaign settings.",
  mode: [CAMPAIGN],
  page: 158,
  scaffold: sessionZeroScaffold,
};
