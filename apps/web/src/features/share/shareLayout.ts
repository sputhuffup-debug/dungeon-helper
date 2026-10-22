/**
 * The share's pictures, as SvgNode drawings: phone cards (1080 px wide, one
 * per item, dark on light) and the pages of the PDF packet (Letter or A4, in
 * the booklet's black and white). Both are laid out from the same blocks, so
 * what the preview shows is what the files hold. Pure: the input is a
 * `PlayerShare` (already the player projection) plus the images the caller
 * loaded; nothing here reads the campaign.
 */
import type { PlayerShare, ShareMap, ShareMember } from "@campaign-forge/core";
import type { MapGeneratorDef } from "@campaign-forge/module-sdk";
import { MAP_FONT, PRINT_PALETTE, drawSiteMap, nodeToString, svgNode as el, wrapText, type PdfPage, type SiteMapPalette, type SvgNode } from "@campaign-forge/ui";
import type { Paper } from "../../lib/paper";

// ---------------------------------------------------------------------------
// input
// ---------------------------------------------------------------------------

/** An image ready to draw: a JPEG data URL (the PDF writer embeds JPEG) and its pixel size. */
export interface ReadyImage {
  href: string;
  width: number;
  height: number;
}

export interface ShareLayoutInput {
  share: PlayerShare;
  /** Asset id -> image, for handout images and portraits that loaded. */
  images?: ReadonlyMap<string, ReadyImage>;
  /** Map id -> passability rule (from the module's map generator). */
  passable?: (mapId: string) => MapGeneratorDef["passable"] | undefined;
  /** Map ids shown as "updated" since the last share. */
  updatedMaps?: ReadonlySet<string>;
  /** Extra sections after the session's (the campaign primer). */
  extra?: ShareSection[];
  /**
   * "images": a handout's own image is sent as it is, next to its card, so the
   * card holds only its text (and an image-only handout has no card). "pdf":
   * the image goes on the handout's page.
   */
  format?: "images" | "pdf";
}

/** One item of the share: a title and blocks. */
export interface ShareSection {
  id: string;
  kind: "briefing" | "map" | "handout" | "party" | "primer";
  eyebrow: string;
  title: string;
  blocks: Block[];
  /** File name stem for its phone card(s). */
  file: string;
  /** An image sent as it is with this section (images format). */
  original?: { asset: string; mime: string };
  /** No card of its own: the original image says it all. */
  cardless?: boolean;
}

export type Block =
  | { kind: "heading"; text: string }
  | { kind: "para"; text: string; style?: "quote" | "bullet" | "lead"; marker?: string }
  | { kind: "map"; map: ShareMap; deck: string }
  | { kind: "image"; image: ReadyImage; alt: string }
  | { kind: "member"; member: ShareMember; portrait?: ReadyImage | undefined }
  | { kind: "note"; text: string };

// ---------------------------------------------------------------------------
// Markdown to blocks (the share's bodies are short; headings, lists, quotes, paragraphs)
// ---------------------------------------------------------------------------

/** Inline Markdown as plain text: emphasis and code marks go, links keep their text. */
export function plainInline(s: string): string {
  return s
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/(\*\*\*|\*\*|\*|__|`)/g, "")
    .replace(/(^|\s)_(\S[^_]*\S|\S)_(?=\s|$|[.,;:!?])/g, "$1$2")
    .replace(/\\([_\\[\]*`])/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

