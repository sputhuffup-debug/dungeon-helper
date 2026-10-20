/**
 * Money and the crew's ship for campaign play.
 *
 * What the book supports, with pages: job payment (p. 244), bonus rewards
 * (p. 244-251), salaries and stasis pay (p. 117, 234-235), living expenses
 * (p. 116), food and water prices (p. 99), spare parts (p. 147), ship leases
 * (p. 121), ship, module and upgrade prices (p. 121-137), gear prices
 * (chapter 5) and shore leave side jobs and trades (p. 257-258).
 *
 * What it does not: docking fees, fuel prices, dry-dock labour, loans and
 * debts. Those categories have no `page`; they are the GM's own bookkeeping.
 */
import type { CrewShipDef, LedgerDef } from "@campaign-forge/module-sdk";
import { CAMPAIGN } from "./modes";

export const CREW_SHIP_SETTING = "ship";
export const CURRENT_LOCATION_SETTING = "currentLocation";
export const BETWEEN_JOBS_PROCEDURE = "alien.between-jobs";

/** Ledger category ids. */
export const LEDGER = {
  jobPayment: "job-payment",
  bonus: "bonus",
  salary: "salary",
  sideJob: "side-job",
  lease: "lease",
  spareParts: "spare-parts",
  provisions: "provisions",
  living: "living",
  gear: "gear",
  shipFittings: "ship-fittings",
  docking: "docking",
  fuel: "fuel",
  repairs: "repairs",
  loan: "loan",
  other: "other",
} as const;

/** A day of food and water for one person: a prefab meal ($10) and shipboard water ($2) (p. 99). */
export const PROVISIONS_PER_DAY = 12;
/** Typical price of a mechanical spare part in port; an electronic one is about twice that (p. 147). */
export const MECHANICAL_PART_COST = 100_000;
export const ELECTRONIC_PART_COST = 200_000;

export const ledger: LedgerDef = {
  currency: { name: "UA dollar", plural: "UA dollars", symbol: "$", decimals: 0, locale: "en-US", page: 116 },
  defaultAccount: "Crew funds",
  accountEntityTypes: ["alien.character"],
  mode: [CAMPAIGN],
  rules: ["alien.rule.currencies", "alien.rule.job-payment", "alien.rule.salaries", "alien.rule.living-expenses"],
  categories: [
    { id: LEDGER.jobPayment, label: "Job payment", direction: "in", page: 244, rule: "alien.rule.job-payment", description: "(Distance + difficulty) × PCs × $1,000, plus 20% per negotiation success." },
    { id: LEDGER.bonus, label: "Bonus reward", direction: "in", page: [244, 251], rule: "alien.rule.jobs", description: "An additional financial bonus or a debt cancelled, from the frame's bonus table." },
    { id: LEDGER.salary, label: "Salary", direction: "in", page: [117, 235], rule: "alien.rule.salaries", description: "Weekly pay; time in stasis pays 10%." },
    { id: LEDGER.sideJob, label: "Side job or trade", direction: "either", page: [257, 258], rule: "alien.rule.shore-leave-events", description: "Shore leave favours, side jobs (D6 × $200) and local goods (D6 × $400, sold at 50% profit)." },
    { id: LEDGER.lease, label: "Ship lease", direction: "out", page: 121, rule: "alien.rule.ship-ownership", description: "A typical lease is 2% of the ship's price a year." },
    { id: LEDGER.spareParts, label: "Spare parts", direction: "out", page: 147, rule: "alien.rule.spare-parts", description: "About $100,000 per mechanical part and twice that per electronic part." },
    { id: LEDGER.provisions, label: "Food and water", direction: "out", page: 99, rule: "alien.rule.food-water", description: "A prefab meal is $10 and shipboard water $2 a day." },
    { id: LEDGER.living, label: "Living expenses", direction: "out", page: 116, rule: "alien.rule.living-expenses", description: "$25 to $2,000 a week, paid during shore leave." },
    { id: LEDGER.gear, label: "Gear", direction: "either", page: [82, 105], description: "Weapons, suits, tools and supplies at chapter 5 prices." },
    { id: LEDGER.shipFittings, label: "Ship modules and upgrades", direction: "out", page: [121, 127], rule: "alien.rule.ship-upgrades", description: "Modules, upgrades and armaments at their listed prices; refits need a dry dock." },
    { id: LEDGER.docking, label: "Docking fees", direction: "out", description: "GM bookkeeping: the book prices no docking or berthing fees." },
    { id: LEDGER.fuel, label: "Fuel", direction: "out", description: "GM bookkeeping: the book names reactor fuels (p. 122) but gives no fuel prices or fuel ratings." },
    { id: LEDGER.repairs, label: "Repairs (hired)", direction: "out", description: "GM bookkeeping: the book prices spare parts only, not dry-dock work or hired repair crews." },
    { id: LEDGER.loan, label: "Loan or debt", direction: "either", description: "GM bookkeeping: credit and loans exist (p. 117) and a bonus can cancel a debt (p. 244), but the book sets no terms." },
    { id: LEDGER.other, label: "Other", direction: "either", description: "Anything else the GM wants on the books." },
  ],
  payouts: [{ entityType: "alien.job", amountPath: "payment", category: LEDGER.jobPayment, label: "Collect payment", setOnPost: { path: "status", value: "done" }, page: 244 }],
};

export const crewShip: CrewShipDef = {
  entityTypes: ["alien.spaceship"],
  setting: CREW_SHIP_SETTING,
  locationSetting: CURRENT_LOCATION_SETTING,
  label: "Ship",
  sections: ["stats", "condition", "systems", "stores", "upkeep"],
  stats: [
    { label: "Hull", path: "hullLeft", max: "hull", rule: "alien.rule.ship-damage" },
    { label: "Disabled", path: "disabled", format: "flag", rule: "alien.rule.ship-damage" },
    { label: "Armor", path: "armor" },
    { label: "FTL", path: "ftl", rule: "alien.rule.ftl-travel" },
    { label: "Mech. parts", path: "spareParts.mechanical", rule: "alien.rule.spare-parts" },
    { label: "Elec. parts", path: "spareParts.electronic", rule: "alien.rule.spare-parts" },
    { label: "Provisions (person-days)", path: "provisions", rule: "alien.rule.food-water" },
    { label: "Ownership", path: "ownership", format: "text", rule: "alien.rule.ship-ownership" },
    { label: "Lease (2% a year)", path: "leasePerYear", format: "money", rule: "alien.rule.ship-ownership" },
  ],
  lists: [
    { label: "Component damage", path: "componentDamage", title: "name", detail: ["effect"], badge: "severity", empty: "All systems working.", rule: "alien.rule.ship-critical-damage" },
    { label: "Cargo", path: "cargo", title: "item", detail: ["amount", "note"], empty: "Holds empty." },
  ],
  betweenJobs: BETWEEN_JOBS_PROCEDURE,
  mode: [CAMPAIGN],
  rules: ["alien.rule.starting-ship", "alien.rule.ship-ownership", "alien.rule.ship-repairs", "alien.rule.spare-parts", "alien.rule.arrival"],
};
