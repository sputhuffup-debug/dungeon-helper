import { useCallback, useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent } from "react";
import type { MapZone, MapZoneBorder, SiteMap, ZoneBorder } from "@campaign-forge/core";
import { Badge } from "../primitives/Badge";
import { Button, IconButton } from "../primitives/Button";
import { Toolbar, ToolbarGroup, ToolbarSpacer } from "../primitives/Toolbar";
import { cx, newId } from "../sheet/paths";
import { BorderLines, borderBetween, MapStage, mapSize, useMapView, useViewportRef, ZoneShape } from "./shared";

export type MapTool = "select" | "connect" | "pan";

export interface ZoneMapEditorProps {
  map: SiteMap;
  imageUrl?: string;
  onChange: (map: SiteMap) => void;
  readonly?: boolean;
  className?: string;
  /** Minimum zone size in image pixels when creating by drag (default 8). */
  minZoneSize?: number;
}

type Handle = "nw" | "ne" | "sw" | "se";

type Drag =
  | { kind: "create"; sx: number; sy: number; draft: MapZone["rect"] }
  | { kind: "move"; zoneId: string; sx: number; sy: number; origin: MapZone["rect"]; moved: boolean }
  | { kind: "resize"; zoneId: string; handle: Handle; origin: MapZone["rect"] }
  | { kind: "pan"; sx: number; sy: number; ox: number; oy: number };

const BORDER_CYCLE: Array<ZoneBorder | undefined> = ["open", "blocked", "door", undefined];

/** The next border kind in the open -> blocked -> door -> none cycle. */
export function nextBorderKind(current: ZoneBorder | undefined): ZoneBorder | undefined {
  const i = BORDER_CYCLE.indexOf(current);
  return BORDER_CYCLE[(i + 1) % BORDER_CYCLE.length];
}

export function cycleBorder(map: SiteMap, a: string, b: string): SiteMap {
  const existing = borderBetween(map.borders, a, b);
  const next = nextBorderKind(existing?.kind);
  const borders = map.borders.filter((x) => x !== existing);
  if (next) borders.push({ from: existing?.from ?? a, to: existing?.to ?? b, kind: next });
  return { ...map, borders };
}

function normRect(x1: number, y1: number, x2: number, y2: number): MapZone["rect"] {
  return { x: Math.min(x1, x2), y: Math.min(y1, y2), w: Math.abs(x2 - x1), h: Math.abs(y2 - y1) };
}

function clampRect(r: MapZone["rect"], width: number, height: number): MapZone["rect"] {
  const w = Math.min(r.w, width);
  const h = Math.min(r.h, height);
  return { x: Math.max(0, Math.min(width - w, r.x)), y: Math.max(0, Math.min(height - h, r.y)), w, h };
}

/**
 * Zone overlay editor: drag on empty space to create, drag a zone to move,
 * corner handles to resize, "connect" mode to cycle borders between zones.
 */
