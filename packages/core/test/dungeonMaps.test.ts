/**
 * Dungeon maps (a layout with fog "hide", key numbering, secret rooms and
 * doors, traps and treasure): the player projection, the share snapshot and
 * the player bundle never carry anything the players have not found, and the
 * GM's room key carries everything. The layout is hand-made here; the
 * engine's own maps are tested in the SDK and the modules.
 */
import { describe, expect, it } from "vitest";
import type { MapGeneratorDef, MapZoneData, SiteLayout } from "@campaign-forge/module-sdk";
import {
  defaultPassable,
  playerLayout,
  playerLive,
  playerShareSnapshot,
  projectCampaignForViewer,
  revealZones,
  setBorderState,
  setZoneFlag,
  startLive,
  zoneDistances,
  zoneKeyCsv,
  zoneKeyMarkdown,
  zoneKeyRows,
  zoneNumbers,
  type ModuleTypes,
} from "../src";
import { fixtureModule, newStore } from "./fixtures";

const SECRETS = ["SECRET-ROOM", "SECRET-GM", "SECRET-TRAP", "SECRET-LOOT", "SECRET-ENCOUNTER", "SECRET-LOCK", "SECRET-DETAIL", "SECRET-META", "SECRET-ENTITY", "SECRET-DOOR-NOTE"];

const rect = (x: number, y: number, w: number, h: number): Array<[number, number]> => [
  [x, y],
  [x + w, y],
  [x + w, y + h],
  [x, y + h],
];
const room = (id: string, poly: Array<[number, number]>, extra: Partial<MapZoneData> = {}): MapZoneData => ({ id, deck: "L1", kind: "room", poly, cluttered: false, key: true, ...extra });

/**
 *   X1 (outside) -door- R01 (entrance) -open- P01 (passage) -door- R02 (lair, locked)
 *                                       R01 -secret door- R03 (secret room)
 *                                       P01 -rubble- R04
 */
function dungeon(): SiteLayout {
  return {
    decks: [{ id: "L1", name: "Level 1", width: 30, height: 20, level: 0 }],
    zones: [
      room("R01", rect(10, 10, 5, 4), { name: "Gatehouse", playerNote: "Murder holes above.", gmNote: "SECRET-GM", details: ["SECRET-DETAIL"], entity: "SECRET-ENTITY" }),
      room("R02", rect(20, 2, 6, 5), { name: "Throne room", playerNote: "A raised seat.", gmNote: "SECRET-GM", flags: { dark: true } }),
      room("R03", rect(4, 10, 4, 4), { name: "SECRET-ROOM", hidden: true, playerNote: "SECRET-ROOM read-aloud" }),
      room("R04", rect(16, 14, 4, 4), { name: "Store" }),
      { id: "P01", deck: "L1", kind: "corridor", name: "Passage", poly: rect(15, 4, 1, 10), cluttered: false, details: ["SECRET-DETAIL"] },
      { id: "X1", deck: "L1", kind: "exterior", name: "Bailey", poly: rect(10, 15, 5, 3), cluttered: false },
    ],
    borders: [
      { id: "B1", a: "X1", b: "R01", kind: "bars", segment: [[12, 14], [13, 14]] },
      { id: "B2", a: "R01", b: "P01", kind: "open", segment: [[15, 12], [15, 13]] },
      { id: "B3", a: "P01", b: "R02", kind: "door", segment: [[16, 5], [16, 6]], lock: "mechanical", lockedInActs: [1, 2, 3], note: "SECRET-LOCK" },
      { id: "B4", a: "R01", b: "R03", kind: "door", segment: [[8, 11], [8, 12]], hidden: true, note: "SECRET-DOOR-NOTE" },
      { id: "B5", a: "P01", b: "R04", kind: "rubble", segment: [[15, 14], [16, 14]], note: "Collapsed" },
    ],
    markers: [
      { id: "M1", kind: "start", zone: "X1", label: "Way in", gmOnly: false },
      { id: "E1", kind: "spawn", zone: "R02", label: "SECRET-ENCOUNTER 2 × Bugbear", detail: "SECRET-ENCOUNTER detail", gmOnly: true, data: { groups: [{ n: 2, preset: "x" }], entity: "SECRET-ENTITY" } },
      { id: "T1", kind: "trap", zone: "P01", label: "SECRET-TRAP pit", detail: "SECRET-TRAP DC 15", gmOnly: true },
      { id: "T2", kind: "trap", zone: "R01", label: "SECRET-TRAP darts", gmOnly: false },
      { id: "G1", kind: "treasure", zone: "R03", label: "SECRET-LOOT", detail: "SECRET-LOOT 40 gp", gmOnly: true },
    ],
    start: "X1",
    gridM: 1.524,
    gridUnit: { size: 5, unit: "ft" },
    fog: "hide",
    numbering: "key",
    acts: false,
    cover: false,
    checks: [{ id: "c", level: "warn", ok: true, message: "SECRET-META" }],
    meta: { note: "SECRET-META" },
  };
}

