/**
 * Campaign threads (campaign mode, module-original): the long stories that
 * tie jobs together. Each thread is a sponsor faction's scheme (a goal, a
 * method, a weakness and the cost of ignoring it), told in 3-5 stages from
 * the first hints to the endgame, each with 2-4 clues (a fact, an object, a
 * person or a place) and what learning them unlocks, plus a 6-8 segment
 * clock whose milestones say what the sponsor does next and suggest payoffs
 * for later job boards.
 *
 * The board deals 1-3 threads as offers, each from a different sponsor: a
 * faction already in the campaign (cited at its setting page when it is one
 * of the book's) or a minor corporation from the book's list (p. 162), added
 * GM-only on accept. Every part (sponsor, scheme, method, weakness, cost,
 * titles, the endgame's site, each stage, the clock) re-rolls or pins on its
 * own. Accepting a thread puts it on the arc board as a GM-only record; the
 * players only ever see its player-facing title and the clues they find
 * (crew notes). All text is original.
 */
import { labelledEnum } from "../entities/common";
import { createRng, pageRefText, type ArcDraft, type ArcSnapshot, type Offer, type OfferSet, type OfferSlot, type PageRef, type Procedure, type ProcedureContext, type ProducedEntity, type Rng } from "@campaign-forge/module-sdk";
import { factionPresets, minorFactionPresets } from "../data/factions";
import { locationPresets } from "../data/charted-space";
import { CAMPAIGN } from "../modes";
import { isObj, num, str } from "./helpers";
import {
  CLUES,
  COSTS,
  GM_TITLES,
  METHODS,
  MILESTONES,
  PAYOFFS,
  SCHEMES,
  SITES,
  STAGE_CLUE_TIER,
  STAGE_SUMMARIES,
  STAGE_TIERS,
  STAGE_TITLES,
  THREAD_CLUE_KINDS,
  WEAKNESSES,
  type StageTier,
  type ThreadClueKind,
} from "./campaign-thread-data";
import { CODENAMES, type FactionType } from "./job-board-data";

export const CAMPAIGN_THREAD_ID = "alien.campaign-thread";
export const SPONSOR_MODES = ["mixed", "campaign", "new"] as const;
export const STAGE_COUNTS = ["random", "3", "4", "5"] as const;

type Obj = Record<string, unknown>;

const pick = <T>(rng: Rng, list: readonly T[]): T => list[rng.int(0, list.length - 1)]!;
const pickIndex = (rng: Rng, n: number): number => rng.int(0, Math.max(0, n - 1));
const seedOf = (rng: Rng): string => Math.floor(rng.next() * 2 ** 32).toString(36).padStart(7, "0");
const lowerFirst = (s: string) => (s ? s.charAt(0).toLowerCase() + s.slice(1) : s);
const upperFirst = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);
/** Fill {key} placeholders; {Key} capitalises the value. */
function fill(text: string, vars: Record<string, string>): string {
  return text.replace(/\{(\w+)\}/g, (m, k: string) => {
    const lower = k.charAt(0).toLowerCase() + k.slice(1);
    const v = vars[lower];
    if (v === undefined) return m;
    return k.charAt(0) !== lower.charAt(0) ? upperFirst(v) : v;
  });
}

// ---------------------------------------------------------------------------
// the campaign as the generator sees it
// ---------------------------------------------------------------------------

export interface ThreadCast {
  factions: Array<{ id: string; name: string; factionType: FactionType; visibility?: string }>;
  home: string;
  /** Sponsors of threads already on the board (dealt last). */
  usedSponsors: string[];
}

export function threadCast(inputs: Obj): ThreadCast {
  const snap = isObj(inputs.campaign) ? inputs.campaign : {};
  const entities = (Array.isArray(snap.entities) ? snap.entities : []).filter(isObj);
  const tags = (e: Obj) => (Array.isArray(e.tags) ? e.tags.filter((t): t is string => typeof t === "string") : []);
  const locations = entities.filter((e) => e.kind === "location");
  const home = locations.find((e) => tags(e).includes("home-base") && e.subtype === "colony") ?? locations.find((e) => tags(e).includes("home-base"));
  const set = isObj(inputs.homeBase) ? str(inputs.homeBase.name) : "";
  const arcs = isObj(inputs.arcs) ? (inputs.arcs as unknown as ArcSnapshot) : undefined;
  const factions = entities
    .filter((e) => e.kind === "faction")
    .map((e) => {
      const f = isObj(e.fields) ? e.fields : {};
      const type = str(f.factionType, "other") as FactionType;
      return { id: str(e.id), name: str(e.name), factionType: type, ...(typeof e.visibility === "string" ? { visibility: e.visibility } : {}) };
    });
  return { factions, home: set || (home ? str(home.name) : "the port"), usedSponsors: (arcs?.threads ?? []).filter((t) => t.status !== "resolved").map((t) => t.sponsor).filter((x): x is string => !!x) };
}

