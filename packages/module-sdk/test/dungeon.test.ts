/**
 * The built-in dungeon map engine: the pack format, determinism, staged
 * re-rolls, block checks over many seeds per site type and size, stocking
 * from the module's own content, accepting into entities, briefs from an
 * adventure, and supplements.
 */
import { beforeAll, describe, expect, it } from "vitest";
import {
  applySupplements,
  checkModule,
  createRng,
  createTableRegistry,
  dungeonInputsFromAdventure,
  loadMapEngines,
  packMapGeneratorOf,
  packToModule,
  validatePack,
  type GameModule,
  type MapBorderData,
  type MapGeneratorDef,
  type ModulePack,
  type ModuleSupplement,
  type SiteLayout,
} from "../src";
import { dungeonFixturePack, FIXTURE_ARCHETYPES } from "./dungeonFixture";

let module: GameModule;
let gen: MapGeneratorDef;

const ctx = (m: GameModule, seed: string, stageSeeds?: Record<string, string>) => ({
  seed,
  ...(stageSeeds ? { stageSeeds } : {}),
  rng: (stream: string) => {
    const stage = ["layout", "doors", "dressing", "stocking"].find((s) => stream === s || stream.startsWith(`${s}/`));
    return createRng((stage && stageSeeds?.[stage]) ?? seed).fork(stream);
  },
  tables: createTableRegistry(m.tables),
});

beforeAll(async () => {
  await loadMapEngines();
  module = packToModule(dungeonFixturePack());
  gen = module.mapGenerators![0]!;
});

/** Zones reachable from the start over borders that are not walls or rubble (locked and secret doors count). */
function reachable(l: SiteLayout, skip: (b: MapBorderData) => boolean = (b) => b.kind === "wall" || b.kind === "rubble"): Set<string> {
  const seen = new Set([l.start!]);
  const queue = [l.start!];
  for (let i = 0; i < queue.length; i++) {
    for (const b of l.borders) {
      if (skip(b) || (b.a !== queue[i] && b.b !== queue[i])) continue;
      const o = b.a === queue[i] ? b.b : b.a;
      if (!seen.has(o)) {
        seen.add(o);
        queue.push(o);
      }
    }
  }
  return seen;
}

/** Cells covered by more than one zone on a deck (sampled at cell centres). */
function overlaps(l: SiteLayout): number {
  const inside = (poly: Array<[number, number]>, x: number, y: number) => {
    let c = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const [xi, yi] = poly[i]!;
      const [xj, yj] = poly[j]!;
      if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
    }
    return c;
  };
  let n = 0;
  for (const d of l.decks) {
    const zones = l.zones.filter((z) => z.deck === d.id);
    for (let y = 0; y < d.height; y++)
      for (let x = 0; x < d.width; x++) if (zones.filter((z) => inside(z.poly as Array<[number, number]>, x + 0.5, y + 0.5)).length > 1) n++;
  }
  return n;
}

