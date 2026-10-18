import { describe, expect, it } from "vitest";
import {
  createTableRegistry,
  runProcedure,
  type Effect,
  type ModuleManifest,
  type Procedure,
  type ProcedureContext,
  type ProcedureRunOptions,
} from "@campaign-forge/module-sdk";
import { procedures } from "../src/procedures/index";
import { tables } from "../src/tables/index";

const registry = createTableRegistry(tables);
const manifest = { id: "alien", version: "0.0.0-test" } as ModuleManifest;
const mod = { tables, manifest };
const SEEDS = Array.from({ length: 50 }, (_, i) => `seed-${i}`);

const byId = (id: string): Procedure => {
  const p = procedures.find((x) => x.id === id);
  if (!p) throw new Error(`missing procedure ${id}`);
  return p;
};

function run(id: string, options: Omit<ProcedureRunOptions, "seed"> & { seed: string }) {
  const proc = byId(id);
  const includeOptional = options.includeOptional ?? proc.steps.filter((s) => s.optional).map((s) => s.id);
  return runProcedure(proc, mod, { ...options, includeOptional });
}

/** A context stub for exercising table-choosing functions statically. */
function fakeCtx(inputs: Record<string, unknown>, results: Record<string, unknown> = {}): ProcedureContext {
  return {
    inputs,
    results,
    rolls: [],
    tables: registry,
    get: <T,>(id: string) => results[id] as T | undefined,
    data: () => ({ ...inputs, ...results }),
  };
}

const EXPECTED_IDS = ["alien.world.create", "alien.system.create", "alien.job.create", "alien.lifepath", "alien.encounter.check", "alien.shore-leave"];

describe("alien procedures: static shape", () => {
  it("exports exactly the procedures from the field doc", () => {
    expect(procedures.map((p) => p.id).sort()).toEqual([...EXPECTED_IDS].sort());
    const ids = new Set<string>();
    for (const p of procedures) {
      expect(ids.has(p.id)).toBe(false);
      ids.add(p.id);
      expect(p.name).toBeTruthy();
      expect(p.page).toBeDefined();
      expect(p.steps.length).toBeGreaterThan(0);
    }
  });

  it("has unique step ids, existing string table ids and reads of earlier steps", () => {
    for (const p of procedures) {
      const seen: string[] = [];
      for (const s of p.steps) {
        expect(seen.includes(s.id), `${p.id} duplicate step ${s.id}`).toBe(false);
        expect(s.table !== undefined || s.compute !== undefined, `${p.id}/${s.id} has neither table nor compute`).toBe(true);
        if (typeof s.table === "string") expect(registry.get(s.table), `${p.id}/${s.id} table ${s.table}`).toBeDefined();
        for (const r of s.reads ?? []) expect(seen.includes(r), `${p.id}/${s.id} reads ${r} which is not earlier`).toBe(true);
        seen.push(s.id);
      }
    }
  });

  it("chains only into existing procedures", () => {
    const ids = new Set(procedures.map((p) => p.id));
    for (const p of procedures) for (const c of p.chains ?? []) expect(ids.has(c.procedure), `${p.id} chains ${c.procedure}`).toBe(true);
  });

  it("resolves every function-chosen table id to an existing table", () => {
    const world = byId("alien.world.create");
    const terrain = world.steps.find((s) => s.id === "terrain")!.table as (ctx: ProcedureContext) => string;
    for (const planetType of ["terrestrial", "ice", "nonsense", undefined]) {
      expect(registry.get(terrain(fakeCtx({ planetType }, { temperature: { temperature: "frozen" } })))).toBeDefined();
      expect(registry.get(terrain(fakeCtx({ planetType }, { temperature: { temperature: "hot" } })))).toBeDefined();
    }
    expect(terrain(fakeCtx({ planetType: "ice" }))).toBe("alien.world.terrain-ice");
    expect(terrain(fakeCtx({}, { temperature: { temperature: "frozen" } }))).toBe("alien.world.terrain");
    const allegiance = world.steps.find((s) => s.id === "allegiance")!.table as (ctx: ProcedureContext) => string;
    for (const bloc of ["american-arm", "anglo-japanese-arm", "icsc", "upp", "nonsense", undefined]) expect(registry.get(allegiance(fakeCtx({ allegianceBloc: bloc })))).toBeDefined();
    expect(allegiance(fakeCtx({ allegianceBloc: "icsc" }))).toBe("alien.world.allegiance-icsc");
    expect(allegiance(fakeCtx({ allegianceBloc: "anglo-japanese-arm" }))).toBe("alien.world.allegiance-arms");

    const job = byId("alien.job.create");
    for (const frame of ["space-truckers", "colonial-marines", "frontier-colonists", "nonsense", undefined]) {
      for (const s of job.steps) {
        if (typeof s.table === "function") expect(registry.get(s.table(fakeCtx({ frame }))), `${s.id} for ${frame}`).toBeDefined();
      }
    }

    const life = byId("alien.lifepath");
    expect(life.steps.every((s) => typeof s.table !== "function")).toBe(true);
    for (const career of ["colonial-marine", "colonial-marshal", "company-agent", "kid", "medic", "officer", "pilot", "roughneck", "scientist"]) {
      expect(registry.get(`alien.lifepath.posting.${career}`)).toBeDefined();
      expect(registry.get(`alien.lifepath.career-skill.${career}`)).toBeDefined();
    }

    const enc = byId("alien.encounter.check");
    const encTable = enc.steps[0]!.table as (ctx: ProcedureContext) => string;
    const wheres = (enc.inputs as { properties: { where: { enum: string[] } } }).properties.where.enum;
    expect(wheres.length).toBe(10);
    for (const where of [...wheres, "bogus", undefined]) expect(registry.get(encTable(fakeCtx({ where })))).toBeDefined();
  });
});

