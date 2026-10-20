import { describe, expect, it } from "vitest";
import { createRng, createTableRegistry, diceOutcomes, rollTable, type MapBorderData, type MapCheck, type MapZoneData, type SiteLayout } from "@campaign-forge/module-sdk";
import {
  alienModule,
  alienPassable,
  createMapContext,
  distancesFrom,
  ductEventsTable,
  generateSiteMap,
  mapTables,
  playerLayout,
  zoneAdjacency,
  DUCT_EVENTS_TABLE_ID,
  DUCT_SHEET_MAX,
  DUCT_SHEET_MIN,
  MAP_LEGEND,
  SALVAGE_TABLE_ID,
} from "../src/index";
import { components } from "../src/maps/graph";

const gen = (inputs: Record<string, unknown>, seed: string) => generateSiteMap(inputs, createMapContext(seed));
const blockFailures = (checks: MapCheck[]) => checks.filter((c) => c.level === "block" && !c.ok);
const sheetsOf = (l: SiteLayout) => l.decks.filter((d) => d.layer === "duct");
const zonesOn = (l: SiteLayout, deck: string) => l.zones.filter((z) => z.deck === deck);
const HAZARD_FLAGS = ["fan", "steam", "flooded", "collapsed", "oneWayDrop"] as const;
const SITES = ["station_deck", "starship", "derelict", "colony_block", "research_lab", "mine", "alien_ruin"] as const;

