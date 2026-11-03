/**
 * "Set up your campaign" for the Alien module: the steps a new campaign
 * walks through before session 1, and the campaign settings it asks for.
 *
 * Campaign mode: the crew (Life Path or by hand), the players, the crew's
 * ship, a home base, campaign agendas, campaign threads, a job board with a
 * job taken, then "Run this job" to plan session 1. Cinematic mode: the
 * PCs, the players, the adventure (the guided builder), the act agendas and
 * the session. Every step ticks from campaign data (JSONLogic over the
 * core's setup snapshot). Module-original wording; no book text.
 *
 * The campaign frame is asked once, in the New campaign dialog, and kept in
 * `settings.frame`; the job generator, the job board and between jobs have a
 * `frame` input, which starts from it.
 */
import type { CampaignSettingDef, JsonLogicRule, SetupDef } from "@campaign-forge/module-sdk";
import { CAMPAIGN, CINEMATIC } from "./modes";
import { CREW_SHIP_SETTING } from "./economy";
import { RUN_JOB_ID } from "./runJob";
import { AGENDAS_ID } from "./procedures/agendas";
import { CAMPAIGN_AGENDAS_ID, CAMPAIGN_AGENDA_FIELD } from "./procedures/campaign-agendas";
import { CAMPAIGN_THREAD_ID } from "./procedures/campaign-thread";
import { JOB_BOARD_ID } from "./procedures/job-board";

/** `meta.settings` key of the campaign frame (a `frame` procedure input defaults to it). */
export const FRAME_SETTING = "frame";
/** `meta.settings` key of the crew's home base (an entity id). */
export const HOME_BASE_SETTING = "homeBase";

const CHARACTER = "alien.character";
const JOB = "alien.job";
const LIFEPATH = "alien.lifepath";
/** The purpose of a campaign agenda's GM card (core's LONG_AGENDA_PURPOSE), which is not an act agenda. */
const CAMPAIGN_AGENDA_CARD = "long-agenda";

const v = (path: string) => ({ var: path });
/** The setting holds the id of an entity that still exists. */
const settingIsEntity = (key: string): JsonLogicRule => ({ in: [v(`settings.${key}`), v("entityIds")] });
/** Every PC passes `rule`, and there is at least one PC. */
const everyPc = (rule: JsonLogicRule): JsonLogicRule => ({ and: [{ ">": [v("counts.pcs"), 0] }, { all: [v("pcs"), rule] }] });
/** The crew size the step asks for: one PC per player, four before any player is added. */
const crewTarget: JsonLogicRule = { if: [{ ">": [v("counts.players"), 0] }, v("counts.players"), 4] };
const takenJob: JsonLogicRule = { and: [{ "==": [v("type"), JOB] }, { in: [v("fields.status"), ["accepted", "done", "failed"]] }] };

