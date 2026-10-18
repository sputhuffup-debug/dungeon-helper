/**
 * Job Generator (p. 244-251). Preamble: distance (D6−1), difficulty (D3),
 * payment ((distance + difficulty) × PCs × $1,000). Then the frame's pipeline:
 * employer (with nested detail), bonus, mission or cargo, destination,
 * complications (one per point of difficulty), optional plot twist. Produces
 * one job and one faction for the employer, linked by `employer_of`
 * (`sponsor_of` for expeditions), and chains into the Star System Generator.
 */
import type { Procedure, ProcedureContext, ProducedEntity } from "@campaign-forge/module-sdk";
import { frameKey, input, isObj, list, num, obj, str } from "./helpers";

const JOB_TYPE: Record<string, "job" | "mission" | "expedition"> = { truckers: "job", marines: "mission", colonists: "expedition" };
const STAR_CLASSES = ["O", "B", "A", "F", "G", "K", "M"];
const BRIGHTNESS = ["Ia", "Ib", "II", "III", "IV", "V", "D"];

function employerName(ctx: ProcedureContext): string {
  const e = obj(ctx, "employer");
  const detail = isObj(e.detail) ? e.detail : {};
  return str(detail.name, str(e.label, "Unknown employer"));
}

function employerFactionType(ctx: ProcedureContext): string {
  const e = obj(ctx, "employer");
  const detail = isObj(e.detail) ? e.detail : {};
  return str(detail.factionType, "other");
}

function destinationText(ctx: ProcedureContext): string {
  const d = obj(ctx, "destination");
  const base = str(d.destination, str(d.label));
  if (d.wreckage && isObj(d.near)) return `Wreckage near: ${str(d.near.destination, str(d.near.label))}`;
  return base;
}

export const jobCreate: Procedure = {
  id: "alien.job.create",
  name: "Job Generator",
  description: "Distance, difficulty and payment, then the frame's employer, bonus, mission, destination, complications and an optional plot twist.",
  page: [244, 251],
  mode: ["campaign"],
  inputs: {
    type: "object",
    properties: {
      frame: { type: "string", enum: ["space-truckers", "colonial-marines", "frontier-colonists"], default: "space-truckers" },
      pcCount: { type: "integer", minimum: 1, default: 4 },
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
      compute: (ctx) => (num(ctx.get("distance")) + num(ctx.get("difficulty"))) * Math.max(1, num(input(ctx, "pcCount"), 4)) * 1000,
    },
    { id: "employer", title: "Employer or sponsor", table: (ctx) => `alien.jobs.${frameKey(ctx)}.employer` },
    { id: "bonus", title: "Bonus rewards", table: (ctx) => `alien.jobs.${frameKey(ctx)}.bonus` },
    { id: "mission", title: "Mission or cargo", table: (ctx) => `alien.jobs.${frameKey(ctx)}.mission` },
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
      compute: (_ctx, rng) => ({
        starClass: STAR_CLASSES[rng.int(0, STAR_CLASSES.length - 1)] ?? "G",
        brightness: BRIGHTNESS[rng.int(0, BRIGHTNESS.length - 1)] ?? "V",
      }),
    },
  ],
  produce: (ctx) => {
    const key = frameKey(ctx);
    const frame = str(input(ctx, "frame"), "space-truckers");
    const mission = obj(ctx, "mission");
    const employer = employerName(ctx);
    const complications = list(ctx, "complications").map((c) => str(c.complication, str(c.label)));
    const twist = str(obj(ctx, "plotTwist").twist);
    const missionText = key === "truckers" ? undefined : str(mission.mission, str(mission.label));
    const cargo = key === "truckers" ? str(mission.cargo, str(mission.label)) : undefined;
    const title = key === "truckers" ? `Haul ${cargo} for ${employer}` : `${missionText} for ${employer}`;
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
        employer,
        bonusRewards: [str(obj(ctx, "bonus").bonus, str(obj(ctx, "bonus").label))].filter(Boolean),
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
      name: employer,
      summary: str(obj(ctx, "employer").label),
      fields: { factionType: employerFactionType(ctx), allegiance: "unknown", minor: true, reputation: 0 },
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
