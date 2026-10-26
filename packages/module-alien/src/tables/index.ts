/** All Alien module random tables, flat across families. */
import type { RollTable } from "@campaign-forge/module-sdk";
import { agendaTables } from "./agendas";
import { characterTables } from "./character";
import { creatureTables } from "./creatures";
import { encounterTables } from "./encounters";
import { jobTables } from "./jobs";
import { lifepathTables } from "./lifepath";
import { mapTables } from "./maps";
import { shipTables, travelTables } from "./ships";
import { shoreLeaveTables } from "./shore-leave";
import { systemTables } from "./system";
import { worldTables } from "./world";

export const tablesByFamily: Record<string, RollTable[]> = {
  character: characterTables,
  lifepath: lifepathTables,
  world: worldTables,
  system: systemTables,
  jobs: jobTables,
  encounters: encounterTables,
  "shore-leave": shoreLeaveTables,
  ship: shipTables,
  travel: travelTables,
  creatures: creatureTables,
  maps: mapTables,
  agendas: agendaTables,
};

export const tables: RollTable[] = Object.values(tablesByFamily).flat();

