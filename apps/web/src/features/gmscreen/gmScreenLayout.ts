/**
 * The GM screen's pages, as SvgNode drawings for the preview and the PDF
 * writer: a landscape tri-fold (three panels per side; the GM side, then the
 * side that faces the players) on Letter, A4, 11×17 or A3, or cards (each
 * panel on half a sheet, two to a sheet, for a binder). Black and white like
 * the booklet and the player packet: a black running bar with the module's
 * name, black panel title bars, vector text in the PDF standard fonts.
 *
 * Blocks flow into their panel's columns; type shrinks per panel, within
 * limits, until the panel fits. A table row, a term entry and a block's
 * heading never split across columns. What still does not fit is dropped
 * and reported, panel by panel. Pure: no DOM, no campaign; the caller
 * resolves the module's screen (`resolveGmScreen`) and passes the panels in
 * the order and sizes the GM chose.
 */
import type { GmScreenContent, GmScreenSize, ResolvedGmScreenBlock, ResolvedGmScreenPanel } from "@campaign-forge/module-sdk";
import { MAP_FONT, nodeToString, svgNode as el, textWidth, type PdfPage, type SvgNode } from "@campaign-forge/ui";

// ---------------------------------------------------------------------------
// paper and options
// ---------------------------------------------------------------------------

export type ScreenPaper = "letter" | "a4" | "tabloid" | "a3";
export type ScreenFormat = "trifold" | "cards";

/** Sheets in points, landscape. 11×17 and A3 print larger type. */
export const SCREEN_PAPERS: Record<ScreenPaper, { label: string; width: number; height: number; large: boolean }> = {
  letter: { label: "Letter", width: 792, height: 612, large: false },
  a4: { label: "A4", width: 841.89, height: 595.28, large: false },
  tabloid: { label: "11×17 (Tabloid)", width: 1224, height: 792, large: true },
  a3: { label: "A3", width: 1190.55, height: 841.89, large: true },
};

export const SCREEN_FORMATS: Record<ScreenFormat, string> = { trifold: "Tri-fold screen", cards: "Cards (half sheets)" };

export interface ScreenNotices {
  /** Short licence lines for the GM side and every card (the module's notice). */
  short: string[];
  /** The full attribution the licence requires, printed on the player side and the last card. */
  full: string[];
}

export interface ScreenLayoutInput {
  title: string;
  moduleName: string;
  campaignName?: string | undefined;
  /** In the order to print; a panel's `size` may be the GM's choice. */
  panels: ResolvedGmScreenPanel[];
  notices: ScreenNotices;
  paper: ScreenPaper;
  format: ScreenFormat;
  foldMarks: boolean;
}

export interface ScreenPlacement {
  panel: string;
  /** 0-based page (a sheet side). */
  page: number;
  side: "gm" | "players";
  /** Columns used: tri-fold columns 0-2 of the page, or card slots 0-1. */
  columns: number[];
  /** Body type size the panel printed at, in points. */
  size: number;
}

export interface ScreenOverflow {
  panel: string;
  title: string;
  /** `no-room`: the side was full, the panel was left out; `too-long`: the panel did not fit at the smallest type and lost its last rows. */
  reason: "no-room" | "too-long";
  /** What was left out: block titles, with how many lines or rows. */
  dropped: string[];
}

export interface ScreenLayout {
  pages: PdfPage[];
  /** Every line of text per page, for tests and alt text. */
  text: string[][];
  placements: ScreenPlacement[];
  overflow: ScreenOverflow[];
}

// ---------------------------------------------------------------------------
// type
// ---------------------------------------------------------------------------

interface Type {
  body: number;
  /** Line height factor. */
  line: number;
}

/** Body type sizes (points): default and smallest, for normal and large paper, per format. */
const SIZES = {
  trifold: { normal: { start: 7.5, min: 6 }, large: { start: 10.5, min: 8.5 } },
  cards: { normal: { start: 8.5, min: 6.5 }, large: { start: 11, min: 9 } },
} as const;
const STEP = 0.25;

const INK = "#000000";
const MUTED = "#444444";
const HAIR = "#9a9a9a";

