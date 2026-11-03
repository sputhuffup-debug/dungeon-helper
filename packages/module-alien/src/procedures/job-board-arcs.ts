/**
 * The job board and the campaign's arcs (module-original): what the board
 * reads from its `x-arcs` input (threads, faction heat, contacts) and how it
 * weights and dresses postings with it. Every decision is a seeded part of
 * its posting (or of the board, for the clue), so it re-rolls or pins like
 * the rest; nothing here runs when the board has no arcs or the GM turns
 * the influence off and seeds no clue, so such a board is the board as it
 * was before arcs.
 *
 * Weights (per posting, module decisions):
 * - a thread makes its sponsor the employer: 7% per filled clock segment
 *   (at most 50%), 60% while its clock holds an unused "posting" payoff;
 * - a contact posts the job: 8% per point of weight (at most 50%), weight
 *   friendly 3, neutral 2, wary 1, plus the favours either way and 1 when
 *   they know a clue the crew has not found; hostile contacts and betrayers
 *   never post;
 * - a contact with a grudge (a betrayer who lived, a hostile contact, a
 *   pending "grudge" payoff) comes back as a rival NPC: 10% per point of
 *   weight (at most 40%), weight 2 for a betrayer plus one per grudge;
 * - faction heat 2 or more adds that faction's complication (10% per heat
 *   level); from heat 3 its people replace the site's rogue humans, from
 *   heat 5 they come even when the site had none;
 * - a pending "threat" or "complication" payoff lands on half the postings;
 * - a betrayer or hidden synthetic works for a thread 50% of the time, 5%
 *   more per filled segment of the most advanced thread (at most 90%).
 */
import { createRng, type ArcSnapshot, type ArcSnapshotThread, type OfferArcLink, type Rng } from "@campaign-forge/module-sdk";
import type { JobSiteBrief } from "../maps/jobBrief";
import { HOSTILE_GROUPS } from "../maps/hostiles";
import { ARC_SLOTS, type ArcSlotId } from "./campaign-thread-data";
import { isObj, str } from "./helpers";
import type { FactionType } from "./job-board-data";

type Contact = ArcSnapshot["contacts"][number];
type Part = <T>(k: string, roll: (r: Rng) => T) => T;

/** What one posting took from the arcs. */
export interface PostingArc {
  /** "Influenced by" lines (GM-only). */
  influences: string[];
  links: OfferArcLink[];
  /** GM-only complication notes the arcs add. */
  notes: string[];
  /** The parts the arcs drew for this posting (re-roll or pin them like any slot). */
  parts: Array<{ key: string; label: string; text: string }>;
  /** The seeded clue, when the board placed it here. */
  clue?: { thread: string; threadTitle: string; clue: string; slot: ArcSlotId; slotLabel: string; text: string; entity?: string; knownBy?: string[] };
  /** A cargo detail the clue added. */
  cargo?: string;
}

/** The arcs as the board reads them. */
export interface BoardArcs {
  snap: ArcSnapshot;
  /** Heat, clocks and contacts weight the postings. */
  influence: boolean;
  factionTypes: Record<string, FactionType>;
  used: { sponsors: Set<string>; contacts: Set<string>; payoffs: Set<string> };
}

const SLOT_LABEL: Record<string, string> = Object.fromEntries(ARC_SLOTS.map((s) => [s.id, s.label]));
const lowerFirst = (s: string) => (s ? s.charAt(0).toLowerCase() + s.slice(1) : s);

