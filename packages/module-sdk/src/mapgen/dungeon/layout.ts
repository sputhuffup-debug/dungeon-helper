/**
 * Floor plans: each archetype draws one level of rooms and passages on a
 * cell grid and says which zones are joined (links) and how the joins hang
 * together (the spanning tree every room is reached by, and the loops).
 *
 * - halls (crypt or tomb): a processional passage with tombs in mirrored
 *   pairs, an antechamber at the foot and the burial chamber at the head,
 *   inner tombs behind the side rooms;
 * - caverns: irregular chambers joined by winding open passages;
 * - keep: a rectangular block cut into rooms either side of a central hall,
 *   a tower at each corner, the gatehouse on the front;
 * - channels (sewer or aqueduct): a long water channel in sections with
 *   chambers and side tunnels off it, an outfall at one end;
 * - nave (temple): a long nave with the sanctum at its head, the narthex at
 *   its foot and chapels down both sides;
 * - tunnels (mine): small workings strung along long, winding drifts.
 */
import type { Rng } from "../../types";
import type { DungeonArchetype, DungeonLinkKind } from "../types";
import { EMPTY, Grid, carvePath, connected, contacts, edgeBetween, fillHoles, hasHole, noiseField, type UnitEdge } from "./grid";

export type ZoneRole = "entrance" | "lair" | "tower" | "nave" | "channel" | "spine";

export interface DraftZone {
  kind: "room" | "corridor" | "exterior";
  role?: ZoneRole | undefined;
  /** 0 = the level with the way in. */
  level: number;
}

export interface DraftLink {
  a: number;
  b: number;
  edge?: UnitEdge | undefined;
  /** On the spanning tree (the way to every room); loops are free to be blocked or hidden. */
  tree: boolean;
  /** A kind the archetype fixes (a portcullis on the gate, open water between channel sections). */
  kind?: DungeonLinkKind | undefined;
}

export interface LevelDraft {
  level: number;
  grid: Grid;
  zones: Map<number, DraftZone>;
  links: DraftLink[];
  /** The zone the level is entered at: the entrance room, or where the stairs arrive. */
  entrance: number;
  /** The ground outside the way in (first level only). */
  outside?: number | undefined;
  /** A room the archetype means as the lair (the burial chamber, the sanctum). */
  lairHint?: number | undefined;
}

export interface ArchetypeOptions {
  rooms: number;
  level: number;
  /** Shared by every level of one dungeon (a keep's footprint). */
  shape: Record<string, number>;
  alloc: () => number;
}

const between = (rng: Rng, lo: number, hi: number) => rng.int(Math.min(lo, hi), Math.max(lo, hi));
const shuffle = <T>(rng: Rng, list: T[]): T[] => {
  const a = list.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = rng.int(0, i);
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
};

/** A level being drawn: the grid, its zones and the links between them. */
export class LevelBuilder {
  readonly grid: Grid;
  readonly zones = new Map<number, DraftZone>();
  readonly links: DraftLink[] = [];
  constructor(
    readonly level: number,
    w: number,
    h: number,
    private readonly alloc: () => number,
  ) {
    this.grid = new Grid(w, h);
  }

  zone(kind: DraftZone["kind"], role?: ZoneRole): number {
    const id = this.alloc();
    this.zones.set(id, { kind, level: this.level, ...(role ? { role } : {}) });
    return id;
  }

  rect(x: number, y: number, w: number, h: number, kind: DraftZone["kind"] = "room", role?: ZoneRole): number {
    const id = this.zone(kind, role);
    this.grid.fill(x, y, w, h, id);
    return id;
  }

  cells(cells: number[], kind: DraftZone["kind"] = "room", role?: ZoneRole): number {
    const id = this.zone(kind, role);
    for (const c of cells) this.grid.owner[c] = id;
    return id;
  }

  isRoom = (owner: number): boolean => this.zones.get(owner)?.kind !== "corridor";
  isPassage = (owner: number): boolean => this.zones.get(owner)?.kind === "corridor";

  link(a: number, b: number, tree: boolean, edge?: UnitEdge, kind?: DungeonLinkKind): void {
    if (a === b) return;
    this.links.push({ a, b, tree, ...(edge ? { edge } : {}), ...(kind ? { kind } : {}) });
  }

  /** Join two zones that share a wall, at a unit edge near the middle of their contact. */
  linkAdjacent(rng: Rng, a: number, b: number, tree: boolean, kind?: DungeonLinkKind): boolean {
    const edges = sharedEdges(this.grid, a, b);
    if (edges.length === 0) return false;
    const mid = Math.floor(edges.length / 2);
    const spread = Math.max(0, Math.floor((edges.length - 1) / 3));
    this.link(a, b, tree, edges[Math.min(edges.length - 1, Math.max(0, mid + rng.int(-spread, spread)))]!, kind);
    return true;
  }

