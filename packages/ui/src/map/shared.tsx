import { useCallback, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent, type ReactNode, type RefObject, type WheelEvent } from "react";
import type { MapZone, MapZoneBorder, SiteMap } from "@campaign-forge/core";
import { cx } from "../sheet/paths";

export const BLANK_WIDTH = 1000;
export const BLANK_HEIGHT = 700;
export const MIN_ZOOM = 0.2;
export const MAX_ZOOM = 6;

export interface MapView {
  x: number;
  y: number;
  zoom: number;
}

export function mapSize(map: SiteMap): { width: number; height: number } {
  return { width: map.width ?? BLANK_WIDTH, height: map.height ?? BLANK_HEIGHT };
}

export function zoneCenter(z: MapZone): { x: number; y: number } {
  return { x: z.rect.x + z.rect.w / 2, y: z.rect.y + z.rect.h / 2 };
}

export function borderBetween(borders: MapZoneBorder[], a: string, b: string): MapZoneBorder | undefined {
  return borders.find((x) => (x.from === a && x.to === b) || (x.from === b && x.to === a));
}

/** Pan/zoom state with wheel-zoom around the cursor and fit-to-viewport. */
export function useMapView(viewportRef: RefObject<HTMLDivElement | null>, width: number, height: number) {
  const [view, setView] = useState<MapView>({ x: 0, y: 0, zoom: 1 });

  const zoomAt = useCallback(
    (factor: number, cx?: number, cy?: number) => {
      setView((v) => {
        const el = viewportRef.current;
        const px = cx ?? (el?.clientWidth ?? 0) / 2;
        const py = cy ?? (el?.clientHeight ?? 0) / 2;
        const zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, v.zoom * factor));
        const ratio = zoom / v.zoom;
        return { zoom, x: px - (px - v.x) * ratio, y: py - (py - v.y) * ratio };
      });
    },
    [viewportRef],
  );

  const fit = useCallback(() => {
    const el = viewportRef.current;
    const vw = el?.clientWidth ?? 0;
    const vh = el?.clientHeight ?? 0;
    if (vw <= 0 || vh <= 0) {
      setView({ x: 0, y: 0, zoom: 1 });
      return;
    }
    const zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Math.min(vw / width, vh / height) * 0.95));
    setView({ zoom, x: (vw - width * zoom) / 2, y: (vh - height * zoom) / 2 });
  }, [viewportRef, width, height]);

  const onWheel = useCallback(
    (e: WheelEvent<HTMLDivElement>) => {
      e.preventDefault();
      const rect = viewportRef.current?.getBoundingClientRect();
      zoomAt(e.deltaY < 0 ? 1.1 : 1 / 1.1, e.clientX - (rect?.left ?? 0), e.clientY - (rect?.top ?? 0));
    },
    [viewportRef, zoomAt],
  );

  /** Pointer position in image coordinates. */
  const toImage = useCallback(
    (e: { clientX: number; clientY: number }): { x: number; y: number } => {
      const rect = viewportRef.current?.getBoundingClientRect();
      return { x: (e.clientX - (rect?.left ?? 0) - view.x) / view.zoom, y: (e.clientY - (rect?.top ?? 0) - view.y) / view.zoom };
    },
    [viewportRef, view],
  );

  return { view, setView, zoomAt, fit, onWheel, toImage };
}

export interface MapStageProps {
  viewportRef: RefObject<HTMLDivElement | null>;
  view: MapView;
  width: number;
  height: number;
  imageUrl?: string;
  className?: string;
  viewportClassName?: string;
  onWheel?: (e: WheelEvent<HTMLDivElement>) => void;
  onPointerDown?: (e: ReactPointerEvent<HTMLDivElement>) => void;
  onPointerMove?: (e: ReactPointerEvent<HTMLDivElement>) => void;
  onPointerUp?: (e: ReactPointerEvent<HTMLDivElement>) => void;
  onKeyDown?: (e: React.KeyboardEvent<HTMLDivElement>) => void;
  onKeyUp?: (e: React.KeyboardEvent<HTMLDivElement>) => void;
  /** SVG content drawn over the image. */
  children?: ReactNode;
  ariaLabel?: string;
}