const legend: MapGeneratorDef["legend"] = [
  { target: { flag: "dark" }, label: "Darkness", icon: "dark" },
  { target: { flag: "trap", value: "found" }, label: "Trap found", icon: "hazard" },
  { target: { marker: "trap" }, label: "Trap", gmOnly: true },
];

const clean = (v: unknown, where: string) => {
  const json = JSON.stringify(v);
  for (const s of SECRETS) expect(json, `${where}: ${s}`).not.toContain(s);
};

describe("dungeon player projection", () => {
  it("before anything is revealed, players see only the way in and the door in its wall", () => {
    const out = playerLayout(dungeon(), { act: 1, revealed: ["X1"], legend });
    expect(out.zones.map((z) => z.id)).toEqual(["X1"]);
    expect(out.borders.map((b) => b.id)).toEqual(["B1"]);
    expect(out.markers.map((m) => m.id)).toEqual(["M1"]);
    expect(out.fogged).toEqual([]);
    expect(out.fog).toBe("hide");
    expect(out.gridUnit).toEqual({ size: 5, unit: "ft" });
    expect(out.meta).toBeUndefined();
    clean(out, "start");
  });

  it("a level the players have not reached is left out at the table (not in prints)", () => {
    const two = dungeon();
    two.decks.push({ id: "L2", name: "SECRET-LEVEL", width: 30, height: 20, level: 1 });
    two.zones.push(room("R05", rect(10, 10, 5, 4), { deck: "L2", name: "Crypt" }));
    expect(playerLayout(two, { act: 1, revealed: ["X1", "R01"], legend }).decks.map((d) => d.id)).toEqual(["L1"]);
    expect(playerLayout(two, { act: 1, revealed: ["X1", "R01", "R05"], legend }).decks.map((d) => d.id)).toEqual(["L1", "L2"]);
    expect(playerLayout(two, { act: 1, print: true, legend }).decks.map((d) => d.id)).toEqual(["L1", "L2"]);
  });

  it("without a reveal list the players have seen the way in only", () => {
    const out = playerLayout(dungeon(), { act: 1, legend });
    expect(out.zones.map((z) => z.id)).toEqual(["X1"]);
  });

  it("revealed rooms show names and read-aloud text, never GM notes, dressing, entity links, secret doors or GM marks", () => {
    const out = playerLayout(dungeon(), { act: 1, revealed: ["X1", "R01", "P01"], legend });
    expect(out.zones.map((z) => z.id).sort()).toEqual(["P01", "R01", "X1"]);
    const gate = out.zones.find((z) => z.id === "R01")!;
    expect(gate.name).toBe("Gatehouse");
    expect(gate.playerNote).toBe("Murder holes above.");
    expect(gate.gmNote).toBeUndefined();
    expect(gate.details).toBeUndefined();
    expect(gate.entity).toBeUndefined();
    // the secret door and the secret room behind it are nowhere
    expect(out.borders.some((b) => b.id === "B4")).toBe(false);
    expect(out.zones.some((z) => z.id === "R03")).toBe(false);
    // the doors out of the seen rooms show, the locked one without its lock until the players know
    const toLair = out.borders.find((b) => b.id === "B3")!;
    expect(toLair).toMatchObject({ a: "P01", b: "R02", kind: "door" });
    expect(toLair.lockedInActs).toBeUndefined();
    expect(toLair.note).toBeUndefined();
    expect(out.borders.find((b) => b.id === "B5")).toMatchObject({ kind: "rubble" });
    expect(out.markers.map((m) => m.kind)).toEqual(["start"]);
    clean(out, "revealed");
  });

  it("a found secret door shows; the secret room shows once revealed", () => {
    const l = dungeon();
    const found = playerLayout(l, { act: 1, revealed: ["X1", "R01"], legend, live: { borders: { B4: { known: true } } } });
    expect(found.zones.some((z) => z.id === "R03")).toBe(false);
    expect(found.borders.some((b) => b.id === "B4")).toBe(false);
    const entered = playerLayout(l, { act: 1, revealed: ["X1", "R01", "R03"], legend, live: { borders: { B4: { known: true } } } });
    expect(entered.zones.find((z) => z.id === "R03")?.name).toBe("SECRET-ROOM");
    expect(entered.borders.find((b) => b.id === "B4")?.hidden).toBeUndefined();
    expect(entered.markers.some((m) => m.kind === "treasure")).toBe(false);
  });

  it("a known lock shows; the GM's lock note never does", () => {
    const out = playerLayout(dungeon(), { act: 1, revealed: ["X1", "R01", "P01"], legend, live: { borders: { B3: { known: true } } } });
    expect(out.borders.find((b) => b.id === "B3")?.lockedInActs).toEqual([1]);
    clean(out, "known lock");
  });

  it("prints show the whole plan, but not the secret room, the secret door or any GM mark", () => {
    const out = playerLayout(dungeon(), { act: 1, print: true, legend });
    expect(out.zones.map((z) => z.id).sort()).toEqual(["P01", "R01", "R02", "R04", "X1"]);
    expect(out.borders.map((b) => b.id).sort()).toEqual(["B1", "B2", "B3", "B5"]);
    expect(out.markers.map((m) => m.kind)).toEqual(["start"]);
    expect(out.zones.find((z) => z.id === "R02")?.flags).toEqual({ dark: true });
    clean(out, "print");
  });

  it("property: no reveal list, border state or print option ever leaks a secret", () => {
    const l = dungeon();
    const ids = l.zones.map((z) => z.id).filter((z) => z !== "R03");
    for (let mask = 0; mask < 1 << ids.length; mask++) {
      const revealed = ids.filter((_, i) => mask & (1 << i));
      for (const live of [undefined, { borders: { B3: { known: true } } }, { borders: { B3: { locked: false } } }]) {
        for (const print of [false, true]) {
          const out = playerLayout(l, { act: 1, revealed, legend, live, print });
          clean(out, `${revealed.join(",")} print=${print}`);
          expect(out.zones.some((z) => z.hidden)).toBe(false);
        }
      }
    }
  });

  it("live: a trap marked found shows to players in a seen room only; pings and hidden tokens never", () => {
    const store = newStore();
    const m = store.createMap({ name: "Keep" });
    store.update("maps", m.id, { layout: dungeon() });
    startLive(store, m.id, 1);
    revealZones(store, m.id, ["R01"]);
    setZoneFlag(store, m.id, "R01", "trap", "found");
    setZoneFlag(store, m.id, "R02", "trap", "found");
    setBorderState(store, m.id, "B4", { known: true });
    const map = store.get("maps", m.id)!;
    const projected = playerLayout(map.layout!, { act: 1, revealed: map.live!.revealed, legend, live: map.live });
    const live = playerLive({ ...map.live!, tokens: [{ id: "t", label: "SECRET-ENCOUNTER", zone: "R01", gmOnly: true }], pings: [{ zone: "R01", at: "x" }] }, projected, legend);
    expect(live.zoneFlags).toEqual({ R01: { trap: "found" } });
    expect(live.tokens).toEqual([]);
    clean(live, "live");
  });
});

