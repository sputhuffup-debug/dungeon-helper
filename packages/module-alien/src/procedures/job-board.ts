/**
 * Job board (campaign mode, module-original presentation around the book's
 * Job Generator, p. 244-252). Between jobs the GM deals a few postings. Each
 * posting is a job rolled exactly as `alien.job.create` rolls it (the same
 * procedure, run with the posting's own job seed), dressed as the players
 * read it: title, pitch, pay, who posted it and where, deadline, stated
 * requirements and a risk rating that follows the difficulty but may
 * mislead. The GM's side keeps the complications, the plot twist, what the
 * employer really wants and the NPCs' secrets and agendas.
 *
 * Every posting comes with one NPC per point of rolled difficulty (the book
 * rolls difficulty on a D3, so "up to three NPCs" maps straight onto it; a
 * module decision): the contact first, then roles from an original table
 * weighted by frame and job. Each NPC gets a name, a stat line from the
 * book's typical NPCs, a want, a secret, a tie to the job and an agenda that
 * may betray the crew (npc-agendas.ts). Every betrayer lowers the job's
 * effective difficulty by one (at least 1), which drives the site brief
 * (maps/jobBrief.ts): the traitor is the extra danger, so the site holds less.
 *
 * The board is an offer set (`results.offers`): each posting, and each part
 * of it, re-rolls or pins on its own. Accepting a posting creates the job
 * (with its posting, brief and both difficulties), the employer faction (or
 * links an existing one), the NPCs (the contact visible to the players, the
 * rest GM-only until met) and a player handout with the posting text only.
 */
import { FRAME_LABELS, labelledEnum } from "../entities/common";
import { createRng, runProcedure, type ModuleManifest, type Offer, type OfferSet, type OfferSlot, type Procedure, type ProcedureContext, type ProducedEntity, type ProducedRelationship, type Rng } from "@campaign-forge/module-sdk";
import { npcPresets } from "../data/npc-presets";
import { manifest } from "../manifest";
import { jobSiteBrief, type JobBriefNpc, type JobSiteBrief } from "../maps/jobBrief";
import { CAMPAIGN } from "../modes";
import { careerItems } from "../reference/careers";
import { FRAME_KEY, isObj, num, str } from "./helpers";
import { jobCreate } from "./job";
import {
  CODENAMES,
  CONTACT_PRESETS,
  CONTACT_ROLE,
  DEADLINES,
  EMPLOYER_INTENTS,
  NPC_ROLES,
  PAY_TERMS,
  PITCH_CLOSERS,
  PITCH_DISTANCE,
  PITCH_OPENERS,
  PITCH_WORK,
  POSTERS,
  POSTING_TITLES,
  REQUIREMENTS,
  RISK_LABELS,
  SPARE_NAMES,
  TREACHERY_DIAL,
  type FactionType,
  type FrameKey,
  type NpcRoleRow,
  type TreacheryDial,
} from "./job-board-data";
import { agendaContradicts, agendaText, dealNpcAgenda, effectiveDifficulty, isBetrayer, type NpcAgenda } from "./npc-agendas";
import {
  arcAgent,
  arcGrudge,
  arcHeat,
  arcPayoffs,
  arcPoster,
  arcSponsor,
  boardArcs,
  chooseClue,
  clueRng,
  emptyPostingArc,
  placeClue,
  placementFits,
  slotLabelOf,
  sponsorIntent,
  type BoardArcs,
  type CluePlacement,
  type ClueHost,
  type PostingArc,
} from "./job-board-arcs";

export const JOB_BOARD_ID = "alien.job-board";
export const EMPLOYER_BIASES = ["any", "corporation", "government", "military", "colonial", "other"] as const;
export const POSTING_HANDOUT_PURPOSE = "job-posting";
/** Tries at an employer of the biased kind: the employer step is re-seeded until one fits (module decision). */
const BIAS_TRIES = 8;

type Obj = Record<string, unknown>;

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

const pick = <T>(rng: Rng, list: readonly T[]): T => list[rng.int(0, list.length - 1)]!;
const seedOf = (rng: Rng): string => Math.floor(rng.next() * 2 ** 32).toString(36).padStart(7, "0");
function weighted<T>(rng: Rng, items: Array<{ item: T; w: number }>): T | undefined {
  const total = items.reduce((n, x) => n + Math.max(0, x.w), 0);
  if (total <= 0) return undefined;
  let r = rng.next() * total;
  for (const x of items) {
    r -= Math.max(0, x.w);
    if (r < 0) return x.item;
  }
  return items[items.length - 1]?.item;
}
const fillWith = (vars: Record<string, string>) => (text: string): string =>
  text.replace(/\{(\w+)\}/g, (m, k: string) => {
    const lower = k.charAt(0).toLowerCase() + k.slice(1);
    const v = vars[lower];
    if (v === undefined) return m;
    return k.charAt(0) === k.charAt(0).toUpperCase() && k.charAt(0) !== lower.charAt(0) ? v.charAt(0).toUpperCase() + v.slice(1) : v;
  });
const money = (n: number) => `$${n.toLocaleString("en-US")}`;
/** True for cargo named in the plural ("metal ingots or pellets", "weapons & armor", "livestock/animals"): a word of it ends in a plural "s". */
export function pluralCargo(what: string): boolean {
  return what
    .toLowerCase()
    .split(/[\s/&]+/)
    .some((w) => w.length > 3 && /[^s]s$/.test(w) && !/(us|is)$/.test(w));
}
/** How a destination row reads in a posting (module-original); others read "the <label>". */
const DEST_TEXT: Record<string, string> = {
  "Only Coordinates": "a set of deep-space coordinates",
  "Hostile Forest/Jungles/Desert": "the wilderness",
  "Asteroid/Moon": "an asteroid",
  "Earth, Gateway Station": "Gateway Station",
  "Young Colony": "a young colony",
  "Established Colony": "an established colony",
  Wreckage: "the wreck",
  "Wreckage (roll again or choose)": "the wreck",
  Starship: "a starship in orbit",
  Colony: "the colony",
  "Isolated Outpost": "an isolated outpost",
  "Scattered Homesteads": "the homesteads",
  "Rogue Asteroid": "a rogue asteroid",
  Moon: "a moon",
  "Asteroid Belt": "the asteroid belt",
  "Colonized World": "a colonized world",
  "Terrestrial Planet": "an uncharted planet",
  "Ice Planet": "an ice planet",
  "Impenetrable Area": "the deep wilderness",
};

