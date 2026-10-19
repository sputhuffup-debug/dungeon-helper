import { checkModule, filterByMode, type TemplateChecklist } from "@campaign-forge/module-sdk";
import { describe, expect, it } from "vitest";
import { alienModule } from "../src";
import { rules } from "../src/rules";
import { templates } from "../src/templates";
import { trackers } from "../src/trackers";
import { modes } from "../src/modes";
import { manifest } from "../src/manifest";
import { referenceLists, talentItems, careerItems, criticalInjuryItems, mentalTraumaItems, frameItems } from "../src/reference";

const modeIds = new Set(modes.map((m) => m.id));

describe("rule cards", () => {
  it("has about 180 cards, each with a page and a unique prefixed id", () => {
    expect(rules.length).toBeGreaterThanOrEqual(170);
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
      "consumables", "fatigue", "food-water", "sleep-deprivation", "heat-cold", "suffocation", "vacuum", "healing", "stealth-mode", "zones", "calling-pvp",
      "buddies-rivals", "xp", "shore-leave", "xenomorphs-campaign", "three-acts", "agendas", "androids", "ship-combat",
      "space-travel", "ftl-travel", "ship-modules", "creature-attacks", "acid-splash", "lifecycle", "containment",
      "encounter-cadence", "job-frames", "gm-principles", "themes",
    ]) {
      expect(ids.has(`alien.rule.${slug}`), slug).toBe(true);
    }
  });
  it("keeps summaries to at most three sentences and cites the book's pages", () => {
    const byId = new Map(rules.map((r) => [r.id, r]));
    for (const r of rules) expect(r.summary.split(/(?<=[.!?])\s+(?=[A-Z"])/).length, r.id).toBeLessThanOrEqual(3);
    const pages: Record<string, unknown> = {
      "play-modes": 18, push: 43, "stress-response": 44, "story-points": [44, 158], "panic-roll": 72, "panic-results": 73,
      "mental-trauma": 74, "range-bands": 55, initiative: 59, actions: 60, "critical-injuries": [68, 70], fatigue: 75,
      "acid-splash": 210, "broken-xenomorph": [208, 209], "three-acts": 157, "calling-pvp": [27, 158], "gm-principles": 152,
      "ship-actions": [143, 144], "ship-modules": [122, 124], xp: 30, "shore-leave": 257, "life-paths": [282, 289], "minor-corporations": 162,
    };
    for (const [slug, page] of Object.entries(pages)) expect(byId.get(`alien.rule.${slug}`)?.page, slug).toEqual(page);
    // Rules the Evolved Edition does not have.
    for (const slug of ["starving", "dehydrated", "exhausted", "freezing", "conditions", "derelicts"]) expect(byId.has(`alien.rule.${slug}`), slug).toBe(false);
    expect(byId.get("alien.rule.mental-trauma")!.summary).toContain("D66");
    expect(byId.get("alien.rule.range-bands")!.summary).toContain("Adjacent");
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
  it("declares eight templates, each with a declared mode and a page", () => {
    expect(templates).toHaveLength(8);
    for (const t of templates) {
      expect(t.mode, t.id).toBeDefined();
      expect(t.mode!.length).toBeGreaterThan(0);
      for (const m of t.mode!) expect(modeIds.has(m)).toBe(true);
      expect(t.page).toBeDefined();
      expect(typeof t.scaffold).toBe("object");
    }
    expect(templates.map((t) => t.kind).sort()).toEqual(["adventure", "adventure", "adventure", "campaign", "checklist", "checklist", "scene", "session"]);
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
  it("has the eight tracker ids from the field-name doc", () => {
    expect(trackers.map((t) => t.id).sort()).toEqual(
      ["alien.clock", "alien.countdown", "alien.gestation", "alien.initiative", "alien.stealth", "alien.story-points", "alien.stress", "alien.supply"].sort(),
    );
    const ruleIds = new Set(rules.map((r) => r.id));
    for (const t of trackers) for (const r of t.rules ?? []) expect(ruleIds.has(r), `${t.id} -> ${r}`).toBe(true);
  });
  it("manifest is verified, campaign by default, with both modes", () => {
    expect(manifest.id).toBe("alien");
    expect(manifest.dataStatus).toBe("verified");
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

describe("session checklist", () => {
  const template = templates.find((t) => t.id === "alien.template.session-checklist")!;
  const items = (template.scaffold as TemplateChecklist).items;
  const idsFor = (mode: string) => filterByMode(items, mode).map((i) => i.id);

  it("adds to the generic session checklist with namespaced, paged, phased items", () => {
    expect(template.kind).toBe("checklist");
    expect(template.appliesTo).toBe("session");
    expect(items.length).toBeGreaterThan(0);
    for (const i of items) {
      expect(i.id.startsWith("alien."), i.id).toBe(true);
      expect(i.id.startsWith(`alien.${i.phase}.`), i.id).toBe(true);
      expect(["prep", "play", "wrap"]).toContain(i.phase);
      expect(i.page, i.id).toBeDefined();
      expect(i.guidance, i.id).toBeTruthy();
    }
    const report = checkModule(alienModule);
    expect(report.issues.filter((i) => i.where.startsWith("template:alien.template.session-checklist"))).toEqual([]);
  });

  it("filters by play mode", () => {
    expect(idsFor("cinematic")).toEqual(["alien.prep.agendas", "alien.prep.infections", "alien.play.supply", "alien.play.story-points", "alien.wrap.trauma"]);
    expect(idsFor("campaign")).toEqual(["alien.prep.job", "alien.prep.infections", "alien.play.supply", "alien.wrap.xp", "alien.wrap.trauma"]);
  });

  it("ticks the XP and trauma items when the end-of-session prompts are answered", () => {
    expect(items.filter((i) => i.autoWhen).map((i) => `${i.id}:${i.autoWhen}`)).toEqual(["alien.wrap.xp:prompts-answered", "alien.wrap.trauma:prompts-answered"]);
  });
});
