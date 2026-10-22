/**
 * Checks that the docs and docs/screenshots/ agree: every image the README
 * or a feature page (docs/features/*.md) shows exists, every screenshot is
 * shown somewhere, each one stays small, every feature page is linked from
 * the README, and their local links point at files that exist. No browser
 * needed; `pnpm screenshots` regenerates the images themselves.
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { posix, resolve } from "node:path";

/** Screenshots live here, relative to the repo root. */
export const SCREENSHOTS_DIR = "docs/screenshots";

/** Feature pages (app-wide and one per game module), relative to the repo root. */
export const FEATURES_DIR = "docs/features";

/** The largest a screenshot may be. */
export const MAX_SCREENSHOT_BYTES = 1024 * 1024;

export interface ImageRef {
  alt: string;
  /** The path as written, normalised (no leading `./`). */
  path: string;
  line: number;
}

/** A Markdown file to check: its path from the repo root and its text. */
export interface DocFile {
  file: string;
  markdown: string;
}

/** An image or link resolved from the repo root, with where it was written. */
export interface DocRef extends ImageRef {
  file: string;
  /** The target relative to the repo root (POSIX). */
  target: string;
}

/** Image links in Markdown: `![alt](path "title")` and `<img src="path">`. Code fences are skipped. */
export function markdownImages(markdown: string): ImageRef[] {
  const out: ImageRef[] = [];
  eachLine(markdown, (text, line) => {
    for (const m of text.matchAll(/!\[([^\]]*)\]\(\s*<?([^)\s>]+)>?(?:\s+"[^"]*")?\s*\)/g)) out.push({ alt: m[1] ?? "", path: clean(m[2] ?? ""), line });
    for (const m of text.matchAll(/<img\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi)) {
      const alt = /\balt=["']([^"']*)["']/i.exec(m[0])?.[1] ?? "";
      out.push({ alt, path: clean(m[1] ?? ""), line });
    }
  });
  return out;
}

/** Local link targets in Markdown (`[text](path)`, not images, not URLs or in-page anchors). */
export function markdownLinks(markdown: string): ImageRef[] {
  const out: ImageRef[] = [];
  eachLine(markdown, (text, line) => {
    for (const m of text.matchAll(/(?<!!)\[([^\]]*)\]\(\s*<?([^)\s>]+)>?(?:\s+"[^"]*")?\s*\)/g)) {
      const raw = m[2] ?? "";
      if (/^[a-z]+:/i.test(raw) || raw.startsWith("#")) continue;
      out.push({ alt: m[1] ?? "", path: clean(raw), line });
    }
  });
  return out;
}

function eachLine(markdown: string, fn: (text: string, line: number) => void): void {
  let fenced = false;
  markdown.split("\n").forEach((text, i) => {
    if (/^\s*(```|~~~)/.test(text)) {
      fenced = !fenced;
      return;
    }
    if (!fenced) fn(text, i + 1);
  });
}

function clean(p: string): string {
  return posix.normalize(decodeURI(p.split(/[?#]/)[0] ?? "")).replace(/^\.\//, "");
}

/** `path` as written in `file`, relative to the repo root. */
function fromRoot(file: string, path: string): string {
  return posix.normalize(posix.join(posix.dirname(file), path));
}

export interface ScreenshotReport {
  /** Image links under docs/screenshots/ with no file behind them. */
  missing: DocRef[];
  /** PNGs in docs/screenshots/ no checked document shows. */
  unreferenced: string[];
  /** Screenshots over MAX_SCREENSHOT_BYTES, with their size. */
  oversized: Array<{ path: string; bytes: number }>;
  /** Every image link in the checked documents. */
  images: DocRef[];
  /** Local links whose target does not exist. */
  brokenLinks: DocRef[];
  /** Feature pages the README does not link to. */
  unlinkedPages: string[];
}

/**
 * Compare the documents with the screenshots folder, all under `root`. A
 * plain string is read as the README (kept for callers that only check it).
 */
export function checkScreenshots(root: string, docs: DocFile[] | string, maxBytes = MAX_SCREENSHOT_BYTES): ScreenshotReport {
  const files: DocFile[] = typeof docs === "string" ? [{ file: "README.md", markdown: docs }] : docs;
  const images: DocRef[] = [];
  const links: DocRef[] = [];
  for (const d of files) {
    for (const i of markdownImages(d.markdown)) images.push({ ...i, file: d.file, target: /^[a-z]+:/i.test(i.path) ? i.path : fromRoot(d.file, i.path) });
    for (const l of markdownLinks(d.markdown)) links.push({ ...l, file: d.file, target: fromRoot(d.file, l.path) });
  }
  const shots = images.filter((i) => i.target.startsWith(`${SCREENSHOTS_DIR}/`));
  const missing = shots.filter((i) => !existsSync(resolve(root, i.target)));
  const dir = resolve(root, SCREENSHOTS_DIR);
  const pngs = existsSync(dir) ? readdirSync(dir).filter((f) => f.toLowerCase().endsWith(".png")).sort() : [];
  const shown = new Set(shots.map((i) => i.target));
  const unreferenced = pngs.map((f) => `${SCREENSHOTS_DIR}/${f}`).filter((p) => !shown.has(p));
  const oversized = pngs.map((f) => ({ path: `${SCREENSHOTS_DIR}/${f}`, bytes: statSync(resolve(dir, f)).size })).filter((f) => f.bytes > maxBytes);
  const brokenLinks = links.filter((l) => !existsSync(resolve(root, l.target)));
  const readmeLinks = new Set(links.filter((l) => l.file === "README.md").map((l) => l.target));
  const unlinkedPages = files.map((f) => f.file).filter((f) => f.startsWith(`${FEATURES_DIR}/`) && !readmeLinks.has(f));
  return { missing, unreferenced, oversized, images, brokenLinks, unlinkedPages };
}

/** The README and every feature page under `root`. */
export function readDocs(root: string): DocFile[] {
  const out: DocFile[] = [{ file: "README.md", markdown: readFileSync(resolve(root, "README.md"), "utf8") }];
  const dir = resolve(root, FEATURES_DIR);
  if (existsSync(dir))
    for (const f of readdirSync(dir).filter((x) => x.endsWith(".md")).sort()) out.push({ file: `${FEATURES_DIR}/${f}`, markdown: readFileSync(resolve(dir, f), "utf8") });
  return out;
}
