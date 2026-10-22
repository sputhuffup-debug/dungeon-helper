import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";
import { FEATURES_DIR, MAX_SCREENSHOT_BYTES, SCREENSHOTS_DIR, checkScreenshots, markdownImages, markdownLinks, readDocs } from "../src/index";

const ROOT = resolve(fileURLToPath(new URL("../../../", import.meta.url)));

describe("README and feature page screenshots", () => {
  const docs = readDocs(ROOT);
  const report = checkScreenshots(ROOT, docs);
  const at = (i: { file: string; line: number; path: string }) => `${i.file}:${i.line} ${i.path}`;

  it("reads the README and a feature page per area", () => {
    expect(docs.map((d) => d.file)).toContain("README.md");
    expect(docs.filter((d) => d.file.startsWith(`${FEATURES_DIR}/`)).length).toBeGreaterThan(0);
  });

  it("shows at least one screenshot in the README", () => {
    expect(report.images.filter((i) => i.file === "README.md" && i.target.startsWith(`${SCREENSHOTS_DIR}/`)).length).toBeGreaterThan(0);
  });

  it("every image linked under docs/screenshots exists (run `pnpm screenshots`)", () => {
    expect(report.missing.map(at)).toEqual([]);
  });

  it("every PNG in docs/screenshots is shown in the README or a feature page", () => {
    expect(report.unreferenced).toEqual([]);
  });

  it(`every screenshot is under ${MAX_SCREENSHOT_BYTES / 1024 / 1024} MB`, () => {
    expect(report.oversized).toEqual([]);
  });

  it("every screenshot has alt text", () => {
    expect(report.images.filter((i) => !i.alt.trim()).map(at)).toEqual([]);
  });

  it("every local link points at a file that exists", () => {
    expect(report.brokenLinks.map(at)).toEqual([]);
  });

  it("the README links every feature page", () => {
    expect(report.unlinkedPages).toEqual([]);
  });
});

describe("checkScreenshots", () => {
  const dir = mkdtempSync(join(tmpdir(), "docs-check-"));
  afterAll(() => rmSync(dir, { recursive: true, force: true }));
  mkdirSync(join(dir, SCREENSHOTS_DIR), { recursive: true });
  writeFileSync(join(dir, SCREENSHOTS_DIR, "shown.png"), "x");
  writeFileSync(join(dir, SCREENSHOTS_DIR, "stray.png"), "x");
  writeFileSync(join(dir, SCREENSHOTS_DIR, "big.png"), Buffer.alloc(64));

  it("finds missing, unreferenced and oversized screenshots", () => {
    const md = [
      "![Shown](docs/screenshots/shown.png)",
      '![Big](./docs/screenshots/big.png "title")',
      "![Gone](docs/screenshots/gone.png)",
      "![Remote](https://example.com/x.png)",
      "```",
      "![In a fence](docs/screenshots/stray.png)",
      "```",
    ].join("\n");
    const r = checkScreenshots(dir, md, 32);
    expect(r.missing.map((i) => i.path)).toEqual(["docs/screenshots/gone.png"]);
    expect(r.unreferenced).toEqual(["docs/screenshots/stray.png"]);
    expect(r.oversized).toEqual([{ path: "docs/screenshots/big.png", bytes: 64 }]);
  });

  it("reads Markdown and HTML image links", () => {
    expect(markdownImages('Text ![A](a.png) and <img alt="B" src="./b/c.png" width="400">')).toEqual([
      { alt: "A", path: "a.png", line: 1 },
      { alt: "B", path: "b/c.png", line: 1 },
    ]);
  });

  it("resolves images and links from each page's folder, and finds broken links and unlinked pages", () => {
    mkdirSync(join(dir, FEATURES_DIR), { recursive: true });
    writeFileSync(join(dir, FEATURES_DIR, "a.md"), "x");
    const docs = [
      { file: "README.md", markdown: "![Shown](docs/screenshots/shown.png) [A](docs/features/a.md)" },
      { file: `${FEATURES_DIR}/a.md`, markdown: "![Big](../screenshots/big.png) [Home](../../README.md) [Gone](missing.md) [Web](https://x.org) [Here](#top)" },
      { file: `${FEATURES_DIR}/b.md`, markdown: "![Stray](../screenshots/stray.png)" },
    ];
    writeFileSync(join(dir, "README.md"), "x");
    const r = checkScreenshots(dir, docs, 1024);
    expect(r.missing).toEqual([]);
    expect(r.unreferenced).toEqual([]);
    expect(r.brokenLinks.map((l) => l.target)).toEqual(["docs/features/missing.md"]);
    expect(r.unlinkedPages).toEqual(["docs/features/b.md"]);
  });

  it("reads local links but not images, URLs or anchors", () => {
    expect(markdownLinks("[a](x.md) ![b](y.png) [c](https://z) [d](#e) [f](./g/h.md#i)").map((l) => l.path)).toEqual(["x.md", "g/h.md"]);
  });
});