describe("the dungeon engine in the pack format", () => {
  it("validates as a pack and passes conformance, including the dry run", () => {
    const v = validatePack(dungeonFixturePack());
    expect(v.issues.filter((i) => i.severity === "error")).toEqual([]);
    const report = checkModule(module, { skipProcedureRuns: false, seeds: 2, mapGeneratorRuns: 2 });
    expect(report.issues.filter((i) => i.where.startsWith("mapGenerator"))).toEqual([]);
  });

  it("rejects bad references, ranges and JSONLogic", () => {
    const pack = dungeonFixturePack();
    const config = pack.mapGenerators![0]!.config;
    config.siteTypes[0]!.rooms = "fx.nope";
    config.sizes[0]!.rooms = [9, 4];
    config.encounters!.creatureType = "fx.ghost";
    config.accept!.room!.subtype = "cellar";
    const issues = checkModule(packToModule(pack), { skipProcedureRuns: true }).issues.filter((i) => i.where.startsWith("mapGenerator")).map((i) => i.message);
    expect(issues).toEqual(expect.arrayContaining([`no table "fx.nope" in the module`, expect.stringMatching(/fewest rooms/), `no entity type "fx.ghost"`, `entity type "fx.location" has no subtype "cellar"`]));
    const bad = dungeonFixturePack();
    (bad.mapGenerators![0]!.config.traps!.chance as unknown) = { method: ["x", "y"] };
    bad.mapGenerators![0]!.id = "other.map";
    const res = validatePack(bad).issues.map((i) => i.message);
    expect(res.some((m) => /JSONLogic/.test(m))).toBe(true);
    expect(res.some((m) => /must start with "fx\."/.test(m))).toBe(true);
    const schema = dungeonFixturePack() as unknown as { mapGenerators: Array<{ config: { siteTypes: Array<{ archetype: string }> } }> };
    schema.mapGenerators[0]!.config.siteTypes[0]!.archetype = "maze";
    expect(validatePack(schema).ok).toBe(false);
  });

  it("offers a brief from the config, a legend with the pack's entries and the four stages", () => {
    const props = (gen.inputs as { properties: Record<string, { enum?: unknown[]; default?: unknown }> }).properties;
    expect(props.siteType!.enum).toEqual([...FIXTURE_ARCHETYPES]);
    expect(props.threat!.enum).toEqual(["low", "high"]);
    expect(props.theme!.enum).toEqual(["any", "undead"]);
    expect(gen.stages.map((s) => s.id)).toEqual(["layout", "doors", "dressing", "stocking"]);
    expect(gen.legend!.find((e) => "flag" in e.target && e.target.flag === "dark")?.label).toBe("Darkness");
    expect(gen.legend!.some((e) => "marker" in e.target && e.target.marker === "trap" && e.gmOnly)).toBe(true);
    expect(packMapGeneratorOf(gen)?.id).toBe("fx.map.dungeon");
  });
});

