import { describe, expect, it } from "vitest";
import { runMapGenerator } from "@campaign-forge/core";
import type { SiteLayout } from "@campaign-forge/module-sdk";
import { exampleModule, exampleSiteGenerator } from "@campaign-forge/module-example";
import { defaultGridSquares, drawSiteMap, nodeToString, planRollPrint, renderSiteMapSvg, rollPrintPages, scaleText, PRINT_SCALES } from "../src/index";

function rectDeck(w: number, h: number): SiteLayout {
  return {
    decks: [{ id: "a", name: "Deck A", width: w, height: h }],
    zones: [{ id: "z1", deck: "a", kind: "room", poly: [[0, 0], [w, 0], [w, h], [0, h]], cluttered: false, name: "Hold", key: true }],
    borders: [],
    markers: [],
    gridM: 1,
    checks: [],
  };
}

// The deck prints with a 0.3 m margin: a 40 x 25 m deck is 40.6" x 25.6" at 1 in = 1 m.
describe("planRollPrint", () => {
  it("fits across a 36\" roll by turning the deck (only its short side fits)", () => {
    const p = planRollPrint(rectDeck(40, 25), { view: "gm", rollWidthIn: 36, mmPerMetre: 25.4, titleBlock: false });
    expect(p).toMatchObject({ rotated: true, strips: 1, printableWidthIn: 35, mapWidthIn: 40.6, mapHeightIn: 25.6, titleBlockIn: 0 });
    expect(p.pages).toEqual([{ strip: 1, widthIn: 36, heightIn: 41.6, fromIn: 0, toIn: 25.6 }]);
    expect(p.paperLengthIn).toBe(41.6);
    expect(p.summary).toBe('36" roll · 1 page · 41.6" of paper');
  });

  it("splits into strips with the overlap when neither side fits, keeping the least paper", () => {
    const p = planRollPrint(rectDeck(40, 25), { view: "gm", rollWidthIn: 24, mmPerMetre: 25.4, titleBlock: false });
    // unturned: 2 strips of 26.6" pages (53.2"); turned: 2 strips of 41.6" pages (83.2")
    expect(p.rotated).toBe(false);
    expect(p.strips).toBe(2);
    expect(p.stripWidthIn).toBe(20.8);
    expect(p.pages.map((x) => [x.fromIn, x.toIn])).toEqual([
      [0, 20.8],
      [19.8, 40.6],
    ]);
    // neighbouring strips overlap by exactly the overlap
    expect(p.pages[0]!.toIn - p.pages[1]!.fromIn).toBeCloseTo(1, 6);
    expect(p.paperLengthIn).toBe(53.2);
    expect(p.summary).toBe('24" roll · 2 pages · 53.2" of paper');
    const wider = planRollPrint(rectDeck(40, 25), { view: "gm", rollWidthIn: 24, mmPerMetre: 25.4, titleBlock: false, overlapIn: 2 });
    expect(wider.pages[0]!.toIn - wider.pages[1]!.fromIn).toBeCloseTo(2, 6);
  });

  it("keeps the deck unturned when both sides fit and that uses less paper", () => {
    const p = planRollPrint(rectDeck(40, 25), { view: "gm", rollWidthIn: 24, mmPerMetre: 10, titleBlock: false });
    // 15.98" x 10.08": both fit; unturned uses 11.08" of paper
    expect(p).toMatchObject({ rotated: false, strips: 1 });
    expect(p.paperLengthIn).toBeCloseTo(10.08 + 1, 1);
    // a tall deck turns when both sides fit, to save paper
    const tall = planRollPrint(rectDeck(10, 20), { view: "gm", rollWidthIn: 36, mmPerMetre: 25.4, titleBlock: false });
    expect(tall).toMatchObject({ rotated: true, strips: 1 });
    expect(tall.paperLengthIn).toBe(11.6);
  });

  it("adds the title block band to every page, and strips for many-strip decks", () => {
    // 60.6" x 30.6": three unturned strips (about 99" of paper) beat two turned ones (about 126")
    const p = planRollPrint(rectDeck(60, 30), { view: "gm", rollWidthIn: 24, mmPerMetre: 25.4, title: "Long hull" });
    expect(p.titleBlockIn).toBeGreaterThan(0.5);
    expect(p.strips).toBe(3);
    expect(p.rotated).toBe(false);
    for (const page of p.pages) expect(page.heightIn).toBeCloseTo(30.6 + 1 + p.titleBlockIn + 0.3, 2);
    expect(p.pages[2]!.toIn).toBeCloseTo(60.6, 6);
    const pages = rollPrintPages(rectDeck(60, 30), { view: "gm", rollWidthIn: 24, mmPerMetre: 25.4, title: "Long hull" }, p);
    expect(pages).toHaveLength(3);
    const svg = nodeToString(pages[1]!.node);
    expect(svg).toContain("Strip 2 of 3, Deck A");
    expect(svg).toContain("Strip 3 lies over this line");
    expect(svg).toContain("data-seam");
    expect(svg).toContain("data-align-mark");
    expect(svg).toContain("Cut here; lay over strip 1");
    expect(svg).toContain("data-scale-bar");
    expect(pages[0]!.width).toBe(24 * 72);
  });

  it("plans the example keep: one page on either roll at 1 in = 1 m", () => {
    const layout = runMapGenerator(exampleModule, exampleSiteGenerator, { darkness: 50, lockedAct: 2 }, { seed: "roll" }).layout;
    const p24 = planRollPrint(layout, { view: "player", rollWidthIn: 24, mmPerMetre: 25.4 });
    expect(p24).toMatchObject({ strips: 1, rotated: true, mapWidthIn: 30.6, mapHeightIn: 20.6 });
    const p36 = planRollPrint(layout, { view: "player", rollWidthIn: 36, mmPerMetre: 25.4 });
    expect(p36).toMatchObject({ strips: 1, rotated: false });
  });
});

