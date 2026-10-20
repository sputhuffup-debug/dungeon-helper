/**
 * Floor plan archetypes for the site map generator: how each site type draws
 * a deck on the sketch grid (sketch.ts). Each builder places corridors, rooms,
 * yards and sealed sections as rectangles of cells, links the ones that touch
 * with passages, and aims for the deck's zone count.
 *
 * - starship: a long, narrow hull on one axis. A spine runs bow to stern with
 *   rooms in mirrored pairs on both sides; the bridge sits in a narrower bow,
 *   engineering in a wider stern; a service passage outboard, joined to the
 *   spine by cross passages, gives second routes.
 * - derelict: a starship skeleton, then damage: a collapsed stretch of the spine
 *   (the route detours through rooms), breached rooms sealed off, missing rooms.
 * - station: a central hub, spokes to a ring corridor, quadrant rooms between
 *   the spokes and modules off the ring (a compact hub inside a ring when small).
 * - colony: prefab buildings in a loose cluster, each a hallway with rooms,
 *   joined by covered walkways, with exterior yards between them.
 * - mine: a main adit that changes direction often, small chambers along it,
 *   dead-end side galleries and a crosscut or two; mostly open borders.
 * - lab: an atrium inside a ring corridor, with three or four mirrored wings
 *   of labs, each behind a decon lock; one wing is the secure one.
 * - ruin: long galleries between large chambers of uneven size, branches that
 *   end in chambers, and alcoves that step the outline.
 */
import type { Rng } from "@campaign-forge/module-sdk";
import type { LayoutArchetype, SiteProfile } from "./data";
import { buildAdjacency, largestBlock } from "./graph";
import { box, Sketch, type Box } from "./sketch";
import type { NodeRole, Passage, PassageKind, PlanNode } from "./plan";

export interface DeckCtx {
  rng: Rng;
  d: number;
  /** Zones this deck aims for (sealed sections not counted). */
  target: number;
  noDucts: boolean;
  profile: SiteProfile;
  /** Odd decks run their spine the other way, so the route snakes between decks. */
  odd: boolean;
}

export interface DeckOut {
  /** Where the route along the deck starts and ends (stairs land on these). */
  near: string;
  far: string;
  /** Second links between decks (a lift), when the deck has them. */
  near2?: string;
  far2?: string;
  /** Start rooms on the first deck, best first. */
  starts: string[];
}

type NodeExtra = Partial<Omit<PlanNode, "key" | "deck" | "role">>;

/** A deck being drawn: its sketch, nodes and passages. */
export class DeckDraft {
  readonly sk = new Sketch();
  readonly nodes = new Map<string, PlanNode>();
  passages: Passage[] = [];
  private n = 0;

  readonly ctx: DeckCtx;

  constructor(ctx: DeckCtx) {
    this.ctx = ctx;
  }

  get rng(): Rng {
    return this.ctx.rng;
  }

  /** Add a zone; undefined when its cells are taken. */
  add(role: NodeRole, b: Box, extra: NodeExtra = {}): string | undefined {
    const key = `${this.ctx.d}:${role === "corridor" ? "c" : role === "yard" ? "y" : role === "oob" ? "x" : "r"}${this.n++}`;
    if (!this.sk.put(key, b)) return undefined;
    this.nodes.set(key, { key, deck: this.ctx.d, role, wins: [], region: 1, dist: 0, hull: false, ways: 0, ...extra });
    return key;
  }

  node(key: string): PlanNode {
    return this.nodes.get(key)!;
  }

  linked(a: string, b: string): boolean {
    return this.passages.some((p) => (p.a === a && p.b === b) || (p.a === b && p.b === a));
  }

  /** Link two zones that touch; false when they do not or are already linked. */
  link(a: string | undefined, b: string | undefined, kind: PassageKind, extra: Partial<Passage> = {}): boolean {
    if (!a || !b || a === b || !this.sk.touch(a, b) || this.linked(a, b)) return false;
    this.passages.push({ a, b, kind, ...extra });
    return true;
  }

  unlinkAll(key: string): void {
    this.passages = this.passages.filter((p) => p.a !== key && p.b !== key);
  }

  remove(key: string): void {
    this.sk.drop(key);
    this.nodes.delete(key);
    this.unlinkAll(key);
  }

  /** Counted zones (sealed sections are not). */
  count(): number {
    let n = 0;
    for (const x of this.nodes.values()) if (x.role !== "oob") n++;
    return n;
  }

  /** Every counted zone reachable from every other, without `skip`, over passages (plus `extra`). */
  connected(skip?: string, extra: Array<[string, string]> = []): boolean {
    const live = [...this.nodes.values()].filter((x) => x.role !== "oob" && x.key !== skip).map((x) => x.key);
    if (live.length === 0) return true;
    const ok = new Set(live);
    const adj = new Map<string, string[]>(live.map((k) => [k, []]));
    const edges: Array<[string, string]> = [...this.passages.filter((p) => p.kind !== "oob").map((p) => [p.a, p.b] as [string, string]), ...extra];
    for (const [a, b] of edges) {
      if (!ok.has(a) || !ok.has(b)) continue;
      adj.get(a)!.push(b);
      adj.get(b)!.push(a);
    }
    const seen = new Set([live[0]!]);
    const queue = [live[0]!];
    for (let i = 0; i < queue.length; i++) for (const m of adj.get(queue[i]!)!) if (!seen.has(m)) {
      seen.add(m);
      queue.push(m);
    }
    return seen.size === live.length;
  }

  /** Passage adjacency over counted zones. */
  adjacency(): Map<string, string[]> {
    return buildAdjacency(
      [...this.nodes.values()].filter((n) => n.role !== "oob").map((n) => n.key),
      this.passages.filter((p) => p.kind !== "oob").map((p) => [p.a, p.b] as [string, string]),
    );
  }

  /** Turn a zone into a sealed section with one blast door, if the rest stays connected. */
  seal(key: string, name: string): boolean {
    if (!this.connected(key)) return false;
    const n = this.node(key);
    const nbrs = this.sk.neighbours(key).filter((k) => this.nodes.get(k)?.role !== "oob");
    this.unlinkAll(key);
    n.role = "oob";
    n.name = name;
    delete n.type;
    delete n.back;
    const to = nbrs.find((k) => this.node(k).role === "corridor") ?? nbrs[0];
    if (to) this.passages.push({ a: key, b: to, kind: "oob" });
    return true;
  }

  pick<T>(list: T[]): T | undefined {
    return list.length === 0 ? undefined : list[this.rng.int(0, list.length - 1)];
  }

  shuffle<T>(list: T[]): T[] {
    const a = list.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = this.rng.int(0, i);
      [a[i], a[j]] = [a[j]!, a[i]!];
    }
    return a;
  }
}

const corridorish = (n: PlanNode | undefined) => !!n && (n.role === "corridor" || n.role === "yard");

// ---------------------------------------------------------------------------
// Starship and derelict
// ---------------------------------------------------------------------------

/** Zones in a ship with N room columns, `per` columns per corridor zone. */
function shipCount(N: number, sides: number, engN: number, per: number): number {
  let frames = 0;
  for (let i = 1; i < N; i++) if ((i - 1) % 3 === 0) frames++;
  const svc = sides > 0 && N > 1 ? Math.ceil(N / per) : 0;
  return 1 + engN + Math.ceil(N / per) + 2 * N + (svc > 0 ? sides * (svc + frames) : 0);
}

