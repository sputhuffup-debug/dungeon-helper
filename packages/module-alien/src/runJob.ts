/**
 * "Run this job": an accepted job becomes a Job card adventure (p. 244-252),
 * filled from what the job already holds. The posting (pitch, pay, terms)
 * is the players' intro; the complications, the plot twist, the employer's
 * real intent and the NPCs' secrets are the GM's situation; the arrival
 * scene is set at the job's site, on its saved site map, with the job's
 * NPCs and the arc clue seeded with the job. The wrap-up closes the job as
 * done, failed or carried over. Module-original wiring; no book text.
 */
import type { AdventureSceneFill, AdventureSourceDef, AdventureSourceFill, AdventureSourceInput, AdventureSourceLink } from "@campaign-forge/module-sdk";
import { CAMPAIGN } from "./modes";
import { jobCardTemplate } from "./templates/jobCard";

export const RUN_JOB_ID = "alien.run-job";

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);
const str = (v: unknown): string => (typeof v === "string" ? v.trim() : "");
const strs = (v: unknown): string[] => (Array.isArray(v) ? v.map(str).filter(Boolean) : []);
const usd = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;

/** The job's NPCs (characters involved in it), the contact the players already know first. */
function jobNpcs(input: AdventureSourceInput): AdventureSourceLink[] {
  const npcs = input.links.filter((l) => l.direction === "in" && l.relationship === "involved_in" && l.entity.kind === "character");
  return [...npcs.filter((l) => l.entity.visibility !== "gm"), ...npcs.filter((l) => l.entity.visibility === "gm")];
}

/** The job's site (a location linked as its site), if the site map generator made one. */
function jobSite(input: AdventureSourceInput): AdventureSourceLink | undefined {
  return input.links.find((l) => l.direction === "in" && l.relationship === "site_of");
}

function playerIntro(input: AdventureSourceInput): string {
  const f = input.entity.fields;
  const hidden = new Set(input.entity.gmFields ?? []);
  const shown = (path: string) => !hidden.has(path) && !hidden.has(path.split(".")[0]!);
  const posting = isObj(f.posting) && shown("posting") ? f.posting : undefined;
  const contact = jobNpcs(input).find((l) => l.entity.visibility !== "gm");
  const lines: string[] = [];
  if (posting && str(posting.pitch)) {
    lines.push(`**${str(posting.title) || input.entity.name}**`, "", str(posting.pitch), "");
    if (str(posting.pay)) lines.push(`- Pay: ${str(posting.pay)}`);
    if (str(posting.postedBy)) lines.push(`- Posted by: ${str(posting.postedBy)}${str(posting.where) ? `, ${str(posting.where)}` : ""}`);
    if (str(posting.deadline)) lines.push(`- Deadline: ${str(posting.deadline)}`);
    const req = strs(posting.requirements);
    if (req.length) lines.push(`- Requirements: ${req.join("; ")}`);
    if (str(posting.risk)) lines.push(`- Risk rating: ${str(posting.risk)}`);
  } else {
    // a job from the job generator has no posting: what the employer tells the crew
    const what = (shown("mission") && str(f.mission)) || (shown("cargo") && str(f.cargo));
    lines.push(`**${input.entity.name}**`, "");
    if (what) lines.push(`- The job: ${what}`);
    if (shown("employer") && str(f.employer)) lines.push(`- For: ${str(f.employer)}`);
    if (shown("destination") && str(f.destination)) lines.push(`- Where: ${str(f.destination)}`);
    if (shown("payment") && typeof f.payment === "number" && f.payment > 0) lines.push(`- Pay: ${usd(f.payment)}`);
  }
  if (contact) lines.push(`- Contact: ${contact.entity.name}`);
  return lines.join("\n").trim();
}

function npcLine(l: AdventureSourceLink): string {
  const f = l.entity.fields;
  const parts = [str(f.goal) && `wants ${str(f.goal).replace(/^./, (c) => c.toLowerCase())}`, str(f.secret) && `secret: ${str(f.secret)}`, str(f.personalAgenda) && `agenda: ${str(f.personalAgenda)}`].filter(Boolean);
  return `- ${l.entity.name}${l.note ? ` (${l.note})` : ""}${parts.length ? `: ${parts.join("; ")}` : ""}`;
}

function gmSituation(input: AdventureSourceInput): string {
  const f = input.entity.fields;
  const out: string[] = ["What the crew is not told:", ""];
  const difficulty = typeof f.difficulty === "number" ? f.difficulty : undefined;
  const plays = typeof f.effectiveDifficulty === "number" ? f.effectiveDifficulty : undefined;
  if (difficulty !== undefined) out.push(`- Difficulty ${difficulty}${plays !== undefined && plays !== difficulty ? `, plays as ${plays} at the site` : ""} (p. 244).`);
  if (str(f.employerIntent)) out.push(`- The employer's real intent: ${str(f.employerIntent)}`);
  const complications = strs(f.complications);
  if (complications.length) out.push("- Complications:", ...complications.map((c) => `  - ${c}`));
  if (str(f.plotTwist)) out.push(`- Plot twist: ${str(f.plotTwist)}`);
  const betrayers = strs(f.betrayers);
  if (betrayers.length) out.push(`- Turns on the crew: ${betrayers.join(", ")}`);
  const npcs = jobNpcs(input);
  if (npcs.length) out.push("", "The people in it:", "", ...npcs.map(npcLine));
  const clues = input.clues.filter((c) => c.state !== "found");
  if (clues.length) out.push("", "Arc clues seeded in this job:", "", ...clues.map((c) => `- ${c.threadTitle}: ${c.text}${c.slotLabel ? ` (${c.slotLabel})` : ""}`));
  return out.length > 2 ? out.join("\n") : "";
}

