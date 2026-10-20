/**
 * Site map helpers shared by the map page and table mode: the generator
 * definition a map was made with, the screen palette, the layout per view
 * and the roll print plan. The downloads (SVG, PNG, print tiles, roll PDF,
 * zone key, distance table) are in `siteMapDownloads.ts`, loaded on first use.
 */
import { generatorFor, playerLayout, type SiteMap } from "@campaign-forge/core";
import type { MapGeneratorDef, SiteLayout } from "@campaign-forge/module-sdk";
import { planRollPrint, type RollPrintOptions, type RollPrintPlan, type SiteMapViewKind } from "@campaign-forge/ui";
import { useMemo } from "react";
import { useTheme } from "../../components/ui";
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

/**
 * The layout drawn for a view: players get the whole-map print projection.
 * Duct sheets are in it only once the players have revealed part of one at
 * the table (`live.revealed`), with fog on the rest; before that the player
 * print offers no duct sheet at all.
 */
export function layoutForView(layout: SiteLayout, view: SiteMapViewKind, def: MapGeneratorDef | undefined, live?: SiteMap["live"]): SiteLayout {
  return view === "player" ? playerLayout(layout, { act: 1, print: true, legend: def?.legend, revealed: live?.revealed, live }) : layout;
}

/** The deck to draw: the one asked for when the layout has it, else the first. */
export function deckIn(layout: SiteLayout, deck: string | undefined): string | undefined {
  return layout.decks.some((d) => d.id === deck) ? deck : layout.decks[0]?.id;
}

export interface MapFileOptions {
  view: SiteMapViewKind;
  deck: string | undefined;
  def: MapGeneratorDef | undefined;
  /** Add a title block with a scale bar below the map (SVG and PNG). */
  titleBlock?: boolean | undefined;
}

export interface RollFileOptions extends MapFileOptions {
  rollWidthIn: number;
  mmPerMetre: number;
  gridSquares: boolean;
  titleBlock: boolean;
}

export function rollOptions(map: SiteMap, o: RollFileOptions, layout: SiteLayout): RollPrintOptions {
  return { view: o.view, deck: deckIn(layout, o.deck), legend: o.def?.legend, passable: o.def?.passable, rollWidthIn: o.rollWidthIn, mmPerMetre: o.mmPerMetre, gridSquares: o.gridSquares, titleBlock: o.titleBlock, title: map.name, act: 1 };
}

/** The roll print plan (pages and paper) for the current settings. */
export function rollPlan(map: SiteMap, o: RollFileOptions): RollPrintPlan | undefined {
  if (!map.layout) return undefined;
  const layout = layoutForView(map.layout, o.view, o.def, map.live);
  return planRollPrint(layout, rollOptions(map, o, layout));
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
