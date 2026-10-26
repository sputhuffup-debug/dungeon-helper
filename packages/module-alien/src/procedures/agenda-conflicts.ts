/**
 * The agenda generator's conflict check: how much the party's agendas pull
 * against each other. Per pair of characters it scores
 *
 *  - collisions: two objectives on the same target with opposed stances (one
 *    protects an NPC the other works against: 3; one takes the prize the other
 *    destroys: 3; one exposes what the other hides: 2; both want the prize
 *    for different masters: 2...), the strongest per target;
 *  - direct moves: an objective aimed at the other character (working against
 *    them 2, watching them or hiding something from them 1);
 *  - competing allegiances (+1), arcs that oppose each other (+1), rivals (+1),
 *    and buddies whose agendas collide (+1: the drama of it).
 *
 * The party's friction is the sum of the pair scores. A party passes when the
 * friction reaches the minimum, every character has at least one collision or
 * direct move with someone, and the caps hold (at most one Hidden Synthetic,
 * at most one Company plant).
 */
import type { AgendaArc, AllegianceId, Stance } from "./agenda-arcs";
import { COMPETING_ALLEGIANCES } from "./agenda-arcs";
import type { Target } from "./agenda-targets";

export interface AnalysedMember {
  id: string;
  name: string;
  arc: AgendaArc;
  allegiance: AllegianceId;
  acts: Array<{ target: Target; stance: Stance }>;
  buddies: string[];
  rivals: string[];
}

export interface PairResult {
  /** Member names. */
  a: string;
  b: string;
  aId: string;
  bId: string;
  score: number;
  reasons: string[];
  /** A collision on a shared target or a direct move between the two. */
  clash: boolean;
}

export interface Analysis {
  friction: number;
  minFriction: number;
  pairs: PairResult[];
  /** Member id -> whether they clash with anyone. */
  clashing: Record<string, boolean>;
  caps: { synthetic: number; plant: number };
  problems: Array<{ tone: "warning" | "danger"; text: string }>;
  ok: boolean;
}

const OPPOSED: Record<string, number> = {
  "harm|protect": 3,
  "destroy|take": 3,
  "destroy|protect": 3,
  "conceal|expose": 2,
  "deny|reach": 2,
  "expose|protect": 2,
  "conceal|harm": 2,
  "protect|take": 1,
  "expose|take": 1,
  "conceal|learn": 1,
};

const VERB: Record<Stance, string> = {
  protect: "protects it",
  harm: "works against it",
  take: "wants it",
  destroy: "wants it destroyed",
  expose: "exposes it",
  conceal: "hides it",
  reach: "must reach it",
  deny: "seals it off",
  learn: "digs into it",
};

function stanceScore(a: Stance, b: Stance, sameMaster: boolean): number {
  if (a === "take" && b === "take") return sameMaster ? 0 : 2;
  return OPPOSED[[a, b].sort().join("|")] ?? 0;
}

function competing(a: AllegianceId, b: AllegianceId): boolean {
  return COMPETING_ALLEGIANCES.some(([x, y]) => (x === a && y === b) || (x === b && y === a));
}

/** Whether a member counts against the Company-plant cap. */
export function isPlant(m: Pick<AnalysedMember, "arc" | "allegiance">): boolean {
  return m.arc.cap === "plant" || (m.arc.betrayal === 3 && m.allegiance === "company");
}

