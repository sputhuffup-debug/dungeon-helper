import type { Template, TemplateChecklist } from "@campaign-forge/module-sdk";
import { CAMPAIGN } from "../modes";

/** Session zero checklist (p. 158, frame and employment p. 234, home base p. 159). Items write into campaign settings paths. */
export const sessionZeroScaffold: TemplateChecklist = {
  title: "Session zero",
  items: [
    { id: "frame", text: "Choose the campaign frame together: space truckers, colonial marines or frontier colonists.", page: 234, kind: "choice", options: ["space-truckers", "colonial-marines", "frontier-colonists"], writesTo: "settings.frame" },
    { id: "employment", text: "Are the PCs employees of a government, corporation or the military, or freelancers?", page: 234, kind: "choice", options: ["employees", "freelancers"], writesTo: "settings.employment" },
    { id: "how-met", text: "How did the crew meet, and how long have they worked together?", page: 158, kind: "text", writesTo: "settings.crewOrigin" },
    { id: "buddies-rivals", text: "Who are each PC's buddy and rival? (create buddy_of / rival_of links)", page: 158, kind: "text", writesTo: "settings.buddiesAndRivals" },
    { id: "purpose", text: "What does the crew do, and why?", page: 158, kind: "text", writesTo: "settings.crewPurpose" },
    { id: "ship", text: "Does the crew have a spaceship? What kind, and what is it called?", page: 158, kind: "entity", writesTo: "settings.ship" },
    { id: "goals", text: "What are the crew's goals as a group?", page: 158, kind: "text", writesTo: "settings.crewGoal" },
    { id: "allies-enemies", text: "Do they share any allies or enemies?", page: 158, kind: "text", writesTo: "settings.alliesAndEnemies" },
    { id: "employer", text: "Who do they work for?", page: 158, kind: "entity", writesTo: "settings.employer" },
    { id: "location", text: "Where are they now?", page: 158, kind: "entity", writesTo: "settings.currentLocation" },
    { id: "theme", text: "Give the campaign a focus: choose or roll the campaign theme.", page: 158, kind: "text", writesTo: "settings.theme" },
    { id: "home-base", text: "Where is home base, if any?", page: 159, kind: "entity", writesTo: "settings.homeBase" },
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