// ---------------------------------------------------------------------------
// text: WinAnsi-safe, with **bold** runs
// ---------------------------------------------------------------------------

/** Symbols the PDF standard fonts cannot print, as plain stand-ins (the preview shows the same). */
export function printable(s: string): string {
  return s
    .replace(/◆{3}/g, "[3]")
    .replace(/◆{2}/g, "[2]")
    .replace(/◆/g, "[1]")
    .replace(/◇/g, "[free]")
    .replace(/↺/g, "[reaction]")
    .replace(/[‐‑‒]/g, "-")
    .replace(/[​⁠﻿]/g, "")
    .replace(/ | /g, " ");
}

interface Run {
  text: string;
  bold: boolean;
}

/** `**bold**` spans as runs. */
function runsOf(s: string, bold = false): Run[] {
  const out: Run[] = [];
  printable(s)
    .split("**")
    .forEach((part, i) => {
      if (part) out.push({ text: part, bold: bold || i % 2 === 1 });
    });
  return out;
}

/** Word-wrap runs to lines no wider than `max` (a word wider than a line gets a line of its own). */
function wrapRuns(runs: Run[], size: number, max: number): Run[][] {
  const words: Array<Run & { space: boolean }> = [];
  for (const r of runs) {
    const parts = r.text.split(/(\s+)/);
    let space = false;
    for (const p of parts) {
      if (!p) continue;
      if (/^\s+$/.test(p)) {
        space = true;
        if (words.length) words[words.length - 1]!.space = true;
        continue;
      }
      words.push({ text: p, bold: r.bold, space: false });
      space = false;
    }
    void space;
  }
  const lines: Run[][] = [];
  let cur: Run[] = [];
  let width = 0;
  let pendingSpace = false;
  for (const w of words) {
    const sp = cur.length && pendingSpace ? textWidth(" ", size, w.bold) : 0;
    const ww = textWidth(w.text, size, w.bold);
    if (cur.length && width + sp + ww > max) {
      lines.push(cur);
      cur = [];
      width = 0;
    }
    const lead = cur.length && pendingSpace ? " " : "";
    const last = cur[cur.length - 1];
    if (last && last.bold === w.bold) last.text += lead + w.text;
    else cur.push({ text: lead + w.text, bold: w.bold });
    width += (lead ? sp : 0) + ww;
    pendingSpace = w.space;
  }
  if (cur.length) lines.push(cur);
  return lines;
}

const lineText = (l: Run[]) => l.map((r) => r.text).join("");

function textNode(x: number, y: number, size: number, s: string, o: { bold?: boolean; fill?: string; anchor?: "end" | "middle" } = {}): SvgNode {
  return el("text", { x, y, "font-size": size, "font-family": MAP_FONT, fill: o.fill ?? INK, ...(o.bold ? { "font-weight": 700 } : {}), ...(o.anchor ? { "text-anchor": o.anchor } : {}) }, [s]);
}

/** One wrapped line of runs at (x, baseline). */
function runLine(x: number, baseline: number, size: number, line: Run[], fill = INK): SvgNode[] {
  const out: SvgNode[] = [];
  let xx = x;
  for (const r of line) {
    // SVG drops a text element's leading space: step over it instead
    const lead = /^\s+/.exec(r.text)?.[0] ?? "";
    xx += lead ? textWidth(lead, size, r.bold) : 0;
    const t = r.text.slice(lead.length);
    if (t) out.push(textNode(xx, baseline, size, t, { bold: r.bold, fill }));
    xx += textWidth(t, size, r.bold);
  }
  return out;
}

/** Plain text wrapped to `max` (no runs). */
function wrapPlain(s: string, size: number, max: number, bold = false): string[] {
  return wrapRuns([{ text: printable(s), bold }], size, max).map(lineText);
}

// ---------------------------------------------------------------------------
// rows
// ---------------------------------------------------------------------------

interface Row {
  height: number;
  /** Space above, dropped at the top of a column. */
  before: number;
  draw: (x: number, y: number) => SvgNode;
  text: string[];
  /** Never the last row of a column (a heading takes the next row along). */
  keep?: boolean;
  /** The block it belongs to, for the overflow report. */
  label: string;
  /** A table's head, repeated when a table continues in a new column. */
  head?: Row;
  /** The panel's title bar (not repeated as content). */
  titleBar?: boolean;
}