describe("duct sheets: shape", () => {
  it("gives every deck its own duct sheet on normal and dense maps, and none without ducts", () => {
    for (const duct_density of ["normal", "dense"]) {
      for (let i = 0; i < 10; i++) {
        const r = gen({ size: "medium", duct_density, decks: i % 2 ? 2 : 1 }, `sheets-${duct_density}-${i}`);
        const floors = r.layout.decks.filter((d) => d.layer !== "duct");
        const sheets = sheetsOf(r.layout);
        for (const f of floors) expect(sheets.some((s) => s.serves === f.id), `${duct_density} ${i} ${f.id}`).toBe(true);
        for (const s of sheets) {
          expect(floors.map((f) => f.id)).toContain(s.serves);
          expect(typeof s.level).toBe("number");
          expect(s.width).toBeGreaterThan(0);
          expect(s.height).toBeGreaterThan(0);
        }
        // Levels are a single order over decks and sheets: a sheet over a deck sits above it, one under it below.
        const levels = r.layout.decks.map((d) => d.level);
        expect(new Set(levels).size).toBe(levels.length);
        for (const s of sheets) {
          const f = floors.find((x) => x.id === s.serves)!;
          if (s.id.endsWith("-duct")) expect(s.level!).toBeGreaterThan(f.level!);
          else expect(s.level!).toBeLessThan(f.level!);
        }
      }
    }
    const none = gen({ size: "medium", duct_density: "none" }, "no-ducts");
    expect(sheetsOf(none.layout)).toEqual([]);
    expect(none.layout.zones.some((z) => z.layer === "duct")).toBe(false);
    expect(none.layout.borders.some((b) => b.kind === "access" || b.kind === "shaft")).toBe(false);
  });

  it("builds each sheet as its own maze of runs, junctions, bends, dead ends and vent chambers", () => {
    const shapes = new Set<string>();
    for (let i = 0; i < 20; i++) {
      const r = gen({ size: (["small", "medium", "large"] as const)[i % 3], duct_density: i % 2 ? "dense" : "normal" }, `maze-${i}`);
      for (const sheet of sheetsOf(r.layout)) {
        const zones = zonesOn(r.layout, sheet.id);
        expect(zones.length, `${i} ${sheet.id}`).toBeGreaterThanOrEqual(DUCT_SHEET_MIN);
        expect(zones.length, `${i} ${sheet.id}`).toBeLessThanOrEqual(DUCT_SHEET_MAX);
        for (const z of zones) {
          shapes.add(String(z.flags?.ductType));
          expect(z.kind).toBe("crawlspace");
          expect(z.layer).toBe("duct");
          expect(z.cluttered).toBe(false);
          expect(z.flags?.singleFile).toBe(true);
          expect(z.flags?.dark).toBe(true);
          const xs = z.poly.map((p) => p[0]);
          const ys = z.poly.map((p) => p[1]);
          const w = Math.max(...xs) - Math.min(...xs);
          const h = Math.max(...ys) - Math.min(...ys);
          expect(Math.max(w, h), z.id).toBeLessThanOrEqual(25);
          if (z.flags?.ductType === "run") expect(Math.min(w, h), `${z.id} run width`).toBe(1);
          expect(z.id).toMatch(z.flags?.exitTo ? /^Z\d{2,}d$/ : /^D\d{2,}$/);
        }
        // Inside a sheet, the maze is one piece.
        const ids = zones.map((z) => z.id);
        const adj = new Map<string, string[]>(ids.map((z) => [z, []]));
        for (const b of r.layout.borders) if (adj.has(b.a) && adj.has(b.b) && (b.kind === "open" || b.flags?.collapsed === true)) {
          adj.get(b.a)!.push(b.b);
          adj.get(b.b)!.push(b.a);
        }
        expect(components(adj, ids), `${i} ${sheet.id}`).toHaveLength(1);
        // A junction meets three or four runs.
        for (const z of zones.filter((x) => x.flags?.ductType === "junction")) {
          const n = r.layout.borders.filter((b) => (b.a === z.id || b.b === z.id) && b.segment && (b.kind === "open" || b.kind === "wall")).length;
          expect(n, `${i} junction ${z.id}`).toBeGreaterThanOrEqual(3);
          expect(n, `${i} junction ${z.id}`).toBeLessThanOrEqual(4);
        }
      }
    }
    for (const s of ["run", "junction", "bend", "dead-end", "chamber"]) expect(shapes, s).toContain(s);
  });

  it("does not copy the room layout: exits sit anywhere on the sheet", () => {
    // Over many maps, an exit's place on its sheet and its room's place on the deck do not line up.
    let same = 0;
    let total = 0;
    for (let i = 0; i < 20; i++) {
      const r = gen({ size: "medium" }, `loose-${i}`);
      const byId = new Map(r.layout.zones.map((z) => [z.id, z]));
      const decks = new Map(r.layout.decks.map((d) => [d.id, d]));
      for (const z of r.layout.zones.filter((x) => x.flags?.exitTo)) {
        const room = byId.get((z.flags!.exitTo as { zone: string }).zone)!;
        const side = (zone: MapZoneData) => {
          const d = decks.get(zone.deck)!;
          return zone.poly[0]![0] < d.width / 2 ? "W" : "E";
        };
        total++;
        if (side(z) === side(room)) same++;
      }
    }
    expect(total).toBeGreaterThan(50);
    expect(same / total).toBeGreaterThan(0.25);
    expect(same / total).toBeLessThan(0.75);
  });
});

