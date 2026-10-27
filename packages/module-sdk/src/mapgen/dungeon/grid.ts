/**
 * The dungeon engine's cell grid: every zone owns a set of square cells;
 * outlines are traced from the cells, borders come from the unit edges two
 * zones share, and passages are carved with a cheapest-path search.
 */
import type { MapPoint, Rng } from "../../types";

export const EMPTY = -1;

/** A unit edge between two cells: the cell (x, y) and the side it is on ("e": x+1, "s": y+1). */
export interface UnitEdge {
  x: number;
  y: number;
  side: "e" | "s";
}

export class Grid {
  readonly w: number;
  readonly h: number;
  readonly owner: Int32Array;

  constructor(w: number, h: number) {
    this.w = w;
    this.h = h;
    this.owner = new Int32Array(w * h).fill(EMPTY);
  }

  inside(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < this.w && y < this.h;
  }

  at(x: number, y: number): number {
    return this.inside(x, y) ? this.owner[y * this.w + x]! : EMPTY;
  }

  set(x: number, y: number, id: number): void {
    if (this.inside(x, y)) this.owner[y * this.w + x] = id;
  }

  /** True when every cell of the rectangle is inside the grid and empty. */
  free(x0: number, y0: number, w: number, h: number): boolean {
    for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) if (!this.inside(x, y) || this.at(x, y) !== EMPTY) return false;
    return true;
  }

  fill(x0: number, y0: number, w: number, h: number, id: number): void {
    for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) this.set(x, y, id);
  }

  /** Cells of every owner, in scan order. */
  cellsByOwner(): Map<number, number[]> {
    const out = new Map<number, number[]>();
    for (let i = 0; i < this.owner.length; i++) {
      const o = this.owner[i]!;
      if (o === EMPTY) continue;
      let list = out.get(o);
      if (!list) out.set(o, (list = []));
      list.push(i);
    }
    return out;
  }

  cellsOf(id: number): number[] {
    const out: number[] = [];
    for (let i = 0; i < this.owner.length; i++) if (this.owner[i] === id) out.push(i);
    return out;
  }

  relabel(from: number, to: number): void {
    for (let i = 0; i < this.owner.length; i++) if (this.owner[i] === from) this.owner[i] = to;
  }
}

export const DIRS: ReadonlyArray<[number, number]> = [
  [1, 0],
  [0, 1],
  [-1, 0],
  [0, -1],
];

/** The unit edge between two 4-neighbour cells. */
export function edgeBetween(ax: number, ay: number, bx: number, by: number): UnitEdge {
  if (ay === by) return { x: Math.min(ax, bx), y: ay, side: "e" };
  return { x: ax, y: Math.min(ay, by), side: "s" };
}

export function edgeSegment(e: UnitEdge): [MapPoint, MapPoint] {
  return e.side === "e"
    ? [
        [e.x + 1, e.y],
        [e.x + 1, e.y + 1],
      ]
    : [
        [e.x, e.y + 1],
        [e.x + 1, e.y + 1],
      ];
}

/** True when the cell set has an empty pocket fully enclosed by it (a hole). */
export function hasHole(cells: Iterable<number>, w: number): boolean {
  const set = new Set(cells);
  if (set.size === 0) return false;
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const c of set) {
    const x = c % w;
    const y = (c - x) / w;
    x0 = Math.min(x0, x);
    y0 = Math.min(y0, y);
    x1 = Math.max(x1, x);
    y1 = Math.max(y1, y);
  }
  // flood the outside within the box grown by one
  const bw = x1 - x0 + 3;
  const bh = y1 - y0 + 3;
  const seen = new Uint8Array(bw * bh);
  const inSet = (bx: number, by: number) => set.has((by + y0 - 1) * w + (bx + x0 - 1));
  const stack = [0];
  seen[0] = 1;
  while (stack.length) {
    const i = stack.pop()!;
    const bx = i % bw;
    const by = (i - bx) / bw;
    for (const [dx, dy] of DIRS) {
      const nx = bx + dx;
      const ny = by + dy;
      if (nx < 0 || ny < 0 || nx >= bw || ny >= bh) continue;
      const j = ny * bw + nx;
      if (seen[j] || inSet(nx, ny)) continue;
      seen[j] = 1;
      stack.push(j);
    }
  }
  for (let by = 1; by < bh - 1; by++) for (let bx = 1; bx < bw - 1; bx++) if (!seen[by * bw + bx] && !inSet(bx, by)) return true;
  return false;
}

