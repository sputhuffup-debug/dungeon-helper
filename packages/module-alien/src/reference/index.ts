import type { ReferenceList } from "@campaign-forge/module-sdk";
import { skills } from "./skills";
import { careers } from "./careers";
import { talents } from "./talents";
import { criticalInjuries } from "./criticalInjuries";
import { mentalTraumas } from "./mentalTraumas";
import { frames } from "./frames";

export { skills } from "./skills";
export { careers, careerItems } from "./careers";
export type { CareerItem } from "./careers";
export { talents, talentItems, careerTalents, generalTalents } from "./talents";
export type { TalentItem } from "./talents";
export { criticalInjuries, criticalInjuryItems } from "./criticalInjuries";
export type { CriticalInjuryItem } from "./criticalInjuries";
export { mentalTraumas, mentalTraumaItems } from "./mentalTraumas";
export type { MentalTraumaItem } from "./mentalTraumas";
export { frames, frameItems } from "./frames";
export type { FrameItem } from "./frames";

/** Reference lists owned by this folder; `data/` adds ship and corporation lists. */
export const referenceLists: ReferenceList[] = [skills, careers, talents, criticalInjuries, mentalTraumas, frames];
