/**
 * "Share with players": a player-safe snapshot of a session for a group chat
 * (images or a PDF packet), and the record of what was already shared so the
 * next share can send only what is new.
 *
 * Safety: everything in a `PlayerShare` comes from the player projection
 * (`projectCampaignForViewer` for entities, handouts and assets,
 * `playerLayout` / `playerLive` for maps, the same projection the player
 * screen draws) or from the two player-facing texts of the GM structures:
 * a scene's title and read-aloud text and an adventure's title and player
 * intro. It is built by copying allowed fields, never by deleting forbidden
 * ones. `some_players` content is left out: a group share has no single
 * viewer. Nothing here names a game.
 */
import type { EntityTypeDef, MapLegendEntry, SheetField, SheetLayout } from "@campaign-forge/module-sdk";
import { computeFields } from "@campaign-forge/module-sdk";
import type * as Y from "yjs";
import { getPath } from "./paths";
import { toMarkdown } from "./richtext";
import { liveOf, playerLayout, playerLive, type PlayerLayout, type PlayerLiveState } from "./sitemap";
import type { CampaignStore } from "./store";
import type { CampaignMaps, Entity, HandoutKind, Id, Scene, Session, ShareRecord, SiteMap } from "./types";
import { canSee, fieldVisibilityOf, findEntityType, projectCampaignForViewer, type ModuleTypes, type Viewer } from "./visibility";

/** A group share is seen by every player: only `players` and `revealed` content. */
export const SHARE_VIEWER: Viewer = { role: "player" };

export interface ShareMap {
  id: Id;
  name: string;
  /** The player projection, fog included (as the player screen draws it). */
  layout: PlayerLayout;
  live: PlayerLiveState;
  act: number;
  /** Zones the players can see (not fogged), sorted. */
  visibleZones: Id[];
  /** Decks with at least one zone the players can see, in layout order. */
  decks: Id[];
  /** Legend entries players may see. */
  legend: MapLegendEntry[];
}

export interface ShareImage {
  asset: Id;
  name: string;
  mime: string;
  width?: number;
  height?: number;
}

export interface ShareHandout {
  id: Id;
  title: string;
  kind: HandoutKind;
  /** Body as Markdown with references as plain names. */
  text?: string;
  image?: ShareImage;
  /** Revealed during the shared session. */
  thisSession: boolean;
}

export interface ShareMember {
  id: Id;
  name: string;
  /** Entity type name, with the subtype when there is one. */
  kind?: string;
  portrait?: ShareImage;
  stats: Array<{ label: string; value: string }>;
}

export interface ShareBriefing {
  sceneId?: Id;
  scene?: string;
  /** The scene's read-aloud text (Markdown). */
  readAloud?: string;
  adventure?: string;
  /** The adventure's player intro (Markdown). */
  intro?: string;
}

/** Everything a share may contain, all of it player-visible. */
export interface PlayerShare {
  campaign: string;
  session: { id: Id; number: number; title?: string; label: string };
  at: string;
  briefing?: ShareBriefing;
  maps: ShareMap[];
  handouts: ShareHandout[];
  party: ShareMember[];
}

export interface PlayerShareInput {
  maps: CampaignMaps;
  module: ModuleTypes | undefined;
  sessionId: Id;
  /** The scene the table is on (its briefing and map). */
  sceneId?: Id | undefined;
  /** A loaded rich-text body by doc id. */
  doc: (id: Id) => Y.Doc | undefined;
  at: string;
  /** Names of reference-list items for select fields (e.g. a career id), when the module has them. */
  referenceName?: ((ref: string, id: string) => string | undefined) | undefined;
}

/** "Session 3: The offer", or "Session 3". */
export function shareSessionLabel(s: Pick<Session, "number" | "title">): string {
  return s.title ? `Session ${s.number}: ${s.title}` : `Session ${s.number}`;
}

/** The map a scene uses: its own map, else a map of its location (as table mode picks it). */
export function sceneMapOf(maps: Pick<CampaignMaps, "maps">, scene: Pick<Scene, "map" | "location"> | undefined): SiteMap | undefined {
  if (!scene) return undefined;
  const all = Object.values(maps.maps);
  return (scene.map ? all.find((m) => m.id === scene.map) : undefined) ?? (scene.location ? all.find((m) => m.location === scene.location) : undefined);
}

