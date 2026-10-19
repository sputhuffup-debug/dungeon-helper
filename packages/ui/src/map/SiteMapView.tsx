/**
 * SiteMapView: a generated deck plan (SiteLayout) drawn with the shared
 * drawing code, one deck at a time, in the GM, player or tracking variant.
 * Pan and zoom follow the image-map stage; zones are focusable buttons and
 * clicking one selects it.
 */
import { createElement, useEffect, useId, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type MouseEvent as ReactMouseEvent, type ReactNode } from "react";
import type { SiteLayout } from "@campaign-forge/module-sdk";
import { Button } from "../primitives/Button";
import { Toolbar, ToolbarGroup, ToolbarSpacer } from "../primitives/Toolbar";
import { cx } from "../sheet/paths";
import { MapStage, useMapView, useViewportRef } from "./shared";
import { drawSiteMap, legendSwatch, type SiteMapDrawOptions, type SiteMapViewKind, type SvgNode } from "./siteMapDraw";
import type { MapLegendEntry } from "@campaign-forge/module-sdk";

const KEEP = new Set(["viewBox", "patternUnits", "patternTransform"]);

function reactAttrName(k: string): string {
  if (k === "class") return "className";
  if (k === "tabindex") return "tabIndex";
  if (k.startsWith("data-") || k.startsWith("aria-") || KEEP.has(k)) return k;
  return k.replace(/-([a-z])/g, (_m, c: string) => c.toUpperCase());
}

interface Handlers {
  onZoneClick?: ((zoneId: string, e: ReactMouseEvent | ReactKeyboardEvent) => void) | undefined;
}

/** Convert a drawing node to React elements; zone hit areas get click and key handlers. */
export function nodeToReact(n: SvgNode | string, key: string | number, h: Handlers = {}): ReactNode {
  if (typeof n === "string") return n;
  const props: Record<string, unknown> = { key };
  for (const [k, v] of Object.entries(n.a ?? {})) if (v !== undefined) props[reactAttrName(k)] = v;
  const zone = n.a?.["data-hit"] === "zone" ? String(n.a["data-zone"]) : undefined;
  if (zone && h.onZoneClick) {
    const click = h.onZoneClick;
    props.onClick = (e: ReactMouseEvent) => click(zone, e);
    props.onKeyDown = (e: ReactKeyboardEvent) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        click(zone, e);
      }
    };
  } else if (zone) {
    // not selectable: a labelled image of the zone, out of the tab order
    delete props.tabIndex;
    delete props["aria-pressed"];
    props.role = "img";
  }
  return createElement(n.t, props, ...(n.c ?? []).map((c, i) => nodeToReact(c, i, h)));
}

export interface SiteMapViewProps {
  layout: SiteLayout;
  view: SiteMapViewKind;
  legend?: MapLegendEntry[] | undefined;
  live?: SiteMapDrawOptions["live"];
  act?: number | undefined;
  fogged?: string[] | undefined;
  selected?: string[] | undefined;
  path?: string[] | undefined;
  /** Controlled deck; uncontrolled (first deck) when omitted. */
  deck?: string | undefined;
  onDeckChange?: ((deck: string) => void) | undefined;
  /** Click or Enter on a zone. The event tells modifier keys apart (shift-click). */
  onSelectZone?: ((zoneId: string, e: ReactMouseEvent | ReactKeyboardEvent) => void) | undefined;
  grid?: boolean | undefined;
  /** Show the grid toggle in the toolbar (default true). */
  gridToggle?: boolean | undefined;
  palette?: SiteMapDrawOptions["palette"];
  title?: string | undefined;
  className?: string | undefined;
  /** Show the toolbar (deck switcher, zoom, grid). Default true. */
  toolbar?: boolean | undefined;
  /** Extra toolbar content (left of the zoom buttons). */
  actions?: ReactNode;
}

/** Pixels per grid unit on screen. */
export function screenScale(view: SiteMapViewKind): number {
  return view === "tracking" ? 28 : 20;
}

