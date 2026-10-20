import { describe, expect, it } from "vitest";
import { createTableRegistry, rollTable, createRng, type MapCheck, type SiteLayout } from "@campaign-forge/module-sdk";
import {
  alienModule,
  createMapContext,
  generateSiteMap,
  inputsFromAdventure,
  normalizeMapInputs,
  playerLayout,
  rangeBandFor,
  alienPassable,
  zoneAdjacency,
  zoneDistances,
  distancesFrom,
  MAP_STAGES,
  MAP_LEGEND,
  RANGE_BANDS,
  SIZE_ZONES,
  NON_COMBAT_WIN_PATHS,
  MIN_SPAWN_DISTANCE,
  mapTables,
  LOCATION_DETAIL_TABLE_ID,
  SALVAGE_TABLE_ID,
  ANOMALOUS_DETAIL_TABLE_ID,
} from "../src/index";
import { disjointPaths, bfs } from "../src/maps/graph";

const gen = (inputs: Record<string, unknown>, seed: string, stageSeeds?: Record<string, string>) => generateSiteMap(inputs, createMapContext(seed, stageSeeds ? { stageSeeds } : {}));
const blockFailures = (checks: MapCheck[]) => checks.filter((c) => c.level === "block" && !c.ok);
const bounds = (poly: Array<[number, number]>) => {
  const xs = poly.map((p) => p[0]);
  const ys = poly.map((p) => p[1]);
  return { w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
};

const BRIEF = {
  size: "medium",
  puzzles: [
    { id: "P1", answer: "the reactor override code", act: 2 },
    { id: "P2", answer: "the hangar keycard", act: 3 },
  ],
  npcs: [
    { name: "Ash", role: "android" },
    { name: "Newt", role: "survivor" },
    { name: "Parker", role: "crew" },
  ],
};

describe("site map generator: registration and data", () => {
  it("is registered on the module with stages, inputs, legend and range bands", () => {
    const g = alienModule.mapGenerators?.find((x) => x.id === "alien.map.site");
    expect(g).toBeDefined();
    expect(g!.stages.map((s) => s.id)).toEqual(["graph", "layout", "borders", "dressing", "encounters"]);
    const props = (g!.inputs as { properties: Record<string, unknown> }).properties;
    for (const k of ["site_type", "size", "decks", "crew", "runtime_h", "threats", "duct_density", "darkness", "hazards", "win_paths", "key_rooms", "puzzles"]) expect(props[k], k).toBeDefined();
    expect(g!.passable).toBeTypeOf("function");
    expect(g!.inputsFromAdventure).toBeTypeOf("function");
    expect(g!.legend).toBe(MAP_LEGEND);
  });

  it("reads range in zones as the book does (Adjacent is not a zone distance)", () => {
    expect(RANGE_BANDS.map((b) => [b.id, b.maxDistance])).toEqual([
      ["short", 0],
      ["medium", 1],
      ["long", 4],
      ["extreme", undefined],
    ]);
    expect([0, 1, 2, 4, 5, 9].map((d) => rangeBandFor(d).label)).toEqual(["Short", "Medium", "Long", "Long", "Extreme", "Extreme"]);
  });

  it("has a legend entry for every border kind, marker kind and area, with GM-only spoilers", () => {
    const borders = MAP_LEGEND.filter((e) => "border" in e.target).map((e) => (e.target as { border: string }).border);
    for (const k of ["open", "wall", "door", "hatch", "blast", "access", "stairs", "shaft"]) expect(borders, k).toContain(k);
    const markers = MAP_LEGEND.filter((e) => "marker" in e.target);
    for (const k of ["start", "spawn", "waypoint", "clue", "npc", "win", "hazard"]) expect(markers.some((e) => (e.target as { marker: string }).marker === k), k).toBe(true);
    for (const e of markers) if ((e.target as { marker: string }).marker !== "start") expect(e.gmOnly, JSON.stringify(e.target)).toBe(true);
    for (const flag of ["dark", "flammable", "radiation", "flooded"]) expect(MAP_LEGEND.find((e) => "flag" in e.target && e.target.flag === flag)?.gmOnly, flag).toBe(true);
    for (const e of MAP_LEGEND) if (e.page !== undefined) expect(typeof e.page === "number" || Array.isArray(e.page)).toBe(true);
  });

  it("treats walls, locks and sealed access points as impassable", () => {
    expect(alienPassable({ id: "b", a: "x", b: "y", kind: "wall" }, 1)).toBe(false);
    expect(alienPassable({ id: "b", a: "x", b: "y", kind: "door", lockedInActs: [2] }, 1)).toBe(true);
    expect(alienPassable({ id: "b", a: "x", b: "y", kind: "door", lockedInActs: [2] }, 2)).toBe(false);
    expect(alienPassable({ id: "b", a: "x", b: "y", kind: "access", sealed: true }, 1)).toBe(false);
    expect(alienPassable({ id: "b", a: "x", b: "y", kind: "open" }, 3)).toBe(true);
  });

  it("adds the book's location detail and salvage tables (p. 297-298)", () => {
    const byId = new Map(mapTables.map((t) => [t.id, t]));
    const detail = byId.get(LOCATION_DETAIL_TABLE_ID)!;
    const salvage = byId.get(SALVAGE_TABLE_ID)!;
    const anomalous = byId.get(ANOMALOUS_DETAIL_TABLE_ID)!;
    for (const t of [detail, salvage, anomalous]) {
      expect(t.dice).toBe("d66");
      expect(t.family).toBe("maps");
      expect(t.rows).toHaveLength(36);
      expect(t.unverified).toBeUndefined();
      expect(alienModule.tables).toContain(t);
    }
    expect(detail.page).toBe(297);
    expect(salvage.page).toBe(297);
    expect(anomalous.page).toBe(298);
    expect(detail.rows[0]!.label).toBe("Anomalous");
    expect(detail.rows[35]!.result).toMatchObject({ rollTwice: true });
    expect(salvage.rows[0]!.result).toMatchObject({ common: "Ammo", rare: "Weapon scope" });
    expect(salvage.rows[35]!.result).toMatchObject({ common: "Voice recorder", rare: "Alien artifact" });
    expect(salvage.rows[35]!.range).toEqual([66, 66]);
    const rec = rollTable(salvage, createRng("salvage"), createTableRegistry(mapTables));
    expect(rec.page).toBe(297);
  });
});

describe("site map generator: determinism and stages", () => {
  it("gives the same map for the same seed, stage seeds and inputs", () => {
    const a = gen(BRIEF, "schedule-b");
    const b = gen(BRIEF, "schedule-b");
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    const c = gen(BRIEF, "schedule-b", { dressing: "again" });
    const d = gen(BRIEF, "schedule-b", { dressing: "again" });
    expect(JSON.stringify(c)).toBe(JSON.stringify(d));
    expect(JSON.stringify(gen(BRIEF, "schedule-c").layout)).not.toBe(JSON.stringify(a.layout));
  });

  // Signatures of what each stage decides.
  const sig = {
    graph: (l: SiteLayout) =>
      JSON.stringify(
        l.zones
          .filter((z) => z.layer !== "duct")
          .map((z) => `${z.deck}:${z.kind}:${(z.name ?? "").replace(/ \d+$/, "")}:${z.key ? 1 : 0}`)
          .sort(),
      ),
    layout: (l: SiteLayout) => JSON.stringify(l.zones.map((z) => [z.id, z.poly])),
    borders: (l: SiteLayout) => JSON.stringify(l.borders.map((b) => [b.a, b.b, b.kind, b.segment, b.lockedInActs, b.hidden])),
    dressing: (l: SiteLayout) => JSON.stringify(l.zones.map((z) => [z.id, z.cluttered, z.details, z.salvage, z.flags?.dark])),
    encounters: (l: SiteLayout) => JSON.stringify(l.markers.filter((m) => m.kind !== "hazard").map((m) => [m.kind, m.zone, m.act])),
  };
  const order = ["graph", "layout", "borders", "dressing", "encounters"] as const;

  for (const stage of order) {
    it(`re-seeding the ${stage} stage changes it and later stages only`, () => {
      let checked = 0;
      for (let i = 0; i < 12 && checked < 3; i++) {
        const base = gen(BRIEF, `stage-${i}`);
        const re = gen(BRIEF, `stage-${i}`, { [stage]: "reroll" });
        if (base.attempts !== 1 || re.attempts !== 1) continue;
        checked++;
        const at = order.indexOf(stage);
        for (const earlier of order.slice(0, at)) expect(sig[earlier](re.layout), `${earlier} after re-seeding ${stage}`).toBe(sig[earlier](base.layout));
        const later = order.slice(at).map((s) => sig[s](re.layout) !== sig[s](base.layout));
        expect(later[0], `${stage} itself changes`).toBe(true);
      }
      expect(checked).toBeGreaterThan(0);
    });
  }

  it("re-seeds a stage even when the host's rng ignores stage seeds", () => {
    const naive = (stageSeeds?: Record<string, string>) => ({ seed: "naive", ...(stageSeeds ? { stageSeeds } : {}), rng: (s: string) => createRng("naive").fork(s), tables: createTableRegistry(mapTables) });
    const base = generateSiteMap(BRIEF, naive());
    const re = generateSiteMap(BRIEF, naive({ encounters: "other" }));
    expect(sig.dressing(re.layout)).toBe(sig.dressing(base.layout));
    expect(sig.encounters(re.layout)).not.toBe(sig.encounters(base.layout));
  });

  it("lists the stages in pipeline order", () => {
    expect(MAP_STAGES.map((s) => s.id)).toEqual([...order]);
  });
});

describe("site map generator: block checks over many seeds", () => {
  const SITES = ["station_deck", "derelict", "mine", "alien_ruin"];
  for (const size of ["small", "medium", "large"] as const) {
    it(`holds every block check for 100 seeds on ${size} maps of ${SITES.length} site types`, { timeout: 120_000 }, () => {
      for (const site of SITES) {
        for (let i = 0; i < 100; i++) {
          const inputs = { ...BRIEF, size, site_type: site, decks: i % 7 === 0 ? 2 : 1, win_paths: i % 2 ? ["escape_craft", "seal_section"] : ["airlock"] };
          const r = gen(inputs, `${size}-${site}-${i}`);
          const where = `${size} ${site} seed ${i}`;
          expect(r.failedCheck, `${where}: ${blockFailures(r.layout.checks).map((c) => c.message).join("; ")}`).toBeUndefined();
          expect(blockFailures(r.layout.checks), where).toEqual([]);
          assertInvariants(r.layout, normalizeMapInputs(inputs), where);
        }
      }
    });
  }

  it("also builds maps without ducts and with every hazard", { timeout: 60_000 }, () => {
    for (let i = 0; i < 30; i++) {
      const inputs = { ...BRIEF, size: i % 2 ? "medium" : "large", duct_density: "none", hazards: ["fire", "vacuum", "zero_g", "radiation", "flooding"], site_type: ["starship", "colony_block", "research_lab"][i % 3] };
      const r = gen(inputs, `noduct-${i}`);
      expect(r.failedCheck, `seed ${i}`).toBeUndefined();
      expect(r.layout.zones.some((z) => z.layer === "duct")).toBe(false);
    }
  });
});

function assertInvariants(layout: SiteLayout, inputs: ReturnType<typeof normalizeMapInputs>, where: string): void {
  const byId = new Map(layout.zones.map((z) => [z.id, z]));
  const floor = layout.zones.filter((z) => z.layer !== "duct");
  const playable = floor.filter((z) => z.kind !== "out-of-bounds");
  const [lo, hi] = SIZE_ZONES[inputs.size];
  expect(playable.length, where).toBeGreaterThanOrEqual(lo);
  expect(playable.length, where).toBeLessThanOrEqual(hi);

  // Ids and polygons on the 1 m grid; zones up to 25 m across.
  for (const z of layout.zones) {
    expect(z.id, where).toMatch(z.layer === "duct" ? /^(Z\d{2,}d|D\d{2,})$/ : /^Z\d{2,}$/);
    for (const p of z.poly) expect(Number.isInteger(p[0]) && Number.isInteger(p[1]), `${where} ${z.id}`).toBe(true);
    const b = bounds(z.poly);
    if (z.kind !== "out-of-bounds") expect(Math.max(b.w, b.h), `${where} ${z.id} size`).toBeLessThanOrEqual(25);
    if (z.kind === "corridor") {
      expect(Math.min(b.w, b.h), `${where} ${z.id} corridor width`).toBeGreaterThanOrEqual(2);
      expect(Math.min(b.w, b.h), `${where} ${z.id} corridor width`).toBeLessThanOrEqual(3);
    }
  }

  // Duct zones: crawlspaces on duct sheets, always open and single file; exits (Z07d) lead to their floor zone (Z07).
  const ductDecks = new Set(layout.decks.filter((d) => d.layer === "duct").map((d) => d.id));
  for (const z of layout.zones.filter((x) => x.layer === "duct")) {
    expect(z.kind).toBe("crawlspace");
    expect(z.cluttered, `${where} ${z.id}`).toBe(false);
    expect(z.flags?.singleFile, `${where} ${z.id}`).toBe(true);
    expect(ductDecks.has(z.deck), `${where} ${z.id} sheet`).toBe(true);
    const exit = z.flags?.exitTo as { zone: string } | undefined;
    if (z.id.startsWith("Z")) expect(exit?.zone, `${where} ${z.id} exit`).toBe(z.id.slice(0, -1));
    else expect(exit, `${where} ${z.id}`).toBeUndefined();
  }
  for (const b of layout.borders.filter((x) => x.kind === "access")) {
    expect(b.b, where).toBe(`${b.a}d`);
    expect(b.segment).toBeUndefined();
  }

  // Spawns at least five zones from the start in their act.
  for (const m of layout.markers.filter((x) => x.kind === "spawn")) {
    const d = distancesFrom(layout, layout.start!, m.act ?? 1)[m.zone];
    expect(d, `${where} spawn ${m.zone}`).toBeGreaterThanOrEqual(MIN_SPAWN_DISTANCE);
  }

  // Three clues per puzzle; two of them on separate routes into the puzzle's room.
  for (const p of inputs.puzzles) {
    const clues = layout.markers.filter((m) => m.kind === "clue" && m.data?.puzzle === p.id);
    expect(new Set(clues.map((c) => c.zone)).size, `${where} ${p.id}`).toBe(3);
    const routed = clues.filter((c) => Array.isArray(c.data?.route)).map((c) => ({ zone: c.zone, route: c.data!.route as string[] }));
    expect(routed.length, `${where} ${p.id} routed`).toBeGreaterThanOrEqual(2);
    const [r1, r2] = routed;
    const inner1 = new Set(r1!.route.slice(1, -1));
    expect(r2!.route.slice(1, -1).some((z) => inner1.has(z)), `${where} ${p.id} routes overlap`).toBe(false);
    expect(r1!.route.slice(1, -1)).toContain(r1!.zone);
    expect(r2!.route.slice(1, -1)).toContain(r2!.zone);
    const adj = zoneAdjacency(layout, p.act);
    for (const r of [r1!, r2!]) for (let i = 1; i < r.route.length; i++) expect(adj.get(r.route[i - 1]!), `${where} ${p.id} route step`).toContain(r.route[i]);
  }

  // Win paths reachable in Act 3 from the start; overwhelming threats only with a non-combat way out.
  const wins = layout.markers.filter((m) => m.kind === "win");
  expect(wins.length, where).toBeGreaterThan(0);
  const d3 = bfs(zoneAdjacency(layout, 3), layout.start!);
  for (const w of wins) expect(d3.has(w.zone), `${where} win ${w.zone}`).toBe(true);
  const overwhelming = layout.markers.some((m) => m.kind === "spawn" && m.data?.tier === "overwhelming");
  if (overwhelming) expect(wins.some((w) => NON_COMBAT_WIN_PATHS.includes(w.data?.type as never)), where).toBe(true);

  // Key rooms in act order have two separate routes (one deliberate Act 3 chokepoint allowed).
  const seq = (layout.meta?.sequence as string[]) ?? [];
  const keyAct = new Map(((layout.meta?.keyRooms as Array<{ zone: string; act: number }>) ?? []).map((k) => [k.zone, k.act]));
  let single = 0;
  for (let i = 1; i < seq.length; i++) {
    const act = keyAct.get(seq[i]!) ?? 1;
    if (disjointPaths(zoneAdjacency(layout, act), seq[i - 1]!, seq[i]!, 2).length < 2) {
      single++;
      expect(act, `${where} chokepoint outside Act 3`).toBe(3);
    }
  }
  expect(single, where).toBeLessThanOrEqual(1);

  // Outer hull only where an edge faces the hull.
  for (const z of floor) if (z.flags?.outerHull) expect((z.flags.outerEdges as unknown[] | undefined)?.length ?? 0, `${where} ${z.id}`).toBeGreaterThan(0);
}

describe("site map generator: threats and win paths", () => {
  it("refuses an overwhelming threat without a non-combat way to win, at once", () => {
    const r = gen({ size: "medium", threats: [{ creature: "alien.creature.xx121-queen", act: 3 }], win_paths: ["signal"] }, "queen");
    expect(r.failedCheck).toBe("overwhelming-exit");
    expect(r.attempts).toBe(1);
  });

  it("reports key rooms that do not fit", () => {
    const many = Array.from({ length: 14 }, (_, i) => ({ name: `Room ${i + 1}`, act: 1 + (i % 3) }));
    const r = gen({ size: "small", key_rooms: many }, "crowded");
    expect(r.failedCheck).toBe("key-rooms");
  });

  it("accepts an overwhelming threat with an escape craft and costs threats by tier", () => {
    const r = gen({ size: "medium", crew: 4, threats: [{ creature: "facehugger", act: 1, count: 1 }, { creature: "drone", act: 2 }, { creature: "queen", act: 3 }], win_paths: ["escape_craft"] }, "queen-ok");
    expect(r.failedCheck).toBeUndefined();
    const spawns = r.layout.markers.filter((m) => m.kind === "spawn");
    expect(spawns.map((s) => [s.data?.name, s.data?.tier, s.data?.cost, s.data?.state])).toEqual([
      ["Facehugger", "lesser", 1, "passive"],
      ["Drone", "greater", 3, "active"],
      ["Queen", "overwhelming", 6, "active"],
    ]);
    const acts = r.layout.meta?.acts as Record<string, { cost: number; budget: [number, number]; presence: string }>;
    expect(acts["1"]!.cost).toBe(1);
    expect(acts["2"]!.cost).toBe(4);
    expect(acts["3"]!.cost).toBe(10);
    expect(acts["3"]!.presence).toBe("closing");
    expect(r.layout.checks.find((c) => c.id === "act-budget")!.ok).toBe(false);
  });

  it("gives facehugger swarms their Speed by number (p. 213)", () => {
    const r = gen({ size: "medium", threats: [{ creature: "facehugger", act: 2, count: 7 }] }, "swarm");
    const spawn = r.layout.markers.find((m) => m.kind === "spawn")!;
    expect(spawn.data?.speed).toBe(4);
    expect(spawn.data?.tier).toBe("overwhelming");
  });

  it("places a sealable blast door for the seal-section win path", () => {
    const r = gen({ size: "medium", win_paths: ["seal_section"] }, "seal");
    const win = r.layout.markers.find((m) => m.kind === "win")!;
    const blast = r.layout.borders.find((b) => b.id === win.data?.border);
    expect(blast?.kind).toBe("blast");
    expect(blast?.flags?.sealable).toBe(true);
  });

  it("keeps Act 3 border changes to locks (the zone graph never changes shape)", () => {
    const r = gen(BRIEF, "acts");
    const shape = (act: number) => r.layout.borders.filter((b) => b.kind !== "wall").map((b) => [b.a, b.b, b.kind]);
    expect(shape(3)).toEqual(shape(1));
    expect(r.layout.borders.some((b) => (b.lockedInActs ?? []).length > 0)).toBe(true);
  });
});

describe("site map generator: player projection", () => {
  it("strips GM-only markers, notes, hidden borders, locks, spawns and GM flags", () => {
    const inputs = { ...BRIEF, key_rooms: [{ name: "Medlab", act: 1, description: "The survivor hides in the cold locker." }, { name: "Reactor", act: 2 }, { name: "Hangar", act: 3 }] };
    const r = gen(inputs, "player");
    expect(r.layout.zones.some((z) => z.gmNote)).toBe(true);
    expect(r.layout.borders.some((b) => b.hidden)).toBe(true);
    for (const act of [1, 2, 3]) {
      const p = playerLayout(r.layout, act);
      const text = JSON.stringify(p);
      expect(p.markers.every((m) => !m.gmOnly)).toBe(true);
      expect(p.markers.some((m) => ["spawn", "waypoint", "clue", "npc", "win", "hazard"].includes(m.kind))).toBe(false);
      expect(p.borders.some((b) => b.hidden || b.lock !== undefined || b.lockedInActs !== undefined)).toBe(false);
      expect(p.zones.some((z) => z.gmNote !== undefined || z.details !== undefined || z.salvage !== undefined)).toBe(false);
      for (const z of p.zones) for (const f of ["dark", "flammable", "atmosphere", "gravity", "radiation", "flooded", "deadEnd", "type"]) expect(z.flags?.[f], `${z.id} ${f}`).toBeUndefined();
      expect(p.meta).toBeUndefined();
      expect(p.checks).toEqual([]);
      expect(text).not.toContain("survivor hides");
      expect(text).not.toContain("reactor override");
      expect(text).not.toContain("Drone");
      expect(text).not.toContain("Ash");
      // Duct zones stay as outlines only.
      for (const z of p.zones.filter((x) => x.layer === "duct")) expect(z.name).toBeUndefined();
      // Only key rooms carry names.
      for (const z of p.zones) if (z.name) expect(z.key).toBe(true);
    }
    expect(r.layout.checks.find((c) => c.id === "no-spoilers")!.ok).toBe(true);
  });
});

describe("site map generator: distances", () => {
  it("measures zone distance across passable borders, ducts included", () => {
    const r = gen(BRIEF, "dist");
    const table = zoneDistances(r.layout, 1, { zones: [r.layout.start!] });
    expect(table[r.layout.start!]![r.layout.start!]).toBe(0);
    const n = zoneAdjacency(r.layout, 1).get(r.layout.start!)!;
    for (const z of n) expect(table[r.layout.start!]![z]).toBe(1);
    const floorOnly = distancesFrom(r.layout, r.layout.start!, 1, { floorOnly: true });
    const layerOf = new Map(r.layout.zones.map((z) => [z.id, z.layer]));
    expect(Object.keys(floorOnly).some((z) => layerOf.get(z) === "duct")).toBe(false);
  });
});

describe("site map generator: from the cinematic builder", () => {
  const ctx = {
    adventure: {
      title: "Dead Air",
      premise: "A mining colony has gone silent.",
      playerIntro: "Reach the colony and restore contact.",
      gmSituation: "A Drone nests in the processing plant.",
      epilogue: "",
      fields: { targetHours: 3, threats: "A Drone hunts the halls; the Queen waits below.", countdown: "The reactor overload gives them 20 minutes to reach the shuttle." },
    },
    acts: [
      { id: "a1", number: 1, title: "Arrival", goal: "Search the Ops Center", pacing: "", fields: {}, scenes: [{ title: "Ops", body: "The Ops Center logs are wiped." }] },
      { id: "a2", number: 2, title: "Tilt", goal: "Something stalks the Medlab", pacing: "", fields: { pressure: "Facehuggers scuttle in the vents" }, scenes: [] },
      { id: "a3", number: 3, title: "Showdown", goal: "Reach the Hangar before the reactor blows", pacing: "", fields: {}, scenes: [] },
    ],
    pcs: [{ id: "p1", name: "Rook", fields: {} }, { id: "p2", name: "Vance", fields: {} }],
    npcs: [{ id: "n1", name: "Bishop", fields: { android: true } }, { id: "n2", name: "Hicks", fields: {} }],
    locations: [
      { id: "l1", name: "Ops Center", fields: { description: "Logs wiped.", puzzle: "Locked terminal", puzzleSolution: "Use the foreman's code" } },
      { id: "l2", name: "Medlab", fields: { description: "A body under a sheet." } },
      { id: "l3", name: "Hangar", fields: { description: "The last shuttle." } },
      { id: "l4", name: "Cold Storage", fields: { act: 2, description: "Samples." } },
    ],
  };

  it("maps locations, puzzles, crew, threats and win paths", () => {
    const inputs = inputsFromAdventure(ctx);
    expect(inputs.crew).toBe(4);
    expect(inputs.runtime_h).toBe(3);
    expect(inputs.key_rooms).toEqual([
      { name: "Ops Center", act: 1, description: "Logs wiped." },
      { name: "Medlab", act: 2, description: "A body under a sheet." },
      { name: "Hangar", act: 3, description: "The last shuttle." },
      { name: "Cold Storage", act: 2, description: "Samples." },
    ]);
    expect(inputs.puzzles).toEqual([{ id: "P1", answer: "Use the foreman's code", act: 1, room: "Ops Center" }]);
    expect(inputs.npcs).toEqual([
      { name: "Bishop", role: "android" },
      { name: "Hicks", role: "crew" },
    ]);
    const threats = inputs.threats as Array<{ creature: string; act: number }>;
    expect(threats).toContainEqual({ creature: "alien.creature.xx121-facehugger", act: 2, count: 1 });
    expect(threats).toContainEqual({ creature: "alien.creature.xx121-drone", act: 2, count: 1 });
    expect(threats).toContainEqual({ creature: "alien.creature.xx121-queen", act: 3, count: 1 });
    expect(inputs.win_paths).toEqual(expect.arrayContaining(["escape_craft", "self_destruct"]));
    expect(inputs.site_type).toBe("mine");
  });

  it("feeds a map whose key rooms carry the location names and GM notes", () => {
    const r = gen(inputsFromAdventure(ctx), "forge");
    expect(r.failedCheck).toBeUndefined();
    const keys = r.layout.zones.filter((z) => z.key);
    expect(keys.map((z) => z.name).sort()).toEqual(["Cold Storage", "Hangar", "Medlab", "Ops Center"]);
    expect(keys.find((z) => z.name === "Medlab")!.gmNote).toBe("A body under a sheet.");
    expect(keys.find((z) => z.name === "Hangar")!.acts).toEqual([3]);
    expect(r.layout.markers.filter((m) => m.kind === "clue")).toHaveLength(3);
    expect(r.layout.markers.filter((m) => m.kind === "npc")).toHaveLength(6);
  });

  it("copes with an empty context", () => {
    const inputs = inputsFromAdventure({});
    expect(inputs.crew).toBe(1);
    expect(gen(inputs, "empty").failedCheck).toBeUndefined();
  });
});

describe("site map generator: speed", () => {
  it("builds a medium map in well under 200 ms", () => {
    gen(BRIEF, "warm-up");
    const times: number[] = [];
    for (let i = 0; i < 10; i++) {
      const t0 = performance.now();
      gen(BRIEF, `speed-${i}`);
      times.push(performance.now() - t0);
    }
    times.sort((a, b) => a - b);
    expect(times[Math.floor(times.length / 2)]!).toBeLessThan(200);
  });
});
