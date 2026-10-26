/**
 * The GM screen: a module's `gmScreen` (or, without one, a screen built from
 * its rule cards by tag) resolved against its own content into panels of
 * printable blocks: headings, paragraphs, term entries and compact tables.
 * The app lays the panels out and prints them; nothing here knows a page
 * size. Every block keeps its citation (a page, a section or "original").
 *
 * Pure and game-agnostic: it reads rule cards, tables, reference lists, the
 * declarative d20 conditions and play guides by id.
 */
import { diceRange } from "./dice";
import { evaluateLogic, logicIssues } from "./logic";
import type {
  AppliedSupplement,
  GameModule,
  GmScreenBlock,
  GmScreenDef,
  GmScreenPanel,
  GmScreenSide,
  GmScreenSize,
  PageRef,
  PlayModeId,
  ReferenceItem,
  RollTable,
  RuleCard,
} from "./types";

// ---------------------------------------------------------------------------
// printable content
// ---------------------------------------------------------------------------

/**
 * One printable piece of a block. Text may hold `**bold**` spans (and
 * nothing else of Markdown); everything else is plain.
 */
export type GmScreenContent =
  | { t: "heading"; text: string }
  | { t: "para"; text: string; marker?: string }
  | { t: "entry"; term: string; text: string }
  | { t: "table"; head?: string[]; rows: string[][] };

export interface ResolvedGmScreenBlock {
  /** Unique within the screen: panel id and block index. */
  key: string;
  kind: GmScreenBlock["kind"] | "auto";
  /** The id of the card, table, list or guide it prints. */
  ref?: string;
  title: string;
  /** Short citation shown with the block: "p. 72", "pp. 72–73", the cited source ("SRD 5.1"), or "original". */
  cite?: string;
  content: GmScreenContent[];
}

export interface ResolvedGmScreenPanel {
  id: string;
  title: string;
  size: GmScreenSize;
  side: GmScreenSide;
  optional: boolean;
  blocks: ResolvedGmScreenBlock[];
}

export interface ResolvedGmScreen {
  title: string;
  panels: ResolvedGmScreenPanel[];
  /** True when the module has no `gmScreen` and the panels were built from its rule cards. */
  fallback: boolean;
  /** Applied supplements whose content the panels print (their notices go with the screen). */
  supplements: AppliedSupplement[];
  /** References that did not resolve (a conformant module has none). */
  problems: string[];
}

// ---------------------------------------------------------------------------
// Markdown into parts
// ---------------------------------------------------------------------------

/** A top-level part of a Markdown text: a heading, a paragraph, a list or a table. */
export type MarkdownPart =
  | { kind: "heading"; level: number; text: string }
  | { kind: "para"; text: string }
  | { kind: "list"; items: Array<{ text: string; marker: string }> }
  | { kind: "table"; head: string[]; rows: string[][] };

/** Inline Markdown as text with only `**bold**` kept: links keep their text, other marks go. */
export function inlineText(s: string): string {
  return s
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/\*\*\*(.+?)\*\*\*/g, "**$1**")
    .replace(/__(.+?)__/g, "**$1**")
    .replace(/(^|[^*])\*(?!\s)([^*]+?)\*(?!\*)/g, "$1$2")
    .replace(/(^|\s)_(\S[^_]*\S|\S)_(?=\s|$|[.,;:!?])/g, "$1$2")
    .replace(/`([^`]*)`/g, "$1")
    .replace(/\\([_\\[\]*`])/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

/** Text without any Markdown marks (no bold either). */
export function plainText(s: string): string {
  return inlineText(s).replace(/\*\*/g, "");
}

const TABLE_ROW = /^\s*\|(.*)\|\s*$/;
const TABLE_RULE = /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/;

function cells(line: string): string[] {
  const m = TABLE_ROW.exec(line);
  const inner = m ? m[1]! : line;
  return inner.split("|").map((c) => inlineText(c));
}

