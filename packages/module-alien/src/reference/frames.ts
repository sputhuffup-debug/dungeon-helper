import type { ReferenceItem, ReferenceList } from "@campaign-forge/module-sdk";
import { CAMPAIGN } from "../modes";

export interface FrameInput {
  id: string;
  name: string;
  summary: string;
  /** Short id used in job table ids: alien.jobs.<short>.* */
  short: string;
  jobType: "job" | "mission" | "expedition";
  /** The book's name for the frame's jobs and where their tables start. */
  typicalJobs: string;
  jobsPage: number;
  /**
   * Table ids this frame's job generator rolls, in order. Colonial Marines
   * have no employer table: orders come from Marine Corps HQ (p. 235).
   */
  jobTables: { employer?: string; bonus: string; mission: string; destination: string; complications: string; plotTwist: string };
  suggestedEmployers: string[];
  /** Suggested careers (career ids). */
  defaultCareers: string[];
  /** Suggested spaceship, with its page. */
  ships: string[];
  /** Spaceship preset ids (src/data/ships.ts) for the suggested ship. */
  shipPresets: string[];
  /** Weekly salary as printed. */
  salaryBand: string;
  page: number;
}

export type FrameItem = FrameInput & ReferenceItem;

const frame = (f: FrameInput): FrameItem => ({ ...f, mode: [CAMPAIGN] });

/** Ids follow tables/jobs.ts. */
const jobTables = (short: string, withEmployer = true): FrameInput["jobTables"] => ({
  ...(withEmployer ? { employer: `alien.jobs.${short}.employer` } : {}),
  bonus: `alien.jobs.${short}.bonus`,
  mission: `alien.jobs.${short}.mission`,
  destination: `alien.jobs.${short}.destination`,
  complications: `alien.jobs.${short}.complications`,
  plotTwist: "alien.jobs.plot-twist",
});

/** The three campaign frames (p. 234-235). Summaries are paraphrased. */
export const frameItems: FrameItem[] = [
  frame({
    id: "space-truckers",
    name: "Space Truckers",
    short: "truckers",
    jobType: "job",
    typicalJobs: "Cargo runs",
    jobsPage: 244,
    summary: "The crew of a tug or cargo hauler, working for the ship's owner and hauling whatever the client needs: ore, colonists, supplies, rigs or salvage.",
    jobTables: jobTables("truckers"),
    suggestedEmployers: ["Weyland-Yutani", "Lasalle Bionational", "Seegson"],
    defaultCareers: ["company-agent", "medic", "officer", "pilot", "roughneck"],
    ships: ["Model CM-88G Bison M-Class Commercial Starfreighter (p. 134)"],
    shipPresets: ["alien.spaceship.bison-m-class-hauler"],
    salaryBand: "$400–960 per week (time in stasis pays 10%)",
    page: 234,
  }),
  frame({
    id: "colonial-marines",
    name: "Colonial Marines",
    short: "marines",
    jobType: "mission",
    typicalJobs: "Military missions",
    jobsPage: 247,
    summary: "A small squad whose PCs are the leaders making the calls. Orders come down the chain of command; a mercenary company is the open-ended alternative.",
    jobTables: jobTables("marines", false),
    suggestedEmployers: ["USCMC (United Americas)", "Space Operating Forces (Union of Progressive Peoples)", "Royal Marines Commandos (Three World Empire)"],
    defaultCareers: ["colonial-marine", "medic", "officer", "pilot", "roughneck"],
    ships: ["Conestoga-Class Frigate (p. 136-137)"],
    shipPresets: ["alien.spaceship.conestoga-class-troop-transport"],
    salaryBand: "$500–760 per week (time in stasis pays 10%)",
    page: 235,
  }),
  frame({
    id: "frontier-colonists",
    name: "Frontier Colonists",
    short: "colonists",
    jobType: "expedition",
    typicalJobs: "Expeditions",
    jobsPage: 250,
    summary: "Surveyors, prospectors and explorers on the Outer Rim, chasing raw materials and lost technology on expeditions paid for by sponsors.",
    jobTables: jobTables("colonists"),
    suggestedEmployers: ["Weyland-Yutani", "ICSC", "Colonial Marshal Bureau"],
    defaultCareers: ["colonial-marshal", "company-agent", "kid", "medic", "pilot", "roughneck", "scientist"],
    // The frame text (p. 235) calls it M-Class; its stat block (p. 133) says G-Class.
    ships: ["Model CM-90S Corvus G-Class Commercial Deep Space Salvage Vessel (p. 132-133)"],
    shipPresets: ["alien.spaceship.lockmart-cm-90s-corvus"],
    salaryBand: "$500–640 per week (time in stasis pays 10%)",
    page: 235,
  }),
];

export const frames: ReferenceList = {
  id: "alien.frames",
  name: "Campaign frames",
  page: [234, 235],
  itemSchema: {
    type: "object",
    required: ["id", "name", "short", "jobType", "jobTables", "defaultCareers", "salaryBand"],
    properties: {
      id: { type: "string" },
      name: { type: "string" },
      short: { type: "string" },
      jobType: { type: "string", enum: ["job", "mission", "expedition"] },
      typicalJobs: { type: "string" },
      jobsPage: { type: "integer" },
      jobTables: { type: "object" },
      suggestedEmployers: { type: "array", items: { type: "string" } },
      defaultCareers: { type: "array", items: { type: "string" } },
      ships: { type: "array", items: { type: "string" } },
      shipPresets: { type: "array", items: { type: "string" } },
      salaryBand: { type: "string" },
      page: { type: ["integer", "array"] },
    },
  },
  items: frameItems,
};
