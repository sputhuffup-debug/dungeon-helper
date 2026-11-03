/**
 * Campaign agendas (module-original; no AI): the campaign-play counterpart of
 * the cinematic agenda drafts. Each PC gets a long-term goal that lasts
 * several jobs and a short beat per job; the crew gets open friction lines
 * (competing for resources, clashing loyalties, embarrassing secrets, buddy
 * and rival ties) that set them against each other in the open and never
 * lead to betrayal. Goals and beats are the GM's (secret); friction lines are
 * for everyone at the table.
 *
 * Two stages, one procedure:
 *  - deal (no `progress` input): a goal, allegiance, motive and secret per
 *    PC, a first beat, and the friction lines the dial asks for;
 *  - next (the app passes `progress`: each PC's stored record and the
 *    outcome the GM marked after a job): an advanced goal gets its next beat,
 *    a stalled one also raises its tension one step (never above the cap:
 *    hard words), a resolved one draws a follow-up goal that fits it and the
 *    allegiance it was pursued for. Friction lines carry over.
 *
 * Steps, each seeded; every slot is a part the GM re-rolls or pins:
 *  1. cast: the PCs (buddies, rivals, careers), NPCs, places, the home base,
 *     the ship, the job's employer, the campaign's corporation.
 *  2. deal: goals, allegiances, motives and secrets (deal), or the job's
 *     outcomes applied to the stored records (next).
 *  3. slots: goal, who they answer to, motive, secret, beat, who and where,
 *     and its cost, per PC.
 *  4. friction: the open friction lines, re-dealt (seeded) until the check
 *     passes.
 *  5. check: the no-betrayal check (`campaign-agenda-check.ts`).
 *  6. longAgendaDrafts: the cards (DRAFT) and each PC's record.
 *
 * The rules served: the sheet's personal agenda and its bonus XP (p. 27, 30),
 * shore leave's Pursue Agenda (p. 257) and campaign goals (p. 158-159).
 * Produces no entities: the app writes accepted drafts into the characters
 * and their handouts.
 */
import { labelledEnum } from "../entities/common";
import type {
  AgendaDraftReport,
  AgendaDraftSlot,
  CampaignEntitySummary,
  LongAgendaDef,
  LongAgendaDraftCharacter,
  LongAgendaDraftSet,
  LongAgendaFrictionLine,
  LongAgendaProgress,
  Procedure,
  ProcedureContext,
  Rng,
} from "@campaign-forge/module-sdk";
import { CAMPAIGN } from "../modes";
export const SHORE_LEAVE_ID = "alien.shore-leave";
import { buildCast, weightedPick, type PartyMember } from "./agenda-targets";
import {
  ALLEGIANCE_TEXT,
  BEAT_COSTS,
  CAMPAIGN_ALLEGIANCES,
  CAMPAIGN_GOALS,
  CAMPAIGN_GOAL_IDS,
  CAMPAIGN_MOTIVES,
  CAREER_GOALS,
  CONTESTED_THINGS,
  DIAL_KIND_WEIGHTS,
  DIAL_LINES_PER_PC,
  EMBARRASSING_SECRETS,
  FALLBACK_NPCS,
  FALLBACK_PLACES,
  FRICTION_DIAL,
  FRICTION_KINDS,
  FRICTION_KIND_LABEL,
  FRICTION_TEMPLATES,
  MOTIVE_TEXT,
  TENSION_CAP,
  TENSION_LADDER,
  followUpsOf,
  frictionTemplateById,
  goalById,
  secretById,
  type CampaignAllegiance,
  type CampaignGoal,
  type CampaignMotive,
  type FrictionDial,
  type FrictionKind,
  type FrictionTemplate,
} from "./campaign-agenda-data";
import { checkCampaignDeal, type CampaignCheck, type CheckedLine, type CheckedMember } from "./campaign-agenda-check";
import { isObj, str } from "./helpers";

export const CAMPAIGN_AGENDAS_ID = "alien.campaign-agendas";
/** The character field holding the record. */
export const CAMPAIGN_AGENDA_FIELD = "campaignAgenda";
export const CAMPAIGN_AGENDA_OUTCOMES = ["advanced", "stalled", "resolved"] as const;
export type CampaignAgendaOutcome = (typeof CAMPAIGN_AGENDA_OUTCOMES)[number];
/** Re-deals of the friction lines before the best one is kept. */
export const FRICTION_REDEALS = 12;
/** The bonus XP question for the personal agenda (p. 27, 30). */
export const AGENDA_XP_PAGES: [number, number] = [27, 30];
/** Shore leave: Pursue Agenda (p. 257). */
export const PURSUE_AGENDA_PAGE = 257;

// ---------------------------------------------------------------------------
// the stored record (a character's `campaignAgenda` field)
// ---------------------------------------------------------------------------

export interface CampaignAgendaRecord {
  goal: {
    id: string;
    title: string;
    /** The one-line summary, kept equal to the sheet's personal agenda. */
    text: string;
    allegiance: CampaignAllegiance;
    answersTo: string;
    motive: CampaignMotive;
    why: string;
    /** The job the goal began with. */
    since?: string;
  };
  /** The current beat: its index in the goal's beats, its text and the job it is for. */
  beat: { n: number; text: string; job?: string };
  /** "new" for a fresh goal, then the last outcome marked. */
  status: "new" | "advanced" | "stalled";
  /** Index on the tension ladder; a stall raises it, never above the cap. */
  tension: number;
  /** Earlier beats, oldest first, with the outcome the GM marked. */
  history: Array<{ goal: string; n?: number; job?: string; text: string; outcome: CampaignAgendaOutcome }>;
  /** Goals resolved before this one. */
  past: Array<{ id: string; title: string; text: string; job?: string }>;
  secret: { id: string; text: string; topic: string };
  /** This PC's open friction lines, as their handout reads them. */
  friction: Array<{ key: string; kind: FrictionKind; tpl: string; with: string[]; outsider?: string; text: string }>;
}

/** The app's contract with this procedure (module-sdk `LongAgendaDef`). */
export const CAMPAIGN_AGENDA_DEF: LongAgendaDef = {
  field: CAMPAIGN_AGENDA_FIELD,
  summaryField: "personalAgenda",
  progressInput: "progress",
  jobInput: "jobLabel",
  outcomes: [
    { id: "advanced", label: "Advanced", text: "Moved on: deal the next beat." },
    { id: "stalled", label: "Stalled", text: "Got nowhere: the next beat, and tension rises one step." },
    { id: "resolved", label: "Resolved", text: "Done (won or let go): a follow-up goal that fits." },
  ],
  paths: {
    title: "goal.title",
    summary: "goal.text",
    beat: "beat.text",
    beatJob: "beat.job",
    status: "status",
    tension: "tension",
    history: "history",
    friction: "friction",
  },
  details: [
    { label: "Answers to", path: "goal.answersTo" },
    { label: "Why", path: "goal.why" },
    { label: "Embarrassing secret", path: "secret.text" },
  ],
  tension: { levels: TENSION_LADDER.map((t) => ({ id: t.id, label: t.label, text: t.text })) },
  reminders: [
    {
      label: "Bonus XP",
      text: "At session end: did you risk or give up something to advance your personal agenda? One XP if yes.",
      page: AGENDA_XP_PAGES,
      rule: "alien.rule.xp",
    },
    {
      label: "Shore leave",
      text: "A week spent on Pursue Agenda earns 1 XP if it succeeds.",
      page: PURSUE_AGENDA_PAGE,
      procedure: SHORE_LEAVE_ID,
      rule: "alien.rule.shore-leave",
    },
  ],
  handouts: {
    agenda: "{name}: personal agenda",
    friction: "{name}: friction",
    frictionIntro: "Open friction: everyone at the table may know these. Play them hard; nobody acts against a crewmate.",
  },
};

// ---------------------------------------------------------------------------
// the cast
// ---------------------------------------------------------------------------