/** Split Markdown into top-level parts. */
export function markdownParts(md: string | undefined): MarkdownPart[] {
  if (!md) return [];
  const out: MarkdownPart[] = [];
  const lines = md.replace(/\r\n?/g, "\n").split("\n");
  let para: string[] = [];
  let list: Array<{ text: string; marker: string }> | undefined;
  const flushPara = () => {
    const text = inlineText(para.join(" "));
    if (text) out.push({ kind: "para", text });
    para = [];
  };
  const flushList = () => {
    if (list?.length) out.push({ kind: "list", items: list });
    list = undefined;
  };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    if (!line.trim()) {
      flushPara();
      flushList();
      continue;
    }
    // a table: a header row, a rule row, then body rows
    if (TABLE_ROW.test(line) && i + 1 < lines.length && TABLE_RULE.test(lines[i + 1]!)) {
      flushPara();
      flushList();
      const head = cells(line);
      const rows: string[][] = [];
      i += 2;
      while (i < lines.length && TABLE_ROW.test(lines[i]!)) rows.push(cells(lines[i++]!));
      i--;
      out.push({ kind: "table", head, rows });
      continue;
    }
    const h = /^\s*(#{1,6})\s+(.*?)\s*#*\s*$/.exec(line);
    if (h) {
      flushPara();
      flushList();
      const text = inlineText(h[2]!);
      if (text) out.push({ kind: "heading", level: h[1]!.length, text });
      continue;
    }
    const li = /^\s*([-*+]|\d+[.)])\s+(.*)$/.exec(line);
    if (li) {
      flushPara();
      list ??= [];
      list.push({ text: inlineText(li[2]!), marker: /\d/.test(li[1]!) ? li[1]!.replace(")", ".") : "•" });
      continue;
    }
    if (list && /^\s{2,}\S/.test(line)) {
      const last = list[list.length - 1]!;
      last.text = inlineText(`${last.text} ${line}`);
      continue;
    }
    flushList();
    para.push(line.replace(/^\s*>\s?/, ""));
  }
  flushPara();
  flushList();
  return out;
}

const norm = (s: string) => plainText(s).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/** The parts under a heading (until the next heading of the same or a higher level), or undefined when the heading is not there. */
export function markdownSection(parts: MarkdownPart[], heading: string): MarkdownPart[] | undefined {
  const want = norm(heading);
  const start = parts.findIndex((p) => p.kind === "heading" && norm(p.text) === want);
  if (start === -1) return undefined;
  const level = (parts[start] as { level: number }).level;
  const out: MarkdownPart[] = [];
  for (let i = start + 1; i < parts.length; i++) {
    const p = parts[i]!;
    if (p.kind === "heading" && p.level <= level) break;
    out.push(p);
  }
  return out;
}

function partContent(p: MarkdownPart): GmScreenContent[] {
  switch (p.kind) {
    case "heading":
      return [{ t: "heading", text: plainText(p.text) }];
    case "para":
      return [{ t: "para", text: p.text }];
    case "list":
      return p.items.map((i) => ({ t: "para", text: i.text, marker: i.marker }));
    case "table":
      return [{ t: "table", head: p.head.map(plainText), rows: p.rows.map((r) => r.map(plainText)) }];
  }
}

/** A rule card's text (whole, or the named excerpt) as printable content; undefined when the excerpt is not in the card. */
export function ruleExcerpt(card: Pick<RuleCard, "summary">, excerpt: { section?: string; parts?: number[] } = {}): GmScreenContent[] | undefined {
  let parts = markdownParts(card.summary);
  if (excerpt.section !== undefined) {
    const sec = markdownSection(parts, excerpt.section);
    if (!sec) return undefined;
    parts = sec;
  }
  if (excerpt.parts) {
    const picked: MarkdownPart[] = [];
    for (const i of excerpt.parts) {
      const p = parts[i];
      if (!p) return undefined;
      picked.push(p);
    }
    parts = picked;
  }
  return parts.flatMap(partContent);
}

// ---------------------------------------------------------------------------
// citations
// ---------------------------------------------------------------------------

/** "p. 72" or "pp. 72–73". */
export function pageLabel(page: PageRef): string {
  return Array.isArray(page) ? (page[0] === page[1] ? `p. ${page[0]}` : `pp. ${page[0]}–${page[1]}`) : `p. ${page}`;
}

/** The source part of a section citation: "SRD 5.1 — Combat: Cover" reads "SRD 5.1". */
export function citeSource(cite: string): string {
  return cite.split(/\s+[—–]\s+|:\s/)[0]!.trim();
}

