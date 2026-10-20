/**
 * Stage 2 of the site map generator: the grid layout. Gives every line of
 * each deck's sketch a size on a 1 m grid (corridor lines the site's corridor
 * width, room lines what their rooms ask of the catalog), turns plan nodes
 * into rectangles, numbers the zones in reading order (Z01...), and measures
 * shared edges and the edges that face the hull. Then it grows the duct
 * sheets (ducts.ts) and gives every sheet and deck its level.
 */
import type { MapDeck, MapPoint, MapZoneData, Rng } from "@campaign-forge/module-sdk";
import { ROOM_TYPES, type SiteProfile } from "./data";
import { layoutDucts, type DuctLayout } from "./ducts";
import type { MapInputs } from "./inputs";
import type { Plan, PlanNode } from "./plan";
import { sizeSketch, type ZoneDemand } from "./sketch";

export interface Rect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export interface GeoAdj {
  a: string;
  b: string;
  seg: [MapPoint, MapPoint];
  len: number;
}

export interface LayoutResult {
  decks: MapDeck[];
  rects: Map<string, Rect>;
  /** Plan node key -> floor zone id. */
  zoneOf: Map<string, string>;
  /** Floor zone id -> plan node key. */
  nodeOf: Map<string, string>;
  /** Floor zones then duct zones, without dressing. */
  zones: MapZoneData[];
  /** Floor zones that share an edge, with the shared segment. */
  adjacency: GeoAdj[];
  /** Duct sheets, their zones, links and exits. */
  ducts: DuctLayout;
}

export const rectPoly = (r: Rect): MapPoint[] => [
  [r.x0, r.y0],
  [r.x1, r.y0],
  [r.x1, r.y1],
  [r.x0, r.y1],
];

/** Bounding box of a polygon. */
export function polyBounds(poly: MapPoint[]): Rect {
  const xs = poly.map((p) => p[0]);
  const ys = poly.map((p) => p[1]);
  return { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) };
}

const pad = (n: number) => String(n).padStart(2, "0");

function sharedSegment(a: Rect, b: Rect): [MapPoint, MapPoint] | undefined {
  if (a.x1 === b.x0 || b.x1 === a.x0) {
    const x = a.x1 === b.x0 ? a.x1 : a.x0;
    const lo = Math.max(a.y0, b.y0);
    const hi = Math.min(a.y1, b.y1);
    if (hi > lo) return [
      [x, lo],
      [x, hi],
    ];
  }
  if (a.y1 === b.y0 || b.y1 === a.y0) {
    const y = a.y1 === b.y0 ? a.y1 : a.y0;
    const lo = Math.max(a.x0, b.x0);
    const hi = Math.min(a.x1, b.x1);
    if (hi > lo) return [
      [lo, y],
      [hi, y],
    ];
  }
  return undefined;
}

/** Parts of a rectangle's outline that no neighbour covers (they face the hull or the outside). */
function outerEdges(r: Rect, segs: Array<[MapPoint, MapPoint]>): Array<[MapPoint, MapPoint]> {
  const sides: Array<{ fixed: "x" | "y"; at: number; lo: number; hi: number }> = [
    { fixed: "y", at: r.y0, lo: r.x0, hi: r.x1 },
    { fixed: "x", at: r.x1, lo: r.y0, hi: r.y1 },
    { fixed: "y", at: r.y1, lo: r.x0, hi: r.x1 },
    { fixed: "x", at: r.x0, lo: r.y0, hi: r.y1 },
  ];
  const out: Array<[MapPoint, MapPoint]> = [];
  for (const s of sides) {
    const covered = segs
      .filter(([p, q]) => (s.fixed === "x" ? p[0] === s.at && q[0] === s.at : p[1] === s.at && q[1] === s.at))
      .map(([p, q]) => (s.fixed === "x" ? [Math.min(p[1], q[1]), Math.max(p[1], q[1])] : [Math.min(p[0], q[0]), Math.max(p[0], q[0])]) as [number, number])
      .sort((x, y) => x[0] - y[0]);
    let cur = s.lo;
    const push = (lo: number, hi: number) => {
      if (hi <= lo) return;
      out.push(s.fixed === "x" ? [[s.at, lo], [s.at, hi]] : [[lo, s.at], [hi, s.at]]);
    };
    for (const [lo, hi] of covered) {
      push(cur, Math.min(lo, s.hi));
      cur = Math.max(cur, hi);
    }
    push(cur, s.hi);
  }
  return out;
}

