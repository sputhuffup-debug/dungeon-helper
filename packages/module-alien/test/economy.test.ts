import { describe, expect, it } from "vitest";
import { computeFields, createRng, createTableRegistry, runProcedure, type Effect, type LedgerEffect, type ModuleManifest, type TravelRequest } from "@campaign-forge/module-sdk";
import { alienModule, crewShip, FATIGUED_CONDITION, ledger, LEDGER, NDD_TABLE, travel } from "../src";
import { betweenJobs } from "../src/procedures/between-jobs";
import { spaceshipType } from "../src/entities/spaceship";
import { presets } from "../src/data";

const tables = createTableRegistry(alienModule.tables);
const mod = { tables: alienModule.tables, manifest: { id: "alien", version: "0.0.0-test" } as ModuleManifest };

const bison = presets.find((p) => p.id === "alien.spaceship.bison-m-class-hauler")!;

function ship(fields: Record<string, unknown> = {}, id = "ship-1"): NonNullable<TravelRequest["ship"]> {
  const all = { ...bison.fields, ...fields };
  return { id, name: "MV Test", type: "alien.spaceship", fields: all, computed: computeFields(spaceshipType, all) };
}

const place = (id: string, name: string) => ({ id, name, type: "alien.location", subtype: "star-system", fields: {} });

function request(over: Partial<TravelRequest> = {}): TravelRequest {
  return {
    ship: ship(),
    origin: place("a", "Anchorpoint"),
    destination: place("b", "Y87-544"),
    distance: 4,
    options: {
      crew: [
        { id: "pc1", name: "Awake", awake: true, android: false },
        { id: "pc2", name: "Sleeper", awake: false, android: false },
        { id: "pc3", name: "Synth", awake: true, android: true },
      ],
    },
    ...over,
  };
}

