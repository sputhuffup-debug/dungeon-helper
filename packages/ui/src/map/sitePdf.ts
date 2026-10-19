/**
 * A small, dependency-free vector PDF writer for the site map's SvgNode
 * trees. It serialises the subset the map drawing uses:
 *
 * - `g` with `transform` (translate, scale, rotate, matrix) and `clip-path`
 * - `rect`, `line`, `polyline`, `polygon`, `circle`, `ellipse`
 * - `path` (M L H V C S Q T A Z, absolute and relative; arcs become Béziers)
 * - `text` in the PDF standard fonts Helvetica and Helvetica-Bold (WinAnsi),
 *   with `text-anchor` and `paint-order: stroke` haloes
 * - solid fill and stroke colours, stroke widths, dash arrays, caps, joins,
 *   `opacity` / `fill-opacity` / `stroke-opacity` (ExtGState)
 * - `pattern` fills (userSpaceOnUse, with `patternTransform`), drawn as the
 *   pattern's tiles clipped to the shape: plain line sets any RIP can print
 * - `clipPath` references (the union of its shapes)
 *
 * Not supported: gradients, markers, filters, masks, images, embedded fonts,
 * `tspan`, `use`, CSS stylesheets and `%` lengths.
 *
 * Output is deterministic: no dates, no ids, fixed number formatting and
 * object order, so the same pages give the same bytes. Sizes are PDF points
 * (72 per inch); pages over 14,400 pt (200 in) get a /UserUnit.
 */
import type { SvgNode } from "./siteMapDraw";
import { textWidth, winAnsiBytes } from "./textMetrics";

export interface PdfPage {
  /** Page size in points (72 per inch). */
  width: number;
  height: number;
  /** Drawing in points, y down (SVG convention). */
  node: SvgNode;
}

export interface PdfInfo {
  title?: string | undefined;
  subject?: string | undefined;
  author?: string | undefined;
  creator?: string | undefined;
}

/** Largest page side PDF readers accept in default units (200 in). */
export const PDF_MAX_UNITS = 14400;

type Matrix = [number, number, number, number, number, number];
const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0];

/** a × b: apply b first, then a (SVG transform list order). */
function mul(a: Matrix, b: Matrix): Matrix {
  return [a[0] * b[0] + a[2] * b[1], a[1] * b[0] + a[3] * b[1], a[0] * b[2] + a[2] * b[3], a[1] * b[2] + a[3] * b[3], a[0] * b[4] + a[2] * b[5] + a[4], a[1] * b[4] + a[3] * b[5] + a[5]];
}

function invert(m: Matrix): Matrix {
  const det = m[0] * m[3] - m[1] * m[2] || 1;
  return [m[3] / det, -m[1] / det, -m[2] / det, m[0] / det, (m[2] * m[5] - m[3] * m[4]) / det, (m[1] * m[4] - m[0] * m[5]) / det];
}

function apply(m: Matrix, x: number, y: number): [number, number] {
  return [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
}

/** Parse an SVG transform list. */
export function parseTransform(s: string | undefined): Matrix {
  if (!s) return IDENTITY;
  let m: Matrix = IDENTITY;
  const re = /(matrix|translate|scale|rotate|skewX|skewY)\s*\(([^)]*)\)/g;
  for (const [, fn, args] of s.matchAll(re)) {
    const v = (args ?? "").split(/[\s,]+/).filter(Boolean).map(Number);
    let t: Matrix = IDENTITY;
    switch (fn) {
      case "matrix":
        if (v.length === 6) t = v as Matrix;
        break;
      case "translate":
        t = [1, 0, 0, 1, v[0] ?? 0, v[1] ?? 0];
        break;
      case "scale":
        t = [v[0] ?? 1, 0, 0, v[1] ?? v[0] ?? 1, 0, 0];
        break;
      case "rotate": {
        const a = ((v[0] ?? 0) * Math.PI) / 180;
        const c = Math.cos(a);
        const sn = Math.sin(a);
        t = [c, sn, -sn, c, 0, 0];
        if (v.length >= 3) t = mul(mul([1, 0, 0, 1, v[1]!, v[2]!], t), [1, 0, 0, 1, -v[1]!, -v[2]!]);
        break;
      }
      case "skewX":
        t = [1, 0, Math.tan(((v[0] ?? 0) * Math.PI) / 180), 1, 0, 0];
        break;
      case "skewY":
        t = [1, Math.tan(((v[0] ?? 0) * Math.PI) / 180), 0, 1, 0, 0];
        break;
    }
    m = mul(m, t);
  }
  return m;
}

