/**
 * Between jobs: settle up in port before the next job. Steps, each seeded and
 * re-rollable where it rolls:
 *  1. Collect the job's payment (p. 244), once per job.
 *  2. Pay the ship's lease if it is leased: 2% of the price a year (p. 121),
 *     pro rata for the weeks in port.
 *  3. Hull repairs: one Heavy Machinery roll per shift, each success removes
 *     a point of damage; needs EVA or a dry dock (p. 146-147).
 *  4. Spare parts: one mechanical part per Heavy Machinery repair roll and
 *     one electronic per Comtech roll; missing parts bought at about $100,000
 *     and $200,000 (p. 147).
 *  5. Component repairs: the listed rolls, one per shift, a part used up on
 *     each success (p. 145-147).
 *  6. Resupply food and water: $12 per person-day, a prefab meal and
 *     shipboard water (p. 99).
 *  7. Docking and fuel: the GM's own figures (the book prices neither).
 *  8. Shore leave and the next job: chained to the shore leave week
 *     (p. 257-258, living expenses come out of each PC's cash there) and the
 *     job generator (p. 244).
 *
 * Repair rolls use the dice the GM gives for the crew's best Heavy Machinery
 * and Comtech pools (attribute + skill + tools), as base dice only; pin a
 * step to use rolls made at the table instead. Produces no entities: the
 * ledger postings and field changes land in `results.effects` for the GM to
 * apply.
 */
import type { Effect, EntitySnapshot, LedgerEffect, Procedure, ProcedureContext, Rng } from "@campaign-forge/module-sdk";
import { ELECTRONIC_PART_COST, LEDGER, MECHANICAL_PART_COST, PROVISIONS_PER_DAY } from "../economy";
import { LEASE_RATE_PER_YEAR } from "../entities/spaceship";
import { input, isObj, num, str } from "./helpers";

export const BETWEEN_JOBS_ID = "alien.between-jobs";

function snapshot(ctx: ProcedureContext, key: string): EntitySnapshot | undefined {
  const v = input(ctx, key);
  if (!isObj(v) || typeof v.id !== "string") return undefined;
  return { id: v.id, name: str(v.name, v.id), type: str(v.type), fields: isObj(v.fields) ? v.fields : {} };
}

/** Roll `n` base dice; a 6 is a success (p. 42). */
function baseRoll(rng: Rng, n: number): { dice: number[]; successes: number } {
  const dice = Array.from({ length: Math.max(1, Math.floor(n)) }, () => rng.int(1, 6));
  return { dice, successes: dice.filter((d) => d === 6).length };
}

interface Component {
  name: string;
  severity: string;
  heavyMachinery: number;
  comtech: number;
  [k: string]: unknown;
}

function components(ship: EntitySnapshot | undefined): Component[] {
  const raw = ship?.fields.componentDamage;
  if (!Array.isArray(raw)) return [];
  return raw.filter(isObj).map((c) => ({ ...c, name: str(c.name, "Damage"), severity: str(c.severity, "minor"), heavyMachinery: Math.max(0, Math.floor(num(c.heavyMachinery))), comtech: Math.max(0, Math.floor(num(c.comtech))) }));
}

function parts(ship: EntitySnapshot | undefined): { mechanical: number; electronic: number } {
  const p = isObj(ship?.fields.spareParts) ? (ship!.fields.spareParts as Record<string, unknown>) : {};
  return { mechanical: Math.max(0, Math.floor(num(p.mechanical))), electronic: Math.max(0, Math.floor(num(p.electronic))) };
}

const weeksOf = (ctx: ProcedureContext) => Math.max(0, Math.floor(num(input(ctx, "weeks"), 1)));
const shiftsOf = (ctx: ProcedureContext) => Math.max(0, Math.floor(num(input(ctx, "repairShifts"), 10)));
const usd = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;

interface PaymentResult {
  job?: string;
  name?: string;
  amount: number;
  label: string;
}
interface LeaseResult {
  amount: number;
  label: string;
}
interface HullResult {
  damage: number;
  repaired: number;
  left: number;
  shifts: Array<{ shift: number; dice: number[]; successes: number }>;
  label: string;
}
interface PartsResult {
  need: { mechanical: number; electronic: number };
  have: { mechanical: number; electronic: number };
  buy: { mechanical: number; electronic: number };
  cost: number;
  label: string;
}
interface RepairResult {
  name: string;
  repaired: boolean;
  heavyMachinery: number;
  comtech: number;
  shifts: number;
  rolls: Array<{ skill: "heavyMachinery" | "comtech"; dice: number[]; successes: number }>;
  summary: string;
}
interface ComponentsResult {
  repairs: RepairResult[];
  used: { mechanical: number; electronic: number };
  label: string;
}
interface CostResult {
  amount: number;
  label: string;
  personDays?: number;
}

