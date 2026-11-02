import { describe, expect, it } from "vitest";
import type { MapGeneratorDef, MapHuntDef, MapZoneData, SiteLayout } from "@campaign-forge/module-sdk";
import {
  advanceHunt,
  carriedSensors,
  huntMarkerSources,
  huntOf,
  liveOf,
  moveHuntToken,
  nextBlipLetter,
  placeHuntSource,
  placeHuntToken,
  playerLayout,
  playerLive,
  projectCampaignForViewer,
  recordSweep,
  removeHuntToken,
  setAct,
  setHuntHurt,
  setHuntLetter,
  setHuntTokenState,
  startLive,
  suggestHuntMove,
  suggestHuntMoves,
  sweepLogText,
  sweepReadings,
  zoneBearing,
  type CampaignStore,
  type HuntToken,
  type SiteMap,
} from "../src";
import { fixtureModule, newStore } from "./fixtures";

const sq = (x: number, y: number, w = 4, h = 4): Array<[number, number]> => [
  [x, y],
  [x + w, y],
  [x + w, y + h],
  [x, y + h],
];
const room = (id: string, x: number, y: number, extra: Partial<MapZoneData> = {}): MapZoneData => ({ id, deck: "main", kind: "room", layer: "floor", poly: sq(x, y), cluttered: false, ...extra });
const vent = (id: string, x: number): MapZoneData => ({ id, deck: "vents", kind: "crawlspace", layer: "duct", poly: sq(x, 0), cluttered: false });

/**
 * A - B - C - D in a row, E south of C, F south of A (dark, cluttered), X out
 * of bounds past D. The vents (a duct sheet one level up) run A ~ V1 - V2 ~ D.
 * C|D is a door locked in act 1.
 */
function huntLayout(): SiteLayout {
  return {
    decks: [
      { id: "main", name: "Deck", width: 20, height: 8, layer: "floor", level: 1 },
      { id: "vents", name: "Vents", width: 8, height: 4, layer: "duct", level: 2, serves: "main" },
    ],
    zones: [
      room("A", 0, 0, { key: true, name: "Airlock" }),
      room("B", 4, 0),
      room("C", 8, 0),
      room("D", 12, 0),
      room("E", 8, 4),
      room("F", 0, 4, { cluttered: true, flags: { dark: true } }),
      room("X", 16, 0, { kind: "out-of-bounds" }),
      vent("V1", 0),
      vent("V2", 4),
    ],
    borders: [
      { id: "ab", a: "A", b: "B", kind: "open", segment: [[4, 0], [4, 4]] },
      { id: "bc", a: "B", b: "C", kind: "door", segment: [[8, 0], [8, 4]] },
      { id: "cd", a: "C", b: "D", kind: "door", segment: [[12, 0], [12, 4]], lockedInActs: [1] },
      { id: "ce", a: "C", b: "E", kind: "open", segment: [[8, 4], [12, 4]] },
      { id: "af", a: "A", b: "F", kind: "door", segment: [[0, 4], [4, 4]] },
      { id: "dx", a: "D", b: "X", kind: "wall", segment: [[16, 0], [16, 4]] },
      { id: "av", a: "A", b: "V1", kind: "access" },
      { id: "vv", a: "V1", b: "V2", kind: "open" },
      { id: "vd", a: "V2", b: "D", kind: "access" },
    ],
    markers: [
      { id: "M1", kind: "start", zone: "A", label: "Start", gmOnly: false },
      { id: "M2", kind: "spawn", zone: "V2", label: "Lurker", act: 1, gmOnly: true, data: { speed: 1, state: "active" } },
      { id: "M3", kind: "waypoint", zone: "V1", label: "Lurker patrol 1", act: 1, gmOnly: true, data: { spawn: "M2", order: 1 } },
      { id: "M4", kind: "npc", zone: "E", label: "Thug", act: 1, gmOnly: true, data: { posture: "patrol" } },
    ],
    start: "A",
    gridM: 1,
    checks: [],
  };
}