/** Fixed number formatting: at most `d` decimals, no exponent, no negative zero. */
function num(v: number, d = 3): string {
  if (!Number.isFinite(v)) return "0";
  const f = 10 ** d;
  const r = Math.round(v * f) / f;
  if (r === 0) return "0";
  let s = r.toFixed(d);
  if (s.includes(".")) s = s.replace(/0+$/, "").replace(/\.$/, "");
  return s;
}

// ---------------------------------------------------------------------------
// colours
// ---------------------------------------------------------------------------

const NAMED: Record<string, string> = { black: "#000000", white: "#ffffff", red: "#ff0000", green: "#008000", blue: "#0000ff", grey: "#808080", gray: "#808080" };

type Rgb = [number, number, number];

export function parseColor(c: string | undefined): Rgb | undefined {
  if (!c) return undefined;
  const s = (NAMED[c.trim().toLowerCase()] ?? c).trim();
  let m = /^#([0-9a-f]{3})$/i.exec(s);
  if (m) {
    const h = m[1]!;
    return [0, 1, 2].map((i) => parseInt(h[i]! + h[i]!, 16) / 255) as Rgb;
  }
  m = /^#([0-9a-f]{6})$/i.exec(s);
  if (m) {
    const h = m[1]!;
    return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255) as Rgb;
  }
  m = /^rgba?\(([^)]*)\)$/i.exec(s);
  if (m) {
    const v = m[1]!.split(/[\s,/]+/).filter(Boolean).map((x) => (x.endsWith("%") ? (parseFloat(x) / 100) * 255 : parseFloat(x)));
    return [(v[0] ?? 0) / 255, (v[1] ?? 0) / 255, (v[2] ?? 0) / 255];
  }
  return undefined;
}

function rgb(c: Rgb): string {
  return `${num(c[0], 4)} ${num(c[1], 4)} ${num(c[2], 4)}`;
}

// ---------------------------------------------------------------------------
// path geometry
// ---------------------------------------------------------------------------

/** Path segments in absolute coordinates: move, line, cubic, close. */
type Seg = ["M", number, number] | ["L", number, number] | ["C", number, number, number, number, number, number] | ["Z"];

function arcToCubics(x1: number, y1: number, rx: number, ry: number, phiDeg: number, large: boolean, sweep: boolean, x2: number, y2: number): Seg[] {
  if (rx === 0 || ry === 0) return [["L", x2, y2]];
  if (x1 === x2 && y1 === y2) return [];
  const phi = (phiDeg * Math.PI) / 180;
  const cos = Math.cos(phi);
  const sin = Math.sin(phi);
  const dx = (x1 - x2) / 2;
  const dy = (y1 - y2) / 2;
  const x1p = cos * dx + sin * dy;
  const y1p = -sin * dx + cos * dy;
  rx = Math.abs(rx);
  ry = Math.abs(ry);
  const lambda = (x1p * x1p) / (rx * rx) + (y1p * y1p) / (ry * ry);
  if (lambda > 1) {
    const k = Math.sqrt(lambda);
    rx *= k;
    ry *= k;
  }
  const num2 = rx * rx * ry * ry - rx * rx * y1p * y1p - ry * ry * x1p * x1p;
  const den = rx * rx * y1p * y1p + ry * ry * x1p * x1p;
  let coef = Math.sqrt(Math.max(0, num2 / (den || 1)));
  if (large === sweep) coef = -coef;
  const cxp = (coef * (rx * y1p)) / ry;
  const cyp = (coef * -(ry * x1p)) / rx;
  const cx = cos * cxp - sin * cyp + (x1 + x2) / 2;
  const cy = sin * cxp + cos * cyp + (y1 + y2) / 2;
  const ang = (ux: number, uy: number, vx: number, vy: number) => {
    const a = Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy);
    return a;
  };
  const t1 = ang(1, 0, (x1p - cxp) / rx, (y1p - cyp) / ry);
  let dt = ang((x1p - cxp) / rx, (y1p - cyp) / ry, (-x1p - cxp) / rx, (-y1p - cyp) / ry);
  if (!sweep && dt > 0) dt -= 2 * Math.PI;
  if (sweep && dt < 0) dt += 2 * Math.PI;
  const n = Math.max(1, Math.ceil(Math.abs(dt) / (Math.PI / 2) - 1e-9));
  const step = dt / n;
  const k = (4 / 3) * Math.tan(step / 4);
  const out: Seg[] = [];
  let t = t1;
  const pt = (a: number): [number, number] => [cx + rx * Math.cos(a) * cos - ry * Math.sin(a) * sin, cy + rx * Math.cos(a) * sin + ry * Math.sin(a) * cos];
  const der = (a: number): [number, number] => [-rx * Math.sin(a) * cos - ry * Math.cos(a) * sin, -rx * Math.sin(a) * sin + ry * Math.cos(a) * cos];
  for (let i = 0; i < n; i++) {
    const a0 = t;
    const a1 = t + step;
    const [px0, py0] = pt(a0);
    const [px1, py1] = pt(a1);
    const [dx0, dy0] = der(a0);
    const [dx1, dy1] = der(a1);
    out.push(["C", px0 + k * dx0, py0 + k * dy0, px1 - k * dx1, py1 - k * dy1, i === n - 1 ? x2 : px1, i === n - 1 ? y2 : py1]);
    t = a1;
  }
  return out;
}

