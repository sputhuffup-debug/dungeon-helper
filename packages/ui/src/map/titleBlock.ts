/**
 * Title block for printed and exported site maps: map name, deck, view,
 * scale, a 5 m scale bar with 1 m ticks, the strip number when a deck is
 * split, and (on GM prints) a compact zone-number key and the marker notes
 * that did not fit on the map. It is drawn in a band beside the map, never
 * over it.
 *
 * Sizes are given in the target's own units: `pt` is the size of one
 * typographic point and `perMetre` the length of one metre, so the same
 * block serves PDF pages (points) and SVG exports (grid units).
 */
import type { SiteLayout } from "@campaign-forge/module-sdk";
import { MAP_FONT, ellipsize, textWidth } from "./textMetrics";
import { el, type SiteMapCallout, type SiteMapViewKind, type SvgNode } from "./siteMapDraw";

/** Print scales: millimetres of paper per metre of map. */
export interface PrintScale {
  id: string;
  mmPerMetre: number;
  /** Label for a scale select. */
  label: string;
  /** Text for the title block. */
  text: string;
}

export const PRINT_SCALES: PrintScale[] = [
  { id: "inch", mmPerMetre: 25.4, label: "1 in = 1 m (28mm miniatures)", text: "1 in = 1 m · 28mm miniatures" },
  { id: "true-28mm", mmPerMetre: 1000 / 56, label: "28mm true scale (1:56, 1 m ≈ 17.9 mm)", text: "1:56 · 1 m = 17.9 mm · 28mm true scale" },
  { id: "overview", mmPerMetre: 10, label: "1 m = 1 cm (overview)", text: "1 m = 1 cm · overview" },
];

/** The default print scale: 1 inch per metre (a 1 m square holds a 25 mm base). */
export const DEFAULT_MM_PER_METRE = 25.4;

/** Title-block text for a scale. */
export function scaleText(mmPerMetre: number): string {
  const preset = PRINT_SCALES.find((s) => Math.abs(s.mmPerMetre - mmPerMetre) < 1e-6);
  if (preset) return preset.text;
  return `1 m = ${Math.round(mmPerMetre * 10) / 10} mm`;
}

/** The layout's grid unit in metres (`gridM`, default 1). */
function unitMetres(layout: Pick<SiteLayout, "gridM">): number {
  return layout.gridM && layout.gridM > 0 ? layout.gridM : 1;
}

/** "5 ft": one grid square of a layout measured in its own unit. */
export function squareName(layout: Pick<SiteLayout, "gridUnit">): string {
  return layout.gridUnit ? `${layout.gridUnit.size} ${layout.gridUnit.unit}` : "1 m";
}

/**
 * Print scales for a layout: metric maps get PRINT_SCALES; a map measured in
 * squares of its own unit (5-foot squares) gets one square per inch for
 * miniatures, 28mm true scale and one square per centimetre.
 */
export function printScalesFor(layout: Pick<SiteLayout, "gridM" | "gridUnit">): PrintScale[] {
  if (!layout.gridUnit) return PRINT_SCALES;
  const m = unitMetres(layout);
  const sq = squareName(layout);
  const true28 = Math.round((1000 / 56) * m * 10) / 10;
  return [
    { id: "inch", mmPerMetre: 25.4 / m, label: `1 in = ${sq} (28mm miniatures)`, text: `1 in = ${sq} · 28mm miniatures` },
    { id: "true-28mm", mmPerMetre: 1000 / 56, label: `28mm true scale (1:56, ${sq} ≈ ${true28} mm)`, text: `1:56 · ${sq} = ${true28} mm · 28mm true scale` },
    { id: "overview", mmPerMetre: 10 / m, label: `1 cm = ${sq} (overview)`, text: `1 cm = ${sq} · overview` },
  ];
}

/** The default print scale of a layout: one inch per metre, or per square for a map in squares. */
export function defaultMmPerMetre(layout: Pick<SiteLayout, "gridM" | "gridUnit">): number {
  return printScalesFor(layout)[0]!.mmPerMetre;
}

