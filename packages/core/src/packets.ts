/**
 * Player packets: one player's own copy of the share, to send to them alone
 * (a direct message) before a session. A packet holds what the group share
 * holds (the briefing, the map with fog, every handout players may see, the
 * party) as that player sees it, plus what is theirs alone: handouts shared
 * with them (`some_players` naming them, or given to the player of their
 * character) and the sheets of the characters they play, with the fields the
 * module marks owner-visible and their long-term agenda as they may read it.
 *
 * Safety: everything comes from `projectCampaignForViewer` with the player's
 * viewer (`memberViewer`), through `playerShareSnapshot`; the sheets read
 * the projected entity only, and computed values are computed from projected
 * fields, so a hidden field cannot leak through one. Other players' private
 * material is never in the projection. Nothing here names a game.
 */
import type { GameModule, LongAgendaDef, SheetField, SheetSection } from "@campaign-forge/module-sdk";
import { computeFields, ownerVisiblePaths } from "@campaign-forge/module-sdk";
import { longAgendaMarkdown, longAgendaRecordOf } from "./longAgendas";
import { charactersOfMember, memberViewer } from "./members";
import { getPath } from "./paths";
import { planShare, playerShareSnapshot, shareBaseline, type PlayerShare, type PlayerShareInput, type ShareBaseline, type ShareImage, type ShareOptions, type SharePlan } from "./share";
import type { CampaignMaps, Entity, Id, Session } from "./types";
import { canSeeField, findEntityType, projectCampaignForViewer, viewerOwns, type ModuleTypes, type Viewer } from "./visibility";

/** A module as packets read it: entity types, owner handout kinds, and procedures (for a long-term agenda). */
export type PacketModule = ModuleTypes & Partial<Pick<GameModule, "procedures">>;

export interface PacketSheetRow {
  label: string;
  value: string;
}

/** One of the player's own characters, as their packet shows it. */
export interface PacketCharacter {
  id: Id;
  name: string;
  /** Entity type name, with the subtype when there is one. */
  kind?: string;
  portrait?: ShareImage;
  /** The sheet's sections with what the player may see, in sheet order (empty sections left out). */
  sections: Array<{ title: string; rows: PacketSheetRow[] }>;
  /** Conditions on the character, by label. */
  conditions: string[];
  /** The character's long-term agenda as its player may read it (the module's long agenda, from the projected record). */
  agenda?: { title: string; markdown: string };
}

/** A player packet: the share as one player sees it, plus their own characters. */
export interface PlayerPacket extends PlayerShare {
  /** The player's name (titles read "for Sam"). */
  for: string;
  member: { id: Id; name: string };
  characters: PacketCharacter[];
}

export interface PlayerPacketInput extends Omit<PlayerShareInput, "viewer" | "module"> {
  module: PacketModule | undefined;
  memberId: Id;
}

/** "Skyfire Down for Sam". */
export function packetTitle(packet: Pick<PlayerPacket, "campaign" | "for">): string {
  return `${packet.campaign} for ${packet.for}`;
}

/** The module's long-term agenda definition, when one of its procedures keeps one. */
export function longAgendaDefOf(module: PacketModule | undefined): LongAgendaDef | undefined {
  return module?.procedures?.find((p) => p.longAgendas)?.longAgendas;
}

const isRec = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const humanize = (s: string): string => s.replace(/[-_]+/g, " ").replace(/([a-z])([A-Z])/g, "$1 $2").replace(/^./, (c) => c.toUpperCase());
const inMode = (item: { mode?: string[] }, mode: string) => !item.mode || item.mode.length === 0 || item.mode.includes(mode);

interface ValueContext {
  referenceName: PlayerShareInput["referenceName"];
  /** Names of entities the player may see. */
  visibleNames: Map<Id, string>;
}

/** One value of a row object (a gear line, a talent, a condition): its name and count. */
function rowName(v: unknown, f: SheetField | undefined, cx: ValueContext): string {
  if (typeof v === "string") return v;
  if (typeof v === "number") return String(v);
  if (!isRec(v)) return "";
  const ref = f?.options && !Array.isArray(f.options) ? f.options.ref : undefined;
  let name = typeof v.name === "string" ? v.name : typeof v.label === "string" ? v.label : typeof v.text === "string" ? v.text : "";
  if (!name && typeof v.id === "string") name = (ref ? cx.referenceName?.(ref, v.id) : undefined) ?? humanize(v.id);
  if (!name) return "";
  const count = typeof v.qty === "number" ? v.qty : typeof v.count === "number" ? v.count : undefined;
  const lead = typeof v.act === "number" ? `${v.act}: ` : "";
  return `${lead}${name}${count !== undefined && count > 1 ? ` ×${count}` : ""}`;
}

