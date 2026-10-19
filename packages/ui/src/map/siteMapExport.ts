/**
 * Site map exports: a standalone SVG string, a PNG at a print resolution,
 * and print tiles that split a deck over A4 or Letter pages at
 * 1 m = 1 cm with overlap marks. All of them use `drawSiteMap`; the SVG and
 * PNG can carry a title block with a scale bar. Roll prints (PDF) are in
 * rollPrint.ts.
 */
import type { SiteLayout } from "@campaign-forge/module-sdk";
import { drawSiteMap, el, nodeToString, resolvePalette, type SiteMapDrawOptions, type SvgNode } from "./siteMapDraw";
import { MAP_FONT } from "./textMetrics";
import { scaleText, titleBlock } from "./titleBlock";
import { zoneKeyEntries } from "./rollPrint";

export interface ExportTitleBlock {
  /** Map name (default: the SVG title, else "Site map"). */
  title?: string | undefined;
  /** Scale line; the SVG export at 1 m = 1 cm and the PNG fill it in. */
  scale?: string | undefined;
}

export interface RenderSvgOptions extends Omit<SiteMapDrawOptions, "interactive"> {
  /** Pixels per grid unit for the width/height attributes (default 20). Ignored with `physical`. */
  scale?: number;
  /** Size the SVG in centimetres at 1 m = 1 cm instead of pixels. */
  physical?: boolean;
  title?: string;
  /** Add a title block with a 5 m scale bar below the map (never over it). */
  titleBlock?: boolean | ExportTitleBlock | undefined;
}

const XMLNS = "http://www.w3.org/2000/svg";

function gridM(layout: SiteLayout): number {
  return layout.gridM && layout.gridM > 0 ? layout.gridM : 1;
}

/** One typographic point in grid units for exports: an 18 pt title is one grid unit tall. */
const EXPORT_PT = 1 / 18;

/** The drawing plus, optionally, a title block band below it, in grid units. */
export function composeSiteMap(layout: SiteLayout, options: Omit<RenderSvgOptions, "scale" | "physical">, scaleLine?: string): { node: SvgNode; width: number; height: number } {
  const d = drawSiteMap(layout, { ...options, interactive: false });
  if (!options.titleBlock) return { node: d.node, width: d.width, height: d.height };
  const tb = typeof options.titleBlock === "object" ? options.titleBlock : {};
  const deck = layout.decks.find((x) => x.id === d.deck);
  const margin = options.margin ?? 1;
  const block = titleBlock(
    {
      title: tb.title ?? options.title ?? "Site map",
      deck: deck?.name,
      view: options.view,
      scale: tb.scale ?? scaleLine,
      zoneKey: options.view === "gm" ? zoneKeyEntries(layout, d.deck) : undefined,
      callouts: d.callouts.length ? d.callouts : undefined,
    },
    { x: margin, y: d.height, width: Math.max(1, d.width - 2 * margin), pt: EXPORT_PT, perMetre: 1 / gridM(layout) },
  );
  const height = d.height + block.height + margin;
  const bg = el("rect", { x: 0, y: d.height - margin, width: d.width, height: block.height + 2 * margin, fill: options.view === "tracking" ? "#ffffff" : resolvePalette(options.palette).background });
  return { node: el("g", {}, [d.node, bg, block.node]), width: d.width, height };
}

/** A standalone SVG document for one deck. */
export function renderSiteMapSvg(layout: SiteLayout, options: RenderSvgOptions): string {
  const cm = gridM(layout);
  const d = composeSiteMap(layout, options, options.physical ? scaleText(10) : undefined);
  const w = options.physical ? `${d.width * cm}cm` : String(Math.round(d.width * (options.scale ?? 20)));
  const h = options.physical ? `${d.height * cm}cm` : String(Math.round(d.height * (options.scale ?? 20)));
  const root = el("svg", { xmlns: XMLNS, width: w, height: h, viewBox: `0 0 ${d.width} ${d.height}`, "data-view": options.view }, [options.title ? el("title", {}, [options.title]) : null, d.node]);
  return `<?xml version="1.0" encoding="UTF-8"?>\n${nodeToString(root)}\n`;
}

