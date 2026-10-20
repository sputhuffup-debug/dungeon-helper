/**
 * Stage 1 of the site map generator: the zone graph. Decides decks, corridor
 * lines, the rooms in each band and column, the ends of each line (ladders,
 * caps, sealed stubs), the passages between them, the start, act regions,
 * key rooms, win-path endpoints and which rooms get a duct access point. No
 * geometry yet: the layout stage turns this plan into rectangles on a 1 m grid
 * and grows each deck's duct sheets (see ducts.ts).
 *
 * Deck shape: rows from top to bottom alternate bands of rooms and corridor
 * lines (band 0, line 1, band 1, ..., line K, band K). Columns split every
 * line into one corridor zone per column, and every band into cells holding
 * one to three room slots. Lines join at alternating ends through connector
 * zones (a serpentine spine), and middle-band rooms or cross corridors can
 * link two lines (loops).
 */
import type { Rng } from "@campaign-forge/module-sdk";
import { DUCT_SHARE, ROOM_TYPES, SIZE_ZONES, type RoomType, type SiteProfile, type WinPathId } from "./data";
import type { KeyRoomInput, MapInputs } from "./inputs";
import { bfs, buildAdjacency, type Adjacency } from "./graph";

export type Side = "L" | "R";
export type NodeRole = "corridor" | "connector" | "cross" | "room" | "cap" | "oob";

export interface PlanNode {
  key: string;
  deck: number;
  role: NodeRole;
  /** Corridor: line and column. */
  line?: number;
  col?: number;
  /** Band slots. */
  band?: number;
  slot?: number;
  part?: "full" | "front" | "back";
  /** End zones. */
  side?: Side;
  rows?: [number, number];
  gap?: number;
  /** Room catalog id (rooms and caps). */
  type?: string;
  name?: string;
  keyRoom?: KeyRoomInput & { index: number };
  start?: boolean;
  wins: WinPathId[];
  region: number;
  dist: number;
}

export type PassageKind = "line" | "open" | "door" | "oob" | "stairs";

export interface Passage {
  a: string;
  b: string;
  kind: PassageKind;
  /** Stairs: what links the decks. */
  via?: "stairs" | "lift" | "ladder";
  /** The corridor border that seals a section (seal_section win path). */
  seal?: boolean;
}

export interface SlotPlan {
  kind: "room" | "cross" | "oob";
  split: boolean;
  keys: string[];
}

export interface EndPlan {
  side: Side;
  kind: "connector" | "cap" | "oob";
  rows: [number, number];
  key: string;
  line?: number;
  gap?: number;
}

export interface DeckPlan {
  index: number;
  K: number;
  s: number;
  /** cells[band][col] */
  cells: SlotPlan[][][];
  ends: EndPlan[];
  /** Side where the deck's spine starts (line 1). */
  startSide: Side;
}

export interface WinPlan {
  type: WinPathId;
  node: string;
}

export interface Plan {
  decks: DeckPlan[];
  nodes: Map<string, PlanNode>;
  passages: Passage[];
  start: string;
  /** Start, then key rooms in act order. */
  sequence: string[];
  wins: WinPlan[];
  /** Floor nodes with a duct access point (the layout stage may add a few on its duct sheets). */
  access: Set<string>;
  maxDist: number;
}

const other = (s: Side): Side => (s === "L" ? "R" : "L");

function pickWeighted<T>(rng: Rng, items: Array<[T, number]>): T {
  const total = items.reduce((n, [, w]) => n + w, 0);
  let r = rng.next() * total;
  for (const [v, w] of items) {
    r -= w;
    if (r < 0) return v;
  }
  return items[items.length - 1]![0];
}