/** The pannable/zoomable container: image (or a blank grid) with an SVG overlay. */
export function MapStage({ viewportRef, view, width, height, imageUrl, className, viewportClassName, onWheel, onPointerDown, onPointerMove, onPointerUp, onKeyDown, onKeyUp, children, ariaLabel }: MapStageProps) {
  const stageStyle: CSSProperties = { width, height, transform: `translate(${view.x}px, ${view.y}px) scale(${view.zoom})` };
  return (
    <div
      ref={viewportRef}
      className={cx("cf-map__viewport", viewportClassName, className)}
      tabIndex={0}
      role="application"
      aria-label={ariaLabel ?? "Zone map"}
      onWheel={onWheel}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onKeyDown={onKeyDown}
      onKeyUp={onKeyUp}
      data-testid="map-viewport"
    >
      <div className="cf-map__stage" style={stageStyle}>
        {imageUrl ? <img className="cf-map__image" src={imageUrl} alt="" width={width} height={height} draggable={false} /> : <div className="cf-map__blank" style={{ width, height }} />}
        <svg className="cf-map__svg" width={width} height={height} viewBox={`0 0 ${width} ${height}`} data-testid="map-svg">
          {children}
        </svg>
      </div>
    </div>
  );
}

export interface BorderLinesProps {
  zones: MapZone[];
  borders: MapZoneBorder[];
}

export function BorderLines({ zones, borders }: BorderLinesProps) {
  const byId = new Map(zones.map((z) => [z.id, z]));
  return (
    <g className="cf-borders">
      {borders.map((b) => {
        const a = byId.get(b.from);
        const c = byId.get(b.to);
        if (!a || !c) return null;
        const p = zoneCenter(a);
        const q = zoneCenter(c);
        const mx = (p.x + q.x) / 2;
        const my = (p.y + q.y) / 2;
        return (
          <g key={`${b.from}-${b.to}`} data-border={`${b.from}-${b.to}`} data-kind={b.kind}>
            <line className={cx("cf-border", `cf-border--${b.kind}`)} x1={p.x} y1={p.y} x2={q.x} y2={q.y} />
            {b.kind === "door" && <rect className="cf-border__door" x={mx - 7} y={my - 7} width={14} height={14} rx={2} />}
            {b.kind === "blocked" && (
              <g>
                <line className="cf-border__blocked" x1={mx - 8} y1={my - 8} x2={mx + 8} y2={my + 8} />
                <line className="cf-border__blocked" x1={mx - 8} y1={my + 8} x2={mx + 8} y2={my - 8} />
              </g>
            )}
          </g>
        );
      })}
    </g>
  );
}

export interface ZoneShapeProps {
  zone: MapZone;
  selected?: boolean;
  pending?: boolean;
  onPointerDown?: (e: ReactPointerEvent<SVGRectElement>) => void;
  onClick?: (e: React.MouseEvent<SVGRectElement>) => void;
  onKeyDown?: (e: React.KeyboardEvent<SVGRectElement>) => void;
  tabIndex?: number;
  children?: ReactNode;
}

export function ZoneShape({ zone, selected, pending, onPointerDown, onClick, onKeyDown, tabIndex, children }: ZoneShapeProps) {
  const { x, y, w, h } = zone.rect;
  return (
    <g data-zone={zone.id}>
      <rect
        className={cx("cf-zone", zone.cluttered && "cf-zone--cluttered", selected && "cf-zone--selected", pending && "cf-zone--pending")}
        x={x}
        y={y}
        width={w}
        height={h}
        rx={4}
        tabIndex={tabIndex}
        role="button"
        aria-label={`Zone ${zone.name}${zone.cluttered ? ", cluttered" : ""}`}
        aria-pressed={selected}
        onPointerDown={onPointerDown}
        onClick={onClick}
        onKeyDown={onKeyDown}
      />
      <text className="cf-zone__label" x={x + 8} y={y + 20}>
        {zone.name}
      </text>
      {zone.notes && (
        <text className="cf-zone__label" x={x + 8} y={y + 38} style={{ fontSize: 11, fontWeight: 400 }}>
          {zone.notes.length > 40 ? `${zone.notes.slice(0, 40)}…` : zone.notes}
        </text>
      )}
      {children}
    </g>
  );
}

/** Ref helper so callers do not need to import useRef themselves. */
export function useViewportRef() {
  return useRef<HTMLDivElement | null>(null);
}