export function ZoneMapEditor({ map, imageUrl, onChange, readonly = false, className, minZoneSize = 8 }: ZoneMapEditorProps) {
  const { width, height } = mapSize(map);
  const viewportRef = useViewportRef();
  const { view, setView, zoomAt, fit, onWheel, toImage } = useMapView(viewportRef, width, height);
  const [tool, setTool] = useState<MapTool>("select");
  const [selected, setSelected] = useState<string | undefined>();
  const [pending, setPending] = useState<string | undefined>();
  const [drag, setDrag] = useState<Drag | null>(null);
  const [spaceHeld, setSpaceHeld] = useState(false);
  const dragRef = useRef<Drag | null>(null);
  const setDragBoth = (d: Drag | null) => {
    dragRef.current = d;
    setDrag(d);
  };

  useEffect(() => {
    if (selected && !map.zones.some((z) => z.id === selected)) setSelected(undefined);
  }, [map.zones, selected]);

  const selectedZone = map.zones.find((z) => z.id === selected);
  const update = useCallback((patch: Partial<SiteMap>) => onChange({ ...map, ...patch }), [map, onChange]);
  const updateZone = (id: string, patch: Partial<MapZone>) => update({ zones: map.zones.map((z) => (z.id === id ? { ...z, ...patch } : z)) });
  const deleteZone = (id: string) => {
    update({
      zones: map.zones.filter((z) => z.id !== id),
      borders: map.borders.filter((b) => b.from !== id && b.to !== id),
      accessPoints: map.accessPoints.map((a) => ({ ...a, zones: a.zones.filter((z) => z !== id) })),
    });
    if (selected === id) setSelected(undefined);
    if (pending === id) setPending(undefined);
  };

  const panning = tool === "pan" || spaceHeld;

  const beginPan = (e: ReactPointerEvent) => {
    setDragBoth({ kind: "pan", sx: e.clientX, sy: e.clientY, ox: view.x, oy: view.y });
  };

  const onBackgroundDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button === 1 || panning) {
      e.preventDefault();
      beginPan(e);
      return;
    }
    if (e.button !== 0) return;
    if (tool === "connect") {
      setPending(undefined);
      return;
    }
    if (readonly) return;
    const p = toImage(e);
    setSelected(undefined);
    setDragBoth({ kind: "create", sx: p.x, sy: p.y, draft: { x: p.x, y: p.y, w: 0, h: 0 } });
  };

  const onZoneDown = (zone: MapZone, e: ReactPointerEvent<SVGRectElement>) => {
    e.stopPropagation();
    if (e.button === 1 || panning) {
      beginPan(e);
      return;
    }
    if (e.button !== 0) return;
    if (tool === "connect") {
      if (!pending) setPending(zone.id);
      else if (pending === zone.id) setPending(undefined);
      else {
        onChange(cycleBorder(map, pending, zone.id));
        setPending(undefined);
      }
      return;
    }
    setSelected(zone.id);
    if (readonly) return;
    setDragBoth({ kind: "move", zoneId: zone.id, sx: e.clientX, sy: e.clientY, origin: zone.rect, moved: false });
  };

  const onHandleDown = (zone: MapZone, handle: Handle, e: ReactPointerEvent<SVGRectElement>) => {
    e.stopPropagation();
    if (readonly || e.button !== 0) return;
    setDragBoth({ kind: "resize", zoneId: zone.id, handle, origin: zone.rect });
  };

  const onMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = dragRef.current;
    if (!d) return;
    if (d.kind === "pan") {
      setView({ ...view, x: d.ox + (e.clientX - d.sx), y: d.oy + (e.clientY - d.sy) });
      return;
    }
    const p = toImage(e);
    if (d.kind === "create") {
      setDragBoth({ ...d, draft: normRect(d.sx, d.sy, p.x, p.y) });
    } else if (d.kind === "move") {
      const dx = (e.clientX - d.sx) / view.zoom;
      const dy = (e.clientY - d.sy) / view.zoom;
      const rect = clampRect({ ...d.origin, x: Math.round(d.origin.x + dx), y: Math.round(d.origin.y + dy) }, width, height);
      setDragBoth({ ...d, moved: d.moved || dx !== 0 || dy !== 0 });
      updateZone(d.zoneId, { rect });
    } else if (d.kind === "resize") {
      const o = d.origin;
      const right = o.x + o.w;
      const bottom = o.y + o.h;
      let rect: MapZone["rect"];
      switch (d.handle) {
        case "nw":
          rect = normRect(right, bottom, p.x, p.y);
          break;
        case "ne":
          rect = normRect(o.x, bottom, p.x, p.y);
          break;
        case "sw":
          rect = normRect(right, o.y, p.x, p.y);
          break;
        default:
          rect = normRect(o.x, o.y, p.x, p.y);
      }
      rect = { x: Math.round(rect.x), y: Math.round(rect.y), w: Math.max(minZoneSize, Math.round(rect.w)), h: Math.max(minZoneSize, Math.round(rect.h)) };
      updateZone(d.zoneId, { rect: clampRect(rect, width, height) });
    }
  };

  const onUp = () => {
    const d = dragRef.current;
    if (!d) return;
    if (d.kind === "create") {
      const r = d.draft;
      if (r.w >= minZoneSize && r.h >= minZoneSize) {
        const zone: MapZone = {
          id: newId("zone"),
          name: `Zone ${map.zones.length + 1}`,
          rect: clampRect({ x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.w), h: Math.round(r.h) }, width, height),
          cluttered: false,
        };
        update({ zones: [...map.zones, zone] });
        setSelected(zone.id);
      }
    }
    setDragBoth(null);
  };

  const onKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (e.key === " " && !spaceHeld) {
      e.preventDefault();
      setSpaceHeld(true);
      return;
    }
    if (e.key === "Escape") {
      setPending(undefined);
      setSelected(undefined);
      setDragBoth(null);
      return;
    }
    if (e.key === "+" || e.key === "=") return zoomAt(1.25);
    if (e.key === "-") return zoomAt(1 / 1.25);
    if (!selectedZone || readonly) return;
    if (e.key === "Delete" || e.key === "Backspace") {
      e.preventDefault();
      deleteZone(selectedZone.id);
      return;
    }
    const step = e.shiftKey ? 10 : 1;
    const moves: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
    const m = moves[e.key];
    if (m) {
      e.preventDefault();
      updateZone(selectedZone.id, { rect: clampRect({ ...selectedZone.rect, x: selectedZone.rect.x + m[0], y: selectedZone.rect.y + m[1] }, width, height) });
    }
  };
  const onKeyUp = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (e.key === " ") setSpaceHeld(false);
  };

  const handles: Array<{ h: Handle; x: (r: MapZone["rect"]) => number; y: (r: MapZone["rect"]) => number }> = [
    { h: "nw", x: (r) => r.x, y: (r) => r.y },
    { h: "ne", x: (r) => r.x + r.w, y: (r) => r.y },
    { h: "sw", x: (r) => r.x, y: (r) => r.y + r.h },
    { h: "se", x: (r) => r.x + r.w, y: (r) => r.y + r.h },
  ];
  const handleSize = 10 / view.zoom;

  return (
    <div className={cx("cf-map", readonly && "cf-map--nopanel", className)}>
      <Toolbar className="cf-map__toolbar" title={map.name}>
        {!readonly && (
          <ToolbarGroup role="radiogroup" aria-label="Tool">
            <Button size="sm" active={tool === "select"} onClick={() => setTool("select")}>
              Select
            </Button>
            <Button size="sm" active={tool === "connect"} onClick={() => setTool("connect")}>
              Connect
            </Button>
            <Button size="sm" active={tool === "pan"} onClick={() => setTool("pan")}>
              Pan
            </Button>
          </ToolbarGroup>
        )}
        {tool === "connect" && <span className="cf-map__hint">{pending ? "Click a second zone to cycle the border: open → blocked → door → none." : "Click two zones to connect them."}</span>}
        <ToolbarSpacer />
        <ToolbarGroup>
          <Button size="sm" onClick={() => zoomAt(1 / 1.25)} aria-label="Zoom out">
            −
          </Button>
          <span className="cf-mono cf-muted" data-testid="zoom">
            {Math.round(view.zoom * 100)}%
          </span>
          <Button size="sm" onClick={() => zoomAt(1.25)} aria-label="Zoom in">
            +
          </Button>
          <Button size="sm" variant="ghost" onClick={fit}>
            Fit
          </Button>
        </ToolbarGroup>
      </Toolbar>

      <MapStage
        viewportRef={viewportRef}
        view={view}
        width={width}
        height={height}
        imageUrl={imageUrl}
        viewportClassName={cx(panning && "cf-map__viewport--pan", drag?.kind === "pan" && "cf-map__viewport--panning", tool === "connect" && "cf-map__viewport--connect")}
        onWheel={onWheel}
        onPointerDown={onBackgroundDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onKeyDown={onKeyDown}
        onKeyUp={onKeyUp}
        ariaLabel={`Map editor ${map.name}`}
      >
        <BorderLines zones={map.zones} borders={map.borders} />
        {map.zones.map((z) => (
          <ZoneShape
            key={z.id}
            zone={z}
            selected={z.id === selected}
            pending={z.id === pending}
            tabIndex={0}
            onPointerDown={(e) => onZoneDown(z, e)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                if (tool === "connect") onZoneDown(z, { ...e, button: 0, stopPropagation: () => undefined } as unknown as ReactPointerEvent<SVGRectElement>);
                else setSelected(z.id);
              }
            }}
          >
            {z.id === selected &&
              !readonly &&
              handles.map((hd) => (
                <rect
                  key={hd.h}
                  className={cx("cf-zone__handle", `cf-zone__handle--${hd.h}`)}
                  x={hd.x(z.rect) - handleSize / 2}
                  y={hd.y(z.rect) - handleSize / 2}
                  width={handleSize}
                  height={handleSize}
                  data-handle={hd.h}
                  onPointerDown={(e) => onHandleDown(z, hd.h, e)}
                />
              ))}
          </ZoneShape>
        ))}
        {drag?.kind === "create" && drag.draft.w > 0 && drag.draft.h > 0 && (
          <rect className="cf-zone cf-zone--draft" x={drag.draft.x} y={drag.draft.y} width={drag.draft.w} height={drag.draft.h} data-testid="zone-draft" />
        )}
      </MapStage>

      {!readonly && (
        <aside className="cf-map__panel" aria-label="Map details">
          {selectedZone ? (
            <>
              <h4>Zone</h4>
              <label className="cf-field">
                <span className="cf-field__label">Name</span>
                <input className="cf-input" aria-label="Zone name" value={selectedZone.name} onChange={(e) => updateZone(selectedZone.id, { name: e.target.value })} />
              </label>
              <label className="cf-check">
                <input className="cf-checkbox" type="checkbox" checked={selectedZone.cluttered} onChange={(e) => updateZone(selectedZone.id, { cluttered: e.target.checked })} />
                Cluttered
              </label>
              <label className="cf-field">
                <span className="cf-field__label">Notes</span>
                <textarea className="cf-textarea" aria-label="Zone notes" rows={3} value={selectedZone.notes ?? ""} onChange={(e) => updateZone(selectedZone.id, { notes: e.target.value || undefined })} />
              </label>
              <div className="cf-muted cf-mono" style={{ fontSize: 12 }}>
                {selectedZone.rect.x},{selectedZone.rect.y} · {selectedZone.rect.w}×{selectedZone.rect.h}
              </div>
              <div>
                <strong>Borders</strong>
                <ul className="cf-tracker__log">
                  {map.borders
                    .filter((b) => b.from === selectedZone.id || b.to === selectedZone.id)
                    .map((b) => {
                      const other = b.from === selectedZone.id ? b.to : b.from;
                      const name = map.zones.find((z) => z.id === other)?.name ?? other;
                      return (
                        <li key={`${b.from}-${b.to}`}>
                          <Badge tone={b.kind === "blocked" ? "danger" : b.kind === "door" ? "warning" : "accent"}>{b.kind}</Badge>
                          <span>{name}</span>
                          <Button size="sm" variant="ghost" onClick={() => onChange(cycleBorder(map, b.from, b.to))} aria-label={`Cycle border to ${name}`}>
                            Cycle
                          </Button>
                        </li>
                      );
                    })}
                </ul>
              </div>
              <Button variant="danger" size="sm" onClick={() => deleteZone(selectedZone.id)}>
                Delete zone
              </Button>
            </>
          ) : (
            <>
              <h4>Zones</h4>
              <p className="cf-map__hint">Drag on the map to draw a zone. Hold space or use the Pan tool to move around; scroll to zoom.</p>
              {map.zones.length > 0 && (
                <ul className="cf-tracker__log">
                  {map.zones.map((z) => (
                    <li key={z.id}>
                      <button type="button" className="cf-btn cf-btn--ghost cf-btn--sm" onClick={() => setSelected(z.id)}>
                        {z.name}
                      </button>
                      {z.cluttered && <Badge tone="warning">cluttered</Badge>}
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
          <AccessPointsPanel map={map} onChange={onChange} />
        </aside>
      )}
    </div>
  );
}

function AccessPointsPanel({ map, onChange }: { map: SiteMap; onChange: (map: SiteMap) => void }) {
  const list = map.accessPoints ?? [];
  const set = (next: SiteMap["accessPoints"]) => onChange({ ...map, accessPoints: next });
  return (
    <div className="cf-map__access">
      <h4>Access points</h4>
      {list.length === 0 && <span className="cf-map__hint">Vents, crawlspaces, hatches between zones.</span>}
      {list.map((a) => (
        <div key={a.id} className="cf-map__access-item" data-access={a.id}>
          <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
            <input className="cf-input" aria-label="Access point name" value={a.name} onChange={(e) => set(list.map((x) => (x.id === a.id ? { ...x, name: e.target.value } : x)))} />
            <IconButton size="sm" variant="ghost" label={`Remove ${a.name}`} icon="×" onClick={() => set(list.filter((x) => x.id !== a.id))} />
          </div>
          <label className="cf-check">
            <input className="cf-checkbox" type="checkbox" checked={a.hidden === true} onChange={(e) => set(list.map((x) => (x.id === a.id ? { ...x, hidden: e.target.checked } : x)))} />
            Hidden
          </label>
          <div className="cf-chips">
            {map.zones.map((z) => (
              <label key={z.id} className="cf-check" style={{ minHeight: 28 }}>
                <input
                  className="cf-checkbox"
                  type="checkbox"
                  checked={a.zones.includes(z.id)}
                  aria-label={`${a.name} connects ${z.name}`}
                  onChange={(e) => set(list.map((x) => (x.id === a.id ? { ...x, zones: e.target.checked ? [...x.zones, z.id] : x.zones.filter((id) => id !== z.id) } : x)))}
                />
                {z.name}
              </label>
            ))}
          </div>
        </div>
      ))}
      <div>
        <Button size="sm" onClick={() => set([...list, { id: newId("ap"), name: `Access ${list.length + 1}`, zones: [] }])}>
          Add access point
        </Button>
      </div>
    </div>
  );
}

export type { MapZoneBorder };