function buildShip(D: DeckDraft, derelict: boolean): DeckOut {
  const { rng, target, noDucts, d } = D.ctx;
  const dmg = derelict && target >= 8 ? Math.max(1, Math.round(target * 0.2)) : 0;
  const T = target + dmg;
  // Deep hulls (rooms two lines deep, service passages, engineering bays) on bigger decks; a slim hull on small ones.
  let deep = T >= 28 || (noDucts && T >= 8);
  let sides = deep ? (T >= 34 ? 2 : 1) : 0;
  // Corridor zones of one room column on slim hulls (the stern is many zones from the bow), two on deep hulls
  // (which stay long and narrow that way); without ducts, one.
  const perOf = (isDeep: boolean) => (isDeep && !noDucts ? 2 : 1);
  let engN = deep ? 3 : 1;
  const fit = () => {
    let n = 1;
    while (shipCount(n + 1, sides, engN, perOf(deep)) <= T) n++;
    return n;
  };
  let N = fit();
  if (deep && N < 2) {
    deep = false;
    sides = 0;
    engN = 1;
    N = fit();
  }
  const per = perOf(deep);
  const svcP = sides > 0;
  const svcS = sides > 1;
  const frameAt = (i: number) => deep && i >= 1 && (i - 1) % 3 === 0;

  // Rows: hull, port service, port rooms (outer, inner), spine, starboard rooms, starboard service, hull.
  const sk = D.sk;
  const hullTop = sk.row("gap", { range: [3, 3], group: "hull" });
  const svcPr = deep ? sk.row("corr", { group: "svc" }) : -1;
  // (A slim hull's rooms span two lines, so the bridge, on the inner ones only, narrows the bow.)
  const outerP = sk.row("room", { range: deep ? [3, 3] : [2, 3], group: "outer" });
  const innerP = sk.row("room", { range: deep ? [3, 3] : [2, 3], group: "inner" });
  const spineR = sk.row("corr");
  const innerS = sk.row("room", { range: deep ? [3, 3] : [2, 3], group: "inner" });
  const outerS = sk.row("room", { range: deep ? [3, 3] : [2, 3], group: "outer" });
  const svcSr = svcS ? sk.row("corr", { group: "svc" }) : -1;
  const hullBot = sk.row("gap", { range: [3, 3], group: "hull" });

  // Columns: bridge, then room columns (with a frame column before every third), then engineering.
  const bridgeC = sk.col("room");
  const roomC: number[] = [];
  const frameC: Array<number | undefined> = [];
  for (let i = 0; i < N; i++) {
    frameC.push(frameAt(i) ? sk.col("corr") : undefined);
    roomC.push(sk.col("room"));
  }
  const e0 = sk.col("room");
  const e1 = sk.col("room");

  // Extras: split rooms into front and back pairs (mirrored), a docking collar.
  let extras = T - shipCount(N, sides, engN, per);
  const split = new Array<[boolean, boolean]>(N).fill([false, false]).map(() => [false, false] as [boolean, boolean]);
  const wantDock = deep && d === 0 && !noDucts && extras > 0 && rng.next() < 0.8;
  if (wantDock) extras--;
  if (deep) {
    // Without ducts the port rooms keep their two doors (spine and passage): starboard rooms split first.
    for (const i of D.shuffle([...Array(N).keys()])) {
      if (noDucts && extras > 0) {
        split[i]![1] = true;
        extras--;
      } else if (extras >= 2) {
        split[i] = [true, true];
        extras -= 2;
      } else if (extras === 1) {
        split[i]![rng.int(0, 1)] = true;
        extras--;
      }
    }
  }

  const portRows: [number, number] = [outerP, innerP];
  const stbdRows: [number, number] = [innerS, outerS];
  const bridge = D.add("room", box(bridgeC, innerP, bridgeC, innerS), { name: "Bridge", type: "command" })!;
  const engine = D.add("room", engN === 3 ? box(e0, innerP, e1, innerS) : box(e0, hullTop, e1, hullBot), { name: "Engine room", type: "engine-room" })!;
  const bays: string[] = [];
  if (engN === 3) {
    const bayType = () => D.pick(["life-support", "workshop", "maintenance", "reactor"])!;
    bays.push(D.add("room", box(e0, hullTop, e1, outerP), { type: bayType() })!);
    bays.push(D.add("room", box(e0, outerS, e1, hullBot), { type: bayType() })!);
    for (const b of bays) D.link(b, engine, "door");
  }

  // Spine: one zone per two room columns (with their frames).
  const spine: string[] = [];
  const spineAt = new Map<number, string>();
  for (let g = 0; g * per < N; g++) {
    const first = per * g;
    const last = Math.min(N - 1, first + per - 1);
    const c0 = frameC[first] ?? roomC[first]!;
    const k = D.add("corridor", box(c0, spineR, roomC[last]!, spineR), { name: "Spine" })!;
    for (let i = first; i <= last; i++) spineAt.set(i, k);
    if (spine.length > 0) D.link(spine[spine.length - 1], k, "line");
    spine.push(k);
  }
  D.link(bridge, spine[0], "door");
  const bridgeSide = () => {
    // The bridge's second way in, through the first room behind it.
    for (const r of D.sk.neighbours(bridge)) if (D.node(r).role === "room" && (noDucts || rng.next() < 0.4)) return D.link(bridge, r, "door");
    return false;
  };
  D.link(spine[spine.length - 1], engine, "door");

  // Service passages: from the first frame aft, one zone per two room columns.
  const svcZones = (row: number): Map<number, string> => {
    const at = new Map<number, string>();
    let prev: string | undefined;
    for (let g = 0; per * g < N; g++) {
      const first = per * g;
      const last = Math.min(N - 1, first + per - 1);
      const c0 = frameC[first] ?? roomC[first]!;
      const k = D.add("corridor", box(c0, row, roomC[last]!, row), { name: row === svcPr ? "Port passage" : "Starboard passage" })!;
      for (let i = first; i <= last; i++) at.set(i, k);
      if (prev) D.link(prev, k, "line");
      prev = k;
    }
    if (prev) for (const b of bays) D.link(prev, b, "door");
    return at;
  };
  const svcPAt = svcP ? svcZones(svcPr) : new Map<number, string>();
  const svcSAt = svcS ? svcZones(svcSr) : new Map<number, string>();

  // Cross passages at the frames.
  for (let i = 0; i < N; i++) {
    const f = frameC[i];
    if (f === undefined) continue;
    if (svcP) {
      const x = D.add("corridor", box(f, portRows[0], f, portRows[1]), { name: "Cross passage" })!;
      D.link(x, svcPAt.get(i), "line");
      D.link(x, spineAt.get(i), "line");
    }
    if (svcS) {
      const x = D.add("corridor", box(f, stbdRows[0], f, stbdRows[1]), { name: "Cross passage" })!;
      D.link(x, svcSAt.get(i), "line");
      D.link(x, spineAt.get(i), "line");
    }
  }

  let dock: string | undefined;
  // Rooms in mirrored pairs; a frame column with no cross passage on a side widens the next room.
  const rowRooms: { port: string[]; stbd: string[] } = { port: [], stbd: [] };
  for (let i = 0; i < N; i++) {
    for (const side of ["port", "stbd"] as const) {
      const rows = side === "port" ? portRows : stbdRows;
      const svcAt = side === "port" ? svcPAt : svcSAt;
      const hasSvc = side === "port" ? svcP : svcS;
      const c0 = frameC[i] !== undefined && !hasSvc ? frameC[i]! : roomC[i]!;
      const sp = spineAt.get(i);
      const isSplit = split[i]![side === "port" ? 0 : 1];
      const innerRow = side === "port" ? rows[1] : rows[0];
      const outerRow = side === "port" ? rows[0] : rows[1];
      if (isSplit) {
        const inner = D.add("room", box(c0, innerRow, roomC[i]!, innerRow))!;
        const outer = D.add("room", box(c0, outerRow, roomC[i]!, outerRow), { back: !hasSvc })!;
        D.link(inner, sp, "door");
        D.link(outer, inner, "door");
        if (hasSvc && rng.next() < 0.5) D.link(outer, svcAt.get(i), "door");
        rowRooms[side].push(inner);
      } else {
        const r = D.add("room", box(c0, rows[0], roomC[i]!, rows[1]))!;
        D.link(r, sp, "door");
        if (hasSvc && rng.next() < (noDucts ? 0.6 : 0.35)) D.link(r, svcAt.get(i), "door");
        rowRooms[side].push(r);
      }
    }
  }
  bridgeSide();
  // Suites: a door between neighbouring rooms now and then.
  for (const side of ["port", "stbd"] as const) {
    const list = rowRooms[side];
    for (let i = 0; i + 1 < list.length; i++) if (rng.next() < 0.2) D.link(list[i], list[i + 1], "door");
  }

  // Docking collar on the hull by the bow, off the port passage.
  if (wantDock) {
    const i = 0;
    dock = D.add("room", box(roomC[i]!, hullTop));
    if (dock && !D.link(dock, svcPAt.get(i), "door")) {
      D.remove(dock);
      dock = undefined;
    }
  }

  // Slim hulls: blisters on the hull (airlocks, pods, lockers) off the side rooms.
  if (!deep) {
    const spots = D.shuffle(roomC.flatMap((c, i) => [[c, hullTop, i, "port"] as const, [c, hullBot, i, "stbd"] as const]));
    for (const [c, r, i, side] of spots) {
      if (extras <= 0) break;
      const k = D.add("room", box(c, r), { back: true });
      if (!k) continue;
      if (!D.link(k, rowRooms[side][i], "door")) {
        D.remove(k);
        continue;
      }
      if (d === 0 && !dock && i <= 1) dock = k;
      extras--;
    }
  }

  // Tiny decks: drop rooms until the deck fits.
  for (const side of ["stbd", "port"] as const) {
    while (D.count() > target && !derelict && rowRooms[side].length > 1) {
      const k = rowRooms[side].pop()!;
      if (D.connected(k)) D.remove(k);
    }
  }

  const starts: string[] = [];
  if (dock) starts.push(dock);
  const bowRooms = [...D.nodes.values()].filter((n) => n.role === "room" && n.key !== bridge && n.key !== engine && !bays.includes(n.key));
  const colOf = (k: string) => D.sk.boxes.get(k)!.c0;
  starts.push(...bowRooms.sort((a, b) => colOf(a.key) - colOf(b.key) || (a.key < b.key ? -1 : 1)).map((n) => n.key));

  if (derelict) damageShip(D, { spine, bridge, engine, keep: starts.slice(0, 2) });

  const live = spine.filter((k) => D.node(k).role !== "oob");
  const ends = [live[0]!, live[live.length - 1]!];
  const alts = [live[1], live[live.length - 2]];
  const [near, far] = D.ctx.odd ? [ends[1]!, ends[0]!] : [ends[0]!, ends[1]!];
  const [near2, far2] = D.ctx.odd ? [alts[1], alts[0]] : [alts[0], alts[1]];
  return { near, far, ...(near2 && near2 !== near && near2 !== far ? { near2 } : {}), ...(far2 && far2 !== far && far2 !== near ? { far2 } : {}), starts: starts.filter((k) => D.nodes.get(k)?.role === "room") };
}

