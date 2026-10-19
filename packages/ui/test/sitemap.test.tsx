import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { playerLayout, runMapGenerator } from "@campaign-forge/core";
import type { SiteLayout } from "@campaign-forge/module-sdk";
import { exampleModule, exampleSiteGenerator } from "@campaign-forge/module-example";
import { MapLegend, SiteMapView, drawSiteMap, nodeToString, printTiles, printTilesHtml, renderSiteMapSvg } from "../src/index";

function layout(): SiteLayout {
  return runMapGenerator(exampleModule, exampleSiteGenerator, { darkness: 50, lockedAct: 2 }, { seed: "ui-test" }).layout;
}
const legend = exampleSiteGenerator.legend!;

const q = (sel: string) => document.querySelectorAll(sel);

describe("drawSiteMap", () => {
  it("is deterministic and draws every border kind with its own mark", () => {
    const a = nodeToString(drawSiteMap(layout(), { view: "gm", legend, act: 2 }).node);
    const b = nodeToString(drawSiteMap(layout(), { view: "gm", legend, act: 2 }).node);
    expect(a).toBe(b);
    expect(a).toContain('data-kind="blast"');
    expect(a).toContain('data-kind="hatch"');
    expect(a).toContain('data-glyph="access"');
    // the vault door is locked in act 2 only
    expect(a).toMatch(/data-border="B09"[^>]*data-locked="true"/);
    const act1 = nodeToString(drawSiteMap(layout(), { view: "gm", legend, act: 1 }).node);
    expect(act1).not.toMatch(/data-border="B09"[^>]*data-locked="true"/);
  });
});