/** Parse SVG path data into absolute move / line / cubic / close segments. */
export function parsePathData(d: string): Seg[] {
  const tokens = d.match(/[MmLlHhVvCcSsQqTtAaZz]|[-+]?(?:\d*\.\d+|\d+\.?\d*)(?:[eE][-+]?\d+)?/g) ?? [];
  const out: Seg[] = [];
  let i = 0;
  let cmd = "";
  let x = 0;
  let y = 0;
  let sx = 0;
  let sy = 0;
  let lastC: [number, number] | undefined; // last cubic control point
  let lastQ: [number, number] | undefined; // last quadratic control point
  const n = () => Number(tokens[i++]);
  const isNum = () => i < tokens.length && !/^[A-Za-z]$/.test(tokens[i]!);
  while (i < tokens.length) {
    if (/^[A-Za-z]$/.test(tokens[i]!)) cmd = tokens[i++]!;
    else if (!cmd) {
      i++;
      continue;
    }
    const rel = cmd === cmd.toLowerCase();
    const C = cmd.toUpperCase();
    if (C === "Z") {
      out.push(["Z"]);
      x = sx;
      y = sy;
      lastC = lastQ = undefined;
      continue;
    }
    if (!isNum()) continue;
    do {
      const ox = rel ? x : 0;
      const oy = rel ? y : 0;
      switch (C) {
        case "M": {
          x = ox + n();
          y = oy + n();
          sx = x;
          sy = y;
          out.push(["M", x, y]);
          cmd = rel ? "l" : "L";
          lastC = lastQ = undefined;
          break;
        }
        case "L":
          x = ox + n();
          y = oy + n();
          out.push(["L", x, y]);
          lastC = lastQ = undefined;
          break;
        case "H":
          x = ox + n();
          out.push(["L", x, y]);
          lastC = lastQ = undefined;
          break;
        case "V":
          y = oy + n();
          out.push(["L", x, y]);
          lastC = lastQ = undefined;
          break;
        case "C": {
          const x1 = ox + n();
          const y1 = oy + n();
          const x2 = ox + n();
          const y2 = oy + n();
          x = ox + n();
          y = oy + n();
          out.push(["C", x1, y1, x2, y2, x, y]);
          lastC = [x2, y2];
          lastQ = undefined;
          break;
        }
        case "S": {
          const [x1, y1] = lastC ? [2 * x - lastC[0], 2 * y - lastC[1]] : [x, y];
          const x2 = ox + n();
          const y2 = oy + n();
          x = ox + n();
          y = oy + n();
          out.push(["C", x1, y1, x2, y2, x, y]);
          lastC = [x2, y2];
          lastQ = undefined;
          break;
        }
        case "Q": {
          const qx = ox + n();
          const qy = oy + n();
          const ex = ox + n();
          const ey = oy + n();
          out.push(["C", x + (2 / 3) * (qx - x), y + (2 / 3) * (qy - y), ex + (2 / 3) * (qx - ex), ey + (2 / 3) * (qy - ey), ex, ey]);
          x = ex;
          y = ey;
          lastQ = [qx, qy];
          lastC = undefined;
          break;
        }
        case "T": {
          const [qx, qy] = lastQ ? [2 * x - lastQ[0], 2 * y - lastQ[1]] : [x, y];
          const ex = ox + n();
          const ey = oy + n();
          out.push(["C", x + (2 / 3) * (qx - x), y + (2 / 3) * (qy - y), ex + (2 / 3) * (qx - ex), ey + (2 / 3) * (qy - ey), ex, ey]);
          x = ex;
          y = ey;
          lastQ = [qx, qy];
          lastC = undefined;
          break;
        }
        case "A": {
          const rx = n();
          const ry = n();
          const rot = n();
          const large = n() !== 0;
          const sweep = n() !== 0;
          const ex = ox + n();
          const ey = oy + n();
          out.push(...arcToCubics(x, y, rx, ry, rot, large, sweep, ex, ey));
          x = ex;
          y = ey;
          lastC = lastQ = undefined;
          break;
        }
        default:
          i++;
      }
    } while (isNum());
  }
  return out;
}