const HUNT: MapHuntDef = {
  steps: [
    { id: "stretch", label: "Stretch" },
    { id: "round", label: "Round" },
  ],
  movers: [
    { id: "creature", label: "Creature", zones: { stretch: { var: ["speed", 1] }, round: 2 }, ducts: true, from: { markers: [{ kind: "spawn" }] }, postureKey: "state", prefer: { approach: 2, duct: 1, flags: { dark: 0.75 } }, postures: { passive: { approach: 0, stay: 6 } }, hurt: { approach: -2, duct: 2 } },
    { id: "people", label: "People", zones: { stretch: 1 }, ducts: false, from: { markers: [{ kind: "npc" }] }, prefer: { approach: 1 } },
  ],
  sensors: [{ id: "tracker", label: "Tracker", carried: { names: ["Motion tracker"] }, range: "long", detects: "moved", through: "any" }],
  gearPaths: ["gear"],
  blipLetters: ["A", "B", "C"],
};

const DEF: Pick<MapGeneratorDef, "hunt" | "passable" | "rangeBands"> = {
  hunt: HUNT,
  rangeBands: [
    { id: "short", label: "Short", maxDistance: 0 },
    { id: "medium", label: "Medium", maxDistance: 1 },
    { id: "long", label: "Long", maxDistance: 2 },
    { id: "extreme", label: "Extreme" },
  ],
};
const TRACKER = HUNT.sensors![0]!;

function setup(): { store: CampaignStore; mapId: string; map: () => SiteMap } {
  const store = newStore();
  const created = store.createMap({ name: "Outpost", visibility: { level: "players" } });
  store.update("maps", created.id, { layout: huntLayout(), generator: { id: "g", seed: "outpost", inputs: {} } });
  startLive(store, created.id, 1);
  return { store, mapId: created.id, map: () => store.get("maps", created.id)! };
}

const token = (map: SiteMap, label: string): HuntToken => huntOf(liveOf(map)).tokens.find((t) => t.label === label)!;
const suggest = (map: SiteMap, label: string, opts: { seed?: string; stepKind?: string; targets?: string[] } = {}) =>
  suggestHuntMove(map.layout!, liveOf(map), token(map, label), { def: DEF, targets: (opts.targets ?? ["A"]).map((zone) => ({ zone, label: "Ripley" })), seed: opts.seed ?? "s", stepKind: opts.stepKind })!;

describe("hidden threat tokens", () => {
  it("are placed from the map's markers with their mover kind, data and patrol route", () => {
    const { store, mapId, map } = setup();
    const sources = huntMarkerSources(huntLayout(), HUNT, 1);
    expect(sources.map((s) => [s.label, s.mover, s.zone])).toEqual([
      ["Lurker", "creature", "V2"],
      ["Thug", "people", "E"],
    ]);
    expect(sources[0]!.route).toEqual(["V1"]);
    for (const s of sources) placeHuntSource(store, mapId, s);
    const lurker = token(map(), "Lurker");
    expect(lurker).toMatchObject({ zone: "V2", home: "V2", state: "hidden", mover: "creature", marker: "M2", data: { speed: 1, state: "active" }, route: ["V1"], routeAt: 0, trail: [] });
    // the plain tokens and pings are untouched
    expect(liveOf(map()).tokens).toEqual([]);
  });

  it("moves zone by zone with a short GM-only trail, stamped with the step", () => {
    const { store, mapId, map } = setup();
    const id = placeHuntToken(store, mapId, { label: "Lurker", zone: "V2", mover: "creature", data: { speed: 2 } });
    advanceHunt(store, mapId, "stretch");
    moveHuntToken(store, mapId, id, "A", { path: ["V2", "V1", "A"] });
    expect(token(map(), "Lurker")).toMatchObject({ zone: "A", trail: ["V2", "V1"], movedAt: 1 });
    for (const z of ["B", "C", "E", "C"]) moveHuntToken(store, mapId, id, z);
    // the trail keeps the last four zones (the default)
    expect(token(map(), "Lurker").trail).toEqual(["A", "B", "C", "E"]);
    setHuntHurt(store, mapId, id, true);
    expect(token(map(), "Lurker").hurt).toBe(true);
    removeHuntToken(store, mapId, id);
    expect(huntOf(liveOf(map())).tokens).toEqual([]);
  });
});

