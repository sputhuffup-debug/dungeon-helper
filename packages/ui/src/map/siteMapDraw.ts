/**
 * Site map drawing: one pure function turns a SiteLayout into a small SVG
 * node tree. The React view converts the tree to elements; the exports
 * serialise it to a standalone SVG string. Both use the same code, so the
 * downloaded map is the map on screen.
 *
 * Everything is drawn in layout grid units (1 unit = `gridM` metres) with
 * inline presentation attributes, so a serialised map needs no stylesheet.
 */
import {
  ductToOf,
  effectiveBorder,
  exitLabel,
  exitToOf,
  isDuctSheet,
  isFlagTarget,
  isOneWay,
  lockedInAct,
  matchingFlagEntries,
  shaftLabel,
  shaftLinks,
  zoneNumbers,
  type LiveBorderOverride,
} from "@campaign-forge/core";
import type { MapBorderData, MapGeneratorDef, MapLegendEntry, MapMarker, MapPoint, MapZoneData, SiteLayout } from "@campaign-forge/module-sdk";
import { LabelPlacer, boxAround, boxInPolygon, boxInside, boxesOverlap, insetBox, scanPositions, type LabelBox, type PlacedLabel } from "./labelPlacement";
import { MAP_FONT, ellipsize, textWidth, wrapText } from "./textMetrics";

// ---------------------------------------------------------------------------
// node tree
// ---------------------------------------------------------------------------

export type SvgAttrs = Record<string, string | number | undefined>;

export interface SvgNode {
  t: string;
  a?: SvgAttrs;
  c?: Array<SvgNode | string>;
}

