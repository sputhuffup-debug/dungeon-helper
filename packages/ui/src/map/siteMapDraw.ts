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
  effectiveBorder,
  isFlagTarget,
  lockedInAct,
  matchingFlagEntries,
  zoneNumbers,
  type LiveBorderOverride,
} from "@campaign-forge/core";
import type { MapBorderData, MapLegendEntry, MapMarker, MapPoint, MapZoneData, SiteLayout } from "@campaign-forge/module-sdk";

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

export type FlagIcon = "fire" | "vacuum" | "float" | "dark" | "radiation" | "water" | "hazard";

/** The icon for a flag legend entry: its `icon`, else a guess from the flag name, else the generic hazard glyph. */
export function flagIcon(entry: MapLegendEntry): FlagIcon {
  const known: FlagIcon[] = ["fire", "vacuum", "float", "dark", "radiation", "water", "hazard"];
  if (entry.icon && (known as string[]).includes(entry.icon)) return entry.icon as FlagIcon;
  const name = isFlagTarget(entry.target) ? entry.target.flag.toLowerCase() : "";
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
    case "hazard":
    default:
      return el("g", {}, [
        el("path", { d: `M ${fmt(x)} ${fmt(y - k * 0.85)} L ${fmt(x + k * 0.9)} ${fmt(y + k * 0.75)} L ${fmt(x - k * 0.9)} ${fmt(y + k * 0.75)} Z`, fill: color ?? p.hazard, stroke: p.halo, "stroke-width": 0.05 * s, "stroke-linejoin": "round" }),
        el("text", { x, y: y + k * 0.6, "text-anchor": "middle", "font-size": k * 1.1, "font-weight": 700, "font-family": "sans-serif", fill: p.halo }, ["!"]),
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

function accessGlyph(x: number, y: number, p: SiteMapPalette, sealed: boolean, hidden: boolean): SvgNode {
  const h = 0.36;
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
}

export interface SiteMapDrawing {
  /** Group of everything, in grid units, translated by the margin. */
  node: SvgNode;
  /** Total size in grid units, margins included. */
  width: number;
  height: number;
  deck: string | undefined;
}

const WALL = 0.22;

function paletteOf(p: SiteMapDrawOptions["palette"]): SiteMapPalette {
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
  const p = paletteOf(opts.palette);
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
  const floors = zones.filter((z) => z.layer !== "duct");
  const ducts = zones.filter((z) => z.layer === "duct");
  const flagEntries = legend.filter((e) => isFlagTarget(e.target) && (gm || tracking || !e.gmOnly));
  const hasDarkEntry = flagEntries.some((e) => flagIcon(e) === "dark");

  const flagsOf = (z: MapZoneData): Record<string, unknown> => ({ ...(z.flags ?? {}), ...(live.zoneFlags?.[z.id] ?? {}) });
  const flagHits = (z: MapZoneData) => matchingFlagEntries(flagEntries, flagsOf(z));
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
    el("pattern", { id: id("fog"), width: 0.6, height: 0.6, patternUnits: "userSpaceOnUse", patternTransform: "rotate(-30)" }, [
      el("rect", { width: 0.6, height: 0.6, fill: p.fog }),
      el("path", { d: "M 0 0.3 L 0.6 0.3", stroke: p.fogLine, "stroke-width": 0.08 }),
    ]),
    el("pattern", { id: id("act"), width: 0.7, height: 0.7, patternUnits: "userSpaceOnUse", patternTransform: "rotate(45)" }, [el("path", { d: "M 0 0 L 0 0.7", stroke: p.act, "stroke-width": 0.12, "stroke-opacity": 0.5 })]),
  ]);

  const layers: SvgNode[] = [];
  layers.push(el("rect", { x: -margin, y: -margin, width, height, fill: tracking ? "#ffffff" : p.background }));
  if (opts.grid && deck) layers.push(el("rect", { x: 0, y: 0, width: deck.width, height: deck.height, fill: `url(#${id("grid")})`, "data-layer": "grid" }));

  // 1. floor zones: base, area tint, out-of-bounds hatch, dark overlay
  const fills: SvgNode[] = [];
  for (const z of floors) {
    const pts = points(z.poly);
    if (z.kind === "out-of-bounds") {
      fills.push(el("polygon", { points: pts, fill: `url(#${id("oob")})`, stroke: p.outOfBounds, "stroke-width": 0.08, "data-oob": z.id }));
      continue;
    }
    fills.push(el("polygon", { points: pts, fill: tracking ? "#ffffff" : p.floor }));
    if (!tracking && z.area) fills.push(el("polygon", { points: pts, fill: areaColor(z.area, legend), "fill-opacity": p.tintOpacity, "data-area": z.area }));
    if (!tracking && isDark(z)) fills.push(el("polygon", { points: pts, fill: p.darkOverlay, "fill-opacity": p.darkOpacity, "data-dark": z.id }));
    if (gm && z.acts?.includes(act)) fills.push(el("polygon", { points: pts, fill: `url(#${id("act")})`, "data-act-shade": z.id }));
  }
  layers.push(el("g", { "data-layer": "floors" }, fills));

  // 2. walls: every floor zone outline at wall weight (borders redraw shared edges)
  const outlines: SvgNode[] = floors
    .filter((z) => z.kind !== "out-of-bounds")
    .map((z) => el("polygon", { points: points(z.poly), fill: "none", stroke: p.wall, "stroke-width": tracking ? 0.12 : WALL, "stroke-linejoin": "miter" }));
  layers.push(el("g", { "data-layer": "outlines" }, outlines));

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
      if (tracking) {
        if (eff.kind === "open") borders.push(el("g", attrs, borderOpen(b.segment, p, true)));
        continue;
      }
      borders.push(el("g", attrs, drawBorder(eff, b.segment, p, { locked, sealed, hidden: !!b.hidden && gm })));
      continue;
    }
    if (tracking && eff.kind !== "access") continue;
    // vertical links: access points and stairs
    const za = byId.get(b.a);
    const zb = byId.get(b.b);
    if (!za || !zb) continue;
    // other links without a drawn segment (duct to duct) need no glyph: the outlines show them
    if (eff.kind !== "access" && eff.kind !== "stairs") continue;
    if (eff.kind === "access") {
      const pos = overlapCenter(bbox(za.poly), bbox(zb.poly)) ?? (aOn && bOn ? mid(center(za.poly), center(zb.poly)) : center((aOn ? za : zb).poly));
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
        glyphs.push(
          el("g", { ...attrs, "data-glyph": "stairs" }, [
            stairsGlyph(x, y, p),
            otherDeck && other.deck !== z.deck ? el("text", { x, y: y + 0.85, "text-anchor": "middle", "font-size": 0.4, "font-family": "sans-serif", fill: p.muted }, [otherDeck.name]) : null,
            el("title", {}, [otherDeck && other.deck !== z.deck ? `Stairs to ${otherDeck.name}` : "Stairs"]),
          ]),
        );
      }
    }
  }
  layers.push(el("g", { "data-layer": "borders" }, borders));

  // 4. ducts: dashed outlines over the rooms
  layers.push(
    el(
      "g",
      { "data-layer": "ducts" },
      ducts.map((z) => el("polygon", { points: points(z.poly), fill: p.duct, "fill-opacity": 0.08, stroke: p.duct, "stroke-width": 0.12, "stroke-dasharray": "0.45 0.3", "data-duct": z.id })),
    ),
  );
  layers.push(el("g", { "data-layer": "links" }, glyphs));

  // 5. zone contents: clutter glyphs, flag icons, act numerals, names, numbers, markers
  const contents: SvgNode[] = [];
  for (const z of zones) {
    if (fogged.has(z.id) && view === "player") continue;
    const bx = bbox(z.poly);
    const [cx, cy] = center(z.poly);
    const w = bx.x1 - bx.x0;
    const h = bx.y1 - bx.y0;
    const g: SvgNode[] = [];
    if (!tracking && z.layer !== "duct" && z.kind !== "out-of-bounds") {
      if (z.cluttered && w >= 2 && h >= 2) g.push(clutterGlyph(bx.x1 - 0.55, bx.y1 - 0.55, p));
      flagHits(z).forEach((e, i) => {
        g.push(el("g", { "data-flag-icon": isFlagTarget(e.target) ? e.target.flag : "" }, [iconNode(flagIcon(e), bx.x1 - 0.7 - i * 1.0, bx.y0 + 0.7, p, 0.9, e.color && !e.color.startsWith("var(") ? e.color : undefined), el("title", {}, [e.label])]));
      });
      if (gm && z.acts?.length) g.push(el("text", { x: bx.x1 - 0.35, y: bx.y1 - 1.25, "text-anchor": "end", "font-size": 0.5, "font-family": "sans-serif", "font-weight": 700, fill: p.act }, [z.acts.map((a) => ROMAN[a] ?? String(a)).join(" ")]));
    }
    const n = numbers.get(z.id);
    if (!tracking && z.key && z.name && z.layer !== "duct") {
      const size = Math.max(0.45, Math.min(0.85, (w / Math.max(4, z.name.length)) * 1.6));
      g.push(el("text", { x: cx, y: cy + size * 0.35, "text-anchor": "middle", "font-size": size, "font-family": "sans-serif", "font-weight": 700, fill: p.text, stroke: p.halo, "stroke-width": size * 0.18, "paint-order": "stroke", "data-name": z.id }, [z.name]));
    }
    if (n !== undefined) {
      if (tracking) {
        const duct = z.layer === "duct";
        const r = duct ? 0.6 : Math.min(1.1, Math.max(0.6, Math.min(w, h) / 3));
        // a duct's number goes in its corner so the room number below stays readable
        const x = duct ? bx.x1 - r - 0.1 : cx;
        const y = duct && h >= 2.4 ? bx.y0 + r + 0.1 : cy;
        g.push(el("g", { "data-number": z.id }, [el("circle", { cx: x, cy: y, r, fill: "#ffffff", stroke: z.layer === "duct" ? p.duct : p.wall, "stroke-width": 0.1 }), el("text", { x, y: y + r * 0.4, "text-anchor": "middle", "font-size": r * 1.15, "font-family": "sans-serif", "font-weight": 700, fill: z.layer === "duct" ? p.duct : p.text }, [String(n)])]));
      } else if (gm) {
        // duct numbers sit on the duct's top-right corner, clear of the room's number and name below it
        const duct = z.layer === "duct";
        const small = w < 2.4 || h < 2.4;
        const x = duct ? bx.x1 - 0.2 : small ? cx : bx.x0 + 0.75;
        const y = duct ? bx.y0 + 0.2 : small ? cy : bx.y0 + 0.75;
        g.push(el("g", { "data-number": z.id }, [el("circle", { cx: x, cy: y, r: duct ? 0.42 : 0.5, fill: p.halo, stroke: z.layer === "duct" ? p.duct : p.wall, "stroke-width": 0.07 }), el("text", { x, y: y + 0.21, "text-anchor": "middle", "font-size": 0.58, "font-family": "sans-serif", "font-weight": 700, fill: z.layer === "duct" ? p.duct : p.text }, [String(n)])]));
      }
    }
    if (!tracking) {
      const ms = layout.markers.filter((m) => m.zone === z.id && (gm || !m.gmOnly));
      ms.forEach((m, i) => {
        const x = bx.x0 + 0.75;
        const y = bx.y1 - 0.75 - i * 0.95;
        const label = m.kind === "label" || !m.act || /\bact\b/i.test(m.label) ? m.label : `${m.label} (act ${m.act})`;
        g.push(
          el("g", { "data-marker": m.id, "data-marker-kind": m.kind }, [
            m.kind === "label" ? null : markerGlyph(m.kind, x, y, p),
            gm || m.kind === "label"
              ? el("text", { x: m.kind === "label" ? x - 0.3 : x + 0.55, y: y + 0.17, "font-size": 0.45, "font-family": "sans-serif", fill: p.text, stroke: p.halo, "stroke-width": 0.08, "paint-order": "stroke" }, [label])
              : null,
            el("title", {}, [label]),
          ]),
        );
      });
    }
    if (g.length) contents.push(el("g", { "data-zone-content": z.id }, g));
  }
  layers.push(el("g", { "data-layer": "contents" }, contents));

  // 6. fog
  const fog: SvgNode[] = [];
  for (const z of zones) {
    // ducts run over and under rooms: their fog would cover revealed rooms
    if (!fogged.has(z.id) || z.layer === "duct") continue;
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
          el("text", { x, y: y + 0.2, "text-anchor": "middle", "font-size": 0.52, "font-family": "sans-serif", "font-weight": 700, fill: "#ffffff" }, [initials || "?"]),
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
      hits.push(
        el("polygon", {
          points: points(z.poly),
          fill: "#000",
          "fill-opacity": 0,
          "data-zone": z.id,
          "data-hit": "zone",
          role: "button",
          tabindex: 0,
          "aria-label": zoneLabel(z, { number: numbers.get(z.id), fogged: isFog, flags }),
          "aria-pressed": selected.has(z.id) ? "true" : "false",
          class: "cf-sitemap__hit",
        }),
      );
    }
    layers.push(el("g", { "data-layer": "hits" }, hits));
  }

  const node = el("g", { transform: `translate(${margin} ${margin})`, "data-deck": deck?.id, "data-view": view }, [defs, ...layers]);
  return { node, width, height, deck: deck?.id };
}

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
  const p = paletteOf(palette);
  const t = entry.target;
  const box = el("rect", { x: 0, y: 0, width: 2, height: 2, fill: p.floor, stroke: p.grid, "stroke-width": 0.05 });
  if ("border" in t) {
    const s: [MapPoint, MapPoint] = t.border === "access" || t.border === "stairs" ? [[1, 1], [1, 1]] : [[0.15, 1], [1.85, 1]];
    if (t.border === "access") return el("g", {}, [box, accessGlyph(1, 1, p, false, false)]);
    if (t.border === "stairs") return el("g", {}, [box, stairsGlyph(1, 1, p, 1.4)]);
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
    if (t.kind === "crawlspace" || t.kind === "shaft") return el("g", {}, [box, el("rect", { x: 0.3, y: 0.6, width: 1.4, height: 0.8, fill: p.duct, "fill-opacity": 0.08, stroke: p.duct, "stroke-width": 0.1, "stroke-dasharray": "0.3 0.2" })]);
    return el("g", {}, [box, el("rect", { x: 0.3, y: 0.3, width: 1.4, height: 1.4, fill: "none", stroke: p.wall, "stroke-width": WALL })]);
  }
  return box;
}