/** A derelict's damage: a collapsed spine stretch with a detour through rooms, breached rooms, missing rooms. */
function damageShip(D: DeckDraft, s: { spine: string[]; bridge: string; engine: string; keep: string[] }): void {
  const { rng, target } = D.ctx;
  const essential = new Set([s.bridge, s.engine, ...s.keep]);
  // The spine breaks once: rooms beside the break are joined by doors so the route can detour.
  if (s.spine.length >= 3 && rng.next() < 0.85) {
    const mid = s.spine.slice(1, -1);
    const k = mid[Math.floor(mid.length / 2) + (mid.length > 1 ? rng.int(-1, 0) : 0)]!;
    const saved = D.passages.slice();
    const b = D.sk.boxes.get(k)!;
    // Rooms touching the stretch or its neighbours, row by row, joined in a chain.
    const lo = b.c0;
    const hi = b.c1;
    const rooms = [...D.nodes.values()].filter((n) => {
      if (n.role !== "room" || essential.has(n.key)) return false;
      const r = D.sk.boxes.get(n.key)!;
      return r.c1 >= lo - 2 && r.c0 <= hi + 2 && (r.r1 + 1 === b.r0 || r.r0 - 1 === b.r1);
    });
    for (const row of [rooms.filter((n) => D.sk.boxes.get(n.key)!.r1 < b.r0), rooms.filter((n) => D.sk.boxes.get(n.key)!.r0 > b.r1)]) {
      const sorted = row.sort((x, y) => D.sk.boxes.get(x.key)!.c0 - D.sk.boxes.get(y.key)!.c0);
      for (let i = 0; i + 1 < sorted.length; i++) D.link(sorted[i]!.key, sorted[i + 1]!.key, "door");
    }
    if (!D.seal(k, "Collapsed passage")) D.passages = saved;
  }
  // Breached and missing rooms until the deck is down to its target. Without ducts, the rooms
  // on the deck's main loop stay (they carry the second routes).
  let guard = 0;
  while (D.count() > target && guard++ < 60) {
    const loop = D.ctx.noDucts ? largestBlock(D.adjacency()) : new Set<string>();
    let rooms = [...D.nodes.values()].filter((n) => n.role === "room" && !essential.has(n.key) && !loop.has(n.key));
    if (rooms.length === 0) rooms = [...D.nodes.values()].filter((n) => n.role === "room" && !essential.has(n.key));
    const n = D.pick(rooms);
    if (!n) break;
    const outside = D.sk.facesOut(n.key);
    const sealedYet = [...D.nodes.values()].some((x) => x.role === "oob");
    if (outside && sealedYet && rng.next() < 0.5) {
      if (D.connected(n.key)) D.remove(n.key);
    } else D.seal(n.key, "Breached section");
  }
}

// ---------------------------------------------------------------------------
// Station deck
// ---------------------------------------------------------------------------

/** Ways to split five side cells (Q a S a Q) into modules: the spoke cell never stands alone. */
const SIDE_SPANS: Array<Array<[number, number]>> = [
  [[0, 0], [1, 2], [3, 4]],
  [[0, 1], [2, 3], [4, 4]],
  [[0, 0], [1, 1], [2, 3], [4, 4]],
  [[0, 0], [1, 3], [4, 4]],
  [[0, 1], [2, 4]],
  [[0, 2], [3, 4]],
];

function buildStation(D: DeckDraft): DeckOut {
  const { rng, target: T, noDucts } = D.ctx;
  const sk = D.sk;
  const small = T <= 13;
  // Lines (both axes): outer module rows, ring, then the inner plan, then mirrored.
  const lines = (axis: "c" | "r") => {
    const L = (kind: "room" | "corr", group?: string, range?: [number, number]) =>
      axis === "c" ? sk.col(kind, { ...(group ? { group } : {}), ...(range ? { range } : {}) }) : sk.row(kind, { ...(group ? { group } : {}), ...(range ? { range } : {}) });
    const idx: number[] = [];
    idx.push(L("room", "o2", [3, 5]), L("room", "o1", [3, 5]), L("corr", "r"));
    if (small) idx.push(L("room", "h", [8, 11]));
    else idx.push(L("room", "q"), L("room", "a", [3, 5]), L("corr", "s"), L("room", "a", [3, 5]), L("room", "q"));
    idx.push(L("corr", "r"), L("room", "o1", [3, 5]), L("room", "o2", [3, 5]));
    return idx;
  };
  lines("c");
  lines("r");
  const last = sk.cols.length - 1;
  const ring: Record<string, string> = {};
  let hub: string;
  const spokes: string[] = [];
  const quads: string[] = [];
  const corr = (b: Box, name = "Ring") => D.add("corridor", b, { name })!;

  if (small) {
    // Hub inside a ring of four.
    hub = D.add("room", box(3, 3), { type: "hub", name: "Central hub" })!;
    ring.N = corr(box(2, 2, 3, 2));
    ring.E = corr(box(4, 2, 4, 3));
    ring.S = corr(box(3, 4, 4, 4));
    ring.W = corr(box(2, 3, 2, 4));
    const order = ["N", "E", "S", "W"];
    order.forEach((s, i) => D.link(ring[s], ring[order[(i + 1) % 4]!], "line"));
    D.link(hub, ring.N, "door");
    D.link(hub, ring.S, "door");
    if (noDucts || rng.next() < 0.5) D.link(hub, ring.E, "door");
    if (noDucts || rng.next() < 0.5) D.link(hub, ring.W, "door");
  } else {
    // Hub, spokes and quadrant rooms; a wide hub (no east and west spokes) on smaller decks.
    const extra = T >= 24 ? 4 : 0;
    const wide = T < 26 + extra;
    const want = wide ? [true, false, T >= 15 + extra, false] : [true, T >= 20 + extra, T >= 18 + extra || rng.next() < 0.5, T >= 21 + extra];
    const [sN, sE, sS, sW] = want as [boolean, boolean, boolean, boolean];
    hub = D.add("room", wide ? box(3, 4, 7, 6) : box(4, 4, 6, 6), { type: "hub", name: "Central hub" })!;
    // The ring in a pinwheel: eight zones, or twelve on bigger decks (a longer way round).
    let order: string[];
    if (extra > 0) {
      ring.N1 = corr(box(2, 2, 3, 2));
      ring.Nb = corr(box(4, 2, 5, 2));
      ring.N3 = corr(box(6, 2, 7, 2));
      ring.E1 = corr(box(8, 2, 8, 3));
      ring.Eb = corr(box(8, 4, 8, 5));
      ring.E3 = corr(box(8, 6, 8, 7));
      ring.S1 = corr(box(7, 8, 8, 8));
      ring.Sb = corr(box(5, 8, 6, 8));
      ring.S3 = corr(box(3, 8, 4, 8));
      ring.W1 = corr(box(2, 7, 2, 8));
      ring.Wb = corr(box(2, 5, 2, 6));
      ring.W3 = corr(box(2, 3, 2, 4));
      order = ["N1", "Nb", "N3", "E1", "Eb", "E3", "S1", "Sb", "S3", "W1", "Wb", "W3"];
    } else {
      ring.Na = corr(box(2, 2, 4, 2));
      ring.Nb = corr(box(5, 2, 7, 2));
      ring.Ea = corr(box(8, 2, 8, 4));
      ring.Eb = corr(box(8, 5, 8, 7));
      ring.Sa = corr(box(6, 8, 8, 8));
      ring.Sb = corr(box(3, 8, 5, 8));
      ring.Wa = corr(box(2, 6, 2, 8));
      ring.Wb = corr(box(2, 3, 2, 5));
      order = ["Na", "Nb", "Ea", "Eb", "Sa", "Sb", "Wa", "Wb"];
    }
    order.forEach((s, i) => D.link(ring[s], ring[order[(i + 1) % order.length]!], "line"));
    const spoke = (on: boolean, b: Box, to: string) => {
      if (!on) return;
      const k = corr(b, "Spoke");
      D.link(k, to, "line");
      D.link(k, hub, "door");
      spokes.push(k);
    };
    spoke(sN, box(5, 3), ring.Nb!);
    spoke(sS, box(5, 7), ring.Sb!);
    if (!wide) {
      spoke(sW, box(3, 5), ring.Wb!);
      spoke(sE, box(7, 5), ring.Eb!);
    } else if (noDucts) {
      // (with ducts the wide hub opens only on its spokes, so the ring is the way round)
      D.link(hub, ring.Wb, "door");
      D.link(hub, ring.Eb, "door");
    }
    // Quadrant rooms around the hub.
    const q = (b: Box) => {
      const k = D.add("room", b);
      if (k) quads.push(k);
    };
    q(sN ? box(3, 3, 4, 3) : box(3, 3, 5, 3));
    q(box(6, 3, 7, 3));
    q(sS ? box(3, 7, 4, 7) : box(3, 7, 5, 7));
    q(box(6, 7, 7, 7));
    if (!wide) {
      q(sW ? box(3, 4) : box(3, 4, 3, 5));
      q(box(3, 6));
      q(sE ? box(7, 4) : box(7, 4, 7, 5));
      q(box(7, 6));
    }
    for (const k of quads) {
      const rings = D.sk.neighbours(k).filter((x) => Object.values(ring).includes(x));
      D.link(k, D.pick(rings), "door");
      const sp = D.sk.neighbours(k).filter((x) => spokes.includes(x));
      if (sp.length > 0 && rng.next() < 0.5) D.link(k, sp[0], "door");
      if (rng.next() < 0.25) D.link(k, D.pick(D.sk.neighbours(k).filter((x) => quads.includes(x))), "door");
    }
  }

  // Modules off the ring, one side at a time; pairs (front and back) when there are zones to spare.
  // (On the small plan a module spanning the ring's corner cells opens on two ring zones.)
  const inner = small ? [noDucts || rng.next() < 0.5 ? [2, 4] : [3, 3]] : D.pick(SIDE_SPANS)!.map(([a, b]) => [3 + a, 3 + b]);
  type Slot = { side: "N" | "E" | "S" | "W"; b: Box; front: Box; back: Box };
  const slots: Slot[] = [];
  for (const [a, b] of inner as Array<[number, number]>) {
    slots.push({ side: "N", b: box(a, 0, b, 1), front: box(a, 1, b, 1), back: box(a, 0, b, 0) });
    slots.push({ side: "S", b: box(a, last - 1, b, last), front: box(a, last - 1, b, last - 1), back: box(a, last, b, last) });
    slots.push({ side: "W", b: box(0, a, 1, b), front: box(1, a, 1, b), back: box(0, a, 0, b) });
    slots.push({ side: "E", b: box(last - 1, a, last, b), front: box(last - 1, a, last - 1, b), back: box(last, a, last, b) });
  }
  // Mirrored modules round the ring (west and east, then north and south), the first deck's dock on the west.
  const spanIdx = D.shuffle([...inner.keys()]);
  const order: Slot[] = [];
  const pairsFirst = rng.next() < 0.5 ? (["W", "E", "N", "S"] as const) : (["N", "S", "W", "E"] as const);
  for (const i of spanIdx) for (const side of pairsFirst) order.push(slots[i * 4 + ["N", "S", "W", "E"].indexOf(side)]!);
  const firstW = order.findIndex((x) => x.side === "W");
  if (firstW > 0) order.unshift(...order.splice(firstW, 1));
  const placed: Array<{ slot: Slot; key: string }> = [];
  const ringKeys = new Set(Object.values(ring));
  const linkModule = (k: string) => {
    const rings = D.sk.neighbours(k).filter((x) => ringKeys.has(x));
    D.link(k, D.pick(rings), "door");
  };
  for (const slot of order) {
    if (D.count() >= T) break;
    const k = D.add("room", slot.b);
    if (!k) continue;
    linkModule(k);
    placed.push({ slot, key: k });
  }
  const backs = new Map<string, string>();
  for (const p of placed) {
    if (D.count() >= T) break;
    D.remove(p.key);
    const front = D.add("room", p.slot.front)!;
    const back = D.add("room", p.slot.back, { back: true })!;
    linkModule(front);
    D.link(front, back, "door");
    p.key = front;
    backs.set(front, back);
  }

  const ringW = small ? ring.W! : ring.Wb!;
  const ringE = small ? ring.E! : ring.Eb!;
  // The dock: a west module, its back room when it has one (the farthest from the east side).
  const starts = placed.filter((p) => p.slot.side === "W").flatMap((p) => (noDucts ? [p.key] : [backs.get(p.key), p.key].filter((k): k is string => !!k)));
  starts.push(...placed.filter((p) => p.slot.side !== "W").map((p) => p.key), ...quads);
  const [near, far] = D.ctx.odd ? [ringE, ringW] : [ringW, ringE];
  return { near, far, near2: hub, far2: hub, starts };
}

