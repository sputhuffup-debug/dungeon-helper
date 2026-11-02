import { describe, expect, it } from "vitest";
import { cluesOf, crewNotes, crewNotesMarkdown, memberViewer, playerMembers, playerPacketSnapshot, playerShareSnapshot, projectCampaignForViewer, threadsInOrder, type ArcThread, type CampaignMaps } from "@campaign-forge/core";
import { alienModule, HEAT_LABELS } from "@campaign-forge/module-alien";
import { buildDemoCampaign, DEMO_ARCS } from "../src/build";

/** The arc board without ids and timestamps. */
function arcSignature(maps: CampaignMaps) {
  const name = (id: string | undefined) => (id ? (maps.entities[id]?.name ?? "?") : undefined);
  return threadsInOrder(Object.values(maps.arcs)).map((t) => ({
    title: t.title,
    playerTitle: t.playerTitle,
    sponsor: name(t.sponsor),
    goal: t.goal,
    stages: t.stages.map((s) => ({ title: s.title, clues: s.clues.map((c) => ({ kind: c.kind, text: c.text, state: c.state, slot: c.seeded?.slot, job: name(c.seeded?.job), with: name(c.seeded?.entity) })) })),
    clock: { segments: t.clock.segments, filled: t.clock.filled, log: t.clock.log.map((l) => ({ by: l.by, how: l.how, faces: l.roll?.faces })) },
  }));
}