/** Fill the enclosed pockets of a cell set (returns the added cells). */
export function fillHoles(cells: Set<number>, w: number, h: number): number[] {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const c of cells) {
    const x = c % w;
    const y = (c - x) / w;
    x0 = Math.min(x0, x);
    y0 = Math.min(y0, y);
    x1 = Math.max(x1, x);
    y1 = Math.max(y1, y);
  }
  const outside = new Set<number>();
  const stack: number[] = [];
  const push = (x: number, y: number) => {
    if (x < x0 - 1 || y < y0 - 1 || x > x1 + 1 || y > y1 + 1 || x < 0 || y < 0 || x >= w || y >= h) return;
    const i = y * w + x;
    if (outside.has(i) || cells.has(i)) return;
    outside.add(i);
    stack.push(i);
  };
  for (let x = x0 - 1; x <= x1 + 1; x++) {
    push(x, y0 - 1);
    push(x, y1 + 1);
  }
  for (let y = y0 - 1; y <= y1 + 1; y++) {
    push(x0 - 1, y);
    push(x1 + 1, y);
  }
  while (stack.length) {
    const i = stack.pop()!;
    const x = i % w;
    const y = (i - x) / w;
    for (const [dx, dy] of DIRS) push(x + dx, y + dy);
  }
  const added: number[] = [];
  for (let y = y0; y <= y1; y++)
    for (let x = x0; x <= x1; x++) {
      const i = y * w + x;
      if (!cells.has(i) && !outside.has(i)) {
        cells.add(i);
        added.push(i);
      }
    }
  return added;
}

/** True when the cells form one 4-connected piece. */
export function connected(cells: Iterable<number>, w: number): boolean {
  const set = new Set(cells);
  const first = set.values().next();
  if (first.done) return true;
  const seen = new Set<number>([first.value]);
  const stack = [first.value];
  while (stack.length) {
    const i = stack.pop()!;
    const x = i % w;
    for (const [dx, dy] of DIRS) {
      if ((dx === 1 && x === w - 1) || (dx === -1 && x === 0)) continue;
      const j = i + dy * w + dx;
      if (set.has(j) && !seen.has(j)) {
        seen.add(j);
        stack.push(j);
      }
    }
  }
  return seen.size === set.size;
}

/**
 * The outline of a cell set as a polygon (clockwise with y down), collinear
 * points removed. A set with holes gives its outer outline; cells that touch
 * only at a corner are walked as one loop.
 */
export function outline(cells: Iterable<number>, w: number): MapPoint[] {
  const set = new Set(cells);
  const key = (x: number, y: number) => `${x},${y}`;
  const out = new Map<string, Array<[number, number, number, number]>>();
  const add = (ax: number, ay: number, bx: number, by: number) => {
    const k = key(ax, ay);
    const list = out.get(k);
    if (list) list.push([ax, ay, bx, by]);
    else out.set(k, [[ax, ay, bx, by]]);
  };
  let start: [number, number] | undefined;
  for (const c of [...set].sort((a, b) => a - b)) {
    const x = c % w;
    const y = (c - x) / w;
    const has = (dx: number, dy: number) => {
      const nx = x + dx;
      if (nx < 0 || nx >= w) return false;
      return set.has(c + dy * w + dx);
    };
    if (!has(0, -1)) {
      add(x, y, x + 1, y);
      start ??= [x, y];
    }
    if (!has(1, 0)) add(x + 1, y, x + 1, y + 1);
    if (!has(0, 1)) add(x + 1, y + 1, x, y + 1);
    if (!has(-1, 0)) add(x, y + 1, x, y);
  }
  if (!start) return [];
  const loops: MapPoint[][] = [];
  const total = [...out.values()].reduce((s, l) => s + l.length, 0);
  let used = 0;
  while (used < total) {
    // the topmost-leftmost unused edge start
    let from: string | undefined;
    for (const [k, list] of out) if (list.length > 0 && (from === undefined || cmpKey(k, from) < 0)) from = k;
    if (!from) break;
    const pts: MapPoint[] = [];
    let cur = out.get(from)!.shift()!;
    used++;
    const first = from;
    let dir: [number, number] = [cur[2] - cur[0], cur[3] - cur[1]];
    pts.push([cur[0], cur[1]]);
    for (let guard = 0; guard < total + 4; guard++) {
      const k = key(cur[2], cur[3]);
      // the topmost-leftmost corner is never a corner touch, so the walk closes there
      if (k === first) break;
      pts.push([cur[2], cur[3]]);
      const list = out.get(k);
      if (!list || list.length === 0) break;
      // at a corner touch, turn left first so the walk stays one loop
      let pick = 0;
      if (list.length > 1) {
        const turn = (e: [number, number, number, number]) => {
          const d: [number, number] = [e[2] - e[0], e[3] - e[1]];
          const cross = dir[0] * d[1] - dir[1] * d[0];
          return cross < 0 ? 0 : cross === 0 ? 1 : 2;
        };
        pick = list.map((e, i) => [turn(e), i] as const).sort((a, b) => a[0] - b[0])[0]![1];
      }
      cur = list.splice(pick, 1)[0]!;
      used++;
      dir = [cur[2] - cur[0], cur[3] - cur[1]];
    }
    loops.push(simplify(pts));
  }
  // the outer loop is the one with the largest area
  return loops.sort((a, b) => Math.abs(area(b)) - Math.abs(area(a)))[0] ?? [];
}