const INPUT_VARIANTS: Record<string, Array<Record<string, unknown>>> = {
  "alien.world.create": [
    {},
    { region: "core", allegianceBloc: "icsc", inhabited: true, planetType: "ice" },
    { allegianceBloc: "upp", inhabited: false },
    { planetType: "ice", inhabited: false, gasGiantMoon: true, allegianceBloc: "anglo-japanese-arm" },
  ],
  "alien.system.create": [{}, { starClass: "M", brightness: "D", region: "far-reach", allegiance: "icsc" }, { brightness: "IV" }, { starClass: "A", brightness: "V" }, { brightness: "III" }],
  "alien.job.create": [
    {},
    { frame: "colonial-marines", pcCount: 6, marineCorps: "royal-marines-commandos", bonusRolls: 2 },
    { frame: "frontier-colonists", pcCount: 2, paymentRaises: 1, bonusRolls: 3 },
  ],
  "alien.lifepath": [{}, { name: "Ripley" }, { career: "colonial-marine", terms: 3 }, { career: "kid", terms: 3 }],
  "alien.encounter.check": [
    {},
    { where: "surface-colonized" },
    { where: "ship-reaction" },
    { where: "colony-general", colonySize: "established" },
    { where: "star-system", region: "frontier" },
    { where: "colony-operations" },
  ],
  "alien.shore-leave": [
    {},
    {
      characters: [
        { id: "a", name: "Hicks", choice: "socialize", isMarine: true },
        { id: "b", name: "Hudson", choice: "socialize", isMarine: true },
        { id: "c", name: "Ripley", choice: "socialize", isMarine: false },
        { id: "d", name: "Bishop", choice: "heal", isMarine: false },
        { id: "e", name: "Newt", choice: "recover", isMarine: false },
        { id: "f", name: "Burke", choice: "pursue-agenda", isMarine: false },
      ],
    },
  ],
};

