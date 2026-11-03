/**
 * "Previously on…" for Alien campaigns: the module's recap lines, in its own
 * words (original sentences, no book text). Core builds the recap; this
 * contributor reads the snapshot core hands it, once for the GM and once for
 * the players. The players' snapshot is the player projection only, so the
 * read-aloud can only name what the crew may know: jobs they took, clues
 * they found (under the thread's player title), their contacts with the
 * favours, a synthetic or an agenda the GM revealed, the crew funds and
 * trips, and threats they saw on the hunt. The GM's version adds the GM
 * titles and the secrets: betrayers in play, hidden synthetics, agenda beats,
 * thread clocks, payoffs waiting and faction heat.
 */
import type { RecapContributor, RecapEntity, RecapLineDraft, RecapLinkRef, RecapSectionDraft, RecapSnapshot } from "@campaign-forge/module-sdk";
import { CAMPAIGN_AGENDA_FIELD } from "./procedures/campaign-agendas";

export const ALIEN_RECAP_ID = "alien.recap";

const JOB_TYPE = "alien.job";

const isRec = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const str = (v: unknown): string => (typeof v === "string" ? v.trim() : "");
const lowerFirst = (s: string) => (/^[A-Z][a-z]/.test(s) && !/^[A-Z][a-z]+ [A-Z]/.test(s) ? `${s.charAt(0).toLowerCase()}${s.slice(1)}` : s);
const stop = (s: string) => s.replace(/[.\s]+$/, "");
const money = (n: number, sign = false) => `${sign ? (n < 0 ? "−" : "+") : n < 0 ? "−" : ""}$${Math.abs(Math.round(n)).toLocaleString("en-US")}`;
const link = (e: { id: string; name: string }): RecapLinkRef => ({ kind: "entity", id: e.id, label: e.name });
const plural = (n: number, one: string, many = `${one}s`) => `${n === 1 ? "a" : n} ${n === 1 ? one : many}`;

/** "Owes the crew a favour.", "The crew owes them 2 favours.", "No favours either way." */
export function favourText(f: { owedToCrew: number; owedByCrew: number }): string {
  const parts: string[] = [];
  if (f.owedToCrew > 0) parts.push(`owes the crew ${plural(f.owedToCrew, "favour")}`);
  if (f.owedByCrew > 0) parts.push(`the crew owes them ${plural(f.owedByCrew, "favour")}`);
  if (!parts.length) return "No favours either way.";
  const s = parts.join("; ");
  return `${s.charAt(0).toUpperCase()}${s.slice(1)}.`;
}

interface Ctx {
  s: RecapSnapshot;
  gm: boolean;
  byId: Map<string, RecapEntity>;
  covered: Set<string>;
  /** Changed since the covered sessions began (always true for the story so far). */
  recent: (at: string | undefined) => boolean;
}

function jobsSection(x: Ctx): RecapSectionDraft | undefined {
  const lines: RecapLineDraft[] = [];
  const linked = new Set<string>([...x.s.clues.flatMap((c) => (c.job && (!c.foundIn || x.covered.has(c.foundIn)) ? [c.job] : [])), ...x.s.ledger.flatMap((l) => (l.job ? [l.job] : []))]);
  for (const e of x.s.entities) if (e.contact?.lastSeen?.session && x.covered.has(e.contact.lastSeen.session) && e.contact.lastSeen.job) linked.add(e.contact.lastSeen.job);
  for (const job of x.s.entities.filter((e) => e.type === JOB_TYPE)) {
    const status = str(job.fields.status);
    if (status !== "accepted" && status !== "done") continue;
    if (!x.recent(job.updated) && !linked.has(job.id)) continue;
    const employer = str(job.fields.employer);
    const pay = typeof job.fields.payment === "number" && job.fields.payment > 0 ? money(job.fields.payment) : "";
    if (status === "done") {
      lines.push({ key: "alien.job-done", ref: job.id, text: `The crew finished ${job.name}${employer ? ` for ${employer}` : ""}.`, links: [link(job)] });
      continue;
    }
    const where = str(job.fields.destination);
    const bits = [employer ? `for ${employer}` : "", pay ? `${pay} on delivery` : ""].filter(Boolean).join(", ");
    lines.push({ key: "alien.job-taken", ref: job.id, text: `The crew took the job ${job.name}${bits ? ` (${bits})` : ""}${where ? `, bound for ${lowerFirst(stop(where))}` : ""}.`, links: [link(job)] });
  }
  return lines.length ? { id: "alien.jobs", title: "Jobs", audience: x.s.audience, order: 25, lines } : undefined;
}

