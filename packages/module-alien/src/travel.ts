/**
 * FTL travel (p. 108-110). Travel time is the ship's FTL rating (days per
 * parsec) times the distance in parsecs, counted off the star map (one
 * square is one parsec). On arrival:
 *  - anyone who stayed awake has rolled for Neurological Distortion Disorder
 *    after each period of days equal to the FTL rating, +1 per roll after
 *    the first (p. 109); dementia outlasts the trip by D6 days;
 *  - everyone who slept in hypersleep wakes fatigued (p. 110, 75);
 *  - each day awake used a day of food and water per person (p. 75, 99),
 *    taken from the ship's provisions.
 * Androids are exempt: NDD is a disorder of mammals (p. 108) and androids
 * never become fatigued (p. 75). They eat nothing (module decision).
 *
 * Damage the ship carries changes the trip: a disabled ship or a failed
 * displacement drive cannot jump (p. 146); offline cryo chambers keep
 * everyone awake (p. 145); a malfunctioning drive or navigation system is
 * flagged for the GM (p. 145). The book gives no time for travel inside one
 * system, so a distance of 0 takes the days the GM enters.
 */
import { rollTable, type Effect, type RollRecord, type TravelCheck, type TravelDef, type TravelPlan, type TravelRequest } from "@campaign-forge/module-sdk";
import { CAMPAIGN } from "./modes";
import { NDD_TABLE } from "./tables/ships";

export const FATIGUED_CONDITION = { id: "alien.fatigued", label: "Fatigued", source: "Hypersleep", page: 110 } as const;

interface CrewMember {
  id: string;
  name: string;
  awake: boolean;
  android: boolean;
}

const num = (v: unknown, fallback = 0): number => (typeof v === "number" && Number.isFinite(v) ? v : fallback);
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

function crewOf(req: TravelRequest): CrewMember[] {
  const raw = req.options.crew;
  if (!Array.isArray(raw)) return [];
  return raw.filter(isObj).map((c, i) => ({
    id: typeof c.id === "string" ? c.id : `crew-${i + 1}`,
    name: typeof c.name === "string" ? c.name : `Crew member ${i + 1}`,
    awake: c.awake === true,
    android: c.android === true,
  }));
}

interface Damage {
  name: string;
  severity: string;
  system: string;
}

function damageOf(req: TravelRequest): Damage[] {
  const raw = req.ship?.fields.componentDamage;
  if (!Array.isArray(raw)) return [];
  return raw.filter(isObj).map((d) => ({ name: String(d.name ?? ""), severity: String(d.severity ?? "minor"), system: String(d.system ?? "") }));
}

function shipState(req: TravelRequest) {
  const fields = req.ship?.fields ?? {};
  const damage = damageOf(req);
  const has = (system: string, severity?: string) => damage.some((d) => d.system === system && (!severity || d.severity === severity));
  const hull = num(fields.hull);
  return {
    ftl: num(fields.ftl),
    disabled: req.ship?.computed?.disabled === true || (hull > 0 && num(fields.hullDamage) >= hull),
    driveFailed: has("ftl-drive", "major"),
    driveMalfunction: has("ftl-drive", "minor"),
    navigationOffline: has("navigation"),
    cryoOffline: has("cryo"),
    airScrubbersOffline: has("air-scrubbers"),
    provisions: num(fields.provisions),
  };
}

/** Who stays awake: everyone when the cryo chambers are down (p. 145). */
function awakeCrew(req: TravelRequest, cryoOffline: boolean): CrewMember[] {
  return crewOf(req).filter((c) => !c.android && (c.awake || cryoOffline));
}

function sleepers(req: TravelRequest, cryoOffline: boolean): CrewMember[] {
  return cryoOffline ? [] : crewOf(req).filter((c) => !c.android && !c.awake);
}