function pointsOf(s: string | number | undefined): Array<[number, number]> {
  const v = String(s ?? "")
    .split(/[\s,]+/)
    .filter(Boolean)
    .map(Number);
  const out: Array<[number, number]> = [];
  for (let i = 0; i + 1 < v.length; i += 2) out.push([v[i]!, v[i + 1]!]);
  return out;
}

const KAPPA = 0.5522847498;

function ellipseSegs(cx: number, cy: number, rx: number, ry: number): Seg[] {
  const kx = rx * KAPPA;
  const ky = ry * KAPPA;
  return [
    ["M", cx + rx, cy],
    ["C", cx + rx, cy + ky, cx + kx, cy + ry, cx, cy + ry],
    ["C", cx - kx, cy + ry, cx - rx, cy + ky, cx - rx, cy],
    ["C", cx - rx, cy - ky, cx - kx, cy - ry, cx, cy - ry],
    ["C", cx + kx, cy - ry, cx + rx, cy - ky, cx + rx, cy],
    ["Z"],
  ];
}

const attrNum = (n: SvgNode, k: string, d = 0): number => {
  const v = n.a?.[k];
  if (v === undefined) return d;
  const f = typeof v === "number" ? v : parseFloat(v);
  return Number.isFinite(f) ? f : d;
};

/** The geometry of a shape element, or undefined for non-shapes. */
function shapeSegs(n: SvgNode): Seg[] | undefined {
  switch (n.t) {
    case "rect": {
      const x = attrNum(n, "x");
      const y = attrNum(n, "y");
      const w = attrNum(n, "width");
      const h = attrNum(n, "height");
      if (w <= 0 || h <= 0) return [];
      return [["M", x, y], ["L", x + w, y], ["L", x + w, y + h], ["L", x, y + h], ["Z"]];
    }
    case "line":
      return [
        ["M", attrNum(n, "x1"), attrNum(n, "y1")],
        ["L", attrNum(n, "x2"), attrNum(n, "y2")],
      ];
    case "polyline":
    case "polygon": {
      const pts = pointsOf(n.a?.points);
      if (pts.length === 0) return [];
      const segs: Seg[] = pts.map(([x, y], i) => [i === 0 ? "M" : "L", x, y] as Seg);
      if (n.t === "polygon") segs.push(["Z"]);
      return segs;
    }
    case "circle": {
      const r = attrNum(n, "r");
      return r > 0 ? ellipseSegs(attrNum(n, "cx"), attrNum(n, "cy"), r, r) : [];
    }
    case "ellipse": {
      const rx = attrNum(n, "rx");
      const ry = attrNum(n, "ry");
      return rx > 0 && ry > 0 ? ellipseSegs(attrNum(n, "cx"), attrNum(n, "cy"), rx, ry) : [];
    }
    case "path":
      return parsePathData(String(n.a?.d ?? ""));
    default:
      return undefined;
  }
}

function segsOps(segs: Seg[]): string {
  const out: string[] = [];
  for (const s of segs) {
    if (s[0] === "M") out.push(`${num(s[1])} ${num(s[2])} m`);
    else if (s[0] === "L") out.push(`${num(s[1])} ${num(s[2])} l`);
    else if (s[0] === "C") out.push(`${num(s[1])} ${num(s[2])} ${num(s[3])} ${num(s[4])} ${num(s[5])} ${num(s[6])} c`);
    else out.push("h");
  }
  return out.join("\n");
}

