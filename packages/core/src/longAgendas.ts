/**
 * Long-term agendas (a procedure's `results.longAgendaDrafts`, see module-sdk
 * `LongAgendaDef`): a goal per character that lasts several jobs, a beat per
 * job and open friction lines. Game-agnostic: the module owns the record and
 * its meaning; this file only writes it where the def says, keeps the
 * character's summary field in step, and keeps two handouts per character:
 *
 *  - the agenda handout (kind "agenda", GM-only): the goal, this job's beat,
 *    the tension, the GM details and the beats so far: the GM's card. The
 *    character's player reads their agenda in their player packet instead,
 *    rendered from the record as their projection shows it (the fields the
 *    module marks owner-visible, see packets.ts); the GM can still give this
 *    card to them (`Handout.toOwner`);
 *  - the friction handout (kind "text", visible to the players): the lines
 *    that say whom the character clashes with and over what.
 *
 * Both are linked to the character (`character`) and found again by their
 * `purpose`. Handout bodies are rendered from the stored record, so they are
 * never the only copy of anything. Writing the bodies is the caller's (the
 * web app waits for the doc to load first): the functions here return the
 * Markdown to write.
 */
import type { LongAgendaDef, LongAgendaDraftSet, LongAgendaProgress } from "@campaign-forge/module-sdk";
import { newId } from "./ids";
import { clone, getPath, setPath } from "./paths";
import type { CampaignStore } from "./store";
import type { Entity, Handout, Id, Visibility } from "./types";

export const LONG_AGENDA_PURPOSE = "long-agenda";
export const LONG_AGENDA_FRICTION_PURPOSE = "long-agenda-friction";
const GM_ONLY: Visibility = { level: "gm" };
const PLAYERS: Visibility = { level: "players" };

/** The GM's own text for a character's goal summary and beat. */
export interface LongAgendaEdit {
  summary?: string;
  beat?: string;
}

export interface LongAgendaWrite {
  characterId: Id;
  name: string;
  /** The record to store (the GM's edits already in it). */
  record: Record<string, unknown>;
  /** The one-line summary for the def's summary field. */
  summary: string;
}

const text = (v: unknown): string => (typeof v === "string" ? v : "");
const fill = (tpl: string, name: string) => tpl.replace(/\{name\}/g, name);

/** A character's stored record, when there is one. */
export function longAgendaRecordOf(def: LongAgendaDef, e: Pick<Entity, "fields"> | undefined): Record<string, unknown> | undefined {
  const v = e?.fields[def.field];
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : undefined;
}

/** The writes an accept makes: each character in the campaign with the GM's edits applied at the def's paths. */
export function longAgendaWrites(def: LongAgendaDef, set: LongAgendaDraftSet, edits: Record<Id, LongAgendaEdit> = {}): LongAgendaWrite[] {
  return set.characters
    .filter((c) => c.inCampaign)
    .map((c) => {
      const record = clone(c.record);
      const edit = edits[c.id] ?? {};
      const summary = (edit.summary ?? c.summary).trim();
      setPath(record, def.paths.summary, summary);
      if (edit.beat !== undefined) setPath(record, def.paths.beat, edit.beat.trim());
      return { characterId: c.id, name: c.name, record, summary };
    });
}

/** Characters whose summary field already holds other text the GM wrote (the accept asks before replacing it). */
export function longAgendaOverwrites(store: CampaignStore, def: LongAgendaDef, writes: LongAgendaWrite[]): Array<{ characterId: Id; name: string; current: string; next: string }> {
  if (!def.summaryField) return [];
  const norm = (t: string) => t.replace(/\s+/g, " ").trim();
  const out: Array<{ characterId: Id; name: string; current: string; next: string }> = [];
  for (const w of writes) {
    const current = text(store.get("entities", w.characterId)?.fields[def.summaryField]);
    const stored = text(getPath(longAgendaRecordOf(def, store.get("entities", w.characterId)) ?? {}, def.paths.summary));
    // text that only the last accept wrote is not the GM's
    if (norm(current) && norm(current) !== norm(w.summary) && norm(current) !== norm(stored)) out.push({ characterId: w.characterId, name: w.name, current, next: w.summary });
  }
  return out;
}