  /** Carve a passage from zone `a` to zone `b`; new cells become passage zones. False when no way exists. */
  carve(a: number, b: number, tree: boolean, opts: { noise?: Float32Array | undefined; turn?: number } = {}): boolean {
    const g = this.grid;
    const from = g.cellsOf(a);
    const to = new Set(g.cellsOf(b));
    if (from.length === 0 || to.size === 0) return false;
    const path = carvePath(g, from, to, { isBlocked: (o) => o !== a && o !== b && this.isRoom(o), isPassage: this.isPassage, noise: opts.noise, turn: opts.turn ?? 0.6 });
    if (!path) return false;
    const w = g.w;
    const owners: number[] = [];
    let run = -1;
    for (const c of path) {
      const o = g.owner[c]!;
      if (o === EMPTY) {
        if (run < 0) run = this.zone("corridor");
        g.owner[c] = run;
        owners.push(run);
      } else {
        run = -1;
        owners.push(o);
      }
    }
    const xy = (c: number): [number, number] => [c % w, Math.floor(c / w)];
    const touching = (c: number, zone: number): UnitEdge | undefined => {
      const [x, y] = xy(c);
      for (const [dx, dy] of [
        [0, -1],
        [1, 0],
        [0, 1],
        [-1, 0],
      ] as const)
        if (g.at(x + dx, y + dy) === zone) return edgeBetween(x, y, x + dx, y + dy);
      return undefined;
    };
    this.link(a, owners[0]!, tree, touching(path[0]!, a));
    for (let i = 0; i + 1 < path.length; i++) {
      if (owners[i] === owners[i + 1]) continue;
      const [x1, y1] = xy(path[i]!);
      const [x2, y2] = xy(path[i + 1]!);
      this.link(owners[i]!, owners[i + 1]!, tree, edgeBetween(x1, y1, x2, y2));
    }
    this.link(owners[owners.length - 1]!, b, tree, touching(path[path.length - 1]!, b));
    return true;
  }

  /** Merge passages joined end to end into longer ones (no hole, at most `cap` cells), so a corridor is one zone. */
  mergePassages(cap: number): void {
    const g = this.grid;
    const size = new Map<number, number>();
    for (const [o, cells] of g.cellsByOwner()) size.set(o, cells.length);
    for (const l of [...this.links]) {
      if (!this.isPassage(l.a) || !this.isPassage(l.b) || l.a === l.b || l.kind) continue;
      if (this.zones.get(l.a)?.role || this.zones.get(l.b)?.role) continue;
      const sa = size.get(l.a) ?? 0;
      const sb = size.get(l.b) ?? 0;
      if (sa + sb > cap) continue;
      const union = [...g.cellsOf(l.a), ...g.cellsOf(l.b)];
      if (hasHole(union, g.w)) continue;
      const [keep, gone] = [l.a, l.b];
      g.relabel(gone, keep);
      this.zones.delete(gone);
      size.set(keep, sa + sb);
      size.delete(gone);
      for (const x of this.links) {
        if (x.a === gone) x.a = keep;
        if (x.b === gone) x.b = keep;
      }
    }
    this.dedupeLinks();
  }

  /** One link per pair of zones (the first, on the tree if any of them was); none from a zone to itself. */
  dedupeLinks(): void {
    const seen = new Map<string, DraftLink>();
    const out: DraftLink[] = [];
    for (const l of this.links) {
      if (l.a === l.b) continue;
      const k = l.a < l.b ? `${l.a}|${l.b}` : `${l.b}|${l.a}`;
      const prev = seen.get(k);
      if (prev) {
        prev.tree ||= l.tree;
        continue;
      }
      seen.set(k, l);
      out.push(l);
    }
    this.links.splice(0, this.links.length, ...out);
  }

  /** Every zone one connected piece without holes, and every link edge between its two zones. */
  sound(): boolean {
    const g = this.grid;
    const byOwner = g.cellsByOwner();
    for (const id of this.zones.keys()) {
      const cells = byOwner.get(id);
      if (!cells || !connected(cells, g.w) || hasHole(cells, g.w)) return false;
    }
    for (const l of this.links) {
      if (!l.edge) continue;
      const { x, y, side } = l.edge;
      const o1 = g.at(x, y);
      const o2 = side === "e" ? g.at(x + 1, y) : g.at(x, y + 1);
      if (!((o1 === l.a && o2 === l.b) || (o1 === l.b && o2 === l.a))) return false;
    }
    return true;
  }

  build(entrance: number, extra: Partial<LevelDraft> = {}): LevelDraft {
    return { level: this.level, grid: this.grid, zones: this.zones, links: this.links, entrance, ...extra };
  }
}