/** The book page of a setting faction or place by name, when it is one of the book's. */
function bookPage(name: string, kind: "faction" | "place"): PageRef | undefined {
  const list = kind === "faction" ? factionPresets : locationPresets;
  return list.find((p) => p.name.toLowerCase() === name.toLowerCase())?.page;
}
const pageText = (p: PageRef) => pageRefText(p, "p.", "-");

// ---------------------------------------------------------------------------
// one thread
// ---------------------------------------------------------------------------

export interface ThreadSponsor {
  kind: "campaign" | "new";
  name: string;
  factionType: FactionType;
  /** Campaign faction id (kind campaign). */
  id?: string;
  /** Module preset (kind new): a minor corporation. */
  preset?: string;
}

interface StagePick {
  tier: StageTier;
  title: number;
  summary: number;
  clues: Array<{ kind: ThreadClueKind; template: number }>;
}

interface ClockPick {
  segments: number;
  milestones: Array<{ text: number; payoff: string; payoffText: number }>;
}

export interface ThreadData {
  index: number;
  key: string;
  sponsor: ThreadSponsor;
  scheme: (typeof SCHEMES)[number];
  method: (typeof METHODS)[number];
  weakness: string;
  cost: string;
  site: string;
  title: string;
  playerTitle: string;
  stages: Array<{ tier: StageTier; title: string; summary: string; clues: Array<{ kind: ThreadClueKind; text: string; playerText: string; unlocks: string }> }>;
  clock: { segments: number; milestones: Array<{ at: number; text: string; stage: number; payoffs: Array<{ kind: string; text: string }> }> };
  /** Setting pages for the book factions and places it names. */
  pages: Array<{ name: string; page: PageRef }>;
}

function chooseSponsor(rng: Rng, cast: ThreadCast, mode: string, used: Set<string>): ThreadSponsor {
  const fresh = cast.factions.filter((f) => !used.has(f.id) && !cast.usedSponsors.includes(f.id));
  const known = new Set(cast.factions.map((f) => f.name.toLowerCase()));
  const newOnes = minorFactionPresets.filter((p) => !known.has(p.name.toLowerCase()) && !used.has(p.id));
  const fromCampaign = (list: ThreadCast["factions"]): ThreadSponsor => {
    const f = pick(rng.fork("faction"), list);
    return { kind: "campaign", id: f.id, name: f.name, factionType: f.factionType };
  };
  const fromBook = (): ThreadSponsor => {
    const p = pick(rng.fork("preset"), newOnes.length ? newOnes : minorFactionPresets);
    return { kind: "new", preset: p.id, name: p.name, factionType: "corporation" };
  };
  if (mode === "new" || cast.factions.length === 0) return fromBook();
  if (mode === "campaign") return fromCampaign(fresh.length ? fresh : cast.factions.filter((f) => !used.has(f.id)).length ? cast.factions.filter((f) => !used.has(f.id)) : cast.factions);
  // mixed: a campaign faction nobody sponsors yet most of the time, else a new minor corporation
  if (fresh.length && (rng.next() < 0.75 || newOnes.length === 0)) return fromCampaign(fresh);
  return fromBook();
}

function stageTiers(rng: Rng, n: number): StageTier[] {
  const middle: StageTier[] = ["pattern", "middleman", "exposure"];
  const k = Math.max(1, Math.min(3, n - 2));
  const keep = new Set<StageTier>();
  const pool = [...middle];
  while (keep.size < k) keep.add(pool.splice(rng.int(0, pool.length - 1), 1)[0]!);
  return ["hints", ...middle.filter((m) => keep.has(m)), "endgame"];
}

