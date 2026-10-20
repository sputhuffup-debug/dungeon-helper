/**
 * The printed adventure booklet as structured data: a title page and typed
 * sections of typed blocks (field grids, read-aloud, GM-only boxes, notes,
 * cast cards, locations, scenes, checklists, a site map figure, stat blocks
 * and a handout list), so the print layout can match each kind of
 * information. Game-agnostic: labels come from the module's narrative field
 * sheets, entity sheets and builder; nothing here knows a game.
 *
 * The Markdown export (`bookletMarkdown`) stays the file export; this model
 * only feeds the print view.
 */
import {
  CHECKLIST_PHASE_TITLES,
  adventureActs,
  castMembers,
  generatorFor,
  getPath,
  handoutsOfAct,
  moduleChecklistItems,
  nameResolver,
  narrativeFieldsDef,
  sessionChecklist,
  toMarkdown,
  type Entity,
  type Handout,
  type Id,
  type Scene,
  type SiteMap,
} from "@campaign-forge/core";
import { computeFields, type AdventureBuilderDef, type CastRoleDef, type EntityTypeDef, type LoadedModule, type NarrativeFieldsDef, type SheetField, type SheetLayout, type SheetSection } from "@campaign-forge/module-sdk";
import { LIGHT_PALETTE, drawSiteMap, labelFromPath, nodeToString, zoneKeyEntries, type SiteMapPalette } from "@campaign-forge/ui";
import { adventureDocIds, plainRefs, syncDocs, type BookletCtx } from "./booklet";

// ---------------------------------------------------------------------------
// model
// ---------------------------------------------------------------------------

/** One label → value row. An empty `value` prints as a write-in line. */
export interface FieldRow {
  label: string;
  value: string;
  /** Long text: the row spans the grid and the value wraps as a paragraph. */
  long?: boolean;
}

export interface StatPair {
  label: string;
  value: string;
}

export interface MiniTable {
  title: string;
  columns: string[];
  rows: string[][];
}

export interface CastCard {
  id: Id;
  name: string;
  /** The cast role, singular where the module gives one (e.g. "Player character"). */
  role: string;
  /** Type and subtype line, e.g. "Character · Officer". */
  kind?: string;
  /** Short stat line from the entity type's sheet summary fields. */
  stats: StatPair[];
  /** The role's builder fields with short values. */
  fields: FieldRow[];
  /** One line per act. */
  agendas: Array<{ act: number; text: string }>;
}

export interface LocationEntry {
  id: Id;
  name: string;
  /** Lead description (Markdown-safe plain text). */
  description?: string;
  /** Each sheet section with values, as a small table (e.g. secret, puzzle, clue, solution, fallback). */
  tables: Array<{ title: string; rows: FieldRow[] }>;
}

export interface SceneEntry {
  id: Id;
  /** "1.2": act number and position. */
  number: string;
  title: string;
  mandatory: boolean;
  /** Where, who, clues, encounter, and the module's scene fields (e.g. aimed at, trigger). */
  facts: FieldRow[];
  readAloud?: string;
  /** GM notes, Markdown. */
  body?: string;
  /** Events beyond the scene's own title, with their flags. */
  events: Array<{ text: string; mandatory: boolean }>;
  handouts: HandoutEntry[];
}

export interface HandoutEntry {
  id: Id;
  title: string;
  kind: string;
  /** The character it is for (agendas). */
  character?: string;
  /** Where it belongs: "Act 1", a scene title, or "Adventure". */
  where: string;
  body?: string;
}

export interface StatBlock {
  id: Id;
  name: string;
  /** Type line, e.g. "Creature · Facehugger". */
  kind: string;
  stats: StatPair[];
  lines: StatPair[];
  tables: MiniTable[];
}

export interface MapDeckFigure {
  deckId: string;
  name: string;
  /** Inline SVG markup, greyscale, sized by its viewBox (grid units). */
  svg: string;
  width: number;
  height: number;
  key: Array<{ number: number; name: string; key?: boolean }>;
  callouts: Array<{ ref: string; number?: number; label: string }>;
}

export interface ChecklistGroup {
  title: string;
  items: Array<{ text: string; note?: string }>;
}

export type BookletBlock =
  | { kind: "lead"; text: string }
  | { kind: "text"; title?: string; markdown: string }
  | { kind: "fields"; title?: string; rows: FieldRow[] }
  | { kind: "readAloud"; title?: string; text: string }
  | { kind: "secret"; title: string; markdown?: string; rows?: FieldRow[] }
  | { kind: "note"; title: string; markdown?: string; tips?: string[] }
  | { kind: "list"; title: string; items: string[] }
  | { kind: "cast"; title: string; cards: CastCard[] }
  | { kind: "locations"; items: LocationEntry[] }
  | { kind: "scenes"; scenes: SceneEntry[] }
  | { kind: "agendas"; title: string; rows: Array<{ character: string; text: string }> }
  | { kind: "checklist"; groups: ChecklistGroup[] }
  | { kind: "map"; name: string; decks: MapDeckFigure[]; note?: string }
  | { kind: "statBlocks"; title: string; items: StatBlock[] }
  | { kind: "handouts"; title: string; items: HandoutEntry[] };

