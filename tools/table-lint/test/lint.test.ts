import { describe, expect, it } from "vitest";
import type { GameModule, RollTable } from "@campaign-forge/module-sdk";
import { alienModule } from "@campaign-forge/module-alien";
import { exampleModule } from "@campaign-forge/module-example";
import { countSentences, hasOpenLicense, lintModule, renderSpotCheck, spotCheck } from "../src";

const fmt = (issues: Array<{ where: string; message: string }>) => issues.map((i) => `${i.where}: ${i.message}`);

describe("lintModule", () => {
  it("passes the example fixture module with zero errors", () => {
    const report = lintModule(exampleModule, { seeds: 50 });
    expect(fmt(report.errors)).toEqual([]);
    expect(report.ok).toBe(true);
    expect(report.stats.tables).toBe(exampleModule.tables.length);
    expect(report.stats.rowsTotal).toBe(exampleModule.tables.reduce((n, t) => n + t.rows.length, 0));
    expect(report.stats.presetsTotal).toBe(2);
    expect(report.stats.rulesTotal).toBe(3);
  });

  it("passes the Alien module with zero errors (warnings allowed)", () => {
    const report = lintModule(alienModule, { seeds: 50 });
    console.log(`alien lint: ${report.errors.length} errors, ${report.warnings.length} warnings`);
    for (const w of fmt(report.warnings)) console.log(`  warning ${w}`);
    expect(fmt(report.errors)).toEqual([]);
    expect(report.ok).toBe(true);
    expect(report.stats.tables).toBe(alienModule.tables.length);
    expect(report.stats.unverifiedTables).toBe(alienModule.tables.filter((t) => t.unverified).length);
    const famTables = Object.values(report.stats.byFamily).reduce((n, f) => n + f.tables, 0);
    const famRows = Object.values(report.stats.byFamily).reduce((n, f) => n + f.rows, 0);
    expect(famTables).toBe(report.stats.tables);
    expect(famRows).toBe(report.stats.rowsTotal);
    expect(Object.keys(report.stats.byFamily)).toContain("world");
  });

  it("reports a bad d66 bound, a missing page and an id/family mismatch on a synthetic module", () => {
    const bad: RollTable = {
      id: "example.table.bad-d66",
      name: "Bad d66",
      family: "table",
      dice: "d66",
      rows: [
        { range: [11, 36], label: "Low", result: { v: 1 } },
        { range: [41, 47], label: "Bad bound", result: { v: 2 } }, // 47: units digit 7
        { range: [48, 66], label: "High", result: { v: 3 } }, // 48: units digit 8
      ],
    };
    const misfiled: RollTable = { id: "example.table.misfiled", name: "Misfiled", page: 9, family: "weather", dice: "d6", rows: [{ range: [1, 6], label: "Any", result: "x" }] };
    const unlabelled: RollTable = { id: "example.table.unlabelled", name: "Unlabelled", page: 9, family: "table", dice: "d6", rows: [{ range: [1, 6], result: "plain string" }] };
    const synthetic: GameModule = { ...exampleModule, tables: [...exampleModule.tables, bad, misfiled, unlabelled] };
    const report = lintModule(synthetic, { skipProcedureRuns: true });
    const errors = fmt(report.errors);
    expect(report.ok).toBe(false);
    expect(errors).toContain("table:example.table.bad-d66: table cites no source: give it a page, a cite, or mark it original");
    expect(errors.some((e) => e.startsWith("table:example.table.bad-d66: row 1 [41-47] has d66 bound 47"))).toBe(true);
    expect(errors.some((e) => e.startsWith("table:example.table.bad-d66: row 2 [48-66] has d66 bound 48"))).toBe(true);
    expect(errors).toContain('table:example.table.misfiled: family "weather" does not match the id segment "table"');
    expect(errors.some((e) => e.startsWith("table:example.table.unlabelled: row 0 [1-6] has neither a label"))).toBe(true);
    // The fixture's own tables stay clean.
    expect(errors.filter((e) => e.startsWith("table:example.table.rumor"))).toEqual([]);
  });

  it("errors on invalid preset fields, unresolved within tags and bad procedure chains; warns on long rule summaries", () => {
    const longSummary = "One. Two. Three. Four. " + "x".repeat(620);
    const proc = exampleModule.procedures[0]!;
    const synthetic: GameModule = {
      ...exampleModule,
      presets: [
        ...exampleModule.presets,
        { id: "example.preset.broken", entityType: "example.place", name: "Broken", page: 52, fields: { terrain: "lava" } },
        { id: "example.preset.orphan", entityType: "example.place", name: "Orphan", page: 52, tags: ["within:example.preset.nowhere"], fields: {} },
      ],
      rules: [...exampleModule.rules, { id: "example.rule.prose", title: "Prose", summary: longSummary, page: 70 }],
      procedures: [{ ...proc, chains: [{ procedure: "example.proc.missing", label: "Missing" }] }],
    };
    const report = lintModule(synthetic, { skipProcedureRuns: true });
    const errors = fmt(report.errors);
    const warnings = fmt(report.warnings);
    expect(errors.some((e) => e.startsWith("preset:example.preset.broken: fields.terrain"))).toBe(true);
    expect(errors).toContain('preset:example.preset.orphan: within tag points at unknown preset "example.preset.nowhere"');
    expect(errors.some((e) => e.includes('chains into unknown procedure "example.proc.missing"'))).toBe(true);
    expect(warnings.some((w) => w.startsWith("rule:example.rule.prose: summary is") && w.includes("limit 600"))).toBe(true);
    expect(warnings.some((w) => w.startsWith("rule:example.rule.prose: summary has 5 sentences"))).toBe(true);
  });

  it("does not check rule cards for book prose when the source text is openly licensed", () => {
    const longSummary = "One. Two. Three. Four. " + "x".repeat(620);
    const open: GameModule = {
      ...exampleModule,
      manifest: { ...exampleModule.manifest, license: { spdx: "CC-BY-4.0", name: "Creative Commons Attribution 4.0 International", attribution: "Fixture text under CC BY 4.0." } },
      rules: [...exampleModule.rules, { id: "example.rule.prose", title: "Prose", summary: longSummary, cite: "Fixture, Prose" }],
    };
    const warnings = fmt(lintModule(open, { skipProcedureRuns: true }).warnings);
    expect(warnings.filter((w) => w.startsWith("rule:example.rule.prose"))).toEqual([]);
    // The ORC License is not an SPDX id; packs name it with the license reference LicenseRef-ORC.
    expect(hasOpenLicense({ ...open, manifest: { ...open.manifest, license: { spdx: "LicenseRef-ORC", name: "ORC License", attribution: "Fixture." } } })).toBe(true);
    expect(hasOpenLicense({ ...open, manifest: { ...open.manifest, license: { spdx: "LicenseRef-ORCA", name: "Other", attribution: "Fixture." } } })).toBe(false);
    expect(hasOpenLicense({ ...open, manifest: { ...open.manifest, license: { name: "All rights reserved", attribution: "Fixture." } } })).toBe(false);
  });

  it("counts sentences without splitting on page references or decimals", () => {
    expect(countSentences("Roll 2d6 (p. 44). Add 1.5 per point, e.g. for armor. Done!")).toBe(3);
    expect(countSentences("")).toBe(0);
  });
});