/** The board's arcs, or undefined when there is nothing to weight and no clue to seed. */
export function boardArcs(inputs: Record<string, unknown>): BoardArcs | undefined {
  const raw = inputs.arcs;
  if (!isObj(raw) || !Array.isArray(raw.threads)) return undefined;
  const snap = raw as unknown as ArcSnapshot;
  const influence = snap.influence !== false && (snap.threads.some((t) => t.status === "active") || (snap.heat ?? []).length > 0 || (snap.contacts ?? []).length > 0);
  const seeds = !!snap.seedClue && snap.seedClue !== "none" && snap.threads.length > 0;
  if (!influence && !seeds) return undefined;
  const factionTypes: Record<string, FactionType> = {};
  const campaign = isObj(inputs.campaign) ? inputs.campaign : {};
  for (const e of (Array.isArray(campaign.entities) ? campaign.entities : []).filter(isObj)) {
    const t = isObj(e.fields) ? str(e.fields.factionType) : "";
    if (e.kind === "faction" && t) factionTypes[str(e.id)] = t as FactionType;
  }
  for (const h of snap.heat ?? []) if (typeof h.fields?.factionType === "string") factionTypes[h.id] = h.fields.factionType as FactionType;
  return { snap: { ...snap, heat: snap.heat ?? [], contacts: snap.contacts ?? [] }, influence, factionTypes, used: { sponsors: new Set(), contacts: new Set(), payoffs: new Set() } };
}

export function emptyPostingArc(): PostingArc {
  return { influences: [], links: [], notes: [], parts: [] };
}

const activeThreads = (a: BoardArcs) => a.snap.threads.filter((t) => t.status === "active");
const clock = (t: Pick<ArcSnapshotThread, "filled" | "segments">) => `${t.filled}/${t.segments}`;
const payoffKey = (t: ArcSnapshotThread, p: { milestone: number; kind: string }) => `${t.id}/${p.milestone}/${p.kind}`;
const pendingPayoff = (a: BoardArcs, t: ArcSnapshotThread, kind: string) => t.payoffs.find((p) => p.kind === kind && !a.used.payoffs.has(payoffKey(t, p)));

/** Pick one of `items` by chance: each has its own chance; the first whose share the roll falls in wins. */
function byChance<T>(r: number, items: Array<{ item: T; chance: number }>): T | undefined {
  let acc = 0;
  for (const x of items) {
    acc += Math.max(0, x.chance);
    if (r < Math.min(0.9, acc)) return x.item;
  }
  return undefined;
}
function byWeight<T>(rng: Rng, items: Array<{ item: T; w: number }>): T | undefined {
  const total = items.reduce((n, x) => n + Math.max(0, x.w), 0);
  if (total <= 0) return undefined;
  let r = rng.next() * total;
  for (const x of items) {
    r -= Math.max(0, x.w);
    if (r < 0) return x.item;
  }
  return items[items.length - 1]?.item;
}

// ---------------------------------------------------------------------------
// the employer: a thread's sponsor
// ---------------------------------------------------------------------------

export interface SponsorPosting {
  thread: string;
  id: string;
  name: string;
  factionType: FactionType;
}

/** A thread whose sponsor posts this job, when the dice say so. */
export function arcSponsor(part: Part, a: BoardArcs, key: string, pa: PostingArc): SponsorPosting | undefined {
  if (!a.influence) return undefined;
  const candidates = activeThreads(a)
    .filter((t) => t.sponsor && t.sponsorName && !a.used.sponsors.has(t.id))
    .map((t) => ({ item: t, chance: pendingPayoff(a, t, "posting") ? 0.6 : Math.min(0.5, 0.07 * t.filled + (t.ignored && t.filled > 0 ? 0.05 : 0)) }))
    .filter((x) => x.chance > 0);
  if (candidates.length === 0) return undefined;
  const picked = part("arc-sponsor", (r) => byChance(r.next(), candidates)?.id ?? "");
  const t = activeThreads(a).find((x) => x.id === picked && x.sponsor);
  pa.parts.push({ key: `${key}/arc-sponsor`, label: "Arcs: a thread's sponsor posts it", text: t ? `${t.sponsorName} (${t.title})` : "No" });
  if (!t) return undefined;
  a.used.sponsors.add(t.id);
  const payoff = pendingPayoff(a, t, "posting");
  if (payoff) {
    a.used.payoffs.add(payoffKey(t, payoff));
    pa.links.push({ kind: "payoff", thread: t.id, milestone: payoff.milestone, payoff: "posting" });
    pa.influences.push(`“${t.title}” reached a milestone (clock ${clock(t)}): ${payoff.text}`);
  } else pa.influences.push(`“${t.title}” is advancing (clock ${clock(t)}): ${t.sponsorName} posts the job`);
  return { thread: t.id, id: t.sponsor!, name: t.sponsorName!, factionType: a.factionTypes[t.sponsor!] ?? "corporation" };
}

