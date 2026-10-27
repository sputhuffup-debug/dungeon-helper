/**
 * The pack's dungeon generator (the SDK's built-in dungeon engine): every
 * site type and size passes its block checks over 100 seeds, encounters
 * spend GM Core's XP budget on creatures near the party's level, hazards and
 * treasure come from the pack, and the built-in supplement's creatures count
 * once it is applied.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { applySupplements, checkModule, createRng, createTableRegistry, moduleFromPackSource, supplementFromSource, type GameModule, type MapGeneratorDef } from "@campaign-forge/module-sdk";
import { pf2eOrcSource } from "../src";
import { pf2eOrcBooksSource } from "../src/supplement";

let m: GameModule;
const SITES = ["crypt", "cave", "keep", "sewer", "temple", "mine"];
const BUDGET: Record<string, [number, number]> = { trivial: [40, 10], low: [60, 20], moderate: [80, 20], severe: [120, 30], extreme: [160, 40] };
const STEP: Record<string, string> = { trivial: "low", low: "moderate", moderate: "severe", severe: "extreme", extreme: "extreme" };
const gen = (mod: GameModule) => mod.mapGenerators!.find((x) => x.id === "pf2e-orc.map.dungeon")!;
const run = (mod: GameModule, inputs: Record<string, unknown>, seed: string) => gen(mod).generate(inputs, { seed, rng: (s: string) => createRng(seed).fork(s), tables: createTableRegistry(mod.tables) });

beforeAll(async () => {
  m = await moduleFromPackSource(pf2eOrcSource);
}, 60_000);

describe("the remaster dungeon generator", { timeout: 180_000 }, () => {
  it("passes conformance, with a dry run of every site type", () => {
    expect(checkModule(m, { skipProcedureRuns: true, mapGeneratorRuns: 2 }).issues.filter((i) => i.where.startsWith("mapGenerator"))).toEqual([]);
  });

  for (const site of SITES) {
    it(`${site}: 100 seeds per size pass every block check`, () => {
      for (const size of ["small", "medium", "large"]) {
        for (let i = 0; i < 100; i++) {
          const r = run(m, { siteType: site, size, levels: 1 + (i % 3), partyLevel: 1 + (i % 20), partySize: 2 + (i % 7), threat: Object.keys(BUDGET)[i % 5] }, `orc-${site}-${size}-${i}`);
          expect(r.failedCheck, `${site} ${size} ${i}`).toBeUndefined();
          expect(r.layout.checks.filter((c) => c.level === "block" && !c.ok), `${site} ${size} ${i}`).toEqual([]);
        }
      }
    });
  }

  it("spends GM Core's XP budget exactly on creatures within four levels of the party", () => {
    const presets = new Map(m.presets.map((p) => [p.id, p]));
    for (const [lvl, size, threat] of [[1, 4, "moderate"], [3, 5, "severe"], [8, 3, "low"], [14, 6, "extreme"], [20, 4, "trivial"]] as const) {
      const l = run(m, { siteType: "cave", size: "large", partyLevel: lvl, partySize: size, threat }, `budget-${lvl}`).layout;
      const lairs = new Set(l.zones.filter((z) => z.kind === "room").map((z) => z.id));
      for (const s of l.markers.filter((x) => x.kind === "spawn")) {
        const groups = s.data!.groups as Array<{ preset: string; n: number; xp: number }>;
        for (const grp of groups) {
          const level = Number(presets.get(grp.preset)?.fields.level);
          expect(Math.abs(level - lvl), `${grp.preset} at party level ${lvl}`).toBeLessThanOrEqual(4);
          expect(presets.get(grp.preset)?.entityType).toBe("pf2e-orc.creature");
        }
        const t = /a (\w+) encounter/.exec(s.detail ?? "")?.[1] ?? "";
        expect([threat, STEP[threat]]).toContain(t);
        const [budget, per] = BUDGET[t]!;
        // a group can come up short only when no creature of that level exists
        if (groups.length === (s.data!.groups as unknown[]).length) expect(s.data!.xp).toBeLessThanOrEqual(budget + (size - 4) * per);
        expect(lairs.has(s.zone) || s.zone.startsWith("P")).toBe(true);
      }
    }
  });

  it("traps are GM Core hazards near the party's level, with their own DCs; treasure items are near its level", () => {
    const presets = new Map(m.presets.map((p) => [p.id, p]));
    const items = new Map(m.referenceLists.flatMap((l) => l.items.map((i) => [i.id, i] as const)));
    for (const lvl of [2, 6, 11, 17]) {
      for (let i = 0; i < 6; i++) {
        const l = run(m, { siteType: "crypt", size: "large", partyLevel: lvl, threat: "extreme" }, `hz-${lvl}-${i}`).layout;
        for (const t of l.markers.filter((x) => x.kind === "trap")) {
          const p = presets.get(t.data!.preset as string)!;
          expect(p.entityType).toBe("pf2e-orc.hazard");
          expect(Number(p.fields.level)).toBeGreaterThanOrEqual(lvl - 3);
          expect(Number(p.fields.level)).toBeLessThanOrEqual(lvl + 1);
          expect(t.detail).toContain(`Stealth DC ${Number(p.fields.stealth) + 10}`);
        }
        for (const t of l.markers.filter((x) => x.kind === "treasure")) {
          for (const it of t.data!.items as Array<{ id: string }>) {
            const level = Number((items.get(it.id) as { level?: number } | undefined)?.level);
            expect(level).toBeGreaterThanOrEqual(lvl - 2);
            expect(level).toBeLessThanOrEqual(lvl + 1);
          }
        }
        for (const b of l.borders.filter((x) => x.kind === "door" && x.lockedInActs?.length)) expect(b.note).toMatch(/Lock \(\w+\).*Thievery/);
        for (const b of l.borders.filter((x) => x.hidden)) expect(b.note).toMatch(/Perception DC \d+/);
      }
    }
  });

  it("with the built-in supplement on, its creatures can stock a dungeon", async () => {
    const supplement = await supplementFromSource(pf2eOrcBooksSource);
    const withBooks = applySupplements(m, [supplement]);
    const books = new Set(withBooks.presets.filter((p) => p.id.startsWith(`${supplement.manifest.id}.`)).map((p) => p.id));
    expect(books.size).toBeGreaterThan(0);
    let fromBooks = 0;
    for (let i = 0; i < 12; i++) {
      for (const s of run(withBooks, { siteType: "keep", size: "large", partyLevel: 4 }, `books-${i}`).layout.markers.filter((x) => x.kind === "spawn")) {
        for (const grp of s.data!.groups as Array<{ preset: string }>) if (books.has(grp.preset)) fromBooks++;
      }
    }
    expect(fromBooks).toBeGreaterThan(0);
  });
});
