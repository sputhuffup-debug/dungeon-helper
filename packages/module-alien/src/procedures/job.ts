/**
 * Job Generator (p. 244-252). The basics first: distance D6−1 systems,
 * difficulty D3, base payment (distance + difficulty) × PCs × $1,000. A
 * successful MANIPULATION roll raises the payment 20% per success, or a
 * success buys one roll on the frame's bonus table (inputs `paymentRaises`
 * and `bonusRolls`). Then the frame's tables: employer or sponsor (Colonial
 * Marines have none: orders come from Marine Corps HQ, p. 235), cargo or
 * mission, destination, one complication per point of difficulty and an
 * optional plot twist.
 *
 * Produces one job and one faction for the employer, linked by
 * `employer_of` (`sponsor_of` for expeditions), and chains into the Star
 * System Generator for the destination system.
 */
import type { Procedure, ProcedureContext, ProducedEntity } from "@campaign-forge/module-sdk";
import { frameKey, input, isObj, list, num, obj, str } from "./helpers";

const JOB_TYPE: Record<string, "job" | "mission" | "expedition"> = { truckers: "job", marines: "mission", colonists: "expedition" };

/** Marine forces the frame suggests as employers (p. 235). */
const MARINE_CORPS: Record<string, { name: string; allegiance: string }> = {
  uscmc: { name: "USCMC", allegiance: "uas" },
  "space-operating-forces": { name: "Space Operating Forces", allegiance: "upp" },
  "royal-marines-commandos": { name: "Royal Marines Commandos", allegiance: "3we" },
};

/**
 * Module decision: the book does not roll a star for the destination. To feed
 * the system generator, one of the star types of p. 236 is picked at random.
 */
const STAR_TYPES: Array<{ starClass: string; brightness: string }> = [
  { starClass: "K", brightness: "III" },
  { starClass: "G", brightness: "IV" },
  { starClass: "G", brightness: "V" },
  { starClass: "A", brightness: "D" },
  { starClass: "M", brightness: "V" },
  { starClass: "A", brightness: "V" },
];

function marineCorps(ctx: ProcedureContext): { name: string; allegiance: string } {
  return MARINE_CORPS[str(input(ctx, "marineCorps"), "uscmc")] ?? MARINE_CORPS.uscmc!;
}

function employerResult(ctx: ProcedureContext): { name: string; factionType: string; allegiance: string; summary: string } {
  if (frameKey(ctx) === "marines") {
    const corps = marineCorps(ctx);
    return { name: corps.name, factionType: "military", allegiance: corps.allegiance, summary: "Orders from Marine Corps HQ" };
  }
  const e = obj(ctx, "employer");
  const detail = isObj(e.detail) ? e.detail : undefined;
  const source = detail ?? e;
  return {
    name: str(source.name, str(source.label, "Unknown employer")),
    factionType: str(source.factionType, str(e.factionType, "other")),
    allegiance: str(source.allegiance, str(e.allegiance, "unknown")),
    summary: str(e.label),
  };
}

function destinationText(ctx: ProcedureContext): string {
  const d = obj(ctx, "destination");
  const base = str(d.destination, str(d.label));
  const ship = isObj(d.ship) ? str(d.ship.ship, str(d.ship.label)) : "";
  if (d.wreckage && isObj(d.near)) return `Wreckage${ship ? ` (${ship})` : ""} at: ${str(d.near.destination, str(d.near.label))}`;
  if (ship) return `${base} (${ship})`;
  return base;
}

