import { describe, expect, it } from "vitest";
import { runMapGenerator } from "@campaign-forge/core";
import { exampleModule, exampleSiteGenerator } from "@campaign-forge/module-example";
import { drawSiteMap, nodeToString, placementProblems, renderRollPdf, rollPrintPages, planRollPrint, rotateLayout } from "../src/index";

const legend = exampleSiteGenerator.legend!;
const keep = (seed = "rot") => runMapGenerator(exampleModule, exampleSiteGenerator, { darkness: 50, lockedAct: 2 }, { seed }).layout;

describe("rotateLayout", () => {
  it("turns geometry clockwise and keeps ids and data", () => {
    const l = keep();
    const r = rotateLayout(l, 90);
    expect(r.decks[0]).toMatchObject({ id: "main", width: 20, height: 30 });
    // (x, y) on a 30 x 20 deck -> (20 - y, x): the west passage 2..15 x 8..12 becomes 8..12 x 2..15
    const c1 = r.zones.find((z) => z.id === "C1")!;
    expect(c1.poly).toEqual(l.zones.find((z) => z.id === "C1")!.poly.map(([x, y]) => [20 - y, x]));
    expect(r.borders.find((b) => b.id === "B01")!.segment).toEqual([
      [12, 2],
      [12, 9],
    ]);
    // everything but geometry is untouched
    expect(r.zones.map(({ poly: _p, ...z }) => z)).toEqual(l.zones.map(({ poly: _p, ...z }) => z));
    expect(r.markers).toEqual(l.markers);
    expect(r.borders.map(({ segment: _s, ...b }) => b)).toEqual(l.borders.map(({ segment: _s, ...b }) => b));
    expect(rotateLayout(l, 0)).toBe(l);
  });

  it("twice 90° is 180°, four times is the original", () => {
    const l = keep();
    expect(rotateLayout(rotateLayout(l, 90), 90)).toEqual(rotateLayout(l, 180));
    expect(rotateLayout(rotateLayout(l, 180), 90)).toEqual(rotateLayout(l, 270));
    let r = l;
    for (let i = 0; i < 4; i++) r = rotateLayout(r, 90);
    expect(r).toEqual(l);
  });

  it("places labels with no overlaps on turned layouts", () => {
    for (const seed of ["a", "b", "c", "d"]) {
      for (const turn of [90, 180, 270] as const) {
        const r = rotateLayout(keep(seed), turn);
        const deck = r.decks[0]!;
        for (const view of ["gm", "player", "tracking"] as const) {
          const d = drawSiteMap(r, { view, legend, act: 2 });
          expect(placementProblems(d.labels, r.zones, { x0: 0, y0: 0, x1: deck.width, y1: deck.height }), `${seed} ${turn} ${view}`).toEqual([]);
        }
      }
    }
  });
});

describe("turned roll prints", () => {
  it("draw the turned layout upright: no rotated map, no rotated text, a compass note", () => {
    const l = keep();
    const o = { view: "gm" as const, legend, rollWidthIn: 24, mmPerMetre: 25.4, title: "Keep" };
    const plan = planRollPrint(l, o);
    expect(plan.rotated).toBe(true);
    const svg = nodeToString(rollPrintPages(l, o, plan)[0]!.node);
    // (hatch patterns keep their own patternTransform; no group is turned)
    expect(svg).not.toMatch(/ transform="[^"]*rotate\(/);
    expect(svg).toContain('data-rotated-note="90"');
    const pdf = Array.from(renderRollPdf(l, o).bytes, (c) => String.fromCharCode(c)).join("");
    // every text matrix is the plain y flip, and no 90° turn is ever concatenated
    const tms = [...pdf.matchAll(/^(.*) Tm$/gm)].map((m) => m[1]!);
    expect(tms.length).toBeGreaterThan(10);
    for (const tm of tms) expect(tm).toMatch(/^1 0 0 -1 [-\d.]+ [-\d.]+$/);
    expect(pdf).not.toMatch(/^0 -?1 -?1 0 [-\d.]+ [-\d.]+ cm$/m);
    expect(pdf).toContain("(Rotated 90\\260) Tj");
    expect(pdf).toContain("(Top of the screen map faces right) Tj");
    // an unturned print has no compass note
    const flat = Array.from(renderRollPdf(l, { ...o, rollWidthIn: 36 }).bytes, (c) => String.fromCharCode(c)).join("");
    expect(flat).not.toContain("Rotated 90");
  });
});
