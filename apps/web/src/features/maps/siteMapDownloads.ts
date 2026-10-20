/**
 * Site map downloads: SVG, PNG, print tiles, roll PDF, zone key and distance
 * table. The map page imports this on first use, so the exporters and the
 * PDF writer stay out of the page's first load.
 */
import { distanceTableCsv, distanceTableJson, zoneKeyCsv, zoneKeyMarkdown, type SiteMap } from "@campaign-forge/core";
import { printTiles, printTilesHtml, renderRollPdf, renderSiteMapPng, renderSiteMapSvg, type PaperSize, type RollPrintPlan, type SiteMapViewKind } from "@campaign-forge/ui";
import { downloadFile, slug } from "../../lib/download";
import { deckIn, layoutForView, rollOptions, type MapFileOptions, type RollFileOptions } from "./siteMapFiles";

const VIEW_SLUG: Record<SiteMapViewKind, string> = { gm: "gm-map", player: "player-map", tracking: "tracking-map" };

function fileBase(map: SiteMap, view: SiteMapViewKind, deck: string | undefined): string {
  const deckName = map.layout?.decks.find((d) => d.id === deck)?.name;
  const multi = (map.layout?.decks.length ?? 0) > 1;
  return `${slug(map.name)}-${VIEW_SLUG[view]}${multi && deckName ? `-${slug(deckName)}` : ""}`;
}

/** Download the deck as SVG (exports are always on the light, print-friendly palette). */
export function downloadMapSvg(map: SiteMap, o: MapFileOptions): void {
  if (!map.layout) return;
  const layout = layoutForView(map.layout, o.view, o.def, map.live);
  const svg = renderSiteMapSvg(layout, {
    view: o.view,
    deck: deckIn(layout, o.deck),
    legend: o.def?.legend,
    passable: o.def?.passable,
    grid: o.view !== "tracking",
    title: `${map.name} (${o.view})`,
    scale: o.view === "tracking" ? 28 : 20,
    titleBlock: o.titleBlock ? { title: map.name } : undefined,
  });
  downloadFile(svg, `${fileBase(map, o.view, o.deck)}.svg`, "image/svg+xml");
}

/** Download the deck as a PNG at 150 dpi (1 m = 1 cm). */
export async function downloadMapPng(map: SiteMap, o: MapFileOptions): Promise<void> {
  if (!map.layout) return;
  const layout = layoutForView(map.layout, o.view, o.def, map.live);
  const blob = await renderSiteMapPng(layout, { view: o.view, deck: deckIn(layout, o.deck), legend: o.def?.legend, passable: o.def?.passable, grid: o.view !== "tracking", dpi: 150, titleBlock: o.titleBlock ? { title: map.name } : undefined });
  downloadFile(blob, `${fileBase(map, o.view, o.deck)}-150dpi.png`, "image/png");
}

/** Print tiles at 1 m = 1 cm: opens a print window, or downloads the page when pop-ups are blocked. */
export function printMapTiles(map: SiteMap, o: MapFileOptions & { paper: PaperSize }): { pages: number; opened: boolean } {
  if (!map.layout) return { pages: 0, opened: false };
  const layout = layoutForView(map.layout, o.view, o.def, map.live);
  const deckName = map.layout.decks.find((d) => d.id === o.deck)?.name ?? "";
  const tiles = printTiles(layout, { view: o.view, deck: deckIn(layout, o.deck), legend: o.def?.legend, passable: o.def?.passable, paper: o.paper, grid: o.view !== "tracking", title: `${map.name} ${deckName}`.trim(), idPrefix: "tile" });
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

/** Download the deck as a vector PDF for a wide-format roll; one page per strip. */
export function downloadRollPdf(map: SiteMap, o: RollFileOptions): RollPrintPlan | undefined {
  if (!map.layout) return undefined;
  const layout = layoutForView(map.layout, o.view, o.def, map.live);
  const { bytes, plan } = renderRollPdf(layout, rollOptions(map, o, layout));
  const scale = o.mmPerMetre === 25.4 ? "1in-per-m" : o.mmPerMetre === 10 ? "1cm-per-m" : "1-56";
  downloadFile(bytes, `${fileBase(map, o.view, o.deck)}-roll-${o.rollWidthIn}in-${scale}.pdf`, "application/pdf");
  return plan;
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