function segsBox(segs: Seg[]): { x0: number; y0: number; x1: number; y1: number } | undefined {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const s of segs) {
    for (let i = 1; i + 1 < s.length; i += 2) {
      const x = s[i] as number;
      const y = s[i + 1] as number;
      x0 = Math.min(x0, x);
      y0 = Math.min(y0, y);
      x1 = Math.max(x1, x);
      y1 = Math.max(y1, y);
    }
  }
  return Number.isFinite(x0) ? { x0, y0, x1, y1 } : undefined;
}

// ---------------------------------------------------------------------------
// style
// ---------------------------------------------------------------------------

interface Style {
  fill: string;
  stroke: string;
  strokeWidth: number;
  fillOpacity: number;
  strokeOpacity: number;
  opacity: number;
  dash: string | undefined;
  cap: string;
  join: string;
  fontSize: number;
  fontWeight: string;
  anchor: string;
  paintOrder: string;
}

const DEFAULT_STYLE: Style = { fill: "#000000", stroke: "none", strokeWidth: 1, fillOpacity: 1, strokeOpacity: 1, opacity: 1, dash: undefined, cap: "butt", join: "miter", fontSize: 16, fontWeight: "400", anchor: "start", paintOrder: "normal" };

function styleOf(n: SvgNode, parent: Style): Style {
  const a = n.a ?? {};
  const s: Style = { ...parent, opacity: 1 };
  const str = (k: string) => (a[k] === undefined ? undefined : String(a[k]));
  if (str("fill") !== undefined) s.fill = str("fill")!;
  if (str("stroke") !== undefined) s.stroke = str("stroke")!;
  if (a["stroke-width"] !== undefined) s.strokeWidth = attrNum(n, "stroke-width", parent.strokeWidth);
  if (a["fill-opacity"] !== undefined) s.fillOpacity = attrNum(n, "fill-opacity", 1);
  if (a["stroke-opacity"] !== undefined) s.strokeOpacity = attrNum(n, "stroke-opacity", 1);
  // group opacity is approximated by multiplying it into the children's alphas
  s.opacity = parent.opacity * (a.opacity !== undefined ? attrNum(n, "opacity", 1) : 1);
  if (str("stroke-dasharray") !== undefined) s.dash = str("stroke-dasharray") === "none" ? undefined : str("stroke-dasharray");
  if (str("stroke-linecap") !== undefined) s.cap = str("stroke-linecap")!;
  if (str("stroke-linejoin") !== undefined) s.join = str("stroke-linejoin")!;
  if (a["font-size"] !== undefined) s.fontSize = attrNum(n, "font-size", parent.fontSize);
  if (str("font-weight") !== undefined) s.fontWeight = str("font-weight")!;
  if (str("text-anchor") !== undefined) s.anchor = str("text-anchor")!;
  if (str("paint-order") !== undefined) s.paintOrder = str("paint-order")!;
  return s;
}

function isBold(w: string): boolean {
  return w === "bold" || w === "bolder" || (Number.isFinite(Number(w)) && Number(w) >= 600);
}

// ---------------------------------------------------------------------------
// writer
// ---------------------------------------------------------------------------

/** A PDF literal string from WinAnsi bytes. */
function pdfString(text: string): string {
  let out = "(";
  for (const b of winAnsiBytes(text)) {
    if (b === 0x28 || b === 0x29 || b === 0x5c) out += `\\${String.fromCharCode(b)}`;
    else if (b < 32 || b > 126) out += `\\${b.toString(8).padStart(3, "0")}`;
    else out += String.fromCharCode(b);
  }
  return `${out})`;
}

/** Pattern tiles drawn per fill, at most (a guard against runaway output). */
const MAX_TILES = 40000;

/** The graphics state the writer tracks, so it only emits operators that change something. */
interface GState {
  gs: string;
  rg: string;
  RG: string;
  w: string;
  J: string;
  j: string;
  d: string;
}

const INITIAL_GSTATE: GState = { gs: "", rg: "0 0 0", RG: "0 0 0", w: "1", J: "0", j: "0", d: "[] 0" };

class ContentWriter {
  readonly ops: string[] = [];
  private st: GState = { ...INITIAL_GSTATE };
  private readonly stack: GState[] = [];
  constructor(
    private readonly defs: Map<string, SvgNode>,
    private readonly gstate: (fillAlpha: number, strokeAlpha: number) => string,
  ) {}

  private save() {
    this.ops.push("q");
    this.stack.push({ ...this.st });
  }

