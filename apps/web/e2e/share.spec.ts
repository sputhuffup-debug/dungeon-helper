/**
 * "Share with players" in a demo session: the dialog previews the share, the
 * desktop fallback (no file sharing in this browser) downloads a zip of phone
 * cards, then a PDF packet; the PDF holds the revealed handout and not the
 * GM's secret. `SHARE_OUT=<dir>` keeps the downloads for review.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test, type Download, type Page } from "@playwright/test";
import { unzipSync } from "fflate";

const OUT = process.env.SHARE_OUT;

async function bytesOf(d: Download): Promise<Buffer> {
  const path = await d.path();
  const buf = readFileSync(path);
  if (OUT) {
    mkdirSync(OUT, { recursive: true });
    writeFileSync(resolve(OUT, d.suggestedFilename()), buf);
  }
  return buf;
}

/** Text a PDF from the app's own writer shows (uncompressed `(...) Tj` strings). */
function pdfText(pdf: Buffer): string {
  const raw = pdf.toString("latin1");
  return [...raw.matchAll(/\(((?:\\.|[^\\)])*)\) Tj/g)].map((m) => m[1]!.replace(/\\([0-7]{3}|.)/g, (_x, e: string) => (/^[0-7]{3}$/.test(e) ? String.fromCharCode(parseInt(e, 8)) : e))).join("\n");
}

/** Width and height from a PNG's IHDR. */
function pngSize(png: Uint8Array): { width: number; height: number } {
  const v = new DataView(png.buffer, png.byteOffset, png.byteLength);
  return { width: v.getUint32(16), height: v.getUint32(20) };
}

async function startColdHarbor(page: Page) {
  // this browser shares no files: take the download path every desktop without Web Share takes
  await page.addInitScript(() => {
    delete (Navigator.prototype as { share?: unknown }).share;
    delete (Navigator.prototype as { canShare?: unknown }).canShare;
  });
  await page.goto("/");
  await page.getByTestId("load-demo-cinematic").click();
  await expect(page).toHaveURL(/\/c\/[0-9A-Z]{26}\/home$/, { timeout: 30_000 });
  await page.getByRole("navigation", { name: "Campaign" }).getByRole("link", { name: "Sessions", exact: true }).click();
  await page.getByRole("button", { name: "Start session 1" }).click();
  await expect(page.getByTestId("table-mode")).toBeVisible();
}

test("share with players: phone cards as a zip, then a PDF packet without GM secrets", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.setViewportSize({ width: 1400, height: 1000 });
  await startColdHarbor(page);

  await page.getByTestId("share-players").click();
  const dialog = page.getByTestId("share-dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog.getByTestId("share-only-new")).not.toBeChecked();
  await dialog.getByTestId("share-include-party").check();
  // briefing, the map, the revealed relay log and the party
  const items = dialog.getByTestId("share-preview-item");
  await expect(items).toHaveCount(4);
  await expect(dialog.getByTestId("share-preview")).toContainText("Cold Harbor: last relay log");
  await expect(dialog.getByTestId("share-message")).toHaveValue(/Session 1 update: the briefing for “.+”, 1 new handout, the map and the party roster\./);
  const send = dialog.getByTestId("share-send");
  await expect(send).toHaveText("Download zip");

  const zipDownload = page.waitForEvent("download");
  await send.click();
  const zip = await zipDownload;
  expect(zip.suggestedFilename()).toBe("cold-harbor-relay-session-1.zip");
  const files = unzipSync(new Uint8Array(await bytesOf(zip)));
  const names = Object.keys(files).sort();
  expect(names).toHaveLength(4);
  expect(names[0]).toMatch(/^01-briefing\.png$/);
  expect(names.some((n) => /^\d\d-map-.+\.png$/.test(n))).toBe(true);
  expect(names).toContain("03-handout-cold-harbor-last-relay-log.png");
  expect(names).toContain("04-party.png");
  for (const n of names) expect(pngSize(files[n]!).width).toBe(1080);
  await expect(dialog).toBeHidden();

  // the share is recorded: the next one sends only what is new, which is nothing yet
  await page.getByTestId("share-players").click();
  await expect(dialog.getByTestId("share-only-new")).toBeChecked();
  await expect(dialog.getByTestId("share-empty")).toContainText("Nothing new since the last share");
  await expect(dialog.getByTestId("share-send")).toBeDisabled();

  // everything again, as a PDF packet
  await dialog.getByTestId("share-only-new").uncheck();
  await dialog.getByTestId("share-format-pdf").check();
  await dialog.getByTestId("share-paper").selectOption("a4");
  await expect(dialog.getByTestId("share-preview")).toHaveAttribute("data-format", "pdf");
  await expect(dialog.getByTestId("share-send")).toHaveText("Download");
  const pdfDownload = page.waitForEvent("download");
  await dialog.getByTestId("share-send").click();
  const pdf = await bytesOf(await pdfDownload);
  expect(pdf.subarray(0, 8).toString("latin1")).toBe("%PDF-1.4");
  const text = pdfText(pdf);
  expect(text).toContain("Cold Harbor: last relay log");
  expect(text).toContain("keep the lab doors shut");
  // from the GM's situation and the PCs' secret agendas: never in a player share
  expect(text).not.toContain("synthetic with orders");
  expect(text).not.toMatch(/agenda/i);
  // A4 pages
  expect(pdf.toString("latin1")).toMatch(/\/MediaBox \[0 0 595\.28 841\.89\]/);
  expect(errors).toEqual([]);
});

