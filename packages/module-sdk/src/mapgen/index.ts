/** Built-in map generator engines for data packs (see registry.ts and docs/modules/map-generators.md). */
export * from "./types";
export * from "./registry";
export { mapGeneratorIssues, type MapGeneratorIssue, type MapGeneratorCheckOptions } from "./check";
export { DUNGEON_STAGES, dungeonInputSchema, dungeonInputsFromAdventure, dungeonLegend, dungeonPassable, normalizeInputs as normalizeDungeonInputs, type DungeonInputs, type DungeonKeyRoom } from "./dungeon/inputs";