export function markdownBlocks(md: string | undefined): Block[] {
  if (!md) return [];
  const out: Block[] = [];
  let para: string[] = [];
  let quote = false;
  const flush = () => {
    const text = plainInline(para.join(" "));
    if (text) out.push(quote ? { kind: "para", text, style: "quote" } : { kind: "para", text });
    para = [];
    quote = false;
  };
  for (const raw of md.split("\n")) {
    const line = raw.trimEnd();
    if (!line.trim()) {
      flush();
      continue;
    }
    const h = /^\s*#{1,6}\s+(.*)$/.exec(line);
    if (h) {
      flush();
      const text = plainInline(h[1]!);
      if (text) out.push({ kind: "heading", text });
      continue;
    }
    const li = /^\s*([-*+]|\d+[.)])\s+(.*)$/.exec(line);
    if (li) {
      flush();
      const text = plainInline(li[2]!);
      if (text) out.push({ kind: "para", text, style: "bullet", marker: /\d/.test(li[1]!) ? li[1]!.replace(")", ".") : "•" });
      continue;
    }
    const q = /^\s*>\s?(.*)$/.exec(line);
    if (q) {
      if (!quote) flush();
      quote = true;
      para.push(q[1]!);
      continue;
    }
    if (quote) flush();
    // a continuation line of a list item joins it
    const last = out[out.length - 1];
    if (!para.length && last?.kind === "para" && last.style === "bullet" && /^\s{2,}/.test(raw)) {
      last.text = plainInline(`${last.text} ${line}`);
      continue;
    }
    para.push(line);
  }
  flush();
  return out;
}

// ---------------------------------------------------------------------------
// sections
// ---------------------------------------------------------------------------

const slugOf = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40) || "item";

/** The share as sections, in reading order: briefing, maps, handouts, party, then any extra sections. */
export function shareSections(input: ShareLayoutInput): ShareSection[] {
  const { share } = input;
  const out: ShareSection[] = [];
  const b = share.briefing;
  if (b) {
    const blocks: Block[] = [];
    if (b.intro) {
      if (b.adventure) blocks.push({ kind: "heading", text: b.adventure });
      blocks.push(...markdownBlocks(b.intro));
    }
    if (b.readAloud) {
      if (b.intro) blocks.push({ kind: "heading", text: b.scene ?? "The scene" });
      for (const x of markdownBlocks(b.readAloud)) blocks.push(x.kind === "para" && !x.style ? { ...x, style: "quote" } : x);
    }
    out.push({ id: "briefing", kind: "briefing", eyebrow: "Briefing", title: b.scene ?? b.adventure ?? "Briefing", blocks, file: "briefing" });
  }
  for (const m of share.maps) {
    const decks = m.decks.length ? m.decks : m.layout.decks.slice(0, 1).map((d) => d.id);
    for (const deck of decks) {
      const deckName = m.layout.decks.find((d) => d.id === deck)?.name;
      const title = decks.length > 1 && deckName ? `${m.name}: ${deckName}` : m.name;
      const blocks: Block[] = [{ kind: "map", map: m, deck }];
      blocks.push({ kind: "note", text: "Grey areas: not explored yet." });
      out.push({ id: `map:${m.id}:${deck}`, kind: "map", eyebrow: input.updatedMaps?.has(m.id) ? "Map (updated)" : "Map", title, blocks, file: `map-${slugOf(title)}` });
    }
  }
  for (const h of share.handouts) {
    const blocks: Block[] = [];
    const img = h.image ? input.images?.get(h.image.asset) : undefined;
    const asIs = input.format === "images" && img && h.image;
    if (img && !asIs) blocks.push({ kind: "image", image: img, alt: h.title });
    blocks.push(...markdownBlocks(h.text));
    const section: ShareSection = { id: `handout:${h.id}`, kind: "handout", eyebrow: h.thisSession ? "New handout" : "Handout", title: h.title || "Handout", blocks, file: `handout-${slugOf(h.title)}` };
    if (asIs) {
      section.original = { asset: h.image!.asset, mime: h.image!.mime };
      if (blocks.length === 0) section.cardless = true;
    }
    out.push(section);
  }
  if (share.party.length) {
    const blocks: Block[] = share.party.map((m) => ({ kind: "member", member: m, portrait: m.portrait ? input.images?.get(m.portrait.asset) : undefined }));
    out.push({ id: "party", kind: "party", eyebrow: "The party", title: "Who's who", blocks, file: "party" });
  }
  out.push(...(input.extra ?? []));
  return out;
}

