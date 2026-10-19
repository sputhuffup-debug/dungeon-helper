/**
 * Site map generators for the Alien module. `alien.map.site` builds an
 * original zone-based deck plan (station, ship, colony block, derelict, mine,
 * research lab or alien ruin) for one cinematic scenario.
 */
import type { MapGeneratorDef } from "@campaign-forge/module-sdk";
import { CINEMATIC } from "../modes";
import { MAP_GENERATOR_ID, MAP_LEGEND, RANGE_BANDS } from "./data";
import { MAP_STAGES, generateSiteMap } from "./generator";
import { alienPassable } from "./helpers";
import { MAP_INPUT_SCHEMA, inputsFromAdventure } from "./inputs";

export const siteMapGenerator: MapGeneratorDef = {
  id: MAP_GENERATOR_ID,
  name: "Site map",
  description:
    "An original zone map of one site for a cinematic scenario: rooms, corridors and ducts with borders, locks per act, hazards, spawns, clues and win paths, checked against the zone and stealth rules.",
  page: [54, 58],
  mode: [CINEMATIC],
  inputs: MAP_INPUT_SCHEMA,
  stages: MAP_STAGES.map((s) => ({ id: s.id, title: s.title })),
  generate: generateSiteMap,
  inputsFromAdventure,
  passable: alienPassable,
  rangeBands: RANGE_BANDS,
  legend: MAP_LEGEND,
};

export const mapGenerators: MapGeneratorDef[] = [siteMapGenerator];

export * from "./data";
export { MAP_STAGES, MAX_ATTEMPTS, createMapContext, generateSiteMap, validateLayout, threatSpecs } from "./generator";
export { alienPassable, distancesFrom, playerLayout, rangeBandFor, zoneAdjacency, zoneDistances, PLAYER_ZONE_FLAGS, PLAYER_BORDER_FLAGS, type DistanceOptions } from "./helpers";
export { MAP_INPUT_SCHEMA, PLACEABLE_CREATURES, inputsFromAdventure, normalizeMapInputs, resolveCreature, type MapInputs, type ThreatInput, type KeyRoomInput, type PuzzleInput, type NpcInput } from "./inputs";
export { ductRect, polyBounds, rectPoly } from "./layout";