describe("spotCheck", () => {
  it("is deterministic for a seed and differs for another seed", () => {
    const a = spotCheck(alienModule, { seed: "s1" });
    const b = spotCheck(alienModule, { seed: "s1" });
    const c = spotCheck(alienModule, { seed: "s2" });
    expect(b).toEqual(a);
    expect(renderSpotCheck(b)).toBe(renderSpotCheck(a));
    expect(c.families.map((f) => f.picks.map((p) => `${p.tableId}#${p.rowIndex}`))).not.toEqual(a.families.map((f) => f.picks.map((p) => `${p.tableId}#${p.rowIndex}`)));
  });

  it("picks perFile rows per family and presets per type, and renders one checkbox per pick", () => {
    const perFile = 10;
    const sheet = spotCheck(alienModule, { seed: "render", perFile });
    const families = new Set(alienModule.tables.map((t) => t.family ?? t.id.split(".")[1]));
    expect(sheet.families.map((f) => f.family).sort()).toEqual([...families].sort());
    for (const f of sheet.families) {
      expect(f.picks).toHaveLength(Math.min(perFile, f.rows));
      expect(new Set(f.picks.map((p) => `${p.tableId}#${p.rowIndex}`)).size).toBe(f.picks.length);
      for (const p of f.picks) expect(p.page).toBeDefined();
    }
    for (const t of sheet.presetTypes) expect(t.picks).toHaveLength(Math.min(perFile, t.presets));
    const md = renderSpotCheck(sheet);
    const boxes = md.split("\n").filter((l) => l.startsWith("- [ ] "));
    expect(boxes).toHaveLength(sheet.total);
    const tableBoxes = boxes.filter((l) => /^- \[ \] `alien\.[a-z-]+\.[^`]+` · p\. [\d-]+ · \S+ = /.test(l));
    expect(tableBoxes).toHaveLength(sheet.families.reduce((n, f) => n + f.picks.length, 0));
    expect(md).toContain("# Spot check: Alien RPG (Evolved Edition)");
  });

  it("returns every row when a family has fewer rows than perFile", () => {
    const sheet = spotCheck(exampleModule, { seed: "x", perFile: 100 });
    const total = exampleModule.tables.reduce((n, t) => n + t.rows.length, 0);
    expect(sheet.families.reduce((n, f) => n + f.picks.length, 0)).toBe(total);
  });
});