export interface CampaignCast {
  party: PartyMember[];
  /** Locked goals by PC id. */
  locked: Record<string, string>;
  /** NPCs any GM-only text may name. */
  npcs: string[];
  places: string[];
  home: string;
  ship: string;
  employer: string;
  company: string;
  job?: string;
  /** What text the players see may name: NPCs they can see (or generic stand-ins), and the employer if they can see it (or "the employer"). */
  open: { npcs: string[]; employer: string };
  /** Names of entities the players cannot see, longest first: never in text the players see. */
  hidden: string[];
}

/** Whether the players can already see a snapshot entity (no level: an older snapshot, so no). */
const playersSee = (e: CampaignEntitySummary | undefined): boolean => e?.visibility === "players" || e?.visibility === "revealed";
/** The stand-in for an employer the players cannot see. */
export const HIDDEN_EMPLOYER = "the employer";

const short = (name: string) => name.split(",")[0]!.trim() || name.trim();

function snapshotEntities(v: unknown): CampaignEntitySummary[] {
  if (!isObj(v) || !Array.isArray(v.entities)) return [];
  return v.entities.filter((e): e is CampaignEntitySummary => isObj(e) && typeof e.id === "string" && typeof e.name === "string");
}
function snapshotLinks(v: unknown): Array<{ type: string; from: string; to: string }> {
  if (!isObj(v) || !Array.isArray(v.relationships)) return [];
  return v.relationships.filter((r): r is { type: string; from: string; to: string } => isObj(r) && typeof r.type === "string" && typeof r.from === "string" && typeof r.to === "string");
}

/**
 * The party and what beats and friction lines can name: from the campaign
 * snapshot, the job input and the module's fallbacks. No randomness.
 */
export function buildCampaignCast(inputs: Record<string, unknown>): CampaignCast {
  const base = buildCast({ campaign: inputs.campaign, pcs: inputs.pcs, pcCount: inputs.pcCount });
  const entities = snapshotEntities(inputs.campaign);
  const links = snapshotLinks(inputs.campaign);
  const locked: Record<string, string> = {};
  for (const p of Array.isArray(inputs.pcs) ? inputs.pcs : []) {
    if (isObj(p) && typeof p.id === "string" && typeof p.goal === "string" && goalById(p.goal)) locked[p.id] = p.goal;
  }
  const partyIds = new Set(base.party.map((p) => p.id));
  const npcEntities = entities.filter((e) => e.kind === "character" && !e.pc && !partyIds.has(e.id));
  const npcs = [...new Set(npcEntities.map((e) => short(e.name)))];
  const openNpcs = [...new Set(npcEntities.filter(playersSee).map((e) => short(e.name)))];
  const locations = entities.filter((e) => e.kind === "location");
  const places = [...new Set(locations.filter((e) => e.subtype === "site" || e.subtype === "colony").map((e) => short(e.name)))];
  const homeEntity =
    locations.find((e) => e.tags.includes("home-base") && e.subtype === "colony") ?? locations.find((e) => e.tags.includes("home-base")) ?? locations.find((e) => e.subtype === "colony");
  const shipEntity = entities.find((e) => e.type === "alien.spaceship");
  const jobInput = isObj(inputs.job) && typeof inputs.job.name === "string" ? inputs.job : undefined;
  const jobs = entities.filter((e) => e.kind === "job");
  const jobEntity = jobInput ? entities.find((e) => e.id === jobInput.id) : jobs[jobs.length - 1];
  const jobFields = jobInput && isObj(jobInput.fields) ? jobInput.fields : (jobEntity?.fields ?? {});
  const employerLink = jobEntity ? links.find((l) => (l.type === "employer_of" || l.type === "sponsor_of") && l.to === jobEntity.id) : undefined;
  const employerEntity = employerLink ? entities.find((e) => e.id === employerLink.from) : undefined;
  const company = base.pools.company;
  const employer = str(jobFields["employer"]) || employerEntity?.name || (company !== "the Company" ? company : "") || HIDDEN_EMPLOYER;
  // the employer as the players know it: the employer's entity, else the job's, else the company's faction, must be one they can see
  const companyEntity = entities.find((e) => e.kind === "faction" && e.name === company);
  const employerSource = employerEntity ?? (str(jobFields["employer"]) ? (jobEntity ?? entities.find((e) => e.id === str(jobInput?.id))) : companyEntity);
  const hidden = new Set<string>();
  for (const e of entities) {
    if (e.pc || partyIds.has(e.id) || playersSee(e)) continue;
    for (const n of [e.name.trim(), short(e.name)]) if (n.length >= 3) hidden.add(n);
  }
  // a name the players can see under another entity stays sayable
  for (const e of entities) if (playersSee(e) || e.pc || partyIds.has(e.id)) for (const n of [e.name.trim(), short(e.name)]) hidden.delete(n);
  const openEmployer = employer !== HIDDEN_EMPLOYER && playersSee(employerSource) && !hidden.has(employer) ? employer : HIDDEN_EMPLOYER;
  if (openEmployer === HIDDEN_EMPLOYER && employer !== HIDDEN_EMPLOYER) hidden.add(employer);
  const cast: CampaignCast = {
    party: base.party,
    locked,
    npcs: npcs.length ? npcs : FALLBACK_NPCS,
    places: places.length ? places : FALLBACK_PLACES,
    home: homeEntity ? short(homeEntity.name) : "the home port",
    ship: shipEntity ? shipEntity.name : "ship",
    employer,
    company,
    open: { npcs: openNpcs.length ? openNpcs : FALLBACK_NPCS, employer: openEmployer },
    hidden: [...hidden].sort((a, b) => b.length - a.length || a.localeCompare(b)),
  };
  const jobName = jobInput ? str(jobInput.name) : jobEntity?.name;
  if (jobName) cast.job = jobName;
  return cast;
}

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

const dialOf = (ctx: ProcedureContext): FrictionDial => {
  const v = str(ctx.inputs.friction);
  return (FRICTION_DIAL as readonly string[]).includes(v) ? (v as FrictionDial) : "simmering";
};
const castOf = (ctx: ProcedureContext): CampaignCast => ctx.get<CampaignCast>("cast") ?? buildCampaignCast(ctx.inputs);
const pickOne = <T>(rng: Rng, list: readonly T[]): T => list[rng.int(0, list.length - 1)]!;
function pickOther<T>(rng: Rng, options: readonly T[], not: T): T {
  const rest = options.filter((o) => o !== not);
  const pool = rest.length ? rest : options;
  return pool[rng.int(0, pool.length - 1)] ?? not;
}
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** The job the beats are for: the GM's label, or "Job 1" for a fresh deal and "the next job" after one. */
const jobLabelOf = (ctx: ProcedureContext, stage: "deal" | "next"): string => str(ctx.inputs.jobLabel) || (stage === "deal" ? "Job 1" : "the next job");

/** The stored records the app passed in (`progress`), by PC id. */
export function progressOf(inputs: Record<string, unknown>): Map<string, { record?: CampaignAgendaRecord; outcome?: CampaignAgendaOutcome }> {
  const out = new Map<string, { record?: CampaignAgendaRecord; outcome?: CampaignAgendaOutcome }>();
  for (const p of Array.isArray(inputs.progress) ? (inputs.progress as LongAgendaProgress[]) : []) {
    if (!isObj(p) || typeof p.id !== "string") continue;
    const entry: { record?: CampaignAgendaRecord; outcome?: CampaignAgendaOutcome } = {};
    const r = asRecord(p.record);
    if (r) entry.record = r;
    if ((CAMPAIGN_AGENDA_OUTCOMES as readonly string[]).includes(str(p.outcome))) entry.outcome = p.outcome as CampaignAgendaOutcome;
    out.set(p.id, entry);
  }
  return out;
}

