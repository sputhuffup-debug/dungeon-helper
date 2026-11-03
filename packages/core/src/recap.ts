/**
 * "Previously on…": the recap read at the start of a session, assembled
 * deterministically from what the campaign already records (no AI, no book
 * text): same campaign state, same recap.
 *
 * - `recapSessions` picks the sessions a recap covers: the last one before
 *   the target (default), the last n, or the story so far.
 * - `recapSnapshot` is what a module's recap contributors read, one per
 *   audience. The GM's comes from the whole campaign; the players' comes from
 *   the player projection only (`projectCampaignForViewer` with the group
 *   viewer) and copies allowed fields from it, the same model as crew notes,
 *   shares and packets: GM-only entities and fields, unfound clues, the GM's
 *   thread titles, sponsors, clocks, heat, payoffs and settings are never in
 *   it.
 * - `buildSessionRecap` writes the core sections (the sessions covered and
 *   their summaries, scenes run, reveals and handouts given, who and what is
 *   new, rewards, attendees, wrap-up answers, loose ends, and for the GM the
 *   seeded clues the players have not found) and adds each contributor's
 *   sections. The GM's recap and the players' read-aloud are built apart:
 *   nothing in the GM's recap is ever copied into the read-aloud.
 * - The recap is stored on the session as an editable draft. Lines can be
 *   switched off, rewritten and added; regenerating rebuilds from the data
 *   and keeps those choices (`mergeRecap`): a line keeps its switch and, when
 *   the GM rewrote it, the GM's words; GM lines stay; a rewritten line whose
 *   source is gone stays as a GM line.
 * - `playerRecap` is the only way a player-facing view gets the read-aloud:
 *   the players' sections only, switched-off lines left out, links kept to
 *   what the players can see now, and only once the GM has shown it (unless
 *   the GM is sharing it right now).
 *
 * Nothing here names a game.
 */
import {
  RECAP_MODULE_ORDER,
  RECAP_SECTION_ORDER,
  clueKindLabel,
  heatLabel,
  payoffLabel,
  type GameModule,
  type RecapAudience,
  type RecapClue,
  type RecapEntity,
  type RecapLineDraft,
  type RecapLinkRef,
  type RecapSectionDraft,
  type RecapSessionRef,
  type RecapSnapshot,
} from "@campaign-forge/module-sdk";
import type * as Y from "yjs";
import { carriesHeat, cluesOf, clueVisibleTo, heatOf, pendingPayoffs, threadsInOrder } from "./arcs";
import { newId, now } from "./ids";
import { clone, getPath } from "./paths";
import { isPlayerCharacter, shareBodyText, shareSessionLabel } from "./share";
import type { CampaignStore } from "./store";
import type { CampaignMaps, Id, RecapLine, RecapLink, RecapSection, RecapSpan, Session, SessionRecap } from "./types";
import { canSee, findEntityType, projectCampaignForViewer, type ModuleTypes } from "./visibility";

/** A module as the recap reads it. */
export type RecapModule = ModuleTypes & Partial<Pick<GameModule, "recap" | "arcs">>;

export const DEFAULT_RECAP_SPAN: RecapSpan = { kind: "last" };

/** The group of players: what every player may see. */
const GROUP = { role: "player" } as const;

const isRec = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const humanize = (s: string): string => s.replace(/[-_]+/g, " ").replace(/([a-z])([A-Z])/g, "$1 $2").replace(/^./, (c) => c.toUpperCase());
const byName = <T extends { name: string; id: string }>(a: T, b: T) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id);
const list = (parts: string[]) => (parts.length <= 1 ? (parts[0] ?? "") : `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`);
const clip = (s: string, n: number) => (s.length <= n ? s : `${s.slice(0, n - 1).trimEnd()}…`);
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "7 Nov 2026" from an ISO date (the date as given, no time zone shift). */
export function recapDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return iso;
  return `${Number(m[3])} ${MONTHS[Number(m[2]) - 1] ?? m[2]} ${m[1]}`;
}

/** "Since last session", "The last 3 sessions", "The story so far". */
export function recapSpanLabel(span: RecapSpan): string {
  if (span.kind === "all") return "The story so far";
  if (span.kind === "last-n" && span.n > 1) return `The last ${span.n} sessions`;
  return "Since last session";
}

