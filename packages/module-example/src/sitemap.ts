/**
 * A tiny deterministic site map generator for the fixture module: one deck,
 * six rooms on a two-zone corridor, a sealed-off wing, one duct with two
 * access points, a door locked in one act, a spawn and a clue. Core, ui and
 * web tests use it so they never need a real game's generator.
 */
import type { MapBorderData, MapCheck, MapGeneratorDef, MapMarker, MapPoint, MapZoneData, Rng, SiteLayout } from "@campaign-forge/module-sdk";

const ROOM_NAMES = ["Hall", "Larder", "Chapel", "Armory", "Library", "Barracks", "Cellar", "Forge", "Study", "Vault"];

type Rect = [number, number, number, number]; // x0, y0, x1, y1

function rect([x0, y0, x1, y1]: Rect): MapPoint[] {
  return [
    [x0, y0],
    [x1, y0],
    [x1, y1],
    [x0, y1],
  ];
}

function shuffle<T>(rng: Rng, items: readonly T[]): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = rng.int(0, i);
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

function exampleMovable(b: MapBorderData, act: number): boolean {
  if (b.kind === "wall") return false;
  if (b.sealed) return false;
  return !(b.lockedInActs ?? []).includes(act);
}

function reach(layout: SiteLayout, from: string, act: number): Set<string> {
  const seen = new Set([from]);
  const queue = [from];
  while (queue.length) {
    const cur = queue.shift()!;
    for (const b of layout.borders) {
      if (!exampleMovable(b, act)) continue;
      const other = b.a === cur ? b.b : b.b === cur ? b.a : undefined;
      if (other && !seen.has(other)) {
        seen.add(other);
        queue.push(other);
      }
    }
  }
  return seen;
}

