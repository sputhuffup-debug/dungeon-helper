import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";
import { MAX_SCREENSHOT_BYTES, SCREENSHOTS_DIR, checkScreenshots, markdownImages } from "../src/index";

const ROOT = resolve(fileURLToPath(new URL("../../../", import.meta.url)));

describe("README screenshots", () => {
  const readme = readFileSync(join(ROOT, "README.md"), "utf8");
  const report = checkScreenshots(ROOT, readme);

  it("shows at least one screenshot", () => {
    expect(report.images.filter((i) => i.path.startsWith(`${SCREENSHOTS_DIR}/`)).length).toBeGreaterThan(0);
  });

  it("every image the README links under docs/screenshots exists (run `pnpm screenshots`)", () => {
    expect(report.missing.map((i) => `README.md:${i.line} ${i.path}`)).toEqual([]);
  });

  it("every PNG in docs/screenshots is shown in the README", () => {
    expect(report.unreferenced).toEqual([]);
  });

  it(`every screenshot is under ${MAX_SCREENSHOT_BYTES / 1024 / 1024} MB`, () => {
    expect(report.oversized).toEqual([]);
  });

  it("every screenshot has alt text", () => {
    expect(report.images.filter((i) => !i.alt.trim()).map((i) => `README.md:${i.line} ${i.path}`)).toEqual([]);
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
});