function cmpKey(a: string, b: string): number {
  const [ax, ay] = a.split(",").map(Number) as [number, number];
  const [bx, by] = b.split(",").map(Number) as [number, number];
  return ay - by || ax - bx;
}

export function area(poly: MapPoint[]): number {
  let s = 0;
  for (let i = 0; i < poly.length; i++) {
    const [x1, y1] = poly[i]!;
    const [x2, y2] = poly[(i + 1) % poly.length]!;
    s += x1 * y2 - x2 * y1;
  }
  return s / 2;
}

/** Drop points that sit on a straight run between their neighbours. */
export function simplify(pts: MapPoint[]): MapPoint[] {
  if (pts.length < 4) return pts;
  const out: MapPoint[] = [];
  for (let i = 0; i < pts.length; i++) {
    const p = pts[(i - 1 + pts.length) % pts.length]!;
    const c = pts[i]!;
    const n = pts[(i + 1) % pts.length]!;
    const cross = (c[0] - p[0]) * (n[1] - c[1]) - (c[1] - p[1]) * (n[0] - c[0]);
    if (cross !== 0) out.push(c);
  }
  return out;
}

/** Every pair of owners that share a unit edge, with the shared edges in scan order. */
export function contacts(g: Grid): Map<string, { a: number; b: number; edges: UnitEdge[] }> {
  const out = new Map<string, { a: number; b: number; edges: UnitEdge[] }>();
  const note = (a: number, b: number, e: UnitEdge) => {
    if (a === EMPTY || b === EMPTY || a === b) return;
    const lo = Math.min(a, b);
    const hi = Math.max(a, b);
    const k = `${lo}|${hi}`;
    const c = out.get(k);
    if (c) c.edges.push(e);
    else out.set(k, { a: lo, b: hi, edges: [e] });
  };
  for (let y = 0; y < g.h; y++)
    for (let x = 0; x < g.w; x++) {
      const o = g.at(x, y);
      if (o === EMPTY) continue;
      if (x + 1 < g.w) note(o, g.at(x + 1, y), { x, y, side: "e" });
      if (y + 1 < g.h) note(o, g.at(x, y + 1), { x, y, side: "s" });
    }
  return out;
}

/** A binary heap of [priority, value] pairs (smallest first; ties by insertion order). */
export class Heap {
  private items: Array<[number, number, number]> = [];
  private n = 0;
  get size(): number {
    return this.items.length;
  }
  push(priority: number, value: number): void {
    const item: [number, number, number] = [priority, this.n++, value];
    const a = this.items;
    a.push(item);
    let i = a.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (less(a[p]!, a[i]!)) break;
      [a[p], a[i]] = [a[i]!, a[p]!];
      i = p;
    }
  }
  pop(): [number, number] | undefined {
    const a = this.items;
    if (a.length === 0) return undefined;
    const top = a[0]!;
    const last = a.pop()!;
    if (a.length > 0) {
      a[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let m = i;
        if (l < a.length && less(a[l]!, a[m]!)) m = l;
        if (r < a.length && less(a[r]!, a[m]!)) m = r;
        if (m === i) break;
        [a[m], a[i]] = [a[i]!, a[m]!];
        i = m;
      }
    }
    return [top[0], top[2]];
  }
}

function less(a: [number, number, number], b: [number, number, number]): boolean {
  return a[0] < b[0] || (a[0] === b[0] && a[1] < b[1]);
}

export interface CarveOptions {
  /** Owners the path may not enter (rooms), other than the two it joins. */
  isBlocked: (owner: number) => boolean;
  /** Owners a path may run through (existing passages), at a discount. */
  isPassage: (owner: number) => boolean;
  /** Extra cost per cell (winding passages), indexed by cell. */
  noise?: Float32Array | undefined;
  /** Cost of a turn (default 0.6). */
  turn?: number;
  /** Keep this many cells clear of the grid's edge (default 1). */
  margin?: number;
}

