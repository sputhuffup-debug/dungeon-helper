/**
 * Wide-format roll printing: one deck at a physical scale on a 24" or 36"
 * roll, as a vector PDF. The deck goes across the roll when either side
 * fits (turned 90° when only its long side does, and the way that uses the
 * least paper otherwise); a deck wider than the roll either way is cut into
 * strips across the roll with an overlap, cut lines, alignment marks and
 * strip labels, one PDF page per strip, each page as long as it needs.
 *
 * A turned print turns the layout's geometry (rotateLayout) before drawing,
 * so every label is placed and printed upright on the roll.
 *
 * Callers pass the layout for the view: the player projection
 * (core's `playerLayout(..., { print: true })`) for player prints.
 */
import { exitLabel, exitToOf, isDuctSheet, zoneNumbers } from "@campaign-forge/core";
import type { SiteLayout } from "@campaign-forge/module-sdk";
import { svgPagesToPdf, type PdfPage } from "./sitePdf";
import { LIGHT_PALETTE, drawSiteMap, el, type SiteMapDrawOptions, type SiteMapPalette, type SiteMapViewKind, type SvgNode } from "./siteMapDraw";
import { MAP_FONT, textWidth } from "./textMetrics";
import { rotateLayout } from "./rotateLayout";
import { DEFAULT_MM_PER_METRE, VIEW_NAMES, defaultGridSquares, scaleText, titleBlock, type TitleBlockInput } from "./titleBlock";

/** Roll widths offered, in inches. */
export const ROLL_WIDTHS = [24, 36] as const;
export type RollWidth = (typeof ROLL_WIDTHS)[number];

/** Margin around the deck in a print, in grid units: room for the outer hull's wall stroke. */
export const PRINT_MAP_MARGIN = 0.3;

/**
 * The palette for prints: the light palette on white paper. Duct sheets keep
 * their blue-grey grid and tubes, a paler sheet than on screen so a roll is
 * not a slab of ink.
 */
export const PRINT_PALETTE: SiteMapPalette = {
  ...LIGHT_PALETTE,
  background: "#ffffff",
  ductSheet: "#dfe6ec",
  ductGrid: "#c4d0da",
  tube: "#9fb3c2",
  tubeEdge: "#2b3a45",
  tubeLine: "#eef3f6",
  ductInk: "#f4f7f9",
};

export interface RollPrintOptions extends Omit<SiteMapDrawOptions, "interactive" | "margin" | "palette" | "grid"> {
  rollWidthIn: RollWidth | number;
  /** Millimetres of paper per metre (default 25.4: 1 in = 1 m). */
  mmPerMetre?: number | undefined;
  /** Paper margin on every side, inches (default 0.5). */
  marginIn?: number | undefined;
  /** Overlap between neighbouring strips, inches (default 1). */
  overlapIn?: number | undefined;
  /** Title block and scale bar on every page (default true). */
  titleBlock?: boolean | undefined;
  /** Map name for the title block and the PDF title. */
  title?: string | undefined;
}

export interface RollPrintPage {
  /** 1-based strip number. */
  strip: number;
  widthIn: number;
  heightIn: number;
  /** The slice of the printed map across the roll, inches from its left edge (of the turned map, when turned). */
  fromIn: number;
  toIn: number;
}

export interface RollPrintPlan {
  rollWidthIn: number;
  printableWidthIn: number;
  mmPerMetre: number;
  marginIn: number;
  overlapIn: number;
  /** The deck drawing (deck plus print margin) at scale, unturned. */
  mapWidthIn: number;
  mapHeightIn: number;
  /** Turned 90° clockwise (the deck's height runs across the roll; the screen map's top is on the right). */
  rotated: boolean;
  strips: number;
  /** Width of each strip across the roll (all strips are equal). */
  stripWidthIn: number;
  /** Height of the title-block band (0 without one). */
  titleBlockIn: number;
  pages: RollPrintPage[];
  /** Total paper used, all pages end to end. */
  paperLengthIn: number;
  /** "36" roll · 1 page · 43" of paper". */
  summary: string;
}

const GAP_IN = 0.3;
const round2 = (v: number) => Math.round(v * 100) / 100;

