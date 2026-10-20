import { describe, expect, it } from "vitest";
import type { MapBorderData, MapGeneratorDef, MapLegendEntry, MapMarker, MapZoneData, SiteLayout } from "@campaign-forge/module-sdk";
import {
  addPing,
  clearPings,
  deckGroups,
  ductEventsFor,
  shaftLinks,
  zoneMove,
  distanceTable,
  distanceTableCsv,
  distanceTableJson,
  liveOf,
  moveToken,
  placeToken,
  playerLayout,
  playerLive,
  projectCampaignForViewer,
  rangeBandFor,
  removeToken,
  revealZones,
  runMapGenerator,
  setAct,
  setBorderState,
  setZoneFlag,
  startLive,
  zoneDistances,
  zoneKeyCsv,
  zoneKeyMarkdown,
  zoneKeyRows,
  zoneNumbers,
  zonePath,
  type SiteMap,
} from "../src";
import { fixtureModule, newStore, seededRandom } from "./fixtures";

const sq = (x: number, y: number, w = 4, h = 4): Array<[number, number]> => [
  [x, y],
  [x + w, y],
  [x + w, y + h],
  [x, y + h],
];

function zone(id: string, x: number, extra: Partial<MapZoneData> = {}): MapZoneData {
  return { id, deck: "d1", kind: "room", layer: "floor", poly: sq(x, 0), cluttered: false, ...extra };
}

/**
 * A - B - C - D in a row, with a duct V over A and D:
 * A|B open, B|C door locked in act 2, C|D door, A~V access, V~D access (sealable).
 */
function lineLayout(): SiteLayout {
  return {
    decks: [{ id: "d1", name: "Deck", width: 20, height: 6 }],
    zones: [zone("A", 0, { key: true, name: "Airlock" }), zone("B", 4), zone("C", 8), zone("D", 12, { key: true, name: "Den" }), zone("V", 0, { kind: "crawlspace", layer: "duct", poly: sq(1, 1, 14, 1) })],
    borders: [
      { id: "ab", a: "A", b: "B", kind: "open", segment: [[4, 0], [4, 4]] },
      { id: "bc", a: "B", b: "C", kind: "door", segment: [[8, 0], [8, 4]], lockedInActs: [2], lock: "electronic" },
      { id: "cd", a: "C", b: "D", kind: "door", segment: [[12, 0], [12, 4]] },
      { id: "av", a: "A", b: "V", kind: "access" },
      { id: "vd", a: "V", b: "D", kind: "access", hidden: true },
    ],
    markers: [],
    start: "A",
    gridM: 1,
    checks: [],
  };
}

const BANDS = [
  { id: "short", label: "Short", maxDistance: 0 },
  { id: "medium", label: "Medium", maxDistance: 1 },
  { id: "long", label: "Long", maxDistance: 4 },
  { id: "extreme", label: "Extreme" },
];

describe("zoneDistances", () => {
  it("counts borders on the shortest passable path, with hidden borders still passable", () => {
    const d = zoneDistances(lineLayout(), { act: 1 });
    expect(d.A).toEqual({ A: 0, B: 1, V: 1, C: 2, D: 2 });
    expect(d.D!.A).toBe(2);
  });

  it("honours per-act locks", () => {
    const layout = lineLayout();
    // act 2: B|C locked; D is still reached through the duct
    const d2 = zoneDistances(layout, { act: 2 });
    expect(d2.B!.C).toBe(4); // B-A-V-D-C
    // seal the duct too: C and D are cut off from A and B
    layout.borders.find((b) => b.id === "av")!.sealed = true;
    const sealed = zoneDistances(layout, { act: 2 });
    expect(sealed.A!.C).toBeUndefined();
    expect(sealed.A!.V).toBeUndefined();
    expect(sealed.C!.D).toBe(1);
  });

  it("applies live overrides: locked, open, sealed and destroyed", () => {
    const layout = lineLayout();
    const base = { borders: {} as Record<string, { locked?: boolean; open?: boolean; sealed?: boolean; destroyed?: boolean }> };
    // unlock the act 2 door live
    expect(zoneDistances(layout, { act: 2, live: { borders: { bc: { open: true } } } }).B!.C).toBe(1);
    expect(zoneDistances(layout, { act: 2, live: { borders: { bc: { locked: false } } } }).B!.C).toBe(1);
    // lock C|D in act 1 and seal the duct's D side: D is unreachable from A
    const cut = zoneDistances(layout, { act: 1, live: { borders: { cd: { locked: true }, vd: { sealed: true } } } });
    expect(cut.A!.D).toBeUndefined();
    // a destroyed locked door is open again
    expect(zoneDistances(layout, { act: 2, live: { borders: { bc: { destroyed: true }, av: { sealed: true } } } }).A!.D).toBe(3);
    // a wall blocks unless destroyed
    layout.borders.push({ id: "bd", a: "B", b: "D", kind: "wall" });
    expect(zoneDistances(layout, { act: 1, live: base }).B!.D).toBe(2);
    expect(zoneDistances(layout, { act: 1, live: { borders: { bd: { destroyed: true } } } }).B!.D).toBe(1);
  });

  it("uses the module's passable rule when given", () => {
    const onlyOpen: MapGeneratorDef["passable"] = (b) => b.kind === "open";
    const d = zoneDistances(lineLayout(), { act: 1, passable: onlyOpen });
    expect(d.A).toEqual({ A: 0, B: 1 });
  });

  it("finds a path and reads range bands", () => {
    expect(zonePath(lineLayout(), "B", "D", { act: 2 })).toEqual(["B", "A", "V", "D"]);
    expect(rangeBandFor(0, BANDS)?.id).toBe("short");
    expect(rangeBandFor(1, BANDS)?.id).toBe("medium");
    expect(rangeBandFor(4, BANDS)?.id).toBe("long");
    expect(rangeBandFor(9, BANDS)?.id).toBe("extreme");
    expect(rangeBandFor(undefined, BANDS)).toBeUndefined();
    expect(rangeBandFor(2, [])).toBeUndefined();
  });

  it("numbers floor zones before ducts", () => {
    expect([...zoneNumbers(lineLayout()).entries()]).toEqual([
      ["A", 1],
      ["B", 2],
      ["C", 3],
      ["D", 4],
      ["V", 5],
    ]);
  });
});

