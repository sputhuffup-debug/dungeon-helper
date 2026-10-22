/**
 * The travel log and the group's vehicle. A leg goes from one place to
 * another; departing records the leg, rolls the module's arrival checks with
 * a seeded RNG (kept on the leg), applies the suggested effects and moves the
 * campaign's in-world date to the arrival day.
 *
 * Game-agnostic: travel time and checks come from the module's `TravelDef`;
 * the vehicle setting from its `CrewShipDef`.
 */
import {
  addDaysToDate,
  assertAllUsed,
  computeFields,
  createEnteredRng,
  createRng,
  createTableRegistry,
  isEnteredRng,
  type CalendarDef,
  type CrewShipDef,
  type GameModule,
  type TravelDef,
  type TravelEndpoint,
  type TravelEntity,
  type TravelOutcome,
  type TravelPlan,
  type TravelRequest,
  type Rng,
} from "@campaign-forge/module-sdk";
import { applyEffects, type ApplyEffectsResult } from "./effects";
import { clone } from "./paths";
import type { CampaignStore, NewRecord } from "./store";
import type { Entity, Id, TravelLeg, Visibility } from "./types";
import { findEntityType } from "./visibility";

const GM: Visibility = { level: "gm" };

export type TravelModule = Pick<GameModule, "entityTypes" | "calendar" | "tables"> & Partial<Pick<GameModule, "travel" | "crewShip" | "ledger">>;

// ---------------------------------------------------------------------------
// the group's vehicle and where it is
// ---------------------------------------------------------------------------

/** The chosen vehicle entity, when the setting names one that exists and has an allowed type. */
export function crewShip(store: CampaignStore, def: CrewShipDef | undefined): Entity | undefined {
  if (!def) return undefined;
  const id = store.meta().settings?.[def.setting];
  if (typeof id !== "string") return undefined;
  const e = store.get("entities", id);
  return e && def.entityTypes.includes(e.type) ? e : undefined;
}

/** Choose (or clear) the group's vehicle. */
export function setCrewShip(store: CampaignStore, def: CrewShipDef, shipId: Id | undefined): void {
  const settings = { ...(store.meta().settings ?? {}) };
  if (shipId) settings[def.setting] = shipId;
  else delete settings[def.setting];
  store.updateMeta({ settings });
}

/** Travel legs, oldest first (by arrival date as entered, then creation). */
export function travelLog(store: CampaignStore, opts: { ship?: Id } = {}): TravelLeg[] {
  return store
    .list("travel")
    .filter((l) => opts.ship === undefined || l.ship === opts.ship)
    .sort((a, b) => a.created.localeCompare(b.created) || a.id.localeCompare(b.id));
}

/**
 * Where the vehicle (or the group) is: the destination of its latest arrived
 * leg, else the location setting, else what the vehicle is `found_at`.
 */
export function currentLocation(store: CampaignStore, opts: { ship?: Id; locationSetting?: string } = {}): Entity | undefined {
  const arrived = travelLog(store, opts.ship ? { ship: opts.ship } : {}).filter((l) => l.status === "arrived");
  const last = arrived.at(-1);
  if (last && store.has("entities", last.to)) return store.get("entities", last.to);
  if (opts.locationSetting) {
    const id = store.meta().settings?.[opts.locationSetting];
    if (typeof id === "string" && store.has("entities", id)) return store.get("entities", id);
  }
  if (opts.ship) {
    const rel = store.list("relationships").find((r) => r.type === "found_at" && r.from === opts.ship);
    if (rel && store.has("entities", rel.to)) return store.get("entities", rel.to);
  }
  return undefined;
}

/** The distance of the latest leg between two places (either way round), to suggest it again. */
export function knownDistance(store: CampaignStore, a: Id | undefined, b: Id): number | undefined {
  if (!a) return undefined;
  const legs = travelLog(store).filter((l) => l.status !== "cancelled" && ((l.from === a && l.to === b) || (l.from === b && l.to === a)));
  return legs.at(-1)?.distance;
}