/** Title-block text for a scale on a layout (the metric texts for metric maps). */
export function scaleTextFor(layout: Pick<SiteLayout, "gridM" | "gridUnit">, mmPerMetre: number): string {
  if (!layout.gridUnit) return scaleText(mmPerMetre);
  const preset = printScalesFor(layout).find((s) => Math.abs(s.mmPerMetre - mmPerMetre) < 1e-6);
  if (preset) return preset.text;
  return `${squareName(layout)} = ${Math.round(mmPerMetre * unitMetres(layout) * 10) / 10} mm`;
}

/** The scale bar's unit for a layout measured in squares: one square's length in the target units, and its name. */
export function scaleUnitFor(layout: Pick<SiteLayout, "gridM" | "gridUnit">, perMetre: number): ScaleUnit | undefined {
  return layout.gridUnit ? { per: perMetre * unitMetres(layout), size: layout.gridUnit.size, name: layout.gridUnit.unit } : undefined;
}

/** A scale bar step that is not a metre: `per` target units long, labelled in multiples of `size` `name`. */
export interface ScaleUnit {
  per: number;
  size: number;
  name: string;
}

/** Scales at which a 1 m square holds a miniature's base. */
export function isMiniatureScale(mmPerMetre: number): boolean {
  return mmPerMetre >= 15;
}

/** 1 m grid squares by default: on for player and tracking prints at miniature scales. */
export function defaultGridSquares(view: SiteMapViewKind, mmPerMetre: number): boolean {
  return view !== "gm" && isMiniatureScale(mmPerMetre);
}

export const VIEW_NAMES: Record<SiteMapViewKind, string> = { gm: "GM map", player: "Player map", tracking: "Tracking map" };

export interface TitleBlockInput {
  /** Map name. */
  title: string;
  deck?: string | undefined;
  view: SiteMapViewKind;
  /** Scale line, e.g. "1 in = 1 m · 28mm miniatures". Omitted on unscaled exports. */
  scale?: string | undefined;
  /** "Strip 2 of 3" when a deck is split. */
  strip?: { index: number; count: number } | undefined;
  /** Zone-number key entries (GM prints). */
  zoneKey?: Array<{ number: number; name: string; key?: boolean | undefined }> | undefined;
  /** Marker texts moved off the map. */
  callouts?: SiteMapCallout[] | undefined;
  /** What a numbered zone is called in the key ("room" on a dungeon numbered by its rooms; default "zone"). */
  zoneWord?: string | undefined;
  /** A small note (print instructions). */
  note?: string | undefined;
  /** The print is turned 90° clockwise from the screen map: show a compass note. */
  rotated?: boolean | undefined;
}

export interface TitleBlockFrame {
  x: number;
  y: number;
  width: number;
  /** One typographic point in the target units. */
  pt: number;
  /** One metre in the target units. */
  perMetre: number;
  /** A map in squares of its own unit: the scale bar counts squares (0, 5, 10… ft) instead of metres. */
  unit?: ScaleUnit | undefined;
  /** Largest number of key rows (default 9). */
  maxKeyRows?: number | undefined;
}

export interface TitleBlock {
  node: SvgNode;
  height: number;
  /** Key entries and notes that did not fit. */
  omitted: number;
}

const INK = "#1d2329";
const MUTED = "#5a6b78";
const RULE = "#8d969c";

function txt(x: number, y: number, size: number, s: string, a: Record<string, string | number> = {}): SvgNode {
  return el("text", { x, y, "font-size": size, "font-family": MAP_FONT, fill: INK, ...a }, [s]);
}

/**
 * A 5 m scale bar with 1 m ticks: alternating filled metres and labels 0 to 5 m.
 * With a `unit` (a map in squares) it counts five squares instead: 0, 5, 10… 25 ft.
 */
