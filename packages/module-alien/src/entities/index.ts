import type { EntityTypeDef } from "@campaign-forge/module-sdk";
import { characterType } from "./character";
import { creatureType } from "./creature";
import { locationType } from "./location";
import { factionType } from "./faction";
import { itemType } from "./item";
import { vehicleType } from "./vehicle";
import { spaceshipType } from "./spaceship";
import { clueType } from "./clue";
import { jobType } from "./job";
import { encounterType } from "./encounter";

export * from "./common";
export { characterType, characterComputed, characterSchema, HARDENED_TALENT, SEEN_IT_ALL_TALENT } from "./character";
export { creatureType } from "./creature";
export { locationType } from "./location";
export { factionType } from "./faction";
export { itemType } from "./item";
export { vehicleType } from "./vehicle";
export { spaceshipType } from "./spaceship";
export { clueType } from "./clue";
export { jobType } from "./job";
export { encounterType } from "./encounter";

export const entityTypes: EntityTypeDef[] = [
  characterType,
  creatureType,
  locationType,
  factionType,
  itemType,
  vehicleType,
  spaceshipType,
  clueType,
  jobType,
  encounterType,
];