/** Inches, for summaries: one decimal, no trailing ".0". */
export function formatInches(v: number): string {
  const r = Math.round(v * 10) / 10;
  return `${Number.isInteger(r) ? r.toFixed(0) : r.toFixed(1)}"`;
}

function gridM(layout: SiteLayout): number {
  return layout.gridM && layout.gridM > 0 ? layout.gridM : 1;
}

function deckOf(layout: SiteLayout, deck: string | undefined) {
  return layout.decks.find((d) => d.id === deck) ?? layout.decks[0];
}

function drawOptions(o: RollPrintOptions): SiteMapDrawOptions {
  const mm = o.mmPerMetre ?? DEFAULT_MM_PER_METRE;
  return {
    view: o.view,
    deck: o.deck,
    legend: o.legend,
    live: o.live,
    act: o.act,
    fogged: o.fogged,
    selected: o.selected,
    path: o.path,
    passable: o.passable,
    idPrefix: o.idPrefix ?? "roll",
    margin: PRINT_MAP_MARGIN,
    palette: PRINT_PALETTE,
    gridSquares: o.gridSquares ?? defaultGridSquares(o.view, mm),
  };
}

/**
 * Zone-number key entries for one deck, for GM title blocks: the named floor
 * zones; on a duct sheet, its zones by id with their names and the rooms
 * their exits open into.
 */
export function zoneKeyEntries(layout: SiteLayout, deck: string | undefined): NonNullable<TitleBlockInput["zoneKey"]> {
  const d = deckOf(layout, deck);
  const numbers = zoneNumbers(layout);
  const out: NonNullable<TitleBlockInput["zoneKey"]> = [];
  if (isDuctSheet(d)) {
    for (const z of layout.zones) {
      const n = numbers.get(z.id);
      const exit = exitToOf(z);
      if (n === undefined || z.deck !== d!.id || (!z.name && !exit)) continue;
      out.push({ number: n, name: [z.id, z.name, exit ? exitLabel(exit) : undefined].filter(Boolean).join(" · "), key: !!z.key });
    }
    return out.sort((a, b) => a.number - b.number);
  }
  for (const z of layout.zones) {
    const n = numbers.get(z.id);
    if (n === undefined || z.layer === "duct" || !z.name || (d && z.deck !== d.id)) continue;
    out.push({ number: n, name: z.name, key: !!z.key });
  }
  return out.sort((a, b) => a.number - b.number);
}

/** The deck line of a title block; a duct sheet says so, and which deck it serves. */
export function sheetTitle(layout: SiteLayout, deck: string | undefined): string | undefined {
  const d = deckOf(layout, deck);
  if (!d) return undefined;
  if (!isDuctSheet(d)) return d.name;
  const serves = d.serves ? layout.decks.find((x) => x.id === d.serves)?.name : undefined;
  return `${d.name} (duct sheet${serves ? ` for ${serves}` : ""})`;
}

function titleInput(layout: SiteLayout, o: RollPrintOptions, callouts: ReturnType<typeof drawSiteMap>["callouts"], strip?: { index: number; count: number }, rotated = false): TitleBlockInput {
  const mm = o.mmPerMetre ?? DEFAULT_MM_PER_METRE;
  return {
    title: o.title ?? "Site map",
    deck: sheetTitle(layout, o.deck),
    view: o.view,
    scale: scaleText(mm),
    strip,
    zoneKey: o.view === "gm" ? zoneKeyEntries(layout, o.deck) : undefined,
    callouts: callouts.length ? callouts : undefined,
    note: "Print at 100% (actual size): do not scale to fit.",
    rotated,
  };
}

/**
 * Plan a roll print: orientation, strips and page sizes.
 *
 * Fit across the roll if either side fits (turned when only the deck's
 * height fits; when both fit, the way that uses less paper). Otherwise cut
 * strips across the roll: n = ceil((across - overlap) / (printable - overlap))
 * equal strips, for each orientation, and keep the one with less paper
 * (ties: fewer strips, then unturned).
 */