/** The employer's intent when a thread's sponsor posts: the scheme behind it. */
export function sponsorIntent(intent: string, t: ArcSnapshotThread | undefined): string {
  return t ? `${intent} Behind it: the job moves “${t.title}” forward (${lowerFirst(t.goal)}).` : intent;
}

// ---------------------------------------------------------------------------
// contacts: a poster, a grudge
// ---------------------------------------------------------------------------

function posterWeight(a: BoardArcs, c: Contact): number {
  if (c.stance === "hostile" || c.betrayer || !c.visible) return 0;
  const base = c.stance === "friendly" ? 3 : c.stance === "neutral" ? 2 : 1;
  const knows = c.knows.some((k) => a.snap.threads.some((t) => t.id === k.thread && t.clues.some((x) => x.id === k.clue && x.state !== "found"))) ? 1 : 0;
  return base + c.owedByCrew + c.owedToCrew + knows;
}

/** A contact who posts the job (they become its contact NPC), when the dice say so. */
export function arcPoster(part: Part, a: BoardArcs, key: string, pa: PostingArc): Contact | undefined {
  if (!a.influence) return undefined;
  const items = a.snap.contacts.filter((c) => !a.used.contacts.has(c.id)).map((c) => ({ item: c, w: posterWeight(a, c) })).filter((x) => x.w > 0);
  if (items.length === 0) return undefined;
  const total = items.reduce((n, x) => n + x.w, 0);
  const chance = Math.min(0.5, 0.08 * total);
  const picked = part("arc-contact", (r) => (r.next() < chance ? (byWeight(r.fork("who"), items)?.id ?? "") : ""));
  const c = a.snap.contacts.find((x) => x.id === picked);
  pa.parts.push({ key: `${key}/arc-contact`, label: "Arcs: a contact posts it", text: c ? c.name : "No" });
  if (!c) return undefined;
  a.used.contacts.add(c.id);
  pa.links.push({ kind: "contact", entity: c.id });
  const favours = [c.owedToCrew ? `owes the crew ${c.owedToCrew}` : "", c.owedByCrew ? `is owed ${c.owedByCrew}` : ""].filter(Boolean).join(", ");
  pa.influences.push(`Contact ${c.name} (${c.stance}${favours ? `, ${favours}` : ""}) brings the job`);
  return c;
}

