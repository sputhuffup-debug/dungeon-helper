/**
 * Duct sheets for the site map generator. Every floor deck with ducts gets its
 * own crawlspace level (a "duct sheet"): a maze on its own 1 m grid, loosely
 * placed and not a copy of the rooms below it.
 *
 * - The maze grows a random tree over a lattice with irregular spacing, then
 *   adds a few loops. Lattice points become node zones (junctions where three
 *   or four runs meet, bends, dead ends and the odd larger vent chamber);
 *   straight lines between them become runs, 1 m wide and split at 25 m or less.
 * - Exits (access points) are scattered over the maze at random, so where an
 *   exit sits on the sheet says nothing about where its room is on the deck.
 *   An exit zone takes its floor zone's id plus "d" (`Z07d`) and carries an
 *   `exitTo` label; maze zones are numbered `D01`, `D02`, ... across sheets.
 * - Each deck gets a sheet over it; the bottom deck may also get a crawlspace
 *   under it on normal and dense maps. Shafts between sheets are added by the
 *   borders stage.
 */
import type { MapDeck, MapPoint, MapZoneData, Rng } from "@campaign-forge/module-sdk";
import { MAX_ZONE_M, type SiteProfile } from "./data";
import type { MapInputs } from "./inputs";
import type { Plan, PlanNode } from "./plan";

export type DuctRole = "upper" | "lower";
export type DuctShape = "run" | "junction" | "bend" | "dead-end" | "chamber";

export const DUCT_SHAPE_LABELS: Record<DuctShape, string> = {
  run: "Duct run",
  junction: "Duct junction",
  bend: "Duct bend",
  "dead-end": "Duct dead end",
  chamber: "Vent chamber",
};

export interface DuctExit {
  /** Duct zone id (`Z07d`). */
  duct: string;
  /** Floor zone id it opens into. */
  floor: string;
  /** The label: a room's name, or a spot such as "Corridor B, near Galley". */
  name: string;
}

export interface DuctSheet {
  deck: MapDeck;
  role: DuctRole;
  /** Floor deck index and id it serves. */
  deckIndex: number;
  serves: string;
  /** Duct zone ids on this sheet. */
  zones: string[];
  exits: DuctExit[];
}

/** Two duct zones on one sheet that share an edge. */
export interface DuctLink {
  a: string;
  b: string;
  seg: [MapPoint, MapPoint];
}

export interface DuctLayout {
  sheets: DuctSheet[];
  zones: MapZoneData[];
  links: DuctLink[];
}

/** Duct zones per sheet: [low, high] by map size (module decision). */
const SHEET_ZONES: Record<MapInputs["size"], [number, number]> = { small: [8, 11], medium: [10, 14], large: [13, 18] };
export const DUCT_SHEET_MIN = 8;
export const DUCT_SHEET_MAX = 20;
/** Exits one sheet can carry (module decision; extra access rooms go to another sheet or are dropped). */
const MAX_EXITS = 7;

type Dir = "L" | "R" | "U" | "D";

interface Maze {
  C: number;
  R: number;
  xs: number[];
  ys: number[];
  used: Set<number>;
  adj: Map<number, Set<number>>;
}

const pointOf = (m: Maze, p: number) => ({ i: p % m.C, j: Math.floor(p / m.C) });
const at = (m: Maze, i: number, j: number) => j * m.C + i;

function latticeNbr(m: Maze, p: number, dir: Dir): number | undefined {
  const { i, j } = pointOf(m, p);
  if (dir === "L") return i > 0 ? at(m, i - 1, j) : undefined;
  if (dir === "R") return i + 1 < m.C ? at(m, i + 1, j) : undefined;
  if (dir === "U") return j > 0 ? at(m, i, j - 1) : undefined;
  return j + 1 < m.R ? at(m, i, j + 1) : undefined;
}

const DIRS: Dir[] = ["L", "R", "U", "D"];

function dirsOf(m: Maze, p: number): Dir[] {
  const set = m.adj.get(p) ?? new Set<number>();
  return DIRS.filter((d) => {
    const n = latticeNbr(m, p, d);
    return n !== undefined && set.has(n);
  });
}