/** The unit edges two zones share, in scan order. */
export function sharedEdges(g: Grid, a: number, b: number): UnitEdge[] {
  const out: UnitEdge[] = [];
  for (let y = 0; y < g.h; y++)
    for (let x = 0; x < g.w; x++) {
      const o = g.at(x, y);
      if (o !== a && o !== b) continue;
      const e = g.at(x + 1, y);
      if ((o === a && e === b) || (o === b && e === a)) out.push({ x, y, side: "e" });
      const s = g.at(x, y + 1);
      if ((o === a && s === b) || (o === b && s === a)) out.push({ x, y, side: "s" });
    }
  // along the wall: one run, sorted by position
  return out.sort((p, q) => (p.side === q.side ? (p.side === "e" ? p.x - q.x || p.y - q.y : p.y - q.y || p.x - q.x) : p.side === "e" ? -1 : 1));
}

/** Room centres for spanning trees. */
function centres(g: Grid, ids: number[]): Map<number, [number, number]> {
  const out = new Map<number, [number, number]>();
  const byOwner = g.cellsByOwner();
  for (const id of ids) {
    const cells = byOwner.get(id) ?? [];
    let sx = 0;
    let sy = 0;
    for (const c of cells) {
      sx += c % g.w;
      sy += Math.floor(c / g.w);
    }
    out.set(id, [sx / Math.max(1, cells.length), sy / Math.max(1, cells.length)]);
  }
  return out;
}

/** Minimum spanning tree over room centres (Prim), then extra edges for loops. */
function spanningPairs(rng: Rng, ids: number[], at: Map<number, [number, number]>, loops: number): Array<{ a: number; b: number; tree: boolean }> {
  if (ids.length < 2) return [];
  const d = (a: number, b: number) => Math.hypot(at.get(a)![0] - at.get(b)![0], at.get(a)![1] - at.get(b)![1]);
  const inTree = new Set([ids[0]!]);
  const out: Array<{ a: number; b: number; tree: boolean }> = [];
  while (inTree.size < ids.length) {
    let best: [number, number, number] | undefined;
    for (const a of inTree) for (const b of ids) if (!inTree.has(b) && (!best || d(a, b) < best[2])) best = [a, b, d(a, b)];
    out.push({ a: best![0], b: best![1], tree: true });
    inTree.add(best![1]);
  }
  const has = (a: number, b: number) => out.some((p) => (p.a === a && p.b === b) || (p.a === b && p.b === a));
  for (const a of ids) {
    if (rng.next() >= loops) continue;
    const near = ids.filter((b) => b !== a && !has(a, b)).sort((x, y) => d(a, x) - d(a, y))[0];
    if (near !== undefined) out.push({ a, b: near, tree: false });
  }
  return out.sort((p, q) => Number(q.tree) - Number(p.tree) || d(p.a, p.b) - d(q.a, q.b));
}

/** An irregular chamber: overlapping blocks inside a w×h box, holes filled. */
function blobCells(rng: Rng, x0: number, y0: number, w: number, h: number, gw: number, gh: number): number[] {
  const set = new Set<number>();
  const core = { w: Math.max(2, Math.round(w * 0.6)), h: Math.max(2, Math.round(h * 0.6)) };
  const cx = x0 + Math.floor((w - core.w) / 2);
  const cy = y0 + Math.floor((h - core.h) / 2);
  const add = (x: number, y: number, bw: number, bh: number) => {
    for (let yy = y; yy < y + bh; yy++) for (let xx = x; xx < x + bw; xx++) if (xx >= x0 && yy >= y0 && xx < x0 + w && yy < y0 + h) set.add(yy * gw + xx);
  };
  add(cx, cy, core.w, core.h);
  const lobes = rng.int(2, 4);
  for (let i = 0; i < lobes; i++) {
    const bw = between(rng, 2, Math.max(2, Math.round(w * 0.6)));
    const bh = between(rng, 2, Math.max(2, Math.round(h * 0.6)));
    // each lobe overlaps the core, so the chamber stays one piece
    const lx = between(rng, Math.max(x0, cx - bw + 1), Math.min(x0 + w - bw, cx + core.w - 1));
    const ly = between(rng, Math.max(y0, cy - bh + 1), Math.min(y0 + h - bh, cy + core.h - 1));
    add(lx, ly, bw, bh);
  }
  fillHoles(set, gw, gh);
  return [...set].sort((a, b) => a - b);
}

/** Corner touches inside one zone make outlines pinch: fill the gap so the outline stays simple. */
function smoothPinches(g: Grid, id: number): void {
  for (let y = 0; y + 1 < g.h; y++)
    for (let x = 0; x + 1 < g.w; x++) {
      const a = g.at(x, y) === id;
      const b = g.at(x + 1, y) === id;
      const c = g.at(x, y + 1) === id;
      const d = g.at(x + 1, y + 1) === id;
      if (a && d && !b && !c) {
        if (g.at(x + 1, y) === EMPTY) g.set(x + 1, y, id);
        else if (g.at(x, y + 1) === EMPTY) g.set(x, y + 1, id);
      } else if (b && c && !a && !d) {
        if (g.at(x, y) === EMPTY) g.set(x, y, id);
        else if (g.at(x + 1, y + 1) === EMPTY) g.set(x + 1, y + 1, id);
      }
    }
}

