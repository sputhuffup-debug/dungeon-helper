import { addDaysToDate, daysBetween, formatAmount, parseCalendarDate, type EntityTypeDef, type GameModule, type TravelDef } from "@campaign-forge/module-sdk";
import { strFromU8, unzipSync } from "fflate";
import { describe, expect, it } from "vitest";
import {
  RichTextRegistry,
  applyEffects,
  crewShip,
  currentLocation,
  departTravel,
  exportBundle,
  importBundle,
  knownDistance,
  ledgerBalance,
  ledgerBalances,
  ledgerEntries,
  ledgerRows,
  ledgerToCsv,
  ledgerTotalsByCategory,
  planTravel,
  postLedgerEntry,
  projectCampaignForViewer,
  setCrewShip,
  travelLog,
} from "../src";
import { fixtureModule, newStore } from "./fixtures";

const CART: EntityTypeDef = {
  id: "example.cart",
  kind: "vehicle",
  name: "Cart",
  plural: "Carts",
  schema: { type: "object", properties: { speed: { type: "integer" }, food: { type: "integer" } } },
  sheet: { sections: [{ id: "main", title: "Main", fields: [{ path: "speed" }, { path: "food" }] }] },
  computed: { fast: { ">=": [{ var: ["fields.speed", 0] }, 10] } },
};

/** Travel fixture: days = ceil(distance / speed); one die per day, a 1 eats an extra ration; costs 2 coins a day. */
const travel: TravelDef = {
  distance: { unit: "mile", plural: "miles" },
  destinations: [{ entityType: "example.place" }],
  plan(req) {
    const speed = Number(req.ship?.fields.speed ?? 0);
    const days = req.days ?? (speed > 0 ? Math.ceil(req.distance / speed) : 0);
    const plan: ReturnType<TravelDef["plan"]> = { days, summary: `${req.distance} miles: ${days} days`, checks: days ? [{ id: "road", label: "Road", dice: "1d6", count: days, when: "en-route" }] : [], notes: [] };
    if (!req.ship) plan.blocked = "no cart";
    if (req.ship?.computed?.fast === true) plan.notes.push({ text: "fast cart" });
    return plan;
  },
  arrive(req, plan, rng) {
    const raw = Array.from({ length: plan.checks[0]?.count ?? 0 }, () => rng.int(1, 6));
    const extra = raw.filter((v) => v === 1).length;
    return {
      rolls: [{ step: "road", dice: "1d6", raw, modifier: 0, total: raw.reduce((a, b) => a + b, 0), result: extra }],
      log: [`${extra} spoiled`],
      effects: [
        { kind: "incrementField", entity: req.ship!.id, path: "food", by: -(plan.days + extra), min: 0 },
        { kind: "ledger", amount: -2 * plan.days, category: "tolls", note: "Road tolls" },
      ],
    };
  },
};

const mod: GameModule = {
  ...fixtureModule,
  entityTypes: [...fixtureModule.entityTypes, CART],
  calendar: { id: "cal", name: "Cal", defaultYear: 2200, months: [{ name: "One", days: 30 }, { name: "Two", days: 28 }], format: "{year}-{month:02}-{day:02}" },
  ledger: { currency: { name: "coin", symbol: "c", symbolAfter: true }, defaultAccount: "Purse", categories: [{ id: "tolls", label: "Tolls", direction: "out" }, { id: "pay", label: "Pay", direction: "in" }] },
  crewShip: { entityTypes: ["example.cart"], setting: "cart", locationSetting: "here" },
  travel,
};

function world() {
  const store = newStore();
  store.updateMeta({ currentDate: "2200-01-25" });
  const cart = store.createEntity({ type: "example.cart", name: "Old Cart", fields: { speed: 10, food: 20 } });
  const home = store.createEntity({ type: "example.place", name: "Home", fields: {} });
  const fair = store.createEntity({ type: "example.place", name: "Fair", fields: {} });
  store.createRelationship("found_at", cart.id, home.id, "parked");
  return { store, cart, home, fair };
}

describe("calendar helpers", () => {
  const cal = mod.calendar;
  it("parses, adds days across months and years, and counts days", () => {
    expect(parseCalendarDate(cal, "2200-02-28")).toEqual({ year: 2200, month: 2, day: 28 });
    expect(parseCalendarDate(cal, "2200-02-29")).toBeUndefined();
    expect(parseCalendarDate(cal, "nonsense")).toBeUndefined();
    expect(addDaysToDate(cal, "2200-01-25", 10)).toBe("2200-02-05");
    expect(addDaysToDate(cal, "2200-02-20", 10)).toBe("2201-01-02");
    expect(addDaysToDate(cal, "2201-01-02", -10)).toBe("2200-02-20");
    expect(daysBetween(cal, "2200-01-25", "2201-01-02")).toBe(35);
  });
  it("formats money with the currency", () => {
    expect(formatAmount({ name: "dollar", symbol: "$" }, 1234567)).toBe("$1,234,567");
    expect(formatAmount({ name: "dollar", symbol: "$" }, -450, { sign: true })).toBe("−$450");
    expect(formatAmount({ name: "coin", symbol: "c", symbolAfter: true, decimals: 2 }, 3.5, { sign: true })).toBe("+3.50 c");
  });
});