/** A stored record, when it is well-formed enough to move on (unknown goals and secrets are not). */
export function asRecord(v: unknown): CampaignAgendaRecord | undefined {
  if (!isObj(v) || !isObj(v.goal) || !isObj(v.beat) || !isObj(v.secret)) return undefined;
  const g = v.goal;
  if (!goalById(str(g.id)) || !secretById(str(v.secret.id))) return undefined;
  const allegiance = (CAMPAIGN_ALLEGIANCES as readonly string[]).includes(str(g.allegiance)) ? (g.allegiance as CampaignAllegiance) : goalById(str(g.id))!.allegiances[0]!;
  const motive = (CAMPAIGN_MOTIVES as readonly string[]).includes(str(g.motive)) ? (g.motive as CampaignMotive) : goalById(str(g.id))!.motives[0]!;
  const tension = typeof v.tension === "number" && Number.isFinite(v.tension) ? Math.max(0, Math.min(TENSION_CAP, Math.floor(v.tension))) : 0;
  const goalRec: CampaignAgendaRecord["goal"] = { id: str(g.id), title: str(g.title), text: str(g.text), allegiance, answersTo: str(g.answersTo), motive, why: str(g.why) };
  if (typeof g.since === "string") goalRec.since = g.since;
  const beat: CampaignAgendaRecord["beat"] = { n: typeof v.beat.n === "number" ? v.beat.n : 0, text: str(v.beat.text) };
  if (typeof v.beat.job === "string") beat.job = v.beat.job;
  const list = (x: unknown) => (Array.isArray(x) ? x.filter(isObj) : []);
  return {
    goal: goalRec,
    beat,
    status: v.status === "advanced" || v.status === "stalled" ? v.status : "new",
    tension,
    history: list(v.history).map((h) => ({ ...(h as object), goal: str(h.goal), text: str(h.text), outcome: (CAMPAIGN_AGENDA_OUTCOMES as readonly string[]).includes(str(h.outcome)) ? (h.outcome as CampaignAgendaOutcome) : "advanced" })),
    past: list(v.past).map((p) => ({ ...(p as object), id: str(p.id), title: str(p.title), text: str(p.text) })),
    secret: { id: str(v.secret.id), text: str(v.secret.text), topic: str(v.secret.topic) },
    friction: list(v.friction)
      .filter((f) => FRICTION_KINDS.includes(f.kind as FrictionKind) && typeof f.text === "string")
      .map((f) => {
        const out: CampaignAgendaRecord["friction"][number] = {
          key: str(f.key),
          kind: f.kind as FrictionKind,
          tpl: str(f.tpl),
          with: Array.isArray(f.with) ? f.with.filter((x): x is string => typeof x === "string") : [],
          text: str(f.text),
        };
        if (typeof f.outsider === "string") out.outsider = f.outsider;
        return out;
      }),
  };
}

// ---------------------------------------------------------------------------
// step 2: deal
// ---------------------------------------------------------------------------

export interface DealtCampaignMember {
  id: string;
  goal: string;
  allegiance: CampaignAllegiance;
  motive: CampaignMotive;
  secret: string;
  /** Next stage: what the job's outcome did. */
  outcome?: CampaignAgendaOutcome;
  /** The record the PC came in with (next stage). */
  record?: CampaignAgendaRecord;
  tension: number;
  status: CampaignAgendaRecord["status"];
  /** Next stage: the goal resolved, and the follow-ups it could draw. */
  resolved?: { from: string; candidates: string[] };
}

export interface CampaignDeal {
  stage: "deal" | "next";
  dial: FrictionDial;
  members: DealtCampaignMember[];
  label: string;
}

function goalWeight(g: CampaignGoal, m: PartyMember, taken: Set<string>): number {
  let w = taken.has(g.id) ? 0.05 : 1;
  if (m.career && CAREER_GOALS[m.career]?.includes(g.id)) w *= 3;
  if (g.kinds.includes("ties")) w *= m.buddies.length + m.rivals.length > 0 ? 1.5 : 0.7;
  return w;
}

function pickAllegiance(rng: Rng, g: CampaignGoal, used: CampaignAllegiance[], keep?: CampaignAllegiance): CampaignAllegiance {
  if (keep && g.allegiances.includes(keep)) return keep;
  return weightedPick(rng, g.allegiances.map((a) => ({ value: a, weight: used.includes(a) ? 1 : 2 }))) ?? g.allegiances[0]!;
}

/** The follow-up a resolved goal draws: one that keeps the allegiance weighs more, goals already done weigh less. */
export function drawFollowUp(rng: Rng, from: string, allegiance: CampaignAllegiance, done: string[]): string {
  const candidates = followUpsOf(from, allegiance);
  const pick = weightedPick(
    rng,
    candidates.map((id) => ({ value: id, weight: (goalById(id)!.allegiances.includes(allegiance) ? 4 : 1) * (done.includes(id) ? 0.2 : 1) })),
  );
  return pick ?? candidates[0] ?? CAMPAIGN_GOAL_IDS.find((id) => id !== from)!;
}

function deal(ctx: ProcedureContext, rng: Rng): CampaignDeal {
  const cast = castOf(ctx);
  const dial = dialOf(ctx);
  const progress = progressOf(ctx.inputs);
  const stage = [...progress.values()].some((p) => p.record) ? "next" : "deal";
  const taken = new Set<string>();
  const usedAllegiances: CampaignAllegiance[] = [];
  const usedSecrets = new Set<string>();
  // records first: they keep their goals and secrets
  for (const p of progress.values()) {
    if (!p.record) continue;
    taken.add(p.record.goal.id);
    usedAllegiances.push(p.record.goal.allegiance);
    usedSecrets.add(p.record.secret.id);
  }
  for (const id of Object.values(cast.locked)) taken.add(id);
  // streams by party position, never by entity id, so a campaign rebuilt with new ids deals the same
  const members: DealtCampaignMember[] = cast.party.map((m, index) => {
    const r = rng.fork(`pc${index + 1}`);
    const prior = progress.get(m.id);
    const rec = prior?.record;
    if (rec) {
      const outcome = prior?.outcome;
      const base: DealtCampaignMember = { id: m.id, goal: rec.goal.id, allegiance: rec.goal.allegiance, motive: rec.goal.motive, secret: rec.secret.id, record: rec, tension: rec.tension, status: rec.status };
      if (!outcome) return base;
      base.outcome = outcome;
      if (outcome === "advanced") return { ...base, status: "advanced" };
      if (outcome === "stalled") return { ...base, status: "stalled", tension: Math.min(TENSION_CAP, rec.tension + 1) };
      // resolved: a follow-up that fits the goal and the allegiance it was pursued for
      const done = [rec.goal.id, ...rec.past.map((x) => x.id)];
      const next = drawFollowUp(r.fork("follow-up"), rec.goal.id, rec.goal.allegiance, done);
      const g = goalById(next)!;
      const allegiance = pickAllegiance(r.fork("allegiance"), g, usedAllegiances, rec.goal.allegiance);
      const motive = g.motives.includes(rec.goal.motive) ? rec.goal.motive : pickOne(r.fork("motive"), g.motives);
      taken.add(next);
      return { ...base, goal: next, allegiance, motive, tension: 0, status: "new", resolved: { from: rec.goal.id, candidates: followUpsOf(rec.goal.id, rec.goal.allegiance) } };
    }
    // a fresh deal
    const goalId =
      cast.locked[m.id] ?? weightedPick(r.fork("goal"), CAMPAIGN_GOALS.map((g) => ({ value: g.id, weight: goalWeight(g, m, taken) }))) ?? CAMPAIGN_GOAL_IDS[0]!;
    taken.add(goalId);
    const g = goalById(goalId)!;
    const allegiance = pickAllegiance(r.fork("allegiance"), g, usedAllegiances);
    usedAllegiances.push(allegiance);
    const motive = pickOne(r.fork("motive"), g.motives);
    const free = EMBARRASSING_SECRETS.filter((s) => !usedSecrets.has(s.id));
    const secret = pickOne(r.fork("secret"), free.length ? free : EMBARRASSING_SECRETS).id;
    usedSecrets.add(secret);
    return { id: m.id, goal: goalId, allegiance, motive, secret, tension: 0, status: "new" };
  });
  const nameOf = (id: string) => cast.party.find((p) => p.id === id)?.name ?? id;
  const label =
    stage === "deal"
      ? members.map((d) => `${nameOf(d.id)}: ${goalById(d.goal)!.name}`).join(" · ")
      : members.map((d) => `${nameOf(d.id)}: ${d.outcome ? `${d.outcome}${d.resolved ? ` → ${goalById(d.goal)!.name}` : ""}` : "unchanged"}`).join(" · ");
  return { stage, dial, members, label };
}

