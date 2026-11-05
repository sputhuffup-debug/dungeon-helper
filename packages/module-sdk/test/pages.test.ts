/**
 * Page references: a page, a range, or pages cited together (a list), as
 * text and as spans, and which ones are well formed.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { checkModule, firstPage, formatPackIssue, loadPack, pageLabel, pageRefSpans, pageRefText, validPageRef } from "../src";

describe("page references", () => {
  it("reads a page, a range and a list", () => {
    expect(pageRefText(43)).toBe("p. 43");
    expect(pageRefText([42, 43])).toBe("p. 42–43");
    // two pages cited together never read as everything between them
    expect(pageRefText({ pages: [27, 158] })).toBe("p. 27, 158");
    expect(pageRefText({ pages: [27, [44, 46]] }, "p.", "-")).toBe("p. 27, 44-46");
    expect(pageRefText(undefined)).toBe("");
    expect(pageRefSpans({ pages: [27, [44, 46]] })).toEqual([
      [27, 27],
      [44, 46],
    ]);
    expect(firstPage({ pages: [117, 235] })).toBe(117);
    expect(pageLabel({ pages: [27, 158] })).toBe("pp. 27, 158");
    expect(pageLabel([72, 73])).toBe("pp. 72–73");
    expect(pageLabel(72)).toBe("p. 72");
  });

  it("checks them", () => {
    expect(validPageRef(12)).toBe(true);
    expect(validPageRef([12, 14])).toBe(true);
    expect(validPageRef({ pages: [12, [20, 22]] })).toBe(true);
    for (const bad of [0, 1.5, [14, 12], [1, 2, 3], { pages: [] }, { pages: [0] }, { pages: [12], extra: 1 }, "12"]) expect(validPageRef(bad), JSON.stringify(bad)).toBe(false);
  });

  it("is accepted by the pack schema and the module check", () => {
    const dir = new URL("../../module-example/packs/example-pack/", import.meta.url);
    const read = (name: string) => JSON.parse(readFileSync(new URL(name, dir), "utf8")) as Record<string, unknown>;
    const rulesPart = read("rules.part.json") as { rules: Array<Record<string, unknown>> };
    rulesPart.rules[0] = { ...rulesPart.rules[0], page: { pages: [3, 9] } };
    delete rulesPart.rules[0]!.cite;
    const res = loadPack(read("pack.json"), { parts: [{ name: "rules.part.json", data: rulesPart }], skipProcedureRuns: true });
    expect(res.issues.map(formatPackIssue)).toEqual([]);
    expect(res.module!.rules.find((r) => r.id === rulesPart.rules[0]!.id)!.page).toEqual({ pages: [3, 9] });
    expect(checkModule(res.module!).issues.filter((i) => /page/i.test(i.message))).toEqual([]);
  });
});
