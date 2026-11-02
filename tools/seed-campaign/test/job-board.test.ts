import { describe, expect, it } from "vitest";
import { playerShareSnapshot, plainText, projectCampaignForViewer, type Entity } from "@campaign-forge/core";
import { alienModule, normalizeMapInputs, siteMapGenerator, type JobSiteBrief } from "@campaign-forge/module-alien";
import { buildDemoCampaign } from "../src/build";

describe("Skyfire Down: the job board", () => {
  const demo = buildDemoCampaign();
  const { maps, registry } = demo;
  const entities = Object.values(maps.entities);
  const job = entities.find((e) => e.type === "alien.job" && e.tags.includes("job-board"))!;
  const rels = Object.values(maps.relationships);
  const npcs = rels.filter((r) => r.type === "involved_in" && r.to === job.id).map((r) => ({ note: r.note, e: maps.entities[r.from]! }));
  const brief = job.fields["siteBrief"] as JobSiteBrief;

  it("deals a board of three postings and takes the difficulty-3 one, which plays as 2 with one betrayer", () => {
    const run = Object.values(maps.generatorRuns).find((r) => r.procedure === "alien.job-board")!;
    expect((run.results["offers"] as { offers: unknown[] }).offers).toHaveLength(3);
    expect(job.fields["status"]).toBe("accepted");
    expect(job.fields["difficulty"]).toBe(3);
    expect(job.fields["effectiveDifficulty"]).toBe(2);
    expect(job.fields["betrayers"]).toHaveLength(1);
    expect(job.provenance?.generatorRun).toBe(run.id);
    expect(brief.difficulty).toBe(2);
    expect(brief.summary[0]).toMatch(/^Difficulty 3 \(plays as 2: one betrayer\)/);
  });

  it("comes with three NPCs: the contact the players can see, the others GM-only, one of them the betrayer", () => {
    expect(npcs).toHaveLength(3);
    expect(npcs[0]!.note).toBe("Contact");
    expect(npcs[0]!.e.visibility.level).toBe("players");
    for (const n of npcs.slice(1)) expect(n.e.visibility.level).toBe("gm");
    const betrayer = npcs.find((n) => (job.fields["betrayers"] as string[]).includes(n.e.name))!;
    expect(String(betrayer.e.fields["personalAgenda"])).toMatch(/Turns on the crew/);
    expect(brief.inputs.npcs.find((n) => n.name === betrayer.e.name)?.turns).toBe(true);
    for (const n of npcs) expect(n.e.provenance?.preset).toMatch(/^alien\.npc\./);
  });

  it("holds rogue humans and a xenomorph in the brief, and a generated site map saved with the job's site", () => {
    expect(brief.inputs.hostiles.length).toBeGreaterThan(0);
    expect(brief.inputs.threats.some((t) => t.creature.includes("xx121"))).toBe(true);
    expect(normalizeMapInputs(brief.inputs as unknown as Record<string, unknown>)).toEqual(brief.inputs);
    const site = rels.find((r) => r.type === "site_of" && r.to === job.id)!;
    const map = Object.values(maps.maps).find((m) => m.location === site.from)!;
    expect(map.generator?.inputs).toEqual(brief.inputs);
    expect(map.layout?.checks.filter((c) => c.level === "block" && !c.ok)).toEqual([]);
    expect(map.layout?.markers.some((m) => m.kind === "hostile")).toBe(true);
    expect(map.layout?.markers.some((m) => m.kind === "spawn" && String(m.data?.creature).includes("xx121"))).toBe(true);
    expect(siteMapGenerator.briefFromEntity?.({ id: job.id, name: job.name, type: job.type, fields: job.fields })?.inputs).toEqual(brief.inputs);
  });

  it("gives the players the posting and nothing behind it, in the player view and a share", () => {
    const posting = Object.values(maps.handouts).find((h) => h.purpose === "job-posting")!;
    expect(posting.visibility.level).toBe("players");
    expect(posting.attachedTo).toEqual({ kind: "entity", id: job.id });
    const body = plainText(registry.open(posting.bodyDoc!));
    expect(body).toContain(String((job.fields["posting"] as { title: string }).title));
    const view = projectCampaignForViewer(maps, alienModule, { role: "player" });
    const pv = view.entities[job.id]!;
    for (const f of ["difficulty", "effectiveDifficulty", "betrayers", "employerIntent", "siteBrief", "complications", "plotTwist"]) expect(pv.fields[f], f).toBeUndefined();
    expect(pv.fields["posting"]).toBeDefined();
    const hidden = npcs.slice(1).map((n) => n.e.name);
    for (const n of hidden) expect(view.entities[npcs.find((x) => x.e.name === n)!.e.id]).toBeUndefined();
    const contact = view.entities[npcs[0]!.e.id] as Entity;
    for (const f of ["personalAgenda", "secret", "goal", "background", "secretAndroid", "secretOrders"]) expect(contact.fields[f], f).toBeUndefined();
    // the site map and its rogue humans are the GM's
    const site = rels.find((r) => r.type === "site_of" && r.to === job.id)!;
    expect(Object.values(view.maps).some((m) => m.location === site.from)).toBe(false);
    const session = Object.values(maps.sessions)[0]!;
    const share = JSON.stringify(playerShareSnapshot({ maps, module: alienModule, sessionId: session.id, at: "2026-11-07T20:00:00Z", doc: (id) => registry.open(id), referenceName: () => undefined }));
    for (const n of hidden) expect(share).not.toContain(n);
    for (const n of npcs) {
      expect(share).not.toContain(String(n.e.fields["secret"]));
      expect(share).not.toContain(String(n.e.fields["personalAgenda"]));
    }
    expect(share).not.toContain(String(job.fields["employerIntent"]));
    expect(share).not.toMatch(/betray|hostile|Rogue humans|UPP fire team|Mercenary team/i);
  });
});
