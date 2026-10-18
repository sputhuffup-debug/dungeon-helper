import type { Template } from "@campaign-forge/module-sdk";
import { CAMPAIGN } from "../modes";

/** Campaign frame record (p. 234-235): the premise, employer, ship, base and pay band. */
export const campaignFrameTemplate: Template = {
  id: "alien.template.campaign-frame",
  kind: "campaign",
  name: "Campaign frame record",
  description: "Pick a frame and record the employer, the ship, the home base and the salary band that define the campaign.",
  mode: [CAMPAIGN],
  page: [234, 235],
  scaffold: {
    frame: { ref: "alien.frames", value: "", note: "space-truckers, colonial-marines or frontier-colonists (p. 234)" },
    jobType: { value: "", note: "job, mission or expedition; follows from the frame" },
    employer: { entityType: "alien.faction", value: "", note: "Who the crew works for; link with employer_of on each job" },
    ship: { entityType: "alien.spaceship", value: "", note: "The crew's ship; link crew_of from each PC" },
    homeBase: { entityType: "alien.location", value: "", note: "Station, colony or the ship itself (p. 159)" },
    salaryBand: { value: "", note: "From the frame's salary band; adjust for debt and rank" },
    debtOrObligation: { value: "", note: "What the crew owes and to whom" },
    jobTables: { note: "Table ids come from the frame record's jobTables (alien.jobs.<frame>.*)" },
    theme: { value: "", note: "Campaign theme (p. 158)" },
    startingLocation: { entityType: "alien.location", value: "" },
    notes: "",
  },
};
