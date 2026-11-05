import { describe, expect, it } from "vitest";
import { referenceIndex, searchReference, titleMatchQuality } from "../src/ruleSearch";
import type { EntityPreset, ReferenceList, RollTable } from "../src/types";

const lists = [
  {
    id: "x.talents",
    name: "Talents",
    items: [
      { id: "full-throttle", name: "Full Throttle", summary: "+2 dice to Piloting when accelerating." },
      { id: "nimble", name: "Nimble", summary: "Move first; good for a pilot in a tight spot.", mode: ["campaign"] },
    ],
  },
  { id: "x.spells", name: "Spells", items: [{ id: "fireball", name: "Fireball", summary: "A bright streak flashes to a point you choose." }] },
] as unknown as ReferenceList[];
const presets = [{ id: "p.pilot", entityType: "x.character", name: "Pilot", summary: "Flies the ship.", tags: ["crew"] }] as unknown as EntityPreset[];
const tables = [{ id: "t.crit", name: "Critical injuries", dice: "d66", family: "combat", rows: [] }] as unknown as RollTable[];
const index = referenceIndex({ referenceLists: lists, presets, tables });

describe("searchReference", () => {
  it("finds list items, presets and tables, best match first", () => {
    expect(searchReference(index, "pilot").map((h) => `${h.entry.kind}:${h.entry.id}`)).toEqual(["preset:p.pilot", "item:full-throttle", "item:nimble"]);
    expect(searchReference(index, "fire")[0]!.entry.id).toBe("fireball");
    expect(searchReference(index, "critical inj").map((h) => h.entry.kind)).toEqual(["table"]);
  });

  it("matches a list's name, a preset's tags and a table's family as tags", () => {
    expect(searchReference(index, "talents").map((h) => h.entry.id)).toEqual(["full-throttle", "nimble"]);
    expect(searchReference(index, "crew").map((h) => h.entry.id)).toEqual(["p.pilot"]);
    expect(searchReference(index, "combat").map((h) => h.entry.id)).toEqual(["t.crit"]);
  });

  it("needs every word, honours the play mode and the limit", () => {
    expect(searchReference(index, "full nimble")).toEqual([]);
    expect(searchReference(index, "nimble", { mode: "cinematic" })).toEqual([]);
    expect(searchReference(index, "nimble", { mode: "campaign" })).toHaveLength(1);
    expect(searchReference(index, "pilot", { limit: 1 })).toHaveLength(1);
    expect(searchReference(index, "  ")).toEqual([]);
  });

  it("keeps the list with an item, so the app can open it", () => {
    const hit = searchReference(index, "fireball")[0]!.entry;
    expect(hit.kind === "item" && hit.list.id).toBe("x.spells");
  });
});

describe("titleMatchQuality", () => {
  it("ranks the title asked for above a loose match, whatever the record kind", () => {
    expect(titleMatchQuality("Panic", "panic")).toBe(6);
    expect(titleMatchQuality("Pulse rifle drills", "pulse rifle")).toBe(5);
    expect(titleMatchQuality("Panic roll", "PANIC")).toBe(5);
    expect(titleMatchQuality("M41A Pulse Rifle", "pulse rifle")).toBe(4);
    // the words, apart: below the phrase
    expect(titleMatchQuality("AK-4047 Pulse Assault Rifle", "pulse rifle")).toBe(3);
    expect(titleMatchQuality("Impulse rifles", "pulse rifle")).toBe(2);
    // a record found by its description or tags
    expect(titleMatchQuality("Facehugger", "pulse rifle")).toBe(0);
    expect(titleMatchQuality("Café", "cafe")).toBe(6);
    expect(titleMatchQuality("Anything", "  ")).toBe(0);
  });
});