/** The sessions before this one that have been played (running or done), oldest first. */
function playedBefore(maps: Pick<CampaignMaps, "sessions">, target: Session): Session[] {
  return Object.values(maps.sessions)
    .filter((s) => s.id !== target.id && s.status !== "planned" && s.number < target.number)
    .sort((a, b) => a.number - b.number || a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
}

/** The sessions a recap of `sessionId` covers, oldest first. */
export function recapSessions(maps: Pick<CampaignMaps, "sessions">, sessionId: Id, span: RecapSpan = DEFAULT_RECAP_SPAN): Session[] {
  const target = maps.sessions[sessionId];
  if (!target) throw new Error(`sessions/${sessionId} not found`);
  const before = playedBefore(maps, target);
  if (span.kind === "all") return before;
  const n = span.kind === "last-n" ? Math.max(1, Math.floor(span.n)) : 1;
  return before.slice(-n);
}

/** Records changed at or after this instant count as "since": when the first covered session was set up. Undefined for the story so far. */
export function recapSince(covered: readonly Pick<Session, "created">[], span: RecapSpan): string | undefined {
  if (span.kind === "all" || covered.length === 0) return undefined;
  return covered.reduce((min, s) => (s.created < min ? s.created : min), covered[0]!.created);
}

const sessionRef = (s: Session): RecapSessionRef => ({ id: s.id, number: s.number, date: s.date, label: shareSessionLabel(s), ...(s.title ? { title: s.title } : {}) });

// ---------------------------------------------------------------------------
// snapshots
// ---------------------------------------------------------------------------

export interface RecapSnapshotInput {
  maps: CampaignMaps;
  module: RecapModule | undefined;
  sessionId: Id;
  span?: RecapSpan;
  audience: RecapAudience;
}

/** Heat when the latest earlier session's recap was made (its baseline), by faction id. */
function heatBaseline(maps: CampaignMaps, target: Session): Record<Id, number> | undefined {
  const earlier = Object.values(maps.sessions)
    .filter((s) => s.id !== target.id && s.number < target.number && s.recap?.baseline?.heat)
    .sort((a, b) => b.number - a.number);
  return earlier[0]?.recap?.baseline?.heat;
}

/**
 * What a module's recap contributor reads (see the sdk's `RecapSnapshot`).
 * The players' snapshot is copied field by field from the group's player
 * projection; it holds nothing a player may not see.
 */
export function recapSnapshot(input: RecapSnapshotInput): RecapSnapshot {
  const { maps, module, sessionId, audience } = input;
  const span = input.span ?? DEFAULT_RECAP_SPAN;
  const target = maps.sessions[sessionId];
  if (!target) throw new Error(`sessions/${sessionId} not found`);
  const covered = recapSessions(maps, sessionId, span);
  const coveredIds = new Set(covered.map((s) => s.id));
  const since = recapSince(covered, span);
  const inWindow = (at: string | undefined, session?: Id) => (session !== undefined && coveredIds.has(session)) || since === undefined || (!!at && at >= since);
  const gm = audience === "gm";
  const view = gm ? maps : projectCampaignForViewer(maps, module, GROUP);
  const def = module?.arcs;

  const entities: RecapEntity[] = Object.values(view.entities)
    .sort(byName)
    .map((e) => {
      const out: RecapEntity = { id: e.id, type: e.type, name: e.name, fields: clone(e.fields), created: e.created, updated: e.updated };
      if (e.subtype) out.subtype = e.subtype;
      const kind = findEntityType(module, e.type)?.kind;
      if (kind) out.kind = kind;
      if (e.summary) out.summary = e.summary;
      if (isPlayerCharacter(e, module)) out.pc = true;
      if (gm) out.visibility = e.visibility.level;
      const c = e.contact;
      if (c) {
        const contact: NonNullable<RecapEntity["contact"]> = { since: c.since, favours: { owedToCrew: c.favours?.owedToCrew ?? 0, owedByCrew: c.favours?.owedByCrew ?? 0 } };
        if (c.foundAt) contact.foundAt = c.foundAt;
        if (gm) {
          contact.stance = c.stance;
          if (c.lastSeen) contact.lastSeen = { ...(c.lastSeen.job ? { job: c.lastSeen.job } : {}), ...(c.lastSeen.session ? { session: c.lastSeen.session } : {}) };
          if (c.betrayer) contact.betrayer = true;
        }
        out.contact = contact;
      }
      const conditions = (e.conditions ?? []).map((x) => x.label).filter(Boolean);
      if (conditions.length) out.conditions = conditions;
      return out;
    });
  const visible = new Set(entities.map((e) => e.id));

  const reveals: RecapSnapshot["reveals"] = [];
  for (const s of covered) {
    for (const r of s.reveals ?? []) {
      if (!gm) {
        if (r.handout && !view.handouts[r.handout]) continue;
        if (r.entity) {
          const p = view.entities[r.entity];
          if (!p || (r.field && getPath(p.fields, r.field) === undefined)) continue;
        }
        if (!r.handout && !r.entity) continue;
      }
      reveals.push({ session: s.id, ...(r.entity ? { entity: r.entity } : {}), ...(r.field ? { field: r.field } : {}), ...(r.handout ? { handout: r.handout } : {}) });
    }
  }

  const clues: RecapClue[] = [];
  for (const t of threadsInOrder(Object.values(maps.arcs ?? {}))) {
    for (const { clue } of cluesOf(t)) {
      const kindLabel = clueKindLabel(def, clue.kind);
      if (gm) {
        const c: RecapClue = { thread: t.id, threadTitle: t.title, clue: clue.id, kind: clue.kind, kindLabel, text: clue.text, state: clue.state };
        if (clue.found?.session) c.foundIn = clue.found.session;
        if (clue.found?.at) c.foundAt = clue.found.at;
        if (clue.found?.job) c.job = clue.found.job;
        if (clue.found?.entity) c.entity = clue.found.entity;
        if (clue.seeded) c.seeded = { ...(clue.seeded.job ? { job: clue.seeded.job } : {}), ...(clue.seeded.entity ? { entity: clue.seeded.entity } : {}), ...(clue.seeded.slotLabel ? { slotLabel: clue.seeded.slotLabel } : {}) };
        clues.push(c);
        continue;
      }
      // players: found clues the whole crew learnt, under the thread's player title, in its player text
      if (!clueVisibleTo(clue, GROUP)) continue;
      const c: RecapClue = { thread: t.id, threadTitle: t.playerTitle.trim() || "A loose thread", clue: clue.id, kind: clue.kind, kindLabel, text: clue.playerText, state: "found" };
      if (clue.found?.session && maps.sessions[clue.found.session]) c.foundIn = clue.found.session;
      if (clue.found?.at) c.foundAt = clue.found.at;
      const job = clue.found?.job ?? clue.seeded?.job;
      if (job && visible.has(job)) c.job = job;
      if (clue.found?.entity && visible.has(clue.found.entity)) c.entity = clue.found.entity;
      clues.push(c);
    }
  }

  const ticks: RecapSnapshot["ticks"] = [];
  const payoffs: RecapSnapshot["payoffs"] = [];
  const heat: RecapSnapshot["heat"] = [];
  if (gm) {
    for (const t of threadsInOrder(Object.values(maps.arcs ?? {}))) {
      for (const x of t.clock.log) {
        if (!inWindow(x.at, x.session)) continue;
        const reached = t.clock.milestones.filter((m) => m.reached && inWindow(m.reached)).map((m) => ({ at: m.at, text: m.text }));
        ticks.push({ thread: t.id, threadTitle: t.title, by: x.by, how: x.how, at: x.at, filled: t.clock.filled, segments: t.clock.segments, reached, ...(x.session ? { session: x.session } : {}), ...(x.ignored ? { ignored: true } : {}), ...(x.note ? { note: x.note } : {}) });
      }
      for (const p of pendingPayoffs(t)) payoffs.push({ thread: t.id, threadTitle: t.title, milestone: p.milestone, kind: p.kind, label: payoffLabel(def, p.kind), text: p.text });
    }
    const before = heatBaseline(maps, target);
    if (def?.heat) {
      for (const e of Object.values(maps.entities).filter((x) => carriesHeat(def, x)).sort(byName)) {
        const h = heatOf(def, e);
        const was = before?.[e.id];
        if (h === 0 && (was === undefined || was === 0)) continue;
        heat.push({ id: e.id, name: e.name, heat: h, label: heatLabel(def, h), ...(was !== undefined ? { before: was, beforeLabel: heatLabel(def, was) } : {}) });
      }
    }
  }

  const ledgerAll = Object.values(view.ledger ?? {});
  const ledger = ledgerAll
    .filter((l) => inWindow(l.created, l.links?.session))
    .sort((a, b) => (a.inWorldDate ?? "").localeCompare(b.inWorldDate ?? "") || a.created.localeCompare(b.created) || a.id.localeCompare(b.id))
    .map((l) => ({ id: l.id, amount: l.amount, category: l.category, created: l.created, ...(l.note ? { note: l.note } : {}), ...(l.account ? { account: l.account } : {}), ...(l.links?.job ? { job: l.links.job } : {}), ...(l.inWorldDate ? { inWorldDate: l.inWorldDate } : {}) }));
  const balance = ledgerAll.filter((l) => !l.account).reduce((n, l) => n + (Number.isFinite(l.amount) ? l.amount : 0), 0);

  const travel = Object.values(view.travel ?? {})
    .filter((t) => inWindow(t.created, t.session))
    .sort((a, b) => a.created.localeCompare(b.created) || a.id.localeCompare(b.id))
    .map((t) => ({
      id: t.id,
      toName: t.toName,
      status: t.status,
      created: t.created,
      ...(t.ship && (gm || visible.has(t.ship)) ? { ship: t.ship } : {}),
      ...(t.fromName ? { fromName: t.fromName } : {}),
      ...(t.departDate ? { departDate: t.departDate } : {}),
      ...(t.arriveDate ? { arriveDate: t.arriveDate } : {}),
      ...(t.summary ? { summary: t.summary } : {}),
      ...(t.session && coveredIds.has(t.session) ? { session: t.session } : {}),
    }));

  const hunts: RecapSnapshot["hunts"] = [];
  for (const m of Object.values(view.maps).sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id))) {
    const raw = maps.maps[m.id]?.live?.hunt;
    if (!raw || (raw.step === 0 && raw.tokens.length === 0)) continue;
    if (gm) {
      hunts.push({ map: m.id, mapName: m.name, step: raw.step, tokens: raw.tokens.map((t) => ({ id: t.id, label: t.label, state: t.state, ...(t.hurt ? { hurt: true } : {}) })) });
      continue;
    }
    // players: the threats on their own map (the projection keeps only those revealed as seen)
    const shown = new Map((m.live?.tokens ?? []).map((t) => [t.id, t.label] as const));
    const tokens = raw.tokens.filter((t) => t.state === "seen" && shown.has(t.id)).map((t) => ({ id: t.id, label: shown.get(t.id)!, state: "seen" as const }));
    if (tokens.length) hunts.push({ map: m.id, mapName: m.name, step: raw.step, tokens });
  }

  return {
    audience,
    mode: maps.meta.mode,
    campaign: maps.meta.name,
    session: sessionRef(target),
    sessions: covered.map(sessionRef),
    ...(since ? { since } : {}),
    settings: gm ? clone(maps.meta.settings ?? {}) : {},
    entities,
    relationships: Object.values(view.relationships)
      .map((r) => ({ type: r.type, from: r.from, to: r.to }))
      .sort((a, b) => a.from.localeCompare(b.from) || a.to.localeCompare(b.to) || a.type.localeCompare(b.type)),
    reveals,
    clues,
    ticks,
    payoffs,
    heat,
    ledger,
    balance,
    travel,
    hunts,
  };
}

