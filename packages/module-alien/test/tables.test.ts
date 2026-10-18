import { describe, expect, it } from "vitest";
import {
  createRng,
  createTableRegistry,
  diceOutcomes,
  rollTable,
  type RollTable,
} from "@campaign-forge/module-sdk";
import { tables, tablesByFamily } from "../src/tables/index";

const registry = createTableRegistry(tables);
const ID_CONVENTION = /^alien\.[a-z0-9-]+(\.[a-z0-9-]+)+$/;
const FAMILIES = ["character", "lifepath", "world", "system", "jobs", "encounters", "shore-leave", "creatures"];

/** Every subset sum of the table's numeric modifiers (each one on or off), as checkModule does. */
function modifierOffsets(table: RollTable): number[] {
  let sums = new Set<number>([0]);
  for (const m of table.modifiers ?? []) {
    if (typeof m.add !== "number") continue;
    const next = new Set<number>(sums);
    for (const s of sums) next.add(s + m.add);
    sums = next;
  }
  return [...sums];
}

function coveringRows(table: RollTable, total: number) {
  return table.rows.filter((r) => total >= r.range[0] && total <= r.range[1]);
}

describe("alien tables: identity", () => {
  it("exports a non-empty flat list across all families", () => {
    expect(tables.length).toBeGreaterThan(80);
    for (const f of FAMILIES) expect(tablesByFamily[f]?.length ?? 0, `family ${f}`).toBeGreaterThan(0);
  });

  it("has unique ids that follow the alien.<family>.<name> convention", () => {
    const seen = new Set<string>();
    for (const t of tables) {
      expect(seen.has(t.id), `duplicate id ${t.id}`).toBe(false);
      seen.add(t.id);
      expect(t.id, `id convention ${t.id}`).toMatch(ID_CONVENTION);
      const family = t.id.split(".")[1];
      expect(t.family, `family of ${t.id}`).toBe(family);
    }
  });

  it("is flagged unverified with a page reference and a name on every table", () => {
    for (const t of tables) {
      expect(t.unverified, t.id).toBe(true);
      expect(t.name, t.id).toBeTruthy();
      expect(t.page, `${t.id} page`).toBeDefined();
      expect(t.rows.length, t.id).toBeGreaterThan(0);
      for (const r of t.rows) expect(r.unverified, `${t.id} row ${r.range.join("-")}`).toBe(true);
    }
  });
});

describe("alien tables: dice coverage", () => {
  it.each(tables.map((t) => [t.id, t] as const))("%s covers every outcome exactly once", (_id, table) => {
    const outcomes = diceOutcomes(table.dice);
    for (const o of outcomes) {
      const rows = coveringRows(table, o);
      expect(rows.length, `${table.id}: total ${o} covered by ${rows.length} rows`).toBe(1);
    }
    // Every modifier combination still lands on a row (open-ended rows absorb them).
    for (const off of modifierOffsets(table)) {
      for (const o of outcomes) {
        expect(coveringRows(table, o + off).length, `${table.id}: total ${o + off} (offset ${off})`).toBe(1);
      }
    }
    // No overlaps anywhere, not only on natural outcomes.
    for (let i = 0; i < table.rows.length; i++) {
      for (let j = i + 1; j < table.rows.length; j++) {
        const a = table.rows[i]!.range;
        const b = table.rows[j]!.range;
        expect(a[0] <= b[1] && b[0] <= a[1], `${table.id}: rows ${i} and ${j} overlap`).toBe(false);
      }
    }
    for (const r of table.rows) expect(r.range[0] <= r.range[1], `${table.id}: inverted range ${r.range.join("-")}`).toBe(true);
  });

  it("uses digit-pair bounds on d66 tables", () => {
    const valid = new Set<number>([-99, 99]);
    for (let t = 1; t <= 6; t++) for (let u = 1; u <= 6; u++) valid.add(t * 10 + u);
    for (const table of tables.filter((t) => t.dice === "d66")) {
      for (const r of table.rows) {
        expect(valid.has(r.range[0]), `${table.id} low bound ${r.range[0]}`).toBe(true);
        expect(valid.has(r.range[1]), `${table.id} high bound ${r.range[1]}`).toBe(true);
      }
    }
  });
});

