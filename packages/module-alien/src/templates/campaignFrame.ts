import type { Template } from "@campaign-forge/module-sdk";
import { CAMPAIGN } from "../modes";

/** Campaign frame record (p. 234-235): the frame, employment, employer, ship, base and weekly salary. */
export const campaignFrameTemplate: Template = {
  id: "alien.template.campaign-frame",
  kind: "campaign",
  name: "Campaign frame record",
  description: "Pick a frame and record the employment, employer, ship, home base and salary that define the campaign.",
  mode: [CAMPAIGN],
  page: [234, 235],
  scaffold: {
    frame: { ref: "alien.frames", value: "", note: "space-truckers, colonial-marines or frontier-colonists (p. 234)" },
    jobType: { value: "", note: "job (cargo runs, p. 244), mission (military missions, p. 247) or expedition (p. 250); follows from the frame" },
    employment: { value: "", note: "Employees of a government, corporation or the military, or freelancers (p. 234)" },
    employer: { entityType: "alien.faction", value: "", note: "Who the crew works for (the frame's suggested employers); link with employer_of on each job. Marines take orders from their corps HQ (p. 235)" },
    ship: { entityType: "alien.spaceship", value: "", note: "The crew's starting ship (assigned to employees, leased or owned by freelancers, p. 234); link crew_of from each PC" },
    homeBase: { entityType: "alien.location", value: "", note: "Station, colony or the ship itself (p. 159)" },
    salaryBand: { value: "", note: "The frame's weekly salary; time in stasis pays 10% (p. 234-235)" },
    debtOrObligation: { value: "", note: "What the crew owes and to whom" },
    jobTables: { note: "Table ids come from the frame record's jobTables (alien.jobs.<frame>.*); Colonial Marines have no employer table" },
    theme: { value: "", note: "Campaign theme (p. 158)" },
    startingLocation: { entityType: "alien.location", value: "", note: "Anywhere in charted space; the Tartarus Sector, Jackson's Star or Novgorod station make good starts (p. 234)" },
    notes: "",
  },
};