function pickStage(rng: Rng, tier: StageTier, usedTemplates: Set<string>): StagePick {
  const count = tier === "endgame" ? rng.int(2, 3) : rng.int(2, 4);
  const kinds = THREAD_CLUE_KINDS.map((k) => k.id) as ThreadClueKind[];
  const order = [...kinds];
  const chosen: ThreadClueKind[] = [];
  while (chosen.length < count) {
    if (order.length === 0) order.push(...kinds);
    chosen.push(order.splice(rng.int(0, order.length - 1), 1)[0]!);
  }
  const ctier = STAGE_CLUE_TIER[tier];
  const clues = chosen.map((kind, i) => {
    const list = CLUES[kind][ctier];
    const free = list.map((_, j) => j).filter((j) => !usedTemplates.has(`${kind}/${ctier}/${j}`));
    const template = free.length ? free[rng.fork(`clue-${i}`).int(0, free.length - 1)]! : pickIndex(rng.fork(`clue-${i}`), list.length);
    usedTemplates.add(`${kind}/${ctier}/${template}`);
    return { kind, template };
  });
  return { tier, title: pickIndex(rng.fork("title"), STAGE_TITLES[tier].length), summary: pickIndex(rng.fork("summary"), STAGE_SUMMARIES[tier].length), clues };
}

function pickClock(rng: Rng, tiers: StageTier[]): ClockPick {
  const segments = rng.int(6, 8);
  const kinds = ["posting", "complication", "grudge", "threat"];
  const milestones = tiers.slice(1).map((tier, i) => {
    const payoff = tier === "endgame" ? "threat" : kinds[(i + rng.fork(`payoff-${i}`).int(0, kinds.length - 1)) % kinds.length]!;
    return { text: pickIndex(rng.fork(`text-${i}`), MILESTONES[tier].length), payoff, payoffText: pickIndex(rng.fork(`payoff-text-${i}`), PAYOFFS[payoff]!.length), endgame: tier === "endgame" };
  });
  // a payoff is never the same line twice on one clock: the endgame keeps its (always a threat), and an earlier
  // repeat takes its kind's next line, or the next kind's
  const used = new Set<string>();
  for (const m of [...milestones].sort((a, b) => Number(b.endgame) - Number(a.endgame))) {
    for (let t = 0; t < kinds.length * 8 && used.has(`${m.payoff}/${m.payoffText}`); t++) {
      const n = PAYOFFS[m.payoff]!.length;
      if (!m.endgame && t % n === n - 1) m.payoff = kinds[(kinds.indexOf(m.payoff) + 1) % kinds.length]!;
      m.payoffText = (m.payoffText + 1) % PAYOFFS[m.payoff]!.length;
    }
    used.add(`${m.payoff}/${m.payoffText}`);
  }
  return { segments, milestones: milestones.map(({ endgame: _e, ...m }) => m) };
}

/** Milestone positions: one per stage after the first, the last at the full clock. */
export function milestonePositions(segments: number, stages: number): number[] {
  const n = Math.max(1, stages - 1);
  return Array.from({ length: n }, (_, i) => Math.max(1, Math.min(segments, Math.round(((i + 1) * segments) / n))));
}

interface Used {
  sponsors: Set<string>;
  schemes: Set<string>;
  sites: Set<number>;
  /** Clue templates already on this board ("kind/tier/index"): each thread gets its own. */
  templates: Set<string>;
}