describe("FTL travel (p. 108-110)", () => {
  it("takes the FTL rating times the parsecs: the book's rating 6 over 9 parsecs is 54 days", () => {
    const plan = travel.plan(request({ ship: ship({ ftl: 6 }), distance: 9 }));
    expect(plan.days).toBe(54);
    expect(plan.summary).toBe("9 parsecs at FTL 6: 54 days");
    expect(plan.blocked).toBeUndefined();
    // the Bison's FTL 12 over 4 parsecs
    expect(travel.plan(request()).days).toBe(48);
  });

  it("asks for NDD rolls from those awake (every FTL-rating days), fatigue for sleepers and food for the awake", () => {
    const plan = travel.plan(request());
    const ndd = plan.checks.filter((c) => c.id.startsWith("ndd:"));
    expect(ndd).toEqual([expect.objectContaining({ entity: "pc1", count: 4, dice: "1d6", table: NDD_TABLE, page: 109 })]);
    expect(plan.checks.find((c) => c.id === "fatigue:pc2")).toMatchObject({ when: "arrival", page: 110 });
    // androids neither suffer NDD nor fatigue, and eat nothing
    expect(plan.checks.some((c) => c.entity === "pc3")).toBe(false);
    expect(plan.checks.find((c) => c.id === "provisions")).toMatchObject({ count: 48, page: 75 });
  });

  it("keeps everyone awake when the cryo chambers are down, and stops at a broken drive or a disabled hull", () => {
    const cryo = travel.plan(request({ ship: ship({ componentDamage: [{ name: "Cryo Chambers Offline", severity: "minor", system: "cryo" }] }) }));
    expect(cryo.checks.filter((c) => c.id.startsWith("ndd:")).map((c) => c.entity)).toEqual(["pc1", "pc2"]);
    expect(cryo.checks.find((c) => c.id === "provisions")?.count).toBe(96);
    expect(cryo.notes.some((n) => n.page === 145)).toBe(true);
    expect(travel.plan(request({ ship: ship({ componentDamage: [{ name: "Displacement Drive Failure", severity: "major", system: "ftl-drive" }] }) })).blocked).toMatch(/no FTL travel/);
    expect(travel.plan(request({ ship: ship({ hullDamage: 9 }) })).blocked).toMatch(/disabled/);
    expect(travel.plan(request({ ship: undefined })).blocked).toBeTruthy();
    expect(travel.plan(request({ ship: ship({ ftl: 0 }) })).blocked).toMatch(/no FTL rating/);
  });

  it("leaves in-system trips and overrides to the GM", () => {
    expect(travel.plan(request({ distance: 0 })).days).toBe(0);
    expect(travel.plan(request({ distance: 0, days: 3 })).days).toBe(3);
    const over = travel.plan(request({ days: 30 }));
    expect(over.days).toBe(30);
    expect(over.checks.find((c) => c.id === "ndd:pc1")?.count).toBe(2);
  });

  it("rolls NDD with +1 per roll after the first, wakes sleepers fatigued and uses up provisions, the same for the same seed", () => {
    const req = request({ ship: ship({ provisions: 30 }) });
    const plan = travel.plan(req);
    const a = travel.arrive(req, plan, createRng("travel:x"), tables);
    const b = travel.arrive(req, plan, createRng("travel:x"), tables);
    expect(a).toEqual(b);
    expect(a.rolls.map((r) => r.modifier)).toEqual([0, 1, 2, 3]);
    expect(a.rolls.every((r) => r.table === NDD_TABLE)).toBe(true);
    expect(a.log.filter((l) => l.includes("for NDD"))).toHaveLength(4);
    expect(a.effects).toContainEqual({ kind: "addCondition", entity: "pc2", condition: { ...FATIGUED_CONDITION } });
    expect(a.effects).toContainEqual({ kind: "incrementField", entity: "ship-1", path: "provisions", by: -48, min: 0 });
    expect(a.log.some((l) => l.includes("ran out on day 31"))).toBe(true);
  });

  it("is wired into the module with the parsec unit and the location subtypes", () => {
    expect(alienModule.travel).toBe(travel);
    expect(travel.distance).toMatchObject({ unit: "parsec", page: 108 });
    expect(travel.destinations[0]?.subtypes).toEqual(["star-system", "planet", "colony", "site"]);
  });
});

describe("the NDD table (p. 109)", () => {
  it("covers 1-5 no effect, 6-7 paranoia, 8-9 epilepsy, 10-11 dementia, 12+ psychosis", () => {
    const t = tables.get(NDD_TABLE)!;
    expect(t.dice).toBe("1d6");
    expect(t.rows.map((r) => [r.range, r.label])).toEqual([
      [[-99, 5], "No Effect"],
      [[6, 7], "Paranoia"],
      [[8, 9], "Epilepsy"],
      [[10, 11], "Dementia"],
      [[12, 99], "Psychosis"],
    ]);
  });
});

describe("component damage tables (p. 145-146)", () => {
  it("have the book's entries, ranges and repair rolls", () => {
    const minor = tables.get("alien.ship.minor-damage")!;
    expect(minor.dice).toBe("d66");
    expect(minor.rows).toHaveLength(27);
    const at = (t: typeof minor, v: number) => t.rows.find((r) => r.range[0] <= v && v <= r.range[1])!;
    expect(at(minor, 26).label).toBe("Compartmental Decompression");
    expect(at(minor, 31).label).toBe("Compartmental Decompression");
    expect((at(minor, 35).result as Record<string, unknown>).repair).toEqual({ heavyMachinery: 1, comtech: 1 });
    expect((at(minor, 22).result as Record<string, unknown>).repair).toBeNull();
    const major = tables.get("alien.ship.major-damage")!;
    expect(major.dice).toBe("2d6");
    expect(major.rows.map((r) => r.label)).toEqual([
      "A.I. Offline",
      "Escape Pods Heavily Damaged",
      "Sensor Failure",
      "Displacement Drive Failure",
      "Armament Damaged",
      "Engine Failure",
      "Critical Crew Injury",
      "Bridge Exposed To Vacuum",
      "Reactor Breach",
      "Chain Reaction",
      "Reactor Detonation",
    ]);
    expect((at(major, 2).result as Record<string, unknown>).repair).toEqual({ heavyMachinery: 0, comtech: 3 });
    expect((at(major, 5).result as Record<string, unknown>).repair).toEqual({ heavyMachinery: 1, comtech: 2 });
  });
});

