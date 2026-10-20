/**
 * Stage 1 of the site map generator: the zone graph. Each deck is drawn by
 * its site's floor plan archetype (archetypes.ts) on a sketch grid of lines
 * with no size yet (sketch.ts): corridors, rooms, yards and sealed sections
 * as rectangles of cells, and passages between the ones that touch. Then the
 * decks are joined by stairs and a lift, and the start, act regions, key
 * rooms, win-path endpoints and duct access points are chosen. No sizes yet:
 * the layout stage gives every line a width in metres (layout.ts) and grows
 * each deck's duct sheets (ducts.ts).
 */
import type { Rng } from "@campaign-forge/module-sdk";
import { DUCT_SHARE, ROOM_TYPES, SIZE_ZONES, type RoomType, type SiteProfile, type WinPathId } from "./data";
import type { KeyRoomInput, MapInputs } from "./inputs";
import { bfs, buildAdjacency, largestBlock, type Adjacency } from "./graph";
import { ARCHETYPE_BUILDERS, corridorish, DeckDraft } from "./archetypes";
import type { Sketch } from "./sketch";

export type NodeRole = "corridor" | "room" | "cap" | "oob" | "yard";

export interface PlanNode {
  key: string;
  deck: number;
  role: NodeRole;
  /** Base name for corridors, yards, sealed sections and fixed rooms ("Spine", "Bridge"); rooms otherwise take their type's name. */
  name?: string;
  /** Room catalog id (rooms). */
  type?: string;
  /** Room types to draw from instead of the site's catalog. */
  pool?: string[];
  /** A back room: its type comes from the dead-end rooms. */
  back?: boolean;
  /** A lock or vestibule on the way (decon): never a key room, start or win path. */
  transit?: boolean;
  /** Part of a secure wing. */
  secure?: boolean;
  /** Faces the hull or the outside (escape craft and airlocks need it). */
  hull: boolean;
  /** Corridors and yards it touches (each could take a door). */
  ways: number;
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
  /** A secure door: locked from the start when the routes allow it. */
  secure?: boolean;
}

export interface DeckPlan {
  index: number;
  sketch: Sketch;
  /** Where the route along the deck starts and ends. */
  near: string;
  far: string;
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
  const nodes = new Map<string, PlanNode>();
  const passages: Passage[] = [];
  const targets = deckTargets(rng, inputs);
  const decks: DeckPlan[] = [];
  const outs: Array<ReturnType<(typeof ARCHETYPE_BUILDERS)[keyof typeof ARCHETYPE_BUILDERS]>> = [];
  const drafts: DeckDraft[] = [];
  const blocks: Array<Set<string>> = [];
  for (let d = 0; d < targets.length; d++) {
    const D = new DeckDraft({ rng, d, target: targets[d]!, noDucts, profile, odd: d % 2 === 1 });
    const out = ARCHETYPE_BUILDERS[profile.layout](D);
    D.sk.compact();
    // Ways: zones a room touches that lie in the deck's main block (two doors into it make two separate routes);
    // a room already in the block counts as two.
    const block = largestBlock(D.adjacency());
    blocks.push(block);
    for (const n of D.nodes.values()) {
      n.hull = n.role !== "oob" && n.role !== "yard" && D.sk.facesOut(n.key, (k) => D.nodes.get(k)?.role === "yard");
      const touching = D.sk.neighbours(n.key).filter((k) => block.has(k) && D.nodes.get(k)!.role !== "oob").length;
      n.ways = block.has(n.key) ? Math.max(2, touching) : touching;
      nodes.set(n.key, n);
    }
    passages.push(...D.passages);
    decks.push({ index: d, sketch: D.sk, near: out.near, far: out.far });
    outs.push(out);
    drafts.push(D);
  }

  // Deck links: the end of one deck's route to the start of the next, plus a lift beside them
  // (the deck's own choice, else the corridor or yard nearest each end).
  const nearest = (d: number, from: string): string | undefined => {
    const D = drafts[d]!;
    const adjD = buildAdjacency(
      [...D.nodes.keys()],
      D.passages.filter((p) => p.kind !== "oob").map((p) => [p.a, p.b] as [string, string]),
    );
    const dd = bfs(adjD, from);
    // A corridor or yard if there is one, else a room (a lift in a room).
    return [...D.nodes.values()]
      .filter((n) => n.key !== from && n.role !== "oob" && dd.has(n.key))
      .sort((x, y) => (corridorish(x) ? 0 : 1) - (corridorish(y) ? 0 : 1) || dd.get(x.key)! - dd.get(y.key)! || (x.key < y.key ? -1 : 1))[0]?.key;
  };
  for (let d = 0; d < outs.length; d++) {
    const o = outs[d]!;
    if (!o.far2 || o.far2 === o.far) o.far2 = nearest(d, o.far);
    if (!o.near2 || o.near2 === o.near) o.near2 = nearest(d, o.near);
  }
  for (let d = 0; d + 1 < decks.length; d++) {
    const up = outs[d]!;
    const down = outs[d + 1]!;
    const via = profile.layout === "ruin" ? "stairs" : profile.layout === "mine" ? "ladder" : rng.next() < 0.5 ? "stairs" : "ladder";
    passages.push({ a: up.far, b: down.near, kind: "stairs", via });
    if (up.far2 && down.near2) passages.push({ a: up.far2, b: down.near2, kind: "stairs", via: profile.layout === "ruin" ? "stairs" : "lift" });
  }