/** Short citation for a block: its page, the source of its section citation, or "original". */
export function shortCite(item: { page?: PageRef | undefined; cite?: string | undefined; original?: boolean | undefined } | undefined): string | undefined {
  if (!item) return undefined;
  if (item.page !== undefined) return pageLabel(item.page);
  if (item.cite) return citeSource(item.cite);
  if (item.original) return "original";
  return undefined;
}

// ---------------------------------------------------------------------------
// resolving blocks
// ---------------------------------------------------------------------------

const inMode = (modes: PlayModeId[] | undefined, mode: PlayModeId | undefined) => mode === undefined || !modes || modes.length === 0 || modes.includes(mode);

const DEFAULT_RESULT_KEYS = ["effect", "summary", "text", "description"];

const capital = (s: string) => (s ? s[0]!.toUpperCase() + s.slice(1) : s);
/** "timeLimit" reads "Time limit". */
const humanKey = (k: string) => capital(k.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/[_-]+/g, " ").toLowerCase());

function valueText(v: unknown): string {
  if (v === undefined || v === null || v === false) return "";
  if (v === true) return "yes";
  if (Array.isArray(v)) return v.map(valueText).filter(Boolean).join(", ");
  if (typeof v === "object") return Object.values(v as Record<string, unknown>).map(valueText).filter(Boolean).join(", ");
  return plainText(String(v));
}

/**
 * A row's range as printed: "3", "11–16", or an open end: "≤0" for a first
 * row that starts below what the dice roll, "12+" for a last row that runs
 * past it (tables with modifiers).
 */
export function rangeLabel(table: Pick<RollTable, "dice">, range: [number, number], at: { first?: boolean; last?: boolean } = { first: true, last: true }): string {
  let min = -Infinity;
  let max = Infinity;
  try {
    [min, max] = diceRange(table.dice);
  } catch {
    // not a dice expression: print the range as it is
  }
  const [a, b] = range;
  if (at.first && a < min && b < max && a !== b) return `≤${b}`;
  if (at.last && b > max && a > min && a !== b) return `${a}+`;
  return a === b ? String(a) : `${a}–${b}`;
}

/** A table as compact printable content: the roll line, then one row per table row. */
export function tableContent(table: RollTable, columns?: string[], notes = false): GmScreenContent[] {
  const objectRows = table.rows.some((r) => typeof r.result === "object" && r.result !== null);
  const keys = columns ?? (objectRows ? DEFAULT_RESULT_KEYS.filter((k) => table.rows.some((r) => typeof r.result === "object" && r.result !== null && typeof (r.result as Record<string, unknown>)[k] === "string")).slice(0, 1) : []);
  const rows = table.rows.map((r, i) => {
    const res = r.result;
    const obj = typeof res === "object" && res !== null ? (res as Record<string, unknown>) : undefined;
    const label = plainText(r.label ?? (obj ? String(obj.label ?? obj.name ?? "") : String(res)));
    const values = obj ? keys.map((k) => valueText(obj[k])) : [];
    return [rangeLabel(table, r.range, { first: i === 0, last: i === table.rows.length - 1 }), label, ...values];
  });
  // drop value columns that only repeat the label or are empty everywhere
  const width = 2 + keys.length;
  const keep = Array.from({ length: width }, (_, i) => i < 2 || rows.some((row) => row[i] && row[i] !== row[1]));
  const head = [table.dice.toUpperCase(), "Result", ...keys.map(humanKey)].filter((_, i) => keep[i]);
  const out: GmScreenContent[] = [];
  const signed = (table.modifiers ?? []).filter((m) => m.label && /^[+\-−]/.test(m.label)).map((m) => m.label!);
  const situational = (table.modifiers ?? [])
    .filter((m) => m.label && !/^[+\-−]/.test(m.label))
    .map((m) => (typeof m.add === "number" ? `${m.label} ${m.add >= 0 ? "+" : "−"}${Math.abs(m.add)}` : m.label!));
  if (signed.length || situational.length) out.push({ t: "para", text: `Roll ${[table.dice, ...signed].join(" ")}${situational.length ? `; modifiers: ${situational.join(", ")}` : ""}` });
  out.push({ t: "table", head, rows: rows.map((row) => row.filter((_, i) => keep[i])) });
  if (notes && table.notes) out.push({ t: "para", text: inlineText(table.notes) });
  return out;
}