// ---------------------------------------------------------------------------
// Colony block
// ---------------------------------------------------------------------------

function buildColony(D: DeckDraft): DeckOut {
  const { rng, target: T, d, noDucts } = D.ctx;
  const sk = D.sk;
  const MR = T < 16 ? 1 : T < 34 ? 2 : 3;
  const MC = Math.max(2, Math.min(4, Math.ceil(Math.max(2, Math.round(T / 4.4)) / MR)));
  // Columns: gap, building (two room columns), gap, ...; rows: gap, building (top rooms, hallway, bottom rooms), gap, ...
  const gc: number[] = [];
  const bc: Array<[number, number]> = [];
  for (let j = 0; j < MC; j++) {
    gc.push(sk.col("gap", { range: [4, 7], keep: true }));
    bc.push([sk.col("room"), sk.col("room")]);
  }
  gc.push(sk.col("gap", { range: [4, 7], keep: true }));
  const gr: number[] = [];
  const br: Array<[number, number, number]> = [];
  for (let i = 0; i < MR; i++) {
    gr.push(sk.row("gap", { range: [4, 7], keep: true }));
    br.push([sk.row("room"), sk.row("corr"), sk.row("room")]);
  }
  gr.push(sk.row("gap", { range: [4, 7], keep: true }));

  // Buildings: a hallway with rooms above and below, or one big hall; a slot can be a yard or left empty.
  type Bld = { i: number; j: number; kind: "hall" | "big" | "yard" | "empty"; hall?: string; rooms: string[]; top: string[]; bot: string[] };
  const blds: Bld[][] = [];
  const slotsN = MR * MC;
  const kinds: Array<Bld["kind"]> = [];
  for (let s = 0; s < slotsN; s++) kinds.push("hall");
  const free = D.shuffle([...Array(slotsN).keys()].filter((s) => s !== 0));
  if (slotsN >= 4 && free.length > 0) kinds[free.shift()!] = rng.next() < 0.5 ? "yard" : "empty";
  for (const s of free.slice(0, Math.round(slotsN * 0.25))) kinds[s] = "big";
  for (let i = 0; i < MR; i++) {
    const row: Bld[] = [];
    for (let j = 0; j < MC; j++) {
      const kind = kinds[i * MC + j]!;
      const [a, b] = bc[j]!;
      const [t, h, u] = br[i]!;
      const bld: Bld = { i, j, kind, rooms: [], top: [], bot: [] };
      if (kind === "hall") {
        bld.hall = D.add("corridor", box(a, h, b, h), { name: "Corridor" })!;
        const top = D.add("room", box(a, t, b, t))!;
        D.link(top, bld.hall, "door");
        bld.top.push(top);
        if (rng.next() < 0.75 || noDucts) {
          const bot = D.add("room", box(a, u, b, u))!;
          D.link(bot, bld.hall, "door");
          bld.bot.push(bot);
        }
        bld.rooms.push(...bld.top, ...bld.bot);
      } else if (kind === "big") {
        const k = D.add("room", box(a, t, b, u), { pool: ["mess", "hydroponics", "vehicle-bay", "workshop", "cargo-hold", "rec"] })!;
        bld.rooms.push(k);
        bld.top.push(k);
        bld.bot.push(k);
      } else if (kind === "yard") {
        const k = D.add("yard", box(gc[j]!, t, gc[j + 1]!, u), { name: "Yard" })!;
        bld.rooms.push(k);
      }
      row.push(bld);
    }
    blds.push(row);
  }
  const front = (bld: Bld) => bld.hall ?? bld.rooms[0];
  // Walkways between neighbours in a row; yards next to a building open onto its hallway end.
  for (let i = 0; i < MR; i++) {
    for (let j = 0; j + 1 < MC; j++) {
      const x = blds[i]![j]!;
      const y = blds[i]![j + 1]!;
      const isB = (b: Bld) => b.kind === "hall" || b.kind === "big";
      if (isB(x) && isB(y)) {
        if (rng.next() < 0.85 || MR === 1 || noDucts) {
          const w = D.add("corridor", box(gc[j + 1]!, br[i]![1], gc[j + 1]!, br[i]![1]), { name: "Walkway" })!;
          D.link(w, front(x), "door");
          D.link(w, front(y), "door");
        }
      } else {
        const yard = x.kind === "yard" ? x : y.kind === "yard" ? y : undefined;
        const other = yard === x ? y : x;
        if (yard && isB(other)) {
          D.link(yard.rooms[0], front(other), "door");
          for (const r of other.rooms) if (rng.next() < 0.4) D.link(yard.rooms[0], r, "door");
        }
      }
    }
  }
  // Streets: a run of yard segments along a gap row (one per building column, open to each other),
  // with doors from the rooms that face it. Streets between rows of buildings join the rows.
  const yards: string[] = blds.flat().filter((b) => b.kind === "yard").map((b) => b.rooms[0]!);
  const reserve = d === 0 ? 1 : 0;
  const street = (g: number): string[] => {
    const segs: string[] = [];
    for (let j = 0; j < MC; j++) {
      const c0 = gc[j]!;
      const c1 = j === MC - 1 ? gc[MC]! : bc[j]![1];
      const k = D.add("yard", box(c0, gr[g]!, c1, gr[g]!), { name: "Yard" });
      if (!k) continue;
      if (segs.length > 0) D.link(segs[segs.length - 1], k, "open");
      segs.push(k);
    }
    for (const k of segs) {
      const rooms = D.sk.neighbours(k).filter((x) => D.node(x).role === "room");
      for (const r of rooms) if (noDucts || rng.next() < 0.6) D.link(k, r, "door");
      for (const y of D.sk.neighbours(k).filter((x) => D.node(x).role === "yard")) D.link(k, y, "open");
      if (!D.passages.some((p) => (p.a === k || p.b === k) && D.node(p.a === k ? p.b : p.a).role !== "yard")) D.link(k, D.pick(rooms), "door");
    }
    yards.push(...segs);
    return segs;
  };
  const streetRows: number[] = [];
  for (let g = 1; g < MR; g++) streetRows.push(g);
  const outer = D.shuffle([0, MR]);
  if (MR === 1 || noDucts) streetRows.push(outer[0]!);
  if (MR === 1 && noDucts && T >= 14) streetRows.push(outer[1]!);
  for (const g of streetRows) street(g);
  // Over the target: drop bottom rooms, then outer street segments, that nothing needs.
  for (const k of D.shuffle(blds.flat().flatMap((b) => (b.kind === "hall" ? b.bot : [])))) {
    if (D.count() <= T - reserve) break;
    if (D.nodes.has(k) && D.connected(k)) D.remove(k);
  }
  // Short of the target: rooms below hallways that have none, then split rooms, then a street on the outside.
  for (const bld of D.shuffle(blds.flat().filter((b) => b.kind === "hall" && b.bot.length === 0))) {
    if (D.count() >= T - reserve) break;
    const [a, b2] = bc[bld.j]!;
    const k = D.add("room", box(a, br[bld.i]![2], b2, br[bld.i]![2]));
    if (!k) continue;
    D.link(k, bld.hall, "door");
    for (const y of D.sk.neighbours(k).filter((x) => D.node(x).role === "yard")) if (rng.next() < 0.6) D.link(k, y, "door");
    bld.bot.push(k);
  }
  for (const bld of D.shuffle(blds.flat().filter((b) => b.kind === "hall"))) {
    for (const part of ["top", "bot"] as const) {
      if (D.count() >= T - reserve) break;
      const k = bld[part][0];
      if (!k || bld[part].length > 1 || !D.nodes.has(k)) continue;
      const b = D.sk.boxes.get(k)!;
      const nb = D.passages.filter((p) => p.a === k || p.b === k).map((p) => (p.a === k ? p.b : p.a)).filter((x) => D.node(x).role === "yard");
      D.remove(k);
      const l = D.add("room", box(b.c0, b.r0, b.c0, b.r1))!;
      const r = D.add("room", box(b.c1, b.r0, b.c1, b.r1))!;
      bld[part] = [l, r];
      for (const x of [l, r]) {
        D.link(x, bld.hall, "door");
        for (const y of nb) if (noDucts || rng.next() < 0.7) D.link(x, y, "door");
      }
    }
  }
  if (D.count() + MC <= T - reserve && !streetRows.includes(outer[1]!)) street(outer[1]!);
  else if (D.count() + MC <= T - reserve && !streetRows.includes(outer[0]!)) street(outer[0]!);
  // Join anything left apart (a door between touching zones).
  for (let guard = 0; guard < 20 && !D.connected(); guard++) {
    const first = blds[0]![0]!;
    const seen = reach(D, front(first)!);
    const pair = [...seen].flatMap((k) => D.sk.neighbours(k).filter((x) => !seen.has(x) && D.node(x).role !== "oob").map((x) => [k, x] as const))[0];
    if (!pair) break;
    D.link(pair[0], pair[1], "door");
  }

  // The entry airlock at the end of the first building's hallway.
  const starts: string[] = [];
  const first = blds[0]![0]!;
  if (d === 0 && first.hall) {
    const k = D.add("room", box(gc[0]!, br[0]![1]));
    if (k) {
      D.link(k, first.hall, "door");
      starts.push(k);
    }
  }
  starts.push(...[...first.top, ...first.bot].filter((k) => D.nodes.get(k)?.role === "room"));
  starts.push(...[...D.nodes.values()].filter((n) => n.role === "room" && !starts.includes(n.key)).map((n) => n.key));
  const fronts = blds.flat().filter((b) => b.kind === "hall" || b.kind === "big").map(front) as string[];
  const near = fronts[0]!;
  const far = fronts[fronts.length - 1]!;
  const ends = D.ctx.odd ? [far, near] : [near, far];
  const near2 = fronts[1] !== ends[1] ? fronts[1] : undefined;
  const far2 = fronts[fronts.length - 2] !== ends[0] ? fronts[fronts.length - 2] : undefined;
  return { near: ends[0]!, far: ends[1]!, ...(near2 ? { near2 } : {}), ...(far2 ? { far2 } : {}), starts };
}