export function scaleBar(x: number, y: number, perMetre: number, pt: number, metres = 5, unit?: ScaleUnit): { node: SvgNode; width: number; height: number } {
  const h = 5 * pt;
  const label = 7 * pt;
  const parts: SvgNode[] = [];
  const step = unit ? unit.per : perMetre;
  const name = unit ? unit.name : "m";
  const at = (i: number) => String(unit ? i * unit.size : i);
  for (let i = 0; i < metres; i++) {
    parts.push(el("rect", { x: x + i * step, y, width: step, height: h, fill: i % 2 === 0 ? INK : "#ffffff", stroke: INK, "stroke-width": 0.6 * pt }));
  }
  for (let i = 0; i <= metres; i++) {
    const tx = x + i * step;
    parts.push(el("line", { x1: tx, y1: y + h, x2: tx, y2: y + h + 2.5 * pt, stroke: INK, "stroke-width": 0.6 * pt }));
    const s = i === metres ? `${at(i)} ${name}` : at(i);
    parts.push(txt(tx, y + h + 2.5 * pt + label, label, s, { "text-anchor": i === metres ? "start" : "middle", ...(i === metres ? { x: tx - textWidth(at(i), label) / 2 } : {}) }));
  }
  const width = metres * step + textWidth(` ${at(metres)} ${name}`, label);
  return { node: el("g", { "data-scale-bar": metres, ...(unit ? { "data-scale-unit": unit.name } : {}) }, parts), width, height: h + 2.5 * pt + label * 1.25 };
}

/**
 * Lay out the title block: identity and scale on the left, the scale bar,
 * then the zone key and notes in columns, wrapping to new rows when the
 * frame is narrow.
 */