describe("alien procedures: seeded runs", () => {
  for (const p of procedures) {
    const variants = INPUT_VARIANTS[p.id] ?? [{}];
    it(`${p.id} terminates on 50 seeds for ${variants.length} input variants and is deterministic`, () => {
      const outputs = new Set<string>();
      for (const [vi, inputs] of variants.entries()) {
        for (const seed of SEEDS) {
          const a = run(p.id, { seed: `${vi}-${seed}`, inputs });
          const b = run(p.id, { seed: `${vi}-${seed}`, inputs });
          const json = JSON.stringify(a);
          expect(json).toBe(JSON.stringify(b));
          outputs.add(json);
          expect(a.procedure).toBe(p.id);
          expect(Array.isArray(a.produced.entities)).toBe(true);
          const tempIds = new Set<string>();
          for (const e of a.produced.entities) {
            expect(tempIds.has(e.tempId), `${p.id} duplicate tempId ${e.tempId}`).toBe(false);
            tempIds.add(e.tempId);
            expect(e.type).toMatch(/^alien\./);
            expect(e.name).toBeTruthy();
            if (e.within) expect(tempIds.has(e.within), `${p.id} within ${e.within}`).toBe(true);
          }
          for (const r of a.produced.relationships) {
            expect(tempIds.has(r.from)).toBe(true);
            expect(tempIds.has(r.to)).toBe(true);
          }
          for (const roll of a.rolls) expect(registry.get(roll.table ?? ""), `${p.id} rolled unknown table ${roll.table}`).toBeDefined();
          for (const c of p.chains ?? []) expect(() => c.inputs?.(fakeCtx(a.inputs, a.results))).not.toThrow();
        }
      }
      // Rolls are actually random across seeds.
      if (p.id !== "alien.shore-leave") expect(outputs.size).toBeGreaterThan(10);
    });
  }

  it("re-seeding one step leaves the others untouched", () => {
    const base = run("alien.world.create", { seed: "pin", inputs: { inhabited: true } });
    const reseeded = run("alien.world.create", { seed: "pin", inputs: { inhabited: true }, stepSeeds: { hook: "other" } });
    expect(reseeded.results.size).toEqual(base.results.size);
    expect(reseeded.results.atmosphere).toEqual(base.results.atmosphere);
    expect(reseeded.results.factions).toEqual(base.results.factions);
  });
});

