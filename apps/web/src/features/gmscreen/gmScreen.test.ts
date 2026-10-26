/**
 * The GM screen for every built-in module: the layout fits the default
 * screen on Letter without dropping anything, keeps table rows and entries
 * whole, reports what does not fit, prints the right licence lines, and the
 * Alien screen prints only what the module already holds (verified
 * paraphrases with their page references). `GM_SCREEN_OUT=<dir>` keeps the
 * PDFs for review.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { alienModule } from "@campaign-forge/module-alien";
import { dnd5eSrdSource } from "@campaign-forge/module-dnd5e-srd";
import { exampleModule, examplePackSource } from "@campaign-forge/module-example";
import { pf2eOrcSource } from "@campaign-forge/module-pf2e-orc";
import { moduleFromPackSource, plainText, resolveGmScreen, type GameModule, type GmScreenContent, type ResolvedGmScreenPanel } from "@campaign-forge/module-sdk";
import { describe, expect, it } from "vitest";
import { layoutGmScreen, printable, SCREEN_PAPERS, type ScreenFormat, type ScreenPaper } from "./gmScreenLayout";
import { buildGmScreen, gmScreenPdf, movePanel, panelChoices, readChoices, screenNotices, withChoices, type GmScreenChoices } from "./gmScreenModel";

const OUT = process.env.GM_SCREEN_OUT;

const WIN_ANSI: Record<number, string> = { 0x96: "–", 0x97: "—", 0x91: "‘", 0x92: "’", 0x93: "“", 0x94: "”", 0x95: "•", 0xb7: "·", 0x85: "…", 0xd7: "×" };

/** Every string the app's PDF writer shows (its text operators), decoded from WinAnsi. */
function pdfText(bytes: Uint8Array): string {
  const raw = Array.from(bytes, (b) => String.fromCharCode(b)).join("");
  const out: string[] = [];
  for (const m of raw.matchAll(/\(((?:\\.|[^\\)])*)\) Tj/g)) {
    out.push(m[1]!.replace(/\\([0-7]{3}|.)/g, (_x, e: string) => (/^[0-7]{3}$/.test(e) ? (WIN_ANSI[parseInt(e, 8)] ?? String.fromCharCode(parseInt(e, 8))) : e)).replace(/[\x80-\x9f]/g, (c) => WIN_ANSI[c.charCodeAt(0)] ?? c));
  }
  return out.join("\n");
}
const defaults = (o: Partial<GmScreenChoices> = {}): GmScreenChoices => ({ ...readChoices({}, "letter"), ...o });

const modules: Record<string, () => Promise<GameModule>> = {
  alien: async () => alienModule,
  dnd5e: () => moduleFromPackSource(dnd5eSrdSource),
  orc: () => moduleFromPackSource(pf2eOrcSource),
  example: async () => exampleModule,
  "example-pack": () => moduleFromPackSource(examplePackSource),
};

function save(name: string, bytes: Uint8Array) {
  if (!OUT) return;
  mkdirSync(OUT, { recursive: true });
  writeFileSync(resolve(OUT, `${name}.pdf`), bytes);
}

/** Every string of printable content, as the layout prints it. */
function contentStrings(c: GmScreenContent): string[] {
  switch (c.t) {
    case "heading":
    case "para":
      return [c.text];
    case "entry":
      return [c.term, c.text];
    case "table":
      return [...(c.head ?? []), ...c.rows.flat()];
  }
}

