import type { RuleCard } from "@campaign-forge/module-sdk";
import { CAMPAIGN } from "../modes";
import { F, T, TR, card } from "./card";

const C = { mode: [CAMPAIGN] };

/** Campaign play: chapter 2 development (p. 27-30), chapter 7 (p. 158-159) and chapter 11 (p. 234-258). */
export const campaignPlayRules: RuleCard[] = [
  card("campaign-structure", "Campaign play", "Campaigns run five or six sessions or many more, with the PCs roaming the star map, taking jobs, scheming with factions and trying to stay alive. Start with a session zero, a campaign focus, clear goals and rewards and a home base, keep two or three jobs ready, and let the players choose where to go.", [158, 159], {
    ...C,
    tags: ["campaign"],
    links: { rules: ["alien.rule.session-zero", "alien.rule.campaign-theme", "alien.rule.goals-and-rewards", "alien.rule.home-base", "alien.rule.jobs", "alien.rule.xp"] },
  }),
  card("session-zero", "Session zero", "Begin with a session where the group makes characters together and picks a campaign frame. Answer together how the crew met and how long they have worked together, who are buddies and rivals, what they do and why, whether they have a ship and its name, their shared goals, allies and enemies, who they work for and where they are now.", 158, {
    ...C,
    tags: ["campaign", "gm"],
    links: { rules: ["alien.rule.buddies-rivals", "alien.rule.job-frames", "alien.rule.campaign-theme"] },
  }),
  card("campaign-theme", "Campaign focus", "Give the campaign a focus to build plots and antagonists around, a sentence or a single word. Choose or roll D6: Killing Greed, Corporate Intrigue, Tidings of War, New Opportunities, Secret Research or Echoes from the Past.", 158, {
    ...C,
    tags: ["campaign", "gm"],
    links: { tables: [T.campaignTheme], rules: ["alien.rule.themes"] },
  }),
  card("goals-and-rewards", "Goals and rewards", "Settle why the PCs do what they do and what they are working toward, such as leasing their own ship or taking revenge on a syndicate. Goals will change, but the players should always know them.", 159, {
    ...C,
    tags: ["campaign", "gm"],
    links: { rules: ["alien.rule.campaign-structure", "alien.rule.agendas"] },
  }),
  card("agendas", "Personal agendas", "In cinematic play the adventure hands each PC a secret new agenda every act, and following it earns a Story Point. In campaign play pick a career agenda or write your own, and concrete action on it despite risk or cost earns a bonus XP at session end.", 27, {
    tags: ["campaign", "cinematic", "character"],
    links: { fields: [F.personalAgenda, F.agendas], rules: ["alien.rule.xp", "alien.rule.cinematic-agendas"] },
  }),
  card("buddies-rivals", "Buddies and rivals", "Each PC may have one buddy and one rival among the other PCs, which the GM uses to create situations. Campaign players choose them and may change them after any session; cinematic adventures set them.", [27, 30], {
    tags: ["campaign", "character"],
    links: { rules: ["alien.rule.xp", "alien.rule.session-zero"] },
  }),
  card("xp", "Experience", "After each session the group answers nine questions, one XP per yes: you took part, risked something for your agenda, risked your life for your buddy, stood up to your rival, made a panic roll, overcame a dangerous event, made a significant discovery, did something extraordinary, or earned money. If the group cannot agree, the GM decides.", 30, {
    ...C,
    tags: ["campaign", "character", "advancement"],
    links: { fields: [F.xp], rules: ["alien.rule.agendas", "alien.rule.buddies-rivals", "alien.rule.advancement"] },
  }),
  card("advancement", "Spending XP", "Spend XP only between sessions. Raising a skill one step costs 5 XP times the new level, and a new skill at level 1 costs 5 XP if you succeeded with it this session or had a shift of teaching. Any career or general talent costs 5 XP.", 30, {
    ...C,
    tags: ["campaign", "character", "advancement"],
    links: { fields: [F.xp, F.skills, F.talents], rules: ["alien.rule.xp", "alien.rule.talents"] },
  }),
  card("shore-leave", "Shore leave", "For each week of shore leave every PC picks one activity: Heal (let critical injuries heal), Recover (an unpushed Empathy roll removes one mental trauma), Pursue Agenda (one XP if it succeeds) or Socialize (one roll on a shore leave event table). PCs pay their living expenses for the week.", 257, {
    ...C,
    tags: ["campaign", "recovery"],
    links: { tables: ["alien.shore-leave.marines", "alien.shore-leave.others"], rules: ["alien.rule.shore-leave-events", "alien.rule.mental-trauma-healing", "alien.rule.healing", "alien.rule.living-expenses"] },
  }),
  card("shore-leave-events", "Shore leave events", "Socializing PCs roll D66 once on the Colonial Marines table or on the table for everyone else. Results range from a quiet gym or a hotel upgrade to fights, theft, red tape, side jobs, scams and old friends in trouble.", [257, 258], {
    ...C,
    tags: ["campaign", "generator"],
    links: { tables: ["alien.shore-leave.marines", "alien.shore-leave.others"], rules: ["alien.rule.shore-leave"] },
  }),
  card("home-base", "A place to call home", "A home base near the start is recommended, a place to make contacts, find jobs and relax between missions; for many groups it is simply their ship. Novgorod Station is provided for this.", 159, {
    ...C,
    tags: ["campaign"],
    links: { rules: ["alien.rule.campaign-structure", "alien.rule.shore-leave"] },
  }),
  card("job-frames", "Campaign frames", "Choose Space Truckers (cargo runs), Colonial Marines (military missions under orders) or Frontier Colonists (sponsored expeditions); each lists suggested employers, careers, ship and weekly salary. Decide early whether the PCs are employees with steady pay and gear or freelancers with freedom, and start them with access to a ship.", [234, 235], {
    ...C,
    tags: ["campaign", "frames"],
    links: { rules: ["alien.rule.jobs", "alien.rule.campaign-structure", "alien.rule.ship-ownership"] },
  }),
  card("jobs", "Job generator", "Roll D6−1 for the destination's distance in systems and D3 for difficulty, which sets the number of complications. Then use the frame's tables: employer, bonus reward, cargo, destination and complications for cargo runs; bonus reward, mission, destination and complications for military missions (orders come from the Corps, so no employer table); sponsor, bonus reward, mission, destination and complications for expeditions.", [244, 251], {
    ...C,
    tags: ["campaign", "generator", "jobs"],
    links: { tables: ["alien.jobs.truckers.employer", "alien.jobs.marines.mission", "alien.jobs.colonists.employer"], rules: ["alien.rule.job-frames", "alien.rule.job-payment", "alien.rule.plot-twists", "alien.rule.system-distance"] },
  }),
  card("job-payment", "Job payment", "Base pay is distance plus difficulty, times the number of PCs, times $1,000. A Manipulation roll in negotiation adds 20% per success, or successes can buy rolls on the frame's bonus reward table instead.", 244, {
    ...C,
    tags: ["campaign", "jobs"],
    links: { fields: [F.cash], rules: ["alien.rule.jobs"] },
  }),
  card("plot-twists", "Plot twists", "For extra drama in any frame, choose or roll D66 for a twist: a mayday, bad intel, sabotage, a secret plot, a murder, a stellar flare, a vital malfunction, a deadline, or a Xenomorph outbreak.", 252, {
    ...C,
    tags: ["campaign", "generator", "jobs"],
    links: { tables: ["alien.jobs.plot-twist"], rules: ["alien.rule.jobs"] },
  }),
  card("session-end", "After the session", "Answer the XP questions and award a bonus for agendas pursued at risk. Any PC who rolled 9 or more on a panic roll makes the mental trauma roll, and players may change buddy and rival.", 30, {
    ...C,
    tags: ["campaign", "gm"],
    links: { rules: ["alien.rule.xp", "alien.rule.mental-trauma", "alien.rule.buddies-rivals"], trackers: [TR.stress] },
  }),
];
