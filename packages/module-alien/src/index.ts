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
import { narrativeFields, campaignThemes, fearStages } from "./narrative";
import { adventureBuilders } from "./builders";
import { mapGenerators } from "./maps";
import { playGuide } from "./guides";
import { primer } from "./primer";
import { combat } from "./combat";
import { crewShip, ledger } from "./economy";
import { travel } from "./travel";
import { progression } from "./progression";
import { gmScreen } from "./gmScreen";

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
export * from "./narrative";
export * from "./builders";
export * from "./maps";
export { playGuide, PLAY_GUIDE_ID } from "./guides";
export * from "./combat";
export * from "./economy";
export { travel, FATIGUED_CONDITION } from "./travel";
export * from "./progression";
export { gmScreen } from "./gmScreen";
export { shipTables, travelTables, MINOR_DAMAGE_TABLE, MAJOR_DAMAGE_TABLE, NDD_TABLE } from "./tables/ships";
export { BETWEEN_JOBS_ID } from "./procedures/between-jobs";
export { JOB_BOARD_ID, jobBoard, dealBoard, postingOffer, playerText as postingPlayerText, difficultyLine, rollBookJob, boardCast, EMPLOYER_BIASES, POSTING_HANDOUT_PURPOSE, type PostingData, type BoardNpc, type BoardCast, type BookJob } from "./procedures/job-board";
export { dealNpcAgenda, isBetrayer, effectiveDifficulty, agendaText as npcAgendaText, arcWeight, RESOLVED_NPC_ARCS, type NpcAgenda } from "./procedures/npc-agendas";
export { NPC_ROLES, CONTACT_ROLE, NPC_ARCS, TREACHERY_DIAL, TREACHERY_WEIGHTS, SYNTHETIC_DIRECTIVES, type TreacheryDial } from "./procedures/job-board-data";
export { AGENDAS_ID, agendaDraftsProcedure, actText, STORY_POINT_PAGE } from "./procedures/agendas";
export { AGENDA_ARCS, ARC_IDS, arcById, BETRAYAL_DIAL, type AgendaArc } from "./procedures/agenda-arcs";
export { analyseParty } from "./procedures/agenda-conflicts";
export { buildCast } from "./procedures/agenda-targets";
export {
  CAMPAIGN_AGENDAS_ID,
  CAMPAIGN_AGENDA_FIELD,
  CAMPAIGN_AGENDA_DEF,
  CAMPAIGN_AGENDA_OUTCOMES,
  campaignAgendasProcedure,
  buildCampaignCast,
  asRecord as campaignAgendaRecord,
  type CampaignAgendaRecord,
  type CampaignAgendaOutcome,
} from "./procedures/campaign-agendas";
export { CAMPAIGN_GOALS, FRICTION_TEMPLATES, EMBARRASSING_SECRETS, TENSION_LADDER, TENSION_CAP, FRICTION_KINDS, followUpsOf } from "./procedures/campaign-agenda-data";
export { checkCampaignDeal, scanText, campaignMaterialTexts, BANNED_PATTERNS } from "./procedures/campaign-agenda-check";
export { mapTables, ductEventsTable, LOCATION_DETAIL_TABLE_ID, ANOMALOUS_DETAIL_TABLE_ID, SALVAGE_TABLE_ID, DUCT_EVENTS_TABLE_ID } from "./tables/maps";

export const referenceLists = [...coreReferenceLists, ...dataReferenceLists, campaignThemes, fearStages];

/** The purpose the app keeps a PC's campaign agenda GM card under (core's LONG_AGENDA_PURPOSE; the module cannot import core). */
export const CAMPAIGN_AGENDA_CARD_PURPOSE = "long-agenda";

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
  narrativeFields,
  adventureBuilders,
  mapGenerators,
  playGuides: [playGuide],
  primer,
  combat,
  ledger,
  crewShip,
  travel,
  progression,
  gmScreen,
  // a PC's agenda cards (one per act in cinematic play) reach that PC's player once the GM gives each one out;
  // the campaign agenda's GM card (with the embarrassing secret) never does: the player reads their agenda in their packet
  ownerHandouts: [{ kind: "agenda", when: "given", gmOnlyPurposes: [CAMPAIGN_AGENDA_CARD_PURPOSE], gmOnlyNote: "Players get their agenda in their packet; this card stays with you." }],
  migrations: [],
};

export default alienModule;
