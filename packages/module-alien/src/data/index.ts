import type { EntityPreset, ReferenceList } from "@campaign-forge/module-sdk";
import { npcPresets } from "./npc-presets";
import { creaturePresets } from "./creatures";
import { itemPresets } from "./items";
import { vehiclePresets } from "./vehicles";
import { shipPresets } from "./ships";
import { factionPresets } from "./factions";
import { locationPresets } from "./charted-space";
import { shipReferenceLists } from "./ship-reference";
import { minorCorporations } from "./minor-corporations";

export type { AlienPreset } from "./types";
export { presetSubtype, subtypeTag, withinTag, SUBTYPE_TAG, WITHIN_TAG } from "./types";

export { npcPresets } from "./npc-presets";
export { creaturePresets } from "./creatures";
export { itemPresets, weaponPresets, armorPresets, toolPresets, medicalPresets, pharmaceuticalPresets, foodPresets, otherItemPresets } from "./items";
export { vehiclePresets } from "./vehicles";
export { shipPresets } from "./ships";
export { factionPresets, majorFactionPresets, minorFactionPresets } from "./factions";
export { locationPresets } from "./charted-space";
export { shipClasses, shipModules, shipUpgrades, shipArmaments, shipReferenceLists, SHIP_MODULE_IDS, SHIP_UPGRADE_IDS, SHIP_ARMAMENT_IDS } from "./ship-reference";
export { minorCorporations, minorCorporationRows } from "./minor-corporations";

/** Every stat-block preset shipped by the module, all families concatenated. */
export const presets: EntityPreset[] = [
  ...npcPresets,
  ...creaturePresets,
  ...itemPresets,
  ...vehiclePresets,
  ...shipPresets,
  ...factionPresets,
  ...locationPresets,
];

/** Reference lists owned by the data folder (ship lists and minor corporations). */
export const dataReferenceLists: ReferenceList[] = [...shipReferenceLists, minorCorporations];
