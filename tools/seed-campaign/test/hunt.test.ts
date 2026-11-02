/**
 * Skyfire Down's live hunt: the job's site map set up live in act 3, the
 * crew on it, the XX121 stalker and the UPP fire team moving hidden, and one
 * motion tracker sweep that left blips A and B. Then a secret scan with the
 * hidden tokens present: the campaign's player view, the group share and
 * every player's packet carry the blips (letter, band, direction) and
 * nothing else of the hunt: no hidden token, trail, zone or suggestion.
 */
import { describe, expect, it } from "vitest";
import {
  huntOf,
  huntSeed,
  liveOf,
  memberViewer,
  playerLayout,
  playerLive,
  playerMembers,
  playerPacketSnapshot,
  playerShareSnapshot,
  projectCampaignForViewer,
  suggestHuntMoves,
  sweepLogText,
  type SiteMap,
} from "@campaign-forge/core";
import { alienModule, siteMapGenerator } from "@campaign-forge/module-alien";
import { buildDemoCampaign, DEMO_HUNT } from "../src";

const AT = "2026-11-07T22:00:00.000Z";

describe("Skyfire Down: the live hunt", () => {
  const demo = buildDemoCampaign();
  const { maps, registry } = demo;
  const scene = Object.values(maps.scenes).find((s) => s.title === DEMO_HUNT.scene)!;
  const map = maps.maps[scene.map!] as SiteMap;
  const live = liveOf(map);
  const hunt = huntOf(live);
  const pcs = Object.values(maps.entities).filter((e) => e.type === "alien.character" && e.fields["isPC"] === true);
  const marshal = pcs.find((p) => p.tags.includes(DEMO_HUNT.sweeper))!;

  it("puts the job's generated site map on a scene, live in act 3 with the crew on it", () => {
    expect(scene.act).toBeUndefined();
    expect(map.name).toMatch(/^Ore to the spaceport/);
    expect(map.generator?.id).toBe(siteMapGenerator.id);
    expect(live.act).toBe(DEMO_HUNT.act);
    expect(live.revealed[0]).toBe(map.layout!.start);
    expect(live.revealed).toContain(DEMO_HUNT.crewZone);
    expect(live.tokens.map((t) => [t.label, t.zone, t.gmOnly])).toEqual(pcs.map((p) => [p.name, DEMO_HUNT.crewZone, false]));
  });

  it("hides the XX121 stalker and the UPP fire team, moved for two stretches with their trails", () => {
    expect(hunt.step).toBe(DEMO_HUNT.stretches);
    expect(hunt.tokens.map((t) => [t.label, t.mover, t.state])).toEqual([
      ["Stalker", "creature", "detected"],
      ["UPP fire team x3", "humans", "detected"],
    ]);
    const stalker = hunt.tokens[0]!;
    expect(stalker.data?.["creature"]).toBe("alien.creature.xx121-stalker");
    expect(stalker.trail.length).toBeGreaterThan(1);
    expect(stalker.movedAt).toBe(DEMO_HUNT.stretches);
    // the UPP team keeps to the floor
    for (const z of [hunt.tokens[1]!.zone, ...hunt.tokens[1]!.trail]) expect(map.layout!.zones.find((x) => x.id === z)!.layer).not.toBe("duct");
  });

  it("has the marshal sweep with her M314: blips A and B, logged as the table reads them", () => {
    expect((marshal.fields["gear"] as Array<{ name: string }>).map((g) => g.name)).toContain("M314 Motion Tracker");
    expect(hunt.sweeps).toHaveLength(1);
    const sweep = hunt.sweeps[0]!;
    expect(sweep).toMatchObject({ by: { name: marshal.name, entity: marshal.id }, zone: DEMO_HUNT.crewZone, sensor: "motion-tracker", step: DEMO_HUNT.stretches, at: DEMO_HUNT.at });
    expect(sweepLogText(sweep)).toBe(`Sweep by ${marshal.name}: blips A (Medium, NE), B (Long, N, above)`);
    expect(hunt.tokens.map((t) => t.letter)).toEqual(["B", "A"]);
  });

  it("offers a seeded move for each threat, the same on every build", () => {
    const targets = live.tokens.map((t) => ({ zone: t.zone, label: t.label }));
    const a = suggestHuntMoves(map.layout!, live, { def: siteMapGenerator, targets, seed: huntSeed(map) });
    expect(a).toHaveLength(2);
    // record ids are new on every build; everything else is the same
    const again = buildDemoCampaign();
    const map2 = Object.values(again.maps.maps).find((m) => m.name === map.name) as SiteMap;
    const ids = new Map<string, string>();
    const huntOf2 = huntOf(liveOf(map2));
    huntOf2.tokens.forEach((t, i) => ids.set(t.id, hunt.tokens[i]!.id));
    const pcIds = new Map(Object.values(again.maps.entities).filter((e) => e.fields["isPC"] === true).map((e) => [e.id, pcs.find((p) => p.name === e.name)!.id]));
    const swap = (v: unknown): unknown => JSON.parse(JSON.stringify(v), (_k, x) => (typeof x === "string" ? (ids.get(x) ?? pcIds.get(x) ?? x) : x));
    const strip = (v: unknown): unknown => JSON.parse(JSON.stringify(v), (k, x) => (k === "id" ? undefined : x));
    expect(strip(swap(liveOf(map2)))).toEqual(strip(live));
    const targets2 = liveOf(map2).tokens.map((t) => ({ zone: t.zone, label: t.label }));
    expect(swap(suggestHuntMoves(map2.layout!, liveOf(map2), { def: siteMapGenerator, targets: targets2, seed: huntSeed(map2) }))).toEqual(a);
    again.registry.closeAll();
    again.store.destroy();
  });

  describe("the secret scan, hidden tokens present", () => {
    const session = Object.values(maps.sessions)[0]!;
    const hiddenIds = hunt.tokens.map((t) => t.id);
    const hiddenZones = [...new Set(hunt.tokens.flatMap((t) => [t.zone, ...t.trail]))];
    const check = (where: string, json: string) => {
      for (const id of hiddenIds) expect(json, `${where}: token id`).not.toContain(id);
      expect(json, where).not.toContain("UPP fire team");
      expect(json, where).not.toContain("xx121-stalker");
      expect(json, where).not.toMatch(/"(hunt|trail|movedAt|suggestions?|route|home)"/);
      expect(json, where).not.toContain(`"zone":"${DEMO_HUNT.crewZone}","sensor"`);
    };
    /** The live part of a projected map: zone tokens and the tracker, and no zone of a hidden threat among the tokens. */
    const checkLive = (where: string, l: { tokens: Array<{ zone: string; label: string }>; tracker?: unknown }) => {
      expect(l.tokens.map((t) => t.label).sort(), where).toEqual(pcs.map((p) => p.name).sort());
      expect(l.tokens.every((t) => !hiddenZones.includes(t.zone) || t.zone === DEMO_HUNT.crewZone), where).toBe(true);
    };

    it("the player map projection: blips with a band and a direction only", () => {
      const projected = playerLayout(map.layout!, { act: live.act, revealed: live.revealed, legend: siteMapGenerator.legend, live });
      const pl = playerLive(live, projected, siteMapGenerator.legend);
      checkLive("player map", pl);
      expect(pl.tracker).toEqual({
        step: 2,
        sweeps: [
          {
            by: marshal.name,
            sensor: "M314 Motion Tracker",
            step: 2,
            stale: false,
            blips: [
              { letter: "A", band: "medium", bandLabel: "Medium", direction: "NE" },
              { letter: "B", band: "long", bandLabel: "Long", direction: "N", vertical: "above" },
            ],
          },
        ],
      });
      check("player map", JSON.stringify(pl));
    });

    it("the campaign's player view drops the map's hunt", () => {
      const view = projectCampaignForViewer(maps, alienModule, { role: "player" });
      check("player view", JSON.stringify(view));
    });

    it("the group share carries the scene's map with the blips, nothing hidden", () => {
      const share = playerShareSnapshot({ maps, module: alienModule, sessionId: session.id, sceneId: scene.id, at: AT, doc: (id) => registry.open(id), referenceName: () => undefined });
      expect(share.maps.map((m) => m.id)).toEqual([map.id]);
      checkLive("share", share.maps[0]!.live);
      expect(share.maps[0]!.live.tracker?.sweeps[0]!.blips.map((b) => b.letter)).toEqual(["A", "B"]);
      check("share", JSON.stringify(share));
    });

    it("every player's packet too", () => {
      const members = playerMembers(maps.meta);
      expect(members.length).toBe(4);
      for (const m of members) {
        const packet = playerPacketSnapshot({ maps, module: alienModule, memberId: m.id, sessionId: session.id, sceneId: scene.id, doc: (id) => registry.open(id), at: AT });
        expect(packet.maps.map((x) => x.id), m.name).toEqual([map.id]);
        checkLive(`packet ${m.name}`, packet.maps[0]!.live);
        check(`packet ${m.name}`, JSON.stringify(packet));
        check(`view ${m.name}`, JSON.stringify(projectCampaignForViewer(maps, alienModule, memberViewer(maps, m.id))));
      }
    });
  });
});