function pair(a: AnalysedMember, b: AnalysedMember): PairResult {
  const reasons: string[] = [];
  let score = 0;
  let clash = false;

  // collisions on shared targets: the strongest per target
  const best = new Map<string, { score: number; text: string }>();
  a.acts.forEach((x, i) =>
    b.acts.forEach((y, j) => {
      if (x.target.key !== y.target.key || x.target.kind === "crew") return;
      const s = stanceScore(x.stance, y.stance, a.allegiance === b.allegiance);
      if (s <= 0) return;
      const prev = best.get(x.target.key);
      if (!prev || s > prev.score) best.set(x.target.key, { score: s, text: `${x.target.name}: ${a.name} ${VERB[x.stance]} (Act ${i + 1}), ${b.name} ${VERB[y.stance]} (Act ${j + 1})` });
    }),
  );
  for (const c of best.values()) {
    score += c.score;
    if (c.score >= 2) clash = true;
    reasons.push(c.text);
  }

  // direct moves against the other character
  const direct = (from: AnalysedMember, to: AnalysedMember) => {
    let top = 0;
    let text = "";
    from.acts.forEach((x, i) => {
      if (x.target.key !== to.id) return;
      const s = x.stance === "harm" || x.stance === "expose" ? 2 : x.stance === "learn" || x.stance === "conceal" ? 1 : 0;
      if (s > top) {
        top = s;
        const verb = x.stance === "harm" ? "works against" : x.stance === "expose" ? "means to expose" : x.stance === "learn" ? "watches" : "hides something from";
        text = `${from.name} ${verb} ${to.name} (Act ${i + 1})`;
      }
    });
    if (top > 0) {
      score += top;
      if (top >= 2) clash = true;
      reasons.push(text);
    }
  };
  direct(a, b);
  direct(b, a);

  if (competing(a.allegiance, b.allegiance)) {
    score += 1;
    reasons.push("they answer to masters who pull against each other");
  }
  if (a.arc.opposes.includes(b.arc.id) || b.arc.opposes.includes(a.arc.id)) {
    score += 1;
    reasons.push(`${a.arc.name} and ${b.arc.name} work against each other`);
  }
  if (a.rivals.includes(b.id) || b.rivals.includes(a.id)) {
    score += 1;
    reasons.push("rivals");
  }
  if ((a.buddies.includes(b.id) || b.buddies.includes(a.id)) && clash) {
    score += 1;
    reasons.push("buddies whose agendas collide");
  }
  return { a: a.name, b: b.name, aId: a.id, bId: b.id, score, reasons, clash };
}

export function analyseParty(members: AnalysedMember[], minFriction: number): Analysis {
  const pairs: PairResult[] = [];
  const clashing: Record<string, boolean> = Object.fromEntries(members.map((m) => [m.id, false]));
  for (let i = 0; i < members.length; i++) {
    for (let j = i + 1; j < members.length; j++) {
      const p = pair(members[i]!, members[j]!);
      pairs.push(p);
      if (p.clash) {
        clashing[members[i]!.id] = true;
        clashing[members[j]!.id] = true;
      }
    }
  }
  pairs.sort((x, y) => y.score - x.score);
  const friction = pairs.reduce((n, p) => n + p.score, 0);
  const caps = { synthetic: members.filter((m) => m.arc.cap === "synthetic").length, plant: members.filter(isPlant).length };
  const problems: Analysis["problems"] = [];
  if (caps.synthetic > 1) problems.push({ tone: "danger", text: `${caps.synthetic} Hidden Synthetics in one party (at most one)` });
  if (caps.plant > 1) problems.push({ tone: "danger", text: `${caps.plant} Company plants in one party (at most one)` });
  if (members.length > 1) {
    for (const m of members) if (!clashing[m.id]) problems.push({ tone: "warning", text: `${m.name} has no conflict with anyone` });
    if (friction < minFriction) problems.push({ tone: "warning", text: `Too little friction: ${friction} (minimum ${minFriction})` });
  }
  return { friction, minFriction, pairs, clashing, caps, problems, ok: problems.length === 0 };
}

/** The member each one most needs to keep their agenda from: the strongest pair, then a rival. */
export function strongestPartner(analysis: Analysis, members: AnalysedMember[], id: string): string | undefined {
  const me = members.find((m) => m.id === id);
  if (!me) return undefined;
  let bestId: string | undefined;
  let bestScore = -1;
  for (const p of analysis.pairs) {
    const other = p.aId === id ? p.bId : p.bId === id ? p.aId : undefined;
    const o = other === undefined ? undefined : members.find((m) => m.id === other);
    if (!o) continue;
    const s = p.score + (me.rivals.includes(o.id) ? 0.5 : 0);
    if (s > bestScore) {
      bestScore = s;
      bestId = o.id;
    }
  }
  return bestId;
}
