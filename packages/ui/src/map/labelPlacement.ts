/**
 * Deterministic label placement for site maps: a greedy placer that keeps
 * a list of occupied boxes (zone numbers, names, icons, glyphs, labels) and
 * finds the first candidate position, in a fixed scan order, where a new box
 * sits inside its region and clear of every occupied box. Same input, same
 * order of calls => same placement.
 */
import type { MapPoint } from "@campaign-forge/module-sdk";

export interface LabelBox {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export interface PlacedLabel extends LabelBox {
  /** What the box holds: "number", "name", "flag", "marker", "callout", "duct-number", "glyph", ... */
  kind: string;
  /** Zone the box belongs to (when it belongs to one). */
  zone?: string | undefined;
  /** Marker or border id. */
  ref?: string | undefined;
  /** True when no clear spot existed and the box was placed over others. */
  forced?: boolean | undefined;
}

/** The corner a scan starts from, or "center" for nearest-to-centre first. */
export type ScanFrom = "bottom-left" | "bottom-right" | "top-left" | "top-right" | "center";

const EPS = 1e-6;

export function boxesOverlap(a: LabelBox, b: LabelBox, pad = 0): boolean {
  return a.x0 < b.x1 + pad - EPS && b.x0 < a.x1 + pad - EPS && a.y0 < b.y1 + pad - EPS && b.y0 < a.y1 + pad - EPS;
}

export function boxInside(inner: LabelBox, outer: LabelBox): boolean {
  return inner.x0 >= outer.x0 - EPS && inner.y0 >= outer.y0 - EPS && inner.x1 <= outer.x1 + EPS && inner.y1 <= outer.y1 + EPS;
}

export function insetBox(b: LabelBox, d: number): LabelBox {
  return { x0: b.x0 + d, y0: b.y0 + d, x1: b.x1 - d, y1: b.y1 - d };
}

export function boxAround(cx: number, cy: number, rx: number, ry = rx): LabelBox {
  return { x0: cx - rx, y0: cy - ry, x1: cx + rx, y1: cy + ry };
}

function pointInPolygon(x: number, y: number, poly: MapPoint[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i]!;
    const [xj, yj] = poly[j]!;
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function isAxisRect(poly: MapPoint[]): boolean {
  if (poly.length !== 4) return false;
  const xs = new Set(poly.map((p) => p[0]));
  const ys = new Set(poly.map((p) => p[1]));
  return xs.size === 2 && ys.size === 2;
}

/**
 * True when the box lies inside the polygon shrunk by `inset`: all four
 * corners inside, and no polygon corner within the box (so an L-shaped zone's
 * notch cannot sit under a label).
 */
export function boxInPolygon(box: LabelBox, poly: MapPoint[], inset = 0): boolean {
  if (poly.length < 3) return false;
  if (isAxisRect(poly)) {
    const xs = poly.map((p) => p[0]);
    const ys = poly.map((p) => p[1]);
    return boxInside(box, { x0: Math.min(...xs) + inset, y0: Math.min(...ys) + inset, x1: Math.max(...xs) - inset, y1: Math.max(...ys) - inset });
  }
  const g = { x0: box.x0 - inset, y0: box.y0 - inset, x1: box.x1 + inset, y1: box.y1 + inset };
  for (const [x, y] of [
    [g.x0, g.y0],
    [g.x1, g.y0],
    [g.x0, g.y1],
    [g.x1, g.y1],
  ] as const) {
    if (!pointInPolygon(x, y, poly)) return false;
  }
  for (const [x, y] of poly) if (x > g.x0 + EPS && x < g.x1 - EPS && y > g.y0 + EPS && y < g.y1 - EPS) return false;
  return true;
}

/**
 * Top-left corners for a `w` x `h` box inside `region`, on a `step` grid, in
 * scan order from a corner (rows first from that side, then columns), or by
 * distance from the region's centre.
 */
export function scanPositions(region: LabelBox, w: number, h: number, from: ScanFrom, step = 0.25): Array<[number, number]> {
  const spanX = region.x1 - region.x0 - w;
  const spanY = region.y1 - region.y0 - h;
  if (spanX < -EPS || spanY < -EPS) return [];
  const nx = Math.floor(Math.max(0, spanX) / step + EPS);
  const ny = Math.floor(Math.max(0, spanY) / step + EPS);
  const xs: number[] = [];
  const ys: number[] = [];
  for (let i = 0; i <= nx; i++) xs.push(region.x0 + i * step);
  for (let j = 0; j <= ny; j++) ys.push(region.y0 + j * step);
  // the far edge too, so a box can sit flush against it
  if (spanX - nx * step > EPS) xs.push(region.x1 - w);
  if (spanY - ny * step > EPS) ys.push(region.y1 - h);
  if (from === "center") {
    const cx = (region.x0 + region.x1 - w) / 2;
    const cy = (region.y0 + region.y1 - h) / 2;
    const out: Array<[number, number]> = [[cx, cy]];
    for (const y of ys) for (const x of xs) out.push([x, y]);
    const d = (p: [number, number]) => Math.hypot(p[0] - cx, (p[1] - cy) * 1.5);
    return out.sort((a, b) => d(a) - d(b) || a[1] - b[1] || a[0] - b[0]);
  }
  const right = from.endsWith("right");
  const bottom = from.startsWith("bottom");
  if (right) xs.reverse();
  if (bottom) ys.reverse();
  const out: Array<[number, number]> = [];
  for (const y of ys) for (const x of xs) out.push([x, y]);
  return out;
}

export interface PlaceRequest {
  w: number;
  h: number;
  /** Candidate top-left corners, tried in order. */
  candidates: Iterable<[number, number]>;
  /** Extra test a candidate box must pass (inside its zone, inside the deck). */
  inside?: ((b: LabelBox) => boolean) | undefined;
  kind: string;
  zone?: string | undefined;
  ref?: string | undefined;
  /** Place at the first inside candidate even when every spot overlaps something (marked `forced`). */
  force?: boolean | undefined;
}

/** A greedy, order-dependent, deterministic placer. */
export class LabelPlacer {
  readonly boxes: PlacedLabel[] = [];

  /** @param pad clearance kept between boxes */
  constructor(readonly pad = 0.06) {}

  /** Record a box that is already drawn (it blocks later placements). */
  block(box: LabelBox, kind: string, zone?: string, ref?: string): PlacedLabel {
    const b: PlacedLabel = { ...box, kind, zone, ref };
    this.boxes.push(b);
    return b;
  }

  /** True when the box overlaps no recorded box. */
  isFree(box: LabelBox, among: PlacedLabel[] = this.boxes): boolean {
    for (const o of among) if (boxesOverlap(box, o, this.pad)) return false;
    return true;
  }

  /** Try the candidates in order; record and return the first clear box. */
  place(req: PlaceRequest): PlacedLabel | undefined {
    let first: LabelBox | undefined;
    const cands = [...req.candidates];
    if (cands.length === 0) return undefined;
    // only boxes near the candidates matter
    let ax0 = Infinity;
    let ay0 = Infinity;
    let ax1 = -Infinity;
    let ay1 = -Infinity;
    for (const [x, y] of cands) {
      ax0 = Math.min(ax0, x);
      ay0 = Math.min(ay0, y);
      ax1 = Math.max(ax1, x + req.w);
      ay1 = Math.max(ay1, y + req.h);
    }
    const near = this.boxes.filter((o) => boxesOverlap(o, { x0: ax0, y0: ay0, x1: ax1, y1: ay1 }, this.pad));
    for (const [x, y] of cands) {
      const box = { x0: x, y0: y, x1: x + req.w, y1: y + req.h };
      if (req.inside && !req.inside(box)) continue;
      first ??= box;
      if (this.isFree(box, near)) return this.block(box, req.kind, req.zone, req.ref);
    }
    if (req.force && first) {
      const b = this.block(first, req.kind, req.zone, req.ref);
      b.forced = true;
      return b;
    }
    return undefined;
  }
}

/** Pairs of placed boxes that overlap (for tests and checks); `kinds` limits which boxes count. */
export function overlappingPairs(boxes: PlacedLabel[], pad = 0, kinds?: Set<string>): Array<[PlacedLabel, PlacedLabel]> {
  const out: Array<[PlacedLabel, PlacedLabel]> = [];
  const list = kinds ? boxes.filter((b) => kinds.has(b.kind)) : boxes;
  for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) if (boxesOverlap(list[i]!, list[j]!, pad)) out.push([list[i]!, list[j]!]);
  return out;
}

/** Box kinds drawn at fixed spots on walls and links (lock dots, hatch wheels, access and stairs glyphs). */
const FIXED_KINDS = new Set(["lock", "glyph"]);
/** Box kinds that must sit inside their own zone. */
const IN_ZONE_KINDS = new Set(["number", "name", "flag", "marker", "acts", "clutter"]);

/**
 * Problems with a placement, for tests and checks: forced boxes, overlaps
 * (other than two fixed wall marks), boxes outside their zone (numbers,
 * names, icons, marker labels) or outside the deck (duct numbers, callout
 * letters). Empty when every label is clear and contained.
 */
export function placementProblems(labels: PlacedLabel[], zones: Array<{ id: string; poly: MapPoint[] }>, deck: LabelBox): string[] {
  const out: string[] = [];
  const byId = new Map(zones.map((z) => [z.id, z]));
  const name = (b: PlacedLabel) => `${b.kind}${b.zone ? ` in ${b.zone}` : ""}${b.ref ? ` (${b.ref})` : ""}`;
  for (const b of labels) {
    if (b.forced) out.push(`${name(b)} was forced over other labels`);
    if (!boxInside(b, deck)) out.push(`${name(b)} runs past the deck edge`);
    const z = b.zone ? byId.get(b.zone) : undefined;
    if (z && IN_ZONE_KINDS.has(b.kind) && !boxInPolygon(b, z.poly, 0)) out.push(`${name(b)} runs outside its zone`);
  }
  for (const [a, b] of overlappingPairs(labels)) {
    if (FIXED_KINDS.has(a.kind) && FIXED_KINDS.has(b.kind)) continue;
    out.push(`${name(a)} overlaps ${name(b)}`);
  }
  return out;
}