/** A contact with a grudge who comes back on this job as a rival NPC. */
export function arcGrudge(part: Part, a: BoardArcs, key: string, pa: PostingArc): { contact: Contact; grudge: string } | undefined {
  if (!a.influence) return undefined;
  const payoffThread = activeThreads(a).find((t) => pendingPayoff(a, t, "grudge"));
  const items = a.snap.contacts
    .filter((c) => !a.used.contacts.has(c.id))
    .map((c) => ({ item: c, w: (c.betrayer ? 2 : 0) + (c.stance === "hostile" ? 1 : 0) + c.grudges.length }))
    .filter((x) => x.w > 0);
  if (items.length === 0) return undefined;
  const total = items.reduce((n, x) => n + x.w, 0);
  const chance = payoffThread ? 0.5 : Math.min(0.4, 0.1 * total);
  const picked = part("arc-grudge", (r) => (r.next() < chance ? (byWeight(r.fork("who"), items)?.id ?? "") : ""));
  const c = a.snap.contacts.find((x) => x.id === picked);
  pa.parts.push({ key: `${key}/arc-grudge`, label: "Arcs: a grudge comes back", text: c ? c.name : "No" });
  if (!c) return undefined;
  a.used.contacts.add(c.id);
  pa.links.push({ kind: "contact", entity: c.id });
  const payoff = payoffThread ? pendingPayoff(a, payoffThread, "grudge") : undefined;
  if (payoffThread && payoff) {
    a.used.payoffs.add(payoffKey(payoffThread, payoff));
    pa.links.push({ kind: "payoff", thread: payoffThread.id, milestone: payoff.milestone, payoff: "grudge" });
  }
  const grudge = c.grudges[0] ?? (c.betrayer ? "The crew left them for dead on the last job they shared" : "They hold the crew responsible for what went wrong");
  pa.influences.push(`${c.name} returns with a grudge${payoffThread ? ` (“${payoffThread.title}”)` : ""}: ${grudge}`);
  return { contact: c, grudge };
}

// ---------------------------------------------------------------------------
// agents: a betrayer's why
// ---------------------------------------------------------------------------

/** A thread a betrayer or hidden synthetic works for, when the dice say so. */
export function arcAgent(part: Part, a: BoardArcs, key: string, npcKey: string, npcName: string, pa: PostingArc): { thread: ArcSnapshotThread; why: string } | undefined {
  if (!a.influence) return undefined;
  const threads = activeThreads(a);
  if (threads.length === 0) return undefined;
  const top = Math.max(...threads.map((t) => t.filled));
  const chance = Math.min(0.9, 0.5 + 0.05 * top);
  const picked = part(`${npcKey}/arc-why`, (r) => (r.next() < chance ? (byWeight(r.fork("thread"), threads.map((t) => ({ item: t, w: t.filled + 1 })))?.id ?? "") : ""));
  const t = threads.find((x) => x.id === picked);
  pa.parts.push({ key: `${key}/${npcKey}/arc-why`, label: `Arcs: ${npcName} works for a thread`, text: t ? t.title : "No" });
  if (!t) return undefined;
  const why = `works for ${t.sponsorName ?? "the people behind it"}, who want to ${lowerFirst(t.goal)} (“${t.title}”).`;
  pa.influences.push(`${npcName} works for “${t.title}”`);
  return { thread: t, why: why.charAt(0).toUpperCase() + why.slice(1) };
}

// ---------------------------------------------------------------------------
// heat and payoffs on the site
// ---------------------------------------------------------------------------

/** Which hostile group a faction of this type sends, by heat (module decision). */
export function hostileGroupFor(type: FactionType, heat: number): string {
  switch (type) {
    case "corporation":
      return heat >= 6 ? "company-cleaner" : "corporate-security";
    case "military":
    case "government":
      return heat >= 5 ? "mercenaries" : "corporate-security";
    case "colonial":
      return "desperate-colonists";
    default:
      return "mercenaries";
  }
}

const HEAT_COMPLICATIONS = [
  "{faction} has someone watching the crew's berth",
  "A {faction} inspector holds the cargo for a day of questions",
  "{faction} posts a rival crew to the same job",
  "Someone from {faction} has already been through the site",
  "{faction} pays the port to slow the crew's clearance",
  "A {faction} fixer offers the crew double to walk away",
];