// ---------------------------------------------------------------------------
// player projection
// ---------------------------------------------------------------------------

const SECRET = "SECRET";

function randomLayout(seed: number): { layout: SiteLayout; legend: MapLegendEntry[] } {
  const r = seededRandom(seed);
  const pick = <T,>(xs: readonly T[]): T => xs[Math.floor(r() * xs.length)]!;
  const n = 3 + Math.floor(r() * 10);
  const zones: MapZoneData[] = [];
  for (let i = 0; i < n; i++) {
    const duct = r() < 0.2;
    const z: MapZoneData = {
      id: `z${i}`,
      deck: pick(["d1", "d2"]),
      kind: duct ? "crawlspace" : pick(["room", "corridor", "shaft", "exterior", "out-of-bounds"] as const),
      layer: duct ? "duct" : "floor",
      poly: sq(i * 4, 0),
      cluttered: r() < 0.5,
      // key rooms are named on the player map; other names are GM-only
      key: false,
      area: pick(["a", "b"]),
      acts: [1 + Math.floor(r() * 3)],
      gmNote: `${SECRET}-note-${i}`,
      details: [`${SECRET}-detail-${i}`],
      salvage: [`${SECRET}-salvage-${i}`],
      flags: { lit: r() < 0.5, [`${SECRET}flag`]: true, hidden: `${SECRET}-flagvalue` },
    };
    if (r() < 0.5) {
      z.key = true;
      z.name = `Room ${i}`;
    } else z.name = `${SECRET}-name-${i}`;
    if (r() < 0.5) z.playerNote = `Note ${i}`;
    zones.push(z);
  }
  const borders: MapBorderData[] = [];
  for (let i = 0; i < n * 2; i++) {
    const a = `z${Math.floor(r() * n)}`;
    const b = `z${Math.floor(r() * n)}`;
    const hidden = r() < 0.3;
    const border: MapBorderData = {
      id: hidden ? `${SECRET}-border-${i}` : `b${i}`,
      a,
      b,
      kind: pick(["open", "wall", "door", "hatch", "blast", "access", "stairs"] as const),
      armor: Math.floor(r() * 6),
      hp: 10,
      lock: pick(["none", "mechanical", "electronic"] as const),
      lockedInActs: r() < 0.5 ? [1] : [],
      flags: { outerHull: r() < 0.3, [`${SECRET}bflag`]: true },
    };
    if (hidden) border.hidden = true;
    borders.push(border);
  }
  const markers: MapMarker[] = [];
  for (let i = 0; i < n; i++) {
    const kind = pick(["start", "spawn", "waypoint", "clue", "npc", "win", "label", "hazard"] as const);
    const gmOnly = r() < 0.5;
    const secret = gmOnly || ["spawn", "waypoint", "clue", "npc"].includes(kind);
    markers.push({ id: secret ? `${SECRET}-marker-${i}` : `m${i}`, kind, zone: `z${Math.floor(r() * n)}`, label: secret ? `${SECRET}-label-${i}` : `Label ${i}`, gmOnly, act: 2, data: { x: `${SECRET}-data` } });
  }
  const legend: MapLegendEntry[] = [
    { target: { flag: "lit" }, label: "Lit" },
    { target: { flag: `${SECRET}flag` }, label: "Secret", gmOnly: true },
  ];
  return {
    layout: { decks: [{ id: "d1", name: "One", width: 60, height: 10 }, { id: "d2", name: "Two", width: 60, height: 10 }], zones, borders, markers, start: "z0", gridM: 1, checks: [{ id: "c", level: "block", ok: true, message: `${SECRET}-check` }] },
    legend,
  };
}

