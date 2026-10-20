/**
 * Floor sketches for the site map generator. A deck is first drawn on a
 * coarse grid of lines (columns and rows) that have no size yet: every zone
 * owns a rectangle of cells, and two zones touch when their rectangles share
 * a cell edge. The zone graph stage (plan.ts and archetypes.ts) decides the
 * sketch; the layout stage gives every line a width in metres. Any positive
 * sizes keep the same zones touching, so the layout can never lose a planned
 * passage.
 *
 * Corridor lines take the site's corridor width; a corridor zone lies in one
 * corridor line across its width, so it stays 2-3 m wide. Other lines are
 * sized from the rooms that span them (their catalog sizes), or from an
 * explicit range. Lines in a group share one size (mirrored halves of a
 * symmetric plan). A last pass shrinks lines until no zone is over 24 m.
 */
import type { Rng } from "@campaign-forge/module-sdk";

export type LineKind = "corr" | "room" | "gap";

export interface Line {
  kind: LineKind;
  /** Size range in metres (overrides what the rooms ask for). Corridor lines ignore it. */
  range?: [number, number];
  /** Lines in one group get the same size. */
  group?: string;
  /** Kept when no zone uses it (spacing between buildings). */
  keep?: boolean;
}

/** Inclusive cell ranges. */
export interface Box {
  c0: number;
  r0: number;
  c1: number;
  r1: number;
}

export const box = (c0: number, r0: number, c1 = c0, r1 = r0): Box => ({ c0: Math.min(c0, c1), r0: Math.min(r0, r1), c1: Math.max(c0, c1), r1: Math.max(r0, r1) });

export class Sketch {
  cols: Line[] = [];
  rows: Line[] = [];
  readonly boxes = new Map<string, Box>();
  private cells = new Map<string, string>();

  col(kind: LineKind, extra: Omit<Line, "kind"> = {}): number {
    this.cols.push({ kind, ...extra });
    return this.cols.length - 1;
  }

  row(kind: LineKind, extra: Omit<Line, "kind"> = {}): number {
    this.rows.push({ kind, ...extra });
    return this.rows.length - 1;
  }

  inside(c: number, r: number): boolean {
    return c >= 0 && r >= 0 && c < this.cols.length && r < this.rows.length;
  }

  at(c: number, r: number): string | undefined {
    return this.cells.get(`${c},${r}`);
  }

  free(b: Box): boolean {
    for (let r = b.r0; r <= b.r1; r++) for (let c = b.c0; c <= b.c1; c++) if (!this.inside(c, r) || this.cells.has(`${c},${r}`)) return false;
    return true;
  }

  /** Claim a rectangle for a zone; false when a cell is taken or off the grid. */
  put(key: string, b: Box): boolean {
    if (this.boxes.has(key) || !this.free(b)) return false;
    this.boxes.set(key, { ...b });
    for (let r = b.r0; r <= b.r1; r++) for (let c = b.c0; c <= b.c1; c++) this.cells.set(`${c},${r}`, key);
    return true;
  }

  drop(key: string): void {
    const b = this.boxes.get(key);
    if (!b) return;
    for (let r = b.r0; r <= b.r1; r++) for (let c = b.c0; c <= b.c1; c++) this.cells.delete(`${c},${r}`);
    this.boxes.delete(key);
  }

  /** Grow a zone's rectangle (the new cells must be free). */
  resize(key: string, b: Box): boolean {
    const old = this.boxes.get(key);
    if (!old) return false;
    this.drop(key);
    if (this.put(key, b)) return true;
    this.put(key, old);
    return false;
  }

  /** Cells just outside a rectangle, in a fixed order (top, right, bottom, left). */
  private ring(b: Box): Array<[number, number]> {
    const out: Array<[number, number]> = [];
    for (let c = b.c0; c <= b.c1; c++) out.push([c, b.r0 - 1]);
    for (let r = b.r0; r <= b.r1; r++) out.push([b.c1 + 1, r]);
    for (let c = b.c1; c >= b.c0; c--) out.push([c, b.r1 + 1]);
    for (let r = b.r1; r >= b.r0; r--) out.push([b.c0 - 1, r]);
    return out;
  }