describe("alien tables: nested rolls", () => {
  it("reference tables that exist and never nest themselves", () => {
    for (const t of tables) {
      for (const r of t.rows) {
        for (const nr of r.roll ?? []) {
          expect(registry.get(nr.table), `${t.id} nests ${nr.table}`).toBeDefined();
          expect(nr.table, `${t.id} self reference`).not.toBe(t.id);
          expect(nr.as).toBeTruthy();
        }
      }
    }
  });

  it("orbital components roll twice on the extra table instead of recursing", () => {
    const orbital = registry.get("alien.world.orbital-components")!;
    const top = orbital.rows.find((r) => r.range[0] === 12)!;
    expect(top.roll).toEqual([{ table: "alien.world.orbital-components-extra", as: "extra", times: 2 }]);
    const extra = registry.get("alien.world.orbital-components-extra")!;
    expect(extra.rows.every((r) => !r.roll)).toBe(true);
  });

  it("colonist Wreckage destination re-rolls on the reroll table", () => {
    const dest = registry.get("alien.jobs.colonists.destination")!;
    const wreck = dest.rows.find((r) => r.label === "Wreckage")!;
    expect(wreck.roll?.[0]?.table).toBe("alien.jobs.colonists.destination-reroll");
    const reroll = registry.get("alien.jobs.colonists.destination-reroll")!;
    expect(reroll.rows.some((r) => r.label === "Wreckage")).toBe(false);
    expect(reroll.rows.every((r) => !r.roll)).toBe(true);
  });
});

