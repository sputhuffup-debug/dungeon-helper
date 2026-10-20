/**
 * Stage 2 of the site map generator: the grid layout. Sizes every row
 * (bands of rooms and corridor lines) and column of each deck on a 1 m grid,
 * turns plan nodes into rectangles, numbers the zones in reading order
 * (Z01...), and measures shared edges and the edges that face the hull. Then
 * it grows the duct sheets (ducts.ts) and gives every sheet and deck its level.
 */
import type { MapDeck, MapPoint, MapZoneData, Rng } from "@campaign-forge/module-sdk";
import { ROOM_TYPES, type SiteProfile } from "./data";
import { layoutDucts, type DuctLayout } from "./ducts";
import type { MapInputs } from "./inputs";
import type { Plan, PlanNode } from "./plan";

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

/** Integer widths in [lo, hi] (soft) summing to `total`; never below `floors`, never above `caps`. */
function partition(rng: Rng, total: number, ranges: Array<[number, number]>, floors: number[], caps: number[]): number[] {
  const mins = ranges.map((r) => r[0]);
  const sum = mins.reduce((a, b) => a + b, 0);
  let w: number[];
  if (sum >= total) {
    w = mins.map((m, i) => Math.min(caps[i]!, Math.max(floors[i]!, Math.floor((m * total) / sum))));
  } else {
    w = mins.slice();
    let rem = total - sum;
    while (rem > 0) {
      const open = w.map((_, i) => i).filter((i) => w[i]! < ranges[i]![1] && w[i]! < caps[i]!);
      const pool = open.length > 0 ? open : w.map((_, i) => i).filter((i) => w[i]! < caps[i]!);
      if (pool.length === 0) break;
      const i = pool[rng.int(0, pool.length - 1)]!;
      w[i]!++;
      rem--;
    }
  }
  let diff = total - w.reduce((a, b) => a + b, 0);
  let guard = 0;
  while (diff !== 0 && guard++ < 1000) {
    const i = rng.int(0, w.length - 1);
    if (diff > 0 && w[i]! < caps[i]!) {
      w[i]!++;
      diff--;
    } else if (diff < 0 && w[i]! > floors[i]!) {
      w[i]!--;
      diff++;
    }
  }
  return w;
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

/** Stage 2: sizes and places every zone. */
export function layoutSite(rng: Rng, plan: Plan, profile: SiteProfile, inputs: MapInputs): LayoutResult {
  const rects = new Map<string, Rect>();
  const decks: MapDeck[] = [];
  const nodes = plan.nodes;
  const typeOf = (n: PlanNode) => (n.type ? ROOM_TYPES[n.type] : undefined);
  const [cwLo, cwHi] = profile.corridorWidth;

  for (const deck of plan.decks) {
    const { K, s, index: d } = deck;
    const rowH: number[] = [];
    for (let r = 0; r <= 2 * K; r++) {
      if (r % 2 === 1) {
        rowH.push(rng.int(cwLo, cwHi));
        continue;
      }
      const band = r / 2;
      const cells = deck.cells[band]!;
      const slots = cells.flat();
      if (slots.some((x) => x.split)) {
        rowH.push(rng.int(9, 13));
        continue;
      }
      const ds = slots
        .flatMap((x) => x.keys)
        .map((k) => typeOf(nodes.get(k)!))
        .filter((t): t is NonNullable<typeof t> => !!t)
        .map((t) => t.d);
      const lo = ds.length > 0 ? Math.round(ds.reduce((n, x) => n + x[0], 0) / ds.length) : 5;
      const hi = ds.length > 0 ? Math.round(ds.reduce((n, x) => n + x[1], 0) / ds.length) : 9;
      rowH.push(rng.int(Math.max(4, Math.min(lo, 11)), Math.max(Math.max(4, Math.min(lo, 11)), Math.min(hi, 12))));
    }

    // Columns: a width every band's slots can share, at most 24 m (one corridor zone each).
    const slotRange = (slot: { kind: string; keys: string[] }): [number, number] => {
      if (slot.kind === "cross") return [cwLo, cwHi];
      if (slot.kind === "oob") return [4, 8];
      const ranges: Array<[number, number]> = slot.keys.map((k) => typeOf(nodes.get(k)!)?.w ?? [4, 8]);
      return [Math.max(...ranges.map((x) => x[0])), Math.max(...ranges.map((x) => x[1]))];
    };
    const colW: number[] = [];
    for (let col = 0; col < s; col++) {
      let lo = 0;
      let hi = Infinity;
      for (let band = 0; band <= K; band++) {
        const rs = deck.cells[band]![col]!.map(slotRange);
        lo = Math.max(lo, rs.reduce((n, x) => n + x[0], 0));
        hi = Math.min(hi, rs.reduce((n, x) => n + x[1], 0));
      }
      const a = Math.min(Math.max(lo, 6), 24);
      const b = Math.max(a, Math.min(hi, 24));
      colW.push(rng.int(a, b));
    }

    // End zones and their widths.
    const endWidth = new Map<string, number>();
    for (const e of deck.ends) {
      const n = nodes.get(e.key)!;
      const t = typeOf(n);
      const w = e.kind === "connector" ? rng.int(cwLo, cwHi) : e.kind === "oob" ? rng.int(6, 14) : Math.min(12, Math.max(4, rng.int(t?.w[0] ?? 4, t?.w[1] ?? 8)));
      endWidth.set(e.key, w);
    }
    const sideMax = (side: "L" | "R") => Math.max(0, ...deck.ends.filter((e) => e.side === side).map((e) => endWidth.get(e.key)!));
    const EL = sideMax("L");
    const xStart = 1 + EL;
    const colX: number[] = [];
    let x = xStart;
    for (let col = 0; col < s; col++) {
      colX.push(x);
      x += colW[col]!;
    }
    const xEnd = x;
    const rowY: number[] = [];
    let y = 1;
    for (const h of rowH) {
      rowY.push(y);
      y += h;
    }

    for (let j = 1; j <= K; j++) {
      const r = 2 * j - 1;
      for (let col = 0; col < s; col++) rects.set(`${d}:L${j}:c${col}`, { x0: colX[col]!, y0: rowY[r]!, x1: colX[col]! + colW[col]!, y1: rowY[r]! + rowH[r]! });
    }
    for (let band = 0; band <= K; band++) {
      const r = 2 * band;
      const top = rowY[r]!;
      const depth = rowH[r]!;
      for (let col = 0; col < s; col++) {
        const cell = deck.cells[band]![col]!;
        const widths = partition(
          rng,
          colW[col]!,
          cell.map(slotRange),
          cell.map((c) => (c.kind === "cross" ? cwLo : 3)),
          cell.map((c) => (c.kind === "cross" ? cwHi : Infinity)),
        );
        let cx = colX[col]!;
        cell.forEach((slot, i) => {
          const w = widths[i]!;
          if (slot.split) {
            const f = rng.int(4, depth - 3);
            const [frontKey, backKey] = slot.keys as [string, string];
            if (band === 0) {
              rects.set(backKey, { x0: cx, y0: top, x1: cx + w, y1: top + depth - f });
              rects.set(frontKey, { x0: cx, y0: top + depth - f, x1: cx + w, y1: top + depth });
            } else {
              rects.set(frontKey, { x0: cx, y0: top, x1: cx + w, y1: top + f });
              rects.set(backKey, { x0: cx, y0: top + f, x1: cx + w, y1: top + depth });
            }
          } else {
            rects.set(slot.keys[0]!, { x0: cx, y0: top, x1: cx + w, y1: top + depth });
          }
          cx += w;
        });
      }
    }
    for (const e of deck.ends) {
      const w = endWidth.get(e.key)!;
      const y0 = rowY[e.rows[0]]!;
      const y1 = rowY[e.rows[1]]! + rowH[e.rows[1]]!;
      rects.set(e.key, e.side === "L" ? { x0: xStart - w, y0, x1: xStart, y1 } : { x0: xEnd, y0, x1: xEnd + w, y1 });
    }
    const width = xEnd + sideMax("R") + 1;
    const height = y + 1;
    const letter = DECK_LETTERS[d] ?? String(d + 1);
    decks.push({ id: letter, name: profile.hull === "space" ? `Deck ${letter}` : `Level ${d + 1}`, width, height, layer: "floor" });
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

  // Line letters for corridor names.
  const lineLetter = new Map<string, string>();
  let li = 0;
  for (const deck of plan.decks) for (let j = 1; j <= deck.K; j++) lineLetter.set(`${deck.index}:${j}`, DECK_LETTERS[li++] ?? String(li));

  const oobName = profile.hull === "space" ? "Sealed section" : profile.hull === "ground" ? "Sealed wing" : "Collapsed tunnel";
  const zones: MapZoneData[] = [];
  const nameCount = new Map<string, number>();
  for (const k of floorKeys) {
    const n = nodes.get(k)!;
    if ((n.role === "room" || n.role === "cap") && !n.keyRoom && n.name) nameCount.set(n.name, (nameCount.get(n.name) ?? 0) + 1);
  }
  const nameSeen = new Map<string, number>();
  for (const k of floorKeys) {
    const n = nodes.get(k)!;
    const r = rects.get(k)!;
    const t = typeOf(n);
    let name: string | undefined;
    if (n.role === "corridor") name = `${profile.corridorName} ${lineLetter.get(`${n.deck}:${n.line}`)}`;
    else if (n.role === "connector") name = `${profile.corridorName} link`;
    else if (n.role === "cross") name = "Cross corridor";
    else if (n.role === "oob") name = oobName;
    else {
      name = n.name ?? t?.name;
      if (name && !n.keyRoom && (nameCount.get(name) ?? 0) > 1) {
        const i = (nameSeen.get(name) ?? 0) + 1;
        nameSeen.set(name, i);
        name = `${name} ${i}`;
      }
    }
    const kind: MapZoneData["kind"] = n.role === "room" || n.role === "cap" ? "room" : n.role === "oob" ? "out-of-bounds" : "corridor";
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