// ---------------------------------------------------------------------------
// the campaign as the board sees it
// ---------------------------------------------------------------------------

export interface BoardCast {
  pcCount: number;
  home: string;
  /** Factions already in the campaign, by name (an employer that exists is linked, not duplicated). */
  factions: Array<{ id: string; name: string; visibility?: string }>;
  /** Names already taken by characters in the campaign. */
  takenNames: string[];
  /** A bar (or the like) inside the home base, where a poster can sit: "The Rusted Anchor". */
  bar?: string;
}

/** Names that read as a place to drink: where a broker or a client's representative takes a booth. */
const BAR_NAME = /\b(bar|anchor|cantina|saloon|tavern|pub|lounge|club|inn|tap|taproom|diner|canteen)\b/i;

export function boardCast(inputs: Obj): BoardCast {
  const snap = isObj(inputs.campaign) ? inputs.campaign : {};
  const entities = (Array.isArray(snap.entities) ? snap.entities : []).filter(isObj);
  const pcs = entities.filter((e) => e.pc === true);
  const tags = (e: Obj) => (Array.isArray(e.tags) ? e.tags.filter((t): t is string => typeof t === "string") : []);
  const locations = entities.filter((e) => e.kind === "location");
  const home = locations.find((e) => tags(e).includes("home-base") && e.subtype === "colony") ?? locations.find((e) => tags(e).includes("home-base"));
  // the home base set for the campaign first, then a place tagged as one
  const set = isObj(inputs.homeBase) ? str(inputs.homeBase.name) : "";
  // a bar within the home base (the campaign's "within" links), so the bar posting names it
  const homeId = isObj(inputs.homeBase) && str(inputs.homeBase.id) ? str(inputs.homeBase.id) : home ? str(home.id) : "";
  const links = (Array.isArray(snap.relationships) ? snap.relationships : []).filter(isObj);
  const inside = new Set(links.filter((l) => l.type === "within" && l.to === homeId).map((l) => str(l.from)));
  const bar = locations.find((e) => inside.has(str(e.id)) && BAR_NAME.test(str(e.name)));
  return {
    pcCount: pcs.length > 0 ? pcs.length : Math.max(1, Math.floor(num(inputs.pcCount, 4))),
    home: set || (home ? str(home.name) : "the port"),
    ...(bar ? { bar: str(bar.name) } : {}),
    factions: entities.filter((e) => e.kind === "faction").map((e) => ({ id: str(e.id), name: str(e.name), ...(typeof e.visibility === "string" ? { visibility: e.visibility } : {}) })),
    takenNames: entities.filter((e) => e.kind === "character").map((e) => str(e.name)),
  };
}

// ---------------------------------------------------------------------------
// one book job, rolled by the Job Generator itself
// ---------------------------------------------------------------------------

export interface BookJob {
  seed: string;
  /** Employer step re-seeded for the employer bias, when it was. */
  stepSeeds: Record<string, string>;
  inputs: Obj;
  results: Obj;
  job: ProducedEntity;
  employer?: ProducedEntity;
  relationship?: ProducedRelationship;
}

/** The Job Generator's own run: the same output `alien.job.create` gives for this seed, inputs and step seeds. */
export function rollBookJob(ctx: ProcedureContext, seed: string, opts: { frame: string; pcCount: number; marineCorps?: string; bias: string }): BookJob {
  const mod = { tables: ctx.tables.all(), manifest: manifest as ModuleManifest };
  const inputs: Obj = { frame: opts.frame, pcCount: opts.pcCount, ...(opts.marineCorps ? { marineCorps: opts.marineCorps } : {}) };
  const run = (stepSeeds: Record<string, string>) => runProcedure(jobCreate, mod, { seed, inputs, includeOptional: ["plotTwist"], ...(Object.keys(stepSeeds).length ? { stepSeeds } : {}) });
  let stepSeeds: Record<string, string> = {};
  let graph = run(stepSeeds);
  if (opts.bias !== "any" && opts.frame !== "colonial-marines") {
    for (let k = 0; k < BIAS_TRIES; k++) {
      const s: Record<string, string> = k === 0 ? {} : { employer: `${seed}/bias-${k}` };
      const g = k === 0 ? graph : run(s);
      const type = g.produced.entities.find((e) => e.tempId === "employer")?.fields.factionType;
      if (type === opts.bias) {
        graph = g;
        stepSeeds = s;
        break;
      }
    }
  }
  const job = graph.produced.entities.find((e) => e.tempId === "job")!;
  const employer = graph.produced.entities.find((e) => e.tempId === "employer");
  const out: BookJob = { seed, stepSeeds, inputs, results: graph.results, job };
  if (employer) out.employer = employer;
  const rel = graph.produced.relationships[0];
  if (rel) out.relationship = rel;
  return out;
}

// ---------------------------------------------------------------------------
// NPCs
// ---------------------------------------------------------------------------

export interface BoardNpc {
  role: string;
  name: string;
  preset: string;
  want: string;
  secret: string;
  tie: string;
}

const NAME_POOL = [...careerItems.flatMap((c) => c.names), ...SPARE_NAMES];

function roleWeight(r: NpcRoleRow, fk: FrameKey, labels: string[]): number {
  let w = r.weight * (r.frames?.[fk] ?? 1);
  for (const l of labels) if (r.when?.includes(l)) w += 2;
  return w;
}