describe("every module's screen", () => {
  for (const [name, load] of Object.entries(modules)) {
    for (const paper of Object.keys(SCREEN_PAPERS) as ScreenPaper[]) {
      for (const format of ["trifold", "cards"] as ScreenFormat[]) {
        it(`${name}: ${format} on ${paper} prints every default panel without dropping anything`, async () => {
          const m = await load();
          for (const mode of m.manifest.modes.map((x) => x.id)) {
            const b = buildGmScreen(m, { mode, campaignName: "Test campaign", choices: defaults({ paper, format }) });
            expect(b.screen.problems).toEqual([]);
            expect(b.layout.overflow).toEqual([]);
            const printed = b.choices.filter((c) => c.included).map((c) => c.panel.id);
            expect(b.layout.placements.map((p) => p.panel).sort()).toEqual([...printed].sort());
            const bytes = gmScreenPdf(b.layout, { moduleName: m.manifest.name, title: b.screen.title, campaignName: "Test campaign" });
            const text = pdfText(bytes);
            // the panel titles and the module's name are in the PDF
            for (const c of b.choices.filter((x) => x.included)) expect(text).toContain(printable(c.panel.title).toUpperCase());
            expect(text).toContain(`${m.manifest.name} · ${b.screen.title}`.toUpperCase());
            if (format === "trifold") {
              expect(b.layout.pages).toHaveLength(2);
              const { width, height } = SCREEN_PAPERS[paper];
              expect(b.layout.pages.every((p) => p.width === width && p.height === height)).toBe(true);
            }
            if (mode === m.manifest.defaultMode) save(`${name}-${format}-${paper}`, bytes);
          }
        });
      }
    }
  }
});

describe("a pack without a GM screen", () => {
  it("prints a screen built from its rule cards, with its conditions on the player side", async () => {
    const m = { ...(await modules["example-pack"]!()) };
    delete m.gmScreen;
    const b = buildGmScreen(m, { choices: defaults() });
    expect(b.screen.fallback).toBe(true);
    expect(b.layout.overflow).toEqual([]);
    expect(b.layout.placements.find((p) => p.panel === "auto.conditions")).toMatchObject({ page: 1, side: "players" });
    const text = pdfText(gmScreenPdf(b.layout, { moduleName: m.manifest.name, title: b.screen.title }));
    expect(text).toContain("CONDITIONS");
    expect(text).toContain("Lanternlight Reference Document");
    for (const p of b.screen.panels) expect(text).toContain(p.title.toUpperCase());
  });
});

describe("licence lines", () => {
  it("5e prints both SRD attributions on the player side", async () => {
    const m = await modules.dnd5e!();
    const b = buildGmScreen(m, { choices: defaults() });
    const back = b.layout.text[1]!.join(" ");
    expect(back).toContain("System Reference Document 5.1");
    expect(back).toContain("System Reference Document 5.2");
    expect(back).toContain("Creative Commons Attribution 4.0");
    // and the module's notice on the GM side
    expect(b.layout.text[0]!.join(" ")).toContain("not affiliated with or endorsed by Wizards of the Coast");
  });

  it("ORC prints the ORC Notice", async () => {
    const m = await modules.orc!();
    const b = buildGmScreen(m, { choices: defaults() });
    const text = pdfText(gmScreenPdf(b.layout, { moduleName: m.manifest.name, title: b.screen.title }));
    expect(text).toContain("ORC Notice");
    expect(text).toMatch(/ORC License/);
    // action costs print as plain stand-ins, never as a missing glyph
    expect(text).toMatch(/Stride \[1\]/);
    expect(text).not.toContain("?\n");
  });

  it("Alien prints the paraphrase disclaimer and page references", async () => {
    const b = buildGmScreen(alienModule, { mode: "campaign", choices: defaults() });
    const text = pdfText(gmScreenPdf(b.layout, { moduleName: alienModule.manifest.name, title: b.screen.title }));
    expect(text).toContain("It reproduces no rulebook prose or art");
    expect(text).toContain("Page references (p. N) are to Alien: The Roleplaying Game, Core Rules, Evolved Edition.");
    expect(text).toMatch(/\bp\. 43\b/);
    expect(text).toContain("pp. 72–73");
    expect(screenNotices(alienModule, { supplements: [] }).full).toEqual([]);
  });
});

