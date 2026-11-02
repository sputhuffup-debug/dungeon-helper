import type { EntityTypeDef } from "@campaign-forge/module-sdk";
import { FRAME_IDS, enumField, intField, number, numberField, objectSchema, select, stringArray, stringField, tags, text, textarea } from "./common";
import { CAMPAIGN } from "../modes";

export const JOB_TYPES = ["job", "mission", "expedition"] as const;
export const JOB_STATUSES = ["offered", "accepted", "done", "declined"] as const;

export const jobSchema = objectSchema({
  frame: enumField(FRAME_IDS, "space-truckers", "Campaign frame this job belongs to (p. 234)."),
  jobType: enumField(JOB_TYPES, "job", "Job (truckers), mission (marines) or expedition (colonists) (p. 244)."),
  distance: intField(0, 5, 0, "Systems away, D6-1 (p. 244)."),
  difficulty: intField(1, 3, 1, "D3; also the number of complications (p. 244)."),
  payment: numberField({ minimum: 0, default: 0 }, "(distance + difficulty) x PCs x $1,000 (p. 244)."),
  employer: stringField("Employer or sponsor name; link with employer_of / sponsor_of."),
  bonusRewards: stringArray("(p. 245-251)"),
  mission: stringField("Mission or cargo summary."),
  cargo: stringField(),
  destination: stringField("Destination summary; link the location entity with found_at."),
  complications: stringArray("One per point of difficulty (p. 245-251)."),
  plotTwist: stringField("(p. 252)"),
  status: enumField(JOB_STATUSES, "offered"),
  // Job board (module-original): the posting as the players read it, and what the GM knows.
  posting: {
    type: "object",
    additionalProperties: false,
    description: "The job board posting as the players read it (module-original).",
    properties: {
      title: { type: "string" },
      pitch: { type: "string" },
      pay: { type: "string" },
      postedBy: { type: "string" },
      where: { type: "string" },
      deadline: { type: "string" },
      requirements: { type: "array", items: { type: "string" } },
      risk: { type: "string", description: "The risk rating shown to players: it follows the difficulty but can mislead." },
    },
  },
  effectiveDifficulty: intField(1, 3, undefined, "Module decision: the rolled difficulty less one per betraying NPC, at least 1. Sets the site brief; pay, NPCs and complications follow the rolled difficulty."),
  betrayers: stringArray("NPCs whose agenda turns on the crew (GM)."),
  employerIntent: stringField("What the employer really wants from the job (GM)."),
  siteBrief: {
    type: "object",
    additionalProperties: true,
    description: "The site map generator's brief for the job's site: data only, read by Generate site map (module-original).",
  },
});

export const jobType: EntityTypeDef = {
  id: "alien.job",
  kind: "job",
  name: "Job",
  plural: "Jobs",
  icon: "briefcase",
  mode: [CAMPAIGN],
  schema: jobSchema,
  sheet: {
    sections: [
      {
        id: "brief",
        title: "Briefing",
        columns: 4,
        fields: [
          select("frame", "Frame", [...FRAME_IDS], { span: 4, rule: "alien.rule.job-frames" }),
          select("jobType", "Type", [...JOB_TYPES], { span: 4, rule: "alien.rule.jobs" }),
          select("status", "Status", [...JOB_STATUSES], { span: 4 }),
          number("distance", "Distance", { rule: "alien.rule.jobs" }),
          number("difficulty", "Difficulty", { rule: "alien.rule.jobs" }),
          number("payment", "Payment ($)", { span: 6, rule: "alien.rule.job-payment" }),
          text("employer", "Employer / sponsor", { span: 6, rule: "alien.rule.jobs" }),
          text("destination", "Destination", { span: 6 }),
          textarea("mission", "Mission"),
          textarea("cargo", "Cargo"),
          tags("bonusRewards", "Bonus rewards"),
        ],
      },
      {
        id: "secrets",
        title: "Complications (GM)",
        columns: 1,
        fields: [tags("complications", "Complications", { rule: "alien.rule.jobs" }), textarea("plotTwist", "Plot twist", { rule: "alien.rule.plot-twists" })],
      },
      {
        id: "posting",
        title: "Posting",
        columns: 2,
        fields: [
          text("posting.title", "Posting title", { span: 6, rule: "alien.rule.job-board" }),
          text("posting.risk", "Risk rating (shown)", { span: 6, rule: "alien.rule.job-board" }),
          textarea("posting.pitch", "Pitch"),
          text("posting.pay", "Pay", { span: 6 }),
          text("posting.deadline", "Deadline", { span: 6 }),
          text("posting.postedBy", "Posted by", { span: 6 }),
          text("posting.where", "Where", { span: 6 }),
          tags("posting.requirements", "Requirements"),
        ],
      },
      {
        id: "truth",
        title: "Behind the posting (GM)",
        columns: 2,
        fields: [
          number("effectiveDifficulty", "Plays as difficulty", { span: 4, rule: "alien.rule.job-board" }),
          tags("betrayers", "Betrayers", { span: 8 }),
          textarea("employerIntent", "Employer's real intent"),
        ],
      },
    ],
    summary: ["jobType", "distance", "difficulty", "payment", "status"],
  },
  defaultVisibility: { complications: "gm", plotTwist: "gm", effectiveDifficulty: "gm", betrayers: "gm", employerIntent: "gm", siteBrief: "gm" },
};