/** Pixel size of a deck at `dpi` with 1 m = 1 cm (the map alone, without a title block). */
export function pngSize(layout: SiteLayout, options: { deck?: string | undefined; margin?: number | undefined }, dpi = 150): { width: number; height: number } {
  const deck = layout.decks.find((d) => d.id === options.deck) ?? layout.decks[0];
  const margin = options.margin ?? 1;
  const pxPerUnit = (gridM(layout) * dpi) / 2.54;
  return { width: Math.round(((deck?.width ?? 0) + margin * 2) * pxPerUnit), height: Math.round(((deck?.height ?? 0) + margin * 2) * pxPerUnit) };
}

/** Render a deck to PNG at `dpi` (default 150) with 1 m = 1 cm. Browser only (uses an image and a canvas). */
export async function renderSiteMapPng(layout: SiteLayout, options: Omit<RenderSvgOptions, "scale" | "physical"> & { dpi?: number }): Promise<Blob> {
  const dpi = options.dpi ?? 150;
  const pxPerUnit = (gridM(layout) * dpi) / 2.54;
  const d = composeSiteMap(layout, options, `${scaleText(10)} at ${dpi} dpi`);
  const width = Math.round(d.width * pxPerUnit);
  const height = Math.round(d.height * pxPerUnit);
  const svg = nodeToString(el("svg", { xmlns: XMLNS, width, height, viewBox: `0 0 ${d.width} ${d.height}` }, [d.node]));
  const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
  try {
    const img = new Image();
    img.decoding = "async";
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error("The map could not be drawn to an image."));
      img.src = url;
    });
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("No canvas available.");
    ctx.drawImage(img, 0, 0, width, height);
    return await new Promise<Blob>((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("PNG encoding failed."))), "image/png"));
  } finally {
    URL.revokeObjectURL(url);
  }
}

// ---------------------------------------------------------------------------
// print tiles
// ---------------------------------------------------------------------------

export type PaperSize = "a4" | "letter";

/** Paper sizes in centimetres (portrait). */
export const PAPER: Record<PaperSize, { width: number; height: number; name: string }> = {
  a4: { width: 21, height: 29.7, name: "A4" },
  letter: { width: 21.59, height: 27.94, name: "Letter" },
};

export interface PrintTileOptions extends Omit<SiteMapDrawOptions, "interactive"> {
  paper?: PaperSize;
  /** Page margin in cm (default 1). */
  marginCm?: number;
  /** Overlap between neighbouring tiles in cm (default 1). */
  overlapCm?: number;
  title?: string;
}

export interface PrintTile {
  row: number;
  col: number;
  svg: string;
}

export interface PrintTiles {
  paper: PaperSize;
  orientation: "portrait" | "landscape";
  rows: number;
  cols: number;
  /** Page size in cm. */
  pageWidth: number;
  pageHeight: number;
  tiles: PrintTile[];
}

function tileCount(total: number, printable: number, overlap: number): number {
  if (total <= printable) return 1;
  return Math.ceil((total - overlap) / (printable - overlap));
}

/**
 * Split one deck over pages at 1 m = 1 cm. Neighbouring tiles overlap by
 * `overlapCm`; dashed lines mark where the next page starts, and corner
 * marks show the trim edge. The orientation with fewer pages wins.
 */