export const jobCreate: Procedure = {
  id: "alien.job.create",
  name: "Job Generator",
  description: "Distance, difficulty and payment, then the frame's employer, bonus rewards, cargo or mission, destination, complications and an optional plot twist.",
  page: [244, 252],
  mode: ["campaign"],
  inputs: {
    type: "object",
    properties: {
      frame: { type: "string", enum: ["space-truckers", "colonial-marines", "frontier-colonists"], default: "space-truckers" },
      pcCount: { type: "integer", minimum: 1, default: 4 },
      paymentRaises: { type: "integer", minimum: 0, description: "MANIPULATION successes spent on +20% payment each (p. 244)." },
      bonusRolls: { type: "integer", minimum: 0, description: "MANIPULATION successes spent on bonus rewards, one roll each (p. 244). Marines: mercenary outfits only (p. 247)." },
      marineCorps: {
        type: "string",
        enum: ["uscmc", "space-operating-forces", "royal-marines-commandos"],
        description: "Colonial Marines only: the corps giving the orders (p. 235). USCMC when absent.",
      },
    },
  },
  steps: [
    { id: "distance", title: "Distance (D6−1 systems)", page: 244, compute: (_ctx, rng) => rng.int(1, 6) - 1 },
    { id: "difficulty", title: "Difficulty (D3)", page: 244, compute: (_ctx, rng) => rng.int(1, 3) },
    {
      id: "payment",
      title: "Payment",
      page: 244,
      reads: ["distance", "difficulty"],
      compute: (ctx) => {
        const base = (num(ctx.get("distance")) + num(ctx.get("difficulty"))) * Math.max(1, num(input(ctx, "pcCount"), 4)) * 1000;
        const raises = Math.max(0, Math.floor(num(input(ctx, "paymentRaises"))));
        return Math.round(base * (1 + 0.2 * raises));
      },
    },
    {
      id: "employer",
      title: "Employer or sponsor",
      page: 244,
      table: (ctx) => `alien.jobs.${frameKey(ctx) === "marines" ? "truckers" : frameKey(ctx)}.employer`,
      skipIf: (ctx) => frameKey(ctx) === "marines",
    },
    {
      id: "bonus",
      title: "Bonus rewards (one per success spent)",
      page: 244,
      table: (ctx) => `alien.jobs.${frameKey(ctx)}.bonus`,
      repeat: (ctx) => Math.max(0, Math.floor(num(input(ctx, "bonusRolls")))),
    },
    { id: "mission", title: "Cargo or mission", table: (ctx) => `alien.jobs.${frameKey(ctx)}.mission` },
    { id: "destination", title: "Destination", table: (ctx) => `alien.jobs.${frameKey(ctx)}.destination` },
    {
      id: "complications",
      title: "Complications (one per point of difficulty)",
      table: (ctx) => `alien.jobs.${frameKey(ctx)}.complications`,
      reads: ["difficulty"],
      repeat: (ctx) => Math.max(1, num(ctx.get("difficulty"), 1)),
    },
    { id: "plotTwist", title: "Plot twist", table: "alien.jobs.plot-twist", optional: true, page: 252 },
    {
      id: "destinationStar",
      title: "Destination star (for the system generator)",
      page: 236,
      compute: (_ctx, rng) => ({ ...(STAR_TYPES[rng.int(0, STAR_TYPES.length - 1)] ?? STAR_TYPES[2]!) }),
    },
  ],
  produce: (ctx) => {
    const key = frameKey(ctx);
    const frame = str(input(ctx, "frame"), "space-truckers");
    const mission = obj(ctx, "mission");
    const employer = employerResult(ctx);
    const complications = list(ctx, "complications").map((c) => str(c.complication, str(c.label)));
    const twist = str(obj(ctx, "plotTwist").twist);
    const missionText = key === "truckers" ? undefined : str(mission.mission, str(mission.label));
    const cargo = key === "truckers" ? str(mission.cargo, str(mission.label)) : undefined;
    const title = key === "truckers" ? `Haul ${cargo} for ${employer.name}` : `${missionText} for ${employer.name}`;
    const bonusRewards = list(ctx, "bonus").map((b) => str(b.bonus, str(b.label))).filter(Boolean);
    const job: ProducedEntity = {
      tempId: "job",
      type: "alien.job",
      name: title,
      summary: `${JOB_TYPE[key]} · distance ${num(ctx.get("distance"))} · difficulty ${num(ctx.get("difficulty"))} · $${num(ctx.get("payment")).toLocaleString("en-US")}`,
      tags: [frame, JOB_TYPE[key] ?? "job"],
      fields: {
        frame,
        jobType: JOB_TYPE[key] ?? "job",
        distance: num(ctx.get("distance")),
        difficulty: num(ctx.get("difficulty")),
        payment: num(ctx.get("payment")),
        employer: employer.name,
        bonusRewards,
        ...(missionText !== undefined ? { mission: missionText } : {}),
        ...(cargo !== undefined ? { cargo } : {}),
        destination: destinationText(ctx),
        complications,
        ...(twist ? { plotTwist: twist } : {}),
        status: "offered",
      },
    };
    const faction: ProducedEntity = {
      tempId: "employer",
      type: "alien.faction",
      name: employer.name,
      summary: employer.summary,
      fields: { factionType: employer.factionType, allegiance: employer.allegiance, minor: true, reputation: 0 },
    };
    return {
      entities: [job, faction],
      relationships: [{ type: key === "colonists" ? "sponsor_of" : "employer_of", from: "employer", to: "job" }],
    };
  },
  chains: [
    {
      procedure: "alien.system.create",
      label: "Generate the destination system",
      inputs: (ctx) => {
        const star = obj(ctx, "destinationStar");
        return { starClass: str(star.starClass, "G"), brightness: str(star.brightness, "V"), region: "frontier", name: destinationText(ctx) };
      },
    },
  ],
};