describe("playerLayout", () => {
  it("never lets GM-only data through (property test over random layouts)", () => {
    for (let seed = 1; seed <= 300; seed++) {
      const { layout, legend } = randomLayout(seed);
      const r = seededRandom(seed * 7);
      const revealed = layout.zones.filter(() => r() < 0.5).map((z) => z.id);
      for (const opts of [{ act: 1 }, { act: 2, revealed }, { act: 1, revealed, print: true }, { act: 1, legend }, { act: 3, revealed, legend }]) {
        const out = playerLayout(layout, opts);
        const json = JSON.stringify(out);
        expect(json, `seed ${seed}`).not.toContain(SECRET);
        expect(out.checks).toEqual([]);
        for (const z of out.zones) {
          expect(z.gmNote).toBeUndefined();
          expect(z.acts).toBeUndefined();
          expect(z.details).toBeUndefined();
          expect(z.salvage).toBeUndefined();
        }
        for (const m of out.markers) {
          expect(m.gmOnly).toBe(false);
          expect(["spawn", "clue", "npc", "waypoint"]).not.toContain(m.kind);
          expect(m.data).toBeUndefined();
        }
        for (const b of out.borders) {
          expect(b.hidden).toBeUndefined();
          expect(b.lockedInActs).toBeUndefined();
          expect(b.lock).toBeUndefined();
          expect(b.hp).toBeUndefined();
        }
        if (opts.revealed && !opts.print) {
          const seen = new Set(opts.revealed);
          for (const z of out.zones) {
            if (z.kind === "out-of-bounds") continue;
            expect(out.fogged.includes(z.id)).toBe(!seen.has(z.id));
          }
          // fogged zones are bare outlines
          for (const id of out.fogged) {
            const z = out.zones.find((x) => x.id === id)!;
            expect(Object.keys(z).sort()).toEqual(["cluttered", "deck", "id", "kind", "layer", "poly"].filter((k) => k in z).sort());
            expect(z.name).toBeUndefined();
          }
          // markers only in visible zones
          for (const m of out.markers) expect(out.fogged).not.toContain(m.zone);
        } else {
          expect(out.fogged).toEqual([]);
        }
      }
    }
  }, 60_000);

  it("keeps the player map: names of key zones, legend-visible flags, duct outlines, seals and known locks", () => {
    const layout = lineLayout();
    layout.zones[0]!.flags = { dark: true, cursed: true };
    layout.markers = [
      { id: "s", kind: "start", zone: "A", label: "Start", gmOnly: false },
      { id: "sp", kind: "spawn", zone: "C", label: "Beast", gmOnly: false },
    ];
    layout.borders.find((b) => b.id === "av")!.sealed = true;
    const legend: MapLegendEntry[] = [
      { target: { flag: "dark" }, label: "Dark" },
      { target: { flag: "cursed" }, label: "Cursed", gmOnly: true },
    ];
    const out = playerLayout(layout, { act: 2, legend });
    expect(out.zones.find((z) => z.id === "A")).toMatchObject({ name: "Airlock", key: true, flags: { dark: true } });
    expect(out.zones.find((z) => z.id === "A")!.flags).not.toHaveProperty("cursed");
    expect(out.zones.find((z) => z.id === "B")!.name).toBeUndefined();
    expect(out.zones.find((z) => z.id === "V")).toEqual({ id: "V", deck: "d1", kind: "crawlspace", layer: "duct", poly: sq(1, 1, 14, 1), cluttered: false });
    expect(out.markers.map((m) => m.id)).toEqual(["s"]);
    expect(out.borders.map((b) => b.id)).toEqual(["ab", "bc", "cd", "av"]);
    expect(out.borders.find((b) => b.id === "av")!.sealed).toBe(true);
    expect(out.borders.find((b) => b.id === "bc")!.lockedInActs).toBeUndefined();
    // the lock and the hidden access point show once the players know about them
    const known = playerLayout(layout, { act: 2, legend, live: { borders: { bc: { known: true }, vd: { known: true } } } });
    expect(known.borders.find((b) => b.id === "bc")).toMatchObject({ lockedInActs: [2], lock: "electronic" });
    expect(known.borders.map((b) => b.id)).toContain("vd");
  });

  it("drops a duct reached only through hidden borders", () => {
    const layout = lineLayout();
    layout.borders.find((b) => b.id === "av")!.hidden = true;
    const out = playerLayout(layout, { act: 1 });
    expect(out.zones.map((z) => z.id)).not.toContain("V");
  });

  it("fogs unrevealed zones and hides walls deep in the fog; printing shows everything", () => {
    const out = playerLayout(lineLayout(), { act: 1, revealed: ["A"] });
    expect(out.fogged.sort()).toEqual(["B", "C", "D", "V"]);
    expect(out.borders.map((b) => b.id)).toEqual(["ab", "av"]);
    const print = playerLayout(lineLayout(), { act: 1, revealed: ["A"], print: true });
    expect(print.fogged).toEqual([]);
    expect(print.borders).toHaveLength(4);
  });

  it("projects live state: no pings, no GM tokens, tokens and flags only where players can see", () => {
    const layout = lineLayout();
    const projected = playerLayout(layout, { act: 1, revealed: ["A", "B"] });
    const live = {
      act: 1,
      revealed: ["A", "B"],
      borders: {},
      zoneFlags: { A: { burning: true, cursed: true }, C: { burning: true } },
      tokens: [
        { id: "t1", label: "Ripley", zone: "A", gmOnly: false },
        { id: "t2", label: "Beast", zone: "B", gmOnly: true },
        { id: "t3", label: "Other", zone: "C", gmOnly: false },
      ],
      pings: [{ zone: "B", at: "x" }],
    };
    const out = playerLive(live, projected, [{ target: { flag: "burning" }, label: "Burning" }]);
    expect(out).toEqual({ zoneFlags: { A: { burning: true } }, tokens: [{ id: "t1", label: "Ripley", zone: "A" }] });
  });

  it("projects site maps in the campaign player view", () => {
    const store = newStore();
    const map = store.createMap({ name: "Deck", visibility: { level: "players" }, accessPoints: [{ id: "ap", name: "Vent", zones: [], hidden: true }] });
    const layout = lineLayout();
    layout.zones[2]!.gmNote = "secret note";
    store.update("maps", map.id, { layout, generator: { id: "g", seed: "s", inputs: { brief: "secret brief" } } });
    startLive(store, map.id, 1);
    placeToken(store, map.id, { label: "Beast", zone: "A", gmOnly: true });
    addPing(store, map.id, "A");
    const view = projectCampaignForViewer(store.toJSON(), fixtureModule, { role: "player" });
    const pm = view.maps[map.id]!;
    expect(JSON.stringify(pm)).not.toContain("secret");
    expect(pm.accessPoints).toEqual([]);
    expect(pm.generator).toBeUndefined();
    expect(pm.live!.tokens).toEqual([]);
    expect(pm.live!.pings).toEqual([]);
    expect((pm.layout as unknown as { fogged: string[] }).fogged.sort()).toEqual(["B", "C", "D", "V"]);
  });
});