// ---------------------------------------------------------------------------
// step 3: slots
// ---------------------------------------------------------------------------

/** Who and where a beat names. `crew` is a PC id, or an NPC's name when the PC is alone. */
export interface BeatFill {
  npc: string;
  place: string;
  crew: string;
}

export interface SlottedMember {
  id: string;
  goal: string;
  allegiance: CampaignAllegiance;
  motive: CampaignMotive;
  secret: string;
  beat: number;
  fill: BeatFill;
  cost: number;
  tension: number;
  status: CampaignAgendaRecord["status"];
  outcome?: CampaignAgendaOutcome;
  /** Whether the goal is the one in the stored record (unchanged by this run). */
  carried: boolean;
}

/** A crewmate for {crewmate}, {buddy} or {rival}: the linked one when there is one. */
function drawCrew(rng: Rng, m: PartyMember, cast: CampaignCast, kind: "crewmate" | "buddy" | "rival", not?: string): string {
  const others = cast.party.filter((p) => p.id !== m.id).map((p) => p.id);
  if (others.length === 0) return pickOther(rng, cast.npcs, not ?? "");
  const linked = kind === "buddy" ? m.buddies : kind === "rival" ? m.rivals : [];
  const pool = linked.filter((id) => others.includes(id));
  return pickOther(rng, pool.length ? pool : others, not ?? "");
}

const crewKindOf = (text: string): "crewmate" | "buddy" | "rival" | undefined => (text.includes("{rival}") ? "rival" : text.includes("{buddy}") ? "buddy" : text.includes("{crewmate}") ? "crewmate" : undefined);

function usedBeats(rec: CampaignAgendaRecord | undefined, goalId: string): number[] {
  if (!rec) return [];
  const out = rec.history.filter((h) => h.goal === goalId && typeof h.n === "number").map((h) => h.n as number);
  if (rec.goal.id === goalId) out.push(rec.beat.n);
  return out;
}

function slots(ctx: ProcedureContext, rng: Rng): SlottedMember[] {
  const cast = castOf(ctx);
  const dealt = ctx.get<CampaignDeal>("deal");
  const others = (id: string) => (dealt?.members ?? []).filter((d) => d.id !== id);
  return (dealt?.members ?? []).map((d, index) => {
    const kr = (s: string) => `pc${index + 1}/${s}`;
    const m = cast.party.find((p) => p.id === d.id)!;
    const k = (s: string) => `${d.id}/${s}`;
    const rec = d.record;
    const carried = !!rec && !d.resolved;
    const unchanged = !!rec && !d.outcome;
    // the goal: re-rollable on a fresh deal or a resolved one (among the follow-ups)
    let goalId = d.goal;
    if (!carried) {
      const options = d.resolved ? d.resolved.candidates : CAMPAIGN_GOAL_IDS.filter((id) => !others(d.id).some((o) => o.goal === id));
      goalId = ctx.part<string>(k("goal"), (r) => pickOther(r, options.length ? options : CAMPAIGN_GOAL_IDS, d.goal), { initial: d.goal });
      if (!goalById(goalId)) goalId = d.goal;
    }
    const g = goalById(goalId)!;
    let allegiance = d.allegiance;
    let motive = d.motive;
    let secret = d.secret;
    if (!carried) {
      const a0 = g.allegiances.includes(d.allegiance) ? d.allegiance : g.allegiances[0]!;
      allegiance = ctx.part<CampaignAllegiance>(k("allegiance"), (r) => pickOther(r, g.allegiances, a0), { initial: a0 });
      if (!g.allegiances.includes(allegiance)) allegiance = a0;
      const m0 = g.motives.includes(d.motive) ? d.motive : g.motives[0]!;
      motive = ctx.part<CampaignMotive>(k("motive"), (r) => pickOther(r, g.motives, m0), { initial: m0 });
      if (!g.motives.includes(motive)) motive = m0;
    }
    if (!rec) {
      const free = EMBARRASSING_SECRETS.map((s) => s.id).filter((id) => !others(d.id).some((o) => o.secret === id));
      secret = ctx.part<string>(k("secret"), (r) => pickOther(r, free.length ? free : EMBARRASSING_SECRETS.map((s) => s.id), d.secret), { initial: d.secret });
      if (!secretById(secret)) secret = d.secret;
    }
    // the beat: unchanged without an outcome; otherwise one not dealt for this goal yet
    if (unchanged) {
      return { id: d.id, goal: goalId, allegiance, motive, secret, beat: rec!.beat.n, fill: { npc: "", place: "", crew: "" }, cost: -1, tension: d.tension, status: d.status, carried: true };
    }
    const used = usedBeats(rec, goalId);
    const fresh = g.beats.map((_, i) => i).filter((i) => !used.includes(i));
    const pool = fresh.length ? fresh : g.beats.map((_, i) => i);
    const beat0 = pickOne(rng.fork(kr("beat")), pool);
    let beat = ctx.part<number>(k("beat"), (r) => pickOther(r, pool, beat0), { initial: beat0 });
    if (!Number.isInteger(beat) || !g.beats[beat]) beat = beat0;
    const text = g.beats[beat]!.text;
    const crewKind = crewKindOf(text) ?? "crewmate";
    const fill0: BeatFill = {
      npc: pickOne(rng.fork(kr("npc")), cast.npcs),
      place: pickOne(rng.fork(kr("place")), cast.places),
      crew: drawCrew(rng.fork(kr("crew")), m, cast, crewKind),
    };
    const fill = ctx.part<BeatFill>(
      k("target"),
      (r) => ({ npc: pickOther(r.fork("npc"), cast.npcs, fill0.npc), place: pickOther(r.fork("place"), cast.places, fill0.place), crew: drawCrew(r.fork("crew"), m, cast, crewKind, fill0.crew) }),
      { initial: fill0 },
    );
    const cost0 = rng.fork(kr("cost")).int(0, BEAT_COSTS.length - 1);
    let cost = ctx.part<number>(
      k("cost"),
      (r) =>
        pickOther(
          r,
          BEAT_COSTS.map((_, i) => i),
          cost0,
        ),
      { initial: cost0 },
    );
    if (!BEAT_COSTS[cost]) cost = cost0;
    const out: SlottedMember = { id: d.id, goal: goalId, allegiance, motive, secret, beat, fill, cost, tension: d.tension, status: d.status, carried };
    if (d.outcome) out.outcome = d.outcome;
    return out;
  });
}

// ---------------------------------------------------------------------------
// filling text
// ---------------------------------------------------------------------------

function nameIn(cast: CampaignCast, id: string): string {
  return cast.party.find((p) => p.id === id)?.name ?? id;
}

/** Fill a goal or beat's slots for one PC. */
export function fillText(text: string, cast: CampaignCast, fill: Partial<BeatFill>): string {
  const crew = fill.crew ? nameIn(cast, fill.crew) : (cast.party[1]?.name ?? cast.npcs[0] ?? "a crewmate");
  return text
    .replace(/\{npc\}/g, fill.npc || cast.npcs[0]!)
    .replace(/\{place\}/g, fill.place || cast.places[0]!)
    .replace(/\{home\}/g, cast.home)
    .replace(/\{ship\}/g, cast.ship)
    .replace(/\{employer\}/g, cast.employer)
    .replace(/\{company\}/g, cast.company)
    .replace(/\{crewmate\}|\{buddy\}|\{rival\}/g, crew);
}