describe("alien.world.create", () => {
  it("follows the book's step order (p. 237-242)", () => {
    expect(byId("alien.world.create").steps.map((s) => s.id)).toEqual([
      "designation", "size", "atmosphere", "temperature", "geosphere", "terrain",
      "colonySize", "population", "missionCount", "missions", "factionCount", "factions", "orbital", "moons", "allegiance", "hook",
    ]);
  });

  it("produces a planet, a colony within it and stationed factions when inhabited", () => {
    const g = run("alien.world.create", { seed: "w1", inputs: { inhabited: true, region: "outer-rim" } });
    const planet = g.produced.entities.find((e) => e.tempId === "planet")!;
    expect(planet.type).toBe("alien.location");
    expect(planet.fields.subtype).toBe("planet");
    expect(planet.fields.inhabited).toBe(true);
    expect(planet.fields.region).toBe("outer-rim");
    expect(typeof planet.fields.diameterKm).toBe("number");
    expect(Array.isArray(planet.fields.orbitalComponents)).toBe(true);
    const colony = g.produced.entities.find((e) => e.tempId === "colony")!;
    expect(colony.fields.subtype).toBe("colony");
    expect(colony.within).toBe("planet");
    expect(["start-up", "young", "established"]).toContain(colony.fields.colonySize);
    expect(typeof colony.fields.population).toBe("number");
    expect(colony.fields.population).toBe(g.results.population);
    const missions = colony.fields.missions as string[];
    expect(missions.length).toBe(g.results.missionCount);
    const factions = g.produced.entities.filter((e) => e.type === "alien.faction");
    const count = (g.results.factionCount as { count: number }).count;
    expect(factions.length).toBe(count);
    expect(g.produced.relationships.filter((r) => r.type === "stationed_at" && r.to === "colony").length).toBe(count);
    expect((colony.fields.factions as unknown[]).length).toBe(count);
    expect(g.skipped.map((s) => s.step)).not.toContain("colonySize");
    expect(g.skipped.map((s) => s.step)).toContain("moons");
  });

  it("rolls population and mission count from the colony size row (p. 240)", () => {
    for (const seed of SEEDS) {
      const g = run("alien.world.create", { seed });
      const size = (g.results.colonySize as { colonySize: string }).colonySize;
      const pop = g.results.population as number;
      const missions = g.results.missionCount as number;
      if (size === "start-up") {
        expect(pop % 10).toBe(0);
        expect(pop).toBeGreaterThanOrEqual(30);
        expect(pop).toBeLessThanOrEqual(180);
        expect(missions).toBe(1);
      } else if (size === "young") {
        expect(pop).toBeGreaterThanOrEqual(300);
        expect(pop).toBeLessThanOrEqual(1800);
        expect(missions).toBeGreaterThanOrEqual(0);
        expect(missions).toBeLessThanOrEqual(2);
      } else {
        expect(pop).toBeGreaterThanOrEqual(2000);
        expect(pop).toBeLessThanOrEqual(12000);
        expect(missions).toBeGreaterThanOrEqual(1);
        expect(missions).toBeLessThanOrEqual(3);
      }
      expect((g.results.missions as unknown[]).length).toBe(missions);
    }
  });

  it("skips colony steps when uninhabited, rolls D3-1 moons, and honours the upp bloc", () => {
    const g = run("alien.world.create", { seed: "w2", inputs: { inhabited: false, allegianceBloc: "upp" } });
    expect(g.produced.entities.map((e) => e.tempId)).toEqual(["planet"]);
    const skipped = g.skipped.map((s) => s.step);
    for (const s of ["colonySize", "population", "missionCount", "missions", "factionCount", "factions", "orbital", "allegiance", "hook"]) expect(skipped).toContain(s);
    expect(g.rolls.find((r) => r.step === "moons")!.table).toBe("alien.world.moons-uninhabited");
    expect(g.produced.entities[0]!.fields.affiliation).toBeUndefined();
    expect(String(g.produced.entities[0]!.name)).toMatch(/^LV-\d{3}$/);
    const inhabitedUpp = run("alien.world.create", { seed: "w3", inputs: { inhabited: true, allegianceBloc: "upp" } });
    expect(inhabitedUpp.produced.entities.find((e) => e.tempId === "colony")!.fields.allegiance).toBe("upp");
    expect(inhabitedUpp.skipped.map((s) => s.step)).toContain("allegiance");
  });

  it("treats a main world as colonized by default and maps the allegiance roll", () => {
    for (const seed of SEEDS.slice(0, 10)) {
      const g = run("alien.world.create", { seed, inputs: { allegianceBloc: "icsc" } });
      expect(g.produced.entities[0]!.fields.inhabited).toBe(true);
      const roll = g.rolls.find((r) => r.step === "allegiance")!;
      expect(roll.table).toBe("alien.world.allegiance-icsc");
      const colony = g.produced.entities.find((e) => e.tempId === "colony")!;
      expect(["icsc", "independent"]).toContain(colony.fields.allegiance);
    }
  });

  it("ice planets are frozen with -2 size and use the ice terrain table; gas giant moons get -4 size (p. 237, 243)", () => {
    for (const seed of SEEDS.slice(0, 20)) {
      const ice = run("alien.world.create", { seed, inputs: { planetType: "ice", inhabited: false } });
      expect(ice.rolls.find((r) => r.step === "terrain")!.table).toBe("alien.world.terrain-ice");
      expect((ice.results.temperature as { temperature: string }).temperature).toBe("frozen");
      expect(ice.rolls.find((r) => r.step === "size")!.modifier).toBe(-2);
      const moon = run("alien.world.create", { seed, inputs: { gasGiantMoon: true, inhabited: false } });
      expect(moon.rolls.find((r) => r.step === "size")!.modifier).toBe(-4);
      expect(moon.rolls.find((r) => r.step === "terrain")!.table).toBe("alien.world.terrain");
    }
  });

  it("applies the printed atmosphere modifiers by diameter (p. 238)", () => {
    const mod = (diameterKm: number) => run("alien.world.create", { seed: "atmo", pinned: { size: { diameterKm } } }).rolls.find((r) => r.step === "atmosphere")!.modifier;
    expect(mod(2000)).toBe(-2);
    expect(mod(4000)).toBe(-2);
    expect(mod(7000)).toBe(-4);
    expect(mod(10000)).toBe(0);
  });

  it("a pinned airless world is a desert world", () => {
    const g = run("alien.world.create", { seed: "airless", pinned: { atmosphere: { atmosphere: "none" } } });
    expect((g.results.geosphere as { geosphere: string }).geosphere).toBe("desert");
  });
});