export type BookletSectionKind = "overview" | "cast" | "locations" | "map" | "act" | "epilogue" | "checklist" | "appendix";

export interface BookletSection {
  id: string;
  kind: BookletSectionKind;
  /** Small line above the title, e.g. "Act 1". */
  eyebrow?: string;
  title: string;
  /** One-line summary under the title (an act's goal). */
  summary?: string;
  blocks: BookletBlock[];
}

export interface BookletTitlePage {
  title: string;
  tagline?: string;
  premise?: string;
  /** "Game Master's booklet · <builder> · <system>". */
  forLine: string;
  system: string;
  facts: FieldRow[];
}

export interface BookletDocument {
  adventureId: Id;
  title: BookletTitlePage;
  sections: BookletSection[];
}

export type BookletDocCtx = BookletCtx & { module: Pick<LoadedModule, "module" | "referenceItem" | "builder"> };

// ---------------------------------------------------------------------------
// value formatting
// ---------------------------------------------------------------------------

const isRec = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/** Template instructions left in a body (a paragraph that is all emphasis) count as empty. */
export function isPlaceholderText(markdown: string): boolean {
  const paras = markdown
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);
  if (paras.length === 0) return true;
  return paras.every((p) => /^([_*])(?![_*\s])[\s\S]*[^_*\s]\1$/.test(p) && !/\n\s*\n/.test(p));
}

function cleanMarkdown(md: string): string {
  const text = plainRefs(md).trim();
  return text && !isPlaceholderText(text) ? text : "";
}