export const exampleSiteGenerator: MapGeneratorDef = {
  id: "example.mapgen.keep",
  name: "Small keep",
  description: "A one-floor keep: six rooms on a corridor, a crawlway and a walled-off wing.",
  page: 70,
  inputs: {
    type: "object",
    properties: {
      darkness: { type: "integer", minimum: 0, maximum: 100, default: 30, title: "Dark rooms (%)" },
      lockedAct: { type: "integer", minimum: 1, maximum: 3, default: 2, title: "Act the vault door locks" },
    },
  },
  stages: [
    { id: "layout", title: "Room names" },
    { id: "dressing", title: "Dressing" },
    { id: "encounters", title: "Spawn and clue" },
  ],
  generate(inputs, ctx) {
    const darkness = typeof inputs.darkness === "number" ? inputs.darkness : 30;
    const lockedAct = typeof inputs.lockedAct === "number" ? inputs.lockedAct : 2;
    const names = shuffle(ctx.rng("layout"), ROOM_NAMES);
    const dress = ctx.rng("dressing");
    const enc = ctx.rng("encounters");

    const rooms: Array<{ id: string; rect: Rect; area: string }> = [
      { id: "R1", rect: [2, 2, 9, 8], area: "quarters" },
      { id: "R2", rect: [9, 2, 15, 8], area: "store" },
      { id: "R3", rect: [15, 2, 22, 8], area: "shrine" },
      { id: "R4", rect: [2, 12, 10, 18], area: "quarters" },
      { id: "R5", rect: [10, 12, 20, 18], area: "hall" },
      { id: "R6", rect: [20, 12, 28, 18], area: "store" },
    ];
    const zones: MapZoneData[] = rooms.map((r, i) => {
      const z: MapZoneData = {
        id: r.id,
        deck: "main",
        name: names[i]!,
        kind: "room",
        layer: "floor",
        poly: rect(r.rect),
        area: r.area,
        cluttered: dress.int(0, 1) === 1,
        flags: { dark: dress.int(1, 100) <= darkness },
        details: [dress.int(0, 1) ? "Dusty" : "Cold"],
        salvage: dress.int(0, 1) ? ["Torch"] : [],
      };
      return z;
    });
    zones.push(
      { id: "C1", deck: "main", name: "West passage", kind: "corridor", layer: "floor", poly: rect([2, 8, 15, 12]), area: "hall", cluttered: false, flags: { dark: false } },
      { id: "C2", deck: "main", name: "East passage", kind: "corridor", layer: "floor", poly: rect([15, 8, 28, 12]), area: "hall", cluttered: false, flags: { dark: true } },
      { id: "D1", deck: "main", name: "Crawlway", kind: "crawlspace", layer: "duct", poly: rect([11, 3, 13, 17]), cluttered: false },
      { id: "X1", deck: "main", name: "Fallen wing", kind: "out-of-bounds", layer: "floor", poly: rect([22, 2, 28, 8]), cluttered: false },
    );
    // key rooms: start (R4), the clue room and the way out (R6)
    const byId = new Map(zones.map((z) => [z.id, z]));
    const clueRoom = enc.int(0, 1) ? "R3" : "R1";
    for (const id of ["R4", clueRoom, "R6"]) byId.get(id)!.key = true;
    byId.get("R4")!.acts = [1];
    byId.get(clueRoom)!.acts = [2];
    byId.get("R6")!.acts = [3];
    const cursed = enc.int(0, 1) ? "R2" : "R5";
    byId.get(cursed)!.flags = { ...byId.get(cursed)!.flags, cursed: true };
    byId.get(cursed)!.gmNote = "The curse wakes when the bell rings.";
    byId.get("R6")!.playerNote = "The gate out of the keep.";

    const borders: MapBorderData[] = [
      { id: "B01", a: "R1", b: "C1", kind: "door", segment: [[2, 8], [9, 8]], armor: 1 },
      { id: "B02", a: "R2", b: "C1", kind: "open", segment: [[9, 8], [15, 8]] },
      { id: "B03", a: "R3", b: "C2", kind: "door", segment: [[15, 8], [22, 8]], armor: 1 },
      { id: "B04", a: "X1", b: "C2", kind: "blast", segment: [[22, 8], [28, 8]], armor: 4, lockedInActs: [1, 2, 3] },
      { id: "B05", a: "C1", b: "C2", kind: "open", segment: [[15, 8], [15, 12]] },
      { id: "B06", a: "R4", b: "C1", kind: "door", segment: [[2, 12], [10, 12]], armor: 1 },
      { id: "B07", a: "R5", b: "C1", kind: "hatch", segment: [[10, 12], [15, 12]] },
      { id: "B08", a: "R5", b: "C2", kind: "wall", segment: [[15, 12], [20, 12]], armor: 2 },
      { id: "B09", a: "R6", b: "C2", kind: "door", segment: [[20, 12], [28, 12]], armor: 2, hp: 10, lock: "mechanical", lockedInActs: [lockedAct] },
      { id: "B10", a: "R1", b: "R2", kind: "wall", segment: [[9, 2], [9, 8]], armor: 2 },
      { id: "B11", a: "R2", b: "R3", kind: "wall", segment: [[15, 2], [15, 8]], armor: 4 },
      { id: "B12", a: "R4", b: "R5", kind: "wall", segment: [[10, 12], [10, 18]], armor: 2 },
      { id: "B13", a: "R5", b: "R6", kind: "door", segment: [[20, 12], [20, 18]], armor: 1 },
      { id: "B14", a: "R3", b: "X1", kind: "wall", segment: [[22, 2], [22, 8]], armor: 3, flags: { outerHull: true } },
      { id: "B15", a: "R2", b: "D1", kind: "access" },
      { id: "B16", a: "R5", b: "D1", kind: "access", hidden: true },
    ];

    const markers: MapMarker[] = [
      { id: "M1", kind: "start", zone: "R4", label: "Start", gmOnly: false },
      { id: "M2", kind: "spawn", zone: "D1", label: "Ghoul (act 2)", act: 2, gmOnly: true, data: { creature: "ghoul" } },
      { id: "M3", kind: "clue", zone: clueRoom, label: "Bell rope", act: 2, gmOnly: true },
      { id: "M4", kind: "win", zone: "R6", label: "Gate", gmOnly: true },
      { id: "M5", kind: "npc", zone: "R5", label: "Old warden", act: 1, gmOnly: true },
    ];

    const layout: SiteLayout = { decks: [{ id: "main", name: "Ground floor", width: 30, height: 20 }], zones, borders, markers, start: "R4", gridM: 1, checks: [] };
    const act1 = reach(layout, "R4", 1);
    const act3 = reach(layout, "R4", 3);
    const access = borders.filter((b) => b.kind === "access" && (b.a === "D1" || b.b === "D1")).length;
    const checks: MapCheck[] = [
      { id: "reach-key", level: "block", ok: zones.filter((z) => z.key).every((z) => act1.has(z.id) || z.id === "R6"), message: "Every key room but the gate is reachable in act 1", page: 70 },
      { id: "reach-win", level: "block", ok: act3.has("R6"), message: "The gate is reachable in act 3", page: 70 },
      { id: "duct-access", level: "block", ok: access >= 2, message: "The crawlway has two access points", page: 71 },
      { id: "dark-route", level: "warn", ok: zones.some((z) => z.flags?.dark === true && z.kind === "room"), message: "At least one dark room", page: 71 },
    ];
    layout.checks = checks;
    return { layout, attempts: 1 };
  },
  passable: exampleMovable,
  rangeBands: [
    { id: "near", label: "Near", maxDistance: 0 },
    { id: "close", label: "Close", maxDistance: 1 },
    { id: "far", label: "Far", maxDistance: 3 },
    { id: "distant", label: "Distant" },
  ],
  legend: [
    { target: { border: "open" }, label: "Open archway", rule: "No block to movement or sight." },
    { target: { border: "wall" }, label: "Wall", rule: "Blocks movement and sight." },
    { target: { border: "door" }, label: "Door", rule: "Free to pass unless locked.", page: 70 },
    { target: { border: "hatch" }, label: "Trapdoor" },
    { target: { border: "blast" }, label: "Portcullis", rule: "Raised only from the gatehouse." },
    { target: { border: "access" }, label: "Crawl hole", rule: "Entering costs one move." },
    { target: { flag: "dark" }, label: "Dark", rule: "Spotting is harder.", icon: "dark" },
    { target: { flag: "burning" }, label: "Burning", rule: "Fire spreads through open borders.", icon: "fire", color: "#e5563d" },
    { target: { flag: "flooded" }, label: "Flooded", icon: "water" },
    { target: { flag: "cursed" }, label: "Cursed", rule: "Haunted at night.", gmOnly: true, icon: "hazard" },
    { target: { area: "quarters" }, label: "Quarters", color: "#7fa3c7" },
    { target: { area: "store" }, label: "Stores", color: "#c7a46f" },
    { target: { area: "shrine" }, label: "Shrine", color: "#a68bc7" },
    { target: { area: "hall" }, label: "Halls", color: "#9aa7ad" },
    { target: { kind: "out-of-bounds" }, label: "Out of bounds" },
    { target: { kind: "crawlspace" }, label: "Crawlway" },
    { target: { marker: "start" }, label: "Start" },
    { target: { marker: "spawn" }, label: "Spawn", gmOnly: true },
    { target: { marker: "clue" }, label: "Clue", gmOnly: true },
    { target: { marker: "npc" }, label: "NPC", gmOnly: true },
    { target: { marker: "win" }, label: "Way out", gmOnly: true },
  ],
};