interface Metrics {
  body: number;
  lh: number;
  small: number;
  blockTitle: number;
  panelTitle: number;
  barH: number;
  gap: number;
}

function metrics(t: Type): Metrics {
  const body = t.body;
  return { body, lh: body * t.line, small: body * 0.86, blockTitle: body * 1.06, panelTitle: body * 1.3, barH: body * 1.3 * 1.75, gap: body * 0.55 };
}

function paraRows(text: string, m: Metrics, width: number, label: string, o: { marker?: string | undefined; before: number; size?: number; fill?: string }): Row[] {
  const size = o.size ?? m.body;
  const lh = size * (m.lh / m.body);
  const inset = o.marker ? size * (o.marker.length > 1 ? 1.6 : 1.0) : 0;
  const lines = wrapRuns(runsOf(text), size, width - inset);
  return lines.map((l, i) => ({
    height: lh,
    before: i === 0 ? o.before : 0,
    label,
    text: [i === 0 && o.marker ? `${o.marker} ${lineText(l)}` : lineText(l)],
    draw: (x, y) => el("g", {}, [i === 0 && o.marker ? textNode(x, y + size * 0.95, size, printable(o.marker), { bold: true, fill: o.fill ?? INK }) : null, ...runLine(x + inset, y + size * 0.95, size, l, o.fill ?? INK)]),
  }));
}

/** A term entry ("**Blinded** Can't see…"): one row, never split. */
function entryRow(term: string, text: string, m: Metrics, width: number, label: string): Row {
  const runs: Run[] = [...runsOf(term, true), ...(text ? [{ text: "  ", bold: false }, ...runsOf(text)] : [])];
  const indent = m.body * 0.8;
  const first = wrapRuns(runs, m.body, width);
  // hanging indent for continuation lines
  const lines: Run[][] = [];
  if (first.length <= 1) lines.push(...first);
  else {
    lines.push(first[0]!);
    const rest = first.slice(1).flatMap((l, i) => (i === 0 ? l : [{ text: " ", bold: false }, ...l]));
    lines.push(...wrapRuns(rest, m.body, width - indent));
  }
  return {
    height: lines.length * m.lh,
    before: m.gap * 0.45,
    label,
    text: [lines.map(lineText).join(" ")],
    draw: (x, y) => el("g", {}, lines.flatMap((l, i) => runLine(x + (i === 0 ? 0 : indent), y + i * m.lh + m.body * 0.95, m.body, l))),
  };
}

/** Column widths for a table: short columns at their natural width, the rest to the widest. */
function tableWidths(head: string[] | undefined, rows: string[][], size: number, width: number, pad: number): number[] {
  const n = Math.max(head?.length ?? 0, ...rows.map((r) => r.length));
  const natural = Array.from({ length: n }, (_, i) => Math.max(textWidth(printable(head?.[i] ?? ""), size, true), ...rows.map((r) => textWidth(printable(r[i] ?? ""), size))) + pad * 2);
  const total = natural.reduce((a, b) => a + b, 0);
  if (total <= width) {
    // short columns: share the spare room, but keep a narrow table compact
    const spare = Math.min(width - total, total * 0.6);
    return natural.map((w) => w + spare / n);
  }
  // the widest column wraps; the others keep their width up to a share
  const widest = natural.indexOf(Math.max(...natural));
  const cap = (width / n) * 1.25;
  const widths = natural.map((w, i) => (i === widest ? 0 : Math.min(w, cap)));
  const rest = width - widths.reduce((a, b) => a + b, 0);
  if (rest >= width * 0.3) {
    widths[widest] = rest;
    return widths;
  }
  return natural.map((w) => (w / total) * width);
}