describe("alien.system.create", () => {
  it("produces a star system with bodies, stub planets within it and per-body chains", () => {
    const g = run("alien.system.create", { seed: "s1", inputs: { starClass: "K", brightness: "V", region: "frontier" } });
    const system = g.produced.entities.find((e) => e.tempId === "system")!;
    expect(system.fields.subtype).toBe("star-system");
    expect(system.fields.starClass).toBe("K");
    expect(g.results.starType).toBe("main-sequence");
    const bodies = system.fields.bodies as Array<{ type: string; name: string; moons?: number }>;
    const n = (step: string) => (g.results[step] as { count: number }).count;
    expect(bodies.length).toBe(n("gasGiants") + n("terrestrialPlanets") + n("icePlanets") + n("asteroidBelts"));
    for (const b of bodies.filter((x) => x.type === "gas-giant")) {
      expect(b.moons).toBeGreaterThanOrEqual(5);
      expect(b.moons).toBeLessThanOrEqual(10);
    }
    const planets = g.produced.entities.filter((e) => e.tempId.startsWith("body-"));
    expect(planets.length).toBe(n("terrestrialPlanets") + n("icePlanets"));
    for (const p of planets) {
      expect(p.within).toBe("system");
      expect(["terrestrial", "ice"]).toContain(p.fields.planetType);
    }
    const proc = byId("alien.system.create");
    expect(proc.chains!.length).toBe(13);
    const chainInputs = proc.chains!.map((c) => c.inputs!(fakeCtx(g.inputs, g.results)));
    expect(chainInputs[0]!.planetType).toBe(planets[0]?.fields.planetType ?? "terrestrial");
    expect(chainInputs.every((c) => c.region === "frontier" && c.inhabited === false)).toBe(true);
    expect(chainInputs.filter((c) => c.name !== undefined).length).toBe(planets.length);
  });

  it("derives the star type and applies its modifiers (p. 236, 243)", () => {
    const cases: Array<[string, string, string, Record<string, number>]> = [
      ["G", "III", "giant", { gasGiants: 0, terrestrialPlanets: 0, icePlanets: -1, asteroidBelts: 0 }],
      ["G", "IV", "subgiant", { gasGiants: -1, terrestrialPlanets: 0, icePlanets: -1, asteroidBelts: -2 }],
      ["M", "V", "red-dwarf", { gasGiants: 0, terrestrialPlanets: -3, icePlanets: 0, asteroidBelts: 0 }],
      ["A", "V", "white-main-sequence", { gasGiants: 0, terrestrialPlanets: 0, icePlanets: -1, asteroidBelts: 0 }],
      ["A", "D", "white-dwarf", { gasGiants: -4, terrestrialPlanets: -3, icePlanets: 0, asteroidBelts: -2 }],
      ["K", "V", "main-sequence", { gasGiants: 0, terrestrialPlanets: 0, icePlanets: 0, asteroidBelts: 0 }],
    ];
    for (const [starClass, brightness, type, mods] of cases) {
      const g = run("alien.system.create", { seed: `star-${type}`, inputs: { starClass, brightness } });
      expect(g.results.starType, type).toBe(type);
      for (const [step, m] of Object.entries(mods)) expect(g.rolls.find((r) => r.step === step)!.modifier, `${type} ${step}`).toBe(m);
    }
  });
});

