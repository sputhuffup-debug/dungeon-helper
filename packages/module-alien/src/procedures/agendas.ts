/**
 * Agenda drafts for cinematic play (module-original; no AI). Deals each PC a
 * three-act arc, fills its slots from the campaign, checks that the party's
 * agendas collide, and returns draft cards the GM revises before accepting
 * them into each character's per-act agendas.
 *
 * Steps, each seeded:
 *  1. cast: the party and the targets the campaign offers (PCs with buddy and
 *     rival links, the adventure's NPCs, places, site map rooms, key items,
 *     creatures, the corporation), with fallbacks from the tables.
 *  2. deal: an arc per PC, weighted by the betrayal dial, with at most one
 *     Hidden Synthetic and one Company plant; allegiances and targets drawn
 *     so agendas meet on the same targets. The conflict check runs on each
 *     deal; a deal that fails is re-dealt (seeded) up to the re-deal limit,
 *     keeping the best one if none passes.
 *  3. slots: every slot of every card as a part the GM can re-roll or pin on
 *     its own: allegiance and motive per PC; objective, target, who to keep
 *     it from and the catch per act.
 *  4. check: the conflict report on the final slots.
 *  5. agendaDrafts: the cards (DRAFT), each act with the hint for earning its
 *     Story Point: advance the agenda at personal risk or real cost (p. 158).
 *
 * Produces no entities: the app writes accepted drafts into the characters'
 * `agendas` (and the adventure's agenda handouts).
 */
import {
  rollTable,
  type AgendaDraftAct,
  type AgendaDraftCharacter,
  type AgendaDraftSet,
  type AgendaDraftSlot,
  type Procedure,
  type ProcedureContext,
  type Rng,
  type TableRow,
} from "@campaign-forge/module-sdk";
import { CINEMATIC } from "../modes";
import { AGENDA_ALLEGIANCE_TABLE_ID, AGENDA_CATCH_EARLY_TABLE_ID, AGENDA_CATCH_LATE_TABLE_ID, AGENDA_MOTIVE_TABLE_ID } from "../tables/agendas";
import { AGENDA_ARCS, ARC_IDS, BETRAYAL_DIAL, CAREER_FIT, DIAL_MIN_FRICTION, DIAL_WEIGHTS, arcById, type AgendaArc, type AllegianceId, type BetrayalDial, type MotiveId } from "./agenda-arcs";
import { analyseParty, isPlant, strongestPartner, type AnalysedMember, type Analysis } from "./agenda-conflicts";
import { buildCast, drawTarget, targetCandidates, weightedPick, type Cast, type PartyMember, type Target } from "./agenda-targets";
import { isObj, str } from "./helpers";

export const AGENDAS_ID = "alien.agendas";
/** The Story Point rule the hints follow (p. 158; Story Points p. 44). */
export const STORY_POINT_PAGE = 158;
export const DEFAULT_REDEALS = 20;
export const ACTS = [1, 2, 3] as const;

// ---------------------------------------------------------------------------
// results
// ---------------------------------------------------------------------------

export interface DealtMember {
  id: string;
  arc: string;
  allegiance: AllegianceId;
  /** One target per act. */
  targets: [Target, Target, Target];
  /** Per act, the crewmate to keep it from. */
  keep: string[];
}

export interface DealResult {
  members: DealtMember[];
  /** 1-based attempt that was kept. */
  attempt: number;
  passed: boolean;
  dial: BetrayalDial;
  minFriction: number;
  log: Array<{ attempt: number; ok: boolean; friction: number; problems: string[] }>;
  label: string;
}

