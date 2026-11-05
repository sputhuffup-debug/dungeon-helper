/**
 * A licence notice on a map export: the attribution a module's licence
 * requires in every copy (`ModuleLicense.inExports`), as small wrapped text
 * under the map (SVG, PNG) or on a page of its own (print tiles, roll PDF).
 * The text is the caller's, as the module wrote it; nothing here knows a
 * licence.
 */
import { el, type SvgNode } from "./siteMapDraw";
import type { PdfPage } from "./sitePdf";
import { MAP_FONT, wrapText } from "./textMetrics";

const MUTED = "#555555";

/** The notice as wrapped lines no wider than `width` at `size` (paragraphs kept apart by an empty line). */
export function noticeLines(text: string, size: number, width: number): string[] {
  const out: string[] = [];
  const paras = text
    .split(/\n\s*\n/)
    .map((p) => p.replace(/\s*\n\s*/g, " ").trim())
    .filter(Boolean);
  paras.forEach((p, i) => {
    if (i > 0) out.push("");
    out.push(...wrapText(p, size, width, 10_000));
  });
  return out;
}

/** The notice drawn as a block of text at (x, y), `width` wide, in units where one point is `pt`. */
export function noticeBlock(text: string, x: number, y: number, width: number, pt: number): { node: SvgNode; height: number } {
  const size = 6.5 * pt;
  const lh = size * 1.35;
  const lines = noticeLines(text, size, width);
  const nodes: SvgNode[] = [];
  let yy = y;
  for (const l of lines) {
    yy += lh;
    if (l) nodes.push(el("text", { x, y: yy - lh * 0.25, "font-size": size, "font-family": MAP_FONT, fill: MUTED }, [l]));
  }
  return { node: el("g", { "data-notice": "licence" }, nodes), height: yy - y + lh * 0.5 };
}

/** A Letter page (points) holding only the notice: the last page of a print. */
export function noticePage(text: string, width = 612, height = 792): PdfPage {
  const m = 54;
  const block = noticeBlock(text, m, m + 14, width - 2 * m, 1.4);
  return {
    width,
    height,
    node: el("g", {}, [
      el("rect", { x: 0, y: 0, width, height, fill: "#ffffff" }),
      el("text", { x: m, y: m, "font-size": 12, "font-family": MAP_FONT, "font-weight": 700, fill: "#111111" }, ["Licence"]),
      block.node,
    ]),
  };
}