function reach(D: DeckDraft, from: string): Set<string> {
  const seen = new Set([from]);
  const queue = [from];
  for (let i = 0; i < queue.length; i++) {
    for (const p of D.passages) {
      if (p.kind === "oob") continue;
      const o = p.a === queue[i] ? p.b : p.b === queue[i] ? p.a : undefined;
      if (o && !seen.has(o)) {
        seen.add(o);
        queue.push(o);
      }
    }
  }
  return seen;
}

// ---------------------------------------------------------------------------
// Mine and alien ruin: a walk over a lattice of tunnel crossings
// ---------------------------------------------------------------------------

interface LatticeStyle {
  /** Chance a step goes straight on. */
  straight: number;
  /** Steps per tunnel zone. */
  zoneSteps: [number, number];
  /** Chamber spans (cells across and down) and their weights. */
  spans: Array<[number, number, number]>;
  /** Chance per step of a chamber beside it. */
  chamber: number;
  /** Chance a chamber link is open rather than a door. */
  open: number;
  /** Walk steps per counted zone. */
  stepsPerZone: number;
  mainName: string;
  branchName: string;
  branchEnds: "chamber" | "mixed";
  alcoves: boolean;
  /** Start and end rooms. */
  endType?: string;
}

const MINE: LatticeStyle = {
  straight: 0.3,
  zoneSteps: [1, 2],
  spans: [
    [1, 1, 6],
    [2, 1, 1],
    [1, 2, 1],
  ],
  chamber: 0.75,
  open: 0.65,
  stepsPerZone: 0.45,
  mainName: "Adit",
  branchName: "Gallery",
  branchEnds: "mixed",
  alcoves: false,
  endType: "drill-head",
};

const RUIN: LatticeStyle = {
  straight: 0.6,
  zoneSteps: [2, 2],
  spans: [
    [1, 1, 2],
    [2, 1, 2],
    [1, 2, 2],
    [2, 2, 3],
  ],
  chamber: 0.6,
  open: 0.35,
  stepsPerZone: 0.5,
  mainName: "Gallery",
  branchName: "Ramp",
  branchEnds: "chamber",
  alcoves: true,
};

type Dir = 0 | 1 | 2 | 3; // E S W N
const DX = [1, 0, -1, 0];
const DY = [0, 1, 0, -1];