// ---------------------------------------------------------------------------
// the core sections
// ---------------------------------------------------------------------------

const SECTION_TITLES: Record<RecapAudience, Partial<Record<keyof typeof RECAP_SECTION_ORDER, string>>> = {
  gm: {
    story: "Last time",
    world: "In the world",
    scenes: "Scenes run",
    revealed: "Revealed and handed out",
    met: "New in the story",
    rewards: "Rewards",
    table: "At the table",
    wrapup: "Wrap-up answers",
    "loose-ends": "Loose ends",
    secrets: "What the players don't know",
    notes: "Your notes",
  },
  players: {
    story: "Last time",
    world: "In the world",
    revealed: "What you found",
    met: "Who and where",
    notes: "Also",
  },
};

/** The title a section takes in this audience's recap. */
export function recapSectionTitle(audience: RecapAudience, id: string, fallback?: string): string {
  return SECTION_TITLES[audience][id as keyof typeof RECAP_SECTION_ORDER] ?? fallback ?? humanize(id);
}

/** A short stable hash (for lines keyed by their text, e.g. loose ends). */
function hash(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  return h.toString(36);
}

/** The label of a field on an entity's sheet, else the path made readable. */
function fieldLabel(module: RecapModule | undefined, type: string, path: string): string {
  const def = findEntityType(module, type);
  for (const s of def?.sheet.sections ?? []) for (const f of s.fields) if (f.path === path && f.label) return f.label;
  return humanize(path.split(".").pop() ?? path);
}

