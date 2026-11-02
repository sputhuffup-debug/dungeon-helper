/**
 * The live hunt on generated Alien site maps: hidden threats placed from the
 * map's marks (a xenomorph spawn, rogue humans, a hostile android, a turning
 * android NPC), moved by the module's suggestions for several stretches,
 * and swept with an M314. Checks that suggestions are deterministic, keep to
 * the mover's speed, its duct rule and passable borders (live seals and locks
 * included), and that the tracker reads movement only, within Long range.
 */
import {
  advanceHunt,
  borderState,
  CampaignStore,
  huntMarkerSources,
  huntOf,
  huntSeed,
  liveOf,
  moveHuntToken,
  placeHuntSource,
  runMapGenerator,
  sensorDistances,
  setBorderState,
  startLive,
  suggestHuntMove,
  sweepReadings,
  zoneLayer,
  zoneMove,
  type SiteMap,
} from "@campaign-forge/core";
import { alienModule, motionTrackers, SITE_TYPES, siteMapGenerator } from "@campaign-forge/module-alien";
import { describe, expect, it } from "vitest";

const brief = (site: string) => ({
  site_type: site,
  size: "medium",
  threats: [{ creature: "alien.creature.xx121-drone", act: 2, count: 1 }],
  hostiles: [
    { group: "upp-squad", act: 2, count: 3, posture: "patrol" },
    { group: "corporate-security", act: 2, count: 1, posture: "hold" },
    { group: "hostile-android", act: 2, count: 1, posture: "patrol" },
  ],
  npcs: [{ name: "Juno Blanchard", role: "android", turns: true, note: "Turns on the crew." }],
});

function setup(site: string, seed: string): { store: CampaignStore; map: () => SiteMap; mapId: string } {
  const store = CampaignStore.create({ name: "Hunt", moduleId: alienModule.manifest.id, moduleVersion: alienModule.manifest.version, mode: "cinematic", calendarId: alienModule.calendar.id });
  const layout = runMapGenerator(alienModule, siteMapGenerator, brief(site), { seed }).layout;
  const m = store.createMap({ name: site });
  store.update("maps", m.id, { layout, generator: { id: siteMapGenerator.id, seed, inputs: brief(site) } });
  startLive(store, m.id, 2);
  return { store, mapId: m.id, map: () => store.get("maps", m.id)! };
}

const hunt = siteMapGenerator.hunt!;
const M314 = motionTrackers[0]!;