function dealNpc(rng: Rng, k: number, o: { fk: FrameKey; factionType: FactionType; labels: string[]; taken: Set<string>; roles: Set<string>; fill: (s: string) => string }): BoardNpc {
  const role = k === 0 ? CONTACT_ROLE : (weighted(rng.fork("role"), NPC_ROLES.filter((r) => !o.roles.has(r.id)).map((r) => ({ item: r, w: roleWeight(r, o.fk, o.labels) }))) ?? NPC_ROLES[0]!);
  const presets = k === 0 ? CONTACT_PRESETS[o.fk === "marines" ? "marines" : o.factionType] : role.presets;
  const free = NAME_POOL.filter((n) => !o.taken.has(n) && ![...o.taken].some((t) => t.split(/[ ,]/)[0] === n.split(" ")[0]));
  const name = free.length > 0 ? pick(rng.fork("name"), free) : `${pick(rng.fork("name"), NAME_POOL)} ${k + 1}`;
  return {
    role: role.id,
    name,
    preset: pick(rng.fork("preset"), presets),
    want: o.fill(pick(rng.fork("want"), role.wants)),
    secret: o.fill(pick(rng.fork("secret"), role.secrets)),
    tie: o.fill(pick(rng.fork("tie"), role.ties)),
  };
}

const roleRow = (id: string): NpcRoleRow => (id === "contact" ? CONTACT_ROLE : (NPC_ROLES.find((r) => r.id === id) ?? NPC_ROLES[0]!));

// ---------------------------------------------------------------------------
// one posting
// ---------------------------------------------------------------------------

export interface PostingData {
  index: number;
  key: string;
  book: BookJob;
  frame: string;
  difficulty: number;
  effectiveDifficulty: number;
  betrayers: string[];
  title: string;
  pitch: string;
  pay: string;
  poster: { postedBy: string; where: string; clientShown: boolean };
  deadline: string;
  requirements: string[];
  risk: { label: string; level: number; honesty: "honest" | "understated" | "overstated" };
  intent: string;
  /** `existing`: an NPC already in the campaign (a contact), linked rather than created. */
  npcs: Array<BoardNpc & { agenda: NpcAgenda; android: boolean; existing?: string }>;
  brief: JobSiteBrief;
  employerName: string;
  /** How the posting names the destination ("the spaceport"). */
  destText: string;
  /** An existing campaign faction the employer is, when there is one. */
  existingEmployer?: string;
  /** What the campaign's arcs did to the posting (absent when the board has no arcs). */
  arc?: PostingArc;
  /** The posting's own seed (the board-level clue placement reads every posting's). */
  seed?: string;
}

/** A table label inside a posting's title reads as a title: "Metal Ingots or Pellets", not "Metal Ingots Or Pellets". */
export function titleWords(s: string): string {
  return s.replace(/(?<=\S )(Or|And|Of|The|To|For|In|On|At|With)(?= )/g, (w) => w.toLowerCase());
}

function labelsOf(book: BookJob, fk: FrameKey): { mission: string; destination: string; complications: string[]; twist: string } {
  const r = book.results;
  const mission = isObj(r.mission) ? str(fk === "truckers" ? r.mission.cargo : r.mission.mission, str(r.mission.label)) : "";
  const d = isObj(r.destination) ? r.destination : {};
  const destination = d.wreckage === true ? "Wreckage" : str(d.destination, str(d.label));
  const complications = (Array.isArray(r.complications) ? r.complications : [r.complications]).filter(isObj).map((c) => str(c.complication, str(c.label)));
  const twist = isObj(r.plotTwist) ? str(r.plotTwist.twist) : "";
  return { mission, destination, complications, twist };
}

