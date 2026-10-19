/**
 * A plain SVG preview of a generated layout for the workbench (GM view):
 * one deck plan per deck with zone outlines, area tints, ducts dashed,
 * out-of-bounds hatched, borders by kind, zone numbers, key-room names and
 * markers. The shared ui SiteMapView is used instead when it is available.
 */
import type { MapBorderData, MapMarker, MapPoint, MapZoneData, SiteLayout } from "@campaign-forge/module-sdk";
import { useMemo } from "react";

const MARKER_GLYPH: Record<string, string> = { start: "▶", spawn: "◆", waypoint: "◇", clue: "⚿", npc: "☺", win: "★", label: "•", hazard: "⚠" };

function hue(text: string): number {
  let h = 0;
  for (let i = 0; i < text.length; i++) h = (h * 31 + text.charCodeAt(i)) % 360;
  return h;
}

export function polyCenter(poly: MapPoint[]): MapPoint {
  if (poly.length === 0) return [0, 0];
  let x = 0;
  let y = 0;
  for (const [px, py] of poly) {
    x += px;
    y += py;
  }
  return [x / poly.length, y / poly.length];
}

function zoneFill(z: MapZoneData): string {
  if (z.kind === "out-of-bounds") return "url(#mapgen-hatch)";
  if (z.layer === "duct" || z.kind === "crawlspace") return "none";
  const h = hue(z.area ?? z.kind);
  const light = z.kind === "corridor" ? 82 : 72;
  const dark = z.flags?.dark === true;
  return `hsl(${h} 35% ${dark ? light - 22 : light}%)`;
}

function borderStyle(b: MapBorderData): { stroke: string; width: number; dash?: string } {
  switch (b.kind) {
    case "open":
      return { stroke: "#55606a", width: 0.15, dash: "0.6 0.5" };
    case "door":
      return { stroke: b.lockedInActs && b.lockedInActs.length ? "#b4442f" : "#2f7ab4", width: 0.6 };
    case "hatch":
      return { stroke: "#2f7ab4", width: 0.5, dash: "0.3 0.3" };
    case "blast":
      return { stroke: "#7a2fb4", width: 0.9 };
    case "access":
      return { stroke: "#b48a2f", width: 0.4, dash: "0.4 0.3" };
    case "stairs":
      return { stroke: "#2fb47a", width: 0.5 };
    default:
      return { stroke: "#1d242b", width: (b.armor ?? 2) >= 3 ? 0.8 : 0.5 };
  }
}