describe("dungeon maps in shares and player bundles", () => {
  const generator = { id: "x.map.dungeon", name: "Dungeon", legend } as unknown as MapGeneratorDef;
  const module: ModuleTypes = { entityTypes: fixtureModule.entityTypes, mapGenerators: [generator] };

  it("the share snapshot's map is the projection: only what the players have found", () => {
    const store = newStore();
    const map = store.createMap({ name: "Keep" });
    store.update("maps", map.id, { layout: dungeon(), generator: { id: generator.id, seed: "s", inputs: { faction: "SECRET-META" } } });
    startLive(store, map.id, 1);
    revealZones(store, map.id, ["R01", "P01"]);
    const adventure = store.createAdventure({ title: "Keep" });
    const act = store.createAct(adventure.id, { title: "In" });
    const scene = store.createScene(act.id, { title: "Gate", map: map.id });
    const session = store.createSession({ number: 1, title: "One" });
    const snap = playerShareSnapshot({ maps: store.toJSON(), module, sessionId: session.id, sceneId: scene.id, doc: () => undefined, at: "t" });
    expect(snap.maps[0]?.visibleZones).toEqual(["P01", "R01", "X1"]);
    clean(snap, "share");
  });

  it("a player bundle carries the projected map", () => {
    const store = newStore();
    const map = store.createMap({ name: "Keep", visibility: { level: "players" } });
    store.update("maps", map.id, { layout: dungeon(), generator: { id: generator.id, seed: "s", inputs: {} } });
    startLive(store, map.id, 1);
    revealZones(store, map.id, ["R01"]);
    const projected = projectCampaignForViewer(store.toJSON(), module, { role: "player", memberId: "p1" });
    const m = Object.values(projected.maps)[0]!;
    expect(m.layout!.zones.map((z) => z.id).sort()).toEqual(["R01", "X1"]);
    clean(m, "bundle");
  });
});