const answersToText = (a: CampaignAllegiance, cast: CampaignCast) => ALLEGIANCE_TEXT[a].mine.replace("{company}", cast.company);

/** The beat's card text: what to do, and what it costs. */
export function beatText(s: SlottedMember, cast: CampaignCast): string {
  const g = goalById(s.goal)!;
  return `${cap(fillText(g.beats[s.beat]!.text, cast, s.fill))} ${BEAT_COSTS[s.cost] ?? ""}`.trim();
}

// ---------------------------------------------------------------------------
// step 4: friction
// ---------------------------------------------------------------------------

export interface FrictionLine {
  key: string;
  kind: FrictionKind;
  tpl: string;
  /** PC ids: the first is the line's owner (whose secret, who covers). */
  between: string[];
  outsider?: string;
  /** Which contested thing, for resource lines. */
  thing?: number;
  /** PC id -> the text as their handout reads it. */
  text: Record<string, string>;
  /** Carried over from the stored records (not re-rollable here). */
  carried?: boolean;
}

export interface FrictionResult {
  lines: FrictionLine[];
  attempt: number;
  passed: boolean;
  log: Array<{ attempt: number; problems: string[] }>;
}

function linked(cast: CampaignCast, a: string, b: string): { buddy: boolean; rival: boolean } {
  const ma = cast.party.find((p) => p.id === a);
  const mb = cast.party.find((p) => p.id === b);
  return {
    buddy: !!(ma?.buddies.includes(b) || mb?.buddies.includes(a)),
    rival: !!(ma?.rivals.includes(b) || mb?.rivals.includes(a)),
  };
}

function templateFits(t: FrictionTemplate, kind: FrictionKind, pair: { a: SlottedMember; b?: SlottedMember }, cast: CampaignCast): boolean {
  if (t.kind !== kind) return false;
  if (pair.b) {
    if (t.with === "outsider") return false;
    const l = linked(cast, pair.a.id, pair.b.id);
    if (t.needs === "buddy" && !l.buddy) return false;
    if (t.needs === "rival" && !l.rival) return false;
    if (t.needs === "different-allegiance" && pair.a.allegiance === pair.b.allegiance) return false;
    return true;
  }
  return t.with !== "pc" && !t.needs;
}

const escapeRe = (x: string) => x.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const hiddenRe = (name: string) => new RegExp(`(?<![\\w-])${escapeRe(name)}(?![\\w-])`, "g");

/** The hidden names a text the players see would give away. */
export function hiddenNamesIn(text: string, cast: Pick<CampaignCast, "hidden">): string[] {
  return cast.hidden.filter((n) => hiddenRe(n).test(text));
}

/** Text for the players with every name they cannot see replaced by a stand-in (the employer, the Company, someone). */
export function scrubForPlayers(text: string, cast: Pick<CampaignCast, "hidden" | "employer" | "company">): string {
  let out = text;
  for (const n of cast.hidden) out = out.replace(hiddenRe(n), n === cast.employer ? HIDDEN_EMPLOYER : n === cast.company ? "the Company" : "someone");
  return out;
}

/** Render one line for every PC in it: text the players see, so only names they can see. */
export function renderLine(line: Omit<FrictionLine, "text">, members: SlottedMember[], cast: CampaignCast): Record<string, string> {
  const t = frictionTemplateById(line.tpl)!;
  const owner = members.find((m) => m.id === line.between[0])!;
  const other = line.between[1] ? members.find((m) => m.id === line.between[1]) : undefined;
  const thing = (CONTESTED_THINGS[line.thing ?? 0] ?? CONTESTED_THINGS[0]!).replace("{employer}", cast.open.employer);
  const topic = secretById(owner.secret)?.topic ?? "the past";
  const fillFor = (tpl: string, me: SlottedMember, them: { name: string; allegiance?: CampaignAllegiance }) =>
    tpl
      .replace(/\{other\}/g, them.name)
      .replace(/\{thing\}/g, thing)
      .replace(/\{topic\}/g, topic)
      .replace(/\{employer\}/g, cast.open.employer)
      .replace(/\{mine\}/g, answersToText(me.allegiance, cast))
      .replace(/\{theirs\}/g, them.allegiance ? ALLEGIANCE_TEXT[them.allegiance].theirs.replace("{company}", cast.company) : "someone else");
  const out: Record<string, string> = {};
  if (!other) {
    out[owner.id] = scrubForPlayers(cap(fillFor(t.a, owner, { name: line.outsider ?? cast.open.employer })), cast);
    return out;
  }
  out[owner.id] = scrubForPlayers(cap(fillFor(t.a, owner, { name: nameIn(cast, other.id), allegiance: other.allegiance })), cast);
  out[other.id] = scrubForPlayers(cap(fillFor(t.b ?? t.a, other, { name: nameIn(cast, owner.id), allegiance: owner.allegiance })), cast);
  return out;
}

/** The lines a crew needs, as pairs to fill: buddy and rival ties first, then the lowest-loaded PCs. */
function planPairs(rng: Rng, members: SlottedMember[], cast: CampaignCast, perPc: number, existing: Array<{ between: string[] }> = []): Array<[string, string]> {
  const ids = members.map((m) => m.id);
  const load = new Map(ids.map((id) => [id, 0]));
  const pairCount = new Map<string, number>();
  const pk = (a: string, b: string) => [a, b].sort().join("|");
  for (const l of existing) {
    for (const id of l.between) if (load.has(id)) load.set(id, load.get(id)! + 1);
    if (l.between.length === 2) pairCount.set(pk(l.between[0]!, l.between[1]!), (pairCount.get(pk(l.between[0]!, l.between[1]!)) ?? 0) + 1);
  }
  const out: Array<[string, string]> = [];
  const add = (a: string, b: string) => {
    out.push([a, b]);
    load.set(a, load.get(a)! + 1);
    load.set(b, load.get(b)! + 1);
    pairCount.set(pk(a, b), (pairCount.get(pk(a, b)) ?? 0) + 1);
  };
  // buddy and rival ties: one line per linked pair, at most two per PC
  if (existing.length === 0) {
    const tiesOf = new Map(ids.map((id) => [id, 0]));
    for (let i = 0; i < ids.length; i++)
      for (let j = i + 1; j < ids.length; j++) {
        const a = ids[i]!;
        const b = ids[j]!;
        const l = linked(cast, a, b);
        if (!(l.buddy || l.rival) || tiesOf.get(a)! >= 2 || tiesOf.get(b)! >= 2) continue;
        tiesOf.set(a, tiesOf.get(a)! + 1);
        tiesOf.set(b, tiesOf.get(b)! + 1);
        add(a, b);
      }
  }
  // then pair the least-loaded PC with the least-loaded other they have the fewest lines with
  const order = new Map(ids.map((id, i) => [id, rng.fork(`order/${i + 1}`).next()]));
  for (let guard = 0; guard < ids.length * perPc * 2; guard++) {
    const needy = ids.filter((id) => load.get(id)! < perPc).sort((a, b) => load.get(a)! - load.get(b)! || order.get(a)! - order.get(b)!);
    const a = needy[0];
    if (!a) break;
    const partners = ids
      .filter((id) => id !== a && (pairCount.get(pk(a, id)) ?? 0) < FRICTION_KINDS.length)
      .sort((x, y) => (pairCount.get(pk(a, x)) ?? 0) - (pairCount.get(pk(a, y)) ?? 0) || load.get(x)! - load.get(y)! || order.get(x)! - order.get(y)!);
    const b = partners[0];
    if (!b) break;
    add(a, b);
  }
  return out;
}

