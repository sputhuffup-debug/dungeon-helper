import { describe, expect, it } from "vitest";
import type { MapZoneData, SiteLayout } from "@campaign-forge/module-sdk";
import { createMapContext, generateSiteMap, polyBounds, SITE_PROFILES, SITE_TYPES, type SiteTypeId } from "../src/index";

/** Floor plan archetypes: each site type draws its own kind of deck plan. */

const gen = (site: SiteTypeId, size: string, seed: string, extra: Record<string, unknown> = {}) => generateSiteMap({ site_type: site, size, ...extra }, createMapContext(seed));

const firstDeck = (l: SiteLayout) => l.decks.find((d) => d.layer !== "duct")!.id;
const floorOf = (l: SiteLayout) => l.zones.filter((z) => z.layer !== "duct" && z.deck === firstDeck(l));
const size = (z: MapZoneData) => {
  const b = polyBounds(z.poly);
  return { ...b, w: b.x1 - b.x0, h: b.y1 - b.y0, area: (b.x1 - b.x0) * (b.y1 - b.y0), cx: (b.x0 + b.x1) / 2, cy: (b.y0 + b.y1) / 2 };
};
const bbox = (zones: MapZoneData[]) => {
  const b = zones.map(size);
  const x0 = Math.min(...b.map((x) => x.x0));
  const x1 = Math.max(...b.map((x) => x.x1));
  const y0 = Math.min(...b.map((x) => x.y0));
  const y1 = Math.max(...b.map((x) => x.y1));
  return { x0, x1, y0, y1, w: x1 - x0, h: y1 - y0, aspect: Math.max(x1 - x0, y1 - y0) / Math.min(x1 - x0, y1 - y0) };
};
const named = (zones: MapZoneData[], base: string) => zones.filter((z) => z.name === base || z.name?.startsWith(`${base} `));
/** Zones joined by a non-wall border. */
const links = (l: SiteLayout) => {
  const m = new Map<string, Set<string>>();
  for (const b of l.borders) {
    if (b.kind === "wall" || b.kind === "stairs" || b.kind === "access" || b.kind === "shaft") continue;
    for (const [x, y] of [
      [b.a, b.b],
      [b.b, b.a],
    ] as const) m.set(x, (m.get(x) ?? new Set()).add(y));
  }
  return (z: string) => [...(m.get(z) ?? [])];
};
const roomAreas = (zones: MapZoneData[]) => zones.filter((z) => z.kind === "room").map((z) => size(z).area);
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
const median = (xs: number[]) => xs.slice().sort((a, b) => a - b)[Math.floor(xs.length / 2)]!;
const cv = (xs: number[]) => {
  const m = mean(xs);
  return Math.sqrt(mean(xs.map((x) => (x - m) ** 2))) / m;
};
const SEEDS = 20;
const each = (site: SiteTypeId, sizes: string[], fn: (l: SiteLayout, where: string, size: string) => void) => {
  for (const s of sizes)
    for (let i = 0; i < SEEDS; i++) {
      const r = gen(site, s, `shape-${site}-${s}-${i}`);
      expect(r.failedCheck, `${site} ${s} ${i}`).toBeUndefined();
      fn(r.layout, `${site} ${s} seed ${i}`, s);
    }
};