const DECK_LETTERS = "ABCDEFGH";
const NAME_LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

/** Stage 2: sizes and places every zone. */
export function layoutSite(rng: Rng, plan: Plan, profile: SiteProfile, inputs: MapInputs): LayoutResult {
  const rects = new Map<string, Rect>();
  const decks: MapDeck[] = [];
  const nodes = plan.nodes;
  const typeOf = (n: PlanNode) => (n.type ? ROOM_TYPES[n.type] : undefined);
  const [cwLo, cwHi] = profile.corridorWidth;

  const scale = (r: [number, number], k: number): [number, number] => [Math.max(4, Math.round(r[0] * k)), Math.max(4, Math.round(r[1] * k))];

  for (const deck of plan.decks) {
    const sk = deck.sketch;
    const d = deck.index;
    const demands: ZoneDemand[] = [];
    // Minimum sizes leave room for a zone's number, flags and markers: rooms and yards 5 m each way
    // (8 m along when the other way is held thin by corridor or set-range lines), corridors 7 m long (5 m when 3 m wide).
    // (a 2 m corridor needs more length for its doors and markers than a 3 m tunnel)
    const corrLen = cwLo <= 2 ? 7 : 5;
    const thin = (lines: typeof sk.cols, lo: number, hi: number) => {
      const span = lines.slice(lo, hi + 1);
      return span.every((l) => l.kind === "corr" || l.range) && span.reduce((n, l) => n + (l.kind === "corr" ? cwHi : l.range![1]), 0) < 5;
    };
    for (const [key, b] of sk.boxes) {
      const n = nodes.get(key)!;
      const t = typeOf(n);
      const tx = thin(sk.cols, b.c0, b.c1);
      const ty = thin(sk.rows, b.r0, b.r1);
      const min = n.role === "corridor" ? { x: ty ? corrLen : 0, y: tx ? corrLen : 0 } : n.role === "oob" ? {} : { x: ty ? 8 : 5, y: tx ? 8 : 5 };
      if ((n.role === "room" || n.role === "cap") && t) demands.push({ box: b, x: scale(t.w, profile.roomScale), y: scale(t.d, profile.roomScale), min });
      else demands.push({ box: b, free: true, min });
    }
    const { colW, rowH } = sizeSketch(rng, sk, demands, { corridor: [cwLo, cwHi], free: profile.freeLine, max: 24 });
    const colX: number[] = [];
    let x = 1;
    for (const w of colW) {
      colX.push(x);
      x += w;
    }
    const rowY: number[] = [];
    let y = 1;
    for (const h of rowH) {
      rowY.push(y);
      y += h;
    }
    for (const [key, b] of sk.boxes) rects.set(key, { x0: colX[b.c0]!, y0: rowY[b.r0]!, x1: colX[b.c1]! + colW[b.c1]!, y1: rowY[b.r1]! + rowH[b.r1]! });
    const letter = DECK_LETTERS[d] ?? String(d + 1);
    decks.push({ id: letter, name: profile.hull === "space" ? `Deck ${letter}` : `Level ${d + 1}`, width: x + 1, height: y + 1, layer: "floor" });
  }

  // Number floor zones in reading order, deck by deck.
  const floorKeys = [...nodes.keys()].filter((k) => rects.has(k));
  floorKeys.sort((a, b) => {
    const na = nodes.get(a)!;
    const nb = nodes.get(b)!;
    const ra = rects.get(a)!;
    const rb = rects.get(b)!;
    return na.deck - nb.deck || ra.y0 - rb.y0 || ra.x0 - rb.x0 || (a < b ? -1 : 1);
  });
  const zoneOf = new Map<string, string>();
  const nodeOf = new Map<string, string>();
  floorKeys.forEach((k, i) => {
    const id = `Z${pad(i + 1)}`;
    zoneOf.set(k, id);
    nodeOf.set(id, k);
  });

  // Names: duplicates get a number (rooms) or a letter (corridors and yards); key rooms keep theirs.
  const oobName = profile.hull === "space" ? "Sealed section" : profile.hull === "ground" ? "Sealed wing" : "Collapsed tunnel";
  const baseName = (n: PlanNode): string | undefined => {
    if (n.role === "corridor") return n.name ?? profile.corridorName;
    if (n.role === "yard") return n.name ?? "Yard";
    if (n.role === "oob") return n.name ?? oobName;
    return n.name ?? typeOf(n)?.name;
  };
  const zones: MapZoneData[] = [];
  const nameCount = new Map<string, number>();
  for (const k of floorKeys) {
    const n = nodes.get(k)!;
    const name = baseName(n);
    if (name && !n.keyRoom) nameCount.set(name, (nameCount.get(name) ?? 0) + 1);
  }
  const nameSeen = new Map<string, number>();
  for (const k of floorKeys) {
    const n = nodes.get(k)!;
    const r = rects.get(k)!;
    const t = typeOf(n);
    let name = baseName(n);
    if (name && !n.keyRoom && (nameCount.get(name) ?? 0) > 1) {
      const i = (nameSeen.get(name) ?? 0) + 1;
      nameSeen.set(name, i);
      name = `${name} ${n.role === "corridor" || n.role === "yard" ? (NAME_LETTERS[i - 1] ?? String(i)) : i}`;
    }
    const kind: MapZoneData["kind"] = n.role === "room" || n.role === "cap" ? "room" : n.role === "oob" ? "out-of-bounds" : n.role === "yard" ? "exterior" : "corridor";
    const zone: MapZoneData = {
      id: zoneOf.get(k)!,
      deck: decks[n.deck]!.id,
      kind,
      layer: "floor",
      poly: rectPoly(r),
      cluttered: false,
      acts: [n.region],
      flags: { sizeM: Math.max(r.x1 - r.x0, r.y1 - r.y0) },
    };
    if (name) zone.name = name;
    if (kind === "room") zone.area = t?.area ?? "ops";
    else if (kind === "corridor") zone.area = "transit";
    if (n.keyRoom) {
      zone.key = true;
      zone.acts = [n.keyRoom.act];
    }
    zones.push(zone);
  }

  // Shared edges and outer edges per deck.
  const adjacency: GeoAdj[] = [];
  const segsOf = new Map<string, Array<[MapPoint, MapPoint]>>();
  for (let i = 0; i < floorKeys.length; i++) {
    for (let j = i + 1; j < floorKeys.length; j++) {
      const a = floorKeys[i]!;
      const b = floorKeys[j]!;
      if (nodes.get(a)!.deck !== nodes.get(b)!.deck) continue;
      const seg = sharedSegment(rects.get(a)!, rects.get(b)!);
      if (!seg) continue;
      const len = Math.abs(seg[1][0] - seg[0][0]) + Math.abs(seg[1][1] - seg[0][1]);
      adjacency.push({ a: zoneOf.get(a)!, b: zoneOf.get(b)!, seg, len });
      segsOf.set(a, [...(segsOf.get(a) ?? []), seg]);
      segsOf.set(b, [...(segsOf.get(b) ?? []), seg]);
    }
  }
  for (const z of zones) {
    const k = nodeOf.get(z.id)!;
    const edges = outerEdges(rects.get(k)!, segsOf.get(k) ?? []);
    if (edges.length > 0) z.flags = { ...z.flags, outerEdges: edges };
  }

  // Duct sheets: their own mazes on their own grids (a separate stream, so the floor plan does not depend on them).
  const floorDecks = decks.slice();
  const ducts = layoutDucts(rng.fork("ducts"), { plan, profile, inputs, decks: floorDecks, zoneOf, floorZones: new Map(zones.map((z) => [z.id, z])) });
  zones.push(...ducts.zones);
  // Levels, lowest first: a crawlspace under a deck, the deck, the ducts over it, the next deck...
  const ordered: MapDeck[] = [];
  for (const deck of floorDecks) {
    const under = ducts.sheets.find((s) => s.serves === deck.id && s.role === "lower");
    const over = ducts.sheets.find((s) => s.serves === deck.id && s.role === "upper");
    if (under) ordered.push(under.deck);
    ordered.push(deck);
    if (over) ordered.push(over.deck);
  }
  ordered.forEach((deck, i) => (deck.level = i));
  decks.push(...ducts.sheets.map((s) => s.deck));
  return { decks, rects, zoneOf, nodeOf, zones, adjacency, ducts };
}