function cluesSection(x: Ctx): RecapSectionDraft | undefined {
  const lines: RecapLineDraft[] = [];
  for (const c of x.s.clues) {
    if (c.state !== "found") continue;
    if (!(c.foundIn ? x.covered.has(c.foundIn) : x.recent(c.foundAt))) continue;
    const from = c.entity ? x.byId.get(c.entity) : undefined;
    const job = c.job ? x.byId.get(c.job) : undefined;
    const where = [from ? `from ${from.name}` : "", job ? `on ${job.name}` : ""].filter(Boolean).join(", ");
    const links: RecapLinkRef[] = [...(x.gm ? [{ kind: "thread" as const, id: c.thread, label: c.threadTitle }] : []), ...(from ? [link(from)] : []), ...(job ? [link(job)] : [])];
    lines.push({ key: "alien.clue", ref: c.clue, text: `${c.threadTitle}: ${stop(c.text)}${where ? ` (${where})` : ""}.`, links });
  }
  return lines.length ? { id: "alien.clues", title: x.gm ? "Clues found" : "What you learnt", audience: x.s.audience, order: 35, lines } : undefined;
}

function contactsSection(x: Ctx): RecapSectionDraft | undefined {
  const lines: RecapLineDraft[] = [];
  for (const e of x.s.entities) {
    const c = e.contact;
    if (!c) continue;
    const met = (c.lastSeen?.session && x.covered.has(c.lastSeen.session)) || x.recent(c.since);
    if (!met) continue;
    const where = c.foundAt ? ` Where to find them: ${stop(c.foundAt)}.` : "";
    const text = x.gm ? `${e.name} is a contact (${c.stance ?? "neutral"}). ${favourText(c.favours)}${where}` : `${e.name} is one of your contacts. ${favourText(c.favours)}${where}`;
    lines.push({ key: "alien.contact", ref: e.id, text, links: [link(e)] });
  }
  return lines.length ? { id: "alien.contacts", title: "Contacts", audience: x.s.audience, order: 46, lines } : undefined;
}

/** The PC's campaign agenda record, when the snapshot shows one. */
function agendaOf(e: RecapEntity): { beat?: string; last?: { outcome: string; job?: string; text: string } } | undefined {
  const rec = e.fields[CAMPAIGN_AGENDA_FIELD];
  if (!isRec(rec)) return undefined;
  const beat = isRec(rec.beat) ? str(rec.beat.text) : "";
  const history = Array.isArray(rec.history) ? rec.history.filter(isRec) : [];
  const h = history[history.length - 1];
  const last = h && str(h.outcome) ? { outcome: str(h.outcome), text: str(h.text), ...(str(h.job) ? { job: str(h.job) } : {}) } : undefined;
  return beat || last ? { ...(beat ? { beat } : {}), ...(last ? { last } : {}) } : undefined;
}