  private restore() {
    this.ops.push("Q");
    this.st = this.stack.pop() ?? { ...INITIAL_GSTATE };
  }

  private set(k: keyof GState, v: string, op: string) {
    if (this.st[k] === v) return;
    this.st[k] = v;
    this.ops.push(`${v} ${op}`);
  }

  draw(n: SvgNode | string, parent: Style): void {
    if (typeof n === "string") return;
    if (n.t === "defs" || n.t === "title" || n.t === "desc" || n.t === "clipPath" || n.t === "pattern" || n.t === "metadata" || n.t === "style") return;
    const style = styleOf(n, parent);
    const t = parseTransform(n.a?.transform === undefined ? undefined : String(n.a.transform));
    const hasT = t !== IDENTITY;
    const clip = this.clipOf(n);
    const wrap = hasT || !!clip;
    if (wrap) {
      this.save();
      if (hasT) this.ops.push(`${num(t[0], 6)} ${num(t[1], 6)} ${num(t[2], 6)} ${num(t[3], 6)} ${num(t[4])} ${num(t[5])} cm`);
      if (clip) this.ops.push(`${clip}\nW n`);
    }
    if (n.t === "g" || n.t === "svg" || n.t === "a") {
      for (const c of n.c ?? []) this.draw(c, style);
    } else if (n.t === "text") {
      this.text(n, style);
    } else {
      const segs = shapeSegs(n);
      if (segs && segs.length) this.shape(segs, style, n.t === "line" || n.t === "polyline");
    }
    if (wrap) this.restore();
  }

