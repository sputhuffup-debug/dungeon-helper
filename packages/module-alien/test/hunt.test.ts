import { evaluateLogic, evaluateNumber } from "@campaign-forge/module-sdk";
import { describe, expect, it } from "vitest";
import { toolPresets } from "../src/data/items";
import { npcPresets } from "../src/data/npc-presets";
import { ALIEN_HUNT, MOTION_TRACKER_IDS, RANGE_BANDS, SIGNAL_TOKEN_LETTERS, androidMover, creatureMover, humanMover, motionTrackers, siteMapGenerator } from "../src/maps/index";

describe("the Alien live hunt", () => {
  it("is the site map generator's hunt: stretches and rounds, the Starter Set's A-J signal tokens", () => {
    expect(siteMapGenerator.hunt).toBe(ALIEN_HUNT);
    expect(ALIEN_HUNT.steps.map((s) => [s.id, s.page])).toEqual([
      ["stretch", 55],
      ["round", 59],
    ]);
    expect(ALIEN_HUNT.blipLetters).toEqual([...SIGNAL_TOKEN_LETTERS]);
    expect(SIGNAL_TOKEN_LETTERS.join("")).toBe("ABCDEFGHIJ");
  });

  it("moves creatures by Speed each stretch (p. 55) and two zones a fighting turn (p. 208), through the ducts", () => {
    const stretch = creatureMover.zones!.stretch!;
    expect(evaluateNumber(stretch as never, { speed: 3 })).toBe(3);
    expect(evaluateNumber(stretch as never, {})).toBe(1);
    expect(creatureMover.zones!.round).toBe(2);
    expect(creatureMover.ducts).toBe(true);
    // passive enemies wait (p. 55-56): the posture is the spawn mark's state
    expect(creatureMover.postureKey).toBe("state");
    expect(creatureMover.postures!.passive!.stay).toBeGreaterThan(0);
  });

  it("keeps people out of the ducts and lets androids in, as the legend says", () => {
    expect(humanMover.ducts).toBe(false);
    expect(androidMover.ducts).toBe(true);
    const legend = siteMapGenerator.legend!.find((e) => "marker" in e.target && e.target.marker === "hostile")!;
    expect(legend.rule).toMatch(/People keep out of the ducts; androids may use them/);
  });

  it("makes each kind from the map's marks and the cast: spawns, hostile groups, a turning android", () => {
    const kind = (m: { kind: string; data?: Record<string, unknown> }) =>
      ALIEN_HUNT.movers.find((mv) => (mv.from?.markers ?? []).some((f) => f.kind === m.kind && (f.when === undefined || evaluateLogic(f.when, m.data ?? {}))))?.id;
    expect(kind({ kind: "spawn", data: { creature: "alien.creature.xx121-stalker", speed: 2 } })).toBe("creature");
    expect(kind({ kind: "hostile", data: { kind: "human", posture: "patrol" } })).toBe("humans");
    expect(kind({ kind: "hostile", data: { kind: "android", posture: "patrol" } })).toBe("android");
    expect(kind({ kind: "npc", data: { role: "android", turns: true } })).toBe("android");
    // the job's people are NPCs, never hostile "rogue humans"
    expect(kind({ kind: "npc", data: { role: "survivor" } })).toBe("npc");
    expect(kind({ kind: "npc", data: { role: "contact" } })).toBe("npc");
    expect(kind({ kind: "npc", data: { role: "android" } })).toBe("android-npc");
    expect(kind({ kind: "clue" })).toBeUndefined();
    const entityKind = (e: { type: string; fields: Record<string, unknown> }) =>
      ALIEN_HUNT.movers.find((mv) => (mv.from?.entities ?? []).some((f) => f.type === e.type && (f.when === undefined || evaluateLogic(f.when, { type: e.type, fields: e.fields }))))?.id;
    const covert = npcPresets.find((p) => p.id === "alien.npc.android-covert")!;
    expect(entityKind({ type: "alien.character", fields: covert.fields })).toBe("android-npc");
    expect(entityKind({ type: "alien.character", fields: { android: false } })).toBe("npc");
    for (const id of ["npc", "android-npc"]) expect(ALIEN_HUNT.movers.find((m) => m.id === id)!.label).not.toMatch(/rogue|hostile/i);
    expect(entityKind({ type: "alien.creature", fields: { speed: 2 } })).toBe("creature");
    expect(entityKind({ type: "alien.creature", fields: { loreOnly: true } })).toBeUndefined();
  });

  it("reads motion trackers from the gear tables: the M314 to Long, the M316 to Medium, movement only", () => {
    expect(motionTrackers.map((s) => [s.label, s.range, s.detects, s.through])).toEqual([
      ["M314 Motion Tracker", "long", "moved", "any"],
      ["M316 Motion Tracker", "medium", "moved", "any"],
    ]);
    for (const [i, id] of MOTION_TRACKER_IDS.entries()) {
      const p = toolPresets.find((x) => x.id === id)!;
      expect(motionTrackers[i]!.range).toBe(p.fields.range);
      expect(motionTrackers[i]!.carried.presets).toEqual([id]);
    }
    // Long is up to four zones, the M314's reach (p. 55, 58)
    expect(RANGE_BANDS.find((b) => b.id === "long")!.maxDistance).toBe(4);
    // an NPC preset's "Motion tracker" is the M314
    const withTracker = npcPresets.find((p) => (p.fields.gear as Array<{ name: string }> | undefined)?.some((g) => g.name === "Motion tracker"));
    expect(withTracker).toBeDefined();
    expect(motionTrackers[0]!.carried.names).toContain("Motion tracker");
  });

  it("cites the book for every rule it takes from it and marks the rest as its own", () => {
    const notes = [...(ALIEN_HUNT.notes ?? []), ...ALIEN_HUNT.movers.flatMap((m) => m.notes ?? []), ...(ALIEN_HUNT.sensors ?? []).flatMap((s) => s.notes ?? [])];
    expect(notes.length).toBeGreaterThan(10);
    for (const n of notes) expect(n.page !== undefined || n.original === true, n.text).toBe(true);
    const tracker = motionTrackers[0]!.notes!;
    expect(tracker.filter((n) => n.page === 58).map((n) => n.text)).toEqual([
      "Once per stretch, after a power supply roll.",
      "Picks up everyone within range, even out of sight, but only those that moved: a still target shows nothing.",
      "A blip is not seeing them: no Observation roll, no target.",
    ]);
  });
});