describe("ship sheet", () => {
  it("computes hull left, the major damage threshold, disabled and the lease (p. 121, 146)", () => {
    const c = computeFields(spaceshipType, { ...bison.fields, hullDamage: 3 });
    expect(c).toMatchObject({ hullLeft: 6, majorDamageAt: 5, disabled: false, leasePerYear: 766000, leasePerWeek: 14731 });
    expect(computeFields(spaceshipType, { ...bison.fields, hullDamage: 9 }).disabled).toBe(true);
  });

  it("declares a crew ship whose stats and lists read real fields", () => {
    expect(crewShip).toMatchObject({ setting: "ship", locationSetting: "currentLocation", betweenJobs: "alien.between-jobs" });
  });
});

describe("ledger categories", () => {
  it("cite a page where the book prices or describes the money, and none for GM bookkeeping", () => {
    const unpaged = ledger.categories.filter((c) => c.page === undefined).map((c) => c.id);
    expect(unpaged.sort()).toEqual([LEDGER.docking, LEDGER.fuel, LEDGER.loan, LEDGER.other, LEDGER.repairs].sort());
    expect(ledger.categories.find((c) => c.id === LEDGER.jobPayment)?.page).toBe(244);
    expect(ledger.payouts).toEqual([expect.objectContaining({ entityType: "alien.job", amountPath: "payment", category: LEDGER.jobPayment })]);
    expect(ledger.currency).toMatchObject({ symbol: "$", decimals: 0 });
  });
});