// ---------------------------------------------------------------------------
// planning and departing
// ---------------------------------------------------------------------------

function snapshot(module: TravelModule, e: Entity): TravelEntity {
  const def = findEntityType(module, e.type);
  let computed: Record<string, unknown> = {};
  try {
    computed = def ? computeFields(def, e.fields) : {};
  } catch {
    computed = {};
  }
  return { id: e.id, name: e.name, type: e.type, fields: clone(e.fields), computed };
}

function endpoint(e: Entity): TravelEndpoint {
  const out: TravelEndpoint = { id: e.id, name: e.name, type: e.type, fields: clone(e.fields) };
  if (e.subtype) out.subtype = e.subtype;
  return out;
}

export interface TravelInput {
  ship?: Id;
  from?: Id;
  to: Id;
  distance: number;
  options?: Record<string, unknown>;
  /** Override the module's travel time (whole days). */
  days?: number;
}

/** The module's request for a trip, built from campaign entities. */
export function travelRequest(store: CampaignStore, module: TravelModule, input: TravelInput): TravelRequest {
  const to = store.get("entities", input.to);
  if (!to) throw new Error(`entities/${input.to} not found`);
  const req: TravelRequest = { destination: endpoint(to), distance: Math.max(0, Number(input.distance) || 0), options: clone(input.options ?? {}) };
  const ship = input.ship ? store.get("entities", input.ship) : undefined;
  if (ship) req.ship = snapshot(module, ship);
  const from = input.from ? store.get("entities", input.from) : undefined;
  if (from) req.origin = endpoint(from);
  if (input.days !== undefined && Number.isFinite(input.days)) req.days = Math.max(0, Math.round(input.days));
  return req;
}

/** Plan a trip with the module's travel rule. */
export function planTravel(store: CampaignStore, module: TravelModule, input: TravelInput): TravelPlan {
  const travel = requireTravel(module);
  return travel.plan(travelRequest(store, module, input));
}

function requireTravel(module: TravelModule): TravelDef {
  if (!module.travel) throw new Error("this module has no travel rules");
  return module.travel;
}

/** The arrival date for a trip of `days` from `date`, on the module calendar. */
export function arrivalDate(calendar: CalendarDef, date: string | undefined, days: number): string | undefined {
  return date ? addDaysToDate(calendar, date, days) : undefined;
}

export interface DepartOptions extends TravelInput {
  /** Seed for the arrival rolls (recorded on the leg). */
  seed: string;
  /** Faces of arrival dice rolled at the table, in the order the module rolls them (recorded on the leg). */
  entered?: number[];
  session?: Id;
  note?: string;
  /** Apply the module's arrival effects now (default true); otherwise they wait on the leg. */
  applyEffects?: boolean;
  /** Move the vehicle's `found_at` link to the destination (default true). */
  moveVehicle?: boolean;
  /** Add a timeline entry for the arrival (default true). */
  timeline?: boolean;
  visibility?: Visibility;
}

export interface DepartResult {
  leg: TravelLeg;
  plan: TravelPlan;
  outcome: TravelOutcome;
  applied?: ApplyEffectsResult;
}

/**
 * The arrival checks `departTravel` rolls, as a pure function of their Rng:
 * to ask a GM who rolls physical dice for the right dice in the right order.
 */
export function travelArrivalRun(store: CampaignStore, module: TravelModule, input: TravelInput): (rng: Rng) => unknown {
  const travel = requireTravel(module);
  const req = travelRequest(store, module, input);
  const plan = travel.plan(req);
  const tables = createTableRegistry(module.tables);
  return (rng) => travel.arrive(req, plan, rng, tables);
}

/**
 * Travel now: record the leg as arrived, roll the arrival checks from `seed`,
 * apply their effects, move the in-world date forward by the trip's days and
 * keep the location setting and the vehicle's `found_at` link in step.
 */