function tableRows(head: string[] | undefined, rows: string[][], m: Metrics, width: number, label: string): Row[] {
  const size = m.body * 0.95;
  const lh = size * (m.lh / m.body);
  const pad = size * 0.3;
  const widths = tableWidths(head, rows, size, width, pad);
  const cellLines = (cells: string[], bold: boolean) => widths.map((w, i) => wrapPlain(cells[i] ?? "", size, Math.max(4, w - pad * 2), bold));
  const make = (cells: string[], isHead: boolean, first: boolean): Row => {
    const lines = cellLines(cells, isHead);
    const h = Math.max(1, ...lines.map((l) => l.length)) * lh + pad * 0.8;
    return {
      height: h,
      before: first ? m.gap * 0.5 : 0,
      label,
      text: [lines.map((l) => l.join(" ")).filter(Boolean).join(" | ")],
      draw: (x, y) => {
        const out: SvgNode[] = [];
        let xx = x;
        lines.forEach((ls, i) => {
          ls.forEach((l, j) => out.push(textNode(xx + pad, y + pad * 0.4 + j * lh + size * 0.95, size, l, { bold: isHead || i === 0 })));
          xx += widths[i]!;
        });
        out.push(el("rect", { x, y: y + h - (isHead ? 0.7 : 0.35), width, height: isHead ? 0.7 : 0.35, fill: isHead ? INK : HAIR }));
        return el("g", {}, out);
      },
    };
  };
  const out: Row[] = [];
  const headRow = head && head.some(Boolean) ? make(head, true, true) : undefined;
  if (headRow) out.push({ ...headRow, keep: true });
  rows.forEach((r, i) => {
    const row = make(r, false, !headRow && i === 0);
    if (headRow) row.head = { ...headRow, before: 0 };
    out.push(row);
  });
  return out;
}

function contentRows(c: GmScreenContent, m: Metrics, width: number, label: string, first: boolean): Row[] {
  switch (c.t) {
    case "heading":
      return paraRows(`**${c.text}**`, m, width, label, { before: first ? m.gap * 0.4 : m.gap }).map((r, i, a) => (i === a.length - 1 ? { ...r, keep: true } : r));
    case "para":
      return paraRows(c.text, m, width, label, { marker: c.marker, before: first ? m.gap * 0.35 : c.marker ? m.gap * 0.3 : m.gap * 0.55 });
    case "entry":
      return [entryRow(c.term, c.text, m, width, label)];
    case "table":
      return tableRows(c.head, c.rows, m, width, label);
  }
}

function blockRows(b: ResolvedGmScreenBlock, m: Metrics, width: number, panelTitle: string): Row[] {
  const label = b.title || b.cite || "note";
  const rows: Row[] = [];
  const cite = b.cite ? printable(b.cite) : "";
  // a block named like its panel needs no heading of its own
  const title = b.title && b.title.trim().toLowerCase() !== panelTitle.trim().toLowerCase() ? b.title : "";
  if (title) {
    const citeW = cite ? textWidth(cite, m.small) + m.body * 0.6 : 0;
    const lines = wrapPlain(title, m.blockTitle, width - citeW, true);
    lines.forEach((l, i) =>
      rows.push({
        height: m.blockTitle * 1.2,
        before: i === 0 ? m.gap * 1.3 : 0,
        label,
        keep: true,
        text: i === 0 && cite ? [l, cite] : [l],
        draw: (x, y) => el("g", {}, [textNode(x, y + m.blockTitle * 0.95, m.blockTitle, l, { bold: true }), i === 0 && cite ? textNode(x + width, y + m.blockTitle * 0.95, m.small, cite, { fill: MUTED, anchor: "end" }) : null]),
      }),
    );
  }
  b.content.forEach((c, i) => rows.push(...contentRows(c, m, width, label, i === 0 && !!title)));
  if (!title && cite) rows.push(...paraRows(cite, m, width, label, { before: m.gap * 0.2, size: m.small, fill: MUTED }));
  if (!title && rows[0]) rows[0] = { ...rows[0], before: m.gap * 1.3 };
  return rows;
}

function titleBar(title: string, m: Metrics, width: number, cont: boolean): Row {
  const s = printable(cont ? `${title} (cont.)` : title).toUpperCase();
  const size = cont ? m.panelTitle * 0.8 : m.panelTitle;
  const h = cont ? m.barH * 0.75 : m.barH;
  return {
    height: h,
    before: 0,
    label: title,
    titleBar: true,
    keep: true,
    text: [s],
    draw: (x, y) => el("g", {}, [el("rect", { x, y, width, height: h, fill: INK }), textNode(x + size * 0.45, y + h / 2 + size * 0.36, size, s, { bold: true, fill: "#ffffff" })]),
  };
}