/**
 * The cheapest path of cells from a cell next to `from` to a cell next to
 * `to` (both zones' cells given), running through empty cells and existing
 * passages, never through other rooms. Returns the cells in order, the first
 * touching `from` and the last touching `to`, or undefined.
 */
export function carvePath(g: Grid, fromCells: number[], toCells: Set<number>, o: CarveOptions): number[] | undefined {
  const w = g.w;
  const margin = o.margin ?? 1;
  const turnCost = o.turn ?? 0.6;
  const fromOwner = g.owner[fromCells[0]!]!;
  const toOwner = g.owner[toCells.values().next().value!]!;
  const open = (x: number, y: number) => {
    if (x < margin || y < margin || x >= g.w - margin || y >= g.h - margin) return false;
    const owner = g.at(x, y);
    return owner === EMPTY || o.isPassage(owner);
  };
  // targets: open cells beside the destination, not at its corners
  const targets = new Set<number>();
  for (const c of toCells) {
    const x = c % w;
    const y = (c - x) / w;
    for (const [dx, dy] of DIRS) if (open(x + dx, y + dy)) targets.add((y + dy) * w + x + dx);
  }
  if (targets.size === 0) return undefined;
  // a cell is costlier beside rooms it does not join, and beside passages when it is new
  const cellCost = (x: number, y: number): number => {
    const i = y * w + x;
    const owner = g.owner[i]!;
    let c = owner === EMPTY ? 1 : 0.45;
    if (o.noise) c += o.noise[i]!;
    if (owner === EMPTY) {
      for (const [dx, dy] of DIRS) {
        const n = g.at(x + dx, y + dy);
        if (n === EMPTY || n === fromOwner || n === toOwner) continue;
        if (o.isBlocked(n)) c += 5;
        else if (o.isPassage(n)) c += 1.5;
      }
    }
    return c;
  };
  const dist = new Float64Array(w * g.h * 4).fill(Infinity);
  const prev = new Int32Array(w * g.h * 4).fill(-1);
  const heap = new Heap();
  for (const c of fromCells) {
    const x = c % w;
    const y = (c - x) / w;
    DIRS.forEach(([dx, dy], d) => {
      const nx = x + dx;
      const ny = y + dy;
      if (!open(nx, ny)) return;
      const s = ((ny * w + nx) << 2) | d;
      const cost = cellCost(nx, ny);
      if (cost < dist[s]!) {
        dist[s] = cost;
        heap.push(cost, s);
      }
    });
  }
  let end = -1;
  for (;;) {
    const top = heap.pop();
    if (!top) break;
    const [cost, s] = top;
    if (cost > dist[s]!) continue;
    const cell = s >> 2;
    if (targets.has(cell)) {
      end = s;
      break;
    }
    const d = s & 3;
    const x = cell % w;
    const y = (cell - x) / w;
    DIRS.forEach(([dx, dy], nd) => {
      if ((nd + 2) % 4 === d) return;
      const nx = x + dx;
      const ny = y + dy;
      if (!open(nx, ny)) return;
      const ns = ((ny * w + nx) << 2) | nd;
      const nc = cost + cellCost(nx, ny) + (nd === d ? 0 : turnCost);
      if (nc < dist[ns]!) {
        dist[ns] = nc;
        prev[ns] = s;
        heap.push(nc, ns);
      }
    });
  }
  if (end < 0) return undefined;
  const path: number[] = [];
  for (let s = end; s >= 0; s = prev[s]!) path.push(s >> 2);
  return path.reverse();
}

/** Value noise for winding passages: a smooth field of 0..amp, from the rng. */
export function noiseField(rng: Rng, w: number, h: number, amp: number): Float32Array {
  const out = new Float32Array(w * h);
  if (amp <= 0) return out;
  const step = 4;
  const gw = Math.ceil(w / step) + 2;
  const gh = Math.ceil(h / step) + 2;
  const lattice = new Float32Array(gw * gh);
  for (let i = 0; i < lattice.length; i++) lattice[i] = rng.next();
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const fx = x / step;
      const fy = y / step;
      const ix = Math.floor(fx);
      const iy = Math.floor(fy);
      const tx = fx - ix;
      const ty = fy - iy;
      const v00 = lattice[iy * gw + ix]!;
      const v10 = lattice[iy * gw + ix + 1]!;
      const v01 = lattice[(iy + 1) * gw + ix]!;
      const v11 = lattice[(iy + 1) * gw + ix + 1]!;
      const top = v00 + (v10 - v00) * tx;
      const bot = v01 + (v11 - v01) * tx;
      out[y * w + x] = (top + (bot - top) * ty) * amp;
    }
  return out;
}