function listItemEntry(item: ReferenceItem, columns: string[] | undefined, summary: boolean): GmScreenContent {
  const extra = (columns ?? []).map((k) => valueText((item as unknown as Record<string, unknown>)[k])).filter(Boolean);
  const term = [plainText(item.name), ...extra].join(" ");
  const description = (item as unknown as Record<string, unknown>).description;
  const text = item.summary ?? (typeof description === "string" ? description : "");
  return { t: "entry", term, text: summary && text ? inlineText(text) : "" };
}

/** List entries; names alone (no text) run together on one line. */
function listContent(entries: GmScreenContent[]): GmScreenContent[] {
  if (entries.every((e) => e.t === "entry" && !e.text)) return [{ t: "para", text: entries.map((e) => (e as { term: string }).term).join(" · ") }];
  return entries;
}

interface Ctx {
  module: GameModule;
  mode: PlayModeId | undefined;
  problems: string[];
  used: Set<string>;
}

function resolveBlock(b: GmScreenBlock, key: string, ctx: Ctx): ResolvedGmScreenBlock | undefined {
  const { module } = ctx;
  if (!inMode(b.mode, ctx.mode)) return undefined;
  const miss = (what: string) => {
    ctx.problems.push(`${key}: ${what}`);
    return undefined;
  };
  switch (b.kind) {
    case "rule": {
      const card = module.rules.find((r) => r.id === b.rule);
      if (!card) return miss(`unknown rule card "${b.rule}"`);
      if (!inMode(card.mode, ctx.mode)) return undefined;
      const content = ruleExcerpt(card, b);
      if (!content) return miss(`rule card "${b.rule}" has no excerpt ${b.section !== undefined ? `"${b.section}"` : ""}${b.parts ? ` parts ${b.parts.join(", ")}` : ""}`);
      ctx.used.add(card.id);
      return { key, kind: "rule", ref: card.id, title: b.title ?? card.title, ...cite(shortCite(card)), content };
    }
    case "table": {
      const table = module.tables.find((t) => t.id === b.table);
      if (!table) return miss(`unknown table "${b.table}"`);
      if (!inMode(table.mode, ctx.mode)) return undefined;
      ctx.used.add(table.id);
      return { key, kind: "table", ref: table.id, title: b.title ?? table.name, ...cite(shortCite(table)), content: tableContent(table, b.columns, b.notes) };
    }
    case "list": {
      const list = module.referenceLists.find((l) => l.id === b.list);
      if (!list) return miss(`unknown reference list "${b.list}"`);
      let items: ReferenceItem[];
      if (b.items) {
        items = [];
        for (const id of b.items) {
          const it = list.items.find((i) => i.id === id);
          if (it) items.push(it);
          else ctx.problems.push(`${key}: list "${list.id}" has no item "${id}"`);
        }
      } else items = list.items;
      if (b.where !== undefined) items = items.filter((i) => !!evaluateLogic(b.where!, i));
      items = items.filter((i) => inMode(i.mode, ctx.mode));
      if (items.length === 0) return undefined;
      ctx.used.add(list.id);
      for (const i of items) ctx.used.add(`${list.id}:${i.id}`);
      return { key, kind: "list", ref: list.id, title: b.title ?? list.name, ...cite(shortCite(list) ?? shortCite(items[0])), content: listContent(items.map((i) => listItemEntry(i, b.columns, b.summary !== false))) };
    }
    case "conditions": {
      const def = module.d20Combat;
      if (!def) return miss("the module declares no d20 conditions");
      const conditions = b.conditions ? b.conditions.map((id) => def.conditions.find((c) => c.id === id) ?? (ctx.problems.push(`${key}: unknown condition "${id}"`), undefined)).filter((c) => !!c) : def.conditions;
      if (conditions.length === 0) return undefined;
      const title = b.title ?? (conditions.length === 1 ? plainText(conditions[0]!.name) : "Conditions");
      // one condition under its own name: its helper text alone
      const content: GmScreenContent[] =
        conditions.length === 1 && norm(title) === norm(conditions[0]!.name) ? [{ t: "para", text: inlineText(conditions[0]!.summary) }] : conditions.map((c) => ({ t: "entry", term: plainText(c.name), text: inlineText(c.summary) }));
      return { key, kind: "conditions", title, ...cite(shortCite(def) ?? shortCite(conditions[0])), content };
    }
    case "guide": {
      const guides = module.playGuides ?? [];
      const g = b.guide ? guides.find((x) => x.id === b.guide) : guides[0];
      if (!g) return miss(b.guide ? `unknown play guide "${b.guide}"` : "the module has no play guide");
      if (!inMode(g.mode, ctx.mode)) return undefined;
      const content: GmScreenContent[] = [];
      const tips = g.tips ?? [];
      const tipIdx = b.tips === true ? tips.map((_, i) => i) : Array.isArray(b.tips) ? b.tips : [];
      for (const i of tipIdx) {
        const tip = tips[i];
        if (!tip) {
          ctx.problems.push(`${key}: play guide "${g.id}" has no tip ${i}`);
          continue;
        }
        content.push({ t: "para", marker: "•", text: `${inlineText(tip.text)}${tip.page !== undefined && !/\bpp?\. \d/.test(tip.text.slice(-12)) ? ` (${pageLabel(tip.page)})` : ""}` });
      }
      const cues = Math.max(0, b.cues ?? 1);
      for (const id of b.entries ?? []) {
        const e = g.entries.find((x) => x.id === id);
        if (!e) {
          ctx.problems.push(`${key}: play guide "${g.id}" has no entry "${id}"`);
          continue;
        }
        if (!inMode(e.mode, ctx.mode)) continue;
        const parts = [e.summary ? inlineText(e.summary) : "", ...e.callFor.slice(0, cues).map(inlineText)].filter(Boolean);
        const text = parts.join(" ");
        content.push({ t: "entry", term: plainText(e.label), text: e.page !== undefined && !/\(pp?\. [\d–, ]+\)\.?$/.test(text) ? `${text} (${pageLabel(e.page)})` : text });
      }
      if (content.length === 0) return undefined;
      ctx.used.add(g.id);
      return { key, kind: "guide", ref: g.id, title: b.title ?? g.title, ...cite(shortCite(g) ?? (g.original ? "original" : undefined)), content };
    }
    case "text": {
      const content = markdownParts(b.text).flatMap(partContent);
      if (content.length === 0) return undefined;
      const sources = [b.page !== undefined ? pageLabel(b.page) : undefined, b.cite ? citeSource(b.cite) : undefined].filter((s): s is string => !!s);
      for (const r of b.rules ?? []) {
        const card = module.rules.find((x) => x.id === r);
        const c = shortCite(card);
        if (c && c !== "original" && !sources.includes(c)) sources.push(c);
      }
      return { key, kind: "text", title: b.title ?? "", cite: sources.length ? `original; ${sources.join(", ")}` : "original", content };
    }
  }
}