export function planRollPrint(layout: SiteLayout, o: RollPrintOptions): RollPrintPlan {
  const mm = o.mmPerMetre ?? DEFAULT_MM_PER_METRE;
  const marginIn = o.marginIn ?? 0.5;
  const overlapIn = o.overlapIn ?? 1;
  const roll = o.rollWidthIn;
  const printable = roll - 2 * marginIn;
  const d = drawSiteMap(layout, drawOptions(o));
  // the turned layout places its labels afresh, so its callouts (and the key's height) can differ
  const dTurned = drawSiteMap(rotateLayout(layout, 90), drawOptions(o));
  const inPerUnit = (gridM(layout) * mm) / 25.4;
  const mapW = d.width * inPerUnit;
  const mapH = d.height * inPerUnit;

  // the title block's height: a split print adds the strip line
  const band = (split: boolean, rotated: boolean) => {
    if (o.titleBlock === false) return 0;
    const t = titleBlock(titleInput(layout, o, (rotated ? dTurned : d).callouts, split ? { index: 1, count: 2 } : undefined, rotated), { x: 0, y: 0, width: printable * 72, pt: 1, perMetre: (mm / 25.4) * 72 });
    return round2(t.height / 72);
  };
  const fixed = (tb: number) => 2 * marginIn + (tb > 0 ? tb + GAP_IN : 0);

  type Option = { rotated: boolean; strips: number; across: number; along: number; paper: number; tb: number };
  const option = (rotated: boolean): Option => {
    const across = rotated ? mapH : mapW;
    const along = rotated ? mapW : mapH;
    const strips = across <= printable + 1e-9 ? 1 : printable - overlapIn > 0 ? Math.ceil((across - overlapIn) / (printable - overlapIn) - 1e-9) : Infinity;
    const tb = band(strips > 1, rotated);
    return { rotated, strips, across, along, paper: strips * (along + fixed(tb)), tb };
  };
  const flat = option(false);
  const turned = option(true);
  let best: Option;
  if (flat.strips === 1 || turned.strips === 1) {
    if (flat.strips === 1 && turned.strips === 1) best = turned.paper < flat.paper - 1e-9 ? turned : flat;
    else best = flat.strips === 1 ? flat : turned;
  } else {
    best = [flat, turned].sort((a, b) => a.paper - b.paper || a.strips - b.strips || Number(a.rotated) - Number(b.rotated))[0]!;
  }
  if (!Number.isFinite(best.strips)) best = { ...flat, strips: 1 };
  const n = best.strips;
  const stripW = n === 1 ? best.across : (best.across + (n - 1) * overlapIn) / n;
  const tbIn = best.tb;
  const pageH = round2(best.along + fixed(tbIn));
  const pages: RollPrintPage[] = [];
  for (let i = 0; i < n; i++) {
    const from = i * (stripW - overlapIn);
    pages.push({ strip: i + 1, widthIn: roll, heightIn: pageH, fromIn: round2(from), toIn: round2(from + stripW) });
  }
  const paper = round2(pages.reduce((s, p) => s + p.heightIn, 0));
  return {
    rollWidthIn: roll,
    printableWidthIn: round2(printable),
    mmPerMetre: mm,
    marginIn,
    overlapIn,
    mapWidthIn: round2(mapW),
    mapHeightIn: round2(mapH),
    rotated: best.rotated,
    strips: n,
    stripWidthIn: round2(stripW),
    titleBlockIn: tbIn,
    pages,
    paperLengthIn: paper,
    summary: `${formatInches(roll)} roll · ${n} page${n === 1 ? "" : "s"} · ${formatInches(paper)} of paper`,
  };
}

const MARK = "#c43f27";

/** A registration target: a circle with a cross. */
function target(x: number, y: number, r: number): SvgNode {
  return el("g", { "data-align-mark": "1" }, [
    el("circle", { cx: x, cy: y, r, fill: "none", stroke: MARK, "stroke-width": 0.6 }),
    el("line", { x1: x - r * 1.6, y1: y, x2: x + r * 1.6, y2: y, stroke: MARK, "stroke-width": 0.6 }),
    el("line", { x1: x, y1: y - r * 1.6, x2: x, y2: y + r * 1.6, stroke: MARK, "stroke-width": 0.6 }),
  ]);
}

