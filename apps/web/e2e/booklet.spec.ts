/**
 * The printed adventure booklet and agenda cards: the cinematic demo's
 * booklet in Letter and A4 (title page, cast, locations, acts, map), a PDF
 * check (more than one page, nothing wider than the page), and the agenda
 * card sheets. `BOOKLET_OUT=<dir>` keeps the PDFs for review.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test, type Page } from "@playwright/test";

const OUT = process.env.BOOKLET_OUT;
function keep(name: string, pdf: Buffer) {
  if (!OUT) return;
  mkdirSync(OUT, { recursive: true });
  writeFileSync(resolve(OUT, name), pdf);
}

/** Page count of a PDF Chromium wrote (one page object per page). */
function pdfPages(pdf: Buffer): number {
  return (pdf.toString("latin1").match(/\/Type\s*\/Page(?![s\w])/g) ?? []).length;
}

const nav = (page: Page, name: string) => page.getByRole("navigation", { name: "Campaign" }).getByRole("link", { name, exact: true });

async function loadDemo(page: Page, which: "skyfire" | "cinematic") {
  await page.addInitScript(() => {
    // the *-print views call window.print(); record it instead of opening a dialog
    (window as unknown as { __printed: number }).__printed = 0;
    window.print = () => {
      (window as unknown as { __printed: number }).__printed++;
    };
  });
  await page.goto("/");
  await page.getByTestId(which === "skyfire" ? "load-demo" : "load-demo-cinematic").click();
  await expect(page).toHaveURL(/\/c\/[0-9A-Z]{26}\/home$/, { timeout: 30_000 });
}

/** Elements of the print view that stick out to the right of their sheet, in print media at the page's content width. */
async function overflowing(page: Page, sheetSelector: string): Promise<string[]> {
  return page.evaluate((sel) => {
    const out: string[] = [];
    for (const sheet of Array.from(document.querySelectorAll<HTMLElement>(sel))) {
      const right = sheet.getBoundingClientRect().right + 1;
      for (const el of Array.from(sheet.querySelectorAll<HTMLElement>("*"))) {
        const r = el.getBoundingClientRect();
        if (r.width > 0 && r.right > right) out.push(`${el.tagName.toLowerCase()}.${el.className}`);
      }
    }
    if (document.documentElement.scrollWidth > document.documentElement.clientWidth + 1) out.push("document");
    return out.slice(0, 10);
  }, sheetSelector);
}

test("cinematic demo: the GM booklet prints as a book, in Letter and A4", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.setViewportSize({ width: 1400, height: 1000 });
  await loadDemo(page, "cinematic");
  await nav(page, "Adventures").click();
  await page.getByTestId("adventure-card").filter({ hasText: "Cold Harbor" }).click();
  await page.getByTestId("guided-booklet").click();

  const booklet = page.getByTestId("booklet-view");
  await expect(booklet).toBeVisible();
  const article = booklet.getByRole("article", { name: "Cold Harbor: GM booklet" });
  await expect(article.getByRole("heading", { level: 1, name: "Cold Harbor" })).toBeVisible();
  await expect(article.getByRole("region", { name: "Key facts" })).toContainText("Rosa Ilunga");
  await expect(article.getByRole("navigation", { name: "Contents" }).getByRole("listitem")).toHaveCount(10);
  for (const h of ["The adventure", "The cast", "Locations", "Site map", "Setup", "Tilt", "Showdown", "Checklist", "Appendix"]) {
    await expect(article.getByRole("heading", { level: 2, name: h, exact: true })).toBeVisible();
  }
  await expect(article.getByRole("article", { name: "Player character: Rosa Ilunga" })).toBeVisible();
  await expect(article.getByRole("article", { name: "Location: Cold Lab" })).toContainText("Tethra blue");
  await expect(article.getByRole("complementary", { name: /^Read aloud/ }).first()).toBeVisible();
  await expect(article.getByRole("complementary", { name: "GM only: The truth" })).toBeVisible();
  await expect(article.getByRole("figure", { name: /Cold Harbor site map, Level 1/ }).locator("svg")).toBeVisible();
  await expect(article.locator(".bk-scene")).toHaveCount(11);
  await expect(article.getByRole("article", { name: "Stat block: Facehugger (Cold Lab specimen)" })).toBeVisible();
  // the running header and page size come from injected @page rules
  const pageCss = () => page.getByTestId("booklet-page-css").evaluate((e) => e.textContent ?? "");
  await expect.poll(pageCss).toContain("@top-right");

  // Letter
  await page.getByTestId("paper-letter").click();
  await expect(booklet).toHaveAttribute("data-paper", "letter");
  await expect.poll(pageCss).toContain("size: letter");
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
  const letter = await page.pdf({ preferCSSPageSize: true, printBackground: true });
  keep("booklet-letter.pdf", letter);
  const letterPages = pdfPages(letter);
  expect(letterPages).toBeGreaterThan(1);

  // nothing wider than the page's content box (8.5in - 2 x 0.75in = 7in = 672px)
  await page.setViewportSize({ width: 672, height: 1000 });
  await page.emulateMedia({ media: "print" });
  expect(await overflowing(page, ".prep-booklet")).toEqual([]);
  await page.emulateMedia({ media: null });
  await page.setViewportSize({ width: 1400, height: 1000 });

  // A4 is remembered for next time
  await page.getByTestId("paper-a4").click();
  await expect.poll(pageCss).toContain("size: A4");
  const a4 = await page.pdf({ preferCSSPageSize: true, printBackground: true });
  keep("booklet-a4.pdf", a4);
  expect(pdfPages(a4)).toBeGreaterThan(1);
  await page.reload();
  await expect(page.getByTestId("booklet-view")).toHaveAttribute("data-paper", "a4");
  expect(errors).toEqual([]);
});