describe("duct sheets: exits", () => {
  it("labels every exit with its room's name or a corridor location, and the room points back", () => {
    let corridors = 0;
    for (let i = 0; i < 20; i++) {
      const r = gen({ size: i % 2 ? "large" : "medium", duct_density: "dense", key_rooms: [{ name: "Galley", act: 1 }, { name: "Reactor", act: 2 }, { name: "Hangar", act: 3 }] }, `exits-${i}`);
      const byId = new Map(r.layout.zones.map((z) => [z.id, z]));
      const access = r.layout.borders.filter((b) => b.kind === "access");
      expect(access.length).toBeGreaterThan(0);
      for (const b of access) {
        const duct = byId.get(b.b)!;
        const floor = byId.get(b.a)!;
        expect(duct.layer).toBe("duct");
        expect(floor.layer).toBe("floor");
        expect(b.segment).toBeUndefined();
        const to = duct.flags?.exitTo as { zone: string; name: string; deck: string };
        expect(to.zone).toBe(floor.id);
        expect(to.deck).toBe(floor.deck);
        if (floor.kind === "room") expect(to.name).toBe(floor.name);
        else {
          expect(floor.kind).toBe("corridor");
          expect(to.name.startsWith(floor.name!)).toBe(true);
          if (to.name.includes(", near ")) {
            corridors++;
            const near = to.name.split(", near ")[1]!;
            expect(r.layout.zones.some((z) => z.kind === "room" && z.name === near), near).toBe(true);
          }
        }
        expect((floor.flags?.ductTo as { zone: string }).zone).toBe(duct.id);
        // Hidden from the players until found, except the start's.
        expect(b.hidden, b.id).toBe(b.a !== r.layout.start);
        expect(b.sealed).toBe(false);
      }
      // Key rooms and the start always reach the ducts.
      for (const k of ["Galley", "Reactor", "Hangar"]) expect(byId.get([...byId.values()].find((z) => z.key && z.name === k)!.id)!.flags?.ductTo, k).toBeDefined();
      expect(byId.get(r.layout.start!)!.flags?.ductTo).toBeDefined();
      expect(r.layout.checks.find((c) => c.id === "duct-exits")!.ok).toBe(true);
    }
    expect(corridors).toBeGreaterThan(0);
  });

  it("connects every duct sheet to two or more rooms, and every network keeps two unsealed access points", () => {
    for (let i = 0; i < 40; i++) {
      const r = gen({ size: (["small", "medium", "large"] as const)[i % 3], site_type: SITES[i % SITES.length], duct_density: (["sparse", "normal", "dense"] as const)[i % 3], decks: i % 4 === 0 ? 2 : 1 }, `rooms-${i}`);
      const byId = new Map(r.layout.zones.map((z) => [z.id, z]));
      for (const sheet of sheetsOf(r.layout)) {
        const rooms = new Set(r.layout.borders.filter((b) => b.kind === "access" && !b.sealed && byId.get(b.b)!.deck === sheet.id && byId.get(b.a)!.kind === "room").map((b) => b.a));
        expect(rooms.size, `${i} ${sheet.id}`).toBeGreaterThanOrEqual(2);
      }
      for (const id of ["duct-rooms", "duct-access", "duct-exits", "duct-size", "crawlspace-open"]) expect(r.layout.checks.find((c) => c.id === id)!.ok, `${i} ${id}`).toBe(true);
    }
  });
});