describe("alien.job.create", () => {
  it("builds the preamble and produces a job with its employer faction", () => {
    for (const frame of ["space-truckers", "colonial-marines", "frontier-colonists"]) {
      const g = run("alien.job.create", { seed: `job-${frame}`, inputs: { frame, pcCount: 3 } });
      const distance = g.results.distance as number;
      const difficulty = g.results.difficulty as number;
      expect(distance).toBeGreaterThanOrEqual(0);
      expect(distance).toBeLessThanOrEqual(5);
      expect(difficulty).toBeGreaterThanOrEqual(1);
      expect(difficulty).toBeLessThanOrEqual(3);
      expect(g.results.payment).toBe((distance + difficulty) * 3 * 1000);
      const job = g.produced.entities.find((e) => e.type === "alien.job")!;
      expect(job.fields.frame).toBe(frame);
      expect((job.fields.complications as string[]).length).toBe(difficulty);
      expect(typeof job.fields.employer).toBe("string");
      expect(job.fields.employer).not.toBe("");
      expect(typeof job.fields.destination).toBe("string");
      expect(typeof job.fields.plotTwist).toBe("string");
      expect(job.fields.status).toBe("offered");
      expect(job.fields.bonusRewards).toEqual([]);
      if (frame === "space-truckers") expect(typeof job.fields.cargo).toBe("string");
      else expect(typeof job.fields.mission).toBe("string");
      const faction = g.produced.entities.find((e) => e.type === "alien.faction")!;
      expect(faction.name).toBe(job.fields.employer);
      const rel = g.produced.relationships[0]!;
      expect(rel.type).toBe(frame === "frontier-colonists" ? "sponsor_of" : "employer_of");
      expect(rel.from).toBe(faction.tempId);
      expect(rel.to).toBe(job.tempId);
      if (frame === "colonial-marines") {
        expect(g.skipped.map((s) => s.step)).toContain("employer");
        expect(job.fields.employer).toBe("USCMC");
      } else {
        expect(g.rolls.find((r) => r.step === "employer")).toBeDefined();
      }
      const chain = byId("alien.job.create").chains![0]!;
      expect(chain.procedure).toBe("alien.system.create");
      const ci = chain.inputs!(fakeCtx(g.inputs, g.results));
      expect(typeof ci.starClass).toBe("string");
      expect(["III", "IV", "V", "D"]).toContain(ci.brightness);
    }
  });

  it("negotiation: +20% payment per raise and one bonus roll per success spent (p. 244)", () => {
    const g = run("alien.job.create", { seed: "haggle", inputs: { frame: "space-truckers", pcCount: 4, paymentRaises: 2, bonusRolls: 3 } });
    const base = ((g.results.distance as number) + (g.results.difficulty as number)) * 4 * 1000;
    expect(g.results.payment).toBe(Math.round(base * 1.4));
    expect(g.rolls.filter((r) => r.step === "bonus").length).toBe(3);
    expect(g.rolls.find((r) => r.step === "bonus")!.table).toBe("alien.jobs.truckers.bonus");
    const job = g.produced.entities.find((e) => e.type === "alien.job")!;
    expect((job.fields.bonusRewards as string[]).length).toBe(3);
  });

  it("names the employer from the nested sub-table when there is one", () => {
    let nested = 0;
    for (const seed of SEEDS) {
      const g = run("alien.job.create", { seed, inputs: { frame: "frontier-colonists" } });
      const e = g.results.employer as { detail?: { name: string }; name: string };
      const job = g.produced.entities.find((x) => x.type === "alien.job")!;
      if (e.detail) {
        nested++;
        expect(job.fields.employer).toBe(e.detail.name);
      } else expect(job.fields.employer).toBe(e.name);
    }
    expect(nested).toBeGreaterThan(0);
  });

  it("rolls the ship type and re-rolls the location for a colonist Wreckage destination", () => {
    let seen = false;
    for (let i = 0; i < 300 && !seen; i++) {
      const g = run("alien.job.create", { seed: `wreck-${i}`, inputs: { frame: "frontier-colonists" } });
      const d = g.results.destination as { wreckage?: boolean; ship?: { ship: string }; near?: { destination: string } };
      if (d.wreckage) {
        seen = true;
        expect(d.ship?.ship).toBeTruthy();
        expect(d.near?.destination).toBeTruthy();
        const job = g.produced.entities.find((e) => e.type === "alien.job")!;
        expect(job.fields.destination).toBe(`Wreckage (${d.ship!.ship}) at: ${d.near!.destination}`);
      }
    }
    expect(seen).toBe(true);
  });
});