function kindWeights(dial: FrictionDial, members: SlottedMember[], cast: CampaignCast, pair: { a: SlottedMember; b?: SlottedMember }, used: Map<FrictionKind, number>, pairKinds: FrictionKind[]): Array<{ value: FrictionKind; weight: number }> {
  const allegiances = new Set(members.map((m) => m.allegiance)).size;
  return FRICTION_KINDS.map((kind) => {
    let w = DIAL_KIND_WEIGHTS[dial][kind];
    // the crew: an employer to argue over, loyalties that differ, links on the sheets
    if (kind === "resources" && cast.employer !== "the employer") w *= 1.3;
    if (kind === "loyalties") w *= members.length < 2 || allegiances / members.length >= 0.5 ? 1.5 : 0.7;
    if (kind === "ties" && pair.b) {
      const l = linked(cast, pair.a.id, pair.b.id);
      w *= l.buddy || l.rival ? 4 : 0;
    }
    // the goals in play feed their kinds
    const feeds = [pair.a, pair.b].filter((x): x is SlottedMember => !!x && goalById(x.goal)!.kinds.includes(kind)).length;
    w *= 1 + 0.5 * feeds;
    // keep the four kinds in the mix, and one line of a kind per pair
    w *= 1 / (1 + (used.get(kind) ?? 0) * 0.6);
    if (pairKinds.includes(kind)) w = 0;
    const fits = FRICTION_TEMPLATES.some((t) => templateFits(t, kind, pair, cast) || (pair.b && templateFits(t, kind, { a: pair.b, b: pair.a }, cast)));
    return { value: kind, weight: fits ? w : 0 };
  });
}

/** One line for a pair (or a lone PC and an outsider), its template and thing drawn from `rng`. */
function makeLine(rng: Rng, key: string, kind: FrictionKind, pair: { a: SlottedMember; b?: SlottedMember }, cast: CampaignCast, outsider?: string): Omit<FrictionLine, "text"> | undefined {
  // a secret line belongs to one of the two; a "b" side that fits better swaps them
  let a = pair.a;
  let b = pair.b;
  if (b && rng.fork("swap").next() < 0.5) [a, b] = [b, a];
  const fits = FRICTION_TEMPLATES.filter((t) => templateFits(t, kind, b ? { a, b } : { a }, cast));
  if (fits.length === 0) return undefined;
  const t = pickOne(rng.fork("tpl"), fits);
  const line: Omit<FrictionLine, "text"> = { key, kind, tpl: t.id, between: b ? [a.id, b.id] : [a.id] };
  if (t.a.includes("{thing}") || t.b?.includes("{thing}")) line.thing = rng.fork("thing").int(0, CONTESTED_THINGS.length - 1);
  if (!b) line.outsider = outsider ?? cast.open.employer;
  return line;
}

function membersCheck(cast: CampaignCast, members: SlottedMember[], lines: FrictionLine[]): CampaignCheck {
  // the text guard reads the material dealt, before campaign names fill its slots
  const texts = (m: SlottedMember) => {
    const g = goalById(m.goal)!;
    const mine = lines.filter((l) => l.between.includes(m.id));
    return [
      g.name,
      g.summary,
      ...(m.cost >= 0 ? [g.beats[m.beat]?.text ?? "", BEAT_COSTS[m.cost] ?? ""] : []),
      ...mine.flatMap((l) => {
        const t = frictionTemplateById(l.tpl);
        return t ? [t.a, t.b ?? "", l.thing !== undefined ? (CONTESTED_THINGS[l.thing] ?? "") : ""] : [];
      }),
    ].filter(Boolean);
  };
  const checked: CheckedMember[] = members.map((m) => ({
    id: m.id,
    name: nameIn(cast, m.id),
    goal: m.goal,
    beat: m.beat,
    beatNamesPc: m.cost >= 0 && !!crewKindOf(goalById(m.goal)!.beats[m.beat]?.text ?? "") && cast.party.length > 1,
    secret: m.secret,
    tension: m.tension,
    texts: texts(m),
  }));
  const checkedLines: CheckedLine[] = lines.map((l) => ({ key: l.key, tpl: l.tpl, between: l.between, ...(l.outsider ? { outsider: l.outsider } : {}) }));
  const result = checkCampaignDeal(checked, checkedLines);
  // the friction lines go to the players: none may name what they cannot see
  for (const l of lines) {
    const leaks = [...new Set(Object.values(l.text).flatMap((t) => hiddenNamesIn(t, cast)))];
    if (leaks.length) result.problems.push({ tone: "danger", text: `friction line ${l.key} names what the players cannot see: ${leaks.join(", ")}` });
  }
  result.ok = result.problems.length === 0;
  return result;
}

function friction(ctx: ProcedureContext, rng: Rng): FrictionResult {
  const cast = castOf(ctx);
  const dealt = ctx.get<CampaignDeal>("deal");
  const members = ctx.get<SlottedMember[]>("slots") ?? [];
  const dial = dealt?.dial ?? dialOf(ctx);
  const perPc = DIAL_LINES_PER_PC[dial];
  const ids = new Set(members.map((m) => m.id));

  // next stage: the lines carry over from the records (lines with someone no longer in the party drop out)
  const carried: FrictionLine[] = [];
  if (dealt?.stage === "next") {
    const byKey = new Map<string, FrictionLine>();
    for (const d of dealt.members) {
      for (const f of d.record?.friction ?? []) {
        if (!frictionTemplateById(f.tpl) || ![d.id, ...f.with].every((id) => ids.has(id))) continue;
        const line = byKey.get(f.key) ?? { key: f.key, kind: f.kind, tpl: f.tpl, between: [], text: {}, carried: true };
        // carried text goes to the players again: names they cannot see (now) give way to stand-ins
        if (f.outsider) line.outsider = scrubForPlayers(f.outsider, cast);
        line.text[d.id] = scrubForPlayers(f.text, cast);
        for (const id of [d.id, ...f.with]) if (!line.between.includes(id)) line.between.push(id);
        byKey.set(f.key, line);
      }
    }
    carried.push(...byKey.values());
  }

  const log: FrictionResult["log"] = [];
  let best: { lines: FrictionLine[]; check: CampaignCheck; attempt: number } | undefined;
  const attempts = dealt?.stage === "next" ? 1 : FRICTION_REDEALS;
  for (let k = 0; k < attempts; k++) {
    const ar = rng.fork(`attempt-${k}`);
    const used = new Map<FrictionKind, number>();
    for (const l of carried) used.set(l.kind, (used.get(l.kind) ?? 0) + 1);
    const lines: FrictionLine[] = [...carried];
    const keyBase = dealt?.stage === "next" ? `job-${str(ctx.inputs.jobLabel, "next").toLowerCase().replace(/[^a-z0-9]+/g, "-")}` : "line";
    let n = 0;
    const push = (line: Omit<FrictionLine, "text"> | undefined) => {
      if (!line) return;
      const partKey = `${line.key}`;
      // the GM re-rolls or pins a line on its own: its template and thing within its kind
      const chosen =
        dealt?.stage === "next"
          ? line
          : ctx.part<Omit<FrictionLine, "text">>(
              partKey,
              (r) => {
                const a = members.find((m) => m.id === line.between[0])!;
                const b = line.between[1] ? members.find((m) => m.id === line.between[1]) : undefined;
                const alt = makeLine(r, line.key, line.kind, b ? { a, b } : { a }, cast, line.outsider);
                return alt && (alt.tpl !== line.tpl || alt.thing !== line.thing) ? alt : (makeLine(r.fork("again"), line.key, line.kind, b ? { a, b } : { a }, cast, line.outsider) ?? line);
              },
              { initial: line },
            );
      const valid = frictionTemplateById(chosen.tpl) && chosen.between.every((id) => ids.has(id)) ? chosen : line;
      lines.push({ ...valid, text: renderLine(valid, members, cast) });
      used.set(valid.kind, (used.get(valid.kind) ?? 0) + 1);
    };
    if (members.length === 1) {
      // a lone PC: friction with the employer and the NPCs
      const m = members[0]!;
      const have = lines.filter((l) => l.between.includes(m.id)).length;
      // friction the players see: only the employer and NPCs they can see, or stand-ins
      const outsiders = [cast.open.employer, ...cast.open.npcs];
      for (let i = have; i < (dealt?.stage === "next" ? 1 : perPc); i++) {
        const pairKinds = lines.map((l) => l.kind);
        const kind = weightedPick(ar.fork(`kind-${i}`), kindWeights(dial, members, cast, { a: m }, used, pairKinds.length >= FRICTION_KINDS.length ? [] : pairKinds));
        if (!kind) break;
        push(makeLine(ar.fork(`line-${i}`), `${keyBase}-${++n}`, kind, { a: m }, cast, outsiders[i % outsiders.length]));
      }
    } else if (members.length > 1) {
      const pairs = planPairs(ar.fork("pairs"), members, cast, dealt?.stage === "next" ? 1 : perPc, carried);
      pairs.forEach(([x, y], i) => {
        const a = members.find((m) => m.id === x)!;
        const b = members.find((m) => m.id === y)!;
        const pairKinds = lines.filter((l) => l.between.includes(x) && l.between.includes(y)).map((l) => l.kind);
        const kind = weightedPick(ar.fork(`kind-${i}`), kindWeights(dial, members, cast, { a, b }, used, pairKinds));
        if (!kind) return;
        push(makeLine(ar.fork(`line-${i}`), `${keyBase}-${++n}`, kind, { a, b }, cast));
      });
    }
    const check = membersCheck(cast, members, lines);
    log.push({ attempt: k + 1, problems: check.problems.map((p) => p.text) });
    const score = (c: CampaignCheck) => -c.problems.filter((p) => p.tone === "danger").length * 100 - c.problems.length;
    if (!best || score(check) > score(best.check)) best = { lines, check, attempt: k + 1 };
    if (check.ok) {
      best = { lines, check, attempt: k + 1 };
      break;
    }
  }
  return { lines: best!.lines, attempt: best!.attempt, passed: best!.check.ok, log };
}

