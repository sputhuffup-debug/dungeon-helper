/**
 * Life Path (p. 282-289): nine steps across the life path tables. Each
 * `after` hook attaches a running `cumulative` total of attribute and skill
 * deltas and the psych modifier, so every step's result shows the state so
 * far. Produces one player character with attributes starting at 2 plus the
 * deltas, skills from the deltas, and a `lifePath` provenance object.
 */
import type { Procedure, ProcedureContext, Rng } from "@campaign-forge/module-sdk";
import { clamp, isObj, num, obj, str } from "./helpers";

const ATTRIBUTES = ["strength", "agility", "wits", "empathy"] as const;
const SKILLS = [
  "heavyMachinery", "closeCombat", "stamina", "rangedCombat", "mobility", "piloting",
  "observation", "survival", "comtech", "manipulation", "command", "medicalAid",
] as const;

export interface Cumulative {
  attributes: Record<string, number>;
  skills: Record<string, number>;
  psych: number;
}

const STEP_ORDER = ["humanOrAndroid", "origin", "earlyLife", "lifeEvent", "careerEntry", "favors", "disasters", "posting", "psych"] as const;

function emptyCumulative(): Cumulative {
  return { attributes: {}, skills: {}, psych: 0 };
}

function addDeltas(acc: Cumulative, result: unknown): Cumulative {
  if (!isObj(result)) return acc;
  const next: Cumulative = { attributes: { ...acc.attributes }, skills: { ...acc.skills }, psych: acc.psych };
  if (isObj(result.attributes)) for (const [k, v] of Object.entries(result.attributes)) next.attributes[k] = (next.attributes[k] ?? 0) + num(v);
  if (isObj(result.skills)) for (const [k, v] of Object.entries(result.skills)) next.skills[k] = (next.skills[k] ?? 0) + num(v);
  next.psych += num(result.psych);
  return next;
}

/** Cumulative deltas over every step that ran before `stepId`. */
export function cumulativeBefore(ctx: ProcedureContext, stepId: string): Cumulative {
  let acc = emptyCumulative();
  for (const id of STEP_ORDER) {
    if (id === stepId) break;
    acc = addDeltas(acc, ctx.get(id));
  }
  return acc;
}

function accumulate(stepId: string) {
  return (ctx: ProcedureContext, result: unknown, _rng: Rng): unknown => {
    const before = cumulativeBefore(ctx, stepId);
    const base = isObj(result) ? result : { value: result };
    return { ...base, cumulative: addDeltas(before, result) };
  };
}

const CAREER_TABLES: Record<string, string> = {
  "colonial-marine": "alien.lifepath.posting.colonial-marine",
  "colonial-marshal": "alien.lifepath.posting.colonial-marshal",
  "company-agent": "alien.lifepath.posting.company-agent",
  kid: "alien.lifepath.posting.kid",
  medic: "alien.lifepath.posting.medic",
  officer: "alien.lifepath.posting.officer",
  pilot: "alien.lifepath.posting.pilot",
  roughneck: "alien.lifepath.posting.roughneck",
  scientist: "alien.lifepath.posting.scientist",
};

function careerOf(ctx: ProcedureContext): string {
  const c = str(obj(ctx, "careerEntry").career);
  return CAREER_TABLES[c] ? c : "roughneck";
}

export const lifepath: Procedure = {
  id: "alien.lifepath",
  name: "Life Path",
  description: "Nine rolls that build a campaign-play character with provenance for every step.",
  page: [282, 289],
  mode: ["campaign"],
  inputs: {
    type: "object",
    properties: {
      name: { type: "string", description: "Character name; a placeholder is used when absent." },
    },
  },
  steps: [
    { id: "humanOrAndroid", title: "Human or android", table: "alien.lifepath.human-or-android", after: accumulate("humanOrAndroid") },
    { id: "origin", title: "Origin", table: "alien.lifepath.origin", after: accumulate("origin") },
    { id: "earlyLife", title: "Early life", table: "alien.lifepath.early-life", after: accumulate("earlyLife") },
    { id: "lifeEvent", title: "Life event", table: "alien.lifepath.life-event", after: accumulate("lifeEvent") },
    { id: "careerEntry", title: "Career entry", table: "alien.lifepath.career-entry", after: accumulate("careerEntry") },
    { id: "favors", title: "Favors", table: "alien.lifepath.favors", after: accumulate("favors") },
    { id: "disasters", title: "Disasters", table: "alien.lifepath.disasters", after: accumulate("disasters") },
    {
      id: "posting",
      title: "Posting (by career)",
      table: (ctx) => CAREER_TABLES[careerOf(ctx)] ?? "alien.lifepath.posting.roughneck",
      reads: ["careerEntry"],
      after: accumulate("posting"),
    },
    {
      id: "psych",
      title: "Psych evaluation",
      table: "alien.lifepath.psych-evaluation",
      reads: ["origin", "earlyLife", "lifeEvent", "favors", "disasters", "posting"],
      modifier: (ctx) => cumulativeBefore(ctx, "psych").psych,
      after: accumulate("psych"),
    },
  ],
  produce: (ctx) => {
    const total = cumulativeBefore(ctx, "__end__");
    const android = obj(ctx, "humanOrAndroid").android === true;
    const career = careerOf(ctx);
    const attrCap = android ? 8 : 5;
    const attributes: Record<string, number> = {};
    for (const a of ATTRIBUTES) attributes[a] = clamp(2 + (total.attributes[a] ?? 0), 1, attrCap);
    const skills: Record<string, number> = {};
    for (const s of SKILLS) skills[s] = clamp(total.skills[s] ?? 0, 0, 5);
    const psych = obj(ctx, "psych");
    const lifePath: Record<string, unknown> = {};
    for (const id of STEP_ORDER) {
      const r = ctx.get(id);
      if (isObj(r)) {
        const { cumulative: _c, ...rest } = r;
        lifePath[id] = rest;
      }
    }
    lifePath.totals = total;
    const givenName = ctx.inputs.name;
    const name = typeof givenName === "string" && givenName.trim() !== "" ? givenName.trim() : `New ${career.replace(/-/g, " ")}`;
    return {
      entities: [
        {
          tempId: "pc",
          type: "alien.character",
          name,
          summary: `${android ? "Android" : "Human"} ${career.replace(/-/g, " ")} from ${str(obj(ctx, "origin").label, "unknown origin")}`,
          tags: ["pc", career],
          fields: {
            isPC: true,
            android,
            career,
            attributes,
            skills,
            talents: [],
            stress: num(psych.startingStress),
            personalAgenda: "",
            agendas: [],
            gear: [],
            signatureItem: "",
            cash: 0,
            storyPoints: 0,
            xp: 0,
            trait: str(obj(ctx, "earlyLife").label),
            goal: "",
            appearance: "",
            buddy: "",
            rival: "",
            criticalInjuries: [],
            mentalTraumas: [],
            lifePath,
          },
        },
      ],
      relationships: [],
    };
  },
};