describe("suggested moves", () => {
  it("are deterministic per seed and step, with an alternative", () => {
    const { store, mapId, map } = setup();
    placeHuntToken(store, mapId, { label: "Lurker", zone: "V2", mover: "creature", data: { speed: 1, state: "active" } });
    const a = suggest(map(), "Lurker");
    expect(suggest(map(), "Lurker")).toEqual(a);
    expect(a.best.zone).toBe("V1");
    expect(a.best.path).toEqual(["V2", "V1"]);
    expect(a.best.reasons[0]).toBe("1 zone closer to Ripley");
    expect(a.alternative).toBeDefined();
    expect(a.alternative!.zone).not.toBe(a.best.zone);
    expect(a.seed).toBe("s:0:Lurker@V2");
    // another step reseeds the noise, never the rules: still the best zone here
    advanceHunt(store, mapId, "stretch");
    expect(suggest(map(), "Lurker").seed).not.toBe(a.seed);
    expect(suggest(map(), "Lurker").best.zone).toBe("V1");
  });

  it("respect the mover's speed for the step", () => {
    const { store, mapId, map } = setup();
    placeHuntToken(store, mapId, { label: "Lurker", zone: "V2", mover: "creature", data: { speed: 2, state: "active" } });
    const stretch = suggest(map(), "Lurker", { stepKind: "stretch" });
    expect(stretch.reach).toBe(2);
    expect(stretch.best.zone).toBe("A");
    for (const o of stretch.options) expect(o.path.length - 1).toBeLessThanOrEqual(2);
    // speed 0 data falls back to the rule's default only when the field is missing
    placeHuntToken(store, mapId, { label: "Slug", zone: "V2", mover: "creature", data: { speed: 0 } });
    expect(suggest(map(), "Slug").options.map((o) => o.zone)).toEqual(["V2"]);
    placeHuntToken(store, mapId, { label: "Blob", zone: "V2", mover: "creature" });
    expect(suggest(map(), "Blob").reach).toBe(1);
    expect(suggest(map(), "Lurker", { stepKind: "round" }).reach).toBe(2);
  });

  it("keep people out of the ducts and every mover out of impassable borders", () => {
    const { store, mapId, map } = setup();
    placeHuntToken(store, mapId, { label: "Thug", zone: "C", mover: "people" });
    placeHuntToken(store, mapId, { label: "Lurker", zone: "C", mover: "creature", data: { speed: 9 } });
    const thug = suggest(map(), "Thug", { targets: ["D"] });
    expect(thug.options.map((o) => o.zone).sort()).toEqual(["B", "C", "E"]);
    // the locked door C|D (act 1) and the out-of-bounds zone are never offered
    const lurker = suggest(map(), "Lurker", { targets: ["D"] });
    expect(lurker.options.map((o) => o.zone)).not.toContain("X");
    expect(lurker.best.zone).toBe("D");
    expect(lurker.best.path).toEqual(["C", "B", "A", "V1", "V2", "D"]);
    for (const o of lurker.options) for (let i = 1; i < o.path.length; i++) expect([o.path[i - 1], o.path[i]].join("")).not.toMatch(/^(CD|DC)$/);
    // act 2 unlocks the door
    setAct(store, mapId, 2);
    expect(suggest(map(), "Thug", { targets: ["D"] }).best.zone).toBe("D");
  });

  it("read posture and hurt: a passive creature waits, a hurt one falls back", () => {
    const { store, mapId, map } = setup();
    placeHuntToken(store, mapId, { label: "Sleeper", zone: "V1", mover: "creature", data: { speed: 1, state: "passive" } });
    const id = placeHuntToken(store, mapId, { label: "Lurker", zone: "B", mover: "creature", data: { speed: 1, state: "active" } });
    expect(suggest(map(), "Sleeper").best.zone).toBe("V1");
    expect(suggest(map(), "Lurker").best.zone).toBe("A");
    setHuntHurt(store, mapId, id, true);
    expect(suggest(map(), "Lurker").best.zone).toBe("C");
    expect(suggestHuntMoves(map().layout!, liveOf(map()), { def: DEF, targets: [{ zone: "A", label: "Ripley" }], seed: "s" })).toHaveLength(2);
  });
});