// ---------------------------------------------------------------------------
// step 5: check
// ---------------------------------------------------------------------------

function check(ctx: ProcedureContext): CampaignCheck & { label: string } {
  const cast = castOf(ctx);
  const members = ctx.get<SlottedMember[]>("slots") ?? [];
  const lines = ctx.get<FrictionResult>("friction")?.lines ?? [];
  const c = membersCheck(cast, members, lines);
  const label = c.ok ? `${c.lines} friction lines; every PC clashes with someone; nothing beyond hard words` : c.problems.map((p) => p.text).join("; ");
  return { ...c, label };
}

// ---------------------------------------------------------------------------
// step 6: the drafts and the records
// ---------------------------------------------------------------------------

function recordOf(s: SlottedMember, d: DealtCampaignMember | undefined, cast: CampaignCast, lines: FrictionLine[], job: string): CampaignAgendaRecord {
  const g = goalById(s.goal)!;
  const prior = d?.record;
  const sec = secretById(s.secret)!;
  const friction = lines
    .filter((l) => l.text[s.id])
    .map((l) => {
      const f: CampaignAgendaRecord["friction"][number] = { key: l.key, kind: l.kind, tpl: l.tpl, with: l.between.filter((id) => id !== s.id), text: l.text[s.id]! };
      if (l.outsider) f.outsider = l.outsider;
      return f;
    });
  if (prior && !d?.outcome) return { ...prior, friction };
  const history = [...(prior?.history ?? [])];
  if (prior && d?.outcome) {
    const h: CampaignAgendaRecord["history"][number] = { goal: prior.goal.id, n: prior.beat.n, text: prior.beat.text, outcome: d.outcome };
    if (prior.beat.job) h.job = prior.beat.job;
    history.push(h);
  }
  const past = [...(prior?.past ?? [])];
  if (prior && d?.resolved) {
    const p: CampaignAgendaRecord["past"][number] = { id: prior.goal.id, title: prior.goal.title, text: prior.goal.text };
    if (prior.beat.job) p.job = prior.beat.job;
    past.push(p);
  }
  const goal: CampaignAgendaRecord["goal"] =
    s.carried && prior
      ? { ...prior.goal }
      : { id: g.id, title: g.name, text: fillText(g.summary, cast, s.fill), allegiance: s.allegiance, answersTo: answersToText(s.allegiance, cast), motive: s.motive, why: MOTIVE_TEXT[s.motive].why, since: job };
  return {
    goal,
    beat: { n: s.beat, text: beatText(s, cast), job },
    status: s.status,
    tension: Math.max(0, Math.min(TENSION_CAP, s.tension)),
    history,
    past,
    secret: prior?.secret ?? { id: sec.id, text: sec.text, topic: sec.topic },
    friction,
  };
}

