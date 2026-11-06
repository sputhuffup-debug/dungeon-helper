/**
 * Drawing and printing maps measured in squares (5-foot dungeons): the new
 * border kinds and GM marks, doors into unseen rooms on the player map,
 * grid squares one per square, scale bars and print scales in feet.
 */
import { describe, expect, it } from "vitest";
import { playerLayout } from "@campaign-forge/core";
import type { SiteLayout } from "@campaign-forge/module-sdk";
import { defaultMmPerMetre, drawSiteMap, focusBox, legendSwatch, nodeToString, noticeLines, noticePage, planRollPrint, printScalesFor, printTiles, printTilesHtml, renderSiteMapSvg, rollPrintPages, scaleBar, scaleTextFor } from "../src/index";

const rect = (x: number, y: number, w: number, h: number): Array<[number, number]> => [
  [x, y],
  [x + w, y],
  [x + w, y + h],
  [x, y + h],
];

function dungeon(): SiteLayout {
  return {
    decks: [{ id: "L1", name: "Level 1", width: 20, height: 10 }],
    zones: [
      { id: "R01", deck: "L1", kind: "room", poly: rect(1, 1, 6, 6), cluttered: false, key: true, name: "Guard room" },
      { id: "R02", deck: "L1", kind: "room", poly: rect(8, 1, 6, 6), cluttered: false, key: true, name: "Vault", hidden: true },
      { id: "P01", deck: "L1", kind: "corridor", poly: rect(7, 3, 1, 2), cluttered: false, name: "Passage" },
      { id: "R03", deck: "L1", kind: "room", poly: rect(14, 1, 5, 6), cluttered: false, key: true, name: "Store" },
    ],
    borders: [
      { id: "B1", a: "R01", b: "P01", kind: "bars", segment: [[7, 3], [7, 4]], lock: "mechanical", lockedInActs: [1, 2, 3] },
      { id: "B2", a: "P01", b: "R02", kind: "door", segment: [[8, 3], [8, 4]], hidden: true },
      { id: "B3", a: "R02", b: "R03", kind: "rubble", segment: [[14, 3], [14, 4]] },
    ],
    markers: [
      { id: "M1", kind: "start", zone: "R01", label: "Way in", gmOnly: false },
      { id: "T1", kind: "trap", zone: "R01", label: "Pit", gmOnly: true },
      { id: "G1", kind: "treasure", zone: "R02", label: "Treasure", gmOnly: true },
    ],
    start: "R01",
    gridM: 1.524,
    gridUnit: { size: 5, unit: "ft" },
    fog: "hide",
    numbering: "key",
    checks: [],
  };
}

describe("drawing a dungeon", () => {
  it("draws portcullis bars with a lock dot, rubble stones, a dashed secret door for the GM, trap and treasure glyphs", () => {
    const svg = nodeToString(drawSiteMap(dungeon(), { view: "gm" }).node);
    expect(svg).toMatch(/data-border="B1" data-kind="bars" data-locked="true"/);
    expect(svg).toContain('data-bar="1"');
    expect(svg).toContain('data-lock="1"');
    expect(svg).toMatch(/data-border="B3" data-kind="rubble"/);
    expect(svg).toContain('data-rubble="1"');
    expect(svg).toMatch(/data-border="B2" data-kind="door"[^>]*>[^]*?stroke-dasharray="0.3 0.15"/);
    expect(svg).toContain('data-marker-kind="trap"');
    expect(svg).toContain('data-marker-kind="treasure"');
    // rooms are numbered, the passage is not
    expect(svg).toContain(">1<");
    expect(svg).not.toContain('data-number="P01"');
  });

  it("on the player map, a seen room's door into an unseen one shows; the unseen room, the secret door and GM marks do not", () => {
    const shown = playerLayout(dungeon(), { act: 1, revealed: ["R01"] });
    const svg = nodeToString(drawSiteMap(shown, { view: "player", fogged: shown.fogged }).node);
    expect(svg).toContain('data-border="B1"');
    expect(svg).not.toContain('data-border="B2"');
    expect(svg).not.toContain("Vault");
    expect(svg).not.toContain('data-marker-kind="trap"');
    expect(svg).not.toContain('data-marker-kind="treasure"');
  });

  it("the players' map is cropped to the rooms they have found, the GM's is the whole level", () => {
    const shown = playerLayout(dungeon(), { act: 1, revealed: ["R01"] });
    const player = drawSiteMap(shown, { view: "player", fogged: shown.fogged });
    // R01 spans x 1..7 (its door into the passage at x 7), y 1..7: three squares around it, within the deck, plus the margin
    expect([player.width, player.height]).toEqual([10 + 2, 10 + 2]);
    expect(nodeToString(player.node)).toContain('transform="translate(1 1)"');
    const gm = drawSiteMap(dungeon(), { view: "gm" });
    expect([gm.width, gm.height]).toEqual([22, 12]);
  });

  it("frames the players' focus on the cropped drawing, not on blank space beside it", () => {
    const shown = playerLayout(dungeon(), { act: 1, revealed: ["R03"] });
    const player = drawSiteMap(shown, { view: "player", fogged: shown.fogged });
    expect(player.origin.x).toBeGreaterThan(0);
    const box = focusBox(shown, "L1", ["R03"], player.origin)!;
    // the box's centre is on the drawing (it used to sit past its right edge, so the screen opened on nothing)
    const cx = box.x + box.w / 2;
    const cy = box.y + box.h / 2;
    expect(cx).toBeGreaterThan(0);
    expect(cx).toBeLessThan(player.width);
    expect(cy).toBeGreaterThan(0);
    expect(cy).toBeLessThan(player.height);
    // the GM's whole-deck drawing starts at the deck's corner
    expect(drawSiteMap(dungeon(), { view: "gm" }).origin).toEqual({ x: 0, y: 0 });
  });

  it("legend swatches exist for the new borders and marks", () => {
    for (const target of [{ border: "bars" as const }, { border: "rubble" as const }, { marker: "trap" as const }, { marker: "treasure" as const }]) {
      expect(nodeToString(legendSwatch({ target, label: "x" }, "light")).length).toBeGreaterThan(80);
    }
  });

  it("grid squares are one per square, not one per metre", () => {
    const svg = nodeToString(drawSiteMap(dungeon(), { view: "player", gridSquares: true }).node);
    // the 6-square-wide guard room gets 5 inner lines across: x = 2..6
    const layer = /data-layer="grid-squares"[^]*?<\/g>/.exec(svg)![0];
    expect(layer).toContain("M 2 1 V 7");
    expect(layer).not.toContain("M 1.66");
  });
});

