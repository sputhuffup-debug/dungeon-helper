import { describe, expect, it } from "vitest";
import { emptyRecapSnapshot, recapIssues, type RecapEntity, type RecapSnapshot } from "@campaign-forge/module-sdk";
import { alienModule } from "../src/index";
import { alienRecapSections, favourText } from "../src/recap";

const T0 = "2026-11-01T00:00:00.000Z";
const T1 = "2026-11-08T00:00:00.000Z";

const ent = (e: Partial<RecapEntity> & Pick<RecapEntity, "id" | "name" | "type">): RecapEntity => ({ fields: {}, created: T1, updated: T1, ...e });

/** One session in: a job taken, a clue found, a contact, a betrayer, a hidden synthetic, a PC agenda, a clock, heat, a payoff, the funds, a trip and the hunt. */
function gmSnapshot(): RecapSnapshot {
  const s = emptyRecapSnapshot("gm", "campaign");
  return {
    ...s,
    sessions: [{ id: "s1", number: 1, date: "2026-11-07", label: "Session 1: The offer" }],
    since: T0,
    entities: [
      ent({ id: "job", name: "Ore to the spaceport", type: "alien.job", kind: "job", fields: { status: "accepted", employer: "Geofund", payment: 20000, destination: "Spaceport", betrayers: ["Juno Blanchard"] } }),
      ent({ id: "old", name: "An old run", type: "alien.job", kind: "job", fields: { status: "done" }, updated: "2026-10-01T00:00:00.000Z", created: "2026-10-01T00:00:00.000Z" }),
      ent({ id: "mara", name: "Mara Quill", type: "alien.character", kind: "character", contact: { since: T1, stance: "friendly", favours: { owedToCrew: 1, owedByCrew: 0 }, foundAt: "the cargo stalls", lastSeen: { job: "job", session: "s1" } } }),
      ent({ id: "juno", name: "Juno Blanchard", type: "alien.character", kind: "character", fields: { android: true, secretAndroid: true } }),
      ent({ id: "pc", name: "Elena", type: "alien.character", kind: "character", pc: true, fields: { campaignAgenda: { beat: { n: 1, text: "Make a friend at the docks." }, history: [{ text: "Look at a berth.", outcome: "advanced", job: "Job 1" }], secret: { text: "SECRET-AGENDA" } } } }),
      ent({ id: "ship", name: "MV Skyfire", type: "alien.spaceship", kind: "vehicle" }),
    ],
    relationships: [{ type: "involved_in", from: "juno", to: "job" }],
    clues: [
      { thread: "t1", threadTitle: "GM-TITLE", clue: "c1", kind: "fact", kindLabel: "Fact", text: "A second manifest", state: "found", foundIn: "s1", entity: "mara", job: "job" },
      { thread: "t1", threadTitle: "GM-TITLE", clue: "c2", kind: "fact", kindLabel: "Fact", text: "Not found yet", state: "seeded" },
    ],
    ticks: [{ thread: "t1", threadTitle: "GM-TITLE", by: 1, how: "roll", at: T1, session: "s1", ignored: true, filled: 1, segments: 6, reached: [] }],
    payoffs: [{ thread: "t1", threadTitle: "GM-TITLE", milestone: 3, kind: "posting", label: "A posting from the sponsor", text: "A quiet courier job." }],
    heat: [{ id: "ca", name: "Colonial Administration", heat: 2, label: "Watched", before: 1, beforeLabel: "Noticed" }],
    ledger: [{ id: "l1", amount: 12000, category: "job-payment", note: "Pay for the last run", created: T1 }],
    balance: 18330,
    travel: [{ id: "tr", ship: "ship", fromName: "Y87-544", toName: "Anchorpoint Station", status: "arrived", created: T1 }],
    hunts: [{ map: "m", mapName: "Spaceport", step: 2, tokens: [{ id: "a", label: "Stalker", state: "detected" }, { id: "b", label: "UPP team", state: "seen", hurt: true }] }],
  };
}

const texts = (s: RecapSnapshot) => alienRecapSections(s).flatMap((x) => x.lines.map((l) => l.text));