export interface SlotsActResult {
  objective: number;
  target: Target;
  keep: string;
  catch: string;
}
export interface SlotsMember {
  id: string;
  arc: string;
  allegiance: AllegianceId;
  owner: string;
  internal: boolean;
  motive: MotiveId;
  why: string;
  acts: SlotsActResult[];
}

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const dialOf = (ctx: ProcedureContext): BetrayalDial => {
  const v = str(ctx.inputs.betrayal);
  return (BETRAYAL_DIAL as readonly string[]).includes(v) ? (v as BetrayalDial) : "frayed";
};
/**
 * The least friction the party needs: the GM's figure, or the dial's (set for
 * four PCs, six pairs) scaled to the number of pairs, at least one clash.
 */
export function minFrictionFor(dial: BetrayalDial, partySize: number, set?: unknown): number {
  if (typeof set === "number" && Number.isFinite(set) && set >= 0) return Math.floor(set);
  const pairs = (partySize * (partySize - 1)) / 2;
  return pairs === 0 ? 0 : Math.max(2, Math.round((DIAL_MIN_FRICTION[dial] * pairs) / 6));
}
const redealsOf = (ctx: ProcedureContext): number => {
  const v = ctx.inputs.redeals;
  return typeof v === "number" && Number.isFinite(v) ? Math.max(1, Math.min(50, Math.floor(v))) : DEFAULT_REDEALS;
};
const castOf = (ctx: ProcedureContext): Cast => ctx.get<Cast>("cast") ?? buildCast(ctx.inputs);

/** Roll a table, then step down to the first row (wrapping) that `fits`. */
function rollFitting(ctx: ProcedureContext, tableId: string, rng: Rng, fits: (r: Record<string, unknown>) => boolean): TableRow | undefined {
  const table = ctx.tables.get(tableId);
  if (!table) return undefined;
  const rolled = rollTable(table, rng, ctx.tables);
  const start = Math.max(
    0,
    table.rows.findIndex((r) => rolled.total >= r.range[0] && rolled.total <= r.range[1]),
  );
  for (let i = 0; i < table.rows.length; i++) {
    const row = table.rows[(start + i) % table.rows.length]!;
    if (fits(isObj(row.result) ? row.result : {})) return row;
  }
  return table.rows[start];
}

const resultOf = (row: TableRow | undefined): Record<string, unknown> => (row && isObj(row.result) ? row.result : {});

/** A different value than `not` when there is one. */
function pickOther<T>(rng: Rng, options: T[], not: T, same: (a: T, b: T) => boolean = (a, b) => a === b): T {
  const rest = options.filter((o) => !same(o, not));
  const pool = rest.length ? rest : options;
  return pool[rng.int(0, pool.length - 1)] ?? not;
}

function arcWeight(arc: AgendaArc, m: PartyMember, dial: BetrayalDial, cast: Cast): number {
  const partySize = cast.party.length;
  let w = DIAL_WEIGHTS[dial][arc.betrayal];
  if (arc.cap === "synthetic") {
    if (m.android && !m.secretAndroid) return 0; // an open android cannot be a hidden one
    w *= m.secretAndroid ? 6 : 0.6;
  }
  if (m.career && CAREER_FIT[m.career]?.includes(arc.id)) w *= 2.5;
  // the one who gives the orders makes a poor mutineer or loyalist to themself
  if (cast.pools.leader.id === m.id && arc.acts.some((a) => a.target === "leader")) w *= 0.15;
  const needs = arc.acts.map((a) => a.target);
  if (needs.includes("rival")) w *= m.rivals.length ? 3 : partySize > 1 ? 0.5 : 0.1;
  if (needs.includes("buddy")) w *= m.buddies.length ? 3 : partySize > 1 ? 0.7 : 0.1;
  return w;
}

function allegianceRow(ctx: ProcedureContext, rng: Rng, arc: AgendaArc): AllegianceId {
  const r = resultOf(rollFitting(ctx, AGENDA_ALLEGIANCE_TABLE_ID, rng, (x) => arc.allegiances.includes(x.allegiance as AllegianceId)));
  const a = r.allegiance as AllegianceId | undefined;
  return a && arc.allegiances.includes(a) ? a : arc.allegiances[0]!;
}