describe("alien.lifepath", () => {
  const STEPS = [
    "humanOrAndroid", "origin", "originSkills", "earlyLife", "earlyLifeCompany", "earlyLifeExperience",
    "lifeEvent", "lifeEventSkills", "career", "term1", "term2", "term3", "psych",
  ];
  it("follows the book's step order (p. 282) and produces a PC within the limits", () => {
    const proc = byId("alien.lifepath");
    expect(proc.steps.map((s) => s.id)).toEqual(STEPS);
    for (const seed of SEEDS.slice(0, 30)) {
      for (const inputs of [{ name: "Dallas" }, { name: "Dallas", terms: 3 }]) {
        const g = run("alien.lifepath", { seed, inputs });
        const pc = g.produced.entities[0]!;
        expect(pc.type).toBe("alien.character");
        expect(pc.name).toBe("Dallas");
        expect(pc.fields.isPC).toBe(true);
        const android = pc.fields.android === true;
        const attrs = pc.fields.attributes as Record<string, number>;
        type Totals = { attributes: Record<string, number>; skills: Record<string, number>; psych: number; cash: number; terms: number };
        const lifePath = pc.fields.lifePath as Record<string, unknown> & { totals: Totals };
        const totals = lifePath.totals;
        for (const a of ["strength", "agility", "wits", "empathy"]) {
          expect(attrs[a]).toBeGreaterThanOrEqual(android ? 1 : 2);
          expect(attrs[a]).toBeLessThanOrEqual(android ? 8 : 5);
          expect(attrs[a]).toBe(Math.max(android ? 1 : 2, Math.min(android ? 8 : 5, totals.attributes[a]!)));
        }
        const skills = pc.fields.skills as Record<string, number>;
        expect(Object.keys(skills).length).toBe(12);
        for (const v of Object.values(skills)) expect(v).toBeLessThanOrEqual(5);
        // 3 origin skills + 2 early life + 2 life event (+1 on 15-16) + 2 career + 1 per term, before favors.
        const points = Object.values(totals.skills).reduce((a, b) => a + b, 0);
        expect(points).toBeGreaterThanOrEqual(9 + totals.terms - 1);
        expect(totals.terms).toBeGreaterThanOrEqual(1);
        expect(totals.terms).toBeLessThanOrEqual(pc.fields.career === "kid" ? 1 : inputs.terms ?? 1);
        expect((pc.fields.talents as unknown[]).length).toBe(totals.terms);
        expect(pc.fields.cash).toBe(totals.cash);
        expect(pc.fields.cash as number).toBeGreaterThan(0);
        for (const step of ["humanOrAndroid", "origin", "earlyLife", "lifeEvent", "career", "term1", "psych"]) expect(lifePath[step], step).toBeDefined();
        expect(pc.fields.career).toBe((g.results.career as { career: string }).career);
        expect(g.rolls.find((r) => r.step === "term1/posting")!.table).toBe(`alien.lifepath.posting.${pc.fields.career}`);
        // The psych roll carries every psych modifier gathered before it.
        const psychRoll = g.rolls.find((r) => r.step === "psych")!;
        expect(psychRoll.modifier).toBe(totals.psych);
        expect(psychRoll.table).toBe("alien.lifepath.psych-evaluation");
      }
    }
  });
  it("honours a requested career and the Kid's single term", () => {
    for (const seed of SEEDS.slice(0, 10)) {
      const kid = run("alien.lifepath", { seed, inputs: { career: "kid", terms: 3 } });
      expect(kid.produced.entities[0]!.fields.career).toBe("kid");
      expect(kid.skipped.map((s) => s.step)).toEqual(expect.arrayContaining(["term2", "term3"]));
      const marine = run("alien.lifepath", { seed, inputs: { career: "colonial-marine" } });
      const fields = marine.produced.entities[0]!.fields;
      const notes = (fields.lifePath as { notes: string[] }).notes;
      if (fields.career !== "colonial-marine") expect(notes.some((n) => n.includes("Could not qualify"))).toBe(true);
    }
  });
});

describe("alien.encounter.check", () => {
  it("produces an encounter entity (or none) for every location and applies the book's tens-digit modifiers", () => {
    const wheres = (byId("alien.encounter.check").inputs as { properties: { where: { enum: string[] } } }).properties.where.enum;
    for (const where of wheres) {
      for (let s = 0; s < 8; s++) {
        const g = run("alien.encounter.check", { seed: `enc-${where}-${s}`, inputs: { where } });
        const res = g.results.encounter as { none: boolean; description: string };
        expect(g.rolls[0]!.modifier).toBe(0);
        if (res.none) {
          expect(g.produced.entities).toEqual([]);
          continue;
        }
        const e = g.produced.entities[0]!;
        expect(e.type).toBe("alien.encounter");
        expect(e.fields.where).toBe(where);
        expect(e.fields.tableId).toBe(e.fields.table);
        expect(typeof e.fields.description).toBe("string");
        expect(e.fields.description).not.toBe("");
      }
    }
    const tableFor = (inputs: Record<string, unknown>) => run("alien.encounter.check", { seed: "mod", inputs }).rolls[0]!.table;
    expect(tableFor({ where: "star-system", region: "core" })).toBe("alien.encounters.star-system");
    expect(tableFor({ where: "star-system", region: "outer-rim" })).toBe("alien.encounters.star-system-remote");
    expect(tableFor({ where: "star-system", region: "far-reach" })).toBe("alien.encounters.star-system-remote");
    expect(tableFor({ where: "star-system", region: "uncharted" })).toBe("alien.encounters.star-system-uncharted");
    expect(tableFor({ where: "colony-general", colonySize: "established" })).toBe("alien.encounters.colony.general-established");
    expect(tableFor({ where: "colony-general", colonySize: "young" })).toBe("alien.encounters.colony.general");
    // Uncharted space: a D66 tens digit of 5 or less becomes 0 or less, so no encounter.
    for (let s = 0; s < 20; s++) {
      const g = run("alien.encounter.check", { seed: `unch-${s}`, inputs: { where: "star-system", region: "uncharted" } });
      expect(g.produced.entities.length).toBe(g.rolls[0]!.total <= 56 ? 0 : 1);
    }
    const unin = run("alien.encounter.check", { seed: "surface", inputs: { where: "surface-uninhabited" } });
    const col = run("alien.encounter.check", { seed: "surface", inputs: { where: "surface-colonized" } });
    const r = unin.results.encounter as { uninhabited: string; colonized: string; description: string };
    expect(r.description).toBe(r.uninhabited === "No encounter" ? "No encounter" : r.uninhabited);
    expect((col.results.encounter as { description: string }).description).toBe(r.colonized === "No encounter" ? "No encounter" : r.colonized);
  });
});