describe("SiteMapView", () => {
  it("GM view: numbers, names, markers, act shading, ducts, out of bounds, dark overlay", () => {
    const l = layout();
    render(<SiteMapView layout={l} view="gm" legend={legend} act={1} title="Keep" onSelectZone={() => undefined} />);
    const root = screen.getByTestId("sitemap");
    expect(root).toHaveAttribute("data-view", "gm");
    // every playable zone is numbered (out of bounds is not)
    expect(q("[data-number]")).toHaveLength(9);
    expect(q('[data-name="R4"]')).toHaveLength(1);
    expect(q('[data-marker-kind="spawn"]')).toHaveLength(1);
    expect(q('[data-marker-kind="clue"]')).toHaveLength(1);
    expect(q('[data-marker-kind="npc"]')).toHaveLength(1);
    expect(q('[data-marker-kind="win"]')).toHaveLength(1);
    expect(q('[data-act-shade="R4"]')).toHaveLength(1);
    expect(q('[data-duct="D1"]')).toHaveLength(1);
    expect(q('[data-oob="X1"]')).toHaveLength(1);
    expect(q("[data-dark]").length).toBe(l.zones.filter((z) => z.flags?.dark === true && z.kind !== "out-of-bounds").length);
    // zones are focusable buttons with labels
    expect(screen.getByRole("button", { name: /^Zone \d+ West passage, open/ })).toHaveAttribute("tabindex", "0");
  });

  it("player view of the projection: no GM markers, no numbers, fog over unexplored zones", () => {
    const projected = playerLayout(layout(), { act: 1, revealed: ["R4", "C1"], legend });
    render(<SiteMapView layout={projected} view="player" legend={legend} fogged={projected.fogged} />);
    expect(q("[data-number]")).toHaveLength(0);
    expect(q('[data-marker-kind="spawn"], [data-marker-kind="clue"], [data-marker-kind="npc"], [data-marker-kind="win"]')).toHaveLength(0);
    expect(q('[data-marker-kind="start"]')).toHaveLength(1);
    // floor zones get fog; ducts (drawn over rooms) stay bare outlines
    expect(q("[data-fog]").length).toBe(projected.fogged.filter((id) => projected.zones.find((z) => z.id === id)?.layer !== "duct").length);
    expect(q('[data-fog="D1"]')).toHaveLength(0);
    expect(q('[data-fog="R6"]')).toHaveLength(1);
    expect(q('[data-fog="R4"]')).toHaveLength(0);
    // without a select handler zones are labelled images, not buttons
    expect(screen.getAllByRole("img", { name: "Unexplored zone" }).length).toBe(projected.fogged.length);
    expect(screen.queryAllByRole("button", { name: /zone/i })).toHaveLength(0);
    // nothing GM-only is in the DOM
    const html = screen.getByTestId("sitemap").innerHTML;
    expect(html).not.toContain("Ghoul");
    expect(html).not.toContain("Bell rope");
    expect(html).not.toContain("curse");
  });

  it("tracking view: outlines, numbers and ducts only", () => {
    render(<SiteMapView layout={layout()} view="tracking" legend={legend} live={{ tokens: [{ id: "t", label: "Ghoul", zone: "D1", gmOnly: true }], pings: [{ zone: "C2" }] }} />);
    expect(q("[data-number]")).toHaveLength(9);
    expect(q('[data-duct="D1"]')).toHaveLength(1);
    expect(q("[data-area]")).toHaveLength(0);
    expect(q("[data-marker]")).toHaveLength(0);
    expect(q("[data-flag-icon]")).toHaveLength(0);
    expect(q('[data-token="t"]')).toHaveLength(1);
    expect(q('[data-ping="C2"]')).toHaveLength(1);
  });

  it("live state: tokens, pings, burning icons, live locks and seals", () => {
    const live = {
      act: 1,
      borders: { B01: { locked: true }, B15: { sealed: true } },
      zoneFlags: { R2: { burning: true } },
      tokens: [{ id: "tk", label: "Ada Lovelace", zone: "R4", gmOnly: false }],
      pings: [{ zone: "C2", at: "x" }],
    };
    render(<SiteMapView layout={layout()} view="gm" legend={legend} live={live} />);
    expect(q('[data-token="tk"]')[0]!.textContent).toContain("AL");
    expect(q('[data-ping="C2"]')).toHaveLength(1);
    expect(q('[data-zone-content="R2"] [data-flag-icon="burning"]')).toHaveLength(1);
    expect(q('[data-border="B01"][data-locked="true"] [data-lock]')).toHaveLength(1);
    expect(q('[data-border="B15"][data-sealed="true"]')).toHaveLength(1);
  });

  it("selects a zone by press-and-release, click or Enter, and shows the selection", () => {
    const onSelect = vi.fn();
    const { rerender } = render(<SiteMapView layout={layout()} view="gm" legend={legend} onSelectZone={onSelect} />);
    const hit = document.querySelector('[data-hit="zone"][data-zone="C1"]')!;
    fireEvent.pointerDown(hit, { clientX: 10, clientY: 10, buttons: 1 });
    fireEvent.pointerUp(hit, { clientX: 11, clientY: 10 });
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect.mock.calls[0]![0]).toBe("C1");
    // the click that follows the same press is not a second selection
    fireEvent.click(hit);
    expect(onSelect).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(document.querySelector('[data-hit="zone"][data-zone="R2"]')!, { key: "Enter" });
    expect(onSelect).toHaveBeenLastCalledWith("R2", expect.anything());
    // a drag pans instead of selecting
    fireEvent.pointerDown(hit, { clientX: 10, clientY: 10, buttons: 1 });
    fireEvent.pointerMove(hit, { clientX: 60, clientY: 10, buttons: 1 });
    fireEvent.pointerUp(hit, { clientX: 60, clientY: 10 });
    expect(onSelect).toHaveBeenCalledTimes(2);
    rerender(<SiteMapView layout={layout()} view="gm" legend={legend} onSelectZone={onSelect} selected={["C1"]} path={["C1", "C2"]} />);
    expect(q('[data-selected="C1"]')).toHaveLength(1);
    expect(q('[data-path="C2"]')).toHaveLength(1);
    expect(document.querySelector('[data-hit="zone"][data-zone="C1"]')).toHaveAttribute("aria-pressed", "true");
  });

  it("switches decks", () => {
    const l: SiteLayout = {
      decks: [
        { id: "a", name: "Upper", width: 10, height: 10 },
        { id: "b", name: "Lower", width: 10, height: 10 },
      ],
      zones: [
        { id: "u1", deck: "a", kind: "room", poly: [[0, 0], [5, 0], [5, 5], [0, 5]], cluttered: false, name: "Bridge", key: true },
        { id: "l1", deck: "b", kind: "room", poly: [[0, 0], [5, 0], [5, 5], [0, 5]], cluttered: false, name: "Hold", key: true },
      ],
      borders: [{ id: "s", a: "u1", b: "l1", kind: "stairs" }],
      markers: [],
      checks: [],
    };
    render(<SiteMapView layout={l} view="gm" />);
    expect(screen.getByTestId("sitemap")).toHaveAttribute("data-deck", "a");
    expect(q('[data-name="u1"]')).toHaveLength(1);
    expect(q('[data-glyph="stairs"]')).toHaveLength(1);
    fireEvent.click(within(screen.getByRole("group", { name: "Decks" })).getByRole("button", { name: "Lower" }));
    expect(screen.getByTestId("sitemap")).toHaveAttribute("data-deck", "b");
    expect(q('[data-name="l1"]')).toHaveLength(1);
    expect(q('[data-name="u1"]')).toHaveLength(0);
  });
});

