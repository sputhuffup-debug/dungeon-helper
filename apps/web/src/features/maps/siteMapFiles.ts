/**
 * Site map helpers shared by the map page and table mode: the generator
 * definition a map was made with, the screen palette, and the downloads
 * (SVG, PNG, print tiles, zone key, distance table).
 */
import {
  distanceTableCsv,
  distanceTableJson,
  generatorFor,
  playerLayout,
  zoneKeyCsv,
  zoneKeyMarkdown,
  type SiteMap,
} from "@campaign-forge/core";
import type { MapGeneratorDef, SiteLayout } from "@campaign-forge/module-sdk";
import { printTiles, printTilesHtml, renderSiteMapPng, renderSiteMapSvg, type PaperSize, type SiteMapViewKind } from "@campaign-forge/ui";
import { useMemo } from "react";
import { useTheme } from "../../components/ui";
import { downloadFile, slug } from "../../lib/download";
import { useCampaign } from "../../state/hooks";

/** The generator a map was made with (legend, range bands, passability), when the module has it. */
export function useMapGenerator(map: Pick<SiteMap, "generator"> | undefined): MapGeneratorDef | undefined {
  const { module } = useCampaign();
  return useMemo(() => (map ? generatorFor(map, module.module) : undefined), [map, module]);
}

/** The map palette matching the app theme. */
export function useMapPalette(): "light" | "dark" {
  return useTheme().resolved === "light" ? "light" : "dark";
}

/** The layout drawn for a view: players get the whole-map print projection. */
export function layoutForView(layout: SiteLayout, view: SiteMapViewKind, def: MapGeneratorDef | undefined): SiteLayout {
  return view === "player" ? playerLayout(layout, { act: 1, print: true, legend: def?.legend }) : layout;
}

const VIEW_SLUG: Record<SiteMapViewKind, string> = { gm: "gm-map", player: "player-map", tracking: "tracking-map" };

function fileBase(map: SiteMap, view: SiteMapViewKind, deck: string | undefined): string {
  const deckName = map.layout?.decks.find((d) => d.id === deck)?.name;
  const multi = (map.layout?.decks.length ?? 0) > 1;
  return `${slug(map.name)}-${VIEW_SLUG[view]}${multi && deckName ? `-${slug(deckName)}` : ""}`;
}

export interface MapFileOptions {
  view: SiteMapViewKind;
  deck: string | undefined;
  def: MapGeneratorDef | undefined;
}

/** Download the deck as SVG (exports are always on the light, print-friendly palette). */
export function downloadMapSvg(map: SiteMap, o: MapFileOptions): void {
  if (!map.layout) return;
  const layout = layoutForView(map.layout, o.view, o.def);
  const svg = renderSiteMapSvg(layout, { view: o.view, deck: o.deck, legend: o.def?.legend, grid: o.view !== "tracking", title: `${map.name} (${o.view})`, scale: o.view === "tracking" ? 28 : 20 });
  downloadFile(svg, `${fileBase(map, o.view, o.deck)}.svg`, "image/svg+xml");
}

/** Download the deck as a PNG at 150 dpi (1 m = 1 cm). */
export async function downloadMapPng(map: SiteMap, o: MapFileOptions): Promise<void> {
  if (!map.layout) return;
  const layout = layoutForView(map.layout, o.view, o.def);
  const blob = await renderSiteMapPng(layout, { view: o.view, deck: o.deck, legend: o.def?.legend, grid: o.view !== "tracking", dpi: 150 });
  downloadFile(blob, `${fileBase(map, o.view, o.deck)}-150dpi.png`, "image/png");
}

/** Print tiles at 1 m = 1 cm: opens a print window, or downloads the page when pop-ups are blocked. */
export function printMapTiles(map: SiteMap, o: MapFileOptions & { paper: PaperSize }): { pages: number; opened: boolean } {
  if (!map.layout) return { pages: 0, opened: false };
  const layout = layoutForView(map.layout, o.view, o.def);
  const deckName = map.layout.decks.find((d) => d.id === o.deck)?.name ?? "";
  const tiles = printTiles(layout, { view: o.view, deck: o.deck, legend: o.def?.legend, paper: o.paper, grid: o.view !== "tracking", title: `${map.name} ${deckName}`.trim(), idPrefix: "tile" });
  const html = printTilesHtml(tiles, `${map.name}: print tiles`);
  const name = `${fileBase(map, o.view, o.deck)}-tiles-${o.paper}.html`;
  let opened = false;
  try {
    const w = window.open("", "_blank");
    if (w) {
      w.document.open();
      w.document.write(html);
      w.document.close();
      w.focus();
      setTimeout(() => w.print(), 300);
      opened = true;
    }
  } catch {
    opened = false;
  }
  if (!opened) downloadFile(html, name, "text/html");
  return { pages: tiles.tiles.length, opened };
}

export function downloadZoneKey(map: SiteMap, format: "md" | "csv", module: Parameters<typeof zoneKeyCsv>[1]): void {
  const base = `${slug(map.name)}-zone-key`;
  if (format === "md") downloadFile(zoneKeyMarkdown(map, module), `${base}.md`, "text/markdown");
  else downloadFile(zoneKeyCsv(map, module), `${base}.csv`, "text/csv");
}

export function downloadDistanceTable(map: SiteMap, format: "csv" | "json", opts: { keyOnly: boolean; act: number; module: Parameters<typeof zoneKeyCsv>[1] }): void {
  const base = `${slug(map.name)}-distances${opts.keyOnly ? "-key-zones" : "-all-zones"}-act-${opts.act}`;
  const o = { keyOnly: opts.keyOnly, act: opts.act, module: opts.module, useLive: false };
  if (format === "csv") downloadFile(distanceTableCsv(map, o), `${base}.csv`, "text/csv");
  else downloadFile(distanceTableJson(map, o), `${base}.json`, "application/json");
}

/** Highest act any zone, border or marker mentions (at least 3). */
export function maxActOf(layout: SiteLayout | undefined): number {
  let max = 3;
  if (!layout) return max;
  for (const z of layout.zones) for (const a of z.acts ?? []) max = Math.max(max, a);
  for (const b of layout.borders) for (const a of b.lockedInActs ?? []) max = Math.max(max, a);
  for (const m of layout.markers) if (m.act) max = Math.max(max, m.act);
  return Math.min(max, 9);
}