function panelRows(p: ResolvedGmScreenPanel, m: Metrics, width: number): Row[] {
  const rows: Row[] = [titleBar(p.title, m, width, false)];
  p.blocks.forEach((b) => rows.push(...blockRows(b, m, width, p.title)));
  // the first block sits close under the bar
  if (rows[1]) rows[1] = { ...rows[1], before: m.gap * 0.9 };
  return rows;
}

// ---------------------------------------------------------------------------
// flowing rows into columns
// ---------------------------------------------------------------------------

interface Placed {
  row: Row;
  y: number;
}

interface Flow {
  columns: Placed[][];
  /** Height used in each column. */
  used: number[];
  rest: Row[];
}

/**
 * Flow rows into columns of the given heights, starting `offset` down the
 * first. A keep row never ends a column; a table row starting a column
 * brings its head; a continued panel gets a "(cont.)" bar.
 */
function flowRows(rows: Row[], heights: number[], offset: number, contBar: () => Row): Flow {
  const columns: Placed[][] = heights.map(() => []);
  const used = heights.map((_, i) => (i === 0 ? offset : 0));
  let i = 0;
  for (let c = 0; c < heights.length && i < rows.length; c++) {
    const cap = heights[c]!;
    let y = used[c]!;
    const col = columns[c]!;
    const place = (r: Row, before: number) => {
      y += before;
      col.push({ row: r, y });
      y += r.height;
    };
    if (c > 0) {
      // a new column: the panel's bar again, and a table's head
      place(contBar(), 0);
      const r = rows[i]!;
      if (r.head && !r.titleBar) place(r.head, 0);
    }
    let real = 0;
    while (i < rows.length) {
      const r = rows[i]!;
      const before = col.length ? r.before : 0;
      let need = before + r.height;
      // a keep row brings the next one along
      let j = i;
      while (rows[j]?.keep && rows[j + 1]) {
        need += rows[j + 1]!.before + rows[j + 1]!.height;
        j++;
      }
      if (y + need > cap + 0.01) break;
      place(r, before);
      real++;
      i++;
    }
    if (real === 0) {
      // nothing of the panel fits here: no bar or head left alone
      col.length = 0;
      y = c === 0 ? offset : 0;
    }
    used[c] = y;
  }
  return { columns, used, rest: rows.slice(i) };
}

/** Labels of rows left out, with counts: "Panic table (4 rows)". */
function droppedLabels(rows: Row[]): string[] {
  const counts = new Map<string, number>();
  for (const r of rows) if (!r.titleBar) counts.set(r.label, (counts.get(r.label) ?? 0) + 1);
  return [...counts.entries()].map(([l, n]) => `${l} (${n} ${n === 1 ? "line" : "lines"})`);
}

const SPAN: Record<GmScreenSize, number> = { third: 1, half: 2, full: 3 };

function* sizes(start: number, min: number): Generator<number> {
  for (let s = start; s >= min - 1e-9; s -= STEP) yield Math.round(s * 100) / 100;
}

// ---------------------------------------------------------------------------
// page furniture
// ---------------------------------------------------------------------------

interface Frame {
  width: number;
  height: number;
  margin: number;
  top: number;
  bottom: number;
}

function header(f: Frame, left: string, right: string, k: number): { nodes: SvgNode[]; text: string[] } {
  const barH = 13 * k;
  const size = 6.8 * k;
  const l = printable(left).toUpperCase();
  const r = printable(right).toUpperCase();
  return {
    nodes: [
      el("rect", { x: f.margin, y: f.margin, width: f.width - 2 * f.margin, height: barH, fill: INK }),
      textNode(f.margin + 6 * k, f.margin + barH / 2 + size * 0.36, size, l, { bold: true, fill: "#ffffff" }),
      textNode(f.width - f.margin - 6 * k, f.margin + barH / 2 + size * 0.36, size, r, { bold: true, fill: "#ffffff", anchor: "end" }),
    ],
    text: [l, r],
  };
}

