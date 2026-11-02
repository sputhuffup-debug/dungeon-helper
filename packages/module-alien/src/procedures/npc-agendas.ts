/**
 * Agendas for a job's NPCs (module-original): who they really answer to,
 * what they want from the job, how they act on it and a beat or two for how
 * it plays out. Unlike the PCs' campaign agendas these may betray the crew:
 * a treachery dial weights the arcs by betrayal level, the contact betrays
 * less often, and a job holds at most one hidden synthetic.
 *
 * Arcs reuse the cinematic agenda generator's (agenda-arcs.ts: name,
 * summary, allegiances, motives, betrayal level, beats from its acts) where
 * they fit an NPC, plus a few NPC-only arcs (job-board-data.ts).
 *
 * A betrayer is an NPC whose arc is betrayal 3 (a sell-out), or a hidden
 * synthetic whose directive puts the crew second. Betrayal 2 arcs rub
 * against the crew (a hostage, a debtor) but do not turn on it, so they do
 * not count (module decision).
 */
import type { Rng } from "@campaign-forge/module-sdk";
import { arcById, type AgendaArc, type TargetKind } from "./agenda-arcs";
import {
  CONTACT_TREACHERY,
  NPC_ALLEGIANCE_TEXT,
  NPC_ARCS,
  NPC_MOTIVE_TEXT,
  SYNTHETIC_CLUES,
  SYNTHETIC_DIRECTIVES,
  TREACHERY_WEIGHTS,
  TURN_BUYERS,
  TURN_METHODS,
  type NpcArcRow,
  type TreacheryDial,
} from "./job-board-data";

export interface NpcAgenda {
  arc: string;
  name: string;
  summary: string;
  betrayal: 0 | 1 | 2 | 3;
  /** Who they really answer to (text). */
  answersTo: string;
  motive: string;
  /** What they want from this job. */
  wants: string;
  /** How it plays out, in order. */
  beats: string[];
  /** For a betrayer: how they turn on the crew. */
  turn?: string;
  /** A hidden synthetic: its directive, whether it turns on the crew, and fair clues. */
  synthetic?: { directive: string; turns: boolean; clues: string[] };
  /** Tied to a campaign thread: who they really work for, and what for (the arc board). */
  why?: string;
  /** A contact who comes back with a grudge. */
  grudge?: string;
}

export interface AgendaContext {
  dial: TreacheryDial;
  contact: boolean;
  /** An open android cannot be a hidden one. */
  openAndroid: boolean;
  role: string;
  /** No hidden synthetic: the job has one already. */
  noSynthetic: boolean;
  fill: (text: string) => string;
}

const pick = <T>(rng: Rng, list: readonly T[]): T => list[rng.int(0, list.length - 1)]!;

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

const TARGET_TEXT: Record<TargetKind, string> = {
  item: "{prize}",
  "item:records": "the site's records",
  place: "{dest}",
  "place:exit": "the way out",
  "place:comms": "the comms",
  npc: "{contact}",
  pc: "one of the crew",
  buddy: "one of the crew",
  rival: "the crew's leader",
  leader: "the crew's leader",
  threat: "whatever is loose at {dest}",
  faction: "{employer}",
};

const WANTS_BY_TARGET: Partial<Record<TargetKind, string>> = {
  item: "{prize}",
  "item:records": "the site's records",
  "place:exit": "a guaranteed way out",
  pc: "the upper hand over the crew",
  leader: "the crew's leader out of the way",
  rival: "the crew's leader out of the way",
  npc: "{contact} dealt with",
  threat: "whatever is loose at {dest}, alive",
};

const sentence = (s: string) => (/[.!?]$/.test(s) ? s : `${s}.`);

interface ResolvedArc {
  id: string;
  name: string;
  summary: string;
  betrayal: 0 | 1 | 2 | 3;
  allegiances: string[];
  motives: string[];
  wants: string;
  beats: string[];
  synthetic: boolean;
  roles: string[];
}

function resolve(row: NpcArcRow): ResolvedArc {
  const base: AgendaArc | undefined = row.reuse ? arcById(row.reuse) : undefined;
  const beats = row.beats ?? (base ? [base.acts[1], base.acts[2]].map((a) => sentence(a.objectives[0].replace(/\{target\}/g, TARGET_TEXT[a.target]))) : []);
  return {
    id: row.id,
    name: row.name ?? base?.name ?? row.id,
    summary: row.summary ?? base?.summary ?? "",
    betrayal: row.betrayal ?? base?.betrayal ?? 0,
    allegiances: row.allegiances ?? base?.allegiances ?? ["self"],
    motives: row.motives ?? base?.motives ?? ["survival"],
    wants: row.wants?.[0] ?? (base ? (WANTS_BY_TARGET[base.acts[2].target] ?? "what {dest} holds") : "what {dest} holds"),
    beats,
    synthetic: base?.cap === "synthetic",
    roles: row.roles ?? [],
  };
}

