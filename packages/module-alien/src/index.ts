/**
 * The Alien RPG (Evolved Edition) module for Campaign Forge.
 *
 * Assembles manifest, dice, entity types, reference data, tables, procedures,
 * templates, rule cards, trackers, calendar and hooks into one GameModule.
 * This is the only package allowed to know what a xenomorph is.
 */
import type { GameModule } from "@campaign-forge/module-sdk";
import { manifest, ALIEN_MODULE_ID, ALIEN_MODULE_VERSION } from "./manifest";
import { modes, CAMPAIGN, CINEMATIC } from "./modes";
import { diceSystem } from "./dice";
import { entityTypes } from "./entities";
import { relationshipTypes } from "./relationships";
import { referenceLists as coreReferenceLists } from "./reference";
import { rules } from "./rules";
import { templates } from "./templates";
import { trackers } from "./trackers";
import { calendar } from "./calendar";
import { hooks } from "./hooks";
import { styleNotes } from "./styleNotes";
import { tables } from "./tables";
import { procedures } from "./procedures";
import { presets, dataReferenceLists } from "./data";

export { manifest, ALIEN_MODULE_ID, ALIEN_MODULE_VERSION } from "./manifest";
export { modes, CAMPAIGN, CINEMATIC } from "./modes";
export * from "./dice";
export * from "./entities";
export { relationshipTypes } from "./relationships";
export * from "./reference";
export { rules, ruleIds } from "./rules";
export * from "./templates";
export * from "./trackers";
export { gestationConfig, gestationVariants, LIFECYCLE_CONDITIONS, EMERGED_FROM } from "./lifecycle";
export { calendar } from "./calendar";
export { hooks, onSessionEnd, onEntityChange, XP_QUESTIONS, TRAUMA_THRESHOLD } from "./hooks";
export { styleNotes, gmPrinciples, themes } from "./styleNotes";
export { tables } from "./tables";
export { procedures } from "./procedures";
export { presets, dataReferenceLists } from "./data";

export const referenceLists = [...coreReferenceLists, ...dataReferenceLists];

export const alienModule: GameModule = {
  manifest,
  dice: diceSystem,
  entityTypes,
  relationshipTypes,
  referenceLists,
  presets,
  tables,
  procedures,
  templates,
  rules,
  trackers,
  calendar,
  styleNotes,
  hooks,
  migrations: [],
};

export default alienModule;