function buildLattice(D: DeckDraft, st: LatticeStyle): DeckOut {
  const { rng, target: T, noDucts } = D.ctx;
  const sk = D.sk;
  // Without ducts, a longer two-leg walk: more chambers between the legs.
  const L = Math.max(2, Math.round(T * (noDucts ? 0.62 : st.stepsPerZone)));
  const W = Math.max(4, Math.ceil(Math.sqrt(L * 2.2)) + 2, noDucts ? Math.ceil((L - 1) / 2) + 1 : 0);
  const H = Math.max(4, Math.ceil(Math.sqrt(L * 1.4)) + 2);
  for (let i = 0; i <= 2 * W; i++) sk.col(i % 2 === 1 ? "corr" : "room");
  for (let i = 0; i <= 2 * H; i++) sk.row(i % 2 === 1 ? "corr" : "room");
  const cellOf = (x: number, y: number): [number, number] => [2 * x + 1, 2 * y + 1];
  const inLattice = (x: number, y: number) => x >= 0 && y >= 0 && x < W && y < H;

  // The main walk: a self-avoiding path that turns often (the longest of a few tries).
  const tryWalk = (): Array<[number, number]> => {
    const path: Array<[number, number]> = [];
    const seen = new Set<string>();
    let x = 0;
    let y = noDucts ? rng.int(0, 1) : rng.int(0, H - 1);
    let dir: Dir = 0;
    path.push([x, y]);
    seen.add(`${x},${y}`);
    const step = (dd: Dir): boolean => {
      const nx = x + DX[dd]!;
      const ny = y + DY[dd]!;
      if (!inLattice(nx, ny) || seen.has(`${nx},${ny}`)) return false;
      x = nx;
      y = ny;
      path.push([x, y]);
      seen.add(`${x},${y}`);
      return true;
    };
    if (noDucts) {
      // Without ducts: a serpentine of uneven legs, each beside the last, so chambers between legs make loops.
      const legLen = Math.min(W - 1, Math.max(2, Math.ceil((L - 1) / 2)));
      while (path.length <= L) {
        const leg = legLen;
        for (let k = 0; k < leg && path.length <= L; k++) if (!step(dir)) break;
        if (path.length > L || !step(1)) break;
        dir = dir === 0 ? 2 : 0;
      }
      return path;
    }
    for (let s = 0; s < L; s++) {
      const opts: Array<[Dir, number]> = [];
      for (const [dd, w] of [
        [dir, st.straight],
        [((dir + 1) % 4) as Dir, (1 - st.straight) / 2],
        [((dir + 3) % 4) as Dir, (1 - st.straight) / 2],
      ] as Array<[Dir, number]>) {
        const nx = x + DX[dd]!;
        const ny = y + DY[dd]!;
        if (!inLattice(nx, ny) || seen.has(`${nx},${ny}`)) continue;
        // Avoid boxing the walk in: a crossing with no free way on is a last resort.
        const exits = ([0, 1, 2, 3] as Dir[]).filter((q) => inLattice(nx + DX[q]!, ny + DY[q]!) && !seen.has(`${nx + DX[q]!},${ny + DY[q]!}`)).length;
        opts.push([dd, w * (exits > 1 ? 1 : 0.05)]);
      }
      if (opts.length === 0) break;
      const total = opts.reduce((n, o) => n + o[1], 0);
      let r = rng.next() * total;
      let pick = opts[opts.length - 1]![0];
      for (const [dd, w] of opts) {
        r -= w;
        if (r < 0) {
          pick = dd;
          break;
        }
      }
      dir = pick;
      step(dir);
    }
    return path;
  };
  let walk = tryWalk();
  for (let t = 0; t < 6 && walk.length <= L; t++) {
    const w = tryWalk();
    if (w.length > walk.length) walk = w;
  }
  const onWalk = new Map<string, number>(walk.map(([wx, wy], i) => [`${wx},${wy}`, i]));

  // Tunnel zones: straight runs of one or two steps; a turn's crossing ends the run that reaches it.
  const owner = new Map<number, string>(); // walk index -> zone
  const main: string[] = [];
  let i = 0;
  let prev: string | undefined;
  while (i < walk.length - 1) {
    const legDir = (k: number) => {
      const [ax, ay] = walk[k]!;
      const [bx, by] = walk[k + 1]!;
      return `${bx - ax},${by - ay}`;
    };
    const steps = noDucts ? 2 : rng.int(st.zoneSteps[0], st.zoneSteps[1]);
    let j = i;
    while (j < walk.length - 1 && j - i < steps && legDir(j) === legDir(i)) j++;
    const [ax, ay] = cellOf(...walk[i]!);
    const [bx, by] = cellOf(...walk[j]!);
    const from = i === 0 ? [ax, ay] : [ax + Math.sign(bx - ax), ay + Math.sign(by - ay)];
    const k = D.add("corridor", box(from[0]!, from[1]!, bx, by), { name: st.mainName })!;
    for (let w = i === 0 ? 0 : i + 1; w <= j; w++) owner.set(w, k);
    if (prev) D.link(prev, k, "line");
    main.push(k);
    prev = k;
    i = j;
  }
  if (main.length === 0) {
    const [cx, cy] = cellOf(...walk[0]!);
    main.push(D.add("corridor", box(cx, cy), { name: st.mainName })!);
    owner.set(0, main[0]!);
  }

  // A room on a free side of a crossing: the tunnel cell that way and the chamber cells beside it.
  const capAt = (wx: number, wy: number, extra: Partial<PlanNode> = {}): string | undefined => {
    const [cx, cy] = cellOf(wx, wy);
    const zone = sk.at(cx, cy);
    for (const dd of D.shuffle([0, 1, 2, 3] as Dir[])) {
      const tx = cx + DX[dd]!;
      const ty = cy + DY[dd]!;
      const b = DX[dd] !== 0 ? box(tx, ty - 1, tx, ty + 1) : box(tx - 1, ty, tx + 1, ty);
      const k = D.add("room", b, extra);
      if (!k) continue;
      D.link(k, zone, "door");
      return k;
    }
    return undefined;
  };
  const start = capAt(walk[0]![0], walk[0]![1]);
  const end = walk.length > 2 ? capAt(walk[walk.length - 1]![0], walk[walk.length - 1]![1], st.endType ? { type: st.endType } : {}) : undefined;

  const chamberLink = (k: string, z: string | undefined) => D.link(k, z, rng.next() < st.open ? "open" : "door");
  const spanPick = (): [number, number] => {
    const total = st.spans.reduce((n, s) => n + s[2], 0);
    let r = rng.next() * total;
    for (const [a, b, w] of st.spans) {
      r -= w;
      if (r < 0) return [a, b];
    }
    return [1, 1];
  };
  // Chambers beside the walk's tunnel cells.
  const tunnelCells: Array<[number, number, number]> = [];
  for (let w = 0; w + 1 < walk.length; w++) {
    const [ax, ay] = cellOf(...walk[w]!);
    const [bx, by] = cellOf(...walk[w + 1]!);
    tunnelCells.push([(ax + bx) / 2, (ay + by) / 2, w + 1]);
  }
  const chambers: string[] = [];
  const reserve = () => Math.max(0, Math.round(T * 0.12));
  // Without ducts, chambers between two legs first: a door to each makes a loop.
  if (noDucts) {
    const rungs: Array<[number, number, string, string]> = [];
    for (let r = 0; r < sk.rows.length; r += 2)
      for (let c = 0; c < sk.cols.length; c += 2) {
        if (sk.at(c, r)) continue;
        const near = [sk.at(c - 1, r), sk.at(c + 1, r), sk.at(c, r - 1), sk.at(c, r + 1)].filter((k): k is string => !!k && D.node(k).role === "corridor");
        const distinct = [...new Set(near)];
        if (distinct.length >= 2) rungs.push([c, r, distinct[0]!, distinct[1]!]);
      }
    for (const [c, r, a, b] of D.shuffle(rungs)) {
      if (D.count() >= T - reserve()) break;
      const k = D.add("room", box(c, r));
      if (!k) continue;
      chamberLink(k, a);
      chamberLink(k, b);
      chambers.push(k);
    }
  }
  for (const [tx, ty] of D.shuffle(tunnelCells)) {
    if (D.count() >= T - reserve()) break;
    if (rng.next() > st.chamber) continue;
    const zone = sk.at(tx, ty);
    const horiz = ty % 2 === 1; // tunnel runs along a corridor row
    const sidesC: Array<[number, number]> = horiz
      ? [
          [tx, ty - 1],
          [tx, ty + 1],
        ]
      : [
          [tx - 1, ty],
          [tx + 1, ty],
        ];
    for (const [ex, ey] of D.shuffle(sidesC)) {
      const [sw, sh] = spanPick();
      // Grow away from the tunnel across it, either way along it.
      const [along, across] = horiz ? [sw, sh] : [sh, sw];
      const away = horiz ? Math.sign(ey - ty) : Math.sign(ex - tx);
      const acrossSpan = (v: number): [number, number] => (across === 1 ? [v, v] : away < 0 ? [v - 2, v] : [v, v + 2]);
      const alongSpans = (v: number): Array<[number, number]> => (along === 1 ? [[v, v]] : D.shuffle([[v - 2, v], [v, v + 2]] as Array<[number, number]>));
      const opts: Box[] = [];
      for (const al of alongSpans(horiz ? ex : ey)) {
        const ac = acrossSpan(horiz ? ey : ex);
        opts.push(horiz ? box(al[0], ac[0], al[1], ac[1]) : box(ac[0], al[0], ac[1], al[1]));
      }
      opts.push(box(ex, ey));
      let k: string | undefined;
      for (const b of opts) {
        k = D.add("room", b);
        if (k) break;
      }
      if (!k) continue;
      chamberLink(k, zone);
      // A second way in from another tunnel it touches (a loop).
      const others = D.sk.neighbours(k).filter((z) => z !== zone && D.node(z).role === "corridor");
      if (others.length > 0 && (noDucts || rng.next() < 0.35)) chamberLink(k, others[0]);
      chambers.push(k);
      break;
    }
  }

  // Alcoves off the big chambers (ruins): small niches that step the outline.
  if (st.alcoves) {
    for (const c of D.shuffle(chambers)) {
      if (D.count() >= T) break;
      const b = D.sk.boxes.get(c);
      if (!b || (b.c1 === b.c0 && b.r1 === b.r0)) continue;
      const around: Box[] = [box(b.c0 - 1, b.r0, b.c0 - 1, b.r0), box(b.c1 + 1, b.r1), box(b.c0, b.r0 - 1), box(b.c1, b.r1 + 1), box(b.c1 + 1, b.r0), box(b.c0, b.r1 + 1)];
      let n = 0;
      for (const a of D.shuffle(around)) {
        if (n >= 1 || D.count() >= T) break;
        const k = D.add("room", a, { back: true, pool: ["fissure", "ossuary", "ampule-vault"] });
        if (!k) continue;
        D.link(k, c, "door");
        n++;
      }
    }
  }
  // Crosscuts: a tunnel cell between two crossings on the walk far apart along it.
  let cuts = 0;
  const wantCuts = noDucts ? 3 : rng.int(1, 2);
  for (const w of D.shuffle([...walk.keys()])) {
    if (cuts >= wantCuts || D.count() >= T) break;
    const [wx, wy] = walk[w]!;
    for (const dd of [0, 1, 2, 3] as Dir[]) {
      const o = onWalk.get(`${wx + DX[dd]!},${wy + DY[dd]!}`);
      if (o === undefined || Math.abs(o - w) < 4) continue;
      const [cx, cy] = cellOf(wx, wy);
      const k = D.add("corridor", box(cx + DX[dd]!, cy + DY[dd]!), { name: st === MINE ? "Crosscut" : st.mainName });
      if (!k) continue;
      D.link(k, owner.get(w), "line");
      D.link(k, owner.get(o), "line");
      cuts++;
      break;
    }
  }

  // Side branches: a short tunnel off a crossing, ending blind or in a chamber.
  const addBranches = (limit: number) => {
    const branchFrom = D.shuffle([...walk.keys()].filter((w) => w > 0 && w < walk.length - 1));
    for (const w of branchFrom) {
      if (D.count() >= limit) break;
      const [wx, wy] = walk[w]!;
      const dd = D.pick(([0, 1, 2, 3] as Dir[]).filter((q) => {
        const nx = wx + DX[q]!;
        const ny = wy + DY[q]!;
        if (!inLattice(nx, ny) || onWalk.has(`${nx},${ny}`)) return false;
        const [cx, cy] = cellOf(nx, ny);
        return sk.free(box(cx - DX[q]!, cy - DY[q]!, cx, cy));
      }));
      if (dd === undefined) continue;
      const [cx, cy] = cellOf(wx, wy);
      const [nx, ny] = cellOf(wx + DX[dd]!, wy + DY[dd]!);
      const k = D.add("corridor", box(cx + DX[dd]!, cy + DY[dd]!, nx, ny), { name: st.branchName });
      if (!k) continue;
      D.link(k, owner.get(w), "line");
      if (D.count() < limit && (st.branchEnds === "chamber" || rng.next() < 0.5)) {
        const c = capAt(wx + DX[dd]!, wy + DY[dd]!, st.branchEnds === "mixed" ? { back: true } : {});
        if (c) chambers.push(c);
      }
      if (D.count() >= limit) break;
    }
  };
  addBranches(T);

  // Fill up: single chambers beside any tunnel cell, then more side branches.
  const tunnelOf = (k: string): Array<[number, number]> => {
    const b = sk.boxes.get(k)!;
    const out: Array<[number, number]> = [];
    for (let r = b.r0; r <= b.r1; r++) for (let c = b.c0; c <= b.c1; c++) if ((c + r) % 2 === 1) out.push([c, r]);
    return out;
  };
  for (let guard = 0; guard < 4 && D.count() < T; guard++) {
    const corridors = [...D.nodes.values()].filter((n) => n.role === "corridor").map((n) => n.key);
    for (const k of D.shuffle(corridors)) {
      for (const [tx, ty] of D.shuffle(tunnelOf(k))) {
        if (D.count() >= T) break;
        const horiz = ty % 2 === 1;
        for (const [ex, ey] of D.shuffle(horiz ? [[tx, ty - 1], [tx, ty + 1]] : [[tx - 1, ty], [tx + 1, ty]])) {
          const c = D.add("room", box(ex!, ey!));
          if (!c) continue;
          chamberLink(c, k);
          chambers.push(c);
          break;
        }
      }
    }
    if (D.count() < T) addBranches(T);
  }

  const starts = start ? [start] : chambers.slice(0, 1);
  if (end) chambers.push(end);
  // Rooms nearest the walk's start first (without ducts the start is one of the chambers between the legs).
  const [sx, sy] = cellOf(...walk[0]!);
  const from0 = (k: string) => {
    const b = sk.boxes.get(k)!;
    return Math.abs(b.c0 - sx) + Math.abs(b.r0 - sy);
  };
  chambers.sort((a, b) => from0(a) - from0(b) || (a < b ? -1 : 1));
  const [near, far] = D.ctx.odd ? [main[main.length - 1]!, main[0]!] : [main[0]!, main[main.length - 1]!];
  const near2 = main.length > 2 ? (D.ctx.odd ? main[main.length - 2] : main[1]) : undefined;
  const far2 = main.length > 2 ? (D.ctx.odd ? main[1] : main[main.length - 2]) : undefined;
  return { near, far, ...(near2 ? { near2 } : {}), ...(far2 ? { far2 } : {}), starts: [...starts, ...chambers] };
}