export function el(t: string, a?: SvgAttrs, c?: Array<SvgNode | string | null | undefined | false>): SvgNode {
  const n: SvgNode = { t };
  if (a) n.a = a;
  if (c) n.c = c.filter((x): x is SvgNode | string => !!x || x === "");
  return n;
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function fmt(v: string | number): string {
  return typeof v === "number" ? String(Math.round(v * 1000) / 1000) : v;
}

/** Serialise a node tree to SVG markup. */
export function nodeToString(n: SvgNode | string): string {
  if (typeof n === "string") return esc(n);
  const attrs = Object.entries(n.a ?? {})
    .filter(([, v]) => v !== undefined)
    .map(([k, v]) => ` ${k}="${esc(fmt(v as string | number))}"`)
    .join("");
  if (!n.c || n.c.length === 0) return `<${n.t}${attrs}/>`;
  return `<${n.t}${attrs}>${n.c.map(nodeToString).join("")}</${n.t}>`;
}

// ---------------------------------------------------------------------------
// palettes
// ---------------------------------------------------------------------------

export interface SiteMapPalette {
  background: string;
  floor: string;
  wall: string;
  open: string;
  grid: string;
  text: string;
  halo: string;
  muted: string;
  duct: string;
  darkOverlay: string;
  darkOpacity: number;
  outOfBounds: string;
  /** Exterior zones (yards, streets): open ground and its dashed edge. */
  ground: string;
  groundLine: string;
  fog: string;
  fogLine: string;
  tintOpacity: number;
  lock: string;
  spawn: string;
  clue: string;
  npc: string;
  win: string;
  start: string;
  ping: string;
  token: string;
  gmToken: string;
  select: string;
  path: string;
  act: string;
  fire: string;
  water: string;
  hazard: string;
  /** Duct sheets: background, grid, tube fill, tube edge, tube highlight, ink on the sheet. */
  ductSheet: string;
  ductGrid: string;
  tube: string;
  tubeEdge: string;
  tubeLine: string;
  ductInk: string;
  /** Exit and shaft badges on duct sheets. */
  badge: string;
  badgeInk: string;
  badgeEdge: string;
}

export const LIGHT_PALETTE: SiteMapPalette = {
  background: "#f4f1ea",
  floor: "#ffffff",
  wall: "#1d2329",
  open: "#5b6770",
  grid: "#dfe3e6",
  text: "#1d2329",
  halo: "#ffffff",
  muted: "#5a6b78",
  duct: "#2f6f98",
  darkOverlay: "#0b1620",
  darkOpacity: 0.26,
  outOfBounds: "#8d969c",
  ground: "#e6dfcb",
  groundLine: "#9c927a",
  fog: "#6b737a",
  fogLine: "#8a9298",
  tintOpacity: 0.38,
  lock: "#c43f27",
  spawn: "#d23c2a",
  clue: "#b7791a",
  npc: "#2f6fb8",
  win: "#2f8f45",
  start: "#178f89",
  ping: "#16a34a",
  token: "#2f5fa8",
  gmToken: "#8a3fb8",
  select: "#e08a00",
  path: "#178f89",
  act: "#178f89",
  fire: "#e5563d",
  water: "#2f7fb8",
  hazard: "#d49a1a",
  ductSheet: "#24323d",
  ductGrid: "#32444f",
  tube: "#6d8597",
  tubeEdge: "#101a21",
  tubeLine: "#a9bfcd",
  ductInk: "#e8eff4",
  badge: "#f4f1ea",
  badgeInk: "#1d2329",
  badgeEdge: "#101a21",
};

export const DARK_PALETTE: SiteMapPalette = {
  background: "#0f1418",
  floor: "#1b242b",
  wall: "#d8e1e6",
  open: "#8fa0aa",
  grid: "#24303a",
  text: "#e6edf1",
  halo: "#0f1418",
  muted: "#93a4b1",
  duct: "#5fb3e0",
  darkOverlay: "#000000",
  darkOpacity: 0.4,
  outOfBounds: "#55626b",
  ground: "#262b22",
  groundLine: "#6f7562",
  fog: "#2a333a",
  fogLine: "#3a464f",
  tintOpacity: 0.28,
  lock: "#ff6b4f",
  spawn: "#ff5a45",
  clue: "#e8b13a",
  npc: "#5fa8e8",
  win: "#5cc06c",
  start: "#2fb8b0",
  ping: "#3ee07a",
  token: "#5f8fe8",
  gmToken: "#c07ff0",
  select: "#ffb020",
  path: "#5fd6cf",
  act: "#5fd6cf",
  fire: "#ff6b4f",
  water: "#5fb3e0",
  hazard: "#f0b43a",
  ductSheet: "#1a252d",
  ductGrid: "#26353f",
  tube: "#5a7182",
  tubeEdge: "#070c10",
  tubeLine: "#9fb6c5",
  ductInk: "#e6edf1",
  badge: "#e6edf1",
  badgeInk: "#0f1418",
  badgeEdge: "#070c10",
};

/** Area tints when the legend gives no colour: a fixed palette picked by the area tag. */
export const AREA_PALETTE = ["#7fa3c7", "#c7a46f", "#8fc79a", "#c78f8f", "#a68bc7", "#9aa7ad", "#c7c27f", "#7fc7c0"];

function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function areaColor(area: string, legend: MapLegendEntry[] | undefined): string {
  const e = (legend ?? []).find((x) => "area" in x.target && x.target.area === area);
  if (e?.color && !e.color.startsWith("var(")) return e.color;
  return AREA_PALETTE[hashString(area) % AREA_PALETTE.length]!;
}

// ---------------------------------------------------------------------------
// geometry
// ---------------------------------------------------------------------------

export interface Box {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export function bbox(poly: MapPoint[]): Box {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const [x, y] of poly) {
    x0 = Math.min(x0, x);
    y0 = Math.min(y0, y);
    x1 = Math.max(x1, x);
    y1 = Math.max(y1, y);
  }
  if (!Number.isFinite(x0)) return { x0: 0, y0: 0, x1: 0, y1: 0 };
  return { x0, y0, x1, y1 };
}

export function center(poly: MapPoint[]): [number, number] {
  const b = bbox(poly);
  return [(b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2];
}

function points(poly: MapPoint[]): string {
  return poly.map(([x, y]) => `${fmt(x)},${fmt(y)}`).join(" ");
}

function overlapCenter(a: Box, b: Box): [number, number] | undefined {
  const x0 = Math.max(a.x0, b.x0);
  const y0 = Math.max(a.y0, b.y0);
  const x1 = Math.min(a.x1, b.x1);
  const y1 = Math.min(a.y1, b.y1);
  if (x1 < x0 || y1 < y0) return undefined;
  return [(x0 + x1) / 2, (y0 + y1) / 2];
}

// ---------------------------------------------------------------------------
// icons and glyphs (centred on x, y; about one unit across)
// ---------------------------------------------------------------------------

export type FlagIcon = "fire" | "vacuum" | "float" | "dark" | "radiation" | "water" | "fan" | "steam" | "drop" | "collapse" | "exit" | "hazard";

export const FLAG_ICONS: readonly FlagIcon[] = ["fire", "vacuum", "float", "dark", "radiation", "water", "fan", "steam", "drop", "collapse", "exit", "hazard"];

/** Zone flags that label links between a floor deck and a duct sheet (drawn as badges, not icons). */
const LINK_FLAGS = new Set(["exitTo", "ductTo"]);

/** The icon for a flag legend entry: its `icon`, else a guess from the flag name, else the generic hazard glyph (also for unknown icon names). */
export function flagIcon(entry: MapLegendEntry): FlagIcon {
  if (entry.icon) return (FLAG_ICONS as readonly string[]).includes(entry.icon) ? (entry.icon as FlagIcon) : "hazard";
  const name = isFlagTarget(entry.target) ? entry.target.flag.toLowerCase() : "";
  if (/fan|blade|turbine/.test(name)) return "fan";
  if (/steam|vent.?gas|scald/.test(name)) return "steam";
  if (/collapse|cave|debris|rubble/.test(name)) return "collapse";
  if (/^drop|fall|chute/.test(name)) return "drop";
  if (/fire|flam|burn/.test(name)) return "fire";
  if (/vacuum|atmos|air/.test(name)) return "vacuum";
  if (/grav/.test(name)) return "float";
  if (/dark|light/.test(name)) return "dark";
  if (/rad/.test(name)) return "radiation";
  if (/water|flood/.test(name)) return "water";
  return "hazard";
}

export function iconNode(icon: FlagIcon, x: number, y: number, p: SiteMapPalette, s = 1, color?: string): SvgNode {
  const k = s * 0.5;
  switch (icon) {
    case "fire":
      return el("path", {
        d: `M ${fmt(x)} ${fmt(y + k * 0.9)} C ${fmt(x - k * 0.85)} ${fmt(y + k * 0.9)} ${fmt(x - k * 0.9)} ${fmt(y)} ${fmt(x - k * 0.2)} ${fmt(y - k * 0.95)} C ${fmt(x - k * 0.1)} ${fmt(y - k * 0.2)} ${fmt(x + k * 0.3)} ${fmt(y - k * 0.3)} ${fmt(x + k * 0.3)} ${fmt(y - k * 0.7)} C ${fmt(x + k * 0.9)} ${fmt(y - k * 0.1)} ${fmt(x + k * 0.85)} ${fmt(y + k * 0.9)} ${fmt(x)} ${fmt(y + k * 0.9)} Z`,
        fill: color ?? p.fire,
        stroke: p.halo,
        "stroke-width": 0.06 * s,
      });
    case "vacuum":
      return el("g", {}, [
        el("circle", { cx: x, cy: y, r: k * 0.8, fill: p.halo, stroke: color ?? p.text, "stroke-width": 0.1 * s, "stroke-dasharray": `${fmt(0.2 * s)} ${fmt(0.12 * s)}` }),
        el("line", { x1: x - k * 0.55, y1: y + k * 0.55, x2: x + k * 0.55, y2: y - k * 0.55, stroke: color ?? p.text, "stroke-width": 0.1 * s }),
      ]);
    case "float": {
      const a = (cx: number, dir: 1 | -1) =>
        el("path", {
          d: `M ${fmt(cx)} ${fmt(y + dir * k * 0.8)} L ${fmt(cx)} ${fmt(y - dir * k * 0.8)} M ${fmt(cx - k * 0.3)} ${fmt(y - dir * k * 0.45)} L ${fmt(cx)} ${fmt(y - dir * k * 0.8)} L ${fmt(cx + k * 0.3)} ${fmt(y - dir * k * 0.45)}`,
          fill: "none",
          stroke: color ?? p.npc,
          "stroke-width": 0.1 * s,
          "stroke-linecap": "round",
          "stroke-linejoin": "round",
        });
      return el("g", {}, [a(x - k * 0.4, 1), a(x + k * 0.4, -1)]);
    }
    case "dark":
      return el("path", {
        d: `M ${fmt(x + k * 0.3)} ${fmt(y - k * 0.8)} A ${fmt(k * 0.8)} ${fmt(k * 0.8)} 0 1 0 ${fmt(x + k * 0.3)} ${fmt(y + k * 0.8)} A ${fmt(k * 0.6)} ${fmt(k * 0.6)} 0 1 1 ${fmt(x + k * 0.3)} ${fmt(y - k * 0.8)} Z`,
        fill: color ?? p.text,
        stroke: p.halo,
        "stroke-width": 0.05 * s,
      });
    case "radiation": {
      const wedges: SvgNode[] = [];
      for (let i = 0; i < 3; i++) {
        const a0 = ((i * 120 - 30) * Math.PI) / 180;
        const a1 = ((i * 120 + 30) * Math.PI) / 180;
        const r0 = k * 0.25;
        const r1 = k * 0.85;
        wedges.push(
          el("path", {
            d: `M ${fmt(x + r0 * Math.cos(a0))} ${fmt(y + r0 * Math.sin(a0))} L ${fmt(x + r1 * Math.cos(a0))} ${fmt(y + r1 * Math.sin(a0))} A ${fmt(r1)} ${fmt(r1)} 0 0 1 ${fmt(x + r1 * Math.cos(a1))} ${fmt(y + r1 * Math.sin(a1))} L ${fmt(x + r0 * Math.cos(a1))} ${fmt(y + r0 * Math.sin(a1))} Z`,
            fill: color ?? p.hazard,
          }),
        );
      }
      return el("g", {}, [...wedges, el("circle", { cx: x, cy: y, r: k * 0.15, fill: color ?? p.hazard })]);
    }
    case "water": {
      const wave = (yy: number) =>
        el("path", {
          d: `M ${fmt(x - k * 0.8)} ${fmt(yy)} q ${fmt(k * 0.4)} ${fmt(-k * 0.35)} ${fmt(k * 0.8)} 0 t ${fmt(k * 0.8)} 0`,
          fill: "none",
          stroke: color ?? p.water,
          "stroke-width": 0.1 * s,
          "stroke-linecap": "round",
        });
      return el("g", {}, [wave(y - k * 0.3), wave(y + k * 0.35)]);
    }
    case "fan": {
      const c = color ?? p.text;
      const blades: SvgNode[] = [];
      for (let i = 0; i < 3; i++) {
        const a = (i * 2 * Math.PI) / 3 - Math.PI / 2;
        const tx = x + Math.cos(a) * k * 0.8;
        const ty = y + Math.sin(a) * k * 0.8;
        const sx = x + Math.cos(a + 0.9) * k * 0.55;
        const sy = y + Math.sin(a + 0.9) * k * 0.55;
        blades.push(el("path", { d: `M ${fmt(x)} ${fmt(y)} Q ${fmt(sx)} ${fmt(sy)} ${fmt(tx)} ${fmt(ty)} Q ${fmt((x + tx) / 2)} ${fmt((y + ty) / 2)} ${fmt(x)} ${fmt(y)} Z`, fill: c }));
      }
      return el("g", { "data-icon": "fan" }, [
        el("circle", { cx: x, cy: y, r: k * 0.95, fill: p.halo, stroke: c, "stroke-width": 0.08 * s }),
        ...blades,
        el("circle", { cx: x, cy: y, r: k * 0.14, fill: p.halo, stroke: c, "stroke-width": 0.05 * s }),
      ]);
    }
    case "steam": {
      const c = color ?? p.muted;
      const wisp = (cx: number) =>
        el("path", {
          d: `M ${fmt(cx)} ${fmt(y + k * 0.85)} c ${fmt(-k * 0.3)} ${fmt(-k * 0.3)} ${fmt(k * 0.3)} ${fmt(-k * 0.55)} 0 ${fmt(-k * 0.85)} s ${fmt(k * 0.3)} ${fmt(-k * 0.55)} 0 ${fmt(-k * 0.85)}`,
          fill: "none",
          stroke: c,
          "stroke-width": 0.1 * s,
          "stroke-linecap": "round",
        });
      return el("g", { "data-icon": "steam" }, [el("circle", { cx: x, cy: y, r: k * 0.95, fill: p.halo, "fill-opacity": 0.85 }), wisp(x - k * 0.45), wisp(x), wisp(x + k * 0.45)]);
    }
    case "drop": {
      const c = color ?? p.hazard;
      return el("g", { "data-icon": "drop" }, [
        el("path", { d: `M ${fmt(x - k * 0.9)} ${fmt(y - k * 0.75)} L ${fmt(x - k * 0.35)} ${fmt(y - k * 0.75)} M ${fmt(x + k * 0.35)} ${fmt(y - k * 0.75)} L ${fmt(x + k * 0.9)} ${fmt(y - k * 0.75)}`, stroke: p.text, "stroke-width": 0.12 * s, "stroke-linecap": "round" }),
        el("path", { d: `M ${fmt(x)} ${fmt(y - k * 0.75)} L ${fmt(x)} ${fmt(y + k * 0.35)}`, stroke: c, "stroke-width": 0.16 * s, "stroke-linecap": "round" }),
        el("path", { d: `M ${fmt(x - k * 0.45)} ${fmt(y + k * 0.2)} L ${fmt(x)} ${fmt(y + k * 0.9)} L ${fmt(x + k * 0.45)} ${fmt(y + k * 0.2)} Z`, fill: c, stroke: p.halo, "stroke-width": 0.04 * s }),
      ]);
    }
    case "collapse": {
      const c = color ?? p.hazard;
      return el("g", { "data-icon": "collapse" }, [
        el("path", { d: `M ${fmt(x - k * 0.9)} ${fmt(y + k * 0.8)} L ${fmt(x - k * 0.45)} ${fmt(y + k * 0.1)} L ${fmt(x)} ${fmt(y + k * 0.8)} Z`, fill: c, stroke: p.halo, "stroke-width": 0.04 * s }),
        el("path", { d: `M ${fmt(x - k * 0.1)} ${fmt(y + k * 0.8)} L ${fmt(x + k * 0.4)} ${fmt(y - k * 0.05)} L ${fmt(x + k * 0.9)} ${fmt(y + k * 0.8)} Z`, fill: c, stroke: p.halo, "stroke-width": 0.04 * s }),
        el("path", { d: `M ${fmt(x - k * 0.8)} ${fmt(y - k * 0.8)} L ${fmt(x - k * 0.2)} ${fmt(y - k * 0.45)} L ${fmt(x + k * 0.15)} ${fmt(y - k * 0.75)} L ${fmt(x + k * 0.8)} ${fmt(y - k * 0.4)}`, fill: "none", stroke: p.text, "stroke-width": 0.1 * s, "stroke-linejoin": "round", "stroke-linecap": "round" }),
      ]);
    }
    case "exit": {
      const c = color ?? p.start;
      return el("g", { "data-icon": "exit" }, [
        el("path", { d: `M ${fmt(x - k * 0.85)} ${fmt(y - k * 0.8)} H ${fmt(x + k * 0.2)} M ${fmt(x - k * 0.85)} ${fmt(y + k * 0.8)} H ${fmt(x + k * 0.2)} M ${fmt(x - k * 0.85)} ${fmt(y - k * 0.8)} V ${fmt(y + k * 0.8)}`, fill: "none", stroke: p.text, "stroke-width": 0.1 * s, "stroke-linecap": "round" }),
        el("path", { d: `M ${fmt(x - k * 0.35)} ${fmt(y)} H ${fmt(x + k * 0.45)}`, stroke: c, "stroke-width": 0.14 * s, "stroke-linecap": "round" }),
        el("path", { d: `M ${fmt(x + k * 0.95)} ${fmt(y)} L ${fmt(x + k * 0.35)} ${fmt(y - k * 0.45)} L ${fmt(x + k * 0.35)} ${fmt(y + k * 0.45)} Z`, fill: c }),
      ]);
    }
    case "hazard":
    default:
      return el("g", {}, [
        el("path", { d: `M ${fmt(x)} ${fmt(y - k * 0.85)} L ${fmt(x + k * 0.9)} ${fmt(y + k * 0.75)} L ${fmt(x - k * 0.9)} ${fmt(y + k * 0.75)} Z`, fill: color ?? p.hazard, stroke: p.halo, "stroke-width": 0.05 * s, "stroke-linejoin": "round" }),
        el("text", { x, y: y + k * 0.6, "text-anchor": "middle", "font-size": k * 1.1, "font-weight": 700, "font-family": MAP_FONT, fill: p.halo }, ["!"]),
      ]);
  }
}

export function markerGlyph(kind: MapMarker["kind"], x: number, y: number, p: SiteMapPalette, s = 1): SvgNode {
  const k = s * 0.4;
  switch (kind) {
    case "spawn":
      return el("path", { d: `M ${fmt(x)} ${fmt(y - k)} L ${fmt(x + k)} ${fmt(y)} L ${fmt(x)} ${fmt(y + k)} L ${fmt(x - k)} ${fmt(y)} Z`, fill: p.spawn, stroke: p.halo, "stroke-width": 0.06 * s });
    case "waypoint":
      return el("path", { d: `M ${fmt(x)} ${fmt(y - k)} L ${fmt(x + k)} ${fmt(y)} L ${fmt(x)} ${fmt(y + k)} L ${fmt(x - k)} ${fmt(y)} Z`, fill: p.halo, stroke: p.spawn, "stroke-width": 0.1 * s });
    case "clue":
      return el("g", { fill: "none", stroke: p.clue, "stroke-width": 0.12 * s, "stroke-linecap": "round" }, [
        el("circle", { cx: x - k * 0.45, cy: y, r: k * 0.42 }),
        el("path", { d: `M ${fmt(x - k * 0.05)} ${fmt(y)} L ${fmt(x + k)} ${fmt(y)} M ${fmt(x + k * 0.55)} ${fmt(y)} L ${fmt(x + k * 0.55)} ${fmt(y + k * 0.4)} M ${fmt(x + k * 0.9)} ${fmt(y)} L ${fmt(x + k * 0.9)} ${fmt(y + k * 0.35)}` }),
      ]);
    case "npc":
      return el("g", { fill: p.npc, stroke: p.halo, "stroke-width": 0.05 * s }, [
        el("circle", { cx: x, cy: y - k * 0.45, r: k * 0.38 }),
        el("path", { d: `M ${fmt(x - k * 0.75)} ${fmt(y + k)} C ${fmt(x - k * 0.75)} ${fmt(y + k * 0.05)} ${fmt(x + k * 0.75)} ${fmt(y + k * 0.05)} ${fmt(x + k * 0.75)} ${fmt(y + k)} Z` }),
      ]);
    case "win": {
      const pts: string[] = [];
      for (let i = 0; i < 10; i++) {
        const r = i % 2 === 0 ? k * 1.05 : k * 0.45;
        const a = -Math.PI / 2 + (i * Math.PI) / 5;
        pts.push(`${fmt(x + r * Math.cos(a))},${fmt(y + r * Math.sin(a))}`);
      }
      return el("polygon", { points: pts.join(" "), fill: p.win, stroke: p.halo, "stroke-width": 0.05 * s });
    }
    case "start":
      return el("g", {}, [
        el("line", { x1: x - k * 0.55, y1: y - k, x2: x - k * 0.55, y2: y + k, stroke: p.start, "stroke-width": 0.12 * s, "stroke-linecap": "round" }),
        el("path", { d: `M ${fmt(x - k * 0.5)} ${fmt(y - k)} L ${fmt(x + k * 0.9)} ${fmt(y - k * 0.5)} L ${fmt(x - k * 0.5)} ${fmt(y)} Z`, fill: p.start }),
      ]);
    case "hazard":
      return iconNode("hazard", x, y, p, s);
    case "label":
    default:
      return el("circle", { cx: x, cy: y, r: k * 0.3, fill: p.muted });
  }
}

/** Two small arrows, up and down: stairs, ladders and lifts. */
function stairsGlyph(x: number, y: number, p: SiteMapPalette, s = 1): SvgNode {
  const k = s * 0.4;
  return el("g", { fill: p.wall }, [
    el("path", { d: `M ${fmt(x - k * 0.5)} ${fmt(y - k)} L ${fmt(x - k)} ${fmt(y)} L ${fmt(x)} ${fmt(y)} Z` }),
    el("path", { d: `M ${fmt(x + k * 0.5)} ${fmt(y + k)} L ${fmt(x)} ${fmt(y)} L ${fmt(x + k)} ${fmt(y)} Z` }),
  ]);
}

function accessGlyph(x: number, y: number, p: SiteMapPalette, sealed: boolean, hidden: boolean, scale = 1): SvgNode {
  const h = 0.36 * scale;
  return el("g", {}, [
    el("rect", { x: x - h, y: y - h, width: 2 * h, height: 2 * h, fill: p.floor, stroke: p.duct, "stroke-width": 0.12, "stroke-dasharray": hidden ? "0.15 0.1" : undefined }),
    sealed && el("path", { d: `M ${fmt(x - h)} ${fmt(y - h)} L ${fmt(x + h)} ${fmt(y + h)} M ${fmt(x - h)} ${fmt(y + h)} L ${fmt(x + h)} ${fmt(y - h)}`, stroke: p.lock, "stroke-width": 0.14 }),
  ]);
}

// ---------------------------------------------------------------------------
// the map
// ---------------------------------------------------------------------------

export type SiteMapViewKind = "gm" | "player" | "tracking";

export interface SiteMapLiveInput {
  act?: number;
  borders?: Record<string, LiveBorderOverride>;
  zoneFlags?: Record<string, Record<string, unknown>>;
  tokens?: Array<{ id: string; label: string; zone: string; gmOnly?: boolean }>;
  pings?: Array<{ zone: string; at?: string }>;
}

export interface SiteMapDrawOptions {
  view: SiteMapViewKind;
  /** Deck to draw; the first deck by default. */
  deck?: string | undefined;
  legend?: MapLegendEntry[] | undefined;
  live?: SiteMapLiveInput | undefined;
  /** Act whose locks and act shading show (default: the live act, else 1). */
  act?: number | undefined;
  /** Fogged zones: opaque in the player view, a translucent preview in the GM view. */
  fogged?: string[] | undefined;
  selected?: string[] | undefined;
  /** Zones on a highlighted path (range check). */
  path?: string[] | undefined;
  grid?: boolean | undefined;
  palette?: "light" | "dark" | SiteMapPalette | undefined;
  /** Prefix for pattern ids (several maps on one page). */
  idPrefix?: string | undefined;
  /** Add focusable hit areas with labels (the React view). */
  interactive?: boolean | undefined;
  /** Margin around the deck, in grid units (default 1). */
  margin?: number | undefined;
  /**
   * 1 m grid squares inside playable zones (not out of bounds, not ducts),
   * light grey, beneath walls and labels: for moving miniatures within a zone.
   */
  gridSquares?: boolean | undefined;
  /** The module's passability rule: shafts it lets through one way only draw as a single down arrow. */
  passable?: MapGeneratorDef["passable"] | undefined;
}

/** A marker whose text did not fit in its zone: the map shows its glyph with a letter, the key lists the text. */
export interface SiteMapCallout {
  /** The letter drawn beside the glyph ("a", "b", ...). */
  ref: string;
  /** The marker id; for a duct sheet's exit or shaft badge, `exit:<zone>` or `shaft:<border>`. */
  marker: string;
  zone: string;
  /** Zone number (GM and tracking views). */
  number?: number | undefined;
  label: string;
}

export interface SiteMapDrawing {
  /** Group of everything, in grid units, translated by the margin. */
  node: SvgNode;
  /** Total size in grid units, margins included. */
  width: number;
  height: number;
  deck: string | undefined;
  /** Marker texts moved off the map, in drawing order. */
  callouts: SiteMapCallout[];
  /** Every label and glyph box the placer handled, in deck units (for tests and the zone key). */
  labels: PlacedLabel[];
}

const WALL = 0.22;

/** The palette for a palette option ("light" by default). */
export function resolvePalette(p: SiteMapDrawOptions["palette"]): SiteMapPalette {
  if (!p || p === "light") return LIGHT_PALETTE;
  if (p === "dark") return DARK_PALETTE;
  return p;
}

const ROMAN = ["", "I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X"];

function zoneTitle(z: MapZoneData, n: number | undefined): string {
  const name = z.name ?? (z.layer === "duct" ? "Duct" : z.kind === "out-of-bounds" ? "Out of bounds" : z.kind.replace(/-/g, " "));
  return n !== undefined ? `Zone ${n} ${name}` : name;
}

/** The accessible label of a zone in a view (also used by the React view and tests). */
export function zoneLabel(z: MapZoneData, opts: { number?: number | undefined; fogged?: boolean; flags?: string[] }): string {
  if (opts.fogged) return opts.number !== undefined ? `Zone ${opts.number}, unexplored` : "Unexplored zone";
  const parts = [zoneTitle(z, opts.number)];
  if (z.kind !== "out-of-bounds") parts.push(z.layer === "duct" ? "duct" : z.cluttered ? "cluttered" : "open");
  if (z.kind === "out-of-bounds") parts.push("out of bounds");
  if (opts.flags?.length) parts.push(opts.flags.join(", ").toLowerCase());
  return parts.join(", ");
}

/** Draw one deck of a layout. */
export function drawSiteMap(layout: SiteLayout, opts: SiteMapDrawOptions): SiteMapDrawing {
  const p = resolvePalette(opts.palette);
  const id = (s: string) => `${opts.idPrefix ?? "sm"}-${s}`;
  const deck = layout.decks.find((d) => d.id === opts.deck) ?? layout.decks[0];
  const margin = opts.margin ?? 1;
  const width = (deck?.width ?? 0) + margin * 2;
  const height = (deck?.height ?? 0) + margin * 2;
  const view = opts.view;
  const gm = view === "gm";
  const tracking = view === "tracking";
  const act = opts.act ?? opts.live?.act ?? 1;
  const legend = opts.legend ?? [];
  const live = opts.live ?? {};
  const fogged = new Set(opts.fogged ?? []);
  const selected = new Set(opts.selected ?? []);
  const path = new Set(opts.path ?? []);
  const numbers = view === "player" ? new Map<string, number>() : zoneNumbers(layout);

  const zones = layout.zones.filter((z) => !deck || z.deck === deck.id);
  const onDeck = new Set(zones.map((z) => z.id));
  const byId = new Map(layout.zones.map((z) => [z.id, z]));
  const decksById = new Map(layout.decks.map((d) => [d.id, d]));
  // a duct sheet: its own level of crawlspace, every zone on it drawn as a duct
  const sheet = isDuctSheet(deck);
  const onSheet = (z: MapZoneData) => isDuctSheet(decksById.get(z.deck));
  const floors = sheet ? [] : zones.filter((z) => z.layer !== "duct");
  const ducts = sheet ? zones : zones.filter((z) => z.layer === "duct");
  // borders drawn on a duct sheet use the sheet's colours
  const sp: SiteMapPalette = sheet && !tracking ? { ...p, wall: p.tubeEdge, floor: p.tube, open: p.tubeLine } : p;
  const withIds = gm || tracking;
  const links: Array<{ box: LabelBox; deck: string; zone: string; label: string }> = [];
  const deferredAccess: Array<{ b: MapBorderData; here: MapZoneData; there: MapZoneData; attrs: SvgAttrs; sealed: boolean }> = [];
  const flagEntries = legend.filter((e) => isFlagTarget(e.target) && (gm || tracking || !e.gmOnly));
  const hasDarkEntry = flagEntries.some((e) => flagIcon(e) === "dark");

  const flagsOf = (z: MapZoneData): Record<string, unknown> => ({ ...(z.flags ?? {}), ...(live.zoneFlags?.[z.id] ?? {}) });
  // exit labels are drawn as badges and access tags, never as icons
  const flagHits = (z: MapZoneData) => matchingFlagEntries(flagEntries, flagsOf(z)).filter((e) => !isFlagTarget(e.target) || !LINK_FLAGS.has(e.target.flag));
  const isDark = (z: MapZoneData) => {
    const f = flagsOf(z);
    if (hasDarkEntry) return flagHits(z).some((e) => flagIcon(e) === "dark");
    return f.dark === true;
  };

  const defs = el("defs", {}, [
    el("pattern", { id: id("grid"), width: 1, height: 1, patternUnits: "userSpaceOnUse" }, [el("path", { d: "M 1 0 L 0 0 0 1", fill: "none", stroke: p.grid, "stroke-width": 0.04 })]),
    el("pattern", { id: id("oob"), width: 0.8, height: 0.8, patternUnits: "userSpaceOnUse", patternTransform: "rotate(45)" }, [
      el("rect", { width: 0.8, height: 0.8, fill: p.background }),
      el("path", { d: "M 0 0 L 0 0.8 M 0 0 L 0.8 0", stroke: p.outOfBounds, "stroke-width": 0.08 }),
    ]),
    el("pattern", { id: id("ground"), width: 1.2, height: 1.2, patternUnits: "userSpaceOnUse", patternTransform: "rotate(20)" }, [
      el("circle", { cx: 0.3, cy: 0.3, r: 0.07, fill: p.groundLine, "fill-opacity": 0.55 }),
      el("circle", { cx: 0.9, cy: 0.85, r: 0.05, fill: p.groundLine, "fill-opacity": 0.45 }),
    ]),
    el("pattern", { id: id("fog"), width: 0.6, height: 0.6, patternUnits: "userSpaceOnUse", patternTransform: "rotate(-30)" }, [
      el("rect", { width: 0.6, height: 0.6, fill: p.fog }),
      el("path", { d: "M 0 0.3 L 0.6 0.3", stroke: p.fogLine, "stroke-width": 0.08 }),
    ]),
    el("pattern", { id: id("act"), width: 0.7, height: 0.7, patternUnits: "userSpaceOnUse", patternTransform: "rotate(45)" }, [el("path", { d: "M 0 0 L 0 0.7", stroke: p.act, "stroke-width": 0.12, "stroke-opacity": 0.5 })]),
    sheet ? el("pattern", { id: id("dgrid"), width: 1, height: 1, patternUnits: "userSpaceOnUse" }, [el("path", { d: "M 1 0 L 0 0 0 1", fill: "none", stroke: p.ductGrid, "stroke-width": 0.05 })]) : null,
  ]);

  const layers: SvgNode[] = [];
  layers.push(el("rect", { x: -margin, y: -margin, width, height, fill: tracking ? "#ffffff" : sheet ? p.ductSheet : p.background, "data-sheet": sheet ? "duct" : undefined }));
  // a duct sheet always shows its grid: the sheet's own background
  if (sheet && !tracking && deck) layers.push(el("rect", { x: -margin, y: -margin, width, height, fill: `url(#${id("dgrid")})`, "data-layer": "duct-grid" }));
  else if (opts.grid && deck) layers.push(el("rect", { x: 0, y: 0, width: deck.width, height: deck.height, fill: `url(#${id("grid")})`, "data-layer": "grid" }));
  // the players' duct sheet is fog wherever they have not crawled: the projection leaves those zones out
  if (sheet && view === "player" && deck) layers.push(el("rect", { x: 0, y: 0, width: deck.width, height: deck.height, fill: `url(#${id("fog")})`, "fill-opacity": 0.85, "data-sheet-fog": deck.id }));

  // 1. floor zones: base, area tint, out-of-bounds hatch, dark overlay
  const fills: SvgNode[] = [];
  for (const z of floors) {
    const pts = points(z.poly);
    if (z.kind === "out-of-bounds") {
      fills.push(el("polygon", { points: pts, fill: `url(#${id("oob")})`, stroke: p.outOfBounds, "stroke-width": 0.08, "data-oob": z.id }));
      continue;
    }
    if (z.kind === "exterior") {
      // open ground outside: a pale fill with a stipple, no area tint
      fills.push(el("polygon", { points: pts, fill: tracking ? "#ffffff" : p.ground, "data-exterior": z.id }));
      if (!tracking) fills.push(el("polygon", { points: pts, fill: `url(#${id("ground")})` }));
    } else fills.push(el("polygon", { points: pts, fill: tracking ? "#ffffff" : p.floor }));
    if (!tracking && z.area && z.kind !== "exterior") fills.push(el("polygon", { points: pts, fill: areaColor(z.area, legend), "fill-opacity": p.tintOpacity, "data-area": z.area }));
    if (!tracking && isDark(z)) fills.push(el("polygon", { points: pts, fill: p.darkOverlay, "fill-opacity": p.darkOpacity, "data-dark": z.id }));
    if (gm && z.acts?.includes(act)) fills.push(el("polygon", { points: pts, fill: `url(#${id("act")})`, "data-act-shade": z.id }));
  }
  layers.push(el("g", { "data-layer": "floors" }, fills));

  // 1b. 1 m grid squares inside playable zones, beneath walls and labels
  if (opts.gridSquares) layers.push(gridSquaresLayer(floors, layout.gridM && layout.gridM > 0 ? 1 / layout.gridM : 1, id));

  // 2. walls: every floor zone outline at wall weight (borders redraw shared edges)
  // (outside ground has no wall of its own: a thin dashed edge; the buildings' walls are its borders)
  const outlines: SvgNode[] = floors
    .filter((z) => z.kind !== "out-of-bounds")
    .map((z) =>
      z.kind === "exterior"
        ? el("polygon", { points: points(z.poly), fill: "none", stroke: tracking ? p.open : p.groundLine, "stroke-width": 0.08, "stroke-dasharray": "0.5 0.35" })
        : el("polygon", { points: points(z.poly), fill: "none", stroke: p.wall, "stroke-width": tracking ? 0.12 : WALL, "stroke-linejoin": "miter" }),
    );
  layers.push(el("g", { "data-layer": "outlines" }, outlines));

  // Label placement: everything already drawn blocks later labels.
  const placer = new LabelPlacer(0.06);
  const deckBox: LabelBox = { x0: 0, y0: 0, x1: deck?.width ?? 0, y1: deck?.height ?? 0 };
  /** Where labels may go in a zone: inside its outline, clear of the walls. */
  const inZone = (z: MapZoneData, inset = 0.24) => (b: LabelBox) => boxInPolygon(b, z.poly, inset) && boxInside(b, deckBox);

  // 3. borders
  const borders: SvgNode[] = [];
  const glyphs: SvgNode[] = [];
  for (const b of layout.borders) {
    const aOn = onDeck.has(b.a);
    const bOn = onDeck.has(b.b);
    if (!aOn && !bOn) continue;
    const override = live.borders?.[b.id];
    const eff = effectiveBorder(b, act, override);
    const locked = lockedInAct(eff, act);
    const sealed = !!eff.sealed;
    const attrs = { "data-border": b.id, "data-kind": eff.kind, "data-locked": locked ? "true" : undefined, "data-sealed": sealed ? "true" : undefined };
    if (b.segment && aOn && bOn) {
      // on a duct sheet open joints need no mark: the tubes run into each other
      if (sheet && eff.kind === "open" && !sealed) continue;
      if (tracking) {
        if (eff.kind === "open") borders.push(el("g", attrs, borderOpen(b.segment, p, true)));
        continue;
      }
      borders.push(el("g", attrs, drawBorder(eff, b.segment, sp, { locked, sealed, hidden: !!b.hidden && gm })));
      // marks that reach into the zones: lock dots, hatch wheels, seals, glyphs on the wall
      const g = seg(b.segment);
      if (locked && (eff.kind === "door" || eff.kind === "hatch" || eff.kind === "blast")) placer.block(boxAround(g.mx + g.nx * 0.42, g.my + g.ny * 0.42, 0.22), "lock", undefined, b.id);
      if (eff.kind === "hatch" || eff.kind === "access" || eff.kind === "stairs") placer.block(boxAround(g.mx, g.my, 0.44), "glyph", undefined, b.id);
      if (sealed) placer.block(boxAround(g.mx, g.my, 0.32), "glyph", undefined, b.id);
      continue;
    }
    // shafts are drawn as badges on their zones (below)
    if (eff.kind === "shaft") continue;
    if (tracking && eff.kind !== "access") continue;
    // vertical links: access points and stairs
    const za = byId.get(b.a);
    const zb = byId.get(b.b);
    if (!za || !zb) continue;
    // joints between two zones of a duct sheet without a drawn segment: a mark where the tubes meet
    if (sheet && aOn && bOn && eff.kind !== "access" && eff.kind !== "stairs") {
      if (eff.kind === "open" && !sealed) continue;
      const s2 = contactSegment(za.poly, zb.poly);
      if (!s2) continue;
      const g = seg(s2);
      borders.push(el("g", attrs, drawBorder(eff, s2, sp, { locked, sealed, hidden: !!b.hidden && gm })));
      placer.block(boxAround(g.mx, g.my, 0.42), "glyph", undefined, b.id);
      continue;
    }
    // other links without a drawn segment (duct to duct) need no glyph: the outlines show them
    if (eff.kind !== "access" && eff.kind !== "stairs") continue;
    if (eff.kind === "access" && za.deck !== zb.deck) {
      // an access point between a floor deck and a duct sheet: on the floor, a square in the
      // room with the duct zone it leads to; on the duct sheet, the zone's exit badge (below)
      const here = aOn ? za : zb;
      const there = aOn ? zb : za;
      if (sheet || onSheet(here)) continue;
      // placed after the zone's own labels (below), in whatever room they leave
      deferredAccess.push({ b, here, there, attrs, sealed });
      continue;
    }
    if (eff.kind === "access") {
      const pos = overlapCenter(bbox(za.poly), bbox(zb.poly)) ?? (aOn && bOn ? mid(center(za.poly), center(zb.poly)) : center((aOn ? za : zb).poly));
      placer.block(boxAround(pos[0], pos[1], 0.42), "glyph", undefined, b.id);
      glyphs.push(el("g", { ...attrs, "data-glyph": "access" }, [accessGlyph(pos[0], pos[1], p, sealed, !!b.hidden && gm), el("title", {}, [`Access point${sealed ? " (sealed)" : ""}`])]));
    } else {
      for (const [z, other] of [
        [za, zb],
        [zb, za],
      ] as const) {
        if (!onDeck.has(z.id)) continue;
        const bx = bbox(z.poly);
        const x = bx.x1 - 0.9;
        const y = bx.y1 - 0.9;
        const otherDeck = layout.decks.find((d) => d.id === other.deck);
        const toName = otherDeck && other.deck !== z.deck ? otherDeck.name : undefined;
        // the deck name under the glyph stays inside the zone
        const room = Math.max(0, Math.min(x - bx.x0, bx.x1 - x) * 2 - 0.3);
        const nameSize = toName ? Math.max(0.3, Math.min(0.4, (room / Math.max(1, textWidth(toName, 1))) * 0.98)) : 0.4;
        const shown = toName ? ellipsize(toName, nameSize, room) : "";
        placer.block(boxAround(x, y, 0.42), "glyph", z.id, b.id);
        if (shown) placer.block({ x0: x - textWidth(shown, nameSize) / 2, y0: y + 0.85 - nameSize * 0.8, x1: x + textWidth(shown, nameSize) / 2, y1: y + 0.85 + nameSize * 0.25 }, "glyph", z.id, b.id);
        glyphs.push(
          el("g", { ...attrs, "data-glyph": "stairs" }, [
            stairsGlyph(x, y, p),
            shown ? el("text", { x, y: y + 0.85, "text-anchor": "middle", "font-size": nameSize, "font-family": MAP_FONT, fill: p.muted }, [shown]) : null,
            el("title", {}, [toName ? `Stairs to ${toName}` : "Stairs"]),
          ]),
        );
      }
    }
  }
  // on a duct sheet the joints are drawn over the tubes
  if (!sheet) layers.push(el("g", { "data-layer": "borders" }, borders));

  // 4. ducts: dashed outlines over the rooms; on a duct sheet, tubes with rounded joins,
  // junction nodes and vent chambers
  if (sheet) layers.push(drawTubes(layout, ducts, p, tracking));
  else
    layers.push(
      el(
        "g",
        { "data-layer": "ducts" },
        ducts.map((z) => el("polygon", { points: points(z.poly), fill: p.duct, "fill-opacity": 0.08, stroke: p.duct, "stroke-width": 0.12, "stroke-dasharray": "0.45 0.3", "data-duct": z.id })),
      ),
    );
  if (sheet) layers.push(el("g", { "data-layer": "borders" }, borders));
  layers.push(el("g", { "data-layer": "links" }, glyphs));

  // 5. zone contents: numbers, names, flag icons, duct numbers, markers, act numerals, clutter.
  // Fixed marks first, then each kind of label in turn, each placed clear of everything before it.
  const shownZones = zones.filter((z) => !(fogged.has(z.id) && view === "player"));
  const content = new Map<string, SvgNode[]>();
  const add = (zone: string, n: SvgNode) => content.set(zone, [...(content.get(zone) ?? []), n]);
  const callouts: SiteMapCallout[] = [];
  const labelText = (m: MapMarker) => (m.kind === "label" || !m.act || /\bact\b/i.test(m.label) ? m.label : `${m.label} (act ${m.act})`);
  const markersOf = (z: MapZoneData) => (tracking ? [] : layout.markers.filter((m) => m.zone === z.id && (gm || !m.gmOnly)));
  const playable = (z: MapZoneData) => z.layer !== "duct" && z.kind !== "out-of-bounds" && !sheet;

  // 4b. duct sheets: exit badges (the room a vent opens into) and shaft badges (the sheet and
  // zone at the other end of a climb or drop), placed before the other labels so they always
  // get a spot: beside their zone, clear of the other tubes where possible
  const badgeNodes: SvgNode[] = [];
  const tubeBoxes = sheet ? ducts.map((z) => ({ id: z.id, box: bbox(z.poly) })) : [];
  const inDeck = (b: LabelBox) => boxInside(b, insetBox(deckBox, 0.05));
  const nearZone = (z: MapZoneData, relax: boolean) => (b: LabelBox) => inDeck(b) && (relax || tubeBoxes.every((t) => t.id === z.id || !boxesOverlap(b, insetBox(t.box, 0.04))));
  const placeNear = (z: MapZoneData, w: number, h: number, kind: string, ref: string | undefined, insideFirst: boolean, relax: boolean, force = false) => {
    const bx = bbox(z.poly);
    const inside = scanPositions(insetBox(bx, 0.08), w, h, "center");
    const around = aroundPositions(bx, w, h);
    return placer.place({ w, h, candidates: insideFirst ? [...inside, ...around] : [...around, ...inside], inside: nearZone(z, relax), kind, zone: z.id, ref, force });
  };
  const badge = (z: MapZoneData, full: string, shownText: string, glyph: BadgeGlyph, kind: "exit" | "shaft", ref: string, insideFirst: boolean, link: { deck: string; zone: string } | undefined) => {
    const fit = (text: string, force: boolean) => {
      for (const relax of [false, true]) {
        for (const size of [0.42, 0.36, 0.3]) {
          const h = size * 1.55;
          const w = h + 0.06 + textWidth(text, size) + 0.18;
          const last = force && relax && size === 0.3;
          const box = placeNear(z, w, h, kind, ref, insideFirst, relax, last);
          if (box) return { box, size, text };
        }
      }
      return undefined;
    };
    let placed = fit(shownText, false);
    if (!placed) {
      // no room for the words: a letter on the map, the words in the key
      const letter = calloutRef(callouts.length);
      placed = fit(letter, true);
      if (!placed) return;
      callouts.push({ ref: letter, marker: ref, zone: z.id, number: numbers.get(z.id), label: shownText });
    }
    badgeNodes.push(el("g", { "data-badge": kind, "data-badge-zone": z.id, "data-badge-glyph": glyph, "data-ref": ref }, [...badgeNode(placed.box, placed.text, placed.size, glyph, p), el("title", {}, [full])]));
    if (gm && link) links.push({ box: placed.box, deck: link.deck, zone: link.zone, label: `Go to ${full}` });
  };
  if (sheet) {
    for (const z of shownZones) {
      const exit = exitToOf(z);
      if (!exit) continue;
      const target = byId.get(exit.zone);
      const text = exitLabel(exit, withIds);
      badge(z, text, text, "exit", "exit", `exit:${z.id}`, false, target ? { deck: target.deck, zone: target.id } : undefined);
    }
  }
  for (const z of shownZones) {
    for (const l of shaftLinks(layout, z.id, { act, live: { borders: live.borders ?? {} }, passable: opts.passable })) {
      if (!byId.has(l.other)) continue;
      const glyph: BadgeGlyph = isOneWay(l) ? "drop" : l.direction === "up" ? "up" : l.direction === "down" ? "down" : "both";
      const where = [l.otherDeck?.name, withIds ? l.other : undefined].filter(Boolean).join(", ") || l.other;
      badge(z, shaftLabel(l, withIds), where, glyph, "shaft", `shaft:${l.border.id}`, false, l.otherDeck ? { deck: l.otherDeck.id, zone: l.other } : undefined);
    }
  }

  // 5a. zone numbers (fixed positions)
  for (const z of shownZones) {
    const n = numbers.get(z.id);
    if (n === undefined) continue;
    const bx = bbox(z.poly);
    const [cx, cy] = center(z.poly);
    const w = bx.x1 - bx.x0;
    const h = bx.y1 - bx.y0;
    const duct = sheet || z.layer === "duct";
    if (tracking) {
      // room numbers large and centred; duct numbers are placed later, clear of them
      if (duct) continue;
      // as large as the room allows; smaller when a glyph leaves no clear spot
      const r0 = Math.min(1.1, Math.max(0.6, Math.min(w, h) / 3));
      let r = r0;
      let box: PlacedLabel | undefined;
      for (const rr of [r0, r0 * 0.8, 0.5]) {
        r = rr;
        box = placer.place({ w: 2 * r, h: 2 * r, candidates: [[cx - r, cy - r], ...scanPositions(insetBox(bx, 0.15), 2 * r, 2 * r, "center")], inside: inZone(z, 0.12), kind: "number", zone: z.id, force: rr === 0.5 });
        if (box) break;
      }
      box ??= placer.block(boxAround(cx, cy, r), "number", z.id);
      const x = box.x0 + r;
      const y = box.y0 + r;
      add(z.id, el("g", { "data-number": z.id }, [el("circle", { cx: x, cy: y, r, fill: "#ffffff", stroke: p.wall, "stroke-width": 0.1 }), el("text", { x, y: y + r * 0.4, "text-anchor": "middle", "font-size": r * 1.15, "font-family": MAP_FONT, "font-weight": 700, fill: p.text }, [String(n)])]));
    } else if (gm && !duct) {
      // top left in rooms, centred in corridors; moved along when a wall glyph is in the way
      const small = w < 2.4 || h < 2.4;
      const r = 0.5;
      const cands: Array<[number, number]> = small ? [[cx - r, cy - r], ...scanPositions(insetBox(bx, 0.2), 2 * r, 2 * r, "center")] : scanPositions(insetBox(bx, 0.25), 2 * r, 2 * r, "top-left");
      const box = placer.place({ w: 2 * r, h: 2 * r, candidates: cands, inside: inZone(z, 0.2), kind: "number", zone: z.id, force: true }) ?? placer.block(boxAround(cx, cy, r), "number", z.id);
      add(z.id, numberNode(z.id, String(n), box.x0 + r, box.y0 + r, r, p.wall, p.text, p));
    }
  }

  // 5b. key room names: centred, shrunk or wrapped to fit, clear of the number
  if (!tracking) {
    for (const z of shownZones) {
      if (!z.key || !z.name || z.layer === "duct" || sheet) continue;
      const bx = bbox(z.poly);
      const w = bx.x1 - bx.x0;
      const region = insetBox(bx, 0.2);
      const start = Math.max(0.45, Math.min(0.85, (w / Math.max(4, z.name.length)) * 1.6));
      let done = false;
      let fallback: { lines: string[]; size: number } | undefined;
      for (let size = start; size >= 0.34 - 1e-9 && !done; size -= 0.05) {
        for (const lines of nameVariants(z.name, size, region.x1 - region.x0)) {
          const tw = Math.max(...lines.map((l) => textWidth(l, size, true)));
          const th = size * (0.95 + (lines.length - 1) * 1.1);
          if (tw > region.x1 - region.x0 || th > region.y1 - region.y0) continue;
          fallback ??= { lines, size };
          const box = placer.place({ w: tw + 0.1, h: th + 0.1, candidates: scanPositions(region, tw + 0.1, th + 0.1, "center"), inside: inZone(z, 0.2), kind: "name", zone: z.id });
          if (!box) continue;
          add(z.id, nameNode(z.id, lines, size, (box.x0 + box.x1) / 2, box.y0 + 0.05 + size * 0.75, p));
          done = true;
          break;
        }
      }
      if (!done) {
        // nowhere clear: the smallest single line, ellipsized, at the centre
        const size = fallback?.size ?? 0.34;
        const lines = fallback?.lines ?? [ellipsize(z.name, size, Math.max(0, w - 0.4), true)];
        const tw = Math.max(...lines.map((l) => textWidth(l, size, true)));
        const th = size * (0.95 + (lines.length - 1) * 1.1);
        const [cx, cy] = center(z.poly);
        const b = placer.block({ x0: cx - tw / 2 - 0.05, y0: cy - th / 2 - 0.05, x1: cx + tw / 2 + 0.05, y1: cy + th / 2 + 0.05 }, "name", z.id);
        b.forced = true;
        if (lines[0]) add(z.id, nameNode(z.id, lines, size, cx, b.y0 + 0.05 + size * 0.75, p));
      }
    }
  }

  // 5c. hazard and condition icons: top right first
  if (!tracking) {
    for (const z of shownZones) {
      if (!playable(z)) continue;
      const bx = bbox(z.poly);
      for (const e of flagHits(z)) {
        const s = 0.9;
        const box = placer.place({ w: s, h: s, candidates: scanPositions(insetBox(bx, 0.2), s, s, "top-right"), inside: inZone(z, 0.2), kind: "flag", zone: z.id, ref: isFlagTarget(e.target) ? e.target.flag : "", force: true });
        if (!box) continue;
        add(z.id, el("g", { "data-flag-icon": isFlagTarget(e.target) ? e.target.flag : "" }, [iconNode(flagIcon(e), (box.x0 + box.x1) / 2, (box.y0 + box.y1) / 2, p, s, e.color && !e.color.startsWith("var(") ? e.color : undefined), el("title", {}, [e.label])]));
      }
    }
  }

  // 5d. markers: glyph and text from the bottom left; text that fits nowhere becomes a lettered callout
  for (const z of shownZones) {
    const bx = bbox(z.poly);
    const region = insetBox(bx, 0.24);
    for (const m of markersOf(z)) {
      const label = labelText(m);
      const withText = gm || m.kind === "label";
      const glyph = m.kind !== "label";
      const G = 0.42;
      let drawn: SvgNode[] | undefined;
      if (withText) {
        for (const size of [0.45, 0.4, 0.35]) {
          const tw = textWidth(label, size);
          const w = glyph ? 2 * G + 0.13 + tw + 0.05 : tw + 0.1;
          const h = glyph ? 2 * G : size * 1.25;
          const box = placer.place({ w, h, candidates: scanPositions(region, w, h, "bottom-left"), inside: inZone(z), kind: "marker", zone: z.id, ref: m.id });
          if (!box) continue;
          const cx = box.x0 + G;
          const cy = box.y0 + h / 2;
          drawn = [
            glyph ? markerGlyph(m.kind, cx, cy, p) : null,
            el("text", { x: glyph ? cx + G + 0.13 : box.x0 + 0.05, y: cy + size * 0.36, "font-size": size, "font-family": MAP_FONT, fill: p.text, stroke: p.halo, "stroke-width": 0.08, "paint-order": "stroke" }, [label]),
          ].filter((x): x is SvgNode => !!x);
          break;
        }
      }
      if (!drawn) {
        const ref = withText ? calloutRef(callouts.length) : "";
        const tagSize = 0.52;
        const tw = ref ? textWidth(ref, tagSize, true) + 0.08 : 0;
        const th = tagSize * 0.95;
        const kind = ref ? "callout" : "marker";
        // glyph and letter side by side; else the glyph alone (close to the walls, then anywhere in
        // the zone, then over other marks) with the letter on whichever side is clear
        let tag: LabelBox | undefined;
        let glyphScale = 1;
        let box: PlacedLabel | undefined = placer.place({ w: 2 * G + tw, h: 2 * G, candidates: scanPositions(region, 2 * G + tw, 2 * G, "bottom-left"), inside: inZone(z), kind, zone: z.id, ref: m.id });
        if (box) tag = { x0: box.x0 + 2 * G, y0: box.y0 + G - th / 2, x1: box.x1, y1: box.y0 + G + th / 2 };
        else {
          // full size, then three-quarter size, then over other marks
          for (const gs of [1, 0.75]) {
            const g2 = 2 * G * gs;
            box =
              placer.place({ w: g2, h: g2, candidates: scanPositions(insetBox(bx, 0.12), g2, g2, "bottom-left"), inside: inZone(z, 0.12), kind: "marker", zone: z.id, ref: m.id }) ??
              placer.place({ w: g2, h: g2, candidates: scanPositions(bx, g2, g2, "bottom-left"), inside: inZone(z, 0), kind: "marker", zone: z.id, ref: m.id });
            if (box) {
              glyphScale = gs;
              break;
            }
          }
          // on a duct sheet a tube can be too narrow or too full: the glyph sits just beside it
          if (!box && sheet) box = placeNear(z, 2 * G, 2 * G, "duct-marker", m.id, false, false) ?? placeNear(z, 2 * G, 2 * G, "duct-marker", m.id, false, true);
          box ??=
            placer.place({ w: 2 * G, h: 2 * G, candidates: scanPositions(bx, 2 * G, 2 * G, "bottom-left"), inside: inZone(z, 0), kind: "marker", zone: z.id, ref: m.id, force: true }) ??
            Object.assign(placer.block(boxAround(center(z.poly)[0], center(z.poly)[1], G), "marker", z.id, m.id), { forced: true });
          if (ref) {
            const gx = (box.x0 + box.x1) / 2;
            const gy = (box.y0 + box.y1) / 2;
            // clear of the glyph's own box by the placer's padding
            const o = placer.pad + 0.01;
            const sides: Array<[number, number]> = [
              [box.x1 + o, gy - th / 2],
              [box.x0 - tw - o, gy - th / 2],
              [box.x1 + o, box.y0 - th - o + 0.2],
              [box.x1 + o, box.y1 + o - 0.2],
              [gx - tw / 2, box.y0 - th - o],
              [gx - tw / 2, box.y1 + o],
              [box.x0 - tw - o, box.y0 - th - o + 0.2],
              [box.x0 - tw - o, box.y1 + o - 0.2],
            ];
            tag = placer.place({ w: tw, h: th, candidates: sides, inside: (b) => boxInside(b, deckBox), kind: "callout", zone: z.id, ref: m.id, force: true });
          }
        }
        const cx = box.x0 + G * glyphScale;
        const cy = box.y0 + G * glyphScale;
        if (ref) callouts.push({ ref, marker: m.id, zone: z.id, number: numbers.get(z.id), label });
        drawn = [
          markerGlyph(m.kind, cx, cy, p, glyphScale),
          ref && tag
            ? el("text", { x: tag.x0 + 0.04, y: (tag.y0 + tag.y1) / 2 + tagSize * 0.36, "font-size": tagSize, "font-family": MAP_FONT, "font-weight": 700, fill: p.text, stroke: p.halo, "stroke-width": 0.1, "paint-order": "stroke", "data-callout": ref }, [ref])
            : null,
        ].filter((x): x is SvgNode => !!x);
      }
      add(z.id, el("g", { "data-marker": m.id, "data-marker-kind": m.kind }, [...drawn, el("title", {}, [label])]));
    }
  }

  // 5d'. hazard icons on a duct sheet (after the markers, which must sit in the tube): beside the tube, else in it
  if (!tracking && sheet) {
    // a condition on most of the sheet (ducts are dark, single file) is the sheet's norm, left to the legend
    const counts = new Map<MapLegendEntry, number>();
    for (const z of zones) for (const e of flagHits(z)) counts.set(e, (counts.get(e) ?? 0) + 1);
    const norm = (e: MapLegendEntry) => zones.length >= 4 && (counts.get(e) ?? 0) > zones.length / 2;
    for (const z of shownZones) {
      for (const e of flagHits(z)) {
        if (norm(e)) continue;
        const s = 0.75;
        const ref = isFlagTarget(e.target) ? e.target.flag : "";
        const box = placeNear(z, s, s, "duct-flag", ref, false, false) ?? placeNear(z, s, s, "duct-flag", ref, false, true, true);
        if (!box) continue;
        add(z.id, el("g", { "data-flag-icon": ref }, [el("circle", { cx: (box.x0 + box.x1) / 2, cy: (box.y0 + box.y1) / 2, r: s * 0.55, fill: p.halo, stroke: p.tubeEdge, "stroke-width": 0.04 }), iconNode(flagIcon(e), (box.x0 + box.x1) / 2, (box.y0 + box.y1) / 2, p, s * 0.95, e.color && !e.color.startsWith("var(") ? e.color : undefined), el("title", {}, [e.label])]));
      }
    }
  }

  // 5e. duct sheet zone ids ("D07", the name exits and shafts use), in or beside the tube
  if (withIds && sheet) {
    for (const z of shownZones) {
      if (z.kind === "out-of-bounds") continue;
      const size = tracking ? 0.5 : 0.38;
      const w = textWidth(z.id, size, true) + 0.24;
      const h = size * 1.3;
      const box = placeNear(z, w, h, "duct-number", undefined, true, false) ?? placeNear(z, w, h, "duct-number", undefined, true, true, true);
      if (!box) continue;
      add(
        z.id,
        el("g", { "data-number": z.id, "data-duct-id": z.id }, [
          el("path", { d: roundRectPath(box.x0, box.y0, box.x1, box.y1, h * 0.45), fill: tracking ? "#ffffff" : p.tubeEdge, stroke: tracking ? p.wall : p.tubeLine, "stroke-width": 0.05 }),
          el("text", { x: (box.x0 + box.x1) / 2, y: (box.y0 + box.y1) / 2 + size * 0.36, "text-anchor": "middle", "font-size": size, "font-family": MAP_FONT, "font-weight": 700, fill: tracking ? p.text : p.ductInk }, [z.id]),
        ]),
      );
    }
  }
  // 5e. duct numbers: on a corner of the duct, clear of the room's marks
  if ((gm || tracking) && !sheet) {
    for (const z of shownZones) {
      const n = numbers.get(z.id);
      if (n === undefined || z.layer !== "duct") continue;
      // on the duct, then just beside it, then a size smaller
      const sizes = tracking ? [0.6, 0.48, 0.4, 0.34] : [0.42, 0.36, 0.3];
      let r = sizes[0]!;
      let box: PlacedLabel | undefined;
      for (const [i, rr] of sizes.entries()) {
        r = rr;
        const cands = ductNumberCenters(bbox(z.poly), r).map(([x, y]) => [x - r, y - r] as [number, number]);
        box = placer.place({ w: 2 * r, h: 2 * r, candidates: cands, inside: (b) => boxInside(b, insetBox(deckBox, 0.05)), kind: "duct-number", zone: z.id, force: i === sizes.length - 1 });
        if (box) break;
      }
      if (box) add(z.id, numberNode(z.id, String(n), box.x0 + r, box.y0 + r, r, p.duct, p.duct, p));
    }
  }

  // 5f. act numerals (GM) and clutter glyphs: bottom right
  if (!tracking) {
    for (const z of shownZones) {
      if (!playable(z)) continue;
      const bx = bbox(z.poly);
      const w = bx.x1 - bx.x0;
      const h = bx.y1 - bx.y0;
      if (gm && z.acts?.length) {
        const text = z.acts.map((a) => ROMAN[a] ?? String(a)).join(" ");
        const tw = textWidth(text, 0.5, true) + 0.1;
        const box = placer.place({ w: tw, h: 0.5, candidates: scanPositions(insetBox(bx, 0.24), tw, 0.5, "bottom-right"), inside: inZone(z), kind: "acts", zone: z.id, force: true });
        if (box) add(z.id, el("text", { x: box.x1 - 0.05, y: box.y1 - 0.05, "text-anchor": "end", "font-size": 0.5, "font-family": MAP_FONT, "font-weight": 700, fill: p.act, "data-acts": z.id }, [text]));
      }
      if (z.cluttered && w >= 2 && h >= 2) {
        const box = placer.place({ w: 0.66, h: 0.6, candidates: scanPositions(insetBox(bx, 0.2), 0.66, 0.6, "bottom-right"), inside: inZone(z, 0.2), kind: "clutter", zone: z.id });
        if (box) add(z.id, clutterGlyph(box.x0 + 0.36, box.y0 + 0.32, p));
      }
    }
  }

  // 5g. access squares into duct sheets, in the room they open from, with the duct zone they lead to
  for (const { b, here, there, attrs, sealed } of deferredAccess) {
    if (view === "player" && fogged.has(here.id)) continue;
    const bx = bbox(here.poly);
    let box: PlacedLabel | undefined;
    let G = 0.42;
    for (const g of [0.42, 0.32, 0.25]) {
      G = g;
      box =
        placer.place({ w: 2 * g, h: 2 * g, candidates: scanPositions(insetBox(bx, 0.3), 2 * g, 2 * g, "top-right"), inside: inZone(here, 0.25), kind: "glyph", zone: here.id, ref: b.id }) ??
        placer.place({ w: 2 * g, h: 2 * g, candidates: scanPositions(insetBox(bx, 0.06), 2 * g, 2 * g, "top-right"), inside: inZone(here, 0.04), kind: "glyph", zone: here.id, ref: b.id, force: g === 0.25 });
      if (box) break;
    }
    box ??= Object.assign(placer.block(boxAround(center(here.poly)[0], center(here.poly)[1], G), "glyph", here.id, b.id), { forced: true });
    const cx = (box.x0 + box.x1) / 2;
    const cy = (box.y0 + box.y1) / 2;
    const thereDeck = decksById.get(there.deck);
    const lead = ductToOf(here);
    const tag = withIds && lead?.zone === there.id ? lead.zone : undefined;
    let tagNode: SvgNode | null = null;
    if (tag) {
      for (const size of [0.4, 0.32]) {
        const tw = textWidth(tag, size, true) + 0.08;
        const th = size * 1.05;
        const t = placer.place({
          w: tw,
          h: th,
          candidates: [
            [box.x0 - tw - 0.06, cy - th / 2],
            [box.x1 + 0.06, cy - th / 2],
            [cx - tw / 2, box.y1 + 0.06],
            [cx - tw / 2, box.y0 - th - 0.06],
          ],
          inside: inZone(here, 0.08),
          kind: "link-label",
          zone: here.id,
          ref: b.id,
        });
        if (!t) continue;
        tagNode = el("text", { x: t.x0 + 0.04, y: t.y1 - th * 0.2, "font-size": size, "font-family": MAP_FONT, "font-weight": 700, fill: p.duct, stroke: p.halo, "stroke-width": 0.08, "paint-order": "stroke", "data-access-to": tag }, [tag]);
        break;
      }
    }
    const where = [thereDeck?.name, withIds ? there.id : undefined].filter(Boolean).join(", ");
    badgeNodes.push(el("g", { ...attrs, "data-glyph": "access", "data-link-zone": there.id }, [accessGlyph(cx, cy, p, sealed, !!b.hidden && gm, G / 0.42), tagNode, el("title", {}, [`Access point to ${where}${sealed ? " (sealed)" : ""}`])]));
    if (gm && thereDeck) links.push({ box, deck: thereDeck.id, zone: there.id, label: `Go to ${where}` });
  }

  const contents: SvgNode[] = [];
  for (const z of zones) {
    const g = content.get(z.id);
    if (g?.length) contents.push(el("g", { "data-zone-content": z.id }, g));
  }
  layers.push(el("g", { "data-layer": "contents" }, contents));
  layers.push(el("g", { "data-layer": "duct-links" }, badgeNodes));

  // 6. fog
  const fog: SvgNode[] = [];
  for (const z of zones) {
    // ducts run over and under rooms: their fog would cover revealed rooms
    if (!fogged.has(z.id) || (z.layer === "duct" && !sheet)) continue;
    if (view === "player") fog.push(el("polygon", { points: points(z.poly), fill: `url(#${id("fog")})`, stroke: p.fog, "stroke-width": 0.3, "data-fog": z.id }));
    else fog.push(el("polygon", { points: points(z.poly), fill: p.fog, "fill-opacity": 0.35, "data-fog": z.id }));
  }
  layers.push(el("g", { "data-layer": "fog" }, fog));

  // 7. live: pings and tokens
  const liveNodes: SvgNode[] = [];
  if (view !== "player") {
    for (const [i, ping] of (live.pings ?? []).entries()) {
      const z = byId.get(ping.zone);
      if (!z || !onDeck.has(z.id)) continue;
      const bx = bbox(z.poly);
      const [, cy] = center(z.poly);
      const same = (live.pings ?? []).slice(0, i).filter((x) => x.zone === ping.zone).length;
      const px = Math.max(bx.x0 + 0.9, bx.x1 - 1.0 - same * 0.6);
      const py = cy;
      liveNodes.push(
        el("g", { "data-ping": ping.zone }, [
          el("circle", { cx: px, cy: py, r: 0.25, fill: p.ping }),
          el("circle", { cx: px, cy: py, r: 0.55, fill: "none", stroke: p.ping, "stroke-width": 0.08 }),
          el("circle", { cx: px, cy: py, r: 0.85, fill: "none", stroke: p.ping, "stroke-width": 0.05, "stroke-opacity": 0.6 }),
          el("title", {}, ["Tracker ping"]),
        ]),
      );
    }
  }
  const tokensByZone = new Map<string, NonNullable<SiteMapLiveInput["tokens"]>>();
  for (const t of live.tokens ?? []) {
    if (!onDeck.has(t.zone)) continue;
    if (view === "player" && (t.gmOnly || fogged.has(t.zone))) continue;
    tokensByZone.set(t.zone, [...(tokensByZone.get(t.zone) ?? []), t]);
  }
  for (const [zoneId, ts] of tokensByZone) {
    const z = byId.get(zoneId)!;
    const [cx, cy] = center(z.poly);
    const bx = bbox(z.poly);
    const w = bx.x1 - bx.x0;
    const h = bx.y1 - bx.y0;
    const step = 1.2;
    // tall, narrow zones (ducts, shafts) stack tokens along their length, clear of the number
    const tall = h > w * 1.5;
    const anchor = tracking ? 1.9 : h >= 4 ? -1.35 : 0;
    ts.forEach((t, i) => {
      const x = tall ? cx : cx + (i - (ts.length - 1) / 2) * step;
      const y = tall ? cy + (tracking || w < 2.4 ? 1.4 : 0) + i * step : cy + anchor;
      const initials = t.label
        .split(/\s+/)
        .map((w) => w[0] ?? "")
        .join("")
        .slice(0, 2)
        .toUpperCase();
      liveNodes.push(
        el("g", { "data-token": t.id }, [
          el("circle", { cx: x, cy: y, r: 0.55, fill: t.gmOnly ? p.gmToken : p.token, stroke: p.halo, "stroke-width": 0.08, "stroke-dasharray": t.gmOnly ? "0.2 0.1" : undefined }),
          el("text", { x, y: y + 0.2, "text-anchor": "middle", "font-size": 0.52, "font-family": MAP_FONT, "font-weight": 700, fill: "#ffffff" }, [initials || "?"]),
          el("title", {}, [t.label]),
        ]),
      );
    });
  }
  layers.push(el("g", { "data-layer": "live" }, liveNodes));

  // 8. range path and selection
  const marks: SvgNode[] = [];
  for (const z of zones) {
    if (path.has(z.id) && !selected.has(z.id)) marks.push(el("polygon", { points: points(z.poly), fill: p.path, "fill-opacity": 0.18, stroke: p.path, "stroke-width": 0.12, "data-path": z.id }));
    if (selected.has(z.id)) marks.push(el("polygon", { points: points(z.poly), fill: p.select, "fill-opacity": 0.12, stroke: p.select, "stroke-width": 0.28, "data-selected": z.id }));
  }
  layers.push(el("g", { "data-layer": "marks" }, marks));

  // 9. hit areas (interactive views only): floors first, ducts on top
  if (opts.interactive) {
    const hits: SvgNode[] = [];
    for (const z of [...floors, ...ducts]) {
      const isFog = fogged.has(z.id);
      const flags = view === "player" && isFog ? [] : flagHits(z).map((e) => e.label);
      const label = zoneLabel(z, { number: numbers.get(z.id), fogged: isFog, flags });
      // the tooltip also carries the zone's marker texts (corridors show only glyphs and letters)
      const notes = isFog && view === "player" ? [] : markersOf(z).filter((m) => gm || m.kind === "label").map((m) => {
        const c = callouts.find((x) => x.marker === m.id);
        return `${c ? `${c.ref}: ` : ""}${labelText(m)}`;
      });
      hits.push(
        el("polygon", {
          points: points(z.poly),
          fill: "#000",
          "fill-opacity": 0,
          "data-zone": z.id,
          "data-hit": "zone",
          role: "button",
          tabindex: 0,
          "aria-label": label,
          "aria-pressed": selected.has(z.id) ? "true" : "false",
          class: "cf-sitemap__hit",
        }, [el("title", {}, [[label, ...notes].join("\n")])]),
      );
    }
    // links: an access square, exit badge or shaft badge takes the GM to the zone at the other end
    for (const l of links) {
      hits.push(
        el("rect", {
          x: l.box.x0,
          y: l.box.y0,
          width: l.box.x1 - l.box.x0,
          height: l.box.y1 - l.box.y0,
          fill: "#000",
          "fill-opacity": 0,
          "data-hit": "link",
          "data-link-deck": l.deck,
          "data-link-zone": l.zone,
          role: "button",
          tabindex: 0,
          "aria-label": l.label,
          class: "cf-sitemap__hit cf-sitemap__link",
        }, [el("title", {}, [l.label])]),
      );
    }
    layers.push(el("g", { "data-layer": "hits" }, hits));
  }

  const node = el("g", { transform: `translate(${margin} ${margin})`, "data-deck": deck?.id, "data-view": view }, [defs, ...layers]);
  return { node, width, height, deck: deck?.id, callouts, labels: placer.boxes };
}

export type BadgeGlyph = "exit" | "up" | "down" | "both" | "drop";

/** A rounded rectangle as a path (the PDF writer has no rounded `rect`). */
function roundRectPath(x0: number, y0: number, x1: number, y1: number, r: number): string {
  const rr = Math.max(0, Math.min(r, (x1 - x0) / 2, (y1 - y0) / 2));
  const f = fmt;
  return `M ${f(x0 + rr)} ${f(y0)} H ${f(x1 - rr)} A ${f(rr)} ${f(rr)} 0 0 1 ${f(x1)} ${f(y0 + rr)} V ${f(y1 - rr)} A ${f(rr)} ${f(rr)} 0 0 1 ${f(x1 - rr)} ${f(y1)} H ${f(x0 + rr)} A ${f(rr)} ${f(rr)} 0 0 1 ${f(x0)} ${f(y1 - rr)} V ${f(y0 + rr)} A ${f(rr)} ${f(rr)} 0 0 1 ${f(x0 + rr)} ${f(y0)} Z`;
}

/** The arrow or chevrons of an exit or shaft badge, centred on x, y, `k` half its size. */
export function badgeGlyph(glyph: BadgeGlyph, x: number, y: number, k: number, p: SiteMapPalette): SvgNode {
  const line = { fill: "none", stroke: p.badgeInk, "stroke-width": k * 0.32, "stroke-linecap": "round", "stroke-linejoin": "round" } as const;
  const chevron = (cy: number, dir: 1 | -1, s = 1) => el("path", { ...line, d: `M ${fmt(x - k * s)} ${fmt(cy + dir * k * 0.45 * s)} L ${fmt(x)} ${fmt(cy - dir * k * 0.45 * s)} L ${fmt(x + k * s)} ${fmt(cy + dir * k * 0.45 * s)}` });
  switch (glyph) {
    case "exit":
      return el("g", { "data-glyph": "exit-arrow" }, [
        el("path", { ...line, stroke: p.start, d: `M ${fmt(x - k * 0.9)} ${fmt(y)} L ${fmt(x + k * 0.3)} ${fmt(y)}` }),
        el("path", { d: `M ${fmt(x + k * 0.95)} ${fmt(y)} L ${fmt(x + k * 0.15)} ${fmt(y - k * 0.6)} L ${fmt(x + k * 0.15)} ${fmt(y + k * 0.6)} Z`, fill: p.start }),
      ]);
    case "up":
      return el("g", { "data-glyph": "chevron-up" }, [chevron(y, 1)]);
    case "down":
      return el("g", { "data-glyph": "chevron-down" }, [chevron(y, -1)]);
    case "both":
      return el("g", { "data-glyph": "chevron-both" }, [chevron(y - k * 0.42, 1, 0.75), chevron(y + k * 0.42, -1, 0.75)]);
    case "drop":
      return el("g", { "data-glyph": "drop-arrow" }, [
        el("path", { ...line, stroke: p.lock, d: `M ${fmt(x)} ${fmt(y - k * 0.95)} L ${fmt(x)} ${fmt(y + k * 0.2)}` }),
        el("path", { d: `M ${fmt(x - k * 0.62)} ${fmt(y + k * 0.05)} L ${fmt(x)} ${fmt(y + k * 0.98)} L ${fmt(x + k * 0.62)} ${fmt(y + k * 0.05)} Z`, fill: p.lock }),
      ]);
  }
}

/** An exit or shaft badge: a rounded plate, the glyph on the left, the text after it. */
function badgeNode(b: LabelBox, text: string, size: number, glyph: BadgeGlyph, p: SiteMapPalette): SvgNode[] {
  const h = b.y1 - b.y0;
  const cy = (b.y0 + b.y1) / 2;
  return [
    el("path", { d: roundRectPath(b.x0, b.y0, b.x1, b.y1, h * 0.3), fill: p.badge, stroke: p.badgeEdge, "stroke-width": 0.05 }),
    badgeGlyph(glyph, b.x0 + h / 2, cy, h * 0.3, p),
    el("text", { x: b.x0 + h + 0.03, y: cy + size * 0.36, "font-size": size, "font-family": MAP_FONT, fill: p.badgeInk, "data-badge-text": "1" }, [text]),
  ];
}

/** Top-left corners for a `w` x `h` box just outside `b`: below and above, then right and left, in widening rings. */
function aroundPositions(b: Box, w: number, h: number): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  const cx = (b.x0 + b.x1 - w) / 2;
  const cy = (b.y0 + b.y1 - h) / 2;
  for (let ring = 0; ring < 5; ring++) {
    const g = 0.1 + ring * 0.45;
    const xs = [cx, b.x0, b.x1 - w];
    for (let x = b.x0 - w + 0.5; x <= b.x1 - 0.5 + 1e-9; x += 0.5) xs.push(x);
    for (const x of xs) out.push([x, b.y1 + g], [x, b.y0 - g - h]);
    const ys = [cy, b.y0, b.y1 - h];
    for (let y = b.y0 - h + 0.3; y <= b.y1 - 0.3 + 1e-9; y += 0.5) ys.push(y);
    for (const y of ys) out.push([b.x1 + g, y], [b.x0 - g - w, y]);
  }
  return out;
}

/** Where two touching zones meet, from their bounding boxes (for joints with no drawn segment). */
function contactSegment(a: MapPoint[], b: MapPoint[]): [MapPoint, MapPoint] | undefined {
  const A = bbox(a);
  const B = bbox(b);
  const e = 1e-6;
  const y0 = Math.max(A.y0, B.y0);
  const y1 = Math.min(A.y1, B.y1);
  const x0 = Math.max(A.x0, B.x0);
  const x1 = Math.min(A.x1, B.x1);
  if (y1 - y0 > e && (Math.abs(A.x1 - B.x0) < e || Math.abs(B.x1 - A.x0) < e)) {
    const x = Math.abs(A.x1 - B.x0) < e ? A.x1 : A.x0;
    return [
      [x, y0],
      [x, y1],
    ];
  }
  if (x1 - x0 > e && (Math.abs(A.y1 - B.y0) < e || Math.abs(B.y1 - A.y0) < e)) {
    const y = Math.abs(A.y1 - B.y0) < e ? A.y1 : A.y0;
    return [
      [x0, y],
      [x1, y],
    ];
  }
  return undefined;
}

/**
 * The tubes of a duct sheet: every zone outlined with rounded joins, then
 * filled, so touching zones read as one run; vent chambers (exits at
 * least 1.8 m across, or zones at least 2.5 m each way) get a grille, junctions (three or more
 * links) a node, and runs a centre line.
 */
function drawTubes(layout: SiteLayout, ducts: MapZoneData[], p: SiteMapPalette, tracking: boolean): SvgNode {
  const edge = tracking ? p.wall : p.tubeEdge;
  const fill = tracking ? "#ffffff" : p.tube;
  const hi = tracking ? p.muted : p.tubeLine;
  const ids = new Set(ducts.map((z) => z.id));
  const degree = new Map<string, number>();
  for (const b of layout.borders) {
    if (b.a === b.b) continue;
    for (const end of [b.a, b.b]) if (ids.has(end)) degree.set(end, (degree.get(end) ?? 0) + 1);
  }
  const edges: SvgNode[] = [];
  const fills: SvgNode[] = [];
  const details: SvgNode[] = [];
  for (const z of ducts) {
    if (z.kind === "out-of-bounds") continue;
    const pts = points(z.poly);
    edges.push(el("polygon", { points: pts, fill: edge, stroke: edge, "stroke-width": tracking ? 0.16 : 0.34, "stroke-linejoin": "round" }));
    fills.push(el("polygon", { points: pts, fill, stroke: fill, "stroke-width": 0.1, "stroke-linejoin": "round", "data-duct": z.id }));
    const b = bbox(z.poly);
    const w = b.x1 - b.x0;
    const h = b.y1 - b.y0;
    const [cx, cy] = center(z.poly);
    if ((exitToOf(z) && Math.min(w, h) >= 1.8) || (w >= 2.5 && h >= 2.5)) {
      const i = insetBox(b, Math.min(0.3, Math.min(w, h) / 4));
      const slats: string[] = [];
      for (let y = i.y0 + 0.3; y < i.y1 - 0.15; y += 0.35) slats.push(`M ${fmt(i.x0 + 0.15)} ${fmt(y)} H ${fmt(i.x1 - 0.15)}`);
      details.push(
        el("g", { "data-chamber": z.id }, [
          el("path", { d: roundRectPath(i.x0, i.y0, i.x1, i.y1, 0.2), fill: "none", stroke: hi, "stroke-width": 0.07 }),
          slats.length ? el("path", { d: slats.join(" "), fill: "none", stroke: hi, "stroke-width": 0.05, "stroke-opacity": 0.7 }) : null,
        ]),
      );
    } else if ((degree.get(z.id) ?? 0) >= 3) {
      const r = Math.max(0.2, Math.min(0.45, Math.min(w, h) * 0.3));
      // decorative: labels may sit over it
      details.push(el("circle", { cx, cy, r, fill: edge, stroke: hi, "stroke-width": 0.07, "data-junction": z.id }));
    } else if (Math.max(w, h) >= 1.5) {
      const d = w >= h ? `M ${fmt(b.x0 + 0.2)} ${fmt(cy)} H ${fmt(b.x1 - 0.2)}` : `M ${fmt(cx)} ${fmt(b.y0 + 0.2)} V ${fmt(b.y1 - 0.2)}`;
      details.push(el("path", { d, fill: "none", stroke: hi, "stroke-width": 0.05, "stroke-dasharray": "0.4 0.3", "stroke-opacity": 0.7, "data-run": z.id }));
    }
  }
  return el("g", { "data-layer": "ducts", "data-tubes": "1" }, [...edges, ...fills, ...details]);
}

/** "a" ... "z", then "aa", "ab", ... */
function calloutRef(i: number): string {
  let s = "";
  let n = i;
  do {
    s = String.fromCharCode(97 + (n % 26)) + s;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return s;
}

function numberNode(zone: string, text: string, x: number, y: number, r: number, ring: string, ink: string, p: SiteMapPalette): SvgNode {
  const size = r * 1.16 * (text.length > 2 ? 0.8 : 1);
  return el("g", { "data-number": zone }, [
    el("circle", { cx: x, cy: y, r, fill: p.halo, stroke: ring, "stroke-width": r * 0.15 }),
    el("text", { x, y: y + size * 0.36, "text-anchor": "middle", "font-size": size, "font-family": MAP_FONT, "font-weight": 700, fill: ink }, [text]),
  ]);
}

function nameNode(zone: string, lines: string[], size: number, cx: number, firstBaseline: number, p: SiteMapPalette): SvgNode {
  return el(
    "g",
    { "data-name": zone },
    lines.map((l, i) =>
      el("text", { x: cx, y: firstBaseline + i * size * 1.1, "text-anchor": "middle", "font-size": size, "font-family": MAP_FONT, "font-weight": 700, fill: p.text, stroke: p.halo, "stroke-width": size * 0.18, "paint-order": "stroke" }, [l]),
    ),
  );
}

/** A name on one line, then on two lines (when it has a space). */
function nameVariants(name: string, size: number, max: number): string[][] {
  const out: string[][] = [[name]];
  if (/\s/.test(name.trim())) {
    const two = wrapText(name, size, max, 2, true);
    if (two.length === 2 && !two[1]!.endsWith("\u2026")) out.push(two);
  }
  return out;
}

/** Candidate centres for a duct's number: its corners (top right first), along its edges, then just outside it. */
function ductNumberCenters(b: Box, r: number): Array<[number, number]> {
  const i = 0.2;
  const out: Array<[number, number]> = [
    [b.x1 - i, b.y0 + i],
    [b.x0 + i, b.y0 + i],
    [b.x1 - i, b.y1 - i],
    [b.x0 + i, b.y1 - i],
  ];
  const w = b.x1 - b.x0;
  const h = b.y1 - b.y0;
  for (let t = 0.5; t < Math.max(w, h); t += 0.5) {
    if (w >= h) {
      out.push([b.x1 - i - t, b.y0 + i], [b.x1 - i - t, b.y1 - i], [b.x1 - i - t, (b.y0 + b.y1) / 2]);
    } else {
      out.push([b.x1 - i, b.y0 + i + t], [b.x0 + i, b.y0 + i + t], [(b.x0 + b.x1) / 2, b.y0 + i + t]);
    }
  }
  const on = out.filter(([x, y]) => x >= b.x0 - 0.01 && x <= b.x1 + 0.01 && y >= b.y0 - 0.01 && y <= b.y1 + 0.01);
  // beside the duct: touching its outline from outside, corners first
  const o = r + 0.05;
  const beside: Array<[number, number]> = [
    [b.x1 + o, b.y0 + r],
    [b.x0 - o, b.y0 + r],
    [b.x1 + o, b.y1 - r],
    [b.x0 - o, b.y1 - r],
    [b.x1 - r, b.y0 - o],
    [b.x0 + r, b.y0 - o],
    [b.x1 - r, b.y1 + o],
    [b.x0 + r, b.y1 + o],
  ];
  // then anywhere along its outline, outside
  for (let t = 0; t <= w + 1e-6; t += 0.25) beside.push([b.x1 - t, b.y0 - o], [b.x1 - t, b.y1 + o]);
  for (let t = 0; t <= h + 1e-6; t += 0.25) beside.push([b.x1 + o, b.y0 + t], [b.x0 - o, b.y0 + t]);
  return [...on, ...beside];
}

/** True when a polygon is an axis-aligned rectangle (its bounding box). */
function isRect(poly: MapPoint[]): boolean {
  return poly.length === 4 && new Set(poly.map((q) => q[0])).size === 2 && new Set(poly.map((q) => q[1])).size === 2;
}

/** Light grey squares of `step` units inside each playable floor zone, clipped to the zone. */
function gridSquaresLayer(floors: MapZoneData[], step: number, id: (s: string) => string): SvgNode {
  const groups: SvgNode[] = [];
  const clips: SvgNode[] = [];
  for (const z of floors) {
    if (z.kind === "out-of-bounds") continue;
    const b = bbox(z.poly);
    const parts: string[] = [];
    for (let x = Math.ceil(b.x0 / step + 1e-6) * step; x < b.x1 - 1e-6; x += step) parts.push(`M ${fmt(x)} ${fmt(b.y0)} V ${fmt(b.y1)}`);
    for (let y = Math.ceil(b.y0 / step + 1e-6) * step; y < b.y1 - 1e-6; y += step) parts.push(`M ${fmt(b.x0)} ${fmt(y)} H ${fmt(b.x1)}`);
    if (!parts.length) continue;
    const path = el("path", { d: parts.join(" "), fill: "none", stroke: GRID_SQUARE_COLOR, "stroke-width": 0.025 });
    if (isRect(z.poly)) {
      groups.push(path);
    } else {
      const cid = id(`sq-${z.id}`);
      clips.push(el("clipPath", { id: cid }, [el("polygon", { points: points(z.poly) })]));
      groups.push(el("g", { "clip-path": `url(#${cid})` }, [path]));
    }
  }
  return el("g", { "data-layer": "grid-squares" }, [clips.length ? el("defs", {}, clips) : null, ...groups]);
}

/** Colour of the 1 m grid squares. */
export const GRID_SQUARE_COLOR = "#c3c9cd";

function mid(a: [number, number], b: [number, number]): [number, number] {
  return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
}

function clutterGlyph(x: number, y: number, p: SiteMapPalette): SvgNode {
  return el("g", { fill: "none", stroke: p.muted, "stroke-width": 0.06, "data-clutter": "1" }, [
    el("rect", { x: x - 0.3, y: y - 0.3, width: 0.32, height: 0.22 }),
    el("rect", { x: x - 0.05, y: y - 0.1, width: 0.3, height: 0.3 }),
    el("circle", { cx: x - 0.2, cy: y + 0.12, r: 0.1 }),
  ]);
}

function seg(s: [MapPoint, MapPoint]) {
  const [[x1, y1], [x2, y2]] = s;
  const len = Math.hypot(x2 - x1, y2 - y1) || 1;
  const ux = (x2 - x1) / len;
  const uy = (y2 - y1) / len;
  return { x1, y1, x2, y2, len, ux, uy, nx: -uy, ny: ux, mx: (x1 + x2) / 2, my: (y1 + y2) / 2 };
}

function line(x1: number, y1: number, x2: number, y2: number, a: SvgAttrs): SvgNode {
  return el("line", { x1, y1, x2, y2, ...a });
}

function borderOpen(s: [MapPoint, MapPoint], p: SiteMapPalette, thin = false): SvgNode[] {
  const g = seg(s);
  const out: SvgNode[] = [];
  if (!thin) out.push(line(g.x1 + g.ux * 0.12, g.y1 + g.uy * 0.12, g.x2 - g.ux * 0.12, g.y2 - g.uy * 0.12, { stroke: p.floor, "stroke-width": WALL + 0.1 }));
  out.push(line(g.x1, g.y1, g.x2, g.y2, { stroke: p.open, "stroke-width": thin ? 0.06 : 0.08, "stroke-dasharray": "0.4 0.3" }));
  return out;
}

/** Draw one border with a drawn segment. Exported for the legend swatches. */
export function drawBorder(b: Pick<MapBorderData, "kind" | "armor" | "flags">, s: [MapPoint, MapPoint], p: SiteMapPalette, st: { locked?: boolean; sealed?: boolean; hidden?: boolean } = {}): SvgNode[] {
  const g = seg(s);
  const out: SvgNode[] = [];
  const outer = b.flags?.outerHull === true;
  const armored = typeof b.armor === "number" && b.armor >= 4;
  const wallW = outer ? 0.45 : armored ? 0.38 : WALL;
  const dash = st.hidden ? "0.3 0.15" : undefined;
  const wall = () => {
    out.push(line(g.x1, g.y1, g.x2, g.y2, { stroke: p.wall, "stroke-width": wallW, "stroke-dasharray": dash }));
    if (armored) {
      for (let t = 0.2; t < g.len - 0.1; t += 0.4) {
        const x = g.x1 + g.ux * t;
        const y = g.y1 + g.uy * t;
        out.push(line(x - g.nx * 0.16 - g.ux * 0.12, y - g.ny * 0.16 - g.uy * 0.12, x + g.nx * 0.16 + g.ux * 0.12, y + g.ny * 0.16 + g.uy * 0.12, { stroke: p.halo, "stroke-width": 0.06 }));
      }
    }
  };
  const gap = Math.min(1.4, g.len * 0.6);
  const gx1 = g.mx - g.ux * (gap / 2);
  const gy1 = g.my - g.uy * (gap / 2);
  const gx2 = g.mx + g.ux * (gap / 2);
  const gy2 = g.my + g.uy * (gap / 2);
  const cut = () => out.push(line(gx1, gy1, gx2, gy2, { stroke: p.floor, "stroke-width": wallW + 0.12 }));
  const lockDot = () => {
    if (st.locked) out.push(el("circle", { cx: g.mx + g.nx * 0.42, cy: g.my + g.ny * 0.42, r: 0.2, fill: p.lock, stroke: p.halo, "stroke-width": 0.05, "data-lock": "1" }));
  };
  switch (b.kind) {
    case "open":
      out.push(...borderOpen(s, p));
      break;
    case "wall":
      wall();
      break;
    case "door":
      wall();
      cut();
      out.push(line(gx1 + g.ux * 0.08, gy1 + g.uy * 0.08, gx2 - g.ux * 0.08, gy2 - g.uy * 0.08, { stroke: p.wall, "stroke-width": 0.14, "stroke-dasharray": dash }));
      lockDot();
      break;
    case "hatch":
      wall();
      cut();
      out.push(el("circle", { cx: g.mx, cy: g.my, r: Math.min(0.42, gap / 2), fill: p.floor, stroke: p.wall, "stroke-width": 0.1, "stroke-dasharray": dash }));
      lockDot();
      break;
    case "blast":
      wall();
      cut();
      for (const o of [-0.13, 0.13]) out.push(line(gx1 + g.nx * o, gy1 + g.ny * o, gx2 + g.nx * o, gy2 + g.ny * o, { stroke: p.wall, "stroke-width": 0.1 }));
      lockDot();
      break;
    case "access":
      out.push(accessGlyph(g.mx, g.my, p, !!st.sealed, !!st.hidden));
      break;
    case "stairs":
      out.push(...borderOpen(s, p));
      out.push(stairsGlyph(g.mx, g.my, p));
      break;
    case "shaft":
      out.push(...borderOpen(s, p));
      out.push(badgeGlyph("both", g.mx, g.my, 0.35, { ...p, badgeInk: p.wall }));
      break;
  }
  if (st.sealed && b.kind !== "access") {
    out.push(el("path", { d: `M ${fmt(g.mx - 0.3)} ${fmt(g.my - 0.3)} L ${fmt(g.mx + 0.3)} ${fmt(g.my + 0.3)} M ${fmt(g.mx - 0.3)} ${fmt(g.my + 0.3)} L ${fmt(g.mx + 0.3)} ${fmt(g.my - 0.3)}`, stroke: p.lock, "stroke-width": 0.12 }));
  }
  return out;
}

// ---------------------------------------------------------------------------
// legend swatches
// ---------------------------------------------------------------------------

/** A small drawing for a legend entry, in a 2 x 2 unit box. */
export function legendSwatch(entry: MapLegendEntry, palette: SiteMapDrawOptions["palette"], legend?: MapLegendEntry[]): SvgNode {
  const p = resolvePalette(palette);
  const t = entry.target;
  const box = el("rect", { x: 0, y: 0, width: 2, height: 2, fill: p.floor, stroke: p.grid, "stroke-width": 0.05 });
  if ("border" in t) {
    const s: [MapPoint, MapPoint] = t.border === "access" || t.border === "stairs" ? [[1, 1], [1, 1]] : [[0.15, 1], [1.85, 1]];
    if (t.border === "access") return el("g", {}, [box, accessGlyph(1, 1, p, false, false)]);
    if (t.border === "stairs") return el("g", {}, [box, stairsGlyph(1, 1, p, 1.4)]);
    if (t.border === "shaft") return el("g", {}, [box, badgeGlyph("both", 1, 1, 0.6, { ...p, badgeInk: p.wall })]);
    return el("g", {}, [box, ...drawBorder({ kind: t.border }, s, p)]);
  }
  if ("flag" in t) {
    const icon = flagIcon(entry);
    if (icon === "dark") return el("g", {}, [box, el("rect", { x: 0, y: 0, width: 2, height: 2, fill: p.darkOverlay, "fill-opacity": p.darkOpacity }), iconNode("dark", 1, 1, p, 1.3)]);
    return el("g", {}, [box, iconNode(icon, 1, 1, p, 1.4, entry.color && !entry.color.startsWith("var(") ? entry.color : undefined)]);
  }
  if ("area" in t) return el("g", {}, [box, el("rect", { x: 0, y: 0, width: 2, height: 2, fill: areaColor(t.area, legend ?? [entry]), "fill-opacity": p.tintOpacity })]);
  if ("marker" in t) return el("g", {}, [box, markerGlyph(t.marker, 1, 1, p, 1.6)]);
  if ("kind" in t) {
    if (t.kind === "out-of-bounds")
      return el("g", {}, [
        box,
        ...[0.25, 0.75, 1.25, 1.75].map((v) => line(0, v * 2 - 0.5, v * 2 - 0.5, 0, { stroke: p.outOfBounds, "stroke-width": 0.1 })),
      ]);
    if (t.kind === "exterior")
      return el("g", {}, [
        el("rect", { x: 0, y: 0, width: 2, height: 2, fill: p.ground, stroke: p.grid, "stroke-width": 0.05 }),
        el("rect", { x: 0.3, y: 0.3, width: 1.4, height: 1.4, fill: "none", stroke: p.groundLine, "stroke-width": 0.1, "stroke-dasharray": "0.3 0.2" }),
        ...[[0.7, 0.7], [1.3, 1.1], [0.8, 1.4]].map(([cx, cy]) => el("circle", { cx, cy, r: 0.08, fill: p.groundLine })),
      ]);
    if (t.kind === "crawlspace" || t.kind === "shaft") return el("g", {}, [box, el("rect", { x: 0.3, y: 0.6, width: 1.4, height: 0.8, fill: p.duct, "fill-opacity": 0.08, stroke: p.duct, "stroke-width": 0.1, "stroke-dasharray": "0.3 0.2" })]);
    return el("g", {}, [box, el("rect", { x: 0.3, y: 0.3, width: 1.4, height: 1.4, fill: "none", stroke: p.wall, "stroke-width": WALL })]);
  }
  return box;
}
