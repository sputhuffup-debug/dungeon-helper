import type { Template } from "@campaign-forge/module-sdk";
import { cinematicAdventureTemplate } from "./cinematicAdventure";
import { campaignFrameTemplate } from "./campaignFrame";
import { sessionZeroTemplate } from "./sessionZero";
import { jobCardTemplate } from "./jobCard";
import { shoreLeaveTemplate } from "./shoreLeave";
import { sceneTemplate } from "./scene";

export { cinematicAdventureTemplate, cinematicAdventureScaffold } from "./cinematicAdventure";
export { campaignFrameTemplate } from "./campaignFrame";
export { sessionZeroTemplate, sessionZeroScaffold } from "./sessionZero";
export { jobCardTemplate, jobCardScaffold } from "./jobCard";
export { shoreLeaveTemplate } from "./shoreLeave";
export { sceneTemplate } from "./scene";

export const templates: Template[] = [
  cinematicAdventureTemplate,
  campaignFrameTemplate,
  sessionZeroTemplate,
  jobCardTemplate,
  shoreLeaveTemplate,
  sceneTemplate,
];
