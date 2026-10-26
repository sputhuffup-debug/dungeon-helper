/**
 * The GM screen for the fifth edition demo (Thornwick Crossing): opened from
 * the Rules page, switched to A4, one player-side panel moved up, then the
 * desktop fallback downloads the PDF; its text holds the panels in the new
 * order, the SRD attributions, and the choices stay with the campaign.
 * `GM_SCREEN_OUT=<dir>` keeps the download for review.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";

/** Text a PDF from the app's own writer shows (uncompressed `(...) Tj` strings). */
function pdfText(pdf: Buffer): string {
  const raw = pdf.toString("latin1");
  return [...raw.matchAll(/\(((?:\\.|[^\\)])*)\) Tj/g)].map((m) => m[1]!.replace(/\\([0-7]{3}|.)/g, (_x, e: string) => (/^[0-7]{3}$/.test(e) ? String.fromCharCode(parseInt(e, 8)) : e))).join("\n");
}

test("GM screen: preview, A4, reorder a panel, download the PDF", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  // no file sharing in this browser: the download path every desktop without Web Share takes
  await page.addInitScript(() => {
    delete (Navigator.prototype as { share?: unknown }).share;
    delete (Navigator.prototype as { canShare?: unknown }).canShare;
  });
  await page.setViewportSize({ width: 1400, height: 1000 });
  await page.goto("/");
  await page.getByTestId("load-demo-5e").click();
  await expect(page).toHaveURL(/\/c\/[0-9A-Z]{26}\/home$/, { timeout: 30_000 });
  await page.getByRole("navigation", { name: "Campaign" }).getByRole("link", { name: "Rules", exact: true }).click();
  await page.getByTestId("open-gm-screen").click();

  const screen = page.getByTestId("gm-screen-page");
  await expect(screen.getByRole("heading", { name: "GM screen", level: 1 })).toBeVisible();
  const preview = screen.getByTestId("gm-screen-preview");
  await expect(preview.getByTestId("gm-screen-page-preview")).toHaveCount(2);
  await expect(preview.getByRole("img").first()).toHaveAttribute("alt", /GM side: .*CHECKS AND DCS/);
  await expect(screen.getByTestId("gm-screen-overflow")).toHaveCount(0);

  // A4, and "Cover and position" before "Actions in combat" on the player side
  await screen.getByTestId("gm-screen-paper").selectOption("a4");
  await expect(preview).toHaveAttribute("data-paper", "a4");
  const players = screen.getByRole("region", { name: "Player side" });
  await expect(players.locator("[data-panel]")).toHaveText(["Actions in combat", "Cover and position", "Conditions"].map((t) => new RegExp(t)));
  await players.getByRole("button", { name: "Move Cover and position up" }).click();
  await expect(players.locator("[data-panel]").first()).toContainText("Cover and position");
  // an extra panel in, and its size: it fits on the GM side once another is left out
  await screen.getByRole("checkbox", { name: "Print Spellcasting" }).check();
  await expect(screen.getByTestId("gm-screen-overflow")).toContainText("Spellcasting");
  await screen.getByRole("checkbox", { name: "Print Adventuring" }).uncheck();
  await expect(screen.getByTestId("gm-screen-overflow")).toHaveCount(0);

  const download = page.waitForEvent("download");
  await screen.getByTestId("gm-screen-download").click();
  const file = await download;
  expect(file.suggestedFilename()).toBe("thornwick-crossing-gm-screen-a4.pdf");
  const pdf = readFileSync(await file.path());
  if (process.env.GM_SCREEN_OUT) {
    mkdirSync(process.env.GM_SCREEN_OUT, { recursive: true });
    writeFileSync(resolve(process.env.GM_SCREEN_OUT, file.suggestedFilename()), pdf);
  }
  expect(pdf.subarray(0, 8).toString("latin1")).toBe("%PDF-1.4");
  expect(pdf.toString("latin1")).toMatch(/\/MediaBox \[0 0 841\.89 595\.28\]/);
  const text = pdfText(pdf);
  expect(text).toContain("CHECKS AND DCS");
  expect(text).toContain("SPELLCASTING");
  expect(text).not.toContain("ADVENTURING");
  expect(text.indexOf("COVER AND POSITION")).toBeLessThan(text.indexOf("ACTIONS IN COMBAT"));
  expect(text).toContain("Typical DCs");
  expect(text).toContain("System Reference Document 5.1");
  expect(text).toContain("System Reference Document 5.2");

  // the choices are the campaign's: back on the page, they are still there
  await page.getByRole("navigation", { name: "Campaign" }).getByRole("link", { name: "Settings", exact: true }).click();
  await page.getByTestId("settings-gm-screen").click();
  await expect(page.getByTestId("gm-screen-paper")).toHaveValue("a4");
  await expect(page.getByRole("region", { name: "Player side" }).locator("[data-panel]").first()).toContainText("Cover and position");
  expect(errors).toEqual([]);
});
