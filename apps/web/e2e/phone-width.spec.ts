/**
 * At phone width (390 px) the job board and the GM screen never scroll the
 * page sideways: a long badge on a posting wraps, and the GM screen's panel
 * rows wrap under their names.
 */
import { expect, test, type Page } from "@playwright/test";

const pageWidth = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth);

test("390 px: the job board (with a long badge) and the GM screen fit the phone", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.getByRole("button", { name: "New campaign" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Name", { exact: true }).fill("Narrow Haulers");
  await dialog.getByRole("button", { name: "Create campaign" }).click();
  await expect(page).toHaveURL(/\/c\/[0-9A-Z]{26}\/home$/);
  const base = page.url().replace(/\/home$/, "");

  await page.goto(`${base}/generate/alien.job-board`);
  await expect(page.getByTestId("offer-board")).toBeVisible();
  // the job board reads the campaign's "within" links (a bar inside the home base), so it counts them
  await expect(page.getByTestId("input-campaign")).toContainText(/\d+ entit(y|ies) and \d+ links?, read when the page opened/);
  // a thread's long title on a badge, as the arcs put one there
  await page.evaluate(() => {
    const badge = document.querySelector(".offer-card__badges .cf-badge");
    if (badge) badge.textContent = "GM: Clue: Marrow Syndicate and the medical supply runs of the outer colonies";
  });
  expect(await pageWidth(page)).toBeLessThanOrEqual(390);

  for (const view of ["screen", "print"]) {
    await page.goto(`${base}/gm-screen?view=${view}`);
    await expect(page.getByRole("heading", { name: "GM screen" })).toBeVisible();
    expect(await pageWidth(page), view).toBeLessThanOrEqual(390);
  }
});