describe("sweeps and blips", () => {
  it("find the carried sensor on a character's gear", () => {
    expect(carriedSensors(HUNT, { fields: { gear: [{ name: "Torch" }, { name: "motion tracker" }] } }).map((s) => s.id)).toEqual(["tracker"]);
    expect(carriedSensors(HUNT, { fields: { gear: [{ name: "Torch" }] } })).toEqual([]);
    expect(carriedSensors(undefined, { fields: {} })).toEqual([]);
  });

  it("read bearings on the deck plan, ducts from the room they open into", () => {
    const l = huntLayout();
    expect(zoneBearing(l, "A", "B")).toEqual({ direction: "E" });
    expect(zoneBearing(l, "A", "E")).toEqual({ direction: "SE" });
    expect(zoneBearing(l, "C", "A")).toEqual({ direction: "W" });
    expect(zoneBearing(l, "E", "C")).toEqual({ direction: "N" });
    expect(zoneBearing(l, "A", "A")).toEqual({ direction: "here" });
    expect(zoneBearing(l, "A", "V2")).toEqual({ direction: "E", vertical: "above" });
  });

  it("detect only tokens that moved this step, within the sensor's range band", () => {
    const { store, mapId, map } = setup();
    const lurker = placeHuntToken(store, mapId, { label: "Lurker", zone: "V2", mover: "creature" });
    const thug = placeHuntToken(store, mapId, { label: "Thug", zone: "C", mover: "people" });
    const read = () => sweepReadings(map().layout!, liveOf(map()), DEF, TRACKER, "A").map((r) => [r.token.label, r.distance, r.band?.id, r.direction]);
    // placing is not moving
    expect(read()).toEqual([]);
    advanceHunt(store, mapId, "stretch");
    moveHuntToken(store, mapId, lurker, "V1");
    moveHuntToken(store, mapId, thug, "E");
    // the tracker reads through walls and locks: V1 is one border away; E is three (out of Long)
    expect(read()).toEqual([["Lurker", 1, "medium", "here"]]);
    moveHuntToken(store, mapId, thug, "B");
    expect(read()).toEqual([
      ["Lurker", 1, "medium", "here"],
      ["Thug", 1, "medium", "E"],
    ]);
    // a step later, nothing moved: nothing shows
    advanceHunt(store, mapId, "stretch");
    expect(read()).toEqual([]);
  });

  it("letter blips in order of detection and keep them stable", () => {
    const { store, mapId, map } = setup();
    const lurker = placeHuntToken(store, mapId, { label: "Lurker", zone: "V2", mover: "creature" });
    const thug = placeHuntToken(store, mapId, { label: "Thug", zone: "E", mover: "people" });
    const sweep = () => recordSweep(store, mapId, { by: { name: "Lee" }, from: "A", sensor: TRACKER, def: DEF, at: "t" });
    advanceHunt(store, mapId, "stretch");
    moveHuntToken(store, mapId, thug, "C");
    moveHuntToken(store, mapId, lurker, "V1");
    const first = sweep();
    expect(first.blips.map((b) => [b.letter, b.bandLabel])).toEqual([
      ["A", "Medium"],
      ["B", "Long"],
    ]);
    expect(sweepLogText(first)).toBe("Sweep by Lee: blips A (Medium, here, above), B (Long, E)");
    expect(token(map(), "Lurker").state).toBe("detected");
    // next stretch: the blips go stale, the letters stay with their tokens whatever the order
    advanceHunt(store, mapId, "stretch");
    expect(token(map(), "Lurker").state).toBe("hidden");
    moveHuntToken(store, mapId, thug, "B");
    moveHuntToken(store, mapId, lurker, "V2");
    expect(sweep().blips.map((b) => [b.letter, b.token])).toEqual([
      ["B", thug],
      ["A", lurker],
    ]);
    // the GM reveals the lurker and retires its letter: the next new blip takes A
    setHuntTokenState(store, mapId, lurker, "seen");
    expect(token(map(), "Lurker").letter).toBeUndefined();
    expect(liveOf(map()).revealed).toContain("V2");
    const third = placeHuntToken(store, mapId, { label: "Third", zone: "F", mover: "people" });
    advanceHunt(store, mapId, "stretch");
    moveHuntToken(store, mapId, third, "A");
    expect(sweep().blips.map((b) => b.letter)).toEqual(["A"]);
    // the GM names blips by hand to match the table: a held letter swaps
    setHuntLetter(store, mapId, third, "B");
    expect([token(map(), "Third").letter, token(map(), "Thug").letter]).toEqual(["B", "A"]);
    setHuntLetter(store, mapId, thug, "C");
    expect(token(map(), "Thug").letter).toBe("C");
    expect(nextBlipLetter(huntOf(liveOf(map())).tokens, ["A", "B", "C"])).toBe("A");
    // a kept letter stays on the revealed token
    setHuntTokenState(store, mapId, third, "seen", { keepLetter: true });
    expect(token(map(), "Third").letter).toBe("B");
  });

  it("number blips past the set when every letter is held", () => {
    const tokens = ["A", "B", "C"].map((letter, i) => ({ id: `t${i}`, label: "x", zone: "A", mover: "m", state: "hidden", home: "A", trail: [], letter }) as HuntToken);
    expect(nextBlipLetter(tokens, ["A", "B", "C"])).toBe("A2");
  });
});

