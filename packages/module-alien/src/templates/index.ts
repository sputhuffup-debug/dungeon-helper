import type { Template } from "@campaign-forge/module-sdk";
import { cinematicAdventureTemplate, cinematicBuilderTemplate } from "./cinematicAdventure";
import { campaignFrameTemplate } from "./campaignFrame";
import { sessionZeroTemplate } from "./sessionZero";
import { jobCardTemplate } from "./jobCard";
import { shoreLeaveTemplate } from "./shoreLeave";
import { sceneTemplate } from "./scene";
import { sessionChecklistTemplate } from "./sessionChecklist";

export { cinematicAdventureTemplate, cinematicAdventureScaffold, cinematicBuilderTemplate, cinematicBuilderScaffold } from "./cinematicAdventure";
export type { BuilderTemplateAct } from "./cinematicAdventure";
export { campaignFrameTemplate } from "./campaignFrame";
export { sessionZeroTemplate, sessionZeroScaffold } from "./sessionZero";
export { jobCardTemplate, jobCardScaffold } from "./jobCard";
export { shoreLeaveTemplate } from "./shoreLeave";
export { sceneTemplate } from "./scene";
export { sessionChecklistTemplate, sessionChecklistScaffold } from "./sessionChecklist";

export const templates: Template[] = [
  cinematicAdventureTemplate,
  cinematicBuilderTemplate,
  campaignFrameTemplate,
  sessionZeroTemplate,
  jobCardTemplate,
  shoreLeaveTemplate,
  sceneTemplate,
  sessionChecklistTemplate,
];