function ownerOf(ctx: ProcedureContext, cast: Cast, allegiance: AllegianceId): { owner: string; internal: boolean } {
  const row =
    ctx.tables
      .get(AGENDA_ALLEGIANCE_TABLE_ID)
      ?.rows.map(resultOf)
      .find((r) => r.allegiance === allegiance) ?? {};
  const owner = allegiance === "company" ? cast.pools.company : allegiance === "rival-corp" ? cast.pools.rivalCorp : str(row.owner, allegiance);
  return { owner, internal: row.internal === true };
}

function analysed(cast: Cast, members: Array<{ id: string; arc: string; allegiance: AllegianceId; targets: Target[] }>): AnalysedMember[] {
  return members.map((d) => {
    const m = cast.party.find((p) => p.id === d.id)!;
    const arc = arcById(d.arc)!;
    return { id: d.id, name: m.name, arc, allegiance: d.allegiance, acts: arc.acts.map((a, i) => ({ target: d.targets[i]!, stance: a.stance })), buddies: m.buddies, rivals: m.rivals };
  });
}

/** Score for keeping a deal that did not pass: no cap breaks first, then friction, then fewer loners. */
function rank(a: Analysis): number {
  const capsBroken = a.problems.some((p) => p.tone === "danger") ? 1 : 0;
  const loners = Object.values(a.clashing).filter((x) => !x).length;
  return -capsBroken * 10_000 + a.friction * 10 - loners;
}

// ---------------------------------------------------------------------------
// steps
// ---------------------------------------------------------------------------

function deal(ctx: ProcedureContext, rng: Rng): DealResult {
  const cast = castOf(ctx);
  const dial = dialOf(ctx);
  const minFriction = minFrictionFor(dial, cast.party.length, ctx.inputs.minFriction);
  const redeals = redealsOf(ctx);
  const party = cast.party;
  const log: DealResult["log"] = [];
  let best: { members: DealtMember[]; analysis: Analysis; attempt: number } | undefined;

  for (let k = 0; k < redeals; k++) {
    const attemptRng = rng.fork(`attempt-${k}`);
    const taken = new Set<string>();
    let synthetic = 0;
    let plant = 0;
    // locked arcs first: they count against the caps
    for (const m of party) {
      const locked = m.lockedArc ? arcById(m.lockedArc) : undefined;
      if (!locked) continue;
      taken.add(locked.id);
      if (locked.cap === "synthetic") synthetic++;
      if (locked.cap === "plant") plant++;
    }
    const arcs = new Map<string, AgendaArc>();
    for (const m of party) {
      const locked = m.lockedArc ? arcById(m.lockedArc) : undefined;
      if (locked) {
        arcs.set(m.id, locked);
        continue;
      }
      // arcs that work against one already dealt weigh double: the deal looks for collisions
      const dealt = [...arcs.values()];
      const options = AGENDA_ARCS.filter((a) => !taken.has(a.id) || taken.size >= AGENDA_ARCS.length)
        .filter((a) => !(a.cap === "synthetic" && synthetic >= 1) && !(a.cap === "plant" && plant >= 1))
        .map((a) => ({ value: a, weight: arcWeight(a, m, dial, cast) * (dealt.some((d) => d.opposes.includes(a.id) || a.opposes.includes(d.id)) ? 2 : 1) }));
      const arc = weightedPick(attemptRng.fork(m.id), options) ?? AGENDA_ARCS.find((a) => a.betrayal === 0)!;
      arcs.set(m.id, arc);
      taken.add(arc.id);
      if (arc.cap === "synthetic") synthetic++;
      if (arc.cap === "plant") plant++;
    }
    const members: DealtMember[] = party.map((m) => {
      const arc = arcs.get(m.id)!;
      let allegiance = allegianceRow(ctx, attemptRng.fork(`${m.id}/allegiance`), arc);
      // a betrayal-3 arc answering to the Company is a plant too: keep to one
      if (arc.betrayal === 3 && allegiance === "company" && arc.cap !== "plant" && plant >= 1) allegiance = arc.allegiances.find((a) => a !== "company") ?? allegiance;
      if (arc.betrayal === 3 && allegiance === "company" && arc.cap !== "plant") plant++;
      // acts that aim at the same kind of target aim at the same one (one buddy, one prize), unless the GM re-rolls a slot
      const byKind = new Map<string, Target>();
      const targets = arc.acts.map((a, i) => {
        const same = byKind.get(a.target);
        if (same && !(a.target === "place" && i === 2)) return same;
        const t = drawTarget(attemptRng.fork(`${m.id}/act${i + 1}`), a.target, m, cast, i + 1);
        if (!same) byKind.set(a.target, t);
        return t;
      }) as DealtMember["targets"];
      return { id: m.id, arc: arc.id, allegiance, targets, keep: [] };
    });
    const people = analysed(cast, members);
    const analysis = analyseParty(people, minFriction);
    for (const d of members) {
      const partner = strongestPartner(analysis, people, d.id);
      d.keep = ACTS.map(() => partner ?? "");
    }
    log.push({ attempt: k + 1, ok: analysis.ok, friction: analysis.friction, problems: analysis.problems.map((p) => p.text) });
    if (!best || rank(analysis) > rank(best.analysis)) best = { members, analysis, attempt: k + 1 };
    if (analysis.ok) {
      best = { members, analysis, attempt: k + 1 };
      break;
    }
  }
  const kept = best!;
  const names = kept.members.map((d) => `${party.find((p) => p.id === d.id)?.name}: ${arcById(d.arc)?.name}`).join(" · ");
  return {
    members: kept.members,
    attempt: kept.attempt,
    passed: kept.analysis.ok,
    dial,
    minFriction,
    log,
    label: `${names} (${kept.analysis.ok ? `passed the check on deal ${kept.attempt}` : `best of ${log.length} deals, check not passed`})`,
  };
}