/** What the players don't know (GM) and what the GM revealed of it (players). */
function secretLines(x: Ctx): RecapLineDraft[] {
  const lines: RecapLineDraft[] = [];
  const s = x.s;
  if (x.gm) {
    // betrayers in play on the jobs in hand
    const named = new Map(s.entities.filter((e) => e.kind === "character" && !e.pc).map((e) => [e.name, e] as const));
    for (const job of s.entities.filter((e) => e.type === JOB_TYPE && str(e.fields.status) === "accepted")) {
      const betrayers = Array.isArray(job.fields.betrayers) ? job.fields.betrayers.filter((b): b is string => typeof b === "string") : [];
      for (const b of betrayers) {
        const npc = named.get(b);
        if (npc?.contact?.betrayer) continue;
        lines.push({ key: "alien.betrayer", ref: npc?.id ?? `${job.id}:${b}`, text: `${b} means to turn on the crew on ${job.name}.`, links: [...(npc ? [link(npc)] : []), link(job)] });
      }
    }
    // hidden synthetics the crew may meet: on a job in hand, or new since
    const activeJobs = new Set(s.entities.filter((e) => e.type === JOB_TYPE && str(e.fields.status) === "accepted").map((e) => e.id));
    const related = new Set(s.relationships.filter((r) => activeJobs.has(r.from) || activeJobs.has(r.to)).flatMap((r) => [r.from, r.to]));
    for (const e of s.entities) {
      if (e.fields.secretAndroid !== true || e.pc) continue;
      if (!related.has(e.id) && !x.recent(e.created)) continue;
      lines.push({ key: "alien.synthetic", ref: e.id, text: `${e.name} is a synthetic posing as human.`, links: [link(e)] });
    }
    // the PCs' agenda beats
    for (const pc of s.entities.filter((e) => e.pc)) {
      const a = agendaOf(pc);
      if (!a) continue;
      if (a.last) lines.push({ key: "alien.agenda-outcome", ref: pc.id, text: `${pc.name}'s goal ${a.last.outcome}${a.last.job ? ` on ${a.last.job}` : ""}${a.last.text ? `: ${stop(a.last.text)}` : ""}.`, links: [link(pc)] });
      if (a.beat) lines.push({ key: "alien.agenda-beat", ref: pc.id, text: `${pc.name}'s agenda beat this job: ${stop(a.beat)}.`, links: [link(pc)] });
    }
    // between jobs: thread clocks, milestones, payoffs waiting, faction heat
    const byThread = new Map<string, { title: string; by: number; filled: number; segments: number; ignored: boolean; reached: Array<{ at: number; text: string }> }>();
    for (const t of s.ticks) {
      const cur = byThread.get(t.thread) ?? { title: t.threadTitle, by: 0, filled: t.filled, segments: t.segments, ignored: false, reached: t.reached };
      cur.by += t.by;
      cur.ignored ||= !!t.ignored;
      byThread.set(t.thread, cur);
    }
    for (const [id, t] of byThread) {
      if (t.by !== 0) lines.push({ key: "alien.clock", ref: id, text: `${t.title}: the clock moved ${t.by > 0 ? "+" : "−"}${Math.abs(t.by)} to ${t.filled}/${t.segments}${t.ignored ? ", pushed on because the crew left it alone" : ""}.`, links: [{ kind: "thread", id, label: t.title }] });
      for (const m of t.reached) lines.push({ key: `alien.milestone:${m.at}`, ref: id, text: `${t.title} reached ${m.at}: ${stop(m.text)}.`, links: [{ kind: "thread", id, label: t.title }] });
    }
    for (const p of s.payoffs) lines.push({ key: `alien.payoff:${p.milestone}:${p.kind}`, ref: p.thread, text: `Payoff waiting on ${p.threadTitle}: ${stop(p.label)}. ${stop(p.text)}.`, links: [{ kind: "thread", id: p.thread, label: p.threadTitle }] });
    for (const h of s.heat) {
      if (h.before !== undefined && h.before === h.heat) continue;
      const change = h.before === undefined ? "" : h.heat > h.before ? `, up from ${h.beforeLabel ?? h.before}` : `, down from ${h.beforeLabel ?? h.before}`;
      lines.push({ key: "alien.heat", ref: h.id, text: `${h.name} heat: ${h.label} (${h.heat})${change}.`, links: [{ kind: "entity", id: h.id, label: h.name }] });
    }
    return lines;
  }
  // players: only what the GM revealed in the covered sessions, as their projection shows it
  for (const r of s.reveals) {
    const e = r.entity ? x.byId.get(r.entity) : undefined;
    if (!e || e.pc || e.kind !== "character") continue;
    if ((r.field === "android" || r.field === "secretAndroid") && e.fields.android === true) lines.push({ key: "alien.synthetic-revealed", ref: e.id, text: `${e.name} turned out to be a synthetic.`, links: [link(e)] });
    else if (r.field === "personalAgenda" && str(e.fields.personalAgenda)) lines.push({ key: "alien.agenda-revealed", ref: e.id, text: `What ${e.name} was really after came out.`, links: [link(e)] });
  }
  for (const pc of s.entities.filter((e) => e.pc)) {
    const a = agendaOf(pc);
    if (a?.last && a.last.outcome === "resolved") lines.push({ key: "alien.agenda-outcome", ref: pc.id, text: `${pc.name} saw a long-held goal through.`, links: [link(pc)] });
  }
  return lines;
}

