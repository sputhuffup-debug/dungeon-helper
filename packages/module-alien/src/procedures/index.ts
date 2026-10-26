/** All Alien module procedures. `alien.session-end` is a hook, not a procedure. */
import type { Procedure } from "@campaign-forge/module-sdk";
import { agendaDraftsProcedure } from "./agendas";
import { betweenJobs } from "./between-jobs";
import { encounterCheck } from "./encounter";
import { jobCreate } from "./job";
import { lifepath } from "./lifepath";
import { shoreLeave } from "./shore-leave";
import { systemCreate } from "./system";
import { worldCreate } from "./world";

export const procedures: Procedure[] = [worldCreate, systemCreate, jobCreate, lifepath, encounterCheck, shoreLeave, betweenJobs, agendaDraftsProcedure];

export { worldCreate, systemCreate, jobCreate, lifepath, encounterCheck, shoreLeave, betweenJobs, agendaDraftsProcedure };