describe("Skyfire Down: the arc board", () => {
  const demo = buildDemoCampaign();
  const { maps, registry } = demo;
  const threads = threadsInOrder(Object.values(maps.arcs));
  const [first, second] = threads as [ArcThread, ArcThread];
  const ore = Object.values(maps.entities).find((e) => e.type === "alien.job" && e.tags.includes("job-board"))!;
  const mara = Object.values(maps.entities).find((e) => e.name === "Mara Quill")!;
  const session = Object.values(maps.sessions)[0]!;
  const clues = threads.flatMap((t) => cluesOf(t).map((x) => ({ t, c: x.clue })));

  it("holds two generated threads, GM-only, from factions already in the campaign", () => {
    expect(threads).toHaveLength(DEMO_ARCS.threads);
    for (const t of threads) {
      expect(t.visibility.level).toBe("gm");
      expect(maps.entities[t.sponsor!]?.type).toBe("alien.faction");
      expect(t.source?.procedure).toBe("alien.campaign-thread");
      expect(maps.generatorRuns[t.source!.run!]?.procedure).toBe("alien.campaign-thread");
      expect(t.stages.length).toBeGreaterThanOrEqual(3);
    }
    expect(first.sponsor).not.toBe(second.sponsor);
  });

  it("seeded one clue into “Ore to the spaceport” (Mara Quill's secret), found in session 1", () => {
    expect(ore.name).toBe("Ore to the spaceport");
    const found = clues.filter((x) => x.c.state === "found");
    expect(found).toHaveLength(1);
    const { t, c } = found[0]!;
    expect(t.id).toBe(first.id);
    expect(c.seeded).toMatchObject({ job: ore.id, slot: "npc-secret", entity: mara.id, slotLabel: "An NPC's secret" });
    expect(c.seeded?.posting).toMatch(/^offers\/posting-\d$/);
    expect(c.found).toMatchObject({ session: session.id, job: ore.id, via: "wrap-up" });
    expect(String(mara.fields["secret"])).toContain(c.text);
    const run = maps.generatorRuns[c.seeded!.run!]!;
    expect(run.procedure).toBe("alien.job-board");
    expect(run.pinnedParts?.["offers/clue"]).toMatchObject({ slot: "npc-secret", at: 0 });
  });

  it("has one more clue seeded but not found, with Mara, who knows it", () => {
    const seeded = clues.filter((x) => x.c.state === "seeded");
    expect(seeded).toHaveLength(1);
    expect(seeded[0]!.t.id).toBe(second.id);
    expect(seeded[0]!.c.seeded).toMatchObject({ entity: mara.id, slot: "contact" });
    expect(mara.contact!.knows).toEqual([{ thread: second.id, clue: seeded[0]!.c.id }]);
  });

  it("keeps Mara Quill as a contact who owes the crew a favour, heat on the last run's employer, and the second thread's clock moved between jobs", () => {
    expect(mara.contact).toMatchObject({ stance: "friendly", favours: { owedToCrew: DEMO_ARCS.favours, owedByCrew: 0 }, lastSeen: { job: ore.id, session: session.id } });
    const hot = Object.values(maps.entities).filter((e) => e.type === "alien.faction" && Number(e.fields["heat"] ?? 0) > 0);
    expect(hot).toHaveLength(1);
    expect(hot[0]!.name).toBe("Colonial Administration");
    expect(hot[0]!.fields["heat"]).toBe(DEMO_ARCS.heat);
    expect(HEAT_LABELS[DEMO_ARCS.heat]).toBe("Watched");
    expect(first.clock.filled).toBe(0);
    expect(second.clock.filled).toBeGreaterThan(0);
    expect(second.clock.log).toEqual([expect.objectContaining({ how: "roll", ignored: true, note: "Between jobs", session: session.id })]);
  });

  it("gives the crew notes the found clue and Mara, and nothing behind them", () => {
    const notes = crewNotes(maps, alienModule, { role: "player" });
    expect(notes.threads).toHaveLength(1);
    expect(notes.threads[0]!.title).toBe(first.playerTitle);
    expect(notes.threads[0]!.clues.map((c) => c.text)).toEqual([clues.find((x) => x.c.state === "found")!.c.playerText]);
    expect(notes.threads[0]!.clues[0]!.foundIn).toBe("Session 1");
    expect(notes.contacts).toEqual([expect.objectContaining({ name: "Mara Quill", favourLine: "Owes the crew a favour." })]);
    expect(notes.places.map((p) => p.name)).toEqual(["Anchorpoint Concourses"]);
  });

  it("never lets an unseen or seeded clue, a GM title, a sponsor, a goal, a clock or heat reach crew notes, the player view, the share or a packet", () => {
    const doc = (id: string) => registry.open(id);
    const at = "2026-11-07T20:00:00Z";
    const outputs: string[] = [JSON.stringify(projectCampaignForViewer(maps, alienModule, { role: "player" })), JSON.stringify(playerShareSnapshot({ maps, module: alienModule, sessionId: session.id, doc, at, referenceName: () => undefined }))];
    const viewers = [{ role: "player" as const }, ...playerMembers(maps.meta).map((m) => memberViewer(maps, m.id))];
    for (const v of viewers) {
      const notes = crewNotes(maps, alienModule, v);
      outputs.push(JSON.stringify(notes), crewNotesMarkdown(notes), JSON.stringify(projectCampaignForViewer(maps, alienModule, v)));
    }
    for (const m of playerMembers(maps.meta)) outputs.push(JSON.stringify(playerPacketSnapshot({ maps, module: alienModule, sessionId: session.id, doc, at, memberId: m.id, referenceName: () => undefined })));
    const secrets = [
      ...threads.flatMap((t) => [t.title, t.goal, t.method, t.weakness, t.cost, ...t.clock.milestones.map((m) => m.text)]),
      ...clues.filter((x) => x.c.state !== "found").flatMap((x) => [x.c.text, x.c.playerText]),
      ...clues.map((x) => x.c.text),
      second.playerTitle,
      ...threads.map((t) => maps.entities[t.sponsor!]!.name).filter((n) => !["Weyland-Yutani", "Jĭngtì Lóng Corporation", "Colonial Administration"].includes(n)),
      "Watched",
      mara.contact!.note!,
    ];
    for (const out of outputs) {
      for (const secret of secrets) expect(out, secret).not.toContain(secret);
      expect(out).not.toMatch(/"heat":|"clock"|"segments"|"stance"|"grudges"|"knows"/);
    }
  });

  it("builds the same arc board every time (modulo ids)", () => {
    const again = buildDemoCampaign();
    expect(arcSignature(again.maps)).toEqual(arcSignature(maps));
  });
});