function buildPosting(ctx: ProcedureContext, index: number, cast: BoardCast, taken: Set<string>, arcs?: BoardArcs): PostingData {
  const key = `posting-${index}`;
  const seed = ctx.part(key, (r) => seedOf(r));
  const local = (k: string) => createRng(seed).fork(k);
  const part = <T>(k: string, roll: (r: Rng) => T): T => ctx.part(`${key}/${k}`, roll, { initial: roll(local(k)) });

  const frame = str(ctx.inputs.frame, "space-truckers");
  const fk = FRAME_KEY[frame] ?? "truckers";
  const bias = str(ctx.inputs.employerBias, "any");
  const marineCorps = str(ctx.inputs.marineCorps) || undefined;
  const jobSeed = part("job", (r) => seedOf(r));
  const book = rollBookJob(ctx, jobSeed, { frame, pcCount: cast.pcCount, bias, ...(marineCorps ? { marineCorps } : {}) });
  const jf = book.job.fields;
  const difficulty = Math.max(1, Math.min(3, num(jf.difficulty, 1)));
  const distance = num(jf.distance);
  const payment = num(jf.payment);
  // the campaign's arcs: a thread's sponsor may post it, a contact may bring it (absent without arcs)
  const pa = arcs ? emptyPostingArc() : undefined;
  const sponsor = arcs && pa ? arcSponsor(part, arcs, `offers/${key}`, pa) : undefined;
  const posterContact = arcs && pa ? arcPoster(part, arcs, `offers/${key}`, pa) : undefined;
  const employerName = sponsor ? sponsor.name : str(jf.employer, "the employer");
  const factionType = sponsor ? sponsor.factionType : ((str(book.employer?.fields.factionType, fk === "marines" ? "military" : "other") as FactionType) ?? "other");
  const labels = labelsOf(book, fk);
  const allLabels = [labels.mission, labels.destination, ...labels.complications, labels.twist].filter(Boolean);
  const existing = sponsor ? { id: sponsor.id } : cast.factions.find((f) => f.name.toLowerCase() === employerName.toLowerCase());

  // what the players read
  let poster = part("poster", (r) => {
    const rows = POSTERS.filter((p) => !p.frames || p.frames.includes(fk));
    const row = pick(r, rows);
    const f = fillWith({ employer: employerName, home: cast.home, bar: cast.bar ?? `the bar at ${cast.home}` });
    return { postedBy: f(row.postedBy), where: f(row.where), clientShown: row.clientShown };
  });
  if (posterContact) poster = { ...poster, postedBy: posterContact.name, where: posterContact.foundAt ?? poster.where };
  const publicEmployer = poster.clientShown ? employerName : "the client";
  const what = (labels.mission || "the job").toLowerCase();
  const destShort = labels.destination ? (DEST_TEXT[labels.destination] ?? `the ${labels.destination.toLowerCase()}`) : "the destination";
  const vars = { employer: publicEmployer, home: cast.home, dest: destShort, what, goes: pluralCargo(what) ? "go" : "goes", it: pluralCargo(what) ? "them" : "it", postedBy: poster.postedBy, prize: fk === "truckers" ? `the ${what}` : "the objective", contact: "the contact" };
  const fill = fillWith(vars);
  const risk = part("risk", (r) => {
    const x = r.int(1, 6);
    const honesty: PostingData["risk"]["honesty"] = x <= 4 ? "honest" : x === 5 ? "understated" : "overstated";
    const level = Math.max(0, Math.min(RISK_LABELS.length - 1, difficulty + (honesty === "understated" ? -1 : honesty === "overstated" ? 1 : 0)));
    return { label: RISK_LABELS[level]!, level, honesty };
  });
  const title = part("title", (r) => fillWith({ ...vars, what: titleWords(labels.mission || "Job"), codename: pick(r.fork("codename"), CODENAMES) })(pick(r, POSTING_TITLES[fk])));
  const pitch = part("pitch", (r) => {
    const n = distance;
    const dist = n === 0 ? pick(r.fork("d"), PITCH_DISTANCE.near) : pick(r.fork("d"), PITCH_DISTANCE.far).replace("{n}", String(n)).replace(/\{s\}/g, n === 1 ? "" : "s");
    return [fill(pick(r.fork("o"), PITCH_OPENERS[fk])), fill(pick(r.fork("w"), PITCH_WORK[fk])), dist, pick(r.fork("c"), PITCH_CLOSERS[risk.level] ?? PITCH_CLOSERS[2]!)].join(" ");
  });
  const terms = part("pay", (r) => pick(r, PAY_TERMS));
  const deadline = part("deadline", (r) => pick(r, DEADLINES[fk]));
  const requirements = part("requirements", (r) => {
    const rows = REQUIREMENTS.filter((q) => !q.frames || q.frames.includes(fk)).map((q) => ({ item: q.text, w: (q.weight ?? 1) + (q.when ?? []).filter((l) => allLabels.includes(l)).length * 3 }));
    const n = 1 + r.int(1, 2);
    const out: string[] = [];
    for (let i = 0; i < n; i++) {
      const got = weighted(r.fork(`q${i}`), rows.filter((x) => !out.includes(x.item)));
      if (got) out.push(got);
    }
    return out;
  });
  const rolledIntent = part("intent", (r) => pick(r, EMPLOYER_INTENTS[factionType] ?? EMPLOYER_INTENTS.other));
  const intent = sponsor ? sponsorIntent(rolledIntent, arcs?.snap.threads.find((t) => t.id === sponsor.thread)) : rolledIntent;

  // NPCs: one per point of rolled difficulty, the contact first
  const dial = (TREACHERY_DIAL as readonly string[]).includes(str(ctx.inputs.treachery)) ? (str(ctx.inputs.treachery) as TreacheryDial) : "rare";
  const npcs: PostingData["npcs"] = [];
  const roles = new Set<string>();
  const count = Math.min(3, difficulty);
  let grudgeTried = false;
  for (let k = 0; k < count; k++) {
    let npc = part(`npc-${k + 1}`, (r) => dealNpc(r, k, { fk, factionType, labels: allLabels, taken, roles, fill }));
    // a contact who posted the job is its contact; one with a grudge may come back as another of its NPCs
    let existingNpc: string | undefined;
    let grudge: string | undefined;
    if (k === 0 && posterContact) {
      npc = { ...npc, name: posterContact.name };
      existingNpc = posterContact.id;
    } else if (k > 0 && arcs && pa && !grudgeTried) {
      grudgeTried = true;
      const back = arcGrudge(part, arcs, `offers/${key}`, pa);
      if (back) {
        npc = { ...npc, name: back.contact.name };
        existingNpc = back.contact.id;
        grudge = back.grudge;
      }
    }
    taken.add(npc.name);
    roles.add(npc.role);
    const row = roleRow(npc.role);
    const agendaFill = fillWith({ ...vars, employer: employerName, contact: npcs[0]?.name ?? "the contact" });
    const ctxA = { dial, contact: k === 0, openAndroid: row.android === true, role: npc.role, noSynthetic: npcs.some((n) => n.agenda.synthetic), fill: agendaFill };
    let agenda = part(`npc-${k + 1}/agenda`, (r) => dealNpcAgenda(r, ctxA));
    // an agenda that contradicts the NPC's secret, or repeats another NPC's in this posting, is dealt again (a few tries)
    for (let t = 0; t < 6 && (agendaContradicts(agenda.arc, npc.secret) || npcs.some((n) => n.agenda.arc === agenda.arc)); t++) agenda = dealNpcAgenda(local(`npc-${k + 1}/agenda-fit-${t}`), ctxA);
    // at most one hidden synthetic per job, none under the "none" dial, none on an open android: a pinned or stale agenda that breaks this is re-dealt
    if (agenda.synthetic && (ctxA.noSynthetic || ctxA.openAndroid || dial === "none")) agenda = dealNpcAgenda(local(`npc-${k + 1}/agenda-alt`), { ...ctxA, noSynthetic: true });
    if (dial === "none" && agenda.betrayal >= 2) agenda = dealNpcAgenda(local(`npc-${k + 1}/agenda-none`), { ...ctxA, noSynthetic: true });
    if (existingNpc && !grudge && (isBetrayer(agenda) || agenda.synthetic)) agenda = dealNpcAgenda(local(`npc-${k + 1}/agenda-contact`), { ...ctxA, dial: "none", noSynthetic: true });
    if (grudge) {
      // the returning grudge turns on the crew when the dial allows it
      for (let t = 0; t < 8 && dial !== "none" && !isBetrayer(agenda); t++) agenda = dealNpcAgenda(local(`npc-${k + 1}/agenda-grudge-${t}`), { ...ctxA, dial: "common", noSynthetic: true });
      agenda = { ...agenda, grudge };
    }
    npcs.push({ ...npc, agenda, android: row.android === true || !!agenda.synthetic, ...(existingNpc ? { existing: existingNpc } : {}) });
  }
  // betrayers and hidden synthetics may work for one of the campaign's threads
  if (arcs && pa) {
    npcs.forEach((n, k) => {
      if (!isBetrayer(n.agenda) && !n.agenda.synthetic) return;
      const tie = arcAgent(part, arcs, `offers/${key}`, `npc-${k + 1}`, n.name, pa);
      if (!tie) return;
      n.agenda = { ...n.agenda, why: tie.why };
      pa.links.push({ kind: "agent", thread: tie.thread.id, entity: n.existing ?? `npc-${k + 1}` });
    });
  }
  const betrayers = npcs.filter((n) => isBetrayer(n.agenda)).map((n) => n.name);
  const effective = effectiveDifficulty(difficulty, betrayers.length);

  // the site brief follows the effective difficulty
  const briefSeed = part("brief", (r) => seedOf(r));
  const briefNpcs: JobBriefNpc[] = npcs.map((n) => {
    const betrayer = isBetrayer(n.agenda);
    const android = !!n.agenda.synthetic || roleRow(n.role).android === true;
    const base = roleRow(n.role).mapRole;
    // betrayers are always at the site; the contact otherwise stays away
    const mapRole = betrayer ? (android ? "android" : "crew") : base ? (android ? "android" : base) : undefined;
    const note = betrayer ? `Betrayer (GM only). ${n.agenda.turn ?? ""}`.trim() : n.agenda.synthetic ? `Hidden synthetic (GM only). Directive: ${n.agenda.synthetic.directive}` : undefined;
    return { name: n.name, ...(mapRole ? { mapRole } : {}), ...(note ? { note } : {}), ...(betrayer ? { turns: true } : {}) };
  });
  const brief = jobSiteBrief(
    { frame, mission: labels.mission, destination: labels.destination, complications: labels.complications, ...(labels.twist ? { plotTwist: labels.twist } : {}), difficulty: effective, pcCount: cast.pcCount, npcs: briefNpcs },
    createRng(briefSeed),
  );
  brief.summary.unshift(`${difficultyLine(difficulty, effective, betrayers.length)}.`);
  if (arcs && pa) {
    arcHeat(part, arcs, `offers/${key}`, brief, pa);
    arcPayoffs(part, arcs, `offers/${key}`, brief, pa);
  }

  const out: PostingData = {
    index,
    key: `offers/${key}`,
    book,
    frame,
    difficulty,
    effectiveDifficulty: effective,
    betrayers,
    title,
    pitch,
    pay: `${money(payment)}, ${terms}`,
    poster,
    deadline,
    requirements,
    risk,
    intent,
    npcs,
    brief,
    employerName,
    destText: destShort,
  };
  if (existing) out.existingEmployer = existing.id;
  if (pa) {
    out.arc = pa;
    out.seed = seed;
  }
  return out;
}