describe("ledger", () => {
  it("sums balances from entries per account, never storing them", () => {
    const { store } = world();
    const hero = store.createEntity({ type: "example.person", name: "Hero" });
    postLedgerEntry(store, { amount: 100, category: "pay", note: "Job", realDate: "2026-01-01" });
    postLedgerEntry(store, { amount: -30, category: "tolls", inWorldDate: "2200-01-20", realDate: "2026-01-01" });
    postLedgerEntry(store, { amount: 7, category: "pay", account: hero.id, realDate: "2026-01-02" });
    expect(ledgerBalance(store)).toBe(70);
    expect(ledgerBalance(store, { account: hero.id })).toBe(7);
    expect(ledgerBalance(store, {})).toBe(77);
    expect(ledgerBalances(store)).toEqual({ "": 70, [hero.id]: 7 });
    expect(ledgerTotalsByCategory(store)).toEqual({ pay: { in: 107, out: 0 }, tolls: { in: 0, out: -30 } });
    for (const e of store.list("ledger")) expect(e).not.toHaveProperty("balance");
    // the in-world date defaults to the campaign's
    expect(store.list("ledger").find((e) => e.note === "Job")?.inWorldDate).toBe("2200-01-25");
  });

  it("orders by in-world date and gives a running balance over the rows shown", () => {
    const { store } = world();
    postLedgerEntry(store, { amount: 50, category: "pay", inWorldDate: "2200-02-01", realDate: "2026-01-01" });
    postLedgerEntry(store, { amount: -20, category: "tolls", inWorldDate: "2200-01-10", realDate: "2026-01-02" });
    postLedgerEntry(store, { amount: 5, category: "pay", inWorldDate: "2200-01-12", realDate: "2026-01-03" });
    const rows = ledgerRows(store, {}, mod.calendar);
    expect(rows.map((r) => [r.entry.amount, r.balance])).toEqual([
      [-20, -20],
      [5, -15],
      [50, 35],
    ]);
    expect(ledgerRows(store, { categories: ["pay"] }).map((r) => r.balance)).toEqual([5, 55]);
    expect(ledgerEntries(store, { categories: ["tolls"] })).toHaveLength(1);
  });

  it("posts a keyed entry once", () => {
    const { store } = world();
    const a = postLedgerEntry(store, { amount: 10, category: "pay", key: "job:1" });
    const b = postLedgerEntry(store, { amount: 10, category: "pay", key: "job:1" });
    expect(a.duplicate).toBe(false);
    expect(b.duplicate).toBe(true);
    expect(b.entry.id).toBe(a.entry.id);
    expect(store.count("ledger")).toBe(1);
    // and through a ledger effect
    const res = applyEffects(store, [{ kind: "ledger", amount: 10, category: "pay", note: "again", key: "job:1" }]);
    expect(res.skipped).toHaveLength(1);
    expect(store.count("ledger")).toBe(1);
  });

  it("applies ledger effects with links and a source", () => {
    const { store, cart } = world();
    const session = store.createSession({});
    const res = applyEffects(store, [{ kind: "ledger", amount: -12.4, category: "tolls", note: "Bridge", links: { ship: cart.id } }], { sessionId: session.id, ledgerSource: { kind: "procedure", id: "run1" }, currency: { decimals: 0 } });
    expect(res.applied).toHaveLength(1);
    const [entry] = store.list("ledger");
    expect(entry).toMatchObject({ amount: -12, category: "tolls", note: "Bridge", links: { ship: cart.id, session: session.id }, source: { kind: "procedure", id: "run1" } });
  });

  it("exports CSV with labels, names and the running balance", () => {
    const { store, cart } = world();
    postLedgerEntry(store, { amount: 100, category: "pay", note: 'Big "job", paid', realDate: "2026-01-01", links: { ship: cart.id } });
    postLedgerEntry(store, { amount: -40, category: "tolls", realDate: "2026-01-02" });
    const csv = ledgerToCsv(store, { ledger: mod.ledger!, calendar: mod.calendar, resolve: (id) => store.get("entities", id)?.name ?? id });
    const lines = csv.trim().split("\n");
    expect(lines[0]).toBe("In-world date,Real date,Account,Category,Note,Amount,Balance,Job,Session,Ship,Character,Travel");
    expect(lines[1]).toBe('2200-01-25,2026-01-01,Purse,Pay,"Big ""job"", paid",100,100,,,Old Cart,,');
    expect(lines[2]).toBe("2200-01-25,2026-01-02,Purse,Tolls,,-40,60,,,,,");
  });

  it("travels in the bundle and in a player's view only when visible", async () => {
    const { store } = world();
    postLedgerEntry(store, { amount: 1, category: "pay", visibility: { level: "players" } });
    postLedgerEntry(store, { amount: 2, category: "pay" });
    const bytes = await exportBundle(store, new RichTextRegistry(), undefined, { id: "example", version: "0.1.0" });
    const file = JSON.parse(strFromU8(unzipSync(bytes)["campaign.json"]!)) as { maps: { ledger: Record<string, unknown> } };
    expect(Object.keys(file.maps.ledger)).toHaveLength(2);
    const imported = await importBundle(bytes, { onConflict: "new-id" });
    expect(ledgerBalance(imported.store)).toBe(3);
    const view = projectCampaignForViewer(store.toJSON(), mod, { role: "player" });
    expect(Object.values(view.ledger).map((e) => e.amount)).toEqual([1]);
  });
});