function link(m: Maze, a: number, b: number): void {
  if (!m.adj.has(a)) m.adj.set(a, new Set());
  if (!m.adj.has(b)) m.adj.set(b, new Set());
  m.adj.get(a)!.add(b);
  m.adj.get(b)!.add(a);
  m.used.add(a);
  m.used.add(b);
}

function unlinkLeaf(m: Maze, p: number): void {
  for (const n of m.adj.get(p) ?? []) m.adj.get(n)?.delete(p);
  m.adj.delete(p);
  m.used.delete(p);
}

/** Through points (two runs in a straight line) are part of a run, not zones of their own. */
function isThrough(m: Maze, p: number, forced: ReadonlySet<number>): boolean {
  if (forced.has(p)) return false;
  const d = dirsOf(m, p);
  return d.length === 2 && ((d.includes("L") && d.includes("R")) || (d.includes("U") && d.includes("D")));
}

function shapeOf(m: Maze, p: number, forced: ReadonlySet<number>, chambers: ReadonlySet<number>): DuctShape {
  if (chambers.has(p)) return "chamber";
  const d = dirsOf(m, p);
  if (d.length >= 3) return "junction";
  if (d.length <= 1) return "dead-end";
  if (forced.has(p) && isThrough(m, p, new Set())) return "run";
  return "bend";
}

interface ChainPlan {
  from: number;
  to: number;
  dir: "R" | "D";
  through: number[];
}

function chains(m: Maze, forced: ReadonlySet<number>): ChainPlan[] {
  const out: ChainPlan[] = [];
  for (const p of [...m.used].sort((a, b) => a - b)) {
    if (isThrough(m, p, forced)) continue;
    for (const dir of ["R", "D"] as const) {
      const through: number[] = [];
      let cur = p;
      let next = latticeNbr(m, cur, dir);
      if (next === undefined || !m.adj.get(cur)?.has(next)) continue;
      while (next !== undefined && isThrough(m, next, forced)) {
        through.push(next);
        cur = next;
        next = latticeNbr(m, cur, dir);
      }
      out.push({ from: p, to: next!, dir, through });
    }
  }
  return out;
}

/** Zone count without random run splits: node zones plus runs (long runs split at 25 m). */
function zoneCount(m: Maze, forced: ReadonlySet<number>, size: (p: number) => number): number {
  let n = 0;
  for (const p of m.used) if (!isThrough(m, p, forced)) n++;
  for (const c of chains(m, forced)) n += runPieces(m, c, size, () => false).length;
  return n;
}

/** Split a chain into run pieces [start, end) along its axis, at through points. */
function runPieces(m: Maze, c: ChainPlan, size: (p: number) => number, extraSplit: (len: number) => boolean): Array<[number, number]> {
  const axis = (p: number) => (c.dir === "R" ? m.xs[pointOf(m, p).i]! : m.ys[pointOf(m, p).j]!);
  const start0 = axis(c.from) + size(c.from);
  const end = axis(c.to);
  const cands = c.through.map(axis);
  const pieces: Array<[number, number]> = [];
  let start = start0;
  let last: number | undefined;
  for (const x of [...cands, end]) {
    if (x - start > MAX_ZONE_M && last !== undefined && last > start) {
      pieces.push([start, last]);
      start = last;
    }
    if (x !== end && x - start >= 3 && extraSplit(x - start)) {
      pieces.push([start, x]);
      start = x;
      last = undefined;
      continue;
    }
    last = x;
  }
  pieces.push([start, end]);
  return pieces;
}