describe("duct sheets: shafts and drops", () => {
  const shaftsOf = (l: SiteLayout) => l.borders.filter((b) => b.kind === "shaft");

  it("links sheets on different levels with shafts, top end first", () => {
    let multi = 0;
    for (let i = 0; i < 30; i++) {
      const r = gen({ size: "large", duct_density: i % 2 ? "dense" : "normal", decks: 1 + (i % 3) }, `shafts-${i}`);
      const byId = new Map(r.layout.zones.map((z) => [z.id, z]));
      const decks = new Map(r.layout.decks.map((d) => [d.id, d]));
      const sheets = sheetsOf(r.layout);
      if (sheets.length > 1) multi++;
      for (const b of shaftsOf(r.layout)) {
        const a = byId.get(b.a)!;
        const z = byId.get(b.b)!;
        expect(a.layer).toBe("duct");
        expect(z.layer).toBe("duct");
        expect(a.deck).not.toBe(z.deck);
        expect(decks.get(a.deck)!.level!).toBeGreaterThan(decks.get(z.deck)!.level!);
        expect(b.segment).toBeUndefined();
        expect(b.hidden).toBe(true);
        expect(b.flags?.dropM).toBeTypeOf("number");
        expect(["both", "down"]).toContain(b.flags?.direction);
        expect((a.flags?.shaftTo as Array<{ zone: string; way: string }>).some((s) => s.zone === z.id && s.way === "down")).toBe(true);
        expect((z.flags?.shaftTo as Array<{ zone: string; way: string }>).some((s) => s.zone === a.id && s.way === "up")).toBe(true);
      }
      // All sheets form one network through their shafts.
      const ids = r.layout.zones.filter((x) => x.layer === "duct").map((x) => x.id);
      const adj = new Map<string, string[]>(ids.map((x) => [x, []]));
      for (const b of r.layout.borders) if (adj.has(b.a) && adj.has(b.b)) {
        adj.get(b.a)!.push(b.b);
        adj.get(b.b)!.push(b.a);
      }
      if (sheets.length > 0) expect(components(adj, ids), `${i}`).toHaveLength(1);
      if (sheets.length > 1) expect(shaftsOf(r.layout).some((b) => b.flags?.direction === "both"), `${i}`).toBe(true);
    }
    expect(multi).toBeGreaterThan(10);
  });

  it("treats a one-way drop as passable downward only, in distances too", () => {
    const drop: MapBorderData = { id: "s", a: "TOP", b: "LOW", kind: "shaft", flags: { direction: "down", oneWay: true, dropM: 4 } };
    expect(alienPassable(drop, 1)).toBe(true);
    expect(alienPassable(drop, 1, { from: "TOP", to: "LOW", vertical: "down" })).toBe(true);
    expect(alienPassable(drop, 1, { from: "LOW", to: "TOP", vertical: "up" })).toBe(false);
    const climb: MapBorderData = { ...drop, flags: { direction: "both", dropM: 4 } };
    expect(alienPassable(climb, 1, { from: "LOW", to: "TOP", vertical: "up" })).toBe(true);

    let found = 0;
    for (let i = 0; i < 40 && found < 5; i++) {
      const r = gen({ size: "large", duct_density: "dense", site_type: "alien_ruin" }, `drop-${i}`);
      for (const b of shaftsOf(r.layout).filter((x) => x.flags?.oneWay === true)) {
        found++;
        expect(b.flags?.direction).toBe("down");
        expect(r.layout.zones.find((z) => z.id === b.a)!.flags?.oneWayDrop).toBe(true);
        const adj = zoneAdjacency(r.layout, 1);
        expect(adj.get(b.a)).toContain(b.b);
        expect(adj.get(b.b)).not.toContain(b.a);
        // Only this drop links the two zones, so the way back is longer than one step (or absent).
        expect(distancesFrom(r.layout, b.a, 1)[b.b]).toBe(1);
        expect(distancesFrom(r.layout, b.b, 1)[b.a] ?? Infinity).toBeGreaterThan(1);
      }
    }
    expect(found).toBeGreaterThan(0);
  });
});

describe("duct sheets: hazards", () => {
  it("places generated hazards on the sheets, every sheet with at least one danger", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 40; i++) {
      const r = gen({ size: (["medium", "large"] as const)[i % 2], site_type: SITES[i % SITES.length], duct_density: "dense", hazards: ["fire", "vacuum", "flooding"] }, `hazards-${i}`);
      for (const sheet of sheetsOf(r.layout)) {
        const zones = zonesOn(r.layout, sheet.id);
        expect(zones.some((z) => HAZARD_FLAGS.some((f) => z.flags?.[f] === true)), `${i} ${sheet.id}`).toBe(true);
        for (const z of zones) for (const f of HAZARD_FLAGS) if (z.flags?.[f] === true) seen.add(f);
        // Exits stay clear of fans, steam and floods.
        for (const z of zones.filter((x) => x.flags?.exitTo)) for (const f of ["fan", "steam", "flooded"]) expect(z.flags?.[f], `${z.id} ${f}`).toBeUndefined();
      }
      for (const b of r.layout.borders.filter((x) => x.flags?.collapsed === true)) {
        expect(b.kind).toBe("wall");
        expect(b.armor).toBe(2);
        expect(b.hp).toBe(10);
        expect(b.hidden).toBe(true);
      }
      // Each duct hazard has a GM marker.
      for (const z of r.layout.zones.filter((x) => x.layer === "duct" && HAZARD_FLAGS.some((f) => x.flags?.[f] === true))) {
        expect(r.layout.markers.some((m) => m.kind === "hazard" && m.zone === z.id && m.gmOnly), z.id).toBe(true);
      }
    }
    for (const f of HAZARD_FLAGS) expect(seen, f).toContain(f);
  });

  it("only floods ducts when the brief allows flooding, and never fans in an alien ruin", () => {
    for (let i = 0; i < 20; i++) {
      const r = gen({ size: "large", duct_density: "dense", site_type: i % 2 ? "alien_ruin" : "mine", hazards: ["fire"] }, `dry-${i}`);
      const ducts = r.layout.zones.filter((z) => z.layer === "duct");
      expect(ducts.some((z) => z.flags?.flooded === true)).toBe(false);
      if (i % 2) expect(ducts.some((z) => z.flags?.fan === true)).toBe(false);
    }
  });

  it("has a GM-only legend entry with an icon for every duct hazard and label", () => {
    const flag = (f: string) => MAP_LEGEND.find((e) => "flag" in e.target && e.target.flag === f);
    const icons: Record<string, string> = { fan: "fan", steam: "steam", flooded: "water", collapsed: "collapse", oneWayDrop: "drop", dark: "dark", exitTo: "exit" };
    for (const [f, icon] of Object.entries(icons)) {
      expect(flag(f)?.gmOnly, f).toBe(true);
      expect(flag(f)?.icon, f).toBe(icon);
      expect(flag(f)?.rule, f).toBeTruthy();
      expect(flag(f)?.page, f).toBeDefined();
    }
    expect(flag("ductTo")?.gmOnly).toBe(true);
    // Single file is a rule the players know.
    expect(flag("singleFile")?.gmOnly).toBeUndefined();
    const shaft = MAP_LEGEND.find((e) => "border" in e.target && e.target.border === "shaft")!;
    expect(shaft.page).toEqual([60, 75]);
    // Module decisions say so.
    for (const f of ["fan", "collapsed", "oneWayDrop"]) expect(flag(f)!.rule).toMatch(/module decision/i);
    const crawl = MAP_LEGEND.find((e) => "kind" in e.target && e.target.kind === "crawlspace")!;
    expect(crawl.rule).toMatch(/says nothing about where its room lies/);
  });
});