/** The character's agenda and friction handouts, created (and linked to the character) when missing. */
export function ensureLongAgendaHandouts(store: CampaignStore, def: LongAgendaDef, characterId: Id): { agenda: Handout; friction: Handout } {
  const name = store.get("entities", characterId)?.name ?? "Character";
  return store.transact(() => {
    const find = (purpose: string) => store.list("handouts").find((h) => h.character === characterId && h.purpose === purpose);
    let agenda = find(LONG_AGENDA_PURPOSE);
    if (!agenda) agenda = store.createHandout({ title: fill(def.handouts?.agenda ?? "{name}: personal agenda", name), kind: "agenda", visibility: GM_ONLY, character: characterId, purpose: LONG_AGENDA_PURPOSE, withBody: true });
    else if (!agenda.bodyDoc) agenda = store.update("handouts", agenda.id, { bodyDoc: newId() });
    let friction = find(LONG_AGENDA_FRICTION_PURPOSE);
    if (!friction) friction = store.createHandout({ title: fill(def.handouts?.friction ?? "{name}: friction", name), kind: "text", visibility: PLAYERS, character: characterId, purpose: LONG_AGENDA_FRICTION_PURPOSE, withBody: true });
    return { agenda, friction };
  });
}

/** The character's long-agenda handouts, if they exist. */
export function longAgendaHandoutsOf(store: CampaignStore, characterId: Id): { agenda?: Handout; friction?: Handout } {
  const out: { agenda?: Handout; friction?: Handout } = {};
  for (const h of store.list("handouts")) {
    if (h.character !== characterId) continue;
    if (h.purpose === LONG_AGENDA_PURPOSE) out.agenda = h;
    if (h.purpose === LONG_AGENDA_FRICTION_PURPOSE) out.friction = h;
  }
  return out;
}

const outcomeLabel = (def: LongAgendaDef, id: unknown) => def.outcomes.find((o) => o.id === id)?.label.toLowerCase() ?? text(id);

/** The tension level stored in the record, within the ladder. */
export function longAgendaTension(def: LongAgendaDef, record: Record<string, unknown> | undefined): number | undefined {
  if (!def.paths.tension || !def.tension || !record) return undefined;
  const v = getPath(record, def.paths.tension);
  const top = def.tension.levels.length - 1;
  return typeof v === "number" && Number.isFinite(v) ? Math.max(0, Math.min(top, Math.floor(v))) : 0;
}

/** The agenda handout (GM-only) rendered from the record. */
export function longAgendaMarkdown(def: LongAgendaDef, record: Record<string, unknown>): string {
  const lines: string[] = [];
  const title = text(getPath(record, def.paths.title));
  const summary = text(getPath(record, def.paths.summary));
  lines.push(`**${title || "Personal agenda"}**: ${summary}`);
  const beat = text(getPath(record, def.paths.beat));
  if (beat) {
    const job = def.paths.beatJob ? text(getPath(record, def.paths.beatJob)) : "";
    lines.push("", `**${job ? `Beat for ${job}` : "This job"}:** ${beat}`);
  }
  const t = longAgendaTension(def, record);
  if (t !== undefined && def.tension) {
    const level = def.tension.levels[t]!;
    lines.push("", `**Tension:** ${level.label}${level.text ? `. ${level.text}` : ""}`);
  }
  for (const d of def.details ?? []) {
    const v = text(getPath(record, d.path));
    if (v) lines.push("", `**${d.label}:** ${v}`);
  }
  const history = def.paths.history ? getPath(record, def.paths.history) : undefined;
  if (Array.isArray(history) && history.length) {
    lines.push("", "**Beats so far**", "");
    for (const h of history as Array<Record<string, unknown>>) {
      const job = text(h.job);
      lines.push(`- ${job ? `${job}: ` : ""}${text(h.text)}${h.outcome ? ` (${outcomeLabel(def, h.outcome)})` : ""}`);
    }
  }
  return lines.join("\n");
}

