import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { runProcedure, type ModuleManifest, type Offer, type OfferSet, type ProcedureRunOptions } from "@campaign-forge/module-sdk";
import { jobCreate } from "../src/procedures/job";
import { jobBoard, type PostingData } from "../src/procedures/job-board";
import { NPC_ARCS, TREACHERY_DIAL } from "../src/procedures/job-board-data";
import { RESOLVED_NPC_ARCS, effectiveDifficulty, isBetrayer } from "../src/procedures/npc-agendas";
import { tables } from "../src/tables/index";
import * as jobTables from "../src/tables/jobs";
import { JOB_BRIEF_ROWS, SIZE_BY_DIFFICULTY, briefFromJob, jobSiteBrief, type JobSiteBrief } from "../src/maps/jobBrief";
import { createMapContext, generateSiteMap, normalizeMapInputs, playerLayout } from "../src/maps/index";

const mod = { tables, manifest: { id: "alien", version: "0.0.0-test" } as ModuleManifest };
const FRAMES = ["space-truckers", "colonial-marines", "frontier-colonists"] as const;

function board(seed: string, inputs: Record<string, unknown> = {}, opts: Omit<ProcedureRunOptions, "seed" | "inputs"> = {}) {
  const graph = runProcedure(jobBoard, mod, { seed, inputs: { postings: 3, ...inputs }, ...opts });
  return { graph, offers: (graph.results.offers as OfferSet).offers };
}
const jobOf = (o: Offer) => o.produced.entities[0]!;
const npcsOf = (o: Offer) => o.produced.entities.filter((e) => e.type === "alien.character");
const briefOf = (o: Offer) => jobOf(o).fields.siteBrief as JobSiteBrief;

describe("alien.job.create is unchanged", () => {
  it("produces the recorded output for 120 seeds across the three frames", () => {
    // Recorded before the job board was added (same seeds, inputs and optional twist).
    const out: string[] = [];
    for (const frame of FRAMES)
      for (let i = 0; i < 40; i++) {
        const g = runProcedure(jobCreate, mod, { seed: `job-fixture-${i}`, inputs: { frame, pcCount: 4 }, includeOptional: ["plotTwist"] });
        out.push(JSON.stringify({ r: g.results, p: g.produced, rolls: g.rolls }));
      }
    expect(createHash("sha256").update(out.join("\n")).digest("hex")).toBe("d4e971c47f80ba7561c28d42428f67145803ce6cc84febc3bdb93d72a0e68a09");
  });
});