describe("duct sheets: encounters and the player map", () => {
  it("can spawn threats in duct junctions and vent chambers, never in exits", () => {
    let inDucts = 0;
    for (let i = 0; i < 30; i++) {
      const r = gen({ size: "large", duct_density: "dense", threats: [{ creature: "drone", act: 2 }, { creature: "facehugger", act: 1 }] }, `spawn-${i}`);
      const byId = new Map(r.layout.zones.map((z) => [z.id, z]));
      for (const m of r.layout.markers.filter((x) => x.kind === "spawn")) {
        const z = byId.get(m.zone)!;
        if (z.layer !== "duct") continue;
        inDucts++;
        expect(z.flags?.exitTo, m.zone).toBeUndefined();
      }
      expect(r.failedCheck).toBeUndefined();
    }
    expect(inDucts).toBeGreaterThan(5);
  });

  it("keeps the duct sheets off the player map until the crew finds them", () => {
    const r = gen({ size: "medium", duct_density: "dense" }, "player-ducts");
    const p = playerLayout(r.layout, 1);
    const ducts = p.zones.filter((z) => z.layer === "duct");
    // Only the start's exit is known at first, as an outline with no label or hazards.
    const startExit = (r.layout.zones.find((z) => z.id === r.layout.start)!.flags!.ductTo as { zone: string }).zone;
    expect(ducts.map((z) => z.id)).toEqual([startExit]);
    for (const z of ducts) {
      expect(z.name).toBeUndefined();
      expect(z.flags?.exitTo).toBeUndefined();
      for (const f of [...HAZARD_FLAGS, "dark", "shaftTo", "ductType"]) expect(z.flags?.[f]).toBeUndefined();
    }
    expect(p.borders.some((b) => b.kind === "shaft" || b.flags?.collapsed)).toBe(false);
    expect(p.zones.filter((z) => z.flags?.ductTo !== undefined).map((z) => z.id)).toEqual([r.layout.start]);
    expect(p.decks.filter((d) => d.layer === "duct").map((d) => d.id)).toEqual([ducts[0]!.deck]);

    // Crawling reveals zones: their outlines, exit labels and hazards; found borders show too.
    const sheet = ducts[0]!.deck;
    const crawled = r.layout.zones.filter((z) => z.deck === sheet).map((z) => z.id);
    const found = r.layout.borders.filter((b) => b.kind === "access" && crawled.includes(b.b)).map((b) => b.id);
    const q = playerLayout(r.layout, 1, { revealed: crawled, found });
    expect(q.zones.filter((z) => z.deck === sheet)).toHaveLength(crawled.length);
    const exits = r.layout.zones.filter((z) => z.deck === sheet && z.flags?.exitTo);
    for (const z of exits) expect(q.zones.find((x) => x.id === z.id)!.flags?.exitTo).toEqual(z.flags!.exitTo);
    for (const z of r.layout.zones.filter((x) => x.deck === sheet)) for (const f of HAZARD_FLAGS) if (z.flags?.[f] === true) expect(q.zones.find((x) => x.id === z.id)!.flags?.[f]).toBe(true);
    for (const b of found) expect(q.borders.some((x) => x.id === b)).toBe(true);
  });
});