const cite = (c: string | undefined): { cite?: string } => (c ? { cite: c } : {});

// ---------------------------------------------------------------------------
// the fallback screen
// ---------------------------------------------------------------------------

/** Words that mark a reference list as conditions-like (the fallback's player side). */
const CONDITION_LIST = /\bconditions?\b/i;

/**
 * A screen for a module without `gmScreen`: its rule cards grouped by their
 * most used tags (one panel per tag, short cards first), the play guide's
 * tips, and on the player side the d20 conditions or a conditions-like
 * reference list.
 */
export function fallbackGmScreen(module: GameModule): GmScreenDef {
  const panels: GmScreenPanel[] = [];
  const count = new Map<string, number>();
  for (const r of module.rules) for (const t of r.tags ?? []) count.set(t, (count.get(t) ?? 0) + 1);
  const tags = [...count.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([t]) => t);
  const taken = new Set<string>();
  for (const tag of tags) {
    if (panels.length >= 4) break;
    const cards = module.rules
      .filter((r) => r.tags?.includes(tag) && !taken.has(r.id))
      .sort((a, b) => a.summary.length - b.summary.length || a.id.localeCompare(b.id))
      .slice(0, 6);
    if (cards.length === 0) continue;
    for (const c of cards) taken.add(c.id);
    panels.push({ id: `auto.tag.${tag}`, title: capital(tag), size: "third", blocks: cards.map((c) => ({ kind: "rule", rule: c.id })) });
  }
  // rule cards without tags
  if (panels.length === 0 && module.rules.length) {
    const cards = [...module.rules].sort((a, b) => a.summary.length - b.summary.length).slice(0, 6);
    panels.push({ id: "auto.rules", title: "Rules", size: "third", blocks: cards.map((c) => ({ kind: "rule", rule: c.id })) });
  }
  const guide = module.playGuides?.[0];
  if (guide?.tips?.length) panels.push({ id: "auto.tips", title: "Rolling", size: "third", blocks: [{ kind: "guide", guide: guide.id, tips: guide.tips.map((_, i) => i).slice(0, 8) }] });
  if (module.d20Combat?.conditions.length) panels.push({ id: "auto.conditions", title: "Conditions", size: "full", side: "players", blocks: [{ kind: "conditions" }] });
  else {
    const list = module.referenceLists.find((l) => CONDITION_LIST.test(l.id) || CONDITION_LIST.test(l.name));
    if (list) panels.push({ id: "auto.conditions", title: list.name, size: "full", side: "players", blocks: [{ kind: "list", list: list.id }] });
  }
  return { title: "GM screen", panels };
}

