import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { playerLayout, runMapGenerator } from "@campaign-forge/core";
import type { SiteLayout } from "@campaign-forge/module-sdk";
import { exampleModule, exampleSiteGenerator } from "@campaign-forge/module-example";
import { MapLegend, SiteMapView, drawSiteMap, flagIcon, nodeToString, printTiles, printTilesHtml, renderRollPdf, renderSiteMapSvg, rollPrintPages, zoneKeyEntries } from "../src/index";

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
  it("GM view: numbers, names, markers, act shading, duct access squares, out of bounds, dark overlay", () => {
    const l = layout();
    render(<SiteMapView layout={l} view="gm" legend={legend} act={1} title="Keep" onSelectZone={() => undefined} />);
    const root = screen.getByTestId("sitemap");
    expect(root).toHaveAttribute("data-view", "gm");
    // every playable zone on the floor deck is numbered (out of bounds is not; ducts are on their own sheets)
    expect(q("[data-number]")).toHaveLength(8);
    expect(q('[data-name="R4"]')).toHaveLength(1);
    expect(q('[data-marker-kind="spawn"]')).toHaveLength(0);
    expect(q('[data-marker-kind="clue"]')).toHaveLength(1);
    expect(q('[data-marker-kind="npc"]')).toHaveLength(1);
    expect(q('[data-marker-kind="win"]')).toHaveLength(1);
    expect(q('[data-act-shade="R4"]')).toHaveLength(1);
    // access squares in the rooms name the duct zone they lead to
    expect(q('[data-glyph="access"]')).toHaveLength(3);
    expect(q('[data-access-to="D01"]')[0]!.textContent).toBe("D01");
    expect(q('[data-access-to="U02"]')).toHaveLength(1);
    expect(q("[data-duct]")).toHaveLength(0);
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
    // no duct sheet is revealed: the players' map has none
    expect(projected.decks.map((d) => d.id)).toEqual(["main"]);
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
    render(<SiteMapView layout={layout()} view="tracking" legend={legend} live={{ tokens: [{ id: "t", label: "Ghoul", zone: "R2", gmOnly: true }], pings: [{ zone: "C2" }] }} />);
    expect(q("[data-number]")).toHaveLength(8);
    expect(q('[data-glyph="access"]')).toHaveLength(3);
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
    expect(svg).toContain("Bell rope");
    expect(svg).not.toContain("data-hit");
    expect(renderSiteMapSvg(layout(), { view: "gm", deck: "crawl", legend })).toContain("Ghoul");
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

describe("duct sheets", () => {
  const passable = exampleSiteGenerator.passable;
  const names = (l: SiteLayout) => new Map(l.zones.map((z) => [z.id, z.name]));

  it("groups duct sheets under the floor deck they serve, by level", () => {
    render(<SiteMapView layout={layout()} view="gm" legend={legend} />);
    const decks = screen.getByRole("group", { name: "Decks" });
    const ducts = within(decks).getByRole("group", { name: "Duct sheets of Ground floor" });
    expect(within(ducts).getAllByRole("button").map((b) => b.textContent)).toEqual(["Undercroft crawl", "Crawlways"]);
    expect(within(decks).getAllByRole("button").map((b) => b.textContent)).toEqual(["Ground floor", "Undercroft crawl", "Crawlways"]);
    fireEvent.click(within(ducts).getByRole("button", { name: "Crawlways" }));
    expect(screen.getByTestId("sitemap")).toHaveAttribute("data-deck", "crawl");
    expect(q('[data-sheet="duct"]')).toHaveLength(1);
    expect(q('[data-tubes="1"]')).toHaveLength(1);
  });

  it("draws tubes, a junction node, vent chambers, zone ids and exit badges naming the rooms", () => {
    const l = layout();
    const d = drawSiteMap(l, { view: "gm", deck: "crawl", legend, passable });
    const svg = nodeToString(d.node);
    expect(svg).toContain('data-junction="D03"');
    expect(svg).toContain('data-chamber="D01"');
    expect(svg).toContain('data-chamber="D05"');
    for (const id of ["D01", "D02", "D03", "D04", "D05"]) expect(svg).toContain(`data-duct-id="${id}"`);
    const n = names(l);
    expect(svg).toContain(`To ${n.get("R2")} (R2)`);
    expect(svg).toContain(`To ${n.get("R5")} (R5)`);
    expect(svg.match(/data-badge="exit"/g)).toHaveLength(2);
    // the fan, the spawn in the junction
    expect(svg).toContain('data-flag-icon="fan"');
    expect(svg).toContain('data-icon="fan"');
    expect(svg).toContain("Ghoul");
    // every label clear of the others, inside the sheet
    const deck = l.decks.find((x) => x.id === "crawl")!;
    expect(d.labels.filter((b) => b.forced)).toEqual([]);
    expect(d.labels.every((b) => b.x0 >= 0 && b.y0 >= 0 && b.x1 <= deck.width && b.y1 <= deck.height)).toBe(true);
  });

  it("draws a one-way drop as a single down arrow at both ends, and climbable shafts as chevrons", () => {
    const l = layout();
    const top = nodeToString(drawSiteMap(l, { view: "gm", deck: "crawl", legend, passable }).node);
    expect(top).toMatch(/data-badge="shaft"[^>]*data-badge-glyph="drop"/);
    expect(top).toContain("Undercroft crawl, U01");
    expect(top).toContain("Drop down to Undercroft crawl, U01");
    const bottom = nodeToString(drawSiteMap(l, { view: "gm", deck: "under", legend, passable }).node);
    expect(bottom).toMatch(/data-badge-glyph="drop"/);
    expect(bottom).toContain("Crawlways, D03");
    expect(bottom).toContain("no climb back");
    // a ladder between sheets on different levels: up from below, down from above; same level: both
    const two: SiteLayout = {
      decks: [
        { id: "lo", name: "Ducts A1", width: 8, height: 6, layer: "duct", level: 0 },
        { id: "hi", name: "Ducts A2", width: 8, height: 6, layer: "duct", level: 2 },
        { id: "mid", name: "Ducts A3", width: 8, height: 6, layer: "duct", level: 2 },
      ],
      zones: [
        { id: "L1", deck: "lo", kind: "crawlspace", layer: "duct", poly: [[1, 1], [3, 1], [3, 3], [1, 3]], cluttered: false },
        { id: "H1", deck: "hi", kind: "crawlspace", layer: "duct", poly: [[1, 1], [3, 1], [3, 3], [1, 3]], cluttered: false },
        { id: "M1", deck: "mid", kind: "crawlspace", layer: "duct", poly: [[1, 1], [3, 1], [3, 3], [1, 3]], cluttered: false },
      ],
      borders: [
        { id: "s1", a: "L1", b: "H1", kind: "shaft", flags: { dropM: 6 } },
        { id: "s2", a: "H1", b: "M1", kind: "shaft" },
      ],
      markers: [],
      checks: [],
    };
    const lo = nodeToString(drawSiteMap(two, { view: "gm", deck: "lo", passable }).node);
    expect(lo).toMatch(/data-badge-glyph="up"/);
    expect(lo).toContain("Ducts A2, H1");
    const hi = nodeToString(drawSiteMap(two, { view: "gm", deck: "hi", passable }).node);
    expect(hi).toMatch(/data-badge-glyph="down"/);
    expect(hi).toMatch(/data-badge-glyph="both"/);
    // players see the sheet name, not the zone id
    expect(nodeToString(drawSiteMap(two, { view: "player", deck: "lo", passable }).node)).not.toContain("H1");
  });

  it("follows an access square from the floor deck to the duct zone it leads to (GM view)", () => {
    const onSelect = vi.fn();
    render(<SiteMapView layout={layout()} view="gm" legend={legend} onSelectZone={onSelect} passable={passable} />);
    const link = document.querySelector('[data-hit="link"][data-link-zone="D01"]')!;
    expect(link).toHaveAttribute("aria-label", "Go to Crawlways, D01");
    fireEvent.click(link);
    expect(screen.getByTestId("sitemap")).toHaveAttribute("data-deck", "crawl");
    expect(onSelect).toHaveBeenLastCalledWith("D01", expect.anything());
    // and back: the exit badge leads to the room
    const back = document.querySelector('[data-hit="link"][data-link-zone="R2"]')!;
    fireEvent.keyDown(back, { key: "Enter" });
    expect(screen.getByTestId("sitemap")).toHaveAttribute("data-deck", "main");
    expect(onSelect).toHaveBeenLastCalledWith("R2", expect.anything());
  });

  it("player view: the sheet is fog except where the crew has been, no ids, exit labels only once known", () => {
    const l = layout();
    const projected = playerLayout(l, { act: 1, revealed: ["R4", "R2", "D01"], legend });
    render(<SiteMapView layout={projected} view="player" legend={legend} fogged={projected.fogged} deck="crawl" />);
    expect(screen.getByTestId("sitemap")).toHaveAttribute("data-deck", "crawl");
    expect(q('[data-fog="D01"]')).toHaveLength(0);
    // the rest of the sheet is fog: zones not found are not drawn at all
    expect(q('[data-sheet-fog="crawl"]')).toHaveLength(1);
    expect(q('[data-duct="D01"]')).toHaveLength(1);
    for (const id of ["D02", "D03", "D04", "D05"]) expect(q(`[data-duct="${id}"]`)).toHaveLength(0);
    expect(q("[data-number]")).toHaveLength(0);
    expect(q('[data-badge="exit"]')).toHaveLength(0);
    expect(q('[data-flag-icon="fan"]')).toHaveLength(0);
    expect(screen.getByTestId("sitemap").innerHTML).not.toContain("Ghoul");
    // the players found the crawl hole: the vent now says where it opens, without ids
    const known = playerLayout(l, { act: 1, revealed: ["R4", "R2", "D01"], legend, live: { borders: { B15: { known: true } } } });
    const svg = nodeToString(drawSiteMap(known, { view: "player", deck: "crawl", legend, fogged: known.fogged }).node);
    expect(svg).toContain(`To ${names(l).get("R2")}<`);
    expect(svg).not.toContain("(R2)");
  });

  it("knows the new hazard icons, and draws the generic glyph for unknown names", () => {
    expect(flagIcon({ target: { flag: "x" }, label: "X", icon: "fan" })).toBe("fan");
    expect(flagIcon({ target: { flag: "x" }, label: "X", icon: "steam" })).toBe("steam");
    expect(flagIcon({ target: { flag: "x" }, label: "X", icon: "drop" })).toBe("drop");
    expect(flagIcon({ target: { flag: "x" }, label: "X", icon: "collapse" })).toBe("collapse");
    expect(flagIcon({ target: { flag: "x" }, label: "X", icon: "acid-rain" })).toBe("hazard");
    expect(flagIcon({ target: { flag: "steamLeak" }, label: "Steam" })).toBe("steam");
    expect(flagIcon({ target: { flag: "collapsed" }, label: "Collapsed" })).toBe("collapse");
  });

  it("prints a duct sheet like a deck: the title block names the sheet and keys its exits", () => {
    const l = layout();
    const key = zoneKeyEntries(l, "crawl");
    expect(key.map((k) => k.name)).toContain(`D01 · West vent · To ${names(l).get("R2")} (R2)`);
    const pages = rollPrintPages(l, { view: "gm", deck: "crawl", legend, passable, rollWidthIn: 24, mmPerMetre: 25.4, title: "Keep" });
    expect(pages).toHaveLength(1);
    const svg = nodeToString(pages[0]!.node);
    expect(svg).toContain("Crawlways (duct sheet for Ground floor)");
    expect(svg).toContain('data-sheet="duct"');
    const { bytes } = renderRollPdf(l, { view: "gm", deck: "crawl", legend, passable, rollWidthIn: 24, mmPerMetre: 25.4, title: "Keep" });
    const pdf = new TextDecoder("latin1").decode(bytes);
    expect(pdf.startsWith("%PDF-1.")).toBe(true);
    expect(pdf).toContain("Crawlways \\(duct sheet for Ground floor\\)");
  });
});