describe("alien tables: seed-specified shapes", () => {
  const rowCount = (id: string) => registry.get(id)!.rows.length;
  const dice = (id: string) => registry.get(id)!.dice;

  it("character tables", () => {
    expect(dice("alien.character.stress-response")).toBe("1d6");
    expect(rowCount("alien.character.stress-response")).toBe(8);
    expect(dice("alien.character.panic")).toBe("1d6");
    expect(rowCount("alien.character.panic")).toBe(13);
    const panic = registry.get("alien.character.panic")!;
    expect(panic.rows.map((r) => r.label)).toEqual([
      "Keeping Cool", "Spooked", "Noisy", "Twitchy", "Lose Item", "Paranoid", "Hesitant", "Freeze", "Seek Cover", "Scream", "Flee", "Frenzy", "Catatonic",
    ]);
    for (const r of panic.rows) {
      const res = r.result as Record<string, unknown>;
      expect(typeof res.traumaCheck).toBe("boolean");
      expect(typeof res.effect).toBe("string");
    }
    for (const id of ["alien.character.stress-response", "alien.character.panic"]) {
      expect(registry.get(id)!.modifiers).toEqual([expect.objectContaining({ add: { "-": [{ var: "stress" }, { var: "resolve" }] } })]);
    }
    expect(rowCount("alien.character.mental-trauma")).toBe(6);
    expect(dice("alien.character.critical-injury")).toBe("d66");
    expect(rowCount("alien.character.critical-injury")).toBe(36);
    for (const r of registry.get("alien.character.critical-injury")!.rows) {
      const res = r.result as Record<string, unknown>;
      expect(typeof res.name).toBe("string");
      expect(typeof res.fatal).toBe("boolean");
      expect("timeLimit" in res).toBe(true);
      expect(typeof res.effect).toBe("string");
    }
    expect(registry.get("alien.character.xp-questions")).toBeUndefined();
    expect(dice("alien.character.campaign-theme")).toBe("1d6");
  });

  it("lifepath tables", () => {
    expect(dice("alien.lifepath.human-or-android")).toBe("1d6");
    expect(dice("alien.lifepath.origin")).toBe("2d6");
    const levels = new Set(registry.get("alien.lifepath.origin")!.rows.map((r) => (r.result as Record<string, unknown>).level));
    expect(levels.size).toBe(3);
    expect(dice("alien.lifepath.early-life")).toBe("d66");
    expect(dice("alien.lifepath.life-event")).toBe("d66");
    expect(dice("alien.lifepath.career-entry")).toBe("2d6");
    expect(dice("alien.lifepath.psych-evaluation")).toBe("2d6");
    const careers = ["colonial-marine", "colonial-marshal", "company-agent", "kid", "medic", "officer", "pilot", "roughneck", "scientist"];
    for (const c of careers) {
      expect(dice(`alien.lifepath.posting.${c}`), c).toBe("1d6");
    }
    const careerIds = new Set(registry.get("alien.lifepath.career-entry")!.rows.map((r) => (r.result as Record<string, unknown>).career));
    expect([...careerIds].sort()).toEqual(careers.sort());
    const bonus = registry.get("alien.lifepath.life-event")!.rows.map((r) => (r.result as Record<string, unknown>).bonusRoll).filter(Boolean);
    for (const b of bonus) expect(registry.get(String(b)), `bonusRoll ${b}`).toBeDefined();
  });

  it("world and system tables", () => {
    expect(dice("alien.world.size")).toBe("2d6");
    expect(registry.get("alien.world.size")!.rows.some((r) => (r.result as Record<string, unknown>).gasGiant === true)).toBe(true);
    const atmo = registry.get("alien.world.atmosphere")!;
    expect(atmo.rows.length).toBe(7);
    expect(JSON.stringify(atmo.modifiers)).toContain('"size.diameterKm"');
    expect(JSON.stringify(registry.get("alien.world.temperature")!.modifiers)).toContain('"atmosphere.atmosphere"');
    expect(JSON.stringify(registry.get("alien.world.geosphere")!.modifiers)).toContain('"temperature.temperature"');
    expect(dice("alien.world.terrain")).toBe("d66");
    expect(dice("alien.world.terrain-ice")).toBe("d66");
    for (const r of registry.get("alien.world.colony-size")!.rows) {
      const res = r.result as Record<string, unknown>;
      expect(["start-up", "young", "established"]).toContain(res.colonySize);
      expect(typeof res.population).toBe("string");
      expect(res.missionCount).toBeGreaterThanOrEqual(1);
      expect(res.missionCount).toBeLessThanOrEqual(3);
    }
    expect(dice("alien.world.orbital-components")).toBe("3d6");
    expect(dice("alien.world.faction-count")).toBe("1d3");
    expect(dice("alien.world.campaign-hook")).toBe("d66");
    expect(JSON.stringify(registry.get("alien.system.objects")!.modifiers)).toContain('"brightness"');
    for (const r of registry.get("alien.system.objects")!.rows) {
      const res = r.result as Record<string, unknown>;
      for (const k of ["gasGiants", "terrestrials", "icePlanets", "asteroidBelts"]) expect(typeof res[k], k).toBe("number");
    }
  });

  it("job tables exist per frame with nested employer sub-tables", () => {
    for (const frame of ["truckers", "marines", "colonists"]) {
      for (const part of ["employer", "bonus", "mission", "destination", "complications"]) {
        expect(registry.get(`alien.jobs.${frame}.${part}`), `${frame}.${part}`).toBeDefined();
      }
      const employer = registry.get(`alien.jobs.${frame}.employer`)!;
      expect(employer.dice).toBe("d66");
      for (const r of employer.rows) expect(r.roll?.[0]?.as, `${frame} employer row ${r.label}`).toBe("detail");
    }
    expect(dice("alien.jobs.plot-twist")).toBe("d66");
  });

  it("fills the Expedition sponsors gap (44-66) as a flagged module decision", () => {
    const t = registry.get("alien.jobs.colonists.employer.corporation")!;
    expect(t.dice).toBe("d66");
    const gap = t.rows.filter((r) => r.range[0] >= 44);
    expect(gap.length).toBeGreaterThan(0);
    for (const r of gap) {
      expect(r.unverified).toBe(true);
      expect(r.page).toBe(250);
      expect((r.result as Record<string, unknown>).note).toMatch(/module decision/i);
    }
    expect(t.notes).toMatch(/44-66/);
    const covered = gap.map((r) => r.range);
    expect(covered[0]![0]).toBe(44);
    expect(covered[covered.length - 1]![1]).toBe(66);
  });

  it("encounter and shore leave tables", () => {
    expect(dice("alien.encounters.star-system")).toBe("d66");
    expect(dice("alien.encounters.ship-reactions")).toBe("2d6");
    expect(dice("alien.encounters.surface")).toBe("d66");
    for (const r of registry.get("alien.encounters.surface")!.rows) {
      const res = r.result as Record<string, unknown>;
      expect(typeof res.terrestrial).toBe("string");
      expect(typeof res.ice).toBe("string");
    }
    expect(dice("alien.encounters.colony.general")).toBe("3d6");
    for (const area of ["admin", "residential", "industrial", "medical", "spaceport"]) expect(dice(`alien.encounters.colony.${area}`)).toBe("2d6");
    for (const id of ["alien.encounters.star-system", "alien.encounters.surface"]) {
      expect(JSON.stringify(registry.get(id)!.modifiers)).toContain("timeElapsed");
    }
    expect(dice("alien.shore-leave.marines")).toBe("d66");
    expect(registry.get("alien.shore-leave.marines")!.rows.some((r) => r.roll && r.roll.length > 0)).toBe(true);
    expect(dice("alien.shore-leave.others")).toBe("d66");
  });

  it("creature attack tables carry name, dice, damage, armorPiercing and effect", () => {
    const variants = ["facehugger", "chestburster", "drone", "soldier", "worker", "queen", "neomorph-bloodburster", "neomorph-sprinter", "neomorph-adult"];
    for (const v of variants) {
      const t = registry.get(`alien.creatures.attack.${v}`);
      expect(t, v).toBeDefined();
      expect(t!.dice).toBe("1d6");
      expect(t!.rows.length).toBe(6);
      for (const r of t!.rows) {
        const res = r.result as Record<string, unknown>;
        expect(typeof res.name).toBe("string");
        expect(typeof res.dice).toBe("number");
        expect(["number", "string"]).toContain(typeof res.damage);
        expect(typeof res.armorPiercing).toBe("boolean");
        expect(typeof res.effect).toBe("string");
      }
    }
    expect(dice("alien.creatures.broken-xenomorph")).toBe("1d6");
    const swarm = registry.get("alien.creatures.facehugger-swarm")!;
    expect(swarm.dice).toBe("1d6");
    for (const r of swarm.rows) expect(typeof (r.result as Record<string, unknown>).swarmSize).toBe("number");
  });
});