describe("travel", () => {
  it("knows the crew vehicle and where it is", () => {
    const { store, cart, home } = world();
    expect(crewShip(store, mod.crewShip)).toBeUndefined();
    setCrewShip(store, mod.crewShip!, cart.id);
    expect(crewShip(store, mod.crewShip)?.id).toBe(cart.id);
    expect(currentLocation(store, { ship: cart.id, locationSetting: "here" })?.id).toBe(home.id);
  });

  it("plans with the module rule, using computed values and the GM's day override", () => {
    const { store, cart, home, fair } = world();
    const plan = planTravel(store, mod, { ship: cart.id, from: home.id, to: fair.id, distance: 35 });
    expect(plan).toMatchObject({ days: 4, summary: "35 miles: 4 days", notes: [{ text: "fast cart" }] });
    expect(plan.checks[0]).toMatchObject({ id: "road", count: 4 });
    expect(planTravel(store, mod, { ship: cart.id, to: fair.id, distance: 35, days: 9 }).days).toBe(9);
    expect(planTravel(store, mod, { to: fair.id, distance: 35 }).blocked).toBe("no cart");
  });

  it("departs: logs the leg, rolls from the seed, applies effects and moves date and location", () => {
    const { store, cart, home, fair } = world();
    const res = departTravel(store, mod, { ship: cart.id, from: home.id, to: fair.id, distance: 35, seed: "s1" });
    expect(res.leg).toMatchObject({ ship: cart.id, from: home.id, fromName: "Home", to: fair.id, toName: "Fair", days: 4, departDate: "2200-01-25", arriveDate: "2200-01-29", status: "arrived", seed: "s1", effectsApplied: true });
    expect(store.meta().currentDate).toBe("2200-01-29");
    expect(store.meta().settings["here"]).toBe(fair.id);
    expect(currentLocation(store, { ship: cart.id })?.id).toBe(fair.id);
    const foundAt = store.list("relationships").filter((r) => r.type === "found_at" && r.from === cart.id);
    expect(foundAt.map((r) => r.to)).toEqual([fair.id]);
    const spoiled = res.outcome.rolls[0]!.result as number;
    expect(store.get("entities", cart.id)?.fields.food).toBe(20 - 4 - spoiled);
    const [toll] = store.list("ledger");
    expect(toll).toMatchObject({ amount: -8, category: "tolls", inWorldDate: "2200-01-29", links: { travel: res.leg.id, ship: cart.id }, source: { kind: "travel", id: res.leg.id } });
    expect(store.list("timeline").map((t) => t.text)).toEqual(["Old Cart arrives at Fair from Home after 4 days."]);
    expect(travelLog(store, { ship: cart.id })).toHaveLength(1);
    expect(knownDistance(store, fair.id, home.id)).toBe(35);
  });

  it("is deterministic: same seed, same arrival", () => {
    const a = world();
    const b = world();
    const ra = departTravel(a.store, mod, { ship: a.cart.id, to: a.fair.id, distance: 200, seed: "same" });
    const rb = departTravel(b.store, mod, { ship: b.cart.id, to: b.fair.id, distance: 200, seed: "same" });
    expect(ra.outcome.rolls).toEqual(rb.outcome.rolls);
    expect(ra.leg.log).toEqual(rb.leg.log);
    const c = world();
    const rc = departTravel(c.store, mod, { ship: c.cart.id, to: c.fair.id, distance: 200, seed: "other" });
    expect(rc.outcome.rolls[0]!.raw).not.toEqual(ra.outcome.rolls[0]!.raw);
  });

  it("refuses a blocked trip and can hold effects for later", () => {
    const { store, cart, fair } = world();
    expect(() => departTravel(store, mod, { to: fair.id, distance: 10, seed: "x" })).toThrow("no cart");
    const res = departTravel(store, mod, { ship: cart.id, to: fair.id, distance: 10, seed: "x", applyEffects: false, moveVehicle: false, timeline: false });
    expect(res.leg.effectsApplied).toBe(false);
    expect(store.count("ledger")).toBe(0);
    expect(store.count("timeline")).toBe(0);
    expect(store.get("entities", cart.id)?.fields.food).toBe(20);
  });
});