  /** Zones sharing an edge with this one, in a fixed order. */
  neighbours(key: string): string[] {
    const b = this.boxes.get(key);
    if (!b) return [];
    const out: string[] = [];
    for (const [c, r] of this.ring(b)) {
      const k = this.at(c, r);
      if (k && !out.includes(k)) out.push(k);
    }
    return out;
  }

  touch(a: string, b: string): boolean {
    const x = this.boxes.get(a);
    const y = this.boxes.get(b);
    if (!x || !y) return false;
    const rows = x.r0 <= y.r1 && y.r0 <= x.r1;
    const cols = x.c0 <= y.c1 && y.c0 <= x.c1;
    return (rows && (x.c1 + 1 === y.c0 || y.c1 + 1 === x.c0)) || (cols && (x.r1 + 1 === y.r0 || y.r1 + 1 === x.r0));
  }

  /** Whether some edge of the zone faces no zone (off the grid, an empty cell, or a zone `outside` accepts). */
  facesOut(key: string, outside: (k: string) => boolean = () => false): boolean {
    const b = this.boxes.get(key);
    if (!b) return false;
    return this.ring(b).some(([c, r]) => {
      const k = this.at(c, r);
      return k === undefined || outside(k);
    });
  }

  /** Remove lines no zone uses (unless kept) and renumber the rectangles. */
  compact(): void {
    const usedC = new Set<number>();
    const usedR = new Set<number>();
    for (const b of this.boxes.values()) {
      for (let c = b.c0; c <= b.c1; c++) usedC.add(c);
      for (let r = b.r0; r <= b.r1; r++) usedR.add(r);
    }
    // A kept line survives only between used lines (never on the outside).
    const keepIdx = (lines: Line[], used: Set<number>) => {
      const lo = Math.min(...used);
      const hi = Math.max(...used);
      return lines.map((l, i) => used.has(i) || (l.keep === true && i > lo && i < hi));
    };
    const kc = keepIdx(this.cols, usedC);
    const kr = keepIdx(this.rows, usedR);
    const mapC: number[] = [];
    const mapR: number[] = [];
    let n = 0;
    kc.forEach((k, i) => (mapC[i] = k ? n++ : -1));
    n = 0;
    kr.forEach((k, i) => (mapR[i] = k ? n++ : -1));
    this.cols = this.cols.filter((_, i) => kc[i]);
    this.rows = this.rows.filter((_, i) => kr[i]);
    const boxes = [...this.boxes.entries()].map(([k, b]) => [k, { c0: mapC[b.c0]!, r0: mapR[b.r0]!, c1: mapC[b.c1]!, r1: mapR[b.r1]! }] as const);
    this.boxes.clear();
    this.cells.clear();
    for (const [k, b] of boxes) this.put(k, b);
  }
}

/** What a zone asks of the lines it spans. */
export interface ZoneDemand {
  box: Box;
  /** Wanted size across the columns and down the rows, in metres. */
  x?: [number, number];
  y?: [number, number];
  /** Corridors and other zones that only need to stay under the size cap. */
  free?: boolean;
  /** Smallest size across the columns and down the rows (room for the zone's labels). */
  min?: { x?: number; y?: number };
}

export interface SizeOptions {
  corridor: [number, number];
  /** Lines nothing asks a size of. */
  free: [number, number];
  /** Largest zone, in metres. */
  max: number;
}

