import type { ReferenceItem, ReferenceList } from "@campaign-forge/module-sdk";
import { CAMPAIGN } from "../modes";

export interface FrameItem extends ReferenceItem {
  /** Short id used in job table ids: alien.jobs.<short>.* */
  short: string;
  jobType: "job" | "mission" | "expedition";
  /** Table ids this frame's job generator rolls, in order. */
  jobTables: { employer: string; bonus: string; mission: string; destination: string; complications: string; plotTwist: string };
  defaultCareers: string[];
  ships: string[];
  salaryBand: string;
  unverified: true;
}

const frame = (f: Omit<FrameItem, "unverified" | "mode" | "page">): FrameItem => ({
  ...f,
  mode: [CAMPAIGN],
  page: [234, 235],
  unverified: true,
});

/** Ids follow tables/jobs.ts: every frame uses employer/bonus/mission/destination/complications. */
const jobTables = (short: string) => ({
  employer: `alien.jobs.${short}.employer`,
  bonus: `alien.jobs.${short}.bonus`,
  mission: `alien.jobs.${short}.mission`,
  destination: `alien.jobs.${short}.destination`,
  complications: `alien.jobs.${short}.complications`,
  plotTwist: "alien.jobs.plot-twist",
});

/** The three campaign frames (p. 234-235). */
export const frameItems: FrameItem[] = [
  frame({
    id: "space-truckers",
    name: "Space Truckers",
    short: "truckers",
    jobType: "job",
    summary: "A working crew hauling cargo on a battered freighter, one job away from bankruptcy.",
    jobTables: jobTables("truckers"),
    defaultCareers: ["roughneck", "pilot", "officer", "medic", "company-agent", "scientist"],
    ships: ["Lockmart CM-90S Corvus", "Weyland-Yutani M-Class starfreighter"],
    salaryBand: "Low: wages plus bonus shares; the ship's loan eats most of it.",
  }),
  frame({
    id: "colonial-marines",
    name: "Colonial Marines",
    short: "marines",
    jobType: "mission",
    summary: "A squad of the USCMC sent on missions nobody else wants, by officers who do not say why.",
    jobTables: jobTables("marines"),
    defaultCareers: ["colonial-marine", "officer", "medic", "pilot"],
    ships: ["Conestoga-class troop transport", "UD-4L Cheyenne dropship"],
    salaryBand: "Military pay by rank; hazard bonuses at the Corps' discretion.",
  }),
  frame({
    id: "frontier-colonists",
    name: "Frontier Colonists",
    short: "colonists",
    jobType: "expedition",
    summary: "Settlers and specialists on a new world, sponsored by someone with their own agenda.",
    jobTables: jobTables("colonists"),
    defaultCareers: ["scientist", "colonial-marshal", "roughneck", "medic", "kid", "company-agent"],
    ships: ["Colony shuttle", "Surveyor-class scout"],
    salaryBand: "Colonial stipend plus expedition sponsorship; paid in supplies as often as cash.",
  }),
];

export const frames: ReferenceList = {
  id: "alien.frames",
  name: "Campaign frames",
  page: [234, 235],
  unverified: true,
  itemSchema: {
    type: "object",
    required: ["id", "name", "short", "jobType", "jobTables", "defaultCareers", "salaryBand"],
    properties: {
      id: { type: "string" },
      name: { type: "string" },
      short: { type: "string" },
      jobType: { type: "string", enum: ["job", "mission", "expedition"] },
      jobTables: { type: "object" },
      defaultCareers: { type: "array", items: { type: "string" } },
      ships: { type: "array", items: { type: "string" } },
      salaryBand: { type: "string" },
      page: { type: ["integer", "array"] },
      unverified: { type: "boolean" },
    },
  },
  items: frameItems,
};
