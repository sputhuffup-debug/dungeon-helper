import { describe, expect, it } from "vitest";
import { rules } from "../src/rules";
import { templates } from "../src/templates";
import { trackers } from "../src/trackers";
import { modes } from "../src/modes";
import { manifest } from "../src/manifest";
import { referenceLists, talentItems, careerItems, criticalInjuryItems, mentalTraumaItems, frameItems } from "../src/reference";

const modeIds = new Set(modes.map((m) => m.id));

describe("rule cards", () => {
  it("has about 120 cards, each with a page and a unique prefixed id", () => {
    expect(rules.length).toBeGreaterThanOrEqual(120);
    const ids = new Set<string>();
    for (const r of rules) {
      expect(r.id.startsWith("alien.rule.")).toBe(true);
      expect(ids.has(r.id), `duplicate ${r.id}`).toBe(false);
      ids.add(r.id);
      const page = r.page;
      if (typeof page === "number") expect(page).toBeGreaterThan(0);
      else {
        expect(page[0]).toBeGreaterThan(0);
        expect(page[1]).toBeGreaterThanOrEqual(page[0]);
      }
      expect(r.summary.length).toBeGreaterThan(20);
      for (const m of r.mode ?? []) expect(modeIds.has(m)).toBe(true);
    }
  });
  it("covers the mandatory topics", () => {
    const ids = new Set(rules.map((r) => r.id));
    for (const slug of [
      "push", "skill-rolls", "helping", "story-points", "stress", "stress-response", "panic-triggers", "panic-roll", "mental-trauma",
      "range-bands", "time-units", "initiative", "actions", "damage-armor", "critical-injuries", "encumbrance", "supply-rolls",
      "consumables", "starving", "dehydrated", "exhausted", "freezing", "healing", "stealth-mode", "zones", "calling-pvp",
      "buddies-rivals", "xp", "shore-leave", "xenomorphs-campaign", "three-acts", "agendas", "androids", "ship-combat",
      "space-travel", "ftl-travel", "ship-modules", "creature-attacks", "acid-splash", "lifecycle", "containment",
      "encounter-cadence", "job-frames", "gm-principles", "themes",
    ]) {
      expect(ids.has(`alien.rule.${slug}`), slug).toBe(true);
    }
  });
  it("links only to rule cards and trackers that exist", () => {
    const ids = new Set(rules.map((r) => r.id));
    const trackerIds = new Set(trackers.map((t) => t.id));
    for (const r of rules) {
      for (const l of r.links?.rules ?? []) expect(ids.has(l), `${r.id} -> ${l}`).toBe(true);
      for (const t of r.links?.trackers ?? []) expect(trackerIds.has(t), `${r.id} -> ${t}`).toBe(true);
    }
  });
});

describe("templates", () => {
  it("declares six templates, each with a declared mode and a page", () => {
    expect(templates).toHaveLength(6);
    for (const t of templates) {
      expect(t.mode, t.id).toBeDefined();
      expect(t.mode!.length).toBeGreaterThan(0);
      for (const m of t.mode!) expect(modeIds.has(m)).toBe(true);
      expect(t.page).toBeDefined();
      expect(typeof t.scaffold).toBe("object");
    }
    expect(templates.map((t) => t.kind).sort()).toEqual(["adventure", "adventure", "campaign", "checklist", "scene", "session"]);
  });
  it("cinematic adventure has three acts with agenda handouts", () => {
    const t = templates.find((x) => x.id === "alien.template.cinematic-adventure")!;
    const s = t.scaffold as { acts: Array<{ title: string; scenes: Array<{ mandatory?: boolean }>; handouts: Array<{ visibility: string }> }>; playerIntro: string };
    expect(s.acts.map((a) => a.title)).toEqual(["Setup", "Tilt", "Showdown"]);
    expect(s.playerIntro).toContain("What's the story, Mother?");
    for (const a of s.acts) {
      expect(a.scenes.some((sc) => sc.mandatory)).toBe(true);
      expect(a.scenes.some((sc) => !sc.mandatory)).toBe(true);
      expect(a.handouts.every((h) => h.visibility === "some_players")).toBe(true);
    }
  });
});

