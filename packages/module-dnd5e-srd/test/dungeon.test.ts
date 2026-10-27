/**
 * The pack's dungeon generator (the SDK's built-in dungeon engine): every
 * site type and size over 100 seeds passes its block checks, and stocking
 * uses only the pack's own content at the party's level band.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { checkModule, createRng, createTableRegistry, moduleFromPackSource, type GameModule, type MapGeneratorDef, type TableRegistry } from "@campaign-forge/module-sdk";
import { dnd5eSrdSource } from "../src";

let m: GameModule;
let g: MapGeneratorDef;
let tables: TableRegistry;
const SITES = ["crypt", "cave", "keep", "sewer", "temple", "mine"];
const run = (inputs: Record<string, unknown>, seed: string) => g.generate(inputs, { seed, rng: (s: string) => createRng(seed).fork(s), tables });

beforeAll(async () => {
  m = await moduleFromPackSource(dnd5eSrdSource);
  g = m.mapGenerators!.find((x) => x.id === "dnd5e-srd.map.dungeon")!;
  tables = createTableRegistry(m.tables);
}, 60_000);

describe("the fifth edition dungeon generator", { timeout: 120_000 }, () => {
  it("passes conformance, with a dry run of every site type", () => {
    expect(checkModule(m, { skipProcedureRuns: false, seeds: 1, mapGeneratorRuns: 2 }).issues.filter((i) => i.where.startsWith("mapGenerator"))).toEqual([]);
  });

  for (const site of SITES) {
    it(`${site}: 100 seeds per size pass every block check`, () => {
      for (const size of ["small", "medium", "large"]) {
        for (let i = 0; i < 100; i++) {
          const r = run({ siteType: site, size, levels: 1 + (i % 3), partyLevel: 1 + (i % 20), threat: ["quiet", "standard", "dangerous", "deadly"][i % 4] }, `5e-${site}-${size}-${i}`);
          expect(r.failedCheck, `${site} ${size} ${i}`).toBeUndefined();
          expect(r.layout.checks.filter((c) => c.level === "block" && !c.ok), `${site} ${size} ${i}`).toEqual([]);
        }
      }
    });
  }

  it("stocks with the pack's own encounter tables for the party's level band, SRD traps and SRD magic items", () => {
    const tierOf = (lvl: number) => (lvl <= 4 ? 1 : lvl <= 10 ? 2 : lvl <= 16 ? 3 : 4);
    const rarities: Record<number, string[]> = { 1: ["Common", "Uncommon"], 2: ["Uncommon", "Rare"], 3: ["Rare", "Very Rare"], 4: ["Very Rare", "Legendary"] };
    const magic = new Map(m.referenceLists.find((l) => l.id === "dnd5e-srd.magic-items")!.items.map((i) => [i.id, i]));
    const traps = new Set(m.tables.find((t) => t.id === "dnd5e-srd.dungeon.traps")!.rows.map((r) => r.label));
    for (const lvl of [1, 3, 7, 12, 18]) {
      const tier = tierOf(lvl);
      for (const site of SITES) {
        const allowed = new Set(m.tables.filter((t) => /^dnd5e-srd\.encounter\.[a-z]+-\d$/.test(t.id) && t.id.endsWith(`-${tier}`)).flatMap((t) => t.rows.map((r) => (r.result as { preset: string }).preset)));
        const l = run({ siteType: site, size: "medium", partyLevel: lvl, threat: "deadly" }, `stock-${site}-${lvl}`).layout;
        const spawns = l.markers.filter((x) => x.kind === "spawn");
        expect(spawns.length, `${site} ${lvl}`).toBeGreaterThan(0);
        for (const s of spawns) for (const grp of s.data!.groups as Array<{ preset: string }>) expect(allowed.has(grp.preset), `${site} level ${lvl}: ${grp.preset}`).toBe(true);
        for (const t of l.markers.filter((x) => x.kind === "trap")) {
          expect(traps.has(t.label)).toBe(true);
          expect(t.detail).toMatch(/DC \d+/);
          expect(t.detail).toMatch(/at this level: save DC/);
        }
        for (const t of l.markers.filter((x) => x.kind === "treasure")) {
          for (const it of t.data!.items as Array<{ id: string }>) expect(rarities[tier]).toContain(magic.get(it.id)?.rarity);
          expect(t.detail).toMatch(/\d+ gp/);
        }
      }
    }
  });

  it("locked doors cite the SRD's lock; secret doors stay hidden; the keep has a portcullis at the gate", () => {
    const l = run({ siteType: "keep", size: "large", threat: "deadly" }, "doors");
    const locked = l.layout.borders.filter((b) => b.kind === "door" && b.lockedInActs?.length);
    for (const b of locked) expect(b.note).toMatch(/DC 15 Dexterity/);
    const gate = l.layout.borders.find((b) => b.a === l.layout.start || b.b === l.layout.start);
    expect(gate?.kind).toBe("bars");
    let secret = 0;
    for (let i = 0; i < 20; i++) secret += run({ siteType: "crypt", size: "large" }, `secret-${i}`).layout.borders.filter((b) => b.hidden).length;
    expect(secret).toBeGreaterThan(0);
  });

  it("a goblin theme fills the encounters with goblinoids when the tables have them", () => {
    let goblinoid = 0;
    let all = 0;
    for (let i = 0; i < 20; i++) {
      for (const s of run({ siteType: "keep", partyLevel: 3, theme: "goblinoid" }, `gob-${i}`).layout.markers.filter((x) => x.kind === "spawn")) {
        for (const grp of s.data!.groups as Array<{ preset: string }>) {
          all++;
          if (m.presets.find((p) => p.id === grp.preset)?.fields.creatureSubtype === "goblinoid") goblinoid++;
        }
      }
    }
    expect(goblinoid / all).toBeGreaterThan(0.5);
  });
});