test("the session page shares too", async ({ page }) => {
  await startColdHarbor(page);
  await page.getByRole("link", { name: "Leave table mode" }).click();
  await expect(page.getByTestId("session-page")).toBeVisible();
  await page.getByTestId("share-players").click();
  await expect(page.getByTestId("share-dialog").getByTestId("share-preview-item").first()).toBeVisible();
});

test("campaign primer: open it from home, share it as a PDF with its section titles and no GM secret", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.addInitScript(() => {
    delete (Navigator.prototype as { share?: unknown }).share;
    delete (Navigator.prototype as { canShare?: unknown }).canShare;
  });
  await page.goto("/");
  await page.getByTestId("load-demo-cinematic").click();
  await expect(page).toHaveURL(/\/c\/[0-9A-Z]{26}\/home$/, { timeout: 30_000 });
  await page.getByTestId("open-primer").click();
  const primer = page.getByTestId("primer-page");
  await expect(primer).toBeVisible();
  await expect(primer.locator('[data-section="tone"]')).toContainText("X-card");
  await expect(primer.locator('[data-section="places"]')).toContainText("Docking Ring");
  await expect(primer.locator(".app-primer__section")).toHaveCount(8);

  await primer.getByTestId("primer-share").click();
  const dialog = page.getByTestId("share-dialog");
  await expect(dialog.getByTestId("share-include-primer")).toBeChecked();
  await expect(dialog.getByTestId("share-include-handouts")).not.toBeChecked();
  // one phone card per section
  await expect(dialog.getByTestId("share-preview-item")).toHaveCount(8);
  await expect(dialog.getByTestId("share-message")).toHaveValue("Cold Harbor Relay, Session 0 update: the campaign primer.");
  await dialog.getByTestId("share-format-pdf").check();
  await expect(dialog.getByTestId("share-send")).toHaveText("Download");
  const download = page.waitForEvent("download");
  await dialog.getByTestId("share-send").click();
  const pdf = await bytesOf(await download);
  const text = pdfText(pdf);
  for (const title of ["Welcome", "The frontier", "What everyone knows", "Tone and content", "House rules", "Making your character", "Where we begin"]) expect(text).toContain(title);
  expect(text).not.toContain("synthetic");
  expect(text).not.toContain("Lindqvist");

  // session 0 links to the primer
  await page.getByRole("navigation", { name: "Campaign" }).getByRole("link", { name: "Sessions", exact: true }).click();
  await page.getByRole("link", { name: "Pitch and safety" }).click();
  await expect(page.getByTestId("session-primer")).toBeVisible();
  await page.getByTestId("session-primer-link").click();
  await expect(page.getByTestId("primer-page")).toBeVisible();
  expect(errors).toEqual([]);
});