describe("dungeon room key and distances", () => {
  it("numbers rooms only, in layout order", () => {
    expect([...zoneNumbers(dungeon()).entries()]).toEqual([
      ["R01", 1],
      ["R02", 2],
      ["R03", 3],
      ["R04", 4],
    ]);
  });

  it("the GM's key has everything: read-aloud, encounters, traps (passages too), treasure, door notes", () => {
    const l = dungeon();
    const rows = zoneKeyRows({ layout: l, generator: { id: "x", seed: "s", inputs: {} } });
    expect(rows.map((r) => r.id)).toEqual(["R01", "R02", "R03", "R04", "P01"]);
    const lair = rows.find((r) => r.id === "R02")!;
    expect(lair.readAloud).toBe("A raised seat.");
    expect(lair.marks.map((m) => m.kind)).toEqual(["spawn"]);
    expect(lair.exits[0]!.notes).toEqual(["locked", "SECRET-LOCK"]);
    expect(rows.find((r) => r.id === "P01")).toMatchObject({ number: undefined, marks: [{ kind: "trap", label: "SECRET-TRAP pit", detail: "SECRET-TRAP DC 15" }] });
    const md = zoneKeyMarkdown({ layout: l, generator: { id: "x", seed: "s", inputs: {} }, name: "Keep" });
    expect(md).toContain("# Keep: room key");
    expect(md).toContain("| Read-aloud | Description | Encounters | Traps | Treasure | GM note |");
    expect(md).toContain("SECRET-LOOT: SECRET-LOOT 40 gp");
    const csv = zoneKeyCsv({ layout: l, generator: { id: "x", seed: "s", inputs: {} } });
    expect(csv.split("\r\n")[0]).toBe("number,id,name,kind,level,flags,exits,read_aloud,description,encounters,traps,treasure,gm_note");
  });

  it("rubble blocks movement; secret and locked doors are the GM's truth for distances only when open", () => {
    const l = dungeon();
    expect(defaultPassable(l.borders.find((b) => b.id === "B5")!, 1)).toBe(false);
    const d = zoneDistances(l, { act: 1 });
    expect(d.X1!.R04).toBeUndefined();
    expect(d.X1!.R03).toBe(2);
    expect(d.X1!.R02).toBeUndefined();
    expect(zoneDistances(l, { act: 1, live: { borders: { B3: { open: true } } } }).X1!.R02).toBe(3);
  });
});