/** Footer lines wrapped across `width`; returns the nodes drawn upward from `bottom` and their height. */
function footerBlock(paras: string[], x: number, bottom: number, width: number, size: number): { nodes: SvgNode[]; height: number; text: string[] } {
  const lh = size * 1.25;
  const lines = paras.flatMap((p) => wrapPlain(p, size, width));
  const height = lines.length * lh;
  const top = bottom - height;
  return {
    nodes: lines.map((l, i) => textNode(x, top + i * lh + size * 0.95, size, l, { fill: MUTED })),
    height,
    text: lines,
  };
}

function foldMarks(f: Frame, xs: number[]): SvgNode[] {
  const out: SvgNode[] = [];
  for (const x of xs) {
    out.push(el("line", { x1: x, y1: 0, x2: x, y2: f.margin * 0.7, stroke: INK, "stroke-width": 0.5 }));
    out.push(el("line", { x1: x, y1: f.height - f.margin * 0.7, x2: x, y2: f.height, stroke: INK, "stroke-width": 0.5 }));
    out.push(el("line", { x1: x, y1: f.top, x2: x, y2: f.bottom, stroke: "#bbbbbb", "stroke-width": 0.4, "stroke-dasharray": "2 3" }));
  }
  return out;
}

// ---------------------------------------------------------------------------
// tri-fold
// ---------------------------------------------------------------------------

function trifold(input: ScreenLayoutInput): ScreenLayout {
  const paper = SCREEN_PAPERS[input.paper];
  const k = paper.large ? 1.35 : 1;
  const { start, min } = SIZES.trifold[paper.large ? "large" : "normal"];
  const W = paper.width;
  const H = paper.height;
  const margin = 18;
  const gutter = 9 * k;
  const footSize = 5.4 * k;
  const pages: PdfPage[] = [];
  const texts: string[][] = [];
  const placements: ScreenPlacement[] = [];
  const overflow: ScreenOverflow[] = [];

  const sides: Array<{ side: "gm" | "players"; label: string; notes: string[] }> = [
    { side: "gm", label: "GM side", notes: input.notices.short },
    { side: "players", label: "Player side", notes: input.notices.full.length ? input.notices.full : input.notices.short },
  ];
  sides.forEach(({ side, label, notes }, pageIndex) => {
    const inner = W - 2 * margin;
    const foot = footerBlock(notes, margin, H - margin, inner, footSize);
    const top = margin + 13 * k + 7 * k;
    const bottom = H - margin - foot.height - 5 * k;
    const f: Frame = { width: W, height: H, margin, top, bottom };
    const colH = bottom - top;
    const cols = [0, 1, 2].map((i) => {
      const x0 = (i * W) / 3 + (i === 0 ? margin : gutter);
      const x1 = ((i + 1) * W) / 3 - (i === 2 ? margin : gutter);
      return { x: x0, width: x1 - x0 };
    });
    const colWidth = Math.min(...cols.map((c) => c.width));
    const nodes: SvgNode[] = [el("rect", { x: 0, y: 0, width: W, height: H, fill: "#ffffff" })];
    const text: string[] = [];
    const head = header(f, `${input.moduleName} · ${input.title}`, [input.campaignName, label].filter(Boolean).join(" · "), k);
    nodes.push(...head.nodes);
    text.push(...head.text);

    let col = 0;
    let y = 0;
    const panelGap = 8 * k;
    for (const p of input.panels.filter((x) => (x.side === "players" ? "players" : "gm") === side)) {
      const span = SPAN[p.size] ?? 1;
      const build = (body: number) => {
        const m = metrics({ body, line: 1.2 });
        return { m, rows: panelRows(p, m, colWidth) };
      };
      const commit = (fl: Flow, startCol: number, body: number, m: Metrics) => {
        const used: number[] = [];
        fl.columns.forEach((placed, ci) => {
          if (!placed.length) return;
          const c = cols[startCol + ci]!;
          used.push(startCol + ci);
          for (const pl of placed) {
            nodes.push(pl.row.draw(c.x, top + pl.y));
            text.push(...pl.row.text);
          }
        });
        placements.push({ panel: p.id, page: pageIndex, side, columns: used, size: body });
        const last = used[used.length - 1] ?? startCol;
        col = last;
        y = fl.used[last - startCol]! + panelGap;
        if (y > colH - m.barH * 3) {
          col = last + 1;
          y = 0;
        }
        if (fl.rest.length) overflow.push({ panel: p.id, title: p.title, reason: "too-long", dropped: droppedLabels(fl.rest) });
      };
      const contBar = (m: Metrics) => () => titleBar(p.title, m, colWidth, true);
      // 1. under the panel before it, in what is left of the column (one-fold panels only)
      let done = false;
      if (y > 0 && span === 1 && col < 3) {
        const { m, rows } = build(start);
        const fl = flowRows(rows, [colH], y, contBar(m));
        if (!fl.rest.length) {
          commit(fl, col, start, m);
          done = true;
        }
      }
      if (done) continue;
      // 2. from the top of the next free column, over up to `span` columns, shrinking the type
      const c0 = y > 0 ? col + 1 : col;
      const avail = Math.min(span, 3 - c0);
      if (avail <= 0) {
        // 3. no free column: what is left of the last one, at a smaller size
        let placed = false;
        if (y > 0 && col < 3) {
          for (const body of sizes(start, min)) {
            const { m, rows } = build(body);
            const fl = flowRows(rows, [colH], y, contBar(m));
            if (!fl.rest.length) {
              commit(fl, col, body, m);
              placed = true;
              break;
            }
          }
        }
        if (!placed) overflow.push({ panel: p.id, title: p.title, reason: "no-room", dropped: [`the whole panel: the ${label.toLowerCase()} is full`] });
        continue;
      }
      let last: { fl: Flow; body: number; m: Metrics } | undefined;
      for (const body of sizes(start, min)) {
        const { m, rows } = build(body);
        const fl = flowRows(rows, Array(avail).fill(colH), 0, contBar(m));
        last = { fl, body, m };
        if (!fl.rest.length) break;
      }
      commit(last!.fl, c0, last!.body, last!.m);
    }

    nodes.push(...foot.nodes);
    text.push(...foot.text);
    if (input.foldMarks) nodes.push(...foldMarks(f, [W / 3, (2 * W) / 3]));
    pages.push({ width: W, height: H, node: el("g", {}, nodes) });
    texts.push(text);
  });
  return { pages, text: texts, placements, overflow };
}