/** Send a faction's people to the site: replace the brief's rogue humans with them, or add them when `add`. */
function sendHostiles(brief: JobSiteBrief, group: string, why: string, add: boolean): boolean {
  const g = HOSTILE_GROUPS.find((x) => x.id === group);
  if (!g) return false;
  const human = brief.inputs.hostiles.findIndex((h) => HOSTILE_GROUPS.find((x) => x.id === h.group)?.kind === "human");
  if (human >= 0) {
    brief.inputs.hostiles[human] = { ...brief.inputs.hostiles[human]!, group };
    brief.summary.push(`${why}: the site's rogue humans are ${g.name.toLowerCase()} now.`);
    return true;
  }
  if (!add) return false;
  brief.inputs.hostiles.push({ group, act: 2, count: g.tier === "greater" ? 1 : 2, posture: g.posture });
  brief.summary.push(`${why}: ${g.name.toLowerCase()} at the site.`);
  return true;
}

/** Faction heat on the job: a complication from the hottest faction, its people at the site. */
export function arcHeat(part: Part, a: BoardArcs, key: string, brief: JobSiteBrief, pa: PostingArc): void {
  if (!a.influence) return;
  const hot = a.snap.heat.filter((h) => h.heat >= 2);
  if (hot.length === 0) return;
  const chance = Math.min(0.6, 0.1 * Math.max(...hot.map((h) => h.heat)));
  const picked = part("arc-heat", (r) => (r.next() < chance ? { id: byWeight(r.fork("who"), hot.map((h) => ({ item: h, w: h.heat })))?.id ?? "", text: r.fork("text").int(0, HEAT_COMPLICATIONS.length - 1) } : { id: "", text: 0 }));
  const h = hot.find((x) => x.id === picked.id);
  pa.parts.push({ key: `${key}/arc-heat`, label: "Arcs: faction heat", text: h ? `${h.name} (${h.label})` : "No" });
  if (!h) return;
  const note = (HEAT_COMPLICATIONS[picked.text] ?? HEAT_COMPLICATIONS[0]!).replace(/\{faction\}/g, h.name);
  pa.notes.push(note);
  const type = a.factionTypes[h.id] ?? "other";
  const sent = h.heat >= 3 && sendHostiles(brief, hostileGroupFor(type, h.heat), `${h.name} is hunting the crew (heat ${h.heat})`, h.heat >= 5);
  pa.influences.push(`${h.name} heat ${h.heat} (${h.label}): ${note.startsWith(h.name) ? note : lowerFirst(note)}${sent ? "; their people are at the site" : ""}`);
}

/** Pending "threat" and "complication" payoffs that land on this posting. */
export function arcPayoffs(part: Part, a: BoardArcs, key: string, brief: JobSiteBrief, pa: PostingArc): void {
  if (!a.influence) return;
  for (const kind of ["threat", "complication"] as const) {
    const t = activeThreads(a).find((x) => pendingPayoff(a, x, kind));
    if (!t) continue;
    const p = pendingPayoff(a, t, kind)!;
    const lands = part(`arc-${kind}`, (r) => r.next() < 0.5);
    pa.parts.push({ key: `${key}/arc-${kind}`, label: `Arcs: ${kind === "threat" ? "a threat" : "a complication"} from “${t.title}”`, text: lands ? p.text : "No" });
    if (!lands) continue;
    a.used.payoffs.add(payoffKey(t, p));
    pa.links.push({ kind: "payoff", thread: t.id, milestone: p.milestone, payoff: kind });
    if (kind === "threat") {
      const type = (t.sponsor && a.factionTypes[t.sponsor]) || "corporation";
      sendHostiles(brief, hostileGroupFor(type, 4), `“${t.title}”`, true);
    } else pa.notes.push(p.text);
    pa.influences.push(`“${t.title}” (clock ${clock(t)}): ${p.text}`);
  }
}

// ---------------------------------------------------------------------------
// the seeded clue
// ---------------------------------------------------------------------------