function shuffle<T>(rng: Rng, list: T[]): T[] {
  const a = list.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = rng.int(0, i);
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

const pad = (n: number) => String(n).padStart(2, "0");

interface SheetBuild {
  zones: Array<{ key: number | string; shape: DuctShape; rect: { x0: number; y0: number; x1: number; y1: number }; node?: number }>;
  links: Array<{ a: number | string; b: number | string; seg: [MapPoint, MapPoint] }>;
  /** Node keys that can hold an exit, best first. */
  exitSlots: number[];
  width: number;
  height: number;
}

/** Grow one maze and turn it into zones. `exits` is how many exit slots it must offer. */
function buildSheet(rng: Rng, target: [number, number], exits: number, loops: number): SheetBuild {
  const [lo, hi] = target;
  const C = Math.min(8, 4 + Math.floor(hi / 6) + rng.int(0, 1));
  const R = Math.min(6, 3 + Math.floor(hi / 9) + rng.int(0, 1));
  const xs: number[] = [];
  const ys: number[] = [];
  let x = 2;
  for (let i = 0; i < C; i++) {
    xs.push(x);
    x += rng.int(6, 13);
  }
  let y = 2;
  for (let j = 0; j < R; j++) {
    ys.push(y);
    y += rng.int(6, 11);
  }
  const m: Maze = { C, R, xs, ys, used: new Set(), adj: new Map() };
  const forced = new Set<number>();
  const chambers = new Set<number>();
  const size = (p: number) => (chambers.has(p) ? 3 : dirsOf(m, p).length >= 3 ? 2 : 1);
  const count = () => zoneCount(m, forced, size);

  const p0 = at(m, rng.int(0, C - 1), rng.int(0, R - 1));
  m.used.add(p0);
  m.adj.set(p0, new Set());
  const frontier = (): Array<[number, number]> => {
    const out: Array<[number, number]> = [];
    for (const p of [...m.used].sort((a, b) => a - b)) for (const d of DIRS) {
      const n = latticeNbr(m, p, d);
      if (n !== undefined && !m.used.has(n)) out.push([p, n]);
    }
    return out;
  };
  // Growth favours branching off points that already carry two runs, so the maze gets junctions.
  const grow = (): boolean => {
    const f = frontier();
    if (f.length === 0) return false;
    const weight = (p: number) => ((m.adj.get(p)?.size ?? 0) === 2 ? 4 : 1);
    const total = f.reduce((n, [a]) => n + weight(a), 0);
    let r = rng.next() * total;
    let pick = f[f.length - 1]!;
    for (const e of f) {
      r -= weight(e[0]);
      if (r < 0) {
        pick = e;
        break;
      }
    }
    link(m, pick[0], pick[1]);
    return true;
  };
  const goal = rng.int(lo, hi);
  let guard = 0;
  while (count() < goal - 2 * loops && guard++ < 200) if (!grow()) break;
  // Loops: lattice neighbours both in the maze but not yet linked.
  for (let k = 0; k < loops; k++) {
    const cands: Array<[number, number]> = [];
    for (const p of [...m.used].sort((a, b) => a - b)) for (const d of ["R", "D"] as const) {
      const n = latticeNbr(m, p, d);
      if (n !== undefined && m.used.has(n) && !m.adj.get(p)!.has(n)) cands.push([p, n]);
    }
    if (cands.length === 0) break;
    const [a, b] = cands[rng.int(0, cands.length - 1)]!;
    link(m, a, b);
  }
  const leaves = () => [...m.used].filter((p) => (m.adj.get(p)?.size ?? 0) === 1).sort((a, b) => a - b);
  guard = 0;
  while (count() > hi && guard++ < 50) {
    const l = leaves();
    if (l.length === 0 || m.used.size <= 3) break;
    unlinkLeaf(m, l[rng.int(0, l.length - 1)]!);
  }
  guard = 0;
  while (count() < lo && guard++ < 50) if (!grow()) break;

  // Exit slots: dead ends first, then bends, then junctions; straight points are opened up if the maze runs short.
  const nodeZones = () => [...m.used].filter((p) => !isThrough(m, p, forced)).sort((a, b) => a - b);
  const want = exits + 2;
  guard = 0;
  while (nodeZones().length < want && guard++ < 40) {
    const straight = [...m.used].filter((p) => isThrough(m, p, forced)).sort((a, b) => a - b);
    if (count() + 2 <= DUCT_SHEET_MAX && straight.length > 0) forced.add(straight[rng.int(0, straight.length - 1)]!);
    else if (count() + 2 <= DUCT_SHEET_MAX && grow()) continue;
    else break;
  }
  const byShape = (s: DuctShape) => shuffle(rng, nodeZones().filter((p) => shapeOf(m, p, forced, chambers) === s));
  const exitSlots = [...byShape("dead-end"), ...byShape("bend"), ...byShape("run"), ...byShape("junction")];
  // Vent chambers: one or two dead ends (else junctions) that will not hold an exit.
  const spare = exitSlots.slice(exits);
  const spareOf = (s: DuctShape) => shuffle(rng, spare.filter((p) => shapeOf(m, p, forced, chambers) === s));
  const nChambers = hi >= 14 ? rng.int(1, 2) : 1;
  for (const p of [...spareOf("dead-end"), ...spareOf("junction")].slice(0, nChambers)) chambers.add(p);
  const slots = exitSlots.filter((p) => !chambers.has(p));

  // Geometry.
  const zones: SheetBuild["zones"] = [];
  const links: SheetBuild["links"] = [];
  for (const p of nodeZones()) {
    const { i, j } = pointOf(m, p);
    const s = size(p);
    zones.push({ key: p, node: p, shape: shapeOf(m, p, forced, chambers), rect: { x0: xs[i]!, y0: ys[j]!, x1: xs[i]! + s, y1: ys[j]! + s } });
  }
  let runN = 0;
  let budget = hi - count();
  for (const c of chains(m, forced)) {
    const pieces = runPieces(m, c, size, (len) => {
      if (budget <= 0 || len < 8 || rng.next() >= 0.3) return false;
      budget--;
      return true;
    });
    const { i: fi, j: fj } = pointOf(m, c.from);
    let prev: number | string = c.from;
    pieces.forEach(([a, b]) => {
      const key = `r${runN++}`;
      const rect = c.dir === "R" ? { x0: a, y0: ys[fj]!, x1: b, y1: ys[fj]! + 1 } : { x0: xs[fi]!, y0: a, x1: xs[fi]! + 1, y1: b };
      zones.push({ key, shape: "run", rect });
      const seg: [MapPoint, MapPoint] = c.dir === "R" ? [[a, ys[fj]!], [a, ys[fj]! + 1]] : [[xs[fi]!, a], [xs[fi]! + 1, a]];
      links.push({ a: prev, b: key, seg });
      prev = key;
    });
    const end = pieces[pieces.length - 1]![1];
    links.push({ a: prev, b: c.to, seg: c.dir === "R" ? [[end, ys[fj]!], [end, ys[fj]! + 1]] : [[xs[fi]!, end], [xs[fi]! + 1, end]] });
  }

  // Trim the sheet to its maze, with a 2 m margin.
  const x0 = Math.min(...zones.map((z) => z.rect.x0));
  const y0 = Math.min(...zones.map((z) => z.rect.y0));
  const dx = 2 - x0;
  const dy = 2 - y0;
  for (const z of zones) z.rect = { x0: z.rect.x0 + dx, y0: z.rect.y0 + dy, x1: z.rect.x1 + dx, y1: z.rect.y1 + dy };
  for (const l of links) l.seg = [[l.seg[0][0] + dx, l.seg[0][1] + dy], [l.seg[1][0] + dx, l.seg[1][1] + dy]];
  const width = Math.max(...zones.map((z) => z.rect.x1)) + 2;
  const height = Math.max(...zones.map((z) => z.rect.y1)) + 2;
  return { zones, links, exitSlots: slots, width, height };
}

/** The label an exit gets: a room's name, or a corridor with the nearest named room ("Corridor B, near Galley"). */
function exitName(plan: Plan, node: PlanNode, zoneName: (key: string) => string | undefined): string {
  const own = zoneName(node.key) ?? node.name ?? "Unknown";
  if (node.role === "room" || node.role === "cap") return own;
  const near = plan.passages
    .filter((p) => (p.a === node.key || p.b === node.key) && p.kind === "door")
    .map((p) => plan.nodes.get(p.a === node.key ? p.b : p.a)!)
    .filter((n) => n.role === "room" || n.role === "cap")
    .sort((a, b) => (a.keyRoom ? 0 : 1) - (b.keyRoom ? 0 : 1) || (a.key < b.key ? -1 : 1))[0];
  const nearName = near ? zoneName(near.key) : undefined;
  return nearName ? `${own}, near ${nearName}` : own;
}

export interface DuctInputs {
  plan: Plan;
  profile: SiteProfile;
  inputs: MapInputs;
  /** Floor decks, in plan order. */
  decks: MapDeck[];
  zoneOf: Map<string, string>;
  floorZones: Map<string, MapZoneData>;
}

/** Stage 2b: duct sheets, their zones and exits. */
export function layoutDucts(rng: Rng, args: DuctInputs): DuctLayout {
  const { plan, profile, inputs, decks, zoneOf, floorZones } = args;
  const out: DuctLayout = { sheets: [], zones: [], links: [] };
  if (inputs.duct_density === "none") return out;
  const [baseLo, baseHi] = SHEET_ZONES[inputs.size];
  const adjust = inputs.duct_density === "sparse" ? -2 : inputs.duct_density === "dense" ? 2 : 0;
  const loops = inputs.duct_density === "sparse" ? rng.int(0, 1) : inputs.duct_density === "dense" ? rng.int(2, 3) : rng.int(1, 2);
  const sequence = new Set(plan.sequence);
  const zoneName = (key: string) => floorZones.get(zoneOf.get(key)!)?.name;
  const nouns = profile.hull === "rock" ? (["Vent shafts", "Crawlway"] as const) : (["Ducts", "Crawlspace"] as const);
  let dn = 0;

  for (const deck of plan.decks) {
    const floorDeck = decks[deck.index]!;
    const nodes = [...plan.nodes.values()].filter((n) => n.deck === deck.index);
    const access = [...plan.access].filter((k) => plan.nodes.get(k)!.deck === deck.index).sort();
    if (access.length === 0) continue;
    const seqHere = access.filter((k) => sequence.has(k));
    const others = shuffle(rng, access.filter((k) => !sequence.has(k)));
    // A crawlspace under the bottom deck on normal and dense maps, when there are rooms enough for two exits there.
    const spareRooms = shuffle(
      rng,
      nodes.filter((n) => (n.role === "room" || n.role === "cap") && !plan.access.has(n.key)).map((n) => n.key),
    );
    let lower = deck.index === 0 && (inputs.duct_density === "dense" || (inputs.duct_density === "normal" && (inputs.size !== "small" || rng.next() < 0.5)));
    if (lower && others.length < 2) {
      while (others.length < 2 && spareRooms.length > 0) others.push(spareRooms.shift()!);
      if (others.length < 2) lower = false;
    }
    const upperRooms = [...seqHere];
    const lowerRooms: string[] = [];
    if (lower) {
      // The lower sheet takes two or more ordinary rooms; the rest split between the sheets.
      lowerRooms.push(others.shift()!, others.shift()!);
      for (const k of others) (upperRooms.length <= lowerRooms.length + 1 ? upperRooms : lowerRooms).push(k);
    } else upperRooms.push(...others);
    while (upperRooms.length < 2 && spareRooms.length > 0) upperRooms.push(spareRooms.shift()!);

    // Corridors sometimes get an access point too.
    const nextToRoom = (k: string) =>
      plan.passages.some((p) => p.kind === "door" && (p.a === k || p.b === k) && ["room", "cap"].includes(plan.nodes.get(p.a === k ? p.b : p.a)!.role));
    const corridors = shuffle(
      rng,
      nodes.filter((n) => n.role === "corridor" && nextToRoom(n.key) && !plan.access.has(n.key)).map((n) => n.key),
    );
    const roles: Array<[DuctRole, string[]]> = [["upper", upperRooms]];
    if (lower) roles.push(["lower", lowerRooms]);
    for (const [role, rooms] of roles) {
      const keys = rooms.slice(0, MAX_EXITS);
      // Over the cap: ordinary rooms lose their access point first.
      if (rooms.length > MAX_EXITS) {
        const seq = rooms.filter((k) => sequence.has(k));
        const rest = rooms.filter((k) => !sequence.has(k));
        keys.splice(0, keys.length, ...seq, ...rest.slice(0, Math.max(0, MAX_EXITS - seq.length)));
      }
      if (keys.length < MAX_EXITS && corridors.length > 0 && rng.next() < 0.5) keys.push(corridors.shift()!);
      const lo = Math.max(DUCT_SHEET_MIN, baseLo + adjust - (role === "lower" ? 2 : 0));
      const hi = Math.min(DUCT_SHEET_MAX, Math.max(lo, baseHi + adjust - (role === "lower" ? 2 : 0), 2 * keys.length + 3));
      const build = buildSheet(rng, [lo, hi], keys.length, role === "lower" ? Math.max(0, loops - 1) : loops);
      const id = `${floorDeck.id}-${role === "upper" ? "duct" : "under"}`;
      const sheetDeck: MapDeck = {
        id,
        name: role === "upper" ? `${nouns[0]} over ${floorDeck.name}` : `${nouns[1]} under ${floorDeck.name}`,
        width: build.width,
        height: build.height,
        layer: "duct",
        serves: floorDeck.id,
      };
      // Exits: shuffled rooms onto shuffled slots, so the sheet does not mirror the deck.
      // If the maze has fewer slots than exits, the start and key rooms keep theirs.
      const exitOf = new Map<number, string>();
      const ranked = [...keys.filter((k) => sequence.has(k)), ...keys.filter((k) => !sequence.has(k))];
      const placed = shuffle(rng, ranked.slice(0, build.exitSlots.length));
      placed.forEach((k, i) => exitOf.set(build.exitSlots[i]!, k));
      const idOf = new Map<number | string, string>();
      const sorted = build.zones.slice().sort((a, b) => a.rect.y0 - b.rect.y0 || a.rect.x0 - b.rect.x0);
      for (const z of sorted) {
        const floorKey = z.node !== undefined ? exitOf.get(z.node) : undefined;
        idOf.set(z.key, floorKey ? `${zoneOf.get(floorKey)!}d` : `D${pad(++dn)}`);
      }
      const sheet: DuctSheet = { deck: sheetDeck, role, deckIndex: deck.index, serves: floorDeck.id, zones: [], exits: [] };
      for (const z of sorted) {
        const zid = idOf.get(z.key)!;
        const floorKey = z.node !== undefined ? exitOf.get(z.node) : undefined;
        const flags: Record<string, unknown> = { sizeM: Math.max(z.rect.x1 - z.rect.x0, z.rect.y1 - z.rect.y0), singleFile: true, ductType: z.shape };
        const zone: MapZoneData = {
          id: zid,
          deck: id,
          name: floorKey ? "Duct exit" : DUCT_SHAPE_LABELS[z.shape],
          kind: "crawlspace",
          layer: "duct",
          poly: [
            [z.rect.x0, z.rect.y0],
            [z.rect.x1, z.rect.y0],
            [z.rect.x1, z.rect.y1],
            [z.rect.x0, z.rect.y1],
          ],
          cluttered: false,
          acts: [],
          flags,
        };
        if (floorKey) {
          const floorId = zoneOf.get(floorKey)!;
          const name = exitName(plan, plan.nodes.get(floorKey)!, zoneName);
          flags.exitTo = { zone: floorId, name, deck: floorDeck.id };
          const fz = floorZones.get(floorId)!;
          fz.flags = { ...fz.flags, ductTo: { zone: zid, deck: id } };
          sheet.exits.push({ duct: zid, floor: floorId, name });
        }
        sheet.zones.push(zid);
        out.zones.push(zone);
      }
      for (const l of build.links) out.links.push({ a: idOf.get(l.a)!, b: idOf.get(l.b)!, seg: l.seg });
      // Act shading: each duct zone takes the acts of its nearest exit's room.
      const adj = new Map<string, string[]>(sheet.zones.map((z) => [z, []]));
      for (const l of build.links) {
        adj.get(idOf.get(l.a)!)!.push(idOf.get(l.b)!);
        adj.get(idOf.get(l.b)!)!.push(idOf.get(l.a)!);
      }
      const actOf = new Map<string, number[]>();
      const queue: string[] = [];
      for (const e of sheet.exits) {
        actOf.set(e.duct, floorZones.get(e.floor)!.acts ?? []);
        queue.push(e.duct);
      }
      for (let i = 0; i < queue.length; i++) for (const n of adj.get(queue[i]!) ?? []) if (!actOf.has(n)) {
        actOf.set(n, actOf.get(queue[i]!)!);
        queue.push(n);
      }
      for (const z of out.zones) if (z.deck === id) z.acts = [...(actOf.get(z.id) ?? [])];
      out.sheets.push(sheet);
    }
  }
  return out;
}