// ---------------------------------------------------------------------------
// layout
// ---------------------------------------------------------------------------

interface Theme {
  width: number;
  margin: number;
  body: number;
  lead: number;
  heading: number;
  title: number;
  eyebrow: number;
  footer: number;
  line: number;
  gap: number;
  ink: string;
  muted: string;
  rule: string;
  quoteBar: string;
  palette: SiteMapPalette;
  /** Print maps in greys with solid fog (the booklet's black and white; pattern fog is heavy in a PDF). */
  mono?: boolean;
}

/** Phone cards: 1080 px wide, large type, black on white. */
const PHONE: Theme = {
  width: 1080,
  margin: 64,
  body: 38,
  lead: 42,
  heading: 44,
  title: 64,
  eyebrow: 28,
  footer: 26,
  line: 1.42,
  gap: 26,
  ink: "#111111",
  muted: "#3d3d3d",
  rule: "#111111",
  quoteBar: "#111111",
  palette: { ...PRINT_PALETTE, background: "#ffffff" },
};

/** Packet pages: points, booklet-sized type, black and white. */
const PAGE: Omit<Theme, "width"> = {
  margin: 54,
  body: 11,
  lead: 12,
  heading: 13,
  title: 22,
  eyebrow: 8.5,
  footer: 8,
  line: 1.4,
  gap: 8,
  ink: "#000000",
  muted: "#333333",
  rule: "#000000",
  quoteBar: "#000000",
  mono: true,
  palette: greyPalette({ ...PRINT_PALETTE, background: "#ffffff", floor: "#ffffff", grid: "#e4e4e4", outOfBounds: "#bdbdbd" }),
};

/** The palette with every colour as its grey (as the booklet prints the site map). */
function grey(c: string): string {
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(c.trim());
  if (!m) return c;
  let hex = m[1]!;
  if (hex.length === 3) hex = hex.replace(/./g, (x) => x + x);
  const y = Math.round(0.299 * parseInt(hex.slice(0, 2), 16) + 0.587 * parseInt(hex.slice(2, 4), 16) + 0.114 * parseInt(hex.slice(4, 6), 16));
  const h = y.toString(16).padStart(2, "0");
  return `#${h}${h}${h}`;
}

/** Fog drawn solid in print. */
const PRINT_FOG = "#9a9a9a";

