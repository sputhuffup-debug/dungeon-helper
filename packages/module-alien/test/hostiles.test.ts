import { describe, expect, it } from "vitest";
import { ACT_BUDGETS, HOSTILE_GROUPS, MIN_HOSTILE_DISTANCE, SITE_TYPES, THREAT_COST, createMapContext, generateSiteMap, hostileSpecs, normalizeMapInputs, playerLayout, zoneAdjacency } from "../src/maps/index";
import { bfs } from "../src/maps/graph";
import { npcPresets } from "../src/data/npc-presets";

const HOSTILES = [
  { group: "mercenaries", act: 3, count: 4, posture: "guard" },
  { group: "corporate-security", act: 1, count: 1, posture: "hold" },
  { group: "upp-squad", act: 2, count: 3, posture: "patrol" },
  { group: "hostile-android", act: 2, count: 1, posture: "patrol" },
];
const brief = (site: string) => ({ site_type: site, size: "medium", threats: [{ creature: "alien.creature.xx121-drone", act: 2, count: 1 }], hostiles: HOSTILES, npcs: [{ name: "Ada Moreau", role: "android", turns: true, note: "Turns in Act 3" }] });

describe("rogue humans on the site map", () => {
  it("every hostile group uses a book NPC preset with combat stats", () => {
    for (const g of HOSTILE_GROUPS) {
      for (const id of [g.preset, ...(g.leader ? [g.leader] : [])]) {
        const p = npcPresets.find((x) => x.id === id);
        expect(p, id).toBeDefined();
        const skills = p!.fields.skills as Record<string, number>;
        const armed = ((p!.fields.weapons ?? []) as unknown[]).length > 0 || (p!.fields.gear as Array<{ name: string }>).some((x) => /rifle|pistol|revolver|shotgun|gun|knife|baton/i.test(x.name));
        // a combat skill, or a weapon in the book's gear line (the homesteader's shotgun, now on its Weapons list), or an android's strength
        expect((skills.rangedCombat ?? 0) + (skills.closeCombat ?? 0) > 0 || armed).toBe(true);
      }
    }
  });

  it("normalises hostiles, keeping a brief without them unchanged", () => {
    expect(normalizeMapInputs({}).hostiles).toEqual([]);
    const n = normalizeMapInputs({ hostiles: [{ group: "cultists", act: 9, count: 99 }, { group: "nobody" }] });
    expect(n.hostiles).toEqual([{ group: "cultists", act: 3, count: 8, posture: "guard" }]);
  });

  it("costs their tier against the act budget", () => {
    const specs = hostileSpecs(normalizeMapInputs({ hostiles: HOSTILES }));
    expect(specs.map((s) => s.tier)).toEqual(["greater", "lesser", "greater", "greater"]);
    expect(specs.map((s) => s.cost)).toEqual([THREAT_COST.greater, THREAT_COST.lesser, THREAT_COST.greater, THREAT_COST.greater]);
    const r = generateSiteMap({ ...brief("station_deck"), crew: 4 }, createMapContext("budget"));
    const acts = r.layout.meta?.acts as Record<string, { cost: number; budget: [number, number] }>;
    expect(acts["1"]!.cost).toBe(1);
    expect(acts["2"]!.cost).toBe(1 + 3 + 3 + 3);
    expect(acts["3"]!.cost).toBe(1 + 3 + 3 + 3 + 3);
    expect(acts["3"]!.budget).toEqual(ACT_BUDGETS[4]![2]);
    expect(r.layout.checks.find((c) => c.id === "act-budget")?.ok).toBe(false);
  });

  it("follows the placement rules and passes the block checks over 100 seeds per site type", { timeout: 300_000 }, () => {
    for (const site of SITE_TYPES) {
      let failed = 0;
      for (let i = 0; i < 100; i++) {
        const r = generateSiteMap(brief(site), createMapContext(`${site}-${i}`));
        const layout = r.layout;
        if (r.failedCheck) failed++;
        expect(r.failedCheck === "hostile-placement").toBe(false);
        const check = layout.checks.find((c) => c.id === "hostile-placement");
        expect(check?.ok, `${site} ${i}: ${check?.message}`).toBe(true);
        const byId = new Map(layout.zones.map((z) => [z.id, z]));
        const marks = layout.markers.filter((m) => m.kind === "hostile");
        expect(marks.length).toBe(HOSTILES.length);
        for (const m of marks) {
          expect(m.gmOnly).toBe(true);
          const z = byId.get(m.zone)!;
          if (m.data?.group !== "hostile-android") expect(z.layer === "duct" || z.kind === "crawlspace").toBe(false);
          const dist = bfs(zoneAdjacency(layout, m.act ?? 1), layout.start!).get(m.zone);
          expect(dist).toBeGreaterThanOrEqual(MIN_HOSTILE_DISTANCE);
          if (m.data?.posture === "hold") expect(z.kind, `${site} ${i} ${m.label}`).toBe("room");
          if (m.data?.posture === "patrol" && m.data?.group !== "hostile-android") expect(z.kind).toBe("corridor");
          for (const w of layout.markers.filter((x) => x.kind === "waypoint" && x.data?.hostile === m.id)) if (m.data?.group !== "hostile-android") expect(byId.get(w.zone)!.layer).not.toBe("duct");
          expect(m.detail).toMatch(/STR \d AGI \d WIT \d EMP \d/);
        }
        // no GM-only mark reaches the player map in any act
        for (const act of [1, 2, 3]) {
          const p = playerLayout(layout, act);
          expect(p.markers.some((m) => m.kind === "hostile" || m.kind === "waypoint" || m.kind === "npc")).toBe(false);
        }
      }
      // the base generator's own retry budget, unchanged by hostiles
      expect(failed).toBeLessThan(10);
    }
  });

  it("a turning android NPC carries its GM note on every marker", () => {
    const r = generateSiteMap(brief("research_lab"), createMapContext("turn"));
    const npc = r.layout.markers.filter((m) => m.kind === "npc" && m.label === "Ada Moreau");
    expect(npc.length).toBe(3);
    for (const m of npc) {
      expect(m.detail).toBe("Turns in Act 3");
      expect(m.data?.turns).toBe(true);
    }
  });
});