/** The clue the GM asked for: a given one, or ("auto") the first unseen clue of the most advanced thread. */
export function chooseClue(snap: ArcSnapshot): { thread: ArcSnapshotThread; clue: ArcSnapshotThread["clues"][number] } | undefined {
  const pick = snap.seedClue;
  if (!pick || pick === "none") return undefined;
  if (pick !== "auto") {
    const [tid, cid] = pick.split("/");
    const thread = snap.threads.find((t) => t.id === tid);
    const clue = thread?.clues.find((c) => c.id === cid);
    return thread && clue && clue.state !== "found" ? { thread, clue } : undefined;
  }
  const ranked = snap.threads
    .filter((t) => t.status === "active" && t.clues.some((c) => c.state === "unseen"))
    .sort((x, y) => y.filled / Math.max(1, y.segments) - x.filled / Math.max(1, x.segments) || y.filled - x.filled);
  const thread = ranked[0];
  if (!thread) return undefined;
  const clue = [...thread.clues].filter((c) => c.state === "unseen").sort((x, y) => x.stage - y.stage)[0]!;
  return { thread, clue };
}

/** Slots each clue kind prefers (weights). */
const KIND_SLOTS: Record<string, Partial<Record<ArcSlotId, number>>> = {
  fact: { intent: 3, complication: 2, "npc-secret": 2, "key-room": 1, cargo: 1 },
  object: { cargo: 3, "key-room": 3, "npc-secret": 1, complication: 1 },
  person: { "npc-secret": 3, "npc-agenda": 3, intent: 1, complication: 1 },
  place: { "key-room": 3, complication: 2, intent: 1, "npc-secret": 1 },
};

/** What a board posting offers the clue: its slots and the NPCs that can carry it. */
export interface ClueHost {
  index: number;
  frame: string;
  intent: string;
  npcs: Array<{ key: string; name: string; secret: string; betrayer: boolean; existing?: string }>;
  complications: string[];
  keyRooms: string[];
  /** The contact NPC is an existing contact (their id). */
  contact?: string;
}

export interface CluePlacement {
  posting: number;
  slot: ArcSlotId;
  /** Index of the NPC or key room the clue sits with. */
  at: number;
}

function slotsOf(h: ClueHost, knownBy: string[]): Array<{ slot: ArcSlotId; at: number }> {
  const out: Array<{ slot: ArcSlotId; at: number }> = [{ slot: "intent", at: 0 }];
  h.npcs.forEach((n, i) => {
    if (n.existing) return;
    out.push({ slot: "npc-secret", at: i });
    if (n.betrayer) out.push({ slot: "npc-agenda", at: i });
  });
  if (h.frame === "space-truckers") out.push({ slot: "cargo", at: 0 });
  if (h.complications.length) out.push({ slot: "complication", at: 0 });
  h.keyRooms.forEach((_, i) => out.push({ slot: "key-room", at: i }));
  if (h.contact && knownBy.includes(h.contact)) out.push({ slot: "contact", at: 0 });
  return out;
}

/** Where the clue goes on the board: a posting and a slot, weighted by the clue's kind. */
export function placeClue(rng: Rng, hosts: ClueHost[], kind: string, knownBy: string[]): CluePlacement | undefined {
  const items = hosts.flatMap((h) => slotsOf(h, knownBy).map((s) => ({ item: { posting: h.index, slot: s.slot, at: s.at }, w: s.slot === "contact" ? 4 : (KIND_SLOTS[kind]?.[s.slot] ?? 1) })));
  return byWeight(rng, items);
}

/** Is a (pinned) placement still possible on this board? */
export function placementFits(p: CluePlacement | undefined, hosts: ClueHost[], knownBy: string[]): p is CluePlacement {
  if (!p) return false;
  const h = hosts.find((x) => x.index === p.posting);
  return !!h && slotsOf(h, knownBy).some((s) => s.slot === p.slot && s.at === p.at);
}

export const slotLabelOf = (slot: string): string => SLOT_LABEL[slot] ?? slot;

/** The board-level seed of the clue's placement: every posting's seed, so re-rolling a posting moves an unpinned clue. */
export function clueRng(postingSeeds: string[]): Rng {
  return createRng(`${postingSeeds.join("|")}/clue`);
}