/** A map drawing in greys (legend area tints included), with the fog pattern as a solid grey. */
function monoNode(n: SvgNode): SvgNode {
  const a: Record<string, string | number> = {};
  for (const [k, v] of Object.entries(n.a ?? {})) {
    if (v === undefined) continue;
    if ((k === "fill" || k === "stroke") && typeof v === "string") a[k] = /^url\(#[^)]*-fog\)$/.test(v) ? PRINT_FOG : grey(v);
    else a[k] = v as string | number;
  }
  const out: SvgNode = { t: n.t, a };
  if (n.c) out.c = n.c.map((c) => (typeof c === "string" ? c : monoNode(c)));
  return out;
}

function greyPalette(p: SiteMapPalette): SiteMapPalette {
  return Object.fromEntries(Object.entries(p).map(([k, v]) => [k, typeof v === "string" ? grey(v) : v])) as unknown as SiteMapPalette;
}

/** A laid-out row: its height and a drawing at (x, y). */
interface Row {
  height: number;
  /** Space above, dropped at the top of a page. */
  before: number;
  draw: (x: number, y: number) => SvgNode;
  /** Text it carries (for tests and the preview's alt text). */
  text: string[];
  /** Never the last row of a page (a section heading). */
  keep?: boolean;
}

const text = (x: number, y: number, size: number, s: string, o: { bold?: boolean; fill?: string; anchor?: "start" | "middle" | "end"; italic?: boolean } = {}) =>
  el(
    "text",
    {
      x,
      y,
      "font-size": size,
      "font-family": MAP_FONT,
      fill: o.fill ?? "#000000",
      ...(o.bold ? { "font-weight": 700 } : {}),
      ...(o.anchor && o.anchor !== "start" ? { "text-anchor": o.anchor } : {}),
    },
    [s],
  );

const wrap = (s: string, size: number, max: number, bold = false) => wrapText(s, size, max, 10_000, bold);

function textRows(lines: string[], size: number, th: Theme, x0: number, o: { bold?: boolean; fill?: string; before: number; bar?: boolean; marker?: string }): Row[] {
  const lh = size * th.line;
  return lines.map((l, i) => ({
    height: lh,
    before: i === 0 ? o.before : 0,
    text: [l],
    draw: (x, y) =>
      el("g", {}, [
        o.bar ? el("rect", { x, y: y - 1, width: Math.max(2, size * 0.14), height: lh + 2, fill: th.quoteBar }) : null,
        i === 0 && o.marker ? text(x + x0 - size * 0.9, y + size * 1.05, size, o.marker, { bold: true, fill: th.ink }) : null,
        text(x + x0, y + size * 1.05, size, l, { ...(o.bold ? { bold: true } : {}), fill: o.fill ?? th.ink }),
      ]),
  }));
}

function blockRows(b: Block, th: Theme, width: number, maxHeight: number, idPrefix: string, passable: ShareLayoutInput["passable"]): Row[] {
  switch (b.kind) {
    case "heading":
      return textRows(wrap(b.text, th.heading, width, true), th.heading, th, 0, { bold: true, before: th.gap * 1.4 });
    case "para": {
      if (b.style === "quote") {
        const inset = th.body * 0.9;
        return textRows(wrap(b.text, th.body, width - inset), th.body, th, inset, { before: th.gap, bar: true });
      }
      if (b.style === "bullet") {
        const inset = th.body * 1.3;
        return textRows(wrap(b.text, th.body, width - inset), th.body, th, inset, { before: th.gap * 0.5, marker: b.marker ?? "•" });
      }
      const size = b.style === "lead" ? th.lead : th.body;
      return textRows(wrap(b.text, size, width), size, th, 0, { before: th.gap });
    }
    case "note":
      return textRows(wrap(b.text, th.footer, width), th.footer, th, 0, { before: th.gap * 0.6, fill: th.muted });
    case "map": {
      const d = drawSiteMap(b.map.layout, {
        view: "player",
        deck: b.deck,
        legend: b.map.legend,
        live: { act: b.map.act, ...b.map.live },
        act: b.map.act,
        fogged: b.map.layout.fogged,
        passable: passable?.(b.map.id),
        palette: th.palette,
        grid: true,
        margin: 1,
        idPrefix,
        interactive: false,
      });
      const k = Math.min(width / d.width, maxHeight / d.height);
      const w = d.width * k;
      const h = d.height * k;
      return [
        {
          height: h,
          before: th.gap,
          text: [],
          draw: (x, y) => el("g", { transform: `translate(${x + (width - w) / 2} ${y}) scale(${k})` }, [el("rect", { x: 0, y: 0, width: d.width, height: d.height, fill: th.palette.background }), th.mono ? monoNode(d.node) : d.node]),
        },
      ];
    }
    case "image": {
      const k = Math.min(width / b.image.width, maxHeight / b.image.height, th === PHONE ? 2 : 1);
      const w = b.image.width * k;
      const h = b.image.height * k;
      return [
        {
          height: h,
          before: th.gap,
          text: [],
          draw: (x, y) => el("image", { href: b.image.href, x: x + (width - w) / 2, y, width: w, height: h, preserveAspectRatio: "none" }),
        },
      ];
    }
    case "member": {
      const m = b.member;
      const pic = b.portrait ? th.body * 3.2 : 0;
      const tx = pic ? pic + th.body * 0.8 : 0;
      const tw = width - tx;
      const name = wrap(m.name, th.heading, tw, true);
      const kind = m.kind ? wrap(m.kind, th.footer, tw) : [];
      const stats = m.stats.length ? wrap(m.stats.map((s) => (/^[-+]?\d/.test(s.value) ? `${s.label} ${s.value}` : `${s.label}: ${s.value}`)).join(" · "), th.body, tw) : [];
      const lines: Array<{ s: string; size: number; bold?: boolean; fill?: string }> = [
        ...name.map((s) => ({ s, size: th.heading, bold: true })),
        ...kind.map((s) => ({ s, size: th.footer, fill: th.muted })),
        ...stats.map((s) => ({ s, size: th.body })),
      ];
      const textH = lines.reduce((a, l) => a + l.size * th.line, 0);
      const height = Math.max(textH, pic);
      return [
        {
          height,
          before: th.gap * 1.6,
          text: lines.map((l) => l.s),
          draw: (x, y) => {
            const out: SvgNode[] = [];
            if (b.portrait && pic) {
              const k = Math.min(pic / b.portrait.width, pic / b.portrait.height);
              const w = b.portrait.width * k;
              const h = b.portrait.height * k;
              out.push(el("image", { href: b.portrait.href, x: x + (pic - w) / 2, y: y + (pic - h) / 2, width: w, height: h, preserveAspectRatio: "none" }));
              out.push(el("rect", { x, y, width: pic, height: pic, fill: "none", stroke: th.rule, "stroke-width": Math.max(1, th.body * 0.05) }));
            }
            let yy = y;
            for (const l of lines) {
              out.push(text(x + tx, yy + l.size * 1.05, l.size, l.s, { ...(l.bold ? { bold: true } : {}), fill: l.fill ?? th.ink }));
              yy += l.size * th.line;
            }
            return el("g", {}, out);
          },
        },
      ];
    }
  }
}

/** Rows of a section's blocks, at the theme's content width. */
function sectionRows(section: ShareSection, th: Theme, width: number, maxFigure: number, idPrefix: string, passable: ShareLayoutInput["passable"]): Row[] {
  const rows: Row[] = [];
  section.blocks.forEach((b, i) => rows.push(...blockRows(b, th, width, maxFigure, `${idPrefix}${i}-`, passable)));
  return rows;
}

/** Split rows into pages of at most `max` height (a row taller than a page gets a page to itself). */
function paginate(rows: Row[], max: number): Row[][] {
  const pages: Row[][] = [[]];
  let used = 0;
  rows.forEach((r, i) => {
    const cur = pages[pages.length - 1]!;
    let need = (cur.length ? r.before : 0) + r.height;
    // a heading takes the row after it along
    const next = r.keep ? rows[i + 1] : undefined;
    if (next) need += next.before + next.height;
    if (cur.length && used + need > max) {
      pages.push([r]);
      used = r.height;
    } else {
      cur.push(r);
      used += (cur.length > 1 ? r.before : 0) + r.height;
    }
  });
  return pages.filter((p) => p.length > 0);
}

function placeRows(rows: Row[], x: number, y0: number): { nodes: SvgNode[]; height: number; text: string[] } {
  const nodes: SvgNode[] = [];
  const text: string[] = [];
  let y = y0;
  rows.forEach((r, i) => {
    if (i > 0) y += r.before;
    nodes.push(r.draw(x, y));
    text.push(...r.text);
    y += r.height;
  });
  return { nodes, height: y - y0, text };
}

/** "22 Oct 2026, 20:00" in the device's time zone. */
export function shareTime(at: string): string {
  const d = new Date(at);
  if (Number.isNaN(d.getTime())) return at;
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const two = (n: number) => String(n).padStart(2, "0");
  return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}, ${two(d.getHours())}:${two(d.getMinutes())}`;
}

export function footerLine(share: Pick<PlayerShare, "campaign" | "session" | "at">): string {
  return `${share.campaign} · ${share.session.label} · shared ${shareTime(share.at)}`;
}

// ---------------------------------------------------------------------------
// phone cards
// ---------------------------------------------------------------------------

export interface PhoneCard {
  section: string;
  kind: ShareSection["kind"];
  /** File name, with the order prefix and `.png`. */
  name: string;
  title: string;
  width: number;
  height: number;
  node: SvgNode;
  /** Every line of text on the card. */
  text: string[];
}

/** Tallest phone card before it is split in parts (about two phone screens). */
export const PHONE_MAX_HEIGHT = 2340;

/** One or more 1080 px cards per section, each with the campaign, session and share time in its footer. */
export function phoneCards(sections: ShareSection[], share: Pick<PlayerShare, "campaign" | "session" | "at">, opts: Pick<ShareLayoutInput, "passable"> = {}): PhoneCard[] {
  const th = PHONE;
  const inner = th.width - 2 * th.margin;
  const footer = footerLine(share);
  const footerLines = wrap(footer, th.footer, inner);
  const footerH = th.gap * 1.5 + footerLines.length * th.footer * th.line + th.margin * 0.6;
  const out: PhoneCard[] = [];
  let n = 0;
  sections.forEach((s, si) => {
    if (s.cardless) return;
    const titleLines = wrap(s.title, th.title, inner, true);
    const headH = th.margin + th.eyebrow * th.line + titleLines.length * th.title * 1.18 + th.gap;
    const room = PHONE_MAX_HEIGHT - headH - footerH;
    const rows = sectionRows(s, th, inner, room, `sc${si}-`, opts.passable);
    const parts = rows.length ? paginate(rows, room) : [[]];
    parts.forEach((part, pi) => {
      n++;
      const nodes: SvgNode[] = [];
      const texts: string[] = [];
      let y = th.margin;
      const eyebrow = (parts.length > 1 ? `${s.eyebrow} · ${pi + 1} of ${parts.length}` : s.eyebrow).toUpperCase();
      nodes.push(text(th.margin, y + th.eyebrow, th.eyebrow, eyebrow, { bold: true, fill: th.muted }));
      texts.push(eyebrow);
      y += th.eyebrow * th.line;
      for (const l of titleLines) {
        nodes.push(text(th.margin, y + th.title * 0.95, th.title, l, { bold: true, fill: th.ink }));
        texts.push(l);
        y += th.title * 1.18;
      }
      nodes.push(el("rect", { x: th.margin, y: y + th.gap * 0.4, width: inner, height: 4, fill: th.rule }));
      y += th.gap;
      const placed = placeRows(part, th.margin, y + th.gap);
      nodes.push(...placed.nodes);
      texts.push(...placed.text);
      y += th.gap + placed.height + th.gap * 1.5;
      nodes.push(el("rect", { x: th.margin, y, width: inner, height: 2, fill: th.rule }));
      y += th.gap * 0.6;
      for (const l of footerLines) {
        nodes.push(text(th.margin, y + th.footer * 1.05, th.footer, l, { fill: th.muted }));
        texts.push(l);
        y += th.footer * th.line;
      }
      const height = Math.ceil(y + th.margin * 0.6);
      const node = el("g", {}, [el("rect", { x: 0, y: 0, width: th.width, height, fill: "#ffffff" }), ...nodes]);
      const base = parts.length > 1 ? `${s.file}-${pi + 1}` : s.file;
      out.push({ section: s.id, kind: s.kind, name: `${String(n).padStart(2, "0")}-${base}.png`, title: s.title, width: th.width, height, node, text: texts });
    });
  });
  return out;
}

/** A standalone SVG document of a card (for the preview and the PNG rasteriser). */
export function cardSvg(card: Pick<PhoneCard, "width" | "height" | "node">): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${card.width}" height="${card.height}" viewBox="0 0 ${card.width} ${card.height}">${nodeToString(card.node)}</svg>`;
}