/** A sheet value as one line of text ("" when there is nothing to show). */
function sheetValue(f: SheetField | undefined, v: unknown, cx: ValueContext): string {
  if (v === undefined || v === null) return "";
  const widget = f?.widget;
  if (widget === "image" || widget === "zonemap" || widget === "richtext") return "";
  if (widget === "ref") return typeof v === "string" ? (cx.visibleNames.get(v) ?? "") : "";
  if (widget === "reflist")
    return Array.isArray(v)
      ? v
          .map((id) => (typeof id === "string" ? cx.visibleNames.get(id) : undefined))
          .filter(Boolean)
          .join(", ")
      : "";
  if (typeof v === "number") return Number.isFinite(v) ? String(Math.round(v * 100) / 100) : "";
  if (typeof v === "boolean") return v ? "Yes" : "";
  if (typeof v === "string") {
    if (!v.trim()) return "";
    const options = f?.options;
    if (options && !Array.isArray(options)) return cx.referenceName?.(options.ref, v) ?? humanize(v);
    if (widget === "select") return humanize(v);
    return v.trim();
  }
  if (Array.isArray(v)) return v.map((x) => rowName(x, f, cx)).filter(Boolean).join(", ");
  if (isRec(v)) {
    // a map of levels (skills): the ones above zero, by name
    const ref = f?.options && !Array.isArray(f.options) ? f.options.ref : undefined;
    const parts: string[] = [];
    for (const [k, x] of Object.entries(v)) {
      if (typeof x !== "number" || x === 0) continue;
      parts.push(`${(ref ? cx.referenceName?.(ref, k) : undefined) ?? humanize(k)} ${x}`);
    }
    return parts.join(", ");
  }
  return "";
}

/**
 * A character's sheet as its player may see it: the projected entity's
 * fields in the sheet's sections (for the campaign's play mode), with
 * computed values computed from the projected fields. A section whose first
 * filled-in field the player may not see, and which holds no owner-visible
 * field, is a GM section and is left out whole, title and all (its title may
 * say what it hides).
 */
function packetCharacter(raw: Entity, projected: Entity, module: PacketModule | undefined, maps: CampaignMaps, assets: CampaignMaps["assets"], viewer: Viewer, cx: ValueContext): PacketCharacter {
  const def = findEntityType(module, raw.type);
  const sub = raw.subtype ? def?.subtypes?.find((s) => s.id === raw.subtype) : undefined;
  const sheet = sub?.sheet ?? def?.sheet;
  const mode = maps.meta.mode;
  let computed: Record<string, unknown> = {};
  if (def) {
    try {
      computed = computeFields(def, projected.fields);
    } catch {
      computed = {};
    }
  }
  const agendaDef = longAgendaDefOf(module);
  const record = agendaDef ? longAgendaRecordOf(agendaDef, projected) : undefined;
  let agenda: PacketCharacter["agenda"];
  if (agendaDef && record) {
    const markdown = longAgendaMarkdown(agendaDef, record);
    const goal = getPath(record, agendaDef.paths.summary);
    if (typeof goal === "string" && goal.trim()) agenda = { title: (agendaDef.handouts?.agenda ?? "{name}: personal agenda").replace(/\{name\}/g, projected.name), markdown };
  }
  const skip = new Set<string>(agenda && agendaDef ? [agendaDef.field, ...(agendaDef.summaryField ? [agendaDef.summaryField] : [])] : []);
  const ownerPaths = def && viewerOwns(viewer, raw) ? ownerVisiblePaths(def, raw.subtype) : [];
  const ownerField = (path: string) => ownerPaths.some((p) => path === p || path.startsWith(`${p}.`));
  const sections: PacketCharacter["sections"] = [];
  for (const section of (sheet?.sections ?? []) as SheetSection[]) {
    if (!inMode(section, mode)) continue;
    const fields = section.fields.filter((f) => inMode(f, mode));
    // a section that opens on a field the player may not see, and holds nothing shown to a character's own player, is a GM section: left out, title and all
    const lead = fields.find((f) => f.widget !== "computed" && getPath(raw.fields, f.path) !== undefined);
    if (!lead || (def && !canSeeField(raw, def, lead.path, viewer) && !fields.some((f) => ownerField(f.path)))) continue;
    const rows: PacketSheetRow[] = [];
    for (const f of fields) {
      if (skip.has(f.path)) continue;
      const isComputed = f.widget === "computed" || (f.path in computed && getPath(raw.fields, f.path) === undefined);
      // computed values come from projected fields only; a stored field must be in the projection
      const v = isComputed ? computed[f.path] : getPath(projected.fields, f.path);
      if (isRec(v) && f.widget !== "skills" && !f.options) continue;
      const value = sheetValue(f, v, cx);
      if (!value) continue;
      rows.push({ label: f.label ?? humanize(f.path.split(".").pop() ?? f.path), value });
    }
    if (rows.length) sections.push({ title: section.title, rows });
  }
  const out: PacketCharacter = { id: raw.id, name: projected.name, sections, conditions: (projected.conditions ?? []).map((c) => c.label).filter(Boolean) };
  const kind = [def?.name, sub?.name].filter(Boolean).join(" · ");
  if (kind) out.kind = kind;
  if (agenda) out.agenda = agenda;
  const asset = projected.image ? assets[projected.image] : undefined;
  if (asset && asset.kind === "image") {
    out.portrait = { asset: asset.id, name: asset.name, mime: asset.mime, ...(asset.width !== undefined ? { width: asset.width } : {}), ...(asset.height !== undefined ? { height: asset.height } : {}) };
  }
  return out;
}

