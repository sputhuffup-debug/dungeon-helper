/**
 * Label placement and roll prints on real Alien layouts (the ui and core
 * packages test against the example module only).
 */
import { playerLayout, runMapGenerator } from "@campaign-forge/core";
import { alienModule, siteMapGenerator } from "@campaign-forge/module-alien";
import type { SiteLayout } from "@campaign-forge/module-sdk";
import { drawSiteMap, placementProblems, planRollPrint, renderRollPdf, rotateLayout } from "@campaign-forge/ui";
import { describe, expect, it } from "vitest";

const legend = siteMapGenerator.legend;

const CASES: Array<[Record<string, unknown>, string]> = [
  [{ site_type: "station_deck", size: "medium" }, "a1"],
  [{ site_type: "starship", size: "medium" }, "b2"],
  [{ site_type: "colony_block", size: "large" }, "c3"],
  [{ site_type: "derelict", size: "medium", duct_density: "dense" }, "d4"],
  [{ site_type: "research_lab", size: "small" }, "e5"],
  [{ site_type: "mine", size: "large", decks: 2 }, "f6"],
  [{ site_type: "alien_ruin", size: "medium", decks: 3 }, "g7"],
];

const layouts = new Map<string, SiteLayout>();
function layout(inputs: Record<string, unknown>, seed: string): SiteLayout {
  const key = `${JSON.stringify(inputs)}/${seed}`;
  if (!layouts.has(key)) layouts.set(key, runMapGenerator(alienModule, siteMapGenerator, inputs, { seed }).layout);
  return layouts.get(key)!;
}

describe("label placement on Alien site maps", () => {
  for (const [inputs, seed] of CASES) {
    it(`${String(inputs.site_type)} (${String(inputs.size)}, ${String(inputs.decks ?? 1)} deck): no overlaps, labels inside their zones`, () => {
      const l = layout(inputs, seed);
      const player = playerLayout(l, { act: 1, print: true, legend });
      for (const deck of l.decks) {
        for (const act of [1, 2, 3]) {
          for (const [view, shown] of [
            ["gm", l],
            ["player", player],
            ["tracking", l],
          ] as const) {
            // the player print leaves out duct sheets nobody has been in
            if (!shown.decks.some((x) => x.id === deck.id)) continue;
            const d = drawSiteMap(shown, { view, deck: deck.id, legend, act, passable: siteMapGenerator.passable });
            expect(placementProblems(d.labels, shown.zones, { x0: 0, y0: 0, x1: deck.width, y1: deck.height }), `${view} ${deck.id} act ${act}`).toEqual([]);
          }
        }
      }
    });
  }

  it("turned 90° (as roll prints draw them): still no overlaps, labels inside their zones", () => {
    for (const [inputs, seed] of CASES) {
      const l = rotateLayout(layout(inputs, seed), 90);
      const player = rotateLayout(playerLayout(layout(inputs, seed), { act: 1, print: true, legend }), 90);
      for (const deck of l.decks) {
        for (const [view, shown] of [
          ["gm", l],
          ["player", player],
          ["tracking", l],
        ] as const) {
          if (!shown.decks.some((x) => x.id === deck.id)) continue;
          const d = drawSiteMap(shown, { view, deck: deck.id, legend, act: 2, passable: siteMapGenerator.passable });
          expect(placementProblems(d.labels, shown.zones, { x0: 0, y0: 0, x1: deck.width, y1: deck.height }), `${String(inputs.site_type)} ${view} ${deck.id}`).toEqual([]);
        }
      }
    }
  });

  it("gives every marker text a place: on the map, or as a callout in the key", () => {
    const l = layout(...CASES[0]!);
    const d = drawSiteMap(l, { view: "gm", legend });
    const onDeck = l.markers.filter((m) => l.zones.find((z) => z.id === m.zone)?.deck === d.deck);
    const placed = d.labels.filter((b) => b.kind === "marker" && b.ref).map((b) => b.ref);
    for (const m of onDeck) expect(placed).toContain(m.id);
    for (const c of d.callouts) expect(onDeck.map((m) => m.id)).toContain(c.marker);
  });
});

describe("roll prints of Alien site maps", () => {
  it("plans and renders every deck on both rolls, one PDF page per planned page", () => {
    const l = layout(...CASES[5]!);
    for (const deck of l.decks) {
      for (const roll of [24, 36]) {
        const { bytes, plan } = renderRollPdf(l, { view: "gm", deck: deck.id, legend, rollWidthIn: roll, mmPerMetre: 25.4, title: "Mine" });
        const pdf = new TextDecoder("latin1").decode(bytes);
        expect(pdf.startsWith("%PDF-1.")).toBe(true);
        expect(pdf.match(/\/Type \/Page /g)?.length).toBe(plan.pages.length);
        expect(plan.pages.every((p) => p.widthIn === roll)).toBe(true);
        // a strip never exceeds the printable width
        expect(plan.stripWidthIn).toBeLessThanOrEqual(roll - 1 + 1e-6);
      }
    }
  });

  it("is deterministic and keeps GM-only text off player prints", () => {
    const l = layout(...CASES[0]!);
    const a = renderRollPdf(l, { view: "gm", legend, rollWidthIn: 24, mmPerMetre: 25.4, title: "Station" });
    const b = renderRollPdf(l, { view: "gm", legend, rollWidthIn: 24, mmPerMetre: 25.4, title: "Station" });
    expect(Buffer.from(a.bytes).equals(Buffer.from(b.bytes))).toBe(true);
    const gmText = new TextDecoder("latin1").decode(a.bytes);
    expect(gmText).toContain("Drone patrol");
    const player = renderRollPdf(playerLayout(l, { act: 1, print: true, legend }), { view: "player", legend, rollWidthIn: 24, mmPerMetre: 25.4, title: "Station" });
    const pText = new TextDecoder("latin1").decode(player.bytes);
    expect(pText).not.toContain("Drone");
    expect(pText).toContain("(Deck A \\267 Player map) Tj");
  });

  it("reports pages and paper for the summary line", () => {
    const l = layout(...CASES[0]!);
    const p = planRollPrint(l, { view: "player", rollWidthIn: 36, mmPerMetre: 25.4 });
    expect(p.summary).toMatch(/^36" roll · 1 page · [\d.]+" of paper$/);
    const overview = planRollPrint(l, { view: "player", rollWidthIn: 24, mmPerMetre: 10 });
    expect(overview.strips).toBe(1);
    expect(overview.paperLengthIn).toBeLessThan(p.paperLengthIn);
  });
});