/** Is this entity a player character (a character the players own or marked as a PC)? */
export function isPlayerCharacter(e: Entity, module: ModuleTypes | undefined): boolean {
  return findEntityType(module, e.type)?.kind === "character" && (e.fields["isPC"] === true || !!e.ownerMemberId);
}

/** Markdown of a body with references as plain names: player-visible entities by name, others by the label stored in the text. */
function bodyText(doc: Y.Doc | undefined, visibleNames: Map<Id, string>): string | undefined {
  if (!doc) return undefined;
  const md = toMarkdown(doc, (id) => visibleNames.get(id) ?? "");
  const text = md
    .replace(/\[\[([^|\]]+)\|([^\]]*)\]\]/g, (_m, id: string, name: string) => (name === id ? "" : name))
    .replace(/\[\[([^\]]+)\]\]/g, "")
    .replace(/\\([_\\[\]*`])/g, "$1")
    .trim();
  return text || undefined;
}

/** A player projection of the share's map (fog from the live state), or undefined when the scene has no generated map. */
export function shareMapOf(map: SiteMap, module: ModuleTypes | undefined): ShareMap | undefined {
  if (!map.layout) return undefined;
  const legendAll = module?.mapGenerators?.find((g) => g.id === map.generator?.id)?.legend;
  const live = liveOf(map);
  const layout = playerLayout(map.layout, { act: live.act, revealed: live.revealed, legend: legendAll, live });
  const fogged = new Set(layout.fogged);
  const visibleZones = layout.zones.filter((z) => !fogged.has(z.id) && z.kind !== "out-of-bounds").map((z) => z.id).sort();
  const visible = new Set(visibleZones);
  const decks = layout.decks.filter((d) => layout.zones.some((z) => z.deck === d.id && visible.has(z.id))).map((d) => d.id);
  const legend = (legendAll ?? []).filter((e) => !e.gmOnly).map((e) => ({ target: e.target, label: e.label }) as MapLegendEntry);
  return { id: map.id, name: map.name, layout, live: playerLive(live, layout, legendAll), act: live.act, visibleZones, decks, legend };
}

const isRec = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const humanize = (s: string): string => s.replace(/[-_]+/g, " ").replace(/([a-z])([A-Z])/g, "$1 $2").replace(/^./, (c) => c.toUpperCase());
const fieldLabel = (f: Pick<SheetField, "label" | "path"> | undefined, path: string): string => f?.label ?? humanize(path.split(".").pop() ?? path);

function sheetOf(def: EntityTypeDef | undefined, entity: Entity): SheetLayout | undefined {
  if (!def) return undefined;
  const sub = entity.subtype ? def.subtypes?.find((s) => s.id === entity.subtype) : undefined;
  return sub?.sheet ?? def.sheet;
}

function sheetField(sheet: SheetLayout | undefined, path: string): SheetField | undefined {
  for (const s of sheet?.sections ?? []) for (const f of s.fields) if (f.path === path) return f;
  return undefined;
}

function statValue(f: SheetField | undefined, v: unknown, referenceName: PlayerShareInput["referenceName"]): string {
  if (typeof v === "number") return String(v);
  if (typeof v === "boolean") return v ? "Yes" : "";
  if (typeof v !== "string" || !v.trim()) return "";
  // references to other records are not stats; their names may be GM-only
  if (f?.widget === "ref" || f?.widget === "reflist") return "";
  const options = f?.options;
  if (options && !Array.isArray(options)) return referenceName?.(options.ref, v) ?? humanize(v);
  if (f?.widget === "select" && Array.isArray(options)) return humanize(v);
  return v.trim();
}

/**
 * A party member card: name, kind, portrait and the sheet's summary stats,
 * from the player projection of the entity. Computed values are computed
 * from the projected fields, so a hidden field cannot leak through one.
 */
function partyMember(raw: Entity, projected: Entity, module: ModuleTypes | undefined, assets: CampaignMaps["assets"], referenceName: PlayerShareInput["referenceName"]): ShareMember {
  const def = findEntityType(module, raw.type);
  const sheet = sheetOf(def, raw);
  let computed: Record<string, unknown> = {};
  if (def) {
    try {
      computed = computeFields(def, projected.fields);
    } catch {
      computed = {};
    }
  }
  const stats: ShareMember["stats"] = [];
  for (const path of sheet?.summary ?? def?.sheet.summary ?? []) {
    if (!canSee(fieldVisibilityOf(raw, def, path), SHARE_VIEWER)) continue;
    const f = sheetField(sheet, path) ?? sheetField(def?.sheet, path);
    if (f?.widget === "image" || f?.widget === "zonemap") continue;
    const v = path in computed ? computed[path] : getPath(projected.fields, path);
    if (v === undefined || v === null || isRec(v) || Array.isArray(v)) continue;
    // current state (damage, stress) at zero is not a stat
    if (v === 0 && f && f.widget !== "computed" && f.widget !== "attribute") continue;
    const value = statValue(f, v, referenceName);
    if (!value) continue;
    stats.push({ label: fieldLabel(f, path), value });
  }
  const sub = raw.subtype ? def?.subtypes?.find((s) => s.id === raw.subtype)?.name : undefined;
  const kind = [def?.name, sub].filter(Boolean).join(" · ");
  const out: ShareMember = { id: raw.id, name: projected.name, stats };
  if (kind) out.kind = kind;
  // a portrait only when the image itself is player-visible (it is in the projection)
  const asset = projected.image ? assets[projected.image] : undefined;
  if (asset && asset.kind === "image") out.portrait = imageOf(asset);
  return out;
}

function imageOf(a: CampaignMaps["assets"][string]): ShareImage {
  const img: ShareImage = { asset: a.id, name: a.name, mime: a.mime };
  if (a.width !== undefined) img.width = a.width;
  if (a.height !== undefined) img.height = a.height;
  return img;
}

/**
 * Everything the players may be sent for a session: the current scene's
 * briefing (title, read-aloud, the adventure's player intro), the scene's map
 * with fog, every handout players can see and the party. Pure: same input,
 * same output.
 */
export function playerShareSnapshot(input: PlayerShareInput): PlayerShare {
  const { maps, module } = input;
  const projected = projectCampaignForViewer(maps, module, SHARE_VIEWER);
  const session = maps.sessions[input.sessionId];
  if (!session) throw new Error(`sessions/${input.sessionId} not found`);
  const visibleNames = new Map(Object.values(projected.entities).map((e) => [e.id, e.name] as const));
  const out: PlayerShare = {
    campaign: maps.meta.name,
    session: { id: session.id, number: session.number, label: shareSessionLabel(session), ...(session.title ? { title: session.title } : {}) },
    at: input.at,
    maps: [],
    handouts: [],
    party: [],
  };

  // the briefing: only the player-facing texts of the scene and its adventure
  const scene = input.sceneId ? maps.scenes[input.sceneId] : undefined;
  if (scene) {
    const briefing: ShareBriefing = { sceneId: scene.id };
    if (scene.title.trim()) briefing.scene = scene.title.trim();
    const readAloud = scene.readAloudDoc ? bodyText(input.doc(scene.readAloudDoc), visibleNames) : undefined;
    if (readAloud) briefing.readAloud = readAloud;
    const act = scene.act ? maps.acts[scene.act] : undefined;
    const adventure = act ? maps.adventures[act.adventure] : undefined;
    if (adventure) {
      briefing.adventure = adventure.title;
      const intro = adventure.playerIntroDoc ? bodyText(input.doc(adventure.playerIntroDoc), visibleNames) : undefined;
      if (intro) briefing.intro = intro;
    }
    out.briefing = briefing;
    const map = sceneMapOf(maps, scene);
    const shareMap = map ? shareMapOf(map, module) : undefined;
    if (shareMap && shareMap.visibleZones.length > 0) out.maps.push(shareMap);
  }

  // handouts the players can see: revealed this session first, then the newest
  const handouts = Object.values(projected.handouts).sort(
    (a, b) => Number(b.revealedIn === session.id) - Number(a.revealedIn === session.id) || b.updated.localeCompare(a.updated) || a.id.localeCompare(b.id),
  );
  for (const h of handouts) {
    const item: ShareHandout = { id: h.id, title: h.title, kind: h.kind, thisSession: h.revealedIn === session.id || h.visibility.revealedIn === session.id };
    const text = h.bodyDoc ? bodyText(input.doc(h.bodyDoc), visibleNames) : undefined;
    if (text) item.text = text;
    // a revealed handout's own image goes with it, as on the player screen
    const asset = h.asset ? maps.assets[h.asset] : undefined;
    if (asset && asset.kind === "image") item.image = imageOf(asset);
    if (item.text || item.image || item.title) out.handouts.push(item);
  }

  // the party: player characters the players can see, by name
  const pcs = Object.values(maps.entities)
    .filter((e) => isPlayerCharacter(e, module))
    .sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
  for (const raw of pcs) {
    const p = projected.entities[raw.id];
    if (!p) continue;
    out.party.push(partyMember(raw, p, module, projected.assets, input.referenceName));
  }
  return out;
}

// ---------------------------------------------------------------------------
// what was shared, and what is new
// ---------------------------------------------------------------------------

/** What the players were already sent, across every session of the campaign. */
export interface ShareBaseline {
  /** Number of shares recorded. */
  count: number;
  last?: ShareRecord;
  handouts: Set<Id>;
  /** Map id -> the visible zones of its latest share. */
  maps: Map<Id, Set<Id>>;
  scenes: Set<Id>;
  party: boolean;
  primer: boolean;
}

/** The share history of a campaign (every session's records, in time order). */
export function shareBaseline(sessions: Iterable<Pick<Session, "shares">>): ShareBaseline {
  const records: ShareRecord[] = [];
  for (const s of sessions) for (const r of s.shares ?? []) records.push(r);
  records.sort((a, b) => a.at.localeCompare(b.at));
  const b: ShareBaseline = { count: records.length, handouts: new Set(), maps: new Map(), scenes: new Set(), party: false, primer: false };
  for (const r of records) {
    for (const h of r.handouts) b.handouts.add(h);
    for (const [id, zones] of Object.entries(r.maps)) b.maps.set(id, new Set(zones));
    if (r.scene) b.scenes.add(r.scene);
    if (r.party) b.party = true;
    if (r.primer) b.primer = true;
  }
  const last = records[records.length - 1];
  if (last) b.last = last;
  return b;
}

export type ShareMapStatus = "new" | "updated" | "unchanged";

export interface ShareOptions {
  briefing: boolean;
  maps: boolean;
  handouts: boolean;
  party: boolean;
  /** Leave out what the players already have (handouts sent before, maps whose visible zones did not change, a briefing already sent). */
  onlyNew: boolean;
}

export const DEFAULT_SHARE_OPTIONS: ShareOptions = { briefing: true, maps: true, handouts: true, party: false, onlyNew: false };

/** Options for the next share: "only what's new" is on once anything was shared. */
export function defaultShareOptions(baseline: Pick<ShareBaseline, "count">): ShareOptions {
  return { ...DEFAULT_SHARE_OPTIONS, onlyNew: baseline.count > 0 };
}

export interface SharePlan {
  /** The filtered share: exactly what goes out. */
  share: PlayerShare;
  mapStatus: Record<Id, ShareMapStatus>;
  /** Handouts never shared before (among those going out). */
  newHandouts: Id[];
  /** Items left out because the players already have them. */
  skipped: { handouts: number; maps: number; briefing: boolean; party: boolean };
  /** True when nothing would be sent. */
  empty: boolean;
}

function sameSet(a: Set<string>, b: readonly string[]): boolean {
  return a.size === b.length && b.every((x) => a.has(x));
}

export function mapShareStatus(map: Pick<ShareMap, "id" | "visibleZones">, baseline: Pick<ShareBaseline, "maps">): ShareMapStatus {
  const before = baseline.maps.get(map.id);
  if (!before) return "new";
  return sameSet(before, map.visibleZones) ? "unchanged" : "updated";
}

/** Apply the include options and "only what's new" to a snapshot. */
export function planShare(snapshot: PlayerShare, baseline: ShareBaseline, opts: ShareOptions): SharePlan {
  const mapStatus: Record<Id, ShareMapStatus> = {};
  for (const m of snapshot.maps) mapStatus[m.id] = mapShareStatus(m, baseline);
  const skipped = { handouts: 0, maps: 0, briefing: false, party: false };

  let maps = opts.maps ? snapshot.maps : [];
  if (opts.onlyNew) {
    const kept = maps.filter((m) => mapStatus[m.id] !== "unchanged");
    skipped.maps = maps.length - kept.length;
    maps = kept;
  }
  let handouts = opts.handouts ? snapshot.handouts : [];
  if (opts.onlyNew) {
    const kept = handouts.filter((h) => !baseline.handouts.has(h.id));
    skipped.handouts = handouts.length - kept.length;
    handouts = kept;
  }
  let briefing = opts.briefing ? snapshot.briefing : undefined;
  if (briefing && opts.onlyNew && briefing.sceneId && baseline.scenes.has(briefing.sceneId)) {
    briefing = undefined;
    skipped.briefing = true;
  }
  if (briefing && !briefing.readAloud && !briefing.intro && !briefing.scene) briefing = undefined;
  let party = opts.party ? snapshot.party : [];
  if (party.length && opts.onlyNew && baseline.party) {
    party = [];
    skipped.party = true;
  }
  const share: PlayerShare = { ...snapshot, maps, handouts, party };
  if (briefing) share.briefing = briefing;
  else delete share.briefing;
  const newHandouts = handouts.filter((h) => !baseline.handouts.has(h.id)).map((h) => h.id);
  return { share, mapStatus, newHandouts, skipped, empty: !briefing && maps.length === 0 && handouts.length === 0 && party.length === 0 };
}

/** The record to keep for a share that went out. */
export function shareRecordOf(plan: Pick<SharePlan, "share">, extra: { format?: ShareRecord["format"]; primer?: boolean } = {}): ShareRecord {
  const s = plan.share;
  const rec: ShareRecord = { at: s.at, handouts: s.handouts.map((h) => h.id), maps: Object.fromEntries(s.maps.map((m) => [m.id, [...m.visibleZones]])) };
  if (s.briefing?.sceneId) rec.scene = s.briefing.sceneId;
  if (s.party.length) rec.party = true;
  if (extra.primer) rec.primer = true;
  if (extra.format) rec.format = extra.format;
  return rec;
}

/** Append a share to the session's history (GM-only data in the campaign document). */
export function recordShare(store: CampaignStore, sessionId: Id, record: ShareRecord): Session {
  const session = store.get("sessions", sessionId);
  if (!session) throw new Error(`sessions/${sessionId} not found`);
  return store.update("sessions", sessionId, { shares: [...(session.shares ?? []), record] });
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** A short chat message to go with a share, e.g. "Session 3 update: 2 new handouts and the map". */
export function shareMessage(plan: Pick<SharePlan, "share" | "mapStatus" | "newHandouts">, extra: { primer?: boolean } = {}): string {
  const s = plan.share;
  const parts: string[] = [];
  if (extra.primer) parts.push("the campaign primer");
  if (s.briefing) parts.push(s.briefing.scene ? `the briefing for “${s.briefing.scene}”` : "the briefing");
  if (s.handouts.length) {
    const fresh = s.handouts.filter((h) => plan.newHandouts.includes(h.id)).length;
    parts.push(fresh === s.handouts.length ? plural(fresh, "new handout") : plural(s.handouts.length, "handout"));
  }
  for (const m of s.maps) parts.push(plan.mapStatus[m.id] === "updated" ? "the updated map" : "the map");
  if (s.party.length) parts.push("the party roster");
  const list = parts.length <= 1 ? (parts[0] ?? "nothing new") : `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
  return `${s.campaign}, Session ${s.session.number} update: ${list}.`;
}