describe("dungeon generation", { timeout: 120_000 }, () => {
  it("is deterministic: same seed and brief, byte-identical layouts; another seed, another map", () => {
    for (const site of FIXTURE_ARCHETYPES) {
      const a = JSON.stringify(gen.generate({ siteType: site, levels: 2 }, ctx(module, "same")).layout);
      const b = JSON.stringify(gen.generate({ siteType: site, levels: 2 }, ctx(module, "same")).layout);
      const c = JSON.stringify(gen.generate({ siteType: site, levels: 2 }, ctx(module, "other")).layout);
      expect(a, site).toBe(b);
      expect(a, site).not.toBe(c);
    }
  });

  it("re-runs one stage alone: earlier stages stay, later ones follow", () => {
    const base = gen.generate({ siteType: "keep", size: "medium" }, ctx(module, "stages")).layout;
    const shape = (l: SiteLayout) => JSON.stringify(l.zones.map((z) => [z.id, z.poly]));
    const doors = (l: SiteLayout) => JSON.stringify(l.borders.map((b) => [b.id, b.kind, b.hidden, b.lockedInActs]));
    const names = (l: SiteLayout) => JSON.stringify(l.zones.map((z) => [z.name, z.details, z.flags]));
    const stock = (l: SiteLayout) => JSON.stringify(l.markers);
    const stocking = gen.generate({ siteType: "keep", size: "medium" }, ctx(module, "stages", { stocking: "again" })).layout;
    expect(shape(stocking)).toBe(shape(base));
    expect(doors(stocking)).toBe(doors(base));
    expect(names(stocking)).toBe(names(base));
    expect(stock(stocking)).not.toBe(stock(base));
    const dressing = gen.generate({ siteType: "keep", size: "medium" }, ctx(module, "stages", { dressing: "again" })).layout;
    expect(shape(dressing)).toBe(shape(base));
    expect(doors(dressing)).toBe(doors(base));
    expect(names(dressing)).not.toBe(names(base));
    const door = gen.generate({ siteType: "keep", size: "medium" }, ctx(module, "stages", { doors: "again" })).layout;
    expect(shape(door)).toBe(shape(base));
    expect(doors(door)).not.toBe(doors(base));
    const layout = gen.generate({ siteType: "keep", size: "medium" }, ctx(module, "stages", { layout: "again" })).layout;
    expect(shape(layout)).not.toBe(shape(base));
  });

  for (const site of FIXTURE_ARCHETYPES) {
    it(`${site}: 100 seeds per size pass every block check (connected, rooms reachable, stairs, no overlaps, a way in)`, () => {
      for (const size of ["small", "medium", "large"]) {
        for (let i = 0; i < 100; i++) {
          const levels = 1 + (i % 3);
          const where = `${site} ${size} seed ${i} (${levels} levels)`;
          const r = gen.generate({ siteType: site, size, levels }, ctx(module, `blk-${site}-${size}-${i}`));
          expect(r.failedCheck, where).toBeUndefined();
          const l = r.layout;
          expect(l.checks.filter((c) => c.level === "block" && !c.ok), where).toEqual([]);
          expect(l.decks.length, where).toBe(levels);
          // a way in, on the first level
          expect(l.start, where).toBeDefined();
          expect(l.markers.some((m) => m.kind === "start" && m.zone === l.start), where).toBe(true);
          // every zone reachable from the way in (locked and secret doors count, rubble does not)
          expect(reachable(l).size, where).toBe(l.zones.length);
          // stairs join each level to the next
          for (let d = 1; d < levels; d++) {
            const deckOf = new Map(l.zones.map((z) => [z.id, z.deck]));
            expect(
              l.borders.some((b) => b.kind === "stairs" && [deckOf.get(b.a), deckOf.get(b.b)].sort().join() === [`L${d}`, `L${d + 1}`].sort().join()),
              `${where}: stairs L${d}-L${d + 1}`,
            ).toBe(true);
          }
          // every room has at least three on each level, and rooms never overlap (spot-checked)
          for (const d of l.decks) expect(l.zones.filter((z) => z.deck === d.id && z.kind === "room").length, where).toBeGreaterThanOrEqual(3);
          if (i % 25 === 0) expect(overlaps(l), where).toBe(0);
          // borders and markers point at zones of the map
          const ids = new Set(l.zones.map((z) => z.id));
          for (const b of l.borders) expect(ids.has(b.a) && ids.has(b.b), `${where} ${b.id}`).toBe(true);
          for (const m of l.markers) expect(ids.has(m.zone), `${where} ${m.id}`).toBe(true);
          // a secret room is reached only through hidden doors
          for (const z of l.zones.filter((x) => x.hidden)) expect(l.borders.filter((b) => b.a === z.id || b.b === z.id).every((b) => b.hidden), `${where} ${z.id}`).toBe(true);
        }
      }
    });
  }

  it("draws each archetype in its own shape", () => {
    const zones = (site: string) => gen.generate({ siteType: site, size: "medium" }, ctx(module, `shape-${site}`)).layout;
    // halls: one long processional passage down the middle
    const halls = zones("halls");
    expect(halls.zones.filter((z) => z.kind === "corridor").length).toBeLessThanOrEqual(2);
    // caverns: open passages, irregular chambers (some outlines with more than four corners)
    const cave = zones("caverns");
    expect(cave.zones.some((z) => z.kind === "room" && z.poly.length > 4)).toBe(true);
    expect(cave.borders.filter((b) => b.kind === "open").length).toBeGreaterThan(cave.borders.filter((b) => b.kind === "door").length);
    // keep: four corner towers
    const keep = zones("keep");
    expect(keep.zones.filter((z) => z.kind === "room").length).toBeGreaterThanOrEqual(8);
    // channels: the channel's sections in a row, joined open
    const sewer = zones("channels");
    expect(sewer.zones.filter((z) => z.kind === "corridor").length).toBeGreaterThanOrEqual(4);
    // nave: one long room down the middle, much taller than wide
    const nave = zones("nave");
    const long = nave.zones.filter((z) => {
      const xs = z.poly.map((p) => p[0]);
      const ys = z.poly.map((p) => p[1]);
      return z.kind === "room" && Math.max(...ys) - Math.min(...ys) >= 2.5 * (Math.max(...xs) - Math.min(...xs));
    });
    expect(long.length).toBeGreaterThanOrEqual(1);
  });

  it("stocks from the module's own content and follows the brief", () => {
    const presets = new Set(module.presets.map((p) => p.id));
    let encounters = 0;
    let traps = 0;
    let treasure = 0;
    for (let i = 0; i < 20; i++) {
      const l = gen.generate({ siteType: "caverns", partyLevel: 1, threat: "high", theme: "undead" }, ctx(module, `stock-${i}`)).layout;
      for (const m of l.markers) {
        if (m.kind === "spawn") {
          encounters++;
          for (const g of m.data!.groups as Array<{ preset: string; n: number }>) {
            expect(presets.has(g.preset)).toBe(true);
            expect(g.n).toBeGreaterThan(0);
          }
          expect(m.detail).toMatch(/XP/);
        }
        if (m.kind === "trap") {
          traps++;
          // hazards at or below party level + 1
          expect(["fx.preset.pit"]).toContain(m.data!.preset);
          expect(m.detail).toMatch(/^DC \d+/);
        }
        if (m.kind === "treasure") {
          treasure++;
          for (const it of m.data!.items as Array<{ id: string }>) expect(["ring", "potion"]).toContain(it.id);
        }
        expect(m.gmOnly || m.kind === "start").toBe(true);
      }
      // the lair always holds an encounter and treasure
      const lair = l.zones.find((z) => z.kind === "room" && l.markers.some((m) => m.zone === z.id && m.kind === "treasure" && /gold/.test(m.detail ?? "")));
      expect(lair).toBeDefined();
    }
    expect(encounters).toBeGreaterThan(40);
    expect(traps).toBeGreaterThan(5);
    expect(treasure).toBeGreaterThan(20);
  });

  it("fits the theme when it can: the undead theme makes skeletons and ghouls far more common", () => {
    const count = (theme: string) => {
      let undead = 0;
      let all = 0;
      for (let i = 0; i < 30; i++) {
        for (const m of gen.generate({ siteType: "halls", theme }, ctx(module, `theme-${i}`)).layout.markers.filter((x) => x.kind === "spawn")) {
          for (const g of m.data!.groups as Array<{ preset: string }>) {
            all++;
            if (g.preset === "fx.preset.skeleton" || g.preset === "fx.preset.ghoul") undead++;
          }
        }
      }
      return undead / all;
    };
    expect(count("undead")).toBeGreaterThan(count("") + 0.2);
  });

  it("places the brief's key rooms: the lair one in the lair, read-aloud and GM notes kept", () => {
    const l = gen.generate(
      { siteType: "halls", keyRooms: [{ name: "The bell-frame", description: "Grisk hauls the bell here.", readAloud: "A bell hangs in lashed timber.", lair: true }, { name: "Wolf pen" }] },
      ctx(module, "keys"),
    ).layout;
    const frame = l.zones.find((z) => z.name === "The bell-frame")!;
    expect(frame.playerNote).toBe("A bell hangs in lashed timber.");
    expect(frame.gmNote).toBe("Grisk hauls the bell here.");
    expect(l.zones.some((z) => z.name === "Wolf pen")).toBe(true);
    expect(l.checks.find((c) => c.id === "key-rooms")?.ok).toBe(true);
  });

  it("marks the map as a dungeon: 5-foot squares, rooms numbered, unseen rooms hidden from players, no acts", () => {
    const l = gen.generate({ siteType: "tunnels" }, ctx(module, "flags")).layout;
    expect(l.gridUnit).toEqual({ size: 5, unit: "ft" });
    expect(l.gridM).toBeCloseTo(1.524);
    expect(l.fog).toBe("hide");
    expect(l.numbering).toBe("key");
    expect(l.acts).toBe(false);
    expect(l.zones.filter((z) => z.kind === "room").every((z) => z.key)).toBe(true);
    expect(l.zones.filter((z) => z.kind === "corridor").every((z) => !z.key)).toBe(true);
    const locked = l.borders.filter((b) => b.lockedInActs?.length);
    for (const b of locked) expect(b.lockedInActs).toEqual([1, 2, 3]);
  });
});