/** The pages of a roll print as drawings in points (y down), ready for the PDF writer or an SVG preview. */
export function rollPrintPages(layout: SiteLayout, o: RollPrintOptions, plan: RollPrintPlan = planRollPrint(layout, o)): PdfPage[] {
  // turned prints draw the turned layout: no rotated drawing, so every label reads left to right
  const d = drawSiteMap(plan.rotated ? rotateLayout(layout, 90) : layout, drawOptions(o));
  const PT = 72;
  const mm = plan.mmPerMetre;
  const k = ((gridM(layout) * mm) / 25.4) * PT; // points per grid unit
  const out: PdfPage[] = [];
  for (const page of plan.pages) {
    const W = page.widthIn * PT;
    const H = page.heightIn * PT;
    const m = plan.marginIn * PT;
    const s = (page.toIn - page.fromIn) * PT;
    const left = (W - s) / 2;
    const tbH = plan.titleBlockIn * PT;
    const top = m + (tbH > 0 ? tbH + GAP_IN * PT : 0);
    const along = (plan.rotated ? plan.mapWidthIn : plan.mapHeightIn) * PT;
    const from = page.fromIn * PT;
    const clipId = `strip-${page.strip}`;
    const transform = `translate(${left - from} ${top}) scale(${k})`;
    const nodes: SvgNode[] = [
      el("defs", {}, [el("clipPath", { id: clipId }, [el("rect", { x: left, y: top, width: s, height: along })])]),
      el("rect", { x: 0, y: 0, width: W, height: H, fill: "#ffffff" }),
      el("g", { "clip-path": `url(#${clipId})`, "data-strip": page.strip }, [el("g", { transform }, [d.node])]),
    ];
    if (tbH > 0) {
      const strip = plan.strips > 1 ? { index: page.strip, count: plan.strips } : undefined;
      nodes.push(titleBlock(titleInput(layout, o, d.callouts, strip, plan.rotated), { x: m, y: m, width: plan.printableWidthIn * PT, pt: 1, perMetre: (mm / 25.4) * PT }).node);
    }
    // seams: a dashed cut line at the middle of each overlap, with targets above and below the map
    const o2 = (plan.overlapIn * PT) / 2;
    const seams: Array<{ x: number; text: string }> = [];
    if (page.strip > 1) seams.push({ x: left + o2, text: `Cut here; lay over strip ${page.strip - 1}` });
    if (page.strip < plan.strips) seams.push({ x: left + s - o2, text: `Strip ${page.strip + 1} lies over this line` });
    for (const seam of seams) {
      nodes.push(el("line", { x1: seam.x, y1: top - 0.12 * PT, x2: seam.x, y2: top + along + 0.12 * PT, stroke: MARK, "stroke-width": 0.75, "stroke-dasharray": "6 4", "data-seam": page.strip }));
      nodes.push(target(seam.x, top - 0.16 * PT, 0.08 * PT));
      nodes.push(target(seam.x, top + along + 0.2 * PT, 0.08 * PT));
      const size = 7;
      const tw = textWidth(seam.text, size);
      const tx = Math.min(W - m - tw, Math.max(m, seam.x - tw / 2));
      nodes.push(el("text", { x: tx, y: Math.min(H - 0.08 * PT, top + along + 0.42 * PT), "font-size": size, "font-family": MAP_FONT, fill: MARK }, [seam.text]));
    }
    // overlap extent ticks on the map edges
    if (plan.strips > 1) {
      for (const x of [page.strip > 1 ? left + 2 * o2 : undefined, page.strip < plan.strips ? left + s - 2 * o2 : undefined]) {
        if (x === undefined) continue;
        nodes.push(el("line", { x1: x, y1: top - 0.1 * PT, x2: x, y2: top, stroke: MARK, "stroke-width": 0.5 }));
        nodes.push(el("line", { x1: x, y1: top + along, x2: x, y2: top + along + 0.1 * PT, stroke: MARK, "stroke-width": 0.5 }));
      }
    }
    out.push({ width: W, height: H, node: el("g", { "data-page": page.strip }, nodes) });
  }
  return out;
}

/** Plan and render a roll print to PDF bytes. */
export function renderRollPdf(layout: SiteLayout, o: RollPrintOptions): { bytes: Uint8Array; plan: RollPrintPlan } {
  const plan = planRollPrint(layout, o);
  const pages = rollPrintPages(layout, o, plan);
  const deck = deckOf(layout, o.deck)?.name;
  const bytes = svgPagesToPdf(pages, { title: [o.title ?? "Site map", deck, VIEW_NAMES[o.view]].filter(Boolean).join(" · "), subject: plan.summary, creator: "Campaign Forge" });
  return { bytes, plan };
}