function drafts(ctx: ProcedureContext): LongAgendaDraftSet {
  const cast = castOf(ctx);
  const dealt = ctx.get<CampaignDeal>("deal");
  const members = ctx.get<SlottedMember[]>("slots") ?? [];
  const fr = ctx.get<FrictionResult>("friction");
  const report = ctx.get<CampaignCheck & { label: string }>("check");
  const lines = fr?.lines ?? [];
  const stage = dealt?.stage ?? "deal";
  const job = jobLabelOf(ctx, stage);
  const slot = (key: string, label: string, text: string): AgendaDraftSlot => ({ key: `slots/${key}`, label, text });
  const characters: LongAgendaDraftCharacter[] = members.map((s) => {
    const m = cast.party.find((p) => p.id === s.id)!;
    const d = dealt?.members.find((x) => x.id === s.id);
    const g = goalById(s.goal)!;
    const record = recordOf(s, d, cast, lines, job);
    const k = (x: string) => `${s.id}/${x}`;
    const editable = !s.carried;
    const slots: AgendaDraftSlot[] = editable
      ? [
          slot(k("goal"), "Goal", g.name),
          slot(k("allegiance"), "Answers to", ALLEGIANCE_TEXT[s.allegiance].label.toLowerCase() === record.goal.answersTo.toLowerCase() ? ALLEGIANCE_TEXT[s.allegiance].label : `${ALLEGIANCE_TEXT[s.allegiance].label} (${record.goal.answersTo})`),
          slot(k("motive"), "Motive", `${MOTIVE_TEXT[s.motive].label}: ${record.goal.why}`),
        ]
      : [];
    if (!d?.record) slots.push(slot(k("secret"), "Embarrassing secret", record.secret.text));
    const fresh = s.cost >= 0;
    const crewName = s.fill.crew ? nameIn(cast, s.fill.crew) : "";
    const beatSlots: AgendaDraftSlot[] = fresh
      ? [
          slot(k("beat"), "Beat", cap(fillText(g.beats[s.beat]!.text, cast, s.fill))),
          slot(k("target"), "Who and where", [crewKindOf(g.beats[s.beat]!.text) ? crewName : "", s.fill.npc, s.fill.place].filter(Boolean).join(" · ")),
          slot(k("cost"), "Cost", BEAT_COSTS[s.cost]!),
        ]
      : [];
    const step = TENSION_LADDER[record.tension]!;
    const ch: LongAgendaDraftCharacter = {
      id: s.id,
      name: m.name,
      inCampaign: m.inCampaign,
      title: record.goal.title,
      summary: record.goal.text,
      slots,
      beat: {
        text: record.beat.text,
        slots: beatSlots,
        hint: { label: "Bonus XP", text: "Earned at session end if you risk or give up something to advance your personal agenda.", page: AGENDA_XP_PAGES },
      },
      status: `Tension: ${step.label} (${record.tension} of ${TENSION_CAP})`,
      record: record as unknown as Record<string, unknown>,
    };
    if (d?.outcome) {
      ch.change =
        d.outcome === "advanced"
          ? "Advanced: the next beat."
          : d.outcome === "stalled"
            ? record.tension > (d.record?.tension ?? 0)
              ? `Stalled: tension rises to ${step.label.toLowerCase()}.`
              : `Stalled: tension stays at ${step.label.toLowerCase()}, the cap.`
            : `Resolved "${d.record?.goal.title ?? ""}": a follow-up goal, ${g.name}.`;
      ch.reminders = [0, 1];
    } else if (d?.record) ch.change = "No outcome marked: unchanged.";
    else ch.reminders = [0, 1];
    if (m.index >= 0 && stage === "deal") ch.lock = { path: ["pcs", m.index, "goal"], value: s.goal, locked: cast.locked[m.id] === s.goal };
    return ch;
  });
  const friction: LongAgendaFrictionLine[] = lines.map((l) => {
    const out: LongAgendaFrictionLine = { kind: l.kind, kindLabel: FRICTION_KIND_LABEL[l.kind], between: l.between, text: l.text };
    if (!l.carried && stage === "deal") out.key = `friction/${l.key}`;
    return out;
  });
  const set: LongAgendaDraftSet = {
    stage,
    job,
    characters,
    friction,
    note:
      stage === "deal"
        ? "DRAFT: long-term goals and this job's beats are secret (GM handouts); the friction lines are open, for everyone at the table. Friction, never betrayal: the worst it gets is hard words."
        : `DRAFT: the next beats for ${job}. Revise them, then apply: the goals, beats and handouts update.`,
  };
  if (report) {
    const lines2: AgendaDraftReport["lines"] = [];
    if (fr && stage === "deal") {
      for (const l of fr.log.filter((x) => x.problems.length)) lines2.push({ tone: "info", text: `Friction deal ${l.attempt} re-dealt: ${l.problems.join("; ")}` });
    }
    lines2.push({ tone: "ok", text: "Betrayal: none. Every goal, beat, secret and line is level 0-1; no plants, no Hidden Synthetics." });
    lines2.push({ tone: "ok", text: `Tension cap: ${TENSION_LADDER[TENSION_CAP]!.label.toLowerCase()} (${members.map((m) => `${nameIn(cast, m.id)} ${m.tension}`).join(", ")})` });
    const counts = FRICTION_KINDS.map((k) => `${FRICTION_KIND_LABEL[k].toLowerCase()} ${lines.filter((l) => l.kind === k).length}`).join(", ");
    lines2.push({ tone: "info", text: `Kinds: ${counts}.` });
    for (const p of report.problems) lines2.push(p);
    if (cast.party.length === 1) lines2.push({ tone: "info", text: "One PC: the friction is with the employer and the NPCs." });
    set.report = {
      ok: report.ok,
      summary: `${lines.length} friction lines (${DIAL_LINES_PER_PC[dealt?.dial ?? "simmering"]}+ per PC on the ${dealt?.dial ?? "simmering"} dial)${report.ok ? ": every PC clashes with someone, and nobody is the target of everything." : "."}`,
      lines: lines2,
      pairs: cast.party.flatMap((a, i) =>
        cast.party.slice(i + 1).map((b) => {
          const between = lines.filter((l) => l.between.includes(a.id) && l.between.includes(b.id));
          return { a: a.name, b: b.name, score: between.length, reasons: between.map((l) => `${FRICTION_KIND_LABEL[l.kind]}: ${l.text[a.id]}`) };
        }),
      ),
    };
  }
  return set;
}

// ---------------------------------------------------------------------------
// the procedure
// ---------------------------------------------------------------------------

export const campaignAgendasProcedure: Procedure = {
  id: CAMPAIGN_AGENDAS_ID,
  name: "Campaign agendas",
  description:
    "Deal each PC a long-term personal agenda that lasts several jobs, a beat per job, and open friction lines (resources, loyalties, embarrassing secrets, buddies and rivals) that never lead to betrayal. After a job, mark each goal advanced, stalled or resolved to deal the next beats.",
  // the goals and lines are the module's own; the personal agenda, its bonus XP and Pursue Agenda are p. 27, 30, 257; campaign goals p. 158-159
  page: 27,
  original: true,
  mode: [CAMPAIGN],
  longAgendas: CAMPAIGN_AGENDA_DEF,
  inputs: {
    type: "object",
    properties: {
      pcs: {
        type: "array",
        title: "Player characters",
        default: [],
        items: { type: "object", properties: { id: { type: "string" }, name: { type: "string" }, goal: { type: "string", title: "Goal", ...labelledEnum(["random", ...CAMPAIGN_GOAL_IDS], { random: "Random", ...Object.fromEntries(CAMPAIGN_GOALS.map((g) => [g.id, g.name])) }), default: "random" } } },
      },
      friction: {
        type: "string",
        title: "Friction dial",
        ...labelledEnum(FRICTION_DIAL),
        default: "simmering",
        description: "How much open friction: calm (1 line per PC), simmering (2) or prickly (3). Never betrayal.",
      },
      job: { type: "object", title: "Job", "x-entity": { types: ["alien.job"] }, description: "The job the first beats are for; blank uses the campaign's latest job." },
      jobLabel: { type: "string", title: "Job label", description: "How the beats name the job (e.g. Job 2); blank: Job 1." },
      pcCount: { type: "integer", minimum: 1, maximum: 8, default: 4, title: "Placeholder PCs", description: "Used only when the campaign has no PCs." },
      campaign: {
        type: "object",
        title: "Campaign",
        "x-campaign": {
          kinds: ["character", "location", "faction", "job", "vehicle"],
          fields: ["career", "employer", "factionType", "role", "buddy", "rival"],
          relationships: ["buddy_of", "rival_of", "employer_of", "sponsor_of"],
        },
        description: "The crew (with buddies and rivals), NPCs, places, the ship and the job's employer.",
      },
    },
  },
  steps: [
    {
      id: "cast",
      title: "Crew and campaign",
      compute: (ctx) => buildCampaignCast(ctx.inputs),
      display: (_ctx, result) => {
        const c = result as CampaignCast;
        return `${c.party.map((m) => m.name).join(", ")} · employer: ${c.employer} · home: ${c.home} · ${c.npcs.length} NPCs, ${c.places.length} places`;
      },
    },
    { id: "deal", title: "Deal goals (or apply the job's outcomes)", reads: ["cast"], compute: (ctx, rng) => deal(ctx, rng), display: (_ctx, result) => (result as CampaignDeal).label },
    {
      id: "slots",
      title: "Fill the slots and deal the beats",
      reads: ["deal"],
      compute: (ctx, rng) => slots(ctx, rng),
      display: (ctx, result) => {
        const cast = ctx.get<CampaignCast>("cast");
        return (result as SlottedMember[]).map((s) => `${cast?.party.find((p) => p.id === s.id)?.name ?? s.id}: beat ${s.beat + 1} of ${goalById(s.goal)?.name}`).join(" · ");
      },
    },
    {
      id: "friction",
      title: "Open friction (re-dealt until the check passes)",
      reads: ["slots"],
      compute: (ctx, rng) => friction(ctx, rng),
      display: (_ctx, result) => {
        const r = result as FrictionResult;
        return `${r.lines.length} lines (${r.passed ? `passed on deal ${r.attempt}` : "check not passed"})`;
      },
    },
    { id: "check", title: "No-betrayal check", reads: ["friction"], compute: (ctx) => check(ctx), display: (_ctx, result) => (result as { label: string }).label },
    {
      id: "longAgendaDrafts",
      title: "Agenda cards (draft)",
      reads: ["check"],
      compute: (ctx) => drafts(ctx),
      display: (_ctx, result) => {
        const s = result as LongAgendaDraftSet;
        return `DRAFT: ${s.characters.length} goals, ${s.friction.length} open friction lines`;
      },
    },
  ],
  produce: () => ({ entities: [], relationships: [] }),
};

export { TENSION_CAP, TENSION_LADDER };