/** A one-line, plain version of a Markdown body. */
function plainLine(md: string): string {
  return md
    .replace(/^#+\s+/gm, "")
    .replace(/[*_`]/g, "")
    .replace(/\s*\n\s*/g, " ")
    .trim();
}

/** A short summary: the text itself when short, else its first sentence (not fooled by "Dr." or "e.g."). */
function firstSentence(text: string, max = 140): string {
  const t = text.trim();
  if (t.length <= max) return t;
  const re = /[.!?](?=\s+[A-Z"“(])/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(t))) {
    const before = t.slice(0, m.index);
    if (/\b(Dr|Mr|Mrs|Ms|St|Lt|Sgt|Capt|No|vs|e\.g|i\.e)$/i.test(before)) continue;
    const s = t.slice(0, m.index + 1);
    if (s.length <= max) return s;
    break;
  }
  const cut = t.slice(0, max);
  return `${cut.slice(0, Math.max(cut.lastIndexOf(" "), 40)).replace(/[,;:]$/, "")}…`;
}

const humanize = (s: string): string => s.replace(/[-_]+/g, " ").replace(/([a-z])([A-Z])/g, "$1 $2").replace(/^./, (c) => c.toUpperCase());

function fieldLabel(f: Pick<SheetField, "label" | "path">): string {
  return f.label ?? labelFromPath(f.path);
}

/** Fields of a sheet by path. */
function sheetFields(sheet: SheetLayout | undefined): Map<string, SheetField> {
  const out = new Map<string, SheetField>();
  for (const s of sheet?.sections ?? []) for (const f of s.fields) if (!out.has(f.path)) out.set(f.path, f);
  return out;
}

function sheetOf(def: EntityTypeDef | undefined, entity: Entity): SheetLayout | undefined {
  if (!def) return undefined;
  const sub = entity.subtype ? def.subtypes?.find((s) => s.id === entity.subtype) : undefined;
  return sub?.sheet ?? def.sheet;
}

class Formatter {
  private resolveName: (id: Id) => string;
  constructor(
    private ctx: BookletDocCtx,
    store: BookletCtx["store"],
  ) {
    this.resolveName = nameResolver(store);
  }

  name(id: Id): string {
    return this.resolveName(id);
  }

  /** One scalar or list value as text, using the field's options and references. */
  value(field: SheetField | undefined, v: unknown): string {
    if (v === undefined || v === null || v === "") return "";
    const options = field?.options;
    const config = field?.config ?? {};
    if (typeof v === "boolean") return v ? "Yes" : "No";
    if (typeof v === "number") return String(v);
    if (typeof v === "string") {
      if (field?.widget === "ref") {
        if (config.everyoneValue !== undefined && v === config.everyoneValue) return typeof config.everyoneLabel === "string" ? config.everyoneLabel : "Everyone";
        return this.name(v);
      }
      if (options && !Array.isArray(options)) return this.ctx.module.referenceItem(options.ref, v)?.name ?? humanize(v);
      if (field?.widget === "select" && Array.isArray(options)) return humanize(v);
      return v.trim();
    }
    if (Array.isArray(v)) {
      const parts = v.map((x) => {
        if (typeof x === "string") return field?.widget === "reflist" ? this.name(x) : options && !Array.isArray(options) ? (this.ctx.module.referenceItem(options.ref, x)?.name ?? humanize(x)) : x;
        if (typeof x === "number") return String(x);
        if (isRec(x)) {
          const id = typeof x.id === "string" ? x.id : undefined;
          const named = typeof x.name === "string" ? x.name : typeof x.label === "string" ? x.label : typeof x.text === "string" ? x.text : undefined;
          if (named) return named;
          if (id && options && !Array.isArray(options)) return this.ctx.module.referenceItem(options.ref, id)?.name ?? humanize(id);
          return id ? humanize(id) : "";
        }
        return "";
      });
      const kept = parts.filter(Boolean);
      return kept.join(kept.some((x) => /[.!?]$/.test(x)) ? " " : ", ");
    }
    if (isRec(v)) {
      // a map of numbers (skills, attributes): the non-zero ones by name
      const entries = Object.entries(v).filter(([, x]) => x !== undefined && x !== null && x !== "" && x !== 0 && x !== false);
      return entries
        .map(([k, x]) => {
          const label = options && !Array.isArray(options) ? (this.ctx.module.referenceItem(options.ref, k)?.name ?? humanize(k)) : humanize(k);
          return typeof x === "number" ? `${label} ${x}` : typeof x === "string" ? `${label}: ${x}` : label;
        })
        .join(", ");
    }
    return "";
  }
}

// ---------------------------------------------------------------------------
// greyscale site map
// ---------------------------------------------------------------------------

/** The print palette with every colour as its grey (laser-friendly). */
const MONO_PALETTE: SiteMapPalette = Object.fromEntries(
  Object.entries({ ...LIGHT_PALETTE, background: "#ffffff", floor: "#ffffff", grid: "#e4e4e4", outOfBounds: "#bdbdbd" }).map(([k, v]) => [k, typeof v === "string" ? greyOf(v) : v]),
) as unknown as SiteMapPalette;

function greyOf(color: string): string {
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(color.trim());
  if (!m) return color;
  let hex = m[1]!;
  if (hex.length === 3) hex = hex.replace(/./g, (c) => c + c);
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  const y = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
  const h = y.toString(16).padStart(2, "0");
  return `#${h}${h}${h}`;
}

/** Every hex colour in SVG markup turned grey; area tints come from the legend and must follow. */
export function greyscaleSvg(svg: string): string {
  return svg.replace(/#(?:[0-9a-fA-F]{6}|[0-9a-fA-F]{3})\b/g, (c) => greyOf(c));
}

function mapFigure(map: SiteMap, module: BookletDocCtx["module"], prefix: string): MapDeckFigure[] {
  const layout = map.layout;
  if (!layout) return [];
  const def = generatorFor(map, module.module);
  const out: MapDeckFigure[] = [];
  layout.decks.forEach((deck, i) => {
    if (deck.layer === "duct") return;
    const d = drawSiteMap(layout, { view: "gm", deck: deck.id, legend: def?.legend, passable: def?.passable, palette: MONO_PALETTE, idPrefix: `${prefix}${i}-`, interactive: false, margin: 1 });
    const svg = greyscaleSvg(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${d.width} ${d.height}" preserveAspectRatio="xMidYMid meet">${nodeToString(d.node)}</svg>`);
    out.push({
      deckId: deck.id,
      name: deck.name,
      svg,
      width: d.width,
      height: d.height,
      key: zoneKeyEntries(layout, deck.id),
      callouts: d.callouts.map((c) => ({ ref: c.ref, label: c.label, ...(c.number !== undefined ? { number: c.number } : {}) })),
    });
  });
  return out;
}

// ---------------------------------------------------------------------------
// builder helpers
// ---------------------------------------------------------------------------

/** Field paths a builder panel lists for a narrative kind (core fields excluded), in order; undefined without a builder. */
function panelFields(builder: AdventureBuilderDef | undefined, pick: (p: AdventureBuilderDef["steps"][number]["panels"][number]) => string[] | undefined): string[] | undefined {
  if (!builder) return undefined;
  const out: string[] = [];
  for (const step of builder.steps) for (const p of step.panels) for (const f of pick(p) ?? []) if (!f.startsWith("core.") && !out.includes(f)) out.push(f);
  return out;
}

function rowsFor(fmt: Formatter, def: NarrativeFieldsDef | undefined, fields: Record<string, unknown> | undefined, paths: string[] | undefined, opts: { keepEmpty?: boolean } = {}): FieldRow[] {
  if (!def) return [];
  const byPath = sheetFields(def.sheet);
  const order = paths ?? [...byPath.keys()];
  const rows: FieldRow[] = [];
  for (const path of order) {
    const f = byPath.get(path);
    if (!f || f.widget === "object") continue;
    const value = fmt.value(f, getPath(fields ?? {}, path));
    if (!value && !opts.keepEmpty) continue;
    rows.push({ label: fieldLabel(f), value, ...(f.widget === "textarea" || value.length > 60 ? { long: true } : {}) });
  }
  return rows;
}

/** A section reads aloud when its label says so (narration, read-aloud, boxed text). */
const READ_ALOUD = /narrat|read[- ]?aloud|boxed text/i;
/** A section or field is GM-only when its title says so. */
const GM_ONLY = /\(GM\b|\bGM only\b|\bsecret\b/i;

// ---------------------------------------------------------------------------
// entities: cast cards, locations, stat blocks
// ---------------------------------------------------------------------------

function entityDef(module: BookletDocCtx["module"], entity: Entity): EntityTypeDef | undefined {
  return module.module.entityTypes.find((t) => t.id === entity.type);
}

function computedOf(def: EntityTypeDef | undefined, entity: Entity): Record<string, unknown> {
  if (!def) return {};
  try {
    return computeFields(def, entity.fields);
  } catch {
    return {};
  }
}

function summaryStats(fmt: Formatter, def: EntityTypeDef | undefined, entity: Entity): StatPair[] {
  const sheet = sheetOf(def, entity);
  if (!def || !sheet) return [];
  const byPath = sheetFields(sheet);
  const allFields = sheetFields(def.sheet);
  const computed = computedOf(def, entity);
  const out: StatPair[] = [];
  for (const path of sheet.summary ?? def.sheet.summary ?? []) {
    const f = byPath.get(path) ?? allFields.get(path);
    const raw = path in computed ? computed[path] : getPath(entity.fields, path);
    if (raw === undefined || raw === null || raw === "" || isRec(raw) || Array.isArray(raw)) continue;
    if (f?.widget === "zonemap" || f?.widget === "image") continue;
    if (typeof raw === "boolean") {
      if (raw) out.push({ label: f ? fieldLabel(f) : humanize(path), value: "" });
      continue;
    }
    // current state (stress, damage) at zero is not a stat
    if (raw === 0 && f && f.widget !== "computed" && f.widget !== "attribute") continue;
    out.push({ label: f ? fieldLabel(f) : humanize(path), value: fmt.value(f, raw) });
  }
  return out;
}

/** "Player characters" -> "Player character"; labels that are not plain plurals stay. */
export function singular(label: string): string {
  return /[^s]s$/i.test(label.trim()) ? label.trim().slice(0, -1) : label.trim();
}

function kindLine(module: BookletDocCtx["module"], fmt: Formatter, entity: Entity): string {
  const def = entityDef(module, entity);
  const sub = entity.subtype ? def?.subtypes?.find((s) => s.id === entity.subtype)?.name : undefined;
  return [def?.name ?? humanize(entity.type), sub].filter(Boolean).join(" · ");
}

/** Text widgets whose values print as prose rows. */
const PROSE_WIDGETS = new Set(["text", "textarea", "select", "number", "attribute", "checkbox", "tags", "talents", "multiselect", "list", "ref", "reflist"]);

function castCard(ctx: BookletDocCtx, fmt: Formatter, role: CastRoleDef, entity: Entity, agendas: Array<{ act: number; text: string }>): CastCard {
  const def = entityDef(ctx.module, entity);
  const sheet = sheetOf(def, entity);
  const byPath = sheetFields(sheet);
  const allFields = sheetFields(def?.sheet);
  const stats = summaryStats(fmt, def, entity);
  const statPaths = new Set(sheet?.summary ?? []);
  const fields: FieldRow[] = [];
  for (const path of role.fields ?? []) {
    if (statPaths.has(path)) continue;
    const f = byPath.get(path) ?? allFields.get(path);
    if (!f || !PROSE_WIDGETS.has(f.widget ?? "text")) continue;
    const raw = getPath(entity.fields, path);
    if (typeof raw === "boolean" || raw === undefined || raw === null || raw === "") continue;
    const value = fmt.value(f, raw);
    if (!value) continue;
    fields.push({ label: fieldLabel(f), value, ...(value.length > 48 ? { long: true } : {}) });
  }
  if (fields.length === 0 && entity.summary) fields.push({ label: "Summary", value: entity.summary, long: true });
  const kind = entity.subtype ? kindLine(ctx.module, fmt, entity) : "";
  return { id: entity.id, name: entity.name, role: singular(role.label), ...(kind ? { kind } : {}), stats, fields, agendas };
}

function locationEntry(ctx: BookletDocCtx, fmt: Formatter, role: CastRoleDef, entity: Entity): LocationEntry {
  const def = entityDef(ctx.module, entity);
  const sheet = sheetOf(def, entity);
  const wanted = role.fields ? new Set(role.fields) : undefined;
  let description: string | undefined;
  const tables: LocationEntry["tables"] = [];
  for (const section of sheet?.sections ?? []) {
    const rows: FieldRow[] = [];
    for (const f of section.fields) {
      if (wanted && !wanted.has(f.path)) continue;
      if (!PROSE_WIDGETS.has(f.widget ?? "text")) continue;
      const value = fmt.value(f, getPath(entity.fields, f.path));
      if (!value) continue;
      rows.push({ label: fieldLabel(f), value, ...(value.length > 60 ? { long: true } : {}) });
    }
    if (rows.length === 0) continue;
    if (!description && rows.length === 1 && tables.length === 0) description = rows[0]!.value;
    else tables.push({ title: section.title, rows });
  }
  if (!description && entity.summary) description = entity.summary;
  return { id: entity.id, name: entity.name, ...(description ? { description } : {}), tables };
}

/** Widgets that hold numbers worth a stat line. */
const STAT_WIDGETS = new Set(["number", "attribute", "skill", "supply", "stress", "select", "checkbox"]);
const LIST_WIDGETS = new Set(["skills", "talents", "gear", "tags", "multiselect", "reflist", "object"]);

function statBlock(ctx: BookletDocCtx, fmt: Formatter, entity: Entity): StatBlock {
  const def = entityDef(ctx.module, entity);
  const sheet = sheetOf(def, entity);
  const computed = computedOf(def, entity);
  const stats = summaryStats(fmt, def, entity);
  const shown = new Set(stats.map((s) => s.label));
  const lines: StatPair[] = [];
  const tables: MiniTable[] = [];
  const sections: SheetSection[] = sheet?.sections ?? [];
  for (const section of sections) {
    const pairs: string[] = [];
    for (const f of section.fields) {
      const widget = f.widget ?? "text";
      const label = fieldLabel(f);
      // derived values beyond the summary (health left, cover scores) are table state, not stats
      if (widget === "computed") continue;
      const raw = getPath(entity.fields, f.path);
      if (raw === undefined || raw === null || raw === "") continue;
      if (STAT_WIDGETS.has(widget)) {
        if (shown.has(label) || isRec(raw) || Array.isArray(raw)) continue;
        if (typeof raw === "boolean") {
          if (raw) pairs.push(label);
          continue;
        }
        if (raw === 0 && (widget === "number" || widget === "stress")) continue;
        pairs.push(`${label} ${fmt.value(f, raw)}`);
      } else if (LIST_WIDGETS.has(widget)) {
        const value = fmt.value(f, raw);
        if (value) lines.push({ label, value });
      } else if ((widget === "table" || widget === "list") && Array.isArray(raw)) {
        // `openEnd`: numbers at or above it mean "and up" (e.g. the 99 that closes an open-ended roll range)
        const cols = Array.isArray(f.config?.columns) ? (f.config.columns as Array<{ path: string; label?: string; openEnd?: number }>) : undefined;
        const items = raw.filter(isRec);
        if (cols && items.length) {
          const used = cols.filter((c) => items.some((it) => it[c.path] !== undefined && it[c.path] !== "" && it[c.path] !== null));
          const cell = (c: { path: string; openEnd?: number }, v: unknown) => (typeof c.openEnd === "number" && typeof v === "number" && v >= c.openEnd ? "and up" : fmt.value(undefined, v));
          tables.push({ title: label, columns: used.map((c) => c.label ?? humanize(c.path)), rows: items.map((it) => used.map((c) => cell(c, it[c.path]))) });
        } else {
          const value = fmt.value(f, raw);
          if (value) lines.push({ label, value });
        }
      }
    }
    if (pairs.length) lines.push({ label: section.title, value: pairs.join(" · ") });
  }
  return { id: entity.id, name: entity.name, kind: kindLine(ctx.module, fmt, entity), stats, lines, tables };
}

// ---------------------------------------------------------------------------
// the document
// ---------------------------------------------------------------------------

function docMarkdown(ctx: BookletCtx, resolve: (id: Id) => string, docId: Id | undefined): string {
  if (!docId) return "";
  return cleanMarkdown(toMarkdown(ctx.registry.open(docId), resolve));
}

function sceneHandouts(store: BookletCtx["store"], sceneId: Id): Handout[] {
  return store.list("handouts").filter((h) => h.attachedTo?.kind === "scene" && h.attachedTo.id === sceneId);
}

/** Build the booklet of an adventure from its records, with every body loaded. */
export async function bookletDocument(ctx: BookletDocCtx, adventureId: Id): Promise<BookletDocument> {
  await syncDocs(ctx, adventureDocIds(ctx.store, adventureId));
  return buildBookletDocument(ctx, adventureId);
}

/** Synchronous variant over already-loaded docs. */
export function buildBookletDocument(ctx: BookletDocCtx, adventureId: Id): BookletDocument {
  const store = ctx.store;
  const adventure = store.get("adventures", adventureId);
  if (!adventure) throw new Error(`adventures/${adventureId} not found`);
  const meta = store.meta();
  const mode = meta.mode;
  const gm = ctx.module.module;
  const fmt = new Formatter(ctx, store);
  const resolve = nameResolver(store);
  const md = (docId: Id | undefined) => docMarkdown(ctx, resolve, docId);
  const builder = adventure.builderId ? ctx.module.builder(adventure.builderId) : undefined;
  const acts = adventureActs(store, adventure);
  const advDef = narrativeFieldsDef(gm, "adventure", mode);
  const actDef = narrativeFieldsDef(gm, "act", mode);
  const sceneDef = narrativeFieldsDef(gm, "scene", mode);
  const advFields = adventure.fields ?? {};
  const sections: BookletSection[] = [];

  // -- title page --------------------------------------------------------------
  const advPanelFields = panelFields(builder, (p) => (p.kind === "adventure" ? p.fields : undefined));
  const advSections = (advDef?.sheet.sections ?? []).map((s) => ({ section: s, fields: s.fields.filter((f) => !advPanelFields || advPanelFields.includes(f.path)) })).filter((s) => s.fields.length > 0);
  const basics = advSections[0];
  const taglineField = basics?.section.fields.find((f) => /tagline|subtitle/i.test(f.path));
  const tagline = taglineField ? fmt.value(taglineField, getPath(advFields, taglineField.path)) : "";
  const roles = builder?.cast ?? Object.keys(adventure.cast ?? {}).map((id) => ({ id, label: humanize(id), entityType: "" }) as CastRoleDef);
  const facts: FieldRow[] = [];
  const firstRole = roles[0];
  if (firstRole) {
    const members = castMembers(store, adventureId, firstRole.id);
    if (members.length) facts.push({ label: firstRole.label, value: `${members.length}: ${members.map((m) => m.name).join(", ")}` });
  }
  if (basics) {
    for (const f of basics.fields) {
      if (f === taglineField || f.path.startsWith("core.")) continue;
      const value = fmt.value(f, getPath(advFields, f.path));
      facts.push({ label: fieldLabel(f), value, ...(f.widget === "textarea" || value.length > 60 ? { long: true } : {}) });
    }
  }
  if (acts.length) facts.push({ label: "Acts", value: acts.map((a) => `${a.number}. ${a.title ?? `Act ${a.number}`}`).join(" · ") });
  const system = gm.manifest.name;
  const title: BookletTitlePage = {
    title: adventure.title || "Untitled adventure",
    ...(tagline ? { tagline } : {}),
    ...(adventure.premise ? { premise: adventure.premise } : {}),
    forLine: ["Game Master's booklet", builder?.name].filter(Boolean).join(" · "),
    system,
    facts,
  };

  // -- overview: premise, mission, the situation, opening ----------------------
  const overview: BookletBlock[] = [];
  const intro = md(adventure.playerIntroDoc);
  if (intro) overview.push({ kind: "readAloud", title: "The mission (read to the players)", text: intro });
  const otherSections = advSections.slice(1).filter((s) => !GM_ONLY.test(s.section.title));
  const readAloudFields = otherSections.flatMap((s) => s.fields).filter((f) => READ_ALOUD.test(fieldLabel(f)) || READ_ALOUD.test(f.path));
  for (const f of readAloudFields) {
    const value = fmt.value(f, getPath(advFields, f.path));
    if (value) overview.push({ kind: "readAloud", title: fieldLabel(f), text: value });
  }
  const situation = md(adventure.gmSituationDoc);
  const gmSections = advSections.slice(1).filter((s) => GM_ONLY.test(s.section.title));
  const gmRows = gmSections.flatMap((s) => rowsFor(fmt, advDef, advFields, s.fields.map((f) => f.path)));
  if (situation || gmRows.length) overview.push({ kind: "secret", title: "The truth", ...(situation ? { markdown: situation } : {}), ...(gmRows.length ? { rows: gmRows } : {}) });
  if (adventure.hooksIn.length) overview.push({ kind: "list", title: "Hooks in", items: adventure.hooksIn });
  if (overview.length || adventure.premise) sections.push({ id: "overview", kind: "overview", title: "The adventure", ...(adventure.premise ? { summary: adventure.premise } : {}), blocks: overview });

  // -- agendas by character and act ---------------------------------------------
  const agendaBy = new Map<Id, Array<{ act: number; text: string; full: string }>>();
  for (const act of acts) {
    for (const h of handoutsOfAct(store, act)) {
      if (h.kind !== "agenda" || !h.character) continue;
      const text = plainLine(md(h.bodyDoc));
      if (!text) continue;
      const list = agendaBy.get(h.character) ?? [];
      list.push({ act: act.number, text: firstSentence(text), full: text });
      agendaBy.set(h.character, list);
    }
  }

  // -- cast and locations ---------------------------------------------------------
  const castBlocks: BookletBlock[] = [];
  const locationItems: LocationEntry[] = [];
  const castIdsSeen = new Set<Id>();
  for (const role of roles) {
    const members = castMembers(store, adventureId, role.id);
    if (!members.length) continue;
    const kind = gm.entityTypes.find((t) => t.id === (role.entityType || members[0]!.type))?.kind;
    if (kind === "location") {
      for (const m of members) locationItems.push(locationEntry(ctx, fmt, role, m));
      continue;
    }
    for (const m of members) castIdsSeen.add(m.id);
    castBlocks.push({
      kind: "cast",
      title: role.label,
      cards: members.map((m) => castCard(ctx, fmt, role, m, (agendaBy.get(m.id) ?? []).map((a) => ({ act: a.act, text: a.text })))),
    });
  }
  if (castBlocks.length) sections.push({ id: "cast", kind: "cast", title: "The cast", blocks: castBlocks });
  if (locationItems.length) sections.push({ id: "locations", kind: "locations", title: "Locations", blocks: [{ kind: "locations", items: locationItems }] });

  // -- site map ---------------------------------------------------------------------
  const sceneIds = new Set(acts.flatMap((a) => a.scenes));
  const maps = store.list("maps").filter((m) => m.layout && (m.adventure === adventureId || store.list("scenes").some((s) => sceneIds.has(s.id) && s.map === m.id)));
  const mapBlocks: BookletBlock[] = [];
  maps.forEach((m, i) => {
    const decks = mapFigure(m, ctx.module, `bk-map${i}-`);
    if (!decks.length) return;
    const ducts = m.layout!.decks.filter((d) => d.layer === "duct").length;
    mapBlocks.push({ kind: "map", name: m.name, decks, ...(ducts ? { note: `${ducts} duct sheet${ducts === 1 ? "" : "s"} not shown; print ${ducts === 1 ? "it" : "them"} from the map page.` } : {}) });
  });
  if (mapBlocks.length) sections.push({ id: "map", kind: "map", title: maps.length === 1 ? "Site map" : "Site maps", blocks: mapBlocks });

  // -- acts ------------------------------------------------------------------------
  const actPanels = new Map<number, Extract<AdventureBuilderDef["steps"][number]["panels"][number], { kind: "act" }>>();
  const actSteps = new Map<number, string[]>();
  for (const step of builder?.steps ?? []) {
    for (const p of step.panels) {
      if (p.kind !== "act") continue;
      actPanels.set(p.act, p);
      if (step.guide?.length) actSteps.set(p.act, step.guide);
    }
  }
  const scenePaths = panelFields(builder, (p) => (p.kind === "act" ? p.sceneFields : undefined));
  const participants = new Set<Id>();
  const allHandouts: HandoutEntry[] = [];
  const mandatory: Array<{ text: string; note?: string }> = [];
  for (const act of acts) {
    const blocks: BookletBlock[] = [];
    const panel = actPanels.get(act.number);
    const actFieldPaths = panel ? panel.fields.filter((f) => !f.startsWith("core.")) : undefined;
    const actRows = rowsFor(fmt, actDef, act.fields, actFieldPaths, { keepEmpty: !!panel });
    if (actRows.length) blocks.push({ kind: "fields", rows: actRows });
    const pacing = md(act.pacingDoc);
    const tips = actSteps.get(act.number) ?? [];
    if (pacing || tips.length) blocks.push({ kind: "note", title: pacing ? "Pacing" : "Running this act", ...(pacing ? { markdown: pacing } : {}), ...(tips.length ? { tips } : {}) });
    const actAgendas: Array<{ character: string; text: string }> = [];
    for (const h of handoutsOfAct(store, act)) {
      const body = md(h.bodyDoc);
      if (h.kind === "agenda") {
        if (h.character && body) actAgendas.push({ character: fmt.name(h.character), text: plainLine(body) });
        allHandouts.push({ id: h.id, title: h.title, kind: h.kind, ...(h.character ? { character: fmt.name(h.character) } : {}), where: `Act ${act.number}` });
        continue;
      }
      allHandouts.push({ id: h.id, title: h.title, kind: h.kind, ...(h.character ? { character: fmt.name(h.character) } : {}), where: `Act ${act.number}`, ...(body ? { body } : {}) });
    }
    if (actAgendas.length) blocks.push({ kind: "agendas", title: `Agendas for act ${act.number}`, rows: actAgendas });
    const scenes: SceneEntry[] = [];
    act.scenes
      .map((id) => store.get("scenes", id))
      .filter((s): s is Scene => !!s)
      .forEach((s, i) => {
        const entry = sceneEntry(ctx, fmt, md, s, `${act.number}.${i + 1}`, sceneDef, scenePaths);
        scenes.push(entry);
        for (const p of s.participants) participants.add(p);
        if (s.encounter) participants.add(s.encounter);
        for (const h of entry.handouts) allHandouts.push(h);
        if (entry.mandatory) mandatory.push({ text: `${entry.number} ${entry.title}`, ...(entry.facts.find((f) => /trigger/i.test(f.label))?.value ? { note: entry.facts.find((f) => /trigger/i.test(f.label))!.value } : {}) });
      });
    if (scenes.length) blocks.push({ kind: "scenes", scenes });
    sections.push({ id: `act-${act.number}`, kind: "act", eyebrow: `Act ${act.number}`, title: act.title || `Act ${act.number}`, ...(act.goal ? { summary: act.goal } : {}), blocks });
  }

  // -- epilogue ----------------------------------------------------------------------
  const epilogue: BookletBlock[] = [];
  const epilogueText = md(adventure.epilogueDoc);
  if (epilogueText) epilogue.push({ kind: "text", markdown: epilogueText });
  for (const s of otherSections) {
    const paths = s.fields.filter((f) => !readAloudFields.includes(f)).map((f) => f.path);
    const rows = rowsFor(fmt, advDef, advFields, paths.filter((p) => s.section.fields.find((f) => f.path === p)?.widget !== "object"));
    if (rows.length) epilogue.push({ kind: "fields", rows });
    for (const f of s.fields) {
      if (f.widget !== "object") continue;
      const raw = getPath(advFields, f.path);
      if (!isRec(raw)) continue;
      const keyedBy = typeof f.config?.keyedByCast === "string" ? f.config.keyedByCast : undefined;
      const order = keyedBy ? castMembers(store, adventureId, keyedBy).map((m) => m.id) : Object.keys(raw);
      const entries = order.filter((k) => typeof raw[k] === "string" && (raw[k] as string).trim());
      if (entries.length) epilogue.push({ kind: "fields", title: fieldLabel(f), rows: entries.map((k) => ({ label: keyedBy ? fmt.name(k) : humanize(k), value: String(raw[k]).trim(), long: true })) });
    }
  }
  if (adventure.hooksOut.length) epilogue.push({ kind: "list", title: "Hooks out", items: adventure.hooksOut });
  for (const h of store.list("handouts")) {
    if (h.attachedTo?.kind !== "adventure" || h.attachedTo.id !== adventureId) continue;
    const body = md(h.bodyDoc);
    allHandouts.push({ id: h.id, title: h.title, kind: h.kind, ...(h.character ? { character: fmt.name(h.character) } : {}), where: "Adventure", ...(body ? { body } : {}) });
  }
  if (epilogue.length) sections.push({ id: "epilogue", kind: "epilogue", title: "Endgame and epilogue", blocks: epilogue });

  // -- checklist -------------------------------------------------------------------------
  const prep = sessionChecklist(meta, moduleChecklistItems(gm.templates, gm.manifest.id)).filter((i) => i.phase === "prep");
  const agendaCount = allHandouts.filter((h) => h.kind === "agenda").length;
  const own: Array<{ text: string; note?: string }> = [];
  if (agendaCount) own.push({ text: `Print and cut the ${agendaCount} agenda cards`, note: "Hand each player theirs as the act begins." });
  if (mapBlocks.length) own.push({ text: "Print the site map", note: "The GM view in this booklet; the player map from the map page." });
  const otherHandouts = allHandouts.filter((h) => h.kind !== "agenda").length;
  if (otherHandouts) own.push({ text: `Prepare ${otherHandouts} handout${otherHandouts === 1 ? "" : "s"}` });
  const groups: ChecklistGroup[] = [];
  if (own.length) groups.push({ title: "For this adventure", items: own });
  if (mandatory.length) groups.push({ title: "Mandatory events", items: mandatory });
  if (prep.length) groups.push({ title: CHECKLIST_PHASE_TITLES.prep, items: prep.map((i) => ({ text: i.text })) });
  if (groups.length) sections.push({ id: "checklist", kind: "checklist", title: "Checklist", blocks: [{ kind: "checklist", groups }] });

  // -- appendix: stat blocks and handouts -----------------------------------------------------
  const appendix: BookletBlock[] = [];
  const statIds: Id[] = [];
  const pcRole = roles[0]?.id;
  const pcIds = new Set(pcRole ? castMembers(store, adventureId, pcRole).map((m) => m.id) : []);
  for (const role of roles.slice(1)) for (const m of castMembers(store, adventureId, role.id)) if (!statIds.includes(m.id)) statIds.push(m.id);
  for (const id of participants) if (!statIds.includes(id)) statIds.push(id);
  const blocks = statIds
    .map((id) => store.get("entities", id))
    .filter((e): e is Entity => !!e && !pcIds.has(e.id))
    .filter((e) => {
      const kind = gm.entityTypes.find((t) => t.id === e.type)?.kind;
      return kind === "character" || kind === "creature";
    })
    .map((e) => statBlock(ctx, fmt, e))
    .filter((b) => b.stats.length + b.lines.length + b.tables.length > 0);
  if (blocks.length) appendix.push({ kind: "statBlocks", title: "NPCs and creatures", items: blocks });
  if (allHandouts.length) appendix.push({ kind: "handouts", title: "Handouts", items: allHandouts });
  if (appendix.length) sections.push({ id: "appendix", kind: "appendix", title: "Appendix", blocks: appendix });

  return { adventureId, title, sections };
}

function sceneEntry(
  ctx: BookletDocCtx,
  fmt: Formatter,
  md: (id: Id | undefined) => string,
  scene: Scene,
  number: string,
  sceneDef: NarrativeFieldsDef | undefined,
  scenePaths: string[] | undefined,
): SceneEntry {
  const store = ctx.store;
  const facts: FieldRow[] = [];
  if (scene.purpose && scene.purpose !== scene.title) facts.push({ label: "Purpose", value: scene.purpose, long: scene.purpose.length > 60 });
  if (scene.location) facts.push({ label: "Where", value: fmt.name(scene.location) });
  if (scene.participants.length) facts.push({ label: "Who", value: scene.participants.map((p) => fmt.name(p)).join(", ") });
  facts.push(...rowsFor(fmt, sceneDef, scene.fields, scenePaths?.filter((p) => sheetFields(sceneDef?.sheet).has(p))));
  if (scene.clues.length) facts.push({ label: "Clues", value: scene.clues.map((c) => fmt.name(c)).join(", ") });
  if (scene.encounter) facts.push({ label: "Encounter", value: fmt.name(scene.encounter) });
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
  const events = scene.events.filter((e) => e.text.trim() && norm(e.text) !== norm(scene.title) && norm(e.text) !== norm(scene.purpose ?? "")).map((e) => ({ text: e.text.trim(), mandatory: e.mandatory }));
  const mandatory = scene.events.some((e) => e.mandatory) || scene.tags.includes("mandatory");
  const readAloud = md(scene.readAloudDoc);
  const body = md(scene.bodyDoc);
  const handouts: HandoutEntry[] = sceneHandouts(store, scene.id).map((h) => {
    const b = md(h.bodyDoc);
    return { id: h.id, title: h.title, kind: h.kind, ...(h.character ? { character: fmt.name(h.character) } : {}), where: scene.title, ...(b ? { body: b } : {}) };
  });
  return { id: scene.id, number, title: scene.title || "Untitled scene", mandatory, facts, ...(readAloud ? { readAloud } : {}), ...(body ? { body } : {}), events, handouts };
}

/** Every string in a booklet (for checks): titles, values and text. */
export function bookletStrings(doc: BookletDocument): string[] {
  const out: string[] = [];
  const walk = (v: unknown) => {
    if (typeof v === "string") out.push(v);
    else if (Array.isArray(v)) v.forEach(walk);
    else if (isRec(v)) for (const [k, x] of Object.entries(v)) if (k !== "svg") walk(x);
  };
  walk(doc);
  return out;
}