describe("the Alien screen holds nothing but the module's own data", () => {
  it("every block references a rule card, table or play guide entry, and prints its text unchanged", () => {
    for (const mode of ["campaign", "cinematic"]) {
      const screen = resolveGmScreen(alienModule, { mode });
      const def = alienModule.gmScreen!;
      for (const p of def.panels) for (const b of p.blocks) expect(["rule", "table", "guide"]).toContain(b.kind);
      // the module's own strings: card summaries, table rows, play guide tips and entries
      const own = new Set<string>();
      for (const r of alienModule.rules) own.add(plainText(r.summary));
      for (const t of alienModule.tables)
        for (const row of t.rows) {
          own.add(plainText(row.label ?? ""));
          if (typeof row.result === "string") own.add(plainText(row.result));
          else for (const v of Object.values(row.result)) if (typeof v === "string") own.add(plainText(v));
        }
      const guide = alienModule.playGuides![0]!;
      const guideText = [...(guide.tips ?? []).map((t) => t.text), ...guide.entries.flatMap((e) => [e.label, e.summary ?? "", ...e.callFor])].map(plainText).join("\n");
      const ownText = [...own].join("\n");
      for (const p of screen.panels)
        for (const b of p.blocks) {
          if (b.kind !== "guide") expect(b.cite, `${b.key} cites a page`).toMatch(/^pp?\. \d+|^original$/);
          for (const c of b.content)
            for (const s of contentStrings(c).map(plainText)) {
              if (!s || /^(\d*D\d+|Result|Effect|Time limit|≤?\d+[+–]?\d*\+?)$/.test(s) || /^Roll 1d6 \+ stress level − Resolve$|^Roll d66/.test(s)) continue;
              const tip = s.replace(/ \(pp?\. [\d–]+\)$/, "");
              // a play guide entry prints its summary and first cue together
              const joined = [...tip.matchAll(/ /g)].some((m) => guideText.includes(tip.slice(0, m.index)) && guideText.includes(tip.slice(m.index! + 1)));
              expect(ownText.includes(s) || guideText.includes(tip) || joined, `${b.key}: "${s.slice(0, 60)}" is the module's own text`).toBe(true);
            }
        }
    }
  });
});