/**
 * One player's packet for a session: the group share as they see it (their
 * `some_players` handouts and handouts given to them included, marked
 * `personal`), plus the sheets of the characters they play. Pure: same input,
 * same output.
 */
export function playerPacketSnapshot(input: PlayerPacketInput): PlayerPacket {
  const { maps, module, memberId } = input;
  const member = maps.meta.members.find((m) => m.id === memberId && m.role === "player");
  if (!member) throw new Error(`member ${memberId} is not a player of this campaign`);
  const viewer = memberViewer(maps, memberId);
  const share = playerShareSnapshot({ ...input, module, viewer });
  const projected = projectCampaignForViewer(maps, module, viewer);
  const cx: ValueContext = { referenceName: input.referenceName, visibleNames: new Map(Object.values(projected.entities).map((e) => [e.id, e.name] as const)) };
  const characters: PacketCharacter[] = [];
  for (const id of charactersOfMember(maps, memberId)) {
    const raw = maps.entities[id];
    const p = projected.entities[id];
    if (raw && p) characters.push(packetCharacter(raw, p, module, maps, projected.assets, viewer, cx));
  }
  return { ...share, for: member.name, member: { id: member.id, name: member.name }, characters };
}

export interface PacketOptions extends ShareOptions {
  /** The player's own character sheets (and agendas). */
  sheets: boolean;
}

export const DEFAULT_PACKET_OPTIONS: PacketOptions = { briefing: true, maps: true, handouts: true, party: false, onlyNew: false, sheets: true };

export interface PacketPlan extends SharePlan {
  share: PlayerPacket;
}

/** The include options and "only what's new" (against this player's earlier packets) applied to a packet. Sheets always go as they are now. */
export function planPacket(packet: PlayerPacket, baseline: ShareBaseline, opts: PacketOptions): PacketPlan {
  const plan = planShare(packet, baseline, opts);
  const characters = opts.sheets ? packet.characters : [];
  const share: PlayerPacket = { ...packet, ...plan.share, for: packet.for, member: packet.member, characters };
  return { ...plan, share, empty: plan.empty && characters.length === 0 };
}

/** What this player was already sent in their packets. */
export function packetBaseline(sessions: Iterable<Pick<Session, "shares">>, memberId: Id): ShareBaseline {
  return shareBaseline(sessions, memberId);
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const list = (parts: string[]) => (parts.length <= 1 ? (parts[0] ?? "nothing new") : `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`);

/** A short line for the direct message, e.g. "Skyfire Down for Sam, Session 1: your sheet, your agenda and 3 handouts (1 just for you)." */
export function packetMessage(plan: Pick<PacketPlan, "share" | "mapStatus">, extra: { primer?: boolean; crewNotes?: boolean; recap?: boolean } = {}): string {
  const s = plan.share;
  const parts: string[] = [];
  if (extra.primer) parts.push("the campaign primer");
  if (extra.recap) parts.push("the recap of last time");
  if (extra.crewNotes) parts.push("your crew notes");
  if (s.characters.length) parts.push(s.characters.length === 1 ? "your sheet" : `your ${s.characters.length} sheets`);
  if (s.characters.some((c) => c.agenda)) parts.push("your agenda");
  if (s.briefing) parts.push(s.briefing.scene ? `the briefing for “${s.briefing.scene}”` : "the briefing");
  if (s.handouts.length) {
    const personal = s.handouts.filter((h) => h.personal).length;
    parts.push(`${plural(s.handouts.length, "handout")}${personal ? ` (${personal} just for you)` : ""}`);
  }
  for (const m of s.maps) parts.push(plan.mapStatus[m.id] === "updated" ? "the updated map" : "the map");
  if (s.party.length) parts.push("the party roster");
  return `${packetTitle(s)}, Session ${s.session.number}: ${list(parts)}.`;
}

/** What is new against the player's last packet, as one line; undefined before their first packet. */
export function packetChanges(plan: Pick<PacketPlan, "share" | "newHandouts" | "mapStatus">, baseline: Pick<ShareBaseline, "count">): string | undefined {
  if (baseline.count === 0) return undefined;
  const fresh = plan.share.handouts.filter((h) => plan.newHandouts.includes(h.id));
  const personal = fresh.filter((h) => h.personal).length;
  const parts: string[] = [];
  if (fresh.length) parts.push(`${plural(fresh.length, "new handout")}${personal ? ` (${personal} just for them)` : ""}`);
  const maps = Object.values(plan.mapStatus).filter((x) => x !== "unchanged").length;
  if (maps) parts.push(maps === 1 ? "a map that changed" : `${maps} maps that changed`);
  return parts.length ? list(parts) : "nothing new apart from the sheet";
}