interface ScatterParams {
  roomW: [number, number];
  roomH: [number, number];
  lair: [number, number];
  blob: boolean;
  aspect: number;
  loops: number;
  wiggle: number;
  spacing: number;
  passageCap: number;
}

const SCATTER: Record<"caverns" | "tunnels", ScatterParams> = {
  caverns: { roomW: [4, 8], roomH: [4, 7], lair: [8, 10], blob: true, aspect: 1.25, loops: 0.3, wiggle: 2.4, spacing: 2, passageCap: 16 },
  tunnels: { roomW: [3, 5], roomH: [3, 4], lair: [6, 7], blob: false, aspect: 2.2, loops: 0.12, wiggle: 1.6, spacing: 3, passageCap: 14 },
};

/** Rooms scattered over an area and joined by carved passages (caverns, mine workings); a crowded try gets more room. */
function scatterLevel(rng: Rng, o: ArchetypeOptions, p: ScatterParams): LevelDraft | undefined {
  for (const grow of [1, 1.35, 1.8]) {
    const d = scatterTry(rng.fork(`grow-${grow}`), o, p, grow);
    if (d) return d;
  }
  return undefined;
}

function scatterTry(rng: Rng, o: ArchetypeOptions, p: ScatterParams, grow: number): LevelDraft | undefined {
  const avg = ((p.roomW[0] + p.roomW[1]) / 2) * ((p.roomH[0] + p.roomH[1]) / 2);
  const area = Math.max(260, o.rooms * avg * 4.2 + p.lair[1] * p.lair[1]) * grow;
  const aw = Math.ceil(Math.sqrt(area * p.aspect));
  const ah = Math.ceil(area / aw);
  const pad = 3;
  const out = o.level === 0 ? 7 : 0;
  const b = new LevelBuilder(o.level, aw + pad * 2, ah + pad * 2 + out, o.alloc);
  const g = b.grid;
  const placed: number[] = [];
  const fits = (x: number, y: number, w: number, h: number) => g.free(x - p.spacing, y - p.spacing, w + p.spacing * 2, h + p.spacing * 2);
  const place = (w: number, h: number, yLo: number, yHi: number, role?: ZoneRole): number | undefined => {
    for (let t = 0; t < 120; t++) {
      const x = between(rng, pad, pad + aw - w);
      const y = between(rng, Math.max(pad, yLo), Math.max(pad, Math.min(pad + ah - h, yHi - h)));
      if (!fits(x, y, w, h)) continue;
      if (p.blob) {
        const cells = blobCells(rng, x, y, w, h, g.w, g.h);
        const id = b.cells(cells, "room", role);
        smoothPinches(g, id);
        return id;
      }
      return b.rect(x, y, w, h, "room", role);
    }
    return undefined;
  };
  // the lair in the far third, the way in at the near edge, the rest anywhere
  const lairW = between(rng, p.lair[0], p.lair[1]);
  const lairH = between(rng, p.lair[0] - 1, p.lair[1] - 1);
  const lair = place(lairW, lairH, pad, pad + Math.ceil(ah / 3) + lairH, "lair");
  if (lair === undefined) return undefined;
  placed.push(lair);
  const entranceW = between(rng, p.roomW[0], p.roomW[1]);
  const entranceH = between(rng, p.roomH[0], p.roomH[1]);
  const entrance = place(entranceW, entranceH, pad + Math.floor((ah * 2) / 3) - entranceH, pad + ah, o.level === 0 ? "entrance" : undefined);
  if (entrance === undefined) return undefined;
  placed.push(entrance);
  for (let i = placed.length; i < o.rooms; i++) {
    const id = place(between(rng, p.roomW[0], p.roomW[1]), between(rng, p.roomH[0], p.roomH[1]), pad, pad + ah);
    if (id !== undefined) placed.push(id);
  }
  if (placed.length < Math.max(3, Math.ceil(o.rooms * 0.8))) return undefined;
  const noise = noiseField(rng, g.w, g.h, p.wiggle);
  for (const pair of spanningPairs(rng, placed, centres(g, placed), p.loops)) {
    if (!b.carve(pair.a, pair.b, pair.tree, { noise }) && pair.tree) return undefined;
  }
  let outside: number | undefined;
  if (o.level === 0) {
    outside = addOutside(b, rng, entrance, pad + ah + 2, noise);
    if (outside === undefined) return undefined;
  }
  b.mergePassages(p.passageCap);
  if (!b.sound()) return undefined;
  return b.build(entrance, { outside, lairHint: lair });
}

