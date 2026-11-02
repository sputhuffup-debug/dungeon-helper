/**
 * Site map generators for the Alien module. `alien.map.site` builds an
 * original zone-based deck plan (station, ship, colony block, derelict, mine,
 * research lab or alien ruin) for one cinematic scenario.
 */
import type { MapGeneratorDef, MapZoneTable } from "@campaign-forge/module-sdk";
import { CAMPAIGN, CINEMATIC } from "../modes";
import { DUCT_EVENTS_TABLE_ID } from "../tables/maps";
import { MAP_GENERATOR_ID, MAP_LEGEND, RANGE_BANDS } from "./data";
import { MAP_STAGES, generateSiteMap } from "./generator";
import { alienPassable } from "./helpers";
import { MAP_INPUT_SCHEMA, inputsFromAdventure } from "./inputs";
import { briefFromJob } from "./jobBrief";
import { ALIEN_HUNT } from "./hunt";

/** GM-only tables the table mode offers for matching zones. */
export const MAP_ZONE_TABLES: MapZoneTable[] = [
  {
    table: DUCT_EVENTS_TABLE_ID,
    label: "Duct event",
    when: { layer: "duct" },
    hint: "Roll when a crewmember enters a new duct zone, or once per stretch spent in the ducts.",
    page: 56,
  },
];

export const siteMapGenerator: MapGeneratorDef = {
  id: MAP_GENERATOR_ID,
  name: "Site map",
  description:
    "An original zone map of one site for a cinematic scenario or a campaign job: rooms and corridors with borders, locks per act, hazards, spawns, rogue humans, clues and win paths, plus a separate duct maze per deck with its own hazards, exits and shafts, checked against the zone and stealth rules.",
  page: [54, 58],
  mode: [CINEMATIC, CAMPAIGN],
  inputs: MAP_INPUT_SCHEMA,
  stages: MAP_STAGES.map((s) => ({ id: s.id, title: s.title })),
  generate: generateSiteMap,
  inputsFromAdventure,
  briefFromEntity: briefFromJob,
  passable: alienPassable,
  rangeBands: RANGE_BANDS,
  legend: MAP_LEGEND,
  zoneTables: MAP_ZONE_TABLES,
  hunt: ALIEN_HUNT,
};

export const mapGenerators: MapGeneratorDef[] = [siteMapGenerator];

export * from "./data";
export { MAP_STAGES, MAX_ATTEMPTS, createMapContext, generateSiteMap, validateLayout, threatSpecs, hostileSpecs } from "./generator";
export * from "./hostiles";
export * from "./hunt";
export { jobSiteBrief, briefFromJob, JOB_BRIEF_ROWS, THREAT_KINDS, THREAT_KIND_LABELS, THREAT_SLOTS, SIZE_BY_DIFFICULTY, type JobSiteBrief, type JobBriefFacts, type JobBriefNpc, type ThreatKind } from "./jobBrief";
export {
  alienPassable,
  distancesFrom,
  playerLayout,
  rangeBandFor,
  zoneAdjacency,
  zoneDistances,
  FOUND_DUCT_FLAGS,
  PLAYER_ZONE_FLAGS,
  PLAYER_BORDER_FLAGS,
  type DistanceOptions,
  type PlayerLayoutOptions,
} from "./helpers";
export { MAP_INPUT_SCHEMA, PLACEABLE_CREATURES, inputsFromAdventure, normalizeMapInputs, resolveCreature, type MapInputs, type ThreatInput, type KeyRoomInput, type PuzzleInput, type NpcInput, type HostileInput } from "./inputs";
export { polyBounds, rectPoly } from "./layout";
export { DUCT_SHAPE_LABELS, DUCT_SHEET_MAX, DUCT_SHEET_MIN, type DuctShape, type DuctRole } from "./ducts";