function shipSection(x: Ctx): RecapSectionDraft | undefined {
  const lines: RecapLineDraft[] = [];
  for (const t of x.s.travel) {
    if (t.status === "cancelled") continue;
    const ship = t.ship ? x.byId.get(t.ship) : undefined;
    const who = ship ? `The ${ship.name}` : "The crew";
    const text = t.status === "arrived" ? `${who} reached ${t.toName}${t.fromName ? ` from ${t.fromName}` : ""}${t.summary ? ` (${stop(t.summary)})` : ""}.` : `${who} is set to leave for ${t.toName}${t.summary ? ` (${stop(t.summary)})` : ""}.`;
    lines.push({ key: "alien.travel", ref: t.id, text, links: ship ? [link(ship)] : [] });
  }
  const shared = x.s.ledger.filter((l) => !l.account);
  for (const l of shared.slice(-6)) lines.push({ key: "alien.ledger", ref: l.id, text: `${money(l.amount, true)}: ${stop(l.note || l.category.replace(/-/g, " "))}.` });
  if (shared.length) lines.push({ key: "alien.balance", text: `Crew funds now: ${money(x.s.balance)}.` });
  return lines.length ? { id: "alien.ship", title: "Ship and funds", audience: x.s.audience, order: 55, lines } : undefined;
}

const TOKEN_STATE: Record<string, string> = { hidden: "is still hidden", detected: "is on the motion tracker", seen: "has been seen by the crew", gone: "is out of play" };

function huntSection(x: Ctx): RecapSectionDraft | undefined {
  const lines: RecapLineDraft[] = [];
  for (const h of x.s.hunts) {
    for (const t of h.tokens) {
      const text = x.gm ? `${h.mapName}, ${h.step} ${h.step === 1 ? "move" : "moves"} in: ${t.label} ${TOKEN_STATE[t.state] ?? t.state}${t.hurt ? ", hurt" : ""}.` : `On ${h.mapName}, the crew saw ${t.label}.`;
      lines.push({ key: "alien.hunt", ref: `${h.map}:${t.id}`, text, links: [{ kind: "map", id: h.map, label: h.mapName }] });
    }
  }
  return lines.length ? { id: "alien.hunt", title: "The hunt", audience: x.s.audience, order: 65, lines } : undefined;
}

/** The Alien module's recap lines, for the GM or the players (whichever the snapshot is for). */
export function alienRecapSections(s: RecapSnapshot): RecapSectionDraft[] {
  const x: Ctx = {
    s,
    gm: s.audience === "gm",
    byId: new Map(s.entities.map((e) => [e.id, e] as const)),
    covered: new Set(s.sessions.map((r) => r.id)),
    recent: (at) => s.since === undefined || (!!at && at >= s.since),
  };
  const out = [jobsSection(x), cluesSection(x), contactsSection(x), shipSection(x), huntSection(x)].filter((v): v is RecapSectionDraft => !!v);
  const secrets = secretLines(x);
  if (secrets.length) out.push(x.gm ? { id: "secrets", title: "What the players don't know", audience: "gm", order: 90, lines: secrets } : { id: "alien.revealed", title: "Revealed", audience: "players", order: 36, lines: secrets });
  return out;
}

export const alienRecap: RecapContributor = { id: ALIEN_RECAP_ID, label: "Jobs, clues, contacts, the ship and the hunt", build: alienRecapSections };