export function titleBlock(input: TitleBlockInput, f: TitleBlockFrame): TitleBlock {
  const { pt } = f;
  const pad = 8 * pt;
  const gapX = 18 * pt;
  const innerW = Math.max(0, f.width - 2 * pad);
  const nodes: SvgNode[] = [];

  // section 1: identity
  const lines: Array<{ s: string; size: number; bold?: boolean; muted?: boolean }> = [];
  lines.push({ s: input.title, size: 16, bold: true });
  lines.push({ s: [input.deck, VIEW_NAMES[input.view]].filter(Boolean).join(" · "), size: 10 });
  if (input.scale) lines.push({ s: input.scale, size: 9 });
  if (input.strip && input.strip.count > 1) lines.push({ s: `Strip ${input.strip.index} of ${input.strip.count}${input.deck ? `, ${input.deck}` : ""}`, size: 9, bold: true });
  if (input.note) lines.push({ s: input.note, size: 7, muted: true });
  const idMax = Math.min(innerW, Math.max(200 * pt, innerW * 0.4));
  const idLines = lines.map((l) => ({ ...l, s: ellipsize(l.s, l.size * pt, idMax, l.bold) }));
  const idW = Math.max(...idLines.map((l) => textWidth(l.s, l.size * pt, l.bold)));
  const idH = idLines.reduce((h, l) => h + l.size * pt * 1.3, 0);

  // section 2: scale bar
  const bar = { w: 0, h: 0 };
  const barTitle = 7 * pt;
  const sb = scaleBar(0, 0, f.perMetre, pt, 5, f.unit);
  bar.w = Math.max(sb.width, textWidth("Scale bar", barTitle));
  bar.h = barTitle * 1.4 + sb.height;

  // section 3: key entries and callouts as short lines in columns
  const entries: Array<{ n: string; s: string; bold?: boolean }> = [];
  for (const k of input.zoneKey ?? []) entries.push({ n: String(k.number), s: k.name, bold: !!k.key });
  for (const c of input.callouts ?? []) entries.push({ n: c.ref, s: `${c.label}${c.number !== undefined ? `, ${input.zoneWord ?? "zone"} ${c.number}` : ""}`, bold: true });
  const keySize = 7.5 * pt;
  const lh = keySize * 1.3;
  const numW = Math.max(textWidth("00", keySize, true), ...entries.map((e) => textWidth(e.n, keySize, true))) + 3 * pt;
  const colW = Math.min(170 * pt, Math.max(80 * pt, ...entries.map((e) => numW + textWidth(e.s, keySize, e.bold) + 10 * pt)));
  const maxRows = f.maxKeyRows ?? 9;

  // place sections left to right, wrapping
  let x = pad;
  let rowY = pad;
  let rowH = 0;
  const placeSection = (w: number, h: number): [number, number] => {
    if (x > pad && x + w > pad + innerW) {
      rowY += rowH + 8 * pt;
      x = pad;
      rowH = 0;
    }
    const at: [number, number] = [x, rowY];
    x += w + gapX;
    rowH = Math.max(rowH, h);
    return at;
  };

  const [ix, iy] = placeSection(idW, idH);
  let yy = iy;
  for (const l of idLines) {
    yy += l.size * pt * 1.1;
    nodes.push(txt(f.x + ix, f.y + yy, l.size * pt, l.s, { ...(l.bold ? { "font-weight": 700 } : {}), ...(l.muted ? { fill: MUTED } : {}) }));
    yy += l.size * pt * 0.2;
  }

  const [bx, by] = placeSection(bar.w, bar.h);
  nodes.push(txt(f.x + bx, f.y + by + barTitle, barTitle, "Scale bar", { fill: MUTED }));
  nodes.push(scaleBar(f.x + bx, f.y + by + barTitle * 1.4, f.perMetre, pt, 5, f.unit).node);

  // section 2b: compass note for turned prints (the screen map's top is to the right)
  if (input.rotated) {
    const r = 9 * pt;
    const l1 = "Rotated 90°";
    const l2 = "Top of the screen map faces right";
    const w = 2 * r + 6 * pt + Math.max(textWidth(l1, 8 * pt, true), textWidth(l2, 7 * pt));
    const [cx0, cy0] = placeSection(w, 2 * r + 4 * pt);
    const cx = f.x + cx0 + r;
    const cy = f.y + cy0 + r + 2 * pt;
    nodes.push(
      el("g", { "data-rotated-note": "90" }, [
        el("circle", { cx, cy, r, fill: "#ffffff", stroke: INK, "stroke-width": 0.75 * pt }),
        // an arrow pointing right: where the top of the screen map went
        el("path", { d: `M ${cx - r * 0.6} ${cy} L ${cx + r * 0.25} ${cy}`, stroke: INK, "stroke-width": 1.4 * pt, fill: "none" }),
        el("path", { d: `M ${cx + r * 0.7} ${cy} L ${cx + r * 0.15} ${cy - r * 0.4} L ${cx + r * 0.15} ${cy + r * 0.4} Z`, fill: INK }),
        txt(cx + r + 6 * pt, cy - 1.5 * pt, 8 * pt, l1, { "font-weight": 700 }),
        txt(cx + r + 6 * pt, cy + 7.5 * pt, 7 * pt, l2, { fill: MUTED }),
      ]),
    );
  }

  let omitted = 0;
  if (entries.length) {
    const head = 7 * pt * 1.5;
    let avail = pad + innerW - x;
    if (avail < colW) {
      // a new row for the key
      rowY += rowH + 8 * pt;
      x = pad;
      rowH = 0;
      avail = innerW;
    }
    const cols = Math.max(1, Math.floor((avail + 6 * pt) / (colW + 6 * pt)));
    const rows = Math.min(maxRows, Math.ceil(entries.length / cols));
    const capacity = rows * cols;
    const shown = entries.length > capacity ? entries.slice(0, capacity - 1) : entries;
    omitted = entries.length - shown.length;
    const word = input.zoneWord ? input.zoneWord[0]!.toUpperCase() + input.zoneWord.slice(1) : "Zone";
    const title = input.callouts?.length && input.zoneKey?.length ? `${word} key and notes` : input.callouts?.length ? "Notes" : `${word} key`;
    nodes.push(txt(f.x + x, f.y + rowY + 7 * pt, 7 * pt, title, { fill: MUTED }));
    const list = [...shown.map((e) => ({ ...e })), ...(omitted ? [{ n: "", s: `+${omitted} more in the zone key`, bold: false }] : [])];
    list.forEach((e, i) => {
      const c = Math.floor(i / rows);
      const r = i % rows;
      const ex = f.x + x + c * (colW + 6 * pt);
      const ey = f.y + rowY + head + r * lh + keySize;
      if (e.n) nodes.push(txt(ex, ey, keySize, e.n, { "font-weight": 700 }));
      nodes.push(txt(ex + (e.n ? numW : 0), ey, keySize, ellipsize(e.s, keySize, colW - numW - 6 * pt, e.bold), e.bold ? { "font-weight": 700 } : {}));
    });
    rowH = Math.max(rowH, head + rows * lh + keySize * 0.4);
  }

  const height = rowY + rowH + pad;
  const frame = el("rect", { x: f.x, y: f.y, width: f.width, height, fill: "#ffffff", stroke: RULE, "stroke-width": 0.75 * pt });
  return { node: el("g", { "data-title-block": "1" }, [frame, ...nodes]), height, omitted };
}