describe("MapLegend", () => {
  it("lists entries by section and hides GM-only entries for players", () => {
    const { rerender } = render(<MapLegend legend={legend} view="gm" />);
    const gm = screen.getByTestId("map-legend");
    expect(gm).toHaveTextContent("Cursed");
    expect(gm).toHaveTextContent("Spawn");
    expect(gm).toHaveTextContent("Portcullis");
    rerender(<MapLegend legend={legend} view="player" />);
    const pl = screen.getByTestId("map-legend");
    expect(pl).not.toHaveTextContent("Cursed");
    expect(pl).not.toHaveTextContent("Spawn");
    expect(pl).toHaveTextContent("Burning");
    expect(pl.querySelectorAll("svg").length).toBe(legend.filter((e) => !e.gmOnly).length);
  });
});

describe("exports", () => {
  it("renders a standalone SVG string with the same drawing", () => {
    const svg = renderSiteMapSvg(layout(), { view: "gm", legend, title: "Keep" });
    expect(svg.startsWith('<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" width="640" height="440" viewBox="0 0 32 22"')).toBe(true);
    expect(svg).toContain("<title>Keep</title>");
    expect(svg).toContain("Ghoul");
    expect(svg).not.toContain("data-hit");
    const physical = renderSiteMapSvg(layout(), { view: "tracking", physical: true });
    expect(physical).toContain('width="32cm" height="22cm"');
    const player = renderSiteMapSvg(playerLayout(layout(), { act: 1, print: true, legend }), { view: "player", legend });
    expect(player).not.toContain("Ghoul");
    expect(player).not.toContain("data-number");
  });

  it("splits a deck into print tiles at 1 m = 1 cm with overlap marks", () => {
    const t = printTiles(layout(), { view: "player", paper: "a4" });
    // 32 x 22 cm on A4 (19 x 27.7 printable): two portrait pages beat four landscape ones
    expect(t).toMatchObject({ orientation: "portrait", cols: 2, rows: 1, pageWidth: 21, pageHeight: 29.7 });
    expect(t.tiles).toHaveLength(2);
    expect(t.tiles[0]!.svg).toContain('width="21cm" height="29.7cm"');
    expect(t.tiles[0]!.svg).toContain('data-overlap="right"');
    expect(t.tiles[1]!.svg).toContain('data-overlap="left"');
    expect(t.tiles[1]!.svg).toContain("translate(-17 1)");
    const letter = printTiles(layout(), { view: "player", paper: "letter" });
    expect(letter.pageWidth).toBe(21.59);
    const html = printTilesHtml(t, "Keep");
    expect(html).toContain("@page { size: 21cm 29.7cm; margin: 0; }");
    expect(html.match(/class="page"/g)).toHaveLength(2);
  });
});
