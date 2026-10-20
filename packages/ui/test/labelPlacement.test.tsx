import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { runMapGenerator } from "@campaign-forge/core";
import type { SiteLayout } from "@campaign-forge/module-sdk";
import { exampleModule, exampleSiteGenerator } from "@campaign-forge/module-example";
import { LabelPlacer, SiteMapView, boxInPolygon, drawSiteMap, nodeToString, overlappingPairs, placementProblems, scanPositions } from "../src/index";

const legend = exampleSiteGenerator.legend!;

describe("LabelPlacer", () => {
  it("places boxes in scan order, clear of each other, the same way every time", () => {
    const run = () => {
      const p = new LabelPlacer(0.05);
      p.block({ x0: 0, y0: 0, x1: 1, y1: 1 }, "number");
      const region = { x0: 0, y0: 0, x1: 6, y1: 4 };
      const out = [];
      for (let i = 0; i < 6; i++) out.push(p.place({ w: 2, h: 1, candidates: scanPositions(region, 2, 1, "bottom-left"), kind: "marker" }));
      return { p, out };
    };
    const a = run();
    const b = run();
    expect(a.out).toEqual(b.out);
    // the first goes bottom left; later ones fill the bottom row, then the rows above
    expect(a.out[0]).toMatchObject({ x0: 0, y0: 3 });
    expect(a.out[1]!.y0).toBe(3);
    expect(a.out.every(Boolean)).toBe(true);
    expect(overlappingPairs(a.p.boxes, 0)).toEqual([]);
    // a full region: nothing placed unless forced
    expect(a.p.place({ w: 6, h: 4, candidates: scanPositions({ x0: 0, y0: 0, x1: 6, y1: 4 }, 6, 4, "top-left"), kind: "marker" })).toBeUndefined();
    expect(a.p.place({ w: 6, h: 4, candidates: [[0, 0]], kind: "marker", force: true })).toMatchObject({ forced: true });
  });

  it("scans from any corner or from the centre", () => {
    const r = { x0: 0, y0: 0, x1: 2, y1: 2 };
    expect(scanPositions(r, 1, 1, "top-right", 1)[0]).toEqual([1, 0]);
    expect(scanPositions(r, 1, 1, "bottom-right", 1)[0]).toEqual([1, 1]);
    expect(scanPositions(r, 1, 1, "center", 1)[0]).toEqual([0.5, 0.5]);
    expect(scanPositions(r, 3, 1, "top-left")).toEqual([]);
  });

  it("knows when a box is inside an L-shaped zone", () => {
    const L: Array<[number, number]> = [[0, 0], [4, 0], [4, 2], [2, 2], [2, 4], [0, 4]];
    expect(boxInPolygon({ x0: 0.5, y0: 0.5, x1: 3.5, y1: 1.5 }, L)).toBe(true);
    expect(boxInPolygon({ x0: 1, y0: 1, x1: 3, y1: 3 }, L)).toBe(false);
    expect(boxInPolygon({ x0: 0.1, y0: 0.1, x1: 1, y1: 1 }, L, 0.2)).toBe(false);
  });
});

describe("label placement on generated maps", () => {
  const seeds = ["a", "b", "c", "d", "e", "f"];
  for (const view of ["gm", "player", "tracking"] as const) {
    it(`${view} view: every label clear of the others and inside its zone`, () => {
      for (const seed of seeds) {
        const layout = runMapGenerator(exampleModule, exampleSiteGenerator, { darkness: 60, lockedAct: 2 }, { seed }).layout;
        for (const act of [1, 2]) {
          for (const deck of layout.decks) {
            const d = drawSiteMap(layout, { view, deck: deck.id, legend, act, passable: exampleSiteGenerator.passable, live: { zoneFlags: { R2: { burning: true }, R5: { flooded: true } } } });
            expect(placementProblems(d.labels, layout.zones, { x0: 0, y0: 0, x1: deck.width, y1: deck.height }), `${seed} ${deck.id} act ${act}`).toEqual([]);
          }
        }
      }
    });
  }

  function corridor(): SiteLayout {
    return {
      decks: [{ id: "a", name: "Deck A", width: 12, height: 6 }],
      zones: [
        { id: "c", deck: "a", kind: "corridor", poly: [[0, 0], [12, 0], [12, 2], [0, 2]], cluttered: false, name: "Spine" },
        { id: "r", deck: "a", kind: "room", poly: [[0, 2], [5, 2], [5, 6], [0, 6]], cluttered: true, name: "A very long laboratory name", key: true, flags: { burning: true } },
        { id: "s", deck: "a", kind: "room", poly: [[5, 2], [12, 2], [12, 6], [5, 6]], cluttered: false },
      ],
      borders: [{ id: "b1", a: "c", b: "r", kind: "door", segment: [[0, 2], [5, 2]], lockedInActs: [1] }],
      markers: [
        { id: "m1", kind: "spawn", zone: "c", label: "Something with a very long patrol route name (act 2)", gmOnly: true },
        { id: "m2", kind: "clue", zone: "c", label: "Keycard", gmOnly: true },
        { id: "m3", kind: "npc", zone: "r", label: "Survivor", gmOnly: true },
      ],
      gridM: 1,
      checks: [],
    };
  }

  it("moves text that fits nowhere to a lettered callout, keeps names inside, and puts the text in the tooltip", () => {
    const l = corridor();
    const d = drawSiteMap(l, { view: "gm", legend, interactive: true });
    expect(placementProblems(d.labels, l.zones, { x0: 0, y0: 0, x1: 12, y1: 6 })).toEqual([]);
    expect(d.callouts).toEqual([{ ref: "a", marker: "m1", zone: "c", number: 1, label: "Something with a very long patrol route name (act 2)" }]);
    const svg = nodeToString(d.node);
    expect(svg).toContain('data-callout="a"');
    // the short label still fits in the corridor
    expect(svg).toMatch(/data-marker="m2"[^]*?>Keycard</);
    // the long key-room name wraps to two lines inside its 5 m room
    const name = d.labels.find((b) => b.kind === "name" && b.zone === "r")!;
    expect(name.x1 - name.x0).toBeLessThanOrEqual(5);
    expect(svg.match(/data-name="r"/g)).toHaveLength(1);
    render(<SiteMapView layout={l} view="gm" legend={legend} onSelectZone={() => undefined} />);
    const hit = document.querySelector('[data-hit="zone"][data-zone="c"] title')!;
    expect(hit.textContent).toContain("a: Something with a very long patrol route name (act 2)");
    expect(hit.textContent).toContain("Keycard");
  });
});