/** The ground outside the way in: a strip below the map, joined to the entrance by a passage. */
function addOutside(b: LevelBuilder, rng: Rng, entrance: number, y: number, noise?: Float32Array): number | undefined {
  const g = b.grid;
  const cells = g.cellsOf(entrance);
  const xs = cells.map((c) => c % g.w);
  const cx = Math.round((Math.min(...xs) + Math.max(...xs)) / 2);
  const w = 7;
  const x = Math.max(1, Math.min(g.w - w - 1, cx - Math.floor(w / 2)));
  const h = Math.min(3, g.h - y - 1);
  if (h < 2 || !g.free(x, y, w, h)) return undefined;
  const id = b.rect(x, y, w, h, "exterior");
  if (!b.carve(id, entrance, true, { noise })) return undefined;
  void rng;
  return id;
}

/** A crypt: the processional passage, mirrored tombs, the burial chamber at the head. */
function hallsLevel(rng: Rng, o: ArchetypeOptions): LevelDraft | undefined {
  const pairs = Math.max(1, Math.min(6, Math.floor((o.rooms - 2) / 2.6)));
  const extras = Math.max(0, o.rooms - 2 - pairs * 2);
  const sizes = Array.from({ length: pairs }, () => ({ w: between(rng, 3, 5), h: between(rng, 3, 4), gap: rng.int(0, 1) }));
  // a transept: the middle pair reaches further out
  if (pairs >= 3) sizes[Math.floor(pairs / 2)]!.w += 2;
  const lairW = 2 * between(rng, 2, 3) + 1;
  const lairH = between(rng, 4, 6);
  const spine = sizes.reduce((s, r) => s + r.h + r.gap, 0) + 1;
  const reach = Math.max(...sizes.map((r) => r.w)) + 5;
  const W = 2 * Math.max(reach, Math.ceil(lairW / 2) + 1) + 1 + 8;
  const H = lairH + spine + 3 + (o.level === 0 ? 8 : 2) + 6;
  const b = new LevelBuilder(o.level, W, H, o.alloc);
  const g = b.grid;
  const cx = Math.floor(W / 2);
  const top = 3;
  const lair = b.rect(cx - Math.floor(lairW / 2), top, lairW, lairH, "room", "lair");
  const spineTop = top + lairH;
  const hall = b.rect(cx, spineTop, 1, spine, "corridor", "spine");
  b.linkAdjacent(rng, lair, hall, true);
  let y = spineTop + 1;
  const sideRooms: Array<{ id: number; side: -1 | 1; x0: number; x1: number; y0: number; y1: number }> = [];
  for (const r of sizes) {
    const left = b.rect(cx - r.w, y, r.w, r.h);
    const right = b.rect(cx + 1, y, r.w, r.h);
    b.link(left, hall, true, { x: cx - 1, y: y + Math.floor(r.h / 2), side: "e" });
    b.link(hall, right, true, { x: cx, y: y + Math.floor(r.h / 2), side: "e" });
    sideRooms.push({ id: left, side: -1, x0: cx - r.w, x1: cx - 1, y0: y, y1: y + r.h - 1 }, { id: right, side: 1, x0: cx + 1, x1: cx + r.w, y0: y, y1: y + r.h - 1 });
    y += r.h + r.gap;
  }
  const entranceW = 2 * rng.int(1, 2) + 1;
  const entrance = b.rect(cx - Math.floor(entranceW / 2), spineTop + spine, entranceW, 3, "room", o.level === 0 ? "entrance" : undefined);
  b.linkAdjacent(rng, hall, entrance, true);
  // inner tombs behind the side rooms, in mirrored pairs where both sides have room
  let left = extras;
  for (const r of shuffle(rng, sideRooms.filter((s) => s.side === -1))) {
    if (left <= 0) break;
    const twin = sideRooms.find((s) => s.side === 1 && s.y0 === r.y0)!;
    const w = between(rng, 2, 3);
    const h = Math.min(r.y1 - r.y0 + 1, between(rng, 2, 3));
    const yy = r.y0 + Math.floor((r.y1 - r.y0 + 1 - h) / 2);
    for (const s of left >= 2 ? [r, twin] : [r]) {
      const x = s.side === -1 ? s.x0 - w : s.x1 + 1;
      if (!g.free(x, yy, w, h)) continue;
      const id = b.rect(x, yy, w, h);
      b.linkAdjacent(rng, id, s.id, true);
      left--;
    }
  }
  // the burial chamber's own side tombs, when rooms are still owed
  for (const side of [-1, 1] as const) {
    if (left <= 0) break;
    const w = between(rng, 2, 3);
    const h = Math.min(lairH - 1, 3);
    const x = side === -1 ? cx - Math.floor(lairW / 2) - w : cx + Math.floor(lairW / 2) + 1;
    if (!g.free(x, top + 1, w, h)) continue;
    const id = b.rect(x, top + 1, w, h);
    b.linkAdjacent(rng, id, lair, true);
    left--;
  }
  let outside: number | undefined;
  if (o.level === 0) {
    const ey = spineTop + spine + 3;
    const ow = 7;
    outside = b.rect(cx - Math.floor(ow / 2), ey, ow, 3, "exterior");
    b.linkAdjacent(rng, entrance, outside, true);
  }
  if (!b.sound()) return undefined;
  return b.build(entrance, { outside, lairHint: lair });
}

