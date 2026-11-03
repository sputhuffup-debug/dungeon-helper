/**
 * "Run this job": the Job card filled from a job board posting. The players'
 * intro carries only the posting; complications, the twist, the employer's
 * intent, the betrayers and the NPCs' secrets stay in the GM's situation and
 * scene notes; the arrival is set at the site, on its map, with the NPCs and
 * the seeded clue.
 */
import { describe, expect, it } from "vitest";
import { adventureSourceIssues, runProcedure, templateSceneKey, type AdventureSourceInput, type ModuleManifest, type Offer, type OfferSet, type TemplateAdventure } from "@campaign-forge/module-sdk";
import { alienModule } from "../src/index";
import { jobBoard } from "../src/procedures/job-board";
import { runJob, runJobPeople, runJobPrefill } from "../src/runJob";
import { jobCardTemplate } from "../src/templates/jobCard";
import { tables } from "../src/tables/index";

const mod = { tables, manifest: { id: "alien", version: "0.0.0-test" } as ModuleManifest };

/** A posting taken from a dealt board, as the core would hand it to the prefill (tempIds stand in for record ids). */
function inputFor(offer: Offer, extra: { site?: boolean; clue?: boolean } = {}): AdventureSourceInput {
  const [job, ...rest] = offer.produced.entities;
  const byId = new Map(offer.produced.entities.map((e) => [e.tempId, e]));
  const links: AdventureSourceInput["links"] = offer.produced.relationships
    .filter((r) => r.to === "job" && byId.has(r.from))
    .map((r) => {
      const e = byId.get(r.from)!;
      return { relationship: r.type, direction: "in" as const, ...(r.note ? { note: r.note } : {}), entity: { id: e.tempId, name: e.name, type: e.type, fields: e.fields, kind: e.type === "alien.character" ? ("character" as const) : ("faction" as const), visibility: e.visibility ?? "gm" } };
    });
  if (extra.site) links.push({ relationship: "site_of", direction: "in", entity: { id: "site-1", name: "Hadley Dome (job site)", type: "alien.location", fields: {}, kind: "location", visibility: "gm" } });
  const gmFields = Object.entries({ ...alienModule.entityTypes.find((t) => t.id === "alien.job")!.defaultVisibility, ...(job!.fieldVisibility ?? {}) })
    .filter(([, v]) => v === "gm")
    .map(([k]) => k)
    .sort();
  void rest;
  return {
    mode: "campaign",
    entity: { id: "job", name: job!.name, type: job!.type, fields: { ...job!.fields, status: "accepted" }, visibility: "players", gmFields },
    links,
    maps: extra.site ? [{ id: "map-1", name: "Site map", location: "site-1", generated: true }] : [],
    clues: extra.clue ? [{ thread: "t1", threadTitle: "Operation White Ledger", clue: "c1", text: "A ledger page in the cargo manifest", state: "seeded", slotLabel: "Cargo detail" }] : [],
  };
}

function postings(seed: string): Offer[] {
  return (runProcedure(jobBoard, mod, { seed, inputs: { postings: 3, treachery: "high" } }).results.offers as OfferSet).offers;
}

/** Every GM-only text of a posting's job and its NPCs: none of it may reach the players' intro or a scene title. */
function secretsOf(input: AdventureSourceInput): string[] {
  const f = input.entity.fields;
  const strs = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : typeof v === "string" ? [v] : []);
  // (a betrayer is often the contact the players know by name: the name is public, that they turn is not)
  const out = [...strs(f.complications), ...strs(f.plotTwist), ...strs(f.employerIntent), "Turns on the crew"];
  for (const l of input.links) if (l.entity.visibility === "gm") out.push(l.entity.name);
  for (const l of input.links) out.push(...strs(l.entity.fields.secret), ...strs(l.entity.fields.personalAgenda));
  // one-word complications ("Wreckage") can be words of the public title; the scan reads phrases
  return out.filter((s) => s.trim().split(/\s+/).length >= 3);
}