export function SiteMapView({
  layout,
  view,
  legend,
  live,
  act,
  fogged,
  selected,
  path,
  deck: deckProp,
  onDeckChange,
  onSelectZone,
  grid: gridProp,
  gridToggle = true,
  palette,
  title,
  className,
  toolbar = true,
  actions,
}: SiteMapViewProps) {
  const prefix = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const [innerDeck, setInnerDeck] = useState<string | undefined>(layout.decks[0]?.id);
  const deck = deckProp ?? (layout.decks.some((d) => d.id === innerDeck) ? innerDeck : layout.decks[0]?.id);
  const [gridOn, setGridOn] = useState(gridProp ?? view !== "tracking");
  const grid = gridProp ?? gridOn;
  const drawing = useMemo(
    () => drawSiteMap(layout, { view, deck, legend, live, act, fogged, selected, path, grid, palette, idPrefix: `sm${prefix}`, interactive: true }),
    [layout, view, deck, legend, live, act, fogged, selected, path, grid, palette, prefix],
  );
  const scale = screenScale(view);
  const width = drawing.width * scale;
  const height = drawing.height * scale;
  const viewportRef = useViewportRef();
  const { view: stage, setView, zoomAt, fit, onWheel } = useMapView(viewportRef, width, height);
  const panRef = useRef<null | { sx: number; sy: number; ox: number; oy: number; zone?: string | undefined }>(null);
  // Pointer capture on the stage can retarget `click` to the viewport, so a
  // press and release without movement on a zone selects it; `click` (and
  // Enter) remain for keyboards and assistive tech, deduplicated.
  const lastPointerPick = useRef<{ zone: string; t: number } | undefined>(undefined);
  const onZoneClick = onSelectZone
    ? (zone: string, e: ReactMouseEvent | ReactKeyboardEvent) => {
        const last = lastPointerPick.current;
        if (last && last.zone === zone && Date.now() - last.t < 600) return;
        onSelectZone(zone, e);
      }
    : undefined;

  // fit once on mount and when the deck or variant changes
  useEffect(() => {
    fit();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deck, view]);

  const pickDeck = (id: string) => {
    setInnerDeck(id);
    onDeckChange?.(id);
  };
  const deckName = layout.decks.find((d) => d.id === deck)?.name ?? "";

  return (
    <div className={cx("cf-map", "cf-map--view", "cf-sitemap", `cf-sitemap--${view}`, className)} data-testid="sitemap" data-view={view} data-deck={deck}>
      {toolbar && (
        <Toolbar className="cf-map__toolbar" title={title}>
          {layout.decks.length > 1 && (
            <ToolbarGroup>
              <span role="group" aria-label="Decks" className="cf-sitemap__decks">
                {layout.decks.map((d) => (
                  <Button key={d.id} size="sm" variant={d.id === deck ? "primary" : "ghost"} aria-pressed={d.id === deck} onClick={() => pickDeck(d.id)}>
                    {d.name}
                  </Button>
                ))}
              </span>
            </ToolbarGroup>
          )}
          {layout.decks.length === 1 && <span className="cf-muted">{deckName}</span>}
          <ToolbarSpacer />
          {actions}
          <ToolbarGroup>
            {gridToggle && gridProp === undefined && (
              <Button size="sm" variant="ghost" aria-pressed={grid} onClick={() => setGridOn((g) => !g)}>
                Grid
              </Button>
            )}
            <Button size="sm" onClick={() => zoomAt(1 / 1.25)} aria-label="Zoom out">
              −
            </Button>
            <span className="cf-mono cf-muted">{Math.round(stage.zoom * 100)}%</span>
            <Button size="sm" onClick={() => zoomAt(1.25)} aria-label="Zoom in">
              +
            </Button>
            <Button size="sm" variant="ghost" onClick={fit}>
              Fit
            </Button>
          </ToolbarGroup>
        </Toolbar>
      )}
      <MapStage
        viewportRef={viewportRef}
        view={stage}
        width={width}
        height={height}
        viewportClassName="cf-map__viewport--pan"
        onWheel={onWheel}
        onPointerDown={(e) => {
          const hit = (e.target as Element).closest?.('[data-hit="zone"]');
          panRef.current = { sx: e.clientX, sy: e.clientY, ox: stage.x, oy: stage.y, zone: hit?.getAttribute("data-zone") ?? undefined };
        }}
        onPointerMove={(e) => {
          const p = panRef.current;
          if (!p || e.buttons === 0) return;
          setView({ ...stage, x: p.ox + (e.clientX - p.sx), y: p.oy + (e.clientY - p.sy) });
        }}
        onPointerUp={(e) => {
          const p = panRef.current;
          panRef.current = null;
          if (!p?.zone || !onSelectZone || e.type !== "pointerup") return;
          if (Math.hypot(e.clientX - p.sx, e.clientY - p.sy) > 5) return;
          lastPointerPick.current = { zone: p.zone, t: Date.now() };
          onSelectZone(p.zone, e);
        }}
        ariaLabel={`${title ? `${title}, ` : ""}${deckName} (${view === "gm" ? "GM map" : view === "player" ? "player map" : "tracking map"})`}
      >
        <g transform={`scale(${scale})`}>{nodeToReact(drawing.node, "root", { onZoneClick })}</g>
      </MapStage>
    </div>
  );
}

export interface MapLegendProps {
  legend: MapLegendEntry[];
  view: SiteMapViewKind;
  palette?: SiteMapDrawOptions["palette"];
  className?: string;
  /** Render a page reference (the app passes its PageRef). */
  renderPage?: (page: NonNullable<MapLegendEntry["page"]>) => ReactNode;
}

const SECTIONS: Array<{ id: string; title: string; match: (e: MapLegendEntry) => boolean }> = [
  { id: "borders", title: "Borders and access", match: (e) => "border" in e.target },
  { id: "zones", title: "Zones", match: (e) => "area" in e.target || "kind" in e.target },
  { id: "flags", title: "Hazards and conditions", match: (e) => "flag" in e.target },
  { id: "markers", title: "Markers", match: (e) => "marker" in e.target },
];

/** The module's map legend; GM-only entries are hidden in the player view. */
export function MapLegend({ legend, view, palette, className, renderPage }: MapLegendProps) {
  const entries = legend.filter((e) => view !== "player" || !e.gmOnly);
  return (
    <div className={cx("cf-maplegend", className)} data-testid="map-legend" aria-label="Map legend" role="region">
      {SECTIONS.map((s) => {
        const items = entries.filter(s.match);
        if (!items.length) return null;
        return (
          <section key={s.id} className="cf-maplegend__section">
            <h4 className="cf-maplegend__title">{s.title}</h4>
            <ul className="cf-maplegend__list">
              {items.map((e, i) => (
                <li key={i} className="cf-maplegend__item" data-legend={JSON.stringify(e.target)}>
                  <svg className="cf-maplegend__swatch" width={28} height={28} viewBox="0 0 2 2" aria-hidden="true">
                    {nodeToReact(legendSwatch(e, palette, legend), "s")}
                  </svg>
                  <span className="cf-maplegend__text">
                    <strong>{e.label}</strong>
                    {e.gmOnly && view !== "player" && <span className="cf-muted"> (GM)</span>}
                    {e.rule && <span className="cf-muted"> · {e.rule}</span>}
                    {e.page !== undefined && renderPage && <> {renderPage(e.page)}</>}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