// ---------------------------------------------------------------------------
// PDF packet
// ---------------------------------------------------------------------------

/** Paper sizes in points (portrait). */
export const PAPER_POINTS: Record<Paper, { width: number; height: number }> = {
  letter: { width: 612, height: 792 },
  a4: { width: 595.28, height: 841.89 },
};

export interface PacketPages {
  pages: PdfPage[];
  /** Text per page, for tests. */
  text: string[][];
}

/**
 * The packet, in the booklet's black and white: a black running bar with the
 * campaign and session on every page, a short contents list on page one,
 * then the sections one after another (a section heading never ends a page;
 * a map that does not fit starts a new page), body text in 11 pt, greyscale
 * maps with solid fog, and a footer with the share time and page number.
 */
export function packetPages(sections: ShareSection[], share: Pick<PlayerShare, "campaign" | "session" | "at">, paper: Paper, opts: Pick<ShareLayoutInput, "passable"> = {}): PacketPages {
  const { width, height } = PAPER_POINTS[paper];
  const th: Theme = { ...PAGE, width };
  const inner = width - 2 * th.margin;
  const barH = 20;
  const top = th.margin + barH + 16;
  const bottom = height - th.margin;
  const room = bottom - top;

  const heading = (eyebrow: string, title: string, first: boolean): Row => {
    const titleLines = wrap(title, th.title, inner, true);
    const h = th.eyebrow * th.line + titleLines.length * th.title * 1.15 + th.gap * 1.2;
    return {
      height: h,
      before: first ? 0 : th.gap * 3,
      keep: true,
      text: [eyebrow.toUpperCase(), ...titleLines],
      draw: (x, y) => {
        const nodes: SvgNode[] = [text(x, y + th.eyebrow, th.eyebrow, eyebrow.toUpperCase(), { bold: true, fill: th.muted })];
        let yy = y + th.eyebrow * th.line;
        for (const l of titleLines) {
          nodes.push(text(x, yy + th.title * 0.95, th.title, l, { bold: true, fill: th.ink }));
          yy += th.title * 1.15;
        }
        nodes.push(el("rect", { x, y: yy + 2, width: inner, height: 2.2, fill: th.rule }));
        return el("g", {}, nodes);
      },
    };
  };

  const rows: Row[] = [];
  // page one opens with what is inside
  const contents: Block[] = [{ kind: "para", text: `For the players of ${share.campaign}: ${share.session.label}.`, style: "lead" }];
  for (const s of sections) contents.push({ kind: "para", text: `${s.eyebrow}: ${s.title}`, style: "bullet" });
  rows.push(heading("Player packet", share.campaign, true));
  contents.forEach((b, i) => rows.push(...blockRows(b, th, inner, room, `pk-c${i}-`, opts.passable)));
  // figures may take a page less its heading
  const figureRoom = room - (th.eyebrow * th.line + th.title * 1.15 + th.gap * 1.2) - th.gap * 2;
  sections.forEach((s, si) => {
    rows.push(heading(s.eyebrow, s.title, false));
    rows.push(...sectionRows(s, th, inner, figureRoom, `pk${si}-`, opts.passable));
  });

  const pages: PdfPage[] = [];
  const texts: string[][] = [];
  paginate(rows, room).forEach((part, i) => {
    const head = `${share.campaign} · ${share.session.label}`.toUpperCase();
    const foot = `Shared ${shareTime(share.at)} · for the players`;
    const placed = placeRows(part, th.margin, top);
    const nodes: SvgNode[] = [
      el("rect", { x: 0, y: 0, width, height, fill: "#ffffff" }),
      el("rect", { x: th.margin, y: th.margin, width: inner, height: barH, fill: "#000000" }),
      text(th.margin + 8, th.margin + 13.5, th.eyebrow, head, { bold: true, fill: "#ffffff" }),
      ...placed.nodes,
      el("rect", { x: th.margin, y: bottom + 8, width: inner, height: 0.6, fill: th.rule }),
      text(th.margin, bottom + 20, th.footer, foot, { fill: th.muted }),
      text(th.margin + inner, bottom + 20, th.footer, String(i + 1), { fill: th.muted, anchor: "end" }),
    ];
    pages.push({ width, height, node: el("g", {}, nodes) });
    texts.push([head, foot, ...placed.text]);
  });
  return { pages, text: texts };
}