// ---------------------------------------------------------------------------
// the offer
// ---------------------------------------------------------------------------

/** "Difficulty 3 (plays as 2: one betrayer)". */
export function difficultyLine(rolled: number, effective: number, betrayers: number): string {
  if (effective === rolled) return `Difficulty ${rolled}`;
  const n = betrayers === 1 ? "one betrayer" : `${betrayers === 2 ? "two" : betrayers === 3 ? "three" : betrayers} betrayers`;
  return `Difficulty ${rolled} (plays as ${effective}: ${n})`;
}

/** The posting as the players read it (Markdown). Never names the client when the poster keeps it confidential, nor anything GM-only. */
export function playerText(p: PostingData): string {
  const contact = p.npcs[0];
  const lines = [
    `## ${p.title}`,
    "",
    p.pitch,
    "",
    `- **Pay:** ${p.pay}`,
    `- **Posted by:** ${p.poster.postedBy}, ${p.poster.where}`,
    `- **Client:** ${p.poster.clientShown ? p.employerName : "confidential"}`,
    `- **Deadline:** ${p.deadline}`,
    `- **Requirements:** ${p.requirements.join("; ")}`,
    `- **Risk rating:** ${p.risk.label}`,
  ];
  if (contact) lines.push(`- **Contact:** ${contact.name}`);
  return lines.join("\n");
}

function gmText(p: PostingData): string {
  const r = p.book.results;
  const f = p.book.job.fields;
  const out = [
    `- **${difficultyLine(p.difficulty, p.effectiveDifficulty, p.betrayers.length)}** · distance ${num(r.distance)} · ${money(num(f.payment))} (p. 244)`,
    `- **Employer:** ${p.employerName}${p.poster.clientShown ? "" : " (the posting keeps the client confidential)"}. ${p.intent}`,
    `- **Job:** ${str(f.cargo, str(f.mission))} · ${str(f.destination)}`,
    `- **Complications:** ${(Array.isArray(f.complications) ? f.complications : []).join("; ") || "none"}`,
    ...(f.plotTwist ? [`- **Plot twist:** ${str(f.plotTwist)}`] : []),
    `- **Risk rating:** ${p.risk.label} (${p.risk.honesty})`,
    "",
    "**NPCs**",
    ...p.npcs.map((n) => {
      const preset = npcPresets.find((x) => x.id === n.preset)?.name ?? n.preset;
      const flags = [isBetrayer(n.agenda) ? "BETRAYER" : "", n.agenda.synthetic ? "hidden synthetic" : ""].filter(Boolean).join(", ");
      return `- ${n.name} (${roleRow(n.role).label}, ${preset})${flags ? ` **${flags}**` : ""}: wants ${lowerFirst(n.want)}. Secret: ${n.secret}. ${n.agenda.name}: ${n.agenda.summary}${n.agenda.turn ? ` Turns: ${n.agenda.turn}` : ""}`;
    }),
    "",
    "**Site brief**",
    ...p.brief.summary.map((s) => `- ${s}`),
  ];
  const a = p.arc;
  if (a && hasArc(a)) {
    out.push("", "**Arcs**", `- **Influenced by:** ${a.influences.length ? a.influences.join("; ") : "nothing this time (heat, clocks and contacts were weighed)"}`);
    for (const n of a.notes) out.push(`- **Complication:** ${n}`);
    if (a.cargo) out.push(`- **Cargo:** ${a.cargo}`);
    if (a.clue) out.push(`- **Clue for “${a.clue.threadTitle}”** (${a.clue.slotLabel}): ${a.clue.text}${a.clue.knownBy?.length ? ` Also known to ${a.clue.knownBy.join(", ")}: a way to find it.` : ""}`);
  }
  return out.join("\n");
}

