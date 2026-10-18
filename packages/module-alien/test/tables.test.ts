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

  it("has a page reference and a name on every table; unverified flags, where kept, are true", () => {
    for (const t of tables) {
      expect([true, undefined], t.id).toContain(t.unverified);
      expect(t.name, t.id).toBeTruthy();
      expect(t.page, `${t.id} page`).toBeDefined();
      expect(t.rows.length, t.id).toBeGreaterThan(0);
      for (const r of t.rows) expect([true, undefined], `${t.id} row ${r.range.join("-")}`).toContain(r.unverified);
    }
  });

  it("character tables are verified against the book", () => {
    for (const t of tables.filter((x) => x.id.startsWith("alien.character."))) {
      expect(t.unverified, t.id).toBeUndefined();
      for (const r of t.rows) expect(r.unverified, `${t.id} row ${r.range.join("-")}`).toBeUndefined();
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

  it("orbital components roll D6 times on the extra table on 12+ (p. 240) instead of recursing", () => {
    const orbital = registry.get("alien.world.orbital-components")!;
    const top = orbital.rows.find((r) => r.range[0] === 12)!;
    expect(top.roll).toEqual([{ table: "alien.world.orbital-components-extra", as: "extra", times: "1d6" }]);
    expect(orbital.rows.find((r) => r.range[0] === 7)!.roll).toEqual([{ table: "alien.world.moons", as: "moons" }]);
    const extra = registry.get("alien.world.orbital-components-extra")!;
    expect(extra.rows.every((r) => !r.roll || r.roll.every((n) => n.table === "alien.world.moons"))).toBe(true);
    expect(extra.rows.find((r) => r.range[0] === 12)!.gmDecides).toBe(true);
  });

  it("colonist Wreckage destination rolls the ship type and re-rolls the location on the reroll table", () => {
    const dest = registry.get("alien.jobs.colonists.destination")!;
    const wreck = dest.rows.find((r) => r.label === "Wreckage")!;
    expect(wreck.range).toEqual([52, 63]);
    expect(wreck.roll).toEqual([
      { table: "alien.jobs.ship-type", as: "ship" },
      { table: "alien.jobs.colonists.destination-reroll", as: "near" },
    ]);
    const reroll = registry.get("alien.jobs.colonists.destination-reroll")!;
    expect(reroll.rows.some((r) => r.label === "Wreckage")).toBe(false);
    expect(reroll.rows.every((r) => !r.roll)).toBe(true);
    expect(registry.get("alien.jobs.truckers.destination")!.rows.find((r) => r.label === "Starship")!.roll).toEqual([{ table: "alien.jobs.ship-type", as: "ship" }]);
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
    expect(panic.rows[0]!.range).toEqual([-99, 0]);
    expect(panic.rows.at(-1)!.range).toEqual([12, 99]);
    expect(panic.rows.filter((r) => (r.result as { traumaCheck: boolean }).traumaCheck).map((r) => r.range[0])).toEqual([9, 10, 11, 12]);
    const stress = registry.get("alien.character.stress-response")!;
    expect(stress.rows.map((r) => r.label)).toEqual(["Keeping Cool", "Jumpy", "Tunnel Vision", "Aggravated", "Shakes", "Frantic", "Deflated", "Mess Up"]);
    expect(stress.rows.at(-1)!.range).toEqual([7, 99]);
    expect(dice("alien.character.mental-trauma")).toBe("d66");
    expect(rowCount("alien.character.mental-trauma")).toBe(18);
    expect(dice("alien.character.critical-injury")).toBe("d66");
    expect(rowCount("alien.character.critical-injury")).toBe(36);
    for (const r of registry.get("alien.character.critical-injury")!.rows) {
      const res = r.result as Record<string, unknown>;
      expect(typeof res.name).toBe("string");
      expect(typeof res.fatal).toBe("boolean");
      expect("timeLimit" in res).toBe(true);
      expect("healingTime" in res).toBe(true);
      expect(typeof res.effect).toBe("string");
    }
    const crit = registry.get("alien.character.critical-injury")!;
    expect(crit.rows.filter((r) => (r.result as { fatal: boolean }).fatal).map((r) => r.range[0])[0]).toBe(44);
    expect(crit.rows.filter((r) => (r.result as { instantDeath: boolean }).instantDeath).map((r) => r.range[0])).toEqual([64, 65, 66]);
    expect(crit.rows.find((r) => r.range[0] === 43)!.roll).toEqual([{ table: "alien.character.mental-trauma", as: "trauma" }]);
    expect(registry.get("alien.character.xp-questions")).toBeUndefined();
    expect(dice("alien.character.campaign-theme")).toBe("1d6");
    expect(registry.get("alien.character.campaign-theme")!.rows.map((r) => r.label)).toEqual([
      "Killing Greed", "Corporate Intrigue", "Tidings of War", "New Opportunities", "Secret Research", "Echoes from the Past",
    ]);
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

  it("world, system and job tables are verified against the book (except the sponsor gap rows)", () => {
    for (const t of tables.filter((x) => /^alien\.(world|system|jobs)\./.test(x.id))) {
      expect(t.unverified, t.id).toBeUndefined();
      const flagged = t.rows.filter((r) => r.unverified);
      if (t.id === "alien.jobs.colonists.employer.corporation") expect(flagged.map((r) => r.range[0])).toEqual([44, 51, 54]);
      else expect(flagged, t.id).toEqual([]);
    }
  });

  it("world and system tables (p. 236-243)", () => {
    const labels = (id: string) => registry.get(id)!.rows.map((r) => r.label);
    const ranges = (id: string) => registry.get(id)!.rows.map((r) => r.range);
    const mods = (id: string) => (registry.get(id)!.modifiers ?? []).map((m) => m.add);
    expect(dice("alien.world.size")).toBe("2d6");
    expect(ranges("alien.world.size")).toEqual([[-99, 2], [3, 4], [5, 6], [7, 7], [8, 8], [9, 10], [11, 11], [12, 99]]);
    expect(registry.get("alien.world.size")!.rows.map((r) => (r.result as Record<string, unknown>).diameterKm)).toEqual([1000, 2000, 4000, 7000, 10000, 12500, 15000, 20000]);
    expect(mods("alien.world.size")).toEqual([-2, -4]);
    const atmo = registry.get("alien.world.atmosphere")!;
    expect(labels("alien.world.atmosphere")).toEqual(["Thin", "Breathable", "Toxic", "Dense", "Corrosive", "Infiltrating", "Special"]);
    expect(ranges("alien.world.atmosphere")).toEqual([[-99, 3], [4, 6], [7, 8], [9, 9], [10, 10], [11, 11], [12, 99]]);
    // As printed on p. 238: 4,000 km or less −2, 4,001-7,000 km −4.
    expect(atmo.modifiers!.map((m) => [m.label, m.add])).toEqual([["diameter 4,000 km or less", -2], ["diameter 4,001 to 7,000 km", -4]]);
    expect(JSON.stringify(atmo.modifiers)).toContain('"size.diameterKm"');
    expect(ranges("alien.world.temperature")).toEqual([[-99, 3], [4, 5], [6, 7], [8, 10], [11, 99]]);
    expect(mods("alien.world.temperature")).toEqual([-4, -1, 6, -20]);
    expect(JSON.stringify(registry.get("alien.world.temperature")!.modifiers)).toContain('"atmosphere.atmosphere"');
    expect(ranges("alien.world.geosphere")).toEqual([[-99, 4], [5, 6], [7, 8], [9, 10], [11, 11], [12, 99]]);
    expect(mods("alien.world.geosphere")).toEqual([-4, -2, -4, -2]);
    expect(JSON.stringify(registry.get("alien.world.geosphere")!.modifiers)).toContain('"temperature.temperature"');
    expect(dice("alien.world.terrain")).toBe("d66");
    expect(rowCount("alien.world.terrain")).toBe(36);
    expect(dice("alien.world.terrain-ice")).toBe("2d6");
    expect(rowCount("alien.world.terrain-ice")).toBe(11);
    expect(ranges("alien.world.colony-size")).toEqual([[-99, 7], [8, 10], [11, 99]]);
    expect(mods("alien.world.colony-size")).toEqual([1, -2, -3]);
    expect(registry.get("alien.world.colony-size")!.rows.map((r) => (r.result as Record<string, unknown>).missionsDice)).toEqual(["1", "d3-1", "d3"]);
    expect(rowCount("alien.world.colony-mission")).toBe(11);
    expect(mods("alien.world.colony-mission")).toEqual([1, -1, 1, 4]);
    expect(dice("alien.world.orbital-components")).toBe("2d6");
    expect(mods("alien.world.orbital-components")).toEqual([1, 2]);
    expect(dice("alien.world.moons-uninhabited")).toBe("1d3-1");
    expect(dice("alien.world.faction-count")).toBe("1d3");
    expect(labels("alien.world.faction-type")).toEqual(["Newcomers", "Corporate representatives", "Scientists", "Workers", "Security/military", "Colonial leadership"]);
    expect(dice("alien.world.allegiance-icsc")).toBe("3d6");
    expect(dice("alien.world.allegiance-arms")).toBe("3d6");
    expect(dice("alien.world.campaign-hook")).toBe("d66");
    expect(rowCount("alien.world.campaign-hook")).toBe(36);
    const system: Array<[string, string, number[]]> = [
      ["alien.system.gas-giants", "1d6-1", [-1, -4]],
      ["alien.system.terrestrial-planets", "1d6", [-3, -3]],
      ["alien.system.ice-planets", "1d6+1", [-1, -1, -1]],
      ["alien.system.asteroid-belts", "1d6-3", [-2, -2]],
    ];
    for (const [id, d, m] of system) {
      expect(dice(id), id).toBe(d);
      expect(mods(id), id).toEqual(m);
      expect(JSON.stringify(registry.get(id)!.modifiers)).toContain('"starType"');
      for (const r of registry.get(id)!.rows) expect(typeof (r.result as Record<string, unknown>).count).toBe("number");
    }
    expect(labels("alien.system.gas-giant-features")).toEqual(["Storms", "Single super storm", "Rings", "High winds", "Intense radiation fields", "Small gas giant"]);
  });

  it("job tables exist per frame with nested employer sub-tables (p. 244-252)", () => {
    for (const frame of ["truckers", "marines", "colonists"]) {
      for (const part of ["bonus", "mission", "destination", "complications"]) {
        expect(registry.get(`alien.jobs.${frame}.${part}`), `${frame}.${part}`).toBeDefined();
      }
    }
    // Colonial Marines have no employer table (p. 235).
    expect(registry.get("alien.jobs.marines.employer")).toBeUndefined();
    for (const frame of ["truckers", "colonists"]) {
      const employer = registry.get(`alien.jobs.${frame}.employer`)!;
      expect(employer.dice).toBe("d66");
      for (const r of employer.rows) for (const n of r.roll ?? []) expect(n.as, `${frame} employer row ${r.label}`).toBe("detail");
    }
    const nestedOf = (id: string) => registry.get(id)!.rows.filter((r) => r.roll).map((r) => [r.range, r.roll![0]!.table]);
    expect(nestedOf("alien.jobs.truckers.employer")).toEqual([
      [[25, 36], "alien.jobs.truckers.employer.mining"],
      [[61, 66], "alien.jobs.truckers.employer.corporation"],
    ]);
    expect(nestedOf("alien.jobs.colonists.employer")).toEqual([
      [[41, 46], "alien.jobs.colonists.employer.corporation"],
      [[51, 56], "alien.jobs.colonists.employer.mining"],
      [[61, 66], "alien.jobs.colonists.employer.government"],
    ]);
    expect(dice("alien.jobs.truckers.bonus")).toBe("d66");
    expect(dice("alien.jobs.marines.bonus")).toBe("1d6");
    expect(dice("alien.jobs.colonists.bonus")).toBe("1d6");
    const counts: Record<string, number> = {
      "alien.jobs.truckers.mission": 22,
      "alien.jobs.truckers.destination": 11,
      "alien.jobs.truckers.complications": 8,
      "alien.jobs.marines.mission": 14,
      "alien.jobs.marines.destination": 12,
      "alien.jobs.marines.complications": 14,
      "alien.jobs.colonists.mission": 9,
      "alien.jobs.colonists.destination": 11,
      "alien.jobs.colonists.complications": 7,
      "alien.jobs.plot-twist": 9,
    };
    for (const [id, n] of Object.entries(counts)) {
      expect(dice(id), id).toBe("d66");
      expect(rowCount(id), id).toBe(n);
    }
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

  it("encounter and shore leave tables match the book (p. 252-258)", () => {
    const rowFor = (id: string, total: number) => registry.get(id)!.rows.find((r) => total >= r.range[0] && total <= r.range[1])!;
    const encounterAndShore = tables.filter((t) => t.family === "encounters" || t.family === "shore-leave");
    for (const t of encounterAndShore) {
      expect(t.unverified, t.id).toBeUndefined();
      for (const r of t.rows) expect(r.unverified, `${t.id} ${r.range.join("-")}`).toBeUndefined();
    }
    // Star system: D66 with -3 / -5 on the tens digit; 0 or less is no encounter; vessels nest a ship reaction.
    const star = registry.get("alien.encounters.star-system")!;
    expect(star.dice).toBe("d66");
    expect(star.page).toBe(254);
    expect(star.modifiers!.map((m) => m.add)).toEqual([-30, -50]);
    expect(star.rows.length).toBe(37);
    expect(rowFor("alien.encounters.star-system", 10).label).toBe("No encounter");
    expect(rowFor("alien.encounters.star-system", 11).label).toBe("Research vessel");
    expect(rowFor("alien.encounters.star-system", 66).label).toBe("Mobile construction rig");
    expect(rowFor("alien.encounters.star-system", 41).roll?.[0]?.table).toBe("alien.encounters.ship-reactions");
    expect(rowFor("alien.encounters.star-system", 46).roll).toBeUndefined();
    expect(dice("alien.encounters.ship-reactions")).toBe("2d6");
    expect(registry.get("alien.encounters.ship-reactions")!.rows.map((r) => r.range)).toEqual([[2, 2], [3, 4], [5, 8], [9, 10], [11, 11], [12, 12]]);
    // Surface: 3D6, uninhabited and colonized columns.
    expect(dice("alien.encounters.surface")).toBe("3d6");
    for (const r of registry.get("alien.encounters.surface")!.rows) {
      const res = r.result as Record<string, unknown>;
      expect(typeof res.uninhabited).toBe("string");
      expect(typeof res.colonized).toBe("string");
    }
    expect((rowFor("alien.encounters.surface", 17).result as Record<string, unknown>).colonized).toBe("Explorers");
    // General colony: D66 to 76, +1 tens digit when established.
    const general = registry.get("alien.encounters.colony.general")!;
    expect(general.dice).toBe("d66");
    expect(general.rows.length).toBe(42);
    expect(general.modifiers!.map((m) => m.add)).toEqual([10]);
    expect(rowFor("alien.encounters.colony.general", 76).label).toBe("Colonists on strike or protesting");
    for (const area of ["public", "habitation", "operations", "spaceport", "industrial"]) expect(dice(`alien.encounters.colony.${area}`)).toBe("d66");
    expect(registry.get("alien.encounters.colony.operations")!.rows.length).toBe(13);
    // Shore leave: twelve D66 events per table; three Marines rows nest a D6.
    expect(dice("alien.shore-leave.marines")).toBe("d66");
    expect(dice("alien.shore-leave.others")).toBe("d66");
    expect(registry.get("alien.shore-leave.marines")!.rows.length).toBe(12);
    expect(registry.get("alien.shore-leave.others")!.rows.length).toBe(12);
    expect(registry.get("alien.shore-leave.marines")!.rows.filter((r) => r.roll && r.roll.length > 0).map((r) => r.range)).toEqual([[24, 26], [41, 44], [45, 46]]);
  });

  it("creature attack tables carry name, dice, damage, armorPiercing and effect", () => {
    // One table per book table (p. 213-231); shared tables keep the id of their first creature.
    const rowCounts: Record<string, number> = {
      facehugger: 4,
      chestburster: 4,
      drone: 6,
      soldier: 6,
      queen: 6,
      "neomorph-bloodburster": 4,
      "neomorph-adult": 6,
      harvester: 6,
      "lion-worm": 6,
      "tanakan-scorpionid": 6,
      swarm: 6,
    };
    for (const [v, count] of Object.entries(rowCounts)) {
      const t = registry.get(`alien.creatures.attack.${v}`);
      expect(t, v).toBeDefined();
      expect(t!.dice).toBe("1d6");
      expect(t!.rows.length, v).toBe(count);
      expect(t!.unverified, v).toBeUndefined();
      for (const r of t!.rows) {
        const res = r.result as Record<string, unknown>;
        expect(typeof res.name).toBe("string");
        expect(typeof res.dice).toBe("number");
        expect(["number", "string"]).toContain(typeof res.damage);
        expect(typeof res.armorPiercing).toBe("boolean");
        expect(typeof res.effect).toBe("string");
      }
    }
    const headbite = registry.get("alien.creatures.attack.drone")!.rows[5]!.result as Record<string, unknown>;
    expect([headbite.name, headbite.dice, headbite.damage, headbite.armorPiercing]).toEqual(["Headbite", 9, 2, true]);
    expect(registry.get("alien.creatures.attack.facehugger")!.rows.map((r) => r.range)).toEqual([[1, 2], [3, 4], [5, 5], [6, 99]]);
    const broken = registry.get("alien.creatures.broken-xenomorph")!;
    expect(broken.dice).toBe("1d6");
    expect(broken.page).toBe(208);
    expect(broken.rows.map((r) => r.label)).toEqual(["Rise Again", "Wounded", "Desperate Escape", "Last Breath", "Torn Apart"]);
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