export function departTravel(store: CampaignStore, module: TravelModule, opts: DepartOptions): DepartResult {
  const travel = requireTravel(module);
  const req = travelRequest(store, module, opts);
  const plan = travel.plan(req);
  if (plan.blocked) throw new Error(plan.blocked);
  const days = Math.max(0, Math.round(plan.days));
  const effectivePlan = plan;
  const seeded = createRng(`travel:${opts.seed}`);
  const rng = opts.entered ? createEnteredRng(opts.entered, { fallback: seeded }) : seeded;
  const outcome = travel.arrive(req, plan, rng, createTableRegistry(module.tables));
  if (isEnteredRng(rng)) assertAllUsed(rng);
  const meta = store.meta();
  const departDate = meta.currentDate;
  const arriveDate = arrivalDate(module.calendar, departDate, days);

  return store.transact(() => {
    const rec: NewRecord<"travel"> = {
      to: req.destination.id,
      toName: req.destination.name,
      distance: req.distance,
      days,
      status: "arrived",
      seed: opts.seed,
      ...(opts.entered ? { entered: [...opts.entered] } : {}),
      rolls: clone(outcome.rolls),
      log: [...outcome.log],
      effects: clone(outcome.effects),
      effectsApplied: false,
      summary: effectivePlan.summary,
      options: clone(req.options),
      visibility: opts.visibility ?? GM,
    };
    if (req.ship) rec.ship = req.ship.id;
    if (req.origin) {
      rec.from = req.origin.id;
      rec.fromName = req.origin.name;
    }
    if (departDate) rec.departDate = departDate;
    if (arriveDate) rec.arriveDate = arriveDate;
    if (opts.session) rec.session = opts.session;
    if (opts.note?.trim()) rec.note = opts.note.trim();
    let leg = store.insert("travel", rec);

    const settings = { ...(store.meta().settings ?? {}) };
    const locationSetting = module.crewShip?.locationSetting;
    if (locationSetting) settings[locationSetting] = req.destination.id;
    store.updateMeta({ ...(arriveDate ? { currentDate: arriveDate } : {}), settings });

    if (req.ship && opts.moveVehicle !== false) {
      for (const r of store.list("relationships")) if (r.type === "found_at" && r.from === req.ship.id) store.remove("relationships", r.id);
      store.createRelationship("found_at", req.ship.id, req.destination.id, `Arrived ${arriveDate ?? ""}`.trim());
    }
    if (opts.timeline !== false && arriveDate) {
      const who = req.ship?.name ?? "The group";
      store.createTimelineEvent({
        inWorldDate: arriveDate,
        text: `${who} arrives at ${req.destination.name}${req.origin ? ` from ${req.origin.name}` : ""} after ${days} day${days === 1 ? "" : "s"}.`,
        entities: [...(req.ship ? [req.ship.id] : []), req.destination.id],
        ...(opts.session ? { session: opts.session } : {}),
      });
    }

    let applied: ApplyEffectsResult | undefined;
    if (opts.applyEffects !== false && outcome.effects.length > 0) {
      applied = applyLegEffects(store, module, leg.id, opts.session);
      leg = store.get("travel", leg.id)!;
    }
    const result: DepartResult = { leg, plan: { ...effectivePlan, days }, outcome };
    if (applied) result.applied = applied;
    return result;
  });
}

/** Apply a leg's stored arrival effects once (ledger postings link back to the leg). */
export function applyLegEffects(store: CampaignStore, module: Pick<TravelModule, "ledger">, legId: Id, sessionId?: Id): ApplyEffectsResult | undefined {
  const leg = store.get("travel", legId);
  if (!leg || leg.effectsApplied || !leg.effects?.length) return undefined;
  const links = { travel: leg.id, ...(leg.ship ? { ship: leg.ship } : {}) };
  const res = applyEffects(store, leg.effects, {
    ...(sessionId ? { sessionId } : {}),
    ledgerLinks: links,
    ledgerSource: { kind: "travel", id: leg.id },
    ...(module.ledger ? { currency: module.ledger.currency } : {}),
  });
  store.update("travel", leg.id, { effectsApplied: true });
  return res;
}
