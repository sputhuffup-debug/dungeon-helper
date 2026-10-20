/**
 * Small graph helpers over zone ids: adjacency, breadth-first distances, and
 * internally vertex-disjoint routes (unit-capacity max flow with split
 * vertices). Everything is deterministic: neighbours are visited in insertion
 * order.
 */

export type Adjacency = Map<string, string[]>;

export function addEdge(adj: Adjacency, a: string, b: string): void {
  if (a === b) return;
  const la = adj.get(a) ?? [];
  if (!la.includes(b)) la.push(b);
  adj.set(a, la);
  const lb = adj.get(b) ?? [];
  if (!lb.includes(a)) lb.push(a);
  adj.set(b, lb);
}

export function buildAdjacency(nodes: Iterable<string>, edges: Iterable<[string, string]>): Adjacency {
  const adj: Adjacency = new Map();
  for (const n of nodes) adj.set(n, []);
  for (const [a, b] of edges) addEdge(adj, a, b);
  return adj;
}

/** Shortest hop counts from `from` (missing = unreachable). `blocked` zones are never entered. */
export function bfs(adj: Adjacency, from: string, blocked?: ReadonlySet<string>): Map<string, number> {
  const dist = new Map<string, number>();
  if (!adj.has(from)) return dist;
  dist.set(from, 0);
  const queue = [from];
  for (let i = 0; i < queue.length; i++) {
    const cur = queue[i]!;
    const d = dist.get(cur)!;
    for (const n of adj.get(cur) ?? []) {
      if (dist.has(n) || blocked?.has(n)) continue;
      dist.set(n, d + 1);
      queue.push(n);
    }
  }
  return dist;
}

/** One shortest path from `from` to `to` (inclusive), or undefined. */
export function shortestPath(adj: Adjacency, from: string, to: string, blocked?: ReadonlySet<string>): string[] | undefined {
  if (from === to) return [from];
  const prev = new Map<string, string>();
  const seen = new Set<string>([from]);
  const queue = [from];
  for (let i = 0; i < queue.length; i++) {
    const cur = queue[i]!;
    for (const n of adj.get(cur) ?? []) {
      if (seen.has(n) || (blocked?.has(n) && n !== to)) continue;
      seen.add(n);
      prev.set(n, cur);
      if (n === to) {
        const path = [to];
        let p = cur;
        while (p !== from) {
          path.push(p);
          p = prev.get(p)!;
        }
        path.push(from);
        return path.reverse();
      }
      queue.push(n);
    }
  }
  return undefined;
}

/**
 * Up to `want` internally vertex-disjoint paths from `s` to `t` (Edmonds-Karp on
 * a split-vertex graph with unit capacities). Paths are returned inclusive of
 * both ends. When `s` and `t` are neighbours, the direct hop counts as one route.
 */