/** The friction handout (players) rendered from the record. */
export function longAgendaFrictionMarkdown(def: LongAgendaDef, record: Record<string, unknown>): string {
  const raw = def.paths.friction ? getPath(record, def.paths.friction) : undefined;
  const items = (Array.isArray(raw) ? raw : []).map((f) => text((f as Record<string, unknown>)?.text)).filter(Boolean);
  const intro = def.handouts?.frictionIntro ?? "Open friction: everyone at the table may know these.";
  return [intro, "", ...(items.length ? items.map((t) => `- ${t}`) : ["- No open friction yet."])].join("\n");
}

export interface LongAgendaDocWrite {
  docId: Id;
  markdown: string;
}

/**
 * Store each write: the record in the def's field, the summary in its
 * summary field, and both handouts (created when missing). `skip` leaves
 * characters out. Returns the handout bodies to write.
 */
export function applyLongAgendaWrites(store: CampaignStore, def: LongAgendaDef, writes: LongAgendaWrite[], opts: { skip?: Id[] } = {}): { written: Id[]; docs: LongAgendaDocWrite[] } {
  const written: Id[] = [];
  const docs: LongAgendaDocWrite[] = [];
  store.transact(() => {
    for (const w of writes) {
      if (opts.skip?.includes(w.characterId)) continue;
      const e = store.get("entities", w.characterId);
      if (!e) continue;
      const fields: Record<string, unknown> = { ...clone(e.fields), [def.field]: clone(w.record) };
      if (def.summaryField) fields[def.summaryField] = w.summary;
      store.update("entities", e.id, { fields });
      const h = ensureLongAgendaHandouts(store, def, e.id);
      if (h.agenda.bodyDoc) docs.push({ docId: h.agenda.bodyDoc, markdown: longAgendaMarkdown(def, w.record) });
      if (h.friction.bodyDoc) docs.push({ docId: h.friction.bodyDoc, markdown: longAgendaFrictionMarkdown(def, w.record) });
      written.push(e.id);
    }
  });
  return { written, docs };
}

/** Set a character's tension by hand (the GM cools things down, or heats them up), within the ladder. Returns the agenda handout's new body. */
export function setLongAgendaTension(store: CampaignStore, def: LongAgendaDef, characterId: Id, level: number): LongAgendaDocWrite | undefined {
  const e = store.get("entities", characterId);
  const record = longAgendaRecordOf(def, e);
  if (!e || !record || !def.paths.tension || !def.tension) return undefined;
  const top = def.tension.levels.length - 1;
  const next = setPath(clone(record), def.paths.tension, Math.max(0, Math.min(top, Math.floor(level))));
  store.update("entities", e.id, { fields: { ...clone(e.fields), [def.field]: next } });
  const h = ensureLongAgendaHandouts(store, def, e.id);
  return h.agenda.bodyDoc ? { docId: h.agenda.bodyDoc, markdown: longAgendaMarkdown(def, next) } : undefined;
}

/** The procedure's progress input for the next beats: each character's stored record and the outcome the GM marked. */
export function longAgendaProgress(def: LongAgendaDef, characters: Array<Pick<Entity, "id" | "name" | "fields">>, outcomes: Record<Id, string | undefined>): LongAgendaProgress[] {
  return characters.map((c) => {
    const p: LongAgendaProgress = { id: c.id, name: c.name };
    const record = longAgendaRecordOf(def, c);
    if (record) p.record = clone(record);
    const o = outcomes[c.id];
    if (o && def.outcomes.some((x) => x.id === o)) p.outcome = o;
    return p;
  });
}