function buildThread(ctx: ProcedureContext, index: number, cast: ThreadCast, used: Used): ThreadData {
  const key = `thread-${index}`;
  const seed = ctx.part(key, (r) => seedOf(r));
  const local = (k: string) => createRng(seed).fork(k);
  const part = <T>(k: string, roll: (r: Rng) => T): T => ctx.part(`${key}/${k}`, roll, { initial: roll(local(k)) });
  const mode = (SPONSOR_MODES as readonly string[]).includes(str(ctx.inputs.sponsors)) ? str(ctx.inputs.sponsors) : "mixed";

  const sponsor = part("sponsor", (r) => chooseSponsor(r, cast, mode, used.sponsors));
  used.sponsors.add(sponsor.id ?? sponsor.preset ?? sponsor.name);
  const schemeId = part("scheme", (r) => {
    const rows = SCHEMES.filter((s) => !used.schemes.has(s.id)).map((s) => ({ s, w: !s.factions || s.factions.includes(sponsor.factionType) ? 3 : 1 }));
    const total = rows.reduce((n, x) => n + x.w, 0);
    let x = r.next() * total;
    for (const row of rows) {
      x -= row.w;
      if (x < 0) return row.s.id;
    }
    return rows[rows.length - 1]?.s.id ?? SCHEMES[0]!.id;
  });
  const scheme = SCHEMES.find((s) => s.id === schemeId) ?? SCHEMES[0]!;
  used.schemes.add(scheme.id);
  const method = METHODS[part("method", (r) => pickIndex(r, METHODS.length)) % METHODS.length]!;
  const weakness = WEAKNESSES[part("weakness", (r) => pickIndex(r, WEAKNESSES.length)) % WEAKNESSES.length]!;
  const costRaw = COSTS[part("cost", (r) => pickIndex(r, COSTS.length)) % COSTS.length]!;
  const siteIndex = part("site", (r) => {
    const free = SITES.map((_, i) => i).filter((i) => !used.sites.has(i));
    return free.length ? free[r.int(0, free.length - 1)]! : pickIndex(r, SITES.length);
  }) % SITES.length;
  used.sites.add(siteIndex);
  const siteRaw = SITES[siteIndex]!;
  const codename = CODENAMES[part("codename", (r) => pickIndex(r, CODENAMES.length)) % CODENAMES.length]!;
  const titleTemplate = GM_TITLES[part("title", (r) => pickIndex(r, GM_TITLES.length)) % GM_TITLES.length]!;
  const playerTitle = scheme.playerTitles[part("player-title", (r) => pickIndex(r, scheme.playerTitles.length)) % scheme.playerTitles.length]!;

  const vars: Record<string, string> = { sponsor: sponsor.name, subject: scheme.subject, item: scheme.item, front: method.front, agent: method.agent, theAgent: method.agent.replace(/^an? /, "the "), home: cast.home, codename, goalLower: lowerFirst(scheme.goal) };
  const site = fill(siteRaw, vars);
  vars.site = site;
  const title = fill(titleTemplate, vars);

  const requested = str(ctx.inputs.stages, "random");
  const shape = part("shape", (r) => {
    const n = requested === "random" ? r.int(3, 5) : Math.max(3, Math.min(5, Number(requested) || 4));
    return stageTiers(r.fork("tiers"), n);
  });
  const tiers = (Array.isArray(shape) ? shape : ["hints", "pattern", "endgame"]).filter((t): t is StageTier => (STAGE_TIERS as readonly string[]).includes(t));
  const usedTemplates = used.templates;
  const stages = tiers.map((tier, k) => {
    const pickd = part(`stage-${k + 1}`, (r) => pickStage(r, tier, new Set(usedTemplates)));
    // a pinned stage from another shape is re-dealt for this tier
    const p: StagePick = pickd.tier === tier ? pickd : pickStage(local(`stage-${k + 1}/alt`), tier, new Set(usedTemplates));
    for (const c of p.clues) usedTemplates.add(`${c.kind}/${STAGE_CLUE_TIER[tier]}/${c.template}`);
    const ctier = STAGE_CLUE_TIER[tier];
    return {
      tier,
      title: fill(STAGE_TITLES[tier][p.title % STAGE_TITLES[tier].length]!, vars),
      summary: fill(STAGE_SUMMARIES[tier][p.summary % STAGE_SUMMARIES[tier].length]!, vars),
      clues: p.clues.map((c) => {
        const t = CLUES[c.kind][ctier][c.template % CLUES[c.kind][ctier].length]!;
        return { kind: c.kind, text: fill(t.gm, vars), playerText: fill(t.player, vars), unlocks: fill(t.unlocks, vars) };
      }),
    };
  });
  const clockPick = part("clock", (r) => pickClock(r, tiers));
  const segments = Math.max(6, Math.min(8, num(clockPick.segments, 6)));
  const positions = milestonePositions(segments, tiers.length);
  const milestones = tiers.slice(1).map((tier, i) => {
    const m = clockPick.milestones[i] ?? { text: 0, payoff: "posting", payoffText: 0 };
    const payoffs = PAYOFFS[m.payoff] ?? PAYOFFS.posting!;
    return { at: positions[i]!, text: fill(MILESTONES[tier][m.text % MILESTONES[tier].length]!, vars), stage: i + 1, payoffs: [{ kind: m.payoff, text: fill(payoffs[m.payoffText % payoffs.length]!, vars) }] };
  });

  const pages: ThreadData["pages"] = [];
  const sponsorPage = sponsor.kind === "new" ? factionPresets.find((p) => p.id === sponsor.preset)?.page : bookPage(sponsor.name, "faction");
  if (sponsorPage !== undefined) pages.push({ name: sponsor.name, page: sponsorPage });
  const homePage = bookPage(cast.home, "place");
  if (homePage !== undefined && stages.some((s) => s.clues.some((c) => c.text.includes(cast.home)))) pages.push({ name: cast.home, page: homePage });

  return { index, key: `offers/${key}`, sponsor, scheme, method, weakness, cost: fill(costRaw, vars), site, title, playerTitle, stages, clock: { segments, milestones }, pages };
}

