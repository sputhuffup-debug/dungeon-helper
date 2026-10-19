import { describe, expect, it } from "vitest";
import { runMapGenerator } from "@campaign-forge/core";
import type { SiteLayout } from "@campaign-forge/module-sdk";
import { exampleModule, exampleSiteGenerator } from "@campaign-forge/module-example";
import { parsePathData, parseTransform, renderRollPdf, svgNode as el, svgPagesToPdf, textWidth, winAnsiBytes, type PdfPage } from "../src/index";

const text = (b: Uint8Array) => Array.from(b, (c) => String.fromCharCode(c)).join("");

/** Check the file structure: header, every xref offset points at its object, trailer and startxref. */
function checkStructure(pdf: string): { objects: number } {
  expect(pdf.startsWith("%PDF-1.")).toBe(true);
  expect(pdf.endsWith("%%EOF\n")).toBe(true);
  const sx = /startxref\n(\d+)\n%%EOF\n$/.exec(pdf);
  expect(sx).not.toBeNull();
  const xrefAt = Number(sx![1]);
  expect(pdf.slice(xrefAt, xrefAt + 5)).toBe("xref\n");
  const head = /^xref\n0 (\d+)\n/.exec(pdf.slice(xrefAt))!;
  const count = Number(head[1]);
  const rows = pdf.slice(xrefAt + head[0].length).split("\n").slice(0, count);
  expect(rows[0]).toBe("0000000000 65535 f ");
  for (let i = 1; i < count; i++) {
    const off = Number(rows[i]!.slice(0, 10));
    expect(rows[i]!.endsWith(" 00000 n ")).toBe(true);
    expect(pdf.slice(off, off + `${i} 0 obj`.length)).toBe(`${i} 0 obj`);
  }
  expect(pdf).toMatch(new RegExp(`trailer\\n<< /Size ${count} /Root 1 0 R /Info 6 0 R >>`));
  // stream lengths match
  for (const m of pdf.matchAll(/<< \/Length (\d+) >>\nstream\n/g)) {
    const start = m.index! + m[0].length;
    expect(pdf.slice(start + Number(m[1]), start + Number(m[1]) + 9)).toBe("endstream");
  }
  return { objects: count };
}

const page = (node: ReturnType<typeof el>, width = 144, height = 72): PdfPage => ({ width, height, node });

describe("PDF writer", () => {
  it("writes a valid, deterministic file with text, paths, opacity and patterns", () => {
    const node = el("g", {}, [
      el("defs", {}, [el("pattern", { id: "hatch", width: 4, height: 4, patternUnits: "userSpaceOnUse", patternTransform: "rotate(45)" }, [el("path", { d: "M 0 0 L 0 4", stroke: "#333333", "stroke-width": 0.5 })])]),
      el("rect", { x: 10, y: 10, width: 50, height: 20, fill: "#ff0000", "fill-opacity": 0.5 }),
      el("polygon", { points: "70,10 120,10 120,40 70,40", fill: "url(#hatch)", stroke: "#000", "stroke-width": 1, "stroke-dasharray": "3 2" }),
      el("circle", { cx: 30, cy: 50, r: 8, fill: "none", stroke: "#0000ff" }),
      el("text", { x: 72, y: 60, "font-size": 10, "font-weight": 700, "text-anchor": "middle", fill: "#000", stroke: "#fff", "stroke-width": 1, "paint-order": "stroke" }, ["Bay (1) \\ é"]),
    ]);
    const a = svgPagesToPdf([page(node)], { title: "Test" });
    const b = svgPagesToPdf([page(node)], { title: "Test" });
    expect(Buffer.from(a).equals(Buffer.from(b))).toBe(true);
    const pdf = text(a);
    expect(pdf.startsWith("%PDF-1.4\n%âãÏÓ\n")).toBe(true);
    checkStructure(pdf);
    expect(pdf).toContain("/MediaBox [0 0 144 72]");
    expect(pdf).toContain("/BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding");
    // y flip, the translucent fill through an ExtGState, the dash, the pattern clip
    expect(pdf).toContain("1 0 0 -1 0 72 cm");
    expect(pdf).toMatch(/\/GS\d+ << \/Type \/ExtGState \/ca 0.5 \/CA 1 >>/);
    expect(pdf).toContain("[3 2] 0 d");
    expect(pdf).toContain("W n");
    expect(pdf).toContain("0.7071 0.7071 -0.7071 0.7071 0 0 cm".replace(/0.7071/g, "0.707107"));
    // the halo is stroked first, then the text filled; escapes and WinAnsi é (\351)
    const stroke = pdf.indexOf("1 Tr");
    const fill = pdf.indexOf("0 Tr");
    expect(stroke).toBeGreaterThan(0);
    expect(fill).toBeGreaterThan(stroke);
    expect(pdf).toContain("(Bay \\(1\\) \\\\ \\351) Tj");
    // centred: x shifted by half the bold width
    const w = textWidth("Bay (1) \\ é", 10, true);
    expect(pdf).toContain(`1 0 0 -1 ${Math.round((72 - w / 2) * 1000) / 1000} 60 Tm`);
    // no dates: nothing changes between runs
    expect(pdf).not.toContain("CreationDate");
    expect(pdf).toContain("/Title (Test)");
  });

  it("uses /UserUnit for pages longer than 200 inches", () => {
    const long = svgPagesToPdf([page(el("rect", { x: 0, y: 0, width: 10, height: 10, fill: "#000" }), 36 * 72, 250 * 72)]);
    const pdf = text(long);
    expect(pdf.startsWith("%PDF-1.6")).toBe(true);
    checkStructure(pdf);
    expect(pdf).toContain("/MediaBox [0 0 1296 9000] /Resources 5 0 R /Contents 8 0 R /UserUnit 2");
    expect(pdf).toContain("0.5 0 0 0.5 0 0 cm\n1 0 0 -1 0 18000 cm");
  });

  it("parses paths (relative, curves, arcs) and transforms", () => {
    const segs = parsePathData("M 1 2 h 3 v 4 H 0 V 0 z m 1 1 q 1 1 2 0 t 2 0 A 1 1 0 0 1 8 3");
    expect(segs[0]).toEqual(["M", 1, 2]);
    expect(segs[1]).toEqual(["L", 4, 2]);
    expect(segs[2]).toEqual(["L", 4, 6]);
    expect(segs[5]).toEqual(["Z"]);
    // after z the pen is back at the subpath start (1, 2)
    expect(segs[6]).toEqual(["M", 2, 3]);
    expect(segs.filter((s) => s[0] === "C").length).toBeGreaterThanOrEqual(3);
    const last = segs[segs.length - 1]!;
    expect(last[0]).toBe("C");
    expect(last.slice(5)).toEqual([8, 3]);
    const m = parseTransform("translate(10 20) rotate(-90) scale(2)");
    expect(m.map((v) => Math.round(v * 1000) / 1000)).toEqual([0, -2, 2, 0, 10, 20]);
    expect(winAnsiBytes("1 m ≈ 2 m · €")).toEqual([49, 32, 109, 32, 126, 32, 50, 32, 109, 32, 0xb7, 32, 0x80]);
  });
});