export function printTiles(layout: SiteLayout, options: PrintTileOptions): PrintTiles {
  const paper = PAPER[options.paper ?? "a4"];
  const margin = options.marginCm ?? 1;
  const overlap = options.overlapCm ?? 1;
  const cm = gridM(layout);
  const d = drawSiteMap(layout, { ...options, interactive: false });
  const mapW = d.width * cm;
  const mapH = d.height * cm;

  const plan = (pw: number, ph: number) => {
    const aw = pw - margin * 2;
    const ah = ph - margin * 2;
    const cols = tileCount(mapW, aw, overlap);
    const rows = tileCount(mapH, ah, overlap);
    return { pw, ph, aw, ah, cols, rows, pages: cols * rows };
  };
  const portrait = plan(paper.width, paper.height);
  const landscape = plan(paper.height, paper.width);
  const best = landscape.pages < portrait.pages ? landscape : portrait;
  const orientation = best === landscape ? "landscape" : "portrait";
  const content = nodeToString(d.node);
  const tiles: PrintTile[] = [];
  const stepX = best.aw - overlap;
  const stepY = best.ah - overlap;
  for (let row = 0; row < best.rows; row++) {
    for (let col = 0; col < best.cols; col++) {
      const ox = col * stepX;
      const oy = row * stepY;
      const clipId = `${options.idPrefix ?? "sm"}-clip-${row}-${col}`;
      const marks: SvgNode[] = [];
      const m = margin;
      const L = 0.6;
      for (const [x, y, dx, dy] of [
        [m, m, -1, -1],
        [m + best.aw, m, 1, -1],
        [m, m + best.ah, -1, 1],
        [m + best.aw, m + best.ah, 1, 1],
      ] as const) {
        marks.push(el("path", { d: `M ${x + dx * 0.15} ${y} l ${dx * L} 0 M ${x} ${y + dy * 0.15} l 0 ${dy * L}`, stroke: "#000", "stroke-width": 0.02, fill: "none" }));
      }
      // overlap marks: where the neighbouring page starts
      if (col < best.cols - 1) marks.push(el("line", { x1: m + stepX, y1: m, x2: m + stepX, y2: m + best.ah, stroke: "#c43f27", "stroke-width": 0.02, "stroke-dasharray": "0.3 0.2", "data-overlap": "right" }));
      if (row < best.rows - 1) marks.push(el("line", { x1: m, y1: m + stepY, x2: m + best.aw, y2: m + stepY, stroke: "#c43f27", "stroke-width": 0.02, "stroke-dasharray": "0.3 0.2", "data-overlap": "bottom" }));
      if (col > 0) marks.push(el("line", { x1: m + overlap, y1: m, x2: m + overlap, y2: m + best.ah, stroke: "#c43f27", "stroke-width": 0.02, "stroke-dasharray": "0.1 0.2", "data-overlap": "left" }));
      if (row > 0) marks.push(el("line", { x1: m, y1: m + overlap, x2: m + best.aw, y2: m + overlap, stroke: "#c43f27", "stroke-width": 0.02, "stroke-dasharray": "0.1 0.2", "data-overlap": "top" }));
      const label = `${options.title ? `${options.title} · ` : ""}row ${row + 1} of ${best.rows}, column ${col + 1} of ${best.cols} · 1 m = 1 cm · ${paper.name}`;
      const head = `<svg xmlns="${XMLNS}" width="${best.pw}cm" height="${best.ph}cm" viewBox="0 0 ${best.pw} ${best.ph}" data-tile="${row}-${col}">`;
      const body =
        `<defs><clipPath id="${clipId}"><rect x="${m}" y="${m}" width="${best.aw}" height="${best.ah}"/></clipPath></defs>` +
        `<rect width="${best.pw}" height="${best.ph}" fill="#ffffff"/>` +
        `<g clip-path="url(#${clipId})"><g transform="translate(${m - ox} ${m - oy}) scale(${cm})">${content}</g></g>` +
        marks.map(nodeToString).join("") +
        nodeToString(el("text", { x: m, y: m - 0.35, "font-size": 0.32, "font-family": MAP_FONT, fill: "#333" }, [label]));
      tiles.push({ row, col, svg: `${head}${body}</svg>` });
    }
  }
  return { paper: options.paper ?? "a4", orientation, rows: best.rows, cols: best.cols, pageWidth: best.pw, pageHeight: best.ph, tiles };
}

/** A printable HTML document with one tile per page. */
export function printTilesHtml(t: PrintTiles, title = "Map tiles"): string {
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");
  return `<!doctype html>
<html><head><meta charset="utf-8"><title>${esc(title)}</title>
<style>
@page { size: ${t.pageWidth}cm ${t.pageHeight}cm; margin: 0; }
html, body { margin: 0; padding: 0; background: #fff; }
.page { width: ${t.pageWidth}cm; height: ${t.pageHeight}cm; page-break-after: always; break-after: page; overflow: hidden; }
.page:last-child { page-break-after: auto; break-after: auto; }
.page svg { display: block; }
</style></head>
<body>
${t.tiles.map((x) => `<div class="page">${x.svg}</div>`).join("\n")}
</body></html>
`;
}