describe("alien tables: rolling", () => {
  const contexts: Record<string, unknown>[] = [
    {},
    { stress: 5, resolve: 2, brightness: "V", timeElapsed: 3 },
    { size: { diameterKm: 3000 }, atmosphere: { atmosphere: "thin" }, temperature: { temperature: "frozen" }, colonySize: { colonySize: "established" } },
    { size: { diameterKm: 15000 }, atmosphere: { atmosphere: "infiltrating" }, temperature: { temperature: "burning" }, colonySize: { colonySize: "young" }, brightness: "D", stress: 10, resolve: 1 },
  ];

  it.each(tables.map((t) => [t.id, t] as const))("%s rolls without throwing and never clamps on natural outcomes", (_id, table) => {
    for (const [ci, context] of contexts.entries()) {
      for (let s = 0; s < 12; s++) {
        const rec = rollTable(table, createRng(`tables-${table.id}-${ci}-${s}`), registry, { context });
        expect(rec.result).toBeDefined();
        expect(rec.rowLabel ?? "", `${table.id} total ${rec.total}`).not.toMatch(/clamped/);
      }
    }
  });

  it("is deterministic for the same seed", () => {
    for (const table of tables) {
      const a = rollTable(table, createRng(`det-${table.id}`), registry, { context: contexts[1] });
      const b = rollTable(table, createRng(`det-${table.id}`), registry, { context: contexts[1] });
      expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    }
  });
});