function rectDeck(w: number, h: number): SiteLayout {
  return {
    decks: [{ id: "a", name: "Deck A", width: w, height: h }],
    zones: [{ id: "z1", deck: "a", kind: "room", poly: [[0, 0], [w, 0], [w, h], [0, h]], cluttered: false, name: "Hold", key: true }],
    borders: [],
    markers: [],
    gridM: 1,
    checks: [],
  };
}

describe("roll PDF", () => {
  it("one page per strip, MediaBox at the planned size, text and paths present", () => {
    const deck = rectDeck(40, 25);
    const { bytes, plan } = renderRollPdf(deck, { view: "gm", rollWidthIn: 24, mmPerMetre: 25.4, title: "Hold plan" });
    const pdf = text(bytes);
    checkStructure(pdf);
    expect(plan.strips).toBe(2);
    expect(pdf.match(/\/Type \/Page /g)).toHaveLength(2);
    expect(pdf).toContain(`/MediaBox [0 0 ${24 * 72} ${Math.round(plan.pages[0]!.heightIn * 72 * 1000) / 1000}]`);
    expect(pdf).toContain("(Hold plan) Tj");
    expect(pdf).toContain("(Strip 2 of 2, Deck A) Tj");
    expect(pdf).toContain("(1 in = 1 m \\267 28mm miniatures) Tj");
    expect(pdf).toMatch(/ re\n|\d m\n[-\d.]+ [-\d.]+ l\n/);
    const again = renderRollPdf(deck, { view: "gm", rollWidthIn: 24, mmPerMetre: 25.4, title: "Hold plan" });
    expect(Buffer.from(again.bytes).equals(Buffer.from(bytes))).toBe(true);
  });

  it("renders the example site in every view", () => {
    const layout = runMapGenerator(exampleModule, exampleSiteGenerator, { darkness: 50, lockedAct: 2 }, { seed: "pdf" }).layout;
    for (const view of ["gm", "player", "tracking"] as const) {
      const { bytes, plan } = renderRollPdf(layout, { view, legend: exampleSiteGenerator.legend, rollWidthIn: 36, mmPerMetre: 25.4, title: "Keep" });
      const pdf = text(bytes);
      checkStructure(pdf);
      expect(pdf.match(/\/Type \/Page /g)).toHaveLength(plan.pages.length);
      expect(pdf).toContain(view === "gm" ? "(GM map) Tj".replace("(GM map)", "(Ground floor \\267 GM map)") : view === "player" ? "(Ground floor \\267 Player map)" : "(Ground floor \\267 Tracking map)");
    }
  });
});