// ---------------------------------------------------------------------------
// resolving the screen
// ---------------------------------------------------------------------------

export interface ResolveGmScreenOptions {
  /** The campaign's play mode: panels, blocks and content for other modes are left out. */
  mode?: PlayModeId;
}

/** The module's GM screen (or the fallback) with every reference resolved into printable content. */
export function resolveGmScreen(module: GameModule, options: ResolveGmScreenOptions = {}): ResolvedGmScreen {
  const def = module.gmScreen ?? fallbackGmScreen(module);
  const ctx: Ctx = { module, mode: options.mode, problems: [], used: new Set() };
  const panels: ResolvedGmScreenPanel[] = [];
  for (const p of def.panels) {
    if (!inMode(p.mode, options.mode)) continue;
    const blocks = p.blocks.map((b, i) => resolveBlock(b, `${p.id}#${i}`, ctx)).filter((b): b is ResolvedGmScreenBlock => !!b && b.content.length > 0);
    if (blocks.length === 0) continue;
    panels.push({ id: p.id, title: p.title, size: p.size ?? "third", side: p.side ?? "gm", optional: p.optional === true, blocks });
  }
  const supplements = (module.manifest.supplements ?? []).filter((s) => [...ctx.used].some((id) => id.startsWith(`${s.id}.`) || id.includes(`:${s.id}.`)));
  return { title: def.title ?? "GM screen", panels, fallback: !module.gmScreen, supplements, problems: ctx.problems };
}

// ---------------------------------------------------------------------------
// conformance
// ---------------------------------------------------------------------------

export interface GmScreenIssue {
  severity: "error" | "warning";
  where: string;
  message: string;
}

const SIZES: readonly GmScreenSize[] = ["third", "half", "full"];
const SIDES: readonly GmScreenSide[] = ["gm", "players"];
/** A quick-rules note longer than this is no longer quick (a warning). */
export const GM_SCREEN_TEXT_LIMIT = 700;

function validPageRef(p: unknown): boolean {
  if (typeof p === "number") return Number.isInteger(p) && p > 0;
  return Array.isArray(p) && p.length === 2 && p.every((x) => Number.isInteger(x) && x > 0) && (p[0] as number) <= (p[1] as number);
}