describe("accepting a dungeon", () => {
  it("produces the site, one entity per room, encounters with their creatures, all linked", () => {
    const l = gen.generate({ siteType: "keep" }, ctx(module, "accept")).layout;
    const p = gen.produce!(l, { siteType: "keep" });
    const rooms = l.zones.filter((z) => z.kind === "room");
    expect(p.site).toBe("site");
    expect(p.entities.find((e) => e.tempId === "site")).toMatchObject({ type: "fx.location", subtype: "dungeon", fields: { description: expect.stringMatching(/rooms/) } });
    expect(Object.keys(p.zones).sort()).toEqual(rooms.map((z) => z.id).sort());
    for (const z of rooms) {
      const e = p.entities.find((x) => x.tempId === p.zones[z.id]);
      expect(e).toMatchObject({ type: "fx.location", subtype: "room", name: z.name, within: "site" });
    }
    const spawns = l.markers.filter((m) => m.kind === "spawn");
    for (const m of spawns) {
      const enc = p.entities.find((e) => e.tempId === p.markers[m.id]);
      expect(enc?.type).toBe("fx.encounter");
      const creatures = p.relationships.filter((r) => r.type === "appears_in" && r.to === enc!.tempId);
      const n = (m.data!.groups as Array<{ n: number }>).reduce((s, g) => s + g.n, 0);
      expect(creatures.length).toBe(n);
      expect(p.relationships.some((r) => r.type === "found_at" && r.from === enc!.tempId && r.to === p.zones[m.zone])).toBe(true);
    }
    for (const e of p.entities.filter((x) => x.type === "fx.monster")) expect(e.preset).toMatch(/^fx\.preset\./);
    // traps picked from presets become hazard entities
    for (const m of l.markers.filter((x) => x.kind === "trap")) expect(p.entities.find((e) => e.tempId === p.markers[m.id])?.type).toBe("fx.hazard");
  });
});