describe("printing a dungeon", () => {
  it("offers 1 in = 5 ft, 28mm true scale and 1 cm = 5 ft; 1 in = 5 ft by default", () => {
    const scales = printScalesFor(dungeon());
    expect(scales.map((s) => s.label)).toEqual(["1 in = 5 ft (28mm miniatures)", "28mm true scale (1:56, 5 ft ≈ 27.2 mm)", "1 cm = 5 ft (overview)"]);
    expect(defaultMmPerMetre(dungeon())).toBeCloseTo(25.4 / 1.524);
    expect(scaleTextFor(dungeon(), defaultMmPerMetre(dungeon()))).toBe("1 in = 5 ft · 28mm miniatures");
  });

  it("a roll print at 1 in = 5 ft is one inch per square, with a scale bar in feet", () => {
    const l = dungeon();
    const mm = defaultMmPerMetre(l);
    const plan = planRollPrint(l, { view: "player", rollWidthIn: 24, mmPerMetre: mm });
    // 20 squares plus the 0.3-square print margin each side
    expect(plan.mapWidthIn).toBeCloseTo(20.6, 1);
    expect(plan.rotated).toBe(false);
    const page = nodeToString(rollPrintPages(playerLayout(l, { act: 1, print: true }), { view: "player", rollWidthIn: 24, mmPerMetre: mm, title: "Keep" }, plan)[0]!.node);
    expect(page).toContain('data-scale-unit="ft"');
    expect(page).toContain(">25 ft<");
    expect(page).toContain("1 in = 5 ft · 28mm miniatures");
  });

  it("scale bars count squares: 0, 5, 10… 25 ft", () => {
    const bar = nodeToString(scaleBar(0, 0, 10, 1, 5, { per: 15.24, size: 5, name: "ft" }).node);
    for (const t of [">5<", ">10<", ">15<", ">20<", ">25 ft<"]) expect(bar).toContain(t);
  });

  it("SVG exports and letter tiles name the scale in squares", () => {
    const l = dungeon();
    expect(renderSiteMapSvg(l, { view: "gm", physical: true, titleBlock: true, title: "Keep" })).toContain("5 ft = 15.2 mm");
    const tiles = printTiles(l, { view: "player", paper: "letter", mmPerMetre: defaultMmPerMetre(l), title: "Keep" });
    expect(tiles.tiles[0]!.svg).toContain("1 in = 5 ft · 28mm miniatures");
  });

  it("carries a licence notice at the foot of an SVG and on a last page of the tiles and the roll", () => {
    const l = dungeon();
    const notice = "This work includes material from a reference document.\n\nLicensed under a licence that asks for this line.";
    const plain = renderSiteMapSvg(l, { view: "player", title: "Keep" });
    const svg = renderSiteMapSvg(l, { view: "player", title: "Keep", notice });
    expect(plain).not.toContain("data-notice");
    expect(svg).toContain('data-notice="licence"');
    expect(svg).toContain("Licensed under a licence");
    // the notice adds height below the map, never over it
    const h = (s: string) => Number(/viewBox="0 0 [\d.]+ ([\d.]+)"/.exec(s)![1]);
    expect(h(svg)).toBeGreaterThan(h(plain));
    const tiles = printTiles(l, { view: "player", paper: "letter", title: "Keep", notice });
    expect(tiles.notice).toBe(notice);
    const html = printTilesHtml(tiles, "Keep");
    expect(html).toContain('<div class="page notice"><h1>Licence</h1><p>This work includes material from a reference document.</p><p>Licensed under a licence that asks for this line.</p></div>');
    expect(printTilesHtml(printTiles(l, { view: "player", paper: "letter", title: "Keep" }), "Keep")).not.toContain("Licence");
    expect(noticePage(notice).node).toBeDefined();
    expect(noticeLines("a b c", 10, 1000)).toEqual(["a b c"]);
  });
});