export const setup: SetupDef = {
  steps: [
    {
      id: "alien.setup.crew",
      label: "Make the crew",
      hint: "A player character for everyone at the table: roll a Life Path, or build one by hand.",
      mode: [CAMPAIGN],
      page: 158,
      done: { and: [{ ">": [v("counts.pcs"), 0] }, { ">=": [v("counts.pcs"), crewTarget] }] },
      progress: { count: v("counts.pcs"), of: crewTarget },
      links: [
        { label: "Roll a Life Path", procedure: LIFEPATH, primary: true },
        { label: "+ Character", newEntity: { type: CHARACTER, pc: true } },
      ],
    },
    {
      id: "alien.setup.ship",
      label: "Choose the crew's ship",
      hint: "Pick one, or make a new one from a ship preset. Travel, the ledger and between jobs use it.",
      mode: [CAMPAIGN],
      page: 158,
      done: settingIsEntity(CREW_SHIP_SETTING),
      links: [{ label: "Open the Ship page", page: "ship", primary: true }],
    },
    {
      id: "alien.setup.home-base",
      label: "Pick a home base",
      hint: "Where the crew comes back to between jobs: a station, a colony or the ship itself.",
      mode: [CAMPAIGN],
      page: 159,
      done: settingIsEntity(HOME_BASE_SETTING),
      links: [{ label: "Choose it", page: "settings", params: { section: "campaign" }, primary: true }],
    },
    {
      id: "alien.setup.agendas",
      label: "Deal campaign agendas",
      hint: "A long-term personal agenda for each PC, with a little friction between them.",
      mode: [CAMPAIGN],
      page: 27,
      done: everyPc({ "!!": [v(`fields.${CAMPAIGN_AGENDA_FIELD}.goal`)] }),
      links: [{ label: "Deal agendas", procedure: CAMPAIGN_AGENDAS_ID, primary: true }],
    },
    {
      id: "alien.setup.threads",
      label: "Start the campaign threads",
      hint: "One or two schemes working in the background; job boards seed their clues.",
      mode: [CAMPAIGN],
      done: { ">": [v("counts.arcs"), 0] },
      links: [
        { label: "Deal threads", procedure: CAMPAIGN_THREAD_ID, primary: true },
        { label: "Open the arc board", page: "arcs" },
      ],
    },
    {
      id: "alien.setup.job",
      label: "Deal a job board and take a job",
      hint: "Postings that fit the campaign frame and the threads; take the one the crew goes for.",
      mode: [CAMPAIGN],
      page: 244,
      done: { some: [v("entities"), takenJob] },
      links: [{ label: "Deal a job board", procedure: JOB_BOARD_ID, primary: true }],
    },
    {
      id: "alien.setup.run-job",
      label: "Run the job: plan session 1",
      hint: "“Run this job” on the job turns it into an adventure and plans its first scenes into the next session.",
      mode: [CAMPAIGN],
      // done once a job runs as an adventure with a session for it, or once a session has been played
      done: { or: [{ and: [{ some: [v("adventures"), { "==": [v("source"), RUN_JOB_ID] }] }, { ">": [v("counts.sessions"), 0] }] }, { ">": [v("counts.playedSessions"), 0] }] },
      links: [
        { label: "Open the job", entity: { and: [{ "==": [v("type"), JOB] }, { "==": [v("fields.status"), "accepted"] }] }, primary: true },
        { label: "Plan a session", page: "sessions" },
      ],
    },
    {
      id: "alien.setup.adventure",
      label: "Build the adventure",
      hint: "The guided builder walks the three acts, the cast and the twist.",
      mode: [CINEMATIC],
      page: 155,
      done: { ">": [v("counts.adventures"), 0] },
      links: [{ label: "Open Adventures", page: "adventures", primary: true }],
    },
    {
      id: "alien.setup.act-agendas",
      label: "Deal the act agendas",
      hint: "A hidden agenda per act for each PC, handed out act by act.",
      mode: [CINEMATIC],
      page: 27,
      // the builder deals them as agenda cards per act (handouts); older characters keep them on the sheet
      done: everyPc({ or: [{ ">": [{ len: v("fields.agendas") }, 0] }, { some: [v("handouts"), { and: [{ "==": [v("kind"), "agenda"] }, { "!=": [v("purpose"), CAMPAIGN_AGENDA_CARD] }] }] }] }),
      links: [{ label: "Deal agendas", procedure: AGENDAS_ID, primary: true }],
    },
  ],
  layouts: [
    {
      mode: [CAMPAIGN],
      hide: ["setup.pcs", "setup.session"],
      order: ["alien.setup.crew", "setup.players", "alien.setup.ship", "alien.setup.home-base", "alien.setup.agendas", "alien.setup.threads", "alien.setup.job", "alien.setup.run-job"],
    },
    { mode: [CINEMATIC], order: ["setup.pcs", "setup.players", "alien.setup.adventure", "alien.setup.act-agendas", "setup.session"] },
  ],
};

export const campaignSettings: CampaignSettingDef[] = [
  {
    key: FRAME_SETTING,
    label: "Campaign frame",
    hint: "What the crew does for a living. Job boards and between jobs start from it; you can still change it per run.",
    kind: "choice",
    list: "alien.frames",
    default: "space-truckers",
    atCreation: true,
    mode: [CAMPAIGN],
    page: [234, 235],
  },
  {
    key: HOME_BASE_SETTING,
    label: "Home base",
    hint: "Where the crew comes back to between jobs: a station, a colony or the ship itself.",
    kind: "entity",
    entityTypes: ["alien.location", "alien.spaceship"],
    mode: [CAMPAIGN],
    page: 159,
  },
];
