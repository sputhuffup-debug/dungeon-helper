import type { Template, TemplateAdventure } from "@campaign-forge/module-sdk";
import { CAMPAIGN } from "../modes";

/**
 * Job run scaffold (p. 244-252): briefing, travel, destination, complications,
 * payout. Underscored paragraphs are guidance (placeholder text for the GM,
 * never content); scene titles are what the players see. "Run this job"
 * (adventureSources) fills it from a job, scene by scene id.
 */
export const jobCardScaffold: TemplateAdventure = {
  title: "New job",
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
        { id: "briefing", title: "Briefing", purpose: "Briefing: the employer or sponsor makes the offer.", mandatory: true },
        { id: "preparation", title: "Preparation", purpose: "Preparation: shopping, supply checks, a word with a rival.", mandatory: false },
      ],
    },
    {
      number: 2,
      title: "Travel",
      goal: "Get there. Encounter checks per jump and per day in-system.",
      pacing: "Roll encounters at the cadence for deep space (p. 252-257); one complication may hit en route.",
      scenes: [
        { id: "transit", title: "Transit", purpose: "Transit: hypersleep, a wake-up, an encounter roll.", mandatory: true },
        { id: "en-route", title: "Trouble en route", purpose: "Trouble en route: one of the job's complications.", mandatory: false },
      ],
    },
    {
      number: 3,
      title: "Destination",
      goal: "Do the job. The complications land here.",
      pacing: "One scene per complication; stealth mode if anything is hunting.",
      scenes: [
        { id: "arrival", title: "Arrival", purpose: "Arrival: the crew reaches the site.", mandatory: true },
        { id: "complication", title: "Complication", purpose: "Complication: the first complication lands.", mandatory: true },
        { id: "twist", title: "The twist", purpose: "The twist: the second complication or the plot twist.", mandatory: false },
      ],
    },
    {
      number: 4,
      title: "Payout",
      goal: "Get paid, or not. Bonus reward, debts, shore leave next.",
      pacing: "Short. Settle cash, XP questions, note injuries for shore leave.",
      scenes: [{ id: "payout", title: "Payout", purpose: "Payout: settle with the employer; collect the payment into the crew's funds.", mandatory: true }],
    },
  ],
  epilogue: "_What changed: reputation with the employer, new enemies, what the crew learned._",
};

export const jobCardTemplate: Template = {
  id: "alien.template.job-card",
  kind: "adventure",
  name: "Job card",
  description: "Run a job: briefing, travel, destination with complications, payout. Pick an accepted job to fill it.",
  mode: [CAMPAIGN],
  page: [244, 252],
  scaffold: jobCardScaffold,
};
