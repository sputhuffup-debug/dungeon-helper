/**
 * The GM screen contract against the example pack (`gmScreen` in
 * packages/module-example/packs/example-pack/pack.json): Markdown excerpts,
 * conformance of every reference, resolving by play mode, compact tables,
 * the fallback screen for a pack without one, and the pack schema.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  checkModule,
  fallbackGmScreen,
  formatPackIssue,
  gmScreenIssues,
  loadPack,
  markdownParts,
  rangeLabel,
  resolveGmScreen,
  ruleExcerpt,
  shortCite,
  tableContent,
  validatePack,
  type GameModule,
  type GmScreenPanel,
} from "../src";

const dir = new URL("../../module-example/packs/example-pack/", import.meta.url);
const read = (name: string) => JSON.parse(readFileSync(new URL(name, dir), "utf8")) as Record<string, unknown>;
const parts = () => [{ name: "rules.part.json", data: read("rules.part.json") }];
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
const moduleOf = (main: Record<string, unknown> = read("pack.json")): GameModule => {
  const res = loadPack(main, { parts: parts(), skipProcedureRuns: true });
  if (!res.module) throw new Error(res.issues.map(formatPackIssue).join("\n"));
  return res.module;
};
const withPanels = (panels: GmScreenPanel[]): GameModule => ({ ...moduleOf(), gmScreen: { panels } });
const errors = (m: GameModule) => gmScreenIssues(m).filter((i) => i.severity === "error").map((i) => `${i.where}: ${i.message}`);

const CARD = `Intro paragraph with **bold** and *italic* and a [link](https://x.org).

#### Travel Pace

| Pace | Distance |
|------|----------|
| Fast | 4 miles |
| Slow | 2 miles |

- first point
- second point
  continued

#### Other

Last words.`;

describe("Markdown excerpts", () => {
  it("splits a card into parts and keeps only bold marks", () => {
    const p = markdownParts(CARD);
    expect(p.map((x) => x.kind)).toEqual(["para", "heading", "table", "list", "heading", "para"]);
    expect(p[0]).toEqual({ kind: "para", text: "Intro paragraph with **bold** and italic and a link." });
    expect(p[2]).toEqual({ kind: "table", head: ["Pace", "Distance"], rows: [["Fast", "4 miles"], ["Slow", "2 miles"]] });
    expect(p[3]).toEqual({ kind: "list", items: [{ text: "first point", marker: "•" }, { text: "second point continued", marker: "•" }] });
  });

  it("picks a section and parts of it", () => {
    expect(ruleExcerpt({ summary: CARD }, { section: "travel pace" })).toEqual([
      { t: "table", head: ["Pace", "Distance"], rows: [["Fast", "4 miles"], ["Slow", "2 miles"]] },
      { t: "para", text: "first point", marker: "•" },
      { t: "para", text: "second point continued", marker: "•" },
    ]);
    expect(ruleExcerpt({ summary: CARD }, { section: "Travel Pace", parts: [1] })).toHaveLength(2);
    expect(ruleExcerpt({ summary: CARD }, { parts: [0] })).toEqual([{ t: "para", text: "Intro paragraph with **bold** and italic and a link." }]);
    expect(ruleExcerpt({ summary: CARD }, { section: "Missing" })).toBeUndefined();
    expect(ruleExcerpt({ summary: CARD }, { parts: [9] })).toBeUndefined();
  });
});

describe("citations and tables", () => {
  it("cites a page, the source of a section, or original", () => {
    expect(shortCite({ page: 72 })).toBe("p. 72");
    expect(shortCite({ page: [72, 73] })).toBe("pp. 72–73");
    expect(shortCite({ cite: "SRD 5.1 — Combat: Cover" })).toBe("SRD 5.1");
    expect(shortCite({ cite: "LRD, Ability checks" })).toBe("LRD, Ability checks");
    expect(shortCite({ original: true })).toBe("original");
  });

  it("prints open-ended ranges past what the dice roll", () => {
    expect(rangeLabel({ dice: "1d6" }, [-99, 0])).toBe("≤0");
    expect(rangeLabel({ dice: "1d6" }, [12, 99])).toBe("12+");
    expect(rangeLabel({ dice: "d66" }, [11, 16])).toBe("11–16");
    expect(rangeLabel({ dice: "1d100" }, [100, 100])).toBe("100");
    // rows a modifier reaches are single values, not open ends
    expect(rangeLabel({ dice: "1d6" }, [8, 8], { first: false, last: false })).toBe("8");
    expect(rangeLabel({ dice: "1d6" }, [12, 99], { first: false, last: false })).toBe("12–99");
  });

  it("prints a table as its roll line and rows", () => {
    const m = moduleOf();
    const danger = m.tables.find((t) => t.id === "example-pack.site.danger")!;
    const out = tableContent(danger);
    const table = out.find((c) => c.t === "table");
    expect(table).toMatchObject({ t: "table", head: ["2D6", "Result"] });
    expect((table as { rows: string[][] }).rows[0]).toEqual(["≤5", "Calm"]);
  });
});

describe("conformance", () => {
  it("the example pack's screen has no issues", () => {
    expect(gmScreenIssues(moduleOf())).toEqual([]);
    expect(checkModule(moduleOf(), { skipProcedureRuns: true }).issues).toEqual([]);
  });

  it("reports every reference that does not resolve", () => {
    const m = withPanels([
      {
        id: "p",
        title: "P",
        blocks: [
          { kind: "rule", rule: "example-pack.rule.nope" },
          { kind: "rule", rule: "example-pack.rule.checks", section: "Nowhere" },
          { kind: "table", table: "example-pack.nope" },
          { kind: "list", list: "example-pack.skills", items: ["climb", "fly"] },
          { kind: "list", list: "example-pack.nope" },
          { kind: "list", list: "example-pack.skills", where: { nope: [1] } },
          { kind: "conditions", conditions: ["dazed", "giddy"] },
          { kind: "guide", tips: [0, 5], entries: ["climb", "swim"] },
          { kind: "text", text: "Mine.", original: false as unknown as true },
          { kind: "text", text: "Mine.", original: true, rules: ["example-pack.rule.gone"] },
        ],
      },
      { id: "p", title: "", blocks: [] },
    ]);
    expect(errors(m)).toEqual([
      'gmScreen:p#0: references unknown rule card "example-pack.rule.nope"',
      'gmScreen:p#1: rule card "example-pack.rule.checks" has no heading "Nowhere"',
      'gmScreen:p#2: references unknown table "example-pack.nope"',
      'gmScreen:p#3: list "example-pack.skills" has no item "fly"',
      'gmScreen:p#4: references unknown reference list "example-pack.nope"',
      expect.stringMatching(/^gmScreen:p#5: where: .*nope/),
      'gmScreen:p#6: references unknown condition "giddy"',
      'gmScreen:p#7: play guide "example-pack.guide" has no tip 5',
      'gmScreen:p#7: play guide "example-pack.guide" has no entry "swim"',
      "gmScreen:p#8: a text block is the module author's own words: mark it original: true (reference a rule card, table or list for source text)",
      'gmScreen:p#9: cites unknown rule card "example-pack.rule.gone"',
      "gmScreen:p: duplicate panel id",
      "gmScreen:p: panel has no title",
      "gmScreen:p: panel has no blocks",
    ]);
    // conformance carries them, so a module with a broken screen does not load
    expect(checkModule(m, { skipProcedureRuns: true }).ok).toBe(false);
  });

  it("a conditions block needs d20 conditions; modes must be declared", () => {
    const m = { ...withPanels([{ id: "c", title: "C", mode: ["epic"], blocks: [{ kind: "conditions" }] }]) };
    delete m.d20Combat;
    expect(errors(m)).toEqual(['gmScreen:c: mode "epic" is not declared in the manifest', "gmScreen:c#0: a conditions block needs d20Combat conditions"]);
  });

  it("the pack schema rejects unknown block kinds and keys, and a pack issue points at the block", () => {
    const main = clone(read("pack.json"));
    const screen = main.gmScreen as { panels: Array<{ blocks: unknown[] }> };
    screen.panels[0]!.blocks.push({ kind: "picture", src: "x.png" });
    const v = validatePack(main);
    expect(v.ok).toBe(false);
    expect(v.issues.some((i) => i.path.startsWith("$.gmScreen.panels[0].blocks[3]"))).toBe(true);

    const broken = clone(read("pack.json"));
    (broken.gmScreen as { panels: Array<{ blocks: unknown[] }> }).panels[1]!.blocks[0] = { kind: "rule", rule: "example-pack.rule.gone" };
    const res = loadPack(broken, { parts: parts(), skipProcedureRuns: true });
    expect(res.ok).toBe(false);
    expect(res.issues.map(formatPackIssue)).toContainEqual(expect.stringContaining("$.gmScreen.panels[1].blocks[0]"));
  });
});

describe("resolving", () => {
  it("resolves panels for the play mode, with citations", () => {
    const m = moduleOf();
    const delve = resolveGmScreen(m, { mode: "delve" });
    expect(delve.fallback).toBe(false);
    expect(delve.title).toBe("Lantern screen");
    expect(delve.problems).toEqual([]);
    expect(delve.panels.map((p) => [p.id, p.side, p.size])).toEqual([
      ["checks", "gm", "third"],
      ["delving", "gm", "third"],
      ["conditions", "players", "third"],
    ]);
    const saga = resolveGmScreen(m, { mode: "saga" });
    expect(saga.panels.find((p) => p.id === "saga-notes")).toMatchObject({ optional: true, blocks: [{ kind: "list", title: "Backgrounds" }] });

    const checks = delve.panels[0]!;
    expect(checks.blocks.map((b) => [b.title, b.cite])).toEqual([
      ["Ability checks", "LRD, Ability checks"],
      ["Advantage", "LRD, Advantage and disadvantage"],
      ["Calling for rolls", "original"],
    ]);
    expect(checks.blocks[2]!.content).toEqual([{ t: "para", marker: "•", text: "Say the DC out loud before the roll." }]);
    const delving = delve.panels[1]!;
    expect(delving.blocks[0]!.cite).toBe("p. 12");
    expect(delving.blocks[2]).toMatchObject({ kind: "text", title: "Light and dark", cite: "original; p. 12" });
    const conditions = delve.panels[2]!;
    expect(conditions.blocks[0]!.content[0]).toMatchObject({ t: "entry", term: "Dazed" });
    // the where filter keeps the might skills only
    expect(conditions.blocks[1]!.content.map((c) => (c as { term: string }).term)).toEqual(["Climb"]);
  });

  it("builds a fallback screen from rule cards by tag, with conditions on the player side", () => {
    const m = moduleOf();
    delete m.gmScreen;
    const def = fallbackGmScreen(m);
    expect(def.panels.length).toBeGreaterThan(1);
    expect(def.panels.at(-1)).toMatchObject({ id: "auto.conditions", side: "players", blocks: [{ kind: "conditions" }] });
    // the fallback is a valid screen for its module
    expect(errors({ ...m, gmScreen: def })).toEqual([]);
    const r = resolveGmScreen(m);
    expect(r.fallback).toBe(true);
    expect(r.panels.length).toBe(def.panels.length);
    expect(r.panels.every((p) => p.blocks.length > 0)).toBe(true);
  });
});
