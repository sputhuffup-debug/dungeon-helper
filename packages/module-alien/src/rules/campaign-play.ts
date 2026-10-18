import type { RuleCard } from "@campaign-forge/module-sdk";
import { CAMPAIGN } from "../modes";
import { F, TR, card } from "./card";

const C = { mode: [CAMPAIGN] };

export const campaignPlayRules: RuleCard[] = [
  card("campaign-structure", "Campaign structure", "A campaign is a frame (who the crew are), a run of jobs, shore leave between them and a home base that grows. Stress and injuries carry over; characters earn XP.", [158, 159], {
    ...C,
    tags: ["campaign"],
    links: { rules: ["alien.rule.job-frames", "alien.rule.jobs", "alien.rule.shore-leave", "alien.rule.home-base", "alien.rule.xp"] },
  }),
  card("session-zero", "Session zero", "Before play, settle how the crew met, who is buddy and rival to whom, what each character wants, who employs them, where they are now and what tone and limits the table wants.", 158, {
    ...C,
    tags: ["campaign", "gm"],
    links: { rules: ["alien.rule.buddies-rivals", "alien.rule.agendas", "alien.rule.campaign-theme"] },
  }),
  card("campaign-theme", "Campaign theme", "Pick or roll a theme for the campaign so the GM knows which flavour of dread to lean on: corporate conspiracy, war, survival, discovery.", 158, {
    ...C,
    tags: ["campaign", "gm"],
    links: { rules: ["alien.rule.themes"] },
  }),
  card("agendas", "Personal agendas", "In campaign play each character chooses a personal agenda that persists until fulfilled or changed. Acting on it is one of the XP questions. In cinematic play agendas are hidden handouts, one per act.", 27, {
    tags: ["campaign", "cinematic", "character"],
    links: { fields: [F.personalAgenda, F.agendas], rules: ["alien.rule.xp", "alien.rule.cinematic-agendas"] },
  }),
  card("buddies-rivals", "Buddies and rivals", "Each player names one other PC as their buddy and one as their rival. Helping your buddy or getting one over on your rival feeds the XP questions; the GM uses both for drama.", 158, {
    ...C,
    tags: ["campaign", "character"],
    links: { rules: ["alien.rule.xp", "alien.rule.session-zero"] },
  }),
  card("xp", "Experience points", "At the end of a session each player answers nine yes/no questions (took part, pursued agenda, helped buddy, hindered rival, took a risk, learned something, and so on); each yes is one XP. Five XP buys a skill point or a talent.", 30, {
    ...C,
    tags: ["campaign", "character", "advancement"],
    links: { fields: [F.xp], rules: ["alien.rule.agendas", "alien.rule.buddies-rivals", "alien.rule.advancement"] },
  }),
  card("advancement", "Spending XP", "Spend five XP to raise a skill by one (max 5) or to take a new talent. Attributes do not rise with XP.", 30, {
    ...C,
    tags: ["campaign", "character", "advancement"],
    links: { fields: [F.xp, F.skills, F.talents], rules: ["alien.rule.xp"] },
  }),
  card("shore-leave", "Shore leave", "Between jobs the crew takes a week of shore leave. Each character picks one of four: Heal (recover Health and injuries), Recover (shed stress and treat trauma), Pursue Agenda or Socialize. Then roll for a shore leave event.", 257, {
    ...C,
    tags: ["campaign", "recovery"],
    links: { rules: ["alien.rule.shore-leave-events", "alien.rule.mental-trauma-healing", "alien.rule.healing"] },
  }),
  card("shore-leave-events", "Shore leave events", "Roll on the Marines or the general shore leave event table for something that happens during the week: a fight, a romance, a job offer, a loss, trouble with the law.", [257, 258], {
    ...C,
    tags: ["campaign", "generator"],
    links: { rules: ["alien.rule.shore-leave"] },
  }),
  card("home-base", "Home base", "The crew's ship, station or colony is their home base. It accumulates NPCs, debts, upgrades and enemies, and gives shore leave somewhere to happen.", 159, {
    ...C,
    tags: ["campaign"],
    links: { rules: ["alien.rule.campaign-structure", "alien.rule.shore-leave"] },
  }),
  card("job-frames", "Campaign frames", "Three frames: Space Truckers (a freighter crew taking cargo jobs), Colonial Marines (a squad on missions) and Frontier Colonists (settlers on sponsored expeditions). Each has its own job tables, typical careers, ships and pay.", [234, 235], {
    ...C,
    tags: ["campaign", "frames"],
    links: { rules: ["alien.rule.jobs", "alien.rule.campaign-structure"] },
  }),
  card("jobs", "Generating a job", "Roll distance (D6 minus 1 systems), difficulty (D3) and payment, then the frame's tables for employer or sponsor, bonus reward, cargo or mission, destination and as many complications as the difficulty. Add a plot twist if you like.", [244, 251], {
    ...C,
    tags: ["campaign", "generator", "jobs"],
    links: { tables: ["alien.jobs.truckers.employer"], rules: ["alien.rule.job-frames", "alien.rule.job-payment", "alien.rule.plot-twists", "alien.rule.system-distance"] },
  }),
  card("job-payment", "Job payment", "Base pay is distance plus difficulty, times the number of PCs, times a thousand dollars; the bonus reward is extra and often not money.", 244, {
    ...C,
    tags: ["campaign", "jobs"],
    links: { fields: [F.cash], rules: ["alien.rule.jobs"] },
  }),
  card("plot-twists", "Plot twists", "A twist table turns a routine job sideways: the cargo is not what it says, the employer lied, someone aboard has orders. Roll one per job or keep it in reserve.", 252, {
    ...C,
    tags: ["campaign", "generator", "jobs"],
    links: { rules: ["alien.rule.jobs"] },
  }),
  card("session-end", "Ending a session", "Close with the XP questions, note any panic result of 9 or more for the trauma check, update stress and injuries, and log what the crew owes and is owed.", [30, 74], {
    ...C,
    tags: ["campaign", "gm"],
    links: { rules: ["alien.rule.xp", "alien.rule.mental-trauma"], trackers: [TR.stress] },
  }),
];