function shuffle<T>(rng: Rng, list: T[]): T[] {
  const a = list.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = rng.int(0, i);
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

/** Room type ids for ordinary rooms, honoring tags when asked. */
function roomTypeFor(rng: Rng, profile: SiteProfile, want?: (t: RoomType) => boolean): string {
  const pool = profile.rooms.filter(([id]) => !want || want(ROOM_TYPES[id]!));
  return pickWeighted(rng, pool.length > 0 ? pool : profile.rooms);
}

/** The zone count each deck aims for. */
function deckTargets(rng: Rng, inputs: MapInputs): number[] {
  const [lo, hi] = SIZE_ZONES[inputs.size];
  const total = rng.int(lo, hi);
  const out: number[] = [];
  for (let d = 0; d < inputs.decks; d++) out.push(Math.floor(total / inputs.decks) + (d < total % inputs.decks ? 1 : 0));
  return out;
}

interface Builder {
  nodes: Map<string, PlanNode>;
  passages: Passage[];
}

function addNode(b: Builder, n: Omit<PlanNode, "wins" | "region" | "dist">): PlanNode {
  const node: PlanNode = { ...n, wins: [], region: 1, dist: 0 };
  b.nodes.set(node.key, node);
  return node;
}

const corridorKey = (d: number, line: number, col: number) => `${d}:L${line}:c${col}`;

/** Build one deck's structure, aiming for `target` counted zones (everything but sealed stubs). */
function buildDeck(rng: Rng, b: Builder, d: number, target: number, startSide: Side, noDucts: boolean): DeckPlan {
  // Without ducts, key rooms need middle-band rooms (doors to two lines), so decks get more lines.
  let K = noDucts ? (target < 6 ? 1 : target < 20 ? 2 : 3) : target < 12 ? 1 : target < 20 ? (rng.next() < 0.5 ? 2 : 1) : target < 32 ? 2 : 3;
  const base = (s: number) => K * s + (K + 1) * s + (K - 1);
  let s = Math.min(6, Math.max(1, Math.round((0.75 * (target - (K - 1))) / (2 * K + 1))));
  while (s > 1 && base(s) > target) s--;
  while (K > 1 && base(s) > target) K--;

  // Ladder sides: gap j joins line j and j+1 on alternating sides, starting opposite the deck's start side.
  const gapSide = (j: number): Side => (j % 2 === 1 ? other(startSide) : startSide);
  const deck: DeckPlan = { index: d, K, s, cells: [], ends: [], startSide };
  for (let band = 0; band <= K; band++) {
    const row: SlotPlan[][] = [];
    for (let col = 0; col < s; col++) row.push([{ kind: "room", split: false, keys: [] }]);
    deck.cells.push(row);
  }
  for (let j = 1; j < K; j++) deck.ends.push({ side: gapSide(j), kind: "connector", rows: [2 * j - 1, 2 * j + 1], key: `${d}:${gapSide(j)}g${j}`, gap: j });

  const usedRows = (side: Side) => new Set(deck.ends.filter((e) => e.side === side).flatMap((e) => (e.rows[0] === e.rows[1] ? [e.rows[0]] : range(e.rows[0], e.rows[1]))));
  const freeLineEnds = (): Array<[number, Side]> => {
    const out: Array<[number, Side]> = [];
    for (let j = 1; j <= K; j++) for (const side of ["L", "R"] as Side[]) if (!usedRows(side).has(2 * j - 1)) out.push([j, side]);
    return out;
  };
  const capRows = (j: number, side: Side): [number, number] | undefined => {
    const used = usedRows(side);
    const opts = [2 * j - 2, 2 * j].filter((r) => r >= 0 && r <= 2 * K && !used.has(r));
    if (opts.length === 0) return undefined;
    // Outer bands first: caps there face the hull.
    const outer = opts.filter((r) => r === 0 || r === 2 * K);
    const r = outer.length > 0 && rng.next() < 0.7 ? outer[rng.int(0, outer.length - 1)]! : opts[rng.int(0, opts.length - 1)]!;
    return r < 2 * j - 1 ? [r, 2 * j - 1] : [2 * j - 1, r];
  };
  const addCap = (j: number, side: Side, kind: "cap" | "oob"): boolean => {
    const rows = capRows(j, side);
    if (!rows) return false;
    deck.ends.push({ side, kind, rows, key: `${d}:${side}${kind}${j}`, line: j });
    return true;
  };

  // Reserve the start cap on deck 0 (line 1, start side) when there is room for it.
  let extras = target - base(s);
  if (d === 0 && extras > 0 && !noDucts && addCap(1, startSide, "cap")) extras--;

  const middleBands = range(1, K - 1);
  /** Floor links between two lines stay near the ladder joining them, so they add loops without cutting the spine short. */
  const nearLadder = (band: number, col: number) => Math.abs(col - (gapSide(band) === "L" ? 0 : s - 1)) <= 1;
  let guard = 0;
  while (extras > 0 && guard++ < 500) {
    const choice = pickWeighted<string>(rng, [
      ["slot", 3],
      ["split", 2],
      ["cap", 2],
      ["cross", middleBands.length > 0 ? 1 : 0],
    ]);
    if (choice === "slot") {
      const band = noDucts && middleBands.length > 0 && rng.next() < 0.8 ? middleBands[rng.int(0, middleBands.length - 1)]! : rng.int(0, K);
      const col = rng.int(0, s - 1);
      const cell = deck.cells[band]![col]!;
      if (cell.length >= 3) continue;
      cell.splice(rng.int(0, cell.length), 0, { kind: "room", split: false, keys: [] });
      extras--;
    } else if (choice === "split") {
      const band = rng.next() < 0.5 ? 0 : K;
      const col = rng.int(0, s - 1);
      const cell = deck.cells[band]![col]!;
      const slot = cell[rng.int(0, cell.length - 1)]!;
      if (slot.kind !== "room" || slot.split) continue;
      slot.split = true;
      extras--;
    } else if (choice === "cap") {
      const free = freeLineEnds();
      if (free.length === 0) continue;
      const [j, side] = free[rng.int(0, free.length - 1)]!;
      if (addCap(j, side, "cap")) extras--;
    } else {
      const band = middleBands[rng.int(0, middleBands.length - 1)]!;
      if (deck.cells[band]!.some((c) => c.some((x) => x.kind === "cross"))) continue;
      const col = rng.int(0, s - 1);
      if (!nearLadder(band, col)) continue;
      const cell = deck.cells[band]![col]!;
      if (cell.length >= 3) continue;
      cell.splice(rng.int(0, cell.length), 0, { kind: "cross", split: false, keys: [] });
      extras--;
    }
  }

  // Out-of-bounds stubs at a free line end (sealed wings), not counted.
  const free = shuffle(rng, freeLineEnds());
  let stubs = 0;
  for (const [j, side] of free) {
    if (stubs >= 2) break;
    if (stubs === 0 || rng.next() < 0.35) if (addCap(j, side, "oob")) stubs++;
  }
  if (stubs === 0) {
    const band = rng.next() < 0.5 ? 0 : K;
    const cell = deck.cells[band]![rng.int(0, s - 1)]!;
    cell.push({ kind: "oob", split: false, keys: [] });
  }

  // Nodes.
  for (let j = 1; j <= K; j++) for (let col = 0; col < s; col++) addNode(b, { key: corridorKey(d, j, col), deck: d, role: "corridor", line: j, col });
  deck.cells.forEach((row, band) =>
    row.forEach((cell, col) =>
      cell.forEach((slot, i) => {
        const k = `${d}:b${band}:c${col}:s${i}`;
        if (slot.kind === "room" && slot.split) {
          addNode(b, { key: `${k}f`, deck: d, role: "room", band, col, slot: i, part: "front" });
          addNode(b, { key: `${k}b`, deck: d, role: "room", band, col, slot: i, part: "back" });
          slot.keys = [`${k}f`, `${k}b`];
        } else {
          addNode(b, { key: k, deck: d, role: slot.kind === "room" ? "room" : slot.kind === "cross" ? "cross" : "oob", band, col, slot: i, part: "full" });
          slot.keys = [k];
        }
      }),
    ),
  );
  for (const e of deck.ends) {
    addNode(b, { key: e.key, deck: d, role: e.kind === "connector" ? "connector" : e.kind, side: e.side, rows: e.rows, ...(e.line ? { line: e.line } : {}), ...(e.gap ? { gap: e.gap } : {}) });
  }

  // Passages.
  const P = (a: string, bKey: string, kind: PassageKind) => b.passages.push({ a, b: bKey, kind });
  for (let j = 1; j <= K; j++) for (let col = 0; col + 1 < s; col++) P(corridorKey(d, j, col), corridorKey(d, j, col + 1), "line");
  const endCol = (side: Side) => (side === "L" ? 0 : s - 1);
  for (const e of deck.ends) {
    if (e.kind === "connector") {
      P(e.key, corridorKey(d, e.gap!, endCol(e.side)), "open");
      P(e.key, corridorKey(d, e.gap! + 1, endCol(e.side)), "open");
    } else {
      P(e.key, corridorKey(d, e.line!, endCol(e.side)), e.kind === "oob" ? "oob" : "door");
    }
  }
  deck.cells.forEach((row, band) => {
    const linesOf = band === 0 ? [1] : band === K ? [K] : [band, band + 1];
    const slots = row.flatMap((cell, col) => cell.map((slot) => ({ slot, col })));
    for (const { slot, col } of slots) {
      const near = slot.keys[0]!;
      if (slot.kind === "oob") {
        P(near, corridorKey(d, linesOf[0]!, col), "oob");
        continue;
      }
      if (slot.kind === "cross") {
        for (const j of linesOf) P(near, corridorKey(d, j, col), "open");
        continue;
      }
      if (slot.split) P(slot.keys[0]!, slot.keys[1]!, "door");
      if (linesOf.length === 1) P(near, corridorKey(d, linesOf[0]!, col), "door");
      else {
        const first = rng.int(0, 1);
        P(near, corridorKey(d, linesOf[first]!, col), "door");
        if (noDucts ? rng.next() < 0.6 : nearLadder(band, col) && rng.next() < 0.5) P(near, corridorKey(d, linesOf[1 - first]!, col), "door");
      }
    }
    // Side doors between neighbouring rooms in a band (suites).
    for (let i = 0; i + 1 < slots.length; i++) {
      const x = slots[i]!.slot;
      const y = slots[i + 1]!.slot;
      if (x.kind !== "room" || y.kind !== "room") continue;
      const middle = linesOf.length > 1;
      if (middle && !noDucts && !(nearLadder(band, slots[i]!.col) && nearLadder(band, slots[i + 1]!.col))) continue;
      if (rng.next() < 0.25) P(x.keys[0]!, y.keys[0]!, "door");
    }
  });
  return deck;
}

function range(lo: number, hi: number): number[] {
  const out: number[] = [];
  for (let i = lo; i <= hi; i++) out.push(i);
  return out;
}

/** Adjacency over passages (optionally without sealed stubs and deck links). */
export function passageAdjacency(plan: Pick<Plan, "nodes" | "passages">, opts: { stairs?: boolean } = {}): Adjacency {
  const ok = (k: string) => plan.nodes.get(k)?.role !== "oob";
  return buildAdjacency(
    [...plan.nodes.keys()].filter(ok),
    plan.passages.filter((p) => p.kind !== "oob" && (opts.stairs !== false || p.kind !== "stairs") && ok(p.a) && ok(p.b)).map((p) => [p.a, p.b] as [string, string]),
  );
}

const keywordScore = (name: string, type: RoomType): number => {
  const n = name.toLowerCase();
  return (type.keywords ?? []).some((k) => n.includes(k)) ? 1 : 0;
};

/** The catalog type a key room name suggests, if any. */
export function typeForName(name: string, profile: SiteProfile): string | undefined {
  const preferred = profile.rooms.map(([id]) => id);
  const all = [...preferred, ...Object.keys(ROOM_TYPES).filter((id) => !preferred.includes(id))];
  return all.find((id) => keywordScore(name, ROOM_TYPES[id]!) > 0);
}

/** Generated key rooms when the brief names none: one more than the runtime in hours, 3 to 6 (at most 4 on a small map, 5 on a medium one), spread over the acts. */
function generatedKeyRooms(inputs: MapInputs): KeyRoomInput[] {
  const cap = inputs.size === "small" ? 4 : inputs.size === "medium" ? 5 : 6;
  const n = Math.min(cap, Math.max(3, inputs.runtime_h + 1));
  const out: KeyRoomInput[] = [];
  for (let i = 0; i < n; i++) out.push({ name: "", act: Math.min(3, 1 + Math.floor((i * 3) / n)) });
  return out;
}

/** Stage 1: the zone graph. */
export function planSite(rng: Rng, inputs: MapInputs, profile: SiteProfile): Plan {
  const noDucts = DUCT_SHARE[inputs.duct_density] === 0;
  const b: Builder = { nodes: new Map(), passages: [] };
  const targets = deckTargets(rng, inputs);
  const decks: DeckPlan[] = [];
  let side: Side = "L";
  for (let d = 0; d < targets.length; d++) {
    const deck = buildDeck(rng, b, d, targets[d]!, side, noDucts);
    decks.push(deck);
    side = deck.K % 2 === 1 ? other(side) : side;
  }

  // Deck links: the end of one deck's spine to the start of the next, plus a lift mid-deck.
  const endSideOf = (deck: DeckPlan): Side => (deck.K % 2 === 1 ? other(deck.startSide) : deck.startSide);
  for (let d = 0; d + 1 < decks.length; d++) {
    const up = decks[d]!;
    const down = decks[d + 1]!;
    const col = (deck: DeckPlan, s: Side) => (s === "L" ? 0 : deck.s - 1);
    const aEnd = corridorKey(d, up.K, col(up, endSideOf(up)));
    const bStart = corridorKey(d + 1, 1, col(down, down.startSide));
    b.passages.push({ a: aEnd, b: bStart, kind: "stairs", via: rng.next() < 0.5 ? "stairs" : "ladder" });
    // A lift one column along: a second way between the decks that does not cut the spine short.
    // (With one column, the lift joins the neighbouring line instead.)
    const step = (deck: DeckPlan, s: Side) => (s === "L" ? 1 : deck.s - 2);
    const liftUp = up.s > 1 ? corridorKey(d, up.K, step(up, endSideOf(up))) : up.K > 1 ? corridorKey(d, up.K - 1, col(up, endSideOf(up))) : undefined;
    const liftDown = down.s > 1 ? corridorKey(d + 1, 1, step(down, down.startSide)) : down.K > 1 ? corridorKey(d + 1, 2, col(down, down.startSide)) : undefined;
    if (liftUp && liftDown) b.passages.push({ a: liftUp, b: liftDown, kind: "stairs", via: "lift" });
  }

  // Start: the reserved cap on deck 0, else a room at the start end (two doors when there are no ducts).
  const nodes = b.nodes;
  const all = [...nodes.values()];
  const deck0 = decks[0]!;
  const startCol = deck0.startSide === "L" ? 0 : deck0.s - 1;
  let start = noDucts ? undefined : all.find((n) => n.deck === 0 && n.role === "cap" && n.line === 1 && n.side === deck0.startSide);
  if (!start) {
    const rooms = all.filter((n) => n.deck === 0 && n.role === "room" && n.part !== "back" && n.col === startCol);
    const pref = noDucts ? rooms.filter((n) => n.band !== undefined && n.band > 0 && n.band < deck0.K) : rooms.filter((n) => n.band === 0);
    start = (pref.length > 0 ? pref : rooms)[0] ?? all.find((n) => n.role === "room")!;
    if (noDucts && start.band !== undefined && start.band > 0 && start.band < deck0.K) ensureTwoLines(b, start);
  }
  start.start = true;
  start.type = (start.role === "cap" ? profile.start : profile.start.filter((id) => !ROOM_TYPES[id]!.tags?.includes("hull")).concat(profile.start))[0];

  // Distances along passages give the spine order and the act regions.
  const adj = passageAdjacency({ nodes, passages: b.passages });
  const dist = bfs(adj, start.key);
  let maxDist = 1;
  for (const v of dist.values()) maxDist = Math.max(maxDist, v);
  for (const n of all) {
    n.dist = dist.get(n.key) ?? maxDist;
    const f = n.dist / maxDist;
    n.region = f < 0.34 ? 1 : f < 0.67 ? 2 : 3;
  }

  const roomish = (n: PlanNode) => (n.role === "room" || n.role === "cap") && !n.start;
  const used = new Set<string>([start.key]);
  const hasHull = (n: PlanNode) => {
    if (n.role === "cap") return true;
    const deck = decks[n.deck]!;
    if (n.band === 0 || n.band === deck.K) return n.part !== "front";
    return false;
  };

  // Win paths: far from the start; escape craft and airlocks need an outer wall.
  const wins: WinPlan[] = [];
  let sealDone = false;
  for (const type of inputs.win_paths) {
    if (type === "seal_section") {
      // A corridor border between act regions 2 and 3 (or the latest one available) becomes a sealable blast door.
      const lines = b.passages.filter((p) => p.kind === "line" && !p.seal);
      const scored = lines
        .map((p) => {
          const x = nodes.get(p.a)!;
          const y = nodes.get(p.b)!;
          const near = x.dist <= y.dist ? x : y;
          return { p, near, score: Math.abs(Math.min(x.dist, y.dist) / maxDist - 0.6) + rng.next() * 0.05 };
        })
        .filter((s) => s.near.dist !== nodes.get(s.p.a === s.near.key ? s.p.b : s.p.a)!.dist)
        .sort((x, y) => x.score - y.score);
      const best = scored[0];
      if (best && !sealDone) {
        best.p.seal = true;
        sealDone = true;
        best.near.wins.push(type);
        wins.push({ type, node: best.near.key });
        continue;
      }
    }
    const needHull = type === "escape_craft" || type === "airlock";
    const candidates = all.filter((n) => roomish(n) && !used.has(n.key) && (!needHull || hasHull(n)));
    const pool = candidates.length > 0 ? candidates : all.filter((n) => roomish(n) && !used.has(n.key));
    if (pool.length === 0) continue;
    const pick = pool.slice().sort((x, y) => y.dist - x.dist || (x.key < y.key ? -1 : 1))[Math.min(pool.length - 1, rng.int(0, 1))]!;
    used.add(pick.key);
    pick.wins.push(type);
    const t = profile.win[type].find((id) => ROOM_TYPES[id]) ?? pick.type;
    if (t) pick.type = t;
    wins.push({ type, node: pick.key });
  }

  // Key rooms in act order, spread along the regions.
  const keyInputs = (inputs.key_rooms.length > 0 ? inputs.key_rooms : generatedKeyRooms(inputs)).map((k, index) => ({ ...k, index }));
  keyInputs.sort((x, y) => x.act - y.act || x.index - y.index);
  const sequence = [start.key];
  for (const a of [1, 2, 3]) {
    const inAct = keyInputs.filter((k) => k.act === a);
    inAct.forEach((k, i) => {
      const targetF = (a - 1) / 3 + (i + 0.5) / (3 * inAct.length);
      const named = k.name ? typeForName(k.name, profile) : undefined;
      let candidates = all.filter((n) => roomish(n) && !used.has(n.key) && n.wins.length === 0);
      if (noDucts) {
        const middle = candidates.filter((n) => n.band !== undefined && n.band > 0 && n.band < decks[n.deck]!.K);
        if (middle.length > 0) candidates = middle;
      }
      if (candidates.length === 0) candidates = all.filter((n) => roomish(n) && !used.has(n.key));
      if (candidates.length === 0) return;
      const scored = candidates
        .map((n) => ({
          n,
          score: Math.abs(n.dist / maxDist - targetF) + (n.region === a ? 0 : 0.5) - (named && n.type === named ? 0.1 : 0) + rng.next() * 0.04,
        }))
        .sort((x, y) => x.score - y.score);
      const node = scored[0]!.n;
      used.add(node.key);
      node.keyRoom = k;
      if (named) node.type = named;
      node.name = k.name || undefined;
      if (noDucts) ensureTwoLines(b, node);
      sequence.push(node.key);
    });
  }

  // Room types and names for the rest.
  for (const n of all) {
    if (n.role === "room" || n.role === "cap") {
      if (!n.type) n.type = roomTypeFor(rng, profile, n.part === "back" ? (t) => (t.tags ?? []).includes("dead_end") : undefined);
      if (!n.name) n.name = ROOM_TYPES[n.type]!.name;
    }
  }

  // Ducts: a share of the rooms (always the start and the key rooms) get access points,
  // two or more per deck. The duct sheets themselves are grown by the layout stage.
  const access = new Set<string>();
  const share = DUCT_SHARE[inputs.duct_density];
  if (share > 0) {
    for (const k of sequence) access.add(k);
    const rooms = shuffle(
      rng,
      all.filter((n) => n.role === "room" || n.role === "cap"),
    );
    const want = Math.max(2, Math.round(share * rooms.length));
    for (const n of rooms) {
      if (access.size >= want) break;
      access.add(n.key);
    }
    for (const deck of decks) {
      let here = [...access].filter((k) => nodes.get(k)!.deck === deck.index).length;
      for (const n of rooms.filter((x) => x.deck === deck.index)) {
        if (here >= 2) break;
        if (!access.has(n.key)) {
          access.add(n.key);
          here++;
        }
      }
    }
  }

  return { decks, nodes, passages: b.passages, start: start.key, sequence, wins, access, maxDist };
}

/** A middle-band room gets doors to both corridor lines it touches (a second route without ducts). */
function ensureTwoLines(b: Builder, n: PlanNode): void {
  if (n.band === undefined || n.col === undefined || n.part === "back") return;
  for (const j of [n.band, n.band + 1]) {
    const c = corridorKey(n.deck, j, n.col);
    if (!b.nodes.has(c)) continue;
    if (!b.passages.some((p) => (p.a === n.key && p.b === c) || (p.b === n.key && p.a === c))) b.passages.push({ a: n.key, b: c, kind: "door" });
  }
}