describe("duct events table", () => {
  const registry = createTableRegistry(mapTables);

  it("is a GM-only module table registered for duct zones", () => {
    expect(ductEventsTable.id).toBe(DUCT_EVENTS_TABLE_ID);
    expect(ductEventsTable.dice).toBe("d66");
    expect(ductEventsTable.family).toBe("maps");
    expect(ductEventsTable.unverified).toBe(true);
    expect(ductEventsTable.notes).toMatch(/module table/i);
    expect(alienModule.tables).toContain(ductEventsTable);
    const g = alienModule.mapGenerators!.find((x) => x.id === "alien.map.site")!;
    expect(g.zoneTables).toEqual([expect.objectContaining({ table: DUCT_EVENTS_TABLE_ID, label: "Duct event", when: { layer: "duct" } })]);
    expect(g.zoneTables![0]!.hint).toMatch(/new duct zone/);
  });

  it("covers every D66 result exactly once, mixing encounters, dangers and comforts", () => {
    for (const o of diceOutcomes("d66")) expect(ductEventsTable.rows.filter((r) => o >= r.range[0] && o <= r.range[1]), String(o)).toHaveLength(1);
    const kinds = ductEventsTable.rows.map((r) => (r.result as { kind: string }).kind);
    for (const k of ["encounter", "danger", "comfort"]) expect(kinds.filter((x) => x === k).length, k).toBe(6);
    for (const r of ductEventsTable.rows) {
      expect(r.label).toBeTruthy();
      expect((r.result as { effect: string }).effect.length).toBeLessThan(200);
      expect(r.unverified).toBe(true);
    }
  });

  it("rolls every row, and the cache rolls salvage", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 2000 && seen.size < ductEventsTable.rows.length; i++) {
      const rec = rollTable(ductEventsTable, createRng(`duct-event-${i}`), registry);
      seen.add(rec.rowLabel ?? "");
      if (rec.rowLabel === "Maintenance cache") expect((rec.result as Record<string, unknown>).salvage).toBeDefined();
    }
    expect(seen.size).toBe(ductEventsTable.rows.length);
    expect(registry.get(SALVAGE_TABLE_ID)).toBeDefined();
  });
});

describe("duct sheets: determinism and block checks", () => {
  it("is deterministic and passes every block check over 100 seeds of every size, site type and density", { timeout: 120_000 }, () => {
    for (let i = 0; i < 100; i++) {
      const inputs = {
        size: (["small", "medium", "large"] as const)[i % 3],
        site_type: SITES[i % SITES.length],
        duct_density: (["sparse", "normal", "dense"] as const)[i % 3 === 0 ? 2 : i % 2],
        decks: i % 5 === 0 ? 2 : i % 11 === 0 ? 3 : 1,
        hazards: ["fire", "vacuum", "flooding"],
        threats: [{ creature: "drone", act: 2 }],
      };
      const a = gen(inputs, `duct-det-${i}`);
      const b = gen(inputs, `duct-det-${i}`);
      expect(JSON.stringify(a), `seed ${i}`).toBe(JSON.stringify(b));
      expect(a.failedCheck, `seed ${i}: ${blockFailures(a.layout.checks).map((c) => c.message).join("; ")}`).toBeUndefined();
      expect(sheetsOf(a.layout).length, `seed ${i}`).toBeGreaterThan(0);
    }
  });
});