describe("between jobs", () => {
  const job = { id: "job-1", name: "Haul ore", type: "alien.job", fields: { payment: 12000, status: "accepted" } };
  const damaged = {
    id: "ship-1",
    name: "MV Test",
    type: "alien.spaceship",
    fields: {
      ...bison.fields,
      hullDamage: 3,
      ownership: "leased",
      provisions: 20,
      spareParts: { mechanical: 1, electronic: 0 },
      componentDamage: [
        { name: "Coffee Maker Malfunction", severity: "minor", heavyMachinery: 1, comtech: 0 },
        { name: "Sensor Failure", severity: "major", heavyMachinery: 0, comtech: 2 },
      ],
    },
  };
  const inputs = { job, ship: damaged, weeks: 2, provisionsTarget: 100, dockingFees: 300, fuel: 0, heavyMachineryDice: 6, comtechDice: 6, repairShifts: 20 };
  const go = (seed: string, extra: Record<string, unknown> = {}, stepSeeds: Record<string, string> = {}) => runProcedure(betweenJobs, mod, { seed, inputs: { ...inputs, ...extra }, stepSeeds });
  const postings = (effects: Effect[]) => effects.filter((e): e is LedgerEffect => e.kind === "ledger");

  it("is deterministic for a seed and module version", () => {
    expect(go("s1")).toEqual(go("s1"));
    const a = go("s1").results.hull;
    const differs = ["s2", "s3", "s4", "s5"].some((s) => JSON.stringify(go(s).results.hull) !== JSON.stringify(a));
    expect(differs).toBe(true);
  });

  it("posts the job payment once, the lease, the parts, food and water and the GM's fees", () => {
    const g = go("s1");
    const effects = g.results.effects as Effect[];
    const ledgerOut = postings(effects);
    expect(ledgerOut.find((e) => e.category === LEDGER.jobPayment)).toMatchObject({ amount: 12000, key: "job-payment:job-1", links: { job: "job-1", ship: "ship-1" } });
    // 2 weeks of 2% a year on $38,300,000 (p. 121)
    expect(ledgerOut.find((e) => e.category === LEDGER.lease)?.amount).toBe(-Math.round((38300000 * 0.02 * 2) / 52));
    // one mechanical part aboard; two electronic to buy at $200,000 (p. 147)
    expect(g.results.parts).toMatchObject({ need: { mechanical: 1, electronic: 2 }, buy: { mechanical: 0, electronic: 2 }, cost: 400000 });
    expect(ledgerOut.find((e) => e.category === LEDGER.spareParts)?.amount).toBe(-400000);
    // 80 person-days at $12 (p. 99)
    expect(ledgerOut.find((e) => e.category === LEDGER.provisions)?.amount).toBe(-960);
    expect(ledgerOut.find((e) => e.category === LEDGER.docking)?.amount).toBe(-300);
    expect(ledgerOut.some((e) => e.category === LEDGER.fuel)).toBe(false);
    expect(effects).toContainEqual({ kind: "setField", entity: "job-1", path: "status", value: "done" });
    expect(effects).toContainEqual({ kind: "incrementField", entity: "ship-1", path: "provisions", by: 80 });
    const net = ledgerOut.reduce((n, e) => n + e.amount, 0);
    expect((g.results.balance as { net: number }).net).toBe(net);
  });

  it("repairs hull one Heavy Machinery roll per shift and components with parts, re-rolled step by step", () => {
    const g = go("s1");
    const hull = g.results.hull as { damage: number; repaired: number; shifts: Array<{ dice: number[]; successes: number }> };
    expect(hull.damage).toBe(3);
    expect(hull.repaired).toBe(Math.min(3, hull.shifts.reduce((n, s) => n + s.successes, 0)));
    for (const s of hull.shifts) expect(s.dice).toHaveLength(6);
    const comps = g.results.components as { repairs: Array<{ repaired: boolean }>; used: { mechanical: number; electronic: number } };
    expect(comps.repairs).toHaveLength(2);
    const effects = g.results.effects as Effect[];
    if (hull.repaired > 0) expect(effects).toContainEqual({ kind: "incrementField", entity: "ship-1", path: "hullDamage", by: -hull.repaired, min: 0 });
    // re-rolling the hull step alone leaves the parts step as it was
    const again = go("s1", {}, { hull: "other" });
    expect(again.results.parts).toEqual(g.results.parts);
  });

  it("buys no parts when told not to, and then cannot finish repairs that need them", () => {
    const g = go("s1", { buyParts: false });
    expect(postings(g.results.effects as Effect[]).some((e) => e.category === LEDGER.spareParts)).toBe(false);
    const comps = g.results.components as { repairs: Array<{ name: string; repaired: boolean; summary: string }> };
    expect(comps.repairs.find((r) => r.name === "Sensor Failure")).toMatchObject({ repaired: false });
    expect(comps.repairs.find((r) => r.name === "Sensor Failure")?.summary).toContain("out of spare parts");
  });

  it("runs with nothing chosen and posts nothing; a company ship pays no lease", () => {
    const empty = runProcedure(betweenJobs, mod, { seed: "x" });
    expect(postings(empty.results.effects as Effect[])).toEqual([]);
    const company = go("s1", { ship: { ...damaged, fields: { ...damaged.fields, ownership: "company" } } });
    expect(postings(company.results.effects as Effect[]).some((e) => e.category === LEDGER.lease)).toBe(false);
  });

  it("chains into shore leave and the next job", () => {
    expect(betweenJobs.chains?.map((c) => c.procedure)).toEqual(["alien.shore-leave", "alien.job.create"]);
    expect(betweenJobs.inputs?.properties).toMatchObject({ job: { "x-entity": { types: ["alien.job"] } }, ship: { "x-entity": { types: ["alien.spaceship"], setting: "ship" } } });
  });
});