describe("alien.shore-leave", () => {
  const characters = INPUT_VARIANTS["alien.shore-leave"]![1]!.characters as Array<{ id: string; choice: string; isMarine: boolean }>;
  const EFFECT_KINDS = ["setField", "incrementField", "addCondition", "removeCondition", "log", "prompt"];

  it("rolls one event per socialising character and returns outcomes and Effect-shaped suggestions", () => {
    const g = run("alien.shore-leave", { seed: "sl", inputs: { characters } });
    expect(g.produced.entities).toEqual([]);
    const outcomes = g.results.outcomes as Array<{ id: string; choice: string; summary: string; event?: Record<string, unknown> }>;
    expect(outcomes.map((o) => o.id)).toEqual(characters.map((c) => c.id));
    expect((g.results.marineEvents as unknown[]).length).toBe(2);
    expect((g.results.otherEvents as unknown[]).length).toBe(1);
    expect(g.rolls.filter((r) => r.step === "marineEvents").every((r) => r.table === "alien.shore-leave.marines")).toBe(true);
    expect(g.rolls.filter((r) => r.step === "otherEvents").every((r) => r.table === "alien.shore-leave.others")).toBe(true);
    for (const o of outcomes) {
      expect(o.summary).toBeTruthy();
      if (o.choice === "socialize") expect(o.event).toBeDefined();
    }
    const effects = g.results.effects as Effect[];
    expect(effects.length).toBeGreaterThan(0);
    for (const e of effects) {
      expect(EFFECT_KINDS).toContain(e.kind);
      if (e.kind === "setField" || e.kind === "incrementField") expect(characters.some((c) => c.id === e.entity)).toBe(true);
      if (e.kind === "prompt") expect(e.prompt.kind).toBe("yesno");
    }
    expect(effects.some((e) => e.kind === "setField" && e.entity === "d" && e.path === "stress")).toBe(true);
    // Pursue Agenda: 1 XP only if the agenda was successfully pursued, so the XP sits behind a prompt (p. 257).
    expect(effects.some((e) => e.kind === "incrementField" && e.entity === "f" && e.path === "xp")).toBe(false);
    const agenda = effects.find((e) => e.kind === "prompt" && e.prompt.id === "shore-leave:agenda:f");
    expect(agenda && agenda.kind === "prompt" && agenda.prompt.onYes?.some((x) => x.kind === "incrementField" && x.path === "xp" && x.by === 1)).toBe(true);
    // Recover: an Empathy roll the GM confirms; living expenses at the normal standard ($300, p. 116).
    expect(effects.some((e) => e.kind === "prompt" && e.prompt.id === "shore-leave:recover:e")).toBe(true);
    expect(effects.filter((e) => e.kind === "incrementField" && e.path === "cash").every((e) => e.kind === "incrementField" && e.by === -300)).toBe(true);
    const marineEvents = g.results.marineEvents as Array<Record<string, unknown>>;
    for (const ev of marineEvents) expect(typeof ev.event).toBe("string");
  });

  it("skips both event steps when nobody socialises", () => {
    const g = run("alien.shore-leave", { seed: "quiet", inputs: { characters: [{ id: "x", name: "X", choice: "heal", isMarine: true }] } });
    expect(g.skipped.map((s) => s.step).sort()).toEqual(["marineEvents", "otherEvents"]);
    expect((g.results.outcomes as unknown[]).length).toBe(1);
    expect(g.rolls.length).toBe(0);
  });
});