describe("layout", () => {
  const panel = (id: string, rows: number, o: Partial<ResolvedGmScreenPanel> = {}): ResolvedGmScreenPanel => ({
    id,
    title: `Panel ${id}`,
    size: "third",
    side: "gm",
    optional: false,
    blocks: [
      {
        key: `${id}#0`,
        kind: "table",
        title: `Table ${id}`,
        cite: "p. 1",
        content: [{ t: "table", head: ["D66", "Result"], rows: Array.from({ length: rows }, (_, i) => [String(i + 1), `Row ${id}-${i + 1} with enough words to wrap onto a second line in a narrow column of the screen`]) }],
      },
    ],
    ...o,
  });
  const input = (panels: ResolvedGmScreenPanel[], o: { paper?: ScreenPaper; format?: ScreenFormat } = {}) => ({
    title: "GM screen",
    moduleName: "Test",
    panels,
    notices: { short: ["Short notice."], full: ["Full attribution."] },
    paper: o.paper ?? ("letter" as ScreenPaper),
    format: o.format ?? ("trifold" as ScreenFormat),
    foldMarks: true,
  });

  it("never splits a table row, repeats the table head in a new column, and reports what it drops", () => {
    const l = layoutGmScreen(input([panel("a", 200, { size: "half" })]));
    const placed = l.placements.find((p) => p.panel === "a")!;
    expect(placed.columns).toEqual([0, 1]);
    expect(placed.size).toBe(6);
    // every printed row is whole: its two wrapped lines are on the same column
    const front = l.text[0]!;
    const rows = front.filter((t) => /^\d+ \| Row a-/.test(t));
    expect(rows.length).toBeGreaterThan(20);
    for (const r of rows) expect(r).toMatch(/narrow column of the screen$/);
    expect(front.filter((t) => t === "D66 | Result").length).toBe(2);
    expect(front).toContain("PANEL A (CONT.)");
    expect(l.overflow).toEqual([{ panel: "a", title: "Panel a", reason: "too-long", dropped: [`Table a (${200 - rows.length} lines)`] }]);
  });

  it("shrinks type to fit a panel in its column before dropping anything", () => {
    const l = layoutGmScreen(input([panel("a", 30)]));
    expect(l.overflow).toEqual([]);
    const size = l.placements[0]!.size;
    expect(size).toBeLessThan(7.5);
    expect(size).toBeGreaterThanOrEqual(6);
    // larger paper, larger type
    const big = layoutGmScreen(input([panel("a", 30)], { paper: "tabloid" }));
    expect(big.placements[0]!.size).toBeGreaterThan(size);
  });

  it("stacks short panels in a column and leaves out panels when a side is full", () => {
    const l = layoutGmScreen(input([panel("a", 3), panel("b", 3), panel("c", 30), panel("d", 30), panel("e", 30), panel("p", 3, { side: "players" })]));
    expect(l.placements.map((p) => [p.panel, p.page, p.columns.join()])).toEqual([
      ["a", 0, "0"],
      ["b", 0, "0"],
      ["c", 0, "1"],
      ["d", 0, "2"],
      ["p", 1, "0"],
    ]);
    expect(l.overflow).toEqual([{ panel: "e", title: "Panel e", reason: "no-room", dropped: ["the whole panel: the gm side is full"] }]);
  });

  it("cards: one panel per half sheet, a long one continues, notices last", () => {
    const l = layoutGmScreen(input([panel("a", 3), panel("b", 200), panel("c", 3, { side: "players" })], { format: "cards" }));
    expect(l.overflow).toEqual([]);
    const b = l.placements.find((p) => p.panel === "b")!;
    expect(b.columns.length).toBeGreaterThan(1);
    const all = l.text.flat();
    expect(all).toContain("PANEL B (CONT.)");
    expect(all).toContain("LICENCE AND ATTRIBUTION");
    expect(all.join(" ")).toContain("Full attribution.");
    expect(l.pages.every((p) => p.width === 792 && p.height === 612)).toBe(true);
  });
});

describe("choices", () => {
  it("are read leniently, saved in settings, and order panels within a side", async () => {
    const m = await modules.dnd5e!();
    const c = readChoices({ gmScreen: { paper: "a3", format: "cards", foldMarks: false, order: ["conditions", 3], include: { "damage-types": true, x: "no" }, sizes: { checks: "half", y: "huge" } } }, "letter");
    expect(c).toEqual({ paper: "a3", format: "cards", foldMarks: false, order: ["conditions"], include: { "damage-types": true }, sizes: { checks: "half" } });
    expect(readChoices({ gmScreen: { paper: "folio" } }, "a4").paper).toBe("a4");
    expect(withChoices({ other: 1 }, c)).toEqual({ other: 1, gmScreen: c });

    const screen = resolveGmScreen(m, { mode: "campaign" });
    const list = panelChoices(screen, defaults());
    expect(list.filter((x) => x.included).map((x) => x.panel.id)).toEqual(["checks", "combat", "adventuring", "actions", "position", "conditions"]);
    expect(list.find((x) => x.panel.id === "spellcasting")!.included).toBe(false);
    // moving "actions" up skips the GM panels before it: it stays on its side
    expect(movePanel(list, "position", -1).slice(3, 5)).toEqual(["position", "actions"]);
    expect(movePanel(list, "actions", -1)).toEqual(list.map((x) => x.panel.id));
    const sized = panelChoices(screen, defaults({ sizes: { checks: "full" } }));
    expect(sized[0]!.panel.size).toBe("full");
  });
});