function slots(ctx: ProcedureContext, rng: Rng): SlotsMember[] {
  const cast = castOf(ctx);
  const dealt = ctx.get<DealResult>("deal");
  const motiveRows = (ctx.tables.get(AGENDA_MOTIVE_TABLE_ID)?.rows ?? []).map(resultOf);
  const catchRows = (id: string) => (ctx.tables.get(id)?.rows ?? []).map((r) => ({ label: r.label ?? "", ...resultOf(r) }));
  const fitsCountdown = (r: Record<string, unknown>) => r.needs !== "countdown" || cast.pools.hasCountdown;
  return (dealt?.members ?? []).map((d) => {
    const m = cast.party.find((p) => p.id === d.id)!;
    const arc = arcById(d.arc)!;
    const k = (s: string) => `${d.id}/${s}`;
    const allegiance = ctx.part<AllegianceId>(k("allegiance"), (r) => pickOther(r, arc.allegiances, d.allegiance), { initial: d.allegiance });
    const motive0 = resultOf(rollFitting(ctx, AGENDA_MOTIVE_TABLE_ID, rng.fork(k("motive")), (x) => arc.motives.includes(x.motive as MotiveId))).motive as MotiveId;
    const motive = ctx.part<MotiveId>(k("motive"), (r) => pickOther(r, arc.motives, motive0), { initial: arc.motives.includes(motive0) ? motive0 : arc.motives[0]! });
    const { owner, internal } = ownerOf(ctx, cast, allegiance);
    const mrow = motiveRows.find((r) => r.motive === motive) ?? {};
    const why = internal ? str(mrow.alone) : str(mrow.why).replace("{owner}", owner);
    const others = cast.party.filter((p) => p.id !== d.id).map((p) => p.id);
    const acts = arc.acts.map((a, i): SlotsActResult => {
      const n = i + 1;
      const ka = (s: string) => k(`act${n}/${s}`);
      const objective0 = rng.fork(ka("objective")).int(0, a.objectives.length - 1);
      const objective = ctx.part<number>(
        ka("objective"),
        (r) =>
          pickOther(
            r,
            a.objectives.map((_, j) => j),
            objective0,
          ),
        { initial: objective0 },
      );
      const target = ctx.part<Target>(ka("target"), (r) => drawTarget(r, a.target, m, cast, n, d.targets[i]), { initial: d.targets[i]! });
      const keep0 = d.keep[i] || others[0] || "";
      const keep = ctx.part<string>(ka("keep"), (r) => (others.length ? pickOther(r, others, keep0) : keep0), { initial: keep0 });
      const table = n === 3 ? AGENDA_CATCH_LATE_TABLE_ID : AGENDA_CATCH_EARLY_TABLE_ID;
      const catch0 = rollFitting(ctx, table, rng.fork(ka("catch")), fitsCountdown)?.label ?? "";
      const rows = catchRows(table)
        .filter(fitsCountdown)
        .map((r) => r.label);
      const caught = ctx.part<string>(ka("catch"), (r) => pickOther(r, rows, catch0), { initial: catch0 });
      return { objective, target, keep, catch: caught };
    });
    return { id: d.id, arc: arc.id, allegiance, owner, internal, motive, why, acts };
  });
}