// ---------------------------------------------------------------------------
// live state
// ---------------------------------------------------------------------------

describe("live helpers", () => {
  function setup() {
    const store = newStore();
    const map = store.createMap({ name: "Deck" });
    store.update("maps", map.id, { layout: lineLayout() });
    return { store, id: map.id };
  }

  it("start, reveal, act, borders, flags, tokens and pings all write the map's live state", () => {
    const { store, id } = setup();
    expect(startLive(store, id, 1)).toEqual({ act: 1, revealed: ["A"], borders: {}, zoneFlags: {}, tokens: [], pings: [] });
    revealZones(store, id, ["B", "C"]);
    revealZones(store, id, ["C"], false);
    expect(store.get("maps", id)!.live!.revealed).toEqual(["A", "B"]);

    setBorderState(store, id, "bc", { locked: true, known: true });
    setBorderState(store, id, "av", { sealed: true });
    expect(store.get("maps", id)!.live!.borders).toEqual({ bc: { locked: true, known: true }, av: { sealed: true } });
    setBorderState(store, id, "bc", { locked: undefined });
    expect(store.get("maps", id)!.live!.borders.bc).toEqual({ known: true });

    setZoneFlag(store, id, "B", "burning", true);
    setZoneFlag(store, id, "C", "burning", true);
    setZoneFlag(store, id, "C", "burning", false);
    expect(store.get("maps", id)!.live!.zoneFlags).toEqual({ B: { burning: true } });

    const t = placeToken(store, id, { label: "Beast", zone: "V", gmOnly: true });
    moveToken(store, id, t, "D");
    expect(store.get("maps", id)!.live!.tokens).toEqual([{ id: t, label: "Beast", zone: "D", gmOnly: true }]);

    addPing(store, id, "D", "2026-10-19T00:00:00Z");
    addPing(store, id, "C", "2026-10-19T00:00:00Z");
    expect(store.get("maps", id)!.live!.pings).toHaveLength(2);
    clearPings(store, id);
    expect(store.get("maps", id)!.live!.pings).toEqual([]);

    // a new act drops lock overrides but keeps seals, finds, fog, flags and tokens
    setBorderState(store, id, "cd", { locked: true });
    setAct(store, id, 2);
    const live = liveOf(store.get("maps", id)!);
    expect(live.act).toBe(2);
    expect(live.borders).toEqual({ bc: { known: true }, av: { sealed: true } });
    expect(live.revealed).toEqual(["A", "B"]);
    expect(live.tokens).toHaveLength(1);
    removeToken(store, id, t);
    expect(liveOf(store.get("maps", id)!).tokens).toEqual([]);
  });

  it("distances recompute from the live state", () => {
    const { store, id } = setup();
    startLive(store, id, 1);
    const at = () => distanceTable(store.get("maps", id)!, { keyOnly: true }).distance.A!.D;
    expect(at()).toBe(2);
    setBorderState(store, id, "av", { sealed: true });
    expect(at()).toBe(3);
    setBorderState(store, id, "cd", { locked: true });
    expect(at()).toBeUndefined();
    setBorderState(store, id, "cd", { destroyed: true });
    expect(at()).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// exports
// ---------------------------------------------------------------------------

describe("zone key and distance exports", () => {
  const generator: MapGeneratorDef = {
    id: "fixture.gen",
    name: "Fixture",
    inputs: { type: "object" },
    stages: [],
    generate: () => ({ layout: lineLayout(), attempts: 1 }),
    rangeBands: BANDS,
    legend: [
      { target: { border: "door" }, label: "Door" },
      { target: { flag: "dark" }, label: "Dark" },
      { target: { flag: "gravity", value: false }, label: "Zero gravity" },
    ],
  };
  const module = { mapGenerators: [generator] };

  function map(): SiteMap {
    const layout = lineLayout();
    layout.zones[0]!.flags = { dark: true, gravity: true };
    layout.zones[1]!.flags = { dark: false, gravity: false };
    layout.zones[0]!.details = ["Flickering"];
    layout.zones[0]!.salvage = ["Medkit"];
    layout.zones[0]!.gmNote = "Survivor | hiding";
    layout.markers = [{ id: "c1", kind: "clue", zone: "A", label: "P1-a", gmOnly: true }];
    return {
      id: "m",
      created: "",
      updated: "",
      name: "Deck A",
      zones: [],
      borders: [],
      accessPoints: [],
      visibility: { level: "gm" },
      layout,
      generator: { id: "fixture.gen", seed: "s", inputs: {} },
    };
  }

  it("builds zone key rows per zone with exits, flags, dressing, clues and GM notes", () => {
    const rows = zoneKeyRows(map(), module);
    expect(rows.map((r) => r.number)).toEqual([1, 2, 3, 4, 5]);
    const a = rows[0]!;
    expect(a).toMatchObject({ id: "A", name: "Airlock", cover: "open", flags: ["Dark"], details: ["Flickering"], salvage: ["Medkit"], clues: ["P1-a"], gmNote: "Survivor | hiding" });
    expect(a.exits.map((e) => `${e.number} ${e.kind}`)).toEqual(["2 open", "5 access"]);
    expect(rows[1]!.flags).toEqual(["Zero gravity"]);
    const b = rows[1]!;
    expect(b.exits.find((e) => e.zone === "C")).toMatchObject({ kind: "Door", notes: ["electronic lock", "locked in act 2"] });
  });

  it("writes Markdown and CSV", () => {
    const md = zoneKeyMarkdown(map(), module);
    expect(md).toContain("# Deck A: zone key");
    expect(md).toContain("| 1 | Airlock (A) | open | Dark | 2 Room (open); 5 Crawlspace (access) | Flickering | Medkit | P1-a | Survivor \\| hiding |");
    const csv = zoneKeyCsv(map(), module);
    const lines = csv.trim().split("\r\n");
    expect(lines[0]).toBe("number,id,name,kind,deck,cover,flags,exits,details,salvage,clues,gm_note");
    expect(lines).toHaveLength(6);
    expect(lines[1]).toBe("1,A,Airlock,room,d1,open,Dark,2 Room (open); 5 Crawlspace (access),Flickering,Medkit,P1-a,Survivor | hiding");
  });

  it("writes the distance table for key zones or every zone", () => {
    const t = distanceTable(map(), { module });
    expect(t.zones.map((z) => z.id)).toEqual(["A", "D"]);
    expect(t.distance).toEqual({ A: { A: 0, D: 2 }, D: { A: 2, D: 0 } });
    expect(t.band).toEqual({ A: { A: "short", D: "long" }, D: { A: "long", D: "short" } });
    const csv = distanceTableCsv(map(), { module });
    expect(csv.trim().split("\r\n")).toEqual([
      "from_number,from_id,from_name,to_number,to_id,to_name,distance,range_band",
      "1,A,Airlock,1,A,Airlock,0,Short",
      "1,A,Airlock,4,D,Den,2,Long",
      "4,D,Den,1,A,Airlock,2,Long",
      "4,D,Den,4,D,Den,0,Short",
    ]);
    const all = distanceTable(map(), { module, keyOnly: false, act: 2 });
    expect(all.zones).toHaveLength(5);
    expect(all.distance.B!.C).toBe(4);
    const json = JSON.parse(distanceTableJson(map(), { module, keyOnly: false }));
    expect(json.act).toBe(1);
    expect(json.distance.A.C).toBe(2);
  });
});

describe("runMapGenerator", () => {
  it("seeds streams from the seed, or from a stage seed", () => {
    const seen: number[] = [];
    const def: MapGeneratorDef = {
      id: "g",
      name: "g",
      inputs: { type: "object" },
      stages: [{ id: "a", title: "A" }],
      generate: (_i, ctx) => {
        seen.push(ctx.rng("a").next(), ctx.rng("b").next());
        return { layout: lineLayout(), attempts: 1 };
      },
    };
    runMapGenerator(fixtureModule, def, {}, { seed: "s" });
    runMapGenerator(fixtureModule, def, {}, { seed: "s" });
    runMapGenerator(fixtureModule, def, {}, { seed: "s", stageSeeds: { a: "other" } });
    expect(seen[0]).toBe(seen[2]);
    expect(seen[1]).toBe(seen[3]);
    expect(seen[4]).not.toBe(seen[0]);
    expect(seen[5]).toBe(seen[1]);
  });
});

// ---------------------------------------------------------------------------
// duct sheets
// ---------------------------------------------------------------------------

/** One-way shafts (flag `oneWay`) are drops: passable downward only. */
const dropRule: NonNullable<MapGeneratorDef["passable"]> = (b, _act, move) => {
  if (b.kind === "wall" || b.sealed) return false;
  if (b.kind === "shaft" && b.flags?.oneWay === true && move && move.vertical !== "down") return false;
  return true;
};

/**
 * A floor deck F (level 1) with rooms A and B behind a wall; a duct sheet S1
 * (level 1) with D1 - D2; a duct sheet S0 (level 0) with U1 - U2. A opens into
 * D1, D2 drops one way into U1, U2 opens into B. A ladder L joins D1 and U2.
 */
function ductLayout(): SiteLayout {
  const duct = (id: string, deck: string, x: number, extra: Partial<MapZoneData> = {}): MapZoneData => ({ id, deck, kind: "crawlspace", layer: "duct", poly: sq(x, 0, 3, 1), cluttered: false, ...extra });
  return {
    decks: [
      { id: "F", name: "Deck A", width: 20, height: 6, layer: "floor", level: 1 },
      { id: "S1", name: "Ducts A1", width: 12, height: 4, layer: "duct", level: 1, serves: "F" },
      { id: "S0", name: "Ducts A0", width: 12, height: 4, layer: "duct", level: 0 },
    ],
    zones: [
      { id: "A", deck: "F", kind: "room", layer: "floor", poly: sq(0, 0), cluttered: false, key: true, name: "Galley", flags: { ductTo: { zone: "D1" } } },
      { id: "B", deck: "F", kind: "room", layer: "floor", poly: sq(4, 0), cluttered: false, key: true, name: "Brig", flags: { ductTo: { zone: "U2" } } },
      duct("D1", "S1", 0, { flags: { exitTo: { zone: "A", name: "Galley" } } }),
      duct("D2", "S1", 3, { flags: { fan: true } }),
      duct("U1", "S0", 0),
      duct("U2", "S0", 3, { flags: { exitTo: { zone: "B", name: "Brig" } } }),
    ],
    borders: [
      { id: "ab", a: "A", b: "B", kind: "wall", segment: [[4, 0], [4, 4]] },
      { id: "a-d1", a: "A", b: "D1", kind: "access" },
      { id: "d1-d2", a: "D1", b: "D2", kind: "open" },
      { id: "drop", a: "D2", b: "U1", kind: "shaft", flags: { dropM: 4, oneWay: true } },
      { id: "u1-u2", a: "U1", b: "U2", kind: "open" },
      { id: "u2-b", a: "U2", b: "B", kind: "access", hidden: true },
    ],
    markers: [{ id: "m", kind: "spawn", zone: "D2", label: "Lurker", gmOnly: true }],
    start: "A",
    gridM: 1,
    checks: [],
  };
}

const ductGen: MapGeneratorDef = {
  id: "test.ducts",
  name: "Ducts",
  inputs: { type: "object" },
  stages: [],
  generate: () => ({ layout: ductLayout(), attempts: 1 }),
  passable: dropRule,
  legend: [{ target: { flag: "fan" }, label: "Fan", gmOnly: true, icon: "fan" }],
  zoneTables: [
    { table: "t.duct", label: "Duct event", when: { layer: "duct" }, hint: "Roll on entering." },
    { table: "t.fan", label: "Fan", when: { flag: "fan" } },
    { table: "t.room", label: "Room", when: { layer: "floor", kind: "room" } },
  ],
};
const ductModule = { mapGenerators: [ductGen] };

describe("duct sheets: distances", () => {
  it("runs through shafts between sheets, one-way drops downward only", () => {
    const l = ductLayout();
    const d = zoneDistances(l, { act: 1, passable: dropRule });
    // A - D1 - D2 - (drop) U1 - U2 - B
    expect(d.A!.B).toBe(5);
    expect(d.D2!.U1).toBe(1);
    // no climbing back up the drop: from below, the upper sheet is out of reach
    expect(d.U1!.D2).toBeUndefined();
    expect(d.B!.A).toBeUndefined();
    expect(zonePath(l, "A", "B", { act: 1, passable: dropRule })).toEqual(["A", "D1", "D2", "U1", "U2", "B"]);
    expect(zonePath(l, "B", "A", { act: 1, passable: dropRule })).toBeUndefined();
    // without the module's rule a shaft is an ordinary two-way link
    expect(zoneDistances(l, { act: 1 }).B!.A).toBe(5);
    // a ladder back up makes the round trip
    l.borders.push({ id: "ladder", a: "U2", b: "D1", kind: "shaft" });
    const back = zoneDistances(l, { act: 1, passable: dropRule });
    expect(back.B!.A).toBe(3);
    expect(back.A!.B).toBe(3);
    // a sealed shaft blocks both ways
    expect(zoneDistances(l, { act: 1, passable: dropRule, live: { borders: { ladder: { sealed: true } } } }).B!.A).toBeUndefined();
  });

  it("passes the direction of travel to the module, from the decks' levels", () => {
    const l = ductLayout();
    expect(zoneMove(l, "D2", "U1")).toEqual({ from: "D2", to: "U1", vertical: "down" });
    expect(zoneMove(l, "U1", "D2").vertical).toBe("up");
    expect(zoneMove(l, "A", "D1").vertical).toBe("level");
    const seen: string[] = [];
    zoneDistances(l, { act: 1, passable: (b, _a, move) => (seen.push(`${b.id}:${move?.from}>${move?.to}:${move?.vertical}`), true) });
    expect(seen).toContain("drop:D2>U1:down");
    expect(seen).toContain("drop:U1>D2:up");
    const [link] = shaftLinks(l, "D2", { act: 1, passable: dropRule });
    expect(link).toMatchObject({ other: "U1", direction: "down", go: true, back: false });
    expect(shaftLinks(l, "U1", { act: 1, passable: dropRule })[0]).toMatchObject({ other: "D2", direction: "up", go: false, back: true });
  });

  it("groups duct sheets under the floor deck they serve, by level", () => {
    const groups = deckGroups(ductLayout());
    // S0 serves no deck, but its access point opens into deck F
    expect(groups.map((g) => [g.deck?.id, g.ducts.map((d) => d.id)])).toEqual([["F", ["S0", "S1"]]]);
    const lone = ductLayout();
    lone.borders = lone.borders.filter((b) => b.id !== "u2-b");
    expect(deckGroups(lone).map((g) => [g.deck?.id, g.ducts.map((d) => d.id)])).toEqual([
      ["F", ["S1"]],
      [undefined, ["S0"]],
    ]);
  });
});

describe("duct sheets: player projection", () => {
  it("leaves duct sheets out until one of their zones is revealed or known; unfound zones stay out, outlines and all", () => {
    const l = ductLayout();
    const none = playerLayout(l, { act: 1, revealed: ["A"] });
    expect(none.decks.map((d) => d.id)).toEqual(["F"]);
    expect(none.zones.map((z) => z.id)).toEqual(["A", "B"]);
    // the access point into an unseen sheet is not drawn either
    expect(none.borders.map((b) => b.id)).toEqual(["ab"]);
    const one = playerLayout(l, { act: 1, revealed: ["A", "D1"] });
    expect(one.decks.map((d) => d.id)).toEqual(["F", "S1"]);
    expect(one.decks[1]).toEqual({ id: "S1", name: "Ducts A1", width: 12, height: 4, layer: "duct", level: 1, serves: "F" });
    expect(one.fogged.sort()).toEqual(["B"]);
    expect(one.zones.map((z) => z.id)).toEqual(["A", "B", "D1"]);
    expect(one.markers).toEqual([]);
    // the drop leads further into the unknown: no run, no shaft yet
    expect(one.borders.map((b) => b.id).sort()).toEqual(["a-d1", "ab"]);
    // a known border makes its far zone a fogged outline, and can bring a sheet in
    const known = playerLayout(l, { act: 1, revealed: ["A", "D1"], live: { borders: { "d1-d2": { known: true }, "u2-b": { known: true } } } });
    expect(known.decks.map((d) => d.id)).toEqual(["F", "S1", "S0"]);
    expect(known.fogged.sort()).toEqual(["B", "D2", "U2"]);
    expect(known.zones.find((z) => z.id === "D2")).toEqual({ id: "D2", deck: "S1", kind: "crawlspace", layer: "duct", poly: sq(3, 0, 3, 1), cluttered: false });
    // duct zone names are the GM's, even for key zones
    const named = ductLayout();
    named.zones.find((z) => z.id === "D1")!.key = true;
    named.zones.find((z) => z.id === "D1")!.name = "Secret vent";
    expect(JSON.stringify(playerLayout(named, { act: 1, revealed: ["D1"] }))).not.toContain("Secret vent");
  });

  it("prints duct sheets for players only once revealed, with fog on what is not", () => {
    const l = ductLayout();
    expect(playerLayout(l, { act: 1, print: true }).decks.map((d) => d.id)).toEqual(["F"]);
    const p = playerLayout(l, { act: 1, print: true, revealed: ["D1", "D2", "U1"] });
    expect(p.decks.map((d) => d.id)).toEqual(["F", "S1", "S0"]);
    // floor decks print whole; on duct sheets only what the players found
    expect(p.fogged).toEqual([]);
    expect(p.zones.map((z) => z.id)).toEqual(["A", "B", "D1", "D2", "U1"]);
    expect(p.borders.map((b) => b.id)).toContain("drop");
  });

  it("drops hazard flags and exit labels until the legend shows them or the link is known", () => {
    const l = ductLayout();
    const revealed = ["A", "B", "D1", "D2", "U1", "U2"];
    const plain = playerLayout(l, { act: 1, revealed, legend: ductGen.legend });
    for (const z of plain.zones) expect(z.flags).toBeUndefined();
    const known = playerLayout(l, { act: 1, revealed, legend: ductGen.legend, live: { borders: { "a-d1": { known: true } } } });
    expect(known.zones.find((z) => z.id === "D1")!.flags).toEqual({ exitTo: { zone: "A", name: "Galley" } });
    expect(known.zones.find((z) => z.id === "A")!.flags).toEqual({ ductTo: { zone: "D1" } });
    expect(known.zones.find((z) => z.id === "U2")!.flags).toBeUndefined();
    expect(known.zones.find((z) => z.id === "D2")!.flags).toBeUndefined();
    const shown = playerLayout(l, { act: 1, revealed, legend: [{ target: { flag: "fan" }, label: "Fan" }, { target: { flag: "exitTo" }, label: "Exit" }] });
    expect(shown.zones.find((z) => z.id === "D2")!.flags).toEqual({ fan: true });
    expect(shown.zones.find((z) => z.id === "U2")!.flags).toEqual({ exitTo: { zone: "B", name: "Brig" } });
    // a fogged zone keeps no flags at all
    const fog = playerLayout(l, { act: 1, revealed: ["D1"], legend: [{ target: { flag: "exitTo" }, label: "Exit" }] });
    expect(fog.zones.find((z) => z.id === "A")!.flags).toBeUndefined();
  });

  it("never lets an unrevealed duct sheet, a GM hazard or an unknown exit through (property test)", () => {
    for (let seed = 1; seed <= 200; seed++) {
      const r = seededRandom(seed * 13);
      const sheets = ["s1", "s2"];
      const zones: MapZoneData[] = [];
      const n = 4 + Math.floor(r() * 8);
      for (let i = 0; i < n; i++) {
        const onSheet = r() < 0.6;
        const deck = onSheet ? sheets[Math.floor(r() * 2)]! : "f";
        const z: MapZoneData = { id: `z${i}`, deck, kind: onSheet ? "crawlspace" : "room", layer: onSheet ? "duct" : "floor", poly: sq(i * 3, 0, 3, 1), cluttered: r() < 0.5, gmNote: `${SECRET}-note`, flags: { [`${SECRET}haz`]: true, fan: r() < 0.5 } };
        const target = `z${Math.floor(r() * n)}`;
        if (onSheet && r() < 0.6) z.flags!.exitTo = { zone: target, name: `${SECRET}-exit-${i}` };
        if (!onSheet && r() < 0.6) z.flags!.ductTo = { zone: `${SECRET}-duct-${target}` };
        zones.push(z);
      }
      const borders: MapBorderData[] = [];
      for (let i = 0; i < n * 2; i++) {
        const a = `z${Math.floor(r() * n)}`;
        const b = `z${Math.floor(r() * n)}`;
        borders.push({ id: `b${i}`, a, b, kind: (["open", "access", "shaft", "hatch"] as const)[Math.floor(r() * 4)]!, flags: { dropM: 3, oneWay: r() < 0.5 } });
      }
      const layout: SiteLayout = {
        decks: [
          { id: "f", name: "Floor", width: 60, height: 4 },
          { id: "s1", name: "Sheet one", width: 60, height: 4, layer: "duct", level: 2 },
          { id: "s2", name: "Sheet two", width: 60, height: 4, layer: "duct", level: 0 },
        ],
        zones,
        borders,
        markers: [],
        checks: [],
      };
      const legend: MapLegendEntry[] = [{ target: { flag: "fan" }, label: "Fan", gmOnly: true, icon: "fan" }];
      const revealed = zones.filter(() => r() < 0.4).map((z) => z.id);
      for (const opts of [{ act: 1 }, { act: 1, revealed }, { act: 1, revealed, print: true }, { act: 1, print: true }, { act: 2, revealed, legend }]) {
        const out = playerLayout(layout, opts);
        const json = JSON.stringify(out);
        expect(json, `seed ${seed}`).not.toContain(SECRET);
        expect(json).not.toContain('"fan"');
        const seen = new Set(opts.revealed ?? []);
        const shownSheets = new Set(zones.filter((z) => z.deck !== "f" && seen.has(z.id)).map((z) => z.deck));
        expect(out.decks.filter((d) => d.layer === "duct").map((d) => d.id).sort(), `seed ${seed}`).toEqual([...shownSheets].sort());
        for (const z of out.zones) {
          if (z.deck === "f") continue;
          expect(shownSheets.has(z.deck)).toBe(true);
          // duct sheet zones are only those the players found (no known borders here)
          expect(seen.has(z.id)).toBe(true);
          expect(out.fogged.includes(z.id)).toBe(false);
          expect(z.name).toBeUndefined();
          expect(z.flags?.exitTo).toBeUndefined();
        }
        for (const b of out.borders) expect(out.zones.some((z) => z.id === b.a) && out.zones.some((z) => z.id === b.b)).toBe(true);
      }
    }
  }, 60_000);
});

describe("duct sheets: zone key and duct events", () => {
  const map = (): Pick<SiteMap, "layout" | "generator" | "live" | "name"> => ({ name: "Ducts", layout: ductLayout(), generator: { id: "test.ducts", seed: "s", inputs: {} } });

  it("lists exits by the room they open into and shafts by sheet and zone", () => {
    const rows = zoneKeyRows(map(), ductModule);
    const row = (id: string) => rows.find((r) => r.id === id)!;
    expect(row("D1")).toMatchObject({ deckName: "Ducts A1", layer: "duct" });
    expect(row("D1").exits.map((e) => e.label)).toEqual(["To Galley (A)", undefined]);
    expect(row("D2").exits.map((e) => e.label)).toEqual([undefined, "Drop down to Ducts A0, U1"]);
    expect(row("U1").exits.map((e) => e.label)).toEqual(["Drop from Ducts A1, D2 (no climb back)", undefined]);
    expect(row("A").exits.map((e) => e.label)).toEqual([undefined, "Duct access to Ducts A1, D1"]);
    expect(row("U2").exits.find((e) => e.zone === "B")!.label).toBe("To Brig (B)");
    // exit labels are not flags
    expect(row("D1").flags).toEqual([]);
    const md = zoneKeyMarkdown(map(), ductModule);
    expect(md).toContain("To Galley (A) (access)");
    expect(md).toContain("Drop down to Ducts A0, U1 (shaft");
    expect(zoneKeyCsv(map(), ductModule)).toContain("Drop from Ducts A1, D2 (no climb back)");
    // a two-way shaft up
    const two = map();
    two.layout!.borders.find((b) => b.id === "drop")!.flags = {};
    expect(zoneKeyRows(two, ductModule).find((r) => r.id === "U1")!.exits[0]!.label).toBe("Shaft up to Ducts A1, D2");
  });

  it("offers the module's zone tables that match a zone (duct event tables)", () => {
    const m = map();
    expect(ductEventsFor(m, ductModule, "D1").map((t) => t.table)).toEqual(["t.duct"]);
    expect(ductEventsFor(m, ductModule, "D2").map((t) => t.table)).toEqual(["t.duct", "t.fan"]);
    expect(ductEventsFor(m, ductModule, "A").map((t) => t.table)).toEqual(["t.room"]);
    expect(ductEventsFor(m, ductModule, "nope")).toEqual([]);
    expect(ductEventsFor(m, undefined, "D1")).toEqual([]);
    // live flags count
    m.live = { act: 1, revealed: [], borders: {}, zoneFlags: { U1: { fan: true } }, tokens: [], pings: [] };
    expect(ductEventsFor(m, ductModule, "U1").map((t) => t.table)).toEqual(["t.duct", "t.fan"]);
  });
});