/** Split a rectangle into rooms (binary space partition). */
function bsp(rng: Rng, x: number, y: number, w: number, h: number, maxArea: number, minSide: number): Array<[number, number, number, number]> {
  if (w * h <= maxArea || (w < minSide * 2 && h < minSide * 2)) return [[x, y, w, h]];
  const vertical = w >= minSide * 2 && (h < minSide * 2 || w > h || (w === h && rng.next() < 0.5));
  if (vertical) {
    const cut = between(rng, minSide, w - minSide);
    return [...bsp(rng, x, y, cut, h, maxArea, minSide), ...bsp(rng, x + cut, y, w - cut, h, maxArea, minSide)];
  }
  const cut = between(rng, minSide, h - minSide);
  return [...bsp(rng, x, y, w, cut, maxArea, minSide), ...bsp(rng, x, y + cut, w, h - cut, maxArea, minSide)];
}

/** Rooms joined to a hub (or each other) through shared walls: tree links first, then loops. */
function joinByWalls(b: LevelBuilder, rng: Rng, hubs: number[], rooms: number[], loops: number): boolean {
  const g = b.grid;
  const touch = contacts(g);
  const near = (a: number) => [...touch.values()].filter((c) => c.a === a || c.b === a).map((c) => (c.a === a ? c.b : c.a));
  const reached = new Set(hubs);
  const queue = [...hubs];
  while (queue.length) {
    const cur = queue.shift()!;
    for (const n of shuffle(rng, near(cur))) {
      if (reached.has(n) || !rooms.includes(n)) continue;
      reached.add(n);
      b.linkAdjacent(rng, cur, n, true);
      queue.push(n);
    }
  }
  if (rooms.some((r) => !reached.has(r))) return false;
  for (const c of touch.values()) {
    if (!rooms.includes(c.a) || !rooms.includes(c.b)) continue;
    if (b.links.some((l) => (l.a === c.a && l.b === c.b) || (l.a === c.b && l.b === c.a))) continue;
    if (rng.next() < loops) b.linkAdjacent(rng, c.a, c.b, false);
  }
  return true;
}

/** A keep: rooms either side of a central hall, corner towers, the gatehouse on the front. */
function keepLevel(rng: Rng, o: ArchetypeOptions): LevelDraft | undefined {
  // the footprint is the keep's on every floor
  const cells = Math.max(120, o.rooms * 22);
  const W = (o.shape.W ??= Math.max(12, Math.round(Math.sqrt(cells * 1.3))));
  const H = (o.shape.H ??= Math.max(10, Math.round(cells / W)));
  const t = (o.shape.tower ??= rng.int(3, 4));
  const ox = t + 2;
  const oy = t + 2;
  const b = new LevelBuilder(o.level, W + 2 * ox, H + 2 * oy + (o.level === 0 ? 5 : 0), o.alloc);
  const g = b.grid;
  const hy = oy + Math.floor(H / 2);
  const hall = b.rect(ox + 1, hy, W - 2, 1, "corridor", "spine");
  const maxArea = Math.max(12, Math.round((W * H) / Math.max(3, o.rooms - 4)));
  const leaves = [...bsp(rng, ox, oy, W, hy - oy, maxArea, 3), ...bsp(rng, ox, hy + 1, W, oy + H - hy - 1, maxArea, 3)];
  const rooms = leaves.map(([x, y, w, h]) => b.rect(x, y, w, h));
  // the hall's ends are walled by the rooms at either end of the row
  g.fill(ox, hy, 1, 1, rooms.find((r) => g.at(ox, hy - 1) === r) ?? rooms[0]!);
  g.fill(ox + W - 1, hy, 1, 1, rooms.find((r) => g.at(ox + W - 1, hy - 1) === r) ?? rooms[0]!);
  // towers at the corners, each taking the corner cell of its room
  const towers: number[] = [];
  for (const [cx, cy, dx, dy] of [
    [ox, oy, -1, -1],
    [ox + W - 1, oy, 1, -1],
    [ox, oy + H - 1, -1, 1],
    [ox + W - 1, oy + H - 1, 1, 1],
  ] as const) {
    const corner = g.at(cx, cy);
    const x0 = dx < 0 ? cx - t + 1 : cx;
    const y0 = dy < 0 ? cy - t + 1 : cy;
    const id = b.zone("room", "tower");
    for (let y = y0; y < y0 + t; y++) for (let x = x0; x < x0 + t; x++) g.set(x, y, id);
    towers.push(id);
    if (g.cellsOf(corner).length === 0) return undefined;
  }
  const hubRooms = rooms.filter((r) => sharedEdges(g, r, hall).length > 0);
  for (const r of hubRooms) b.linkAdjacent(rng, r, hall, true);
  if (!joinByWalls(b, rng, hubRooms, [...rooms, ...towers], 0.2)) return undefined;
  let entrance: number;
  let outside: number | undefined;
  if (o.level === 0) {
    // the gatehouse: the front room nearest the middle; the bailey outside it, through a portcullis
    const front = rooms.filter((r) => g.cellsOf(r).some((c) => Math.floor(c / g.w) === oy + H - 1));
    const mid = ox + W / 2;
    const dist = (r: number) => Math.abs(g.cellsOf(r).reduce((s, c) => s + (c % g.w), 0) / g.cellsOf(r).length - mid);
    entrance = front.sort((a, c) => dist(a) - dist(c))[0]!;
    b.zones.get(entrance)!.role = "entrance";
    const xs = g.cellsOf(entrance).map((c) => c % g.w);
    const ex0 = Math.min(...xs);
    const ew = Math.max(...xs) - ex0 + 1;
    const bw = Math.min(W - 2 * t, Math.max(5, ew + 4));
    const bx = Math.max(ox + t - 1, Math.min(ox + W - t + 1 - bw, ex0 + Math.floor(ew / 2) - Math.floor(bw / 2)));
    outside = b.rect(bx, oy + H, bw, 4, "exterior");
    if (!b.linkAdjacent(rng, entrance, outside, true, "bars")) return undefined;
  } else {
    entrance = rooms[Math.floor(rng.next() * rooms.length)]!;
  }
  if (!b.sound()) return undefined;
  // the lair: the largest room off the hall
  const lair = rooms.filter((r) => r !== entrance).sort((a, c) => g.cellsOf(c).length - g.cellsOf(a).length)[0];
  return b.build(entrance, { outside, lairHint: lair });
}