function check(ctx: ProcedureContext): Analysis & { label: string } {
  const cast = castOf(ctx);
  const dealt = ctx.get<DealResult>("deal");
  const filled = ctx.get<SlotsMember[]>("slots") ?? [];
  const minFriction = dealt?.minFriction ?? minFrictionFor(dialOf(ctx), cast.party.length, ctx.inputs.minFriction);
  const analysis = analyseParty(
    analysed(
      cast,
      filled.map((s) => ({ id: s.id, arc: s.arc, allegiance: s.allegiance, targets: s.acts.map((a) => a.target) })),
    ),
    minFriction,
  );
  const label = analysis.ok
    ? `Friction ${analysis.friction} (minimum ${minFriction}); every PC clashes with someone`
    : `Friction ${analysis.friction} (minimum ${minFriction}): ${analysis.problems.map((p) => p.text).join("; ")}`;
  return { ...analysis, label };
}

/** The card text for one act: the objective, why, who to keep it from, the catch, and the Story Point hint. */
export function actText(objective: string, why: string, keepFrom: string, caught: string, risk: string): string {
  return `${cap(objective)}. Why: ${why}. Keep it from: ${keepFrom}. ${caught} Story Point: earned if you ${risk}.`;
}

function drafts(ctx: ProcedureContext): AgendaDraftSet {
  const cast = castOf(ctx);
  const dealt = ctx.get<DealResult>("deal");
  const filled = ctx.get<SlotsMember[]>("slots") ?? [];
  const report = ctx.get<Analysis & { label: string }>("check");
  const nameOf = (id: string) => cast.party.find((p) => p.id === id)?.name ?? (id || "the others");
  const slot = (id: string, key: string, label: string, text: string): AgendaDraftSlot => ({ key: `slots/${id}/${key}`, label, text });
  const characters: AgendaDraftCharacter[] = filled.map((s) => {
    const m = cast.party.find((p) => p.id === s.id)!;
    const arc = arcById(s.arc)!;
    const allegianceLabel = ctx.tables.get(AGENDA_ALLEGIANCE_TABLE_ID)?.rows.find((r) => resultOf(r).allegiance === s.allegiance)?.label ?? s.allegiance;
    const motiveLabel = ctx.tables.get(AGENDA_MOTIVE_TABLE_ID)?.rows.find((r) => resultOf(r).motive === s.motive)?.label ?? s.motive;
    const acts: AgendaDraftAct[] = s.acts.map((a, i) => {
      const def = arc.acts[i]!;
      const objective = (def.objectives[a.objective] ?? def.objectives[0]).replace("{target}", a.target.name);
      const keep = a.keep ? nameOf(a.keep) : "the rest of the crew";
      return {
        act: i + 1,
        text: actText(objective, s.why, keep, a.catch, def.risk),
        slots: [
          slot(s.id, `act${i + 1}/objective`, "Objective", cap(objective)),
          slot(s.id, `act${i + 1}/target`, "Target", a.target.name),
          slot(s.id, `act${i + 1}/keep`, "Keep from", keep),
          slot(s.id, `act${i + 1}/catch`, "Catch", a.catch),
        ],
        hint: { label: "Story Point", text: `Earned if you ${def.risk}.`, page: STORY_POINT_PAGE },
      };
    });
    const owner = (s.allegiance === "company" || s.allegiance === "rival-corp") && s.owner.toLowerCase() !== allegianceLabel.toLowerCase() ? `${allegianceLabel} (${s.owner})` : allegianceLabel;
    const ch: AgendaDraftCharacter = {
      id: s.id,
      name: m.name,
      inCampaign: m.inCampaign,
      title: arc.name,
      summary: arc.summary,
      slots: [slot(s.id, "allegiance", "Answers to", owner), slot(s.id, "motive", "Motive", `${motiveLabel}: ${s.why}`)],
      acts,
    };
    if (m.index >= 0) ch.lock = { path: ["pcs", m.index, "arc"], value: arc.id, locked: m.lockedArc === arc.id };
    return ch;
  });
  const set: AgendaDraftSet = {
    field: "agendas",
    acts: [...ACTS],
    characters,
    note: "DRAFT: rough agendas to revise so they fit your story. Keep Acts 1 and 2 quiet; open moves against other PCs belong in Act 3 (p. 158).",
  };
  if (report) {
    const lines: NonNullable<AgendaDraftSet["report"]>["lines"] = [];
    if (dealt) {
      for (const l of dealt.log.filter((x) => !x.ok)) lines.push({ tone: "info", text: `Deal ${l.attempt} re-dealt: ${l.problems.join("; ")}` });
      lines.push({
        tone: dealt.passed ? "ok" : "warning",
        text: dealt.passed ? `Deal ${dealt.attempt} passed the check (${dealt.dial.replace("-", " ")} dial).` : `No deal in ${dealt.log.length} passed; kept the one with the most friction.`,
      });
    }
    lines.push({ tone: report.caps.synthetic <= 1 ? "ok" : "danger", text: `Hidden Synthetics: ${report.caps.synthetic} (at most one)` });
    lines.push({ tone: report.caps.plant <= 1 ? "ok" : "danger", text: `Company plants: ${report.caps.plant} (at most one)` });
    for (const p of report.problems.filter((x) => !/Hidden Synthetics|Company plants/.test(x.text))) lines.push(p);
    if (cast.party.length < 2) lines.push({ tone: "info", text: "One PC: agendas collide with NPCs only, so the party check is skipped." });
    set.report = {
      ok: report.ok,
      summary: `Friction ${report.friction} (minimum ${report.minFriction})${report.ok ? ": every PC clashes with someone." : "."}`,
      lines,
      pairs: report.pairs.map((p) => ({ a: p.a, b: p.b, score: p.score, reasons: p.reasons })),
    };
  }
  return set;
}