export function LayoutPreview({ layout }: { layout: SiteLayout }) {
  const decks = layout.decks.length ? layout.decks : [{ id: "", name: "Deck", width: 0, height: 0 }];
  const numbers = useMemo(() => {
    const out = new Map<string, number>();
    layout.zones.filter((z) => z.layer !== "duct").forEach((z, i) => out.set(z.id, i + 1));
    return out;
  }, [layout]);
  return (
    <div className="mapgen-preview" data-testid="map-preview-plain">
      {decks.map((deck) => {
        const zones = layout.zones.filter((z) => !deck.id || z.deck === deck.id);
        const ids = new Set(zones.map((z) => z.id));
        const borders = layout.borders.filter((b) => b.segment && (ids.has(b.a) || ids.has(b.b)));
        const markers = layout.markers.filter((m) => ids.has(m.zone));
        const bounds = deckBounds(deck, zones);
        return (
          <figure key={deck.id || "deck"} className="mapgen-preview__deck">
            {decks.length > 1 && <figcaption className="app-label">{deck.name}</figcaption>}
            <svg viewBox={`${bounds[0]} ${bounds[1]} ${bounds[2]} ${bounds[3]}`} role="img" aria-label={`GM map: ${deck.name}`} className="mapgen-preview__svg">
              <defs>
                <pattern id="mapgen-hatch" width="1.5" height="1.5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                  <rect width="1.5" height="1.5" fill="#d6d6d6" />
                  <line x1="0" y1="0" x2="0" y2="1.5" stroke="#9a9a9a" strokeWidth="0.5" />
                </pattern>
              </defs>
              {zones
                .filter((z) => z.layer !== "duct")
                .map((z) => (
                  <polygon key={z.id} points={z.poly.map((p) => p.join(",")).join(" ")} fill={zoneFill(z)} stroke="#1d242b" strokeWidth={0.12} data-zone={z.id} data-kind={z.kind}>
                    <title>{zoneTitle(z)}</title>
                  </polygon>
                ))}
              {zones
                .filter((z) => z.layer === "duct")
                .map((z) => (
                  <polygon key={z.id} points={z.poly.map((p) => p.join(",")).join(" ")} fill="none" stroke="#b48a2f" strokeWidth={0.25} strokeDasharray="0.8 0.5" data-zone={z.id} data-kind="duct">
                    <title>{zoneTitle(z)}</title>
                  </polygon>
                ))}
              {borders.map((b) => {
                const st = borderStyle(b);
                const [[x1, y1], [x2, y2]] = b.segment as [MapPoint, MapPoint];
                return <line key={b.id} x1={x1} y1={y1} x2={x2} y2={y2} stroke={st.stroke} strokeWidth={st.width} strokeDasharray={st.dash} strokeLinecap="round" data-border={b.kind} />;
              })}
              {zones
                .filter((z) => z.layer !== "duct" && z.kind !== "out-of-bounds")
                .map((z) => {
                  const [cx, cy] = polyCenter(z.poly);
                  return (
                    <g key={z.id} className="mapgen-preview__label">
                      <text x={cx} y={cy} fontSize={1.4} textAnchor="middle" dominantBaseline="middle" fontWeight={700}>
                        {numbers.get(z.id)}
                      </text>
                      {z.key && z.name && (
                        <text x={cx} y={cy + 1.8} fontSize={1.1} textAnchor="middle" dominantBaseline="middle">
                          {z.name}
                        </text>
                      )}
                    </g>
                  );
                })}
              {markerGlyphs(markers, layout.zones)}
            </svg>
          </figure>
        );
      })}
    </div>
  );
}

function zoneTitle(z: MapZoneData): string {
  const parts = [z.name ?? z.id, z.kind, z.cluttered ? "cluttered" : "open"];
  if (z.flags?.dark === true) parts.push("dark");
  if (z.gmNote) parts.push(z.gmNote);
  return parts.join(" · ");
}

function markerGlyphs(markers: MapMarker[], zones: MapZoneData[]) {
  const byZone = new Map(zones.map((z) => [z.id, z]));
  const count = new Map<string, number>();
  return markers.map((m) => {
    const z = byZone.get(m.zone);
    if (!z) return null;
    const n = count.get(m.zone) ?? 0;
    count.set(m.zone, n + 1);
    const [cx, cy] = polyCenter(z.poly);
    const x = cx - 2 + n * 1.4;
    const y = cy - 1.8;
    return (
      <text key={m.id} x={x} y={y} fontSize={1.3} textAnchor="middle" dominantBaseline="middle" fill={m.kind === "spawn" ? "#c0392b" : "#1d242b"} data-marker={m.kind}>
        {MARKER_GLYPH[m.kind] ?? "•"}
        <title>{`${m.label}${m.act ? ` (Act ${m.act})` : ""}`}</title>
      </text>
    );
  });
}

function deckBounds(deck: { width: number; height: number }, zones: MapZoneData[]): [number, number, number, number] {
  let minX = 0;
  let minY = 0;
  let maxX = deck.width;
  let maxY = deck.height;
  for (const z of zones)
    for (const [x, y] of z.poly) {
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  const pad = 1;
  return [minX - pad, minY - pad, Math.max(1, maxX - minX) + pad * 2, Math.max(1, maxY - minY) + pad * 2];
}