describe("the brief from an adventure", () => {
  it("turns the scenes at a dungeon into key rooms and reads the site type and theme from the words", () => {
    const src = packMapGeneratorOf(gen)!;
    const inputs = dungeonInputsFromAdventure(src, {
      adventure: { title: "The Bell", premise: "Skeletons stole the bell." },
      scenes: [
        { title: "Into the wood", location: { id: "w", name: "Mossback Wood", subtype: "wilderness" } },
        { title: "The gate", body: "Two guards.", readAloud: "A gate.", location: { id: "t", name: "The Sunken Keep", subtype: "dungeon" } },
        { title: "The bell-frame", body: "The boss.", location: { id: "t", name: "The Sunken Keep", subtype: "dungeon" } },
      ],
      cast: { pcs: [{}, {}, {}] },
    });
    expect(inputs).toEqual({
      keyRooms: [
        { name: "The gate", description: "Two guards.", readAloud: "A gate." },
        { name: "The bell-frame", description: "The boss.", lair: true },
      ],
      siteType: "keep",
      theme: "undead",
      partySize: 3,
    });
  });
});

describe("supplements", () => {
  it("rebuild the generator so stocking sees the supplement's presets", () => {
    const supplement = {
      format: "campaign-forge-supplement",
      formatVersion: 1,
      manifest: { id: "extra", name: "Extra", version: "0.1.0", extends: { module: "fx" }, licenseNotice: "Test." },
      presets: [{ id: "extra.preset.wraith", entityType: "fx.monster", name: "Wraith", fields: { level: 3, kind: "undead" } }],
    } as unknown as ModuleSupplement;
    const withExtra = applySupplements(module, [supplement]);
    const g = withExtra.mapGenerators![0]!;
    expect(g).not.toBe(gen);
    const seen = new Set<string>();
    for (let i = 0; i < 40; i++) {
      for (const m of g.generate({ siteType: "caverns", size: "large" }, ctx(withExtra, `sup-${i}`)).layout.markers.filter((x) => x.kind === "spawn")) {
        for (const grp of m.data!.groups as Array<{ preset: string }>) seen.add(grp.preset);
      }
    }
    expect(seen.has("extra.preset.wraith")).toBe(true);
  });
});

describe("module packs that declare generators", () => {
  it("the fixture pack without parts still loads with the generator bound to its module", () => {
    const pack: ModulePack = dungeonFixturePack();
    const m = packToModule(pack);
    expect(m.mapGenerators?.[0]?.id).toBe("fx.map.dungeon");
    expect(typeof m.mapGenerators?.[0]?.produce).toBe("function");
  });
});
