import "fake-indexeddb/auto";
import { exampleModule } from "@campaign-forge/module-example";
import { createTableRegistry, loadModule, type GameModule, type LoadedModule, type MapGeneratorDef, type MapZoneData } from "@campaign-forge/module-sdk";
import { afterEach, describe, expect, it } from "vitest";
import { createCampaign } from "../../state/actions";
import { instantiateBuilder, newCastMember } from "../../state/builderActions";
import { openCampaign, type CampaignContextValue } from "../../state/CampaignProvider";
import {
  adventureMapGenerators,
  adventurePrefill,
  checkSummary,
  checkSummaryLine,
  generatedMapsOf,
  isFailedCheck,
  layoutDiff,
  mapGeneratorContext,
  mapGeneratorsFor,
  prefillFromReviewContext,
  requestFromMap,
  rerunStage,
  resetStage,
  runMapGenerator,
  saveGeneratedMap,
  stageOfStream,
  UnknownMapGeneratorError,
  acceptMapEntities,
  canAcceptMap,
  type MapGeneratorRequest,
} from "../../state/mapgenActions";
import { siteMapSteps } from "./SiteMapCard";

/**
 * A tiny local generator: the graph stage names the zones, the layout
 * stage places them, the dressing stage rolls details. Each stage draws
 * only from its own stream, so the test can see which stage changed.
 */
const stub: MapGeneratorDef = {
  id: "test.map.stub",
  name: "Stub site",
  stages: [
    { id: "graph", title: "Zone graph" },
    { id: "layout", title: "Grid layout" },
    { id: "dressing", title: "Dressing" },
  ],
  inputs: {
    type: "object",
    properties: {
      size: { type: "integer", minimum: 2, maximum: 8, default: 4 },
      rooms: { type: "array", items: { type: "object", properties: { name: { type: "string" }, act: { type: "integer" } } } },
      crew: { type: "integer", default: 2 },
    },
  },
  generate(inputs, ctx) {
    const size = typeof inputs.size === "number" ? inputs.size : 4;
    const graph = ctx.rng("graph");
    const named = Array.isArray(inputs.rooms) ? (inputs.rooms as Array<{ name?: string }>).map((r) => r.name ?? "Room") : [];
    const names = Array.from({ length: size }, (_, i) => named[i] ?? `Room ${graph.int(100, 999)}`);
    let attempts = 0;
    let zones: MapZoneData[] = [];
    // Two layout attempts on their own sub-streams, like a retry loop.
    for (; attempts < 2; ) {
      attempts++;
      const layout = ctx.rng(`layout/attempt-${attempts}`);
      zones = names.map((name, i) => {
        const x = layout.int(0, 40);
        const y = layout.int(0, 40);
        return { id: `Z${i + 1}`, deck: "A", name, kind: "room", poly: [[x, y], [x + 4, y], [x + 4, y + 4], [x, y + 4]], cluttered: false, key: i === 0 };
      });
      if (attempts === 2) break;
    }
    const dressing = ctx.rng("dressing");
    for (const z of zones) {
      z.cluttered = dressing.next() < 0.5;
      z.details = [`detail ${dressing.int(1, 66)}`];
    }
    const blocked = inputs.crew === 99;
    return {
      layout: {
        decks: [{ id: "A", name: "Deck A", width: 48, height: 48 }],
        zones,
        borders: [{ id: "B1", a: "Z1", b: "Z2", kind: "door", segment: [[0, 0], [0, 4]] }],
        markers: [{ id: "M1", kind: "start", zone: "Z1", label: "Start", gmOnly: false }],
        start: "Z1",
        checks: [
          { id: "reach", level: "block", ok: !blocked, message: "Every key room is reachable" },
          { id: "clutter", level: "warn", ok: false, message: "At least 40% cluttered" },
        ],
      },
      attempts,
      ...(blocked ? { failedCheck: "reach" } : {}),
    };
  },
  inputsFromAdventure(ctx) {
    const places = (ctx.places as Array<{ name: string }> | undefined) ?? [];
    const acts = (ctx.acts as Array<{ number: number }> | undefined) ?? [];
    const heroes = (ctx.heroes as unknown[] | undefined) ?? [];
    return {
      rooms: places.map((p, i) => ({ name: p.name, act: acts[i % Math.max(1, acts.length)]?.number ?? 1 })),
      crew: heroes.length || undefined,
    };
  },
};