function plan(req: TravelRequest): TravelPlan {
  const notes: TravelPlan["notes"] = [];
  const s = shipState(req);
  const parsecs = Math.max(0, num(req.distance));
  const out = (days: number, summary: string, blocked?: string): TravelPlan => {
    const checks: TravelCheck[] = [];
    const awake = awakeCrew(req, s.cryoOffline);
    if (parsecs > 0 && s.ftl > 0) {
      const periods = Math.floor(days / s.ftl);
      for (const c of awake) {
        if (periods > 0) checks.push({ id: `ndd:${c.id}`, label: `${c.name}: NDD roll${periods === 1 ? "" : "s"}`, entity: c.id, dice: "1d6", count: periods, when: "en-route", table: NDD_TABLE, page: 109 });
      }
      if (awake.length > 0) notes.push({ text: `Awake through FTL: an NDD roll after every ${s.ftl} days, +1 for each roll after the first.`, page: 109 });
    }
    for (const c of sleepers(req, s.cryoOffline)) checks.push({ id: `fatigue:${c.id}`, label: `${c.name}: hypersleep fatigue`, entity: c.id, count: 1, when: "arrival", page: 110 });
    const personDays = awake.length * days;
    if (personDays > 0) checks.push({ id: "provisions", label: `Food and water: ${personDays} person-days (${s.provisions} aboard)`, count: personDays, when: "en-route", page: 75 });
    const p: TravelPlan = { days, summary, checks, notes };
    if (blocked) p.blocked = blocked;
    return p;
  };

  if (!req.ship) return out(num(req.days), "No ship chosen", "Choose the crew's ship first.");
  if (s.disabled) return out(0, "The ship is disabled", "The ship is disabled: its hull damage has reached its Hull rating. Repair at least 1 point first (p. 146-147).");
  if (s.driveFailed) return out(0, "Displacement drive failure", "Displacement Drive Failure: no FTL travel until it is repaired (p. 146).");
  if (s.driveMalfunction) notes.push({ text: "Displacement Drive Malfunction: the FTL rating is halved until repaired. Set the travel time to suit.", page: 145 });
  if (s.navigationOffline) notes.push({ text: "Navigation System Offline: plotting the jump takes a Comtech roll at −2 dice.", page: 145 });
  if (s.cryoOffline) notes.push({ text: "Cryo Chambers Offline: nobody can sleep through the trip, so everyone rolls for NDD and eats.", page: 145 });
  if (s.airScrubbersOffline) notes.push({ text: "Air Scrubbers Offline: Stamina −2 dice for a shift, then the air is gone. Fix them before leaving.", page: 145 });
  notes.push({ text: "An engineer may overcharge the engines once a week: a Heavy Machinery roll cuts the FTL rating by 1 for a week, and failures risk the reactor.", page: [108, 109] });

  if (parsecs === 0) {
    const days = Math.max(0, Math.round(num(req.days)));
    notes.push({ text: "Same system: the book gives no in-system travel time, so the trip takes the days you set. Planetfall takes about a shift and a Piloting roll.", page: 109 });
    return out(days, `In-system trip: ${days} day${days === 1 ? "" : "s"}`);
  }
  if (s.ftl <= 0) return out(0, "No FTL drive", `${req.ship.name} has no FTL rating, so it cannot cross parsecs (p. 121).`);
  const ruled = parsecs * s.ftl;
  const days = req.days !== undefined ? Math.max(0, Math.round(req.days)) : ruled;
  const unit = parsecs === 1 ? "parsec" : "parsecs";
  const summary = days === ruled ? `${parsecs} ${unit} at FTL ${s.ftl}: ${days} days` : `${parsecs} ${unit} at FTL ${s.ftl} would take ${ruled} days; set to ${days}`;
  return out(days, summary);
}