describe("scales, grid squares and title blocks", () => {
  it("names the scales and defaults grid squares by view and scale", () => {
    expect(PRINT_SCALES.map((s) => s.label)).toEqual(["1 in = 1 m (28mm miniatures)", "28mm true scale (1:56, 1 m ≈ 17.9 mm)", "1 m = 1 cm (overview)"]);
    expect(scaleText(25.4)).toBe("1 in = 1 m · 28mm miniatures");
    expect(scaleText(12)).toBe("1 m = 12 mm");
    expect(defaultGridSquares("player", 25.4)).toBe(true);
    expect(defaultGridSquares("tracking", 1000 / 56)).toBe(true);
    expect(defaultGridSquares("player", 10)).toBe(false);
    expect(defaultGridSquares("gm", 25.4)).toBe(false);
  });

  it("draws 1 m grid squares only in playable floor zones, beneath the walls", () => {
    const layout = runMapGenerator(exampleModule, exampleSiteGenerator, { darkness: 50, lockedAct: 2 }, { seed: "grid" }).layout;
    const svg = nodeToString(drawSiteMap(layout, { view: "player", gridSquares: true }).node);
    const layer = /<g data-layer="grid-squares">(.*?)<\/g><g data-layer="outlines">/.exec(svg);
    expect(layer).not.toBeNull();
    // the out-of-bounds wing (22..28 x 2..8) gets no lines; the west passage (2..15 x 8..12) does
    expect(layer![1]).not.toMatch(/M 2[3-7] 2 V 8/);
    expect(layer![1]).toContain("M 3 8 V 12");
    expect(svg.indexOf("grid-squares")).toBeLessThan(svg.indexOf('data-layer="outlines"'));
    expect(nodeToString(drawSiteMap(layout, { view: "player" }).node)).not.toContain("grid-squares");
  });

  it("adds a title block with a scale bar to the SVG export on request", () => {
    const layout = runMapGenerator(exampleModule, exampleSiteGenerator, { darkness: 50, lockedAct: 2 }, { seed: "tb" }).layout;
    const plain = renderSiteMapSvg(layout, { view: "gm", legend: exampleSiteGenerator.legend });
    expect(plain).not.toContain("data-title-block");
    const svg = renderSiteMapSvg(layout, { view: "gm", legend: exampleSiteGenerator.legend, titleBlock: { title: "Keep" }, physical: true });
    expect(svg).toContain("data-title-block");
    expect(svg).toContain("data-scale-bar");
    expect(svg).toContain(">Keep<");
    expect(svg).toContain("1 m = 1 cm · overview");
    expect(svg).toContain("Ground floor · GM map");
    // the band goes below the map: the document is taller than the map
    const h = Number(/viewBox="0 0 32 ([\d.]+)"/.exec(svg)![1]);
    expect(h).toBeGreaterThan(22);
  });
});
