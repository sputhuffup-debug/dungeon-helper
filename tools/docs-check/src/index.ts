/**
 * Checks that the README and docs/screenshots/ agree: every image the README
 * shows exists, every screenshot is shown, and each one stays small. No
 * browser needed; `pnpm screenshots` regenerates the images themselves.
 */
import { existsSync, readdirSync, statSync } from "node:fs";
import { posix, resolve } from "node:path";

/** Screenshots live here, relative to the repo root. */
export const SCREENSHOTS_DIR = "docs/screenshots";

/** The largest a README screenshot may be. */
export const MAX_SCREENSHOT_BYTES = 1024 * 1024;

export interface ImageRef {
  alt: string;
  /** The path as written, normalised (no leading `./`). */
  path: string;
  line: number;
}

/** Image links in Markdown: `![alt](path "title")` and `<img src="path">`. Code fences are skipped. */
export function markdownImages(markdown: string): ImageRef[] {
  const out: ImageRef[] = [];
  let fenced = false;
  markdown.split("\n").forEach((text, i) => {
    if (/^\s*(```|~~~)/.test(text)) {
      fenced = !fenced;
      return;
    }
    if (fenced) return;
    for (const m of text.matchAll(/!\[([^\]]*)\]\(\s*<?([^)\s>]+)>?(?:\s+"[^"]*")?\s*\)/g)) out.push({ alt: m[1] ?? "", path: clean(m[2] ?? ""), line: i + 1 });
    for (const m of text.matchAll(/<img\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi)) {
      const alt = /\balt=["']([^"']*)["']/i.exec(m[0])?.[1] ?? "";
      out.push({ alt, path: clean(m[1] ?? ""), line: i + 1 });
    }
  });
  return out;
}

function clean(p: string): string {
  return posix.normalize(decodeURI(p.split(/[?#]/)[0] ?? "")).replace(/^\.\//, "");
}

export interface ScreenshotReport {
  /** README image links under docs/screenshots/ with no file behind them. */
  missing: ImageRef[];
  /** PNGs in docs/screenshots/ the README does not show. */
  unreferenced: string[];
  /** Screenshots over MAX_SCREENSHOT_BYTES, with their size. */
  oversized: Array<{ path: string; bytes: number }>;
  /** Every README image link (for counts and messages). */
  images: ImageRef[];
}

/** Compare a README with the screenshots folder, both under `root`. */
export function checkScreenshots(root: string, readme: string, maxBytes = MAX_SCREENSHOT_BYTES): ScreenshotReport {
  const images = markdownImages(readme);
  const local = images.filter((i) => !/^[a-z]+:/i.test(i.path));
  const shots = local.filter((i) => i.path.startsWith(`${SCREENSHOTS_DIR}/`));
  const missing = shots.filter((i) => !existsSync(resolve(root, i.path)));
  const dir = resolve(root, SCREENSHOTS_DIR);
  const pngs = existsSync(dir) ? readdirSync(dir).filter((f) => f.toLowerCase().endsWith(".png")).sort() : [];
  const shown = new Set(shots.map((i) => i.path));
  const unreferenced = pngs.map((f) => `${SCREENSHOTS_DIR}/${f}`).filter((p) => !shown.has(p));
  const oversized = pngs.map((f) => ({ path: `${SCREENSHOTS_DIR}/${f}`, bytes: statSync(resolve(dir, f)).size })).filter((f) => f.bytes > maxBytes);
  return { missing, unreferenced, oversized, images };
}