/** A temple: the nave, the sanctum at its head, the narthex at its foot, chapels down both sides. */
function naveLevel(rng: Rng, o: ArchetypeOptions): LevelDraft | undefined {
  const side = Math.max(2, Math.ceil((o.rooms - 3) / 2));
  const nw = (o.shape.nave ??= rng.int(3, 5));
  const cw = (o.shape.chapel ??= rng.int(4, 6));
  const H = (o.shape.H ??= Math.max(14, side * 4 + 6));
  const W = nw + 2 * cw;
  const pad = 3;
  const b = new LevelBuilder(o.level, W + 2 * pad, H + 2 * pad + (o.level === 0 ? 5 : 0), o.alloc);
  const g = b.grid;
  const ah = rng.int(3, 4);
  const nh = 3;
  const nx = pad + cw;
  const sanctum = b.rect(nx, pad, nw, ah, "room", "lair");
  const nave = b.rect(nx, pad + ah, nw, H - ah - nh, "room", "nave");
  const narthex = b.rect(pad, pad + H - nh, W, nh, "room", o.level === 0 ? "entrance" : undefined);
  b.linkAdjacent(rng, sanctum, nave, true);
  b.linkAdjacent(rng, nave, narthex, true);
  const chapels: number[] = [];
  const maxArea = Math.max(10, Math.round(((H - nh) * cw) / Math.max(2, side)));
  for (const x of [pad, nx + nw]) for (const [cx, cy, w, h] of bsp(rng, x, pad, cw, H - nh, maxArea, 3)) chapels.push(b.rect(cx, cy, w, h));
  const onNave = chapels.filter((c) => sharedEdges(g, c, nave).length > 0 || sharedEdges(g, c, sanctum).length > 0);
  for (const c of onNave) b.linkAdjacent(rng, c, sharedEdges(g, c, nave).length > 0 ? nave : sanctum, true);
  if (!joinByWalls(b, rng, onNave, chapels, 0.25)) return undefined;
  for (const c of chapels) if (sharedEdges(g, c, narthex).length > 0 && rng.next() < 0.5) b.linkAdjacent(rng, c, narthex, false);
  let outside: number | undefined;
  if (o.level === 0) {
    const fw = Math.max(5, nw + 2);
    outside = b.rect(nx + Math.floor(nw / 2) - Math.floor(fw / 2), pad + H, fw, 4, "exterior");
    b.linkAdjacent(rng, narthex, outside, true);
  }
  if (!b.sound()) return undefined;
  return b.build(narthex, { outside, lairHint: sanctum });
}