/** Whether the arcs left a mark on the posting (anything weighed, added or seeded). */
function hasArc(a: PostingArc): boolean {
  return a.parts.length > 0 || a.influences.length > 0 || a.links.length > 0 || a.notes.length > 0 || !!a.clue || !!a.cargo;
}
const lowerFirst = (s: string) => (s ? s.charAt(0).toLowerCase() + s.slice(1) : s);

function npcEntity(p: PostingData, n: PostingData["npcs"][number], k: number): ProducedEntity {
  const human = npcPresets.find((x) => x.id === n.preset) ?? npcPresets[0]!;
  const row = roleRow(n.role);
  const synthetic = n.agenda.synthetic;
  const preset = synthetic ? (npcPresets.find((x) => x.id === (synthetic.turns ? "alien.npc.android-covert" : "alien.npc.android-curious")) ?? human) : human;
  const publicRole = fillWith({ employer: p.poster.clientShown ? p.employerName : "the client", dest: p.destText })(row.publicRole);
  // the covert preset's own cover is replaced below by the human preset's (the synthetic passes as that person)
  const { secretAndroid: _secret, coverAttributes: _cover, ...presetFields } = JSON.parse(JSON.stringify(preset.fields)) as Obj;
  const fields: Obj = {
    ...presetFields,
    isPC: false,
    role: publicRole,
    goal: n.want,
    secret: n.secret,
    background: `Tie to the job: ${n.tie}`,
    personalAgenda: agendaText(n.agenda),
  };
  if (synthetic) {
    const a = human.fields.attributes as Record<string, number>;
    fields.android = true;
    fields.secretAndroid = true;
    fields.coverAttributes = Object.fromEntries(Object.entries(a).map(([k2, v]) => [k2, Math.min(5, v)]));
    fields.secretOrders = synthetic.directive;
    fields.fairClues = synthetic.clues;
  }
  const visible = k === 0;
  const e: ProducedEntity = {
    tempId: `npc-${k + 1}`,
    type: "alien.character",
    name: n.name,
    summary: publicRole,
    tags: ["npc", "job-npc"],
    fields,
    preset: preset.id,
    visibility: visible ? "players" : "gm",
    // the tie, the agenda and a secret synthetic's true make stay GM-only even on the contact
    fieldVisibility: { background: "gm", personalAgenda: "gm", ...(synthetic ? { android: "gm", attributes: "gm", talents: "gm", skills: "gm" } : {}) },
  };
  return e;
}