describe("alien.job-board", () => {
  it("is deterministic: same seed and inputs, same board", () => {
    for (const frame of FRAMES) {
      const a = board(`det-${frame}`, { frame });
      const b = board(`det-${frame}`, { frame });
      expect(a.graph.results).toEqual(b.graph.results);
      expect(a.graph.parts).toEqual(b.graph.parts);
    }
  });

  it("rolls each posting's job with the Job Generator itself", () => {
    for (const frame of FRAMES)
      for (let i = 0; i < 10; i++) {
        const { graph, offers } = board(`book-${frame}-${i}`, { frame, employerBias: i % 2 ? "corporation" : "any" });
        offers.forEach((o, k) => {
          const jobSeed = graph.parts![`offers/posting-${k + 1}/job`] as string;
          // the employer bias re-seeds the employer step only; every other step is the book's own roll for that seed
          const plain = runProcedure(jobCreate, mod, { seed: jobSeed, inputs: { frame, pcCount: 4 }, includeOptional: ["plotTwist"] });
          const job = jobOf(o);
          const book = plain.produced.entities.find((e) => e.tempId === "job")!;
          for (const f of ["frame", "jobType", "distance", "difficulty", "payment", "destination", "complications", "plotTwist", "mission", "cargo", "bonusRewards"]) expect(job.fields[f]).toEqual(book.fields[f]);
          if (i % 2 === 0) expect(job.fields.employer).toBe(book.fields.employer);
        });
      }
  });

  it("deals one NPC per point of rolled difficulty, the contact first", () => {
    for (const frame of FRAMES)
      for (let i = 0; i < 40; i++) {
        for (const o of board(`npcs-${frame}-${i}`, { frame }).offers) {
          const d = jobOf(o).fields.difficulty as number;
          const npcs = npcsOf(o);
          expect(npcs.length).toBe(Math.min(3, d));
          expect(npcs[0]!.visibility).toBe("players");
          for (const n of npcs.slice(1)) expect(n.visibility).toBe("gm");
          expect(new Set(npcs.map((n) => n.name)).size).toBe(npcs.length);
          expect(o.produced.relationships.filter((r) => r.type === "involved_in")[0]?.note).toBe("Contact");
        }
      }
  });

  it("effective difficulty is the rolled difficulty less one per betrayer, at least 1, and the brief follows it", () => {
    let betrayed = 0;
    for (const dial of TREACHERY_DIAL)
      for (let i = 0; i < 60; i++) {
        for (const o of board(`eff-${dial}-${i}`, { treachery: dial }).offers) {
          const f = jobOf(o).fields;
          const betrayers = (f.betrayers as string[]).length;
          if (betrayers) betrayed++;
          expect(f.effectiveDifficulty).toBe(Math.max(1, (f.difficulty as number) - betrayers));
          expect(f.effectiveDifficulty).toBe(effectiveDifficulty(f.difficulty as number, betrayers));
          const brief = briefOf(o);
          const eff = f.effectiveDifficulty as number;
          expect(brief.difficulty).toBe(eff);
          expect(brief.inputs.size).toBe(SIZE_BY_DIFFICULTY[eff]!.size);
          expect(brief.inputs.threats.length + brief.inputs.hostiles.length).toBe(eff);
          // betrayers are named NPCs that turn on the crew, and they are on the map
          for (const name of f.betrayers as string[]) expect(brief.inputs.npcs.find((n) => n.name === name)?.turns).toBe(true);
        }
      }
    expect(betrayed).toBeGreaterThan(10);
  });

  it("with the treachery dial at none, nobody betrays and nobody is a hidden synthetic", () => {
    for (const frame of FRAMES)
      for (let i = 0; i < 60; i++) {
        for (const o of board(`none-${frame}-${i}`, { frame, treachery: "none" }).offers) {
          expect(jobOf(o).fields.betrayers).toEqual([]);
          expect(jobOf(o).fields.effectiveDifficulty).toBe(jobOf(o).fields.difficulty);
          for (const n of npcsOf(o)) {
            expect(n.fields.secretAndroid).not.toBe(true);
            expect(String(n.fields.personalAgenda)).not.toMatch(/Turns on the crew|Hidden synthetic/);
          }
        }
      }
  });

  it("holds at most one hidden synthetic per job, even when pins ask for two", () => {
    let seen = 0;
    for (let i = 0; i < 120; i++) {
      for (const o of board(`syn-${i}`, { treachery: "common" }).offers) {
        const synths = npcsOf(o).filter((n) => n.fields.secretAndroid === true);
        expect(synths.length).toBeLessThanOrEqual(1);
        seen += synths.length;
      }
    }
    expect(seen).toBeGreaterThan(0);
    // pin a synthetic agenda on two NPCs of a difficulty-3 posting
    const first = (() => {
      for (let i = 0; i < 200; i++) {
        const b = board(`pin-${i}`, { treachery: "common", postings: 1 });
        const parts = b.graph.parts!;
        const synth = Object.entries(parts).find(([k, v]) => k.endsWith("/agenda") && (v as { synthetic?: unknown }).synthetic);
        if (synth && (jobOf(b.offers[0]!).fields.difficulty as number) === 3) return { b, synth, seed: `pin-${i}` };
      }
      throw new Error("no synthetic found");
    })();
    const pinnedParts = { "offers/posting-1/npc-2/agenda": first.synth[1], "offers/posting-1/npc-3/agenda": first.synth[1] };
    const again = board(first.seed, { treachery: "common", postings: 1 }, { pinnedParts });
    expect(npcsOf(again.offers[0]!).filter((n) => n.fields.secretAndroid === true).length).toBe(1);
  });

  it("keeps GM-only facts out of the players' posting text", () => {
    for (const dial of TREACHERY_DIAL)
      for (let i = 0; i < 40; i++) {
        for (const o of board(`leak-${dial}-${i}`, { treachery: dial }).offers) {
          const text = o.playerText;
          expect(o.handout?.body).toBe(text);
          const job = jobOf(o);
          expect(text).not.toMatch(/betray|synthetic|android|agenda|directive|plays as/i);
          expect(text).not.toContain(String(job.fields.employerIntent));
          for (const n of npcsOf(o)) {
            expect(text).not.toContain(String(n.fields.secret));
            expect(text).not.toContain(String(n.fields.goal));
          }
          const confidential = /Client:\*\* confidential/.test(text);
          if (confidential) {
            expect(text).not.toContain(String(job.fields.employer));
            for (const n of npcsOf(o)) {
              expect(String(n.fields.role)).not.toContain(String(job.fields.employer));
              expect(String(n.summary)).not.toContain(String(job.fields.employer));
            }
            expect(job.fieldVisibility?.employer).toBe("gm");
            expect(o.produced.entities.find((e) => e.type === "alien.faction")?.visibility ?? "gm").toBe("gm");
          }
          expect(job.fieldVisibility?.difficulty).toBe("gm");
          // GM-only slots stay out of the player text
          for (const s of o.slots.filter((x) => x.gmOnly)) if (s.text.length > 12) expect(text).not.toContain(s.text);
        }
      }
  });

  it("keeps a secret synthetic's true make GM-only on the contact", () => {
    for (let i = 0; i < 300; i++) {
      for (const o of board(`contact-syn-${i}`, { treachery: "common" }).offers) {
        const contact = npcsOf(o)[0]!;
        if (contact.fields.secretAndroid !== true) continue;
        expect(contact.visibility).toBe("players");
        expect(contact.tags).not.toContain("android");
        expect(contact.fieldVisibility).toMatchObject({ android: "gm", attributes: "gm", personalAgenda: "gm" });
        expect(contact.fields.coverAttributes).toBeDefined();
        return;
      }
    }
    throw new Error("no synthetic contact in 300 boards");
  });

  it("re-rolls or pins each posting and each part on its own", () => {
    const base = board("parts");
    const key = "offers/posting-2/title";
    const rerolled = board("parts", {}, { partSeeds: { [key]: "other" } });
    expect(rerolled.offers[1]!.title).not.toBe(base.offers[1]!.title);
    expect(rerolled.offers[1]!.playerText.replace(/^## .*$/m, "")).toBe(base.offers[1]!.playerText.replace(/^## .*$/m, ""));
    expect(rerolled.offers[0]).toEqual(base.offers[0]);
    expect(rerolled.offers[2]).toEqual(base.offers[2]);
    // a whole posting re-rolled; another pinned stays when the seed changes
    const pinned = { "offers/posting-1": base.graph.parts!["offers/posting-1"] };
    const fresh = board("parts-new-seed", {}, { pinnedParts: pinned });
    expect(fresh.offers[0]!.title).toBe(base.offers[0]!.title);
    expect(jobOf(fresh.offers[0]!).fields.payment).toBe(jobOf(base.offers[0]!).fields.payment);
    expect(fresh.offers[1]!.title).not.toBe(base.offers[1]!.title);
  });

  it("re-rolling an NPC's agenda recomputes the effective difficulty and the brief", () => {
    for (let i = 0; i < 300; i++) {
      const b = board(`recompute-${i}`, { treachery: "common", postings: 1 });
      const o = b.offers[0]!;
      const f = jobOf(o).fields;
      if ((f.difficulty as number) < 2 || (f.betrayers as string[]).length !== 1) continue;
      // find which NPC betrays and re-deal its agenda until it does not
      const name = (f.betrayers as string[])[0]!;
      const k = npcsOf(o).findIndex((n) => n.name === name) + 1;
      for (let s = 0; s < 40; s++) {
        const again = board(`recompute-${i}`, { treachery: "common", postings: 1 }, { partSeeds: { [`offers/posting-1/npc-${k}/agenda`]: `r${s}` } });
        const g = jobOf(again.offers[0]!).fields;
        if ((g.betrayers as string[]).length !== 0) continue;
        expect(g.effectiveDifficulty).toBe(f.difficulty);
        expect(briefOf(again.offers[0]!).difficulty).toBe(f.difficulty);
        expect(briefOf(again.offers[0]!).inputs.threats.length + briefOf(again.offers[0]!).inputs.hostiles.length).toBe(f.difficulty);
        return;
      }
    }
    throw new Error("no re-dealt betrayer found");
  });

  it("links an employer the campaign already has instead of adding a faction", () => {
    const { offers } = board("existing", { frame: "space-truckers" });
    const name = String(jobOf(offers[0]!).fields.employer);
    const campaign = { entities: [{ id: "F1", name, type: "alien.faction", kind: "faction", tags: [], visibility: "players" }], relationships: [] };
    const again = board("existing", { frame: "space-truckers", campaign }).offers[0]!;
    expect(again.produced.entities.some((e) => e.type === "alien.faction")).toBe(false);
    expect(again.produced.relationships.some((r) => r.from === "F1" && (r.type === "employer_of" || r.type === "sponsor_of"))).toBe(true);
  });

  it("every NPC arc reused from the cinematic generator exists, and every arc can be dealt under some dial", () => {
    for (const a of NPC_ARCS) if (a.reuse) expect(RESOLVED_NPC_ARCS.find((r) => r.id === a.id)?.name).toMatch(/^The /);
    expect(RESOLVED_NPC_ARCS.filter((a) => a.betrayal === 3).length).toBeGreaterThan(2);
    expect(RESOLVED_NPC_ARCS.filter((a) => a.synthetic).length).toBe(1);
    expect(isBetrayer({ betrayal: 2, synthetic: { directive: "", turns: true, clues: [] } })).toBe(true);
    expect(isBetrayer({ betrayal: 2 })).toBe(false);
  });
});

describe("the job site brief", () => {
  const labels = (t: { rows: Array<{ label?: string; result?: unknown }> }, key: string) =>
    t.rows.map((r) => {
      const res = r.result as Record<string, unknown> | undefined;
      return String(res?.[key] ?? r.label);
    });

  it("maps every mission, cargo, destination, complication and plot twist row", () => {
    expect(new Set(JOB_BRIEF_ROWS.missions.truckers)).toEqual(new Set(labels(jobTables.truckersMission, "cargo")));
    expect(new Set(JOB_BRIEF_ROWS.missions.marines)).toEqual(new Set(labels(jobTables.marinesMission, "mission")));
    expect(new Set(JOB_BRIEF_ROWS.missions.colonists)).toEqual(new Set(labels(jobTables.colonistsMission, "mission")));
    const destinations = [...labels(jobTables.truckersDestination, "destination"), ...labels(jobTables.marinesDestination, "destination"), ...labels(jobTables.colonistsDestination, "destination"), ...labels(jobTables.colonistsDestinationReroll, "destination")];
    for (const d of destinations) expect(JOB_BRIEF_ROWS.destinations).toContain(d);
    const comps = [...labels(jobTables.truckersComplications, "complication"), ...labels(jobTables.marinesComplications, "complication"), ...labels(jobTables.colonistsComplications, "complication")];
    for (const c of comps) expect(JOB_BRIEF_ROWS.complications).toContain(c);
    for (const t of labels(jobTables.plotTwist, "twist")) expect(JOB_BRIEF_ROWS.twists).toContain(t);
  });

  it("every brief is a valid generator brief, for every mission and destination at every difficulty", async () => {
    const { createRng } = await import("@campaign-forge/module-sdk");
    const frames: Array<[string, string[]]> = [
      ["space-truckers", JOB_BRIEF_ROWS.missions.truckers],
      ["colonial-marines", JOB_BRIEF_ROWS.missions.marines],
      ["frontier-colonists", JOB_BRIEF_ROWS.missions.colonists],
    ];
    let n = 0;
    for (const [frame, missions] of frames)
      for (const mission of missions)
        for (const difficulty of [1, 2, 3]) {
          const destination = JOB_BRIEF_ROWS.destinations[n % JOB_BRIEF_ROWS.destinations.length]!;
          const complications = JOB_BRIEF_ROWS.complications.slice(n % 20, (n % 20) + difficulty);
          const brief = jobSiteBrief({ frame, mission, destination, complications, plotTwist: JOB_BRIEF_ROWS.twists[n % 9]!, difficulty, pcCount: 4, npcs: [{ name: "Ada Moreau", mapRole: "crew", note: "Turns", turns: true }] }, createRng(`brief-${n}`));
          n++;
          expect(normalizeMapInputs(brief.inputs as unknown as Record<string, unknown>)).toEqual(brief.inputs);
          expect(brief.inputs.threats.length + brief.inputs.hostiles.length).toBe(difficulty);
        }
  });

  it("is read back from a job entity for the map generator", () => {
    const o = board("brief-entity").offers[0]!;
    const job = jobOf(o);
    const brief = briefFromJob({ id: "J1", name: job.name, type: "alien.job", fields: job.fields });
    expect(brief?.inputs).toEqual((job.fields.siteBrief as JobSiteBrief).inputs);
    expect(brief?.site?.relationship).toBe("site_of");
    expect(briefFromJob({ id: "J2", name: "x", type: "alien.job", fields: {} })).toBeUndefined();
  });

  it("generated maps from job briefs pass their block checks and keep every GM mark off the player map", () => {
    let maps = 0;
    for (let i = 0; i < 20; i++) {
      for (const o of board(`map-${i}`, { treachery: "common", frame: FRAMES[i % 3] }).offers) {
        const r = generateSiteMap(briefOf(o).inputs as unknown as Record<string, unknown>, createMapContext(`m-${i}`));
        maps++;
        const hostile = r.layout.checks.find((c) => c.id === "hostile-placement");
        if (briefOf(o).inputs.hostiles.length) expect(hostile?.ok).toBe(true);
        expect(r.layout.checks.find((c) => c.id === "no-spoilers")?.ok).toBe(true);
        for (const act of [1, 2, 3]) expect(playerLayout(r.layout, act).markers.every((m) => !m.gmOnly)).toBe(true);
      }
    }
    expect(maps).toBe(60);
  });
});

export type { PostingData };