function scenes(input: AdventureSourceInput): Record<string, AdventureSceneFill> {
  const f = input.entity.fields;
  const hidden = new Set(input.entity.gmFields ?? []);
  const npcs = jobNpcs(input);
  const contact = npcs.find((l) => l.entity.visibility !== "gm");
  const site = jobSite(input);
  const map = site ? (input.maps.find((m) => m.location === site.entity.id && m.generated) ?? input.maps.find((m) => m.location === site.entity.id)) : undefined;
  const complications = strs(f.complications);
  const twist = str(f.plotTwist);
  const destination = !hidden.has("destination") ? str(f.destination) : "";
  const payment = typeof f.payment === "number" ? f.payment : 0;
  const brief = isObj(f.siteBrief) ? strs(f.siteBrief.summary) : [];
  const clues = input.clues.filter((c) => c.state !== "found");
  const out: Record<string, AdventureSceneFill> = {};

  out.briefing = {
    ...(contact ? { title: `Briefing with ${contact.entity.name}`, participants: [contact.entity.id] } : {}),
    body: [`The offer for ${input.entity.name}${contact ? `, made by ${contact.entity.name}` : ""}. The players' side is in the adventure's player introduction.`, str(f.employerIntent) ? `What the employer is not saying: ${str(f.employerIntent)}` : ""].filter(Boolean).join("\n\n"),
  };
  const distance = typeof f.distance === "number" ? f.distance : undefined;
  out.transit = { body: distance === undefined ? "Roll encounters on the way (p. 252-257)." : distance === 0 ? "In-system: one encounter check per day of travel (p. 252-257)." : `${distance} system${distance === 1 ? "" : "s"} away: an encounter check per jump (p. 252-257).` };
  if (complications.length > 1) out["en-route"] = { body: `If a complication hits en route: ${complications[1]}` };
  const arrivalBody = [
    site ? `The site: ${site.entity.name}.${map ? " Its site map is on this scene; the live map and the hunt run from it at the table." : " No site map yet: generate one from the job's site brief."}` : "No site yet: generate the site map from the job's site brief; the scene picks it up.",
    brief.length ? `Site brief: ${brief.join(" ")}` : "",
    npcs.length ? `On site: ${npcs.map((l) => `${l.entity.name}${l.note ? ` (${l.note})` : ""}`).join(", ")}.` : "",
    clues.length ? `Seeded clue${clues.length === 1 ? "" : "s"}: ${clues.map((c) => `${c.threadTitle}: ${c.text}${c.slotLabel ? ` (${c.slotLabel})` : ""}`).join(" ")}` : "",
  ].filter(Boolean);
  out.arrival = {
    ...(destination ? { title: `Arrival at ${destination}` } : {}),
    ...(site ? { location: site.entity.id } : {}),
    ...(map ? { map: map.id } : {}),
    ...(npcs.length ? { participants: npcs.map((l) => l.entity.id) } : {}),
    body: arrivalBody.join("\n\n"),
    ...(clues.length ? { events: clues.map((c) => ({ text: `Clue to find (${c.threadTitle}): ${c.text}`, mandatory: false })) } : {}),
  };
  if (complications[0]) out.complication = { body: complications[0], ...(site ? { location: site.entity.id } : {}), ...(map ? { map: map.id } : {}) };
  const twistText = [complications.slice(2).join(" "), twist && `Plot twist: ${twist}`].filter(Boolean).join("\n\n");
  if (twistText) out.twist = { body: twistText, ...(site ? { location: site.entity.id } : {}), ...(map ? { map: map.id } : {}) };
  const bonus = strs(f.bonusRewards);
  out.payout = {
    ...(contact ? { participants: [contact.entity.id] } : {}),
    body: [payment > 0 ? `The pay: ${usd(payment)}. Collect it from the wrap-up's "Close the job" or the job page (p. 244).` : "", bonus.length ? `Bonus rewards: ${bonus.join("; ")}.` : ""].filter(Boolean).join("\n\n") || "Settle with the employer.",
  };
  return out;
}

export function runJobPrefill(input: AdventureSourceInput): AdventureSourceFill {
  const f = input.entity.fields;
  const what = str(f.cargo) || str(f.mission);
  const where = str(f.destination);
  const payment = typeof f.payment === "number" && f.payment > 0 ? usd(f.payment) : "";
  const premise = [what, str(f.employer) && `for ${str(f.employer)}`, where && `to ${where}`, payment && `for ${payment}`].filter(Boolean).join(" ");
  const fill: AdventureSourceFill = {
    title: input.entity.name,
    ...(premise ? { premise: premise.charAt(0).toUpperCase() + premise.slice(1) + "." } : {}),
    playerIntro: playerIntro(input),
    scenes: scenes(input),
    plan: ["briefing", "transit", "arrival", "complication"],
  };
  const gm = gmSituation(input);
  if (gm) fill.gmSituation = gm;
  return fill;
}

export const runJob: AdventureSourceDef = {
  id: RUN_JOB_ID,
  entityType: "alien.job",
  template: jobCardTemplate.id,
  label: "Run this job",
  noun: "job",
  mode: [CAMPAIGN],
  when: { "==": [{ var: "fields.status" }, "accepted"] },
  open: { "==": [{ var: "fields.status" }, "accepted"] },
  outcomes: [
    { id: "done", label: "Done", set: { path: "status", value: "done" }, closes: true, tone: "success" },
    { id: "failed", label: "Failed", set: { path: "status", value: "failed" }, closes: true, tone: "danger" },
    { id: "carried", label: "Carried over", tone: "muted" },
  ],
  prefill: runJobPrefill,
};