// ---------------------------------------------------------------------------
// the offer
// ---------------------------------------------------------------------------

/** The thread as a draft for the arc board. */
export function threadDraft(t: ThreadData): ArcDraft {
  const draft: ArcDraft = {
    title: t.title,
    playerTitle: t.playerTitle,
    sponsor: t.sponsor.kind === "campaign" && t.sponsor.id ? t.sponsor.id : "sponsor",
    goal: t.scheme.goal,
    method: t.method.method,
    weakness: t.weakness,
    cost: t.cost,
    stages: t.stages.map((s) => ({ title: s.title, summary: s.summary, clues: s.clues.map((c) => ({ kind: c.kind, text: c.text, playerText: c.playerText, unlocks: c.unlocks })) })),
    clock: { segments: t.clock.segments, milestones: t.clock.milestones.map((m) => ({ at: m.at, text: m.text, stage: m.stage, payoffs: m.payoffs })) },
  };
  if (t.pages[0]) draft.page = t.pages[0].page;
  return draft;
}

const KIND_LABEL: Record<string, string> = Object.fromEntries(THREAD_CLUE_KINDS.map((k) => [k.id, k.label]));

function gmText(t: ThreadData): string {
  const lines = [
    `- **Sponsor:** ${t.sponsor.name}${t.sponsor.kind === "new" ? " (new to the campaign, added GM-only)" : ""}`,
    `- **Goal:** ${t.scheme.goal}`,
    `- **Method:** ${t.method.method}`,
    `- **Weakness:** ${t.weakness}`,
    `- **If ignored:** ${t.cost}`,
    `- **Endgame at:** ${t.site}`,
    "",
    ...t.stages.flatMap((s, i) => [`**Stage ${i + 1}: ${s.title}.** ${s.summary}`, ...s.clues.map((c) => `- ${KIND_LABEL[c.kind] ?? c.kind}: ${c.text} (unlocks: ${lowerFirst(c.unlocks)})`), ""]),
    `**Clock (${t.clock.segments} segments)**`,
    ...t.clock.milestones.map((m) => `- ${m.at}/${t.clock.segments}: ${m.text}. Payoff: ${m.payoffs.map((p) => p.text).join("; ")}.`),
  ];
  if (t.pages.length) lines.push("", `Setting: ${t.pages.map((p) => `${p.name} (${pageText(p.page)})`).join(", ")}.`);
  return lines.join("\n");
}

export function threadOffer(t: ThreadData): Offer {
  const key = t.key;
  const entities: ProducedEntity[] = [];
  if (t.sponsor.kind === "new") {
    const preset = factionPresets.find((p) => p.id === t.sponsor.preset);
    if (preset) entities.push({ tempId: "sponsor", type: "alien.faction", name: preset.name, ...(preset.summary ? { summary: preset.summary } : {}), tags: [...(preset.tags ?? [])], fields: JSON.parse(JSON.stringify(preset.fields)), preset: preset.id, visibility: "gm" });
  }
  const slots: OfferSlot[] = [
    { key: `${key}/sponsor`, label: "Sponsor", text: t.sponsor.name, gmOnly: true },
    { key: `${key}/scheme`, label: "Goal", text: t.scheme.goal, gmOnly: true },
    { key: `${key}/method`, label: "Method", text: t.method.method, gmOnly: true },
    { key: `${key}/weakness`, label: "Weakness", text: t.weakness, gmOnly: true },
    { key: `${key}/cost`, label: "Cost of ignoring it", text: t.cost, gmOnly: true },
    { key: `${key}/site`, label: "Endgame site", text: t.site, gmOnly: true },
    { key: `${key}/title`, label: "GM title", text: t.title, gmOnly: true },
    { key: `${key}/player-title`, label: "Crew notes title", text: t.playerTitle },
    { key: `${key}/shape`, label: "Stages", text: t.stages.map((s) => s.title).join(" → "), gmOnly: true },
    ...t.stages.map((s, i): OfferSlot => ({ key: `${key}/stage-${i + 1}`, label: `Stage ${i + 1}: ${s.title}`, text: s.clues.map((c) => `${KIND_LABEL[c.kind] ?? c.kind}: ${c.text}`).join(" · "), gmOnly: true })),
    { key: `${key}/clock`, label: "Clock", text: `${t.clock.segments} segments: ${t.clock.milestones.map((m) => `${m.at} ${m.text}`).join("; ")}`, gmOnly: true },
  ];
  const clues = t.stages.reduce((n, s) => n + s.clues.length, 0);
  return {
    key,
    title: t.title,
    badges: [
      { label: t.sponsor.name, tone: "accent", gmOnly: true },
      ...(t.sponsor.kind === "new" ? [{ label: "New faction", tone: "warning" as const, gmOnly: true }] : []),
      { label: `${t.stages.length} stages · ${clues} clues`, gmOnly: true },
      { label: `Clock 0/${t.clock.segments}`, gmOnly: true },
    ],
    playerText: `Nothing yet: the players learn of it through the clues they find. Their crew notes will call it **${t.playerTitle}**.`,
    gmText: gmText(t),
    slots,
    produced: { entities, relationships: [] },
    arc: threadDraft(t),
  };
}