export function disjointPaths(adj: Adjacency, s: string, t: string, want = 2): string[][] {
  if (s === t || !adj.has(s) || !adj.has(t)) return [];
  // Node v becomes v:in -> v:out (capacity 1, except s and t which are unbounded).
  const cap = new Map<string, number>();
  const nbrs = new Map<string, string[]>();
  const key = (a: string, b: string) => `${a}\u0000${b}`;
  const link = (a: string, b: string, c: number) => {
    const k = key(a, b);
    cap.set(k, (cap.get(k) ?? 0) + c);
    if (!cap.has(key(b, a))) cap.set(key(b, a), 0);
    const la = nbrs.get(a) ?? [];
    if (!la.includes(b)) la.push(b);
    nbrs.set(a, la);
    const lb = nbrs.get(b) ?? [];
    if (!lb.includes(a)) lb.push(a);
    nbrs.set(b, lb);
  };
  const IN = (v: string) => `${v}#i`;
  const OUT = (v: string) => `${v}#o`;
  for (const [v, list] of adj) {
    link(IN(v), OUT(v), v === s || v === t ? want : 1);
    for (const n of list) link(OUT(v), IN(n), 1);
  }
  const source = OUT(s);
  const sink = IN(t);
  let flow = 0;
  while (flow < want) {
    const prev = new Map<string, string>();
    const queue = [source];
    const seen = new Set([source]);
    let found = false;
    for (let i = 0; i < queue.length && !found; i++) {
      const cur = queue[i]!;
      for (const n of nbrs.get(cur) ?? []) {
        if (seen.has(n) || (cap.get(key(cur, n)) ?? 0) <= 0) continue;
        seen.add(n);
        prev.set(n, cur);
        if (n === sink) {
          found = true;
          break;
        }
        queue.push(n);
      }
    }
    if (!found) break;
    let v = sink;
    while (v !== source) {
      const u = prev.get(v)!;
      cap.set(key(u, v), (cap.get(key(u, v)) ?? 0) - 1);
      cap.set(key(v, u), (cap.get(key(v, u)) ?? 0) + 1);
      v = u;
    }
    flow++;
  }
  // Decompose the flow into paths: follow saturated out->in arcs (flow = residual on the reverse arc).
  const used = new Map<string, number>();
  for (const [v, list] of adj) {
    for (const n of list) {
      const f = cap.get(key(IN(n), OUT(v))) ?? 0;
      if (f > 0) used.set(key(v, n), f);
    }
  }
  const paths: string[][] = [];
  for (let p = 0; p < flow; p++) {
    const path = [s];
    let cur = s;
    const guard = new Set<string>([s]);
    while (cur !== t) {
      const next = (adj.get(cur) ?? []).find((n) => (used.get(key(cur, n)) ?? 0) > 0 && (n === t || !guard.has(n)));
      if (next === undefined) break;
      used.set(key(cur, next), (used.get(key(cur, next)) ?? 0) - 1);
      path.push(next);
      guard.add(next);
      cur = next;
    }
    if (cur === t) paths.push(path);
  }
  return paths;
}

/** Connected components (lists of nodes) of the subgraph induced by `nodes`. */
export function components(adj: Adjacency, nodes: Iterable<string>): string[][] {
  const pool = new Set(nodes);
  const out: string[][] = [];
  for (const n of pool) {
    if (out.some((c) => c.includes(n))) continue;
    const comp: string[] = [];
    const queue = [n];
    const seen = new Set([n]);
    for (let i = 0; i < queue.length; i++) {
      const cur = queue[i]!;
      comp.push(cur);
      for (const m of adj.get(cur) ?? []) {
        if (!pool.has(m) || seen.has(m)) continue;
        seen.add(m);
        queue.push(m);
      }
    }
    out.push(comp);
  }
  return out;
}

/**
 * The vertices of the largest biconnected block (Tarjan): the part of the graph
 * where any two vertices have two separate routes between them. Dead-end
 * branches hang off it through cut vertices and are not in it.
 */
export function largestBlock(adj: Adjacency): Set<string> {
  const index = new Map<string, number>();
  const low = new Map<string, number>();
  const stack: Array<[string, string]> = [];
  let best = new Set<string>();
  let counter = 0;
  const visit = (v: string, parent: string | undefined) => {
    index.set(v, counter);
    low.set(v, counter);
    counter++;
    for (const w of adj.get(v) ?? []) {
      if (w === parent) continue;
      if (!index.has(w)) {
        stack.push([v, w]);
        visit(w, v);
        low.set(v, Math.min(low.get(v)!, low.get(w)!));
        if (low.get(w)! >= index.get(v)!) {
          const block = new Set<string>();
          for (;;) {
            const e = stack.pop();
            if (!e) break;
            block.add(e[0]);
            block.add(e[1]);
            if (e[0] === v && e[1] === w) break;
          }
          if (block.size > best.size) best = block;
        }
      } else if (index.get(w)! < index.get(v)!) {
        stack.push([v, w]);
        low.set(v, Math.min(low.get(v)!, index.get(w)!));
      }
    }
  };
  for (const v of adj.keys()) if (!index.has(v)) visit(v, undefined);
  return best;
}
