import type { Template, TemplateAdventure } from "@campaign-forge/module-sdk";
import { CAMPAIGN } from "../modes";

/** Job run scaffold (p. 244-252): briefing, travel, destination, complications, payout. */
export const jobCardScaffold: TemplateAdventure = {
  title: "<Job title>",
  premise: "_The job in one line: what, for whom, where, for how much._",
  playerIntro: "_The offer as the employer makes it. Leave out what they are not saying._",
  gmSituation: "_What is really going on: the complications, the twist, who else wants the cargo._",
  acts: [
    {
      number: 1,
      title: "Briefing and departure",
      goal: "Take the job, haggle, load up and leave.",
      pacing: "Short. One scene with the employer, one for supplies and goodbyes.",
      scenes: [
        { purpose: "Briefing: the employer or sponsor makes the offer (link the alien.job entity).", mandatory: true },
        { purpose: "Preparation: shopping, supply checks, a word with a rival.", mandatory: false },
      ],
    },
    {
      number: 2,
      title: "Travel",
      goal: "Get there. Encounter checks per jump and per day in-system.",
      pacing: "Roll encounters at the cadence for deep space (p. 252-257); one complication may hit en route.",
      scenes: [
        { purpose: "Transit: hypersleep, a wake-up, an encounter roll.", mandatory: true },
        { purpose: "Complication en route (from the job's complications).", mandatory: false },
      ],
    },
    {
      number: 3,
      title: "Destination",
      goal: "Do the job. The complications land here.",
      pacing: "One scene per complication; stealth mode if anything is hunting.",
      scenes: [
        { purpose: "Arrival at the destination (link the location).", mandatory: true },
        { purpose: "Complication 1", mandatory: true },
        { purpose: "Complication 2 / plot twist", mandatory: false },
      ],
    },
    {
      number: 4,
      title: "Payout",
      goal: "Get paid, or not. Bonus reward, debts, shore leave next.",
      pacing: "Short. Settle cash, XP questions, note injuries for shore leave.",
      scenes: [{ purpose: "Settlement with the employer; apply payment to the crew's cash.", mandatory: true }],
    },
  ],
  epilogue: "_What changed: reputation with the employer, new enemies, what the crew learned._",
};

export const jobCardTemplate: Template = {
  id: "alien.template.job-card",
  kind: "adventure",
  name: "Job card",
  description: "Run a generated job: briefing, travel, destination with complications, payout.",
  mode: [CAMPAIGN],
  page: [244, 252],
  scaffold: jobCardScaffold,
};
