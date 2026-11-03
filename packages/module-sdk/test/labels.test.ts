import { describe, expect, it } from "vitest";
import { enumLabel, sectionApplies } from "../src/entities";
import { searchRuleCards } from "../src/ruleSearch";
import type { RuleCard, SheetSection } from "../src/types";

describe("enumLabel", () => {
  const schema = { type: "string", enum: ["outer-rim", "core"], enumLabels: ["Outer Rim", "Core Systems"] };

  it("names a value by the schema's enumLabels", () => {
    expect(enumLabel(schema, "outer-rim")).toBe("Outer Rim");
    expect(enumLabel(schema, "core")).toBe("Core Systems");
  });

  it("reads an array's items, and numbers by their text", () => {
    expect(enumLabel({ type: "array", items: schema }, "core")).toBe("Core Systems");
    expect(enumLabel({ enum: [3, 4], enumLabels: ["Three", "Four"] }, "4")).toBe("Four");
  });

  it("is undefined without labels or for an unknown value", () => {
    expect(enumLabel({ enum: ["a"] }, "a")).toBeUndefined();
    expect(enumLabel(schema, "frontier")).toBeUndefined();
    expect(enumLabel(undefined, "x")).toBeUndefined();
  });
});

describe("sectionApplies", () => {
  const section: SheetSection = { id: "npc", title: "NPC dossier", when: { "!": { var: "fields.isPC" } }, fields: [{ path: "voice" }, { path: "tells" }] };

  it("shows a section without `when`, or whose rule holds", () => {
    expect(sectionApplies({ fields: [] }, {})).toBe(true);
    expect(sectionApplies(section, { isPC: false })).toBe(true);
  });

  it("drops it where the rule fails, unless a field in it is filled in", () => {
    expect(sectionApplies(section, { isPC: true })).toBe(false);
    expect(sectionApplies(section, { isPC: true, voice: "" })).toBe(false);
    expect(sectionApplies(section, { isPC: true, tells: "Taps the table" })).toBe(true);
  });
});

describe("searchRuleCards", () => {
  const cards: RuleCard[] = [
    { id: "r.stress", title: "Stress level", summary: "Stress adds dice; a panic roll may follow.", page: 72, tags: ["stress"] },
    { id: "r.panic", title: "Panic roll", summary: "Roll D6 plus stress.", page: 72, tags: ["panic"] },
    { id: "r.flee", title: "Fleeing", summary: "Run away.", page: 73, tags: ["panic"], mode: ["cinematic"] },
  ];

  it("ranks title matches over tags over summaries", () => {
    expect(searchRuleCards(cards, "panic").map((h) => h.card.id)).toEqual(["r.panic", "r.flee", "r.stress"]);
  });

  it("needs every word, leaves out other play modes, and honours the limit", () => {
    expect(searchRuleCards(cards, "panic roll").map((h) => h.card.id)).toEqual(["r.panic", "r.stress"]);
    expect(searchRuleCards(cards, "panic", { mode: "campaign" }).map((h) => h.card.id)).toEqual(["r.panic", "r.stress"]);
    expect(searchRuleCards(cards, "panic", { limit: 1 })).toHaveLength(1);
    expect(searchRuleCards(cards, "   ")).toEqual([]);
  });
});