interface CoreInput {
  maps: CampaignMaps;
  module: RecapModule | undefined;
  target: Session;
  covered: Session[];
  snapshot: RecapSnapshot;
  doc?: ((id: Id) => Y.Doc | undefined) | undefined;
}

const entityLink = (e: { id: Id; name: string }): RecapLinkRef => ({ kind: "entity", id: e.id, label: e.name });

/** "Mara Quill: contact for the client" (the summary left out when it only repeats the name). */
const metText = (e: Pick<RecapEntity, "name" | "summary">) => {
  const summary = e.summary?.trim().replace(/\.$/, "");
  return summary && !summary.toLowerCase().startsWith(e.name.toLowerCase()) ? `${e.name}: ${summary}` : e.name;
};

/** Lines of a log body worth reading back: its first paragraphs, as plain text. */
function logHighlights(doc: Y.Doc | undefined, names: Map<Id, string>): string[] {
  const text = shareBodyText(doc, names);
  if (!text) return [];
  return text
    .split(/\n+/)
    .map((l) => l.replace(/^[-*>#\s]+/, "").replace(/\*\*|__|`/g, "").trim())
    .filter((l) => l.length > 0)
    .slice(0, 2)
    .map((l) => clip(l, 220));
}

function coreGmSections(x: CoreInput): RecapSectionDraft[] {
  const { maps, module, target, covered, snapshot } = x;
  const coveredIds = new Set(covered.map((s) => s.id));
  const name = (id: Id) => maps.entities[id]?.name;
  const sections: RecapSectionDraft[] = [];
  const add = (id: keyof typeof RECAP_SECTION_ORDER, lines: RecapLineDraft[]) => {
    if (lines.length) sections.push({ id, title: recapSectionTitle("gm", id), audience: "gm", order: RECAP_SECTION_ORDER[id], lines });
  };

  // the sessions covered, with their summaries and the start of their logs
  const story: RecapLineDraft[] = [];
  const names = new Map(Object.values(maps.entities).map((e) => [e.id, e.name] as const));
  for (const s of covered) {
    const label = shareSessionLabel(s);
    const summary = s.summary?.trim();
    story.push({ key: "session", ref: s.id, text: summary ? `${label} (${recapDate(s.date)}): ${summary}` : `${label} (${recapDate(s.date)}). No summary was written at the wrap-up.`, links: [{ kind: "session", id: s.id, label }] });
    if (x.doc) for (const [i, l] of logHighlights(x.doc(s.logDoc), names).entries()) story.push({ key: `log:${i}`, ref: s.id, text: `From the log: ${l}` });
  }
  add("story", story);

  // the world: timeline entries of the covered sessions (or made since)
  const world = Object.values(maps.timeline)
    .filter((t) => (t.session && coveredIds.has(t.session)) || (snapshot.since !== undefined && t.created >= snapshot.since))
    .sort((a, b) => a.inWorldDate.localeCompare(b.inWorldDate) || a.created.localeCompare(b.created) || a.id.localeCompare(b.id))
    .map((t) => ({ key: "timeline", ref: t.id, text: `${t.inWorldDate}: ${t.text}${canSee(t.visibility, GROUP) ? "" : " (GM only)"}` }));
  add("world", world);

  // scenes run
  const scenes: RecapLineDraft[] = [];
  const seenScenes = new Set<Id>();
  for (const s of covered)
    for (const id of s.scenesRun) {
      const scene = maps.scenes[id];
      if (!scene || seenScenes.has(id)) continue;
      seenScenes.add(id);
      scenes.push({ key: "scene", ref: id, text: `${scene.title}${covered.length > 1 ? ` (Session ${s.number})` : ""}`, links: [{ kind: "scene", id, label: scene.title }] });
    }
  add("scenes", scenes);

  // revealed in the covered sessions, and handouts given to a character's player since
  const revealed: RecapLineDraft[] = [];
  const doneHandouts = new Set<Id>();
  const doneReveals = new Set<string>();
  for (const r of snapshot.reveals) {
    const k = `${r.handout ?? ""}|${r.entity ?? ""}|${r.field ?? ""}`;
    if (doneReveals.has(k)) continue;
    doneReveals.add(k);
    if (r.handout) {
      const h = maps.handouts[r.handout];
      if (!h || doneHandouts.has(h.id)) continue;
      doneHandouts.add(h.id);
      revealed.push({ key: "handout", ref: h.id, text: `Handout shown to the players: “${h.title}”.`, links: [{ kind: "handout", id: h.id, label: h.title }] });
    } else if (r.entity) {
      const e = maps.entities[r.entity];
      if (!e) continue;
      revealed.push({
        key: r.field ? `reveal:${r.field}` : "reveal",
        ref: e.id,
        text: r.field ? `Revealed: ${e.name}'s ${fieldLabel(module, e.type, r.field).toLowerCase()}.` : `Revealed: ${e.name}.`,
        links: [entityLink(e)],
      });
    }
  }
  for (const h of Object.values(maps.handouts).sort((a, b) => a.title.localeCompare(b.title) || a.id.localeCompare(b.id))) {
    if (doneHandouts.has(h.id)) continue;
    if (h.revealedIn && coveredIds.has(h.revealedIn)) {
      doneHandouts.add(h.id);
      revealed.push({ key: "handout", ref: h.id, text: `Handout shown to the players: “${h.title}”.`, links: [{ kind: "handout", id: h.id, label: h.title }] });
    }
  }
  add("revealed", revealed);

  // who and what is new: people, places and factions added since (for the story so far, the ones the players know)
  const met = snapshot.entities
    .filter((e) => !e.pc && !e.contact && (e.kind === "character" || e.kind === "location" || e.kind === "faction"))
    .filter((e) => (snapshot.since !== undefined ? e.created >= snapshot.since : e.visibility !== "gm"))
    .slice(0, 12)
    .map((e) => ({ key: "met", ref: e.id, text: `${metText(e)}${e.visibility === "gm" ? " (GM only)" : ""}.`, links: [entityLink(e)] }));
  add("met", met);

  // rewards
  const rewards: RecapLineDraft[] = [];
  for (const s of covered)
    s.rewards.forEach((r, i) => {
      const who = name(r.characterId) ?? "Someone";
      const value = r.value !== undefined && r.value !== null && r.value !== "" ? ` ${String(r.value)}` : "";
      rewards.push({ key: `reward:${i}`, ref: s.id, text: `${who}: ${r.kind}${value}${r.note ? ` (${r.note})` : ""}.`, links: maps.entities[r.characterId] ? [{ kind: "entity", id: r.characterId, label: who }] : [] });
    });
  add("rewards", rewards);

  // who was there
  const table: RecapLineDraft[] = [];
  for (const s of covered) {
    const who = s.attendees.map((id) => maps.meta.members.find((m) => m.id === id)).filter((m) => m && m.role === "player").map((m) => m!.name);
    if (who.length) table.push({ key: "attendees", ref: s.id, text: `${covered.length > 1 ? `Session ${s.number}: ` : ""}${list(who)} played.` });
  }
  add("table", table);

  // the wrap-up's answers
  const wrapup: RecapLineDraft[] = [];
  for (const s of covered) {
    const answers = isRec(s.wrapUp) && isRec(s.wrapUp.answers) ? s.wrapUp.answers : {};
    for (const [id, a] of Object.entries(answers).sort(([x], [y]) => x.localeCompare(y))) {
      if (!isRec(a)) continue;
      const label = typeof a.label === "string" && a.label ? a.label : typeof a.value === "string" || typeof a.value === "number" ? String(a.value) : a.value === true ? "Yes" : "";
      if (label) wrapup.push({ key: `answer:${id}`, ref: s.id, text: label.endsWith(".") ? label : `${label}.` });
    }
  }
  add("wrapup", wrapup);

  // loose ends carried forward, and the plan already on this session
  const loose: RecapLineDraft[] = [];
  const seenText = new Set<string>();
  const pushLoose = (t: unknown) => {
    if (typeof t !== "string" || !t.trim() || seenText.has(t.trim())) return;
    seenText.add(t.trim());
    loose.push({ key: `loose:${hash(t.trim())}`, text: t.trim() });
  };
  for (const s of covered) if (isRec(s.wrapUp) && Array.isArray(s.wrapUp.looseEnds)) s.wrapUp.looseEnds.forEach(pushLoose);
  target.nextPlan.forEach(pushLoose);
  add("loose-ends", loose);

  // what the players don't know (generic): clues placed in the crew's way and not found yet
  const secrets: RecapLineDraft[] = [];
  for (const c of snapshot.clues) {
    if (c.state !== "seeded") continue;
    const where = c.seeded?.job ? name(c.seeded.job) : undefined;
    const holder = c.seeded?.entity ? name(c.seeded.entity) : undefined;
    const place = [where ? `in ${where}` : "", holder ? `with ${holder}` : "", c.seeded?.slotLabel ? `(${c.seeded.slotLabel.toLowerCase()})` : ""].filter(Boolean).join(" ");
    const links: RecapLinkRef[] = [{ kind: "thread", id: c.thread, label: c.threadTitle }];
    if (where) links.push({ kind: "entity", id: c.seeded!.job!, label: where });
    if (holder) links.push({ kind: "entity", id: c.seeded!.entity!, label: holder });
    secrets.push({ key: "seeded-clue", ref: c.clue, text: `Waiting to be found, ${c.threadTitle}: ${c.text.replace(/\.$/, "")}${place ? `, ${place}` : ""}.`, links });
  }
  for (const e of snapshot.entities) if (e.contact?.betrayer) secrets.push({ key: "betrayer-contact", ref: e.id, text: `${e.name} turned on the crew once and is still about.`, links: [entityLink(e)] });
  add("secrets", secrets);
  return sections;
}

function corePlayerSections(x: CoreInput): RecapSectionDraft[] {
  const { maps, covered, snapshot, module } = x;
  const view = projectCampaignForViewer(maps, module, GROUP);
  const sections: RecapSectionDraft[] = [];
  const add = (id: keyof typeof RECAP_SECTION_ORDER, lines: RecapLineDraft[]) => {
    if (lines.length) sections.push({ id, title: recapSectionTitle("players", id), audience: "players", order: RECAP_SECTION_ORDER[id], lines });
  };
  const coveredIds = new Set(covered.map((s) => s.id));

  // the opening line: which sessions this covers (session numbers and titles, as shares name them)
  const first = snapshot.sessions[0];
  const last = snapshot.sessions[snapshot.sessions.length - 1];
  let opening: string;
  if (!first || !last) opening = `Previously on ${snapshot.campaign}: nothing yet. This is where the story begins.`;
  else if (snapshot.sessions.length === 1) opening = `Previously on ${snapshot.campaign}, in ${first.label}.`;
  else opening = `${x.snapshot.since === undefined ? `The story of ${snapshot.campaign} so far` : `Previously on ${snapshot.campaign}`}, from Session ${first.number} to Session ${last.number}.`;
  add("story", [{ key: "opening", text: opening }]);

  // the world: timeline entries the players may see
  const world = Object.values(view.timeline)
    .filter((t) => (t.session && coveredIds.has(t.session)) || (snapshot.since !== undefined && t.created >= snapshot.since))
    .sort((a, b) => a.inWorldDate.localeCompare(b.inWorldDate) || a.created.localeCompare(b.created) || a.id.localeCompare(b.id))
    .map((t) => ({ key: "timeline", ref: t.id, text: t.text }));
  add("world", world);

  // what they found: handouts and records revealed to them
  const found: RecapLineDraft[] = [];
  const doneHandouts = new Set<Id>();
  const doneReveals = new Set<string>();
  for (const r of snapshot.reveals) {
    const k = `${r.handout ?? ""}|${r.entity ?? ""}|${r.field ?? ""}`;
    if (doneReveals.has(k)) continue;
    doneReveals.add(k);
    if (r.handout) {
      const h = view.handouts[r.handout];
      if (!h || doneHandouts.has(h.id)) continue;
      doneHandouts.add(h.id);
      found.push({ key: "handout", ref: h.id, text: `“${h.title}”.`, links: [{ kind: "handout", id: h.id, label: h.title }] });
    } else if (r.entity) {
      const e = view.entities[r.entity];
      if (!e) continue;
      found.push({
        key: r.field ? `reveal:${r.field}` : "reveal",
        ref: e.id,
        text: r.field ? `You learnt ${e.name}'s ${fieldLabel(module, e.type, r.field).toLowerCase()}.` : `You learnt about ${e.name}.`,
        links: [entityLink(e)],
      });
    }
  }
  for (const h of Object.values(view.handouts).sort((a, b) => a.title.localeCompare(b.title) || a.id.localeCompare(b.id))) {
    if (doneHandouts.has(h.id) || !h.revealedIn || !coveredIds.has(h.revealedIn) || !canSee(h.visibility, GROUP)) continue;
    doneHandouts.add(h.id);
    found.push({ key: "handout", ref: h.id, text: `“${h.title}”.`, links: [{ kind: "handout", id: h.id, label: h.title }] });
  }
  add("revealed", found);

  // who and where: people, places and factions they know of, new since
  const met = snapshot.entities
    .filter((e) => !e.pc && !e.contact && (e.kind === "character" || e.kind === "location" || e.kind === "faction"))
    .filter((e) => snapshot.since === undefined || e.created >= snapshot.since)
    .slice(0, 12)
    .map((e) => ({ key: "met", ref: e.id, text: `${metText(e)}.`, links: [entityLink(e)] }));
  add("met", met);
  return sections;
}

// ---------------------------------------------------------------------------
// building, merging, the players' view
// ---------------------------------------------------------------------------

export interface BuildRecapInput {
  maps: CampaignMaps;
  module: RecapModule | undefined;
  sessionId: Id;
  span?: RecapSpan;
  /** When it was generated (ISO). */
  at: string;
  /** Session log bodies, for a line or two from each covered session's log (GM only). */
  doc?: ((id: Id) => Y.Doc | undefined) | undefined;
  /** An earlier recap whose switches, edits and own lines to keep (default: the one on the session). Pass null to start fresh. */
  previous?: SessionRecap | null;
}

const lineId = (l: { key: string; ref?: string | undefined }) => `${l.key}|${l.ref ?? ""}`;

function toSections(drafts: RecapSectionDraft[], audience: RecapAudience, source: string, allowedLinks?: (l: RecapLinkRef) => boolean): RecapSection[] {
  const out: RecapSection[] = [];
  for (const d of drafts) {
    if (!isRec(d) || d.audience !== audience || typeof d.id !== "string" || !Array.isArray(d.lines)) continue;
    const lines: RecapLine[] = [];
    const ids = new Set<string>();
    for (const l of d.lines) {
      if (!isRec(l) || typeof l.key !== "string" || typeof l.text !== "string" || !l.text.trim()) continue;
      const id = lineId(l);
      if (ids.has(id)) continue;
      ids.add(id);
      const line: RecapLine = { key: l.key, text: l.text.trim() };
      if (typeof l.ref === "string" && l.ref) line.ref = l.ref;
      const links = (Array.isArray(l.links) ? l.links : []).filter((k): k is RecapLinkRef => isRec(k) && typeof k.id === "string" && typeof k.label === "string" && !!k.label && (!allowedLinks || allowedLinks(k)));
      if (links.length) line.links = links.map((k) => ({ kind: k.kind, id: k.id, label: k.label }));
      lines.push(line);
    }
    if (!lines.length) continue;
    const order = typeof d.order === "number" && Number.isFinite(d.order) ? d.order : (RECAP_SECTION_ORDER[d.id as keyof typeof RECAP_SECTION_ORDER] ?? RECAP_MODULE_ORDER);
    out.push({ id: d.id, title: typeof d.title === "string" && d.title ? d.title : recapSectionTitle(audience, d.id), source, order, lines });
  }
  return out;
}

/** Merge sections with the same id (the first one's title, source and order), sorted by order. */
function mergeSameId(sections: RecapSection[]): RecapSection[] {
  const out: RecapSection[] = [];
  for (const s of sections) {
    const into = out.find((x) => x.id === s.id);
    if (!into) {
      out.push({ ...s, lines: [...s.lines] });
      continue;
    }
    const have = new Set(into.lines.map(lineId));
    for (const l of s.lines) if (!have.has(lineId(l))) into.lines.push(l);
  }
  return out.sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
}

/**
 * The recap for a session, built from the campaign: the core sections and
 * each module contributor's, for the GM and for the players, merged with the
 * previous recap's switches, edits and GM lines. Pure: same input, same recap.
 */
export function buildSessionRecap(input: BuildRecapInput): SessionRecap {
  const { maps, module, sessionId } = input;
  const target = maps.sessions[sessionId];
  if (!target) throw new Error(`sessions/${sessionId} not found`);
  const span = input.span ?? input.previous?.span ?? target.recap?.span ?? DEFAULT_RECAP_SPAN;
  const covered = recapSessions(maps, sessionId, span);
  const contributors = (module?.recap?.contributors ?? []).filter((c) => !c.mode || c.mode.length === 0 || c.mode.includes(maps.meta.mode));

  const build = (audience: RecapAudience): RecapSection[] => {
    const snapshot = recapSnapshot({ maps, module, sessionId, span, audience });
    const core: CoreInput = { maps, module, target, covered, snapshot, doc: audience === "gm" ? input.doc : undefined };
    const sections = toSections(audience === "gm" ? coreGmSections(core) : corePlayerSections(core), audience, "core");
    // players' links: only to what the players can see (their entities and handouts, the covered sessions)
    const allowed =
      audience === "players"
        ? (() => {
            const ids = new Set<string>([...snapshot.entities.map((e) => e.id), ...snapshot.sessions.map((s) => s.id), ...snapshot.reveals.flatMap((r) => (r.handout ? [r.handout] : []))]);
            const handouts = new Set(Object.keys(projectCampaignForViewer(maps, module, GROUP).handouts));
            return (l: RecapLinkRef) => (l.kind === "entity" || l.kind === "session" ? ids.has(l.id) : l.kind === "handout" ? handouts.has(l.id) : false);
          })()
        : undefined;
    for (const c of contributors) {
      let drafts: RecapSectionDraft[] = [];
      try {
        drafts = c.build(snapshot);
      } catch {
        drafts = [];
      }
      sections.push(...toSections(Array.isArray(drafts) ? drafts : [], audience, c.id, allowed));
    }
    return mergeSameId(sections);
  };

  const fresh: SessionRecap = { span: clone(span), sessions: covered.map((s) => s.id), generated: input.at, gm: build("gm"), players: build("players") };
  const def = module?.arcs;
  if (def?.heat) {
    const heat: Record<Id, number> = {};
    for (const e of Object.values(maps.entities).filter((x) => carriesHeat(def, x)).sort(byName)) heat[e.id] = heatOf(def, e);
    fresh.baseline = { heat };
  }
  const previous = input.previous === null ? undefined : (input.previous ?? target.recap);
  return previous ? mergeRecap(previous, fresh) : fresh;
}

function mergeSide(prev: RecapSection[], fresh: RecapSection[], audience: RecapAudience): RecapSection[] {
  const out = fresh.map((s) => ({ ...s, lines: s.lines.map((l) => ({ ...l })) }));
  const freshIds = new Set(out.flatMap((s) => s.lines.map((l) => `${s.id}#${lineId(l)}`)));
  for (const ps of prev) {
    let into = out.find((s) => s.id === ps.id);
    for (const pl of ps.lines) {
      const id = lineId(pl);
      const match = into?.lines.find((l) => lineId(l) === id);
      if (match && !pl.custom) {
        if (pl.off) match.off = true;
        if (pl.edited) {
          match.text = pl.text;
          match.edited = true;
        }
        continue;
      }
      // the GM's own lines stay; a rewritten line whose source is gone stays as the GM's line
      if (!pl.custom && !pl.edited) continue;
      if (freshIds.has(`${ps.id}#${id}`)) continue;
      if (!into) {
        into = { id: ps.id, title: ps.title || recapSectionTitle(audience, ps.id), source: ps.source, order: ps.order, lines: [] };
        out.push(into);
      }
      const kept: RecapLine = { key: pl.key, text: pl.text, custom: true };
      if (pl.ref) kept.ref = pl.ref;
      if (pl.off) kept.off = true;
      into.lines.push(kept);
    }
  }
  return out.sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
}

/**
 * A regenerated recap with the GM's work kept: each line keeps its on/off
 * switch and, when the GM rewrote it, the GM's text; lines the GM added stay
 * in their section; a rewritten line the data no longer produces stays as a
 * GM line. Whether it is shown on the player screen is kept too.
 */
export function mergeRecap(previous: SessionRecap, fresh: SessionRecap): SessionRecap {
  const out: SessionRecap = { ...fresh, gm: mergeSide(previous.gm ?? [], fresh.gm, "gm"), players: mergeSide(previous.players ?? [], fresh.players, "players") };
  if (previous.shown) out.shown = previous.shown;
  return out;
}

/** A recap section as the players get it: title and the lines switched on. */
export interface PlayerRecapSection {
  id: string;
  title: string;
  lines: Array<{ text: string; links?: RecapLink[] }>;
}

export interface PlayerRecap {
  campaign: string;
  /** "Previously on Skyfire Down". */
  title: string;
  session: { id: Id; number: number; label: string };
  sections: PlayerRecapSection[];
  shown?: string;
}

/**
 * The read-aloud as the players may get it, or undefined when there is
 * none (or nothing switched on), or when `requireShown` and the GM has not
 * shown it. Only the players' sections; switched-off lines left out; links
 * kept only to entities, handouts and sessions the players can see now, and
 * a generated line whose entity the players can no longer see is left out
 * (the GM's own and rewritten lines are the GM's words and stay).
 */
export function playerRecap(maps: CampaignMaps, module: RecapModule | undefined, sessionId: Id, opts: { requireShown?: boolean } = {}): PlayerRecap | undefined {
  const session = maps.sessions[sessionId];
  const recap = session?.recap;
  if (!session || !recap) return undefined;
  if (opts.requireShown && !recap.shown) return undefined;
  const view = projectCampaignForViewer(maps, module, GROUP);
  const sessions = new Set([sessionId, ...(recap.sessions ?? [])]);
  const ok = (l: RecapLink) => (l.kind === "entity" ? !!view.entities[l.id] : l.kind === "handout" ? !!view.handouts[l.id] : l.kind === "session" ? sessions.has(l.id) && !!maps.sessions[l.id] : false);
  const sections: PlayerRecapSection[] = [];
  for (const s of recap.players ?? []) {
    const lines: PlayerRecapSection["lines"] = [];
    for (const l of s.lines) {
      if (l.off || !l.text.trim()) continue;
      const gmWords = l.custom || l.edited;
      if (!gmWords && (l.links ?? []).some((k) => k.kind === "entity" && !view.entities[k.id])) continue;
      const links = (l.links ?? []).filter(ok).map((k) => ({ ...k }));
      lines.push({ text: l.text, ...(links.length ? { links } : {}) });
    }
    if (lines.length) sections.push({ id: s.id, title: s.title, lines });
  }
  if (!sections.length) return undefined;
  const out: PlayerRecap = { campaign: maps.meta.name, title: `Previously on ${maps.meta.name}`, session: { id: session.id, number: session.number, label: shareSessionLabel(session) }, sections };
  if (recap.shown) out.shown = recap.shown;
  return out;
}

/** Recap sections as Markdown (shares, packets, copying): a heading per section, a bullet per line switched on. */
export function recapMarkdown(sections: ReadonlyArray<{ title: string; lines: ReadonlyArray<{ text: string; off?: boolean }> }>): string {
  const out: string[] = [];
  for (const s of sections) {
    const lines = s.lines.filter((l) => !l.off && l.text.trim());
    if (!lines.length) continue;
    out.push(`## ${s.title}`, "", ...lines.map((l) => `- ${l.text}`), "");
  }
  return out.join("\n").trim();
}

/** Recap sections as plain text to read aloud: one paragraph per section. */
export function recapReadAloud(sections: ReadonlyArray<{ lines: ReadonlyArray<{ text: string; off?: boolean }> }>): string {
  return sections
    .map((s) =>
      s.lines
        .filter((l) => !l.off && l.text.trim())
        .map((l) => l.text.trim())
        .join(" "),
    )
    .filter(Boolean)
    .join("\n\n");
}

// ---------------------------------------------------------------------------
// the stored draft
// ---------------------------------------------------------------------------

function sessionOf(store: CampaignStore, sessionId: Id): Session {
  const s = store.get("sessions", sessionId);
  if (!s) throw new Error(`sessions/${sessionId} not found`);
  return s;
}

function recapOf(store: CampaignStore, sessionId: Id): SessionRecap {
  const r = sessionOf(store, sessionId).recap;
  if (!r) throw new Error(`sessions/${sessionId} has no recap`);
  return clone(r);
}

export interface GenerateRecapOptions {
  span?: RecapSpan;
  at?: string;
  doc?: ((id: Id) => Y.Doc | undefined) | undefined;
}

/** Build (or rebuild) a session's recap from the campaign and store it, keeping the GM's switches, edits and own lines. */
export function generateSessionRecap(store: CampaignStore, module: RecapModule | undefined, sessionId: Id, opts: GenerateRecapOptions = {}): SessionRecap {
  sessionOf(store, sessionId);
  const recap = buildSessionRecap({ maps: store.toJSON(), module, sessionId, ...(opts.span ? { span: opts.span } : {}), at: opts.at ?? now(), doc: opts.doc });
  store.update("sessions", sessionId, { recap });
  return recap;
}

export interface RecapLineRef {
  audience: RecapAudience;
  section: string;
  key: string;
  ref?: string | undefined;
}

/** Switch a line on or off, or rewrite it (an empty text puts the generated text back on the next regenerate). Returns the stored recap. */
export function updateRecapLine(store: CampaignStore, sessionId: Id, at: RecapLineRef, patch: { off?: boolean; text?: string }): SessionRecap {
  const recap = recapOf(store, sessionId);
  const side = recap[at.audience];
  const section = side.find((s) => s.id === at.section);
  const line = section?.lines.find((l) => lineId(l) === lineId(at));
  if (!section || !line) throw new Error(`recap line ${at.section}/${lineId(at)} not found`);
  if (patch.off !== undefined) {
    if (patch.off) line.off = true;
    else delete line.off;
  }
  if (patch.text !== undefined && patch.text.trim() && patch.text.trim() !== line.text) {
    line.text = patch.text.trim();
    if (!line.custom) line.edited = true;
  }
  store.update("sessions", sessionId, { recap });
  return recap;
}

/** Add the GM's own line (to the "notes" section unless another is named). */
export function addRecapLine(store: CampaignStore, sessionId: Id, audience: RecapAudience, text: string, sectionId = "notes"): SessionRecap {
  const t = text.trim();
  if (!t) return recapOf(store, sessionId);
  const recap = recapOf(store, sessionId);
  const side = recap[audience];
  let section = side.find((s) => s.id === sectionId);
  if (!section) {
    section = { id: sectionId, title: recapSectionTitle(audience, sectionId), source: "gm", order: RECAP_SECTION_ORDER[sectionId as keyof typeof RECAP_SECTION_ORDER] ?? RECAP_MODULE_ORDER, lines: [] };
    side.push(section);
    side.sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
  }
  section.lines.push({ key: `custom:${newId()}`, text: t, custom: true });
  store.update("sessions", sessionId, { recap });
  return recap;
}

/** Remove one of the GM's own lines (generated lines are switched off instead). */
export function removeRecapLine(store: CampaignStore, sessionId: Id, at: RecapLineRef): SessionRecap {
  const recap = recapOf(store, sessionId);
  const side = recap[at.audience];
  for (const s of side) s.lines = s.lines.filter((l) => !(s.id === at.section && l.custom && lineId(l) === lineId(at)));
  recap[at.audience] = side.filter((s) => s.lines.length > 0);
  store.update("sessions", sessionId, { recap });
  return recap;
}

/** Put the read-aloud on the player screen (or take it off). */
export function showSessionRecap(store: CampaignStore, sessionId: Id, shown: boolean, at: string = now()): SessionRecap {
  const recap = recapOf(store, sessionId);
  if (shown) recap.shown = at;
  else delete recap.shown;
  store.update("sessions", sessionId, { recap });
  return recap;
}

/** Is there anything to recap: a played session before this one? */
export function hasRecapSource(maps: Pick<CampaignMaps, "sessions">, sessionId: Id): boolean {
  const s = maps.sessions[sessionId];
  return !!s && playedBefore(maps, s).length > 0;
}

/** Every recap line's text, for scans (tests) and search. */
export function recapTexts(recap: Pick<SessionRecap, "gm" | "players"> | undefined, audience?: RecapAudience): string[] {
  if (!recap) return [];
  const sides = audience ? [recap[audience]] : [recap.gm, recap.players];
  return sides.flatMap((side) => (side ?? []).flatMap((s) => [s.title, ...s.lines.map((l) => l.text)]));
}