export function postingOffer(p: PostingData): Offer {
  const book = p.book;
  const jobFields: Obj = {
    ...book.job.fields,
    posting: { title: p.title, pitch: p.pitch, pay: p.pay, postedBy: p.poster.postedBy, where: p.poster.where, deadline: p.deadline, requirements: p.requirements, risk: p.risk.label },
    effectiveDifficulty: p.effectiveDifficulty,
    betrayers: p.betrayers,
    employerIntent: p.intent,
    siteBrief: JSON.parse(JSON.stringify(p.brief)),
  };
  const arc = p.arc && hasArc(p.arc) ? p.arc : undefined;
  if (arc) {
    // a sponsor posting names the sponsor as the employer
    if (p.existingEmployer && p.employerName !== jobFields.employer) jobFields.employer = p.employerName;
    jobFields.arc = {
      influences: [...arc.influences],
      ...(arc.notes.length ? { complications: [...arc.notes] } : {}),
      ...(arc.cargo ? { cargo: arc.cargo } : {}),
      ...(arc.clue ? { clue: { thread: arc.clue.threadTitle, where: arc.clue.slotLabel, text: arc.clue.text } } : {}),
    };
  }
  const job: ProducedEntity = {
    tempId: "job",
    type: "alien.job",
    name: p.title,
    // the players know the posting, not the difficulty: the summary is the posting's
    summary: `${money(num(book.job.fields.payment))} · ${p.risk.label} · ${p.deadline}`,
    tags: [...(book.job.tags ?? []), "job-board"],
    fields: jobFields,
    visibility: "players",
    fieldVisibility: { difficulty: "gm", ...(p.poster.clientShown ? {} : { employer: "gm" }), ...(arc ? { arc: "gm" } : {}) },
  };
  const entities: ProducedEntity[] = [job];
  const relationships: ProducedRelationship[] = [];
  const employerRef = p.existingEmployer ?? "employer";
  const employerVisibility = p.poster.clientShown ? "players" : "gm";
  if (!p.existingEmployer && book.employer) entities.push({ ...book.employer, visibility: employerVisibility });
  if (book.relationship) relationships.push({ ...book.relationship, from: employerRef, visibility: employerVisibility });
  p.npcs.forEach((n, k) => {
    // a contact already in the campaign is linked, not created again
    const ref = n.existing ?? `npc-${k + 1}`;
    if (!n.existing) entities.push(npcEntity(p, n, k));
    relationships.push({ type: "involved_in", from: ref, to: "job", note: roleRow(n.role).label, visibility: k === 0 ? "players" : "gm" });
    if (!n.existing && (k === 0 || n.role === "liaison")) relationships.push({ type: "member_of", from: ref, to: employerRef, visibility: k === 0 && p.poster.clientShown ? "players" : "gm" });
  });

  const key = p.key;
  const slots: OfferSlot[] = [
    { key: `${key}/title`, label: "Title", text: p.title },
    { key: `${key}/pitch`, label: "Pitch", text: p.pitch },
    { key: `${key}/poster`, label: "Posted by", text: `${p.poster.postedBy}, ${p.poster.where}${p.poster.clientShown ? "" : " (client confidential)"}` },
    { key: `${key}/pay`, label: "Pay terms", text: p.pay },
    { key: `${key}/deadline`, label: "Deadline", text: p.deadline },
    { key: `${key}/requirements`, label: "Requirements", text: p.requirements.join("; ") },
    { key: `${key}/risk`, label: "Risk rating", text: `${p.risk.label} (${p.risk.honesty})` },
    { key: `${key}/job`, label: "The job (book rolls)", text: `${str(book.job.fields.cargo, str(book.job.fields.mission))} · ${str(book.job.fields.destination)} · ${difficultyLine(p.difficulty, p.effectiveDifficulty, p.betrayers.length)}`, gmOnly: true },
    { key: `${key}/intent`, label: "Employer's intent", text: p.intent, gmOnly: true },
    ...p.npcs.flatMap((n, k): OfferSlot[] => [
      { key: `${key}/npc-${k + 1}`, label: `NPC ${k + 1}: ${roleRow(n.role).label}`, text: `${n.name} (${npcPresets.find((x) => x.id === n.preset)?.name ?? n.preset}): wants ${lowerFirst(n.want)}. Secret: ${n.secret}. ${n.tie}.`, gmOnly: k !== 0 },
      { key: `${key}/npc-${k + 1}/agenda`, label: `${n.name}: agenda`, text: `${n.agenda.name}${isBetrayer(n.agenda) ? " (betrayer)" : ""}${n.agenda.synthetic ? " (hidden synthetic)" : ""}: ${n.agenda.summary}`, gmOnly: true },
    ]),
    { key: `${key}/brief`, label: "Site brief", text: p.brief.summary.join(" "), gmOnly: true },
    ...(arc ? arc.parts.map((x): OfferSlot => ({ key: x.key, label: x.label, text: x.text, gmOnly: true })) : []),
    ...(arc?.clue ? [{ key: `offers/clue`, label: `Arcs: clue for “${arc.clue.threadTitle}”`, text: `${arc.clue.slotLabel}: ${arc.clue.text}`, gmOnly: true }] : []),
  ];
  const badges: NonNullable<Offer["badges"]> = [
    { label: money(num(book.job.fields.payment)) },
    { label: p.risk.label, tone: p.risk.level >= 3 ? "danger" : p.risk.level === 2 ? "warning" : "success" },
    { label: difficultyLine(p.difficulty, p.effectiveDifficulty, p.betrayers.length), tone: p.betrayers.length ? "danger" : "accent", gmOnly: true },
    { label: `${p.npcs.length} NPC${p.npcs.length === 1 ? "" : "s"}`, gmOnly: true },
    ...(arc?.clue ? [{ label: `Clue: ${arc.clue.threadTitle}`, tone: "accent" as const, gmOnly: true }] : []),
    ...(arc && arc.influences.length ? [{ label: "Influenced by arcs", tone: "warning" as const, gmOnly: true }] : []),
  ];
  const text = playerText(p);
  const offer: Offer = { key, title: p.title, badges, playerText: text, gmText: gmText(p), slots, produced: { entities, relationships }, handout: { title: `Posting: ${p.title}`, body: text, purpose: POSTING_HANDOUT_PURPOSE } };
  if (arc) {
    if (arc.links.length) offer.arcLinks = arc.links.map((l) => ({ ...l }));
    offer.influences = arc.influences.length ? [...arc.influences] : ["Nothing this time: heat, clocks and contacts were weighed."];
  }
  return offer;
}

/** The whole board: every posting's data, in order. Exposed for tests and the demo. */
export function dealBoard(ctx: ProcedureContext): PostingData[] {
  const cast = boardCast(ctx.inputs);
  const taken = new Set<string>(cast.takenNames);
  const n = Math.max(1, Math.min(6, Math.floor(num(ctx.inputs.postings, 3))));
  const arcs = boardArcs(ctx.inputs);
  const out: PostingData[] = [];
  for (let i = 1; i <= n; i++) out.push(buildPosting(ctx, i, cast, taken, arcs));
  if (arcs) seedBoardClue(ctx, out, arcs);
  return out;
}

/**
 * Seed the GM's clue (or, "auto", the first unseen clue of the most
 * advanced thread) into one posting's material: the employer's real
 * intent, an NPC's secret or agenda, a cargo detail, a complication note, a
 * key room of the site brief, or a contact who knows it. The placement is
 * a board-level part ("offers/clue") seeded from every posting's seed: a
 * pinned clue stays where it is when its posting is re-rolled, an unpinned
 * one moves.
 */