describe("the live hunt on Alien site maps", { timeout: 120_000 }, () => {
  it("makes hidden threats from the map's marks: the xenomorph, the rogue humans, the androids", () => {
    const { map } = setup("station", "hunt-sources");
    const sources = huntMarkerSources(map().layout!, hunt, 2);
    const kinds = new Map(sources.map((s) => [s.label, s.mover]));
    expect([...kinds.entries()].find(([l]) => l.startsWith("Drone"))?.[1]).toBe("creature");
    expect([...kinds.entries()].find(([l]) => l.startsWith("UPP fire team"))?.[1]).toBe("humans");
    expect([...kinds.entries()].find(([l]) => l.startsWith("Corporate security"))?.[1]).toBe("humans");
    expect(sources.some((s) => s.mover === "android" && s.marker && map().layout!.markers.find((m) => m.id === s.marker)?.kind === "hostile")).toBe(true);
    // the drone's speed rides on its spawn mark; the patrols carry their waypoints
    const drone = sources.find((s) => s.mover === "creature")!;
    expect(typeof drone.data.speed).toBe("number");
    expect(sources.find((s) => s.label.startsWith("UPP"))!.data.posture).toBe("patrol");
  });

  it("suggests moves that are deterministic, keep to speed, the duct rule and passable borders, for every site type", () => {
    for (const site of SITE_TYPES) {
      const { store, mapId, map } = setup(site, `hunt-${site}`);
      const layout = map().layout!;
      const sources = huntMarkerSources(layout, hunt, 2);
      for (const s of sources) placeHuntSource(store, mapId, s);
      // seal every duct access point on the start's deck: nothing may cross one
      const sealed = layout.borders.filter((b) => b.kind === "access").slice(0, 3);
      for (const b of sealed) setBorderState(store, mapId, b.id, { sealed: true });
      const targets = [{ zone: layout.start!, label: "Crew" }];
      for (let step = 0; step < 3; step++) {
        advanceHunt(store, mapId, step === 2 ? "round" : "stretch");
        const live = liveOf(map());
        for (const t of huntOf(live).tokens) {
          const s = suggestHuntMove(layout, live, t, { def: siteMapGenerator, targets, seed: huntSeed(map()) })!;
          expect(suggestHuntMove(layout, live, t, { def: siteMapGenerator, targets, seed: huntSeed(map()) }), `${site} deterministic`).toEqual(s);
          const mover = hunt.movers.find((m) => m.id === t.mover)!;
          for (const o of s.options) {
            expect(o.path.length - 1, `${site} ${t.label} speed`).toBeLessThanOrEqual(s.reach);
            for (let i = 1; i < o.path.length; i++) {
              const [a, b] = [o.path[i - 1]!, o.path[i]!];
              const z = layout.zones.find((x) => x.id === b)!;
              if (!mover.ducts) expect(zoneLayer(layout, z), `${site} ${t.label} kept out of the ducts`).toBe("floor");
              expect(z.kind).not.toBe("out-of-bounds");
              const crossings = layout.borders.filter((x) => (x.a === a && x.b === b) || (x.a === b && x.b === a));
              const ok = crossings.some((x) => borderState(x, { act: live.act, live, passable: siteMapGenerator.passable }, zoneMove(layout, a, b)).passable);
              expect(ok, `${site} ${t.label} ${a}->${b} passable`).toBe(true);
              expect(crossings.every((x) => sealed.some((y) => y.id === x.id))).toBe(false);
            }
          }
          if (s.best.zone !== t.zone) moveHuntToken(store, mapId, t.id, s.best.zone, { path: s.best.path });
        }
      }
      // creatures move by Speed per stretch, two zones a round
      const drone = huntOf(liveOf(map())).tokens.find((t) => t.mover === "creature")!;
      const stretch = suggestHuntMove(layout, liveOf(map()), drone, { def: siteMapGenerator, targets, seed: "x", stepKind: "stretch" })!;
      expect(stretch.reach).toBe(drone.data!.speed);
      expect(suggestHuntMove(layout, liveOf(map()), drone, { def: siteMapGenerator, targets, seed: "x", stepKind: "round" })!.reach).toBe(2);
    }
  });

  it("reads movement only, within the M314's Long range, across walls and locks", () => {
    const { store, mapId, map } = setup("colony", "hunt-tracker");
    const layout = map().layout!;
    const sources = huntMarkerSources(layout, hunt, 2);
    const ids = sources.map((s) => placeHuntSource(store, mapId, s));
    const from = layout.start!;
    expect(sweepReadings(layout, liveOf(map()), siteMapGenerator, M314, from)).toEqual([]);
    advanceHunt(store, mapId, "stretch");
    // move every token one zone (any passable neighbour), then read
    for (const id of ids) {
      const t = huntOf(liveOf(map())).tokens.find((x) => x.id === id)!;
      const s = suggestHuntMove(layout, liveOf(map()), t, { def: siteMapGenerator, targets: [{ zone: from, label: "Crew" }], seed: "move" })!;
      const step = s.options.find((o) => o.path.length === 2);
      if (step) moveHuntToken(store, mapId, id, step.zone, { path: step.path });
    }
    const live = liveOf(map());
    const dist = sensorDistances(layout, live, siteMapGenerator, M314, from);
    const readings = sweepReadings(layout, live, siteMapGenerator, M314, from);
    const expected = huntOf(live)
      .tokens.filter((t) => t.movedAt === 1 && (dist.get(t.zone) ?? 99) <= 4)
      .map((t) => t.id)
      .sort();
    expect(readings.map((r) => r.token.id).sort()).toEqual(expected);
    for (const r of readings) expect(["short", "medium", "long"]).toContain(r.band!.id);
    // a still threat shows nothing
    advanceHunt(store, mapId, "stretch");
    expect(sweepReadings(layout, liveOf(map()), siteMapGenerator, M314, from)).toEqual([]);
  });
});