describe("Alien recap lines", () => {
  it("tells the GM about jobs, clues under the GM title, contacts, the ship and the hunt, and the secrets", () => {
    const sections = alienRecapSections(gmSnapshot());
    expect(sections.map((s) => s.id)).toEqual(["alien.jobs", "alien.clues", "alien.contacts", "alien.ship", "alien.hunt", "secrets"]);
    expect(sections.every((s) => s.audience === "gm")).toBe(true);
    const t = texts(gmSnapshot());
    expect(t).toContain("The crew took the job Ore to the spaceport (for Geofund, $20,000 on delivery), bound for spaceport.");
    expect(t.join("\n")).not.toContain("An old run");
    expect(t).toContain("GM-TITLE: A second manifest (from Mara Quill, on Ore to the spaceport).");
    expect(t).toContain("Mara Quill is a contact (friendly). Owes the crew a favour. Where to find them: the cargo stalls.");
    expect(t).toContain("Juno Blanchard means to turn on the crew on Ore to the spaceport.");
    expect(t).toContain("Juno Blanchard is a synthetic posing as human.");
    expect(t).toContain("Elena's goal advanced on Job 1: Look at a berth.");
    expect(t).toContain("Elena's agenda beat this job: Make a friend at the docks.");
    expect(t).toContain("GM-TITLE: the clock moved +1 to 1/6, pushed on because the crew left it alone.");
    expect(t).toContain("Payoff waiting on GM-TITLE: A posting from the sponsor. A quiet courier job.");
    expect(t).toContain("Colonial Administration heat: Watched (2), up from Noticed.");
    expect(t).toContain("The MV Skyfire reached Anchorpoint Station from Y87-544.");
    expect(t).toContain("+$12,000: Pay for the last run.");
    expect(t).toContain("Crew funds now: $18,330.");
    expect(t).toContain("Spaceport, 2 moves in: Stalker is on the motion tracker.");
    expect(t).toContain("Spaceport, 2 moves in: UPP team has been seen by the crew, hurt.");
    // the agenda's secret is not a recap line, even for the GM
    expect(t.join("\n")).not.toContain("SECRET-AGENDA");
  });

  it("reads the players' snapshot as it is: the player title, the favours, revealed synthetics, seen threats, no secrets", () => {
    const s: RecapSnapshot = {
      ...emptyRecapSnapshot("players", "campaign"),
      sessions: [{ id: "s1", number: 1, date: "2026-11-07", label: "Session 1" }],
      since: T0,
      entities: [
        ent({ id: "job", name: "Ore to the spaceport", type: "alien.job", kind: "job", fields: { status: "accepted", payment: 20000 } }),
        ent({ id: "mara", name: "Mara Quill", type: "alien.character", kind: "character", contact: { since: T1, favours: { owedToCrew: 0, owedByCrew: 2 } } }),
        ent({ id: "juno", name: "Juno Blanchard", type: "alien.character", kind: "character", fields: { android: true } }),
      ],
      reveals: [{ session: "s1", entity: "juno", field: "android" }],
      clues: [{ thread: "t1", threadTitle: "The colony that cannot breathe", clue: "c1", kind: "fact", kindLabel: "Fact", text: "Two manifests", state: "found", foundIn: "s1" }],
      hunts: [{ map: "m", mapName: "Spaceport", step: 2, tokens: [{ id: "b", label: "UPP team", state: "seen" }] }],
    };
    const sections = alienRecapSections(s);
    expect(sections.every((x) => x.audience === "players")).toBe(true);
    expect(sections.some((x) => x.id === "secrets")).toBe(false);
    const t = texts(s);
    expect(t).toEqual([
      "The crew took the job Ore to the spaceport ($20,000 on delivery).",
      "The colony that cannot breathe: Two manifests.",
      "Mara Quill is one of your contacts. The crew owes them 2 favours.",
      "On Spaceport, the crew saw UPP team.",
      "Juno Blanchard turned out to be a synthetic.",
    ]);
  });

  it("words favours both ways", () => {
    expect(favourText({ owedToCrew: 0, owedByCrew: 0 })).toBe("No favours either way.");
    expect(favourText({ owedToCrew: 2, owedByCrew: 1 })).toBe("Owes the crew 2 favours; the crew owes them a favour.");
  });

  it("passes the recap conformance check and is deterministic", () => {
    expect(recapIssues(alienModule)).toEqual([]);
    expect(JSON.stringify(alienRecapSections(gmSnapshot()))).toBe(JSON.stringify(alienRecapSections(gmSnapshot())));
  });
});