function seedBoardClue(ctx: ProcedureContext, board: PostingData[], arcs: BoardArcs): void {
  const chosen = chooseClue(arcs.snap);
  if (!chosen) return;
  const { thread, clue } = chosen;
  const knownBy = arcs.snap.contacts.filter((c) => c.knows.some((k) => k.thread === thread.id && k.clue === clue.id));
  const knownIds = knownBy.map((c) => c.id);
  const hosts: ClueHost[] = board.map((p) => ({
    index: p.index,
    frame: p.frame,
    intent: p.intent,
    npcs: p.npcs.map((n, k) => ({ key: `npc-${k + 1}`, name: n.name, secret: n.secret, betrayer: isBetrayer(n.agenda) || !!n.agenda.synthetic, ...(n.existing ? { existing: n.existing } : {}) })),
    complications: (Array.isArray(p.book.job.fields.complications) ? p.book.job.fields.complications : []).filter((c): c is string => typeof c === "string"),
    keyRooms: p.brief.inputs.key_rooms.map((r) => r.name),
    ...(p.npcs[0]?.existing ? { contact: p.npcs[0].existing } : {}),
  }));
  const initial = placeClue(clueRng(board.map((p) => p.seed ?? "")), hosts, clue.kind, knownIds);
  if (!initial) return;
  let placed: CluePlacement = ctx.part("clue", (r) => placeClue(r, hosts, clue.kind, knownIds) ?? initial, { initial });
  if (!placementFits(placed, hosts, knownIds)) placed = initial;
  const p = board.find((x) => x.index === placed.posting);
  if (!p) return;
  const pa = (p.arc ??= emptyPostingArc());
  let text = clue.text;
  let entity: string | undefined;
  switch (placed.slot) {
    case "intent":
      p.intent = `${p.intent} What it hides: ${clue.text}.`;
      text = `The employer's real intent hides it: ${clue.text}.`;
      break;
    case "npc-secret": {
      const n = p.npcs[placed.at]!;
      n.secret = `${n.secret}. Also knows: ${clue.text}`;
      entity = `npc-${placed.at + 1}`;
      text = `${n.name} knows it: ${clue.text}.`;
      break;
    }
    case "npc-agenda": {
      const n = p.npcs[placed.at]!;
      n.agenda = { ...n.agenda, summary: `${n.agenda.summary} Carries a lead the crew can take from them: ${clue.text}.` };
      entity = `npc-${placed.at + 1}`;
      text = `${n.name}'s agenda carries it: ${clue.text}.`;
      break;
    }
    case "cargo":
      pa.cargo = `Among the cargo: ${clue.text}.`;
      text = pa.cargo;
      break;
    case "complication":
      pa.notes.push(`On the job: ${clue.text}.`);
      text = `A complication brings it up: ${clue.text}.`;
      break;
    case "key-room": {
      const room = p.brief.inputs.key_rooms[placed.at]!;
      room.description = `${room.description} Clue: ${clue.text}.`;
      p.brief.summary.push(`Clue in the ${room.name.toLowerCase()}: ${clue.text}.`);
      text = `In the ${room.name.toLowerCase()} of the site: ${clue.text}.`;
      break;
    }
    case "contact": {
      const n = p.npcs[0]!;
      entity = n.existing;
      text = `${n.name}, who brings the job, knows it: ${clue.text}.`;
      break;
    }
  }
  const slotLabel = slotLabelOf(placed.slot);
  pa.clue = { thread: thread.id, threadTitle: thread.title, clue: clue.id, slot: placed.slot, slotLabel, text, ...(entity ? { entity } : {}), ...(knownBy.length ? { knownBy: knownBy.map((c) => c.name) } : {}) };
  pa.links.push({ kind: "clue", thread: thread.id, clue: clue.id, slot: placed.slot, slotLabel, text, ...(entity ? { entity } : {}) });
  pa.influences.push(`Seeds a clue of “${thread.title}” (${slotLabel.charAt(0).toLowerCase()}${slotLabel.slice(1)})`);
}

export const jobBoard: Procedure = {
  id: JOB_BOARD_ID,
  name: "Job board",
  description:
    "Deal a board of job postings between jobs: each a job from the Job Generator, as the players read it (title, pitch, pay, who posted it, deadline, requirements, a risk rating that may mislead) and as the GM knows it (complications, twist, the employer's real intent). Each comes with up to three NPCs, one per point of difficulty, with agendas that may betray the crew, and a site brief for the map generator.",
  page: [244, 252],
  original: true,
  mode: [CAMPAIGN],
  offers: { noun: "posting", accept: { label: "Take the job", fields: { status: "accepted" } }, keep: { label: "Keep as lead", fields: { status: "offered" } } },
  inputs: {
    type: "object",
    properties: {
      postings: { type: "integer", title: "Postings", minimum: 1, maximum: 6, default: 3 },
      frame: { type: "string", title: "Frame", ...labelledEnum(["space-truckers", "colonial-marines", "frontier-colonists"], FRAME_LABELS), default: "space-truckers" },
      employerBias: {
        type: "string",
        title: "Employer bias",
        ...labelledEnum(EMPLOYER_BIASES, { any: "Any employer" }),
        default: "any",
        description: "Prefer employers of this kind: the employer roll is repeated a few times until one fits (Colonial Marines take orders from the Corps).",
      },
      treachery: {
        type: "string",
        title: "NPC treachery",
        ...labelledEnum(TREACHERY_DIAL),
        default: "rare",
        description: "How often the job's NPCs betray the crew: none (no betrayal, no hidden synthetics), rare or common. The contact betrays less often.",
      },
      marineCorps: { type: "string", title: "Marine corps", ...labelledEnum(["uscmc", "space-operating-forces", "royal-marines-commandos"], { uscmc: "USCMC", "space-operating-forces": "Space Operating Forces", "royal-marines-commandos": "Royal Marines Commandos" }), description: "Colonial Marines only (p. 235)." },
      pcCount: { type: "integer", title: "PCs", minimum: 1, maximum: 8, default: 4, description: "Used only when the campaign has no PCs." },
      homeBase: { type: "object", title: "Home base", "x-entity": { types: ["alien.location"], setting: "homeBase" }, description: "Where the postings go up: the campaign's home base (Settings). Blank: a place tagged home-base, else the port." },
      campaign: {
        type: "object",
        title: "Campaign",
        "x-campaign": { kinds: ["character", "location", "faction"], fields: ["factionType"], relationships: ["within"] },
        description: "The PCs (for pay and crew size), the home base (where postings are found), factions (an employer already in the campaign is linked) and names already taken.",
      },
      arcs: {
        type: "object",
        title: "Campaign arcs",
        "x-arcs": {},
        description: "The arc board: a clue to seed into one posting, and (unless turned off) faction heat, thread clocks and contacts weighting the postings. Each posting says what influenced it.",
      },
    },
  },
  steps: [
    {
      id: "cast",
      title: "Crew, home base and factions",
      compute: (ctx) => boardCast(ctx.inputs),
      display: (_ctx, result) => {
        const c = result as BoardCast;
        return `${c.pcCount} PCs · postings at ${c.home} · ${c.factions.length} factions known`;
      },
    },
    {
      id: "offers",
      title: "Postings (each re-rolls or pins on its own)",
      reads: ["cast"],
      compute: (ctx): OfferSet => {
        const board = dealBoard(ctx);
        return {
          offers: board.map(postingOffer),
          note: `${board.length} posting${board.length === 1 ? "" : "s"}, each a Job Generator roll (p. 244-252). Players see the posting; the GM's side and every NPC but the contact stay hidden.`,
        };
      },
      display: (_ctx, result) =>
        (result as OfferSet).offers
          .map((o) => o.title)
          .join(" · "),
    },
  ],
  produce: () => ({ entities: [], relationships: [] }),
};