describe("the player projection of the hunt", () => {
  it("shows blips (letter, band, direction) and seen threats, never hidden tokens, trails or zones", () => {
    const { store, mapId, map } = setup();
    const lurker = placeHuntToken(store, mapId, { label: "SECRET-LURKER", zone: "V2", mover: "creature" });
    const thug = placeHuntToken(store, mapId, { label: "SECRET-THUG", zone: "E", mover: "people" });
    advanceHunt(store, mapId, "stretch");
    moveHuntToken(store, mapId, lurker, "V1");
    moveHuntToken(store, mapId, thug, "C");
    recordSweep(store, mapId, { by: { name: "Lee" }, from: "A", sensor: TRACKER, def: DEF, at: "t" });
    const m = map();
    const projected = playerLayout(m.layout!, { act: 1, revealed: liveOf(m).revealed });
    const out = playerLive(liveOf(m), projected, undefined);
    expect(out.tokens).toEqual([]);
    expect(out.tracker).toEqual({
      step: 1,
      sweeps: [
        {
          by: "Lee",
          sensor: "Tracker",
          step: 1,
          stale: false,
          blips: [
            { letter: "A", band: "medium", bandLabel: "Medium", direction: "here", vertical: "above" },
            { letter: "B", band: "long", bandLabel: "Long", direction: "E" },
          ],
        },
      ],
    });
    const text = JSON.stringify(out);
    for (const secret of ["SECRET", lurker, thug, '"V1"', '"V2"', '"C"', '"zone"', "distance", "trail"]) expect(text).not.toContain(secret);
    // the campaign's player view drops the hunt altogether
    const view = projectCampaignForViewer(store.toJSON(), fixtureModule, { role: "player" });
    const pm = JSON.stringify(view.maps[mapId]);
    expect(pm).not.toContain("SECRET");
    expect(pm).not.toContain("hunt");
    // revealed: the threat shows on the player map in its zone, its blip letter kept as a badge
    setHuntTokenState(store, mapId, lurker, "seen", { keepLetter: true });
    const after = liveOf(map());
    const shown = playerLive(after, playerLayout(m.layout!, { act: 1, revealed: after.revealed }), undefined);
    expect(shown.tokens).toEqual([{ id: lurker, label: "SECRET-LURKER", zone: "V1", badge: "A" }]);
    expect(JSON.stringify(shown)).not.toContain("SECRET-THUG");
    const view2 = projectCampaignForViewer(store.toJSON(), fixtureModule, { role: "player" });
    expect(view2.maps[mapId]!.live!.tokens.map((t) => t.label)).toEqual(["SECRET-LURKER"]);
    // a step later the readout shows the last sweep as stale
    advanceHunt(store, mapId, "stretch");
    expect(playerLive(liveOf(map()), projected, undefined).tracker!.sweeps[0]!.stale).toBe(true);
  });

  it("leaves the live state of maps without a hunt as it was", () => {
    const { map } = setup();
    const m = map();
    expect(Object.keys(liveOf(m)).sort()).toEqual(["act", "borders", "pings", "revealed", "tokens", "zoneFlags"]);
    expect(playerLive(liveOf(m), playerLayout(m.layout!, { act: 1, revealed: ["A"] }), undefined)).toEqual({ zoneFlags: {}, tokens: [] });
  });
});