describe("Run this job", () => {
  it("passes the sdk's adventure source checks", () => {
    expect(adventureSourceIssues(alienModule)).toEqual([]);
    expect(alienModule.adventureSources).toContain(runJob);
  });

  it("fills the Job card from a posting: players read the posting, the GM gets the rest; deterministic", () => {
    const keys = new Set((jobCardTemplate.scaffold as TemplateAdventure).acts.flatMap((a) => (a.scenes ?? []).map((s, i) => templateSceneKey(a.number, i, s))));
    for (const seed of ["run-a", "run-b", "run-c", "run-d"]) {
      for (const offer of postings(seed)) {
        const input = inputFor(offer, { site: true, clue: true });
        const fill = runJobPrefill(input);
        expect(runJobPrefill(inputFor(offer, { site: true, clue: true }))).toEqual(fill);
        const posting = input.entity.fields.posting as { title: string; pitch: string; pay: string; requirements: string[] };
        expect(fill.title).toBe(offer.title);
        expect(fill.playerIntro).toContain(posting.pitch);
        expect(fill.playerIntro).toContain(posting.pay);
        for (const r of posting.requirements) expect(fill.playerIntro).toContain(r);
        // secret scan: nothing the players may not know is in what they read
        const players = [fill.title ?? "", fill.playerIntro ?? "", ...Object.values(fill.scenes ?? {}).flatMap((s) => [s.title ?? "", s.readAloud ?? ""])].join("\n");
        for (const secret of secretsOf(input)) expect(players, `${seed}/${offer.key}: ${secret}`).not.toContain(secret);
        // the GM's side
        for (const c of (input.entity.fields.complications as string[]) ?? []) expect(fill.gmSituation).toContain(c);
        if (input.entity.fields.employerIntent) expect(fill.gmSituation).toContain(String(input.entity.fields.employerIntent));
        // the arrival: at the site, on its map, with the job's NPCs and the clue to find
        const npcs = input.links.filter((l) => l.relationship === "involved_in").map((l) => l.entity.id);
        expect(fill.scenes?.arrival).toMatchObject({ location: "site-1", map: "map-1" });
        expect([...(fill.scenes?.arrival?.participants ?? [])].sort()).toEqual([...npcs].sort());
        expect(fill.scenes?.arrival?.events).toEqual([{ text: "Clue to find (Operation White Ledger): A ledger page in the cargo manifest", mandatory: false }]);
        expect(fill.scenes?.briefing?.participants).toEqual([npcs.find((id) => input.links.find((l) => l.entity.id === id)!.entity.visibility !== "gm")!]);
        for (const k of [...Object.keys(fill.scenes ?? {}), ...(fill.plan ?? [])]) expect(keys.has(k), k).toBe(true);
        expect(fill.plan).toEqual(["briefing", "transit", "arrival", "complication"]);
      }
    }
  });

  it("without a site yet, the arrival names no place or map and says how to get one", () => {
    const offer = postings("run-a")[0]!;
    const fill = runJobPrefill(inputFor(offer));
    expect(fill.scenes?.arrival?.location).toBeUndefined();
    expect(fill.scenes?.arrival?.map).toBeUndefined();
    expect(fill.scenes?.arrival?.body).toContain("generate the site map");
  });

  it("runs only an accepted job and closes it as done, failed or carried over", () => {
    expect(runJob.when).toEqual({ "==": [{ var: "fields.status" }, "accepted"] });
    expect(runJob.outcomes?.map((o) => [o.id, o.set?.value, !!o.closes])).toEqual([
      ["done", "done", true],
      ["failed", "failed", true],
      ["carried", undefined, false],
    ]);
    const statuses = (alienModule.entityTypes.find((t) => t.id === "alien.job")!.schema.properties as Record<string, { enum?: string[] }>).status!.enum;
    for (const o of runJob.outcomes ?? []) if (o.set) expect(statuses).toContain(o.set.value);
  });

  it("names each NPC's agenda, wants and secret for the GM, and who turns on the crew", () => {
    let turned = 0;
    for (const seed of ["run-a", "run-b", "run-c", "run-d"]) {
      for (const offer of postings(seed)) {
        const input = inputFor(offer, { site: true });
        const people = runJobPeople(input);
        expect(runJobPeople(inputFor(offer, { site: true }))).toEqual(people);
        const npcs = input.links.filter((l) => l.relationship === "involved_in" && l.entity.kind === "character");
        expect(people.map((p) => p.entity).sort()).toEqual(npcs.map((l) => l.entity.id).sort());
        const betrayers = (input.entity.fields.betrayers as string[] | undefined) ?? [];
        for (const p of people) {
          const l = npcs.find((x) => x.entity.id === p.entity)!;
          const f = l.entity.fields as Record<string, unknown>;
          if (typeof f.secret === "string" && f.secret) expect(p.notes).toContainEqual({ label: "Secret", text: f.secret });
          if (typeof f.personalAgenda === "string" && f.personalAgenda) expect(p.notes).toContainEqual({ label: "Agenda", text: f.personalAgenda });
          const turns = betrayers.includes(l.entity.name);
          if (turns) turned++;
          expect(p.stance).toEqual(turns ? { label: "Turns on the crew", tone: "danger" } : { label: "Does not turn on the crew", tone: "muted" });
          if (l.note) expect(p.role).toBe(l.note);
        }
      }
    }
    expect(turned).toBeGreaterThan(0);
  });
});