export const betweenJobs: Procedure = {
  id: BETWEEN_JOBS_ID,
  name: "Between jobs",
  description: "Collect the job's pay, pay the lease, repair hull and components with spare parts, resupply food and water, settle fees, then shore leave and the next job.",
  page: [244, 257],
  mode: ["campaign"],
  inputs: {
    type: "object",
    properties: {
      job: { type: "object", title: "Finished job", "x-entity": { types: ["alien.job"] }, description: "Its payment goes into crew funds, once (p. 244)." },
      ship: { type: "object", title: "Crew's ship", "x-entity": { types: ["alien.spaceship"], setting: "ship" }, description: "Repairs, spare parts, provisions and lease come from its sheet." },
      weeks: { type: "integer", minimum: 0, default: 1, description: "Weeks in port: lease pro rata and shore leave weeks." },
      repairShifts: { type: "integer", minimum: 0, default: 10, description: "Shifts of repair work available per job (one roll per shift, p. 147)." },
      heavyMachineryDice: { type: "integer", minimum: 1, default: 5, description: "Base dice for the best Heavy Machinery repair roll (Strength + skill + tools)." },
      comtechDice: { type: "integer", minimum: 1, default: 5, description: "Base dice for the best Comtech repair roll (Wits + skill + tools)." },
      buyParts: { type: "boolean", default: true, description: "Buy missing spare parts in port (p. 147)." },
      provisionsTarget: { type: "integer", minimum: 0, default: 120, description: "Top food and water up to this many person-days ($12 each, p. 99)." },
      dockingFees: { type: "number", minimum: 0, default: 0, description: "Your own figure: the book prices no docking fees." },
      fuel: { type: "number", minimum: 0, default: 0, description: "Your own figure: the book prices no fuel." },
      frame: { type: "string", enum: ["space-truckers", "colonial-marines", "frontier-colonists"], default: "space-truckers", description: "For the next job." },
      pcCount: { type: "integer", minimum: 1, default: 4 },
      livingStandard: { type: "string", enum: ["minimum", "basic", "normal", "luxurious"], default: "normal", description: "For shore leave (p. 116)." },
    },
  },
  steps: [
    {
      id: "payment",
      title: "Collect the job's payment",
      page: 244,
      compute: (ctx): PaymentResult => {
        const job = snapshot(ctx, "job");
        if (!job) return { amount: 0, label: "No finished job chosen" };
        const amount = Math.max(0, Math.round(num(job.fields.payment)));
        return { job: job.id, name: job.name, amount, label: `${job.name}: ${usd(amount)}` };
      },
    },
    {
      id: "lease",
      title: "Ship lease",
      page: 121,
      compute: (ctx): LeaseResult => {
        const ship = snapshot(ctx, "ship");
        if (!ship) return { amount: 0, label: "No ship chosen" };
        const ownership = str(ship.fields.ownership, "company");
        if (ownership !== "leased") return { amount: 0, label: ownership === "owned" ? "Owned outright: no lease" : "Company ship: the owner pays its upkeep" };
        const weeks = weeksOf(ctx);
        const amount = Math.round((num(ship.fields.cost) * LEASE_RATE_PER_YEAR * weeks) / 52);
        return { amount, label: `${weeks} week${weeks === 1 ? "" : "s"} of a 2%-a-year lease on ${usd(num(ship.fields.cost))}: ${usd(amount)}` };
      },
    },
    {
      id: "hull",
      title: "Hull repairs (Heavy Machinery, one roll per shift)",
      page: [146, 147],
      compute: (ctx, rng): HullResult => {
        const ship = snapshot(ctx, "ship");
        const damage = Math.max(0, Math.floor(num(ship?.fields.hullDamage)));
        const shifts: HullResult["shifts"] = [];
        let repaired = 0;
        for (let shift = 1; repaired < damage && shift <= shiftsOf(ctx); shift++) {
          const r = baseRoll(rng, num(input(ctx, "heavyMachineryDice"), 5));
          shifts.push({ shift, ...r });
          repaired = Math.min(damage, repaired + r.successes);
        }
        const left = damage - repaired;
        const label = damage === 0 ? "No hull damage" : `${repaired} of ${damage} repaired in ${shifts.length} shift${shifts.length === 1 ? "" : "s"}${left ? `, ${left} left` : ""}. Needs a spacewalk or a dry dock.`;
        return { damage, repaired, left, shifts, label };
      },
    },
    {
      id: "parts",
      title: "Spare parts",
      page: 147,
      compute: (ctx): PartsResult => {
        const ship = snapshot(ctx, "ship");
        const list = components(ship);
        const need = { mechanical: list.reduce((n, c) => n + c.heavyMachinery, 0), electronic: list.reduce((n, c) => n + c.comtech, 0) };
        const have = parts(ship);
        const buying = input(ctx, "buyParts") !== false;
        const buy = buying ? { mechanical: Math.max(0, need.mechanical - have.mechanical), electronic: Math.max(0, need.electronic - have.electronic) } : { mechanical: 0, electronic: 0 };
        const cost = buy.mechanical * MECHANICAL_PART_COST + buy.electronic * ELECTRONIC_PART_COST;
        const label =
          need.mechanical + need.electronic === 0
            ? "No component repairs need parts"
            : `Need ${need.mechanical} mechanical and ${need.electronic} electronic, have ${have.mechanical} and ${have.electronic}${cost ? `; buy ${buy.mechanical} + ${buy.electronic} for ${usd(cost)}` : ""}`;
        return { need, have, buy, cost, label };
      },
    },
    {
      id: "components",
      title: "Component repairs (one roll per shift, a part per success)",
      page: [145, 147],
      reads: ["parts"],
      compute: (ctx, rng): ComponentsResult => {
        const ship = snapshot(ctx, "ship");
        const p = ctx.get<PartsResult>("parts");
        const stock = { mechanical: (p?.have.mechanical ?? 0) + (p?.buy.mechanical ?? 0), electronic: (p?.have.electronic ?? 0) + (p?.buy.electronic ?? 0) };
        const used = { mechanical: 0, electronic: 0 };
        const repairs = components(ship).map((c, i): RepairResult => {
          const own = rng.fork(`component:${i}`);
          const left = { heavyMachinery: c.heavyMachinery, comtech: c.comtech };
          const rolls: RepairResult["rolls"] = [];
          let shifts = 0;
          const budget = shiftsOf(ctx);
          if (c.heavyMachinery + c.comtech === 0) return { name: c.name, repaired: false, heavyMachinery: 0, comtech: 0, shifts: 0, rolls, summary: `${c.name}: no repair roll fixes this` };
          while ((left.heavyMachinery > 0 || left.comtech > 0) && shifts < budget) {
            const skill: "heavyMachinery" | "comtech" = left.heavyMachinery > 0 ? "heavyMachinery" : "comtech";
            const part = skill === "heavyMachinery" ? "mechanical" : "electronic";
            if (stock[part] - used[part] <= 0) break;
            shifts++;
            const r = baseRoll(own, num(input(ctx, skill === "heavyMachinery" ? "heavyMachineryDice" : "comtechDice"), 5));
            rolls.push({ skill, ...r });
            if (r.successes > 0) {
              left[skill]--;
              used[part]++;
            }
          }
          const repaired = left.heavyMachinery === 0 && left.comtech === 0;
          const blocked = !repaired && shifts < budget;
          const summary = repaired
            ? `${c.name}: repaired in ${shifts} shift${shifts === 1 ? "" : "s"}`
            : `${c.name}: ${left.heavyMachinery} Heavy Machinery and ${left.comtech} Comtech roll${left.heavyMachinery + left.comtech === 1 ? "" : "s"} still to make${blocked ? " (out of spare parts)" : ""}`;
          return { name: c.name, repaired, heavyMachinery: left.heavyMachinery, comtech: left.comtech, shifts, rolls, summary };
        });
        const done = repairs.filter((r) => r.repaired).length;
        return { repairs, used, label: repairs.length ? `${done} of ${repairs.length} repaired; parts used: ${used.mechanical} mechanical, ${used.electronic} electronic` : "Nothing damaged" };
      },
    },
    {
      id: "resupply",
      title: "Food and water",
      page: 99,
      compute: (ctx): CostResult => {
        const ship = snapshot(ctx, "ship");
        const have = Math.max(0, Math.floor(num(ship?.fields.provisions)));
        const target = Math.max(0, Math.floor(num(input(ctx, "provisionsTarget"), 120)));
        const personDays = ship ? Math.max(0, target - have) : 0;
        const amount = personDays * PROVISIONS_PER_DAY;
        return { amount, personDays, label: personDays ? `${personDays} person-days at $${PROVISIONS_PER_DAY}: ${usd(amount)}` : `Stocked: ${have} person-days aboard` };
      },
    },
    {
      id: "fees",
      title: "Docking and fuel (your own figures)",
      compute: (ctx): CostResult => {
        const docking = Math.max(0, num(input(ctx, "dockingFees")));
        const fuel = Math.max(0, num(input(ctx, "fuel")));
        return { amount: docking + fuel, label: docking + fuel ? `Docking ${usd(docking)}, fuel ${usd(fuel)}` : "None entered" };
      },
    },
    {
      id: "shoreLeave",
      title: "Shore leave",
      page: 257,
      compute: (ctx) => {
        const weeks = weeksOf(ctx);
        return { weeks, label: weeks ? `${weeks} week${weeks === 1 ? "" : "s"}: run the shore leave week ${weeks === 1 ? "once" : `${weeks} times`} (chained below); each PC pays living expenses from their own cash (p. 116)` : "No shore leave" };
      },
    },
    {
      id: "nextJob",
      title: "Next job",
      page: 244,
      compute: () => ({ label: "Roll the next job with the job generator (chained below)" }),
    },
    {
      id: "effects",
      title: "Ledger postings and ship changes",
      reads: ["payment", "lease", "hull", "parts", "components", "resupply", "fees"],
      compute: (ctx): Effect[] => {
        const ship = snapshot(ctx, "ship");
        const job = snapshot(ctx, "job");
        const links = { ...(ship ? { ship: ship.id } : {}), ...(job ? { job: job.id } : {}) };
        const post = (amount: number, category: string, note: string, extra: Partial<LedgerEffect> = {}): LedgerEffect => ({ kind: "ledger", amount, category, note, links, ...extra });
        const effects: Effect[] = [];
        const pay = ctx.get<PaymentResult>("payment");
        if (pay && pay.job && pay.amount > 0) {
          effects.push(post(pay.amount, LEDGER.jobPayment, `Payment: ${pay.name}`, { key: `job-payment:${pay.job}`, links: { ...links, job: pay.job } }));
          effects.push({ kind: "setField", entity: pay.job, path: "status", value: "done" });
        }
        const lease = ctx.get<LeaseResult>("lease");
        if (lease && lease.amount > 0) effects.push(post(-lease.amount, LEDGER.lease, lease.label));
        const p = ctx.get<PartsResult>("parts");
        if (p && p.cost > 0) effects.push(post(-p.cost, LEDGER.spareParts, `${p.buy.mechanical} mechanical and ${p.buy.electronic} electronic spare parts`));
        const supply = ctx.get<CostResult>("resupply");
        if (supply && supply.amount > 0) effects.push(post(-supply.amount, LEDGER.provisions, `Food and water: ${supply.personDays} person-days`));
        const docking = Math.max(0, num(input(ctx, "dockingFees")));
        const fuel = Math.max(0, num(input(ctx, "fuel")));
        if (docking > 0) effects.push(post(-docking, LEDGER.docking, "Docking fees"));
        if (fuel > 0) effects.push(post(-fuel, LEDGER.fuel, "Fuel"));
        if (ship) {
          const hull = ctx.get<HullResult>("hull");
          if (hull && hull.repaired > 0) effects.push({ kind: "incrementField", entity: ship.id, path: "hullDamage", by: -hull.repaired, min: 0 });
          const comps = ctx.get<ComponentsResult>("components");
          if (comps && comps.repairs.length > 0) {
            const left = components(ship)
              .map((c, i) => ({ c, r: comps.repairs[i] }))
              .filter(({ r }) => !r?.repaired)
              .map(({ c, r }) => ({ ...c, heavyMachinery: r?.heavyMachinery ?? c.heavyMachinery, comtech: r?.comtech ?? c.comtech }));
            if (left.length !== comps.repairs.length || comps.used.mechanical + comps.used.electronic > 0) effects.push({ kind: "setField", entity: ship.id, path: "componentDamage", value: left });
          }
          if (p && comps && (p.buy.mechanical || p.buy.electronic || comps.used.mechanical || comps.used.electronic)) {
            effects.push({
              kind: "setField",
              entity: ship.id,
              path: "spareParts",
              value: { mechanical: p.have.mechanical + p.buy.mechanical - comps.used.mechanical, electronic: p.have.electronic + p.buy.electronic - comps.used.electronic },
            });
          }
          if (supply && (supply.personDays ?? 0) > 0) effects.push({ kind: "incrementField", entity: ship.id, path: "provisions", by: supply.personDays ?? 0 });
        }
        return effects;
      },
    },
    {
      id: "balance",
      title: "Net change to crew funds",
      reads: ["effects"],
      compute: (ctx) => {
        const effects = ctx.get<Effect[]>("effects") ?? [];
        const net = effects.reduce((n, e) => (e.kind === "ledger" ? n + e.amount : n), 0);
        return { net, label: `${net >= 0 ? "+" : "−"}${usd(Math.abs(net))}` };
      },
    },
  ],
  produce: () => ({ entities: [], relationships: [] }),
  chains: [
    { procedure: "alien.shore-leave", label: "Shore leave week", inputs: (ctx) => ({ livingStandard: str(input(ctx, "livingStandard"), "normal") }) },
    { procedure: "alien.job.create", label: "Roll the next job", inputs: (ctx) => ({ frame: str(input(ctx, "frame"), "space-truckers"), pcCount: Math.max(1, Math.floor(num(input(ctx, "pcCount"), 4))) }) },
  ],
};