/** Every thread of the board, in order. Exposed for tests and the demo. */
export function dealThreads(ctx: ProcedureContext): ThreadData[] {
  const cast = threadCast(ctx.inputs);
  const n = Math.max(1, Math.min(3, Math.floor(num(ctx.inputs.threads, 2))));
  const used: Used = { sponsors: new Set(), schemes: new Set(), sites: new Set(), templates: new Set() };
  const out: ThreadData[] = [];
  for (let i = 1; i <= n; i++) out.push(buildThread(ctx, i, cast, used));
  return out;
}

export const campaignThread: Procedure = {
  id: CAMPAIGN_THREAD_ID,
  name: "Campaign threads",
  description:
    "Deal one to three campaign threads, each a faction's scheme told across jobs: a goal, a method, a weakness and the cost of ignoring it; three to five stages from the first hints to the endgame, each with clues (a fact, an object, a person, a place) and what they unlock; and a clock whose milestones say what the sponsor does next. Accepted threads go on the arc board, GM-only.",
  original: true,
  page: [162, 177],
  mode: [CAMPAIGN],
  offers: { noun: "thread", accept: { label: "Put on the arc board" } },
  inputs: {
    type: "object",
    properties: {
      threads: { type: "integer", title: "Threads", minimum: 1, maximum: 3, default: 2 },
      sponsors: { type: "string", title: "Sponsors", ...labelledEnum(SPONSOR_MODES, { mixed: "A mix", campaign: "The campaign's factions", new: "New corporations" }), default: "mixed", description: "Factions already in the campaign, minor corporations from the book's list (p. 162) added GM-only, or a mix. Each thread gets its own sponsor." },
      stages: { type: "string", title: "Stages", ...labelledEnum(STAGE_COUNTS, { random: "3 to 5 (random)", "3": "3", "4": "4", "5": "5" }), default: "random", description: "Stages per thread, from the first hints to the endgame." },
      homeBase: { type: "object", title: "Home base", "x-entity": { types: ["alien.location"], setting: "homeBase" }, description: "The crew's home base (Settings), which the clues mention. Blank: a place tagged home-base, else the port." },
      campaign: {
        type: "object",
        title: "Campaign",
        "x-campaign": { kinds: ["faction", "location"], fields: ["factionType"], relationships: [] },
        description: "The factions that can sponsor a thread and the home base the clues mention.",
      },
      arcs: { type: "object", title: "Arc board", "x-arcs": {}, description: "Threads already on the board: their sponsors are used last." },
    },
  },
  steps: [
    {
      id: "cast",
      title: "Factions and home base",
      compute: (ctx) => threadCast(ctx.inputs),
      display: (_ctx, result) => {
        const c = result as ThreadCast;
        return `${c.factions.length} factions · home base ${c.home}${c.usedSponsors.length ? ` · ${c.usedSponsors.length} already sponsoring a thread` : ""}`;
      },
    },
    {
      id: "offers",
      title: "Threads (each re-rolls or pins on its own)",
      reads: ["cast"],
      compute: (ctx): OfferSet => {
        const threads = dealThreads(ctx);
        return { offers: threads.map(threadOffer), note: `${threads.length} thread${threads.length === 1 ? "" : "s"}, each from its own sponsor. Accepted threads go on the arc board; the players see only the clues they find.` };
      },
      display: (_ctx, result) =>
        (result as OfferSet).offers
          .map((o) => o.title)
          .join(" · "),
    },
  ],
  produce: () => ({ entities: [], relationships: [] }),
};