function arrive(req: TravelRequest, travelPlan: TravelPlan, rng: Parameters<TravelDef["arrive"]>[2], tables: Parameters<TravelDef["arrive"]>[3]): ReturnType<TravelDef["arrive"]> {
  const rolls: RollRecord[] = [];
  const log: string[] = [];
  const effects: Effect[] = [];
  const s = shipState(req);
  const ndd = tables.get(NDD_TABLE);
  const crew = new Map(crewOf(req).map((c) => [c.id, c]));

  for (const check of travelPlan.checks) {
    if (check.id.startsWith("ndd:") && ndd && check.entity) {
      const who = crew.get(check.entity);
      const name = who?.name ?? check.entity;
      const own = rng.fork(check.entity);
      let worst: { rank: number; label: string; ndd: string } = { rank: 0, label: "No Effect", ndd: "none" };
      const ranks: Record<string, number> = { none: 0, paranoia: 1, epilepsy: 2, dementia: 3, psychosis: 4 };
      for (let i = 0; i < check.count; i++) {
        const day = (i + 1) * s.ftl;
        const rec = rollTable(ndd, own, tables, { step: `ndd:${name}`, iteration: i, context: { previousRolls: i } });
        rolls.push(rec);
        const result = (typeof rec.result === "object" && rec.result ? rec.result : {}) as Record<string, unknown>;
        const kind = String(result.ndd ?? "none");
        log.push(`Day ${day}: ${name} rolls ${rec.total} for NDD: ${rec.rowLabel ?? kind}.`);
        if ((ranks[kind] ?? 0) > worst.rank) worst = { rank: ranks[kind] ?? 0, label: rec.rowLabel ?? kind, ndd: kind };
      }
      if (worst.ndd === "dementia") {
        const days = own.fork("dementia").int(1, 6);
        log.push(`${name} stays demented for ${days} day${days === 1 ? "" : "s"} after arrival (p. 109).`);
        effects.push({ kind: "addCondition", entity: check.entity, condition: { id: "alien.ndd.dementia", label: `Dementia (NDD, ${days} days)`, source: "FTL travel", page: 109 } });
      } else if (worst.ndd === "psychosis") {
        effects.push({ kind: "log", text: `${name} suffered NDD psychosis en route: the GM plays out the rampage, and friendly PCs who saw it made panic rolls (p. 109).` });
      }
      continue;
    }
    if (check.id.startsWith("fatigue:") && check.entity) {
      const name = crew.get(check.entity)?.name ?? check.entity;
      log.push(`${name} comes out of hypersleep fatigued until a shift awake and a good meal, or a dose of Hydr8tion (p. 110).`);
      effects.push({ kind: "addCondition", entity: check.entity, condition: { ...FATIGUED_CONDITION } });
      continue;
    }
    if (check.id === "provisions" && req.ship) {
      const used = check.count;
      const left = s.provisions - used;
      if (left >= 0) log.push(`Food and water: ${used} person-days used, ${left} left aboard.`);
      else {
        const awake = Math.max(1, awakeCrew(req, s.cryoOffline).length);
        const day = Math.floor(s.provisions / awake) + 1;
        log.push(`Food and water ran out on day ${day}: after 24 hours without, those awake roll Survival every shift (p. 75).`);
      }
      effects.push({ kind: "incrementField", entity: req.ship.id, path: "provisions", by: -used, min: 0 });
    }
  }
  if (log.length === 0) log.push(`Arrived at ${req.destination.name} after ${travelPlan.days} days.`);
  return { rolls, log, effects };
}

export const travel: TravelDef = {
  distance: {
    unit: "parsec",
    plural: "parsecs",
    help: "Count squares on the star map: one square is one parsec. The job generator gives distance in systems (p. 244); pick a system that far away and count. 0 means the same system.",
    page: 108,
  },
  destinations: [{ entityType: "alien.location", subtypes: ["star-system", "planet", "colony", "site"] }],
  options: {
    type: "object",
    properties: {
      crew: {
        type: "array",
        title: "Crew",
        default: [],
        items: {
          type: "object",
          properties: {
            id: { type: "string" },
            name: { type: "string" },
            awake: { type: "boolean", default: false, title: "Stays awake", description: "Awake through FTL travel: rolls for NDD and eats (p. 109)." },
            android: { type: "boolean", default: false, title: "Android", description: "No NDD, no fatigue (p. 75, 108)." },
          },
          required: ["id", "name"],
        },
      },
    },
  },
  plan,
  arrive,
  page: [108, 110],
  mode: [CAMPAIGN],
  rules: ["alien.rule.ftl-travel", "alien.rule.hypersleep", "alien.rule.ndd", "alien.rule.arrival", "alien.rule.overcharging-engines", "alien.rule.food-water"],
};