const stubGame = { ...exampleModule, mapGenerators: [stub] } as GameModule;
const stubModule = { module: stubGame, tables: createTableRegistry(exampleModule.tables) };

const req = (over: Partial<MapGeneratorRequest> = {}): MapGeneratorRequest => ({ seed: "schedule-b", inputs: { size: 4 }, ...over });

describe("runMapGenerator", () => {
  it("is deterministic: same seed, inputs and stage seeds give the same layout", () => {
    const a = runMapGenerator(stubModule, stub.id, req());
    const b = runMapGenerator(stubModule, stub.id, req());
    expect(b).toEqual(a);
    expect(a.attempts).toBe(2);
    const c = runMapGenerator(stubModule, stub.id, req({ seed: "schedule-c" }));
    expect(JSON.stringify(c.layout)).not.toBe(JSON.stringify(a.layout));
  });

  it("does not let the generator mutate the request's inputs", () => {
    const inputs = { size: 3, rooms: [{ name: "Medlab" }] };
    runMapGenerator(stubModule, stub.id, req({ inputs }));
    expect(inputs).toEqual({ size: 3, rooms: [{ name: "Medlab" }] });
  });

  it("re-running one stage changes only that stage's seed; earlier stages stay, later stages keep their own seeds", () => {
    const base = req();
    const before = runMapGenerator(stubModule, stub.id, base);
    const next = rerunStage(base, "layout", "fresh-layout");
    expect(next).toEqual({ ...base, stageSeeds: { layout: "fresh-layout" } });
    expect(next.seed).toBe(base.seed);
    const after = runMapGenerator(stubModule, stub.id, next);
    // graph (names) unchanged, layout (polygons) changed, dressing drew the same numbers
    expect(after.layout.zones.map((z) => z.name)).toEqual(before.layout.zones.map((z) => z.name));
    expect(after.layout.zones.map((z) => z.poly)).not.toEqual(before.layout.zones.map((z) => z.poly));
    expect(after.layout.zones.map((z) => z.details)).toEqual(before.layout.zones.map((z) => z.details));
    expect(layoutDiff(before.layout, after.layout).zones).toBeGreaterThan(0);
    expect(layoutDiff(before.layout, before.layout)).toEqual({ zones: 0, borders: 0, markers: 0 });

    // re-running a second stage keeps the first stage's seed
    const both = rerunStage(next, "graph", "fresh-graph");
    expect(both.stageSeeds).toEqual({ layout: "fresh-layout", graph: "fresh-graph" });
    expect(resetStage(both, "layout").stageSeeds).toEqual({ graph: "fresh-graph" });
    // back on the main seed, the original map returns
    expect(runMapGenerator(stubModule, stub.id, resetStage(next, "layout"))).toEqual(before);
  });

  it("seeds a stream from its stage: the stage id itself or a stage id followed by / . or :", () => {
    expect(stageOfStream(stub.stages, "layout")).toBe("layout");
    expect(stageOfStream(stub.stages, "layout/attempt-2")).toBe("layout");
    expect(stageOfStream(stub.stages, "layout.rooms")).toBe("layout");
    expect(stageOfStream(stub.stages, "dressing:salvage")).toBe("dressing");
    expect(stageOfStream(stub.stages, "layouts")).toBeUndefined();
    expect(stageOfStream(stub.stages, "encounters")).toBeUndefined();
    const plain = mapGeneratorContext(stubModule, stub, { seed: "s" });
    const custom = mapGeneratorContext(stubModule, stub, { seed: "s", stageSeeds: { layout: "x" } });
    expect(plain.stageSeeds).toBeUndefined();
    expect(custom.stageSeeds).toEqual({ layout: "x" });
    expect(custom.rng("graph").next()).toBe(plain.rng("graph").next());
    expect(custom.rng("layout/attempt-1").next()).not.toBe(plain.rng("layout/attempt-1").next());
    expect(custom.tables).toBe(stubModule.tables);
  });

  it("reports attempts and the failing check", () => {
    const res = runMapGenerator(stubModule, stub.id, req({ inputs: { crew: 99 } }));
    expect(res.failedCheck).toBe("reach");
    expect(res.layout.checks.filter((c) => isFailedCheck(c, res.failedCheck)).map((c) => c.id)).toEqual(["reach"]);
    expect(checkSummaryLine(checkSummary(res.layout))).toBe("1 block check fails · 1 warning");
    expect(checkSummaryLine(checkSummary(runMapGenerator(stubModule, stub.id, req()).layout))).toBe("1 warning");
  });

  it("throws for an unknown generator and lists generators by mode", () => {
    expect(() => runMapGenerator(stubModule, "nope", req())).toThrow(UnknownMapGeneratorError);
    expect(mapGeneratorsFor(stubModule, "standard").map((g) => g.id)).toEqual([stub.id]);
    const modal = { ...stubGame, mapGenerators: [{ ...stub, mode: ["campaign" as const] }] } as GameModule;
    expect(mapGeneratorsFor(modal, "standard")).toEqual([]);
    expect(adventureMapGenerators(modal, "campaign")).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// campaign store
// ---------------------------------------------------------------------------

const opened: Array<() => void> = [];
afterEach(() => {
  while (opened.length) opened.pop()?.();
});

async function open(): Promise<CampaignContextValue> {
  const id = await createCampaign({ name: "Map gen", moduleId: "example" });
  const ctx = await openCampaign(id);
  opened.push(ctx.close);
  return ctx;
}

describe("saveGeneratedMap", () => {
  it("round-trips a generated map: layout, generator provenance and adventure; re-generating from it reproduces the layout", async () => {
    const ctx = await open();
    const builder = ctx.module.buildersFor("standard")[0]!;
    const adventure = await instantiateBuilder(ctx, builder, { title: "The Lost Bell" });
    const request = rerunStage(req({ inputs: { size: 5, rooms: [{ name: "Bell tower", act: 1 }] } }), "dressing", "d2");
    const result = runMapGenerator(stubModule, stub.id, request);

    const map = saveGeneratedMap(ctx, result, { name: "  Bell site  ", adventureId: adventure.id, generator: { id: stub.id, seed: request.seed, inputs: request.inputs!, stageSeeds: request.stageSeeds! } });
    const stored = ctx.store.get("maps", map.id)!;
    expect(stored.name).toBe("Bell site");
    expect(stored.layout).toEqual(result.layout);
    expect(stored.generator).toEqual({ id: stub.id, seed: "schedule-b", inputs: { size: 5, rooms: [{ name: "Bell tower", act: 1 }] }, stageSeeds: { dressing: "d2" }, attempts: 2 });
    expect(stored.adventure).toBe(adventure.id);
    expect(stored.zones).toEqual([]);
    expect(stored.visibility).toEqual({ level: "gm" });
    expect(generatedMapsOf(ctx.store, adventure.id).map((m) => m.id)).toEqual([map.id]);

    const again = requestFromMap(stored)!;
    expect(again).toEqual({ generatorId: stub.id, seed: "schedule-b", inputs: { size: 5, rooms: [{ name: "Bell tower", act: 1 }] }, stageSeeds: { dressing: "d2" } });
    expect(runMapGenerator(stubModule, again.generatorId, again).layout).toEqual(stored.layout);

    // Updating the same map replaces the layout and clears stale live state.
    ctx.store.update("maps", map.id, { live: { act: 2, revealed: ["Z1"], borders: {}, zoneFlags: {}, tokens: [], pings: [] } });
    const rerolled = runMapGenerator(stubModule, stub.id, rerunStage(request, "layout", "l2"));
    const updated = saveGeneratedMap(ctx, rerolled, { name: "Bell site", mapId: map.id, adventureId: adventure.id, generator: { id: stub.id, seed: "schedule-b", inputs: request.inputs!, stageSeeds: { dressing: "d2", layout: "l2" } } });
    expect(updated.id).toBe(map.id);
    expect(updated.layout).toEqual(rerolled.layout);
    expect(updated.generator?.stageSeeds).toEqual({ dressing: "d2", layout: "l2" });
    expect(updated.live).toBeUndefined();
    expect(ctx.store.list("maps")).toHaveLength(1);
  }, 30_000);
});

describe("adventure prefill", () => {
  it("fills the brief from the adventure's review context and records which inputs came from it", async () => {
    const ctx = await open();
    const builder = ctx.module.buildersFor("standard")[0]!;
    const adventure = await instantiateBuilder(ctx, builder, { title: "The Lost Bell" });
    const places = builder.cast.find((r) => r.id === "places")!;
    const heroes = builder.cast.find((r) => r.id === "heroes")!;
    newCastMember(ctx, adventure.id, places, "Bell tower");
    newCastMember(ctx, adventure.id, places, "Crypt");
    newCastMember(ctx, adventure.id, heroes, "Ada");

    const prefill = await adventurePrefill(ctx, stub, adventure.id);
    expect(prefill.fromAdventure.sort()).toEqual(["crew", "rooms"]);
    expect(prefill.inputs).toEqual({
      size: 4,
      crew: 1,
      rooms: [
        { name: "Bell tower", act: 1 },
        { name: "Crypt", act: 2 },
      ],
    });
    const result = runMapGenerator(stubModule, stub.id, { seed: "bell", inputs: prefill.inputs });
    expect(result.layout.zones.slice(0, 2).map((z) => z.name)).toEqual(["Bell tower", "Crypt"]);

    // Without inputsFromAdventure, only the schema defaults.
    const { inputsFromAdventure: _drop, ...plain } = stub;
    expect(prefillFromReviewContext(plain as MapGeneratorDef, {})).toEqual({ inputs: { size: 4, crew: 2 }, fromAdventure: [] });
  }, 30_000);

  it("uses the module-example generator's own inputsFromAdventure when it has one", async () => {
    const example = loadModule(exampleModule, { skipProcedureRuns: true });
    const gen = adventureMapGenerators(example)[0];
    if (!gen) return; // the example generator has not landed yet
    const ctx = await open();
    const builder = ctx.module.buildersFor("standard")[0]!;
    const adventure = await instantiateBuilder(ctx, builder, { title: "The Lost Bell" });
    newCastMember(ctx, adventure.id, builder.cast.find((r) => r.id === "places")!, "Bell tower");
    const prefill = await adventurePrefill(ctx, gen, adventure.id);
    expect(prefill.fromAdventure.length).toBeGreaterThan(0);
    const a = runMapGenerator(example, gen.id, { seed: "bell", inputs: prefill.inputs });
    const b = runMapGenerator(example, gen.id, { seed: "bell", inputs: prefill.inputs });
    expect(b).toEqual(a);
    expect(a.layout.zones.length).toBeGreaterThan(0);
  }, 30_000);
});

describe("guided builder site map card", () => {
  it("shows on the step with a location cast role and on the review step, only when a generator reads adventures", () => {
    const example = loadModule(exampleModule, { skipProcedureRuns: true });
    const builder = example.buildersFor("standard")[0]!;
    const withStub: Pick<LoadedModule, "module" | "tables" | "entityType"> = { module: stubGame, tables: example.tables, entityType: example.entityType };
    expect(siteMapSteps(builder, withStub, "standard")).toEqual(["cast", "review"]);
    const { inputsFromAdventure: _drop, ...plain } = stub;
    const withoutPrefill = { ...withStub, module: { ...stubGame, mapGenerators: [plain as MapGeneratorDef] } as GameModule };
    expect(siteMapSteps(builder, withoutPrefill, "standard")).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// the Alien generator (alien.map.site)
// ---------------------------------------------------------------------------

describe("Alien site map generator through the workbench actions", () => {
  it("is deterministic, matches the generator's own context, and re-running a stage keeps the earlier stages", async () => {
    const alienPkg = await import("@campaign-forge/module-alien");
    const alien = loadModule(alienPkg.alienModule, { skipProcedureRuns: true });
    const gen = mapGeneratorsFor(alien, "cinematic").find((g) => g.id === "alien.map.site");
    if (!gen) return; // not landed
    const base: MapGeneratorRequest = { seed: "schedule-b", inputs: {} };
    const a = runMapGenerator(alien, gen.id, base);
    expect(runMapGenerator(alien, gen.id, base)).toEqual(a);
    expect(a.layout.zones.length).toBeGreaterThan(0);
    // The app's ctx.rng(stream) forks the seed exactly as the generator's own createMapContext does.
    expect(gen.generate({}, alienPkg.createMapContext("schedule-b", { tables: alien.tables }))).toEqual(a);

    // A later stage re-run (dressing) leaves the zone graph and layout alone and changes the map.
    const later = runMapGenerator(alien, gen.id, rerunStage(base, "dressing", "d2"));
    const outlines = (r: typeof a) => r.layout.zones.map((z) => [z.id, z.poly]);
    expect(outlines(later)).toEqual(outlines(a));
    expect(later).not.toEqual(a);
    expect(gen.generate({}, alienPkg.createMapContext("schedule-b", { tables: alien.tables, stageSeeds: { dressing: "d2" } }))).toEqual(later);
  }, 60_000);

  it("prefills the brief from a cinematic adventure's locations", async () => {
    const id = await createCampaign({ name: "Hope", moduleId: "alien", mode: "cinematic" });
    const ctx = await openCampaign(id);
    opened.push(ctx.close);
    const gen = adventureMapGenerators(ctx.module, "cinematic")[0];
    if (!gen) return;
    const builder = ctx.module.buildersFor("cinematic")[0]!;
    const adventure = await instantiateBuilder(ctx, builder, { title: "Cold Harbor" });
    const locations = builder.cast.find((r) => r.id === "locations")!;
    for (const n of ["Operations", "Medlab", "Hangar"]) newCastMember(ctx, adventure.id, locations, n);
    const prefill = await adventurePrefill(ctx, gen, adventure.id);
    expect(prefill.fromAdventure).toContain("key_rooms");
    expect((prefill.inputs.key_rooms as Array<{ name: string }>).map((r) => r.name)).toEqual(["Operations", "Medlab", "Hangar"]);
    const result = runMapGenerator(ctx.module, gen.id, { seed: "cold-harbor", inputs: prefill.inputs });
    const names = result.layout.zones.map((z) => z.name);
    for (const n of ["Operations", "Medlab", "Hangar"]) expect(names).toContain(n);
    const map = saveGeneratedMap(ctx, result, { name: "Cold Harbor site map", adventureId: adventure.id, generator: { id: gen.id, seed: "cold-harbor", inputs: prefill.inputs } });
    expect(generatedMapsOf(ctx.store, adventure.id).map((m) => m.id)).toEqual([map.id]);
    expect(siteMapSteps(builder, ctx.module, "cinematic")).toEqual(["locations", "review"]);
  }, 60_000);
});

describe("accepting a generated dungeon", () => {
  it("adds the site's rooms, encounters and creatures (GM-only), links zones and marks to them and shows the map on the adventure's scenes there", async () => {
    const id = await createCampaign({ name: "Dungeon", moduleId: "example-pack" });
    const ctx = await openCampaign(id);
    opened.push(ctx.close);
    const def = mapGeneratorsFor(ctx.module).find((g) => g.id === "example-pack.map.dungeon");
    expect(canAcceptMap(def)).toBe(true);
    expect(canAcceptMap(stub)).toBe(false);

    const site = ctx.store.createEntity({ type: "example-pack.site", subtype: "ruin", name: "Lantern Barrow" });
    const adventure = ctx.store.createAdventure({ title: "Into the barrow" });
    const act = ctx.store.createAct(adventure.id, { title: "Below" });
    const scene = ctx.store.createScene(act.id, { title: "The barrow", location: site.id });
    const request: MapGeneratorRequest = { seed: "barrow", inputs: { size: "small" } };
    const result = runMapGenerator(ctx.module, def!.id, request);
    expect(result.failedCheck).toBeUndefined();
    const map = saveGeneratedMap(ctx, result, { name: "Lantern Barrow", adventureId: adventure.id, generator: { id: def!.id, seed: request.seed, inputs: request.inputs! } });

    const before = ctx.store.list("entities").length;
    const accepted = acceptMapEntities(ctx, { mapId: map.id, locationId: site.id, adventureId: adventure.id });
    expect(accepted.site).toBe(site.id);
    expect(accepted.scenes).toBe(1);
    expect(ctx.store.get("scenes", scene.id)!.map).toBe(map.id);
    const created = ctx.store.list("entities").slice(before);
    expect(created.length).toBeGreaterThan(0);
    expect(created.every((e) => e.visibility.level === "gm")).toBe(true);

    const stored = ctx.store.get("maps", map.id)!;
    expect(stored.location).toBe(site.id);
    const rooms = stored.layout!.zones.filter((z) => z.kind === "room");
    expect(rooms.every((z) => z.entity && ctx.store.get("entities", z.entity)?.type === "example-pack.site")).toBe(true);
    const within = ctx.store.list("relationships").filter((r) => r.type === "within" && r.to === site.id);
    expect(within.map((r) => r.from).sort()).toEqual(rooms.map((z) => z.entity!).sort());
    const spawns = stored.layout!.markers.filter((m) => m.kind === "spawn");
    expect(spawns.length).toBeGreaterThan(0);
    for (const m of spawns) expect(ctx.store.get("entities", (m.data as { entity?: string } | undefined)?.entity ?? "")).toBeDefined();
  }, 30_000);

  it("refuses a map that is not generated", async () => {
    const ctx = await open();
    const map = ctx.store.createMap({ name: "Hand-drawn" });
    expect(() => acceptMapEntities(ctx, { mapId: map.id })).toThrow(/generated/);
  });
});