test("cinematic demo: agenda cards print four to a page with cut marks", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.setViewportSize({ width: 1400, height: 1000 });
  await loadDemo(page, "cinematic");
  await nav(page, "Adventures").click();
  await page.getByTestId("adventure-card").filter({ hasText: "Cold Harbor" }).click();
  await page.getByTestId("guided-agenda-cards").click();

  const view = page.getByTestId("agenda-cards");
  await expect(view).toBeVisible();
  // four PCs, three acts: one sheet per act
  await expect(view.getByRole("region", { name: /^Act \d agenda: / })).toHaveCount(12);
  await expect(view.getByRole("region", { name: /^Card sheet / })).toHaveCount(3);
  const first = view.getByRole("region", { name: "Act 1 agenda: Rosa Ilunga" });
  await expect(first.getByRole("heading", { name: "Rosa Ilunga" })).toBeVisible();
  await expect(first).toContainText("Secret: for this player only");
  await expect(first).toContainText("Get the inner lock open");
  await expect(view.locator(".bk-crop")).toHaveCount(48);

  await page.getByTestId("paper-letter").click();
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
  const pdf = await page.pdf({ preferCSSPageSize: true, printBackground: true });
  keep("agenda-cards-letter.pdf", pdf);
  expect(pdfPages(pdf)).toBe(3);
  await page.getByTestId("paper-a4").click();
  const a4 = await page.pdf({ preferCSSPageSize: true, printBackground: true });
  keep("agenda-cards-a4.pdf", a4);
  expect(pdfPages(a4)).toBe(3);
  expect(errors).toEqual([]);
});

test("campaign demo: the outline's print booklet link opens the booklet and prints it", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await loadDemo(page, "skyfire");
  await nav(page, "Adventures").click();
  await page.getByTestId("adventure-card").first().click();
  await page.getByTestId("print-booklet").click();
  const booklet = page.getByTestId("booklet-view");
  await expect(booklet.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(booklet.locator(".bk-section--act").first()).toBeVisible();
  await expect.poll(() => page.evaluate(() => (window as unknown as { __printed: number }).__printed)).toBe(1);
  const pdf = await page.pdf({ preferCSSPageSize: true, printBackground: true });
  keep("booklet-skyfire.pdf", pdf);
  expect(pdfPages(pdf)).toBeGreaterThan(1);
  await page.goBack();
  await page.getByTestId("agenda-cards-link").click();
  await expect(page.getByTestId("agenda-cards")).toBeVisible();
  expect(errors).toEqual([]);
});