/** Sizes for one axis. */
function sizeAxis(rng: Rng, lines: Line[], demands: Array<{ lo: number; hi: number; want?: [number, number]; min?: number }>, o: SizeOptions): number[] {
  const corrMid = (o.corridor[0] + o.corridor[1]) / 2;
  const asks: Array<Array<[number, number]>> = lines.map(() => []);
  for (const d of demands) {
    if (!d.want) continue;
    const span: number[] = [];
    for (let i = d.lo; i <= d.hi; i++) span.push(i);
    const fixed = span.filter((i) => lines[i]!.kind === "corr").length * corrMid;
    const open = span.filter((i) => lines[i]!.kind !== "corr");
    if (open.length === 0) continue;
    const lo = Math.max(2, (d.want[0] - fixed) / open.length);
    const hi = Math.max(lo, (d.want[1] - fixed) / open.length);
    for (const i of open) asks[i]!.push([lo, hi]);
  }
  const ranges: Array<[number, number]> = lines.map((l, i) => {
    if (l.kind === "corr") return o.corridor;
    if (l.range) return l.range;
    const a = asks[i]!;
    if (a.length === 0) return o.free;
    const lo = Math.round(Math.max(...a.map((x) => x[0])));
    const hi = Math.round(Math.min(...a.map((x) => x[1])));
    const l0 = Math.min(12, Math.max(3, lo));
    return [l0, Math.min(14, Math.max(l0, hi))];
  });
  // One size per group.
  const groupOf = (i: number) => lines[i]!.group ?? `#${i}`;
  const groups = new Map<string, number[]>();
  lines.forEach((_, i) => groups.set(groupOf(i), [...(groups.get(groupOf(i)) ?? []), i]));
  const size = new Array<number>(lines.length).fill(0);
  for (const members of groups.values()) {
    const lo = Math.max(...members.map((i) => ranges[i]![0]));
    const hi = Math.max(lo, Math.min(...members.map((i) => ranges[i]![1])));
    const s = rng.int(lo, hi);
    for (const i of members) size[i] = s;
  }
  // Grow the narrowest open line of any zone under its minimum (with its group).
  const sum = (d: { lo: number; hi: number }) => {
    let n = 0;
    for (let i = d.lo; i <= d.hi; i++) n += size[i]!;
    return n;
  };
  for (let guard = 0; guard < 400; guard++) {
    // (Lines with a set range keep it: the plan chose them.)
    const growable = (i: number) => lines[i]!.kind !== "corr" && !lines[i]!.range && size[i]! < 14;
    const under = demands.find((d) => d.min !== undefined && sum(d) < d.min && [...Array(d.hi - d.lo + 1).keys()].some((k) => growable(d.lo + k)));
    if (!under) break;
    let pick = -1;
    for (let i = under.lo; i <= under.hi; i++) if (growable(i) && (pick < 0 || size[i]! < size[pick]!)) pick = i;
    for (const i of groups.get(groupOf(pick))!) size[i]!++;
  }
  // Shrink the widest open line of any zone over the cap (with its group).
  const floor = (i: number) => (lines[i]!.kind === "corr" ? Infinity : lines[i]!.kind === "gap" ? 2 : 3);
  for (let guard = 0; guard < 400; guard++) {
    const over = demands.find((d) => {
      let s = 0;
      for (let i = d.lo; i <= d.hi; i++) s += size[i]!;
      return s > o.max;
    });
    if (!over) break;
    let pick = -1;
    for (let i = over.lo; i <= over.hi; i++) if (size[i]! > floor(i) && (pick < 0 || size[i]! > size[pick]!)) pick = i;
    if (pick < 0) break;
    for (const i of groups.get(groupOf(pick))!) size[i] = Math.max(floor(i) === Infinity ? size[i]! : floor(i), size[i]! - 1);
  }
  return size;
}

/** Line sizes for a sketch: column widths and row heights in metres. */
export function sizeSketch(rng: Rng, sk: Sketch, demands: ZoneDemand[], o: SizeOptions): { colW: number[]; rowH: number[] } {
  const colW = sizeAxis(
    rng,
    sk.cols,
    demands.map((d) => ({ lo: d.box.c0, hi: d.box.c1, ...(d.x ? { want: d.x } : {}), ...(d.min?.x ? { min: d.min.x } : {}) })),
    o,
  );
  const rowH = sizeAxis(
    rng,
    sk.rows,
    demands.map((d) => ({ lo: d.box.r0, hi: d.box.r1, ...(d.y ? { want: d.y } : {}), ...(d.min?.y ? { min: d.min.y } : {}) })),
    o,
  );
  return { colW, rowH };
}