describe("trackers and manifest", () => {
  it("has the seven tracker ids from the field-name doc", () => {
    expect(trackers.map((t) => t.id).sort()).toEqual(
      ["alien.clock", "alien.countdown", "alien.initiative", "alien.stealth", "alien.story-points", "alien.stress", "alien.supply"].sort(),
    );
    const ruleIds = new Set(rules.map((r) => r.id));
    for (const t of trackers) for (const r of t.rules ?? []) expect(ruleIds.has(r), `${t.id} -> ${r}`).toBe(true);
  });
  it("manifest is unverified, campaign by default, with both modes", () => {
    expect(manifest.id).toBe("alien");
    expect(manifest.dataStatus).toBe("unverified");
    expect(manifest.defaultMode).toBe("campaign");
    expect(manifest.modes.map((m) => m.id)).toEqual(["cinematic", "campaign"]);
  });
});

describe("reference lists", () => {
  it("have unique item ids; unverified flags, where kept, are true", () => {
    for (const l of referenceLists) {
      expect([true, undefined], l.id).toContain(l.unverified);
      expect(new Set(l.items.map((i) => i.id)).size).toBe(l.items.length);
    }
  });
  it("character reference lists are verified against the book", () => {
    for (const id of ["alien.skills", "alien.careers", "alien.talents", "alien.critical-injuries", "alien.mental-traumas"]) {
      const l = referenceLists.find((x) => x.id === id)!;
      expect(l.unverified, id).toBeUndefined();
      for (const i of l.items) expect(i.unverified, `${id}/${i.id}`).toBeUndefined();
    }
  });
  it("has 12 skills, 9 careers, 36 critical injuries, 18 traumas, 3 frames and 56 talents", () => {
    expect(referenceLists.find((l) => l.id === "alien.skills")!.items).toHaveLength(12);
    expect(careerItems).toHaveLength(9);
    expect(criticalInjuryItems).toHaveLength(36);
    expect(mentalTraumaItems).toHaveLength(18);
    expect(frameItems).toHaveLength(3);
    expect(talentItems).toHaveLength(56);
    expect(talentItems.filter((t) => t.career).length).toBe(27);
    const byId = Object.fromEntries(talentItems.map((t) => [t.id, t]));
    expect(byId["hardened"]!.stackLimit).toBe(3);
    expect(byId["seen-it-all"]!.stackLimit).toBe(3);
    expect(byId["hardened"]!.maxStack).toBe(3);
    expect(byId["lucky"]!.career).toBe("kid");
    expect(byId["second-wind"]!.career).toBeUndefined();
  });
  it("career stat lines match the book (p. 31-39)", () => {
    const c = Object.fromEntries(careerItems.map((x) => [x.id, x]));
    expect(c["company-agent"]!.keyAttribute).toBe("wits");
    expect(c["company-agent"]!.cash).toBe("d6 x 1000");
    expect(c["officer"]!.keyAttribute).toBe("empathy");
    expect(c["colonial-marshal"]!.keySkills).toEqual(["observation", "rangedCombat", "command"]);
    expect(c["medic"]!.keySkills).toEqual(["mobility", "observation", "medicalAid"]);
    expect(careerItems.map((x) => x.page)).toEqual([31, 32, 33, 34, 35, 36, 37, 38, 39]);
  });
  it("career talents and key skills resolve to real talent and skill ids", () => {
    const talentIds = new Set(talentItems.map((t) => t.id));
    const skillIds = new Set(referenceLists.find((l) => l.id === "alien.skills")!.items.map((i) => i.id));
    for (const c of careerItems) {
      for (const t of c.talents) expect(talentIds.has(t), `${c.id} -> ${t}`).toBe(true);
      for (const s of c.keySkills) expect(skillIds.has(s), `${c.id} -> ${s}`).toBe(true);
      expect(c.names).toHaveLength(6);
      expect(c.appearances).toHaveLength(6);
      expect(c.agendas).toHaveLength(3);
      expect(c.gear).toHaveLength(6);
      expect(c.signatureItems).toHaveLength(3);
    }
    expect(talentIds.has("hardened")).toBe(true);
    expect(talentIds.has("seen-it-all")).toBe(true);
  });
  it("critical injuries cover every d66 result in order", () => {
    const rolls = criticalInjuryItems.map((c) => c.roll);
    const expected: number[] = [];
    for (let t = 1; t <= 6; t++) for (let u = 1; u <= 6; u++) expected.push(t * 10 + u);
    expect(rolls).toEqual(expected);
  });
});