export const RESOLVED_NPC_ARCS: ResolvedArc[] = NPC_ARCS.map(resolve);

/** Weight of an arc for one NPC under the dial (0 when it cannot be dealt). */
export function arcWeight(arc: ResolvedArc, c: Omit<AgendaContext, "fill">): number {
  const dial = TREACHERY_WEIGHTS[c.dial];
  let w: number;
  if (arc.synthetic) {
    if (c.noSynthetic || c.openAndroid) return 0;
    w = dial.synthetic * (c.contact ? CONTACT_TREACHERY.synthetic : 1);
  } else {
    w = dial.levels[arc.betrayal];
    if (c.contact && arc.betrayal === 3) w *= CONTACT_TREACHERY.level3;
    if (c.contact && arc.betrayal === 2) w *= CONTACT_TREACHERY.level2;
  }
  if (arc.roles.includes(c.role)) w *= 2;
  return w;
}

/** Deal one NPC's agenda. Deterministic for (rng, context). */
export function dealNpcAgenda(rng: Rng, c: AgendaContext): NpcAgenda {
  const arcs = RESOLVED_NPC_ARCS.map((arc) => ({ item: arc, w: arcWeight(arc, c) }));
  const arc = weighted(rng.fork("arc"), arcs) ?? RESOLVED_NPC_ARCS.find((a) => a.id === "honest-broker")!;
  const allegiance = pick(rng.fork("allegiance"), arc.allegiances);
  const motive = pick(rng.fork("motive"), arc.motives);
  const out: NpcAgenda = {
    arc: arc.id,
    name: arc.name,
    summary: c.fill(arc.summary),
    betrayal: arc.betrayal,
    answersTo: c.fill(NPC_ALLEGIANCE_TEXT[allegiance] ?? allegiance),
    motive: NPC_MOTIVE_TEXT[motive] ?? motive,
    wants: c.fill(arc.wants),
    beats: arc.beats.map(c.fill),
  };
  if (arc.betrayal === 3) {
    const method = pick(rng.fork("turn"), TURN_METHODS);
    out.turn = c.fill(method.text.replace("{buyer}", pick(rng.fork("buyer"), TURN_BUYERS)));
  }
  if (arc.synthetic) {
    const d = pick(rng.fork("directive"), SYNTHETIC_DIRECTIVES);
    const r = rng.fork("clues");
    const first = r.int(0, SYNTHETIC_CLUES.length - 1);
    const second = (first + 1 + r.int(0, SYNTHETIC_CLUES.length - 2)) % SYNTHETIC_CLUES.length;
    out.synthetic = { directive: c.fill(d.text), turns: d.turns, clues: [SYNTHETIC_CLUES[first]!, SYNTHETIC_CLUES[second]!] };
    if (d.turns) out.turn = c.fill(`Drops the act when the directive calls for it: ${d.text.charAt(0).toLowerCase()}${d.text.slice(1)}`);
  }
  return out;
}

/** True when the agenda turns on the crew: a betrayal 3 arc, or a hidden synthetic whose directive puts the crew second. */
export function isBetrayer(a: Pick<NpcAgenda, "betrayal" | "synthetic">): boolean {
  return a.betrayal === 3 || a.synthetic?.turns === true;
}

/** Module decision: the rolled difficulty less one per betrayer, at least 1. */
export function effectiveDifficulty(rolled: number, betrayers: number): number {
  return Math.max(1, rolled - Math.max(0, betrayers));
}

/** The agenda as one GM-only paragraph for the NPC's sheet. */
export function agendaText(a: NpcAgenda): string {
  const parts = [`${a.name}: ${a.summary}`, `Answers to ${a.answersTo}, out of ${a.motive}.`, `Wants from this job: ${a.wants}.`];
  if (a.beats.length) parts.push(`Beats: ${a.beats.map((b, i) => `(${i + 1}) ${b}`).join(" ")}`);
  if (a.synthetic) parts.push(`Hidden synthetic. Directive: ${a.synthetic.directive}`);
  if (a.turn) parts.push(`Turns on the crew: ${a.turn}`);
  if (a.why) parts.push(`Why: ${a.why}`);
  if (a.grudge) parts.push(`Returns with a grudge: ${a.grudge}`);
  return parts.join(" ");
}