// ---------------------------------------------------------------------------
// Research lab
// ---------------------------------------------------------------------------

type Wing = "W" | "E" | "N" | "S";

/** Zones in a wing with `m` lab lines past its root labs (-1: a decon and one end room). */
function wingCount(m: number): number {
  return m < 0 ? 2 : m === 0 ? 4 : 4 + Math.ceil(m / 2) + 2 * (m - 1);
}

function buildLab(D: DeckDraft): DeckOut {
  const { rng, target: T } = D.ctx;
  const sk = D.sk;
  // Pick the wing plan whose count comes closest to the target from below: wings, lengths, a ring of four or eight.
  type Cfg = { wings: Wing[]; mH: number; mV: number; ring8: boolean; n: number; score: number };
  let best: Cfg | undefined;
  for (const wings of [["E"], ["W", "E"], ["W", "E", "S"], ["W", "E", "N", "S"]] as Wing[][]) {
    if (wings.length === 1 && T >= 10) continue;
    for (const ring8 of [false, true]) {
      if (ring8 && T < 30) continue;
      for (let mH = -1; mH <= 5; mH++)
        for (let mV = -1; mV <= 5; mV++) {
          if (wings.length <= 2 && mV > -1) continue;
          const n = 1 + (ring8 ? 8 : 4) + wings.reduce((s, w) => s + wingCount(w === "W" || w === "E" ? mH : mV), 0);
          if (n > T + 1 && !(wings.length === 1 && mH === -1)) continue;
          // Close to the target, three or four wings, wings with labs (not just a decon and an end room), even lengths.
          const stubs = wings.filter((w) => (w === "W" || w === "E" ? mH : mV) < 0).length;
          const score = -Math.abs(n - T) - (n > T ? 1.5 : 0) + (wings.length >= 3 ? 1.5 : 0) - stubs * 0.8 - Math.abs(mH - mV) * 0.3 + rng.next() * 0.2;
          if (!best || score > best.score) best = { wings, mH, mV, ring8, n, score };
        }
    }
  }
  const cfg = best!;
  const has = (w: Wing) => cfg.wings.includes(w);

  // Columns: west end, west labs, decon, ring, atrium halves around the middle track, ring, decon, east labs, east end.
  const lab = (axis: "c" | "r", kind: "room" | "corr", group?: string, range?: [number, number]) =>
    axis === "c" ? sk.col(kind, { ...(group ? { group } : {}), ...(range ? { range } : {}) }) : sk.row(kind, { ...(group ? { group } : {}), ...(range ? { range } : {}) });
  const axisLines = (axis: "c" | "r", lo: Wing, hi: Wing, m: number) => {
    const before: number[] = [];
    const after: number[] = [];
    const out: Record<string, number> = {};
    if (has(lo)) {
      out.end0 = lab(axis, "room", "end");
      for (let k = m; k >= 1; k--) before[k] = lab(axis, "room", `w${k}`);
      out.dec0 = lab(axis, "room", "dec", [6, 7]);
    }
    out.ring0 = lab(axis, "corr", "ring");
    out.a0 = lab(axis, "room", "a", [3, 5]);
    out.mid = lab(axis, "corr");
    out.a1 = lab(axis, "room", "a", [3, 5]);
    out.ring1 = lab(axis, "corr", "ring");
    if (has(hi)) {
      out.dec1 = lab(axis, "room", "dec", [6, 7]);
      for (let k = 1; k <= m; k++) after[k] = lab(axis, "room", `w${k}`);
      out.end1 = lab(axis, "room", "end");
    }
    return { ...out, before, after } as Record<string, number> & { before: number[]; after: number[] };
  };
  const C = axisLines("c", "W", "E", cfg.mH);
  const Rw = axisLines("r", "N", "S", cfg.mV);
  const [cR0, cA0, cM, cA1, cR1] = [C.ring0!, C.a0!, C.mid!, C.a1!, C.ring1!];
  const [rR0, rA0, rM, rA1, rR1] = [Rw.ring0!, Rw.a0!, Rw.mid!, Rw.a1!, Rw.ring1!];

  const atrium = D.add("room", box(cA0, rA0, cA1, rA1), { name: "Atrium", type: "atrium" })!;
  const ring: Record<string, string> = {};
  const corr = (b: Box, name = "Core corridor") => D.add("corridor", b, { name })!;
  let ringOrder: string[];
  if (cfg.ring8) {
    ring.Wt = corr(box(cR0, rR0, cR0, rA0));
    ring.Wb = corr(box(cR0, rM, cR0, rA1));
    ring.Sl = corr(box(cR0, rR1, cA0, rR1));
    ring.Sr = corr(box(cM, rR1, cA1, rR1));
    ring.Eb = corr(box(cR1, rA1, cR1, rR1));
    ring.Et = corr(box(cR1, rA0, cR1, rM));
    ring.Nr = corr(box(cA1, rR0, cR1, rR0));
    ring.Nl = corr(box(cA0, rR0, cM, rR0));
    ringOrder = ["Wt", "Wb", "Sl", "Sr", "Eb", "Et", "Nr", "Nl"];
  } else {
    ring.N = corr(box(cR0, rR0, cA1, rR0));
    ring.E = corr(box(cR1, rR0, cR1, rA1));
    ring.S = corr(box(cA0, rR1, cR1, rR1));
    ring.W = corr(box(cR0, rA0, cR0, rR1));
    ringOrder = ["N", "E", "S", "W"];
  }
  ringOrder.forEach((s, i) => D.link(ring[s], ring[ringOrder[(i + 1) % ringOrder.length]!], "line"));
  const ringKeys = new Set(Object.values(ring));
  for (const k of D.shuffle(D.sk.neighbours(atrium).filter((x) => ringKeys.has(x))).slice(0, cfg.ring8 ? 4 : 3)) D.link(atrium, k, "door");

  // The secure wing: the last one built (south when there is one).
  const secureWing: Wing = has("S") ? "S" : has("N") ? "N" : rng.next() < 0.5 ? "E" : "W";
  const wingFronts: Record<string, string> = {};
  const wingEnds: Record<string, string> = {};
  const wingRooms: string[] = [];
  const buildWing = (w: Wing) => {
    const horiz = w === "W" || w === "E";
    const m = horiz ? cfg.mH : cfg.mV;
    const A = horiz ? C : Rw; // along the wing
    const lowSide = w === "W" || w === "N";
    const dec = lowSide ? A.dec0! : A.dec1!;
    const end = lowSide ? A.end0! : A.end1!;
    const seq = (lowSide ? A.before : A.after).slice(1); // index 0 = first lab line out from the core
    const P = horiz ? { r0: rR0, a0: rA0, mid: rM, a1: rA1, r1: rR1 } : { r0: cR0, a0: cA0, mid: cM, a1: cA1, r1: cR1 };
    // Boxes in wing coordinates: `along` is the line out from the core, `across` the line across the wing.
    const B = (al0: number, ac0: number, al1 = al0, ac1 = ac0) => (horiz ? box(al0, ac0, al1, ac1) : box(ac0, al0, ac1, al1));
    const secure = w === secureWing;
    const extra = secure ? { pool: ["containment", "cold-storage", "lab", "lab"], secure: true } : { pool: ["lab", "lab", "lab", "containment", "cold-storage", "office", "data-center", "medlab", "morgue"] };
    const decon = D.add("room", B(dec, P.mid), { name: "Decon", type: "decon", transit: true })!;
    const ringAt = (al: number, ac: number) => sk.at(...((horiz ? [al, ac] : [ac, al]) as [number, number]));
    const ringSide = lowSide ? (horiz ? cR0 : rR0) : horiz ? cR1 : rR1;
    const deconRing = ringAt(ringSide, P.mid)!;
    D.link(decon, deconRing, "door", secure ? { secure: true } : {});
    wingFronts[w] = deconRing;
    // Corridor zones along the wing (two lab lines each).
    const corrAt = new Map<number, string>();
    let prev: string | undefined;
    for (let g = 0; g * 2 < m; g++) {
      const a = seq[g * 2]!;
      const b = seq[Math.min(m - 1, g * 2 + 1)]!;
      const k = corr(B(a, P.mid, b, P.mid), "Wing corridor");
      corrAt.set(g * 2, k);
      corrAt.set(g * 2 + 1, k);
      D.link(prev ?? decon, k, prev ? "line" : "door", !prev && secure ? { secure: true } : {});
      prev = k;
    }
    // Root labs span the decon line and the first lab line, so they open on the ring and the wing corridor.
    const sides: Array<[number, number]> = [
      [P.r0, P.a0],
      [P.a1, P.r1],
    ];
    const rootAl: [number, number] = m > 0 ? [Math.min(dec, seq[0]!), Math.max(dec, seq[0]!)] : [dec, dec];
    const rows: string[][] = [[], []];
    if (m >= 0) sides.forEach(([x0, x1], si) => {
      const root = D.add("room", B(rootAl[0], x0, rootAl[1], x1), extra)!;
      rows[si]!.push(root);
      wingRooms.push(root);
      D.link(root, m > 0 ? corrAt.get(0) : decon, "door");
      const rings = D.sk.neighbours(root).filter((k) => ringKeys.has(k));
      const other = rings.find((k) => k !== deconRing) ?? rings[0];
      D.link(root, other, "door", secure ? { secure: true } : {});
      for (let k = 1; k < m; k++) {
        const r = D.add("room", B(seq[k]!, x0, seq[k]!, x1), extra)!;
        D.link(r, corrAt.get(k), "door");
        rows[si]!.push(r);
        wingRooms.push(r);
      }
    });
    for (const row of rows) for (let k = 0; k + 1 < row.length; k++) if (rng.next() < 0.2) D.link(row[k], row[k + 1], "door");
    const endRoom = D.add("room", B(end, P.r0, end, P.r1), secure ? { type: "containment" } : { pool: ["lab", "storage", "life-support", "data-center", "medlab"] })!;
    D.link(endRoom, prev ?? decon, "door");
    wingRooms.push(endRoom);
    wingEnds[w] = endRoom;
  };
  for (const w of cfg.wings) buildWing(w);

  // Spare zones: split end rooms into a front room and a back room (mirrored pairs first).
  for (const k of D.shuffle([...D.nodes.values()].filter((n) => n.role === "room" && !n.transit && n.key !== atrium && D.sk.facesOut(n.key)).map((n) => n.key))) {
    if (D.count() >= T) break;
    const b = D.sk.boxes.get(k)!;
    const n = D.node(k);
    const across = b.c1 > b.c0 ? "c" : b.r1 > b.r0 ? "r" : undefined;
    if (!across) continue;
    const links = D.passages.filter((p) => p.a === k || p.b === k).map((p) => (p.a === k ? p.b : p.a));
    const halves = across === "c" ? [box(b.c0, b.r0, Math.floor((b.c0 + b.c1) / 2), b.r1), box(Math.floor((b.c0 + b.c1) / 2) + 1, b.r0, b.c1, b.r1)] : [box(b.c0, b.r0, b.c1, Math.floor((b.r0 + b.r1) / 2)), box(b.c0, Math.floor((b.r0 + b.r1) / 2) + 1, b.c1, b.r1)];
    const { key: _k, deck: _d, role: _r, ...keep } = n;
    void _k;
    void _d;
    void _r;
    D.remove(k);
    const h = halves.map((hb) => D.add("room", hb, keep)!);
    const front = links.length > 0 && links.every((l) => D.sk.touch(h[0]!, l)) ? 0 : 1;
    for (const l of links) D.link(h[front], l, "door") || D.link(h[1 - front], l, "door");
    D.link(h[0], h[1], "door");
    D.node(h[1 - front]!).back = true;
  }

  // The entry: the west wing's end room (the far end of the plan from the east wing), else another outer room.
  const endRooms = Object.values(wingEnds).filter((k) => D.nodes.has(k));
  const starts = [...(wingEnds.W && D.nodes.has(wingEnds.W) ? [wingEnds.W] : []), ...endRooms, ...wingRooms.filter((k) => D.nodes.has(k) && D.sk.facesOut(k)), ...wingRooms.filter((k) => D.nodes.has(k))];
  const near = wingFronts.W ?? ringOrder.map((s) => ring[s]!)[0]!;
  const far = wingFronts.E ?? ringOrder.map((s) => ring[s]!)[2]!;
  const ends = D.ctx.odd ? [far, near] : [near, far];
  return { near: ends[0]!, far: ends[1]!, near2: atrium, far2: atrium, starts };
}

// ---------------------------------------------------------------------------

export const ARCHETYPE_BUILDERS: Record<LayoutArchetype, (D: DeckDraft) => DeckOut> = {
  starship: (D) => buildShip(D, false),
  derelict: (D) => buildShip(D, true),
  station: buildStation,
  colony: buildColony,
  mine: (D) => buildLattice(D, MINE),
  lab: buildLab,
  ruin: (D) => buildLattice(D, RUIN),
};

export { corridorish };