/** A sewer: a long channel in sections, chambers and side tunnels off it, the outfall at one end. */
function channelsLevel(rng: Rng, o: ArchetypeOptions): LevelDraft | undefined {
  const W = Math.max(34, o.rooms * 5 + 10);
  const H = 30;
  const b = new LevelBuilder(o.level, W, H, o.alloc);
  const g = b.grid;
  const cy = Math.floor(H / 2) - 1;
  const x0 = o.level === 0 ? 6 : 3;
  const x1 = W - 3;
  // the channel, two squares wide, in sections of six to nine
  const sections: number[] = [];
  for (let x = x0; x < x1; ) {
    const len = Math.min(x1 - x, rng.int(6, 9));
    if (len < 3 && sections.length) {
      g.fill(x, cy, len, 2, sections[sections.length - 1]!);
      break;
    }
    const id = b.rect(x, cy, len, 2, "corridor", "channel");
    if (sections.length) b.link(sections[sections.length - 1]!, id, true, { x: x - 1, y: cy, side: "e" }, "open");
    sections.push(id);
    x += len;
  }
  const rooms: number[] = [];
  const pad = 2;
  for (let i = 0; i < o.rooms * 3 && rooms.length < o.rooms; i++) {
    const w = rng.int(3, 6);
    const h = rng.int(3, 5);
    const above = rooms.length % 2 === 0;
    const x = between(rng, x0 + 1, x1 - w - 1);
    const y = above ? between(rng, pad, cy - h - 2) : between(rng, cy + 4, H - h - pad);
    if (!g.free(x - 2, y - 2, w + 4, h + 4)) continue;
    rooms.push(b.rect(x, y, w, h));
  }
  if (rooms.length < Math.max(3, Math.ceil(o.rooms * 0.8))) return undefined;
  const noise = noiseField(rng, g.w, g.h, 0.5);
  // each chamber joined to the nearest section of the channel, then a few to each other
  const sectionAt = (r: number) => {
    const xs = g.cellsOf(r).map((c) => c % g.w);
    const mx = (Math.min(...xs) + Math.max(...xs)) / 2;
    return sections.slice().sort((a, c) => Math.abs(meanX(g, a) - mx) - Math.abs(meanX(g, c) - mx))[0]!;
  };
  for (const r of rooms) if (!b.carve(r, sectionAt(r), true, { noise, turn: 1.2 })) return undefined;
  const at = centres(g, rooms);
  for (const pair of spanningPairs(rng, rooms, at, 0.25)) if (!pair.tree && rng.next() < 0.5) b.carve(pair.a, pair.b, false, { noise, turn: 1.2 });
  let outside: number | undefined;
  let entrance = sections[0]!;
  if (o.level === 0) {
    outside = b.rect(1, cy - 1, x0 - 1, 4, "exterior");
    b.link(outside, sections[0]!, true, { x: x0 - 1, y: cy, side: "e" }, "bars");
    // the way in opens into the first chamber reached from the outfall
    entrance = sections[0]!;
  } else {
    entrance = rooms[0]!;
  }
  b.mergePassages(12);
  if (!b.sound()) return undefined;
  // the cistern: the largest chamber
  const lair = rooms.slice().sort((a, c) => g.cellsOf(c).length - g.cellsOf(a).length)[0];
  return b.build(entrance, { outside, lairHint: lair });
}

function meanX(g: Grid, id: number): number {
  const cells = g.cellsOf(id);
  return cells.reduce((s, c) => s + (c % g.w), 0) / Math.max(1, cells.length);
}

/** One level of a dungeon in the archetype's shape, or undefined when this attempt did not fit. */
export function drawLevel(archetype: DungeonArchetype, rng: Rng, o: ArchetypeOptions): LevelDraft | undefined {
  switch (archetype) {
    case "halls":
      return hallsLevel(rng, o);
    case "caverns":
      return scatterLevel(rng, o, SCATTER.caverns);
    case "tunnels":
      return scatterLevel(rng, o, SCATTER.tunnels);
    case "keep":
      return keepLevel(rng, o);
    case "nave":
      return naveLevel(rng, o);
    case "channels":
      return channelsLevel(rng, o);
  }
}

/** Default link weights per archetype (a site type's `links` replaces them). */
export const ARCHETYPE_LINKS: Record<DungeonArchetype, Partial<Record<DungeonLinkKind, number>>> = {
  halls: { door: 6, open: 2, locked: 1.2, secret: 1.2 },
  caverns: { open: 12, rubble: 1, secret: 0.4 },
  keep: { door: 7, open: 2, locked: 1.5, secret: 0.6 },
  channels: { open: 6, bars: 2, door: 1, locked: 0.6, rubble: 0.6 },
  nave: { open: 6, door: 2, rubble: 1.4, secret: 0.6, locked: 0.6 },
  tunnels: { open: 9, door: 1.2, rubble: 1.2, locked: 0.3, secret: 0.3 },
};

/** Underground archetypes go down level by level; a keep goes up. */
export const GOES_UP: ReadonlySet<DungeonArchetype> = new Set(["keep"]);
