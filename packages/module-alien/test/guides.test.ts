import { describe, expect, it } from "vitest";
import { checkModule } from "@campaign-forge/module-sdk";
import alienModule, { PLAY_GUIDE_ID, SKILL_BINDINGS, playGuide, skills } from "../src";

const ATTRIBUTES = ["strength", "agility", "wits", "empathy"];
const skillName = new Map(skills.items.map((s) => [s.id, String(s.name)]));

describe("play guide", () => {
  it("is registered on the module", () => {
    expect(alienModule.playGuides).toEqual([playGuide]);
    expect(playGuide.id).toBe(PLAY_GUIDE_ID);
    expect(playGuide.title).toBeTruthy();
  });

  it("has one group per attribute, each with a summary and page", () => {
    expect(playGuide.groups.map((g) => g.id)).toEqual(ATTRIBUTES);
    for (const g of playGuide.groups) {
      expect(g.summary, g.id).toBeTruthy();
      expect(g.page, g.id).toBeDefined();
    }
  });

  it("has exactly one entry per skill, rolled by its skill id under its attribute", () => {
    for (const { id, attribute } of SKILL_BINDINGS) {
      const matches = playGuide.entries.filter((e) => e.kind === "skill" && e.roll === id);
      expect(matches, id).toHaveLength(1);
      const entry = matches[0]!;
      expect(entry.group, id).toBe(attribute);
      expect(entry.label, id).toBe(skillName.get(id));
    }
    expect(playGuide.entries.filter((e) => e.kind === "skill")).toHaveLength(SKILL_BINDINGS.length);
  });

  it("has one entry per attribute; only Strength and Empathy are rolled alone", () => {
    const attrs = playGuide.entries.filter((e) => e.kind === "attribute");
    expect(attrs.map((e) => e.id)).toEqual(ATTRIBUTES);
    for (const e of attrs) expect(e.group).toBe(e.id);
    const rolled = Object.fromEntries(attrs.map((e) => [e.id, e.roll]));
    expect(rolled).toEqual({ strength: "attr:strength", agility: undefined, wits: undefined, empathy: "attr:empathy" });
  });

  it("gives every entry cues, a success, a failure and a page", () => {
    for (const e of playGuide.entries) {
      expect(e.callFor.length, e.id).toBeGreaterThan(0);
      for (const cue of e.callFor) expect(cue.trim(), e.id).not.toBe("");
      expect(e.success, e.id).toBeTruthy();
      expect(e.failure, e.id).toBeTruthy();
      expect(e.page, e.id).toBeDefined();
    }
  });

  it("gives every skill 3-5 cues, a push note and 1-2 examples", () => {
    for (const e of playGuide.entries.filter((x) => x.kind === "skill")) {
      expect(e.callFor.length, e.id).toBeGreaterThanOrEqual(3);
      expect(e.callFor.length, e.id).toBeLessThanOrEqual(5);
      expect(e.push, e.id).toBeTruthy();
      expect(e.examples?.length ?? 0, e.id).toBeGreaterThanOrEqual(1);
      expect(e.examples?.length ?? 0, e.id).toBeLessThanOrEqual(2);
    }
  });

  it("references only groups that exist, with unique ids", () => {
    const groupIds = new Set(playGuide.groups.map((g) => g.id));
    expect(groupIds.size).toBe(playGuide.groups.length);
    for (const e of playGuide.entries) if (e.group !== undefined) expect(groupIds.has(e.group), e.id).toBe(true);
    const ids = playGuide.entries.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("has 6-10 tips, each citing a page unless it cites pages inline", () => {
    const tips = playGuide.tips ?? [];
    expect(tips.length).toBeGreaterThanOrEqual(6);
    expect(tips.length).toBeLessThanOrEqual(10);
    for (const t of tips) {
      const inline = /\(pp?\. \d+/.test(t.text);
      expect(t.page !== undefined || inline, t.text).toBe(true);
    }
  });

  it("uses no mode tags (no skill plays differently between cinematic and campaign)", () => {
    expect(playGuide.mode).toBeUndefined();
    for (const e of playGuide.entries) expect(e.mode, e.id).toBeUndefined();
  });

  it("raises no play-guide conformance issues, errors or warnings", () => {
    const issues = checkModule(alienModule, { skipProcedureRuns: true }).issues.filter((i) => i.where.startsWith("playGuide"));
    expect(issues.map((i) => `${i.where}: ${i.message}`)).toEqual([]);
  });

  it("never carries a purchase watermark", () => {
    expect(JSON.stringify(playGuide)).not.toMatch(/\(\s*order\s*#?\s*\d+/i);
  });
});
