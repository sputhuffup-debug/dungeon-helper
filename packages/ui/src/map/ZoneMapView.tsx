import { useRef } from "react";
import type { SiteMap } from "@campaign-forge/core";
import { Button } from "../primitives/Button";
import { Toolbar, ToolbarGroup, ToolbarSpacer } from "../primitives/Toolbar";
import { cx } from "../sheet/paths";
import { BorderLines, MapStage, mapSize, useMapView, useViewportRef, ZoneShape } from "./shared";

export interface MapToken {
  id: string;
  label: string;
  /** Zone id the token is in. */
  zone: string;
  /** Hidden tokens are drawn hollow (GM-only view). */
  hidden?: boolean;
}

export interface ZoneMapViewProps {
  map: SiteMap;
  imageUrl?: string;
  tokens?: MapToken[];
  selectedZone?: string;
  onSelectZone?: (zoneId: string | undefined) => void;
  className?: string;
  /** Show the zoom toolbar (default true). */
  toolbar?: boolean;
}

/** Read-only map for table mode: zones, borders, and tokens placed by zone. */
export function ZoneMapView({ map, imageUrl, tokens = [], selectedZone, onSelectZone, className, toolbar = true }: ZoneMapViewProps) {
  const { width, height } = mapSize(map);
  const viewportRef = useViewportRef();
  const { view, setView, zoomAt, fit, onWheel } = useMapView(viewportRef, width, height);
  const panRef = useRef<null | { sx: number; sy: number; ox: number; oy: number }>(null);

  return (
    <div className={cx("cf-map", "cf-map--view", className)}>
      {toolbar && (
        <Toolbar className="cf-map__toolbar" title={map.name}>
          <ToolbarSpacer />
          <ToolbarGroup>
            <Button size="sm" onClick={() => zoomAt(1 / 1.25)} aria-label="Zoom out">
              −
            </Button>
            <span className="cf-mono cf-muted">{Math.round(view.zoom * 100)}%</span>
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
        view={view}
        width={width}
        height={height}
        imageUrl={imageUrl}
        viewportClassName="cf-map__viewport--pan"
        onWheel={onWheel}
        onPointerDown={(e) => {
          panRef.current = { sx: e.clientX, sy: e.clientY, ox: view.x, oy: view.y };
        }}
        onPointerMove={(e) => {
          const p = panRef.current;
          if (!p || e.buttons === 0) return;
          setView({ ...view, x: p.ox + (e.clientX - p.sx), y: p.oy + (e.clientY - p.sy) });
        }}
        onPointerUp={() => {
          panRef.current = null;
        }}
        ariaLabel={`Map ${map.name}`}
      >
        <BorderLines zones={map.zones} borders={map.borders} />
        {map.zones.map((z) => {
          const inZone = tokens.filter((t) => t.zone === z.id);
          return (
            <ZoneShape key={z.id} zone={z} selected={z.id === selectedZone} tabIndex={onSelectZone ? 0 : undefined} onClick={() => onSelectZone?.(z.id === selectedZone ? undefined : z.id)} onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onSelectZone?.(z.id);
              }
            }}>
              {inZone.map((t, i) => {
                const cols = Math.max(1, Math.floor((z.rect.w - 16) / 36));
                const cx_ = z.rect.x + 18 + (i % cols) * 36;
                const cy_ = z.rect.y + z.rect.h - 20 - Math.floor(i / cols) * 36;
                return (
                  <g key={t.id} className="cf-token" data-token={t.id}>
                    <circle className="cf-token__dot" cx={cx_} cy={cy_} r={12} style={t.hidden ? { fillOpacity: 0.3, strokeDasharray: "3 2" } : undefined} />
                    <text className="cf-token__label" x={cx_} y={cy_ + 4} textAnchor="middle">
                      {t.label.slice(0, 2)}
                    </text>
                  </g>
                );
              })}
            </ZoneShape>
          );
        })}
      </MapStage>
    </div>
  );
}
