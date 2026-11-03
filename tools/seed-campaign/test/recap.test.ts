/**
 * "Previously on…" in Skyfire Down: session 1 is played and session 2 is
 * planned with a recap built from it. The GM's recap names the ore job, the
 * clue Mara Quill gave up (under the thread's GM title), Mara as a contact,
 * the heat on the last run's employer, the clock that moved, the betrayer in
 * play and the loose ends; the players' read-aloud names the job, the clue
 * under the thread's player title and Mara's favour, and a secret scan finds
 * nothing GM-only in it.
 */
import { describe, expect, it } from "vitest";
import { cluesOf, playerRecap, projectCampaignForViewer, recapMarkdown, recapReadAloud, recapTexts, stringLeaves, threadsInOrder, type ArcThread } from "@campaign-forge/core";
import { alienModule, HEAT_LABELS } from "@campaign-forge/module-alien";
import { buildDemoCampaign, DEMO_SESSION_2 } from "../src/build";

describe("Skyfire Down: the recap for session 2", () => {
  const { maps } = buildDemoCampaign();
  const sessions = Object.values(maps.sessions).sort((a, b) => a.number - b.number);
  const [one, two] = sessions as [(typeof sessions)[0], (typeof sessions)[0]];
  const threads = threadsInOrder(Object.values(maps.arcs));
  const [first, second] = threads as [ArcThread, ArcThread];
  const clues = threads.flatMap((t) => cluesOf(t).map((x) => x.clue));
  const found = clues.find((c) => c.state === "found")!;
  const ore = Object.values(maps.entities).find((e) => e.type === "alien.job" && e.tags.includes("job-board"))!;
  const mara = Object.values(maps.entities).find((e) => e.name === "Mara Quill")!;
  const recap = two.recap!;

  it("is stored on session 2, covering session 1, generated at a fixed time", () => {
    expect(one.status).toBe("done");
    expect(one.summary).toContain(ore.name);
    expect(two).toMatchObject({ number: DEMO_SESSION_2.number, status: "planned", title: DEMO_SESSION_2.title });
    expect(two.nextPlan).toEqual((one.wrapUp as { looseEnds: string[] }).looseEnds);
    expect(recap).toMatchObject({ span: { kind: "last" }, sessions: [one.id], generated: DEMO_SESSION_2.recapAt });
    expect(recap.shown).toBeUndefined();
  });

  it("tells the GM what happened and what the players don't know", () => {
    const gm = recapTexts(recap, "gm").join("\n");
    expect(gm).toContain(one.summary!);
    expect(gm).toContain(`The crew took the job ${ore.name}`);
    expect(gm).toContain(`${first.title}: ${found.text.replace(/\.$/, "")} (from Mara Quill, on ${ore.name}).`);
    expect(gm).toContain("Mara Quill is a contact (friendly). Owes the crew a favour.");
    expect(gm).toContain(`Colonial Administration heat: ${HEAT_LABELS[2]} (2).`);
    expect(gm).toContain(`${second.title}: the clock moved +`);
    expect(gm).toMatch(/means to turn on the crew on Ore to the spaceport\./);
    expect(gm).toContain(`Waiting to be found, ${second.title}:`);
    for (const l of two.nextPlan) expect(gm).toContain(l);
    expect(recap.gm.find((s) => s.id === "secrets")!.title).toBe("What the players don't know");
  });

  it("gives the players a read-aloud from their projection only", () => {
    const text = recapTexts(recap, "players").join("\n");
    // dated in the world, never by the table's real-world date
    expect(one.inWorldDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(text).toContain(`Session 1: The offer (${one.inWorldDate}).`);
    expect(text).not.toContain("7 Nov 2026");
    // the GM's summary is offered to read aloud, switched off
    const offered = recap.players.flatMap((s) => s.lines).filter((l) => l.optIn);
    expect(offered).toEqual([expect.objectContaining({ key: "summary", text: one.summary, off: true })]);
    expect(text).toContain(`${first.playerTitle}: ${found.playerText.replace(/\.$/, "")}`);
    expect(text).toContain("Mara Quill is one of your contacts. Owes the crew a favour.");
    expect(text).toContain(`The crew took the job ${ore.name}`);
    // the secret scan: GM titles, sponsors, goals, clocks, unfound clues, heat, stance, the GM's notes, the session's summary and plan, GM-only names and fields
    const proj = projectCampaignForViewer(maps, alienModule, { role: "player" });
    const corpus = JSON.stringify(proj).toLowerCase();
    const hiddenNames = Object.values(maps.entities).filter((e) => !proj.entities[e.id] && e.name.length >= 6 && !corpus.includes(e.name.toLowerCase())).map((e) => e.name);
    const hiddenLeaves = Object.values(maps.entities).flatMap((e) => {
      const seen = new Set(stringLeaves(proj.entities[e.id]?.fields ?? {}, 8));
      return stringLeaves(e.fields, 8).filter((l) => l.length >= 20 && !seen.has(l) && !corpus.includes(l.toLowerCase()));
    });
    const secrets = [
      ...threads.flatMap((t) => [t.title, t.goal, t.method, t.weakness, t.cost, ...t.clock.milestones.map((m) => m.text)]),
      ...clues.filter((c) => c.state !== "found").flatMap((c) => [c.text, c.playerText]),
      ...clues.map((c) => c.text),
      second.playerTitle,
      ...HEAT_LABELS.slice(1),
      "friendly",
      mara.contact!.note!,
      one.summary!,
      ...two.nextPlan,
      ...hiddenNames,
      ...hiddenLeaves,
    ];
    const shown = playerRecap(maps, alienModule, two.id)!;
    const sharedLines = recap.players.map((s) => ({ ...s, lines: s.lines.filter((l) => !l.optIn) }));
    const outputs = [JSON.stringify(sharedLines), JSON.stringify(shown), recapMarkdown(recap.players), recapReadAloud(recap.players)];
    for (const out of outputs) {
      for (const secret of secrets) expect(out.toLowerCase(), secret).not.toContain(secret.toLowerCase());
      expect(out).not.toMatch(/GM only|"heat"|clock|stance/);
    }
    // the player screen gets it only once the GM shows it
    expect(playerRecap(maps, alienModule, two.id, { requireShown: true })).toBeUndefined();
  });

  it("is the same on every build (modulo ids)", () => {
    const again = buildDemoCampaign().maps;
    const r2 = Object.values(again.sessions).find((s) => s.number === 2)!.recap!;
    expect(recapTexts(r2)).toEqual(recapTexts(recap));
  });
});