/** Problems in a module's `gmScreen`: unknown references, excerpts not in their card, uncited or unoriginal notes, undeclared modes. */
export function gmScreenIssues(module: GameModule): GmScreenIssue[] {
  const def = module.gmScreen;
  const out: GmScreenIssue[] = [];
  if (!def) return out;
  const err = (where: string, message: string) => out.push({ severity: "error", where, message });
  const warn = (where: string, message: string) => out.push({ severity: "warning", where, message });
  if (!Array.isArray(def.panels)) {
    err("gmScreen", "panels must be a list");
    return out;
  }
  if (def.panels.length === 0) warn("gmScreen", "the GM screen has no panels");
  const modes = new Set(module.manifest.modes.map((m) => m.id));
  const checkModes = (m: PlayModeId[] | undefined, where: string) => {
    for (const x of m ?? []) if (!modes.has(x)) err(where, `mode "${x}" is not declared in the manifest`);
  };
  const ids = new Set<string>();
  for (const p of def.panels) {
    const pw = `gmScreen:${p.id}`;
    if (!p.id) err("gmScreen", "a panel has no id");
    else if (ids.has(p.id)) err(pw, "duplicate panel id");
    ids.add(p.id);
    if (!p.title) err(pw, "panel has no title");
    if (p.size !== undefined && !SIZES.includes(p.size)) err(pw, `size must be one of ${SIZES.join(", ")}`);
    if (p.side !== undefined && !SIDES.includes(p.side)) err(pw, `side must be one of ${SIDES.join(", ")}`);
    checkModes(p.mode, pw);
    if (!Array.isArray(p.blocks) || p.blocks.length === 0) {
      err(pw, "panel has no blocks");
      continue;
    }
    p.blocks.forEach((b, i) => {
      const w = `${pw}#${i}`;
      checkModes(b.mode, w);
      switch (b.kind) {
        case "rule": {
          const card = module.rules.find((r) => r.id === b.rule);
          if (!card) err(w, `references unknown rule card "${b.rule}"`);
          else if (!ruleExcerpt(card, b)) err(w, b.section !== undefined && !markdownSection(markdownParts(card.summary), b.section) ? `rule card "${b.rule}" has no heading "${b.section}"` : `rule card "${b.rule}" has no parts ${(b.parts ?? []).join(", ")}${b.section !== undefined ? ` under "${b.section}"` : ""}`);
          break;
        }
        case "table": {
          const t = module.tables.find((x) => x.id === b.table);
          if (!t) err(w, `references unknown table "${b.table}"`);
          else if (b.columns) {
            for (const k of b.columns) if (!t.rows.some((r) => typeof r.result === "object" && r.result !== null && k in (r.result as Record<string, unknown>))) warn(w, `no row of table "${t.id}" has a "${k}" result`);
          }
          break;
        }
        case "list": {
          const l = module.referenceLists.find((x) => x.id === b.list);
          if (!l) {
            err(w, `references unknown reference list "${b.list}"`);
            break;
          }
          for (const id of b.items ?? []) if (!l.items.some((x) => x.id === id)) err(w, `list "${l.id}" has no item "${id}"`);
          if (b.where !== undefined) {
            const problems = logicIssues(b.where);
            for (const m of problems) err(w, `where: ${m}`);
            if (!problems.length) {
              try {
                if (!l.items.some((i) => !!evaluateLogic(b.where!, i))) warn(w, `where keeps no item of "${l.id}"`);
              } catch (e) {
                err(w, `where: ${(e as Error).message}`);
              }
            }
          }
          break;
        }
        case "conditions": {
          const d = module.d20Combat;
          if (!d) err(w, "a conditions block needs d20Combat conditions");
          else for (const id of b.conditions ?? []) if (!d.conditions.some((c) => c.id === id)) err(w, `references unknown condition "${id}"`);
          break;
        }
        case "guide": {
          const guides = module.playGuides ?? [];
          const g = b.guide ? guides.find((x) => x.id === b.guide) : guides[0];
          if (!g) {
            err(w, b.guide ? `references unknown play guide "${b.guide}"` : "the module has no play guide");
            break;
          }
          if (Array.isArray(b.tips)) for (const i of b.tips) if (!Number.isInteger(i) || !g.tips?.[i]) err(w, `play guide "${g.id}" has no tip ${i}`);
          for (const id of b.entries ?? []) if (!g.entries.some((e) => e.id === id)) err(w, `play guide "${g.id}" has no entry "${id}"`);
          if (b.tips === undefined && !b.entries?.length) warn(w, "a guide block with neither tips nor entries prints nothing");
          break;
        }
        case "text": {
          if (b.original !== true) err(w, "a text block is the module author's own words: mark it original: true (reference a rule card, table or list for source text)");
          if (!b.text || !b.text.trim()) err(w, "text block is empty");
          else if (b.text.length > GM_SCREEN_TEXT_LIMIT) warn(w, `text block is ${b.text.length} characters; keep quick rules under ${GM_SCREEN_TEXT_LIMIT} or reference a rule card`);
          if (b.page !== undefined && !validPageRef(b.page)) err(w, "invalid page reference");
          for (const r of b.rules ?? []) if (!module.rules.some((x) => x.id === r)) err(w, `cites unknown rule card "${r}"`);
          break;
        }
        default:
          err(w, `unknown block kind "${(b as { kind?: unknown }).kind}"`);
      }
    });
  }
  return out;
}
