import type { AdventureBuilderDef } from "@campaign-forge/module-sdk";
import { cinematicBuilder } from "./cinematic";

export {
  cinematicBuilder,
  CINEMATIC_BUILDER_ID,
  STEP_IDS,
  pcCreationIssues,
  agendaText,
  scenesOfAct,
  isFilledEvent,
} from "./cinematic";

export const adventureBuilders: AdventureBuilderDef[] = [cinematicBuilder];