// each shape test generates 40 maps; under the full parallel test run that can pass the 5 s default
describe("site map layouts: one archetype per site type", { timeout: 30_000 }, () => {
  it("gives every site type its own archetype", () => {
    const archetypes = SITE_TYPES.map((t) => SITE_PROFILES[t].layout);
    expect(new Set(archetypes).size).toBe(SITE_TYPES.length);
  });

  it("starship: a long, narrow hull on one spine, the bow narrower than the stern", () => {
    each("starship", ["medium", "large"], (l, where) => {
      const floor = floorOf(l);
      const box = bbox(floor);
      expect(box.w / box.h, `${where} aspect`).toBeGreaterThanOrEqual(2.5);
      // The spine runs along one axis: every spine zone lies on the same corridor line.
      const spine = named(floor, "Spine").map(size);
      expect(spine.length, where).toBeGreaterThan(1);
      for (const s of spine) {
        expect(s.w, where).toBeGreaterThan(s.h);
        expect([s.y0, s.y1], where).toEqual([spine[0]!.y0, spine[0]!.y1]);
      }
      // The bow (the zones at the very front) is narrower than the hull, the stern wider than the bow.
      const ends = floor.filter((z) => size(z).x0 === box.x0);
      const stern = floor.filter((z) => size(z).x1 === box.x1);
      expect(Math.max(...ends.map((z) => size(z).h)), `${where} bow`).toBeLessThan(box.h);
      expect(Math.max(...stern.map((z) => size(z).y1)) - Math.min(...stern.map((z) => size(z).y0)), `${where} stern`).toBeGreaterThan(Math.max(...ends.map((z) => size(z).h)));
    });
  });

  it("derelict: a starship hull with sealed breaches, a broken spine or missing rooms", () => {
    let broken = 0;
    each("derelict", ["medium", "large"], (l, where) => {
      const floor = floorOf(l);
      expect(bbox(floor).aspect, `${where} aspect`).toBeGreaterThanOrEqual(2.2);
      const sealed = floor.filter((z) => z.kind === "out-of-bounds");
      expect(sealed.length, `${where} sealed sections`).toBeGreaterThanOrEqual(1);
      if (named(floor, "Collapsed passage").length > 0) broken++;
    });
    expect(broken).toBeGreaterThan(SEEDS);
  });

  it("station deck: a central hub, a ring corridor round it, modules outside the ring", () => {
    each("station_deck", ["medium", "large"], (l, where) => {
      const floor = floorOf(l);
      const link = links(l);
      const hub = floor.find((z) => z.flags?.type === "hub");
      expect(hub, where).toBeDefined();
      const ring = new Set(named(floor, "Ring").map((z) => z.id));
      expect(ring.size, where).toBeGreaterThanOrEqual(4);
      // The ring is one cycle: every ring zone joins two others, and they all connect.
      for (const r of ring) expect(link(r).filter((x) => ring.has(x)).length, `${where} ${r}`).toBe(2);
      const seen = new Set([[...ring][0]!]);
      for (const q = [...seen]; q.length; ) for (const x of link(q.pop()!)) if (ring.has(x) && !seen.has(x)) (seen.add(x), q.push(x));
      expect(seen.size, where).toBe(ring.size);
      // The hub reaches two or more ring zones, directly or by a spoke.
      const spokes = new Set(named(floor, "Spoke").map((z) => z.id));
      const reached = new Set(link(hub!.id).flatMap((x) => (ring.has(x) ? [x] : spokes.has(x) ? link(x).filter((y) => ring.has(y)) : [])));
      expect(reached.size, where).toBeGreaterThanOrEqual(2);
      // Modules: rooms outside the ring's bounding box.
      const rb = bbox(floor.filter((z) => ring.has(z.id)));
      expect(floor.filter((z) => z.kind === "room" && (size(z).x1 <= rb.x0 || size(z).x0 >= rb.x1 || size(z).y1 <= rb.y0 || size(z).y0 >= rb.y1)).length, where).toBeGreaterThanOrEqual(2);
    });
  });

  it("colony block: buildings joined by walkways, with yards and streets outside", () => {
    each("colony_block", ["medium", "large"], (l, where) => {
      const floor = floorOf(l);
      const link = links(l);
      const outside = floor.filter((z) => z.kind === "exterior");
      expect(outside.length, where).toBeGreaterThanOrEqual(2);
      expect(named(floor, "Walkway").length, where).toBeGreaterThanOrEqual(1);
      // Doors lead from rooms straight outside.
      expect(outside.some((y) => link(y.id).some((x) => floor.find((z) => z.id === x)?.kind === "room")), where).toBe(true);
      for (const y of outside) expect(y.flags?.outerArmor, `${where} ${y.id}`).toBeUndefined();
    });
  });

  it("mine: a winding adit that changes direction, small chambers, tunnels 3 m wide", () => {
    each("mine", ["medium", "large"], (l, where, s) => {
      const floor = floorOf(l);
      const link = links(l);
      const adit = new Map(named(floor, "Adit").map((z) => [z.id, z]));
      // Walk the adit from one end and count the turns.
      const ends = [...adit.keys()].filter((id) => link(id).filter((x) => adit.has(x)).length <= 1);
      const order = [ends[0]!];
      for (;;) {
        const next = link(order[order.length - 1]!).find((x) => adit.has(x) && !order.includes(x));
        if (!next) break;
        order.push(next);
      }
      const horiz = order.map((id) => size(adit.get(id)!).w > size(adit.get(id)!).h);
      let turns = 0;
      for (let i = 1; i < horiz.length; i++) if (horiz[i] !== horiz[i - 1]) turns++;
      expect(turns, `${where} turns`).toBeGreaterThanOrEqual(s === "large" ? 4 : 3);
      const areas = roomAreas(floor);
      expect(areas.filter((a) => a <= 30).length / areas.length, `${where} small chambers`).toBeGreaterThanOrEqual(0.4);
      for (const z of floor.filter((x) => x.kind === "corridor")) expect(Math.min(size(z).w, size(z).h), `${where} ${z.id}`).toBe(3);
    });
  });

  it("research lab: an atrium at the core, three or more wings behind decon locks, mirrored", () => {
    each("research_lab", ["medium", "large"], (l, where) => {
      const floor = floorOf(l);
      const box = bbox(floor);
      const atrium = floor.find((z) => z.flags?.type === "atrium");
      expect(atrium, where).toBeDefined();
      const a = size(atrium!);
      // East and west wings mirror each other about the atrium.
      expect(Math.abs(a.cx - (box.x0 + box.x1) / 2), `${where} centre`).toBeLessThanOrEqual(1);
      expect(named(floor, "Decon").length, `${where} wings`).toBeGreaterThanOrEqual(3);
      for (const d of named(floor, "Decon")) expect(links(l)(d.id).length, `${where} ${d.id}`).toBeGreaterThanOrEqual(2);
    });
  });

  it("alien ruin: great chambers of very uneven size, joined by long galleries", () => {
    each("alien_ruin", ["medium", "large"], (l, where) => {
      const areas = roomAreas(floorOf(l));
      expect(cv(areas), `${where} variation`).toBeGreaterThanOrEqual(0.45);
      expect(Math.max(...areas), `${where} largest`).toBeGreaterThanOrEqual(120);
    });
  });

  it("makes the site types clearly different from one another for the same seed", () => {
    type Sig = { aspect: number; corridors: number; outside: number; sealed: number; roomArea: number; largest: number; ring: boolean; decon: boolean };
    const sig = new Map<SiteTypeId, Sig>();
    for (const site of SITE_TYPES) {
      const r = gen(site, "medium", "distinct-1");
      expect(r.failedCheck, site).toBeUndefined();
      const floor = floorOf(r.layout);
      const playable = floor.filter((z) => z.kind !== "out-of-bounds");
      sig.set(site, {
        aspect: bbox(floor).aspect,
        corridors: playable.filter((z) => z.kind === "corridor").length / playable.length,
        outside: floor.filter((z) => z.kind === "exterior").length,
        sealed: floor.filter((z) => z.kind === "out-of-bounds").length,
        roomArea: median(roomAreas(floor)),
        largest: Math.max(...roomAreas(floor)),
        ring: named(floor, "Ring").length > 0,
        decon: named(floor, "Decon").length > 0,
      });
    }
    const g = (s: SiteTypeId) => sig.get(s)!;
    const others = (s: SiteTypeId) => SITE_TYPES.filter((x) => x !== s).map(g);
    // Ships are the long ones; only the derelict has sealed breaches; only the colony has ground outside.
    for (const o of ["station_deck", "colony_block", "mine", "research_lab", "alien_ruin"] as const) {
      expect(g("starship").aspect, o).toBeGreaterThan(g(o).aspect);
      expect(g("derelict").aspect, o).toBeGreaterThan(g(o).aspect);
    }
    for (const o of others("derelict")) expect(o.sealed).toBe(0);
    expect(g("derelict").sealed).toBeGreaterThan(0);
    for (const o of others("colony_block")) expect(o.outside).toBe(0);
    expect(g("colony_block").outside).toBeGreaterThanOrEqual(2);
    // Great halls in the ruin, small cells in the mine (median room areas).
    for (const o of others("alien_ruin")) {
      expect(g("alien_ruin").roomArea).toBeGreaterThan(o.roomArea);
      expect(g("alien_ruin").largest).toBeGreaterThan(1.3 * o.largest);
    }
    for (const o of others("mine")) expect(g("mine").roomArea).toBeLessThan(o.roomArea);
    // A ring only on the station, decon locks only in the lab; tunnels dominate the mine.
    expect(SITE_TYPES.filter((s) => g(s).ring)).toEqual(["station_deck"]);
    expect(SITE_TYPES.filter((s) => g(s).decon)).toEqual(["research_lab"]);
    expect(g("mine").corridors).toBeGreaterThan(0.4);
  });

  it("keeps the same layout for the same seed and inputs on every archetype", () => {
    for (const site of SITE_TYPES) {
      const a = gen(site, "medium", "same", { decks: 2 });
      const b = gen(site, "medium", "same", { decks: 2 });
      expect(JSON.stringify(a.layout), site).toBe(JSON.stringify(b.layout));
    }
  });

  it("builds multi-deck sites of every type, small decks included, joined by stairs and a second link", { timeout: 60_000 }, () => {
    for (const site of SITE_TYPES)
      for (const decks of [2, 3]) {
        const r = gen(site, decks === 3 ? "medium" : "small", `decks-${site}-${decks}`, { decks });
        expect(r.failedCheck, `${site} ${decks}`).toBeUndefined();
        const floors = r.layout.decks.filter((d) => d.layer !== "duct");
        expect(floors).toHaveLength(decks);
        const stairs = r.layout.borders.filter((b) => b.kind === "stairs");
        expect(stairs.length, `${site} ${decks}`).toBeGreaterThanOrEqual(2 * (decks - 1));
      }
  });
});