  // Start: the first deck's preferred start room (one with two ways out when there are no ducts).
  const all = [...nodes.values()];
  const startable = (k: string) => {
    const n = nodes.get(k);
    return !!n && n.role === "room" && !n.transit;
  };
  const prefs = outs[0]!.starts.filter(startable);
  const roomsOnDeck0 = all.filter((n) => n.deck === 0 && n.role === "room" && !n.transit).map((n) => n.key);
  let startKey = noDucts ? (prefs.find((k) => nodes.get(k)!.ways >= 2) ?? roomsOnDeck0.find((k) => nodes.get(k)!.ways >= 2)) : undefined;
  startKey ??= prefs[0] ?? roomsOnDeck0[0] ?? all.find((n) => n.role === "room")!.key;
  const start = nodes.get(startKey)!;
  if (noDucts) ensureTwoWays(drafts[start.deck]!, blocks[start.deck]!, passages, start);
  start.start = true;
  start.type = (start.hull ? profile.start : profile.start.filter((id) => !ROOM_TYPES[id]!.tags?.includes("hull")).concat(profile.start))[0];
  delete start.name;
  delete start.pool;
  delete start.back;

  // Distances along passages give the spine order and the act regions.
  const adj = passageAdjacency({ nodes, passages });
  const dist = bfs(adj, start.key);
  let maxDist = 1;
  for (const v of dist.values()) maxDist = Math.max(maxDist, v);
  for (const n of all) {
    n.dist = dist.get(n.key) ?? maxDist;
    const f = n.dist / maxDist;
    n.region = f < 0.34 ? 1 : f < 0.67 ? 2 : 3;
  }

  const roomish = (n: PlanNode) => (n.role === "room" || n.role === "cap") && !n.start && !n.transit;
  const used = new Set<string>([start.key]);

  // Win paths: far from the start; escape craft and airlocks need an outer wall.
  const wins: WinPlan[] = [];
  let sealDone = false;
  for (const type of inputs.win_paths) {
    if (type === "seal_section") {
      // A corridor border between act regions 2 and 3 (or the latest one available) becomes a sealable blast door.
      const lines = passages.filter((p) => p.kind === "line" && !p.seal);
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
    const candidates = all.filter((n) => roomish(n) && !used.has(n.key) && (!needHull || n.hull));
    const pool = candidates.length > 0 ? candidates : all.filter((n) => roomish(n) && !used.has(n.key));
    if (pool.length === 0) continue;
    const pick = pool.slice().sort((x, y) => y.dist - x.dist || (x.key < y.key ? -1 : 1))[Math.min(pool.length - 1, rng.int(0, 1))]!;
    used.add(pick.key);
    pick.wins.push(type);
    const t = profile.win[type].find((id) => ROOM_TYPES[id]) ?? pick.type;
    if (t) pick.type = t;
    delete pick.name;
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
        const twoWays = candidates.filter((n) => n.ways >= 2);
        if (twoWays.length > 0) candidates = twoWays;
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
      if (noDucts) ensureTwoWays(drafts[node.deck]!, blocks[node.deck]!, passages, node);
      sequence.push(node.key);
    });
  }

  // Room types and names for the rest.
  for (const n of all) {
    if (n.role === "room" || n.role === "cap") {
      if (!n.type && n.pool) n.type = n.pool[rng.int(0, n.pool.length - 1)];
      if (!n.type) n.type = roomTypeFor(rng, profile, n.back ? (t) => (t.tags ?? []).includes("dead_end") : undefined);
      if (!n.name) n.name = ROOM_TYPES[n.type!]!.name;
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

  return { decks, nodes, passages, start: start.key, sequence, wins, access, maxDist };
}

/** Without ducts, a start or key room gets doors to two corridors or yards it touches (a second route). */
function ensureTwoWays(D: DeckDraft, block: Set<string>, passages: Passage[], n: PlanNode): void {
  if (block.has(n.key)) return;
  const linked = (k: string) => passages.some((p) => (p.a === n.key && p.b === k) || (p.b === n.key && p.a === k));
  const nbrs = D.sk.neighbours(n.key).filter((k) => D.nodes.get(k)!.role !== "oob");
  let have = nbrs.filter((k) => block.has(k) && linked(k)).length;
  const order = [...nbrs.filter((x) => block.has(x) && corridorish(D.nodes.get(x))), ...nbrs.filter((x) => block.has(x) && !corridorish(D.nodes.get(x))), ...nbrs.filter((x) => !block.has(x) && corridorish(D.nodes.get(x)))];
  for (const k of order) {
    if (have >= 2) break;
    if (linked(k)) continue;
    passages.push({ a: n.key, b: k, kind: "door" });
    if (block.has(k)) have++;
  }
}