  private clipOf(n: SvgNode): string | undefined {
    const ref = n.a?.["clip-path"];
    const m = typeof ref === "string" ? /url\(#([^)]+)\)/.exec(ref) : null;
    if (!m) return undefined;
    const cp = this.defs.get(m[1]!);
    if (!cp) return undefined;
    const parts: string[] = [];
    for (const c of cp.c ?? []) {
      if (typeof c === "string") continue;
      const segs = shapeSegs(c);
      if (!segs?.length) continue;
      const t = parseTransform(c.a?.transform === undefined ? undefined : String(c.a.transform));
      parts.push(segsOps(t === IDENTITY ? segs : segs.map((s) => transformSeg(s, t))));
    }
    return parts.length ? parts.join("\n") : "0 0 m h";
  }

  private setAlpha(fill: number, stroke: number) {
    // fully opaque needs no ExtGState until something translucent was set
    if (fill >= 1 && stroke >= 1 && this.st.gs === "") return;
    this.set("gs", `/${this.gstate(fill, stroke)}`, "gs");
  }

  private strokeState(s: Style) {
    this.set("w", num(s.strokeWidth, 4), "w");
    this.set("J", String(s.cap === "round" ? 1 : s.cap === "square" ? 2 : 0), "J");
    this.set("j", String(s.join === "round" ? 1 : s.join === "bevel" ? 2 : 0), "j");
    const dash = (s.dash ?? "")
      .split(/[\s,]+/)
      .filter(Boolean)
      .map(Number)
      .filter((v) => Number.isFinite(v) && v >= 0);
    const valid = dash.length > 0 && dash.some((v) => v > 0);
    this.set("d", valid ? `[${dash.map((v) => num(v, 4)).join(" ")}] 0` : "[] 0", "d");
  }

  private shape(segs: Seg[], s: Style, open: boolean) {
    const path = segsOps(segs);
    const pattern = /url\(#([^)]+)\)/.exec(s.fill);
    if (!open && pattern) {
      const p = this.defs.get(pattern[1]!);
      if (p?.t === "pattern") this.patternFill(path, segs, p, s);
    } else if (!open) {
      const c = parseColor(s.fill);
      if (c && s.fill !== "none") {
        this.setAlpha(s.fillOpacity * s.opacity, 1);
        this.set("rg", rgb(c), "rg");
        this.ops.push(`${path}\nf`);
      }
    }
    const sc = parseColor(s.stroke);
    if (sc && s.stroke !== "none" && s.strokeWidth > 0) {
      this.setAlpha(1, s.strokeOpacity * s.opacity);
      this.strokeState(s);
      this.set("RG", rgb(sc), "RG");
      this.ops.push(`${path}\nS`);
    }
  }

  /** Fill with an SVG pattern: clip to the shape and draw the pattern's tiles that cover it. */
  private patternFill(path: string, segs: Seg[], p: SvgNode, s: Style) {
    const w = attrNum(p, "width");
    const h = attrNum(p, "height");
    const box = segsBox(segs);
    if (w <= 0 || h <= 0 || !box) return;
    const pt = parseTransform(p.a?.patternTransform === undefined ? undefined : String(p.a.patternTransform));
    const px = attrNum(p, "x");
    const py = attrNum(p, "y");
    const inv = invert(pt);
    let u0 = Infinity;
    let v0 = Infinity;
    let u1 = -Infinity;
    let v1 = -Infinity;
    for (const [x, y] of [
      [box.x0, box.y0],
      [box.x1, box.y0],
      [box.x0, box.y1],
      [box.x1, box.y1],
    ] as const) {
      const [u, v] = apply(inv, x, y);
      u0 = Math.min(u0, u);
      v0 = Math.min(v0, v);
      u1 = Math.max(u1, u);
      v1 = Math.max(v1, v);
    }
    const i0 = Math.floor((u0 - px) / w);
    const i1 = Math.ceil((u1 - px) / w);
    const j0 = Math.floor((v0 - py) / h);
    const j1 = Math.ceil((v1 - py) / h);
    if ((i1 - i0) * (j1 - j0) > MAX_TILES) return;
    this.save();
    this.ops.push(`${path}\nW n`);
    if (pt !== IDENTITY) this.ops.push(`${num(pt[0], 6)} ${num(pt[1], 6)} ${num(pt[2], 6)} ${num(pt[3], 6)} ${num(pt[4])} ${num(pt[5])} cm`);
    const base: Style = { ...DEFAULT_STYLE, opacity: s.opacity * s.fillOpacity };
    for (let j = j0; j < j1; j++) {
      for (let i = i0; i < i1; i++) {
        this.save();
        this.ops.push(`1 0 0 1 ${num(px + i * w, 4)} ${num(py + j * h, 4)} cm`);
        for (const c of p.c ?? []) this.draw(c, base);
        this.restore();
      }
    }
    this.restore();
  }

  private text(n: SvgNode, s: Style) {
    const str = (n.c ?? []).map((c) => (typeof c === "string" ? c : (c.c ?? []).filter((x) => typeof x === "string").join(""))).join("");
    if (!str) return;
    const bold = isBold(s.fontWeight);
    const size = s.fontSize;
    const w = textWidth(str, size, bold);
    let x = attrNum(n, "x");
    const y = attrNum(n, "y");
    if (s.anchor === "middle") x -= w / 2;
    else if (s.anchor === "end") x -= w;
    const font = bold ? "F2" : "F1";
    const head = `BT\n/${font} ${num(size, 4)} Tf\n1 0 0 -1 ${num(x)} ${num(y)} Tm`;
    const body = pdfString(str);
    const fill = parseColor(s.fill);
    const stroke = s.stroke !== "none" ? parseColor(s.stroke) : undefined;
    const strokeFirst = stroke && s.strokeWidth > 0 && /^stroke/.test(s.paintOrder.trim());
    const doStroke = () => {
      this.setAlpha(1, s.strokeOpacity * s.opacity);
      this.strokeState({ ...s, dash: undefined, join: "round", cap: "round" });
      this.set("RG", rgb(stroke!), "RG");
      this.ops.push(`${head}\n1 Tr\n${body} Tj\nET`);
    };
    if (strokeFirst) doStroke();
    if (fill && s.fill !== "none") {
      this.setAlpha(s.fillOpacity * s.opacity, 1);
      this.set("rg", rgb(fill), "rg");
      this.ops.push(`${head}\n0 Tr\n${body} Tj\nET`);
    }
    if (stroke && s.strokeWidth > 0 && !strokeFirst) doStroke();
  }
}

function transformSeg(s: Seg, t: Matrix): Seg {
  if (s[0] === "Z") return s;
  if (s[0] === "C") {
    const [a, b] = apply(t, s[1], s[2]);
    const [c, d] = apply(t, s[3], s[4]);
    const [e, f] = apply(t, s[5], s[6]);
    return ["C", a, b, c, d, e, f];
  }
  const [x, y] = apply(t, s[1], s[2]);
  return [s[0], x, y];
}

function collectDefs(n: SvgNode | string, out: Map<string, SvgNode>) {
  if (typeof n === "string") return;
  const id = n.a?.id;
  if (id !== undefined && (n.t === "pattern" || n.t === "clipPath")) out.set(String(id), n);
  for (const c of n.c ?? []) collectDefs(c, out);
}

/** Serialise pages of SvgNode drawings (in points, y down) into PDF bytes. */
export function svgPagesToPdf(pages: PdfPage[], info: PdfInfo = {}): Uint8Array {
  const gs = new Map<string, string>();
  const gstate = (fa: number, sa: number) => {
    const key = `${num(Math.min(1, Math.max(0, fa)), 3)} ${num(Math.min(1, Math.max(0, sa)), 3)}`;
    let name = gs.get(key);
    if (!name) {
      name = `GS${gs.size}`;
      gs.set(key, name);
    }
    return name;
  };
  // object numbers: 1 catalog, 2 pages, 3 Helvetica, 4 Helvetica-Bold, 5 resources, 6 info, then page + content pairs
  const pageObjs: Array<{ dict: string; content: string }> = [];
  let needsUserUnit = false;
  pages.forEach((page, i) => {
    const defs = new Map<string, SvgNode>();
    collectDefs(page.node, defs);
    const w = new ContentWriter(defs, gstate);
    const big = Math.max(page.width, page.height);
    const unit = big > PDF_MAX_UNITS ? Math.ceil(big / PDF_MAX_UNITS) : 1;
    if (unit > 1) needsUserUnit = true;
    const pre: string[] = [];
    if (unit > 1) pre.push(`${num(1 / unit, 6)} 0 0 ${num(1 / unit, 6)} 0 0 cm`);
    pre.push(`1 0 0 -1 0 ${num(page.height)} cm`);
    w.draw(page.node, DEFAULT_STYLE);
    const content = `${pre.join("\n")}\n${w.ops.join("\n")}\n`;
    const pageNo = 7 + i * 2;
    const media = `[0 0 ${num(page.width / unit)} ${num(page.height / unit)}]`;
    const dict = `<< /Type /Page /Parent 2 0 R /MediaBox ${media} /Resources 5 0 R /Contents ${pageNo + 1} 0 R${unit > 1 ? ` /UserUnit ${unit}` : ""} >>`;
    pageObjs.push({ dict, content });
  });

  const objects: string[] = [];
  objects[1] = "<< /Type /Catalog /Pages 2 0 R >>";
  objects[2] = `<< /Type /Pages /Kids [${pageObjs.map((_, i) => `${7 + i * 2} 0 R`).join(" ")}] /Count ${pageObjs.length} >>`;
  objects[3] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>";
  objects[4] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>";
  const gsDict = [...gs.entries()].map(([k, name]) => {
    const [fa, sa] = k.split(" ");
    return `/${name} << /Type /ExtGState /ca ${fa} /CA ${sa} >>`;
  });
  objects[5] = `<< /ProcSet [/PDF /Text] /Font << /F1 3 0 R /F2 4 0 R >>${gsDict.length ? ` /ExtGState << ${gsDict.join(" ")} >>` : ""} >>`;
  const infoParts = [`/Producer ${pdfString("Campaign Forge")}`];
  if (info.title) infoParts.push(`/Title ${pdfString(info.title)}`);
  if (info.subject) infoParts.push(`/Subject ${pdfString(info.subject)}`);
  if (info.author) infoParts.push(`/Author ${pdfString(info.author)}`);
  if (info.creator) infoParts.push(`/Creator ${pdfString(info.creator)}`);
  objects[6] = `<< ${infoParts.join(" ")} >>`;
  pageObjs.forEach((p, i) => {
    objects[7 + i * 2] = p.dict;
    objects[8 + i * 2] = `<< /Length ${p.content.length} >>\nstream\n${p.content}endstream`;
  });

  // everything above is ASCII; the header's binary comment marks the file as binary
  let out = `%PDF-${needsUserUnit ? "1.6" : "1.4"}\n%âãÏÓ\n`;
  const offsets: number[] = [];
  for (let i = 1; i < objects.length; i++) {
    offsets[i] = out.length;
    out += `${i} 0 obj\n${objects[i]}\nendobj\n`;
  }
  const xref = out.length;
  out += `xref\n0 ${objects.length}\n0000000000 65535 f \n`;
  for (let i = 1; i < objects.length; i++) out += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
  out += `trailer\n<< /Size ${objects.length} /Root 1 0 R /Info 6 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  const bytes = new Uint8Array(out.length);
  for (let i = 0; i < out.length; i++) bytes[i] = out.charCodeAt(i) & 0xff;
  return bytes;
}