// ---------------------------------------------------------------------------
// the procedure
// ---------------------------------------------------------------------------

export const agendaDraftsProcedure: Procedure = {
  id: AGENDAS_ID,
  name: "Agenda drafts",
  description:
    "Draft a three-act secret agenda for every PC from 24 arcs, aimed at the campaign's people, places and things, with a conflict check so the agendas collide. Revise, then accept them onto the character sheets and agenda cards.",
  // the arcs and tables are the module's own; the agenda and Story Point rules they follow are p. 27 and 158
  page: STORY_POINT_PAGE,
  original: true,
  mode: [CINEMATIC],
  agendaDrafts: true,
  inputs: {
    type: "object",
    properties: {
      adventure: { type: "object", title: "Adventure", "x-adventure": {}, description: "Its premise, hidden situation and Act 3 aim the targets; its PCs get the drafts." },
      pcs: {
        type: "array",
        title: "Player characters",
        default: [],
        items: { type: "object", properties: { id: { type: "string" }, name: { type: "string" }, arc: { type: "string", title: "Arc", enum: ["random", ...ARC_IDS], default: "random" } } },
      },
      betrayal: { type: "string", title: "Betrayal dial", enum: [...BETRAYAL_DIAL], default: "frayed", description: "Loyal crew deals mostly loyal arcs; knives out deals traitors." },
      minFriction: {
        type: "integer",
        minimum: 0,
        title: "Minimum friction",
        description: "Least total conflict score for the party; blank uses the dial's (3, 5 or 8 for four PCs, scaled to the party).",
      },
      redeals: { type: "integer", minimum: 1, maximum: 50, default: DEFAULT_REDEALS, title: "Re-deals", description: "How many times to re-deal a party that fails the check." },
      pcCount: { type: "integer", minimum: 1, maximum: 8, default: 4, title: "Placeholder PCs", description: "Used only when the campaign has no PCs." },
      campaign: {
        type: "object",
        title: "Campaign",
        "x-campaign": {
          kinds: ["character", "location", "item", "clue", "creature", "faction"],
          fields: ["android", "secretAndroid", "career", "role", "factionType"],
          relationships: ["buddy_of", "rival_of"],
        },
        description: "The campaign's people, places and things the agendas can aim at.",
      },
    },
  },
  steps: [
    {
      id: "cast",
      title: "Cast and targets",
      compute: (ctx) => buildCast(ctx.inputs),
      display: (_ctx, result) => {
        const c = result as Cast;
        const p = c.pools;
        const n = (x: number, one: string, many = `${one}s`) => `${x} ${x === 1 ? one : many}`;
        return `${c.party.map((m) => m.name).join(", ")} · ${n(p.npcs.filter((t) => t.source !== "fallback").length, "NPC")}, ${n(p.places.filter((t) => t.source !== "fallback").length, "place")}, prize: ${p.items[0]?.name ?? "none"}, the Company: ${p.company}`;
      },
    },
    { id: "deal", title: "Deal arcs (conflict check, re-deal)", reads: ["cast"], compute: (ctx, rng) => deal(ctx, rng), display: (_ctx, result) => (result as DealResult).label },
    {
      id: "slots",
      title: "Fill the slots",
      reads: ["deal"],
      compute: (ctx, rng) => slots(ctx, rng),
      display: (ctx, result) => {
        const cast = ctx.get<Cast>("cast");
        return (result as SlotsMember[]).map((s) => `${cast?.party.find((p) => p.id === s.id)?.name ?? s.id}: ${s.acts.map((a) => a.target.name).join(" > ")}`).join(" · ");
      },
    },
    { id: "check", title: "Conflict check", reads: ["slots"], compute: (ctx) => check(ctx), display: (_ctx, result) => (result as { label: string }).label },
    {
      id: "agendaDrafts",
      title: "Agenda cards (draft)",
      reads: ["check"],
      compute: (ctx) => drafts(ctx),
      display: (_ctx, result) => `DRAFT: ${(result as AgendaDraftSet).characters.length} characters × 3 acts`,
    },
  ],
  produce: () => ({ entities: [], relationships: [] }),
};

/** Candidate targets for one act of an arc (for tests and tools). */
export function agendaTargetOptions(inputs: Record<string, unknown>, arcId: string, memberId: string, act: number): Target[] {
  const cast = buildCast(inputs);
  const arc = arcById(arcId);
  const m = cast.party.find((p) => p.id === memberId);
  if (!arc || !m) return [];
  return targetCandidates(arc.acts[act - 1]!.target, m, cast, act).map((c) => c.value);
}

export { isPlant };