// ---------------------------------------------------------------------------
// cards
// ---------------------------------------------------------------------------

function cards(input: ScreenLayoutInput): ScreenLayout {
  const paper = SCREEN_PAPERS[input.paper];
  const k = paper.large ? 1.3 : 1;
  const { start, min } = SIZES.cards[paper.large ? "large" : "normal"];
  const W = paper.width;
  const H = paper.height;
  const cw = W / 2;
  const margin = 22 * k;
  const footSize = 5.6 * k;
  const placements: ScreenPlacement[] = [];
  const overflow: ScreenOverflow[] = [];
  // each card: header, body rows, footer
  interface Card {
    nodes: (x0: number) => SvgNode[];
    text: string[];
  }
  const out: Card[] = [];
  const short = input.notices.short;
  const shortFoot = (width: number) => footerBlock([`${input.moduleName}. ${short.join(" ")}`], 0, 0, width, footSize);
  const inner = cw - 2 * margin;
  const footH = shortFoot(inner).height;
  const top = margin + 12 * k + 6 * k;
  const bottom = H - margin - footH - 6 * k;
  const bodyH = bottom - top;

  const card = (label: string, draw: (x0: number) => SvgNode[], text: string[]): Card => ({
    nodes: (x0) => {
      const f: Frame = { width: cw, height: H, margin, top, bottom };
      const hd = header(f, `${input.moduleName} · ${input.title}`, label, k * 0.92);
      const ft = footerBlock([`${input.moduleName}. ${short.join(" ")}`], margin, H - margin, inner, footSize);
      return [el("g", { transform: `translate(${x0} 0)` }, [...hd.nodes, ...draw(margin), ...ft.nodes])];
    },
    text: [`${input.moduleName} · ${input.title}`.toUpperCase(), label.toUpperCase(), ...text, ...shortFoot(inner).text],
  });

  for (const p of input.panels) {
    const label = p.side === "players" ? "Players" : "GM";
    let last: { fl: Flow; body: number; m: Metrics; rows: Row[] } | undefined;
    for (const body of sizes(start, min)) {
      const m = metrics({ body, line: 1.22 });
      const rows = panelRows(p, m, inner);
      const fl = flowRows(rows, [bodyH], 0, () => titleBar(p.title, m, inner, true));
      last = { fl, body, m, rows };
      if (!fl.rest.length) break;
    }
    // too long for one card at the smallest type: it continues on more cards
    let rest = last!.rows;
    const first = out.length;
    let guard = 0;
    while (rest.length && guard++ < 20) {
      const m = last!.m;
      const fl = flowRows(guard === 1 ? rest : [titleBar(p.title, m, inner, true), ...rest], [bodyH], 0, () => titleBar(p.title, m, inner, true));
      const placed = fl.columns[0]!;
      if (!placed.length) break;
      out.push(card(label, (x) => placed.map((pl) => pl.row.draw(x, top + pl.y)), placed.flatMap((pl) => pl.row.text)));
      rest = fl.rest;
    }
    if (rest.length) overflow.push({ panel: p.id, title: p.title, reason: "too-long", dropped: droppedLabels(rest) });
    placements.push({ panel: p.id, page: Math.floor(first / 2), side: p.side, columns: Array.from({ length: out.length - first }, (_, i) => (first + i) % 2), size: last!.body });
  }
  // the notices: the module's notice and the full attribution, on a card of their own
  const m = metrics({ body: Math.max(min, start - 1.5), line: 1.25 });
  const noticeRows: Row[] = [titleBar("Licence and attribution", m, inner, false)];
  for (const para of [...short, ...input.notices.full]) noticeRows.push(...paraRows(para, m, inner, "notice", { before: m.gap }));
  let rest = noticeRows;
  let guard = 0;
  while (rest.length && guard++ < 10) {
    const fl = flowRows(rest, [bodyH], 0, () => titleBar("Licence and attribution", m, inner, true));
    const placed = fl.columns[0]!;
    if (!placed.length) break;
    out.push(card("Notices", (x) => placed.map((pl) => pl.row.draw(x, top + pl.y)), placed.flatMap((pl) => pl.row.text)));
    rest = fl.rest;
  }

  const pages: PdfPage[] = [];
  const texts: string[][] = [];
  for (let i = 0; i < out.length; i += 2) {
    const a = out[i]!;
    const b = out[i + 1];
    const nodes: SvgNode[] = [el("rect", { x: 0, y: 0, width: W, height: H, fill: "#ffffff" }), ...a.nodes(0), ...(b ? b.nodes(cw) : [])];
    if (input.foldMarks) {
      // cut marks between the two cards
      nodes.push(el("line", { x1: cw, y1: 0, x2: cw, y2: margin * 0.6, stroke: INK, "stroke-width": 0.5 }));
      nodes.push(el("line", { x1: cw, y1: H - margin * 0.6, x2: cw, y2: H, stroke: INK, "stroke-width": 0.5 }));
      nodes.push(el("line", { x1: cw, y1: margin, x2: cw, y2: H - margin, stroke: "#bbbbbb", "stroke-width": 0.4, "stroke-dasharray": "2 3" }));
    }
    pages.push({ width: W, height: H, node: el("g", {}, nodes) });
    texts.push([...a.text, ...(b?.text ?? [])]);
  }
  return { pages, text: texts, placements, overflow };
}

// ---------------------------------------------------------------------------
// entry points
// ---------------------------------------------------------------------------

export function layoutGmScreen(input: ScreenLayoutInput): ScreenLayout {
  return input.format === "cards" ? cards(input) : trifold(input);
}

/** A standalone SVG document of a page (the preview). */
export function pageSvg(page: PdfPage): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${page.width}" height="${page.height}" viewBox="0 0 ${page.width} ${page.height}">${nodeToString(page.node)}</svg>`;
}
